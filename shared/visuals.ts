// Visual specs. A spec is what the director (or planner) produces: JSON with
// data references instead of numbers. The app resolves references against the
// loaded data and produces a ResolvedVisual, which is the only thing templates
// ever render. Templates never see a typed number.

import { drawingCues, type DrawAspect, type DrawElement } from "./drawing";

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
  "goal",
  "diagram",
  "drawing",
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
  goal: "From → to",
  diagram: "Diagram",
  drawing: "Drawing",
};

/** Icons bundled with the app (instant). Any other Lucide icon name also works; it loads on first use. */
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
/** Any Lucide icon name, kebab-case (e.g. "trees", "cable-car"). Unknown names fall back to sparkles. */
export type IconName = string;

// ---------------------------------------------------------------------------
// Data references
// ---------------------------------------------------------------------------

export type RowPick = "first" | "last" | "max" | "min" | "match" | "none" | "said";
export type SaidUnit = "number" | "percent" | "currency";

/**
 * One value: a cell from a loaded table, or (pick "said") a number the presenter
 * said out loud. Said values are checked against the transcript before use.
 */
export interface ScalarRef {
  table: string;
  column: string;
  /** "none" means the reference is intentionally empty. "said" uses said_value. */
  pick: RowPick;
  /** Used when pick is "match": the row where match_column equals match_value. */
  match_column: string;
  match_value: string;
  said_value?: number;
  said_unit?: SaidUnit;
  /** "$", "€", "£", "₹", "Rs" or empty. */
  said_currency?: string;
  /** What the said value is ("Revenue today"). */
  said_label?: string;
}

export interface SaidPoint {
  label: string;
  value: number;
}

/** A column over rows, in file order: x labels and y values. Table "said" uses said_points. */
export interface SeriesRef {
  /** Empty string means no series. "said" means values the presenter said. */
  table: string;
  x: string;
  y: string;
  /** Optional row filter. Empty strings mean no filter. */
  filter_column: string;
  filter_value: string;
  said_points?: SaidPoint[];
  said_unit?: SaidUnit;
  said_currency?: string;
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
  /** card: on frosted glass. float: straight on the video, no card. Settings can override. */
  style?: "card" | "float";
}

export interface MetricSpec extends SpecBase {
  template: "metric";
  caption: string;
  value: ScalarRef;
  /** Earlier value to compute the delta from. pick "none" for no delta. */
  baseline: ScalarRef;
  /** Sparkline. Empty table for none. */
  trend: SeriesRef;
  /** Which way is good for this metric (churn: down). Colors the delta. */
  good_direction: "up" | "down";
}

export interface LineSpec extends SpecBase {
  template: "line";
  subtitle: string;
  /** Name of the main metric, shown as its label when the chart has more than one line. */
  series_name?: string;
  series: SeriesRef;
  /** Further metrics over the same periods, drawn as extra lines (e.g. one the presenter added). */
  more_series?: { name: string; series: SeriesRef }[];
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

/** Where things are and where they're going: "we're at X today, we want Y". */
export interface GoalSpec extends SpecBase {
  template: "goal";
  from: ScalarRef;
  to: ScalarRef;
  from_label: string;
  to_label: string;
  good_direction: "up" | "down";
}

// ---------------------------------------------------------------------------
// Diagram: any visual the model composes on the fly from simple parts on a
// 0–100 canvas (x to the right, y down): frameworks, segment maps, matrices,
// factors, mechanisms, outlines it draws itself (a body, a track), a race.
// Nothing is pre-drawn; only the styling is fixed.
// ---------------------------------------------------------------------------

export type DiagramTone = "accent" | "neutral" | "highlight" | "muted";

export interface DiagramRegion {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "rect" | "ellipse";
  tone: DiagramTone;
  cue: string;
}

export interface DiagramNode {
  id: string;
  label: string;
  detail: string;
  /** Center of the node. */
  x: number;
  y: number;
  /** Size; 0 means fit the text. */
  w: number;
  h: number;
  shape: "rect" | "pill" | "circle" | "diamond" | "none";
  tone: DiagramTone;
  icon: IconName | "none";
  cue: string;
}

export interface DiagramLink {
  from: string;
  to: string;
  label: string;
  style: "arrow" | "line" | "dashed";
  tone: DiagramTone;
  cue: string;
}

export interface DiagramPath {
  id: string;
  label: string;
  points: { x: number; y: number }[];
  closed: boolean;
  /** Closed shapes only: fill softly (a silhouette) instead of a loop line. */
  filled: boolean;
  /** thin: a detail line; normal: a route; thick: a road or track. */
  weight: "thin" | "normal" | "thick";
  arrow: boolean;
  tone: DiagramTone;
  cue: string;
}

export interface DiagramMarker {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: "dot" | "pin" | "car";
  tone: DiagramTone;
  cue: string;
}

export interface DiagramSpec extends SpecBase {
  template: "diagram";
  caption: string;
  aspect: "wide" | "square" | "tall";
  reveal: RevealMode;
  regions: DiagramRegion[];
  nodes: DiagramNode[];
  links: DiagramLink[];
  paths: DiagramPath[];
  markers: DiagramMarker[];
}

/**
 * A drawing of anything, made live by the artist model. The director writes the
 * brief; the artist streams the elements. status "drawing" while it is being drawn.
 */
export interface DrawingSpec extends SpecBase {
  template: "drawing";
  caption: string;
  aspect: DrawAspect;
  /** What to draw, in the director's words: the subject, its real shape, parts to label, what to stress. */
  brief: string;
  elements: DrawElement[];
  status?: "drawing" | "done";
}

export type VisualSpec =
  | DrawingSpec
  | MetricSpec
  | LineSpec
  | BarSpec
  | FunnelSpec
  | ComparisonSpec
  | StrategySpec
  | RoadmapSpec
  | ProcessSpec
  | UISketchSpec
  | StatementSpec
  | GoalSpec
  | DiagramSpec;

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
  /** Label of the main line (shown when there is more than one). */
  name: string;
  series: ResolvedSeries;
  /** Extra lines, each with its own name and values. */
  more: { name: string; series: ResolvedSeries }[];
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

export interface RGoal {
  template: "goal";
  title: string;
  from: ResolvedValue;
  to: ResolvedValue;
  fromLabel: string;
  toLabel: string;
  change: ResolvedDelta;
  accent: Accent;
}

export interface RDrawing {
  template: "drawing";
  title: string;
  caption: string;
  aspect: DrawAspect;
  elements: DrawElement[];
  /** Nothing drawn yet: the placeholder breathes until the first elements arrive. */
  pending: boolean;
  /** Elements are still streaming in (each animates as it arrives). */
  live: boolean;
  accent: Accent;
}

export type ResolvedVisual =
  | RDrawing
  | RMetric
  | RLine
  | RBar
  | RFunnel
  | RComparison
  | RStrategy
  | RRoadmap
  | RProcess
  | RUISketch
  | RStatement
  | RGoal
  | RDiagram;

export interface RDiagram {
  template: "diagram";
  title: string;
  caption: string;
  aspect: DiagramSpec["aspect"];
  reveal: RevealMode;
  regions: DiagramRegion[];
  nodes: DiagramNode[];
  links: DiagramLink[];
  paths: DiagramPath[];
  markers: DiagramMarker[];
  accent: Accent;
}

/** Cues of a diagram in reveal order (first appearance), without repeats. */
export function diagramCues(v: Pick<RDiagram, "regions" | "nodes" | "links" | "paths" | "markers">): string[] {
  const seen: string[] = [];
  for (const e of [...v.regions, ...v.nodes, ...v.links, ...v.paths, ...v.markers]) {
    const c = e.cue?.trim();
    if (c && !seen.includes(c)) seen.push(c);
  }
  return seen;
}

/** Number of items a template reveals progressively (0 if it doesn't). */
export function revealCount(v: ResolvedVisual): number {
  switch (v.template) {
    case "strategy":
      return v.reveal === "progressive" ? v.points.length : 0;
    case "roadmap":
      return v.reveal === "progressive" ? v.items.length : 0;
    case "process":
      return v.reveal === "progressive" ? v.steps.length : 0;
    case "diagram":
      return v.reveal === "progressive" ? diagramCues(v).length : 0;
    case "drawing":
      return drawingCues(v.elements).length;
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
    case "diagram":
      return diagramCues(v);
    case "drawing":
      return drawingCues(v.elements);
    default:
      return [];
  }
}
