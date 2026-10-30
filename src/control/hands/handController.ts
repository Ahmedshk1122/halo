// Hand tracking → gestures → stage actions, plus the face keep-out zone.
import { STAGE_W, type Rect } from "../../../shared/geometry";
import { classifyHand, faceKeepOut, GestureMachine, videoToStage } from "../../../shared/gestures";
import { VisionTracker, type TrackerFrame } from "../../hands/tracker";
import { setKeepOut } from "../stageActions";
import { store } from "../state";
import { DragSession, expandAt, targetAt, visualAt } from "./interaction";

let tracker: VisionTracker | null = null;
const machine = new GestureMachine();
let drag: DragSession | null = null;
let smoothedFace: Rect | null = null;
let lastFaceUpdate = 0;

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
        break;
      case "lost":
        store.set((s) => ({ hands: { ...s.hands, pointer: null } }));
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
  tracker = new VisionTracker(onFrame);
  try {
    await tracker.start(store.get().cameraDeviceId);
    store.set((s) => ({ hands: { ...s.hands, status: "running" } }));
  } catch (e) {
    tracker?.stop();
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
