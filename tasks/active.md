# 現在の作業（active）

この記録は Git で管理されます。秘密情報や個人情報は書かないでください。
非公開のメモは `tasks/private/`（Git 管理外）に置きます。

## 目的

Claude Code で作業しやすい環境（指示書、ルール、Skills、確認役、権限設定、検査 Hook）をこのリポジトリに整える。

## 対象

- 作成: `AGENTS.md`、`CLAUDE.md`、`docs/ai/`、`tasks/`、`outputs/README.md`、`.claude/`（settings、rules、skills、agents、hooks）
- 変更: `.gitignore`（末尾に追記のみ）
- 変更しない: アプリ本体（`line-cm-helper.source.js`、`build-bookmarklet.mjs`、生成物3ファイル、`tagm.html`）、`README.md`、`.github/`

## 完了条件

- 検査スクリプトの単体テスト（正常・異常・再ブロック防止・時間切れ）が通る
- `node .claude/hooks/check-claude-setup.mjs` の結果が不合格 0件
- `docs/ai/setup-report.md` に、変更・検査結果・未適用項目・復元手順がある

## 作業状態

- 状態: セットアップは完了。作業ブランチにコミット済み。push は、リポジトリの非公開化を確認してから行う。
- 最終更新: 2026-10-05

## 検証の証拠

- 検査結果と単体テストの結果は `docs/ai/setup-report.md` の「実行した検査」に記録した。
- 新しいセッションでの読み込み確認（`/memory` など）は未実施。利用者の確認待ち。
