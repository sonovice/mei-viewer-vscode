/* global acquireVsCodeApi */
declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };

// Cache a single instance of the VS Code webview API to avoid runtime errors
// like: "An instance of the VS Code API has already been acquired".
type VSCodeApi = { postMessage: (msg: unknown) => void };

let cachedApi: VSCodeApi | null = null;

export function getVSCode(): VSCodeApi | null {
	if (cachedApi) return cachedApi;
	try {
		if (typeof acquireVsCodeApi === "function") {
			cachedApi = acquireVsCodeApi();
			return cachedApi;
		}
	} catch {
		// ignore
	}
	return null;
}
