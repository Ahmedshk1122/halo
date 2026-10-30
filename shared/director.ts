// The director contract: what the control window sends for each decision,
// the tools Claude answers with (strict JSON schemas), and how a tool call
// maps back to a decision. Shared by the server, the offline replay director
// and the tests.

import { ICON_NAMES, UI_BLOCK_KINDS, type TemplateId, type VisualSpec } from "./visuals";

export type Proactivity = "quiet" | "balanced" | "eager";
export type DirectorAction = "none" | "show" | "update" | "tuck" | "recall" | "clear";

export interface TranscriptLine {
  text: string;
  /** Seconds before now. */
  ageSec: number;
  /** Said since the previous decision. */
  isNew: boolean;
  /** Still being spoken (interim result). */
  interim?: boolean;
  /** A voice command Halo already handled locally. */
  handled?: string;
}

export interface VisualRef {
  id: string;
  template: TemplateId;
  title: string;
  ageSec?: number;
  reveal?: string;
  status?: string;
}

export interface PreparedRef {
  id: string;
  template: TemplateId;
  title: string;
  when: string;
}

export interface DirectorRequest {
  arc: string;
  beat: string;
  transcript: TranscriptLine[];
  onScreen: VisualRef[];
  chips: VisualRef[];
  history: VisualRef[];
  secondsSinceLastShow: number | null;
  /** Data catalog description (stable; goes in the cached prompt prefix). */
  catalog: string;
  prepared: PreparedRef[];
  proactivity: Proactivity;
  /** The presenter explicitly asked Halo for something ("Halo, show the roadmap"). */
  request: string | null;
}

export interface DirectorDecision {
  action: DirectorAction;
  reason: string;
  beat: string;
  arc: string;
  /** update/tuck/recall targets. */
  targetIds: string[];
  /** Visuals to tuck in the same move as a show. */
  tuckIds: string[];
  /** Show a visual prepared from talk notes. */
  preparedId: string;
  visual: VisualSpec | null;
}

export interface DirectorTiming {
  /** Time inside the model call, measured on the server. */
  modelMs: number;
  /** Whole server handling time. */
  serverMs: number;
}

export interface DirectorResponse {
  decision: DirectorDecision;
  timing: DirectorTiming;
  model: string;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

// ---------------------------------------------------------------------------
// JSON schema helpers. Strict tool schemas: every property required, no
// unions or nullables, additionalProperties false.
// ---------------------------------------------------------------------------

export type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: "string", description });
const bool = (description: string): JsonSchema => ({ type: "boolean", description });
const strs = (description: string): JsonSchema => ({ type: "array", items: { type: "string" }, description });
const enm = (values: readonly string[], description: string): JsonSchema => ({ type: "string", enum: [...values], description });
const arr = (items: JsonSchema, description: string): JsonSchema => ({ type: "array", items, description });
export function obj(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const scalarRef = (description: string) =>
  obj(
    {
      table: str("Table name exactly as in the catalog. Empty when pick is none."),
      column: str("Numeric column name exactly as in the catalog. Empty when pick is none."),
      pick: enm(["first", "last", "max", "min", "match", "none"], "Which row: last = latest, first = starting value, match = the row whose match_column equals match_value, none = unused."),
      match_column: str("Column to match on (usually the label column) when pick is match, else empty."),
      match_value: str("Row label to match, as written in the catalog, when pick is match, else empty."),
    },
    description,
  );

const seriesRef = (description: string) =>
  obj(
    {
      table: str("Table name exactly as in the catalog. Empty string for no series."),
      x: str("Label column for the x axis or step names."),
      y: str("Numeric column with the values."),
      filter_column: str("Optional column to filter rows by, else empty."),
      filter_value: str("Value the filter column must equal, else empty."),
    },
    description,
  );

const icon = enm(ICON_NAMES, "Icon that matches the item.");
const cue = str("Two to four distinctive words the presenter says for this item, from their wording. Reveals the item as they say it.");
const reveal = enm(["progressive", "all"], "progressive: items appear as the presenter says each cue. all: everything at once.");
const title = str("Two to five words, sentence case, no numbers. Also the chip label when tucked.");
const aliases = strs("Words the presenter might use to ask for this visual again, like funnel or drop-off.");

/** Template-specific tool properties (the spec without template/title/aliases). */
const TEMPLATE_PROPS: Record<TemplateId, Record<string, JsonSchema>> = {
  metric: {
    caption: str("Short context under the title, words only, e.g. Weekly, this quarter."),
    value: scalarRef("The KPI value. Usually pick last."),
    baseline: scalarRef("Earlier value of the same column to compute the change from. Usually pick first. pick none for no change."),
    trend: seriesRef("Sparkline: the same column over rows. Empty table for none."),
    good_direction: enm(["up", "down"], "Which direction is good for this metric (churn: down)."),
  },
  line: {
    subtitle: str("Short context, words only. May be empty."),
    series: seriesRef("The line: label column and value column."),
  },
  bar: {
    subtitle: str("Short context, words only. May be empty."),
    series: seriesRef("One bar per row."),
    highlight_label: str("Label of the bar to emphasize, as in the catalog, or empty."),
  },
  funnel: {
    subtitle: str("Short context, words only. May be empty."),
    steps: seriesRef("Steps in order: label column and share or count column."),
    highlight_step: str("Step label to emphasize (where the drop-off is), as in the catalog, or empty."),
  },
  comparison: {
    a: obj({ label: str("Side A name."), value: scalarRef("Optional number for side A. pick none if qualitative."), points: strs("Two to four short points, words only.") }),
    b: obj({ label: str("Side B name."), value: scalarRef("Optional number for side B. pick none if qualitative."), points: strs("Two to four short points, words only.") }),
    favor: enm(["a", "b", "none"], "The side the presenter argues for."),
  },
  strategy: {
    reveal,
    points: arr(obj({ icon, text: str("Two to six words."), detail: str("Optional short line, or empty."), cue }), "One to four points, in the order spoken."),
  },
  roadmap: {
    reveal,
    items: arr(
      obj({ when: str("Month, quarter or year name, e.g. November or Q1."), label: str("Two to four words."), detail: str("Optional short line, or empty."), cue }),
      "One to six milestones in order.",
    ),
  },
  process: {
    reveal,
    steps: arr(obj({ icon, label: str("One to three words."), detail: str("Optional short line, or empty."), cue }), "One to five steps in order."),
  },
  ui_sketch: {
    caption: str("Short line under the title, or empty."),
    window_title: str("Text in the sketch's title bar."),
    sidebar: strs("Sidebar navigation labels, or empty for no sidebar."),
    heading: str("Main heading inside the window."),
    blocks: arr(
      obj({
        kind: enm(UI_BLOCK_KINDS, "grid of cards, list of rows, form fields, a button, a text line, or a search field."),
        label: str("Section label, button text, or the text line."),
        items: strs("Card titles (grid), rows (list) or field labels (form). Empty for button/text/search."),
        highlight: bool("Emphasize this block."),
      }),
      "One to four blocks, top to bottom.",
    ),
  },
  statement: {
    kicker: str("One to three words above the line, e.g. The ask."),
    text: str("One short line, at most twelve words, words only."),
  },
};

const TOOL_DESCRIPTIONS: Record<TemplateId, string> = {
  metric: "Show one KPI from the data: big value, change since an earlier row, sparkline. For a headline number.",
  line: "Show a trend over time from the data as a line chart.",
  bar: "Show values across categories from the data as bars.",
  funnel: "Show steps of a funnel from the data, with the drop between steps. Highlight where people drop off.",
  comparison: "Show two options side by side (before/after, us/them, A/B). Numbers only via data references.",
  strategy: "Show a title and one to four points with icons: moves, pillars, principles, reasons.",
  roadmap: "Show milestones on a timeline by month, quarter or year.",
  process: "Show a sequence of steps as a flow.",
  ui_sketch: "Show a rough wireframe of an app screen when the presenter asks the audience to picture a screen.",
  statement: "Show one short line, for a closing ask or key takeaway.",
};

export const TOOL_FOR_TEMPLATE: Record<TemplateId, string> = {
  metric: "show_metric",
  line: "show_line_chart",
  bar: "show_bar_chart",
  funnel: "show_funnel",
  comparison: "show_comparison",
  strategy: "show_strategy",
  roadmap: "show_roadmap",
  process: "show_process",
  ui_sketch: "show_ui_sketch",
  statement: "show_statement",
};

export const TEMPLATE_FOR_TOOL: Record<string, TemplateId> = Object.fromEntries(
  Object.entries(TOOL_FOR_TEMPLATE).map(([t, name]) => [name, t as TemplateId]),
);

const COMMON = {
  reason: str("One short sentence for the presenter's log: why this, now."),
  beat: str("Two to four words naming the current part of the talk."),
  arc: str("Running summary of the whole talk so far, at most three sentences, updated with what was just said."),
};

export interface ToolDef {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

/** The director's tools. Order and content are stable so the prompt prefix caches. */
export function directorTools(): ToolDef[] {
  const show = (Object.keys(TOOL_FOR_TEMPLATE) as TemplateId[]).map((t) => ({
    name: TOOL_FOR_TEMPLATE[t],
    description: TOOL_DESCRIPTIONS[t],
    input_schema: obj({
      ...COMMON,
      replace_id: str("Empty for a new visual. To change a visual already on screen, its id."),
      tuck_ids: strs("Ids of on-screen visuals to tuck now because the beat moved on."),
      title,
      aliases,
      ...TEMPLATE_PROPS[t],
    }),
  }));
  return [
    ...show,
    {
      name: "show_prepared",
      description: "Show a visual prepared ahead of time from the presenter's notes, by id. Faster than building one.",
      input_schema: obj({
        ...COMMON,
        prepared_id: str("Id of the prepared visual."),
        tuck_ids: strs("Ids of on-screen visuals to tuck now because the beat moved on."),
      }),
    },
    {
      name: "act",
      description: "Change nothing (none), tuck visuals into chips, recall a tucked or earlier visual, or clear the stage.",
      input_schema: obj({
        ...COMMON,
        action: enm(["none", "tuck", "recall", "clear"], "none is the most common answer."),
        target_ids: strs("For tuck: ids to tuck. For recall: the one id to bring back. Else empty."),
      }),
    },
  ];
}

/** Tool definitions for the planner: same templates, keyed by a prepared id. */
export function plannerTools(): ToolDef[] {
  return (Object.keys(TOOL_FOR_TEMPLATE) as TemplateId[]).map((t) => ({
    name: TOOL_FOR_TEMPLATE[t].replace("show_", "prepare_"),
    description: `Prepare: ${TOOL_DESCRIPTIONS[t]}`,
    input_schema: obj({
      prepared_id: str("Short unique id, lowercase with dashes, e.g. activation-metric."),
      when: str("The moment in the talk to show it, in a few words, e.g. when the activation headline is stated."),
      title,
      aliases,
      ...TEMPLATE_PROPS[t],
    }),
  }));
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Rebuilds a visual spec from a show_ or prepare_ tool input. */
export function specFromToolInput(template: TemplateId, input: Record<string, unknown>): VisualSpec {
  const { reason: _r, beat: _b, arc: _a, replace_id: _ri, tuck_ids: _t, prepared_id: _p, when: _w, ...rest } = input;
  return { ...rest, template, title: s(input.title), aliases: strArray(input.aliases) } as unknown as VisualSpec;
}

/** Maps one tool call to a decision. Unknown tools become "none". */
export function toolCallToDecision(name: string, input: Record<string, unknown>): DirectorDecision {
  const base = { reason: s(input.reason), beat: s(input.beat), arc: s(input.arc), targetIds: [], tuckIds: [], preparedId: "", visual: null };
  const template = TEMPLATE_FOR_TOOL[name];
  if (template) {
    const replaceId = s(input.replace_id).trim();
    return {
      ...base,
      action: replaceId ? "update" : "show",
      targetIds: replaceId ? [replaceId] : [],
      tuckIds: strArray(input.tuck_ids),
      visual: specFromToolInput(template, input),
    };
  }
  if (name === "show_prepared") {
    return { ...base, action: "show", preparedId: s(input.prepared_id), tuckIds: strArray(input.tuck_ids) };
  }
  if (name === "act") {
    const action = s(input.action);
    const valid: DirectorAction[] = ["none", "tuck", "recall", "clear"];
    return { ...base, action: valid.includes(action as DirectorAction) ? (action as DirectorAction) : "none", targetIds: strArray(input.target_ids) };
  }
  return { ...base, action: "none", reason: base.reason || `Unknown tool ${name}` };
}

export function noneDecision(reason: string, prev?: { beat: string; arc: string }): DirectorDecision {
  return { action: "none", reason, beat: prev?.beat ?? "", arc: prev?.arc ?? "", targetIds: [], tuckIds: [], preparedId: "", visual: null };
}
