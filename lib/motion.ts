// 動くスタンプの動きプリセット。
// 合成済みスタンプ(文字・レイヤー込み)を余白トリムしたスプライトに、
// canvas変形だけでループアニメーションを付ける。

export interface AnimSettings {
  frames: number;      // 5〜20
  durationMs: number;  // 1ループの長さ
  loops: number;       // 0=自動(合計4秒に収まる最大)、1〜4=固定
  intensity: number;   // 動きの強さ(1=標準)
}

export const DEFAULT_ANIM_SETTINGS: AnimSettings = {
  frames: 10,
  durationMs: 1000,
  loops: 0,
  intensity: 1,
};

export function resolveLoops(s: AnimSettings): number {
  if (s.loops > 0) return Math.min(4, s.loops);
  return Math.min(4, Math.max(1, Math.floor(4000 / s.durationMs)));
}

interface Transform {
  x?: number;   // min(W,H)に対する比率
  y?: number;
  sx?: number;
  sy?: number;
  rot?: number; // ラジアン
  a?: number;   // alpha
}

export interface MotionPreset {
  label: string;
  pivot: 'bottom' | 'center';
  fn: (t: number, A: number) => Transform;
}

const TAU = Math.PI * 2;
const backOut = (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

export const MOTION_PRESETS: Record<string, MotionPreset> = {
  pyon: {
    label: 'ぴょんぴょん（はねる）', pivot: 'bottom', fn: (t, A) => {
      const p = (t * 2) % 1, hh = Math.abs(Math.sin(Math.PI * p));
      const g = Math.max(0, 1 - hh * 3.5);
      return { y: -0.16 * A * hh, sx: 1 + 0.10 * A * g, sy: 1 - 0.12 * A * g };
    },
  },
  puru: {
    label: 'ぷるぷる（ふるえる）', pivot: 'bottom', fn: (t, A) =>
      ({ x: 0.016 * A * Math.sin(6 * TAU * t), rot: 0.035 * A * Math.sin(6 * TAU * t + 2) }),
  },
  yura: {
    label: 'ゆらゆら（ゆれる）', pivot: 'bottom', fn: (t, A) =>
      ({ rot: 0.15 * A * Math.sin(TAU * t) }),
  },
  poyo: {
    label: 'ぽよぽよ（のびちぢみ）', pivot: 'bottom', fn: (t, A) => {
      const wv = Math.sin(2 * TAU * t);
      return { sx: 1 + 0.08 * A * wv, sy: 1 - 0.08 * A * wv };
    },
  },
  fuwa: {
    label: 'ふわふわ（うかぶ）', pivot: 'center', fn: (t, A) =>
      ({ y: -0.05 * A * Math.sin(TAU * t), rot: 0.04 * A * Math.sin(TAU * t + 1.2) }),
  },
  doki: {
    label: 'どきどき（こどう）', pivot: 'center', fn: (t, A) => {
      const p = t % 1;
      let s = 0;
      if (p < 0.14) s = Math.sin(Math.PI * p / 0.14);
      else if (p < 0.30) s = 0.65 * Math.max(0, Math.sin(Math.PI * (p - 0.16) / 0.14));
      return { sx: 1 + 0.11 * A * s, sy: 1 + 0.11 * A * s };
    },
  },
  kuru: {
    label: 'くるっと（ひとまわり）', pivot: 'center', fn: (t) => {
      const e = Math.min(1, t / 0.7);
      const c = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
      return { rot: TAU * c };
    },
  },
  baan: {
    label: 'ばーん（とうじょう）', pivot: 'center', fn: (t) => {
      const e = Math.min(1, t / 0.45);
      const s = 0.15 + 0.85 * backOut(e);
      return { sx: s, sy: s };
    },
  },
  shu: {
    label: 'しゅっ（スライドイン）', pivot: 'bottom', fn: (t) => {
      const e = Math.min(1, t / 0.45);
      return { x: -1.2 * (1 - backOut(e)) };
    },
  },
  pata: {
    label: 'ぱたぱた（よこゆれ）', pivot: 'bottom', fn: (t, A) =>
      ({ x: 0.05 * A * Math.sin(TAU * t), rot: 0.09 * A * Math.sin(TAU * t + Math.PI / 2) }),
  },
};

export const MOTION_PRESET_KEYS = Object.keys(MOTION_PRESETS);
export const DEFAULT_MOTION_PRESET = 'pyon';

// 合成済みキャンバスから不透明部分だけを切り出したスプライトを作る
export function trimToContent(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext('2d', { willReadFrequently: true });
  if (!ctx) return src;
  const { width: w, height: h } = src;
  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return src;
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// 1フレーム描画。spriteは余白トリム済みのスタンプ全体
export function drawAnimFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  sprite: HTMLCanvasElement,
  presetKey: string,
  t: number,
  intensity: number,
): void {
  const pr = MOTION_PRESETS[presetKey] || MOTION_PRESETS[DEFAULT_MOTION_PRESET];
  const tr = pr.fn(t, intensity) || {};
  const fit = 0.76;
  const s0 = Math.min(W * fit / sprite.width, H * fit / sprite.height);
  const w = sprite.width * s0, h = sprite.height * s0;
  const u = Math.min(W, H);
  ctx.save();
  ctx.globalAlpha = tr.a ?? 1;
  const dx = (tr.x || 0) * u, dy = (tr.y || 0) * u;
  if (pr.pivot === 'center') {
    ctx.translate(W / 2 + dx, H / 2 + dy);
  } else {
    ctx.translate(W / 2 + dx, H - H * 0.05 + dy); // 足元基準
  }
  ctx.rotate(tr.rot || 0);
  ctx.scale(tr.sx ?? 1, tr.sy ?? 1);
  if (pr.pivot === 'center') ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
  else ctx.drawImage(sprite, -w / 2, -h, w, h);
  ctx.restore();
}
