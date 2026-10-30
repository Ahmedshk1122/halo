import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import type { RLine } from "../../shared/visuals";
import { areaPath, labelIndices, linePath, niceDomain, scale } from "./chart";
import { BUILD_DELAY } from "./motion";

const W = 568;
const H = 286;
const PLOT = { top: 48, right: 14, bottom: 40, left: 8 };

/** Apple Health / Stocks style line: draws in, direct labels on the data, faint grid. */
export function LineChart({ v }: { v: RLine }) {
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
        {labelIndices(pts.length, 4).map((i) => (
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
