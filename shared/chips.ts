// Layout of tucked chips along the top edge. Chips flow left to right from the
// safe margin and jump over the face keep-out zone so they never cover it.

import { CHIP_GAP, CHIP_H, SAFE_MARGIN, STAGE_W, intersects, type Rect } from "./geometry";

export const CHIP_FONT = 24;
export const CHIP_ICON = 26;
export const CHIP_PAD_X = 22;
export const CHIP_ICON_GAP = 10;
export const CHIP_MAX_TEXT = 300;

export function chipWidth(textWidth: number): number {
  return Math.round(CHIP_PAD_X * 2 + CHIP_ICON + CHIP_ICON_GAP + Math.min(textWidth, CHIP_MAX_TEXT));
}

export function layoutChips(
  chips: { id: string; width: number }[],
  keepOut: Rect | null,
): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  let x = SAFE_MARGIN;
  const y = SAFE_MARGIN;
  for (const chip of chips) {
    let rect: Rect = { x, y, w: chip.width, h: CHIP_H };
    if (keepOut && intersects(rect, keepOut, 8)) {
      rect = { ...rect, x: keepOut.x + keepOut.w + 16 };
    }
    if (rect.x + rect.w > STAGE_W - SAFE_MARGIN) break; // out of room: older chips stay in history only
    out[chip.id] = rect;
    x = rect.x + rect.w + CHIP_GAP;
  }
  return out;
}
