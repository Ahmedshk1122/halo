import type { ResolvedVisual } from "../../shared/visuals";
import { Funnel } from "./Funnel";
import { LineChart } from "./LineChart";
import { MetricCard } from "./MetricCard";
import { StatementCard } from "./StatementCard";
import { StrategyCard } from "./StrategyCard";

export interface TemplateContext {
  /** Progressive items revealed so far. */
  reveal: number;
  expanded: boolean;
}

/** Renders the content of a visual. The glass container is drawn by VisualFrame. */
export function VisualContent({ v, ctx }: { v: ResolvedVisual; ctx: TemplateContext }) {
  switch (v.template) {
    case "metric":
      return <MetricCard v={v} />;
    case "line":
      return <LineChart v={v} />;
    case "funnel":
      return <Funnel v={v} />;
    case "strategy":
      return <StrategyCard v={v} reveal={ctx.reveal} />;
    case "statement":
      return <StatementCard v={v} />;
    default:
      return null;
  }
}
