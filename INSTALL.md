# Excalidraw Table のインストール方法

Obsidian の Excalidraw キャンバスに表を作るプラグイン「Excalidraw Table」の入れ方です。
コミュニティプラグインの一覧にはまだ載っていないので、手で入れるか BRAT で入れます。

動作確認した環境：Windows 11、Obsidian 1.14.4、Excalidraw 2.29.0、Excalidraw Table 0.6.0

---

## 0. 先に必要なもの

- **Obsidian 1.5.0 以上**
- **Excalidraw プラグイン**（作者 Zsolt Viczian、ID `obsidian-excalidraw-plugin`）
  Excalidraw Table は Excalidraw の上で動くので、これが無いと何もできません。
  Obsidian の 設定 → コミュニティプラグイン → 閲覧 で「Excalidraw」を探して入れ、有効にしておきます。

> コミュニティプラグインを初めて使う vault では、設定 → コミュニティプラグイン で「制限モード」を **オフ**（コミュニティプラグインを有効化）にする必要があります。

---

## 1. 手で入れる（おすすめ）

### 1-1. ファイルを取る

[Releases](https://github.com/yuno0395/obsidian-excalidraw-table/releases/latest) を開き、次の 2 つをダウンロードします。

- `main.js`
- `manifest.json`

### 1-2. vault の中に置く

vault のフォルダの中に、次のフォルダを作ってそこに 2 つのファイルを置きます。

```
<vault>/
└─ .obsidian/
   └─ plugins/
      └─ excalidraw-table/      ← このフォルダを作る（名前はこのとおり）
         ├─ main.js
         └─ manifest.json
```

- `.obsidian` は隠しフォルダです。Windows のエクスプローラーで見えないときは、表示 → 表示 → 「隠しファイル」にチェックを入れます。Mac の Finder では `Cmd + Shift + .` で表示されます。
- vault の場所が分からないときは、Obsidian 左下の vault 名 → 「保管庫を管理」で確認できます。
- フォルダ名は `manifest.json` の `id` と同じ **`excalidraw-table`** にします。

### 1-3. 有効にする

1. Obsidian を開き直す（または 設定 → コミュニティプラグイン →「インストールされたプラグイン」の右の再読み込みボタン）
2. 設定 → コミュニティプラグイン → インストールされたプラグイン に「Excalidraw Table」が出るので、スイッチをオンにする

「この保管庫の作成者を信頼しますか？」と出たら、「作成者を信頼しプラグインを有効化」を選びます。

---

## 2. BRAT で入れる

BRAT（Beta Reviewers Auto-update Tester）を使うと、更新も自動で入ります。

1. 設定 → コミュニティプラグイン → 閲覧 で「BRAT」を入れて有効にする
2. コマンドパレット（`Ctrl/Cmd + P`）→「BRAT: Add a beta plugin for testing」
3. `yuno0395/obsidian-excalidraw-table` を入れて「Add Plugin」
4. 設定 → コミュニティプラグイン で「Excalidraw Table」をオンにする

---

## 3. ソースからビルドして入れる

Node.js 18 以上が必要です。

```bash
git clone https://github.com/yuno0395/obsidian-excalidraw-table.git
cd obsidian-excalidraw-table
npm install
npm run build
```

できた `main.js` と、リポジトリにある `manifest.json` を、1-2 と同じ場所（`<vault>/.obsidian/plugins/excalidraw-table/`）に置きます。

開発中は `npm run dev` で、ソースを変えるたびに `main.js` が作り直されます。

---

## 4. 入ったか確かめる

1. Excalidraw の図を開く（コマンドパレット →「Excalidraw: Create new drawing」など）
2. コマンドパレットで「Excalidraw Table」と打つと、「表を作る」「行を追加（下）」などのコマンドが出れば入っています
3. Excalidraw のタブ右上（ファイル名の横）に表のアイコンが出ていれば入っています。押してマス目をなぞってクリック（または列数・行数を入れて「作る」）で、1 行目が灰色の表ができれば OK です

コマンドは Excalidraw の図を開いている時だけ出ます。Markdown のノートを開いている時は出ません。

使い方は [README](README.md#使い方) を見てください。

---

## 5. 更新する

- **手で入れた場合**：新しい Releases の `main.js` と `manifest.json` で上書きし、Obsidian を開き直す
- **BRAT の場合**：BRAT が自動で更新します（手動なら「BRAT: Check for updates to all beta plugins」）

設定（列の幅・色など）は同じフォルダの `data.json` に入っているので、上書きしても消えません。

---

## 6. 外す

設定 → コミュニティプラグイン で「Excalidraw Table」をオフにして、アンインストール（ゴミ箱アイコン）を押します。
手で消す場合は `<vault>/.obsidian/plugins/excalidraw-table/` フォルダを消します。

作った表は、ふつうの四角と文字として図に残ります（プラグインを外しても消えません。行の追加や結合などはできなくなります）。

---

## 7. うまくいかない時

| 症状 | 確かめること |
| --- | --- |
| 一覧に「Excalidraw Table」が出ない | フォルダの場所と名前（`.obsidian/plugins/excalidraw-table/`）、`main.js` と `manifest.json` の 2 つが入っているか。Obsidian を開き直したか |
| 「Excalidraw プラグインが必要です」と出る | Excalidraw プラグインが入っていて、オンになっているか |
| コマンドパレットにコマンドが出ない | Excalidraw の図を開いて、その図をクリックしてからコマンドパレットを開いているか |
| 行・列の追加などで何も起きない | 先にセルを選んでいるか。表をダブルクリックすると、表の中のセルが選べます |
| 制限モードの画面が出る | 設定 → コミュニティプラグイン で制限モードをオフにする |
