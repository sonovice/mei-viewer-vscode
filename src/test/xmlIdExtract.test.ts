import * as assert from "node:assert";
import { getXmlIdAtOffset } from "../provider/MeiPreviewProvider";

suite("getXmlIdAtOffset", () => {
	test("extracts xml:id with double quotes", () => {
		const xml = '<note xml:id="n1"/>';
		assert.strictEqual(getXmlIdAtOffset(xml, xml.indexOf("n1")), "n1");
	});

	test("extracts xml:id with single quotes", () => {
		const xml = "<note xml:id='n2'/>";
		assert.strictEqual(getXmlIdAtOffset(xml, xml.indexOf("n2")), "n2");
	});

	test("falls back to id attribute", () => {
		const xml = '<note id="n3"/>';
		assert.strictEqual(getXmlIdAtOffset(xml, xml.indexOf("n3")), "n3");
	});

	test("resolves closing tag by matching last opening tag", () => {
		const xml = '<note xml:id="n4"></note>';
		const offset = xml.indexOf("</note>") + 2;
		assert.strictEqual(getXmlIdAtOffset(xml, offset), "n4");
	});

	test("returns undefined when no id present", () => {
		const xml = '<note dur="4"></note>';
		assert.strictEqual(getXmlIdAtOffset(xml, xml.indexOf("note")), undefined);
	});
});
