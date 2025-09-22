import type { VerovioToolkitType } from "./types";
import { getVSCode } from "./vscodeApi";

export class UiController {
	public container: HTMLElement | null = null;
	public currentPage = 1;
	public pageCount = 1;
	public scalePercent = 40;
	public isDarkMode: boolean | undefined = false;
	public lastHighlightedXmlId: string | null = null;
	private boundMouseMove: ((e: MouseEvent) => void) | null = null;
	private boundMouseLeave: ((e: MouseEvent) => void) | null = null;

	constructor(private readonly getToolkit: () => VerovioToolkitType | null) {}

	public setContainer(el: HTMLElement | null) {
		this.container = el;
	}

	public updateToolbar() {
		const indicator = document.getElementById("pageIndicator");
		if (indicator) {
			indicator.textContent = `Page ${this.currentPage} / ${this.pageCount}`;
		}
		const prev = document.getElementById(
			"prevPage",
		) as HTMLButtonElement | null;
		const next = document.getElementById(
			"nextPage",
		) as HTMLButtonElement | null;
		if (prev) prev.disabled = this.currentPage <= 1;
		if (next) next.disabled = this.currentPage >= this.pageCount;
	}

	public centerSvg(svgString: string): string {
		if (!this.container) return svgString;
		const sizeMatch = svgString.match(/width="(\d+)px" height="(\d+)px"/);
		if (!sizeMatch) return svgString;
		const height = Number(sizeMatch[2]);
		const containerH = this.container.clientHeight || 0;
		const yOffset = Math.max(0, Math.round((containerH - height) / 2));

		// Ensure dynamic style is applied via a nonce-bearing <style> element
		this.ensureDynamicStyle(yOffset);

		// Add class to svg root and strip any inline style attribute to satisfy CSP
		const openTagMatch = svgString.match(/<svg[^>]*>/);
		if (!openTagMatch) return svgString;
		const openTag = openTagMatch[0];
		let tagWithoutStyle = openTag.replace(/\sstyle="[^"]*"/g, "");
		if (/\sclass="[^"]*"/.test(tagWithoutStyle)) {
			tagWithoutStyle = tagWithoutStyle.replace(
				/\sclass="([^"]*)"/,
				(_m: string, cls: string) => ` class="${cls} vrv-root"`,
			);
		} else {
			tagWithoutStyle = tagWithoutStyle.replace(
				"<svg",
				'<svg class="vrv-root"',
			);
		}
		return svgString.replace(openTag, tagWithoutStyle);
	}

	public renderSvg(svg: string) {
		if (!this.container) return;
		this.container.innerHTML = svg;
		const svgRoot = this.container.querySelector("svg");
		if (svgRoot) {
			// Ensure we don't accumulate multiple listeners after re-renders
			(svgRoot as SVGSVGElement).removeEventListener(
				"click",
				this.onSvgClick as EventListener,
				true,
			);
			console.log("[MEI] renderSvg -> attaching click handler to svgRoot");
			svgRoot.addEventListener("click", this.onSvgClick as EventListener, {
				passive: false,
				capture: true,
			});
			this.addHitboxes(svgRoot as unknown as SVGElement);

			// Hover handlers for hitboxes
			if (this.boundMouseMove) {
				(svgRoot as SVGSVGElement).removeEventListener(
					"mousemove",
					this.boundMouseMove as EventListener,
					true,
				);
			}
			if (this.boundMouseLeave) {
				(svgRoot as SVGSVGElement).removeEventListener(
					"mouseleave",
					this.boundMouseLeave as EventListener,
					true,
				);
			}
			this.boundMouseMove = (ev: MouseEvent) => this.onSvgMouseMove(ev);
			this.boundMouseLeave = () => this.clearHoverBox();
			(svgRoot as SVGSVGElement).addEventListener(
				"mousemove",
				this.boundMouseMove as EventListener,
				{ capture: true, passive: true },
			);
			(svgRoot as SVGSVGElement).addEventListener(
				"mouseleave",
				this.boundMouseLeave as EventListener,
				{ capture: true, passive: true },
			);
			// Ensure dynamic stylesheet exists (for cursor and highlight styles)
			this.ensureDynamicStyle(0);
		}
	}

	public onPrevPage() {
		console.log("[MEI] onPrevPage before", {
			currentPage: this.currentPage,
			pageCount: this.pageCount,
		});
		if (this.currentPage > 1) {
			const newPage = this.currentPage - 1;
			const toolkit = this.getToolkit();
			if (!toolkit) return;
			const svg = this.centerSvg(toolkit.renderToSVG(newPage));
			this.currentPage = newPage;
			this.renderSvg(svg);
			this.updateToolbar();
			if (this.lastHighlightedXmlId)
				this.applyHighlightByXmlId(this.lastHighlightedXmlId, {
					suppressPageJump: true,
				});
			console.log("[MEI] onPrevPage after", { currentPage: this.currentPage });
		}
	}

	public onNextPage() {
		console.log("[MEI] onNextPage before", {
			currentPage: this.currentPage,
			pageCount: this.pageCount,
		});
		if (this.currentPage < this.pageCount) {
			const newPage = this.currentPage + 1;
			const toolkit = this.getToolkit();
			if (!toolkit) return;
			const svg = this.centerSvg(toolkit.renderToSVG(newPage));
			this.currentPage = newPage;
			this.renderSvg(svg);
			this.updateToolbar();
			if (this.lastHighlightedXmlId)
				this.applyHighlightByXmlId(this.lastHighlightedXmlId, {
					suppressPageJump: true,
				});
			console.log("[MEI] onNextPage after", { currentPage: this.currentPage });
		}
	}

	public applyHighlightByXmlId(
		xmlId: string | null | undefined,
		opts?: { suppressPageJump?: boolean },
	) {
		if (!xmlId) return;
		const toolkit = this.getToolkit();
		if (!toolkit) return;
		const sanitizedId = String(xmlId).trim().replace(/^#/, "");
		if (
			!opts?.suppressPageJump &&
			typeof toolkit.getPageWithElement === "function"
		) {
			try {
				const targetPage = toolkit.getPageWithElement(sanitizedId);
				if (
					typeof targetPage === "number" &&
					targetPage > 0 &&
					targetPage !== this.currentPage
				) {
					this.currentPage = targetPage;
					const svg = this.centerSvg(toolkit.renderToSVG(this.currentPage));
					this.renderSvg(svg);
					this.updateToolbar();
				}
			} catch {
				// ignore
			}
		}
		const svgRoot = this.container?.querySelector("svg");
		if (!svgRoot) {
			this.clearHighlightOverlay();
			this.lastHighlightedXmlId = null;
			return;
		}
		const overlay = svgRoot.querySelector("#vrv-hitboxes");
		if (!overlay) {
			this.clearHighlightOverlay();
			this.lastHighlightedXmlId = null;
			return;
		}
		const selectorValue =
			window.CSS && (window.CSS as { escape?: (s: string) => string }).escape
				? (window.CSS as { escape: (s: string) => string }).escape(xmlId)
				: xmlId;
		const target = overlay.querySelector(
			`rect[data-xmlid="${selectorValue}"]`,
		) as SVGRectElement | null;
		if (!target) {
			this.clearHighlightOverlay();
			this.lastHighlightedXmlId = null;
			return;
		}
		const padding = 80;
		const x = Number(target.getAttribute("x")) || 0;
		const y = Number(target.getAttribute("y")) || 0;
		const w = Number(target.getAttribute("width")) || 0;
		const h = Number(target.getAttribute("height")) || 0;

		let pad = padding;
		let hx = x,
			hy = y,
			hw = w,
			hh = h;
		try {
			const parentG = (target.parentElement as Element | null)?.closest(
				"g.note, g[class*='note']",
			) as Element | null;
			if (parentG) {
				pad = 16;
				const notehead = parentG.querySelector(
					"g.notehead, .notehead, [class*='notehead']",
				) as SVGGElement | null;
				if (notehead && typeof notehead.getBBox === "function") {
					const hb = notehead.getBBox();
					hx = hb.x - pad;
					hy = hb.y - pad;
					hw = hb.width + pad * 2;
					hh = hb.height + pad * 2;
				}
			}
		} catch {
			// ignore
		}

		const parentNode = overlay.parentNode as unknown;
		const contentGroup =
			parentNode &&
			typeof (parentNode as SVGGraphicsElement).getBBox === "function"
				? (parentNode as SVGGraphicsElement)
				: null;
		let pageX = 0,
			pageY = 0,
			pageW = Number((svgRoot as SVGSVGElement).getAttribute("width")) || 0,
			pageH = Number((svgRoot as SVGSVGElement).getAttribute("height")) || 0;
		if (contentGroup && typeof contentGroup.getBBox === "function") {
			const bb = contentGroup.getBBox();
			pageX = bb.x;
			pageY = bb.y;
			pageW = bb.width;
			pageH = bb.height;
		}

		let barH = overlay.querySelector("#vrv-cross-h") as SVGRectElement | null;
		if (!barH) {
			barH = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			barH.setAttribute("id", "vrv-cross-h");
			barH.setAttribute("pointer-events", "none");
			overlay.appendChild(barH);
		}
		let barV = overlay.querySelector("#vrv-cross-v") as SVGRectElement | null;
		if (!barV) {
			barV = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			barV.setAttribute("id", "vrv-cross-v");
			barV.setAttribute("pointer-events", "none");
			overlay.appendChild(barV);
		}

		barH.setAttribute("x", String(pageX));
		barH.setAttribute("y", String(hy - pad));
		barH.setAttribute("width", String(pageW));
		barH.setAttribute("height", String(hh + pad * 2));
		barH.setAttribute("class", "vrv-cross");

		barV.setAttribute("x", String(hx - pad));
		barV.setAttribute("y", String(pageY));
		barV.setAttribute("width", String(hw + pad * 2));
		barV.setAttribute("height", String(pageH));
		barV.setAttribute("class", "vrv-cross");

		let center = overlay.querySelector(
			"#vrv-cross-center",
		) as SVGRectElement | null;
		if (!center) {
			center = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			center.setAttribute("id", "vrv-cross-center");
			center.setAttribute("pointer-events", "none");
			overlay.appendChild(center);
		}
		const cx = hx - pad;
		const cy = hy - pad;
		const cw = hw + pad * 2;
		const ch = hh + pad * 2;
		center.setAttribute("x", String(cx));
		center.setAttribute("y", String(cy));
		center.setAttribute("width", String(cw));
		center.setAttribute("height", String(ch));
		center.setAttribute("class", "vrv-cross vrv-cross-center");

		overlay.appendChild(barH);
		overlay.appendChild(barV);
		overlay.appendChild(center);
	}

	private clearHighlightOverlay() {
		const svgRoot = this.container?.querySelector("svg");
		if (!svgRoot) return;
		const overlay = svgRoot.querySelector("#vrv-hitboxes");
		if (!overlay) return;
		overlay.querySelector("#vrv-cross-h")?.remove();
		overlay.querySelector("#vrv-cross-v")?.remove();
		overlay.querySelector("#vrv-cross-center")?.remove();
	}

	private onSvgClick = (e: MouseEvent) => {
		const target = e.target as Element | null;
		console.log("[MEI] onSvgClick", { targetTag: target?.nodeName });
		if (!(target instanceof Element)) return;
		let el: Element | null = target;
		while (
			el &&
			el.nodeType === 1 &&
			!(
				el.hasAttribute("xml:id") ||
				el.hasAttribute("id") ||
				el.hasAttribute("data-xmlid")
			)
		) {
			el = el.parentElement;
		}
		let xmlId = (el?.getAttribute("data-xmlid") ||
			el?.getAttribute("xml:id") ||
			el?.getAttribute("id")) as string | null;
		if (!xmlId && el) {
			const host = el.closest("g[class*='id-']") as Element | null;
			const classAttr = host?.getAttribute("class");
			const m = classAttr?.match(/\bid-([A-Za-z0-9_-]+)/);
			if (m?.[1]) xmlId = m[1];
		}
		console.log("[MEI] onSvgClick resolved xmlId", { xmlId });
		if (xmlId) {
			e.preventDefault();
			e.stopPropagation();
			console.log("[MEI] posting elementClicked", { xmlId });
			getVSCode()?.postMessage({ type: "elementClicked", xmlId });
		}
	};

	private onSvgMouseMove = (e: MouseEvent) => {
		const target = e.target as Element | null;
		if (!target) return this.clearHoverBox();
		const rect =
			(target.closest &&
				(target.closest("#vrv-hitboxes rect") as SVGRectElement | null)) ||
			null;
		if (!rect) return this.clearHoverBox();
		this.drawHoverBox(rect);
	};

	private addHitboxes(svgRoot: SVGElement) {
		const old = svgRoot.querySelector("#vrv-hitboxes");
		old?.remove();
		const contentGroup =
			(svgRoot.querySelector("g.page") as SVGElement | null) ||
			(svgRoot.querySelector("g.page-margin") as SVGElement | null) ||
			svgRoot;
		const groups = Array.from(
			contentGroup.querySelectorAll("g[xml\\:id], g[id], g[class*='id-']"),
		);
		if (groups.length === 0) return;
		const withBoxes = groups
			.map((g) => {
				try {
					const bb = this.getBBoxInTargetSpace(
						g as unknown as SVGGraphicsElement,
						contentGroup as unknown as SVGGraphicsElement,
					) as DOMRect;
					const xmlIdAttr = g.getAttribute("xml:id") || g.getAttribute("id");
					let adj = bb as DOMRect;
					const cls = (g.getAttribute("class") || "").toLowerCase();
					const mId = cls.match(/\bid-([a-z0-9_-]+)/i);
					const classId = mId?.[1] ?? null;

					// Skip system/page breaks (sb/pb) to avoid creating hitboxes for them
					const idForTypeCheck = (xmlIdAttr || classId || "").toLowerCase();
					const isBreak =
						/\b(sb|pb)\b/.test(cls) ||
						/^(sb|pb)([-_]|\d|$)/.test(idForTypeCheck);
					if (isBreak) return null;

					// Special handling: use padded notehead bbox for notes
					if (cls.includes("note")) {
						const head = g.querySelector(
							"g.notehead, .notehead, [class*='notehead']",
						) as SVGGElement | null;
						if (head && typeof head.getBBox === "function") {
							const hb = this.getBBoxInTargetSpace(
								head as unknown as SVGGraphicsElement,
								contentGroup as unknown as SVGGraphicsElement,
							);
							const p = 12;
							adj = {
								x: hb.x - p,
								y: hb.y - p,
								width: hb.width + p * 2,
								height: hb.height + p * 2,
							} as unknown as DOMRect;
						}
					}

					// Special handling: stretch measure bbox to staff width
					if (cls.includes("measure")) {
						const staff = g.querySelector(
							"g.staff, .staff, [class*='staff']",
						) as SVGGElement | null;
						if (staff && typeof staff.getBBox === "function") {
							const sb = this.getBBoxInTargetSpace(
								staff as unknown as SVGGraphicsElement,
								contentGroup as unknown as SVGGraphicsElement,
							);
							adj = {
								x: sb.x,
								y: bb.y,
								width: sb.width,
								height: bb.height,
							} as unknown as DOMRect;
						}
					}

					return { g, bb: adj, xmlId: xmlIdAttr || classId };
				} catch {
					return null;
				}
			})
			.filter((x: unknown): x is { g: Element; bb: DOMRect; xmlId: string } => {
				if (!x || typeof x !== "object") return false;
				const o = x as { bb?: unknown; xmlId?: unknown };
				return typeof o.bb === "object" && typeof o.xmlId === "string";
			})
			.filter((x) => x?.xmlId);
		if (withBoxes.length === 0) return;
		withBoxes.sort((a, b) => {
			const aArea = Math.max(0, a.bb.width) * Math.max(0, a.bb.height);
			const bArea = Math.max(0, b.bb.width) * Math.max(0, b.bb.height);
			return bArea - aArea;
		});
		const overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
		overlay.setAttribute("id", "vrv-hitboxes");
		withBoxes.forEach(({ bb, xmlId }) => {
			const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			r.setAttribute("x", String(bb.x));
			r.setAttribute("y", String(bb.y));
			r.setAttribute("width", String(bb.width));
			r.setAttribute("height", String(bb.height));
			r.setAttribute("fill", "#000");
			r.setAttribute("fill-opacity", "0");
			r.setAttribute("stroke", "none");
			r.setAttribute("pointer-events", "all");
			(r as unknown as SVGRectElement).style.cursor = "crosshair";
			r.setAttribute("data-xmlid", xmlId || "");
			overlay.appendChild(r);
		});
		contentGroup.appendChild(overlay);
	}

	private drawHoverBox(hitbox: SVGRectElement) {
		const svgRoot = this.container?.querySelector("svg");
		if (!svgRoot) return;
		const overlay = svgRoot.querySelector(
			"#vrv-hitboxes",
		) as SVGGElement | null;
		if (!overlay) return;
		const x = Number(hitbox.getAttribute("x")) || 0;
		const y = Number(hitbox.getAttribute("y")) || 0;
		const w = Number(hitbox.getAttribute("width")) || 0;
		const h = Number(hitbox.getAttribute("height")) || 0;
		const pad = 80; // Align with vrv-cross-center logic default padding
		const cx = x - pad;
		const cy = y - pad;
		const cw = w + pad * 2;
		const ch = h + pad * 2;
		let hover = overlay.querySelector(
			"#vrv-hover-box",
		) as SVGRectElement | null;
		if (!hover) {
			hover = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			hover.setAttribute("id", "vrv-hover-box");
			hover.setAttribute("pointer-events", "none");
			overlay.appendChild(hover);
		}
		hover.setAttribute("x", String(cx));
		hover.setAttribute("y", String(cy));
		hover.setAttribute("width", String(cw));
		hover.setAttribute("height", String(ch));
		// Use inline styles (CSS properties) so they override any stylesheet rules
		// Also keep stroke width stable regardless of page transforms
		(hover as unknown as SVGGraphicsElement).style.fill = "none";
		(hover as unknown as SVGGraphicsElement).style.stroke = "#2BD1E4";
		(hover as unknown as SVGGraphicsElement).style.strokeWidth = "1.6px";
		(hover as unknown as SVGGraphicsElement).style.mixBlendMode = "multiply";
		(hover as unknown as SVGGraphicsElement).style.vectorEffect =
			"non-scaling-stroke";
	}

	private clearHoverBox() {
		const svgRoot = this.container?.querySelector("svg");
		if (!svgRoot) return;
		const overlay = svgRoot.querySelector("#vrv-hitboxes");
		if (!overlay) return;
		overlay.querySelector("#vrv-hover-box")?.remove();
	}

	private getBBoxInTargetSpace(
		el: SVGGraphicsElement,
		target: SVGGraphicsElement | null,
	): { x: number; y: number; width: number; height: number } {
		const local = el.getBBox();
		const elCTMGetter = (el as unknown as { getCTM?: () => DOMMatrix }).getCTM;
		const elCTM =
			typeof elCTMGetter === "function"
				? (elCTMGetter.call(el) as DOMMatrix)
				: null;
		const targetCTMGetter = (
			target as unknown as { getCTM?: () => DOMMatrix } | null
		)?.getCTM;
		const targetCTM =
			typeof targetCTMGetter === "function"
				? (targetCTMGetter.call(target) as DOMMatrix)
				: null;
		const hasInverse = !!(
			targetCTM &&
			(targetCTM as unknown as { inverse?: () => DOMMatrix }).inverse
		);
		if (!elCTM || !targetCTM || !hasInverse) {
			return {
				x: local.x,
				y: local.y,
				width: local.width,
				height: local.height,
			};
		}
		const toTarget = (
			(
				targetCTM as unknown as { inverse: () => DOMMatrix }
			).inverse() as DOMMatrix
		).multiply(elCTM as DOMMatrix) as DOMMatrix;
		const corners = [
			new DOMPoint(local.x, local.y).matrixTransform(toTarget),
			new DOMPoint(local.x + local.width, local.y).matrixTransform(toTarget),
			new DOMPoint(local.x, local.y + local.height).matrixTransform(toTarget),
			new DOMPoint(
				local.x + local.width,
				local.y + local.height,
			).matrixTransform(toTarget),
		];
		const xs = corners.map((p) => p.x);
		const ys = corners.map((p) => p.y);
		const x = Math.min.apply(null, xs as unknown as number[]);
		const y = Math.min.apply(null, ys as unknown as number[]);
		const maxX = Math.max.apply(null, xs as unknown as number[]);
		const maxY = Math.max.apply(null, ys as unknown as number[]);
		return { x, y, width: maxX - x, height: maxY - y };
	}

	private ensureDynamicStyle(yOffset: number) {
		const nonce = getNonce();
		let styleEl = document.getElementById(
			"vrv-dynamic-style",
		) as HTMLStyleElement | null;
		if (!styleEl) {
			styleEl = document.createElement("style");
			styleEl.id = "vrv-dynamic-style";
			if (nonce) styleEl.setAttribute("nonce", nonce);
			document.head.appendChild(styleEl);
		}
		const invert = "";
		styleEl.textContent = `
			.vrv-root { transform: translateY(${yOffset}px); ${invert} }
			svg.vrv-root { cursor: crosshair; }
			.vrv-cross { fill: var(--vscode-editor-selectionBackground); fill-opacity: 0.12; stroke: none; mix-blend-mode: multiply; }
			.vrv-cross-center { fill: #2BD1E4; fill-opacity: 0.6; stroke: none; mix-blend-mode: multiply; }
		`;
	}
}

function getNonce(): string | undefined {
	try {
		return (window as unknown as { __NONCE__?: string }).__NONCE__;
	} catch {
		return undefined;
	}
}
