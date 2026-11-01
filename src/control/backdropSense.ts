// Samples the camera behind each visual on stage, a few times a second, and
// records whether it is bright or dark, calm or busy (shared/backdrop.ts).
// Reads the control window's own camera preview; nothing leaves the browser.

import { judgeBackdrop, lumaStats, stageToVideo, type Backdrop } from "../../shared/backdrop";
import { STAGE_H, STAGE_W } from "../../shared/geometry";
import { effectiveRect } from "../../shared/placement";
import { store } from "./state";

const SAMPLE_W = 64;
const SAMPLE_H = 40;
let canvas: HTMLCanvasElement | null = null;

function cameraVideo(): HTMLVideoElement | null {
  const v = document.querySelector<HTMLVideoElement>("video.camera-video");
  return v && v.readyState >= 2 && v.videoWidth > 0 ? v : null;
}

/** What is behind a visual right now, or null without a live camera. */
export function senseVisual(id: string): Backdrop | null {
  const s = store.get();
  const v = s.visuals[id];
  const video = cameraVideo();
  if (!v || !video) return null;
  canvas ??= document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const box = stageToVideo(effectiveRect(v.frame, v.scale), { w: video.videoWidth, h: video.videoHeight }, { w: STAGE_W, h: STAGE_H });
  try {
    ctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, SAMPLE_W, SAMPLE_H);
    const next = judgeBackdrop(lumaStats(ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data), v.backdrop);
    if (!v.backdrop || v.backdrop.tone !== next.tone || v.backdrop.busy !== next.busy) {
      store.set((st) => (st.visuals[id] ? { visuals: { ...st.visuals, [id]: { ...st.visuals[id], backdrop: next } } } : {}));
    }
    return next;
  } catch {
    return v.backdrop ?? null;
  }
}

let timer = 0;
/** Keeps every visual on stage up to date with what is behind it. */
export function startBackdropSensing() {
  if (timer) return;
  timer = window.setInterval(() => {
    for (const id of store.get().onStage) senseVisual(id);
  }, 600);
}
