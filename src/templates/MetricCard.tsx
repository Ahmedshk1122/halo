import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { RMetric } from "../../shared/visuals";
import { ICON_STROKE } from "./icons";
import { TrendLine } from "./Sparkline";

/** One KPI: the hero number, its delta, and a sparkline. */
export function MetricCard({ v }: { v: RMetric }) {
  const Arrow = v.delta?.direction === "up" ? ArrowUpRight : v.delta?.direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <div className="tpl tpl-metric">
      <div className="tpl-head">
        <div className="t-title">{v.title}</div>
        {v.caption && <div className="t-footnote">{v.caption}</div>}
      </div>
      <div className="tpl-metric-hero t-hero" data-part="value">
        {v.value.display}
      </div>
      {v.delta && (
        <div className="tpl-metric-delta" data-part="delta">
          <span className="tpl-metric-delta-value">
            <Arrow size={30} strokeWidth={ICON_STROKE + 0.5} aria-hidden />
            {v.delta.display}
          </span>
          {v.delta.since && <span className="t-secondary">since {v.delta.since}</span>}
        </div>
      )}
      {v.trend && (
        <div className="tpl-metric-spark" data-part="trend">
          <TrendLine series={v.trend} width={488} height={88} stroke={4.5} />
        </div>
      )}
    </div>
  );
}
