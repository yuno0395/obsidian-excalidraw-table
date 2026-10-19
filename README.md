# Excalidraw Table

Obsidian の Excalidraw のキャンバスに、PowerPoint のような表を作るプラグインです。
（English below）

- 列数と行数を指定して表を作る（1行目は見出しとして塗る）
- セルに直接文字を書く。Enter で改行
- 画像をセルの上にドラッグして落とすと、そのセルに入る（列の幅に合わせて縮む）
- セルの結合・結合の解除、行・列の追加と削除
- 列の幅・行の高さ・表全体の大きさをドラッグで変えると、離した時に表全体が整う
- 表はふつうの四角と文字なので、Excalidraw の書き出し（PNG・SVG・PDF）にそのまま出る
- 表の中身は図のデータにも写しを持つので、ほかの道具から読み取れる（`tools/read_tables.py`）

**Excalidraw プラグイン（obsidian-excalidraw-plugin）が必要です。**

## 入れ方

まだコミュニティプラグインの一覧には載せていません。

1. [Releases](https://github.com/yuno0395/obsidian-excalidraw-table/releases) から `main.js` と `manifest.json` を取る
   （または、このリポジトリで `npm install && npm run build` して作る）
2. vault の `.obsidian/plugins/excalidraw-table/` に置く
3. Obsidian の設定 → コミュニティプラグインで「Excalidraw Table」を有効にする

BRAT を使っている場合は、`yuno0395/obsidian-excalidraw-table` を足せば入ります（Releases ができてから）。

## 使い方

コマンドパレット（Ctrl/Cmd + P）から実行します。よく使うものはホットキーを付けると便利です。

| コマンド | すること |
| --- | --- |
| 表を作る | 列数・行数を入れて表を作る。フレームを選んでから実行すると、そのフレームの中に作る |
| 行を追加（下）・列を追加（右） | 選んだセルの下・右に足す |
| 行を削除・列を削除 | 選んだセルの行・列を消す（中身も消える） |
| セルを結合 | 選んだセル（2つ以上）を1つにする。文字は改行でつなぎ、画像はまとめる |
| セルの結合を解除 | 結合したセルを元のマスに戻す。中身は左上のマスに残る |

- **セルを選ぶ**：表は1つのグループです。クリックすると表全体が選ばれます。セルをダブルクリックすると、表の中に入ってそのセルが選ばれます。Shift を押しながらクリックすると、セルを足して選べます。
- **文字を書く**：セルをダブルクリックし、文字の入力が始まらなければ Enter を押します。書き終わったら Esc。
- **画像を入れる**：キャンバスに置いた画像を、セルの上にドラッグして離します。表の外へドラッグすると、表から外れます。
- **大きさを変える**：
  - セルの右下の角をドラッグすると、その列の幅とその行の高さが変わります。
  - 表全体を選んで角をドラッグすると、全部の列と行が比例して変わります（文字の大きさは変わりません）。
  - 行の高さは、中身より低くはなりません。

設定で、作る時の列の幅・文字の大きさ・見出しの行とセルと線の色を変えられます。

## 気をつけること

- 表がフレームより大きいと、はみ出した部分はフレームで切れて見えません（書き出しでも切れます）。
- 表をドラッグで動かすと、Excalidraw は表を置いた先のフレームに入れ直します。
- 表全体の大きさを変える角のつまみは小さく、少し外れると表の移動になります。

## データの形

各要素の `customData` に次を持ちます。

| 要素 | customData |
| --- | --- |
| セルの四角 | `exTable: { id, r, c, rs, cs }`（rs・cs は結合した行数・列数） |
| 左上のセル | `exTableModel: { id, nR, nC, fs, cols, rowMin, rowH, merges, cells, imgs }` |
| セルの中の画像 | `exTable: { id, r, c, img }`（img は vault の中のパス） |
| セルの中の文字 | `exTableText: true` |

`cells[r][c]` はセルの中身の写しです（改行は `<br>`、画像は `![[パス]]`、結合で隠れたマスは `null`）。
`tools/read_tables.py` は、.excalidraw.md（圧縮した形も）から表を読み出します。

```
python3 tools/read_tables.py <ファイルまたはフォルダ>
python3 tools/read_tables.py --json <ファイルまたはフォルダ>
```

---

## English

Tables on the Excalidraw canvas in Obsidian, PowerPoint style. Requires the Excalidraw plugin.

- Insert a table by columns and rows (the first row is shaded as a header).
- Type into cells directly; Enter for a line break.
- Drop an image onto a cell to put it in that cell (scaled to the column width); drag it out to take it out.
- Merge and unmerge cells; add and delete rows and columns.
- Drag a column width, a row height or the whole table; the table re-lays itself out when you release.
- Tables are plain rectangles and text, so they appear in Excalidraw's PNG/SVG/PDF export.
- The content is also stored as data in the drawing, so other tools can read it (`tools/read_tables.py`).

**Install**: copy `main.js` and `manifest.json` from Releases (or build with `npm install && npm run build`) into `.obsidian/plugins/excalidraw-table/`, then enable it. Commands: Insert table, Add row below, Add column to the right, Delete row, Delete column, Merge cells, Unmerge cells.

To select a cell, double-click the table (this enters the group and selects the cell); Shift-click to add cells.

## License

MIT
