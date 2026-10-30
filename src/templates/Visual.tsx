import type { ResolvedVisual } from "../../shared/visuals";
import { StatementCard } from "./StatementCard";

export interface TemplateContext {
  /** Progressive items revealed so far. */
  reveal: number;
  expanded: boolean;
}

/** Renders the content of a visual. The glass container is drawn by VisualFrame. */
export function VisualContent({ v }: { v: ResolvedVisual; ctx: TemplateContext }) {
  switch (v.template) {
    case "statement":
      return <StatementCard v={v} />;
    default:
      return null;
  }
}
