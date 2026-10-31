import { describe, expect, it } from "vitest";
import { classifyHand, faceKeepOut, GestureMachine, videoToStage, type GestureEvent, type Landmark } from "../shared/gestures";

/** A synthetic right hand, palm to camera. Extended fingers point up. */
function hand({ index = false, middle = false, ring = false, pinky = false, pinch = false } = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8 }));
  lm[0] = { x: 0.5, y: 0.8 }; // wrist
  const finger = (mcp: number, x: number, up: boolean) => {
    lm[mcp] = { x, y: 0.66 };
    lm[mcp + 1] = { x, y: 0.6 }; // pip
    lm[mcp + 2] = { x, y: up ? 0.53 : 0.64 };
    lm[mcp + 3] = { x, y: up ? 0.47 : 0.68 }; // tip
  };
  finger(5, 0.46, index);
  finger(9, 0.5, middle);
  finger(13, 0.54, ring);
  finger(17, 0.58, pinky);
  lm[4] = pinch ? { x: lm[8].x + 0.005, y: lm[8].y + 0.005 } : { x: 0.36, y: 0.66 }; // thumb tip
  return lm;
}

describe("classifyHand", () => {
  it("recognizes pointing and pinching", () => {
    expect(classifyHand(hand({ index: true })).pointing).toBe(true);
    expect(classifyHand(hand({ index: true, middle: true })).pointing).toBe(false);
    expect(classifyHand(hand({ index: true, pinch: true })).pinchRatio).toBeLessThan(0.32);
    expect(classifyHand(hand()).pinchRatio).toBeGreaterThan(0.5);
  });
});

function run(frames: { t: number; lm: Landmark[] | null; at?: { x: number; y: number } }[]) {
  const m = new GestureMachine();
  const events: GestureEvent[] = [];
  for (const f of frames) {
    const at = f.at ?? { x: 500, y: 400 };
    events.push(...m.update(f.lm ? { t: f.t, present: true, pose: classifyHand(f.lm), tip: at, pinch: at } : { t: f.t, present: false }));
  }
  return events.filter((e) => e.type !== "pointer");
}

const frames = (from: number, to: number, lm: Landmark[] | null, at?: (t: number) => { x: number; y: number }) =>
  Array.from({ length: Math.floor((to - from) / 33) + 1 }, (_, i) => {
    const t = from + i * 33;
    return { t, lm, at: at?.(t) };
  });

const open = () => hand({ index: true, middle: true, ring: true, pinky: true });

describe("GestureMachine", () => {
  it("targets after pointing still for about 600ms, once", () => {
    const ev = run(frames(0, 1200, hand({ index: true })));
    expect(ev.filter((e) => e.type === "target")).toHaveLength(1);
    expect(run(frames(0, 500, hand({ index: true }))).some((e) => e.type === "target")).toBe(false);
  });

  it("does not target while the finger keeps moving", () => {
    const ev = run(frames(0, 1200, hand({ index: true }), (t) => ({ x: 300 + t, y: 400 })));
    expect(ev.some((e) => e.type === "target")).toBe(false);
  });

  it("turns a quick pinch into a tap", () => {
    const ev = run([...frames(0, 100, open()), ...frames(133, 300, hand({ pinch: true })), ...frames(333, 500, open())]);
    expect(ev.map((e) => e.type)).toEqual(["tap"]);
  });

  it("turns pinch, hold and move into a drag", () => {
    const ev = run([
      ...frames(0, 100, open()),
      ...frames(133, 900, hand({ pinch: true }), (t) => ({ x: 500 + Math.max(0, t - 400) * 0.5, y: 400 })),
      ...frames(933, 1000, open()),
    ]);
    const types = ev.map((e) => e.type);
    expect(types[0]).toBe("drag-start");
    expect(types).toContain("drag-move");
    expect(types.at(-1)).toBe("drag-end");
    expect(types).not.toContain("tap");
  });

  it("throws a grabbed visual flung away fast", () => {
    const ev = run([
      ...frames(0, 100, open()),
      ...frames(133, 500, hand({ pinch: true }), () => ({ x: 500, y: 400 })),
      ...frames(533, 700, hand({ pinch: true }), (t) => ({ x: 500 + (t - 533) * 4, y: 400 })),
      ...frames(733, 800, open(), () => ({ x: 1200, y: 400 })),
    ]);
    const types = ev.map((e) => e.type);
    expect(types).toContain("throw");
    expect(types).not.toContain("drag-end");
    const t = ev.find((e) => e.type === "throw");
    expect(t?.type === "throw" && t.velocity.x).toBeGreaterThan(1400);
  });

  it("grabs with a fist only after it is held, so talking hands do nothing", () => {
    const quick = run([...frames(0, 100, open()), ...frames(133, 300, hand()), ...frames(333, 500, open())]);
    expect(quick).toEqual([]);
    const held = run([...frames(0, 100, open()), ...frames(133, 900, hand(), (t) => ({ x: 500 + Math.max(0, t - 500) * 0.3, y: 400 })), ...frames(933, 1000, open())]);
    expect(held.map((e) => e.type)).toContain("drag-start");
    expect(held.map((e) => e.type)).not.toContain("tap");
  });

  it("ends a drag when the hand leaves", () => {
    const ev = run([...frames(0, 600, hand({ pinch: true })), { t: 633, lm: null }]);
    expect(ev.map((e) => e.type)).toContain("drag-end");
  });
});

describe("coordinates", () => {
  it("maps a 4:3 camera onto the 16:9 stage with cover cropping", () => {
    expect(videoToStage({ x: 0.5, y: 0.5 }, 640, 480)).toEqual({ x: 960, y: 540 });
    expect(videoToStage({ x: 0, y: 0 }, 1280, 720)).toEqual({ x: 0, y: 0 });
    expect(videoToStage({ x: 0, y: 0 }, 640, 480).y).toBeLessThan(0);
  });

  it("pads the face box for hair and chin", () => {
    const r = faceKeepOut({ x: 0.4, y: 0.25, w: 0.2, h: 0.3 }, 1280, 720);
    expect(r.x).toBeLessThan(0.4 * 1920);
    expect(r.y).toBeLessThan(0.25 * 1080);
    expect(r.w).toBeGreaterThan(0.2 * 1920);
  });
});
