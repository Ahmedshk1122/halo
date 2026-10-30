import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { STAGE_H, STAGE_W } from "../../shared/geometry";
import { CameraVideo } from "../stage/CameraVideo";
import { StageCanvas } from "../stage/StageCanvas";
import { clientToStage, StageViewport } from "../stage/StageViewport";
import { useStore } from "./createStore";
import { DragSession, targetAt } from "./hands/interaction";
import { recallVisual, toggleExpand } from "./stageActions";
import { deriveStageState } from "./stageSync";
import { store } from "./state";

/**
 * Presenter preview of the stage. Mirrored like a mirror: the video and the
 * positions of visuals flip, the text inside visuals stays readable.
 * Doubles as the mouse fallback: click a part to ring it, drag to move,
 * double-click to expand, click a chip to recall it.
 */
export function Preview({ compact = false, children }: { compact?: boolean; children?: ReactNode }) {
  const state = useStore(store, deriveStageState);
  const cameraDeviceId = useStore(store, (s) => s.cameraDeviceId);
  const viewport = useRef<HTMLDivElement>(null);

  const toStage = (e: { clientX: number; clientY: number }) => {
    const vp = viewport.current?.querySelector<HTMLElement>(".stage-viewport");
    return vp ? clientToStage(vp, e.clientX, e.clientY) : { x: 0, y: 0 };
  };

  const onVisualPointerDown = (id: string, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = toStage(e);
    let session: DragSession | null = null;
    const move = (ev: PointerEvent) => {
      const p = toStage(ev);
      if (!session && Math.hypot(p.x - start.x, p.y - start.y) > 8) session = new DragSession(id, start);
      session?.move(p);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (session) session.end();
      else targetAt(toStage(ev));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className={`preview is-interactive${compact ? " is-compact" : ""}`}
      ref={viewport}
      onPointerDown={(e) => {
        // A click on the video, not a visual, clears rings.
        if (e.target === e.currentTarget || (e.target as Element).closest(".stage-video")) targetAt({ x: -1, y: -1 });
      }}
    >
      <StageViewport>
        <StageCanvas
          state={state}
          mirror
          video={<CameraVideo deviceId={cameraDeviceId} mirror />}
          onVisualPointerDown={onVisualPointerDown}
          onVisualDoubleClick={(id) => toggleExpand(id)}
          onChipClick={(id) => recallVisual(id)}
          overlay={<PresenterOverlay />}
        />
      </StageViewport>
      <PreviewBadge />
      {children}
    </div>
  );
}

/** Presenter-only layer: fingertip, dwell progress, face zone. Never sent to the stage. */
function PresenterOverlay() {
  const pointer = useStore(store, (s) => s.hands.pointer);
  const showFace = useStore(store, (s) => s.hands.showFaceZone);
  const keepOut = useStore(store, (s) => s.keepOut);
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="presenter-overlay">
      {showFace && keepOut && (
        <div className="face-zone" style={{ left: STAGE_W - keepOut.x - keepOut.w, top: keepOut.y, width: keepOut.w, height: keepOut.h }}>
          <span>Face zone</span>
        </div>
      )}
      {pointer && pointer.x >= 0 && pointer.x <= STAGE_W && pointer.y >= 0 && pointer.y <= STAGE_H && (
        <svg className={`hand-pointer is-${pointer.mode}`} style={{ left: pointer.x - 44, top: pointer.y - 44 }} width={88} height={88}>
          <circle cx={44} cy={44} r={pointer.mode === "pinch" ? 16 : 11} className="hand-dot" />
          {pointer.mode === "point" && (
            <circle cx={44} cy={44} r={r} className="hand-dwell" strokeDasharray={c} strokeDashoffset={c * (1 - pointer.dwell)} transform="rotate(-90 44 44)" />
          )}
        </svg>
      )}
    </div>
  );
}

function PreviewBadge() {
  const hands = useStore(store, (s) => s.hands.status);
  const text = hands === "running" ? "Mirrored preview · hands on" : hands === "loading" ? "Mirrored preview · loading hand tracking" : "Mirrored preview";
  return <div className="preview-badge">{text}</div>;
}
