# Excalidraw Table

Obsidian の Excalidraw のキャンバスに、PowerPoint のような表を作るプラグインです。
（English below）

- マス目をなぞって大きさを選ぶか、列数と行数を入れて表を作る（1行目は見出しとして塗る）
- Excel やスプレッドシートからコピーしたセル、Markdown の表を貼り付けると、そのまま表になる
- 表を Markdown やタブ区切り（Excel 用）でコピーできる
- セルに直接文字を書く。Enter で改行、Tab で次のセルへ（最後のセルで Tab を押すと行が増える）
- 矢印キーでセルを移り、Shift + 矢印で範囲を選ぶ
- セルを選ぶと表の上にボタンが出て、行・列の追加と削除、結合、文字の寄せがその場でできる
- 画像をセルの上にドラッグして落とすと、そのセルに入る（列の幅に合わせて縮む）
- 見出しの行・見出しの列、セルごとの文字の寄せ（左・中央・右）
- 列の幅・行の高さ・表全体の大きさをドラッグで変えると、離した時に表全体が整う。行の高さは中身に合わせて伸び縮みする
- 表はふつうの四角と文字なので、Excalidraw の書き出し（PNG・SVG・PDF）にそのまま出る
- 表の中身は図のデータにも写しを持つので、ほかの道具から読み取れる（`tools/read_tables.py`）

**Excalidraw プラグイン（obsidian-excalidraw-plugin）が必要です。**

## 入れ方

まだコミュニティプラグインの一覧には載せていません。くわしい手順・更新・外し方・うまくいかない時は [INSTALL.md](INSTALL.md) を見てください。

1. [Releases](https://github.com/yuno0395/obsidian-excalidraw-table/releases) から `main.js` と `manifest.json` を取る
   （または、このリポジトリで `npm install && npm run build` して作る）
2. vault の `.obsidian/plugins/excalidraw-table/` に置く
3. Obsidian の設定 → コミュニティプラグインで「Excalidraw Table」を有効にする

BRAT を使っている場合は、`yuno0395/obsidian-excalidraw-table` を足せば入ります（Releases ができてから）。

## 使い方

表を作るのはコマンドパレット（Ctrl/Cmd + P）の「表を作る」か、表のデータを貼り付けます。作った後の操作は、セルを選ぶと表の上に出るボタンか、キーボードでできます。コマンドパレットにも同じ操作があります（よく使うものはホットキーを付けると便利です）。

| コマンド | すること |
| --- | --- |
| 表を作る | マス目をなぞってクリックするか、列数・行数を入れて表を作る。フレームを選んでから実行すると、そのフレームの中に作る |
| 行を追加（上・下）・列を追加（左・右） | 選んだセルの上・下・左・右に足す |
| 行を削除・列を削除 | 選んだセルの行・列を消す（中身も消える） |
| セルを結合 | 選んだセル（2つ以上）を1つにする。文字は改行でつなぎ、画像はまとめる |
| セルの結合を解除 | 結合したセルを元のマスに戻す。中身は左上のマスに残る |
| 見出しの行を切り替え・見出しの列を切り替え | 1行目・1列目を見出しの色で塗る／やめる |
| 左寄せ・中央寄せ・右寄せ | 選んだセルの文字の寄せ。行や列を足しても、結合しても残る |
| 表を Markdown でコピー・表をタブ区切りでコピー（Excel 用） | 選んだ表（またはその中のセル）の中身をクリップボードに入れる |

- **セルを選ぶ**：表は1つのグループです。クリックすると表全体が選ばれます。セルをダブルクリックすると、表の中に入ってそのセルが選ばれます。Shift を押しながらクリックすると、セルを足して選べます。
- **キーボード**（セルを選んでいる時）：
  - 矢印キーで隣のセルへ。Shift + 矢印で範囲を広げる
  - Tab・Shift + Tab で次・前のセルへ
  - Enter で文字の入力を始める
- **文字を書く**：セルを選んで Enter を押して書きます。Enter で改行、書き終わったら Esc。
  - 書いている途中で Tab を押すと、文字を確定して次のセルの入力に移ります（Excel のように、Tab と文字を続けて打てます）。Shift + Tab は前のセルへ。
  - 最後のセルで Tab を押すと、下に行が増えてその行の最初のセルに移ります。
  - Tab で移ったセルにすでに文字があると、打った文字で置き換わります（Excel と同じ）。
- **ボタン**：セルを選ぶと、表の上に「上に行・下に行・左に列・右に列・行を削除・列を削除・結合（または結合を解除）・寄せ」のボタンが出ます。
- **貼り付けで表を作る**：Excel・Google スプレッドシートなどでセルをコピーするか、Markdown の表をコピーして、キャンバスの上で Ctrl/Cmd + V。マウスのある場所に、中身に合わせた列の幅で表ができます。ふつうの文字として貼りたい時は Shift を押しながら貼り付けます（設定で切ることもできます）。
- **画像を入れる**：キャンバスに置いた画像を、セルの上にドラッグして離します。表の外へドラッグすると、表から外れます。
- **大きさを変える**：
  - セルの右下の角をドラッグすると、その列の幅とその行の高さが変わります。
  - 表全体を選んで角をドラッグすると、全部の列と行が比例して変わります（文字の大きさは変わりません）。
  - 行の高さは、中身より低くはなりません。ドラッグで高くした行はその高さを保ち、それ以外の行は中身に合わせて伸び縮みします。

設定で、作る時の列の幅・文字の大きさ・見出しとセルと線の色、貼り付けで表を作るかどうかを変えられます。

## 気をつけること

- 表がフレームより大きいと、はみ出した部分はフレームで切れて見えません（書き出しでも切れます）。
- 表をドラッグで動かすと、Excalidraw は表を置いた先のフレームに入れ直します。
- 表全体の大きさを変える角のつまみは小さく、少し外れると表の移動になります。
- 0.1.0 で作った表で、文字を減らしても行が低くならない行は、一度その行をドラッグで低くすると直ります（0.1.0 の不具合で、高さが「ドラッグで決めた高さ」として残っているため）。
- 日本語入力（IME）をオンにしたまま、Tab の直後すぐに打ち始めた場合の動きはまだ確かめていません。うまく入らない時は、Tab の後に一呼吸おいてから打ってください。

## データの形

各要素の `customData` に次を持ちます。

| 要素 | customData |
| --- | --- |
| セルの四角 | `exTable: { id, r, c, rs, cs, al }`（rs・cs は結合した行数・列数、al は文字の寄せ） |
| 左上のセル | `exTableModel: { id, nR, nC, fs, header, headerCol, cols, rowMin, rowH, merges, cells, imgs }` |
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

- Insert a table by pointing at a size grid, or by columns and rows (the first row is shaded as a header).
- Paste cells copied from Excel / a spreadsheet, or a Markdown table, to make a table (Shift-paste for plain text).
- Copy a table as Markdown or as tab-separated text for Excel.
- Type into cells directly; Enter for a line break, Tab to the next cell (Tab in the last cell adds a row).
- Arrow keys move between cells; Shift + arrows select a range.
- Selecting cells shows a toolbar above the table: add rows/columns on any side, delete, merge/unmerge, align.
- Drop an image onto a cell to put it in that cell (scaled to the column width); drag it out to take it out.
- Header row and header column; per-cell text alignment (left / center / right).
- Drag a column width, a row height or the whole table; the table re-lays itself out when you release. Rows grow and shrink with their content.
- Tables are plain rectangles and text, so they appear in Excalidraw's PNG/SVG/PDF export.
- The content is also stored as data in the drawing, so other tools can read it (`tools/read_tables.py`).

**Install**: copy `main.js` and `manifest.json` from Releases (or build with `npm install && npm run build`) into `.obsidian/plugins/excalidraw-table/`, then enable it. See [INSTALL.md](INSTALL.md). Commands: Insert table, Add row above / below, Add column to the left / right, Delete row, Delete column, Merge cells, Unmerge cells, Header row on/off, Header column on/off, Align left / center / right, Copy table as Markdown, Copy table as tab-separated text.

To select a cell, double-click the table (this enters the group and selects the cell); Shift-click to add cells.

## License

MIT
