import { motion } from "motion/react";
import type { RRoadmap } from "../../shared/visuals";
import { SPRING, SPRING_SOFT } from "./motion";

/** Milestones on a timeline. The line draws on to each milestone as it is revealed. */
export function Roadmap({ v, reveal }: { v: RRoadmap; reveal: number }) {
  const n = v.items.length;
  const shown = v.reveal === "all" ? n : Math.min(n, reveal);
  // Line runs from the first node to the last revealed node.
  const progress = n <= 1 ? (shown > 0 ? 1 : 0) : shown <= 1 ? 0 : (shown - 1) / (n - 1);
  return (
    <div className="tpl tpl-roadmap">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
      </div>
      <div className="tpl-roadmap-track" style={{ ["--cols" as string]: n }}>
        <div className="tpl-roadmap-rail">
          <motion.div
            className="tpl-roadmap-rail-fill"
            initial={false}
            animate={{ scaleX: progress }}
            transition={{ ...SPRING, stiffness: 120 }}
          />
        </div>
        {v.items.map((item, i) => {
          const visible = i < shown;
          return (
            <div key={i} className="tpl-roadmap-item" data-part={`item-${i}`}>
              <motion.div
                className="tpl-roadmap-when"
                initial={false}
                animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                transition={SPRING_SOFT}
              >
                {item.when}
              </motion.div>
              <motion.div
                className="tpl-roadmap-node"
                initial={false}
                animate={visible ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
                transition={SPRING}
              />
              <motion.div
                className="tpl-roadmap-text"
                initial={false}
                animate={visible ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 10, filter: "blur(6px)" }}
                transition={SPRING_SOFT}
              >
                <div className="t-body-strong">{item.label}</div>
                {item.detail && <div className="t-footnote">{item.detail}</div>}
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
