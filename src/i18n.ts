import { moment } from "obsidian";

const en = {
  create: "Insert table",
  addRow: "Add row below",
  addCol: "Add column to the right",
  delRow: "Delete row",
  delCol: "Delete column",
  merge: "Merge cells",
  unmerge: "Unmerge cells",
  createTitle: "Insert table",
  columns: "Columns",
  rows: "Rows",
  header: "Header row",
  headerDesc: "Shade the first row.",
  insert: "Insert",
  noExcalidraw: "Excalidraw Table needs the Excalidraw plugin. Install and enable it first.",
  selectCell: "Select a cell first: double-click the table to enter it, then click a cell (Shift-click for more).",
  selectTwo: "Select two or more cells to merge (Shift-click).",
  selectMerged: "Select a merged cell.",
  badNumber: "Columns and rows must be 1 or more.",
  sColWidth: "Default column width",
  sFontSize: "Font size",
  sHeaderColor: "Header row color",
  sCellColor: "Cell color",
  sStrokeColor: "Line color",
};
const ja: typeof en = {
  create: "表を作る",
  addRow: "行を追加（下）",
  addCol: "列を追加（右）",
  delRow: "行を削除",
  delCol: "列を削除",
  merge: "セルを結合",
  unmerge: "セルの結合を解除",
  createTitle: "表を作る",
  columns: "列数",
  rows: "行数",
  header: "見出しの行",
  headerDesc: "1行目を薄い色で塗る",
  insert: "作る",
  noExcalidraw: "Excalidraw Table を使うには Excalidraw プラグインが必要です。先に入れて有効にしてください。",
  selectCell: "先にセルを選んでください（表をダブルクリックして中に入り、セルをクリック。複数は Shift を押しながら）",
  selectTwo: "結合するセルを2つ以上選んでください（Shift を押しながらクリック）",
  selectMerged: "結合したセルを選んでください",
  badNumber: "列数と行数は 1 以上にしてください",
  sColWidth: "列の幅（作る時）",
  sFontSize: "文字の大きさ",
  sHeaderColor: "見出しの行の色",
  sCellColor: "セルの色",
  sStrokeColor: "線の色",
};

export type MsgKey = keyof typeof en;
export function t(k: MsgKey): string {
  const lang = (moment.locale() || "en").toLowerCase();
  return (lang.startsWith("ja") ? ja : en)[k] ?? en[k];
}
