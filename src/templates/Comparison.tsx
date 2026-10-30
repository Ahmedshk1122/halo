import { Check, Minus } from "lucide-react";
import { motion } from "motion/react";
import type { RComparison, RComparisonSide } from "../../shared/visuals";
import { ICON_STROKE } from "./icons";
import { BUILD_DELAY, BUILD_STAGGER, SPRING_SOFT } from "./motion";

/** Two options side by side, in nested panes. The side being argued for carries the accent. */
export function Comparison({ v }: { v: RComparison }) {
  return (
    <div className="tpl-comparison">
      <div className="tpl-comparison-head t-title">{v.title}</div>
      <div className="tpl-comparison-panes">
        <Pane side={v.a} favored={v.favor === "a"} part="a" index={0} />
        <Pane side={v.b} favored={v.favor === "b"} part="b" index={1} />
      </div>
    </div>
  );
}

function Pane({ side, favored, part, index }: { side: RComparisonSide; favored: boolean; part: string; index: number }) {
  const Bullet = favored ? Check : Minus;
  return (
    <motion.section
      className={`tpl-comparison-pane${favored ? " is-favored" : ""}`}
      data-part={`side-${part}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_SOFT, delay: BUILD_DELAY + index * 0.1 }}
    >
      <div className="t-body-strong">{side.label}</div>
      {side.value && (
        <div className="tpl-comparison-value">
          <span className="t-hero tpl-hero-sm">{side.value.display}</span>
          {side.value.rowLabel && <span className="t-footnote">{side.value.rowLabel}</span>}
        </div>
      )}
      <ul className="tpl-comparison-points">
        {side.points.map((p, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: BUILD_DELAY + 0.15 + i * BUILD_STAGGER }}
          >
            <Bullet size={26} strokeWidth={ICON_STROKE + 0.5} aria-hidden />
            <span className="t-body">{p}</span>
          </motion.li>
        ))}
      </ul>
    </motion.section>
  );
}
