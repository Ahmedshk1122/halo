import { describe, expect, it } from "vitest";
import { judgeBackdrop, lumaStats, stageToVideo } from "../shared/backdrop";

const pixels = (...rgb: [number, number, number][]) => rgb.flatMap(([r, g, b]) => [r, g, b, 255]);

describe("what is behind a visual", () => {
  it("measures brightness and how busy it is", () => {
    expect(lumaStats(pixels([255, 255, 255], [250, 250, 250])).mean).toBeGreaterThan(0.95);
    const calm = lumaStats(pixels([120, 120, 120], [122, 122, 122], [118, 118, 118]));
    const busy = lumaStats(pixels([10, 10, 10], [250, 250, 250], [10, 10, 10], [250, 250, 250]));
    expect(calm.spread).toBeLessThan(0.02);
    expect(busy.spread).toBeGreaterThan(0.4);
  });

  it("calls a bright wall light and a dark room dark", () => {
    expect(judgeBackdrop({ mean: 0.8, spread: 0.05 }, null)).toEqual({ tone: "light", busy: false });
    expect(judgeBackdrop({ mean: 0.2, spread: 0.05 }, null)).toEqual({ tone: "dark", busy: false });
    expect(judgeBackdrop({ mean: 0.5, spread: 0.3 }, null).busy).toBe(true);
  });

  it("doesn't flip back and forth on small changes", () => {
    const light = { tone: "light" as const, busy: false };
    expect(judgeBackdrop({ mean: 0.5, spread: 0.16 }, light)).toEqual(light);
    expect(judgeBackdrop({ mean: 0.4, spread: 0.16 }, light).tone).toBe("dark");
    expect(judgeBackdrop({ mean: 0.5, spread: 0.15 }, { tone: "dark", busy: true }).busy).toBe(true);
  });

  it("finds the stage rect in a camera frame that is scaled to cover and cropped", () => {
    // A 4:3 camera on a 16:9 stage: scaled by 1.5 to fill the width, cropped top and bottom.
    const r = stageToVideo({ x: 0, y: 0, w: 960, h: 540 }, { w: 1280, h: 960 }, { w: 1920, h: 1080 });
    expect(r.x).toBe(0);
    expect(r.y).toBeCloseTo(120, 0);
    expect(r.w).toBeCloseTo(640, 0);
    expect(r.h).toBeCloseTo(360, 0);
  });
});
