import { test } from "node:test";
import * as assert from "node:assert/strict";
import { fitColumns, parseTable, textWidth, toMarkdown, toTsv } from "../src/text";

test("Excel / spreadsheet text", () => {
  assert.deepEqual(parseTable("項目\t値\r\nA\t1\r\nB\t2\r\n"), [["項目", "値"], ["A", "1"], ["B", "2"]]);
  assert.deepEqual(parseTable('a\t"x\ny"\nb\t"say ""hi"""\n'), [["a", "x\ny"], ["b", 'say "hi"']]);
  assert.deepEqual(parseTable("a\tb\tc\nd\n"), [["a", "b", "c"], ["d", "", ""]]);
});

test("Markdown tables, also after blank lines", () => {
  assert.deepEqual(parseTable("| h1 | h2 |\n|---|:--:|\n| a\\|b | x<br>y |\n"), [["h1", "h2"], ["a|b", "x\ny"]]);
  assert.deepEqual(parseTable("\n\n| a | b |\n| --- | --- |\n| 1 | 2 |"), [["a", "b"], ["1", "2"]]);
});

test("ordinary text is not a table", () => {
  assert.equal(parseTable("hello world\nsecond line"), null);
  assert.equal(parseTable("lonely"), null);
  assert.equal(parseTable(""), null);
});

test("a very long paste does not overflow the stack", () => {
  const rows = parseTable(Array.from({ length: 200000 }, (_, i) => `r${i}\tv`).join("\n"));
  assert.equal(rows?.length, 200000);
  assert.equal(fitColumns(rows!, 2, 16, 160).length, 2);
});

test("copy as Markdown / TSV and back", () => {
  const cells = [["Item", "Note"], ["a|b", "x<br>y"], [null, "![[img.png]]"]];
  assert.equal(toMarkdown(cells), "| Item | Note |\n| --- | --- |\n| a\\|b | x<br>y |\n|  | ![[img.png]] |");
  assert.equal(toTsv(cells), 'Item\tNote\na|b\t"x\ny"\n\t![[img.png]]');
  const back = [["Item", "Note"], ["a|b", "x\ny"], ["", "![[img.png]]"]];
  assert.deepEqual(parseTable(toTsv(cells)), back);
  assert.deepEqual(parseTable(toMarkdown(cells)), back);
  assert.equal(toMarkdown([]), "");
});

test("text width: CJK wide, half-width katakana narrow", () => {
  assert.equal(textWidth("漢字", 10), 20);
  assert.equal(textWidth("ab", 10), 12);
  assert.equal(textWidth("ｱｲ", 10), 12);
  assert.equal(textWidth("ＡＢ", 10), 20);
});

test("fitted columns stay within limits", () => {
  const w = fitColumns([["x", "とても長い文字列がここに入ります".repeat(5)]], 2, 16, 160);
  assert.equal(w[0], 80);
  assert.equal(w[1], 320);
});
