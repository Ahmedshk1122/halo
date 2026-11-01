import { motion } from "motion/react";
import { strategyLayout } from "../../shared/layout";
import type { RStrategy } from "../../shared/visuals";
import { Icon } from "./icons";
import { SPRING_SOFT } from "./motion";

/** A title and any number of points, each with an icon. Points build in as they are said; long lists go compact, then two columns. */
export function StrategyCard({ v, reveal }: { v: RStrategy; reveal: number }) {
  const shown = v.reveal === "all" ? v.points.length : reveal;
  const layout = strategyLayout(v.points.length);
  return (
    <div
      className={`tpl tpl-strategy${layout.compact ? " is-compact" : ""}${layout.columns === 2 ? " is-cols-2" : ""}`}
      style={{ ["--rows" as string]: layout.rows }}
    >
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
      </div>
      <ol className="tpl-strategy-points">
        {v.points.map((p, i) => {
          const visible = i < shown;
          return (
            <motion.li
              key={i}
              className="tpl-strategy-point"
              data-part={`point-${i}`}
              initial={false}
              animate={visible ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 14, filter: "blur(6px)" }}
              transition={SPRING_SOFT}
              aria-hidden={!visible}
            >
              <span className="tpl-icon-tile">
                <Icon name={p.icon} size={layout.compact ? 28 : 36} />
              </span>
              <span className="tpl-strategy-text">
                <span className="t-body-strong">{p.text}</span>
                {p.detail && !layout.compact && <span className="t-footnote">{p.detail}</span>}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
