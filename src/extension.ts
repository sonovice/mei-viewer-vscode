// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { CMD_OPEN_PREVIEW, VIEW_TYPE_MEI_PREVIEW } from "./constants";
import { MeiPreviewProvider } from "./provider/MeiPreviewProvider";
import { initLogger, logInfo } from "./logger";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	initLogger(context);
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	logInfo('Extension "mei-viewer" is now active');

	context.subscriptions.push(MeiPreviewProvider.register(context));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			CMD_OPEN_PREVIEW,
			async (uri?: vscode.Uri) => {
				const target = uri ?? vscode.window.activeTextEditor?.document.uri;
				if (!target) {
					vscode.window.showInformationMessage("Open an .mei file first.");
					return;
				}
				await vscode.commands.executeCommand(
					"vscode.openWith",
					target,
					VIEW_TYPE_MEI_PREVIEW,
				);
			},
		),
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
