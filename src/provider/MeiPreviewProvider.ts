import * as vscode from "vscode";
import * as path from "node:path";
import { VIEW_TYPE_MEI_PREVIEW, KEY_SCALE_PERCENT } from "../constants";
import type { WebviewOutboundMessage, InitMessage } from "../shared/messages";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export class MeiPreviewProvider implements vscode.CustomReadonlyEditorProvider {
	constructor(private readonly context: vscode.ExtensionContext) {}

	// Track open panels mapped to their config URIs
	private readonly panelRegistry: Map<string, Set<vscode.WebviewPanel>> =
		new Map();

	private trackPanel(panel: vscode.WebviewPanel, configUri: vscode.Uri) {
		const key = configUri.toString();
		let set = this.panelRegistry.get(key);
		if (!set) {
			set = new Set();
			this.panelRegistry.set(key, set);
		}
		set.add(panel);
	}

	private untrackPanel(panel: vscode.WebviewPanel, configUri: vscode.Uri) {
		const key = configUri.toString();
		const set = this.panelRegistry.get(key);
		if (!set) return;
		set.delete(panel);
		if (set.size === 0) this.panelRegistry.delete(key);
	}

	private async broadcastProjectOptions(configUri: vscode.Uri): Promise<void> {
		try {
			const opts = await this.loadProjectOptions(configUri);
			const key = configUri.toString();
			const targets = this.panelRegistry.get(key);
			if (!targets) return;
			for (const panel of targets) {
				panel.webview.postMessage({
					type: "setProjectOptions",
					projectOptions: opts || undefined,
				});
			}
		} catch {}
	}

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new MeiPreviewProvider(context);
		const disp = vscode.window.registerCustomEditorProvider(
			VIEW_TYPE_MEI_PREVIEW,
			provider,
			{
				webviewOptions: { retainContextWhenHidden: true },
				supportsMultipleEditorsPerDocument: false,
			},
		);

		// When any config YAML file is saved, broadcast updates to all matching panels
		const saveSub = vscode.workspace.onDidSaveTextDocument(async (doc) => {
			try {
				if (!doc || !doc.uri) return;
				if (!/mei-viewer\.config\.ya?ml$/i.test(doc.uri.fsPath)) return;
				await provider.broadcastProjectOptions(doc.uri);
			} catch {}
		});

		context.subscriptions.push(saveSub);
		return new vscode.Disposable(() => {
			disp.dispose();
			saveSub.dispose();
		});
	}

	async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => {} } as vscode.CustomDocument;
	}

	async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
	): Promise<void> {
		const webview = webviewPanel.webview;
		let isDisposed = false;
		webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this.context.extensionUri,
				vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview"),
				vscode.Uri.joinPath(
					this.context.extensionUri,
					"node_modules",
					"verovio",
					"dist",
				),
			],
		};

		const nonce = getNonce();
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				"dist",
				"webview",
				"bootstrap.js",
			),
		);
		const templateUri = vscode.Uri.joinPath(
			this.context.extensionUri,
			"dist",
			"webview",
			"index.html",
		);
		const raw = await vscode.workspace.fs.readFile(templateUri);
		const html = new TextDecoder()
			.decode(raw)
			.replace(/__CSP__/g, webview.cspSource)
			.replace(/__NONCE__/g, nonce)
			.replace(/__SCRIPT__/g, String(scriptUri));
		webview.html = html;

		const textDoc = await vscode.workspace.openTextDocument(document.uri);

		// Determine config file path for this document
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		const configUri = workspaceFolder
			? vscode.Uri.joinPath(
					workspaceFolder.uri,
					".vscode",
					"mei-viewer.config.yaml",
				)
			: vscode.Uri.file(
					path.join(
						path.dirname(document.uri.fsPath),
						".vscode",
						"mei-viewer.config.yaml",
					),
				);
		const projectOptions = await this.loadProjectOptions(configUri);
		this.trackPanel(webviewPanel, configUri);

		let didInit = false;
		const postInit = () => {
			if (didInit || isDisposed) return;
			didInit = true;
			const savedScale = this.context.globalState.get<number>(
				KEY_SCALE_PERCENT,
				40,
			);
			const initMsg: InitMessage = {
				type: "init",
				content: textDoc.getText(),
				moduleBaseUri: webview
					.asWebviewUri(
						vscode.Uri.joinPath(this.context.extensionUri, "node_modules"),
					)
					.toString(),
				scalePercent: savedScale,
				debugLogging: !!vscode.workspace
					.getConfiguration("meiViewer")
					.get("enableDebugLogging", false),
				projectOptions: projectOptions || undefined,
			};
			webview.postMessage(initMsg);
		};

		const readyListener = webview.onDidReceiveMessage(
			async (e: WebviewOutboundMessage & { type: string }) => {
				if (!e) return;
				if (e.type === "ready") {
					console.log("[MEI] extension: received ready from webview");
					postInit();
				} else if (e.type === "elementClicked") {
					const xmlId = e.xmlId as string | undefined;
					if (!xmlId) return;
					console.log("[MEI] extension: elementClicked", { xmlId });
					// Always highlight in the preview itself
					webview.postMessage({ type: "highlightByXmlId", xmlId });
					// Prepare the text document for searching
					const doc = await vscode.workspace.openTextDocument(document.uri);
					const full = doc.getText();
					const pattern = new RegExp(
						`\\b(xml:id|id)\\s*=\\s*['"]${escapeRegExp(xmlId)}['"]`,
					);
					const idx = full.search(pattern);
					if (idx >= 0) {
						const pos = doc.positionAt(idx);
						// Only jump if the text editor is already open (visible or in an open tab)
						const existing = vscode.window.visibleTextEditors.find(
							(ed) => ed.document.uri.toString() === document.uri.toString(),
						);
						if (existing) {
							const editor = await vscode.window.showTextDocument(
								existing.document,
								{
									preserveFocus: false,
									preview: false,
									viewColumn: existing.viewColumn,
								},
							);
							editor.selection = new vscode.Selection(pos, pos);
							editor.revealRange(
								new vscode.Range(pos, pos),
								vscode.TextEditorRevealType.InCenter,
							);
							return;
						}
						const openTab = findOpenTextTab(document.uri);
						if (openTab) {
							const editor = await vscode.window.showTextDocument(doc, {
								preserveFocus: false,
								preview: false,
								viewColumn: openTab.group.viewColumn,
							});
							editor.selection = new vscode.Selection(pos, pos);
							editor.revealRange(
								new vscode.Range(pos, pos),
								vscode.TextEditorRevealType.InCenter,
							);
						}
					}
				} else if (e.type === "persistSettings") {
					const scale = Number(e.scalePercent);
					if (Number.isFinite(scale)) {
						await this.context.globalState.update(KEY_SCALE_PERCENT, scale);
					}
				} else if (e.type === "openOptions") {
					type OpenOpts = {
						type: "openOptions";
						currentOptions?: Record<string, unknown>;
					};
					const oo = e as OpenOpts;
					await this.openOptionsFile(configUri, oo.currentOptions);
				}
			},
		);
		// Fallback in case the webview never posts a ready message within a short window
		const initFallback = setTimeout(postInit, 200);

		const changeSub = vscode.workspace.onDidChangeTextDocument((ev) => {
			if (ev.document.uri.toString() === document.uri.toString()) {
				webview.postMessage({ type: "update", content: ev.document.getText() });
			}
		});

		const selectionSub = vscode.window.onDidChangeTextEditorSelection((ev) => {
			if (ev.textEditor.document.uri.toString() !== document.uri.toString())
				return;
			const editor = ev.textEditor;
			const offset = editor.document.offsetAt(editor.selection.active);
			const full = editor.document.getText();
			const xmlId = getXmlIdAtOffset(full, offset);
			if (xmlId) {
				console.log("[MEI] extension: selection -> xmlId", { xmlId, offset });
				webview.postMessage({ type: "highlightByXmlId", xmlId });
			}
		});

		// Watch the project options config file for changes
		let optionsWatcher: vscode.FileSystemWatcher | undefined;
		try {
			if (workspaceFolder) {
				optionsWatcher = vscode.workspace.createFileSystemWatcher(
					new vscode.RelativePattern(
						workspaceFolder,
						vscode.workspace.asRelativePath(configUri, false),
					),
				);
				const postOptions = async () => {
					const opts = await this.loadProjectOptions(configUri);
					webview.postMessage({
						type: "setProjectOptions",
						projectOptions: opts || undefined,
					});
				};
				optionsWatcher.onDidChange(postOptions);
				optionsWatcher.onDidCreate(postOptions);
				optionsWatcher.onDidDelete(async () => {
					webview.postMessage({
						type: "setProjectOptions",
						projectOptions: undefined,
					});
				});
			}
		} catch {}

		webviewPanel.onDidDispose(() => {
			isDisposed = true;
			clearTimeout(initFallback);
			readyListener.dispose();
			changeSub.dispose();
			selectionSub.dispose();
			optionsWatcher?.dispose();
			this.untrackPanel(webviewPanel, configUri);
		});
	}
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
	try {
		await vscode.workspace.fs.createDirectory(uri);
	} catch {}
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

async function generateJsConfigContent(
	extUri: vscode.Uri,
	currentOptions: Record<string, unknown> | undefined,
): Promise<Uint8Array> {
	const header = `# MEI Viewer / Verovio options
# This file defines project-level options for the Verovio toolkit.
# It is loaded by the MEI Viewer extension if present.
#
# Provide key-value pairs which will be passed to VerovioToolkit.setOptions().
#
# Lines starting with # are comments.
# Remove # to enable an option and set its value.
\n`;

	let dtsText = "";
	try {
		const dtsUri = vscode.Uri.joinPath(
			extUri,
			"node_modules",
			"@types",
			"verovio",
			"VerovioOptions.d.ts",
		);
		const buff = await vscode.workspace.fs.readFile(dtsUri);
		dtsText = Buffer.from(buff).toString("utf8");
	} catch {}

	type Entry = {
		name: string;
		doc: string;
		meta: { default?: string; min?: string; max?: string };
	};
	const entries: Entry[] = [];
	const excluded = new Set<string>([
		"pageWidth",
		"pageHeight",
		"pageMarginTop",
		"pageMarginBottom",
		"pageMarginLeft",
		"pageMarginRight",
		"scaleToPageSize",
		"adjustPageHeight",
		"scale",
	]);
	if (dtsText) {
		// Capture only the JSDoc body (group 1) and the following property name (group 2)
		const re = /\/\*\*([\s\S]*?)\*\/\s*([a-zA-Z0-9_]+)\?:/g;
		while (true) {
			const m = re.exec(dtsText);
			if (!m) break;
			const blockDoc = m[1];
			const name = m[2];
			const lines = blockDoc
				.split("\n")
				.map((l) => l.replace(/^\s*\*\s?/, "").trim());
			const docLines = lines.filter((l) => !/^(default|min|max)\s*:/i.test(l));
			const doc = docLines.join(" ").trim();
			const meta: Entry["meta"] = {};
			const def = blockDoc.match(/default:\s*([^\n*]+)/i);
			const min = blockDoc.match(/min:\s*([^\n*]+)/i);
			const max = blockDoc.match(/max:\s*([^\n*]+)/i);
			if (def) meta.default = def[1].trim();
			if (min) meta.min = min[1].trim();
			if (max) meta.max = max[1].trim();
			if (!excluded.has(name)) entries.push({ name, doc, meta });
		}
	}

	const current = currentOptions ?? {};
	const lines: string[] = [];
	for (const e of entries) {
		if (e.doc) lines.push(`# ${e.doc}`);
		const metaBits = [
			e.meta.default ? `default: ${e.meta.default}` : "",
			e.meta.min ? `min: ${e.meta.min}` : "",
			e.meta.max ? `max: ${e.meta.max}` : "",
		].filter(Boolean);
		if (metaBits.length) lines.push(`# ${metaBits.join("; ")}`);
		if (Object.hasOwn(current, e.name)) {
			const value = (current as Record<string, unknown>)[e.name];
			if (
				Array.isArray(value) ||
				(value !== null && typeof value === "object")
			) {
				let rendered = stringifyYaml(value);
				if (rendered.endsWith("\n")) rendered = rendered.slice(0, -1);
				const indented = rendered
					.split("\n")
					.map((l) => (l.length ? `  ${l}` : "  "))
					.join("\n");
				lines.push(`${e.name}:\n${indented}`);
			} else {
				let rendered = "";
				try {
					rendered = stringifyYaml(value).trim();
				} catch {
					rendered = JSON.stringify(value);
				}
				lines.push(`${e.name}: ${rendered}`);
			}
		} else {
			lines.push(`# ${e.name}: <set value>`);
		}
		lines.push("");
	}

	// Fallback: if no entries parsed, just dump current options as YAML
	if (!entries.length) {
		const filtered = Object.fromEntries(
			Object.entries(currentOptions ?? {}).filter(([k]) => !excluded.has(k)),
		);
		const body = stringifyYaml(filtered);
		return new TextEncoder().encode(header + (body || ""));
	}

	const body = `${lines.join("\n")}`;
	return new TextEncoder().encode(header + body);
}

// Reserved for future support of JSON/JSONC config files
// async function readJsonc(uri: vscode.Uri): Promise<unknown> {
//     try {
//         const buff = await vscode.workspace.fs.readFile(uri);
//         const text = Buffer.from(buff).toString("utf8");
//         return JSON.parse(text);
//     } catch {
//         return undefined;
//     }
// }

async function readYamlOptions(uri: vscode.Uri): Promise<unknown> {
	const srcBuff = await vscode.workspace.fs.readFile(uri);
	const src = Buffer.from(srcBuff).toString("utf8");
	try {
		return parseYaml(src) as unknown;
	} catch {
		return undefined;
	}
}

// Load project options from YAML config in .vscode.
const _loadProjectOptions = async function (
	this: MeiPreviewProvider,
	configUri: vscode.Uri,
): Promise<Record<string, unknown> | null> {
	try {
		if (!(await fileExists(configUri))) return null;
		const val = (await readYamlOptions(configUri)) as unknown;
		if (val && typeof val === "object") return val as Record<string, unknown>;
		return null;
	} catch (err) {
		console.warn("[MEI] Failed to read project options:", err);
		return null;
	}
};

const _openOptionsFile = async function (
	this: MeiPreviewProvider,
	configUri: vscode.Uri,
	currentOptions: Record<string, unknown> | undefined,
): Promise<void> {
	const dirUri = vscode.Uri.joinPath(configUri, ".." as unknown as string);
	await ensureDir(dirUri);
	if (!(await fileExists(configUri))) {
		const ext = vscode.extensions.getExtension("simon-waloschek.mei-viewer");
		const extUri =
			ext?.extensionUri ?? vscode.Uri.file(path.dirname(__dirname));
		await vscode.workspace.fs.writeFile(
			configUri,
			await generateJsConfigContent(extUri, currentOptions),
		);
	}
	// Focus existing visible editor if already open
	const existing = vscode.window.visibleTextEditors.find(
		(ed) => ed.document.uri.toString() === configUri.toString(),
	);
	if (existing) {
		await vscode.window.showTextDocument(existing.document, {
			preview: false,
			viewColumn: existing.viewColumn,
			preserveFocus: false,
		});
		return;
	}
	// If already open in a tab, reveal it; otherwise open to the side
	const openTab = findOpenTextTab(configUri);
	const doc = await vscode.workspace.openTextDocument(configUri);
	await vscode.window.showTextDocument(doc, {
		preview: false,
		viewColumn: openTab ? openTab.group.viewColumn : vscode.ViewColumn.Beside,
		preserveFocus: false,
	});
};

// Typing augmentation on the prototype for local helpers
declare module "../provider/MeiPreviewProvider" {
	interface MeiPreviewProvider {
		loadProjectOptions(
			configUri: vscode.Uri,
		): Promise<Record<string, unknown> | null>;
		openOptionsFile(
			configUri: vscode.Uri,
			currentOptions: Record<string, unknown> | undefined,
		): Promise<void>;
	}
}

// Attach helpers without using `any` assertion
(
	MeiPreviewProvider.prototype as unknown as {
		loadProjectOptions: typeof _loadProjectOptions;
		openOptionsFile: typeof _openOptionsFile;
	}
).loadProjectOptions = _loadProjectOptions;

(
	MeiPreviewProvider.prototype as unknown as {
		loadProjectOptions: typeof _loadProjectOptions;
		openOptionsFile: typeof _openOptionsFile;
	}
).openOptionsFile = _openOptionsFile;

function getNonce() {
	const possible =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let text = "";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function getXmlIdAtOffset(
	text: string,
	offset: number,
): string | undefined {
	if (offset < 0 || offset > text.length) return undefined;
	const start = text.lastIndexOf("<", offset);
	if (start < 0) return undefined;
	const end = text.indexOf(">", start + 1);
	if (end < 0) return undefined;
	const tag = text.substring(start, end + 1);
	// Prefer xml:id, but also support plain id; allow single or double quotes
	const mXml = tag.match(/\bxml:id\s*=\s*(['"])([^'"]+)\1/i);
	if (mXml?.[2]) return mXml[2];
	const mId = tag.match(/\bid\s*=\s*(['"])([^'"]+)\1/i);
	if (mId?.[2]) return mId[2];

	// If on a closing tag, try to find the corresponding opening tag and read its id
	const mClose = tag.match(/^<\/(\w[\w:-]*)/);
	if (mClose?.[1]) {
		const name = mClose[1];
		const upto = text.slice(0, start);
		const openRe = new RegExp(`<${name}(\\s[^>]*)?>`, "gi");
		let last: RegExpExecArray | null = null;
		let mm: RegExpExecArray | null = null;
		// Iterate through all matches to get the last one
		while (true) {
			const res = openRe.exec(upto);
			if (res === null) break;
			mm = res;
			last = mm;
		}
		if (last) {
			const openTag = last[0];
			const xm2 = openTag.match(/\bxml:id\s*=\s*(['"])([^'"]+)\1/i);
			if (xm2?.[2]) return xm2[2];
			const id2 = openTag.match(/\bid\s*=\s*(['"])([^'"]+)\1/i);
			if (id2?.[2]) return id2[2];
		}
	}
	return undefined;
}

function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findOpenTextTab(
	uri: vscode.Uri,
): { group: vscode.TabGroup } | undefined {
	const tabGroups = vscode.window.tabGroups;
	for (const group of tabGroups.all) {
		for (const tab of group.tabs) {
			if (tab.input && isTextTabForUri(tab.input, uri)) {
				return { group };
			}
		}
	}
	return undefined;
}

function isTextTabForUri(
	input: vscode.TabInputText | vscode.TabInputTextDiff | unknown,
	uri: vscode.Uri,
): boolean {
	try {
		// Exclude custom editors (e.g., our preview) which expose a viewType
		if (
			input &&
			typeof input === "object" &&
			"viewType" in (input as vscode.TabInputCustom)
		) {
			return false;
		}
		// TabInputTextDiff shape check
		if (
			input &&
			(input as Partial<vscode.TabInputTextDiff>).original &&
			(input as Partial<vscode.TabInputTextDiff>).modified
		) {
			const diff = input as vscode.TabInputTextDiff;
			return (
				diff.original.toString() === uri.toString() ||
				diff.modified.toString() === uri.toString()
			);
		}
		// TabInputText shape check
		if (input && (input as Partial<vscode.TabInputText>).uri) {
			const text = input as vscode.TabInputText;
			return text.uri.toString() === uri.toString();
		}
	} catch {
		// ignore
	}
	return false;
}
