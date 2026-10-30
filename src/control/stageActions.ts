// Everything that changes what is on the stage goes through these functions.

import { CONTENT_TOP, clampToSafeArea, insideSafeArea, intersects, type Rect } from "../../shared/geometry";
import { preferredSlots, templateSize } from "../../shared/layout";
import { effectiveRect, frameFromEffective, isFree, placeVisual, settleManual } from "../../shared/placement";
import type { ResolvedVisual, VisualSpec } from "../../shared/visuals";
import { now } from "../sync/channel";
import { store, type ControlState, type VisualInstance, type VisualSource } from "./state";

export const MAX_ON_STAGE = 2;

function patchVisual(state: ControlState, id: string, patch: Partial<VisualInstance>): ControlState["visuals"] {
  const v = state.visuals[id];
  if (!v) return state.visuals;
  return { ...state.visuals, [id]: { ...v, ...patch } };
}

function occupiedRects(state: ControlState, except: string[]): Rect[] {
  return state.onStage
    .filter((id) => !except.includes(id))
    .map((id) => state.visuals[id])
    .filter(Boolean)
    .map((v) => effectiveRect(v.frame, v.scale));
}

interface ShowOptions {
  spec?: VisualSpec | null;
  source: VisualSource;
  beat?: string;
  aliases?: string[];
  /** Visuals to tuck in the same move (the beat moved on). */
  tuck?: string[];
}

/**
 * Put a new visual on stage. Keeps at most two on screen: the oldest is tucked
 * if needed, and also if there is no room for the new one.
 */
export function showVisual(visual: ResolvedVisual, opts: ShowOptions): string {
  const state = store.get();
  const id = `v${state.nextVisualNumber}`;
  const t = now();
  const instance: VisualInstance = {
    id,
    title: visual.title,
    aliases: opts.aliases ?? [],
    visual,
    spec: opts.spec ?? null,
    status: "onscreen",
    frame: { x: 0, y: 0, ...templateSize(visual) },
    scale: 1,
    slot: "left",
    userPlaced: false,
    expanded: false,
    reveal: 0,
    target: null,
    dragging: false,
    source: opts.source,
    beat: opts.beat ?? "",
    createdAt: t,
    shownAt: t,
  };
  store.set({ visuals: { ...state.visuals, [id]: instance }, nextVisualNumber: state.nextVisualNumber + 1 });
  for (const tid of opts.tuck ?? []) tuckVisual(tid);
  bringOnStage(id);
  return id;
}

/** Places an existing visual and adds it to the on-stage list, making room as needed. */
function bringOnStage(id: string) {
  let state = store.get();
  // Too many on screen: tuck the oldest.
  while (state.onStage.filter((x) => x !== id).length >= MAX_ON_STAGE) {
    tuckVisual(state.onStage.find((x) => x !== id)!);
    state = store.get();
  }
  const v = state.visuals[id];
  const size = templateSize(v.visual);
  let placement = placeVisual(size, preferredSlots(v.visual), occupiedRects(state, [id]), state.keepOut);
  // No room next to what is there: tuck the oldest and try again.
  while (!placement && state.onStage.some((x) => x !== id)) {
    tuckVisual(state.onStage.find((x) => x !== id)!);
    state = store.get();
    placement = placeVisual(size, preferredSlots(v.visual), occupiedRects(state, [id]), state.keepOut);
  }
  const frame = placement?.frame ?? { x: 48, y: CONTENT_TOP, ...size };
  store.set((s) => ({
    visuals: patchVisual(s, id, {
      status: "onscreen",
      frame,
      scale: placement?.scale ?? 0.7,
      slot: placement?.slot ?? "left",
      userPlaced: false,
      expanded: false,
      target: null,
      dragging: false,
      shownAt: now(),
    }),
    onStage: [...s.onStage.filter((x) => x !== id), id],
    chips: s.chips.filter((x) => x !== id),
  }));
}

export function tuckVisual(id: string) {
  store.set((s) => {
    if (!s.visuals[id] || s.visuals[id].status !== "onscreen") return {};
    return {
      visuals: patchVisual(s, id, { status: "tucked", target: null, dragging: false, expanded: false }),
      onStage: s.onStage.filter((x) => x !== id),
      chips: [...s.chips.filter((x) => x !== id), id],
    };
  });
}

export function recallVisual(id: string) {
  const v = store.get().visuals[id];
  if (!v) return;
  if (v.status === "onscreen") return;
  bringOnStage(id);
}

/** Clean slate: everything leaves the stage, chips included. History is kept. */
export function clearStage() {
  store.set((s) => {
    const visuals = { ...s.visuals };
    for (const id of [...s.onStage, ...s.chips]) {
      visuals[id] = { ...visuals[id], status: "cleared", target: null, dragging: false, expanded: false };
    }
    return { visuals, onStage: [], chips: [] };
  });
}

export function removeVisual(id: string) {
  store.set((s) => {
    const visuals = { ...s.visuals };
    delete visuals[id];
    return { visuals, onStage: s.onStage.filter((x) => x !== id), chips: s.chips.filter((x) => x !== id) };
  });
}

/** Replace the content of a visual in place (director "update"). */
export function updateVisual(id: string, visual: ResolvedVisual, spec: VisualSpec | null) {
  const state = store.get();
  const v = state.visuals[id];
  if (!v) return;
  const size = templateSize(visual);
  const sameSize = size.w === v.frame.w && size.h === v.frame.h;
  store.set((s) => ({
    visuals: patchVisual(s, id, { visual, spec, title: visual.title, frame: sameSize ? v.frame : { ...v.frame, ...size } }),
  }));
  if (!sameSize && v.status === "onscreen" && !v.userPlaced) bringOnStage(id);
}

/** Drag: move the visual's on-screen box to `box` (stage coordinates, unmirrored). */
export function dragVisual(id: string, box: Rect) {
  store.set((s) => {
    const v = s.visuals[id];
    if (!v) return {};
    const clamped = clampToSafeArea(box, CONTENT_TOP);
    return {
      visuals: patchVisual(s, id, {
        frame: frameFromEffective(clamped, { w: v.frame.w, h: v.frame.h }, v.scale),
        dragging: true,
        userPlaced: true,
        slot: "custom",
      }),
      onStage: [...s.onStage.filter((x) => x !== id), id],
    };
  });
}

/** Drop: the visual stays where it was put, except it never covers the face. */
export function dropVisual(id: string) {
  store.set((s) => {
    const v = s.visuals[id];
    if (!v) return {};
    const box = settleManual(effectiveRect(v.frame, v.scale), occupiedRects(s, [id]), s.keepOut);
    return {
      visuals: patchVisual(s, id, {
        frame: frameFromEffective(box, { w: v.frame.w, h: v.frame.h }, v.scale),
        dragging: false,
      }),
    };
  });
}

/** Pinch-tap: grow or shrink about the visual's center, never over the face. */
export function toggleExpand(id: string) {
  const s = store.get();
  const v = s.visuals[id];
  if (!v || v.status !== "onscreen") return;
  if (v.expanded) {
    const base = v.userPlaced ? 1 : v.scale;
    store.set((st) => ({ visuals: patchVisual(st, id, { expanded: false, scale: Math.min(1, base) }) }));
    if (!v.userPlaced) bringOnStage(id);
    return;
  }
  const c = effectiveRect(v.frame, v.scale);
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  for (const scale of [1.45, 1.35, 1.25, 1.15]) {
    const w = v.frame.w * scale;
    const h = v.frame.h * scale;
    const box = clampToSafeArea({ x: cx - w / 2, y: cy - h / 2, w, h }, CONTENT_TOP);
    if (!insideSafeArea(box, CONTENT_TOP)) continue;
    if (s.keepOut && intersects(box, s.keepOut)) continue;
    store.set((st) => ({
      visuals: patchVisual(st, id, { expanded: true, scale, frame: frameFromEffective(box, v.frame, scale) }),
      onStage: [...st.onStage.filter((x) => x !== id), id],
    }));
    return;
  }
}

export function setTarget(id: string, part: string | null) {
  store.set((s) => ({ visuals: patchVisual(s, id, { target: part }) }));
}

export function setReveal(id: string, reveal: number) {
  store.set((s) => ({ visuals: patchVisual(s, id, { reveal }) }));
}

/** The face moved: move automatically placed visuals out of the way, nudge hand-placed ones. */
export function setKeepOut(keepOut: Rect | null) {
  store.set({ keepOut });
  if (!keepOut) return;
  const s = store.get();
  for (const id of s.onStage) {
    const v = store.get().visuals[id];
    if (!v || v.dragging) continue;
    const box = effectiveRect(v.frame, v.scale);
    if (!intersects(box, keepOut)) continue;
    if (v.userPlaced || v.expanded) {
      const settled = settleManual(box, occupiedRects(store.get(), [id]), keepOut);
      store.set((st) => ({ visuals: patchVisual(st, id, { frame: frameFromEffective(settled, v.frame, v.scale) }) }));
    } else if (!isFree(box, occupiedRects(store.get(), [id]), keepOut)) {
      bringOnStage(id);
    }
  }
}
