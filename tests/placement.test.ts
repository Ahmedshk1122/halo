import { describe, expect, it } from "vitest";
import { CONTENT_TOP, SAFE_MARGIN, STAGE_H, STAGE_W, intersects } from "../shared/geometry";
import { effectiveRect, placeVisual, settleManual } from "../shared/placement";

const face = { x: 760, y: 140, w: 400, h: 520 };

describe("placeVisual", () => {
  it("uses the preferred slot inside the safe margin", () => {
    const p = placeVisual({ w: 560, h: 440 }, ["left", "right"], [], face)!;
    expect(p.slot).toBe("left");
    const box = effectiveRect(p.frame, p.scale);
    expect(box.x).toBe(SAFE_MARGIN);
    expect(box.y).toBeGreaterThanOrEqual(CONTENT_TOP);
    expect(box.y + box.h).toBeLessThanOrEqual(STAGE_H - SAFE_MARGIN);
    expect(intersects(box, face)).toBe(false);
  });

  it("never covers the face, shrinking or moving instead", () => {
    const wideFace = { x: 520, y: 100, w: 880, h: 700 };
    const p = placeVisual({ w: 640, h: 460 }, ["left"], [], wideFace)!;
    expect(p).not.toBeNull();
    expect(intersects(effectiveRect(p.frame, p.scale), wideFace)).toBe(false);
  });

  it("goes to the other side when the first slot is taken", () => {
    const first = placeVisual({ w: 560, h: 440 }, ["left", "right"], [], face)!;
    const second = placeVisual({ w: 600, h: 500 }, ["left", "right"], [effectiveRect(first.frame, 1)], face)!;
    expect(second.slot).toBe("right");
    expect(effectiveRect(second.frame, second.scale).x + 600 * second.scale).toBeLessThanOrEqual(STAGE_W - SAFE_MARGIN);
  });

  it("puts the far side first when the face is off center", () => {
    const leftFace = { x: 300, y: 140, w: 400, h: 520 };
    const p = placeVisual({ w: 560, h: 440 }, ["left", "right"], [], leftFace)!;
    expect(p.slot).toBe("right");
  });
});

describe("settleManual", () => {
  it("moves a hand-placed visual off the face by the shortest distance", () => {
    const r = settleManual({ x: 700, y: 300, w: 400, h: 300 }, [], face);
    expect(intersects(r, face)).toBe(false);
    expect(r.x).toBeLessThan(face.x);
  });
});

describe("never over the face", () => {
  it("shrinks a wide visual rather than covering the face", () => {
    const p = placeVisual({ w: 1040, h: 560 }, ["left", "right"], [], face)!;
    expect(p).not.toBeNull();
    expect(intersects(effectiveRect(p.frame, p.scale), face)).toBe(false);
  });

  it("overlaps another visual before it would cover the face", () => {
    const other = { x: 48, y: 128, w: 600, h: 900 };
    const p = placeVisual({ w: 600, h: 500 }, ["left"], [other, { x: 1250, y: 128, w: 620, h: 900 }], face)!;
    expect(p).not.toBeNull();
    expect(intersects(effectiveRect(p.frame, p.scale), face)).toBe(false);
  });
});
