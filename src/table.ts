// Tables on the Excalidraw canvas: reading them from the scene, laying them out, drawing and rebuilding them.
//
// A table is a group of cell rectangles (text is bound inside each rectangle) plus images placed in cells.
// The model (src/model.ts) is stored on the top-left cell; it also keeps `cells`, a copy of the content as text
// (line breaks as <br>, images as ![[path]], covered cells of a merge as null) so other tools can read the table.

import {
  Align, Anchor, CELL, Colors, Content, MINH, MODEL, Model, Op, OpName, TEXT,
  TableError, anchors, cellAt, copyModel, gap, isHeader, key, minH, minW, pad, scaleModel, structureOps, sum,
} from "./model";
import { bounds } from "./geom";
import { ExportTable, fitColumns } from "./text";
import { TableSettings } from "./settings";
import { LATER, NEVER, commit, rnd, until, upd, withChanges } from "./util";

// ---------- reading the scene ----------
// a cell rectangle / an image in a cell of table T
const isCellOf = (e: any, T: string) => e.type === "rectangle" && e.customData?.[CELL]?.id === T;
const isImageOf = (e: any, T: string) => e.type === "image" && e.customData?.[CELL]?.id === T;

// the cell rectangles of table T
export const cellRects = (api: any, T: string): any[] => api.getSceneElements().filter((e: any) => isCellOf(e, T));

function parts(api: any, T: string) {
  const els = api.getSceneElements();
  const rects = els.filter((e: any) => isCellOf(e, T));
  const imgs = els.filter((e: any) => isImageOf(e, T));
  const head = rects.find((e: any) => e.customData[CELL].r === 0 && e.customData[CELL].c === 0 && e.customData[MODEL]);
  const byContainer = new Map<string, any>();
  for (const e of els) if (e.type === "text" && e.containerId) byContainer.set(e.containerId, e);
  const bound = (r: any) => (r ? byContainer.get(r.id) : undefined);
  const rectAt = (r: number, c: number) => rects.find((e: any) => e.customData[CELL].r === r && e.customData[CELL].c === c);
  const imgsAt = (r: number, c: number) =>
    imgs.filter((e: any) => e.customData[CELL].r === r && e.customData[CELL].c === c).sort((a: any, b: any) => a.y - b.y);
  return { els, rects, imgs, head, bound, rectAt, imgsAt };
}

export const tablesIn = (api: any): string[] =>
  [...new Set<string>(api.getSceneElements().filter((e: any) => e.customData?.[MODEL]).map((e: any) => e.customData[CELL].id))];

// the table model, as last laid out
export const modelOf = (api: any, T: string): Model | undefined => parts(api, T).head?.customData?.[MODEL];

// Text colour of a cell from the table's colours (none for tables made before themes: Excalidraw's choice stays).
const textColor = (M: Model, r: number, c: number) => (isHeader(M, r, c) ? M.colors?.headerText : M.colors?.text);

// The groups the table's elements belong to, innermost (the table's own group) first.
// A table the user grouped with other shapes keeps that outer group too.
const groupsOf = (head: any): string[] => [...(head?.groupIds || [])];

// the cell's font size as a ratio to the table's (set when the user changes the size of the text in a cell)
const ratioOf = (e: any): number => e?.customData?.[CELL]?.fr || 1;
const textOf = (b: any) => (b ? b.originalText ?? b.text ?? "" : "");
// alignment of a cell: the text's own alignment once the plugin has set it up (so a change in Excalidraw's panel is kept)
const alignOf = (e: any, b: any): Align => (b?.customData?.[TEXT] ? b.textAlign : e?.customData?.[CELL]?.al) || "left";

function snapshot(P: ReturnType<typeof parts>, M: Model) {
  const cells: (string | null)[][] = Array.from({ length: M.nR }, () => Array(M.nC).fill(null));
  for (const a of anchors(M)) {
    const e = P.rectAt(a.r, a.c);
    cells[a.r][a.c] = [textOf(P.bound(e)).replace(/\n/g, "<br>"), ...P.imgsAt(a.r, a.c).map((x: any) => `![[${x.customData[CELL].img || ""}]]`)]
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

// The selected cells (of one table: the first one found), from the selected rectangles or the text inside them.
export function selectedCells(api: any): { T: string | undefined; cells: { id: string; r: number; c: number; rs?: number; cs?: number }[] } {
  const sel = api.getAppState().selectedElementIds || {};
  const els = api.getSceneElements(), byId = new Map(els.map((e: any) => [e.id, e])), out: any[] = [];
  for (const id of Object.keys(sel)) {
    let e: any = byId.get(id); if (!e) continue;
    if (e.containerId) e = byId.get(e.containerId);
    if (e?.type === "rectangle" && e.customData?.[CELL] && !out.includes(e.customData[CELL])) out.push(e.customData[CELL]);   // a cell and its text: once
  }
  const T = out[0]?.id;
  return { T, cells: out.filter((n) => n.id === T) };
}

// The table selected as a whole, and nothing else with it (a table in a selected group of several things does not count).
export function wholeTableSelected(api: any): string | null {
  const st = api.getAppState(), ids = Object.keys(st.selectedElementIds || {});
  const { T, cells } = selectedCells(api); if (!T || !ids.length) return null;
  const M = modelOf(api, T); if (!M || isCellSelection(st, M, cells)) return null;
  const mine = new Set<string>();
  for (const e of api.getSceneElements()) {
    if (e.customData?.[CELL]?.id === T) { mine.add(e.id); for (const b of e.boundElements || []) mine.add(b.id); }
  }
  return ids.every((id) => mine.has(id)) ? T : null;
}

// Cells are selected one by one (not the table as a whole): inside the table's group, or only part of the table.
export function isCellSelection(st: any, M: Model, cells: unknown[]) {
  return !!st.editingGroupId || cells.length < anchors(M).length;
}

export class Tables {
  readonly ops: Record<OpName, Op>;

  constructor(private getEA: (view: any) => any, private settings: () => TableSettings, private msg: (k: string) => string) {
    this.ops = structureOps(() => this.settings().colWidth, msg);
  }

  private colors(M?: Model): Colors {
    const s = this.settings();
    return M?.colors ?? { header: s.headerColor, cell: s.cellColor, stroke: s.strokeColor };
  }

  private writable(view: any) {
    if (view.excalidrawAPI.getAppState().viewModeEnabled) throw new TableError(this.msg("viewMode"));
  }

  // The table and cells a command works on (the drawing must be in edit mode, and cells selected).
  private target(view: any) {
    this.writable(view);
    const api = view.excalidrawAPI, { T, cells } = selectedCells(api);
    if (!T) throw new TableError(this.msg("selectCell"));
    return { api, T, cells };
  }

  // ---------- layout ----------
  // Reads what the user changed (dragged sizes, typed text), then sets column widths, row heights and positions.
  // opt.resized: whether the last pointer action was a resize, when known (undefined: guess from the shapes).
  // opt.scaled: the table was selected as a whole when the resize began (so the resize scales the table).
  layout(view: any, T: string, opt: { fromModel?: boolean; resized?: boolean; scaled?: boolean } = {}) {
    const api = view.excalidrawAPI;
    let P = parts(api, T); if (!P.head) return;
    const H: Model = P.head.customData[MODEL], M = copyModel(H);
    const A = anchors(M).sort((a, b) => b.cs * b.rs - a.cs * a.rs);   // merged cells first, so single cells win
    const frameId = P.head.frameId ?? null, cellColor = this.colors(M).cell;
    let ox = P.head.x, oy = P.head.y;
    // 0) the whole table was resized (Excalidraw's handles on the selected table): scale it, font included
    //    (not after typing: Excalidraw growing the only cell of a one-cell table is not a resize)
    const scaled = opt.fromModel || opt.resized === false ? null : opt.scaled ? this.measureScale(P, H) : this.wholeScale(api, P, H, A);
    if (scaled) {
      scaleModel(M, scaled.sx, scaled.sy);
      ox = scaled.x; oy = scaled.y;
    }
    const PADm = pad(M), GAPm = gap(M);
    // 1) sizes the user dragged: cells whose size differs from the last layout.
    //    Excalidraw also grows a cell by itself while text is typed into it; that is not a size the user chose,
    //    so it must not become the row's minimum height (else the row never shrinks back).
    const userH: Record<number, number> = {};
    if (!opt.fromModel && !scaled) for (const a of A) {
      const e = P.rectAt(a.r, a.c); if (!e) continue;
      const w0 = sum(H.cols, a.c, a.cs), h0 = sum(H.rowH, a.r, a.rs), lc = a.c + a.cs - 1, lr = a.r + a.rs - 1;
      if (Math.abs(e.width - w0) > 1) M.cols[lc] = Math.max(minW(M), H.cols[lc] + e.width - w0);
      if (Math.abs(e.height - h0) > 1) {
        const b = P.bound(e);
        const grown = !!b && e.height > h0 && e.height <= b.height + 2 * PADm + 2;   // just fits its text: Excalidraw grew it
        if (opt.resized ?? !grown) userH[lr] = H.rowH[lr] + e.height - h0;
      }
    }
    const X = (j: number) => ox + sum(M.cols, 0, j);
    // 2) widths, font size and alignment; re-wrap text
    const ch: any[] = [], al: Record<string, Align> = {}, fr: Record<string, number> = {};
    for (const a of A) {
      const e = P.rectAt(a.r, a.c); if (!e) continue;
      ch.push(upd(e, { x: X(a.c), width: sum(M.cols, a.c, a.cs), frameId,
        ...(e.backgroundColor === "transparent" ? { backgroundColor: cellColor, fillStyle: "solid" } : {}) }));
      const b = P.bound(e), k = key(a.r, a.c);
      al[k] = alignOf(e, b);
      fr[k] = ratioOf(e);
      if (!b) continue;
      // the user changed the size of the text (Excalidraw's font size): keep it, as a ratio to the table's size
      // (not when the table was scaled as a whole: then Excalidraw scaled the text, and the table's size follows instead)
      if (b.customData?.[TEXT] && !opt.fromModel && !scaled && Math.abs(b.fontSize - H.fs * fr[k]) > 0.01) fr[k] = b.fontSize / M.fs;
      const p: any = {}, want = M.fs * fr[k];
      if (Math.abs(b.fontSize - want) > 0.001) p.fontSize = want;
      if (!b.customData?.[TEXT]) {
        // text just typed into the cell: set it up (alignment; the table's text colour, as Excalidraw uses its current colour)
        Object.assign(p, { textAlign: al[k], verticalAlign: "top", customData: { ...(b.customData || {}), [TEXT]: true } });
        const tc = textColor(M, a.r, a.c); if (tc) p.strokeColor = tc;
      }
      if (b.frameId !== frameId) p.frameId = frameId;
      if (Object.keys(p).length) ch.push(upd(b, p));
    }
    api.updateScene({ elements: withChanges(P.els, ch), ...LATER });
    const rectIds = new Set(P.rects.map((r: any) => r.id));
    api.updateContainerSize(api.getSceneElements().filter((e: any) => rectIds.has(e.id)));
    // 3) row height = max(height set by the user, content); a merged cell adds what it lacks to its last row
    P = parts(api, T);
    const need: number[] = Array(M.nR).fill(minH(M)), info: any[] = [];
    for (const a of A) {
      const e = P.rectAt(a.r, a.c); if (!e) continue;
      const b = P.bound(e), th = textOf(b) ? b.height : 0, w = Math.max(1, sum(M.cols, a.c, a.cs) - 2 * PADm);
      const ims = P.imgsAt(a.r, a.c);
      const sz = ims.map((x: any) => { const iw = Math.min(w, x.width); return [iw, (iw * x.height) / x.width]; });
      const h = PADm + th + (ims.length ? (th ? GAPm : 0) + sz.reduce((s: number, z: number[]) => s + z[1], 0) + GAPm * (ims.length - 1) : 0) + PADm;
      info.push({ a, e, th, ims, sz, h });
      if (a.rs === 1) need[a.r] = Math.max(need[a.r], h);
    }
    for (const i in userH) M.rowMin[i] = userH[i] > need[i] + 1 ? userH[i] : 0;
    M.rowH = need.map((n, i) => Math.max(n, M.rowMin[i] || 0));
    for (const { a, h } of info) if (a.rs > 1) { const s = sum(M.rowH, a.r, a.rs); if (s < h) M.rowH[a.r + a.rs - 1] += h - s; }
    const Y = (i: number) => oy + sum(M.rowH, 0, i);
    // 4) positions; the model is stored on the top-left cell
    M.cells = snapshot(P, M); M.imgs = {};
    const els2 = api.getSceneElements(), now = new Map<string, any>(els2.map((e: any) => [e.id, e])), ch2: any[] = [];
    for (const { a, th, ims, sz } of info) {
      let y = Y(a.r) + PADm + th + (th ? GAPm : 0);
      ims.forEach((im: any, n: number) => {
        const g = { x: X(a.c) + PADm, y, width: sz[n][0], height: sz[n][1] };
        M.imgs![im.id] = g;
        ch2.push(upd(now.get(im.id), { ...g, frameId }));
        y += sz[n][1] + GAPm;
      });
    }
    for (const { a, e } of info) {
      const head = a.r === 0 && a.c === 0;
      ch2.push(upd(now.get(e.id), { x: X(a.c), y: Y(a.r), width: sum(M.cols, a.c, a.cs), height: sum(M.rowH, a.r, a.rs),
        customData: { ...e.customData, [CELL]: { ...e.customData[CELL], rs: a.rs, cs: a.cs, al: al[key(a.r, a.c)], fr: fr[key(a.r, a.c)] }, ...(head ? { [MODEL]: M } : {}) } }));
    }
    // images in front of the cells (so a rebuilt cell's fill does not hide them)
    const arr = withChanges(els2, ch2), isImg = (e: any) => isImageOf(e, T);
    api.updateScene({ elements: [...arr.filter((e) => !isImg(e)), ...arr.filter(isImg)], ...LATER });
    api.updateContainerSize(api.getSceneElements().filter((e: any) => rectIds.has(e.id)));
  }

  // Was the whole table resized as one (all cells scaled alike)? Then: the scale and the new top-left corner.
  // Not when the user is inside the table (a cell of a one-cell table was resized, which is a cell resize).
  private wholeScale(api: any, P: ReturnType<typeof parts>, H: Model, A: Anchor[]) {
    if (api.getAppState().editingGroupId && api.getAppState().editingGroupId === groupsOf(P.head)[0]) return null;
    const B = bounds(P.rects), W = sum(H.cols, 0, H.nC), Hh = sum(H.rowH, 0, H.nR);
    if (!B || !(W > 0 && Hh > 0)) return null;
    const { x0, y0, x1, y1 } = B;
    const sx = (x1 - x0) / W, sy = (y1 - y0) / Hh;
    if (Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) return null;
    const tol = (v: number) => Math.max(1.5, v * 0.01);
    for (const a of A) {
      const e = P.rectAt(a.r, a.c); if (!e) return null;
      const w = sum(H.cols, a.c, a.cs) * sx, h = sum(H.rowH, a.r, a.rs) * sy, x = sum(H.cols, 0, a.c) * sx, y = sum(H.rowH, 0, a.r) * sy;
      if (Math.abs(e.width - w) > tol(w) || Math.abs(e.height - h) > tol(h) || Math.abs(e.x - x0 - x) > tol(x1 - x0) || Math.abs(e.y - y0 - y) > tol(y1 - y0)) return null;
    }
    return { sx, sy, x: x0, y: y0 };
  }

  // How much the table was scaled, measured from what text cannot change: cell widths, and where the cells start
  // (Excalidraw may grow a cell's height to fit its text while it resizes the table).
  private measureScale(P: ReturnType<typeof parts>, H: Model) {
    const B = bounds(P.rects), W = sum(H.cols, 0, H.nC);
    if (!B || !(W > 0)) return null;
    const { x0, y0, x1 } = B;
    const sx = (x1 - x0) / W;
    // rows: where each row starts (median over the cells, so one odd cell does not count); one row: the lowest cell
    const ys: number[] = [];
    for (const e of P.rects) { const n = e.customData[CELL]; const off = sum(H.rowH, 0, n.r); if (n.r > 0 && off > 0) ys.push((e.y - y0) / off); }
    ys.sort((a, b) => a - b);
    const sy = ys.length ? ys[Math.floor(ys.length / 2)] : Math.min(...P.rects.map((e: any) => e.height)) / (H.rowH[0] || 1);
    if (!(sx > 0 && sy > 0) || (Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005)) return null;
    return { sx, sy, x: x0, y: y0 };
  }

  // Scale the whole table (the stretch handles): widths by sx, heights by sy, the font by the smaller of the two.
  scale(view: any, T: string, sx: number, sy: number) {
    this.writable(view);
    const api = view.excalidrawAPI, P = parts(api, T); if (!P.head) return;
    const M = copyModel(P.head.customData[MODEL]), k = scaleModel(M, sx, sy);
    api.updateScene({ elements: withChanges(P.els, [
      upd(P.head, { customData: { ...P.head.customData, [MODEL]: M } }),
      ...P.imgs.map((im: any) => upd(im, { width: im.width * k, height: im.height * k })),   // images scale with the text
    ]), ...LATER });
    this.layout(view, T, { fromModel: true });
    commit(api);
  }

  // Does the table need a layout? (so that a click does not rewrite the drawing)
  dirty(api: any, T: string) {
    const P = parts(api, T); if (!P.head) return false;
    const H: Model = P.head.customData[MODEL];
    if (JSON.stringify(snapshot(P, H)) !== JSON.stringify(H.cells)) return true;
    const ox = P.head.x, oy = P.head.y;
    for (const a of anchors(H)) {
      const e = P.rectAt(a.r, a.c); if (!e) return true;
      if (Math.abs(e.x - ox - sum(H.cols, 0, a.c)) > 1 || Math.abs(e.y - oy - sum(H.rowH, 0, a.r)) > 1 ||
          Math.abs(e.width - sum(H.cols, a.c, a.cs)) > 1 || Math.abs(e.height - sum(H.rowH, a.r, a.rs)) > 1) return true;
      if ((e.frameId ?? null) !== (P.head.frameId ?? null)) return true;
      const b = P.bound(e); if (b && (Math.abs(b.fontSize - H.fs * ratioOf(e)) > 0.001 || !b.customData?.[TEXT])) return true;
    }
    const order = new Map(P.els.map((e: any, i: number) => [e.id, i]));
    for (const im of P.imgs) {
      const cell = P.rectAt(im.customData[CELL].r, im.customData[CELL].c);
      if (cell && (order.get(im.id) as number) < (order.get(cell.id) as number)) return true;
      const g = H.imgs?.[im.id];
      if (!g || (["x", "y", "width", "height"] as const).some((k) => Math.abs(im[k] - g[k]) > 1)) return true;
    }
    return false;
  }

  // An image dropped on a cell joins that cell (and the table's groups); an image dragged out of the table leaves it.
  adopt(view: any): Set<string> {
    const api = view.excalidrawAPI, els = api.getSceneElements(), changed = new Set<string>(), ups: any[] = [];
    const cells = els.filter((e: any) => e.type === "rectangle" && e.customData?.[CELL]);
    const heads = new Map<string, any>();
    for (const e of els) if (e.customData?.[MODEL]) heads.set(e.customData[CELL].id, e);
    const groups = (T: string) => groupsOf(heads.get(T));
    for (const im of els.filter((e: any) => e.type === "image")) {
      const cx = im.x + im.width / 2, cy = im.y + im.height / 2, cur = im.customData?.[CELL];
      const hit = cells.find((r: any) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height);
      if (hit) {
        const n = hit.customData[CELL];
        if (cur && cur.id === n.id && cur.r === n.r && cur.c === n.c) continue;
        const g = groups(n.id), old = cur ? groups(cur.id) : [];
        const groupIds = [...(im.groupIds || []).filter((x: string) => !old.includes(x) && !g.includes(x)), ...g];
        ups.push(upd(im, { customData: { ...(im.customData || {}), [CELL]: { id: n.id, r: n.r, c: n.c, img: cur?.img || fileLink(view, im) } },
          groupIds, frameId: hit.frameId ?? null }));
        changed.add(n.id); if (cur) changed.add(cur.id);
      } else if (cur) {
        const old = groups(cur.id), cd = { ...im.customData };
        delete cd[CELL];
        ups.push(upd(im, { customData: cd, groupIds: (im.groupIds || []).filter((x: string) => !old.includes(x)) }));
        changed.add(cur.id);
      }
    }
    if (ups.length) api.updateScene({ elements: withChanges(els, ups), ...LATER });
    return changed;
  }

  // ---------- selection ----------
  // Select cells (r, c) of table T inside the table's group, as a double-click would. Returns the ids of the selected cells.
  select(view: any, T: string, at: { r: number; c: number }[]): string[] {
    const api = view.excalidrawAPI, P = parts(api, T), M: Model | undefined = P.head?.customData?.[MODEL];
    if (!M) return [];
    const ids: Record<string, true> = {};
    for (const p of at) { const a = cellAt(M, p.r, p.c), e = a && P.rectAt(a.r, a.c); if (e) ids[e.id] = true; }
    if (!Object.keys(ids).length) return [];
    api.updateScene({ appState: { selectedElementIds: ids, selectedGroupIds: {}, editingGroupId: groupsOf(P.head)[0] ?? null }, ...NEVER });
    return Object.keys(ids);
  }

  // ---------- drawing ----------
  // Draw the cells of M at (x, y). groups: the groups of the table being rebuilt (a new table gets a new group).
  private async draw(view: any, M: Model, x: number, y: number, frameId: string | null, groups: string[] | null, content: Content = {}) {
    const ea = this.getEA(view), C = this.colors(M);
    ea.reset(); ea.setView(view);
    Object.assign(ea.style, { roughness: 0, strokeWidth: 1, strokeColor: C.stroke, fillStyle: "solid", fontSize: M.fs, strokeStyle: "solid", roundness: null });
    const ids: string[] = [];
    for (const a of anchors(M)) {
      const k = key(a.r, a.c), cx = x + sum(M.cols, 0, a.c), cy = y + sum(M.rowH, 0, a.r);
      const w = sum(M.cols, a.c, a.cs), h = sum(M.rowH, a.r, a.rs), t = content[k]?.text || "", al = content[k]?.al || "left", fr = content[k]?.fr || 1;
      ea.style.fontSize = M.fs * fr;
      // cells are filled: an unfilled cell cannot be clicked inside
      ea.style.backgroundColor = content[k]?.bg || (isHeader(M, a.r, a.c) ? C.header : C.cell);
      const id = t
        ? ea.addText(cx, cy, t, { width: Math.max(1, w - 2 * pad(M)), box: "rectangle", boxPadding: pad(M), textAlign: al, textVerticalAlign: "top" })
        : ea.addRect(cx, cy, w, h);
      const el = ea.getElement(id);
      el.x = cx; el.y = cy; el.width = w; el.height = Math.max(el.height, h);   // a box with text is created offset by its padding
      ea.addAppendUpdateCustomData(id, { [CELL]: { id: M.id, r: a.r, c: a.c, rs: a.rs, cs: a.cs, al, fr }, ...(a.r === 0 && a.c === 0 ? { [MODEL]: M } : {}) });
      ids.push(id);
      const bt = ea.getElements().find((e: any) => e.containerId === id);
      if (bt) {
        ids.push(bt.id); ea.addAppendUpdateCustomData(bt.id, { [TEXT]: true });
        const tc = content[k]?.bg ? undefined : textColor(M, a.r, a.c); if (tc) bt.strokeColor = tc;
      }
    }
    ea.addToGroup(ids);
    ea.getElements().forEach((e: any) => { if (groups?.length) e.groupIds = [...groups]; if (frameId) e.frameId = frameId; });
    await ea.addElementsToView(false, false, true, false, LATER.captureUpdate);   // (captured by the command that draws)
    // the new elements reach the scene a moment later
    await until(() => !!parts(view.excalidrawAPI, M.id).head, 3000);
    this.layout(view, M.id, { fromModel: true });
  }

  // A new table. rows: text of each cell (from a paste); at: top-left corner in the drawing (else the middle of the screen).
  // colors: the table's colours (a theme); else the default colours from the settings.
  async create(view: any, nC: number, nR: number, header: boolean, opt: { rows?: string[][]; at?: { x: number; y: number }; colors?: Colors } = {}) {
    this.writable(view);
    const api = view.excalidrawAPI, s = this.settings(), st = api.getAppState();
    const fr = api.getSceneElements().find((e: any) => e.type === "frame" && st.selectedElementIds?.[e.id]);
    const cols = opt.rows ? fitColumns(opt.rows, nC, s.fontSize, s.colWidth) : Array(nC).fill(s.colWidth);
    const w = sum(cols, 0, nC), h = nR * MINH, z = st.zoom?.value ?? 1;
    const x = fr ? fr.x + 20 : opt.at ? opt.at.x : -st.scrollX + st.width / 2 / z - w / 2;
    const y = fr ? fr.y + 30 : opt.at ? opt.at.y : -st.scrollY + st.height / 2 / z - h / 2;
    const M: Model = { id: "ext" + rnd().toString(36), fs: s.fontSize, nR, nC, header, headerCol: false, colors: opt.colors ?? this.colors(),
      cols, rowMin: Array(nR).fill(0), rowH: Array(nR).fill(MINH), merges: [] };
    const content: Content = {};
    opt.rows?.forEach((row, r) => row.forEach((text, c) => { if (text) content[key(r, c)] = { text, imgs: [] }; }));
    await this.draw(view, M, x, y, fr?.id ?? null, null, content);
    commit(api);
    return M.id;
  }

  // Common part of the structure commands: collect the content, move it to the new shape with fn, rebuild the cells,
  // then select the cell the command points at (so the next command can follow without clicking).
  // Returns the ids of the selected cells.
  async reshape(view: any, fn: Op): Promise<string[]> {
    const { api, T, cells } = this.target(view);
    this.layout(view, T);
    const P = parts(api, T), M = copyModel(P.head.customData[MODEL]);
    const C = this.colors(M);
    M.colors = C;   // a table made before colours were kept: it keeps the colours it has now
    const content: Content = {};
    for (const a of anchors(M)) {
      const e = P.rectAt(a.r, a.c), b = P.bound(e), bg = e?.backgroundColor;
      content[key(a.r, a.c)] = { text: textOf(b), imgs: P.imgsAt(a.r, a.c).map((x: any) => x.id), al: alignOf(e, b), fr: ratioOf(e),
        // a cell in the table's own header / cell colour follows the header rows and columns; a colour the user picked moves with the cell
        bg: bg && bg !== "transparent" && bg !== C.header && bg !== C.cell ? bg : undefined };
    }
    const sel: Anchor[] = cells.map((n) => ({ r: n.r, c: n.c, rs: n.rs || 1, cs: n.cs || 1 }));
    const N = fn(M, content, sel);
    // rebuild: delete the old cells, move images to their new cell (or delete them with a deleted cell)
    const x = P.head.x, y = P.head.y, frameId = P.head.frameId ?? null, groups = groupsOf(P.head);
    const old = new Set<string>([...P.rects.map((r: any) => r.id), ...P.rects.map((r: any) => P.bound(r)?.id).filter(Boolean)]);
    const imgAt: Record<string, string> = {};
    for (const [k, v] of Object.entries(N.content)) for (const id of v.imgs || []) imgAt[id] = k;
    api.updateScene({ elements: api.getSceneElements().map((e: any) => {
      if (old.has(e.id)) return upd(e, { isDeleted: true });
      if (isImageOf(e, T)) {
        const k = imgAt[e.id]; if (!k) return upd(e, { isDeleted: true });
        const [r, c] = k.split(",").map(Number);
        return upd(e, { customData: { ...e.customData, [CELL]: { ...e.customData[CELL], r, c } } });
      }
      return e;
    }), ...LATER });
    await this.draw(view, N.M, x, y, frameId, groups.length ? groups : null, N.content);
    commit(api);   // one undo step for the whole command (the selection below is not part of it)
    const f = N.focus ?? sel[0];
    return f ? this.select(view, T, [{ r: Math.min(f.r, N.M.nR - 1), c: Math.min(f.c, N.M.nC - 1) }]) : [];
  }

  // Set the alignment of the selected cells (kept on the cell, so it survives adding rows and merging).
  async align(view: any, al: Align) {
    const { api, T, cells } = this.target(view);
    const P = parts(api, T), ch: any[] = [];
    for (const n of cells) {
      const e = P.rectAt(n.r, n.c); if (!e) continue;
      ch.push(upd(e, { customData: { ...e.customData, [CELL]: { ...e.customData[CELL], al } } }));
      const b = P.bound(e);
      if (b) ch.push(upd(b, { textAlign: al, customData: { ...(b.customData || {}), [TEXT]: true } }));
    }
    api.updateScene({ elements: withChanges(P.els, ch), ...LATER });
    this.layout(view, T);
    commit(api);
  }

  // The selected table for copying out: its cells as text (see Model.cells), and with colours and spans for HTML.
  exportTable(view: any): { cells: (string | null)[][]; table: ExportTable } {
    const api = view.excalidrawAPI, { T } = selectedCells(api);
    if (!T) throw new TableError(this.msg("selectTable"));
    if (!api.getAppState().viewModeEnabled && this.dirty(api, T)) { this.layout(view, T); commit(api); }
    const P = parts(api, T), M: Model | undefined = P.head?.customData?.[MODEL];
    if (!M) throw new TableError(this.msg("selectTable"));
    const cells = M.cells ?? snapshot(P, M), C = this.colors(M);
    const table: ExportTable = { nR: M.nR, nC: M.nC, cols: M.cols, stroke: C.stroke, fontSize: M.fs, cells: [] };
    for (const a of anchors(M)) {
      const e = P.rectAt(a.r, a.c), b = P.bound(e);
      table.cells.push({ ...a, text: (cells[a.r]?.[a.c] ?? "").replace(/<br>/g, "\n"), bg: e?.backgroundColor,
        color: b?.strokeColor ?? C.text ?? C.stroke, align: alignOf(e, b), fs: M.fs * ratioOf(e) });
    }
    return { cells, table };
  }

  // After each pointer up (end of a drag, a click after typing): adopt dropped images, then lay out changed tables.
  // scaledT: the table that was selected as a whole when a resize began.
  tidy(view: any, resized?: boolean, scaledT?: string | null) {
    const api = view.excalidrawAPI, st = api.getAppState();
    // never while typing or dragging (a layout would overwrite the text being typed), nor in view mode
    if (st.editingTextElement || st.newElement || st.resizingElement || st.viewModeEnabled) return;
    const moved = this.adopt(view);
    let changed = moved.size > 0;
    for (const T of tablesIn(api)) {
      if (!moved.has(T) && !this.dirty(api, T)) continue;
      this.layout(view, T, { resized, scaled: !!resized && T === scaledT });
      changed = true;
    }
    // its own undo step, after the user's (Excalidraw has already captured the drag or the typing by now)
    if (changed) commit(api);
  }
}
