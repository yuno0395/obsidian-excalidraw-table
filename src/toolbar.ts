// Things drawn over the canvas: the toolbar shown above a table while cells are selected,
// and the stretch handles shown on a selected table.

import { Menu, setIcon } from "obsidian";
import { t, MsgKey } from "./i18n";
import { bounds, screenX, screenY, zoomOf } from "./geom";
import { Align, OpName } from "./model";
import { Tables, cellRects, isCellSelection, modelOf, selectedCells, wholeTableSelected } from "./table";
import { CopyFormat } from "./text";

type Run = (fn: (view: any) => Promise<unknown>) => void;

// Nothing is shown over the canvas in view mode, while typing, or while something is dragged, resized or drawn.
const busy = (st: any) =>
  !st || st.viewModeEnabled || st.editingTextElement || st.selectedElementsAreBeingDragged || st.resizingElement || st.newElement;

export class CellToolbar {
  private bar: HTMLElement | null = null;

  constructor(private view: any, private tables: Tables, private run: Run, private copy: (fmt: CopyFormat) => Promise<void>) {}

  destroy() { this.bar?.remove(); this.bar = null; }

  private hide() { if (this.bar) this.bar.style.display = "none"; }

  // Show the toolbar above the table of the selected cells (at the left of the selection), or hide it.
  place(st: any) {
    const api = this.view.excalidrawAPI;
    if (busy(st)) return this.hide();
    const { T, cells } = selectedCells(api); if (!T || !cells.length) return this.hide();
    const M = modelOf(api, T); if (!M || !isCellSelection(st, M, cells)) return this.hide();
    const ids = new Set(Object.keys(st.selectedElementIds || {}));
    const all = cellRects(api, T), sel = bounds(all.filter((e: any) => ids.has(e.id))), box = bounds(all);
    if (!sel || !box) return this.hide();
    // above the table (so it never hides a cell); below it if there is no room above
    const one = cells.length === 1 ? cells[0] : null;
    const bar = this.build(cells.length > 1, !!one && ((one.rs || 1) > 1 || (one.cs || 1) > 1));
    bar.style.display = "flex";
    const h = bar.offsetHeight || 32;
    let top = screenY(st, box.y0) - h - 10;
    if (top < st.offsetTop + 4) top = screenY(st, box.y1) + 10;
    placeFixed(bar, Math.max(st.offsetLeft + 4, screenX(st, sel.x0)), top);
  }

  // The buttons depend on the selection (merge for several cells, unmerge for a merged cell); rebuilt only when that changes.
  private build(many: boolean, merged: boolean): HTMLElement {
    const sig = `${many}|${merged}`;
    if (this.bar && this.bar.dataset.sig === sig) return this.bar;
    this.bar?.remove();
    const bar = (this.view.contentEl.ownerDocument as Document).createElement("div");
    bar.dataset.sig = sig;
    Object.assign(bar.style, {
      position: "fixed", zIndex: "30", display: "flex", gap: "2px", alignItems: "center", padding: "3px",
      background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)",
      borderRadius: "var(--radius-m, 6px)", boxShadow: "var(--shadow-s)", fontSize: "var(--font-ui-smaller, 12px)",
    });
    const tables = this.tables;
    // a button with a text label or an icon; pressing it does not take the focus or the selection from the canvas
    const button = (title: MsgKey, look: { label?: MsgKey; icon?: string }, onClick: (e: MouseEvent) => void) => {
      const b = bar.createEl("button", { attr: { "aria-label": t(title) } });
      Object.assign(b.style, { padding: "2px 6px", height: "24px", fontSize: "inherit", boxShadow: "none" });
      if (look.icon) setIcon(b, look.icon); else b.setText(t(look.label ?? title));
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); });
    };
    // a command on the selected cells; the canvas gets the keyboard back afterwards
    const command = (title: MsgKey, look: { label?: MsgKey; icon?: string }, fn: (v: any) => Promise<unknown>) =>
      button(title, look, () => this.run(async (v) => { await fn(v); (v.contentEl.querySelector(".excalidraw") as HTMLElement | null)?.focus(); }));
    const op = (name: OpName, title: MsgKey, label: MsgKey) => command(title, { label }, (v) => tables.reshape(v, tables.ops[name]));
    const align = (a: Align, title: MsgKey, icon: string) => command(title, { icon }, (v) => tables.align(v, a));
    const gap = () => Object.assign(bar.createDiv().style, { width: "1px", alignSelf: "stretch", margin: "2px 3px", background: "var(--background-modifier-border)" });
    op("addRowAbove", "addRowAbove", "tbAbove");
    op("addRow", "addRow", "tbBelow");
    op("addColLeft", "addColLeft", "tbLeft");
    op("addCol", "addCol", "tbRight");
    gap();
    op("delRow", "delRow", "delRow");
    op("delCol", "delCol", "delCol");
    if (many) { gap(); op("merge", "merge", "merge"); }
    else if (merged) { gap(); op("unmerge", "unmerge", "unmerge"); }
    gap();
    align("left", "alignLeft", "align-left");
    align("center", "alignCenter", "align-center");
    align("right", "alignRight", "align-right");
    gap();
    // copy the table out: a small menu of formats
    button("copyTable", { icon: "clipboard-copy" }, (e) => {
      const menu = new Menu();
      const item = (title: MsgKey, icon: string, fmt: CopyFormat) =>
        menu.addItem((i) => i.setTitle(t(title)).setIcon(icon).onClick(() => this.run(() => this.copy(fmt))));
      item("copyOffice", "table", "office");
      item("copyCsv", "file-spreadsheet", "csv");
      item("copyMd", "file-text", "md");
      menu.showAtMouseEvent(e);
    });
    this.view.contentEl.appendChild(bar);
    this.bar = bar;
    return bar;
  }
}

// Put a position:fixed element at (x, y) in window coordinates. The pane may be the containing block of a fixed element
// (then "fixed" is relative to the pane): measure where it lands and correct for it.
function placeFixed(el: HTMLElement, x: number, y: number) {
  el.style.left = x + "px"; el.style.top = y + "px";
  const got = el.getBoundingClientRect();
  if (Math.abs(got.left - x) > 1 || Math.abs(got.top - y) > 1) { el.style.left = 2 * x - got.left + "px"; el.style.top = 2 * y - got.top + "px"; }
}

// Handles on the right and bottom edges of a selected table: stretch it only sideways or only downwards.
// (Excalidraw keeps the proportions when a group with text in it is resized, and has no side handles for groups.)
export class StretchHandles {
  private els: { w: HTMLElement; h: HTMLElement; ghost: HTMLElement } | null = null;
  private drag: { T: string; dir: "w" | "h"; x0: number; y0: number; box: DOMRect; size: number } | null = null;

  constructor(private view: any, private tables: Tables, private run: Run) {}

  destroy() { if (this.els) { this.els.w.remove(); this.els.h.remove(); this.els.ghost.remove(); } this.els = null; }

  private hide() { if (this.els && !this.drag) { this.els.w.style.display = "none"; this.els.h.style.display = "none"; } }

  // Shown while the table as a whole is selected (not cells inside it).
  place(st: any) {
    if (this.drag) return;
    const api = this.view.excalidrawAPI;
    if (busy(st)) return this.hide();
    const T = wholeTableSelected(api); if (!T) return this.hide();
    const b = this.screenBox(T, st); if (!b) return this.hide();
    const { w, h } = this.build();
    w.dataset.t = T; h.dataset.t = T;
    w.style.display = "block"; h.style.display = "block";
    // just outside the edge, in the middle (clear of Excalidraw's own corner handles)
    placeFixed(w, b.right + 10, b.y + b.height / 2 - 14);
    placeFixed(h, b.x + b.width / 2 - 14, b.bottom + 10);
  }

  private build() {
    if (this.els) return this.els;
    const doc = this.view.contentEl.ownerDocument as Document;
    const handle = (dir: "w" | "h", title: MsgKey) => {
      const el = doc.createElement("div");
      el.setAttribute("aria-label", t(title));
      Object.assign(el.style, {
        position: "fixed", zIndex: "30", display: "none", borderRadius: "3px", touchAction: "none",
        background: "var(--interactive-accent)", border: "1px solid var(--background-primary)", boxShadow: "var(--shadow-s)",
        width: dir === "w" ? "8px" : "28px", height: dir === "w" ? "28px" : "8px", cursor: dir === "w" ? "ew-resize" : "ns-resize",
      });
      el.addEventListener("pointerdown", (e) => this.start(e, el, dir));
      el.addEventListener("pointermove", (e) => this.move(e));
      el.addEventListener("pointerup", (e) => this.end(e, el));
      el.addEventListener("pointercancel", () => this.cancel());
      this.view.contentEl.appendChild(el);
      return el;
    };
    const ghost = doc.createElement("div");
    Object.assign(ghost.style, { position: "fixed", zIndex: "29", display: "none", pointerEvents: "none", border: "1px dashed var(--interactive-accent)" });
    this.view.contentEl.appendChild(ghost);
    this.els = { w: handle("w", "stretchW"), h: handle("h", "stretchH"), ghost };
    return this.els;
  }

  // the table's box on screen
  private screenBox(T: string, st = this.view.excalidrawAPI.getAppState()): DOMRect | null {
    const b = bounds(cellRects(this.view.excalidrawAPI, T)); if (!b) return null;
    const z = zoomOf(st);
    return new DOMRect(screenX(st, b.x0), screenY(st, b.y0), (b.x1 - b.x0) * z, (b.y1 - b.y0) * z);
  }

  private start(e: PointerEvent, el: HTMLElement, dir: "w" | "h") {
    e.preventDefault(); e.stopPropagation();
    const T = el.dataset.t, box = T && this.screenBox(T); if (!T || !box) return;
    el.setPointerCapture(e.pointerId);
    this.drag = { T, dir, x0: e.clientX, y0: e.clientY, box, size: dir === "w" ? box.width : box.height };
    this.ghostAt(box);
  }

  private move(e: PointerEvent) {
    const d = this.drag; if (!d) return;
    e.preventDefault(); e.stopPropagation();
    d.size = Math.max(4, d.dir === "w" ? d.box.width + e.clientX - d.x0 : d.box.height + e.clientY - d.y0);
    this.ghostAt(new DOMRect(d.box.x, d.box.y, d.dir === "w" ? d.size : d.box.width, d.dir === "h" ? d.size : d.box.height));
  }

  private end(e: PointerEvent, el: HTMLElement) {
    const d = this.drag; if (!d) return;
    e.preventDefault(); e.stopPropagation();
    try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    this.cancel();
    const f = d.size / (d.dir === "w" ? d.box.width : d.box.height);
    if (Math.abs(f - 1) < 0.002) return;
    this.run(async (v) => this.tables.scale(v, d.T, d.dir === "w" ? f : 1, d.dir === "h" ? f : 1));
  }

  private cancel() {
    this.drag = null;
    if (this.els) this.els.ghost.style.display = "none";
  }

  private ghostAt(b: DOMRect) {
    const g = this.els!.ghost;
    g.style.display = "block"; g.style.width = b.width + "px"; g.style.height = b.height + "px";
    placeFixed(g, b.x, b.y);
  }
}
