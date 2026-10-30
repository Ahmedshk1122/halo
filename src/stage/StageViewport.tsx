import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { STAGE_H, STAGE_W } from "../../shared/geometry";

/** Scales the fixed 1920×1080 canvas to fit its container, letterboxed and centered. */
export function StageViewport({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 0, left: 0, top: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const scale = Math.min(width / STAGE_W, height / STAGE_H);
      setBox({ scale, left: (width - STAGE_W * scale) / 2, top: (height - STAGE_H * scale) / 2 });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={`stage-viewport ${className ?? ""}`}>
      <div
        className="stage-scaler"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(${box.left}px, ${box.top}px) scale(${box.scale})`,
          visibility: box.scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Converts a client point inside a viewport element to stage coordinates. */
export function clientToStage(viewport: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const r = viewport.getBoundingClientRect();
  const scale = Math.min(r.width / STAGE_W, r.height / STAGE_H);
  const left = r.left + (r.width - STAGE_W * scale) / 2;
  const top = r.top + (r.height - STAGE_H * scale) / 2;
  return { x: (clientX - left) / scale, y: (clientY - top) / scale };
}
