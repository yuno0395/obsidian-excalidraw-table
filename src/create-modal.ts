// The "Insert table" dialog: point at a grid to choose the size, or type the numbers.

import { App, Modal, Notice, Setting, TextComponent } from "obsidian";
import { t } from "./i18n";
import { MAX_SIZE } from "./model";

const GC = 10, GR = 8;   // grid size

export class CreateModal extends Modal {
  constructor(app: App, private done: (cols: number, rows: number, header: boolean) => Promise<unknown>) { super(app); }

  onOpen() {
    let cols = 3, rows = 3, header = true;
    this.titleEl.setText(t("createTitle"));
    const hint = this.contentEl.createDiv({ text: t("gridHint") });
    Object.assign(hint.style, { color: "var(--text-muted)", fontSize: "var(--font-ui-small)", marginBottom: "6px" });
    const grid = this.contentEl.createDiv();
    Object.assign(grid.style, { display: "grid", gridTemplateColumns: `repeat(${GC}, 20px)`, gap: "3px", marginBottom: "12px", width: "max-content" });
    const boxes: HTMLElement[][] = [], inputs: { cols?: TextComponent; rows?: TextComponent } = {};
    const paint = () => boxes.forEach((row, i) => row.forEach((el, j) => {
      const on = i < rows && j < cols;
      el.style.background = on ? "var(--interactive-accent)" : "var(--background-modifier-hover)";
      el.style.borderColor = on ? "var(--interactive-accent)" : "var(--background-modifier-border)";
    }));
    const submit = async () => {
      if (!(cols >= 1 && rows >= 1)) { new Notice(t("badNumber")); return; }
      if (cols > MAX_SIZE || rows > MAX_SIZE) { new Notice(t("tooBig")); return; }
      this.close();
      try { await this.done(cols, rows, header); } catch (e: any) { new Notice(e?.message ?? String(e)); }
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
        tx.setValue(String(v)).onChange((s) => { set(parseInt(s)); paint(); });
        tx.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
      });
    num("cols", t("columns"), cols, (n) => (cols = n));
    num("rows", t("rows"), rows, (n) => (rows = n));
    new Setting(this.contentEl).setName(t("header")).setDesc(t("headerDesc"))
      .addToggle((tg) => tg.setValue(header).onChange((b) => (header = b)));
    new Setting(this.contentEl).addButton((b) => b.setButtonText(t("insert")).setCta().onClick(submit));
    paint();
    window.setTimeout(() => (this.contentEl.querySelector("input") as HTMLInputElement | null)?.select(), 50);
  }

  onClose() { this.contentEl.empty(); }
}
