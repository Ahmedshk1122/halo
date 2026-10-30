// Visual specs. A spec is what the director (or planner) produces: JSON with
// data references instead of numbers. The app resolves references against the
// loaded data and produces a ResolvedVisual, which is the only thing templates
// ever render. Templates never see a typed number.

export const TEMPLATE_IDS = [
  "metric",
  "line",
  "bar",
  "funnel",
  "comparison",
  "strategy",
  "roadmap",
  "process",
  "ui_sketch",
  "statement",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  metric: "Metric card",
  line: "Line chart",
  bar: "Bar chart",
  funnel: "Funnel",
  comparison: "Comparison",
  strategy: "Strategy card",
  roadmap: "Roadmap",
  process: "Process flow",
  ui_sketch: "UI sketch",
  statement: "Statement",
};

/** Lucide icons the director may pick from. Kept short so the model chooses well. */
export const ICON_NAMES = [
  "layout-template",
  "download",
  "user-plus",
  "users",
  "rocket",
  "target",
  "zap",
  "sparkles",
  "layers",
  "puzzle",
  "compass",
  "gauge",
  "trending-up",
  "shield",
  "lock",
  "clock",
  "calendar",
  "check",
  "lightbulb",
  "message-circle",
  "mail",
  "file-text",
  "refresh-cw",
  "search",
  "settings",
  "heart",
  "flag",
  "globe",
  "plug",
  "wand",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

// ---------------------------------------------------------------------------
// Data references
// ---------------------------------------------------------------------------

export type RowPick = "first" | "last" | "max" | "min" | "match" | "none";

/** One cell: a table, a column, and which row. */
export interface ScalarRef {
  table: string;
  column: string;
  /** "none" means the reference is intentionally empty. */
  pick: RowPick;
  /** Used when pick is "match": the row where match_column equals match_value. */
  match_column: string;
  match_value: string;
}

/** A column over rows, in file order: x labels and y values. */
export interface SeriesRef {
  /** Empty string means no series. */
  table: string;
  x: string;
  y: string;
  /** Optional row filter. Empty strings mean no filter. */
  filter_column: string;
  filter_value: string;
}

export type RevealMode = "progressive" | "all";

// ---------------------------------------------------------------------------
// Specs (director output)
// ---------------------------------------------------------------------------

interface SpecBase {
  /** Short label, also used for the tucked chip. Sentence case, no numbers. */
  title: string;
  /** Extra words a presenter might use to ask for this visual again ("funnel", "drop-off"). */
  aliases: string[];
}

export interface MetricSpec extends SpecBase {
  template: "metric";
  caption: string;
  value: ScalarRef;
  /** Earlier value to compute the delta from. pick "none" for no delta. */
  baseline: ScalarRef;
  /** Sparkline. Empty table for none. */
  trend: SeriesRef;
}

export interface LineSpec extends SpecBase {
  template: "line";
  subtitle: string;
  series: SeriesRef;
}

export interface BarSpec extends SpecBase {
  template: "bar";
  subtitle: string;
  series: SeriesRef;
  /** x label of the bar to emphasize, or empty. */
  highlight_label: string;
}

export interface FunnelSpec extends SpecBase {
  template: "funnel";
  subtitle: string;
  steps: SeriesRef;
  /** Step label to emphasize (usually the biggest drop-off), or empty. */
  highlight_step: string;
}

export interface ComparisonSide {
  label: string;
  /** Optional number for this side. pick "none" for a qualitative comparison. */
  value: ScalarRef;
  points: string[];
}

export interface ComparisonSpec extends SpecBase {
  template: "comparison";
  a: ComparisonSide;
  b: ComparisonSide;
  /** Which side the speaker is arguing for. */
  favor: "a" | "b" | "none";
}

export interface StrategyPoint {
  icon: IconName;
  text: string;
  detail: string;
  /** A few words the speaker will say when making this point. Drives the reveal. */
  cue: string;
}

export interface StrategySpec extends SpecBase {
  template: "strategy";
  reveal: RevealMode;
  points: StrategyPoint[];
}

export interface RoadmapItem {
  /** Month, quarter or year: "November", "Q1". */
  when: string;
  label: string;
  detail: string;
  cue: string;
}

export interface RoadmapSpec extends SpecBase {
  template: "roadmap";
  reveal: RevealMode;
  items: RoadmapItem[];
}

export interface ProcessStep {
  icon: IconName;
  label: string;
  detail: string;
  cue: string;
}

export interface ProcessSpec extends SpecBase {
  template: "process";
  reveal: RevealMode;
  steps: ProcessStep[];
}

export const UI_BLOCK_KINDS = ["grid", "list", "form", "button", "text", "search"] as const;
export type UIBlockKind = (typeof UI_BLOCK_KINDS)[number];

export interface UIBlock {
  kind: UIBlockKind;
  /** Section label (grid/list/form), button text, or the text line. */
  label: string;
  /** Card titles (grid), rows (list), field labels (form). */
  items: string[];
  /** Emphasize this block with the highlight color. */
  highlight: boolean;
}

export interface UISketchSpec extends SpecBase {
  template: "ui_sketch";
  caption: string;
  window_title: string;
  /** Sidebar navigation labels. Empty for no sidebar. */
  sidebar: string[];
  heading: string;
  blocks: UIBlock[];
}

export interface StatementSpec extends SpecBase {
  template: "statement";
  kicker: string;
  text: string;
}

export type VisualSpec =
  | MetricSpec
  | LineSpec
  | BarSpec
  | FunnelSpec
  | ComparisonSpec
  | StrategySpec
  | RoadmapSpec
  | ProcessSpec
  | UISketchSpec
  | StatementSpec;

// ---------------------------------------------------------------------------
// Resolved visuals (what templates render)
// ---------------------------------------------------------------------------

export type ColumnKind = "number" | "percent" | "currency" | "date" | "text";

export interface ResolvedValue {
  value: number;
  display: string;
  kind: ColumnKind;
  /** Label of the row this value came from ("W13", "Set up workspace"). */
  rowLabel: string;
  table: string;
  column: string;
}

export interface ResolvedPoint {
  label: string;
  value: number;
  display: string;
}

export interface ResolvedSeries {
  points: ResolvedPoint[];
  kind: ColumnKind;
  table: string;
  xColumn: string;
  yColumn: string;
}

export type Accent = "blue" | "green" | "red";

export interface ResolvedDelta {
  display: string;
  direction: "up" | "down" | "flat";
  since: string;
}

export interface RMetric {
  template: "metric";
  title: string;
  caption: string;
  value: ResolvedValue;
  delta: ResolvedDelta | null;
  trend: ResolvedSeries | null;
  accent: Accent;
}

export interface RLine {
  template: "line";
  title: string;
  subtitle: string;
  series: ResolvedSeries;
  accent: Accent;
}

export interface RBar {
  template: "bar";
  title: string;
  subtitle: string;
  series: ResolvedSeries;
  highlightIndex: number;
  accent: Accent;
}

export interface RFunnel {
  template: "funnel";
  title: string;
  subtitle: string;
  steps: ResolvedSeries;
  highlightIndex: number;
  /** Drop from the previous step, per step (first is null). Computed from data. */
  drops: (string | null)[];
  accent: Accent;
}

export interface RComparisonSide {
  label: string;
  value: ResolvedValue | null;
  points: string[];
}

export interface RComparison {
  template: "comparison";
  title: string;
  a: RComparisonSide;
  b: RComparisonSide;
  favor: "a" | "b" | "none";
  accent: Accent;
}

export interface RStrategy {
  template: "strategy";
  title: string;
  reveal: RevealMode;
  points: StrategyPoint[];
  accent: Accent;
}

export interface RRoadmap {
  template: "roadmap";
  title: string;
  reveal: RevealMode;
  items: RoadmapItem[];
  accent: Accent;
}

export interface RProcess {
  template: "process";
  title: string;
  reveal: RevealMode;
  steps: ProcessStep[];
  accent: Accent;
}

export interface RUISketch {
  template: "ui_sketch";
  title: string;
  caption: string;
  window_title: string;
  sidebar: string[];
  heading: string;
  blocks: UIBlock[];
  accent: Accent;
}

export interface RStatement {
  template: "statement";
  title: string;
  kicker: string;
  text: string;
  accent: Accent;
}

export type ResolvedVisual =
  | RMetric
  | RLine
  | RBar
  | RFunnel
  | RComparison
  | RStrategy
  | RRoadmap
  | RProcess
  | RUISketch
  | RStatement;

/** Number of items a template reveals progressively (0 if it doesn't). */
export function revealCount(v: ResolvedVisual): number {
  switch (v.template) {
    case "strategy":
      return v.reveal === "progressive" ? v.points.length : 0;
    case "roadmap":
      return v.reveal === "progressive" ? v.items.length : 0;
    case "process":
      return v.reveal === "progressive" ? v.steps.length : 0;
    default:
      return 0;
  }
}

/** Cue phrases for progressive templates, in reveal order. */
export function revealCues(v: ResolvedVisual): string[] {
  switch (v.template) {
    case "strategy":
      return v.points.map((p) => p.cue);
    case "roadmap":
      return v.items.map((p) => p.cue);
    case "process":
      return v.steps.map((p) => p.cue);
    default:
      return [];
  }
}
