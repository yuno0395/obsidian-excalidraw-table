import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, TableError, Tables, TableSettings } from "./table";
import { t, MsgKey } from "./i18n";

const EXCALIDRAW = "obsidian-excalidraw-plugin";

export default class ExcalidrawTablePlugin extends Plugin {
  settings: TableSettings;
  tables: Tables;
  private unsubs = new Map<any, () => void>();

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.tables = new Tables((view) => this.ea(view), () => this.settings, (k) => t(k as MsgKey));

    const cmd = (id: string, name: MsgKey, run: (view: any) => Promise<void>) =>
      this.addCommand({
        id, name: t(name),
        checkCallback: (checking) => {
          const view = this.activeView(); if (!view) return false;
          if (!checking) run(view).catch((e) => new Notice(e instanceof TableError ? e.message : `Excalidraw Table: ${e?.message ?? e}`));
          return true;
        },
      });
    cmd("insert-table", "create", async (view) => new CreateModal(this.app, (c, r, h) => this.tables.create(view, c, r, h)).open());
    cmd("add-row", "addRow", (v) => this.tables.reshape(v, this.tables.ops.addRow));
    cmd("add-column", "addCol", (v) => this.tables.reshape(v, this.tables.ops.addCol));
    cmd("delete-row", "delRow", (v) => this.tables.reshape(v, this.tables.ops.delRow));
    cmd("delete-column", "delCol", (v) => this.tables.reshape(v, this.tables.ops.delCol));
    cmd("merge-cells", "merge", (v) => this.tables.reshape(v, this.tables.ops.merge));
    cmd("unmerge-cells", "unmerge", (v) => this.tables.reshape(v, this.tables.ops.unmerge));

    this.addSettingTab(new TableSettingTab(this.app, this));

    // follow every Excalidraw view: after a drag or a click, tidy the tables in it
    this.app.workspace.onLayoutReady(() => {
      if (!this.excalidraw()) new Notice(t("noExcalidraw"));
      this.attachAll();
      this.registerEvent(this.app.workspace.on("layout-change", () => this.attachAll()));
      this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.attachAll()));
    });
  }

  onunload() {
    for (const off of this.unsubs.values()) try { off(); } catch { /* view already closed */ }
    this.unsubs.clear();
  }

  async saveSettings() { await this.saveData(this.settings); }

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

  private attachAll() {
    this.app.workspace.getLeavesOfType("excalidraw").forEach((leaf: WorkspaceLeaf) => this.attach(leaf.view, 0));
    for (const [view, off] of this.unsubs) if (!view.excalidrawAPI || view.excalidrawAPI.isDestroyed) { try { off(); } catch { /* */ } this.unsubs.delete(view); }
  }

  // the canvas API appears a little after the view opens, so retry for a few seconds
  private attach(view: any, tries: number) {
    if (this.unsubs.has(view)) return;
    const api = view?.excalidrawAPI;
    if (!api?.onPointerUp) { if (tries < 20) window.setTimeout(() => this.attach(view, tries + 1), 250); return; }
    const off = api.onPointerUp(() => window.setTimeout(() => this.tables.onPointerUp(view).catch((e) => console.error("Excalidraw Table", e)), 60));
    this.unsubs.set(view, off);
  }
}

class CreateModal extends Modal {
  constructor(app: App, private done: (cols: number, rows: number, header: boolean) => Promise<any>) { super(app); }
  onOpen() {
    let cols = 3, rows = 3, header = true;
    this.titleEl.setText(t("createTitle"));
    const num = (name: MsgKey, v: number, set: (n: number) => void) =>
      new Setting(this.contentEl).setName(t(name)).addText((tx) => {
        tx.inputEl.type = "number"; tx.inputEl.min = "1"; tx.inputEl.addClass(`ext-${name}`);
        tx.setValue(String(v)).onChange((s) => set(parseInt(s)));
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
  }
}
