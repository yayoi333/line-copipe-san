# CLAUDE.md

共通ルールの正本は AGENTS.md です。次の行で読み込みます。

@AGENTS.md

## Claude Code 固有の運用

- 手順に沿って作業するときは `/project-work <依頼内容>`、検査は `/project-check <対象や合格条件>` を使う。どちらも利用者が明示的に開始する。
- 独立したレビューは、読み取り専用のサブエージェント `project-reviewer` に頼む。合格条件・差分・元資料・検査結果を渡す。起動できないときは主担当が観点を変えて確認し、「独立レビュー未実施」と記録する。
- `.claude/rules/` のルールは、対象のファイルを読む・編集するときだけ読み込まれる。
- 応答の終了時に Stop フック（`.claude/hooks/check-claude-setup.mjs`）が AI 作業設定の構造だけを検査する。ブロックされたら、理由に書かれた項目を直す。
- `.claude/settings.json` は `.env` などの秘密ファイルの Read/Edit を拒否する。ただし、スクリプトが自分でファイルを開く場合などは防げない。
- 個人用の補足は `CLAUDE.local.md`（Git 管理外）に書く。
