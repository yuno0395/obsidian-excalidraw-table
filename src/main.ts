// Excalidraw Table: PowerPoint-style tables on the Excalidraw canvas in Obsidian.
//
//   main.ts         the plugin: commands, settings, paste hook, one ViewHook per Excalidraw view
//   view-hook.ts    per view: tidy after pointer up / typing, keys (Tab, arrows), toolbar, stretch handles, tab icon
//   toolbar.ts      the cell toolbar and the stretch handles drawn over the canvas
//   table.ts        tables in the Excalidraw scene: layout, draw, rebuild (structure commands), align, scale
//   model.ts        the table model and the structure operations (pure)
//   text.ts         pasted text -> cells, cells -> Markdown / TSV (pure)
//   create-modal.ts the "Insert table" dialog
//   settings.ts     settings and their tab

import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { CreateModal } from "./create-modal";
import { t, MsgKey } from "./i18n";
import { OpName, TableError } from "./model";
import { DEFAULT_SETTINGS, TableSettingTab, TableSettings } from "./settings";
import { Tables } from "./table";
import { parseTable, toCsv, toHtml, toMarkdown, toTsv } from "./text";
import { colorsOf } from "./theme";
import { ViewHook } from "./view-hook";

const EXCALIDRAW = "obsidian-excalidraw-plugin";
export type CopyFormat = "office" | "csv" | "md";

export default class ExcalidrawTablePlugin extends Plugin {
  settings: TableSettings;
  tables: Tables;
  private hooks = new Map<any, ViewHook>();
  private paste: { ea: any; prev: any; mine: any } | null = null;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.themes = [...(this.settings.themes || [])];
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
    const reshape = (op: OpName) => (v: any) => this.tables.reshape(v, this.tables.ops[op]);
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
    cmd("align-left", "alignLeft", async (v) => this.tables.align(v, "left"));
    cmd("align-center", "alignCenter", async (v) => this.tables.align(v, "center"));
    cmd("align-right", "alignRight", async (v) => this.tables.align(v, "right"));
    cmd("copy-tsv", "copyOffice", (v) => this.copy(v, "office"));   // (id kept from the tab-separated copy it replaces)
    cmd("copy-csv", "copyCsv", (v) => this.copy(v, "csv"));
    cmd("copy-markdown", "copyMd", (v) => this.copy(v, "md"));

    this.addSettingTab(new TableSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (!this.excalidraw()) new Notice(t("noExcalidraw"));
      this.attachAll();
      this.registerEvent(this.app.workspace.on("layout-change", () => this.attachAll()));
      this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.attachAll()));
    });
  }

  onunload() {
    for (const h of this.hooks.values()) h.detach();
    this.hooks.clear();
    this.removePaste();
  }

  async saveSettings() { await this.saveData(this.settings); }

  openCreate(view: any) { new CreateModal(this.app, this, (c, r, h, colors) => this.tables.create(view, c, r, h, { colors })).open(); }

  // colours of the theme picked last (for tables made by pasting)
  private lastColors() {
    const s = this.settings;
    return colorsOf(s.lastTheme, { header: s.headerColor, cell: s.cellColor, stroke: s.strokeColor });
  }

  run(view: any, fn: (view: any) => Promise<unknown>) {
    let p: Promise<unknown>;
    try { p = Promise.resolve(fn(view)); } catch (e) { p = Promise.reject(e); }
    p.catch((e) => new Notice(e instanceof TableError ? e.message : `Excalidraw Table: ${e?.message ?? e}`));
  }

  // Copy the selected table: for Excel / PowerPoint (an HTML table, with tab-separated text for plain editors), CSV, or Markdown.
  async copy(view: any, fmt: CopyFormat) {
    const { cells, table } = this.tables.exportTable(view);
    if (fmt === "office") {
      const html = toHtml(table), text = toTsv(cells);
      try {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        })]);
      } catch {
        // no rich clipboard here: Electron's own clipboard, else plain text
        const electron = (window as any).require?.("electron");
        if (electron?.clipboard?.write) electron.clipboard.write({ html, text });
        else await navigator.clipboard.writeText(text);
      }
    } else {
      await navigator.clipboard.writeText(fmt === "csv" ? toCsv(cells) : toMarkdown(cells));
    }
    new Notice(t(fmt === "office" ? "copiedOffice" : fmt === "csv" ? "copiedCsv" : "copied"));
  }

  private excalidraw(): any { return (this.app as any).plugins?.plugins?.[EXCALIDRAW]; }

  private ea(view: any): any {
    const EA = this.excalidraw()?.ea ?? (window as any).ExcalidrawAutomate;
    if (!EA) throw new TableError(t("noExcalidraw"));
    return typeof EA.getAPI === "function" ? EA.getAPI(view) : EA;
  }

  private activeView(): any {
    const v: any = this.app.workspace.getMostRecentLeaf()?.view ?? this.app.workspace.activeLeaf?.view;
    return v?.getViewType?.() === "excalidraw" && v.excalidrawAPI ? v : null;
  }

  // Pasting cells from a spreadsheet, or a Markdown table, makes a table. Excalidraw calls ea.onPasteHook before its own paste;
  // returning false stops its own handling. A hook set before ours is kept and called for anything that is not a table.
  // Installed again whenever the Excalidraw plugin has been reloaded (it then has a new ea).
  private installPaste() {
    const ea = this.excalidraw()?.ea;
    if (!ea || (this.paste?.ea === ea && ea.onPasteHook === this.paste.mine)) return;
    if (this.paste?.ea === ea) return;   // someone else's hook replaced ours: leave it
    const prev = ea.onPasteHook;
    const mine = (data: any) => {
      try {
        const view = data?.view;
        if (this.settings.pasteAsTable && view?.excalidrawAPI && !view.modifierKeyDown?.shiftKey && !view.excalidrawAPI.getAppState().viewModeEnabled) {
          const p = data.payload || {};
          const drawing = (p.elements?.length ?? 0) > 0 || Object.keys(p.files || {}).length > 0;
          const rows = drawing ? null : parseTable(data.event?.clipboardData?.getData?.("text/plain") || p.text || "");
          if (rows) {
            const at = view._exTablePointer ?? data.pointerPosition;
            const pos = at && Number.isFinite(at.x) && Number.isFinite(at.y) ? { x: at.x, y: at.y } : undefined;
            this.run(view, (v) => this.tables.create(v, rows[0].length, rows.length, true, { rows, at: pos, colors: this.lastColors() }));
            return false;
          }
        }
      } catch (e) { console.error("Excalidraw Table: paste", e); }
      return typeof prev === "function" ? prev(data) : true;
    };
    ea.onPasteHook = mine;
    this.paste = { ea, prev, mine };
  }

  private removePaste() {
    if (this.paste && this.paste.ea.onPasteHook === this.paste.mine) this.paste.ea.onPasteHook = this.paste.prev;
    this.paste = null;
  }

  private attachAll() {
    this.installPaste();
    this.app.workspace.getLeavesOfType("excalidraw").forEach((leaf: WorkspaceLeaf) => this.attach(leaf.view, 0));
    for (const [view, h] of this.hooks) if (!view.excalidrawAPI || view.excalidrawAPI.isDestroyed) { h.detach(); this.hooks.delete(view); }
  }

  // the canvas API appears a little after the view opens, so retry for a while
  private attach(view: any, tries: number) {
    if (this.hooks.has(view)) return;
    if (!view?.excalidrawAPI?.onPointerUp) { if (tries < 40) window.setTimeout(() => this.attach(view, tries + 1), 250); return; }
    this.hooks.set(view, new ViewHook(this, view));
  }
}
