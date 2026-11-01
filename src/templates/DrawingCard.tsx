import { motion, useReducedMotion } from "motion/react";
import { CANVAS, drawingCues, PALETTE, type DrawElement } from "../../shared/drawing";
import type { RDrawing } from "../../shared/visuals";
import { BUILD_DELAY } from "./motion";

const PROP: Record<string, string> = {
  "stroke-width": "strokeWidth",
  "fill-opacity": "fillOpacity",
  "stroke-opacity": "strokeOpacity",
  "stroke-dasharray": "strokeDasharray",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "text-anchor": "textAnchor",
  "dominant-baseline": "dominantBaseline",
};

const MOTION = {
  path: motion.path,
  rect: motion.rect,
  circle: motion.circle,
  ellipse: motion.ellipse,
  line: motion.line,
  polyline: motion.polyline,
  polygon: motion.polygon,
  text: motion.text,
} as const;

/** SVG props for an element: palette names become tokens; sensible defaults so nothing renders as a black blob. */
function propsOf(e: DrawElement): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(e.attrs)) {
    if (k === "fill" || k === "stroke") out[k] = PALETTE[v] ?? v;
    else out[PROP[k] ?? k] = v;
  }
  const open = e.tag === "line" || e.tag === "polyline";
  if (out.fill === undefined) out.fill = e.tag === "text" ? PALETTE.ink : open || e.attrs.stroke ? "none" : PALETTE.fill;
  if (out.stroke === undefined && e.tag !== "text" && (open || out.fill === "none")) out.stroke = PALETTE.ink;
  if (out.strokeWidth === undefined && out.stroke !== undefined && out.stroke !== "none") out.strokeWidth = 3;
  out.strokeLinecap ??= "round";
  out.strokeLinejoin ??= "round";
  if (e.tag === "text") out.fontWeight ??= 500;
  return out;
}

function DrawEl({ e, index, visible, live, reduce }: { e: DrawElement; index: number; visible: boolean; live: boolean; reduce: boolean }) {
  const Tag = MOTION[e.tag];
  const props = propsOf(e);
  // Drawn while streaming: each part animates as it arrives. Finished drawings build in order.
  const delay = live ? 0 : BUILD_DELAY + Math.min(index * 0.025, 1.1);
  const stroked = e.tag !== "text" && props.fill === "none";
  const initial = reduce ? { opacity: 0 } : stroked ? { pathLength: 0, opacity: 0 } : { opacity: 0, y: e.tag === "text" ? 6 : 0 };
  const shown = stroked && !reduce ? { pathLength: 1, opacity: 1 } : { opacity: 1, y: 0 };
  const hidden = stroked && !reduce ? { pathLength: 0, opacity: 0 } : { opacity: 0, y: 0 };
  return (
    <Tag
      {...props}
      data-part={`el-${index}`}
      initial={initial}
      animate={visible ? shown : hidden}
      transition={{ duration: stroked ? 0.7 : 0.45, ease: [0.33, 0, 0.2, 1], delay }}
    >
      {e.tag === "text" ? e.text : null}
    </Tag>
  );
}

/** A drawing of anything, made live: a breathing placeholder, then each part draws in as it arrives. */
export function DrawingCard({ v, reveal }: { v: RDrawing; reveal: number }) {
  const reduce = useReducedMotion() ?? false;
  const c = CANVAS[v.aspect];
  const cues = drawingCues(v.elements);
  const live = v.pending || v.live;
  return (
    <div className="tpl tpl-drawing">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
        {v.caption && <div className="t-footnote">{v.caption}</div>}
      </div>
      <div className="tpl-drawing-canvas" style={{ width: c.w, height: c.h }}>
        {v.pending && <div className={`tpl-drawing-pending${reduce ? " is-still" : ""}`} aria-hidden />}
        <svg width={c.w} height={c.h} viewBox={`0 0 ${c.w} ${c.h}`} className="tpl-drawing-svg">
          {v.elements.map((e, i) => (
            <DrawEl key={e.key} e={e} index={i} visible={!e.cue || cues.indexOf(e.cue) < reveal} live={live} reduce={reduce} />
          ))}
        </svg>
      </div>
    </div>
  );
}
