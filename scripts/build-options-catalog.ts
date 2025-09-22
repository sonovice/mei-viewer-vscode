import fs from "node:fs";
import path from "node:path";

type Entry = {
	name: string;
	doc: string;
	meta: { default?: string; min?: string; max?: string };
};

function sanitizeBlockDoc(blockDoc: string): string {
	let cleaned = blockDoc;
	// Normalize nested comment delimiters that sometimes appear in block content
	cleaned = cleaned.replace(/\*\/\s*\/\*\*/g, "\n\n");
	cleaned = cleaned.replace(/\/\*\*+/g, "");
	cleaned = cleaned.replace(/\*\/+?/g, "");
	return cleaned;
}

function formatDocLines(raw: string): string[] {
	const lines = raw.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim());
	const out: string[] = [];
	for (const l of lines) {
		if (!l) {
			out.push("");
			continue;
		}
		// Skip meta lines like default:/min:/max:
		if (/^(default|min|max)\s*:/i.test(l)) continue;
		out.push(l);
		// Insert a blank line after banner-ish lines
		if (/(\*{5,}|={5,}|-{5,})/.test(l) || /\boptions\b/i.test(l)) {
			out.push("");
		}
	}
	// Trim trailing empties
	while (out.length && out[out.length - 1] === "") out.pop();
	return out;
}

function parseCatalog(dtsText: string): Entry[] {
	const entries: Entry[] = [];
	const re = /\/\*\*([\s\S]*?)\*\/\s*([a-zA-Z0-9_]+)\?:/g;
	while (true) {
		const m = re.exec(dtsText);
		if (!m) break;
		const blockDoc = sanitizeBlockDoc(m[1]);
		const name = m[2];
		const docLines = formatDocLines(blockDoc);
		const doc = docLines.join("\n").trim();
		const meta: Entry["meta"] = {};
		const def = blockDoc.match(/default:\s*([^\n*]+)/i);
		const min = blockDoc.match(/min:\s*([^\n*]+)/i);
		const max = blockDoc.match(/max:\s*([^\n*]+)/i);
		if (def) meta.default = def[1].trim();
		if (min) meta.min = min[1].trim();
		if (max) meta.max = max[1].trim();
		entries.push({ name, doc, meta });
	}
	return entries;
}

function main(): void {
	const repoRoot = process.cwd();
	const dtsPath = path.join(
		repoRoot,
		"node_modules",
		"@types",
		"verovio",
		"VerovioOptions.d.ts",
	);
	let dtsText = "";
	try {
		dtsText = fs.readFileSync(dtsPath, "utf8");
	} catch {
		console.warn("[build-options-catalog] Could not read VerovioOptions.d.ts");
		return;
	}
	const entries = parseCatalog(dtsText).filter((e) => e && e.name);
	const outDir = path.join(repoRoot, "dist", "host");
	fs.mkdirSync(outDir, { recursive: true });
	const outFile = path.join(outDir, "options-catalog.json");
	fs.writeFileSync(outFile, JSON.stringify(entries, null, 2), "utf8");
	console.log(
		`[build-options-catalog] Wrote ${entries.length} entries to ${outFile}`,
	);
}

main();
