// The "Insert table" dialog: point at a grid to choose the size (or type the numbers), and pick the colours:
// the line colour, and the fill (colour and opacity) of the top row and of the other rows.

import { App, ColorComponent, Menu, Modal, Notice, Setting, SliderComponent, TextComponent } from "obsidian";
import { t, MsgKey } from "./i18n";
import { Colors, MAX_SIZE } from "./model";
import { TableSettings } from "./settings";
import { DEFAULT_THEME, Theme, colorsOf, isNoFill, normalizeTheme, sameTheme } from "./theme";

const GC = 10, GR = 8;   // grid size

export interface CreateHost {
  settings: TableSettings;
  saveSettings(): Promise<void>;
}

// previews stand on white, like the canvas, so see-through fills show as they will look
const shown = (c: string) => (isNoFill(c) ? "transparent" : c);

export class CreateModal extends Modal {
  constructor(app: App, private host: CreateHost, private done: (cols: number, rows: number, header: boolean, colors: Colors) => Promise<unknown>) { super(app); }

  onOpen() {
    const s = this.host.settings;
    let cols = 3, rows = 3;
    let theme: Theme = normalizeTheme(s.lastTheme);
    this.titleEl.setText(t("createTitle"));

    // ----- size grid (painted in the theme's colours) -----
    const hint = this.contentEl.createDiv({ text: t("gridHint") });
    Object.assign(hint.style, { color: "var(--text-muted)", fontSize: "var(--font-ui-small)", marginBottom: "6px" });
    const grid = this.contentEl.createDiv();
    Object.assign(grid.style, {
      display: "grid", gridTemplateColumns: `repeat(${GC}, 20px)`, gap: "3px", marginBottom: "12px", width: "max-content",
      padding: "6px", borderRadius: "6px", background: "#ffffff",
    });
    const boxes: HTMLElement[][] = [], inputs: { cols?: TextComponent; rows?: TextComponent } = {};
    const paint = () => {
      const C = colorsOf(theme);
      boxes.forEach((row, i) => row.forEach((el, j) => {
        const on = i < rows && j < cols;
        el.style.background = on ? shown(i === 0 ? C.header : C.cell) : "#f1f3f5";
        el.style.borderColor = on ? C.stroke : "#dee2e6";
      }));
    };
    const submit = async () => {
      if (!(cols >= 1 && rows >= 1)) { new Notice(t("badNumber")); return; }
      if (cols > MAX_SIZE || rows > MAX_SIZE) { new Notice(t("tooBig")); return; }
      s.lastTheme = theme;
      await this.host.saveSettings();
      this.close();
      try { await this.done(cols, rows, true, colorsOf(theme)); } catch (e: any) { new Notice(e?.message ?? String(e)); }
    };
    for (let i = 0; i < GR; i++) {
      boxes.push([]);
      for (let j = 0; j < GC; j++) {
        const el = grid.createDiv();
        Object.assign(el.style, { width: "20px", height: "20px", border: "1px solid", borderRadius: "3px", cursor: "pointer" });
        el.addEventListener("mouseenter", () => {
          cols = j + 1; rows = i + 1;
          inputs.cols?.setValue(String(cols)); inputs.rows?.setValue(String(rows));
          paint();
        });
        el.addEventListener("click", () => { cols = j + 1; rows = i + 1; submit(); });
        boxes[i].push(el);
      }
    }
    grid.addEventListener("mouseleave", paint);
    const num = (which: "cols" | "rows", label: string, v: number, set: (n: number) => void) =>
      new Setting(this.contentEl).setName(label).addText((tx) => {
        inputs[which] = tx;
        tx.inputEl.type = "number"; tx.inputEl.min = "1"; tx.inputEl.max = String(MAX_SIZE);
        tx.setValue(String(v)).onChange((v2) => { set(parseInt(v2)); paint(); });
        tx.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
      });
    num("cols", t("columns"), cols, (n) => (cols = n));
    num("rows", t("rows"), rows, (n) => (rows = n));

    // ----- colours -----
    new Setting(this.contentEl).setName(t("theme")).setHeading();
    const swatches = this.contentEl.createDiv();
    Object.assign(swatches.style, { display: "flex", flexWrap: "wrap", gap: "6px", margin: "4px 0 8px" });
    const ctl: { stroke?: ColorComponent; hc?: ColorComponent; ha?: SliderComponent; bc?: ColorComponent; ba?: SliderComponent } = {};
    const refresh = () => { renderSwatches(); paint(); };
    const pick = (th: Theme) => {
      theme = normalizeTheme(th);
      ctl.stroke?.setValue(theme.stroke);
      ctl.hc?.setValue(theme.header.color); ctl.ha?.setValue(theme.header.alpha);
      ctl.bc?.setValue(theme.body.color); ctl.ba?.setValue(theme.body.alpha);
      refresh();
    };
    // a small preview on white: top row on top, the other rows below, the line colour around and between
    const swatch = (label: string, th: Theme, onRemove?: () => void) => {
      const C = colorsOf(th), sel = sameTheme(th, theme);
      const b = swatches.createDiv({ attr: { "aria-label": label, role: "button", tabindex: "0" } });
      Object.assign(b.style, {
        width: "30px", height: "30px", borderRadius: "5px", cursor: "pointer", overflow: "hidden", boxSizing: "border-box",
        border: `2px solid ${C.stroke}`, outline: sel ? "2px solid var(--interactive-accent)" : "none", outlineOffset: "2px",
        background: `linear-gradient(${shown(C.header)} 0 45%, ${C.stroke} 45% 50%, ${shown(C.cell)} 50% 100%), #ffffff`,
      });
      b.addEventListener("click", () => pick(th));
      b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(th); } });
      // deleting takes two clicks: right-click opens a menu, "Delete" in it deletes
      if (onRemove) b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        new Menu().addItem((i) => i.setTitle(t("deleteTheme")).setIcon("trash").setWarning(true).onClick(onRemove)).showAtMouseEvent(e);
      });
    };
    const renderSwatches = () => {
      swatches.empty();
      swatch(t("defaultTheme"), DEFAULT_THEME);
      for (const th of s.themes) swatch(`${th.name}（${t("rightClickDelete")}）`, normalizeTheme(th), async () => {
        s.themes = s.themes.filter((x) => x !== th);
        await this.host.saveSettings();
        renderSwatches();
      });
    };
    new Setting(this.contentEl).setName(t("lineColor"))
      .addColorPicker((cp) => { ctl.stroke = cp; cp.setValue(theme.stroke).onChange((v) => { theme = { ...theme, stroke: v }; refresh(); }); });
    // a row's fill: colour and opacity
    const fill = (which: "header" | "body", name: MsgKey) => {
      const st = new Setting(this.contentEl).setName(t(name)).setDesc(t("opacityDesc"));
      st.addColorPicker((cp) => {
        if (which === "header") ctl.hc = cp; else ctl.bc = cp;
        cp.setValue(theme[which].color).onChange((v) => { theme = { ...theme, [which]: { ...theme[which], color: v } }; refresh(); });
      });
      st.addSlider((sl) => {
        if (which === "header") ctl.ha = sl; else ctl.ba = sl;
        sl.setLimits(0, 100, 5).setValue(theme[which].alpha).setDynamicTooltip()
          .onChange((v) => { theme = { ...theme, [which]: { ...theme[which], alpha: v } }; refresh(); });
      });
    };
    fill("header", "fillHeader");
    fill("body", "fillBody");
    let name = "";
    new Setting(this.contentEl).setName(t("saveTheme")).setDesc(t("saveThemeDesc"))
      .addText((tx) => tx.setPlaceholder(t("themeName")).onChange((v) => (name = v.trim())))
      .addButton((b) => b.setButtonText(t("save")).onClick(async () => {
        const th = { name: name || t("themeUnnamed") + " " + (s.themes.length + 1), ...normalizeTheme(theme) };
        s.themes = [...s.themes.filter((x) => x.name !== th.name), th];
        await this.host.saveSettings();
        new Notice(t("themeSaved"));
        renderSwatches();
      }));

    new Setting(this.contentEl).addButton((b) => b.setButtonText(t("insert")).setCta().onClick(submit));
    renderSwatches();
    paint();
    window.setTimeout(() => (this.contentEl.querySelector("input") as HTMLInputElement | null)?.select(), 50);
  }

  onClose() { this.contentEl.empty(); }
}
