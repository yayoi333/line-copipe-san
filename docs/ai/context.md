# 作業の背景（context）

AI と人がこのリポジトリで作業するときの背景資料です。共通ルールは `AGENTS.md` を見てください。
この資料は GitHub Pages で公開されます。秘密情報や個人情報は書かないでください。

## 運用方針（2026-10-05）

- 利用者の言葉: 「コピペさんは公開にしておいて。まだ使ってる。」
- このリポジトリは公開のまま運用し、GitHub Pages のページ（ブックマークレット登録ページ、タグマネージャー）も使い続ける。

## 目的

- LINE Creators Market でスタンプ・絵文字を申請するときに、タイトル・説明文・メイン画像番号・タグの入力を補助する。
- 機能の一覧は `README.md` の「できること」にある。

## 読者・利用者

- 利用者: LINEスタンプ・絵文字の制作者。PC とスマホのブラウザでブックマークレットを使う。
- このリポジトリの保守者: リポジトリの所有者と、所有者が使う AI エージェント。

## 参照すべき資料

| 資料 | 内容 |
| --- | --- |
| `README.md` | 機能、使い方、タグJSONの形式、生成コマンド |
| `line-cm-helper.source.js` | ブックマークレットの元コード |
| `build-bookmarklet.mjs` | 生成手順（生成物3ファイルを上書きする） |
| `tagm.html` | タグマネージャー（単独のページ） |
| `.github/workflows/static.yml` | GitHub Pages への公開手順 |
| `docs/ai/checks.md` | 作業別の合格条件 |

## 確定事項（2026-10-04〜05 に確認）

- リポジトリ `yayoi333/line-copipe-san` は public（2026-10-05 に確認）。既定ブランチは `main`。GitHub Pages は有効。
- `static.yml` は main への push（または手動実行）で、`actions/upload-pages-artifact@v3` によりリポジトリ全体を公開する。
  このアクションが除外するのは `.git` と `.github` だけ（action.yml で確認）。Git で追跡していないファイルはチェックアウトに含まれないため公開されない。
- `index.html` と `ブックマーク登録用.html` は同じ内容で、どちらも `build-bookmarklet.mjs` が生成する（セットアップ時に一致を確認）。
- `build-bookmarklet.mjs` は `npx terser` で圧縮する。失敗すると、各行の前後の空白を削って連結する簡易圧縮に切り替わる。
- `tagm.html` は CDN から Tailwind CSS、html2canvas、JSZip、Google Fonts を読み込む。生成の対象外。
- `tagm.html` を変更したコミット c993d65「fix-mobile-png-pagination」は、f59a0c9 で取り消されている（Revert）。
- `node --check` で `line-cm-helper.source.js` と `build-bookmarklet.mjs` の構文エラーがないことを確認した（Node v22.22.0）。

## 推測（未検証）

- README の生成コマンドが PowerShell 表記（`node .\build-bookmarklet.mjs`）なので、所有者は Windows で作業していると思われる。
- Pages の URL は `https://yayoi333.github.io/line-copipe-san/` と思われる（この環境からは接続できず、未確認）。

## 未確認事項

- Pages の公開ページ（ブックマークレット登録ページ、タグマネージャー）を、所有者以外の人が使っているか。止めると、その URL は開けなくなる。
- コミット済みの生成物が、現在の `line-cm-helper.source.js` から生成したものと一致するか。terser を実行していないため未確認。
- 生成に使った terser のバージョン。
- c993d65 を取り消した理由。
- 現在の LINE Creators Market の画面で、各機能が動くか（実ブラウザでの確認が必要）。
- README に書かれた対応ブラウザでの動作。
- GitHub の未解決 Issue（2件ある）の内容。
- ブックマークレットの URL 長の上限（ブラウザごとの具体的な値）。

## 作業環境についての注意

- Claude Code のクラウドセッションはコンテナが使い捨てで、push していない変更はコンテナと一緒に消える（このセッションの環境説明による。公式資料の該当ページは未確認）。
- ローカル（Windows）で使う場合、Claude Code の Sandbox はネイティブ Windows では動かない（WSL2 なら使える）。詳しくは `docs/ai/setup-report.md` を見る。
