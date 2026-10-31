// Hand gestures from MediaPipe landmarks. Pure and frame-driven so it can be
// tested with synthetic hands. Every gesture must be deliberate, so a presenter
// who talks with their hands doesn't trigger anything by accident.
//   point (index out) + dwell ~600ms     → target the part under the fingertip
//   pinch (or a fist held a moment), move → drag
//   grab and fling                        → throw the visual away
//   quick pinch-tap                       → expand / collapse

import { STAGE_H, STAGE_W, expandRect, type Point, type Rect } from "./geometry";

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

// MediaPipe hand landmark indices.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_PIP = 6;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;
const MIDDLE_TIP = 12;
const RING_PIP = 14;
const RING_TIP = 16;
const PINKY_PIP = 18;
const PINKY_TIP = 20;

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

export interface HandPose {
  pointing: boolean;
  /** All four fingers curled. */
  fist: boolean;
  /** Thumb–index distance relative to hand size (small = pinching). */
  pinchRatio: number;
  indexTip: Landmark;
  pinchPoint: Landmark;
}

function extended(lm: Landmark[], tip: number, pip: number): boolean {
  return dist(lm[WRIST], lm[tip]) > dist(lm[WRIST], lm[pip]) * 1.18;
}

export function classifyHand(lm: Landmark[]): HandPose {
  const size = Math.max(1e-6, dist(lm[WRIST], lm[MIDDLE_MCP]));
  const pinchRatio = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / size;
  const index = extended(lm, INDEX_TIP, INDEX_PIP);
  const middle = extended(lm, MIDDLE_TIP, MIDDLE_PIP);
  const ring = extended(lm, RING_TIP, RING_PIP);
  const pinky = extended(lm, PINKY_TIP, PINKY_PIP);
  return {
    pointing: index && !middle && !ring && !pinky,
    fist: !index && !middle && !ring && !pinky,
    pinchRatio,
    indexTip: lm[INDEX_TIP],
    pinchPoint: { x: (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2, y: (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2 },
  };
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

/**
 * Maps a normalized video point to stage coordinates, given the video is
 * drawn with object-fit: cover onto the 16:9 stage. Unmirrored.
 */
export function videoToStage(p: { x: number; y: number }, videoW: number, videoH: number): Point {
  const scale = Math.max(STAGE_W / videoW, STAGE_H / videoH);
  const drawnW = videoW * scale;
  const drawnH = videoH * scale;
  const offX = (STAGE_W - drawnW) / 2;
  const offY = (STAGE_H - drawnH) / 2;
  return { x: offX + p.x * drawnW, y: offY + p.y * drawnH };
}

/** Face box (normalized) → keep-out zone in stage coordinates, padded for hair, ears and chin. */
export function faceKeepOut(box: { x: number; y: number; w: number; h: number }, videoW: number, videoH: number): Rect {
  const a = videoToStage({ x: box.x, y: box.y }, videoW, videoH);
  const b = videoToStage({ x: box.x + box.w, y: box.y + box.h }, videoW, videoH);
  const r = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  return expandRect(r, { left: r.w * 0.22, right: r.w * 0.22, top: r.h * 0.45, bottom: r.h * 0.25 });
}

// ---------------------------------------------------------------------------
// Gesture state machine
// ---------------------------------------------------------------------------

export interface HandFrame {
  t: number;
  /** No hand in view. */
  present: boolean;
  pose?: HandPose;
  /** Fingertip and pinch point in the presenter's (mirrored) stage frame. */
  tip?: Point;
  pinch?: Point;
}

export type GestureEvent =
  | { type: "pointer"; at: Point; mode: "point" | "pinch" | "idle"; dwell: number }
  | { type: "target"; at: Point }
  | { type: "drag-start"; at: Point }
  | { type: "drag-move"; at: Point; from: Point }
  | { type: "drag-end"; at: Point }
  | { type: "tap"; at: Point }
  | { type: "throw"; at: Point; velocity: Point }
  | { type: "lost" };

export const GESTURE = {
  dwellMs: 600,
  dwellRadius: 36,
  rearmRadius: 70,
  pinchOn: 0.32,
  pinchOff: 0.5,
  dragHoldMs: 280,
  dragMove: 28,
  tapMaxMs: 260,
  smoothing: 0.55,
  /** A fist only grabs after being held this long, so fists made while talking do nothing. */
  fistHoldMs: 250,
  /** A grab released (or lost) moving faster than this, over at least throwMinDistance, is a throw. */
  throwSpeed: 1400,
  throwMinDistance: 80,
  throwWindowMs: 150,
};

export class GestureMachine {
  private smooth: Point | null = null;
  private dwellStart = 0;
  private dwellAnchor: Point | null = null;
  private dwellFired = false;
  private pinching = false;
  private grabKind: "pinch" | "fist" | null = null;
  private fistSince: number | null = null;
  private recent: { t: number; x: number; y: number }[] = [];
  private pinchStart = 0;
  private pinchOrigin: Point | null = null;
  private dragging = false;
  private lastDrag: Point | null = null;

  update(f: HandFrame): GestureEvent[] {
    const out: GestureEvent[] = [];
    if (!f.present || !f.pose || !f.tip || !f.pinch) {
      // A hand flung out of frame mid-drag is a throw.
      const throwV = this.dragging ? this.throwVelocity(f.t) : null;
      if (this.dragging && this.lastDrag) out.push(throwV ? { type: "throw", at: this.lastDrag, velocity: throwV } : { type: "drag-end", at: this.lastDrag });
      if (this.smooth) out.push({ type: "lost" });
      this.reset();
      return out;
    }

    const wasPinching = this.pinching;
    // Grab: a pinch starts at once; a fist must be held a moment first.
    if (f.pose.fist) this.fistSince ??= f.t;
    else this.fistSince = null;
    const fistHeld = this.fistSince !== null && f.t - this.fistSince >= GESTURE.fistHoldMs;
    if (wasPinching) {
      this.pinching = this.grabKind === "fist" ? f.pose.fist || f.pose.pinchRatio < GESTURE.pinchOff : f.pose.pinchRatio < GESTURE.pinchOff;
    } else {
      this.pinching = f.pose.pinchRatio < GESTURE.pinchOn || fistHeld;
      if (this.pinching) this.grabKind = f.pose.pinchRatio < GESTURE.pinchOn ? "pinch" : "fist";
    }
    const raw = this.pinching ? f.pinch : f.tip;
    if (this.pinching) {
      this.recent.push({ t: f.t, x: raw.x, y: raw.y });
      while (this.recent.length && f.t - this.recent[0].t > GESTURE.throwWindowMs) this.recent.shift();
    }
    const a = GESTURE.smoothing;
    this.smooth = this.smooth ? { x: this.smooth.x * (1 - a) + raw.x * a, y: this.smooth.y * (1 - a) + raw.y * a } : { ...raw };
    const at = this.smooth;

    // Pinch: hold and move to drag, release quickly to tap.
    if (this.pinching && !wasPinching) {
      this.pinchStart = f.t;
      this.pinchOrigin = { ...at };
      this.dwellAnchor = null;
    }
    if (this.pinching && this.pinchOrigin) {
      const moved = Math.hypot(at.x - this.pinchOrigin.x, at.y - this.pinchOrigin.y);
      if (!this.dragging && (f.t - this.pinchStart >= GESTURE.dragHoldMs || moved > GESTURE.dragMove)) {
        this.dragging = true;
        this.lastDrag = { ...this.pinchOrigin };
        out.push({ type: "drag-start", at: { ...this.pinchOrigin } });
      }
      if (this.dragging && this.lastDrag) {
        out.push({ type: "drag-move", at: { ...at }, from: { ...this.lastDrag } });
        this.lastDrag = { ...at };
      }
      out.push({ type: "pointer", at: { ...at }, mode: "pinch", dwell: 0 });
      return out;
    }
    if (!this.pinching && wasPinching) {
      const held = f.t - this.pinchStart;
      const throwV = this.dragging ? this.throwVelocity(f.t) : null;
      if (this.dragging && throwV) {
        out.push({ type: "throw", at: { ...(this.lastDrag ?? at) }, velocity: throwV });
      } else if (this.dragging) {
        out.push({ type: "drag-end", at: { ...(this.lastDrag ?? at) } });
      } else if (this.grabKind === "pinch" && held <= GESTURE.tapMaxMs && this.pinchOrigin) {
        out.push({ type: "tap", at: { ...this.pinchOrigin } });
      }
      this.dragging = false;
      this.lastDrag = null;
      this.pinchOrigin = null;
      this.grabKind = null;
      this.recent = [];
    }

    // Point and dwell.
    if (f.pose.pointing) {
      if (!this.dwellAnchor || Math.hypot(at.x - this.dwellAnchor.x, at.y - this.dwellAnchor.y) > (this.dwellFired ? GESTURE.rearmRadius : GESTURE.dwellRadius)) {
        this.dwellAnchor = { ...at };
        this.dwellStart = f.t;
        this.dwellFired = false;
      }
      const progress = Math.min(1, (f.t - this.dwellStart) / GESTURE.dwellMs);
      out.push({ type: "pointer", at: { ...at }, mode: "point", dwell: this.dwellFired ? 1 : progress });
      if (progress >= 1 && !this.dwellFired) {
        this.dwellFired = true;
        out.push({ type: "target", at: { ...this.dwellAnchor } });
      }
    } else {
      this.dwellAnchor = null;
      this.dwellFired = false;
      out.push({ type: "pointer", at: { ...at }, mode: "idle", dwell: 0 });
    }
    return out;
  }

  /** Velocity (px/s) of the grab over the last moments, if fast and far enough to be a throw. */
  private throwVelocity(t: number): Point | null {
    const pts = this.recent.filter((p) => t - p.t <= GESTURE.throwWindowMs + 40);
    if (pts.length < 2) return null;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const dt = Math.max(1, b.t - a.t) / 1000;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    return dist / dt >= GESTURE.throwSpeed && dist >= GESTURE.throwMinDistance ? { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt } : null;
  }

  private reset() {
    this.smooth = null;
    this.recent = [];
    this.grabKind = null;
    this.fistSince = null;
    this.dwellAnchor = null;
    this.dwellFired = false;
    this.pinching = false;
    this.pinchOrigin = null;
    this.dragging = false;
    this.lastDrag = null;
  }
}
