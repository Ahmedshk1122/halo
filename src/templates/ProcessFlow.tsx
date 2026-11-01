import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Fragment } from "react";
import { PROCESS_PER_ROW, rowsOf } from "../../shared/layout";
import type { RProcess } from "../../shared/visuals";
import { Icon, ICON_STROKE } from "./icons";
import { SPRING_SOFT } from "./motion";

/** A sequence of steps as tiles joined by chevrons, wrapping onto more rows when long. Steps build in as they are said. */
export function ProcessFlow({ v, reveal }: { v: RProcess; reveal: number }) {
  const shown = v.reveal === "all" ? v.steps.length : reveal;
  const perRow = PROCESS_PER_ROW(v.steps.length);
  return (
    <div className="tpl tpl-process">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
      </div>
      {rowsOf(v.steps, perRow).map((row, r) => (
        <div key={r} className="tpl-process-row">
          {row.map((s, j) => {
            const i = r * perRow + j;
            const visible = i < shown;
            return (
              <Fragment key={i}>
                {j > 0 && (
                  <motion.span className="tpl-process-arrow" initial={false} animate={{ opacity: visible ? 1 : 0 }} transition={{ duration: 0.25 }}>
                    <ChevronRight size={32} strokeWidth={ICON_STROKE} />
                  </motion.span>
                )}
                <motion.div
                  className="tpl-process-step"
                  data-part={`step-${i}`}
                  initial={false}
                  animate={visible ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 12, filter: "blur(6px)" }}
                  transition={SPRING_SOFT}
                >
                  <span className="tpl-icon-tile">
                    <Icon name={s.icon} size={32} />
                  </span>
                  <div className="t-body-strong">{s.label}</div>
                  {s.detail && <div className="t-footnote">{s.detail}</div>}
                </motion.div>
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}
