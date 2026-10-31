import { motion } from "motion/react";
import type { RGoal } from "../../shared/visuals";
import { BUILD_DELAY, SPRING } from "./motion";

/**
 * Where things are and where they're going: two bars in true proportion.
 * The bars fill the card's height, so when the presenter raises their hand
 * and the card grows, the chart grows with it.
 */
export function GoalCard({ v }: { v: RGoal }) {
  const top = Math.max(Math.abs(v.from.value), Math.abs(v.to.value), 1e-9);
  const bars = [
    { key: "from", value: v.from, label: v.fromLabel, pct: Math.abs(v.from.value) / top, target: false },
    { key: "to", value: v.to, label: v.toLabel, pct: Math.abs(v.to.value) / top, target: true },
  ];
  return (
    <div className="tpl tpl-goal">
      <div className="tpl-goal-head">
        <div className="t-title">{v.title}</div>
        <span className="tpl-goal-change" data-part="change">
          {v.change.display}
        </span>
      </div>
      <div className="tpl-goal-chart">
        {bars.map((b, i) => (
          <div key={b.key} className={`tpl-goal-col${b.target ? " is-target" : ""}`} data-part={b.key}>
            <div className="tpl-goal-track">
              {/* Bars use the lower 78% so the value can sit on top of the tallest one. */}
              <motion.div
                className="tpl-goal-bar"
                initial={{ height: "0%" }}
                animate={{ height: `${Math.max(3, b.pct * 78)}%` }}
                transition={{ ...SPRING, delay: BUILD_DELAY + i * 0.08 }}
              />
              <motion.div
                className="tpl-goal-value t-num"
                initial={{ bottom: "0%", opacity: 0 }}
                animate={{ bottom: `${Math.max(3, b.pct * 78)}%`, opacity: 1 }}
                transition={{ ...SPRING, delay: BUILD_DELAY + i * 0.08 }}
              >
                {b.value.display}
              </motion.div>
            </div>
            <div className="tpl-goal-label t-footnote">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
