# Excalidraw Table

Obsidian の Excalidraw のキャンバスに、PowerPoint のような表を作るプラグインです。
（English below）

- Excalidraw のタブ右上の表のアイコンから、マス目をなぞって大きさを選ぶか、列数と行数を入れて表を作る
- Excel やスプレッドシートからコピーしたセル、Markdown の表を貼り付けると、そのまま表になる
- 表を作る時に色を選べる（線の色、一番上の行とそれ以外の行の塗りの色と濃さ。塗りなしもできる。テーマとして保存もできる）
- 表をコピーして、Excel・PowerPoint・Word に表のまま（色・結合も）貼り付けられる。CSV・Markdown でもコピーできる
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

表を作るのは、Excalidraw の図を開いた時にタブ右上（ファイル名の横）に出る表のアイコン、コマンドパレット（Ctrl/Cmd + P）の「表を作る」、または表のデータの貼り付けです。作った後の操作は、セルを選ぶと表の上に出るボタンか、キーボードでできます。コマンドパレットにも同じ操作があります（よく使うものはホットキーを付けると便利です）。

| コマンド | すること |
| --- | --- |
| 表を作る | マス目をなぞってクリックするか、列数・行数を入れて表を作る。フレームを選んでから実行すると、そのフレームの中に作る |
| 行を追加（上・下）・列を追加（左・右） | 選んだセルの上・下・左・右に足す |
| 行を削除・列を削除 | 選んだセルの行・列を消す（中身も消える） |
| セルを結合 | 選んだセル（2つ以上）を1つにする。文字は改行でつなぎ、画像はまとめる |
| セルの結合を解除 | 結合したセルを元のマスに戻す。中身は左上のマスに残る |
| 見出しの行を切り替え・見出しの列を切り替え | 1行目・1列目を見出しの色で塗る／やめる |
| 左寄せ・中央寄せ・右寄せ | 選んだセルの文字の寄せ。行や列を足しても、結合しても残る |
| 表を Excel・PowerPoint 用にコピー | 選んだ表（またはその中のセル）を、色・線の色・結合・寄せ・セルの中の改行ごとクリップボードに入れる。Excel・PowerPoint・Word・Google スプレッドシートに表として貼り付けられる（メモ帳などにはタブ区切りの文字で入る） |
| 表を CSV でコピー・表を Markdown でコピー | 中身を CSV・Markdown の表の文字でクリップボードに入れる |

- **セルを選ぶ**：表は1つのグループです。クリックすると表全体が選ばれます。セルをダブルクリックすると、表の中に入ってそのセルが選ばれます。Shift を押しながらクリックすると、セルを足して選べます。
- **キーボード**（セルを選んでいる時）：
  - 矢印キーで隣のセルへ。Shift + 矢印で範囲を広げる
  - Tab・Shift + Tab で次・前のセルへ
  - Enter で文字の入力を始める
- **文字を書く**：セルを選んで Enter を押して書きます。Enter で改行、書き終わったら Esc。
  - 書いている途中で Tab を押すと、文字を確定して次のセルの入力に移ります（Excel のように、Tab と文字を続けて打てます）。Shift + Tab は前のセルへ。
  - 最後のセルで Tab を押すと、下に行が増えてその行の最初のセルに移ります。
  - Tab で移ったセルにすでに文字があると、打った文字で置き換わります（Excel と同じ）。
- **ボタン**：セルを選ぶと、表の上に「上に行・下に行・左に列・右に列・行を削除・列を削除・結合（または結合を解除）・寄せ・コピー」のボタンが出ます。
- **貼り付けで表を作る**：Excel・Google スプレッドシートなどでセルをコピーするか、Markdown の表をコピーして、キャンバスの上で Ctrl/Cmd + V。マウスのある場所に、中身に合わせた列の幅で表ができます。ふつうの文字として貼りたい時は Shift を押しながら貼り付けます（設定で切ることもできます）。
- **画像を入れる**：キャンバスに置いた画像を、セルの上にドラッグして離します。表の外へドラッグすると、表から外れます。
- **元に戻す（Ctrl/Cmd + Z）**：表を作る・貼り付けで作る・行や列の追加と削除・結合・寄せ・伸縮は、どれも1回で元に戻ります（Ctrl/Cmd + Shift + Z でやり直し）。文字を書いた後やセルの大きさをドラッグで変えた後は、表の整え直しが別の1回になるので、2回で元に戻ります。
- **大きさを変える**：
  - セルの右下の角をドラッグすると、その列の幅とその行の高さが変わります。
  - 表全体を選んで角をドラッグすると、表全体が縦横同じ割合で伸び縮みします。文字の大きさ・セルの余白も同じ割合で変わるので、小さくしても見た目の釣り合いは変わりません。
  - 表全体を選ぶと、表の右の辺と下の辺の真ん中に紫のつまみが出ます。右のつまみで横だけ、下のつまみで縦だけ伸び縮みします。文字の大きさは、縦と横の小さい方の割合に合わせます（横だけ広げても文字はそのまま、横だけ狭めると文字も小さくなって収まる）。
- **文字の大きさ**：セルを選んで Excalidraw のスタイル（左下のボタン）で文字の大きさを変えると、そのセルだけその大きさになり、行の高さも合わせて変わります。行や列を足しても、結合しても、表全体を拡大・縮小しても（比率のまま）残ります。
  - 行の高さは、中身より低くはなりません。ドラッグで高くした行はその高さを保ち、それ以外の行は中身に合わせて伸び縮みします。

- **色（カラーテーマ）**：「表を作る」の画面の「色」で決めます。
  - 見本は「標準」（黒い線・一番上の行は薄い灰色・ほかは塗りなし）と、保存したテーマが並びます。
  - 「線の色」「一番上の行の塗り」「それ以外の行の塗り」を、それぞれ選べます。塗りは色と濃さ（不透明度 0〜100）で決め、0 で塗りなしです。
  - 文字は塗った色に合わせて白か黒になります。
  - 塗りなし（0）は、ほとんど見えないごく薄い白で塗っています。Excalidraw は本当に透明な図形の中をクリックできないため、これでセルをクリックで選べるようにしています。
  - Excel・PowerPoint 用にコピーする時、透けた塗りは白の上に重ねた時の色にします（Excel には透ける色がないため）。
  - マス目の見本がその色になるので、作る前に見た目が分かります。
  - 「テーマとして保存」で名前を付けて保存すると、次から見本に並びます。保存したテーマは、右クリックして出るメニューの「削除」か、設定の「保存したテーマ」の「削除」を2回押すと消せます（どちらも2回のクリック）。
  - 最後に選んだ色は覚えていて、次に作る表と、貼り付けで作る表に使います。
- **コピー**：セルを選ぶと出るボタンの右端（クリップボードのアイコン）から、Excel・PowerPoint 用／CSV／Markdown を選べます。

設定で、新しく作る表の列の幅・文字の大きさ、貼り付けで表を作るかどうかを変えられます。保存したテーマもここで消せます。

## 気をつけること

- 表がフレームより大きいと、はみ出した部分はフレームで切れて見えません（書き出しでも切れます）。
- 表をドラッグで動かすと、Excalidraw は表を置いた先のフレームに入れ直します。
- 表全体の大きさを変える角のつまみは小さく、少し外れると表の移動になります。
- 表をとても小さくすると（元の 3 分の 1 ほどより小さく）、文字が途中で折り返されます。Excalidraw は図形の中の文字の周りに、大きさに関係なく 5 px の余白をとるためです（Excalidraw 自体の決まりで、変えられません）。
- 表示モード（閲覧専用）の図では、表を変える操作はできません。
- 0.1.0 で作った表で、文字を減らしても行が低くならない行は、一度その行をドラッグで低くすると直ります（0.1.0 の不具合で、高さが「ドラッグで決めた高さ」として残っているため）。
- 日本語入力（IME）をオンにしたまま、Tab の直後すぐに打ち始めた場合の動きはまだ確かめていません。うまく入らない時は、Tab の後に一呼吸おいてから打ってください。

## データの形

各要素の `customData` に次を持ちます。

| 要素 | customData |
| --- | --- |
| セルの四角 | `exTable: { id, r, c, rs, cs, al }`（rs・cs は結合した行数・列数、al は文字の寄せ） |
| 左上のセル | `exTableModel: { id, nR, nC, fs, base, header, headerCol, colors, cols, rowMin, rowH, merges, cells, imgs }`（base は作った時の文字の大きさ、colors はその表の色） |
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

- Insert a table from the table icon in the Excalidraw tab header (or the command), by pointing at a size grid or by columns and rows 
- Paste cells copied from Excel / a spreadsheet, or a Markdown table, to make a table (Shift-paste for plain text).
- Colours when inserting: the line colour, and the fill colour and opacity of the top row and of the other rows; saved as named themes. Opacity 0 is an almost invisible white, so the cells can still be clicked.
- Copy a table for Excel / PowerPoint / Word (pastes as a real table with colours and merged cells), or as CSV or Markdown.
- Type into cells directly; Enter for a line break, Tab to the next cell (Tab in the last cell adds a row).
- Arrow keys move between cells; Shift + arrows select a range.
- Selecting cells shows a toolbar above the table: add rows/columns on any side, delete, merge/unmerge, align.
- Undo (Ctrl/Cmd + Z) takes back each table command in one step (insert, paste, rows/columns, merge, align, stretch). After typing or dragging a cell size, the re-layout is a step of its own, so it takes two.
- Drop an image onto a cell to put it in that cell (scaled to the column width); drag it out to take it out.
- Header row and header column; per-cell text alignment (left / center / right).
- Drag a column width, a row height or the whole table; the table re-lays itself out when you release. Rows grow and shrink with their content.
- Resizing the whole table scales the font and spacing with it. Handles on the right and bottom edges of a selected table stretch it sideways or downwards only (the font follows the smaller of the two scales). Below about a third of the original size, text starts to wrap: Excalidraw keeps a fixed 5 px margin around text in a shape.
- Tables are plain rectangles and text, so they appear in Excalidraw's PNG/SVG/PDF export.
- The content is also stored as data in the drawing, so other tools can read it (`tools/read_tables.py`).

**Install**: copy `main.js` and `manifest.json` from Releases (or build with `npm install && npm run build`) into `.obsidian/plugins/excalidraw-table/`, then enable it. See [INSTALL.md](INSTALL.md). Commands: Insert table, Add row above / below, Add column to the left / right, Delete row, Delete column, Merge cells, Unmerge cells, Header row on/off, Header column on/off, Align left / center / right, Copy table for Excel / PowerPoint, Copy table as CSV, Copy table as Markdown.

To select a cell, double-click the table (this enters the group and selects the cell); Shift-click to add cells.

## 開発

```
npm install
npm run build   # 型チェックと main.js の作成
npm test        # 表の形の操作、貼り付け・コピーの変換、色、座標のテスト
```

| ファイル | 役目 |
| --- | --- |
| `src/main.ts` | プラグイン本体（コマンド・設定・貼り付けの割り込み・図ごとの見張り役の取り付け） |
| `src/view-hook.ts` | 図ごとの見張り役（操作の後の整え直し・Tab と矢印キー・タブ右上のアイコン） |
| `src/toolbar.ts` | セルの上のボタンと、表の伸縮つまみ |
| `src/table.ts` | 図の中の表（並べ直し・描く・作り直す・寄せ・伸縮・コピー用の書き出し） |
| `src/model.ts` | 表のデータと、行・列の追加削除・結合（Obsidian に依らない。テストあり） |
| `src/text.ts` | 貼り付けた文字から表へ、表から Markdown・タブ区切り・CSV・HTML へ（テストあり） |
| `src/theme.ts` | カラーテーマ（色から線・見出し・本文・文字の色を決める。テストあり） |
| `src/geom.ts` | 囲む枠の計算と、図の座標と画面の座標の変換（テストあり） |
| `src/create-modal.ts` | 「表を作る」の画面 |
| `src/settings.ts` | 設定 |
| `src/i18n.ts`・`src/util.ts` | 表示する文（英語・日本語）、小さな道具 |

## License

MIT

このプラグインは個人が作ったもので、Excalidraw・Obsidian Excalidraw プラグイン・Obsidian の公式のものではなく、それらの作者とは関係ありません。
Excalidraw や Excalidraw プラグインのコードは含んでおらず、Obsidian の中で動いている Excalidraw プラグインの公開された仕組み（ExcalidrawAutomate など）を呼び出して使います。
`tools/read_tables.py` には [lz-string](https://github.com/pieroxy/lz-string)（MIT）の復元処理を Python に移したものが入っています。著作権表示とライセンス文は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) にあります。

This is an unofficial, independent plugin, not affiliated with Excalidraw, the Obsidian Excalidraw plugin or Obsidian.
It contains no code from Excalidraw or the Excalidraw plugin; it calls the Excalidraw plugin's public API at run time.
`tools/read_tables.py` contains a Python port of lz-string's decompression (MIT); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
