import { motion } from "motion/react";
import { ROADMAP_PER_ROW, rowsOf } from "../../shared/layout";
import type { RRoadmap } from "../../shared/visuals";
import { SPRING, SPRING_SOFT } from "./motion";

/** Milestones on a timeline, wrapping onto more tracks when long. The line draws on to each milestone as it is revealed. */
export function Roadmap({ v, reveal }: { v: RRoadmap; reveal: number }) {
  const n = v.items.length;
  const shown = v.reveal === "all" ? n : Math.min(n, reveal);
  const perRow = ROADMAP_PER_ROW(n);
  return (
    <div className="tpl tpl-roadmap">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
      </div>
      {rowsOf(v.items, perRow).map((track, r) => {
        const start = r * perRow;
        const inTrack = Math.max(0, Math.min(track.length, shown - start));
        // Line runs from the first node of the track to its last revealed node.
        const progress = track.length <= 1 ? (inTrack > 0 ? 1 : 0) : inTrack <= 1 ? 0 : (inTrack - 1) / (track.length - 1);
        return (
          <div key={r} className="tpl-roadmap-track" style={{ ["--cols" as string]: perRow }}>
            <div className="tpl-roadmap-rail" style={{ right: `calc(100% - ${track.length} * 100% / ${perRow} + 100% / ${perRow} - 11px)` }}>
              <motion.div className="tpl-roadmap-rail-fill" initial={false} animate={{ scaleX: progress }} transition={{ ...SPRING, stiffness: 120 }} />
            </div>
            {track.map((item, j) => {
              const i = start + j;
              const visible = i < shown;
              return (
                <div key={i} className="tpl-roadmap-item" data-part={`item-${i}`}>
                  <motion.div className="tpl-roadmap-when" initial={false} animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }} transition={SPRING_SOFT}>
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
        );
      })}
    </div>
  );
}
