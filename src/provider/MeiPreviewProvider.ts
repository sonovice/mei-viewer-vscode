import * as vscode from "vscode";
import { VIEW_TYPE_MEI_PREVIEW, KEY_SCALE_PERCENT } from "../constants";
import type { WebviewOutboundMessage, InitMessage } from "../shared/messages";

export class MeiPreviewProvider implements vscode.CustomReadonlyEditorProvider {
	constructor(private readonly context: vscode.ExtensionContext) {}

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new MeiPreviewProvider(context);
		return vscode.window.registerCustomEditorProvider(
			VIEW_TYPE_MEI_PREVIEW,
			provider,
			{
				webviewOptions: { retainContextWhenHidden: true },
				supportsMultipleEditorsPerDocument: false,
			},
		);
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

		webviewPanel.onDidDispose(() => {
			isDisposed = true;
			clearTimeout(initFallback);
			readyListener.dispose();
			changeSub.dispose();
			selectionSub.dispose();
		});
	}
}

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
