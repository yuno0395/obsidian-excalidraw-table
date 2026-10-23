import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, WorkspaceLeaf, setIcon } from "obsidian";
import { Align, DEFAULT_SETTINGS, TableError, Tables, TableSettings, anchors, cellAt, modelOf, parseTable, selectedCells } from "./table";
import { t, MsgKey } from "./i18n";

const EXCALIDRAW = "obsidian-excalidraw-plugin";

export default class ExcalidrawTablePlugin extends Plugin {
  settings: TableSettings;
  tables: Tables;
  private hooks = new Map<any, ViewHook>();
  private paste: { ea: any; prev: any; mine: any } | null = null;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.tables = new Tables((view) => this.ea(view), () => this.settings, (k) => t(k as MsgKey));

    const cmd = (id: string, name: MsgKey, run: (view: any) => Promise<unknown>) =>
      this.addCommand({
        id, name: t(name),
        checkCallback: (checking) => {
          const view = this.activeView(); if (!view) return false;
          if (!checking) this.run(view, run);
          return true;
        },
      });
    const ops = this.tables.ops, reshape = (op: string) => (v: any) => this.tables.reshape(v, ops[op]);
    cmd("insert-table", "create", async (view) => this.openCreate(view));
    cmd("add-row", "addRow", reshape("addRow"));
    cmd("add-row-above", "addRowAbove", reshape("addRowAbove"));
    cmd("add-column", "addCol", reshape("addCol"));
    cmd("add-column-left", "addColLeft", reshape("addColLeft"));
    cmd("delete-row", "delRow", reshape("delRow"));
    cmd("delete-column", "delCol", reshape("delCol"));
    cmd("merge-cells", "merge", reshape("merge"));
    cmd("unmerge-cells", "unmerge", reshape("unmerge"));
    cmd("toggle-header-row", "toggleHeaderRow", reshape("toggleHeaderRow"));
    cmd("toggle-header-column", "toggleHeaderCol", reshape("toggleHeaderCol"));
    cmd("align-left", "alignLeft", (v) => this.tables.align(v, "left"));
    cmd("align-center", "alignCenter", (v) => this.tables.align(v, "center"));
    cmd("align-right", "alignRight", (v) => this.tables.align(v, "right"));
    cmd("copy-markdown", "copyMd", (v) => this.copy(v, "md"));
    cmd("copy-tsv", "copyTsv", (v) => this.copy(v, "tsv"));

    this.addSettingTab(new TableSettingTab(this.app, this));

    // follow every Excalidraw view: tidy the tables after a drag or a click, keys and the cell toolbar
    this.app.workspace.onLayoutReady(() => {
      if (!this.excalidraw()) new Notice(t("noExcalidraw"));
      this.installPaste();
      this.attachAll();
      this.registerEvent(this.app.workspace.on("layout-change", () => this.attachAll()));
      this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.attachAll()));
    });
  }

  onunload() {
    for (const h of this.hooks.values()) h.detach();
    this.hooks.clear();
    if (this.paste && this.paste.ea.onPasteHook === this.paste.mine) this.paste.ea.onPasteHook = this.paste.prev;
    this.paste = null;
  }

  async saveSettings() { await this.saveData(this.settings); }

  openCreate(view: any) { new CreateModal(this.app, (c, r, h) => this.tables.create(view, c, r, h)).open(); }

  run(view: any, fn: (view: any) => Promise<any>) {
    fn(view).catch((e) => new Notice(e instanceof TableError ? e.message : `Excalidraw Table: ${e?.message ?? e}`));
  }

  private async copy(view: any, fmt: "md" | "tsv") {
    await navigator.clipboard.writeText(await this.tables.text(view, fmt));
    new Notice(t("copied"));
  }

  private excalidraw(): any { return (this.app as any).plugins?.plugins?.[EXCALIDRAW]; }

  private ea(view: any): any {
    const EA = (window as any).ExcalidrawAutomate ?? this.excalidraw()?.ea;
    if (!EA) throw new TableError(t("noExcalidraw"));
    return typeof EA.getAPI === "function" ? EA.getAPI(view) : EA;
  }

  private activeView(): any {
    const v: any = this.app.workspace.getMostRecentLeaf()?.view ?? this.app.workspace.activeLeaf?.view;
    return v?.getViewType?.() === "excalidraw" && v.excalidrawAPI ? v : null;
  }

  // Pasting cells from a spreadsheet, or a Markdown table, makes a table. Excalidraw calls ea.onPasteHook before its own paste;
  // returning false stops its own handling. The hook a script set before us is kept and called for anything that is not a table.
  private installPaste() {
    const ea = this.excalidraw()?.ea; if (!ea || this.paste) return;
    const prev = ea.onPasteHook;
    const mine = (data: any) => {
      try {
        if (this.settings.pasteAsTable && data?.view?.excalidrawAPI && !data.view.modifierKeyDown?.shiftKey) {
          const text = data.event?.clipboardData?.getData?.("text/plain") || data.payload?.text || "";
          const rows = data.payload?.elements?.length || data.payload?.files ? null : parseTable(text);
          if (rows) {
            // where the pointer is (tracked by the view hook; Excalidraw's own position can be stale)
            const p = data.view._exTablePointer ?? data.pointerPosition;
            const at = p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : undefined;
            this.run(data.view, (v) => this.tables.create(v, rows[0].length, rows.length, true, { rows, at }));
            return false;
          }
        }
      } catch (e) { console.error("Excalidraw Table: paste", e); }
      return typeof prev === "function" ? prev(data) : true;
    };
    ea.onPasteHook = mine;
    this.paste = { ea, prev, mine };
  }

  private attachAll() {
    this.app.workspace.getLeavesOfType("excalidraw").forEach((leaf: WorkspaceLeaf) => this.attach(leaf.view, 0));
    for (const [view, h] of this.hooks) if (!view.excalidrawAPI || view.excalidrawAPI.isDestroyed) { h.detach(); this.hooks.delete(view); }
  }

  // the canvas API appears a little after the view opens, so retry for a few seconds
  private attach(view: any, tries: number) {
    if (this.hooks.has(view)) return;
    const api = view?.excalidrawAPI;
    if (!api?.onPointerUp) { if (tries < 20) window.setTimeout(() => this.attach(view, tries + 1), 250); return; }
    this.hooks.set(view, new ViewHook(this, view));
  }
}

// ---------- one Excalidraw view: tidy after pointer up and after typing, keys, toolbar ----------
class ViewHook {
  private offs: (() => void)[] = [];
  private bar: HTMLElement | null = null;
  private editing = false;
  private closed = false;
  private anchor: { T: string; r: number; c: number } | null = null;
  // Tab while typing hops to the next cell; keys pressed during the hop are held and typed into the next cell
  // (otherwise they would be lost, or taken by Excalidraw as tool shortcuts)
  private moving = false;
  private queue: string[] = [];

  constructor(private plugin: ExcalidrawTablePlugin, private view: any) {
    const api = view.excalidrawAPI, tables = plugin.tables;
    // "Insert table" icon in the tab header (Obsidian's own view actions, so it does not depend on Excalidraw's toolbar)
    if (typeof view.addAction === "function") {
      const icon: HTMLElement = view.addAction("table", t("create"), () => plugin.openCreate(view));
      this.offs.push(() => icon.remove());
    }
    const tidy = (resized?: boolean) => window.setTimeout(() => tables.onPointerUp(view, resized).catch((e) => console.error("Excalidraw Table", e)), 60);
    // a pointer up ends a drag; pointerDownState tells whether it was a resize (so a size the user chose is kept)
    this.add(api.onPointerUp((_tool: any, pds: any) => tidy(pds?.resize ? !!pds.resize.handleType : undefined)));
    // typing ended: tidy at once (not only at the next click). Excalidraw does not always report the end of typing
    // through onChange, so once typing is seen, watch for its end. Also keep the toolbar next to the selection.
    if (api.onChange) this.add(api.onChange((_els: any, st: any) => {
      if (st?.editingTextElement && !this.editing && !this.closed) {
        this.editing = true;
        until(() => this.closed || !api.getAppState().editingTextElement, 6 * 3600 * 1000).then(() => {
          this.editing = false;
          if (!this.closed && !this.moving) tidy(false);
        });
      }
      this.place(st);
    }));
    // pointer position in drawing coordinates, for placing a pasted table
    const onPtr = (ev: PointerEvent) => {
      const st = api.getAppState(), z = st.zoom?.value ?? 1;
      view._exTablePointer = { x: (ev.clientX - st.offsetLeft) / z - st.scrollX, y: (ev.clientY - st.offsetTop) / z - st.scrollY };
    };
    for (const type of ["pointermove", "pointerdown"]) {
      view.contentEl.addEventListener(type, onPtr, true);
      this.offs.push(() => view.contentEl.removeEventListener(type, onPtr, true));
    }
    const onKey = (ev: KeyboardEvent) => this.key(ev);
    view.contentEl.addEventListener("keydown", onKey, true);
    this.offs.push(() => view.contentEl.removeEventListener("keydown", onKey, true));
    // during a hop the focus may sit outside the view for a moment: catch those keys too
    const win = view.contentEl.ownerDocument.defaultView as Window;
    const onWinKey = (ev: KeyboardEvent) => { if (this.moving && !view.contentEl.contains(ev.target as Node)) this.key(ev); };
    win.addEventListener("keydown", onWinKey, true);
    this.offs.push(() => win.removeEventListener("keydown", onWinKey, true));
  }

  private add(off: any) { if (typeof off === "function") this.offs.push(off); }

  detach() {
    this.closed = true;
    for (const off of this.offs) try { off(); } catch { /* view already closed */ }
    this.offs = []; this.bar?.remove(); this.bar = null;
  }

  // ----- keys: Tab / Shift+Tab to the next / previous cell, arrows to the neighbour, Shift+arrows to widen the selection -----
  private key(ev: KeyboardEvent) {
    if (!ev.isTrusted) return;   // our own Escape / Enter that end and start typing
    if (this.moving) {   // between two cells: queue what is typed (Tab included), swallow everything else
      if (ev.isComposing) return;
      const plain = !ev.ctrlKey && !ev.metaKey && !ev.altKey;
      if (ev.key === "Tab") this.queue.push(ev.shiftKey ? "\u0000STAB" : "\u0000TAB");
      else if (ev.key === "Escape") this.queue.push("\u0000ESC");
      else if (ev.key === "Backspace") this.queue.push("\u0000BS");
      else if (ev.key === "Enter" && plain) this.queue.push("\n");
      else if (ev.key.length === 1 && plain) this.queue.push(ev.key);
      this.stop(ev);
      return;
    }
    const api = this.view.excalidrawAPI, st = api.getAppState(), tables = this.plugin.tables;
    const isTab = ev.key === "Tab", arrow = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as any)[ev.key];
    if (!isTab && !arrow) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
    if (st.editingTextElement) {
      // typing in a cell: Tab confirms the text and moves on, still typing (arrows stay in the text)
      if (!isTab) return;
      const els = api.getSceneElements(), ed = st.editingTextElement;
      const box = els.find((e: any) => e.id === (ed.containerId ?? els.find((x: any) => x.id === ed.id)?.containerId));
      const n = box?.customData?.exTable; if (!n || box.type !== "rectangle") return;
      this.stop(ev);
      this.hop(n, ev.shiftKey ? -1 : 1);
      return;
    }
    // a cell is selected inside the table
    const { T, cells } = selectedCells(api);
    if (!T || !cells.length) return;
    const M = modelOf(api, T); if (!M || !inside(st, M, cells)) return;
    this.stop(ev);
    const cur = cells.length === 1 || !this.anchor || this.anchor.T !== T ? cells[cells.length - 1] : null;
    if (cur) this.anchor = { T, r: cur.r, c: cur.c };
    if (isTab) { this.plugin.run(this.view, () => this.step(T, cells[0].r, cells[0].c, ev.shiftKey ? -1 : 1)); return; }
    // arrows move from the last cell of the selection; with Shift the selection grows from the anchor cell
    const last = cells[cells.length - 1], lr = last.r + (arrow[0] > 0 ? (last.rs || 1) - 1 : 0), lc = last.c + (arrow[1] > 0 ? (last.cs || 1) - 1 : 0);
    const r = Math.min(Math.max(lr + arrow[0], 0), M.nR - 1), c = Math.min(Math.max(lc + arrow[1], 0), M.nC - 1);
    const to = cellAt(M, r, c); if (!to) return;
    if (!ev.shiftKey) { this.anchor = { T, r: to.r, c: to.c }; tables.select(this.view, T, [{ r: to.r, c: to.c }]); return; }
    const a = this.anchor!, r0 = Math.min(a.r, to.r), r1 = Math.max(a.r, to.r), c0 = Math.min(a.c, to.c), c1 = Math.max(a.c, to.c);
    const at: { r: number; c: number }[] = [];
    for (let i = r0; i <= r1; i++) for (let j = c0; j <= c1; j++) at.push({ r: i, c: j });
    tables.select(this.view, T, at);
  }

  private stop(ev: KeyboardEvent) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); }

  // Tab while typing: confirm the text, go to the next cell, keep typing. Keys pressed meanwhile are replayed in order,
  // and a queued Tab hops again, so fast typing (Tab, text, Tab, text...) lands in the right cells.
  private async hop(from: { id: string; r: number; c: number }, dir: 1 | -1) {
    const api = this.view.excalidrawAPI, tables = this.plugin.tables;
    this.moving = true; this.queue = [];
    try {
      let cur = from, d = dir;
      for (;;) {
        this.finishTyping();
        await until(() => !api.getAppState().editingTextElement, 500);
        await tables.onPointerUp(this.view, false);
        const to = await this.step(cur.id, cur.r, cur.c, d);
        if (!to) break;
        await this.beginTyping(to);
        let next = 0, end = false;
        await until(() => true, 0);   // let keys that are on their way arrive
        while (this.queue.length && !next && !end) {
          const k = this.queue.shift()!;
          if (k === "\u0000TAB") next = 1;
          else if (k === "\u0000STAB") next = -1;
          else if (k === "\u0000ESC") { this.finishTyping(); end = true; }
          else this.typeIn(k);
        }
        if (!next) break;
        const rect = api.getSceneElements().find((e: any) => e.id === to);
        if (!rect?.customData?.exTable) break;
        cur = rect.customData.exTable; d = next as 1 | -1;
      }
    } catch (e) { console.error("Excalidraw Table", e); }
    finally {
      // anything typed after the last hop goes into the cell being typed in
      for (const k of this.queue) if (!k.startsWith("\u0000") || k === "\u0000BS") this.typeIn(k);
      this.queue = []; this.moving = false;
    }
  }

  private typeIn(k: string) {
    const ta = this.view.contentEl.querySelector("textarea.excalidraw-wysiwyg") as HTMLTextAreaElement | null; if (!ta) return;
    ta.focus();
    if (k === "\u0000BS") ta.ownerDocument.execCommand("delete");
    else ta.ownerDocument.execCommand("insertText", false, k);
  }

  // next / previous cell in reading order; Tab in the last cell adds a row.
  // Returns the id of the cell moved to, or null at the very first cell.
  private async step(T: string, r: number, c: number, dir: 1 | -1): Promise<string | null> {
    const api = this.view.excalidrawAPI, tables = this.plugin.tables, M = modelOf(api, T); if (!M) return null;
    const list = anchors(M), cur = cellAt(M, r, c), i = list.findIndex((a) => a.r === cur?.r && a.c === cur?.c);
    const next = list[i + dir];
    if (next) return tables.select(this.view, T, [{ r: next.r, c: next.c }]);
    if (dir < 0) { tables.select(this.view, T, [{ r: cur!.r, c: cur!.c }]); return null; }
    tables.select(this.view, T, [{ r: M.nR - 1, c: 0 }]);
    await until(() => !!api.getAppState().selectedElementIds && selectedCells(api).T === T, 300);
    return tables.reshape(this.view, tables.ops.addRow);   // selects the first cell of the new row
  }

  // Excalidraw's text box ends typing on Escape; Enter on a selected box starts it
  private finishTyping() {
    const ta = this.view.contentEl.querySelector("textarea.excalidraw-wysiwyg") as HTMLTextAreaElement | null;
    if (!ta) return;
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  }
  private startTyping() {
    const el = (this.view.contentEl.querySelector(".excalidraw") as HTMLElement) ?? this.view.contentEl;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
  }
  // start typing in the selected cell (retry if Excalidraw was not ready)
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
      if (!selected()) { api.updateScene({ appState: { selectedElementIds: { [cellId]: true }, selectedGroupIds: {} } }); await until(selected, 300); }
      this.startTyping();
      if (await until(typingIn, 300)) break;
    }
  }

  // ----- toolbar above the selected cells -----
  private place(st: any) {
    const api = this.view.excalidrawAPI;
    const hide = () => { if (this.bar) this.bar.style.display = "none"; };
    if (!st || st.editingTextElement || st.selectedElementsAreBeingDragged || st.resizingElement || st.newElement) return hide();
    const { T, cells } = selectedCells(api); if (!T || !cells.length) return hide();
    const M = modelOf(api, T); if (!M || !inside(st, M, cells)) return hide();
    const ids = new Set(Object.keys(st.selectedElementIds || {}));
    const rects = api.getSceneElements().filter((e: any) => e.type === "rectangle" && e.customData?.exTable?.id === T && ids.has(e.id));
    if (!rects.length) return hide();
    const z = st.zoom?.value ?? 1;
    // above the table (so it never hides a cell), at the left of the selection; below the table if there is no room above
    const all = api.getSceneElements().filter((e: any) => e.type === "rectangle" && e.customData?.exTable?.id === T && !e.isDeleted);
    const x0 = Math.min(...rects.map((e: any) => e.x)), y0 = Math.min(...all.map((e: any) => e.y)), y1 = Math.max(...all.map((e: any) => e.y + e.height));
    const bar = this.toolbar(cells.length > 1, cells.length === 1 && ((cells[0].rs || 1) > 1 || (cells[0].cs || 1) > 1));
    bar.style.display = "flex";
    const h = bar.offsetHeight || 32, left = (x0 + st.scrollX) * z + st.offsetLeft;
    let top = (y0 + st.scrollY) * z + st.offsetTop - h - 10;
    if (top < st.offsetTop + 4) top = (y1 + st.scrollY) * z + st.offsetTop + 10;   // no room above: below the cells
    // the pane may be the containing block of a fixed element: measure where "0,0" lands and correct for it
    const want = { x: Math.max(st.offsetLeft + 4, left), y: top };
    bar.style.left = want.x + "px"; bar.style.top = want.y + "px";
    const got = bar.getBoundingClientRect();
    if (Math.abs(got.left - want.x) > 1 || Math.abs(got.top - want.y) > 1) {
      bar.style.left = want.x - (got.left - want.x) + "px"; bar.style.top = want.y - (got.top - want.y) + "px";
    }
  }

  private toolbar(many: boolean, merged: boolean): HTMLElement {
    const sig = `${many}|${merged}`;
    if (this.bar && this.bar.dataset.sig === sig) return this.bar;
    this.bar?.remove();
    const doc = this.view.contentEl.ownerDocument as Document;
    const bar = doc.createElement("div");
    bar.dataset.sig = sig;
    Object.assign(bar.style, {
      position: "fixed", zIndex: "30", display: "flex", gap: "2px", alignItems: "center", padding: "3px",
      background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)",
      borderRadius: "var(--radius-m, 6px)", boxShadow: "var(--shadow-s)", fontSize: "var(--font-ui-smaller, 12px)",
    } as CSSStyleDeclaration);
    const tables = this.plugin.tables, ops = tables.ops;
    const btn = (label: string, title: string, fn: (v: any) => Promise<any>, icon?: string) => {
      const b = bar.createEl("button", { attr: { "aria-label": title } });
      Object.assign(b.style, { padding: "2px 6px", height: "24px", fontSize: "inherit", boxShadow: "none" });
      if (icon) setIcon(b, icon); else b.setText(label);
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        this.plugin.run(this.view, async (v) => { await fn(v); (v.contentEl.querySelector(".excalidraw") as HTMLElement)?.focus(); });
      });
    };
    const gap = () => { const s = bar.createDiv(); Object.assign(s.style, { width: "1px", alignSelf: "stretch", margin: "2px 3px", background: "var(--background-modifier-border)" }); };
    const re = (op: string) => (v: any) => tables.reshape(v, ops[op]);
    btn(t("tbAbove"), t("addRowAbove"), re("addRowAbove"));
    btn(t("tbBelow"), t("addRow"), re("addRow"));
    btn(t("tbLeft"), t("addColLeft"), re("addColLeft"));
    btn(t("tbRight"), t("addCol"), re("addCol"));
    gap();
    btn(t("delRow"), t("delRow"), re("delRow"));
    btn(t("delCol"), t("delCol"), re("delCol"));
    if (many || merged) { gap(); if (many) btn(t("merge"), t("merge"), re("merge")); else btn(t("unmerge"), t("unmerge"), re("unmerge")); }
    gap();
    const al = (a: Align, k: MsgKey, icon: string) => btn("", t(k), (v) => tables.align(v, a), icon);
    al("left", "alignLeft", "align-left"); al("center", "alignCenter", "align-center"); al("right", "alignRight", "align-right");
    this.view.contentEl.appendChild(bar);
    this.bar = bar;
    return bar;
  }
}

// cells are selected (not the table as a whole): inside the table's group, or only part of the table
function inside(st: any, M: any, cells: any[]) {
  return !!st.editingGroupId || cells.length < anchors(M).length;
}

// wait until test() is true (checked every frame-ish), at most ms; returns whether it became true
function until(test: () => boolean, ms: number): Promise<boolean> {
  return new Promise((done) => {
    const t0 = Date.now();
    const tick = () => { if (test()) return done(true); if (Date.now() - t0 >= ms) return done(false); window.setTimeout(tick, 16); };
    window.setTimeout(tick, 16);
  });
}

// ---------- dialog: size by pointing at a grid, or by typing ----------
class CreateModal extends Modal {
  constructor(app: App, private done: (cols: number, rows: number, header: boolean) => Promise<any>) { super(app); }
  onOpen() {
    let cols = 3, rows = 3, header = true;
    this.titleEl.setText(t("createTitle"));
    const GC = 10, GR = 8, cellsEl: HTMLElement[][] = [];
    const hint = this.contentEl.createDiv({ text: t("gridHint") });
    Object.assign(hint.style, { color: "var(--text-muted)", fontSize: "var(--font-ui-small)", marginBottom: "6px" });
    const grid = this.contentEl.createDiv();
    Object.assign(grid.style, { display: "grid", gridTemplateColumns: `repeat(${GC}, 20px)`, gap: "3px", marginBottom: "12px", width: "max-content" });
    const inputs: Record<string, TextComponent> = {};
    const paint = (c: number, r: number) => cellsEl.forEach((row, i) => row.forEach((el, j) => {
      const on = i < r && j < c;
      el.style.background = on ? "var(--interactive-accent)" : "var(--background-modifier-hover)";
      el.style.borderColor = on ? "var(--interactive-accent)" : "var(--background-modifier-border)";
    }));
    const show = (c: number, r: number) => { inputs.columns?.setValue(String(c)); inputs.rows?.setValue(String(r)); paint(c, r); };
    for (let i = 0; i < GR; i++) {
      cellsEl.push([]);
      for (let j = 0; j < GC; j++) {
        const el = grid.createDiv();
        Object.assign(el.style, { width: "20px", height: "20px", border: "1px solid", borderRadius: "3px", cursor: "pointer" });
        el.addEventListener("mouseenter", () => { cols = j + 1; rows = i + 1; show(cols, rows); });
        el.addEventListener("click", () => { cols = j + 1; rows = i + 1; submit(); });
        cellsEl[i].push(el);
      }
    }
    grid.addEventListener("mouseleave", () => paint(cols, rows));
    const num = (name: "columns" | "rows", v: number, set: (n: number) => void) =>
      new Setting(this.contentEl).setName(t(name)).addText((tx) => {
        inputs[name] = tx;
        tx.inputEl.type = "number"; tx.inputEl.min = "1"; tx.inputEl.addClass(`ext-${name}`);
        tx.setValue(String(v)).onChange((s) => { set(parseInt(s)); paint(cols, rows); });
        tx.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
      });
    num("columns", cols, (n) => (cols = n));
    num("rows", rows, (n) => (rows = n));
    new Setting(this.contentEl).setName(t("header")).setDesc(t("headerDesc")).addToggle((tg) => tg.setValue(header).onChange((b) => (header = b)));
    const submit = async () => {
      if (!(cols >= 1 && rows >= 1)) { new Notice(t("badNumber")); return; }
      this.close();
      try { await this.done(cols, rows, header); } catch (e: any) { new Notice(e?.message ?? String(e)); }
    };
    new Setting(this.contentEl).addButton((b) => b.setButtonText(t("insert")).setCta().onClick(submit));
    paint(cols, rows);
    window.setTimeout(() => (this.contentEl.querySelector("input") as HTMLInputElement)?.select(), 50);
  }
  onClose() { this.contentEl.empty(); }
}

class TableSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ExcalidrawTablePlugin) { super(app, plugin); }
  display() {
    const { containerEl } = this; containerEl.empty();
    const s = this.plugin.settings;
    const num = (name: MsgKey, k: "colWidth" | "fontSize") =>
      new Setting(containerEl).setName(t(name)).addText((tx) => tx.setValue(String(s[k])).onChange(async (v) => {
        const n = parseInt(v); if (n > 0) { s[k] = n; await this.plugin.saveSettings(); }
      }));
    const color = (name: MsgKey, k: "headerColor" | "cellColor" | "strokeColor") =>
      new Setting(containerEl).setName(t(name)).addColorPicker((cp) => cp.setValue(s[k]).onChange(async (v) => { s[k] = v; await this.plugin.saveSettings(); }));
    num("sColWidth", "colWidth"); num("sFontSize", "fontSize");
    color("sHeaderColor", "headerColor"); color("sCellColor", "cellColor"); color("sStrokeColor", "strokeColor");
    new Setting(containerEl).setName(t("sPaste")).setDesc(t("sPasteDesc"))
      .addToggle((tg) => tg.setValue(s.pasteAsTable).onChange(async (b) => { s.pasteAsTable = b; await this.plugin.saveSettings(); }));
  }
}
