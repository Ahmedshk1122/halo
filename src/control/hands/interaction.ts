// Turns hand gestures and mouse input into stage actions. Both work in the
// presenter's frame: the mirrored preview, where pointing feels natural.
import { STAGE_H, STAGE_W, mirrorRect, contains, type Point } from "../../../shared/geometry";
import { effectiveRect } from "../../../shared/placement";
import { dragVisual, dropVisual, setTarget, toggleExpand } from "../stageActions";
import { store } from "../state";

/** Visual under a point in the presenter's (mirrored) frame, top-most first. */
export function visualAt(p: Point): string | null {
  const s = store.get();
  for (const id of [...s.onStage].reverse()) {
    const v = s.visuals[id];
    if (v && contains(mirrorRect(effectiveRect(v.frame, v.scale)), p)) return id;
  }
  return null;
}

/** The preview viewport in the control window, if one is on screen. */
function previewViewport(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".preview .stage-viewport");
}

/** Visual and part under a presenter-frame point, using the preview's real layout when available. */
export function partAt(p: Point): { visualId: string; part: string | null } | null {
  const vp = previewViewport();
  if (vp) {
    const r = vp.getBoundingClientRect();
    const scale = Math.min(r.width / STAGE_W, r.height / STAGE_H);
    const cx = r.left + (r.width - STAGE_W * scale) / 2 + p.x * scale;
    const cy = r.top + (r.height - STAGE_H * scale) / 2 + p.y * scale;
    for (const el of document.elementsFromPoint(cx, cy)) {
      const frame = el.closest<HTMLElement>("[data-visual-id]");
      if (!frame || !vp.contains(frame)) continue;
      const part = el.closest<Element>("[data-part]");
      return { visualId: frame.dataset.visualId!, part: part && frame.contains(part) ? part.getAttribute("data-part") : null };
    }
    return null;
  }
  const id = visualAt(p);
  return id ? { visualId: id, part: null } : null;
}

/** Point at something: ring it in orange. Pointing at empty space clears rings. */
export function targetAt(p: Point) {
  const hit = partAt(p);
  const s = store.get();
  for (const id of s.onStage) {
    if (id !== hit?.visualId && s.visuals[id]?.target) setTarget(id, null);
  }
  if (!hit) return;
  const current = s.visuals[hit.visualId]?.target ?? null;
  if (hit.part && hit.part !== current) setTarget(hit.visualId, hit.part);
  else if (!hit.part && current) setTarget(hit.visualId, null);
}

/** Drag in the presenter frame. Movement is mirrored back to the stage. */
export class DragSession {
  private startBox;
  constructor(
    readonly id: string,
    private origin: Point,
  ) {
    const v = store.get().visuals[id];
    this.startBox = effectiveRect(v.frame, v.scale);
  }
  move(p: Point) {
    const dx = p.x - this.origin.x;
    const dy = p.y - this.origin.y;
    // The preview is mirrored: moving right there moves left on the stage.
    dragVisual(this.id, { ...this.startBox, x: this.startBox.x - dx, y: this.startBox.y + dy });
  }
  end() {
    dropVisual(this.id);
  }
}

export function expandAt(p: Point) {
  const id = visualAt(p);
  if (id) toggleExpand(id);
}
