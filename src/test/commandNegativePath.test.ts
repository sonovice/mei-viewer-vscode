import * as assert from "node:assert";
import * as vscode from "vscode";

suite("Open Preview command - negative path", () => {
	test("shows info message when no active editor", async () => {
		// Ensure no active editor by closing all editors
		await vscode.commands.executeCommand("workbench.action.closeAllEditors");
		// Spy on showInformationMessage
		const orig = vscode.window.showInformationMessage;
		let called = false;
		vscode.window.showInformationMessage = ((...args: unknown[]) => {
			called = true;
			return Promise.resolve(undefined);
		}) as typeof vscode.window.showInformationMessage;
		try {
			await vscode.commands.executeCommand("mei-viewer.openPreview");
			assert.strictEqual(called, true);
		} finally {
			// restore
			vscode.window.showInformationMessage = orig;
		}
	});
});
