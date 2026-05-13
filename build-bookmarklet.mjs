import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "line-cm-helper.source.js");
const outPath = join(here, "LINE申請コピペさん_統合ブックマークレット.txt");
const installPath = join(here, "ブックマーク登録用.html");
const indexPath = join(here, "index.html");

const source = await readFile(srcPath, "utf8");

async function terserMinify() {
  try {
    const { stdout } = await execAsync(`npx terser "${srcPath}" -c -m --toplevel`, {
      cwd: here,
      maxBuffer: 1024 * 1024 * 8
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

const compact = await terserMinify() || source
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .join("");

const bookmarklet = `javascript:${compact}`;
await writeFile(outPath, bookmarklet, "utf8");
const installHtml = `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LINE申請コピペさん ブックマーク登録</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.75;margin:0;color:#172033;background:#ecfdf5}
main{max-width:860px;margin:0 auto;padding:28px 18px 48px}
h1{font-size:28px;margin:0 0 8px}
h2{font-size:18px;margin:28px 0 8px}
.card{background:white;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin-top:16px}
.drag{display:inline-block;padding:12px 18px;border-radius:8px;background:#059669;color:white;text-decoration:none;font-weight:700}
button{min-height:42px;border:1px solid #059669;border-radius:8px;background:#059669;color:white;font-weight:700;padding:0 16px;cursor:pointer}
code{background:#f1f5f9;padding:2px 5px;border-radius:4px}
textarea{width:100%;height:130px;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:12px/1.45 ui-monospace,Consolas,monospace;box-sizing:border-box}
ol,ul{padding-left:1.4em}
.note{color:#64748b;font-size:14px}
.ok{color:#059669;font-weight:700}
@media(max-width:520px){h1{font-size:23px}.card{padding:14px}main{padding:20px 12px 40px}}
</style>
<main>
<h1>LINE申請コピペさん</h1>
<p class="note">LINE Creators Market申請用のブックマークレット登録ページです。</p>
<section class="card">
<h2>PCで登録</h2>
<p>下の緑のリンクをブックマークバーへドラッグしてください。</p>
<p><a class="drag" href="${bookmarklet.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">LINE申請コピペさん</a></p>
</section>
<section class="card">
<h2>スマホ・手動登録</h2>
<p><button id="copy" type="button">ブックマークレットをコピー</button> <span id="status" class="note"></span></p>
<ol>
<li>このページをいったん普通にブックマークします。</li>
<li>作ったブックマークを編集します。</li>
<li>名前を <code>LINE申請コピペさん</code> にします。</li>
<li>URL欄を削除して、コピーした <code>javascript:...</code> を貼り付けます。</li>
<li>LINE申請画面やタグ画面で、そのブックマークを開くと実行されます。</li>
</ol>
<p class="note">コピーできない場合は、下の欄を全選択してURL欄に貼り付けてください。先頭の <code>javascript:</code> を消さないでください。</p>
<textarea id="code" readonly>${bookmarklet.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</textarea>
</section>
<section class="card">
<h2>対応しやすいブラウザ</h2>
<ul>
<li>PC: Chrome, Edge, Firefox, Safari, Brave, Vivaldi</li>
<li>Android: Chrome, Edge, Firefox, Brave</li>
<li>iPhone / iPad: Safari, Chrome, Edge</li>
</ul>
<p class="note">スマホ版ChromeやEdgeはブックマーク編集画面の場所が端末ごとに少し違います。Safariは登録できても、クリップボード読み取りで確認ダイアログが出ることがあります。</p>
</section>
</main>
<script>
const code=document.getElementById("code");
const status=document.getElementById("status");
document.getElementById("copy").onclick=async()=>{
  try{
    await navigator.clipboard.writeText(code.value);
    status.textContent="コピーしました";
    status.className="ok";
  }catch{
    code.focus();
    code.select();
    document.execCommand("copy");
    status.textContent="選択しました。コピーできない場合は手動でコピーしてください";
  }
};
</script>
</html>
`;
await writeFile(installPath, installHtml, "utf8");
await writeFile(indexPath, installHtml, "utf8");

console.log(`bookmarklet characters: ${bookmarklet.length}`);
console.log(outPath);
console.log(installPath);
console.log(indexPath);
