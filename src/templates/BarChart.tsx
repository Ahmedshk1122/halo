import { motion, useReducedMotion } from "motion/react";
import type { RBar } from "../../shared/visuals";
import { barPath, niceDomain, scale } from "./chart";
import { BUILD_DELAY, BUILD_STAGGER, SPRING } from "./motion";

const W = 568;
const H = 286;
const LABELS = 58; // two lines of 22px labels under the bars
const TOP = 40; // room for value labels above the tallest bar

function wrap(label: string, max = 14): string[] {
  if (label.length <= max) return [label];
  const words = label.split(" ");
  const lines: string[] = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur && (cur + " " + w).length > max && lines.length < 2) lines.push(w);
    else lines[lines.length - 1] = cur ? `${cur} ${w}` : w;
  }
  return lines;
}

/** Apple Health style bars: rounded caps, values on the bars, no axis, faint baseline. */
export function BarChart({ v }: { v: RBar }) {
  const reduce = useReducedMotion();
  const pts = v.series.points;
  const values = pts.map((p) => p.value);
  const [, hi] = niceDomain(values, { zero: true });
  const base = H - LABELS;
  const y = scale([0, hi], [base, TOP]);
  const slot = W / pts.length;
  const bw = Math.min(72, slot * 0.56);

  return (
    <div className="tpl tpl-bar">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
        {v.subtitle && <div className="t-footnote">{v.subtitle}</div>}
      </div>
      <svg className="tpl-chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <line x1={0} x2={W} y1={base + 0.75} y2={base + 0.75} stroke="var(--grid)" strokeWidth={1.5} />
        {pts.map((p, i) => {
          const x = slot * i + (slot - bw) / 2;
          const h = Math.max(4, base - y(p.value));
          const hl = i === v.highlightIndex;
          const delay = BUILD_DELAY + i * BUILD_STAGGER;
          return (
            <g key={i} data-part={`bar-${i}`}>
              <motion.path
                fill={hl ? "var(--orange)" : "var(--accent)"}
                initial={{ d: barPath(x, bw, base, reduce ? h : 0.5, bw / 2) }}
                animate={{ d: barPath(x, bw, base, h, bw / 2) }}
                transition={{ ...SPRING, delay }}
              />
              <motion.text
                x={x + bw / 2}
                y={base - h - 12}
                textAnchor="middle"
                className="svg-bar-value"
                fill={hl ? "var(--orange-text)" : "var(--label)"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: delay + 0.25 }}
              >
                {p.display}
              </motion.text>
              {wrap(p.label).map((line, li) => (
                <text key={li} x={x + bw / 2} y={base + 30 + li * 26} textAnchor="middle" className="svg-axis is-strong">
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
