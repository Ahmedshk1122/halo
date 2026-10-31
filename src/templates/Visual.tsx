import type { ResolvedVisual } from "../../shared/visuals";
import { BarChart } from "./BarChart";
import { Comparison } from "./Comparison";
import { Funnel } from "./Funnel";
import { GoalCard } from "./GoalCard";
import { LineChart } from "./LineChart";
import { MetricCard } from "./MetricCard";
import { StatementCard } from "./StatementCard";
import { ProcessFlow } from "./ProcessFlow";
import { Roadmap } from "./Roadmap";
import { StrategyCard } from "./StrategyCard";
import { UISketch } from "./UISketch";

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
    case "bar":
      return <BarChart v={v} />;
    case "comparison":
      return <Comparison v={v} />;
    case "roadmap":
      return <Roadmap v={v} reveal={ctx.reveal} />;
    case "process":
      return <ProcessFlow v={v} reveal={ctx.reveal} />;
    case "ui_sketch":
      return <UISketch v={v} />;
    case "statement":
      return <StatementCard v={v} />;
    case "goal":
      return <GoalCard v={v} />;
  }
}
