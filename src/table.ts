// Tables on the Excalidraw canvas.
//
// A table is a group of cell rectangles (text is bound inside each rectangle) plus images placed in cells.
// Data kept in element customData:
//   cell rectangle : customData.exTable      = { id, r, c, rs, cs, al }   (rs/cs = merged rows/columns, al = text alignment)
//   top-left cell  : customData.exTableModel = { id, nR, nC, fs, header, headerCol, cols[], rowMin[], rowH[], merges[], cells[][], imgs{} }
//   image in a cell: customData.exTable      = { id, r, c, img }      (img = vault path of the image)
//   text in a cell : customData.exTableText  = true                   (alignment already set)
// `cells` is a copy of the content as text (line breaks as <br>, images as ![[path]], covered cells of a merge as null),
// so other tools can read the table without reconstructing it from the drawing.

export interface TableSettings {
  colWidth: number;
  fontSize: number;
  headerColor: string;
  cellColor: string;
  strokeColor: string;
  pasteAsTable: boolean;
}

export const DEFAULT_SETTINGS: TableSettings = {
  colWidth: 160,
  fontSize: 16,
  headerColor: "#e9ecef",
  cellColor: "#ffffff",
  strokeColor: "#495057",
  pasteAsTable: true,
};

const PAD = 8, GAP = 6, MINH = 36, MINW = 40;
const CELL = "exTable", MODEL = "exTableModel", TEXT = "exTableText";

export type Anchor = { r: number; c: number; rs: number; cs: number };
export type Align = "left" | "center" | "right";
type Cell = { text: string; imgs: string[]; bg?: string; al?: Align };
type Content = Record<string, Cell>;
type OpResult = { M: any; content: Content; focus?: { r: number; c: number } };
type Op = (M: any, content: Content, sel: Anchor[]) => OpResult;

const rnd = () => Math.floor(Math.random() * 2 ** 31);
const upd = (e: any, p: any) => ({ ...e, ...p, version: (e.version || 1) + 1, versionNonce: rnd(), updated: Date.now() });
const sum = (a: number[], i: number, n: number) => a.slice(i, i + n).reduce((x, y) => x + y, 0);
const key = (r: number, c: number) => r + "," + c;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TableError extends Error {}

// ---------- cells, taking merges into account ----------
export function anchors(M: any): Anchor[] {
  const cov = new Set<string>(), mg = M.merges || [], out: Anchor[] = [];
  for (const m of mg) for (let i = m.r; i < m.r + m.rs; i++) for (let j = m.c; j < m.c + m.cs; j++) if (i !== m.r || j !== m.c) cov.add(key(i, j));
  for (let i = 0; i < M.nR; i++) for (let j = 0; j < M.nC; j++) {
    if (cov.has(key(i, j))) continue;
    const m = mg.find((m: any) => m.r === i && m.c === j);
    out.push({ r: i, c: j, rs: m ? m.rs : 1, cs: m ? m.cs : 1 });
  }
  return out;
}
// the cell (anchor) that covers row r, column c
export function cellAt(M: any, r: number, c: number): Anchor | undefined {
  return anchors(M).find((a) => r >= a.r && r < a.r + a.rs && c >= a.c && c < a.c + a.cs);
}

// ---------- reading the scene ----------
function parts(api: any, T: string) {
  const els = api.getSceneElements();
  const rects = els.filter((e: any) => e.type === "rectangle" && e.customData?.[CELL]?.id === T);
  const imgs = els.filter((e: any) => e.type === "image" && e.customData?.[CELL]?.id === T);
  const head = rects.find((e: any) => e.customData[CELL].r === 0 && e.customData[CELL].c === 0);
  const bound = (r: any) => els.find((e: any) => e.type === "text" && e.containerId === r.id);
  const rectAt = (r: number, c: number) => rects.find((e: any) => e.customData[CELL].r === r && e.customData[CELL].c === c);
  const imgsAt = (r: number, c: number) =>
    imgs.filter((e: any) => e.customData[CELL].r === r && e.customData[CELL].c === c).sort((a: any, b: any) => a.y - b.y);
  return { els, rects, imgs, head, bound, rectAt, imgsAt };
}
export const tablesIn = (api: any): string[] =>
  [...new Set<string>(api.getSceneElements().filter((e: any) => e.customData?.[MODEL]).map((e: any) => e.customData[CELL].id))];
const textOf = (b: any) => (b ? b.originalText ?? b.text ?? "" : "");
// alignment of a cell: the text's own alignment once the plugin has set it up (so a change in Excalidraw's panel is kept)
const alignOf = (e: any, b: any): Align => (b?.customData?.[TEXT] ? b.textAlign : e?.customData?.[CELL]?.al) || "left";

function snapshot(P: any, M: any) {
  const cells = Array.from({ length: M.nR }, () => Array(M.nC).fill(null));
  for (const a of anchors(M)) {
    const e = P.rectAt(a.r, a.c);
    cells[a.r][a.c] = [textOf(e && P.bound(e)).replace(/\n/g, "<br>"), ...P.imgsAt(a.r, a.c).map((x: any) => `![[${x.customData[CELL].img || ""}]]`)]
      .filter(Boolean).join(" ");
  }
  return cells;
}
function fileLink(view: any, im: any): string {
  try {
    const f = view.excalidrawData?.getFile?.(im.fileId);
    return f?.file?.path || f?.linkParts?.original || f?.hyperlink || "";
  } catch { return ""; }
}
export function selectedCells(api: any) {
  const sel = api.getAppState().selectedElementIds || {}, els = api.getSceneElements(), out: any[] = [];
  for (const id of Object.keys(sel)) {
    let e = els.find((x: any) => x.id === id); if (!e) continue;
    if (e.containerId) e = els.find((x: any) => x.id === e.containerId);
    if (e?.type === "rectangle" && e?.customData?.[CELL]) out.push(e.customData[CELL]);
  }
  const T = out[0]?.id;
  return { T, cells: out.filter((n) => n.id === T) };
}
// the table model, as last laid out
export function modelOf(api: any, T: string) {
  return parts(api, T).head?.customData?.[MODEL];
}

// ---------- clipboard text -> rows of cells ----------
// Tab-separated text (Excel, Google Sheets, Numbers) or a Markdown table. Returns null for anything else.
export function parseTable(text: string): string[][] | null {
  if (!text) return null;
  const t = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const lines = t.split("\n");
  const sep = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  let rows: string[][] | null = null;
  if (lines.length >= 2 && lines[0].includes("|") && sep.test(lines[1])) {
    rows = lines.filter((l, i) => i !== 1 && l.trim()).map(splitMd).map((r) => r.map((c) => c.replace(/<br\s*\/?>/gi, "\n")));
  } else if (t.includes("\t")) {
    rows = parseTsv(t);
  }
  if (!rows || !rows.length) return null;
  const n = Math.max(...rows.map((r) => r.length));
  if (n < 2 && rows.length < 2) return null;
  return rows.map((r) => [...r, ...Array(n - r.length).fill("")]);
}
function splitMd(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const out: string[] = []; let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
    if (s[i] === "|") { out.push(cur.trim()); cur = ""; continue; }
    cur += s[i];
  }
  out.push(cur.trim());
  return out;
}
// TSV with spreadsheet quoting: a cell holding a line break or tab is "quoted", and "" is a quote inside it
function parseTsv(t: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false, start = true;
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

// ---------- table -> text ----------
export function toMarkdown(cells: (string | null)[][]): string {
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

export class Tables {
  constructor(private getEA: (view: any) => any, private settings: () => TableSettings, private msg: (k: string) => string) {}

  // ---------- layout ----------
  // Reads what the user changed (dragged sizes, typed text), then sets column widths, row heights and positions.
  // opt.resized: true/false when it is known whether the last pointer action was a resize (undefined: guess from the shapes).
  async layout(view: any, T: string, opt: { fromModel?: boolean; resized?: boolean } = {}) {
    const api = view.excalidrawAPI; if (view._exTableBusy) return; view._exTableBusy = true;
    try {
      let P = parts(api, T); if (!P.head) return;
      const H = P.head.customData[MODEL], M = JSON.parse(JSON.stringify(H));
      const A = anchors(M).sort((a, b) => b.cs * b.rs - a.cs * a.rs);   // merged cells first, so single cells win
      const ox = P.head.x, oy = P.head.y, frameId = P.head.frameId ?? null;
      // 1) sizes the user dragged: cells whose size differs from the last layout.
      //    Excalidraw also grows a cell by itself while text is typed into it; that is not a size the user chose,
      //    so it must not become the row's minimum height (else the row never shrinks back).
      const userH: Record<number, number> = {};
      if (!opt.fromModel) for (const a of A) {
        const e = P.rectAt(a.r, a.c); if (!e) continue;
        const w0 = sum(H.cols, a.c, a.cs), h0 = sum(H.rowH, a.r, a.rs), lc = a.c + a.cs - 1, lr = a.r + a.rs - 1;
        if (Math.abs(e.width - w0) > 1) M.cols[lc] = Math.max(MINW, Math.round(H.cols[lc] + e.width - w0));
        if (Math.abs(e.height - h0) > 1) {
          const b = P.bound(e);
          const grown = !!b && e.height > h0 && e.height <= b.height + 2 * PAD + 2;   // just fits its text: Excalidraw grew it
          if (opt.resized ?? !grown) userH[lr] = Math.round(H.rowH[lr] + e.height - h0);
        }
      }
      const X = (j: number) => ox + sum(M.cols, 0, j);
      // 2) widths, font size and alignment; re-wrap text
      const m1 = new Map(P.els.map((e: any) => [e.id, e])), al: Record<string, Align> = {};
      for (const a of A) {
        const e = P.rectAt(a.r, a.c); if (!e) continue;
        m1.set(e.id, upd(e, { x: X(a.c), width: sum(M.cols, a.c, a.cs), frameId,
          ...(e.backgroundColor === "transparent" ? { backgroundColor: this.settings().cellColor, fillStyle: "solid" } : {}) }));
        const b = P.bound(e); al[key(a.r, a.c)] = alignOf(e, b); if (!b) continue;
        const p: any = {};
        if (b.fontSize !== M.fs) p.fontSize = M.fs;
        if (!b.customData?.[TEXT]) Object.assign(p, { textAlign: al[key(a.r, a.c)], verticalAlign: "top", customData: { ...(b.customData || {}), [TEXT]: true } });
        if (b.frameId !== frameId) p.frameId = frameId;
        if (Object.keys(p).length) m1.set(b.id, upd(b, p));
      }
      api.updateScene({ elements: [...m1.values()] });
      api.updateContainerSize(api.getSceneElements().filter((e: any) => P.rects.some((r: any) => r.id === e.id)));
      // 3) row height = max(height set by the user, content); a merged cell adds what it lacks to its last row
      P = parts(api, T);
      const need = Array(M.nR).fill(MINH), info: any[] = [];
      for (const a of A) {
        const e = P.rectAt(a.r, a.c); if (!e) continue;
        const b = P.bound(e), th = textOf(b) ? b.height : 0, w = sum(M.cols, a.c, a.cs) - 2 * PAD;
        const ims = P.imgsAt(a.r, a.c);
        const sz = ims.map((x: any) => { const iw = Math.min(w, Math.round(x.width)); return [iw, Math.round((iw * x.height) / x.width)]; });
        const h = PAD + th + (ims.length ? (th ? GAP : 0) + sz.reduce((s: number, z: number[]) => s + z[1], 0) + GAP * (ims.length - 1) : 0) + PAD;
        info.push({ a, e, th, ims, sz, h });
        if (a.rs === 1) need[a.r] = Math.max(need[a.r], h);
      }
      for (const i in userH) M.rowMin[i] = userH[i] > need[i] + 1 ? userH[i] : 0;
      M.rowH = need.map((n, i) => Math.max(n, M.rowMin[i] || 0));
      for (const { a, h } of info) if (a.rs > 1) { const s = sum(M.rowH, a.r, a.rs); if (s < h) M.rowH[a.r + a.rs - 1] += h - s; }
      const Y = (i: number) => oy + sum(M.rowH, 0, i);
      // 4) positions; the model is stored on the top-left cell
      M.cells = snapshot(P, M); M.imgs = {};
      const m2 = new Map(api.getSceneElements().map((e: any) => [e.id, e]));
      for (const { a, e, th, ims, sz } of info) {
        let y = Y(a.r) + PAD + th + (th ? GAP : 0);
        ims.forEach((im: any, n: number) => {
          const g = { x: X(a.c) + PAD, y, width: sz[n][0], height: sz[n][1] }; M.imgs[im.id] = g;
          m2.set(im.id, upd(m2.get(im.id), { ...g, frameId })); y += sz[n][1] + GAP;
        });
      }
      for (const { a, e } of info) {
        const head = a.r === 0 && a.c === 0;
        m2.set(e.id, upd(m2.get(e.id), { x: X(a.c), y: Y(a.r), width: sum(M.cols, a.c, a.cs), height: sum(M.rowH, a.r, a.rs),
          customData: { ...e.customData, [CELL]: { ...e.customData[CELL], rs: a.rs, cs: a.cs, al: al[key(a.r, a.c)] }, ...(head ? { [MODEL]: M } : {}) } }));
      }
      // images in front of the cells (so a rebuilt cell's fill does not hide them)
      const arr = [...m2.values()], isImg = (e: any) => e.type === "image" && e.customData?.[CELL]?.id === T;
      api.updateScene({ elements: [...arr.filter((e) => !isImg(e)), ...arr.filter(isImg)] });
      api.updateContainerSize(api.getSceneElements().filter((e: any) => P.rects.some((r: any) => r.id === e.id)));
    } finally { view._exTableBusy = false; }
  }

  // Does the table need a layout? (so that a click does not rewrite the drawing)
  dirty(api: any, T: string) {
    const P = parts(api, T); if (!P.head) return false;
    const H = P.head.customData[MODEL];
    if (JSON.stringify(snapshot(P, H)) !== JSON.stringify(H.cells)) return true;
    const ox = P.head.x, oy = P.head.y;
    for (const a of anchors(H)) {
      const e = P.rectAt(a.r, a.c); if (!e) return true;
      if (Math.abs(e.x - ox - sum(H.cols, 0, a.c)) > 1 || Math.abs(e.y - oy - sum(H.rowH, 0, a.r)) > 1 ||
          Math.abs(e.width - sum(H.cols, a.c, a.cs)) > 1 || Math.abs(e.height - sum(H.rowH, a.r, a.rs)) > 1) return true;
      if ((e.frameId ?? null) !== (P.head.frameId ?? null)) return true;
      const b = P.bound(e); if (b && (b.fontSize !== H.fs || !b.customData?.[TEXT])) return true;
    }
    const order = new Map(P.els.map((e: any, i: number) => [e.id, i]));
    for (const im of P.imgs) {
      const cell = P.rectAt(im.customData[CELL].r, im.customData[CELL].c);
      if (cell && order.get(im.id) < order.get(cell.id)) return true;
      const g = H.imgs?.[im.id];
      if (!g || ["x", "y", "width", "height"].some((k) => Math.abs(im[k] - g[k]) > 1)) return true;
    }
    return false;
  }

  // An image dropped on a cell joins that cell; an image dragged out of the table leaves it.
  adopt(view: any): Set<string> {
    const api = view.excalidrawAPI, els = api.getSceneElements(), changed = new Set<string>(), ups: any[] = [];
    const cells = els.filter((e: any) => e.type === "rectangle" && e.customData?.[CELL]);
    const groupOf = (T: string) => els.find((e: any) => e.customData?.[MODEL] && e.customData[CELL].id === T)?.groupIds?.at(-1);
    for (const im of els.filter((e: any) => e.type === "image")) {
      const cx = im.x + im.width / 2, cy = im.y + im.height / 2, cur = im.customData?.[CELL];
      const hit = cells.find((r: any) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height);
      if (hit) {
        const n = hit.customData[CELL]; if (cur && cur.id === n.id && cur.r === n.r && cur.c === n.c) continue;
        const g = groupOf(n.id), old = cur ? groupOf(cur.id) : null;
        const groupIds = [...(im.groupIds || []).filter((x: string) => x !== old && x !== g), g].filter(Boolean);
        ups.push(upd(im, { customData: { ...(im.customData || {}), [CELL]: { id: n.id, r: n.r, c: n.c, img: cur?.img || fileLink(view, im) } },
          groupIds, frameId: hit.frameId ?? null }));
        changed.add(n.id); if (cur) changed.add(cur.id);
      } else if (cur) {
        const g = groupOf(cur.id), cd = { ...im.customData }; delete cd[CELL];
        ups.push(upd(im, { customData: cd, groupIds: (im.groupIds || []).filter((x: string) => x !== g) })); changed.add(cur.id);
      }
    }
    if (ups.length) { const m = new Map(els.map((e: any) => [e.id, e])); ups.forEach((u) => m.set(u.id, u)); api.updateScene({ elements: [...m.values()] }); }
    return changed;
  }

  // ---------- selection ----------
  // Select cells (r, c) of table T, inside the table's group, as a double-click would.
  // Returns the id of the first selected cell rectangle.
  select(view: any, T: string, at: { r: number; c: number }[]): string | null {
    const api = view.excalidrawAPI, P = parts(api, T), M = P.head?.customData?.[MODEL]; if (!M) return null;
    const ids: Record<string, true> = {};
    for (const p of at) { const a = cellAt(M, p.r, p.c); const e = a && P.rectAt(a.r, a.c); if (e) ids[e.id] = true; }
    if (!Object.keys(ids).length) return null;
    const gid = P.head.groupIds?.[0] ?? null;
    api.updateScene({ appState: { selectedElementIds: ids, selectedGroupIds: {}, editingGroupId: gid } });
    return Object.keys(ids)[0];
  }

  // ---------- drawing ----------
  private async draw(view: any, M: any, x: number, y: number, frameId: string | null, groupId?: string, content: Content = {}) {
    const s = this.settings(), ea = this.getEA(view);
    ea.reset(); ea.setView(view);
    Object.assign(ea.style, { roughness: 0, strokeWidth: 1, strokeColor: s.strokeColor, fillStyle: "solid", fontSize: M.fs, strokeStyle: "solid", roundness: null });
    const ids: string[] = [];
    for (const a of anchors(M)) {
      const k = key(a.r, a.c), cx = x + sum(M.cols, 0, a.c), cy = y + sum(M.rowH, 0, a.r);
      const w = sum(M.cols, a.c, a.cs), h = sum(M.rowH, a.r, a.rs), t = content[k]?.text || "", al = content[k]?.al || "left";
      const head = (a.r === 0 && M.header !== false) || (a.c === 0 && !!M.headerCol);
      // cells are filled: an unfilled cell cannot be clicked inside
      ea.style.backgroundColor = content[k]?.bg || (head ? s.headerColor : s.cellColor);
      const id = t
        ? ea.addText(cx, cy, t, { width: w - 2 * PAD, box: "rectangle", boxPadding: PAD, textAlign: al, textVerticalAlign: "top" })
        : ea.addRect(cx, cy, w, h);
      const el = ea.getElement(id); el.x = cx; el.y = cy; el.width = w; el.height = Math.max(el.height, h);   // a box with text is created offset by its padding
      ea.addAppendUpdateCustomData(id, { [CELL]: { id: M.id, r: a.r, c: a.c, rs: a.rs, cs: a.cs, al }, ...(a.r === 0 && a.c === 0 ? { [MODEL]: M } : {}) });
      ids.push(id);
      const bt = ea.getElements().find((e: any) => e.containerId === id);
      if (bt) { ids.push(bt.id); ea.addAppendUpdateCustomData(bt.id, { [TEXT]: true }); }
    }
    const gid = ea.addToGroup(ids);
    ea.getElements().forEach((e: any) => { if (groupId) e.groupIds = e.groupIds.map((z: string) => (z === gid ? groupId : z)); if (frameId) e.frameId = frameId; });
    await ea.addElementsToView(false, false, true);
    await sleep(200);
    await this.layout(view, M.id, { fromModel: true });
  }

  // A new table. rows: text of each cell (from a paste); at: top-left corner in the drawing (else the middle of the screen).
  async create(view: any, nC: number, nR: number, header: boolean, opt: { rows?: string[][]; at?: { x: number; y: number } } = {}) {
    const api = view.excalidrawAPI, s = this.settings(), st = api.getAppState();
    const fr = api.getSceneElements().find((e: any) => e.type === "frame" && st.selectedElementIds?.[e.id]);
    const cols = opt.rows ? fitColumns(opt.rows, nC, s) : Array(nC).fill(s.colWidth);
    const w = sum(cols, 0, nC), h = nR * MINH;
    const x = fr ? fr.x + 20 : opt.at ? opt.at.x : -st.scrollX + st.width / 2 / st.zoom.value - w / 2;
    const y = fr ? fr.y + 30 : opt.at ? opt.at.y : -st.scrollY + st.height / 2 / st.zoom.value - h / 2;
    const M = { id: "ext" + rnd().toString(36), fs: s.fontSize, nR, nC, header, headerCol: false,
      cols, rowMin: Array(nR).fill(0), rowH: Array(nR).fill(MINH), merges: [] as any[] };
    const content: Content = {};
    opt.rows?.forEach((row, r) => row.forEach((text, c) => { if (text) content[key(r, c)] = { text, imgs: [] }; }));
    await this.draw(view, M, x, y, fr?.id ?? null, undefined, content);
    return M.id;
  }

  // Common part of the structure commands: collect the content, move it to the new shape with fn, rebuild the cells,
  // then select the cell the command points at (so the next command can follow without clicking).
  async reshape(view: any, fn: Op): Promise<string | null> {
    const api = view.excalidrawAPI, { T, cells } = selectedCells(api);
    if (!T) throw new TableError(this.msg("selectCell"));
    await this.layout(view, T);
    const s = this.settings();
    const P = parts(api, T), M = JSON.parse(JSON.stringify(P.head.customData[MODEL])), content: Content = {};
    for (const a of anchors(M)) {
      const e = P.rectAt(a.r, a.c), b = e && P.bound(e), bg = e?.backgroundColor;
      content[key(a.r, a.c)] = { text: textOf(b), imgs: P.imgsAt(a.r, a.c).map((x: any) => x.id), al: alignOf(e, b),
        // a cell in the default colours follows the header settings; only a colour the user picked moves with the cell
        bg: bg && bg !== "transparent" && bg !== s.headerColor && bg !== s.cellColor ? bg : undefined };
    }
    const sel = cells.map((n: any) => ({ r: n.r, c: n.c, rs: n.rs || 1, cs: n.cs || 1 }));
    const N = fn(M, content, sel);
    // rebuild: delete the old cells, move images to their new cell (or delete them with a deleted cell)
    const x = P.head.x, y = P.head.y, frameId = P.head.frameId ?? null, g = P.head.groupIds?.at(-1);
    const old = new Set([...P.rects.map((r: any) => r.id), ...P.rects.map((r: any) => P.bound(r)?.id).filter(Boolean)]);
    const imgAt: Record<string, string> = {};
    for (const [k, v] of Object.entries(N.content)) for (const id of v.imgs || []) imgAt[id] = k;
    api.updateScene({ elements: api.getSceneElements().map((e: any) => {
      if (old.has(e.id)) return upd(e, { isDeleted: true });
      if (e.type === "image" && e.customData?.[CELL]?.id === T) {
        const k = imgAt[e.id]; if (!k) return upd(e, { isDeleted: true });
        const [r, c] = k.split(",").map(Number);
        return upd(e, { customData: { ...e.customData, [CELL]: { ...e.customData[CELL], r, c } } });
      }
      return e;
    }) });
    await this.draw(view, N.M, x, y, frameId, g, N.content);
    const f = N.focus ?? sel[0];
    return f ? this.select(view, T, [{ r: Math.min(f.r, N.M.nR - 1), c: Math.min(f.c, N.M.nC - 1) }]) : null;
  }

  // Set the alignment of the selected cells (kept on the cell, so it survives adding rows and merging).
  async align(view: any, al: Align) {
    const api = view.excalidrawAPI, { T, cells } = selectedCells(api);
    if (!T) throw new TableError(this.msg("selectCell"));
    const P = parts(api, T), m = new Map(P.els.map((e: any) => [e.id, e]));
    for (const n of cells) {
      const e = P.rectAt(n.r, n.c); if (!e) continue;
      m.set(e.id, upd(e, { customData: { ...e.customData, [CELL]: { ...e.customData[CELL], al } } }));
      const b = P.bound(e);
      if (b) m.set(b.id, upd(b, { textAlign: al, customData: { ...(b.customData || {}), [TEXT]: true } }));
    }
    api.updateScene({ elements: [...m.values()] });
    await this.layout(view, T);
  }

  // The selected table as Markdown or tab-separated text.
  async text(view: any, fmt: "md" | "tsv") {
    const api = view.excalidrawAPI, { T } = selectedCells(api);
    if (!T) throw new TableError(this.msg("selectTable"));
    await this.layout(view, T);
    const cells = modelOf(api, T).cells as (string | null)[][];
    return fmt === "md" ? toMarkdown(cells) : toTsv(cells);
  }

  // ---------- structure operations ----------
  private insRow(M: any, content: Content, at: number) {
    M.nR++; M.rowMin.splice(at, 0, 0); M.rowH.splice(at, 0, MINH);
    for (const m of M.merges) { if (m.r >= at) m.r++; else if (m.r + m.rs > at) m.rs++; }
    return remap(content, (r, c) => [r >= at ? r + 1 : r, c]);
  }
  private insCol(M: any, content: Content, at: number) {
    M.nC++; M.cols.splice(at, 0, this.settings().colWidth);
    for (const m of M.merges) { if (m.c >= at) m.c++; else if (m.c + m.cs > at) m.cs++; }
    return remap(content, (r, c) => [r, c >= at ? c + 1 : c]);
  }

  ops: Record<string, Op> = {
    addRow: (M, content, sel) => {
      const at = Math.max(...sel.map((s) => s.r + s.rs));
      return { M, content: this.insRow(M, content, at), focus: { r: at, c: Math.min(...sel.map((s) => s.c)) } };
    },
    addRowAbove: (M, content, sel) => {
      const at = Math.min(...sel.map((s) => s.r));
      return { M, content: this.insRow(M, content, at), focus: { r: at, c: Math.min(...sel.map((s) => s.c)) } };
    },
    addCol: (M, content, sel) => {
      const at = Math.max(...sel.map((s) => s.c + s.cs));
      return { M, content: this.insCol(M, content, at), focus: { r: Math.min(...sel.map((s) => s.r)), c: at } };
    },
    addColLeft: (M, content, sel) => {
      const at = Math.min(...sel.map((s) => s.c));
      return { M, content: this.insCol(M, content, at), focus: { r: Math.min(...sel.map((s) => s.r)), c: at } };
    },
    delRow: (M, content, sel) => {
      const rows = [...new Set(sel.map((s) => s.r))].sort((a, b) => b - a);
      for (const at of rows) {
        if (M.nR <= 1) break;
        M.nR--; M.rowMin.splice(at, 1); M.rowH.splice(at, 1);
        const keep = new Set(M.merges.filter((m: any) => m.r === at && m.rs > 1).map((m: any) => m.c));   // first row of a merge: keep its content
        for (const m of M.merges) { if (m.r > at) m.r--; else if (m.r + m.rs > at) m.rs--; }
        M.merges = M.merges.filter((m: any) => m.rs > 0 && (m.rs > 1 || m.cs > 1));
        content = remap(content, (r, c) => (r < at ? [r, c] : r > at ? [r - 1, c] : keep.has(c) ? [r, c] : null));
      }
      return { M, content, focus: { r: Math.min(...rows), c: Math.min(...sel.map((s) => s.c)) } };
    },
    delCol: (M, content, sel) => {
      const cols = [...new Set(sel.map((s) => s.c))].sort((a, b) => b - a);
      for (const at of cols) {
        if (M.nC <= 1) break;
        M.nC--; M.cols.splice(at, 1);
        const keep = new Set(M.merges.filter((m: any) => m.c === at && m.cs > 1).map((m: any) => m.r));
        for (const m of M.merges) { if (m.c > at) m.c--; else if (m.c + m.cs > at) m.cs--; }
        M.merges = M.merges.filter((m: any) => m.cs > 0 && (m.rs > 1 || m.cs > 1));
        content = remap(content, (r, c) => (c < at ? [r, c] : c > at ? [r, c - 1] : keep.has(r) ? [r, c] : null));
      }
      return { M, content, focus: { r: Math.min(...sel.map((s) => s.r)), c: Math.min(...cols) } };
    },
    merge: (M, content, sel) => {
      if (sel.length < 2) throw new TableError(this.msg("selectTwo"));
      let r0 = Math.min(...sel.map((s) => s.r)), c0 = Math.min(...sel.map((s) => s.c)),
          r1 = Math.max(...sel.map((s) => s.r + s.rs - 1)), c1 = Math.max(...sel.map((s) => s.c + s.cs - 1));
      for (let grow = true; grow;) {   // grow the range over merges it only partly covers
        grow = false;
        for (const m of M.merges) {
          const over = !(m.r > r1 || m.r + m.rs - 1 < r0 || m.c > c1 || m.c + m.cs - 1 < c0);
          if (over && (m.r < r0 || m.c < c0 || m.r + m.rs - 1 > r1 || m.c + m.cs - 1 > c1)) {
            r0 = Math.min(r0, m.r); c0 = Math.min(c0, m.c); r1 = Math.max(r1, m.r + m.rs - 1); c1 = Math.max(c1, m.c + m.cs - 1); grow = true;
          }
        }
      }
      M.merges = M.merges.filter((m: any) => m.r > r1 || m.r + m.rs - 1 < r0 || m.c > c1 || m.c + m.cs - 1 < c0);
      M.merges.push({ r: r0, c: c0, rs: r1 - r0 + 1, cs: c1 - c0 + 1 });
      const texts: string[] = [], imgs: string[] = []; let bg: string | undefined, al: Align | undefined;
      for (let i = r0; i <= r1; i++) for (let j = c0; j <= c1; j++) {
        const v = content[key(i, j)]; if (!v) continue;
        if (v.text) texts.push(v.text); imgs.push(...(v.imgs || []));
        if (bg === undefined) bg = v.bg; if (al === undefined) al = v.al;
        delete content[key(i, j)];
      }
      content[key(r0, c0)] = { text: texts.join("\n"), imgs, bg, al };
      return { M, content, focus: { r: r0, c: c0 } };
    },
    unmerge: (M, content, sel) => {
      const at = new Set(sel.map((s) => key(s.r, s.c)));
      const n = M.merges.length; M.merges = M.merges.filter((m: any) => !at.has(key(m.r, m.c)));
      if (M.merges.length === n) throw new TableError(this.msg("selectMerged"));
      return { M, content };
    },
    toggleHeaderRow: (M, content) => { M.header = M.header === false; return { M, content }; },
    toggleHeaderCol: (M, content) => { M.headerCol = !M.headerCol; return { M, content }; },
  };

  // After each pointer up (end of a drag, a click after typing): adopt dropped images, then lay out changed tables.
  async onPointerUp(view: any, resized?: boolean) {
    const api = view.excalidrawAPI, st = api.getAppState();
    // never while typing or dragging (a layout would overwrite the text being typed)
    if (view._exTableBusy || st.editingTextElement || st.newElement || st.resizingElement) return;
    const moved = this.adopt(view);
    for (const T of tablesIn(api)) if (moved.has(T) || this.dirty(api, T)) await this.layout(view, T, { resized });
  }
}

// column widths for pasted text: wide enough for the longest line, within limits
function fitColumns(rows: string[][], nC: number, s: TableSettings): number[] {
  const width = (line: string) => [...line].reduce((w, ch) => w + (/[⺀-￯]/.test(ch) ? 1 : 0.6), 0) * s.fontSize;
  return Array.from({ length: nC }, (_, c) => {
    const w = Math.max(0, ...rows.map((r) => Math.max(0, ...(r[c] || "").split("\n").map(width))));
    return Math.round(Math.min(Math.max(w + 2 * PAD + 4, 80), Math.max(s.colWidth * 2, 320)));
  });
}

function remap(content: Content, f: (r: number, c: number) => number[] | null): Content {
  const out: Content = {};
  for (const [k, v] of Object.entries(content)) {
    const [r, c] = k.split(",").map(Number); const n = f(r, c);
    if (n) out[key(n[0], n[1])] = v;
  }
  return out;
}
