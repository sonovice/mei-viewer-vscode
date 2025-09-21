import type {
	CreateVerovioModule,
	VerovioEsm,
	VerovioToolkitType,
} from "./types";

export class ToolkitManager {
	private toolkit: VerovioToolkitType | null = null;
	private baseUri: string | null = null;
	private lastError: string | null = null;

	public setBaseUri(uri: string) {
		this.baseUri = (uri || "").replace(/\/$/, "");
	}

	public getToolkit(): VerovioToolkitType | null {
		return this.toolkit;
	}

	public async ensureToolkit(): Promise<VerovioToolkitType> {
		if (this.toolkit) return this.toolkit;
		const base = this.baseUri || "";
		const wasmModuleUrl = `${base}/verovio/dist/verovio-module.mjs`;
		const esmUrl = `${base}/verovio/dist/verovio.mjs`;
		try {
			const [{ default: createVerovioModule }, verovioEsm] = (await Promise.all(
				[import(wasmModuleUrl), import(esmUrl)],
			)) as [{ default: CreateVerovioModule }, VerovioEsm];
			const VerovioModule = await createVerovioModule({
				locateFile: (path: string) => `${base}/verovio/dist/${path}`,
			});
			const { VerovioToolkit } = verovioEsm;
			this.toolkit = new VerovioToolkit(VerovioModule);
			this.toolkit.setOptions({
				scaleToPageSize: false,
				adjustPageHeight: false,
				mmOutput: false,
				svgBoundingBoxes: false,
			});
			this.lastError = null;
			return this.toolkit;
		} catch (err) {
			this.lastError = err instanceof Error ? err.message : String(err);
			throw err;
		}
	}

	public getLastError(): string | null {
		return this.lastError;
	}
}
