import * as assert from "node:assert";
import * as path from "node:path";
import * as os from "node:os";
import * as vscode from "vscode";
import { VIEW_TYPE_MEI_PREVIEW } from "../constants";

suite("MEI Viewer Integration", () => {
	test("activates on openPreview command", async () => {
		await vscode.commands.executeCommand("mei-viewer.openPreview");
		// If the command was not found or handler missing, the above would reject.
		assert.ok(true);
	});

	test("opens custom editor for a .mei file", async () => {
		// Create a temporary MEI file on disk
		const tmpDir = os.tmpdir();
		const tmpFile = path.join(tmpDir, `mei-viewer-test-${Date.now()}.mei`);
		const uri = vscode.Uri.file(tmpFile);
		const content = `<?xml version="1.0" encoding="UTF-8"?>\n<mei xmlns="http://www.music-encoding.org/ns/mei"><music/></mei>`;
		await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));

		// Open with our custom editor
		await vscode.commands.executeCommand(
			"vscode.openWith",
			uri,
			VIEW_TYPE_MEI_PREVIEW,
		);

		// Find a tab with our custom editor view type
		const hasCustom = vscode.window.tabGroups.all.some((group) =>
			group.tabs.some((tab) =>
				Boolean(
					tab.input &&
						typeof tab.input === "object" &&
						"viewType" in (tab.input as vscode.TabInputCustom) &&
						(tab.input as vscode.TabInputCustom).viewType ===
							VIEW_TYPE_MEI_PREVIEW,
				),
			),
		);
		assert.strictEqual(hasCustom, true, "Custom editor tab should be open");
	});
});
