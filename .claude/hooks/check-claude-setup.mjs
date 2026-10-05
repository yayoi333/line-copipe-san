#!/usr/bin/env node
// AI 作業設定（AGENTS.md、CLAUDE.md、.claude/ など）の構造を検査する。
// 読み取りだけを行う。ネット接続、ファイルの変更、外部コマンドの実行、パッケージの読み込みはしない。
// 検査するのは決まったパスのファイルだけで、リポジトリ全体は走査しない。
// 成果物（ブックマークレットなど）の品質検査ではない。
//
// 使い方:
//   node .claude/hooks/check-claude-setup.mjs         結果を表示する（終了コード 0: 合格、1: 不合格、3: 内部エラー）
//   node .claude/hooks/check-claude-setup.mjs --hook  Stop フック用。標準入力の JSON を読み、不合格なら decision: block を返す
//
// テスト用の環境変数:
//   CLAUDE_SETUP_CHECK_DEADLINE_MS  フックモードの制限時間（ミリ秒、既定 10000）

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT_REAL = realpathSync(ROOT);
const HOOK_MODE = process.argv.includes("--hook");
const DEADLINE_MS = Number(process.env.CLAUDE_SETUP_CHECK_DEADLINE_MS) || 10000;
const STDIN_LIMIT_MS = 3000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_IMPORT_HOPS = 4;
const SELF = ".claude/hooks/check-claude-setup.mjs";

const REQUIRED = [
  "AGENTS.md",
  "CLAUDE.md",
  ".claude/settings.json",
  ".claude/skills/project-work/SKILL.md",
  ".claude/skills/project-check/SKILL.md",
  ".claude/agents/project-reviewer.md",
  SELF,
];
const RECOMMENDED = [
  "docs/ai/context.md",
  "docs/ai/checks.md",
  "docs/ai/setup-report.md",
  "tasks/active.md",
  "tasks/handoff.md",
  "outputs/README.md",
];
const SECRET_PATTERNS = ["**/.env", "**/.env.*", "**/*.pem", "**/*.key", "**/secrets/**"];
const REQUIRED_DENY = SECRET_PATTERNS.flatMap((p) => [`Read(${p})`, `Edit(${p})`]);
const REQUIRED_GITIGNORE = ["CLAUDE.local.md", ".claude/settings.local.json", ".claude-setup-backup/"];
const OWN_SKILLS = ["project-work", "project-check"];
const REVIEWER_TOOLS = new Set(["Read", "Grep", "Glob"]);

const errors = [];
const warnings = [];
const notes = [];

// ---------- ファイル読み込み ----------

function abs(rel) {
  return join(ROOT, ...rel.split("/"));
}

function inside(p) {
  return [ROOT, ROOT_REAL].some((base) => {
    const r = relative(base, p);
    return r === "" || (!r.startsWith("..") && !isAbsolute(r));
  });
}

function readText(rel) {
  const p = abs(rel);
  if (!existsSync(p)) return null;
  const st = lstatSync(p);
  if (st.isSymbolicLink()) {
    let target = "";
    try {
      target = realpathSync(p);
    } catch {
      errors.push(`${rel}: リンク先が存在しないシンボリックリンク`);
      return null;
    }
    if (!inside(target)) {
      errors.push(`${rel}: プロジェクトの外を指すシンボリックリンク（読み込まない）`);
      return null;
    }
  }
  if (!st.isSymbolicLink() && !st.isFile()) {
    errors.push(`${rel}: ファイルではない`);
    return null;
  }
  let buf;
  try {
    buf = readFileSync(p);
  } catch (e) {
    errors.push(`${rel}: 読み込めない（${e && e.code}）`);
    return null;
  }
  if (buf.length > MAX_FILE_BYTES) {
    errors.push(`${rel}: ${MAX_FILE_BYTES} バイトを超えている（検査対象の設定ファイルとして大きすぎる）`);
    return null;
  }
  return buf.toString("utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

function listDir(rel) {
  const p = abs(rel);
  if (!existsSync(p)) return [];
  return readdirSync(p, { withFileTypes: true });
}

// 秘密を含み得るファイルもあるため、JSON の構文エラーは位置だけを示し、内容は出さない。
function parseJson(rel, text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const m = String(e && e.message).match(/position (\d+)/);
    let where = "位置不明";
    if (m) {
      const before = text.slice(0, Number(m[1]));
      const line = before.split("\n").length;
      const col = before.length - before.lastIndexOf("\n");
      where = `${line}行目 ${col}文字目付近`;
    } else if (/Unexpected end/.test(String(e && e.message))) {
      where = "ファイルの終わり（閉じかっこ不足など）";
    }
    return { ok: false, where };
  }
}

// ---------- Markdown の簡易解析 ----------

// 簡易 YAML フロントマター解析。`key: value`、インデントした `- item` のリスト、`[a, b]` だけを扱う。
// YAML の完全な検証ではない。
function frontmatter(text) {
  if (!text.startsWith("---\n")) return { has: false, body: text };
  const m = text.slice(4).match(/^(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/);
  if (!m) return { has: true, closed: false };
  const data = {};
  const unknown = [];
  let lastKey = null;
  for (const line of (m[1] || "").split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const kv = line.match(/^([A-Za-z0-9_-]+):(?:\s+(.*))?$/);
    if (kv) {
      lastKey = kv[1];
      const v = (kv[2] || "").trim();
      if (lastKey in data) unknown.push(`キー "${lastKey}" が重複`);
      data[lastKey] = v === "" ? [] : scalar(v);
      continue;
    }
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && lastKey && Array.isArray(data[lastKey])) {
      data[lastKey].push(scalar(item[1].trim()));
      continue;
    }
    unknown.push(line.trim());
  }
  return { has: true, closed: true, data, unknown, body: text.slice(4 + m[0].length) };
}

function scalar(v) {
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(",").map((s) => scalar(s.trim())).filter((s) => s !== "");
  if (/^"(.*)"$/.test(v) || /^'(.*)'$/.test(v)) return v.slice(1, -1);
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

// フェンスコードブロックとインラインコードを除いた行を返す（Claude Code の import 解析もこれらを無視する）。
function proseLines(text) {
  const out = [];
  let fence = null;
  for (const line of text.split("\n")) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      out.push("");
      continue;
    }
    out.push(fence ? "" : line.replace(/(`+)[\s\S]*?\1/g, ""));
  }
  return out;
}

function findImports(text) {
  const found = [];
  proseLines(text).forEach((line, i) => {
    for (const m of line.matchAll(/(?:^|\s)@((?:\\ |[^\s])+)/g)) {
      found.push({ target: m[1].replace(/\\ /g, " "), line: i + 1 });
    }
  });
  return found;
}

// ---------- 検査 ----------

function checkFiles() {
  for (const rel of REQUIRED) {
    if (!existsSync(abs(rel))) errors.push(`${rel}: 必須ファイルがない`);
  }
  for (const rel of RECOMMENDED) {
    if (!existsSync(abs(rel))) warnings.push(`${rel}: 推奨ファイルがない`);
  }
  if (existsSync(abs("AGENTS.override.md"))) {
    warnings.push("AGENTS.override.md: Codex はこれを AGENTS.md の代わりに読み、Claude Code は読まない。ルールが分かれる");
  }
  if (existsSync(abs(".claude/CLAUDE.md")) && existsSync(abs("CLAUDE.md"))) {
    warnings.push(".claude/CLAUDE.md と CLAUDE.md の両方がある。入口が2つになっている");
  }
}

function checkImports() {
  const claude = readText("CLAUDE.md");
  const agents = readText("AGENTS.md");
  if (claude === null) return;

  const agentsAbs = abs("AGENTS.md");
  let agentsImports = 0;
  const visit = (rel, text, chain) => {
    for (const imp of findImports(text)) {
      const where = `${rel}:${imp.line} の @${imp.target}`;
      if (chain.length > MAX_IMPORT_HOPS) {
        errors.push(`${chain.join(" → ")} → @${imp.target}: import が ${MAX_IMPORT_HOPS} 段を超えている`);
        continue;
      }
      if (imp.target.startsWith("~")) {
        warnings.push(`${where}: ホームディレクトリの import は未検査（承認ダイアログの対象）`);
        continue;
      }
      const base = dirname(abs(rel));
      const target = isAbsolute(imp.target) ? imp.target : resolve(base, imp.target);
      if (!inside(target)) {
        warnings.push(`${where}: プロジェクト外の import は未検査（承認ダイアログの対象）`);
        continue;
      }
      if (!existsSync(target)) {
        errors.push(`${where}: import 先が存在しない`);
        continue;
      }
      if (target === agentsAbs) agentsImports++;
      const targetRel = relative(ROOT, target).split(sep).join("/");
      if (chain.includes(targetRel)) {
        errors.push(`${[...chain, targetRel].join(" → ")}: import が循環している`);
        continue;
      }
      if (targetRel.endsWith(".md")) {
        const t = readText(targetRel);
        if (t !== null) visit(targetRel, t, [...chain, targetRel]);
      }
    }
  };
  visit("CLAUDE.md", claude, ["CLAUDE.md"]);

  if (agentsImports === 0) errors.push("CLAUDE.md: @AGENTS.md の import がない（コードブロックの外に独立した行で書く）");
  if (agentsImports > 1) errors.push(`CLAUDE.md: AGENTS.md を ${agentsImports} 回 import している（1回にする）`);

  const claudeLines = claude.split("\n").length;
  if (claudeLines > 60) warnings.push(`CLAUDE.md: ${claudeLines} 行。入口は短くし、共通ルールは AGENTS.md に置く`);

  if (agents !== null) {
    const agentsLines = agents.split("\n").length;
    if (agentsLines > 100) warnings.push(`AGENTS.md: ${agentsLines} 行（目安は 100 行以内）`);
    for (const imp of findImports(agents)) {
      errors.push(`AGENTS.md:${imp.line}: @${imp.target} がある。AGENTS.md には Claude 専用の @import を書かない`);
    }
    proseLines(agents).forEach((line, i) => {
      const m = line.match(/(?:^|[\s(（「])(\/[a-z][a-z0-9-]*)(?=[\s)）」]|$)/);
      if (m) warnings.push(`AGENTS.md:${i + 1}: スラッシュコマンドのような記述 ${m[1]}（他のツールでは使えない）`);
    });
    const agentsSet = new Set(agents.split("\n").map((l) => l.trim()).filter((l) => l.length >= 20 && !l.startsWith("#")));
    const dup = claude.split("\n").map((l) => l.trim()).filter((l) => agentsSet.has(l));
    if (dup.length) warnings.push(`CLAUDE.md: AGENTS.md と同じ行が ${dup.length} 行ある（二重記述）`);
  }
}

function checkSettingsFile(rel, shared) {
  const text = readText(rel);
  if (text === null) return null;
  const parsed = parseJson(rel, text);
  if (!parsed.ok) {
    errors.push(`${rel}: JSON の構文エラー（${parsed.where}）`);
    return null;
  }
  const s = parsed.value;
  if (!s || typeof s !== "object" || Array.isArray(s)) {
    errors.push(`${rel}: 最上位が JSON オブジェクトではない`);
    return null;
  }
  const perms = s.permissions || {};
  if (perms.defaultMode === "bypassPermissions") errors.push(`${rel}: permissions.defaultMode が bypassPermissions（権限確認をすべて省略する）`);
  if (s.skipDangerousModePermissionPrompt === true) errors.push(`${rel}: skipDangerousModePermissionPrompt が true`);
  for (const key of ["allow", "ask", "deny"]) {
    const list = perms[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      errors.push(`${rel}: permissions.${key} が配列ではない`);
      continue;
    }
    // 個人用の設定はコマンド文字列に秘密を含み得るため、ルールの中身ではなく番号だけを示す。
    const seen = new Set();
    list.forEach((rule, i) => {
      if (seen.has(rule)) {
        if (shared) errors.push(`${rel}: permissions.${key} に重複 "${rule}"`);
        else warnings.push(`${rel}: permissions.${key}[${i}] が前の項目と重複`);
      }
      seen.add(rule);
    });
    if (key === "allow") {
      for (const rule of list) {
        if (["Bash", "Bash(*)", "Bash(**)", "PowerShell", "PowerShell(*)", "*"].includes(rule)) {
          errors.push(`${rel}: permissions.allow に "${rule}"（シェルまたは全ツールの全許可）`);
        }
      }
    }
  }
  checkHooks(rel, s.hooks, shared);
  return s;
}

function checkHooks(rel, hooks, shared) {
  if (hooks === undefined) return;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) {
    errors.push(`${rel}: hooks がオブジェクトではない`);
    return;
  }
  let selfCount = 0;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      errors.push(`${rel}: hooks.${event} が配列ではない`);
      continue;
    }
    const seen = new Set();
    groups.forEach((g, gi) => {
      if (!g || !Array.isArray(g.hooks)) {
        errors.push(`${rel}: hooks.${event}[${gi}].hooks が配列ではない`);
        return;
      }
      g.hooks.forEach((h, hi) => {
        const at = `${rel}: hooks.${event}[${gi}].hooks[${hi}]`;
        if (!h || typeof h.type !== "string") {
          errors.push(`${at}: type がない`);
          return;
        }
        const key = JSON.stringify([g.matcher ?? null, h.type, h.command ?? null, h.args ?? null, h.url ?? null]);
        if (seen.has(key)) errors.push(`${at}: 同じフックが重複して登録されている`);
        seen.add(key);
        // exec 形式（args あり）は要素ごと、シェル形式は command を空白で区切って調べる。
        const refs = Array.isArray(h.args)
          ? [h.command, ...h.args].filter((x) => typeof x === "string")
          : typeof h.command === "string" ? h.command.split(/\s+/).map((x) => x.replace(/["']/g, "")) : [];
        if (!refs.some((x) => x.includes("check-claude-setup.mjs"))) return;
        selfCount++;
        if (event !== "Stop") errors.push(`${at}: 構造検査フックが Stop 以外（${event}）に登録されている`);
        if (h.type !== "command") errors.push(`${at}: type が command ではない`);
        if (!refs.includes("--hook")) errors.push(`${at}: --hook 引数がない（表示モードで動いてしまう）`);
        if (typeof h.timeout !== "number" || h.timeout <= 0 || h.timeout > 60) errors.push(`${at}: timeout（1〜60秒）が設定されていない`);
        const scriptRef = refs.find((x) => x.includes("check-claude-setup.mjs"));
        const scriptPath = scriptRef.replace(/\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR/g, ROOT).replace(/^["']|["']$/g, "");
        if (!existsSync(isAbsolute(scriptPath) ? scriptPath : resolve(ROOT, scriptPath))) {
          errors.push(`${at}: スクリプトのパスが見つからない（${scriptRef}）`);
        }
      });
    });
  }
  if (selfCount > 1) errors.push(`${rel}: 構造検査フックが ${selfCount} 回登録されている（1回にする）`);
  return selfCount;
}

function checkSettings() {
  const shared = checkSettingsFile(".claude/settings.json", true);
  checkSettingsFile(".claude/settings.local.json", false);
  if (!shared) return;
  const deny = Array.isArray(shared.permissions?.deny) ? shared.permissions.deny : [];
  const missing = REQUIRED_DENY.filter((r) => !deny.includes(r));
  if (missing.length) errors.push(`.claude/settings.json: 秘密ファイルの deny ルールが不足（${missing.join(", ")}）`);
  const stop = shared.hooks?.Stop;
  const registered = Array.isArray(stop) && stop.some((g) => Array.isArray(g?.hooks) && g.hooks.some((h) => [h?.command, ...(h?.args || [])].some((x) => typeof x === "string" && x.includes("check-claude-setup.mjs"))));
  if (!registered) warnings.push(".claude/settings.json: 構造検査の Stop フックが登録されていない");
}

function checkSkills() {
  const names = new Map();
  for (const d of listDir(".claude/skills")) {
    if (!d.isDirectory()) continue;
    const rel = `.claude/skills/${d.name}/SKILL.md`;
    const text = readText(rel);
    if (text === null) {
      if (OWN_SKILLS.includes(d.name)) errors.push(`${rel}: ない`);
      continue;
    }
    const fm = frontmatter(text);
    if (fm.has && !fm.closed) {
      errors.push(`${rel}: YAML フロントマター（--- で囲む）が閉じていない`);
      continue;
    }
    // フロントマターは省略できる（公式資料）。作成した2つの Skill だけは必須にする。
    if (!fm.has && OWN_SKILLS.includes(d.name)) {
      errors.push(`${rel}: YAML フロントマター（--- で囲む）がない`);
      continue;
    }
    const data = fm.has ? fm.data : {};
    for (const u of fm.unknown || []) warnings.push(`${rel}: 簡易解析で読めない行 "${u}"`);
    const name = typeof data.name === "string" ? data.name : d.name;
    if (names.has(name)) errors.push(`${rel}: スキル名 "${name}" が ${names.get(name)} と重複`);
    names.set(name, rel);
    if (!OWN_SKILLS.includes(d.name)) continue;
    if (typeof data.name !== "string" || !data.name) errors.push(`${rel}: name がない`);
    else if (data.name !== d.name) errors.push(`${rel}: name "${data.name}" がディレクトリ名 "${d.name}" と違う`);
    else if (!/^[a-z0-9][a-z0-9-]*$/.test(data.name)) errors.push(`${rel}: name は小文字・数字・ハイフンにする`);
    if (typeof data.description !== "string" || data.description.length < 20) errors.push(`${rel}: description がない、または短すぎる`);
    if (data["disable-model-invocation"] !== true) errors.push(`${rel}: disable-model-invocation: true がない（利用者が明示的に開始する設計）`);
    if ("allowed-tools" in data) {
      const tools = Array.isArray(data["allowed-tools"]) ? data["allowed-tools"] : String(data["allowed-tools"]).split(/[\s,]+/);
      const broad = tools.filter((t) => ["Bash", "Bash(*)", "PowerShell", "*", "Write", "Edit"].includes(t));
      if (broad.length) errors.push(`${rel}: allowed-tools に広い許可（${broad.join(", ")}）`);
      else warnings.push(`${rel}: allowed-tools がある（承認の省略になる。必要性を確認する）`);
    }
    if (!(fm.body || "").includes("$ARGUMENTS")) warnings.push(`${rel}: 本文に $ARGUMENTS がない`);
  }
}

function checkAgents() {
  const names = new Map();
  for (const d of listDir(".claude/agents")) {
    if (!d.isFile() || !d.name.endsWith(".md")) continue;
    const rel = `.claude/agents/${d.name}`;
    const text = readText(rel);
    if (text === null) continue;
    const fm = frontmatter(text);
    if (!fm.has || !fm.closed) {
      errors.push(`${rel}: YAML フロントマターがない、または閉じていない`);
      continue;
    }
    const { data } = fm;
    for (const u of fm.unknown) warnings.push(`${rel}: 簡易解析で読めない行 "${u}"`);
    if (typeof data.name !== "string" || !data.name) {
      errors.push(`${rel}: name がない`);
      continue;
    }
    if (data.name.includes(":")) errors.push(`${rel}: name に ":" は使えない`);
    if (names.has(data.name)) errors.push(`${rel}: エージェント名 "${data.name}" が ${names.get(data.name)} と重複`);
    names.set(data.name, rel);
    if (typeof data.description !== "string" || !data.description) errors.push(`${rel}: description がない`);
    if (data.name !== "project-reviewer") continue;
    const tools = Array.isArray(data.tools) ? data.tools : typeof data.tools === "string" ? data.tools.split(/\s*,\s*/) : [];
    if (!tools.length) errors.push(`${rel}: tools がない（省略するとすべてのツールを受け継ぐ）`);
    const extra = tools.filter((t) => !REVIEWER_TOOLS.has(t));
    if (extra.length) errors.push(`${rel}: 確認役に読み取り以外のツール（${extra.join(", ")}）`);
    for (const key of ["mcpServers", "permissionMode", "hooks"]) {
      if (key in data) errors.push(`${rel}: 確認役に ${key} を設定しない`);
    }
  }
  if (!names.has("project-reviewer")) errors.push(".claude/agents: project-reviewer が定義されていない");
}

function checkRules() {
  const files = [];
  const walk = (rel, depth) => {
    if (depth > 3) return;
    for (const d of listDir(rel)) {
      const child = `${rel}/${d.name}`;
      if (d.isDirectory()) walk(child, depth + 1);
      else if (d.name.endsWith(".md")) files.push(child);
    }
  };
  walk(".claude/rules", 0);
  const agents = readText("AGENTS.md") || "";
  const agentsSet = new Set(agents.split("\n").map((l) => l.trim()).filter((l) => l.length >= 20 && !l.startsWith("#")));
  const contents = new Map();
  let always = 0;
  for (const rel of files) {
    const text = readText(rel);
    if (text === null) continue;
    if (contents.has(text)) errors.push(`${rel}: ${contents.get(text)} と内容が同じ（重複したルール）`);
    contents.set(text, rel);
    const fm = frontmatter(text);
    if (!fm.has) {
      always++;
      continue;
    }
    if (!fm.closed) {
      errors.push(`${rel}: フロントマターが閉じていない（常時読み込みになる）`);
      continue;
    }
    for (const u of fm.unknown) errors.push(`${rel}: フロントマターの読めない行 "${u}"（YAML が壊れると常時読み込みになる）`);
    const paths = fm.data.paths;
    const list = Array.isArray(paths) ? paths : typeof paths === "string" ? paths.split(/\s*,\s*/) : [];
    if (!list.length) {
      errors.push(`${rel}: paths がない、または空（常時読み込みになる）`);
      continue;
    }
    for (const p of list) {
      if (/\[(?![^\]]*\])/.test(p)) warnings.push(`${rel}: パターン "${p}" の [ が閉じていない（何にも一致しない）`);
      if (!/[*?[{]/.test(p) && !existsSync(abs(p))) warnings.push(`${rel}: パス "${p}" のファイルが存在しない`);
    }
    const dup = fm.body.split("\n").map((l) => l.trim()).filter((l) => agentsSet.has(l));
    if (dup.length) warnings.push(`${rel}: AGENTS.md と同じ行が ${dup.length} 行ある（共通ルールの複製）`);
  }
  if (always > 3) warnings.push(`.claude/rules: paths のない常時読み込みルールが ${always} 件ある`);
  if (files.length) notes.push(`rules の paths が実際のファイルに一致するかは、ワイルドカードを含まないパスだけ確認した`);
}

function checkGitignore() {
  const text = readText(".gitignore");
  if (text === null) {
    warnings.push(".gitignore がない");
    return;
  }
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  for (const need of REQUIRED_GITIGNORE) {
    if (!lines.includes(need)) warnings.push(`.gitignore: "${need}" がない`);
  }
  const seen = new Set();
  for (const l of lines) {
    if (seen.has(l)) warnings.push(`.gitignore: "${l}" が重複`);
    seen.add(l);
  }
  notes.push("Git で追跡済みのファイルが .gitignore の対象かどうかは検査しない（git コマンドを実行しないため）");
}

function runChecks() {
  checkFiles();
  checkImports();
  checkSettings();
  checkSkills();
  checkAgents();
  checkRules();
  checkGitignore();
  notes.push("YAML フロントマターは簡易解析で、YAML の完全な検証ではない");
  notes.push("Claude Code が実際に設定を読み込んだかは、この検査では確かめられない（新しいセッションの /memory、/skills、/hooks、/permissions で確認する）");
}

// ---------- 出力 ----------

function report() {
  const out = [`AI作業設定の構造検査（対象: ${ROOT}）`, `不合格: ${errors.length}件`];
  for (const e of errors) out.push(`  - ${e}`);
  out.push(`注意: ${warnings.length}件`);
  for (const w of warnings) out.push(`  - ${w}`);
  out.push("未検証・補足:");
  for (const n of notes) out.push(`  - ${n}`);
  out.push(`結果: ${errors.length ? "不合格" : "合格"}`);
  return out.join("\n");
}

function blockReason() {
  const list = errors.slice(0, 15).map((e) => `- ${e}`);
  if (errors.length > 15) list.push(`- ほか ${errors.length - 15} 件（node ${SELF} で全件を表示）`);
  return [
    `AI作業設定の構造検査が不合格です（${errors.length}件）。`,
    ...list,
    "上の項目を直してから終了してください。直せない場合は、原因と必要な情報を利用者に報告してください。",
    ...(errors.some((e) => e.startsWith(".claude/settings.local.json"))
      ? ["`.claude/settings.local.json` は利用者の個人用設定です。編集せずに、該当の項目を利用者に報告してください。"]
      : []),
    "このフックは同じ停止の続きでは再ブロックしません。",
  ].join("\n").slice(0, 9000);
}

function emit(obj, code = 0) {
  const text = obj === null ? "" : JSON.stringify(obj);
  process.stdout.write(text, () => process.exit(code));
}

function readStdin() {
  return new Promise((done) => {
    if (process.stdin.isTTY) return done({ status: "none" });
    let data = "";
    const timer = setTimeout(() => {
      process.stdin.pause();
      done({ status: "timeout" });
    }, STDIN_LIMIT_MS);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      data += c;
      if (data.length > 1024 * 1024) {
        clearTimeout(timer);
        process.stdin.pause();
        done({ status: "too-large" });
      }
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      done({ status: "ok", data });
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      done({ status: "error" });
    });
  });
}

async function hookMain() {
  const deadline = setTimeout(() => {
    emit({ systemMessage: "AI作業設定の構造検査が制限時間内に終わりませんでした。検査は未完了です（合格扱いではありません）。" });
  }, DEADLINE_MS);

  const input = await readStdin();
  let payload = null;
  let inputProblem = "";
  if (input.status === "ok") {
    try {
      payload = JSON.parse(input.data);
    } catch {
      inputProblem = "フックの入力 JSON を解釈できませんでした";
    }
    if (!inputProblem && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
      payload = null;
      inputProblem = "フックの入力が JSON オブジェクトではありません";
    }
  } else {
    inputProblem = { none: "フックの入力がありません", timeout: "フックの入力が時間内に届きませんでした", "too-large": "フックの入力が大きすぎます", error: "フックの入力を読めませんでした" }[input.status];
  }

  const event = payload && typeof payload === "object" ? payload.hook_event_name : undefined;
  if (event !== undefined && event !== "Stop" && event !== "SubagentStop") {
    clearTimeout(deadline);
    return emit(null);
  }

  runChecks();
  clearTimeout(deadline);
  if (!errors.length) return emit(null);

  const summary = `AI作業設定の構造検査: 不合格 ${errors.length}件（node ${SELF} で詳細を表示）。`;
  if (inputProblem) {
    return emit({ systemMessage: `${summary}${inputProblem}。安全のためブロックせずに終了します。合格ではありません。` });
  }
  if (payload.stop_hook_active === true) {
    return emit({ systemMessage: `${summary}再ブロックはせずに停止します。合格ではありません。` });
  }
  return emit({ decision: "block", reason: blockReason() });
}

if (HOOK_MODE) {
  hookMain().catch((e) => {
    emit({ systemMessage: `AI作業設定の構造検査で内部エラーが起きました（${e && e.name}）。検査は未完了です（合格扱いではありません）。` });
  });
} else {
  try {
    runChecks();
    console.log(report());
    process.exitCode = errors.length ? 1 : 0;
  } catch (e) {
    console.error(`内部エラー: ${e && e.stack}`);
    process.exitCode = 3;
  }
}
