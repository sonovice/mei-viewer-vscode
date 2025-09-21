/* global acquireVsCodeApi */
declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };

import { ToolkitManager } from "./ToolkitManager";
import { UiController } from "./UiController";
import { getVSCode } from "./vscodeApi";
import type { WebviewInboundMessage } from "../shared/messages";

export class App {
	private readonly toolkit = new ToolkitManager();
	private readonly ui = new UiController(() => this.toolkit.getToolkit());
	private lastMei: string | null = null;
	private resizeTimer: number | null = null;
	private debounceUpdateTimer: number | null = null;
	private resizeAttached = false;
	private debug = false;

	public bootstrap() {
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () => this.postReady());
		} else {
			this.postReady();
		}
		window.addEventListener("message", (ev) => this.onMessage(ev));
		document.addEventListener("click", (e) => this.onClick(e));
		document.addEventListener("input", (e) => this.onInput(e));
	}

	private postReady() {
		if (this.debug) console.log("[MEI] postReady -> sending ready message");
		getVSCode()?.postMessage({ type: "ready" });
	}

	private async renderScore(mei: string, moduleBaseUri?: string) {
		this.toolkit.setBaseUri(moduleBaseUri || "");
		let tk = this.toolkit.getToolkit();
		if (!tk) {
			try {
				tk = await this.toolkit.ensureToolkit();
			} catch (err) {
				const message =
					this.toolkit.getLastError() ||
					(err instanceof Error ? err.message : String(err));
				const container = document.getElementById("container");
				if (container) {
					container.innerHTML = `<div style="padding:12px">Failed to load Verovio: ${escapeHtml(message)} <button id="retryLoad" class="vsc-btn" style="margin-left:8px">Retry</button></div>`;
					const retry = document.getElementById("retryLoad");
					retry?.addEventListener("click", () =>
						this.renderScore(mei, moduleBaseUri),
					);
				}
				return;
			}
		}
		tk.setOptions(this.computeLayoutOptions());
		tk.loadData(mei);
		this.lastMei = mei;
		this.ui.pageCount = tk.getPageCount();
		this.ui.currentPage = Math.min(this.ui.currentPage, this.ui.pageCount) || 1;
		const svg = this.ui.centerSvg(tk.renderToSVG(this.ui.currentPage));
		this.ui.renderSvg(svg);
		this.ui.updateToolbar();
		if (this.ui.lastHighlightedXmlId) {
			this.ui.applyHighlightByXmlId(this.ui.lastHighlightedXmlId);
		}
		this.ensureResizeHandler();
	}

	private computeLayoutOptions() {
		const widthPx = Math.max(
			100,
			Math.floor(this.ui.container?.clientWidth || 800),
		);
		const heightPx = Math.max(
			100,
			Math.floor(this.ui.container?.clientHeight || 600),
		);
		const unclamped = this.ui.scalePercent;
		const scale = Math.max(20, Math.min(130, unclamped));
		return {
			breaks: "smart",
			pageWidth: (widthPx * 100) / scale,
			pageHeight: (heightPx * 100) / scale,
			pageMarginTop: (16 * 100) / scale,
			pageMarginBottom: (16 * 100) / scale,
			pageMarginLeft: (30 * 100) / scale,
			pageMarginRight: (20 * 100) / scale,
			systemMaxPerPage: 24,
			scaleToPageSize: false,
			adjustPageHeight: false,
			scale: scale,

			footer: "none",
			header: "encoded",
			lyricWordSpace: 2.7,
			lyricTopMinMargin: 4.5,
			spacingLinear: 0.03,
			spacingNonLinear: 1.0,
			spacingStaff: 15,
			spacingSystem: 7,
			font: "Bravura",
			outputSmuflXmlEntities: false,
			justificationBraceGroup: 0.1,
			justificationSystem: 0.2,
			justifyVertically: true,
			justificationMaxVertical: 0.1,
			mdivAll: true,
			staffLineWidth: 0.3,
			stemWidth: 0.3,
			barLineWidth: 0.3,
		};
	}

	private onMessage(event: MessageEvent) {
		const msg = event.data as WebviewInboundMessage;
		if (!msg || !msg.type) return;
		if (this.debug) console.log("[MEI] onMessage", msg);
		if (msg.type === "init") {
			this.debug = !!msg.debugLogging;
			this.ui.setContainer(document.getElementById("container"));
			if (!this.ui.container) {
				if (this.debug) console.log("[MEI] init: container not found");
				return;
			}
			this.toolkit.setBaseUri(msg.moduleBaseUri || "");
			if (
				typeof msg.scalePercent === "number" &&
				Number.isFinite(msg.scalePercent)
			) {
				this.ui.scalePercent = Math.max(20, Math.min(130, msg.scalePercent));
				const label = document.getElementById("scaleLabel");
				if (label) label.textContent = `${this.ui.scalePercent}%`;
				const slider = document.getElementById(
					"scaleRange",
				) as HTMLInputElement | null;
				if (slider) slider.value = String(this.ui.scalePercent);
			}
			if (this.debug) console.log("[MEI] renderScore(init)");
			this.renderScore(msg.content ?? "", msg.moduleBaseUri);
			this.ensureResizeHandler();
		} else if (msg.type === "update") {
			this.lastMei = msg.content ?? this.lastMei;
			if (this.debounceUpdateTimer) clearTimeout(this.debounceUpdateTimer);
			this.debounceUpdateTimer = window.setTimeout(async () => {
				if (!this.lastMei) return;
				if (this.debug) console.log("[MEI] renderScore(update)");
				await this.renderScore(this.lastMei as string, undefined);
			}, 200) as unknown as number;
		} else if (msg.type === "highlightByXmlId") {
			const xmlIdStr =
				typeof msg.xmlId === "string"
					? msg.xmlId
					: msg.xmlId != null
						? String(msg.xmlId)
						: undefined;
			if (this.debug)
				console.log("[MEI] highlightByXmlId message", {
					xmlId: msg.xmlId,
					xmlIdStr,
				});
			this.ui.lastHighlightedXmlId = xmlIdStr || this.ui.lastHighlightedXmlId;
			this.ui.applyHighlightByXmlId(this.ui.lastHighlightedXmlId);
		}
	}

	private onClick(e: MouseEvent) {
		const raw = e.target as Element | null;
		if (!(raw instanceof Element)) return;
		const hit =
			(raw.closest(
				"#prevPage, #nextPage, #toggleTheme",
			) as HTMLElement | null) || (raw as HTMLElement | null);
		const id = hit?.id || "";
		if (id === "prevPage") {
			console.log("[MEI] onClick -> prevPage");
			e.preventDefault();
			e.stopPropagation();
			return this.ui.onPrevPage();
		}
		if (id === "nextPage") {
			console.log("[MEI] onClick -> nextPage");
			e.preventDefault();
			e.stopPropagation();
			return this.ui.onNextPage();
		}
		// theme toggle removed
	}

	private onInput(e: Event) {
		const target = e.target as HTMLElement | null;
		if (!(target instanceof HTMLElement)) return;
		if (target.id === "scaleRange") {
			const value = Number((target as HTMLInputElement).value);
			this.ui.scalePercent = value;
			const label = document.getElementById("scaleLabel");
			if (label) label.textContent = `${Math.max(20, Math.min(130, value))}%`;
			if (!this.toolkit.getToolkit() || !this.lastMei) return;
			if (this.debounceUpdateTimer) clearTimeout(this.debounceUpdateTimer);
			this.debounceUpdateTimer = window.setTimeout(async () => {
				await this.renderScore(this.lastMei as string, undefined);
				if (this.ui.lastHighlightedXmlId)
					this.ui.applyHighlightByXmlId(this.ui.lastHighlightedXmlId);
				this.persistSettings();
			}, 150) as unknown as number;
		}
	}

	private ensureResizeHandler() {
		if (this.resizeAttached) return;
		this.resizeAttached = true;
		window.addEventListener("resize", () => {
			if (this.resizeTimer) clearTimeout(this.resizeTimer);
			this.resizeTimer = window.setTimeout(() => {
				if (!this.toolkit.getToolkit() || !this.ui.container || !this.lastMei)
					return;
				this.renderScore(this.lastMei as string, undefined);
				if (this.ui.lastHighlightedXmlId)
					this.ui.applyHighlightByXmlId(this.ui.lastHighlightedXmlId);
			}, 150) as unknown as number;
		});
	}

	private persistSettings() {
		try {
			getVSCode()?.postMessage({
				type: "persistSettings",
				scalePercent: this.ui.scalePercent,
				// theme removed
			});
		} catch {}
	}
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
