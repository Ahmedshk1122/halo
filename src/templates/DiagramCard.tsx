import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { BACKDROPS } from "../../shared/backdrops";
import { diagramArea } from "../../shared/layout";
import { diagramCues, type DiagramNode, type DiagramTone, type RDiagram } from "../../shared/visuals";
import { SvgIcon } from "./icons";
import { BUILD_DELAY, BUILD_STAGGER, SPRING_SOFT } from "./motion";

/** Colors for each tone, from the design tokens. One accent per visual; orange only for highlights. */
const TONE: Record<DiagramTone, { fill: string; stroke: string; text: string; solid: string }> = {
  accent: { fill: "color-mix(in srgb, var(--accent) 15%, transparent)", stroke: "var(--accent)", text: "var(--label)", solid: "var(--accent)" },
  highlight: { fill: "color-mix(in srgb, var(--orange) 18%, transparent)", stroke: "var(--orange)", text: "var(--label)", solid: "var(--orange)" },
  neutral: { fill: "var(--fill)", stroke: "transparent", text: "var(--label)", solid: "var(--label-2)" },
  muted: { fill: "var(--fill-2)", stroke: "transparent", text: "var(--label-2)", solid: "var(--label-3)" },
};

const LABEL = 26;
const DETAIL = 22;

function textWidth(s: string, size: number) {
  return s.length * size * 0.56;
}

/** Smooth curve through points (Catmull-Rom as cubic Béziers). */
function smoothPath(pts: { x: number; y: number }[], closed: boolean): string {
  if (pts.length < 2) return "";
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${p[1].x},${p[1].y}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  return closed ? `${d} Z` : d;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Any visual composed from simple parts: frameworks, maps, anatomy, a race. */
export function DiagramCard({ v, reveal }: { v: RDiagram; reveal: number }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const area = diagramArea(v);
  const backdrop = v.backdrop === "none" ? null : BACKDROPS[v.backdrop];

  // The canvas: the backdrop's own box when there is one, else the whole area.
  let canvas: Box = { x: 0, y: 0, w: area.w, h: area.h };
  if (backdrop) {
    const h = Math.min(area.h, area.w / backdrop.aspect);
    const w = h * backdrop.aspect;
    canvas = { x: (area.w - w) / 2, y: (area.h - h) / 2, w, h };
  } else {
    canvas = { x: area.w * 0.03, y: area.h * 0.04, w: area.w * 0.94, h: area.h * 0.92 };
  }
  const X = (x: number) => canvas.x + (x / 100) * canvas.w;
  const Y = (y: number) => canvas.y + (y / 100) * canvas.h;

  const cues = diagramCues(v);
  const shown = v.reveal === "all" ? cues.length : reveal;
  const visible = (cue: string) => !cue || cues.indexOf(cue) < shown;
  let order = 0;
  const appear = (cue: string) => ({
    initial: { opacity: 0, scale: reduce ? 1 : 0.94 },
    animate: visible(cue) ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 },
    transition: { ...SPRING_SOFT, delay: BUILD_DELAY + Math.min(order++, 14) * BUILD_STAGGER },
  });

  // Node boxes in pixels: given size, or fit to the text.
  const nodeBox = (n: DiagramNode): Box => {
    const iconW = n.icon !== "none" ? 40 : 0;
    const autoW = Math.max(textWidth(n.label, LABEL), n.detail ? textWidth(n.detail, DETAIL) : 0) + 40 + iconW;
    const autoH = n.detail ? 88 : 60;
    let w = Math.max(autoW, (n.w / 100) * canvas.w);
    let h = Math.max(autoH, (n.h / 100) * canvas.h);
    if (n.shape === "circle") w = h = Math.max(w, h);
    if (n.shape === "diamond") {
      w *= 1.35;
      h *= 1.35;
    }
    return { x: X(n.x) - w / 2, y: Y(n.y) - h / 2, w, h };
  };
  const boxes = new Map(v.nodes.map((n) => [n.id, nodeBox(n)]));

  // Where a link leaves a node's box toward another point.
  const edge = (b: Box, toward: { x: number; y: number }) => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const dx = toward.x - cx;
    const dy = toward.y - cy;
    const t = Math.min(dx === 0 ? Infinity : b.w / 2 / Math.abs(dx), dy === 0 ? Infinity : b.h / 2 / Math.abs(dy));
    return { x: cx + dx * Math.min(1, t) * 1.0, y: cy + dy * Math.min(1, t) };
  };

  // Body-part labels sit beside the body with a leader line, stacked so they never collide.
  const sideLabels = new Map<string, { x: number; y: number; anchor: "start" | "end" }>();
  if (v.backdrop === "human_body") {
    for (const side of ["left", "right"] as const) {
      const ms = v.markers.filter((m) => (side === "left" ? m.x < 50 : m.x >= 50)).sort((a, b) => a.y - b.y);
      let lastY = -Infinity;
      for (const m of ms) {
        const y = Math.max(Y(m.y), lastY + 40);
        lastY = y;
        sideLabels.set(m.id, side === "left" ? { x: canvas.x - 24, y, anchor: "end" } : { x: canvas.x + canvas.w + 24, y, anchor: "start" });
      }
    }
  }
  // Other marker labels sit beside their marker; when two would collide, the
  // later one moves below or to the other side.
  const placedLabels: Box[] = [];
  const freeLabels = new Map<string, { x: number; y: number; anchor: "start" | "end" }>();
  for (const m of v.markers) {
    if (sideLabels.has(m.id) || !m.label) continue;
    const px = X(m.x);
    const py = Y(m.y);
    const w = textWidth(m.label, 24);
    const tries = [
      { x: px + 24, y: py - 16, anchor: "start" as const },
      { x: px - 24, y: py - 16, anchor: "end" as const },
      { x: px + 24, y: py + 34, anchor: "start" as const },
      { x: px - 24, y: py + 34, anchor: "end" as const },
    ];
    const box = (t: (typeof tries)[number]): Box => ({ x: t.anchor === "start" ? t.x : t.x - w, y: t.y - 22, w, h: 28 });
    const hit = (b: Box) => placedLabels.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const pick = tries.find((t) => !hit(box(t))) ?? tries[0];
    placedLabels.push(box(pick));
    freeLabels.set(m.id, pick);
  }
  const highlightedDetails = new Set(v.markers.filter((m) => visible(m.cue)).map((m) => m.anchor).filter(Boolean));

  const toneOf = (t: DiagramTone) => TONE[t] ?? TONE.neutral;

  return (
    <div className="tpl tpl-diagram">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
        {v.caption && <div className="t-footnote">{v.caption}</div>}
      </div>
      <svg className="tpl-diagram-svg" width={area.w} height={area.h} viewBox={`0 0 ${area.w} ${area.h}`}>
        <defs>
          {(["accent", "highlight", "neutral", "muted"] as const).map((t) => (
            <marker key={t} id={`arrow-${t}-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M1,1 L9,5 L1,9" fill="none" stroke={toneOf(t).solid} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          ))}
        </defs>

        {/* Regions: quadrants, groups, sets */}
        {v.regions.map((r, i) => {
          const t = toneOf(r.tone);
          const b = { x: X(r.x), y: Y(r.y), w: (r.w / 100) * canvas.w, h: (r.h / 100) * canvas.h };
          return (
            <motion.g key={`r${i}`} data-part={`region-${i}`} {...appear(r.cue)} style={{ transformOrigin: `${b.x + b.w / 2}px ${b.y + b.h / 2}px` }}>
              {r.shape === "ellipse" ? (
                <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} fill={t.fill} stroke={t.stroke} strokeWidth={r.tone === "neutral" ? 0 : 2} fillOpacity={0.9} />
              ) : (
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={18} fill={t.fill} stroke={t.stroke} strokeWidth={r.tone === "neutral" ? 0 : 2} />
              )}
              {r.label && (
                <text x={r.shape === "ellipse" ? b.x + b.w / 2 : b.x + 16} y={b.y + 32} textAnchor={r.shape === "ellipse" ? "middle" : "start"} className="dg-region-label">
                  {r.label}
                </text>
              )}
            </motion.g>
          );
        })}

        {/* Backdrop drawing */}
        {backdrop && (
          <g transform={`translate(${canvas.x} ${canvas.y}) scale(${canvas.w / 100} ${canvas.h / 100})`} className={`dg-backdrop is-${backdrop.style}`}>
            {backdrop.outline.map((d, i) =>
              backdrop.style === "track" ? (
                <g key={i}>
                  <path d={d} className="dg-track" vectorEffect="non-scaling-stroke" />
                  <path d={d} className="dg-track-line" vectorEffect="non-scaling-stroke" />
                </g>
              ) : (
                <path key={i} d={d} className="dg-silhouette" vectorEffect="non-scaling-stroke" />
              ),
            )}
            {backdrop.details.map((det) => (
              <path
                key={det.id}
                d={det.d}
                data-part={`part-${det.id}`}
                className={`dg-detail${highlightedDetails.has(det.id) ? " is-on" : ""}`}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}

        {/* Paths: routes, movements, a racing line */}
        {v.paths.map((p) => {
          const t = toneOf(p.tone);
          const pts = p.points.map((q) => ({ x: X(q.x), y: Y(q.y) }));
          const last = pts[pts.length - 1];
          const o = order++;
          return (
            <g key={p.id} data-part={`path-${p.id}`}>
              <motion.path
                d={smoothPath(pts, p.closed)}
                fill="none"
                stroke={t.solid}
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd={p.arrow ? `url(#arrow-${p.tone}-${uid})` : undefined}
                initial={{ pathLength: reduce ? 1 : 0, opacity: 0 }}
                animate={visible(p.cue) ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.8, delay: BUILD_DELAY + o * BUILD_STAGGER, ease: [0.33, 0, 0.2, 1] }}
              />
              {p.label && visible(p.cue) && (
                <motion.text x={last.x + 12} y={last.y - 14} className="dg-label is-halo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                  {p.label}
                </motion.text>
              )}
            </g>
          );
        })}

        {/* Links between nodes */}
        {v.links.map((l, i) => {
          const a = boxes.get(l.from)!;
          const b = boxes.get(l.to)!;
          const t = toneOf(l.tone);
          const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
          const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
          const p1 = edge(a, cb);
          const p2 = edge(b, ca);
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          return (
            <motion.g key={`l${i}`} data-part={`link-${i}`} {...appear(l.cue)}>
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={l.tone === "neutral" ? "var(--label-3)" : t.solid}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={l.style === "dashed" ? "8 10" : undefined}
                markerEnd={l.style === "arrow" ? `url(#arrow-${l.tone}-${uid})` : undefined}
              />
              {l.label && (
                <text x={mid.x} y={mid.y - 10} textAnchor="middle" className="dg-small is-halo">
                  {l.label}
                </text>
              )}
            </motion.g>
          );
        })}

        {/* Nodes */}
        {v.nodes.map((n) => {
          const b = boxes.get(n.id)!;
          const t = toneOf(n.tone);
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          const iconW = n.icon !== "none" ? 40 : 0;
          const textX = cx + iconW / 2;
          return (
            <motion.g key={n.id} data-part={`node-${n.id}`} {...appear(n.cue)} style={{ transformOrigin: `${cx}px ${cy}px` }}>
              {n.shape === "rect" && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={16} fill={t.fill} stroke={t.stroke} strokeWidth={2} />}
              {n.shape === "pill" && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h / 2} fill={t.fill} stroke={t.stroke} strokeWidth={2} />}
              {n.shape === "circle" && <circle cx={cx} cy={cy} r={b.w / 2} fill={t.fill} stroke={t.stroke} strokeWidth={2} />}
              {n.shape === "diamond" && (
                <polygon points={`${cx},${b.y} ${b.x + b.w},${cy} ${cx},${b.y + b.h} ${b.x},${cy}`} fill={t.fill} stroke={t.stroke} strokeWidth={2} strokeLinejoin="round" />
              )}
              {n.icon !== "none" && (
                <SvgIcon name={n.icon} x={textX - textWidth(n.label, LABEL) / 2 - iconW} y={cy - (n.detail ? 30 : 14)} size={28} color={t.solid === "var(--label-2)" ? "var(--accent)" : t.solid} />
              )}
              <text x={textX} y={n.detail ? cy - 6 : cy + 9} textAnchor="middle" className={`dg-node-label${n.shape === "none" ? " is-halo" : ""}`} fill={t.text}>
                {n.label}
              </text>
              {n.detail && (
                <text x={cx} y={cy + 26} textAnchor="middle" className="dg-small">
                  {n.detail}
                </text>
              )}
            </motion.g>
          );
        })}

        {/* Markers: body parts, cars, places */}
        {v.markers.map((m) => {
          const t = toneOf(m.tone === "neutral" ? "accent" : m.tone);
          const px = X(m.x);
          const py = Y(m.y);
          const side = sideLabels.get(m.id);
          return (
            <motion.g key={m.id} data-part={`marker-${m.id}`} {...appear(m.cue)} style={{ transformOrigin: `${px}px ${py}px` }}>
              {side && <polyline points={`${px},${py} ${side.anchor === "end" ? side.x + 12 : side.x - 12},${side.y - 8}`} fill="none" stroke="var(--label-3)" strokeWidth={2} />}
              {m.kind === "car" ? (
                <rect x={px - 18} y={py - 11} width={36} height={22} rx={8} fill={t.solid} stroke="var(--glass-bg-solid)" strokeWidth={3} />
              ) : m.kind === "pin" ? (
                <path d={`M${px},${py} C${px - 16},${py - 20} ${px - 14},${py - 40} ${px},${py - 40} C${px + 14},${py - 40} ${px + 16},${py - 20} ${px},${py} Z`} fill={t.solid} stroke="var(--glass-bg-solid)" strokeWidth={3} />
              ) : (
                <circle cx={px} cy={py} r={11} fill={t.solid} stroke="var(--glass-bg-solid)" strokeWidth={4} />
              )}
              {m.label && (
                <text
                  x={(side ?? freeLabels.get(m.id))?.x ?? px + 24}
                  y={(side ?? freeLabels.get(m.id))?.y ?? py - 16}
                  textAnchor={(side ?? freeLabels.get(m.id))?.anchor ?? "start"}
                  className="dg-label is-halo"
                >
                  {m.label}
                </text>
              )}
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
