// What the camera shows behind a visual: bright or dark, calm or busy. Halo
// uses it to keep every visual readable: floating text and lines turn dark on
// bright backgrounds and light on dark ones, glass matches the room, and a busy
// background gets a glass container even for visuals meant to float.

export interface Backdrop {
  tone: "light" | "dark";
  busy: boolean;
}

export interface LumaStats {
  /** Mean relative luminance, 0 (black) to 1 (white). */
  mean: number;
  /** Standard deviation of luminance: how much is going on. */
  spread: number;
}

/** Luminance statistics of RGBA pixels (as from a canvas). */
export function lumaStats(rgba: Uint8ClampedArray | number[]): LumaStats {
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const y = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    sum += y;
    sq += y * y;
    n += 1;
  }
  if (n === 0) return { mean: 0.5, spread: 0 };
  const mean = sum / n;
  return { mean, spread: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

/**
 * Bright or dark, busy or calm, with hysteresis so a visual doesn't flip back
 * and forth when someone walks past or the light changes a little.
 */
export function judgeBackdrop(s: LumaStats, prev: Backdrop | null | undefined): Backdrop {
  const tone = prev ? (prev.tone === "light" ? (s.mean < 0.46 ? "dark" : "light") : s.mean > 0.6 ? "light" : "dark") : s.mean > 0.53 ? "light" : "dark";
  const busy = prev ? (prev.busy ? s.spread > 0.13 : s.spread > 0.2) : s.spread > 0.17;
  return { tone, busy };
}

/**
 * Where a stage rect falls in the camera frame. The stage shows the camera with
 * object-fit: cover, so the frame is scaled to fill and cropped at the center.
 */
export function stageToVideo(
  rect: { x: number; y: number; w: number; h: number },
  video: { w: number; h: number },
  stage: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(stage.w / video.w, stage.h / video.h);
  const ox = (stage.w - video.w * scale) / 2;
  const oy = (stage.h - video.h * scale) / 2;
  const x = Math.max(0, (rect.x - ox) / scale);
  const y = Math.max(0, (rect.y - oy) / scale);
  return {
    x,
    y,
    w: Math.max(1, Math.min(video.w - x, rect.w / scale)),
    h: Math.max(1, Math.min(video.h - y, rect.h / scale)),
  };
}
