import * as assert from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import { MeiPreviewProvider } from "../provider/MeiPreviewProvider";

function tmpPath(...parts: string[]): string {
	return path.join(os.tmpdir(), "mei-viewer-tests", ...parts);
}

async function ensureDir(p: string) {
	await fs.mkdir(p, { recursive: true });
}

type AnyRecord = Record<string, unknown>;

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

suite("Project options config", () => {
	test("loads YAML options file", async () => {
		const root = tmpPath(`yaml-${Date.now()}`);
		const vsdir = path.join(root, ".vscode");
		await ensureDir(vsdir);
		const cfg = path.join(vsdir, "mei-viewer.config.yaml");
		const body = `breaks: none\nspacingStaff: 17\n`;
		await fs.writeFile(cfg, body, "utf8");
		const provider = new MeiPreviewProvider(
			{} as unknown as vscode.ExtensionContext,
		);
		const out = await provider.loadProjectOptions(vscode.Uri.file(cfg));
		assert.ok(out);
		assert.strictEqual((out as AnyRecord).breaks, "none");
		assert.strictEqual((out as AnyRecord).spacingStaff, 17);
	});

	test("loads YAML options file with different keys", async () => {
		const root = tmpPath(`yaml2-${Date.now()}`);
		const vsdir = path.join(root, ".vscode");
		await ensureDir(vsdir);
		const cfg = path.join(vsdir, "mei-viewer.config.yaml");
		const body = `breaks: line\nspacingSystem: 9\n`;
		await fs.writeFile(cfg, body, "utf8");
		const provider = new MeiPreviewProvider(
			{} as unknown as vscode.ExtensionContext,
		);
		const out = await provider.loadProjectOptions(vscode.Uri.file(cfg));
		assert.ok(out);
		assert.strictEqual((out as AnyRecord).breaks, "line");
		assert.strictEqual((out as AnyRecord).spacingSystem, 9);
	});

	test("openOptionsFile generates file excluding layout keys", async () => {
		const root = tmpPath(`gen-${Date.now()}`);
		const vsdir = path.join(root, ".vscode");
		await ensureDir(vsdir);
		const cfg = path.join(vsdir, "mei-viewer.config.yaml");
		const provider = new MeiPreviewProvider(
			{} as unknown as vscode.ExtensionContext,
		);
		const current: AnyRecord = {
			breaks: "smart",
			pageWidth: 1234,
			pageHeight: 5678,
			pageMarginTop: 11,
			pageMarginBottom: 22,
			pageMarginLeft: 33,
			pageMarginRight: 44,
			scaleToPageSize: true,
			adjustPageHeight: true,
			scale: 99,
			spacingStaff: 12,
		};
		await provider.openOptionsFile(
			vscode.Uri.file(cfg),
			current as Record<string, unknown>,
		);
		const text = await fs.readFile(cfg, "utf8");
		const excluded = [
			"pageWidth",
			"pageHeight",
			"pageMarginTop",
			"pageMarginBottom",
			"pageMarginLeft",
			"pageMarginRight",
			"scaleToPageSize",
			"adjustPageHeight",
			"scale",
		];
		for (const k of excluded) {
			assert.ok(!text.includes(k + ":"), `should not include ${k}`);
		}
		assert.ok(text.includes("spacingStaff"), "should include non-excluded key");
		// Should be YAML, not JS
		assert.ok(
			text.startsWith("# MEI Viewer"),
			"should start with YAML comments",
		);
		assert.ok(
			!text.includes("module.exports"),
			"should not contain JS exports",
		);
		// Comments should not contain property signatures like '?:'
		assert.ok(!text.includes("?:"), "comments should not contain '?:'");
	});

	test("generator formats array values on new lines under key", async () => {
		const root = tmpPath(`array-${Date.now()}`);
		const vsdir = path.join(root, ".vscode");
		await ensureDir(vsdir);
		const cfg = path.join(vsdir, "mei-viewer.config.yaml");
		const provider = new MeiPreviewProvider(
			{} as unknown as vscode.ExtensionContext,
		);
		const current: AnyRecord = {
			handwrittenFont: ["Petaluma"],
		};
		await provider.openOptionsFile(
			vscode.Uri.file(cfg),
			current as Record<string, unknown>,
		);
		const text = await fs.readFile(cfg, "utf8");
		// Should be either block list or JSON array string, but not inline '- item' on same line
		assert.ok(
			/handwrittenFont:\n\s*-\s*Petaluma/.test(text) ||
				/handwrittenFont:\s*\[\s*"Petaluma"\s*\]/.test(text),
			"handwrittenFont should be a YAML list or JSON-style array",
		);
	});

	test("resolveCustomEditor sends init with projectOptions and reacts to save broadcast", async () => {
		// Prepare a temporary MEI file and config
		const root = tmpPath(`init-${Date.now()}`);
		const vsdir = path.join(root, ".vscode");
		await ensureDir(vsdir);
		const cfg = path.join(vsdir, "mei-viewer.config.yaml");
		await fs.writeFile(cfg, `breaks: none\n`, "utf8");

		const meiPath = path.join(root, "sample.mei");
		await fs.writeFile(
			meiPath,
			'<?xml version="1.0" encoding="UTF-8"?>\n<mei xmlns="http://www.music-encoding.org/ns/mei"><music/></mei>',
			"utf8",
		);

		// Create a fake panel/webview capturing messages
		const posted: AnyRecord[] = [];
		const fakeWebview: vscode.Webview & { onMsg?: (e: unknown) => void } = {
			options: {},
			asWebviewUri: (u: vscode.Uri) => u,
			postMessage: async (m: unknown) => {
				posted.push(m as AnyRecord);
				return true;
			},
			get cspSource() {
				return "";
			},
			get html() {
				return "";
			},
			set html(_v: string) {},
			onDidReceiveMessage: (cb: (e: unknown) => void) => {
				(fakeWebview as unknown as { onMsg?: (e: unknown) => void }).onMsg = cb;
				return { dispose() {} } as vscode.Disposable;
			},
		} as unknown as vscode.Webview;
		const fakePanel: vscode.WebviewPanel = {
			webview: fakeWebview,
			reveal: () => {},
			dispose: () => {},
			viewColumn: undefined,
			active: true,
			options: {},
			title: "",
			viewType: "",
			onDidDispose: (_cb: () => void) =>
				({ dispose() {} }) as vscode.Disposable,
			onDidChangeViewState: () => ({ dispose() {} }) as vscode.Disposable,
			onDidChangeViewBadge: () => ({ dispose() {} }) as vscode.Disposable,
			onDidChangeViewState2: () => ({ dispose() {} }) as vscode.Disposable,
		} as unknown as vscode.WebviewPanel;

		const provider = new MeiPreviewProvider({
			extensionUri: vscode.Uri.file(path.resolve(".")),
			globalState: { get: () => 40, update: async () => {} },
		} as unknown as vscode.ExtensionContext);

		await (
			provider as unknown as {
				resolveCustomEditor(
					document: vscode.CustomDocument,
					webviewPanel: vscode.WebviewPanel,
				): Promise<void>;
			}
		).resolveCustomEditor(
			{ uri: vscode.Uri.file(meiPath), dispose() {} } as vscode.CustomDocument,
			fakePanel,
		);

		// Simulate ready from webview to trigger init immediately
		(fakeWebview as unknown as { onMsg?: (e: unknown) => void }).onMsg?.({
			type: "ready",
		});

		// Wait briefly for async post
		await new Promise((r) => setTimeout(r, 50));

		const initMsg = posted.find((m) => m?.type === "init");
		assert.ok(initMsg, "init message should be posted");
		assert.strictEqual((initMsg.projectOptions as AnyRecord).breaks, "none");

		// Track panel and broadcast change
		(
			provider as unknown as {
				trackPanel(panel: vscode.WebviewPanel, uri: vscode.Uri): void;
			}
		).trackPanel(fakePanel, vscode.Uri.file(cfg));
		await fs.writeFile(cfg, `breaks: line\n`, "utf8");
		await (
			provider as unknown as {
				broadcastProjectOptions(uri: vscode.Uri): Promise<void>;
			}
		).broadcastProjectOptions(vscode.Uri.file(cfg));
		const setMsg = [...posted]
			.reverse()
			.find((m) => m?.type === "setProjectOptions");
		assert.ok(setMsg, "setProjectOptions should be posted on broadcast");
		assert.strictEqual((setMsg.projectOptions as AnyRecord).breaks, "line");
	});
});
