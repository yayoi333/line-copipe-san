(() => {
  const ID = "lcm-bm-panel";
  const KEY = "lcmBookmarkletPayload";
  const TAG_KEY = "lcmBookmarkletTagJson";
  const CLIP_PREFIX = "LINE_CM_HELPER:";
  const TAG_CLIP_PREFIX = "LINE_CM_TAG_JSON:";
  const OLD = document.getElementById(ID);
  if (OLD) {
    OLD.remove();
    return;
  }

  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nt = (v) => String(v || "").replace(/\s+/g, " ").trim();
  const hw = (v) => String(v || "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const pad3 = (v) => {
    const m = hw(v).match(/\d{1,3}/);
    return m ? m[0].padStart(3, "0") : "";
  };
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const showNo = (v) => {
    const n = pad3(v);
    return n === "000" ? "" : n.replace(/^0(?=\d{2}$)/, "");
  };

  function vis(e) {
    if (!(e instanceof HTMLElement)) return false;
    if (e.closest("#" + ID)) return false;
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  }

  function fields() {
    return qa("input,textarea,[contenteditable='true']").filter((e) => {
      if (!vis(e)) return false;
      return !(e instanceof HTMLInputElement) || ["", "text", "search", "number"].includes(e.type);
    });
  }

  function val(e) {
    return nt(e && (e.value || e.textContent));
  }

  function setVal(e, v) {
    if (!e) return false;
    if (e.isContentEditable) e.textContent = v;
    else {
      const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), "value");
      d && d.set ? d.set.call(e, v) : (e.value = v);
    }
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function textNodes(re) {
    const w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const out = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentElement?.closest("#" + ID)) continue;
      if (n.parentElement?.closest("option,select")) continue;
      if (re.test(nt(n.textContent))) out.push(n);
    }
    return out;
  }

  function rectOf(n) {
    const r = document.createRange();
    r.selectNodeContents(n);
    const b = r.getBoundingClientRect();
    r.detach();
    return b;
  }

  function block(n) {
    let e = n instanceof Element ? n : n.parentElement;
    while (e && e !== document.body) {
      const r = e.getBoundingClientRect();
      const fc = e.querySelectorAll("input,textarea,select,[contenteditable='true']").length;
      if (fc && r.width > 120 && r.height > 22 && nt(e.textContent).length < 1000) return e;
      e = e.parentElement;
    }
    return n.parentElement || document.body;
  }

  function afterLabel(re, sel, gap = 240) {
    const fs = qa(sel).filter(vis);
    const cand = [];
    for (const n of textNodes(re)) {
      const lr = rectOf(n);
      for (const f of fs) {
        const fr = f.getBoundingClientRect();
        const dy = fr.top - lr.bottom;
        const dx = Math.abs(fr.left - lr.left);
        if (dy >= -8 && dy <= gap && dx <= 240) cand.push([f, dy + dx * 1.7]);
      }
    }
    cand.sort((a, b) => a[1] - b[1]);
    return cand[0] && cand[0][0];
  }

  function nearLabel(re, ta) {
    for (const n of textNodes(re)) {
      const s = ta ? "textarea,[contenteditable='true']" : "input,[contenteditable='true']";
      const f = qa(s, block(n)).find((e) => vis(e) && (!(e instanceof HTMLInputElement) || ["", "text", "search"].includes(e.type)));
      if (f) return f;
    }
    return null;
  }

  function metaField(re, ta) {
    return fields().find((f) => {
      if (ta !== undefined && (f instanceof HTMLTextAreaElement) !== ta) return false;
      return re.test(nt([f.placeholder, f.ariaLabel, f.name, f.id].join(" ")));
    });
  }

  function collectTexts() {
    const titleJa = /タイトル\s*[（(]\s*(絵文字名|スタンプ名)\s*[）)]|日本語.*タイトル|絵文字名|スタンプ名/;
    const descJa = /(絵文字|スタンプ)説明文|日本語.*説明|説明文コメント/;
    const titleEn = /タイトル\s*[（(]\s*En\s*[）)]|Title\s*\(?En\)?|英語.*タイトル/i;
    const descEn = /説明文\s*[（(]\s*En\s*[）)]|Description\s*\(?En\)?|英語.*説明/i;
    const current = {
      jaTitle: val(afterLabel(titleJa, "input") || nearLabel(titleJa) || metaField(/タイトル|絵文字名|スタンプ名/)),
      jaDescription: val(afterLabel(descJa, "textarea") || nearLabel(descJa, true) || metaField(/説明|コメント/, true)),
      enTitle: val(afterLabel(titleEn, "input") || nearLabel(titleEn) || metaField(/en.*title|title.*en|英語.*タイトル/i)),
      enDescription: val(afterLabel(descEn, "textarea") || nearLabel(descEn, true) || metaField(/en.*description|description.*en|英語.*説明/i, true))
    };
    const ins = fields().filter((f) => f instanceof HTMLInputElement && val(f).length <= 40);
    const tas = fields().filter((f) => f instanceof HTMLTextAreaElement && val(f).length <= 160);
    return {
      jaTitle: current.jaTitle || val(ins[0]),
      jaDescription: current.jaDescription || val(tas[0]),
      enTitle: current.enTitle || val(ins[1]),
      enDescription: current.enDescription || val(tas[1])
    };
  }

  function numsFrom(v) {
    return (hw(v).match(/\d{3}/g) || []).map(pad3);
  }

  function collectMainImages() {
    const exact4 = (v) => {
      const ns = numsFrom(v);
      return ns.length === 4 ? ns : [];
    };
    const containers = uniq(textNodes(/番号コピー|メイン画像|代表画像設定/).map(block));
    for (const c of containers) {
      const fieldSet = qa("input,textarea", c).filter(vis).map((f) => exact4(f.value)).find((x) => x.length === 4);
      if (fieldSet) return fieldSet;
      const selectSet = uniq(qa("select", c).filter(vis).map((s) => pad3(s.selectedOptions?.[0]?.textContent || s.value))).slice(0, 4);
      if (selectSet.length === 4) return selectSet;
      const textSet = exact4(c.textContent);
      if (textSet.length === 4) return textSet;
    }
    const allFields = qa("input,textarea").filter(vis).map((f) => exact4(f.value)).find((x) => x.length === 4);
    if (allFields) return allFields;
    for (const n of textNodes(/番号コピー/)) {
      const r = rectOf(n);
      const below = qa("input,textarea").filter((f) => {
        if (!vis(f)) return false;
        const fr = f.getBoundingClientRect();
        return fr.top >= r.bottom - 10 && fr.top - r.bottom < 180 && Math.abs(fr.left - r.left) < 260;
      });
      const ns = below.map((f) => exact4(f.value)).find((x) => x.length === 4);
      if (ns) return ns;
    }
    return [];
  }

  function payload(d = {}) {
    return {
      enTitle: String(d.enTitle || "").slice(0, 40),
      enDescription: String(d.enDescription || "").slice(0, 160),
      jaTitle: String(d.jaTitle || "").slice(0, 40),
      jaDescription: String(d.jaDescription || "").slice(0, 160),
      mainImages: Array.isArray(d.mainImages) ? d.mainImages.map(pad3).filter(Boolean).slice(0, 4) : [],
      capturedAt: d.capturedAt || ""
    };
  }

  function load() {
    try {
      return payload(JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (_) {
      return payload();
    }
  }

  function clipText(d) {
    return CLIP_PREFIX + JSON.stringify(payload(d));
  }

  function fromClipText(t) {
    t = String(t || "").trim();
    if (t.startsWith(CLIP_PREFIX)) return payload(JSON.parse(t.slice(CLIP_PREFIX.length)));
    const d = JSON.parse(t);
    if (d && (d.enTitle || d.jaTitle || d.enDescription || d.jaDescription || d.mainImages)) return payload(d);
    throw Error("申請データではありません");
  }

  async function copyClip(d) {
    const t = clipText(d);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
    const a = document.createElement("textarea");
    a.value = t;
    a.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(a);
    a.focus();
    a.select();
    const ok = document.execCommand("copy");
    a.remove();
    return ok;
  }

  async function readClip() {
    let t = "";
    if (navigator.clipboard?.readText) {
      try {
        t = await navigator.clipboard.readText();
      } catch (_) {}
    }
    if (!t) t = prompt("取得時にコピーされた申請データを貼り付けてください", "") || "";
    if (!t) throw Error("クリップボードを読めません");
    return fromClipText(t);
  }

  async function copyText(t) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
    const a = document.createElement("textarea");
    a.value = t;
    a.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(a);
    a.focus();
    a.select();
    const ok = document.execCommand("copy");
    a.remove();
    return ok;
  }

  async function readTextPrompt(msg) {
    let t = "";
    if (navigator.clipboard?.readText) {
      try {
        t = await navigator.clipboard.readText();
      } catch (_) {}
    }
    if (!t) t = prompt(msg, "") || "";
    return t;
  }

  async function loadAny() {
    const d = load();
    if (d.enTitle || d.enDescription || d.jaTitle || d.jaDescription || d.mainImages.length) return d;
    const c = await readClip();
    localStorage.setItem(KEY, JSON.stringify(c));
    draw();
    return c;
  }

  function save(d) {
    localStorage.setItem(KEY, JSON.stringify(payload(d)));
    draw();
  }

  function langFields(lang) {
    const re = lang === "en" ? /English\s*[（(]?|英語/i : /Japanese\s*[（(]?|日本語/i;
    return { input: afterLabel(re, "input"), textarea: afterLabel(re, "textarea", 300) };
  }

  function afterEl(a, sel) {
    const ar = a.getBoundingClientRect();
    return qa(sel).filter((f) => vis(f) && f.getBoundingClientRect().top >= ar.top - 4);
  }

  function optionJa(o) {
    return /Japanese|日本語|ja\b|jp\b/i.test(nt([o.textContent, o.value].join(" ")));
  }

  function pickJaSelect() {
    const selects = qa("select").filter(vis);
    for (const n of textNodes(/言語を追加|追加言語|Language/i)) {
      const local = qa("select", block(n)).filter(vis).find((s) => qa("option", s).some(optionJa));
      if (local) return local;
      const near = afterEl(n.parentElement || document.body, "select").find((s) => qa("option", s).some(optionJa));
      if (near) return near;
    }
    return selects.find((s) => qa("option", s).some(optionJa));
  }

  function setSelect(s, o) {
    if (!s || !o) return false;
    s.value = o.value;
    o.selected = true;
    s.selectedIndex = qa("option", s).indexOf(o);
    ["input", "change", "blur"].forEach((t) => s.dispatchEvent(new Event(t, { bubbles: true })));
    try {
      window.jQuery?.(s).val(o.value).trigger("change");
    } catch (_) {}
    return true;
  }

  function btnNear(e, re) {
    for (let s = e.parentElement; s && s !== document.body; s = s.parentElement) {
      const b = qa("button,input[type='button'],input[type='submit'],a", s).find((x) => vis(x) && re.test(nt(x.textContent || x.value)));
      if (b) return b;
    }
    return qa("button,input[type='button'],input[type='submit'],a").find((x) => vis(x) && re.test(nt(x.textContent || x.value)));
  }

  async function waitFor(fn, ms = 3500) {
    const t = Date.now();
    let r = fn();
    while (!r && Date.now() - t < ms) {
      await sleep(150);
      r = fn();
    }
    return r;
  }

  async function ensureJa() {
    const j = langFields("ja");
    if (j.input || j.textarea) return true;
    const s = pickJaSelect();
    if (!s) return false;
    const o = qa("option", s).find(optionJa);
    if (!o) return false;
    setSelect(s, o);
    await sleep(250);
    const add = await waitFor(() => {
      const b = btnNear(s, /追加|Add/i);
      return b && !b.disabled ? b : null;
    }, 2500);
    add?.click();
    return !!(await waitFor(() => {
      const x = langFields("ja");
      return x.input || x.textarea;
    }, 4500));
  }

  async function fillTexts(d) {
    d = payload(d);
    const done = [];
    const before = fields();
    const ins = before.filter((f) => f instanceof HTMLInputElement);
    const tas = before.filter((f) => f instanceof HTMLTextAreaElement);
    const en = langFields("en");
    if (d.enTitle && setVal(en.input || ins[0], d.enTitle)) done.push("英語タイトル");
    if (d.enDescription && setVal(en.textarea || tas[0], d.enDescription)) done.push("英語説明");
    if (d.jaTitle || d.jaDescription) {
      const ok = await ensureJa();
      const ja = langFields("ja");
      if (!ok && !ja.input && !ja.textarea) throw Error("Japanese欄を追加できませんでした");
      if (!ja.input || !ja.textarea) throw Error("Japanese欄が見つかりません。Japaneseを追加してからもう一度押してください");
      if (d.jaTitle && setVal(ja.input, d.jaTitle)) done.push("日本語タイトル");
      if (d.jaDescription && setVal(ja.textarea, d.jaDescription)) done.push("日本語説明");
    }
    if (!done.length) throw Error("タイトル・説明の入力欄が見つかりません");
    return done.join("、");
  }

  function mainInputs() {
    for (const n of textNodes(/メイン画像/)) {
      const xs = afterEl(n.parentElement || document.body, "input").filter((f) => f instanceof HTMLInputElement && ["", "text", "number", "search"].includes(f.type) && f.getBoundingClientRect().width > 70);
      if (xs.length >= 4) return xs.slice(0, 4);
    }
    return fields().filter((f) => f instanceof HTMLInputElement && /^\d{0,3}$/.test(f.value)).slice(-4);
  }

  function fillMain(d) {
    const ns = payload(d).mainImages;
    if (!ns.length) throw Error("保存データにメイン画像番号がありません");
    const xs = mainInputs();
    const done = [];
    ns.forEach((n, i) => setVal(xs[i], n) && done.push("メイン画像" + (i + 1)));
    if (!done.length) throw Error("メイン画像番号の入力欄が見つかりません");
    return done.join("、");
  }

  let stopTags = false;
  async function waitTags() {
    for (let i = 0; i < 30; i++) {
      const t = qa("label.cm-product-image-tag");
      if (t.length > 20) return t;
      await sleep(200);
    }
    return qa("label.cm-product-image-tag");
  }

  function tagName(lb) {
    return nt(lb.textContent).split(/[（(]\d+[）)]/)[0].trim();
  }

  async function applyTags(tags, log) {
    const all = await waitTags();
    if (!all.length) throw Error("タグ候補が読み込めません");
    for (const tag of tags) {
      if (stopTags) return;
      const lb = all.find((x) => tagName(x) === tag);
      if (!lb) {
        log("見つかりません: " + tag, "#d33");
        continue;
      }
      if (lb.classList.contains("cm-product-image-tag-selected")) log("設定済み: " + tag, "#777");
      else {
        lb.click();
        log("追加: " + tag, "#078a3d");
        await sleep(450);
      }
    }
  }

  async function nextImage(cur) {
    const b = q(".btn-next-image") || qa("button,a").find((x) => vis(x) && /次|›|＞|→/.test(nt(x.textContent || x.value)));
    if (!b) return false;
    b.click();
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      const h = location.hash.replace(/^#\/?/, "");
      if (h && h !== cur) return true;
    }
    return true;
  }

  function currentNo() {
    return pad3(location.hash.replace(/^#\/?/, "") || q("select")?.value || "");
  }

  function parseMap(text) {
    text = String(text || "").trim();
    if (text.startsWith(TAG_CLIP_PREFIX)) text = text.slice(TAG_CLIP_PREFIX.length);
    const m = JSON.parse(text);
    return Object.entries(m).map(([n, tags]) => [pad3(n), Array.isArray(tags) ? tags.map(String) : String(tags).split(/[,\n、]/).map(nt).filter(Boolean)])
      .filter(([n, tags]) => n && tags.length)
      .sort((a, b) => Number(a[0]) - Number(b[0]));
  }

  function tagJsonText(text) {
    text = String(text || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a < 0 || b <= a) return "";
    const j = text.slice(a, b + 1);
    parseMap(j);
    return j;
  }

  function collectTagJson() {
    const nodes = qa("pre,code,textarea,[data-message-author-role='assistant'],.markdown,.prose").filter((x) => x instanceof HTMLElement && !x.closest("#" + ID));
    const texts = nodes.map((x) => x.value || x.textContent || "").filter((t) => /["']?0*0?1["']?\s*:/.test(t) && /[\[{]/.test(t));
    texts.push(document.body?.innerText || "");
    for (const t of texts.sort((a, b) => b.length - a.length)) {
      try {
        return tagJsonText(t);
      } catch (_) {}
    }
    throw Error("タグ対応表JSONが見つかりません");
  }

  async function saveTagJson(text) {
    const j = tagJsonText(text);
    localStorage.setItem(TAG_KEY, j);
    e("lcm-json").value = j;
    await copyText(TAG_CLIP_PREFIX + j);
    return parseMap(j).length;
  }

  function hasText(re) {
    return textNodes(re).length > 0;
  }

  function pageMode() {
    if (qa("label.cm-product-image-tag").length || q(".btn-next-image") || hasText(/タグの編集|おすすめのタグ|タグ設定/) || /["']?0*0?1["']?\s*:/.test(document.body?.innerText || "")) return "tag";
    if (hasText(/メイン画像/) && afterEl(textNodes(/メイン画像/)[0]?.parentElement || document.body, "input").length >= 4) return "main";
    if (hasText(/言語を追加|追加言語/) || (hasText(/English/) && hasText(/タイトル/) && hasText(/説明文/))) return "text";
    if (hasText(/切り出し結果|絵文字名・説明文|スタンプ名・説明文|番号コピー|代表画像設定/)) return "collect";
    return "";
  }

  const p = document.createElement("div");
  p.id = ID;
  p.innerHTML = `<style>
#${ID}{position:fixed;top:14px;right:14px;width:390px;max-width:calc(100vw - 28px);max-height:calc(100vh - 28px);overflow:auto;z-index:2147483647;background:#ecfdf5;border:1px solid #86efac;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.22);font:13px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033}
#${ID} *{box-sizing:border-box;letter-spacing:0}
#${ID} .h{display:flex;gap:10px;align-items:center;padding:14px;border-bottom:1px solid #bbf7d0;cursor:move;touch-action:none}
#${ID} .m{display:grid;place-items:center;width:40px;height:40px;background:#10b981;color:white;border-radius:8px;font-weight:900;font-size:24px}
#${ID} h1{margin:0;font-size:18px;line-height:1.2}
#${ID} .s{margin:2px 0 0;color:#64748b;font-size:12px}
#${ID} .x{margin-left:auto;border:0;background:transparent;color:#64748b;font-size:24px;cursor:pointer}
#${ID} .b{display:grid;gap:9px;padding:12px 14px}
#${ID} button{min-height:38px;border:1px solid #86efac;border-radius:8px;background:white;color:#172033;font-weight:700;cursor:pointer}
#${ID} .pri{background:#059669;border-color:#059669;color:white}
#${ID} .danger{background:#ef4444;border-color:#ef4444;color:white}
#${ID} .hide{display:none}
#${ID} dl{margin:0 14px 12px;border:1px solid #bbf7d0;border-radius:8px;background:white;overflow:hidden}
#${ID} dl div{display:grid;grid-template-columns:105px minmax(0,1fr);gap:8px;padding:9px 10px;border-bottom:1px solid #eef2f7}
#${ID} dl div:last-child{border:0}
#${ID} dt{font-weight:800;color:#64748b}
#${ID} dd{margin:0;overflow-wrap:anywhere}
#${ID} textarea{width:100%;height:112px;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:12px/1.45 ui-monospace,Consolas,monospace;resize:vertical}
#${ID} .tag{padding:0 14px 14px}
#${ID} .log{min-height:54px;max-height:150px;overflow:auto;margin-top:8px;padding:8px;border-radius:8px;background:#f8fafc;color:#334155}
#${ID} .foot{display:flex;justify-content:flex-end;padding:0 14px 14px}
#${ID} .link{border:0;background:transparent;color:#059669;min-height:auto;padding:5px}
@media(max-width:480px){#${ID}{top:8px;right:8px;max-width:calc(100vw - 16px)}#${ID} dl div{grid-template-columns:92px minmax(0,1fr)}}
</style>
<div class="h"><div class="m">▦</div><div><h1>LINE申請コピペさん</h1><p class="s" id="lcm-st">準備できました</p></div><button class="x" id="lcm-x" type="button">×</button></div>
<div class="b">
<button id="lcm-get" type="button">このページから取得</button>
<button id="lcm-loadclip" type="button">クリップボードから復元</button>
<button id="lcm-fill-t" type="button">英日タイトル・説明を貼り付け</button>
<button id="lcm-fill-n" type="button">番号を貼り付け</button>
<button id="lcm-tag-toggle" type="button">タグ付け</button>
</div>
<dl id="lcm-preview"><div><dt>英語タイトル</dt><dd id="lcm-et">-</dd></div><div><dt>英語説明</dt><dd id="lcm-ed">-</dd></div><div><dt>日本語タイトル</dt><dd id="lcm-jt">-</dd></div><div><dt>日本語説明</dt><dd id="lcm-jd">-</dd></div><div><dt>メイン画像</dt><dd id="lcm-mi">-</dd></div></dl>
<div class="tag hide" id="lcm-tagbox"><b>タグJSON自動設定</b><button id="lcm-json-get" type="button" style="margin-top:8px;width:100%">このページからJSON取得</button><button id="lcm-json-load" type="button" style="margin-top:8px;width:100%">クリップボードからJSON復元</button><textarea id="lcm-json" placeholder='{"001":["了解","OK"],"002":["かわいい"]}'></textarea><button class="pri" id="lcm-run" type="button">実行する</button><button class="danger" id="lcm-stop" type="button" style="display:none;margin-top:8px;width:100%">停止する</button><div class="log" id="lcm-log"></div><div class="foot" style="padding:4px 0 0"><button class="link" id="lcm-json-clear" type="button">JSONをクリア</button></div></div>
<div class="foot"><button class="link" id="lcm-clear" type="button">保存データを消す</button></div>`;
  document.body.appendChild(p);

  const e = (id) => q("#" + id, p);
  const st = (m) => (e("lcm-st").textContent = m);
  const setTagOpen = (open) => {
    e("lcm-tagbox").classList.toggle("hide", !open);
    e("lcm-preview").classList.toggle("hide", open);
  };
  const log = (m, c = "#334155") => {
    const d = document.createElement("div");
    d.style.color = c;
    d.textContent = m;
    e("lcm-log").appendChild(d);
    e("lcm-log").scrollTop = e("lcm-log").scrollHeight;
  };
  function markActive() {
    const mode = pageMode();
    [
      ["lcm-get", mode === "collect"],
      ["lcm-fill-t", mode === "text"],
      ["lcm-fill-n", mode === "main"],
      ["lcm-tag-toggle", mode === "tag"]
    ].forEach(([id, on]) => e(id).classList.toggle("pri", on));
    if (mode === "tag") setTagOpen(true);
    if (mode === "text" || mode === "main" || mode === "collect") e("lcm-preview").classList.remove("hide");
  }

  function makeDraggable() {
    const h = q(".h", p);
    let drag = null;
    h.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest("button")) return;
      const r = p.getBoundingClientRect();
      drag = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      p.style.left = r.left + "px";
      p.style.top = r.top + "px";
      p.style.right = "auto";
      h.setPointerCapture?.(ev.pointerId);
      ev.preventDefault();
    });
    h.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const maxX = innerWidth - p.offsetWidth - 4;
      const maxY = innerHeight - 44;
      p.style.left = Math.max(4, Math.min(maxX, ev.clientX - drag.x)) + "px";
      p.style.top = Math.max(4, Math.min(maxY, ev.clientY - drag.y)) + "px";
    });
    h.addEventListener("pointerup", () => (drag = null));
    h.addEventListener("pointercancel", () => (drag = null));
  }

  function draw() {
    const d = load();
    e("lcm-et").textContent = d.enTitle || "-";
    e("lcm-ed").textContent = d.enDescription || "-";
    e("lcm-jt").textContent = d.jaTitle || "-";
    e("lcm-jd").textContent = d.jaDescription || "-";
    e("lcm-mi").textContent = d.mainImages.length ? d.mainImages.join(" ") : "-";
    e("lcm-fill-n").disabled = false;
    markActive();
  }

  e("lcm-json").value = localStorage.getItem(TAG_KEY) || "";
  e("lcm-x").onclick = () => p.remove();
  e("lcm-tag-toggle").onclick = () => {
    setTagOpen(e("lcm-tagbox").classList.contains("hide"));
    markActive();
  };
  e("lcm-json-get").onclick = async () => {
    try {
      const n = await saveTagJson(collectTagJson());
      st("タグJSONを取得しました: " + n + "件");
    } catch (err) {
      st(err.message);
    }
  };
  e("lcm-json-load").onclick = async () => {
    try {
      const t = await readTextPrompt("取得時にコピーされたタグJSONを貼り付けてください");
      const n = await saveTagJson(t);
      st("タグJSONを復元しました: " + n + "件");
    } catch (err) {
      st("タグJSONを復元できません: " + err.message);
    }
  };
  e("lcm-json-clear").onclick = () => {
    e("lcm-json").value = "";
    e("lcm-log").innerHTML = "";
    localStorage.removeItem(TAG_KEY);
    st("タグJSONを消しました");
  };
  e("lcm-clear").onclick = () => {
    localStorage.removeItem(KEY);
    draw();
    st("保存データを消しました");
  };
  e("lcm-loadclip").onclick = async () => {
    try {
      const d = await readClip();
      save(d);
      e("lcm-preview").classList.remove("hide");
      st("クリップボードから復元しました");
    } catch (err) {
      st(err.message + "。取得ページでもう一度「このページから取得」を押してください");
    }
  };
  e("lcm-get").onclick = async () => {
    const d = payload({ ...collectTexts(), mainImages: collectMainImages(), capturedAt: new Date().toISOString() });
    save(d);
    e("lcm-preview").classList.remove("hide");
    try {
      await copyClip(d);
      st("取得してクリップボードにも保存しました");
    } catch (_) {
      st("取得しました。移動後に消える場合はこの画面の内容を控えてください");
    }
  };
  e("lcm-fill-t").onclick = async () => {
    try {
      st("入力中...");
      st("入力しました: " + await fillTexts(await loadAny()));
    } catch (err) {
      st(err.message);
    }
  };
  e("lcm-fill-n").onclick = () => {
    (async () => {
      try {
        st("入力しました: " + fillMain(await loadAny()));
      } catch (err) {
        st(err.message);
      }
    })();
  };
  e("lcm-stop").onclick = () => {
    stopTags = true;
    st("停止します");
  };
  e("lcm-run").onclick = async () => {
    e("lcm-log").innerHTML = "";
    stopTags = false;
    let entries;
    try {
      const txt = e("lcm-json").value.trim();
      localStorage.setItem(TAG_KEY, txt);
      entries = parseMap(txt);
      if (!entries.length) throw Error("対応表が空です");
    } catch (err) {
      log("JSONを確認してください: " + err.message, "#d33");
      return;
    }
    e("lcm-run").disabled = true;
    e("lcm-stop").style.display = "block";
    log(entries.length + "個を処理します");
    for (let i = 0; i < entries.length; i++) {
      if (stopTags) break;
      const [num, tags] = entries[i];
      const cur = currentNo();
      log("No." + showNo(num));
      if (cur && cur !== num) log("現在地は No." + showNo(cur) + " です", "#b7791f");
      try {
        await applyTags(tags, log);
      } catch (err) {
        log(err.message, "#d33");
        break;
      }
      if (i < entries.length - 1 && !stopTags) await nextImage(cur);
      await sleep(700);
    }
    log(stopTags ? "停止しました" : "完了しました", stopTags ? "#b7791f" : "#078a3d");
    e("lcm-run").disabled = false;
    e("lcm-stop").style.display = "none";
  };
  makeDraggable();
  draw();
})();
