# Claude Code 作業環境セットアップ報告（2026-10-04）

この資料は GitHub Pages で公開されます。秘密情報は書いていません。

## 採用した構成

| 役割 | ファイル | 読み込まれ方 |
| --- | --- | --- |
| 共通ルールの正本 | `AGENTS.md` | Claude Code は `CLAUDE.md` の `@AGENTS.md` から読む。Codex は直接読む |
| Claude Code の入口 | `CLAUDE.md` | 毎回読み込まれる（14行） |
| パス限定のルール | `.claude/rules/bookmarklet.md`、`.claude/rules/japanese-writing.md` | 対象ファイルを Read/Write/Edit したときだけ |
| 手順の Skill | `.claude/skills/project-work/`、`.claude/skills/project-check/` | 利用者が `/project-work`、`/project-check` で開始したときだけ |
| 確認役 | `.claude/agents/project-reviewer.md` | ツールは Read、Grep、Glob のみ |
| 権限・Hook | `.claude/settings.json` | 秘密ファイルの Read/Edit 拒否、Stop フック1件 |
| 構造検査 | `.claude/hooks/check-claude-setup.mjs` | Node.js 標準機能だけを使う。読み取りのみ |
| 背景・検査・記録 | `docs/ai/`、`tasks/`、`outputs/README.md` | 必要なときに読む（`@import` しない） |

用途は「開発（ブックマークレットと静的HTML）が中心で、利用者向けの日本語文章も扱う」と判断しました。

## 作成・変更したファイル

- 変更: `.gitignore`（既存の3行はそのまま。末尾に個人用設定、バックアップ、秘密情報、一時ログ、`tasks/private/`、`outputs/*` の除外を追記）
- 新規: `AGENTS.md`、`CLAUDE.md`、`docs/ai/context.md`、`docs/ai/checks.md`、`docs/ai/setup-report.md`、`tasks/active.md`、`tasks/handoff.md`、`outputs/README.md`、`.claude/settings.json`、`.claude/rules/bookmarklet.md`、`.claude/rules/japanese-writing.md`、`.claude/skills/project-work/SKILL.md`、`.claude/skills/project-check/SKILL.md`、`.claude/agents/project-reviewer.md`、`.claude/hooks/check-claude-setup.mjs`
- 変更していない: アプリ本体（`line-cm-helper.source.js`、`build-bookmarklet.mjs`、生成物3ファイル、`tagm.html`）、`README.md`、`.github/`
- 2026-10-04 時点では、利用者の指示により commit と push をしなかった。2026-10-05 に利用者の了承を得て、作業ブランチ `ccr-f4e49bff-38pt08` にコミットして push し、下書きのプルリクエストを作った。main には取り込んでいない。

## 実行した検査と結果

| 検査 | 結果 |
| --- | --- |
| `node --check line-cm-helper.source.js` | 成功 |
| `node --check build-bookmarklet.mjs` | 成功 |
| `index.html` と `ブックマーク登録用.html` の一致（`cmp`、2026-10-05 に `git diff --no-index --quiet` でも確認） | 成功（一致） |
| `node .claude/hooks/check-claude-setup.mjs` | 成功（不合格 0件） |
| Hook の単体テスト（作業用のコピーで実施） | 成功 37件、失敗 0件（2026-10-05、レビュー後の修正を含む） |
| フロントマター5件を PyYAML で読み込み | 成功（この環境にある PyYAML で確認。Hook は PyYAML を使わない） |
| `settings.json` の統合を2回実行 | 成功（2回目は変更なし） |
| `node build-bookmarklet.mjs` | 未実行（生成物を上書きし、`npx terser` を呼ぶため） |
| 確認役 `project-reviewer` による独立レビュー | 2026-10-05 に実施（下記） |
| 新しいセッションでの読み込み確認（`/memory` など） | 未実施（利用者の操作が必要） |

単体テストの内訳:

- 正常: 出力なし・終了コード 0。Stop 以外のイベントでは何もしない。
- 異常（1か所ずつ壊したコピー20種類）: import の欠落・二重・リンク切れ・循環・4段超え、`settings.json` と `settings.local.json` の構文エラー、Bash の全許可、`bypassPermissions`、Hook の重複登録、Hook の timeout 欠落、deny ルールの不足、Skill の `disable-model-invocation` 欠落と name の不一致、確認役への Bash 追加と tools の欠落、Rule のフロントマター未閉鎖と重複、AGENTS.md への `@import`、必須ファイルの欠落。すべて `decision: block` と具体的な理由を返した。
- 秘密の扱い: 構文エラーの報告や、個人用設定の重複ルールの報告（表示モードで警告のみ。21種類目のコピー）に、ファイルの中身が出ないことを確認した。
- 再ブロック防止: `stop_hook_active: true` ではブロックせず、「合格ではありません」と表示する。
- 入力の異常（壊れた JSON、`null`、空）: ブロックせず、合格扱いもしない。
- 時間切れ: 入力が閉じないときは約3秒（実測 3,060ms）で打ち切る。制限時間を 0.5 秒にしたときは 548ms で「未完了（合格扱いではない）」を返した。設定側の timeout は 20 秒。
- 副作用: 検査の前後で、作業用コピー内のファイルのハッシュが変わらない。
- 誤検出しないこと（レビュー後に追加）: フロントマターのない別の Skill、インデントなしの YAML リスト、シェル形式の Hook 登録では不合格にしない。個人用設定が原因のときは「編集せずに利用者に報告する」と伝える。

独立レビューについて:

- 2026-10-04: 確認役は `.claude/agents/` を新しく作って定義したため、そのセッションでは読み込まれず、起動できなかった（公式資料: セッション開始時に存在しなかった `agents` ディレクトリは監視されない）。主担当が観点を切り替えて点検し、5件を修正した。
- 2026-10-05: セッションが新しくなった後に確認役が起動できたので、独立レビューを実施した。重大度「高」0件、「中」2件、「低」11件の指摘があり、内容を主担当が確かめて修正した。主な修正は、元に戻す手順（個人用設定を消さない方法に変更）、公開の条件の書き方、テスト件数の数え方、推論と確定事項の区別、検査スクリプトの誤検出（フロントマターのない他の Skill、インデントなしの YAML リスト、シェル形式の Hook）、個人用設定が原因のときのブロック理由。

## 権限と安全性の点検

- プロジェクトには既存の権限設定がなかった。追加したのは秘密ファイル（`.env`、`.env.*`、`*.pem`、`*.key`、`secrets/`）の Read/Edit 拒否だけで、許可は1つも増やしていない。
- 拒否ルールは Claude の組み込みファイルツールと、Claude Code が認識する Bash のファイルコマンド（`cat` など）に効く。スクリプトが自分でファイルを開く場合や、`grep -r` のようにファイル名を指定しない読み取りは防げない（公式資料の記載）。`.gitignore` や `CLAUDE.md` の記述だけでは、読み取りを防げない。
- 実際の秘密ファイルを開いて拒否の動作を試すことはしていない。
- クラウド環境の設定（リポジトリ外）に、`Skill` の全許可と、Git の状態を確かめる Stop フックがある。作成した2つの Skill は `disable-model-invocation: true` なので Claude が自動では使わないが、利用者が開始したときは確認なしで読み込まれる。
- このセッションは auto モード（分類器が承認を判断）で動いていた。

Sandbox:

- 対応: macOS、Linux、WSL2。ネイティブの Windows では動かない。既定はオフ。有効にするには、対応環境のセッションで `/sandbox` を実行する（Linux と WSL2 では `bubblewrap` と `socat` が必要）。
- この設定ではオンにしていない。このクラウド環境には `bwrap` と `socat` が見つからなかった。
- Sandbox が守るのはシェルコマンドだけで、組み込みのファイルツール、MCP サーバー、Hook はその外で動く。

MCP: 追加していない。用途、必要な権限、接続先、送るデータが決まってから検討する。

## 未適用・未確認・提案

- 【重要・判断待ち】公開範囲: このリポジトリは public で、利用者は GitHub Pages のページを今も使っている（2026-10-05 確認）。`static.yml` は main への push で `.git` と `.github` 以外をすべて Pages に公開するため、今回のファイルを main に取り込むと `AGENTS.md`、`docs/ai/`、`tasks/`、`.claude/` も公開ページから見える。内容に秘密はない。見せたくなければ、公開するファイルだけを配信するよう `static.yml` を変える必要がある。本番の配信に関わるため、変更していない。
- 【提案・未適用】main への push は公開と同じなので、`permissions.ask` に `Bash(git push *)` を加え、push の前に必ず確認を出す案がある。クラウドセッションの通常の push にも確認が出るため、利用者の判断に任せる。
- 【未確認】Codex は導入されていないため、Codex での読み込みは試していない。`AGENTS.override.md` があると Codex は同じ階層の `AGENTS.md` の代わりにそれを読む（Codex のソースコードで確認）ため、作らない方針を `AGENTS.md` に書いた。
- 【未確認】Windows での Hook 実行。exec 形式（`node` と引数）にしたので、公式資料上は Windows でも動く形式だが、実機では試していない。`node` が PATH にない環境では、Hook は失敗し、エラー表示が出るだけで停止は妨げない。
- 【未確認】このセッションで Stop フックが実際に動いたか（設定ファイルの変更は自動で反映されることがあると公式資料にあるが、合格時は何も表示しないため見分けられない）。
- 【運用上の注意】deny ルールを意図的に減らした場合、検査スクリプトの `SECRET_PATTERNS` も合わせて直さないと、Stop フックが毎回1度ブロックする。

## 利用者が行う確認（新しいセッションで）

どれもまだ確かめていません。次の表示になっていれば、読み込まれています。

1. `/memory`: `CLAUDE.md` が一覧にあるか。
2. `/context`: メモリファイルとして `CLAUDE.md` と `AGENTS.md` が出ているか。`.claude/rules/` の2件は、対象ファイルを開くまで読み込まれない設計。
3. `/skills`: `project-work` と `project-check` があるか。
4. `/hooks`: Stop に `check-claude-setup.mjs --hook` を呼ぶものが1件だけあるか。
5. `/permissions`: deny に `Read(**/.env)` など10件があるか。
6. 確認役: 現在の版の `/agents` は案内文を出すだけなので、「project-reviewer サブエージェントで AGENTS.md を読んで要約して」と頼み、起動するかを見る。
7. ターミナルで `node .claude/hooks/check-claude-setup.mjs` を実行し、「結果: 合格」と出るか。

## 今回の変更だけを元に戻す手順

今回の変更は作業ブランチ `ccr-f4e49bff-38pt08` の、f59a0c9 より後のコミットにある（`git log --oneline f59a0c9..ccr-f4e49bff-38pt08` で一覧を見られる）。main に取り込まなければ、main は元のまま。その場合は元に戻す作業は要らず、プルリクエストを閉じてブランチを消せばよい。

main に取り込んだ後で戻す場合は、取り消しのコミットを作る（履歴を消さない方法）。

```bash
git revert --no-edit f59a0c9..ccr-f4e49bff-38pt08
```

- このコマンドは、そのブランチのコミットを新しい順にすべて取り消す。今回追加・変更したファイルだけが元に戻る。Git で管理していない個人用のファイル（`.claude/settings.local.json`、`CLAUDE.local.md`、`tasks/private/`、`outputs/` の中身）は消さない。
- `git reset --hard`、`git clean`、`rm -r .claude` は使わない。`.claude/settings.local.json` は Claude Code が自動で作ることがあり、まとめて消すと失われる。
- 実行後、`git status --short` と `git log --oneline -3` で、取り消しのコミットができたことを確かめる。

バックアップ: `.claude-setup-backup/20261004-124153/`（Git 管理外。このクラウドの作業環境にだけある）。元の `.gitignore`（`gitignore.orig`）、最初に作ったファイルの一覧（`manifest.txt`）、作業前のコミット（`base-commit.txt`）がある。

## 同じセットアップを再実行したとき

- ファイル名を固定しているので、同じルール・Skill・確認役・フォルダは増えない（上書きの前に既存の内容を確認する）。
- `settings.json` は、既存のキーを残したまま、足りない deny ルールと Hook だけを追加する方式で統合した。Hook は同じスクリプトを指すものがあれば追加しない。
- `.gitignore` は見出しの行（`# --- Claude Code 作業環境`）があれば追記しない。
- 増えてしまった場合は、検査スクリプトが Hook の重複登録、同じ内容の Rule、Skill 名・エージェント名の重複、import の二重記述を不合格として検出する。
