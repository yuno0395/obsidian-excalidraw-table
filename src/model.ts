// The table model and the structure operations (add / delete rows and columns, merge).
// Pure functions: no Obsidian, no Excalidraw, so they can be tested on their own (test/model.test.ts).
//
// Data kept in Excalidraw element customData:
//   cell rectangle : customData.exTable      = { id, r, c, rs, cs, al }   (rs/cs = merged rows/columns, al = text alignment)
//   top-left cell  : customData.exTableModel = Model (below)
//   image in a cell: customData.exTable      = { id, r, c, img }          (img = vault path of the image)
//   text in a cell : customData.exTableText  = true                       (alignment already set up)

import { maxOf, minOf } from "./util";

export const CELL = "exTable", MODEL = "exTableModel", TEXT = "exTableText";
export const PAD = 8, GAP = 6, MINH = 36, MINW = 40;
export const MAX_SIZE = 100;   // most rows / columns the insert dialog accepts

export type Align = "left" | "center" | "right";
export type Anchor = { r: number; c: number; rs: number; cs: number };   // a cell: top-left position and span
export type Merge = Anchor;
// text / headerText: text colour in body / header cells (tables made before themes: the line colour)
export type Colors = { header: string; cell: string; stroke: string; text?: string; headerText?: string };

export interface Model {
  id: string;
  nR: number; nC: number;
  fs: number;                 // font size
  base?: number;              // font size the table was made with: spacing (padding, minimum sizes) scales with fs / base
  header?: boolean;           // first row shaded (undefined = true, for tables made before the flag)
  headerCol?: boolean;        // first column shaded
  colors?: Colors;            // colours the table was made with (later tables follow the settings, this one keeps its own)
  cols: number[];             // column widths
  rowMin: number[];           // row heights the user dragged (0 = follow the content)
  rowH: number[];             // row heights as laid out
  merges: Merge[];
  cells?: (string | null)[][];   // copy of the content as text, for other tools (see snapshot in table.ts)
  imgs?: Record<string, { x: number; y: number; width: number; height: number }>;
}

// what a cell holds while the table is rebuilt
// fr: the cell's font size as a ratio to the table's (1 = the table's size), so it scales with the table
export type Cell = { text: string; imgs: string[]; bg?: string; al?: Align; fr?: number };
export type Content = Record<string, Cell>;
export type OpResult = { M: Model; content: Content; focus?: { r: number; c: number } };
export type Op = (M: Model, content: Content, sel: Anchor[]) => OpResult;
export type OpName = "addRow" | "addRowAbove" | "addCol" | "addColLeft" | "delRow" | "delCol" | "merge" | "unmerge" | "toggleHeaderRow" | "toggleHeaderCol";

export class TableError extends Error {}

export const key = (r: number, c: number) => r + "," + c;
export const sum = (a: number[], i: number, n: number) => { let s = 0; for (let k = i; k < i + n; k++) s += a[k] ?? 0; return s; };
export const isHeader = (M: Model, r: number, c: number) => (r === 0 && M.header !== false) || (c === 0 && !!M.headerCol);

// Spacing grows and shrinks with the font, so a table scaled down keeps its proportions (and has no lower limit).
export const unit = (M: Pick<Model, "fs" | "base">) => M.fs / (M.base || M.fs);
export const pad = (M: Pick<Model, "fs" | "base">) => PAD * unit(M);
export const gap = (M: Pick<Model, "fs" | "base">) => GAP * unit(M);
export const minH = (M: Pick<Model, "fs" | "base">) => MINH * unit(M);
export const minW = (M: Pick<Model, "fs" | "base">) => MINW * unit(M);

// Scale the whole table: widths by sx, heights by sy. The font (and with it all spacing) scales by the smaller of the two,
// so making the table narrower or lower shrinks the text to fit, and stretching it one way keeps the text as it is.
// A row taller than its content (dragged, or stretched more than the font) keeps that height; other rows follow the content.
export function scaleModel(M: Model, sx: number, sy: number) {
  const k = Math.min(sx, sy);
  if (!M.base) M.base = M.fs;
  M.fs = M.fs * k;
  M.cols = M.cols.map((w) => w * sx);
  M.rowMin = M.rowH.map((h, i) => ((M.rowMin[i] || 0) > 0 || sy > k * (1 + 1e-6) ? h * sy : 0));
  M.rowH = M.rowH.map((h) => h * sy);
  return k;
}

// ---------- cells, taking merges into account ----------
// Every visible cell, in reading order (row by row, left to right).
export function anchors(M: Pick<Model, "nR" | "nC" | "merges">): Anchor[] {
  const cov = new Set<string>(), start = new Map<string, Merge>(), out: Anchor[] = [];
  for (const m of M.merges || []) {
    start.set(key(m.r, m.c), m);
    for (let i = m.r; i < m.r + m.rs; i++) for (let j = m.c; j < m.c + m.cs; j++) if (i !== m.r || j !== m.c) cov.add(key(i, j));
  }
  for (let i = 0; i < M.nR; i++) for (let j = 0; j < M.nC; j++) {
    if (cov.has(key(i, j))) continue;
    const m = start.get(key(i, j));
    out.push({ r: i, c: j, rs: m ? m.rs : 1, cs: m ? m.cs : 1 });
  }
  return out;
}

// the cell that covers row r, column c
export function cellAt(M: Pick<Model, "nR" | "nC" | "merges">, r: number, c: number): Anchor | undefined {
  if (r < 0 || c < 0 || r >= M.nR || c >= M.nC) return undefined;
  const m = (M.merges || []).find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs);
  return m ? { ...m } : { r, c, rs: 1, cs: 1 };
}

export function remap(content: Content, f: (r: number, c: number) => number[] | null): Content {
  const out: Content = {};
  for (const [k, v] of Object.entries(content)) {
    const [r, c] = k.split(",").map(Number), n = f(r, c);
    if (n) out[key(n[0], n[1])] = v;
  }
  return out;
}

// all rows / columns a selection covers (a merged cell covers several)
const rowsOf = (sel: Anchor[]) => [...new Set(sel.flatMap((s) => Array.from({ length: s.rs }, (_, i) => s.r + i)))];
const colsOf = (sel: Anchor[]) => [...new Set(sel.flatMap((s) => Array.from({ length: s.cs }, (_, i) => s.c + i)))];

function insRow(M: Model, content: Content, at: number) {
  M.nR++; M.rowMin.splice(at, 0, 0); M.rowH.splice(at, 0, minH(M));
  for (const m of M.merges) { if (m.r >= at) m.r++; else if (m.r + m.rs > at) m.rs++; }
  return remap(content, (r, c) => [r >= at ? r + 1 : r, c]);
}
function insCol(M: Model, content: Content, at: number, width: number) {
  M.nC++; M.cols.splice(at, 0, width);
  for (const m of M.merges) { if (m.c >= at) m.c++; else if (m.c + m.cs > at) m.cs++; }
  return remap(content, (r, c) => [r, c >= at ? c + 1 : c]);
}
// Delete row `at`. The content of a merged cell that starts on this row moves down with the merge.
function delRowAt(M: Model, content: Content, at: number) {
  M.nR--; M.rowMin.splice(at, 1); M.rowH.splice(at, 1);
  const keep = new Set(M.merges.filter((m) => m.r === at && m.rs > 1).map((m) => m.c));
  for (const m of M.merges) { if (m.r > at) m.r--; else if (m.r + m.rs > at) m.rs--; }
  M.merges = M.merges.filter((m) => m.rs > 0 && (m.rs > 1 || m.cs > 1));
  return remap(content, (r, c) => (r < at ? [r, c] : r > at ? [r - 1, c] : keep.has(c) ? [r, c] : null));
}
function delColAt(M: Model, content: Content, at: number) {
  M.nC--; M.cols.splice(at, 1);
  const keep = new Set(M.merges.filter((m) => m.c === at && m.cs > 1).map((m) => m.r));
  for (const m of M.merges) { if (m.c > at) m.c--; else if (m.c + m.cs > at) m.cs--; }
  M.merges = M.merges.filter((m) => m.cs > 0 && (m.rs > 1 || m.cs > 1));
  return remap(content, (r, c) => (c < at ? [r, c] : c > at ? [r, c - 1] : keep.has(r) ? [r, c] : null));
}

// The structure operations. Each takes the model and content (both may be changed) and the selected cells,
// and says which cell to select afterwards.
export function structureOps(colWidth: () => number, msg: (k: string) => string): Record<OpName, Op> {
  const left = (sel: Anchor[]) => minOf(sel.map((s) => s.c)), top = (sel: Anchor[]) => minOf(sel.map((s) => s.r));
  return {
    addRow: (M, content, sel) => {
      const at = maxOf(sel.map((s) => s.r + s.rs));
      return { M, content: insRow(M, content, at), focus: { r: at, c: left(sel) } };
    },
    addRowAbove: (M, content, sel) => {
      const at = top(sel);
      return { M, content: insRow(M, content, at), focus: { r: at, c: left(sel) } };
    },
    addCol: (M, content, sel) => {
      const at = maxOf(sel.map((s) => s.c + s.cs));
      return { M, content: insCol(M, content, at, colWidth() * unit(M)), focus: { r: top(sel), c: at } };
    },
    addColLeft: (M, content, sel) => {
      const at = left(sel);
      return { M, content: insCol(M, content, at, colWidth() * unit(M)), focus: { r: top(sel), c: at } };
    },
    // every row the selection covers goes (all rows of a merged cell); the last row is never deleted
    delRow: (M, content, sel) => {
      const rows = rowsOf(sel).sort((a, b) => b - a);
      for (const at of rows) { if (M.nR <= 1) break; content = delRowAt(M, content, at); }
      return { M, content, focus: { r: minOf(rows), c: left(sel) } };
    },
    delCol: (M, content, sel) => {
      const cols = colsOf(sel).sort((a, b) => b - a);
      for (const at of cols) { if (M.nC <= 1) break; content = delColAt(M, content, at); }
      return { M, content, focus: { r: top(sel), c: minOf(cols) } };
    },
    // the selection, grown to cover any merged cell it only partly covers, becomes one cell;
    // texts are joined with line breaks, images are kept, colour and alignment come from the first cell that has them
    merge: (M, content, sel) => {
      if (sel.length < 2) throw new TableError(msg("selectTwo"));
      let r0 = minOf(sel.map((s) => s.r)), c0 = minOf(sel.map((s) => s.c));
      let r1 = maxOf(sel.map((s) => s.r + s.rs - 1)), c1 = maxOf(sel.map((s) => s.c + s.cs - 1));
      for (let grow = true; grow;) {
        grow = false;
        for (const m of M.merges) {
          const over = !(m.r > r1 || m.r + m.rs - 1 < r0 || m.c > c1 || m.c + m.cs - 1 < c0);
          if (over && (m.r < r0 || m.c < c0 || m.r + m.rs - 1 > r1 || m.c + m.cs - 1 > c1)) {
            r0 = Math.min(r0, m.r); c0 = Math.min(c0, m.c); r1 = Math.max(r1, m.r + m.rs - 1); c1 = Math.max(c1, m.c + m.cs - 1); grow = true;
          }
        }
      }
      M.merges = M.merges.filter((m) => m.r > r1 || m.r + m.rs - 1 < r0 || m.c > c1 || m.c + m.cs - 1 < c0);
      M.merges.push({ r: r0, c: c0, rs: r1 - r0 + 1, cs: c1 - c0 + 1 });
      const texts: string[] = [], imgs: string[] = [];
      let bg: string | undefined, al: Align | undefined, fr: number | undefined;
      for (let i = r0; i <= r1; i++) for (let j = c0; j <= c1; j++) {
        const v = content[key(i, j)]; if (!v) continue;
        if (v.text) texts.push(v.text);
        imgs.push(...(v.imgs || []));
        if (bg === undefined) bg = v.bg;
        if (al === undefined) al = v.al;
        if (fr === undefined) fr = v.fr;
        delete content[key(i, j)];
      }
      content[key(r0, c0)] = { text: texts.join("\n"), imgs, bg, al, fr };
      return { M, content, focus: { r: r0, c: c0 } };
    },
    // the content stays in the top-left cell
    unmerge: (M, content, sel) => {
      const at = new Set(sel.map((s) => key(s.r, s.c)));
      const n = M.merges.length;
      M.merges = M.merges.filter((m) => !at.has(key(m.r, m.c)));
      if (M.merges.length === n) throw new TableError(msg("selectMerged"));
      return { M, content };
    },
    toggleHeaderRow: (M, content) => { M.header = M.header === false; return { M, content }; },
    toggleHeaderCol: (M, content) => { M.headerCol = !M.headerCol; return { M, content }; },
  };
}
