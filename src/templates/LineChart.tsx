import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { normalizeName } from "../../shared/data";
import type { RLine, ResolvedSeries } from "../../shared/visuals";
import { areaPath, fittingLabels, linePath, niceDomain, scale } from "./chart";
import { BUILD_DELAY } from "./motion";

const W = 568;
const H = 286;
const PLOT = { top: 48, right: 14, bottom: 40, left: 8 };

/** Apple Health / Stocks style line: draws in, direct labels on the data, faint grid. */
export function LineChart({ v }: { v: RLine }) {
  // Separate components, so a chart that gains a metric remounts instead of changing hook order.
  return v.more.length > 0 ? <MultiLineChart v={v} /> : <SingleLineChart v={v} />;
}

function SingleLineChart({ v }: { v: RLine }) {
  const reduce = useReducedMotion();
  const gid = useId().replace(/:/g, "");
  const pts = v.series.points;
  const values = pts.map((p) => p.value);
  const domain = niceDomain(values);
  const y = scale(domain, [H - PLOT.bottom, PLOT.top]);
  const x = scale([0, Math.max(1, pts.length - 1)], [PLOT.left, W - PLOT.right]);
  const xy = pts.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const first = xy[0];
  const last = xy[xy.length - 1];
  const draw = reduce ? 0 : 1.0;
  const grid = [0, 0.5, 1].map((t) => PLOT.top + t * (H - PLOT.top - PLOT.bottom));

  return (
    <div className="tpl tpl-line">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
        {v.subtitle && <div className="t-footnote">{v.subtitle}</div>}
      </div>
      <svg className="tpl-chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id={`la-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid.map((gy, i) => (
          <line key={i} x1={0} x2={W} y1={gy} y2={gy} stroke="var(--grid)" strokeWidth={1.5} strokeDasharray={i === 2 ? undefined : "2 8"} strokeLinecap="round" />
        ))}
        <motion.path
          d={areaPath(xy, H - PLOT.bottom)}
          fill={`url(#la-${gid})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: BUILD_DELAY + draw * 0.7 }}
        />
        <motion.path
          d={linePath(xy)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: draw, delay: BUILD_DELAY, ease: [0.33, 0, 0.2, 1] }}
        />
        {/* Points are targetable for pointing. */}
        {xy.map((p, i) => (
          <circle key={i} data-part={`point-${i}`} cx={p.x} cy={p.y} r={14} fill="transparent" />
        ))}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: BUILD_DELAY + draw * 0.4 }}>
          <circle cx={first.x} cy={first.y} r={6} fill="var(--glass-bg-solid, white)" stroke="var(--accent)" strokeWidth={4} />
          <text x={first.x + 2} y={first.y - 22} className="svg-label" textAnchor="start">
            {pts[0].display}
          </text>
        </motion.g>
        <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 30, delay: BUILD_DELAY + draw }}>
          <circle cx={last.x} cy={last.y} r={9} fill="var(--accent)" stroke="var(--glass-bg-solid, white)" strokeWidth={4} />
          <text x={last.x} y={last.y - 24} className="svg-value" textAnchor="end">
            {pts[pts.length - 1].display}
          </text>
        </motion.g>
        {fittingLabels(pts.map((p) => p.label), x).map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            className="svg-axis"
            textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}
          >
            {pts[i].label}
          </text>
        ))}
      </svg>
    </div>
  );
}

const LABEL_W = 170;
/** Main line in the accent; added metrics in neutral tones, solid then dashed (one accent per visual). */
const EXTRA_STROKES = [
  { color: "var(--label-2)", dash: undefined },
  { color: "var(--label-3)", dash: "10 10" },
  { color: "var(--label-2)", dash: "2 10" },
  { color: "var(--label-3)", dash: undefined },
];

/**
 * Several metrics over the same periods. The x axis comes from the main line;
 * other lines line up by label, else by position. Lines share a y scale when
 * they are the same kind of number at a similar size, else each gets its own,
 * and every line carries its name and latest value at its end.
 */
function MultiLineChart({ v }: { v: RLine }) {
  const reduce = useReducedMotion();
  const labels = v.series.points.map((p) => p.label);
  const n = labels.length;
  const lines = [{ name: v.name, series: v.series }, ...v.more].map((l, li) => ({ ...l, idx: li, pts: align(l.series, labels) }));
  const all = lines.flatMap((l) => l.pts.filter((p) => p !== null).map((p) => p!.value));
  const maxes = lines.map((l) => Math.max(...l.pts.filter((p) => p !== null).map((p) => Math.abs(p!.value)), 1e-9));
  const shared = lines.every((l) => l.series.kind === v.series.kind) && Math.max(...maxes) / Math.min(...maxes) <= 5;
  const right = W - LABEL_W;
  const x = scale([0, Math.max(1, n - 1)], [PLOT.left, right]);
  const yFor = (vals: number[]) => scale(niceDomain(vals), [H - PLOT.bottom, PLOT.top]);
  const sharedY = yFor(all);
  const draw = reduce ? 0 : 1.0;
  const grid = [0, 0.5, 1].map((t) => PLOT.top + t * (H - PLOT.top - PLOT.bottom));

  const drawn = lines.map((l) => {
    const y = shared ? sharedY : yFor(l.pts.filter((p) => p !== null).map((p) => p!.value));
    const xy = l.pts.flatMap((p, i) => (p ? [{ x: x(i), y: y(p.value), p }] : []));
    return { ...l, xy };
  });
  // End labels: name and latest value beside each line's last point, nudged apart so they never overlap.
  const ends = drawn
    .filter((l) => l.xy.length > 0)
    .map((l) => ({ idx: l.idx, name: l.name, value: l.xy[l.xy.length - 1].p.display, y: l.xy[l.xy.length - 1].y }))
    .sort((a, b) => a.y - b.y);
  const GAP = 58;
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + GAP);
  const overflow = ends.length ? ends[ends.length - 1].y - (H - PLOT.bottom) : 0;
  if (overflow > 0) for (const e of ends) e.y -= overflow;

  return (
    <div className="tpl tpl-line">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
        {v.subtitle && <div className="t-footnote">{v.subtitle}</div>}
      </div>
      <svg className="tpl-chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {grid.map((gy, i) => (
          <line key={i} x1={0} x2={right} y1={gy} y2={gy} stroke="var(--grid)" strokeWidth={1.5} strokeDasharray={i === 2 ? undefined : "2 8"} strokeLinecap="round" />
        ))}
        {drawn
          .slice()
          .reverse()
          .map((l) => {
            const stroke = l.idx === 0 ? { color: "var(--accent)", dash: undefined } : EXTRA_STROKES[(l.idx - 1) % EXTRA_STROKES.length];
            const last = l.xy[l.xy.length - 1];
            return (
              <g key={l.idx} data-part={`line-${l.idx}`}>
                <motion.path
                  d={linePath(l.xy)}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={l.idx === 0 ? 5 : 4}
                  strokeDasharray={stroke.dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: reduce ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: draw, delay: BUILD_DELAY + l.idx * 0.15, ease: [0.33, 0, 0.2, 1] }}
                />
                {last && (
                  <motion.circle
                    cx={last.x}
                    cy={last.y}
                    r={l.idx === 0 ? 8 : 6}
                    fill={stroke.color}
                    stroke="var(--glass-bg-solid, white)"
                    strokeWidth={3}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: BUILD_DELAY + draw + l.idx * 0.15 }}
                  />
                )}
              </g>
            );
          })}
        {ends.map((e) => (
          <motion.g
            key={e.idx}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30, delay: BUILD_DELAY + draw + e.idx * 0.15 }}
          >
            <text x={right + 18} y={e.y - 4} className="svg-label" textAnchor="start" style={e.idx === 0 ? { fill: "var(--accent-text)" } : undefined}>
              {e.name}
            </text>
            <text x={right + 18} y={e.y + 26} className="svg-value" textAnchor="start" style={e.idx === 0 ? undefined : { fill: "var(--label)" }}>
              {e.value}
            </text>
          </motion.g>
        ))}
        {fittingLabels(labels, x).map((i) => (
          <text key={i} x={x(i)} y={H - 6} className="svg-axis" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            {labels[i]}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Points of a series at the main line's labels: by label when they match, else by position. */
function align(series: ResolvedSeries, labels: string[]) {
  const byLabel = new Map(series.points.map((p) => [normalizeName(p.label), p]));
  const matched = labels.filter((l) => byLabel.has(normalizeName(l))).length;
  if (matched >= Math.min(2, series.points.length)) return labels.map((l) => byLabel.get(normalizeName(l)) ?? null);
  return labels.map((_, i) => series.points[i] ?? null);
}
