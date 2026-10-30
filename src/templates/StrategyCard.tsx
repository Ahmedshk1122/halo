import { motion } from "motion/react";
import type { RStrategy } from "../../shared/visuals";
import { Icon } from "./icons";
import { SPRING_SOFT } from "./motion";

/** A title and two to four points, each with an icon. Points can build in as they are said. */
export function StrategyCard({ v, reveal }: { v: RStrategy; reveal: number }) {
  const shown = v.reveal === "all" ? v.points.length : reveal;
  return (
    <div className="tpl tpl-strategy">
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
                <Icon name={p.icon} size={36} />
              </span>
              <span className="tpl-strategy-text">
                <span className="t-body-strong">{p.text}</span>
                {p.detail && <span className="t-footnote">{p.detail}</span>}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
