import { motion } from "motion/react";
import type { RFunnel } from "../../shared/visuals";
import { BUILD_DELAY, BUILD_STAGGER, SPRING } from "./motion";

/** Steps as bars sized against the first step; the biggest drop-off can be highlighted. */
export function Funnel({ v }: { v: RFunnel }) {
  const pts = v.steps.points;
  const top = Math.max(...pts.map((p) => p.value), 1e-9);
  return (
    <div className="tpl tpl-funnel">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
        {v.subtitle && <div className="t-footnote">{v.subtitle}</div>}
      </div>
      <div className="tpl-funnel-steps">
        {pts.map((p, i) => {
          const hi = i === v.highlightIndex;
          const pct = Math.max(2, (p.value / top) * 100);
          return (
            <div key={i} className={`tpl-funnel-step${hi ? " is-highlight" : ""}`} data-part={`step-${i}`}>
              <div className="tpl-funnel-row">
                <span className="tpl-funnel-label t-body">{p.label}</span>
                {v.drops[i] && <span className="tpl-funnel-drop">{v.drops[i]}</span>}
                <span className="tpl-funnel-value t-body-strong t-num">{p.display}</span>
              </div>
              <div className="tpl-funnel-track">
                <motion.div
                  className="tpl-funnel-bar"
                  initial={{ width: "0%" }}
                  animate={{ width: `${pct}%` }}
                  transition={{ ...SPRING, delay: BUILD_DELAY + i * BUILD_STAGGER }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
