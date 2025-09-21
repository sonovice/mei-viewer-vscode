/* global acquireVsCodeApi */
declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };

import { App } from "./App";

(() => {
	const app = new App();
	app.bootstrap();
})();
