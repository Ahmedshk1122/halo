// Automatic placement. Default slots are the left third, the right third and
// the lower band, inside a 48px safe margin and below the chip row. The face
// keep-out zone is never covered, whether a visual is placed here or by hand.

import {
  CONTENT_TOP,
  SAFE_MARGIN,
  STAGE_H,
  STAGE_W,
  VISUAL_GAP,
  clampToSafeArea,
  insideSafeArea,
  intersects,
  type Rect,
} from "./geometry";
import type { Size, Slot } from "./layout";

export interface Placement {
  /** Natural-size frame (top-left + size). The visual is scaled about its center. */
  frame: Rect;
  scale: number;
  slot: Slot | "custom";
}

/** The rect a frame actually covers once scaled about its center. */
export function effectiveRect(frame: Rect, scale: number): Rect {
  const w = frame.w * scale;
  const h = frame.h * scale;
  return { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h };
}

/** Inverse of effectiveRect: the natural frame whose scaled box is `box`. */
export function frameFromEffective(box: Rect, size: Size, _scale?: number): Rect {
  return { x: box.x - (size.w - box.w) / 2, y: box.y - (size.h - box.h) / 2, w: size.w, h: size.h };
}

function slotCandidates(slot: Slot, w: number, h: number): Rect[] {
  const bottom = STAGE_H - SAFE_MARGIN;
  const midY = CONTENT_TOP + (bottom - CONTENT_TOP - h) / 2;
  switch (slot) {
    case "left":
      return [midY, CONTENT_TOP, bottom - h].map((y) => ({ x: SAFE_MARGIN, y, w, h }));
    case "right":
      return [midY, CONTENT_TOP, bottom - h].map((y) => ({ x: STAGE_W - SAFE_MARGIN - w, y, w, h }));
    case "lower":
      return [(STAGE_W - w) / 2, SAFE_MARGIN, STAGE_W - SAFE_MARGIN - w].map((x) => ({ x, y: bottom - h, w, h }));
  }
}

export function isFree(box: Rect, occupied: Rect[], keepOut: Rect | null): boolean {
  if (!insideSafeArea(box, CONTENT_TOP)) return false;
  if (keepOut && intersects(box, keepOut)) return false;
  return occupied.every((o) => !intersects(box, o, VISUAL_GAP));
}

/** Put side slots on the far side of the face first. */
function orderSlots(prefs: Slot[], keepOut: Rect | null): Slot[] {
  const all: Slot[] = [...prefs, ...(["left", "right", "lower"] as Slot[]).filter((s) => !prefs.includes(s))];
  if (!keepOut) return all;
  const faceX = keepOut.x + keepOut.w / 2;
  const far: Slot = faceX < STAGE_W / 2 ? "right" : "left";
  const near: Slot = far === "right" ? "left" : "right";
  const offCenter = Math.abs(faceX - STAGE_W / 2) > STAGE_W * 0.08;
  if (!offCenter) return all;
  const i = all.indexOf(far);
  const j = all.indexOf(near);
  if (i > j) {
    all[i] = near;
    all[j] = far;
  }
  return all;
}

const SCALES = [1, 0.9, 0.8, 0.7, 0.62, 0.55];

export function placeVisual(size: Size, prefs: Slot[], occupied: Rect[], keepOut: Rect | null): Placement | null {
  const slots = orderSlots(prefs, keepOut);
  for (const scale of SCALES) {
    const w = size.w * scale;
    const h = size.h * scale;
    for (const slot of slots) {
      for (const box of slotCandidates(slot, w, h)) {
        if (isFree(box, occupied, keepOut)) {
          return { frame: frameFromEffective(box, size, scale), scale, slot };
        }
      }
    }
  }
  // Nothing fits beside the others: overlap them if needed, but never the face.
  for (const scale of SCALES) {
    for (const slot of slots) {
      for (const box of slotCandidates(slot, size.w * scale, size.h * scale)) {
        if (isFree(box, [], keepOut)) return { frame: frameFromEffective(box, size, scale), scale, slot };
      }
    }
  }
  return null;
}

/**
 * For a visual placed by hand: keep it where it is unless it covers the face
 * or leaves the safe area, then move it the shortest distance out.
 */
export function settleManual(box: Rect, occupied: Rect[], keepOut: Rect | null): Rect {
  let r = clampToSafeArea(box, CONTENT_TOP);
  if (!keepOut || !intersects(r, keepOut)) return r;
  const options: Rect[] = [
    { ...r, x: keepOut.x - r.w - 1 },
    { ...r, x: keepOut.x + keepOut.w + 1 },
    { ...r, y: keepOut.y + keepOut.h + 1 },
    { ...r, y: keepOut.y - r.h - 1 },
  ]
    .map((o) => clampToSafeArea(o, CONTENT_TOP))
    .filter((o) => !intersects(o, keepOut));
  if (options.length === 0) return r;
  const dist = (o: Rect) => Math.hypot(o.x - r.x, o.y - r.y);
  const free = options.filter((o) => occupied.every((x) => !intersects(o, x, VISUAL_GAP)));
  r = (free.length ? free : options).sort((a, b) => dist(a) - dist(b))[0];
  return r;
}
