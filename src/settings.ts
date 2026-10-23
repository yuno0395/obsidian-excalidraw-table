import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { t, MsgKey } from "./i18n";

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

type Host = Plugin & { settings: TableSettings; saveSettings(): Promise<void> };

export class TableSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: Host) { super(app, plugin); }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings, save = () => this.plugin.saveSettings();
    const num = (name: MsgKey, k: "colWidth" | "fontSize") =>
      new Setting(containerEl).setName(t(name)).addText((tx) => tx.setValue(String(s[k])).onChange(async (v) => {
        const n = parseInt(v); if (n > 0) { s[k] = n; await save(); }
      }));
    const color = (name: MsgKey, k: "headerColor" | "cellColor" | "strokeColor") =>
      new Setting(containerEl).setName(t(name)).addColorPicker((cp) => cp.setValue(s[k]).onChange(async (v) => { s[k] = v; await save(); }));
    num("sColWidth", "colWidth");
    num("sFontSize", "fontSize");
    color("sHeaderColor", "headerColor");
    color("sCellColor", "cellColor");
    color("sStrokeColor", "strokeColor");
    new Setting(containerEl).setName(t("sPaste")).setDesc(t("sPasteDesc"))
      .addToggle((tg) => tg.setValue(s.pasteAsTable).onChange(async (b) => { s.pasteAsTable = b; await save(); }));
  }
}
