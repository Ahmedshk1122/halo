// The director contract: what the control window sends for each decision,
// the tools Claude answers with (strict JSON schemas), and how a tool call
// maps back to a decision. Shared by the server, the offline replay director
// and the tests.

import { ICON_NAMES, UI_BLOCK_KINDS, type TemplateId, type VisualSpec } from "./visuals";

export type Proactivity = "quiet" | "balanced" | "eager";
/** Model providers the local server can use. */
export type AIProvider = "anthropic" | "gemini";

/** Display name of a model provider. */
export function aiName(provider: AIProvider | null | undefined): string {
  return provider === "gemini" ? "Gemini" : "Claude";
}
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
  /** What the visual shows now (compact spec), so the director can extend it. On-screen visuals only. */
  content?: string;
}

const TITLE_STOP = new Set(["the", "a", "an", "of", "and", "for", "to", "in", "on", "our", "your", "vs", "versus", "by", "with"]);
const titleWords = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !TITLE_STOP.has(w));

/** Same title, or one title's words all in the other ("Activation" / "Activation trend"), not "Product risks" / "Market risks". */
export function similarTitle(a: string, b: string): boolean {
  const x = titleWords(a);
  const y = titleWords(b);
  if (x.length === 0 || y.length === 0) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w) => long.includes(w));
}

/**
 * Compact JSON of a spec for the director: empty fields, aliases and the template
 * name left out, numbers rounded. Long diagrams drop their outline points first.
 */
export function specContent(spec: object | null, max = 3000): string {
  if (!spec) return "";
  const prune = (v: unknown, key = ""): unknown => {
    if (key === "aliases" || key === "template" || key === "status") return undefined;
    // A drawing is described by its brief; its drawn parts would only flood the context.
    if (key === "elements") return Array.isArray(v) && v.length ? `${v.length} parts drawn from the brief` : undefined;
    if (Array.isArray(v)) {
      const a = v.map((x) => prune(x)).filter((x) => x !== undefined);
      return a.length ? a : undefined;
    }
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        const p = prune(x, k);
        if (p !== undefined) o[k] = p;
      }
      return Object.keys(o).length ? o : undefined;
    }
    if (v === "" || v === null || v === undefined || v === false) return undefined;
    if (typeof v === "number") return Math.round(v * 100) / 100;
    return v;
  };
  const pruned = (prune(spec) ?? {}) as Record<string, unknown>;
  let text = JSON.stringify(pruned);
  if (text.length > max && Array.isArray(pruned.paths)) {
    pruned.paths = (pruned.paths as Record<string, unknown>[]).map((p) => ({ ...p, points: `${(p.points as unknown[] | undefined)?.length ?? 0} points (redraw them)` }));
    text = JSON.stringify(pruned);
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
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
  /** The presenter held a pointing finger on a spot while speaking. */
  pointing?: boolean;
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

const num = (description: string): JsonSchema => ({ type: "number", description });
const saidUnit = enm(["number", "percent", "currency"], "Unit of the said value(s).");
const saidCurrency = str('Currency symbol for said currency values: "$", "€", "£", "₹" or "Rs". Empty otherwise.');

const scalarRef = (description: string) =>
  obj(
    {
      table: str("Table name exactly as in the catalog. Empty when pick is none or said."),
      column: str("Numeric column name exactly as in the catalog. Empty when pick is none or said."),
      pick: enm(
        ["first", "last", "max", "min", "match", "said", "none"],
        "Which value: last = latest row, first = starting row, match = the row whose match_column equals match_value, said = a number the presenter said (said_value), none = unused.",
      ),
      match_column: str("Column to match on (usually the label column) when pick is match, else empty."),
      match_value: str("Row label to match, as written in the catalog, when pick is match, else empty."),
      said_value: num("When pick is said: the number exactly as the presenter said it, as a plain number ($200K = 200000, 44% = 44). Else 0."),
      said_unit: saidUnit,
      said_currency: saidCurrency,
      said_label: str("When pick is said: what the value is, in two to four words, e.g. Revenue today. Else empty."),
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
      said_points: arr(
        obj({ label: str("Short label, e.g. Today or Q1."), value: num("The number exactly as the presenter said it, as a plain number.") }),
        'When table is "said": the points the presenter said, in order. Else empty.',
      ),
      said_unit: saidUnit,
      said_currency: saidCurrency,
    },
    description,
  );

const icon = enm(ICON_NAMES, "Icon that matches the item.");
const tone = enm(["accent", "neutral", "highlight", "muted"], "accent: the main thing; highlight: what the presenter is pointing out (orange); neutral; muted: background.");
const diagramCue = str("With reveal progressive: two to four words the presenter says when this part should appear. Empty to show it at once.");
const cue = str("Two to four distinctive words the presenter says for this item, from their wording. Reveals the item as they say it.");
const reveal = enm(["progressive", "all"], "progressive: items appear as the presenter says each cue. all: everything at once.");
const title = str("Two to five words, sentence case, no numbers. Also the chip label when tucked.");
const aliases = strs("Words the presenter might use to ask for this visual again, like funnel or drop-off.");
const style = enm(
  ["card", "float"],
  "card: on a frosted glass card. float: drawn straight onto the video with no card behind it, so it feels part of the scene: drawings, shapes, a big number, a few words.",
);

/** Template-specific tool properties (the spec without template/title/aliases). */
const TEMPLATE_PROPS: Record<TemplateId, Record<string, JsonSchema>> = {
  drawing: {
    caption: str("Short line under the title, or empty."),
    aspect: enm(["wide", "square", "tall"], "Shape of the drawing: wide for scenes, maps, tracks and timelines; square for objects; tall for people, buildings and towers."),
    brief: str(
      "What the illustrator should draw, in detail: the subject and its real shape and layout (as it really looks), the parts to show and label with short words, what to emphasize, where things are, and any numbers the speaker said. For an update: the whole drawing as it should now be, including what is already there.",
    ),
  },
  metric: {
    caption: str("Short context under the title, words only, e.g. Weekly, this quarter."),
    value: scalarRef("The KPI value. Usually pick last."),
    baseline: scalarRef("Earlier value of the same column to compute the change from. Usually pick first. pick none for no change."),
    trend: seriesRef("Sparkline: the same column over rows. Empty table for none."),
    good_direction: enm(["up", "down"], "Which direction is good for this metric (churn: down)."),
  },
  line: {
    subtitle: str("Short context, words only. May be empty."),
    series_name: str("Name of the first metric, e.g. Revenue. Shown as its label when there is more than one line. May be empty."),
    series: seriesRef("The main line: label column and value column, or the points the presenter said."),
    more_series: arr(
      obj({ name: str("Name of this metric, e.g. Churn."), series: seriesRef("This metric over the same periods.") }),
      "Up to two more metrics drawn as extra lines on the same chart, e.g. one the presenter just added. Usually empty.",
    ),
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
    a: obj({ label: str("Side A name."), value: scalarRef("Optional number for side A. pick none if qualitative."), points: strs("Short points, words only, as many as the presenter gives.") }),
    b: obj({ label: str("Side B name."), value: scalarRef("Optional number for side B. pick none if qualitative."), points: strs("Short points, words only, as many as the presenter gives.") }),
    favor: enm(["a", "b", "none"], "The side the presenter argues for."),
  },
  strategy: {
    reveal,
    points: arr(obj({ icon, text: str("Two to six words."), detail: str("Optional short line, or empty."), cue }), "Every point the presenter has said so far, in the order spoken. No limit: long lists are laid out to fit."),
  },
  roadmap: {
    reveal,
    items: arr(
      obj({ when: str("Month, quarter or year name, e.g. November or Q1."), label: str("Two to four words."), detail: str("Optional short line, or empty."), cue }),
      "Every milestone said so far, in order.",
    ),
  },
  process: {
    reveal,
    steps: arr(obj({ icon, label: str("One to three words."), detail: str("Optional short line, or empty."), cue }), "Every step said so far, in order."),
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
  diagram: {
    caption: str("Short line under the title, or empty."),
    aspect: enm(["wide", "square", "tall"], "Shape of the drawing area."),
    reveal: enm(["progressive", "all"], "progressive: parts with a cue appear as the presenter says it. all: everything at once."),
    regions: arr(
      obj({
        label: str("One to three words, or empty."),
        x: num("Left edge, 0-100."),
        y: num("Top edge, 0-100."),
        w: num("Width, 0-100."),
        h: num("Height, 0-100."),
        shape: enm(["rect", "ellipse"], "Quadrants and groups: rect. Overlapping sets: ellipse."),
        tone: tone,
        cue: diagramCue,
      }),
      "Background areas: quadrants, groups, sets. Often empty.",
    ),
    nodes: arr(
      obj({
        id: str("Short unique id, used by links."),
        label: str("One to four words."),
        detail: str("Optional short line, or empty."),
        x: num("Center x, 0-100."),
        y: num("Center y, 0-100."),
        w: num("Width 0-100, or 0 to fit the text."),
        h: num("Height 0-100, or 0 to fit the text."),
        shape: enm(["rect", "pill", "circle", "diamond", "none"], "none is a floating label."),
        tone: tone,
        icon: enm([...ICON_NAMES, "none"], "Icon beside the label, or none."),
        cue: diagramCue,
      }),
      "The labeled boxes or bubbles of the diagram.",
    ),
    links: arr(
      obj({
        from: str("Node id."),
        to: str("Node id."),
        label: str("One to three words, or empty."),
        style: enm(["arrow", "line", "dashed"], "arrow for flow or cause, line for relation, dashed for weak or planned."),
        tone: tone,
        cue: diagramCue,
      }),
      "Connections between nodes.",
    ),
    paths: arr(
      obj({
        id: str("Short unique id."),
        label: str("One to three words, or empty."),
        points: arr(obj({ x: num("0-100."), y: num("0-100.") }), "Two to twenty-four points along the line; drawn as a smooth curve."),
        closed: bool("Close the shape (an outline)."),
        filled: bool("For closed shapes: fill softly, like a silhouette of a body, an organ or a country. False for a loop line like a race track."),
        weight: enm(["thin", "normal", "thick"], "thin: detail lines; normal: routes and movements; thick: a road or track."),
        arrow: bool("Arrowhead at the end."),
        tone: tone,
        cue: diagramCue,
      }),
      "Lines and outlines you draw yourself: a body or organ outline, a race track, a racing line or overtake, a journey, a river. Often empty.",
    ),
    markers: arr(
      obj({
        id: str("Short unique id."),
        label: str("One to three words."),
        x: num("0-100."),
        y: num("0-100."),
        kind: enm(["dot", "pin", "car"], "dot for a point or part, pin for a place, car for a vehicle or player."),
        tone: tone,
        cue: diagramCue,
      }),
      "Labeled points: body parts, cars, places, positions.",
    ),
  },
  goal: {
    from: scalarRef("Where things are now (often pick said)."),
    to: scalarRef("Where they want to be (often pick said)."),
    from_label: str("Label under the first value, e.g. Today."),
    to_label: str("Label under the second value, e.g. Next year."),
    good_direction: enm(["up", "down"], "Which direction is good (costs: down)."),
  },
  statement: {
    kicker: str("One to three words above the line, e.g. The ask."),
    text: str("One short line, at most twelve words, words only."),
  },
};

const TOOL_DESCRIPTIONS: Record<TemplateId, string> = {
  drawing:
    "Draw anything, live: whatever the speaker is talking about or asks for, real or imagined, on Earth, in space or nowhere at all: a race track and an overtake, a football stadium, the solar system, how a heart pumps, a village and its river, a machine, a map, a scene from a story. You write the brief; a skilled illustrator draws it in real shapes and good colors as the speaker watches. Update it with replace_id as they add detail.",
  metric: "Show one headline number big, from what the presenter said or the data, with the change since an earlier value when there is one.",
  line: "Show how a number changes over time as a line chart, from numbers the presenter said or from the data. Up to three metrics as separate lines.",
  bar: "Compare values across categories (regions, products, teams) as bars, from numbers the presenter said or from the data.",
  funnel: "Show steps of a funnel, from numbers the presenter said or the data, with the drop between steps. Highlight where people drop off.",
  comparison: "Show two options side by side (before/after, us/them, A/B), with an optional number for each that the presenter said or the data holds.",
  strategy: "Show a list of points with icons, as many as the presenter gives: factors, reasons, ideas, features, tips, rules, ingredients, anything listed.",
  roadmap: "Show milestones on a timeline by month, quarter or year.",
  process: "Show a sequence of steps as a flow, as many as the presenter gives: how something is done, made or happens.",
  ui_sketch: "Show a rough wireframe of an app screen when the presenter asks the audience to picture a screen.",
  statement: "Show one short line, for a closing ask or key takeaway.",
  goal: "Show where something is and where it should go: two values side by side with the change, like today and the goal.",
  diagram:
    "Draw anything, live, from scratch: whatever the speaker is talking about or asks for, real or imagined, on Earth, in space or nowhere at all. A race track and the overtake, the solar system, an atom, how a heart pumps, a village and its river, a machine, a map, a family tree, a flow of ideas, a scene from a story. Compose it on a 0-100 canvas (x to the right, y down) from paths (any outline or line you draw point by point: a coastline, a body, a track, a route, a wave), regions (areas, circles and ellipses), nodes (labeled boxes, bubbles or plain labels), links (arrows and connections) and markers (dots, pins, cars or players). Draw the real shapes as best you know them, with enough points for curves. Make it read at a glance on a small video: short labels, every label clear of the others, nothing jammed against an edge. Add to it with replace_id as the speaker adds detail.",
};

export const TOOL_FOR_TEMPLATE: Record<TemplateId, string> = {
  drawing: "draw",
  /** Earlier box-and-arrow drawing template; kept for prepared visuals and the gallery, not offered to the model. */
  diagram: "show_diagram",
  strategy: "show_list",
  process: "show_steps",
  comparison: "show_comparison",
  line: "show_line_chart",
  bar: "show_bar_chart",
  statement: "show_statement",
  ui_sketch: "show_ui_sketch",
  roadmap: "show_timeline",
  goal: "show_goal",
  metric: "show_number",
  funnel: "show_funnel",
};

/** Planner tool names: prepare_ plus the director tool's name without show_ (draw → prepare_draw). */
export const PLANNER_TOOL_FOR_TEMPLATE = Object.fromEntries(
  Object.entries(TOOL_FOR_TEMPLATE).map(([t, name]) => [t, `prepare_${name.replace(/^show_/, "")}`]),
) as Record<TemplateId, string>;
export const TEMPLATE_FOR_PLANNER_TOOL: Record<string, TemplateId> = Object.fromEntries(
  Object.entries(PLANNER_TOOL_FOR_TEMPLATE).map(([t, name]) => [name, t as TemplateId]),
);

export const TEMPLATE_FOR_TOOL: Record<string, TemplateId> = Object.fromEntries(
  Object.entries(TOOL_FOR_TEMPLATE).map(([t, name]) => [name, t as TemplateId]),
);

const COMMON = {
  reason: str("A few words for the speaker's private log: why this, now."),
  beat: str("Two to four words naming what they are talking about now."),
  arc: str("Running summary of everything said so far, at most two sentences, updated with what was just said."),
};

export interface ToolDef {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

/** Templates the model can use, in the order its tools are listed (draw first). */
export const OFFERED_TEMPLATES = (Object.keys(TOOL_FOR_TEMPLATE) as TemplateId[]).filter((t) => t !== "diagram");

/** The director's tools. Order and content are stable so the prompt prefix caches. */
export function directorTools(): ToolDef[] {
  const show = OFFERED_TEMPLATES.map((t) => ({
    name: TOOL_FOR_TEMPLATE[t],
    description: TOOL_DESCRIPTIONS[t],
    input_schema: obj({
      ...COMMON,
      replace_id: str("Empty for a new visual. To change a visual already on screen, its id."),
      tuck_ids: strs("Ids of on-screen visuals to tuck now because the beat moved on."),
      title,
      aliases,
      style,
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
  return OFFERED_TEMPLATES.map((t) => ({
    name: PLANNER_TOOL_FOR_TEMPLATE[t],
    description: `Prepare: ${TOOL_DESCRIPTIONS[t]}`,
    input_schema: obj({
      prepared_id: str("Short unique id, lowercase with dashes, e.g. activation-metric."),
      when: str("The moment in the talk to show it, in a few words, e.g. when the activation headline is stated."),
      title,
      aliases,
      style,
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
  // A drawing starts as a brief; the artist fills in its elements as it draws.
  const drawing = template === "drawing" ? { elements: [], status: "drawing" } : {};
  return { ...rest, ...drawing, template, title: s(input.title), aliases: strArray(input.aliases) } as unknown as VisualSpec;
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
