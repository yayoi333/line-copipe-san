// APNGエンコーダ(外部ライブラリ不要)
// PNG/APNGのチャンクを自前で組み立て、圧縮はブラウザ標準のCompressionStreamを使う。
// 300KBを超える場合はメディアンカット量子化で色数を落として再圧縮する。

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Uint8Array, off: number, len: number): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < len; i++) c = CRC_TABLE[(c ^ buf[off + i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflateBytes(u8: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([u8 as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 4 + data.length));
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

interface ColorEntry { r: number; g: number; b: number; a: number; n: number; }

// RGBAフレーム群をmaxColors色のパレットへ量子化(メディアンカット)
function quantizeFrames(frames: Uint8Array[], maxColors: number): { palette: number[][]; indexed: Uint8Array[] } {
  const counts = new Map<number, number>();
  for (const f of frames) {
    const u32 = new Uint32Array(f.buffer, f.byteOffset, f.byteLength >> 2);
    for (let i = 0; i < u32.length; i++) {
      let p = u32[i];
      if ((p >>> 24) < 8) p = 0; // ほぼ透明は完全透明に寄せる
      counts.set(p, (counts.get(p) || 0) + 1);
    }
  }
  const hasTrans = counts.has(0);
  const opaque: ColorEntry[] = [];
  for (const [p, n] of counts) {
    if (p === 0) continue;
    opaque.push({ r: p & 255, g: (p >>> 8) & 255, b: (p >>> 16) & 255, a: p >>> 24, n });
  }
  const budget = Math.max(1, maxColors - (hasTrans ? 1 : 0));
  let boxes: ColorEntry[][] = opaque.length ? [opaque] : [];
  const range = (box: ColorEntry[]) => {
    const mn = [255, 255, 255, 255], mx = [0, 0, 0, 0];
    for (const c of box) {
      const v = [c.r, c.g, c.b, c.a];
      for (let k = 0; k < 4; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; }
    }
    let ch = 0, w = -1;
    for (let k = 0; k < 4; k++) if (mx[k] - mn[k] > w) { w = mx[k] - mn[k]; ch = k; }
    return { ch, w };
  };
  while (boxes.length < budget) {
    let bi = -1, bs = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const { w } = range(boxes[i]);
      let pop = 0;
      for (const c of boxes[i]) pop += c.n;
      const s = w * Math.sqrt(pop);
      if (s > bs) { bs = s; bi = i; }
    }
    if (bi < 0) break;
    const box = boxes[bi];
    const { ch } = range(box);
    const key = (['r', 'g', 'b', 'a'] as const)[ch];
    box.sort((x, y) => x[key] - y[key]);
    let total = 0;
    for (const c of box) total += c.n;
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length - 1; i++) { acc += box[i].n; if (acc >= total / 2) { cut = i + 1; break; } }
    boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
  }
  const palette: number[][] = [];
  if (hasTrans) palette.push([0, 0, 0, 0]);
  for (const box of boxes) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (const c of box) { r += c.r * c.n; g += c.g * c.n; b += c.b * c.n; a += c.a * c.n; n += c.n; }
    palette.push([Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n)]);
  }
  const lookup = new Map<number, number>();
  if (hasTrans) lookup.set(0, 0);
  const nearest = (p: number): number => {
    const hit = lookup.get(p);
    if (hit !== undefined) return hit;
    const r = p & 255, g = (p >>> 8) & 255, b = (p >>> 16) & 255, a = p >>> 24;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const q = palette[i];
      const d = (q[0] - r) ** 2 + (q[1] - g) ** 2 + (q[2] - b) ** 2 + 2 * (q[3] - a) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    lookup.set(p, bi);
    return bi;
  };
  const indexed = frames.map((f) => {
    const u32 = new Uint32Array(f.buffer, f.byteOffset, f.byteLength >> 2);
    const out = new Uint8Array(u32.length);
    for (let i = 0; i < u32.length; i++) {
      let p = u32[i];
      if ((p >>> 24) < 8) p = 0;
      out[i] = nearest(p);
    }
    return out;
  });
  return { palette, indexed };
}

interface Rect { x: number; y: number; w: number; h: number; }

// 前フレームと違う部分の矩形(なければnull)
function diffRect(a: Uint8Array, b: Uint8Array, w: number, h: number, bpp: number): Rect | null {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const ro = y * w * bpp;
    for (let x = 0; x < w; x++) {
      const o = ro + x * bpp;
      let same = true;
      for (let k = 0; k < bpp; k++) if (a[o + k] !== b[o + k]) { same = false; break; }
      if (!same) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function regionRaw(img: Uint8Array, w: number, rect: Rect, bpp: number): Uint8Array {
  const out = new Uint8Array(rect.h * (1 + rect.w * bpp));
  let p = 0;
  for (let y = 0; y < rect.h; y++) {
    out[p++] = 0; // filter: None
    const src = ((rect.y + y) * w + rect.x) * bpp;
    out.set(img.subarray(src, src + rect.w * bpp), p);
    p += rect.w * bpp;
  }
  return out;
}

export interface ApngOptions {
  w: number;
  h: number;
  frames: Uint8Array[]; // RGBA (w*h*4) per frame
  delays: number[];     // ms per frame
  loops: number;        // 再生回数(APNG num_plays)
  colors?: number;      // 0またはundefined=フルカラー、それ以外=パレット色数
}

export async function buildAPNG({ w, h, frames, delays, loops, colors }: ApngOptions): Promise<Uint8Array> {
  let imgs: Uint8Array[];
  let bpp: number;
  let palette: number[][] | null = null;
  if (colors && colors > 0) {
    const q = quantizeFrames(frames, colors);
    imgs = q.indexed;
    palette = q.palette;
    bpp = 1;
  } else {
    imgs = frames;
    bpp = 4;
  }
  const u32be = (...vals: number[]) => {
    const d = new Uint8Array(vals.length * 4);
    const dv = new DataView(d.buffer);
    vals.forEach((v, i) => dv.setUint32(i * 4, v));
    return d;
  };
  const ihdr = new Uint8Array(13);
  {
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w);
    dv.setUint32(4, h);
    ihdr[8] = 8;                  // bit depth
    ihdr[9] = palette ? 3 : 6;    // color type: palette / RGBA
  }
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  parts.push(pngChunk('IHDR', ihdr));
  parts.push(pngChunk('acTL', u32be(frames.length, loops)));
  if (palette) {
    const plte = new Uint8Array(palette.length * 3);
    const trns = new Uint8Array(palette.length);
    palette.forEach((c, i) => { plte.set(c.slice(0, 3), i * 3); trns[i] = c[3]; });
    parts.push(pngChunk('PLTE', plte));
    parts.push(pngChunk('tRNS', trns));
  }
  let seq = 0;
  for (let i = 0; i < imgs.length; i++) {
    const rect: Rect = i === 0
      ? { x: 0, y: 0, w, h }
      : (diffRect(imgs[i - 1], imgs[i], w, h, bpp) || { x: 0, y: 0, w: 1, h: 1 });
    const fctl = new Uint8Array(26);
    {
      const dv = new DataView(fctl.buffer);
      dv.setUint32(0, seq++);
      dv.setUint32(4, rect.w);
      dv.setUint32(8, rect.h);
      dv.setUint32(12, rect.x);
      dv.setUint32(16, rect.y);
      dv.setUint16(20, Math.max(1, Math.round(delays[i])));  // delay_num
      dv.setUint16(22, 1000);                                 // delay_den
      fctl[24] = 0; // dispose: none
      fctl[25] = 0; // blend: source
    }
    parts.push(pngChunk('fcTL', fctl));
    const comp = await deflateBytes(regionRaw(imgs[i], w, rect, bpp));
    if (i === 0) {
      parts.push(pngChunk('IDAT', comp));
    } else {
      const d = new Uint8Array(4 + comp.length);
      new DataView(d.buffer).setUint32(0, seq++);
      d.set(comp, 4);
      parts.push(pngChunk('fdAT', d));
    }
  }
  parts.push(pngChunk('IEND', new Uint8Array(0)));
  return concatBytes(parts);
}

export interface ApngResult {
  bytes: Uint8Array;
  colors: number; // 実際に使った色数(0=フルカラー)
  over: boolean;  // maxBytesに収まらなかった
}

// 300KB(既定)以下になるまで色数を落として再エンコード
export async function encodeAutoAPNG(opt: ApngOptions & { maxBytes?: number }): Promise<ApngResult> {
  const maxBytes = opt.maxBytes ?? 300 * 1024;
  let best: { bytes: Uint8Array; colors: number } | null = null;
  for (const colors of [0, 256, 128, 64]) {
    const bytes = await buildAPNG({ ...opt, colors });
    if (bytes.length <= maxBytes) return { bytes, colors, over: false };
    if (!best || bytes.length < best.bytes.length) best = { bytes, colors };
  }
  return { ...(best as { bytes: Uint8Array; colors: number }), over: true };
}
