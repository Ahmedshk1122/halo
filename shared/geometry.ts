// Stage geometry. Everything on the stage is laid out on a fixed 1920×1080
// logical canvas (sizes in the design system are specified at 1080p) and the
// canvas is scaled to whatever window it lives in.

export const STAGE_W = 1920;
export const STAGE_H = 1080;
export const SAFE_MARGIN = 48;
/** Height of the tucked-chip row along the top edge. */
export const CHIP_H = 56;
export const CHIP_GAP = 12;
/** Visuals start below the chip row. */
export const CONTENT_TOP = SAFE_MARGIN + CHIP_H + 24;
/** Minimum gap between two visuals. */
export const VISUAL_GAP = 24;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export function intersects(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

export function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function insideSafeArea(r: Rect, top = SAFE_MARGIN): boolean {
  return (
    r.x >= SAFE_MARGIN - 0.5 &&
    r.y >= top - 0.5 &&
    r.x + r.w <= STAGE_W - SAFE_MARGIN + 0.5 &&
    r.y + r.h <= STAGE_H - SAFE_MARGIN + 0.5
  );
}

export function clampToSafeArea(r: Rect, top = SAFE_MARGIN): Rect {
  const x = Math.min(Math.max(r.x, SAFE_MARGIN), STAGE_W - SAFE_MARGIN - r.w);
  const y = Math.min(Math.max(r.y, top), STAGE_H - SAFE_MARGIN - r.h);
  return { ...r, x, y };
}

export function center(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Mirror a rect horizontally across the stage (for the presenter preview). */
export function mirrorRect(r: Rect): Rect {
  return { ...r, x: STAGE_W - r.x - r.w };
}

export function expandRect(r: Rect, by: { left: number; right: number; top: number; bottom: number }): Rect {
  return { x: r.x - by.left, y: r.y - by.top, w: r.w + by.left + by.right, h: r.h + by.top + by.bottom };
}
