// The "Insert table" dialog: point at a grid to choose the size (or type the numbers), and pick a colour theme.

import { App, ColorComponent, DropdownComponent, Modal, Notice, Setting, TextComponent } from "obsidian";
import { t, colorName } from "./i18n";
import { Colors, MAX_SIZE } from "./model";
import { TableSettings } from "./settings";
import { PRESETS, ThemeChoice, ThemeMode, colorsOf, sameChoice } from "./theme";

const GC = 10, GR = 8;   // grid size

export interface CreateHost {
  settings: TableSettings;
  saveSettings(): Promise<void>;
}

export class CreateModal extends Modal {
  constructor(app: App, private host: CreateHost, private done: (cols: number, rows: number, header: boolean, colors: Colors) => Promise<unknown>) { super(app); }

  onOpen() {
    const s = this.host.settings;
    const def: Colors = { header: s.headerColor, cell: s.cellColor, stroke: s.strokeColor };
    let cols = 3, rows = 3, header = true;
    let choice: ThemeChoice = s.lastTheme ?? { kind: "default" };
    let mode: ThemeMode = choice.kind === "color" ? choice.mode : "line";
    const colors = () => colorsOf(choice, def);
    this.titleEl.setText(t("createTitle"));

    // ----- size grid (painted in the theme's colours) -----
    const hint = this.contentEl.createDiv({ text: t("gridHint") });
    Object.assign(hint.style, { color: "var(--text-muted)", fontSize: "var(--font-ui-small)", marginBottom: "6px" });
    const grid = this.contentEl.createDiv();
    Object.assign(grid.style, { display: "grid", gridTemplateColumns: `repeat(${GC}, 20px)`, gap: "3px", marginBottom: "12px", width: "max-content" });
    const boxes: HTMLElement[][] = [], inputs: { cols?: TextComponent; rows?: TextComponent } = {};
    const paint = () => {
      const C = colors();
      boxes.forEach((row, i) => row.forEach((el, j) => {
        const on = i < rows && j < cols;
        el.style.background = on ? (i === 0 && header ? C.header : C.cell) : "var(--background-modifier-hover)";
        el.style.borderColor = on ? C.stroke : "var(--background-modifier-border)";
      }));
    };
    const submit = async () => {
      if (!(cols >= 1 && rows >= 1)) { new Notice(t("badNumber")); return; }
      if (cols > MAX_SIZE || rows > MAX_SIZE) { new Notice(t("tooBig")); return; }
      s.lastTheme = choice;
      await this.host.saveSettings();
      this.close();
      try { await this.done(cols, rows, header, colors()); } catch (e: any) { new Notice(e?.message ?? String(e)); }
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
    new Setting(this.contentEl).setName(t("header")).setDesc(t("headerDesc"))
      .addToggle((tg) => tg.setValue(header).onChange((b) => { header = b; paint(); }));

    // ----- colour theme -----
    new Setting(this.contentEl).setName(t("theme")).setHeading();
    const swatches = this.contentEl.createDiv();
    Object.assign(swatches.style, { display: "flex", flexWrap: "wrap", gap: "6px", margin: "4px 0 8px" });
    let picker: ColorComponent | undefined, modeDd: DropdownComponent | undefined;
    const pick = (c: ThemeChoice) => {
      choice = c;
      if (c.kind === "color") { mode = c.mode; picker?.setValue(c.color); modeDd?.setValue(c.mode); }
      renderSwatches(); paint();
    };
    // a small preview: header colour on top, body colour below, the line colour around
    const swatch = (label: string, c: ThemeChoice, onRemove?: () => void) => {
      const C = colorsOf(c, def), sel = sameChoice(c, choice);
      const b = swatches.createDiv({ attr: { "aria-label": label, role: "button", tabindex: "0" } });
      Object.assign(b.style, {
        width: "30px", height: "30px", borderRadius: "5px", cursor: "pointer", overflow: "hidden", boxSizing: "border-box",
        border: `2px solid ${C.stroke}`, outline: sel ? "2px solid var(--interactive-accent)" : "none", outlineOffset: "2px",
        background: `linear-gradient(${C.header} 0 45%, ${C.cell} 45% 100%)`, position: "relative",
      });
      b.addEventListener("click", () => pick(c));
      b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(c); } });
      if (onRemove) b.addEventListener("contextmenu", (e) => { e.preventDefault(); onRemove(); });
    };
    const renderSwatches = () => {
      swatches.empty();
      swatch(t("themeDefault"), { kind: "default" });
      for (const p of PRESETS) swatch(colorName(p.name), { kind: "color", color: p.color, mode });
      for (const th of s.themes) swatch(`${th.name}（${t("rightClickDelete")}）`, { kind: "color", color: th.color, mode: th.mode }, async () => {
        s.themes = s.themes.filter((x) => x !== th);
        await this.host.saveSettings();
        renderSwatches();
      });
    };
    new Setting(this.contentEl).setName(t("customColor"))
      .addColorPicker((cp) => {
        picker = cp;
        cp.setValue(choice.kind === "color" ? choice.color : PRESETS[0].color)
          .onChange((v) => { choice = { kind: "color", color: v, mode }; renderSwatches(); paint(); });
      });
    new Setting(this.contentEl).setName(t("modeName")).setDesc(t("modeDesc"))
      .addDropdown((dd) => {
        modeDd = dd;
        dd.addOption("line", t("modeLine")).addOption("fill", t("modeFill")).setValue(mode)
          .onChange((v) => {
            mode = v as ThemeMode;
            if (choice.kind === "color") choice = { ...choice, mode };
            renderSwatches(); paint();
          });
      });
    let name = "";
    new Setting(this.contentEl).setName(t("saveTheme")).setDesc(t("saveThemeDesc"))
      .addText((tx) => tx.setPlaceholder(t("themeName")).onChange((v) => (name = v.trim())))
      .addButton((b) => b.setButtonText(t("save")).onClick(async () => {
        if (choice.kind !== "color") { new Notice(t("pickColorFirst")); return; }
        const th = { name: name || choice.color, color: choice.color, mode: choice.mode };
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
