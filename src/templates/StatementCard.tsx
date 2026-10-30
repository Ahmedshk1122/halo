import { motion } from "motion/react";
import type { RStatement } from "../../shared/visuals";
import { BUILD_DELAY, SPRING_SOFT } from "./motion";

/** One short line, for the closing ask. */
export function StatementCard({ v }: { v: RStatement }) {
  return (
    <div className="tpl-statement">
      {v.kicker && (
        <motion.div
          className="tpl-statement-kicker t-body-strong"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_SOFT, delay: BUILD_DELAY }}
        >
          {v.kicker}
        </motion.div>
      )}
      <div className="tpl-statement-text t-display" data-part="statement">
        {v.text}
      </div>
    </div>
  );
}
