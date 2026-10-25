// Follows one Excalidraw view: tidies the tables after a pointer up and after typing, handles the keys
// (Tab / arrows between cells), shows the toolbar and the stretch handles, and the "Insert table" icon in the tab header.

import { sceneX, sceneY } from "./geom";
import { t } from "./i18n";
import { CELL, anchors, cellAt } from "./model";
import { Tables, isCellSelection, modelOf, selectedCells, wholeTableSelected } from "./table";
import { CopyFormat } from "./text";
import { CellToolbar, StretchHandles } from "./toolbar";
import { NEVER, until } from "./util";

export interface Host {
  tables: Tables;
  run(view: any, fn: (view: any) => Promise<unknown>): void;
  openCreate(view: any): void;
  copy(view: any, fmt: CopyFormat): Promise<void>;
}

// queued keys during a hop: plain text, or one of these
const TAB = "\u0000TAB", STAB = "\u0000STAB", ESC = "\u0000ESC", BS = "\u0000BS";
const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

export class ViewHook {
  private offs: (() => void)[] = [];
  private toolbar: CellToolbar;
  private handles: StretchHandles;
  private editing = false;
  private closed = false;
  // keyboard selection: the cell it started from (Shift+arrows grow the range from here) and the cell that moves
  private range: { T: string; anchor: { r: number; c: number }; focus: { r: number; c: number }; ids: string } | null = null;
  // Tab while typing hops to the next cell; keys pressed during the hop are queued and replayed in the next cell
  // (otherwise they would be lost, or taken by Excalidraw as tool shortcuts)
  private moving = false;
  private queue: string[] = [];
  private pressedTable: string | null = null;

  constructor(private host: Host, private view: any) {
    const api = view.excalidrawAPI, tables = host.tables, run = (fn: (v: any) => Promise<unknown>) => host.run(view, fn);
    this.toolbar = new CellToolbar(view, tables, run, (fmt) => host.copy(view, fmt));
    this.handles = new StretchHandles(view, tables, run);
    // "Insert table" icon in the tab header (Obsidian's own view actions, so it does not depend on Excalidraw's toolbar)
    if (typeof view.addAction === "function") {
      const icon: HTMLElement = view.addAction("table", t("create"), () => host.openCreate(view));
      this.offs.push(() => icon.remove());
    }
    const tidy = (resized?: boolean, scaledT?: string | null) => window.setTimeout(() => {
      try { if (!this.closed) tables.tidy(view, resized, scaledT); } catch (e) { console.error("Excalidraw Table", e); }
    }, 60);
    // a pointer up ends a drag; pointerDownState tells whether it was a resize (so a size the user chose is kept).
    // A resize of a table selected as a whole scales the table, font included.
    this.add(api.onPointerUp((_tool: any, pds: any) => tidy(pds?.resize ? !!pds.resize.handleType : undefined, this.pressedTable)));
    // typing ended: tidy at once (not only at the next click). Excalidraw does not always report the end of typing
    // through onChange, so once typing is seen, watch for its end. Also keep the toolbar and handles in place.
    if (api.onChange) this.add(api.onChange((_els: any, st: any) => {
      if (st?.editingTextElement && !this.editing && !this.closed) {
        this.editing = true;
        until(() => this.closed || !api.getAppState().editingTextElement, 6 * 3600 * 1000).then(() => {
          this.editing = false;
          if (!this.closed && !this.moving) tidy(false);
        });
      }
      this.toolbar.place(st);
      this.handles.place(st);
    }));
    // pointer position in drawing coordinates, for placing a pasted table (Excalidraw's own can be stale)
    const onPtr = (ev: PointerEvent) => {
      const st = api.getAppState();
      view._exTablePointer = { x: sceneX(st, ev.clientX), y: sceneY(st, ev.clientY) };
    };
    this.listen(view.contentEl, "pointermove", onPtr);
    this.listen(view.contentEl, "pointerdown", (ev: PointerEvent) => {
      onPtr(ev);
      // which table was selected as a whole when this press began (its handles may resize it)
      this.pressedTable = wholeTableSelected(api);
    });
    this.listen(view.contentEl, "keydown", (ev: KeyboardEvent) => this.key(ev));
    // during a hop the focus may sit outside the view for a moment: catch those keys too
    const win = view.contentEl.ownerDocument.defaultView as Window;
    this.listen(win, "keydown", (ev: KeyboardEvent) => { if (this.moving && !view.contentEl.contains(ev.target as Node)) this.key(ev); });
  }

  private add(off: unknown) { if (typeof off === "function") this.offs.push(off as () => void); }
  private listen(target: EventTarget, type: string, fn: (ev: any) => void) {
    target.addEventListener(type, fn, true);
    this.offs.push(() => target.removeEventListener(type, fn, true));
  }

  detach() {
    this.closed = true;
    for (const off of this.offs) try { off(); } catch { /* view already closed */ }
    this.offs = [];
    this.toolbar.destroy();
    this.handles.destroy();
  }

  // ----- keys -----
  private key(ev: KeyboardEvent) {
    if (!ev.isTrusted) return;   // our own Escape / Enter that end and start typing
    if (this.moving) { this.hold(ev); return; }
    const isTab = ev.key === "Tab", arrow = ARROWS[ev.key];
    if (!isTab && !arrow) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
    const api = this.view.excalidrawAPI, st = api.getAppState();
    if (st.viewModeEnabled) return;
    if (st.editingTextElement) {
      // typing in a cell: Tab confirms the text and moves on, still typing (arrows stay in the text)
      if (!isTab) return;
      const els = api.getSceneElements(), ed = st.editingTextElement;
      const box = els.find((e: any) => e.id === (ed.containerId ?? els.find((x: any) => x.id === ed.id)?.containerId));
      const n = box?.customData?.[CELL];
      if (!n || box.type !== "rectangle") return;
      this.stop(ev);
      this.hop(n, ev.shiftKey ? -1 : 1);
      return;
    }
    // keys typed into Excalidraw's own fields (colour, font size...) or any other input are theirs
    const tg = ev.target as HTMLElement | null;
    if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
    // cells selected inside a table: Tab / Shift+Tab to the next / previous cell, arrows to the neighbour,
    // Shift+arrows grow the selection from the cell it started from
    const { T, cells } = selectedCells(api);
    if (!T || !cells.length) return;
    const M = modelOf(api, T); if (!M || !isCellSelection(st, M, cells)) return;
    this.stop(ev);
    const ids = Object.keys(st.selectedElementIds || {}).sort().join();
    if (!this.range || this.range.T !== T || this.range.ids !== ids) {
      const last = cells[cells.length - 1];
      this.range = { T, anchor: { r: last.r, c: last.c }, focus: { r: last.r, c: last.c }, ids };
    }
    if (isTab) { this.host.run(this.view, () => this.step(T, cells[0].r, cells[0].c, ev.shiftKey ? -1 : 1)); return; }
    const R = this.range, f = cellAt(M, R.focus.r, R.focus.c); if (!f) return;
    // from the far side of a merged cell in the direction of travel
    const r = Math.min(Math.max((arrow[0] > 0 ? f.r + f.rs - 1 : f.r) + arrow[0], 0), M.nR - 1);
    const c = Math.min(Math.max((arrow[1] > 0 ? f.c + f.cs - 1 : f.c) + arrow[1], 0), M.nC - 1);
    const to = cellAt(M, r, c); if (!to) return;
    R.focus = { r: to.r, c: to.c };
    if (!ev.shiftKey) R.anchor = { ...R.focus };
    const r0 = Math.min(R.anchor.r, R.focus.r), r1 = Math.max(R.anchor.r, R.focus.r), c0 = Math.min(R.anchor.c, R.focus.c), c1 = Math.max(R.anchor.c, R.focus.c);
    const at: { r: number; c: number }[] = [];
    for (let i = r0; i <= r1; i++) for (let j = c0; j <= c1; j++) at.push({ r: i, c: j });
    R.ids = this.host.tables.select(this.view, T, at).sort().join();
  }

  private stop(ev: KeyboardEvent) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); }

  // between two cells: queue what is typed (Tab included), swallow everything else
  private hold(ev: KeyboardEvent) {
    if (ev.isComposing) return;
    const plain = !ev.ctrlKey && !ev.metaKey && !ev.altKey;
    if (ev.key === "Tab") this.queue.push(ev.shiftKey ? STAB : TAB);
    else if (ev.key === "Escape") this.queue.push(ESC);
    else if (ev.key === "Backspace") this.queue.push(BS);
    else if (ev.key === "Enter" && plain) this.queue.push("\n");
    else if (ev.key.length === 1 && plain) this.queue.push(ev.key);
    this.stop(ev);
  }

  // Tab while typing: confirm the text, go to the next cell, keep typing. Keys pressed meanwhile are replayed in order,
  // and a queued Tab hops again, so fast typing (Tab, text, Tab, text...) lands in the right cells.
  private async hop(from: { id: string; r: number; c: number }, dir: 1 | -1) {
    const api = this.view.excalidrawAPI;
    this.moving = true; this.queue = [];
    try {
      let cur = from, d = dir;
      for (;;) {
        this.finishTyping();
        await until(() => !api.getAppState().editingTextElement, 500);
        this.host.tables.tidy(this.view, false);
        const to = await this.step(cur.id, cur.r, cur.c, d);
        if (!to) break;
        await this.beginTyping(to);
        await until(() => true, 0);   // let keys that are on their way arrive
        let next = 0, end = false;
        while (this.queue.length && !next && !end) {
          const k = this.queue.shift()!;
          if (k === TAB) next = 1;
          else if (k === STAB) next = -1;
          else if (k === ESC) { this.finishTyping(); end = true; }
          else this.typeIn(k);
        }
        if (!next) break;
        const rect = api.getSceneElements().find((e: any) => e.id === to);
        if (!rect?.customData?.[CELL]) break;
        cur = rect.customData[CELL]; d = next as 1 | -1;
      }
    } catch (e) { console.error("Excalidraw Table", e); }
    finally {
      // anything typed after the last hop goes into the cell being typed in
      for (const k of this.queue) if (!k.startsWith("\u0000") || k === BS) this.typeIn(k);
      this.queue = []; this.moving = false;
    }
  }

  // Excalidraw's text box while typing
  private editor() { return this.view.contentEl.querySelector("textarea.excalidraw-wysiwyg") as HTMLTextAreaElement | null; }

  private typeIn(k: string) {
    const ta = this.editor(); if (!ta) return;
    ta.focus();
    if (k === BS) ta.ownerDocument.execCommand("delete");
    else ta.ownerDocument.execCommand("insertText", false, k);
  }

  // Next / previous cell in reading order; Tab in the last cell adds a row.
  // Returns the id of the cell moved to, or null at the very first cell.
  private async step(T: string, r: number, c: number, dir: 1 | -1): Promise<string | null> {
    const api = this.view.excalidrawAPI, tables = this.host.tables, M = modelOf(api, T); if (!M) return null;
    const list = anchors(M), cur = cellAt(M, r, c), i = list.findIndex((a) => a.r === cur?.r && a.c === cur?.c);
    const next = list[i + dir];
    if (next) return tables.select(this.view, T, [{ r: next.r, c: next.c }])[0] ?? null;
    if (dir < 0 || !cur) { if (cur) tables.select(this.view, T, [{ r: cur.r, c: cur.c }]); return null; }
    tables.select(this.view, T, [{ r: M.nR - 1, c: 0 }]);
    await until(() => selectedCells(api).T === T, 300);
    return (await tables.reshape(this.view, tables.ops.addRow))[0] ?? null;   // selects the first cell of the new row
  }

  // Excalidraw's text box ends typing on Escape; Enter on a selected box starts it
  private finishTyping() {
    this.editor()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  }
  private startTyping() {
    const el = (this.view.contentEl.querySelector(".excalidraw") as HTMLElement | null) ?? this.view.contentEl;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
  }

  // start typing in the given cell (retry if Excalidraw was not ready)
  private async beginTyping(cellId: string) {
    const api = this.view.excalidrawAPI;
    const selected = () => { const s = api.getAppState().selectedElementIds || {}; return !!s[cellId] && Object.keys(s).length === 1; };
    const typingIn = () => {
      const ed = api.getAppState().editingTextElement; if (!ed) return false;
      const live = api.getSceneElements().find((e: any) => e.id === ed.id);
      return (ed.containerId ?? live?.containerId) === cellId;
    };
    // Enter starts typing in whatever is selected, so first wait until Excalidraw has the new cell selected
    await until(selected, 500);
    for (let i = 0; i < 3 && !typingIn(); i++) {
      if (api.getAppState().editingTextElement) { this.finishTyping(); await until(() => !api.getAppState().editingTextElement, 300); }
      if (!selected()) { api.updateScene({ appState: { selectedElementIds: { [cellId]: true }, selectedGroupIds: {} }, ...NEVER }); await until(selected, 300); }
      this.startTyping();
      if (await until(typingIn, 300)) break;
    }
  }
}
