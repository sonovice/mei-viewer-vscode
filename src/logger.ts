import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | null = null;
let debugEnabled = false;

export function initLogger(context: vscode.ExtensionContext) {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel("MEI Viewer");
		context.subscriptions.push(outputChannel);
	}
	debugEnabled = !!vscode.workspace
		.getConfiguration("meiViewer")
		.get("enableDebugLogging", false);

	const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration("meiViewer.enableDebugLogging")) {
			debugEnabled = !!vscode.workspace
				.getConfiguration("meiViewer")
				.get("enableDebugLogging", false);
		}
	});
	context.subscriptions.push(disposable);
}

export function logInfo(message: string, ...args: unknown[]) {
	if (outputChannel)
		outputChannel.appendLine(`[info] ${format(message, args)}`);
}

export function logError(message: string, ...args: unknown[]) {
	if (outputChannel)
		outputChannel.appendLine(`[error] ${format(message, args)}`);
}

export function logDebug(message: string, ...args: unknown[]) {
	if (!debugEnabled) return;
	if (outputChannel)
		outputChannel.appendLine(`[debug] ${format(message, args)}`);
}

function format(message: string, args: unknown[]): string {
	try {
		const extra = args?.length ? ` ${args.map(safe).join(" ")}` : "";
		return `${message}${extra}`;
	} catch {
		return message;
	}
}

function safe(v: unknown): string {
	try {
		if (typeof v === "string") return v;
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}
