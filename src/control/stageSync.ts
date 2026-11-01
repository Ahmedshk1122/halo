// Mirrors control state to the stage window over BroadcastChannel.

import type { ChannelMessage, StageState } from "../../shared/stage";
import { HaloChannel, now } from "../sync/channel";
import { store, type ControlState, type VisualInstance } from "./state";

/**
 * How a visual sits on the video: floating (no card) or on glass, which glass,
 * and which ink. Uses what the camera shows behind it: a busy background gets
 * glass under Auto; glass and ink match a bright or dark background.
 */
export function backingFor(s: Pick<ControlState, "backing" | "glass">, v: VisualInstance) {
  const b = v.backdrop;
  const wantsFloat = s.backing === "float" || (s.backing === "auto" && v.spec?.style === "float");
  const float = wantsFloat && !(s.backing === "auto" && b?.busy);
  const glass = s.glass === "auto" ? (b?.tone === "dark" ? "dark" : "light") : s.glass;
  const ink: "light" | "dark" = b?.tone === "light" ? "dark" : "light";
  return { float, glass, ink };
}

export const channel = new HaloChannel();

let seq = 0;
let cachedFor: ControlState | null = null;
let cached: StageState | null = null;

export function deriveStageState(s: ControlState): StageState {
  if (s === cachedFor && cached) return cached;
  seq += 1;
  cached = {
    seq,
    glass: s.glass === "auto" ? "light" : s.glass,
    visuals: s.onStage
      .map((id) => s.visuals[id])
      .filter(Boolean)
      .map((v) => ({
        id: v.id,
        visual: v.visual,
        frame: v.frame,
        scale: v.scale,
        expanded: v.expanded,
        reveal: v.reveal,
        target: v.target,
        dragging: v.dragging,
        ...backingFor(s, v),
      })),
    chips: s.chips
      .map((id) => s.visuals[id])
      .filter(Boolean)
      .map((v) => ({ id: v.id, title: v.title, template: v.visual.template })),
    keepOut: s.keepOut,
    cameraDeviceId: s.cameraDeviceId,
    reducedMotion: s.reducedMotion,
  };
  cachedFor = s;
  return cached;
}

const renderListeners = new Set<(id: string, at: number) => void>();
export function onStageRendered(listener: (id: string, at: number) => void) {
  renderListeners.add(listener);
  return () => renderListeners.delete(listener);
}

let started = false;
export function startStageSync() {
  if (started) return;
  started = true;
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    channel.post({ type: "state", state: deriveStageState(store.get()) });
  };
  store.subscribe((next, prev) => {
    const changed =
      next.visuals !== prev.visuals ||
      next.onStage !== prev.onStage ||
      next.chips !== prev.chips ||
      next.glass !== prev.glass ||
      next.backing !== prev.backing ||
      next.keepOut !== prev.keepOut ||
      next.cameraDeviceId !== prev.cameraDeviceId ||
      next.reducedMotion !== prev.reducedMotion;
    if (changed && !scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  });
  channel.subscribe((msg: ChannelMessage) => {
    switch (msg.type) {
      case "stage-hello":
        store.set((s) => ({ stage: { ...s.stage, connected: true, lastHello: now() } }));
        flush();
        break;
      case "stage-status":
        store.set((s) => ({ stage: { ...s.stage, connected: true, camera: msg.camera, size: msg.size } }));
        break;
      case "stage-bye":
        store.set((s) => ({ stage: { ...s.stage, connected: false } }));
        break;
      case "rendered":
        store.set((s) => (s.stage.connected ? {} : { stage: { ...s.stage, connected: true } }));
        renderListeners.forEach((l) => l(msg.id, msg.at));
        break;
      default:
        break;
    }
  });
  // If the stage was open before the control window, it is waiting for state.
  flush();
  channel.post({ type: "control-hello" });
}
