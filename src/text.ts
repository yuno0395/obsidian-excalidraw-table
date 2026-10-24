// Table <-> text: reading pasted text, writing Markdown / tab-separated text, sizing columns for text.
// Pure functions (tested in test/text.test.ts).

import { Align, PAD } from "./model";
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

// CSV (RFC 4180): fields with a comma, quote or line break are quoted; lines end with CRLF (what Excel expects)
export function toCsv(cells: (string | null)[][]): string {
  const q = (s: string | null) => {
    const v = (s ?? "").replace(/<br>/g, "\n");
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return cells.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

// ---------- HTML table, for pasting into Excel, PowerPoint, Word, Google Sheets... ----------
export type ExportCell = { r: number; c: number; rs: number; cs: number; text: string; bg?: string; color?: string; align?: Align };
export interface ExportTable { nR: number; nC: number; cols: number[]; stroke: string; fontSize: number; cells: ExportCell[] }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Merged cells become colspan / rowspan; colours, alignment and column widths are kept; a line break stays inside its cell
// (Excel needs the mso style on <br> for that).
export function toHtml(T: ExportTable): string {
  const byRow = new Map<number, ExportCell[]>();
  for (const c of T.cells) { if (!byRow.has(c.r)) byRow.set(c.r, []); byRow.get(c.r)!.push(c); }
  const fs = Math.max(1, Math.round(T.fontSize * 0.75 * 10) / 10);   // px -> pt
  const rows: string[] = [];
  for (let r = 0; r < T.nR; r++) {
    const tds = (byRow.get(r) || []).sort((a, b) => a.c - b.c).map((c) => {
      const style = [
        `border:1px solid ${T.stroke}`, "padding:3pt 6pt", "vertical-align:top", `font-size:${fs}pt`,
        c.bg && c.bg !== "transparent" ? `background:${c.bg}` : "", c.color ? `color:${c.color}` : "", c.align ? `text-align:${c.align}` : "",
      ].filter(Boolean).join(";");
      const span = (c.cs > 1 ? ` colspan="${c.cs}"` : "") + (c.rs > 1 ? ` rowspan="${c.rs}"` : "");
      const body = c.text.split("\n").map(esc).join('<br style="mso-data-placement:same-cell;">');
      return `<td${span} style="${style}">${body}</td>`;
    });
    rows.push(`<tr>${tds.join("")}</tr>`);
  }
  const cols = T.cols.map((w) => `<col style="width:${Math.round(w)}px">`).join("");
  return `<html><head><meta charset="utf-8"></head><body><table style="border-collapse:collapse">${cols}${rows.join("")}</table></body></html>`;
}
