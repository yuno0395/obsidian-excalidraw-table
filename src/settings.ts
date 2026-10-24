import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { t, MsgKey } from "./i18n";
import { SavedTheme, Theme, normalizeTheme } from "./theme";

export interface TableSettings {
  colWidth: number;
  fontSize: number;
  headerColor: string;
  cellColor: string;
  strokeColor: string;
  pasteAsTable: boolean;
  themes: SavedTheme[];            // themes the user saved
  lastTheme: Theme | null;         // the colours picked last (also used for pasted tables)
}

export const DEFAULT_SETTINGS: TableSettings = {
  colWidth: 160,
  fontSize: 16,
  headerColor: "#e9ecef",
  cellColor: "#ffffff",
  strokeColor: "#495057",
  pasteAsTable: true,
  themes: [],
  lastTheme: null,
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
    num("sColWidth", "colWidth");
    num("sFontSize", "fontSize");
    new Setting(containerEl).setName(t("sPaste")).setDesc(t("sPasteDesc"))
      .addToggle((tg) => tg.setValue(s.pasteAsTable).onChange(async (b) => { s.pasteAsTable = b; await save(); }));
    // saved themes: shown in the insert dialog; deleted here
    new Setting(containerEl).setName(t("sThemes")).setDesc(s.themes.length ? t("sThemesDesc") : t("sThemesNone")).setHeading();
    s.themes.forEach((th, i) => {
      const n = normalizeTheme(th);
      new Setting(containerEl).setName(th.name)
        .setDesc(`${t("lineColor")} ${n.stroke} / ${t("fillHeader")} ${n.header.color} ${n.header.alpha}% / ${t("fillBody")} ${n.body.color} ${n.body.alpha}%`)
        .addExtraButton((b) => b.setIcon("trash").setTooltip(t("delete")).onClick(async () => { s.themes.splice(i, 1); await save(); this.display(); }));
    });
  }
}
