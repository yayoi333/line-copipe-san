# Claude Code 作業環境セットアップ報告（2026-10-04）

この資料は Git に記録されます。秘密情報は書いていません。

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
- 2026-10-04 時点では、利用者の指示により commit と push をしなかった。2026-10-05 に利用者の了承を得て、作業ブランチにコミットした。push は、リポジトリが非公開になったことを確認してから行う。

## 実行した検査と結果

| 検査 | 結果 |
| --- | --- |
| `node --check line-cm-helper.source.js` | 成功 |
| `node --check build-bookmarklet.mjs` | 成功 |
| `index.html` と `ブックマーク登録用.html` の一致（`cmp`） | 成功（一致） |
| `node .claude/hooks/check-claude-setup.mjs` | 成功（不合格 0件） |
| Hook の単体テスト（作業用のコピーで実施） | 成功 33件、失敗 0件 |
| フロントマター5件を PyYAML で読み込み | 成功（この環境にある PyYAML で確認。Hook は PyYAML を使わない） |
| `settings.json` の統合を2回実行 | 成功（2回目は変更なし） |
| `node build-bookmarklet.mjs` | 未実行（生成物を上書きし、`npx terser` を呼ぶため） |
| 確認役 `project-reviewer` による独立レビュー | 未実施（下記） |
| 新しいセッションでの読み込み確認（`/memory` など） | 未実施（利用者の操作が必要） |

単体テストの内訳:

- 正常: 出力なし・終了コード 0。Stop 以外のイベントでは何もしない。
- 異常（1か所ずつ壊したコピー21種類）: import の欠落・二重・リンク切れ・循環・4段超え、`settings.json` と `settings.local.json` の構文エラー、Bash の全許可、`bypassPermissions`、Hook の重複登録、Hook の timeout 欠落、deny ルールの不足、Skill の `disable-model-invocation` 欠落と name の不一致、確認役への Bash 追加と tools の欠落、Rule のフロントマター未閉鎖と重複、AGENTS.md への `@import`、必須ファイルの欠落。すべて `decision: block` と具体的な理由を返した。
- 秘密の扱い: 構文エラーの報告や、個人用設定の重複ルールの報告に、ファイルの中身が出ないことを確認した。
- 再ブロック防止: `stop_hook_active: true` ではブロックせず、「合格ではありません」と表示する。
- 入力の異常（壊れた JSON、`null`、空）: ブロックせず、合格扱いもしない。
- 時間切れ: 入力が閉じないときは約3秒（実測 3,060ms）で打ち切る。制限時間を 0.5 秒にしたときは 548ms で「未完了（合格扱いではない）」を返した。設定側の timeout は 20 秒。
- 副作用: 検査の前後で、作業用コピー内のファイルのハッシュが変わらない。

独立レビューについて: 確認役は `.claude/agents/` を新しく作って定義したため、このセッションでは読み込まれず、起動できなかった（公式資料: セッション開始時に存在しなかった `agents` ディレクトリは監視されない）。代わりに主担当が観点を切り替えて点検し、5件を修正した（`outputs/` の説明の誤り、Rule と AGENTS.md の二重記述、コミット名の独自訳、個人用設定のルール文字列の表示、シンボリックリンク配下での誤判定）。

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

- 【重要・利用者の操作待ち】公開範囲: 利用者の方針は「GitHub は保管場所で、外部に公開しない」（2026-10-05）。2026-10-05 の確認時点でリポジトリはまだ public。非公開への切り替えは、リポジトリの Settings で所有者が行う。
- 【適用・main 未反映】2026-10-05、利用者の了承を得て、`static.yml` の main への push による自動実行を止めた（手動実行は残した）。main に取り込むまでは効果がない。また、すでに公開されている Pages のページは、これだけでは消えない。無料プランなら非公開化で自動で取り下げられ、有料プランなら Settings → Pages で止める必要がある。
- 【提案・未適用】`permissions.ask` に `Bash(git push *)` を加え、push の前に必ず確認を出す案がある。Pages を止めた後は、push が公開につながらないため優先度は低い。
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

バックアップ: `.claude-setup-backup/20261004-124153/`（Git 管理外）。元の `.gitignore`（`gitignore.orig`）、作成したファイルの一覧（`manifest.txt`）、作業前のコミット（`base-commit.txt`）がある。
`git reset --hard` や `git clean` は使わない。

1. 今回作ったフォルダに、後から自分のファイルを足していないか確かめる。
   `git status --short --untracked-files=all` と、Git 管理外の `outputs/`、`tasks/private/` の中身を見る。
2. 作成したファイルを消す（Git Bash、macOS、Linux）。

   ```bash
   rm AGENTS.md CLAUDE.md
   rm -r .claude docs tasks outputs
   cp .claude-setup-backup/20261004-124153/gitignore.orig .gitignore
   ```

   PowerShell の場合:

   ```powershell
   Remove-Item AGENTS.md, CLAUDE.md
   Remove-Item -Recurse .claude, docs, tasks, outputs
   Copy-Item .claude-setup-backup\20261004-124153\gitignore.orig .gitignore
   ```

   `docs/`、`tasks/`、`outputs/`、`.claude/` は、今回のセットアップ前には存在しなかった。
3. `git status --short` で、`.gitignore` の変更と新しいファイルが消えたことを確かめる。
4. 不要になったら `.claude-setup-backup/` を消す。

## 同じセットアップを再実行したとき

- ファイル名を固定しているので、同じルール・Skill・確認役・フォルダは増えない（上書きの前に既存の内容を確認する）。
- `settings.json` は、既存のキーを残したまま、足りない deny ルールと Hook だけを追加する方式で統合した。Hook は同じスクリプトを指すものがあれば追加しない。
- `.gitignore` は見出しの行（`# --- Claude Code 作業環境`）があれば追記しない。
- 増えてしまった場合は、検査スクリプトが Hook の重複登録、同じ内容の Rule、Skill 名・エージェント名の重複、import の二重記述を不合格として検出する。
