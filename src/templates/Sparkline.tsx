import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import type { ResolvedSeries } from "../../shared/visuals";
import { areaPath, linePath, scale } from "./chart";
import { BUILD_DELAY } from "./motion";

/** Line that draws in, with a soft area fill and a dot on the latest value. */
export function TrendLine({
  series,
  width,
  height,
  stroke = 5,
  endDot = true,
  inset = { top: 10, right: 12, bottom: 10, left: 6 },
  delay = BUILD_DELAY,
}: {
  series: ResolvedSeries;
  width: number;
  height: number;
  stroke?: number;
  endDot?: boolean;
  inset?: { top: number; right: number; bottom: number; left: number };
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const gid = useId().replace(/:/g, "");
  const values = series.points.map((p) => p.value);
  // Sparklines use the tight range so the shape reads at a glance.
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const y = scale(lo === hi ? [lo - 1, hi + 1] : [lo, hi], [height - inset.bottom, inset.top]);
  const x = scale([0, Math.max(1, values.length - 1)], [inset.left, width - inset.right]);
  const pts = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const last = pts[pts.length - 1];
  const draw = reduce ? 0 : 0.9;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.26} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <motion.path
        d={areaPath(pts, height)}
        fill={`url(#area-${gid})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: delay + draw * 0.6 }}
      />
      <motion.path
        d={linePath(pts)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: draw, delay, ease: [0.33, 0, 0.2, 1] }}
      />
      {endDot && last && (
        <motion.circle
          cx={last.x}
          cy={last.y}
          r={stroke * 1.6}
          fill="var(--accent)"
          stroke="var(--glass-dot-ring, white)"
          strokeWidth={stroke * 0.9}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 30, delay: delay + draw }}
          style={{ transformOrigin: `${last.x}px ${last.y}px` }}
        />
      )}
    </svg>
  );
}
