import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { CANVAS } from "../../shared/drawing";
import type { RDrawing } from "../../shared/visuals";
import type { Engine } from "./three/engine";

/** Loads the 3D renderer in the background, so the first model appears without a pause. */
export function prefetch3D() {
  const load = () => void import("./three/engine").catch(() => undefined);
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (idle) idle(load);
  else window.setTimeout(load, 1500);
}

/** A live 3D model: three.js loads the first time one appears, then parts grow in as they stream. */
export function Model3D({ v }: { v: RDrawing }) {
  const reduce = useReducedMotion() ?? false;
  const c = CANVAS[v.aspect];
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const leaders = useRef<SVGSVGElement>(null);
  const engine = useRef<Engine | null>(null);
  const latest = useRef(v);
  latest.current = v;

  useEffect(() => {
    let cancelled = false;
    void import("./three/engine").then(({ createEngine }) => {
      if (cancelled || !host.current || !labels.current || !leaders.current) return;
      engine.current = createEngine(host.current, labels.current, leaders.current, c, reduce);
      engine.current.update(latest.current.objects, latest.current.scene);
    });
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
    };
    // The canvas is rebuilt only if its shape changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.aspect, reduce]);

  useEffect(() => {
    engine.current?.update(v.objects, v.scene);
  }, [v.objects, v.scene]);

  return (
    <div className="tpl tpl-drawing tpl-model">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
        {v.caption && <div className="t-footnote">{v.caption}</div>}
      </div>
      <div className="tpl-drawing-canvas" style={{ width: c.w, height: c.h }}>
        {v.pending && <div className={`tpl-drawing-pending${reduce ? " is-still" : ""}`} aria-hidden />}
        <div ref={host} className="tpl-model-host" />
        <svg ref={leaders} className="tpl-model-leaders" width={c.w} height={c.h} viewBox={`0 0 ${c.w} ${c.h}`} aria-hidden />
        <div ref={labels} className="tpl-model-labels" />
      </div>
    </div>
  );
}
