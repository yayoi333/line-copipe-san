import React, { useEffect, useRef } from 'react';
import { Stamp, ExportConfig, TARGET_WIDTH, TARGET_HEIGHT, ANIM_WIDTH, ANIM_HEIGHT } from '../types';
import { renderComposedCanvas } from '../lib/zipService';
import { AnimSettings, trimToContent, drawAnimFrame, DEFAULT_MOTION_PRESET } from '../lib/motion';

// スタンプカード用の動くプレビュー。
// 文字・レイヤー込みの合成結果を一度だけ作り、rAFで動きプリセットを再生する。
export const AnimStampPreview = React.memo<{
  stamp: Stamp;
  previewBg: string;
  settings: AnimSettings;
}>(({ stamp, previewBg, settings }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<HTMLCanvasElement | null>(null);

  // 合成スプライトの作成(スタンプの編集内容が変わったときだけ)
  useEffect(() => {
    let cancelled = false;
    spriteRef.current = null;
    const config: ExportConfig = {
      id: stamp.id,
      scale: stamp.scale,
      rotation: stamp.rotation,
      offsetX: stamp.offsetX,
      offsetY: stamp.offsetY,
      textObjects: stamp.textObjects,
      imageLayers: stamp.imageLayers,
      drawingStrokes: stamp.drawingStrokes,
      mainImageLayerOrder: stamp.mainImageLayerOrder ?? 100,
      flipH: stamp.flipH,
      flipV: stamp.flipV,
    };
    renderComposedCanvas(stamp.dataUrl, config, TARGET_WIDTH, TARGET_HEIGHT).then((composed) => {
      if (cancelled || !composed) return;
      spriteRef.current = trimToContent(composed);
    });
    return () => { cancelled = true; };
  }, [stamp]);

  // 再生ループ
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      const sprite = spriteRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 確認用の背景
      if (previewBg === 'checker') {
        const size = 12;
        for (let y = 0; y < ANIM_HEIGHT; y += size) {
          for (let x = 0; x < ANIM_WIDTH; x += size) {
            ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#f3f4f6' : '#e5e7eb';
            ctx.fillRect(x, y, size, size);
          }
        }
      } else {
        ctx.fillStyle = previewBg;
        ctx.fillRect(0, 0, ANIM_WIDTH, ANIM_HEIGHT);
      }
      if (!sprite) return;

      const t = (now % settings.durationMs) / settings.durationMs;
      drawAnimFrame(ctx, ANIM_WIDTH, ANIM_HEIGHT, sprite, stamp.animPreset || DEFAULT_MOTION_PRESET, t, settings.intensity);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stamp.animPreset, previewBg, settings]);

  return (
    <canvas
      ref={canvasRef}
      width={ANIM_WIDTH}
      height={ANIM_HEIGHT}
      className="w-full h-full pointer-events-none object-contain"
    />
  );
});
