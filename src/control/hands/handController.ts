// Hand tracking → gestures → stage actions, plus the face keep-out zone.
import { STAGE_W, contains, expandRect, mirrorRect, type Point, type Rect } from "../../../shared/geometry";
import { effectiveRect } from "../../../shared/placement";
import { now } from "../../sync/channel";
import { classifyHand, faceKeepOut, GestureMachine, videoToStage } from "../../../shared/gestures";
import type { TrackerFrame, VisionTracker } from "../../hands/tracker";
import { endGrow, growVisualTo, setKeepOut, throwVisual } from "../stageActions";
import { RELOAD_HINT } from "../../data/loadFile";
import { store } from "../state";
import { DragSession, expandAt, targetAt, visualAt } from "./interaction";
import { recordPointer } from "./pointing";

let tracker: VisionTracker | null = null;
const machine = new GestureMachine();
let drag: DragSession | null = null;
let smoothedFace: Rect | null = null;
let lastFaceUpdate = 0;

// Growing a goal card with the hand: the presenter first holds a pointing finger
// on the card (so a passing hand does nothing), then raises it; the card follows.
const ENGAGE_MS = 300;
let growCandidate: { id: string; since: number } | null = null;
let growing: string | null = null;

function goalUnder(p: Point): string | null {
  const s = store.get();
  const t = now();
  for (const id of [...s.onStage].reverse()) {
    const v = s.visuals[id];
    if (!v || v.visual.template !== "goal" || (v.growableUntil ?? 0) < t) continue;
    // Presenter frame is mirrored; allow some room around the card.
    if (contains(expandRect(mirrorRect(effectiveRect(v.frame, v.scale)), { left: 60, right: 60, top: 400, bottom: 20 }), p)) return id;
  }
  return null;
}

function followWithGoal(at: Point, pointing: boolean) {
  if (!pointing) {
    if (growing) endGrow(growing);
    growing = null;
    growCandidate = null;
    return;
  }
  if (growing) {
    const v = store.get().visuals[growing];
    if (v) growVisualTo(growing, at.y - 150);
    return;
  }
  const id = goalUnder(at);
  if (!id) {
    growCandidate = null;
    return;
  }
  const t = now();
  if (!growCandidate || growCandidate.id !== id) growCandidate = { id, since: t };
  else if (t - growCandidate.since >= ENGAGE_MS) growing = id;
}

function onFrame(f: TrackerFrame) {
  // Hands: positions in the presenter's mirrored frame.
  let frame;
  if (f.hand) {
    const pose = classifyHand(f.hand);
    const mirror = (p: { x: number; y: number }) => {
      const s = videoToStage(p, f.videoW, f.videoH);
      return { x: STAGE_W - s.x, y: s.y };
    };
    frame = { t: f.t, present: true, pose, tip: mirror(pose.indexTip), pinch: mirror(pose.pinchPoint) };
  } else {
    frame = { t: f.t, present: false };
  }
  for (const e of machine.update(frame)) {
    switch (e.type) {
      case "pointer":
        store.set((s) => ({ hands: { ...s.hands, pointer: { x: e.at.x, y: e.at.y, mode: e.mode, dwell: e.dwell } } }));
        recordPointer(e.at.x, e.at.y, e.mode === "point");
        followWithGoal(e.at, e.mode === "point");
        break;
      case "lost":
        store.set((s) => ({ hands: { ...s.hands, pointer: null } }));
        recordPointer(0, 0, false);
        followWithGoal({ x: 0, y: 0 }, false);
        break;
      case "target":
        targetAt(e.at);
        break;
      case "drag-start": {
        const id = visualAt(e.at);
        drag = id ? new DragSession(id, e.at) : null;
        break;
      }
      case "drag-move":
        drag?.move(e.at);
        break;
      case "drag-end":
        drag?.end();
        drag = null;
        break;
      case "throw":
        // Velocity is in the mirrored frame: flip x back for the stage.
        if (drag) throwVisual(drag.id, { x: -e.velocity.x, y: e.velocity.y });
        drag = null;
        break;
      case "tap":
        expandAt(e.at);
        break;
    }
  }

  // Face keep-out, smoothed, with hysteresis so visuals don't jitter. When the
  // face is briefly lost, the last zone is kept rather than letting visuals jump.
  if (f.face) {
    {
      const next = faceKeepOut(f.face, f.videoW, f.videoH);
      smoothedFace = smoothedFace
        ? {
            x: smoothedFace.x * 0.6 + next.x * 0.4,
            y: smoothedFace.y * 0.6 + next.y * 0.4,
            w: smoothedFace.w * 0.6 + next.w * 0.4,
            h: smoothedFace.h * 0.6 + next.h * 0.4,
          }
        : next;
      const cur = store.get().keepOut;
      const moved = !cur || Math.abs(cur.x - smoothedFace.x) + Math.abs(cur.y - smoothedFace.y) + Math.abs(cur.w - smoothedFace.w) > 40;
      if (moved && f.t - lastFaceUpdate > 400) {
        lastFaceUpdate = f.t;
        setKeepOut(roundRect(smoothedFace));
      }
    }
  }
}

const roundRect = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

export async function startHands() {
  if (tracker) return;
  store.set((s) => ({ hands: { ...s.hands, status: "loading", detail: undefined } }));
  // MediaPipe is large; load it only when hand tracking starts.
  let Tracker: typeof import("../../hands/tracker").VisionTracker;
  try {
    ({ VisionTracker: Tracker } = await import("../../hands/tracker"));
  } catch {
    store.set((s) => ({ hands: { ...s.hands, status: "error", detail: RELOAD_HINT } }));
    return;
  }
  const mine = new Tracker(onFrame);
  tracker = mine;
  try {
    await mine.start(store.get().cameraDeviceId);
    // Turned off (or restarted) while the models were loading.
    if (tracker !== mine) return mine.stop();
    store.set((s) => ({ hands: { ...s.hands, status: "running" } }));
  } catch (e) {
    mine.stop();
    if (tracker !== mine) return;
    tracker = null;
    store.set((s) => ({ hands: { ...s.hands, status: "error", detail: (e as Error).message } }));
  }
}

export function stopHands() {
  tracker?.stop();
  tracker = null;
  drag = null;
  store.set((s) => ({ hands: { ...s.hands, status: "off", pointer: null } }));
}

/** Follows the settings: start or stop tracking, restart when the camera changes. */
export function startHandSync() {
  if (store.get().hands.enabled) void startHands();
  store.subscribe((s, prev) => {
    if (s.hands.enabled !== prev.hands.enabled) {
      if (s.hands.enabled) void startHands();
      else stopHands();
    } else if (s.cameraDeviceId !== prev.cameraDeviceId && s.hands.enabled) {
      stopHands();
      void startHands();
    }
  });
}
