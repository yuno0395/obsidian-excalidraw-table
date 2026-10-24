import { test } from "node:test";
import * as assert from "node:assert/strict";
import { toCsv, toHtml } from "../src/text";

test("CSV quotes commas, quotes and line breaks; CRLF lines", () => {
  const csv = toCsv([["項目", "値"], ["a,b", 'say "hi"'], ["x<br>y", null]]);
  assert.equal(csv, '項目,値\r\n"a,b","say ""hi"""\r\n"x\ny",\r\n');
});

test("HTML keeps merges, colours, alignment and line breaks inside a cell", () => {
  const html = toHtml({
    nR: 2, nC: 2, cols: [100, 120], stroke: "#0c5a9e", fontSize: 16,
    cells: [
      { r: 0, c: 0, rs: 1, cs: 2, text: "Head <1>", bg: "#1971c2", color: "#ffffff", align: "center" },
      { r: 1, c: 0, rs: 1, cs: 1, text: "a\nb", bg: "#e8f1f9", color: "#1e1e1e", align: "left" },
      { r: 1, c: 1, rs: 1, cs: 1, text: "", bg: "transparent" },
    ],
  });
  assert.match(html, /<td colspan="2" style="[^"]*background:#1971c2;color:#ffffff;text-align:center">Head &lt;1&gt;<\/td>/);
  assert.match(html, />a<br style="mso-data-placement:same-cell;">b<\/td>/);
  assert.match(html, /border:1px solid #0c5a9e/);
  assert.match(html, /<col style="width:100px"><col style="width:120px">/);
  assert.equal((html.match(/<tr>/g) || []).length, 2);
  assert.ok(!/background:transparent/.test(html));
});

test("HTML: a see-through fill is given as it looks on white; no fill is left out", () => {
  const html = toHtml({ nR: 1, nC: 2, cols: [80, 80], stroke: "#000000", fontSize: 16, cells: [
    { r: 0, c: 0, rs: 1, cs: 1, text: "half", bg: "#00000080" },
    { r: 0, c: 1, rs: 1, cs: 1, text: "none", bg: "#ffffff01" },
  ] });
  assert.match(html, /background:#7f7f7f">half/);
  assert.match(html, /font-size:12pt">none/);
});
