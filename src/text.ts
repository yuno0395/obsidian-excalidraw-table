// Table <-> text: reading pasted text, writing Markdown / tab-separated text, sizing columns for text.
// Pure functions (tested in test/text.test.ts).

import { PAD } from "./model";
import { maxOf } from "./util";

// Tab-separated text (Excel, Google Sheets, Numbers) or a Markdown table -> rows of cell texts (all rows the same length).
// Anything else -> null, so an ordinary paste stays ordinary.
export function parseTable(text: string): string[][] | null {
  if (!text) return null;
  const t = text.replace(/\r\n?/g, "\n").replace(/^\n+/, "").replace(/\n+$/, "");
  const lines = t.split("\n");
  const sep = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  let rows: string[][] | null = null;
  if (lines.length >= 2 && lines[0].includes("|") && sep.test(lines[1])) {
    rows = lines.filter((l, i) => i !== 1 && l.trim()).map(splitMd).map((r) => r.map((c) => c.replace(/<br\s*\/?>/gi, "\n")));
  } else if (t.includes("\t")) {
    rows = parseTsv(t);
  }
  if (!rows || !rows.length) return null;
  const n = maxOf(rows.map((r) => r.length));
  if (n < 2 && rows.length < 2) return null;
  return rows.map((r) => (r.length < n ? [...r, ...Array(n - r.length).fill("")] : r));
}

function splitMd(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
    if (s[i] === "|") { out.push(cur.trim()); cur = ""; continue; }
    cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

// TSV with spreadsheet quoting: a cell holding a line break, tab or quote is "quoted", and "" is a quote inside it
function parseTsv(t: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false, start = true;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
      continue;
    }
    if (ch === '"' && start) { q = true; start = false; continue; }
    start = false;
    if (ch === "\t") { row.push(cur); cur = ""; start = true; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; start = true; }
    else cur += ch;
  }
  row.push(cur); rows.push(row);
  return rows;
}

// cells as stored in the model: line breaks as <br>, covered cells of a merge as null
export function toMarkdown(cells: (string | null)[][]): string {
  if (!cells.length) return "";
  const esc = (s: string | null) => (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const lines = cells.map((r) => "| " + r.map(esc).join(" | ") + " |");
  lines.splice(1, 0, "| " + cells[0].map(() => "---").join(" | ") + " |");
  return lines.join("\n");
}

export function toTsv(cells: (string | null)[][]): string {
  const q = (s: string | null) => {
    const v = (s ?? "").replace(/<br>/g, "\n");
    return /[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return cells.map((r) => r.map(q).join("\t")).join("\n");
}

// Rough width of a line of text: CJK and full-width forms count as one font size, everything else as 0.6.
// (Half-width katakana U+FF61-FF9F is narrow, so it is left out of the wide ranges.)
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹏！-｠￠-￦]/;
export function textWidth(line: string, fontSize: number): number {
  let w = 0;
  for (const ch of line) w += WIDE.test(ch) ? 1 : 0.6;
  return w * fontSize;
}

// column widths for pasted text: wide enough for the longest line, within limits
export function fitColumns(rows: string[][], nC: number, fontSize: number, colWidth: number): number[] {
  const hi = Math.max(colWidth * 2, 320);
  return Array.from({ length: nC }, (_, c) => {
    let w = 0;
    for (const r of rows) for (const line of (r[c] || "").split("\n")) w = Math.max(w, textWidth(line, fontSize));
    return Math.round(Math.min(Math.max(w + 2 * PAD + 4, 80), hi));
  });
}
