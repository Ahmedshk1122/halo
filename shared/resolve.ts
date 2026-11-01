// Turns a visual spec into a resolved visual: data references become real
// values from the catalog, text is checked and tidied, and anything that
// cannot be grounded rejects the visual.

import { formatDelta, formatLabel, formatValue, normalizeName, type DataColumn, type DataTable } from "./data";
import { elementLine, parseElement, type DrawElement } from "./drawing";
import { scanSpec, scrubNumbers, type GroundingViolation } from "./grounding";
import { wasSaid, type SpokenNumber } from "./spoken";
import type {
  Accent,
  DiagramSpec,
  RDiagram,
  ResolvedDelta,
  SaidUnit,
  MetricSpec,
  ProcessSpec,
  ResolvedSeries,
  ResolvedValue,
  ResolvedVisual,
  ScalarRef,
  RoadmapSpec,
  SeriesRef,
  StrategySpec,
  UISketchSpec,
  VisualSpec,
} from "./visuals";

export type PrepareResult =
  /** notes: what Halo fixed on the way (numbers taken out, a line left out), for the log. */
  | { ok: true; visual: ResolvedVisual; spec: VisualSpec; notes: string[] }
  | { ok: false; stage: "schema" | "data" | "grounding"; errors: string[]; violations: GroundingViolation[] };

class RefError extends Error {}

function findTable(tables: DataTable[], name: string): DataTable {
  const n = normalizeName(name);
  const t = tables.find((x) => x.name === name) ?? tables.find((x) => normalizeName(x.name) === n);
  if (!t) throw new RefError(`unknown table "${name}"`);
  return t;
}

function findColumn(table: DataTable, name: string): DataColumn {
  const n = normalizeName(name);
  const c = table.columns.find((x) => x.name === name) ?? table.columns.find((x) => normalizeName(x.name) === n);
  if (!c) throw new RefError(`unknown column "${name}" in table "${table.name}"`);
  return c;
}

function sameCell(a: unknown, b: string): boolean {
  if (a === null || a === undefined) return false;
  if (typeof a === "number") {
    const nb = Number(b.replace(/[%,$€£¥\s]/g, ""));
    return Number.isFinite(nb) && Math.abs(a - nb) < 1e-9;
  }
  return normalizeName(String(a)) === normalizeName(b);
}

function rowLabel(table: DataTable, row: Record<string, unknown>): string {
  const col = table.columns.find((c) => c.name === table.labelColumn);
  return col ? formatLabel(row[col.name] as never, col.kind) : "";
}

function isNumeric(c: DataColumn): boolean {
  return c.kind === "number" || c.kind === "percent" || c.kind === "currency";
}

export interface ResolveOptions {
  compact?: boolean;
  /** Numbers the presenter said recently. Said values must be among them. */
  said?: SpokenNumber[];
  /** Collects what was left out on the way, for the log. */
  notes?: string[];
}

/** Column-like formatting info for a value the presenter said. */
function saidColumn(value: number, unit: SaidUnit | undefined, currency: string | undefined): Pick<DataColumn, "kind" | "decimals" | "currency"> {
  const decimals = Math.min(2, (String(value).split(".")[1] ?? "").length);
  if (unit === "percent") return { kind: "percent", decimals, currency: null };
  if (unit === "currency") return { kind: "currency", decimals, currency: currency?.trim() || "$" };
  return { kind: "number", decimals, currency: null };
}

function resolveSaid(ref: ScalarRef, opts: ResolveOptions): ResolvedValue {
  const value = Number(ref.said_value);
  if (!Number.isFinite(value)) throw new RefError("a said value is missing its number");
  const col = saidColumn(value, ref.said_unit, ref.said_currency);
  const display = formatValue(value, col, { compact: opts.compact ?? true });
  if (!wasSaid(value, opts.said ?? [])) throw new RefError(`${display} was not said by the presenter or found in the data`);
  return { value, display, kind: col.kind, rowLabel: ref.said_label ?? "", table: "said", column: "said" };
}

/** Resolves a single-cell reference. Returns null when pick is "none". */
export function resolveScalar(ref: ScalarRef, tables: DataTable[], opts: ResolveOptions = {}): ResolvedValue | null {
  if (ref.pick === "none") return null;
  if (ref.pick === "said") return resolveSaid(ref, opts);
  const table = findTable(tables, ref.table);
  const col = findColumn(table, ref.column);
  if (!isNumeric(col)) throw new RefError(`column "${col.name}" is not numeric`);
  const rows = table.rows.filter((r) => typeof r[col.name] === "number");
  if (rows.length === 0) throw new RefError(`column "${col.name}" has no values`);
  let row: Record<string, unknown> | undefined;
  switch (ref.pick) {
    case "first":
      row = rows[0];
      break;
    case "last":
      row = rows[rows.length - 1];
      break;
    case "max":
      row = rows.reduce((a, b) => ((b[col.name] as number) > (a[col.name] as number) ? b : a));
      break;
    case "min":
      row = rows.reduce((a, b) => ((b[col.name] as number) < (a[col.name] as number) ? b : a));
      break;
    case "match": {
      const mc = findColumn(table, ref.match_column);
      row = rows.find((r) => sameCell(r[mc.name], ref.match_value));
      if (!row) throw new RefError(`no row where ${mc.name} = "${ref.match_value}" in "${table.name}"`);
      break;
    }
  }
  if (!row) throw new RefError("no matching row");
  const value = row[col.name] as number;
  return {
    value,
    display: formatValue(value, col, opts),
    kind: col.kind,
    rowLabel: rowLabel(table, row),
    table: table.name,
    column: col.name,
  };
}

/** Resolves a column over rows. Returns null when table is empty (no series). */
export function resolveSeries(ref: SeriesRef, tables: DataTable[], opts: ResolveOptions = {}): ResolvedSeries | null {
  if (!ref.table) return null;
  if (ref.table === "said") {
    const pts = (ref.said_points ?? []).filter((p) => Number.isFinite(Number(p.value)));
    if (pts.length === 0) throw new RefError("no said values in the series");
    // A point the presenter did not say is left out; the rest of the series still shows.
    const points = pts.flatMap((p) => {
      const value = Number(p.value);
      const col = saidColumn(value, ref.said_unit, ref.said_currency);
      const display = formatValue(value, col, { compact: true });
      if (!wasSaid(value, opts.said ?? [])) {
        opts.notes?.push(`Left out ${display}: not said by the presenter`);
        return [];
      }
      return [{ label: tidy(p.label, 24), value, display }];
    });
    if (points.length === 0) throw new RefError("none of the values in the series were said by the presenter");
    const kind = saidColumn(points[0].value, ref.said_unit, ref.said_currency).kind;
    return { points, kind, table: "said", xColumn: "label", yColumn: "said" };
  }
  const table = findTable(tables, ref.table);
  const x = findColumn(table, ref.x);
  const y = findColumn(table, ref.y);
  if (!isNumeric(y)) throw new RefError(`column "${y.name}" is not numeric`);
  let rows = table.rows;
  if (ref.filter_column) {
    const fc = findColumn(table, ref.filter_column);
    rows = rows.filter((r) => sameCell(r[fc.name], ref.filter_value));
    if (rows.length === 0) throw new RefError(`filter ${fc.name} = "${ref.filter_value}" matched no rows`);
  }
  const points = rows
    .filter((r) => typeof r[y.name] === "number")
    .map((r) => {
      const value = r[y.name] as number;
      return { label: formatLabel(r[x.name] as never, x.kind), value, display: formatValue(value, y, { compact: true }) };
    });
  if (points.length === 0) throw new RefError(`no values in "${y.name}"`);
  return { points, kind: y.kind, table: table.name, xColumn: x.name, yColumn: y.name };
}

// ---------------------------------------------------------------------------
// Text hygiene: sentence-level copy rules applied to every generated string.
// ---------------------------------------------------------------------------

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

export function tidy(text: unknown, max = 120): string {
  let t = String(text ?? "").replace(EMOJI, "").replace(/!+/g, ".").replace(/\s+/g, " ").trim();
  t = t.replace(/\.\.+$/, ".").replace(/\s+\./g, ".");
  if (t.length > max) {
    t = t.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + "…";
  }
  return t;
}

/**
 * No caps on what the presenter says: every item they list is kept. This only
 * guards the renderer against a runaway reply.
 */
const MAX_ITEMS = 40;

/** Tools are not all strict, so a field can arrive missing or the wrong type: read arrays and objects defensively. */
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).filter((x) => x !== null && x !== undefined) : []);
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function tidyList(items: unknown, maxItems: number, maxLen: number): string[] {
  return list<unknown>(items).map((s) => tidy(s, maxLen)).filter(Boolean).slice(0, maxItems);
}

const NONE_REF: ScalarRef = { table: "", column: "", pick: "none", match_column: "", match_value: "" };
const EMPTY_SERIES: SeriesRef = { table: "", x: "", y: "", filter_column: "", filter_value: "" };

const tidyRef = (r: unknown): ScalarRef => {
  const x = record(r);
  if (!x.pick) return NONE_REF;
  return { ...NONE_REF, ...(x as Partial<ScalarRef>), table: String(x.table ?? ""), column: String(x.column ?? ""), said_label: tidy(x.said_label ?? "", 32) } as ScalarRef;
};
const tidySeries = (r: unknown): SeriesRef => {
  const x = record(r);
  return {
    ...EMPTY_SERIES,
    ...(x as Partial<SeriesRef>),
    table: String(x.table ?? ""),
    x: String(x.x ?? ""),
    y: String(x.y ?? ""),
    filter_column: String(x.filter_column ?? ""),
    filter_value: String(x.filter_value ?? ""),
    ...(x.said_points !== undefined ? { said_points: list<{ label: string; value: number }>(x.said_points).slice(0, MAX_ITEMS) } : {}),
  } as SeriesRef;
};

/** Applies copy rules. Returns a cleaned copy of the spec with every field present. */
export function tidySpec(spec: VisualSpec): VisualSpec {
  const base = {
    title: tidy(spec.title, 44),
    aliases: list<unknown>(spec.aliases).map((a) => String(a).toLowerCase().trim()).filter(Boolean).slice(0, 8),
    style: spec.style === "float" ? ("float" as const) : ("card" as const),
  };
  const cue = (c: unknown) => tidy(c ?? "", 40);
  switch (spec.template) {
    case "metric":
      return {
        ...spec,
        ...base,
        caption: tidy(spec.caption, 60),
        value: tidyRef(spec.value),
        baseline: tidyRef(spec.baseline),
        trend: tidySeries(spec.trend),
        good_direction: spec.good_direction === "down" ? "down" : "up",
      };
    case "line":
      return {
        ...spec,
        ...base,
        subtitle: tidy(spec.subtitle, 60),
        series_name: tidy(spec.series_name ?? "", 24),
        series: tidySeries(spec.series),
        more_series: list<{ name: unknown; series: unknown }>(spec.more_series)
          .map((m) => ({ name: tidy(record(m).name, 24), series: tidySeries(record(m).series) }))
          .filter((m) => m.series.table)
          .slice(0, 4),
      };
    case "bar":
      return { ...spec, ...base, subtitle: tidy(spec.subtitle, 60), series: tidySeries(spec.series), highlight_label: tidy(spec.highlight_label ?? "", 40) };
    case "funnel":
      return { ...spec, ...base, subtitle: tidy(spec.subtitle, 60), steps: tidySeries(spec.steps), highlight_step: tidy(spec.highlight_step ?? "", 40) };
    case "comparison": {
      const side = (v: unknown) => {
        const x = record(v);
        return { label: tidy(x.label, 28), points: tidyList(x.points, MAX_ITEMS, 48), value: tidyRef(x.value) };
      };
      return { ...spec, ...base, a: side(spec.a), b: side(spec.b), favor: spec.favor === "a" || spec.favor === "b" ? spec.favor : "none" };
    }
    case "strategy":
      return {
        ...spec,
        ...base,
        reveal: spec.reveal === "all" ? "all" : "progressive",
        points: list<StrategySpec["points"][number]>(spec.points)
          .slice(0, MAX_ITEMS)
          .map((p) => ({ ...p, icon: p.icon, text: tidy(p.text, 52), detail: tidy(p.detail, 64), cue: cue(p.cue) }))
          .filter((p) => p.text),
      };
    case "roadmap":
      return {
        ...spec,
        ...base,
        reveal: spec.reveal === "all" ? "all" : "progressive",
        items: list<RoadmapSpec["items"][number]>(spec.items)
          .slice(0, MAX_ITEMS)
          .map((p) => ({ ...p, when: tidy(p.when, 16), label: tidy(p.label, 32), detail: tidy(p.detail, 48), cue: cue(p.cue) }))
          .filter((p) => p.label || p.when),
      };
    case "process":
      return {
        ...spec,
        ...base,
        reveal: spec.reveal === "all" ? "all" : "progressive",
        steps: list<ProcessSpec["steps"][number]>(spec.steps)
          .slice(0, MAX_ITEMS)
          .map((p) => ({ ...p, label: tidy(p.label, 28), detail: tidy(p.detail, 48), cue: cue(p.cue) }))
          .filter((p) => p.label),
      };
    case "ui_sketch":
      return {
        ...spec,
        ...base,
        caption: tidy(spec.caption, 60),
        window_title: tidy(spec.window_title, 28),
        heading: tidy(spec.heading, 36),
        sidebar: tidyList(spec.sidebar, 8, 18),
        blocks: list<UISketchSpec["blocks"][number]>(spec.blocks)
          .slice(0, 6)
          .map((b) => ({ ...b, label: tidy(b.label, 32), items: tidyList(b.items, 8, 24), highlight: !!b.highlight })),
      };
    case "statement":
      return { ...spec, ...base, kicker: tidy(spec.kicker, 28), text: tidy(spec.text, 90) };
    case "goal":
      return {
        ...spec,
        ...base,
        from: tidyRef(spec.from),
        to: tidyRef(spec.to),
        from_label: tidy(spec.from_label, 24),
        to_label: tidy(spec.to_label, 24),
        good_direction: spec.good_direction === "down" ? "down" : "up",
      };
    case "diagram":
      return tidyDiagram({ ...spec, ...base });
    case "drawing":
      return {
        ...spec,
        ...base,
        caption: tidy(spec.caption, 60),
        aspect: spec.aspect === "square" || spec.aspect === "tall" ? spec.aspect : "wide",
        brief: String(spec.brief ?? "").trim().slice(0, 2000),
        // Elements are checked again here, whatever their source: only whitelisted shapes get through.
        elements: list<DrawElement>(spec.elements)
          .map((e) => (e && typeof e === "object" ? parseElement(elementLine({ ...e, attrs: record(e.attrs) as Record<string, string>, text: tidy(e.text ?? "", 60) })) : null))
          .filter((e): e is DrawElement => e !== null)
          .slice(0, 600),
        status: spec.status === "drawing" ? "drawing" : "done",
      };
  }
}

const pct = (n: unknown, fallback = 50) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback;
};
const toneOf = (t: unknown) => (t === "accent" || t === "highlight" || t === "muted" ? t : "neutral");

/** Copy rules, limits and sane coordinates for a composed diagram. */
function tidyDiagram(spec: DiagramSpec): DiagramSpec {
  const cue = (c: unknown) => tidy(String(c ?? ""), 40);
  return {
    ...spec,
    caption: tidy(spec.caption ?? "", 60),
    aspect: spec.aspect === "wide" || spec.aspect === "tall" ? spec.aspect : "square",
    reveal: spec.reveal === "progressive" ? "progressive" : "all",
    regions: list<DiagramSpec["regions"][number]>(spec.regions).slice(0, 16).map((r) => ({
      ...r,
      label: tidy(r.label, 28),
      x: pct(r.x, 10),
      y: pct(r.y, 10),
      w: pct(r.w, 40),
      h: pct(r.h, 40),
      shape: r.shape === "ellipse" ? "ellipse" : "rect",
      tone: toneOf(r.tone),
      cue: cue(r.cue),
    })),
    nodes: list<DiagramSpec["nodes"][number]>(spec.nodes).slice(0, MAX_ITEMS).map((n, i) => ({
      ...n,
      id: String(n.id || `n${i + 1}`),
      label: tidy(n.label, 32),
      detail: tidy(n.detail ?? "", 44),
      x: pct(n.x, 0),
      y: pct(n.y, 0),
      w: pct(n.w, 0),
      h: pct(n.h, 0),
      shape: (["rect", "pill", "circle", "diamond", "none"] as const).includes(n.shape) ? n.shape : "rect",
      tone: toneOf(n.tone),
      icon: n.icon ?? "none",
      cue: cue(n.cue),
    })),
    links: list<DiagramSpec["links"][number]>(spec.links).slice(0, MAX_ITEMS).map((l) => ({
      ...l,
      label: tidy(l.label ?? "", 24),
      style: l.style === "line" || l.style === "dashed" ? l.style : "arrow",
      tone: toneOf(l.tone),
      cue: cue(l.cue),
    })),
    paths: list<DiagramSpec["paths"][number]>(spec.paths).slice(0, 16).map((p, i) => ({
      ...p,
      id: String(p.id || `p${i + 1}`),
      label: tidy(p.label ?? "", 24),
      points: list<{ x: number; y: number }>(p.points).slice(0, 64).map((q) => ({ x: pct(q.x), y: pct(q.y) })),
      closed: !!p.closed,
      filled: !!p.closed && !!p.filled,
      weight: p.weight === "thin" || p.weight === "thick" ? p.weight : "normal",
      arrow: !!p.arrow,
      tone: toneOf(p.tone),
      cue: cue(p.cue),
    })),
    markers: list<DiagramSpec["markers"][number]>(spec.markers).slice(0, MAX_ITEMS).map((m, i) => ({
      ...m,
      id: String(m.id || `m${i + 1}`),
      label: tidy(m.label ?? "", 28),
      x: pct(m.x),
      y: pct(m.y),
      kind: m.kind === "pin" || m.kind === "car" ? m.kind : "dot",
      tone: toneOf(m.tone),
      cue: cue(m.cue),
    })),
  };
}

/** Links to missing nodes dropped, and a tidy layout when the model gave none. */
function resolveDiagram(spec: DiagramSpec): RDiagram {
  const markers = spec.markers;
  // Nodes stacked on one spot (no layout given): spread them in rows.
  let nodes = spec.nodes;
  const spots = new Set(nodes.map((n) => `${Math.round(n.x / 4)},${Math.round(n.y / 4)}`));
  if (nodes.length > 1 && spots.size < nodes.length) {
    const cols = nodes.length <= 3 ? nodes.length : Math.ceil(nodes.length / 2);
    const rows = Math.ceil(nodes.length / cols);
    nodes = nodes.map((n, i) => ({
      ...n,
      x: ((i % cols) + 0.5) * (100 / cols),
      y: (Math.floor(i / cols) + 0.5) * (100 / rows),
    }));
  }
  const ids = new Set(nodes.map((n) => n.id));
  const links = spec.links.filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to);
  const paths = spec.paths.filter((p) => p.points.length >= 2);
  return {
    template: "diagram",
    title: spec.title,
    caption: spec.caption,
    aspect: spec.aspect,
    reveal: spec.reveal,
    regions: spec.regions,
    nodes,
    links,
    paths,
    markers,
    accent: "blue",
  };
}

function checkShape(spec: VisualSpec): string[] {
  const errors: string[] = [];
  if (!spec.title) errors.push("missing title");
  switch (spec.template) {
    case "strategy":
      if (spec.points.length < 1) errors.push("strategy needs 1 to 4 points");
      break;
    case "roadmap":
      if (spec.items.length < 1) errors.push("roadmap needs 1 to 6 items");
      break;
    case "process":
      if (spec.steps.length < 1) errors.push("process needs 1 to 5 steps");
      break;
    case "ui_sketch":
      if (spec.blocks.length < 1) errors.push("ui sketch needs at least one block");
      break;
    case "statement":
      if (!spec.text) errors.push("statement needs text");
      break;
    case "comparison":
      if (!spec.a.label || !spec.b.label) errors.push("comparison needs two labels");
      break;
    case "goal":
      if (spec.from?.pick === "none" || spec.to?.pick === "none") errors.push("goal needs a from value and a to value");
      break;
    case "diagram":
      if (spec.regions.length + spec.nodes.length + spec.paths.length + spec.markers.length === 0) errors.push("diagram needs at least one part");
      break;
    case "drawing":
      if (spec.status !== "drawing" && spec.elements.length === 0) errors.push("the drawing came back empty");
      break;
    default:
      break;
  }
  return errors;
}

function metricAccent(spec: MetricSpec, direction: "up" | "down" | "flat" | null): Accent {
  if (!direction || direction === "flat") return "blue";
  const good = spec.good_direction === "down" ? "down" : "up";
  return direction === good ? "green" : "red";
}

function labelIndex(series: ResolvedSeries, label: string): number {
  if (!label) return -1;
  const n = normalizeName(label);
  return series.points.findIndex((p) => normalizeName(p.label) === n);
}

/** The whole pipeline: tidy → shape → scan text → resolve data. `said`: numbers the presenter said. */
export function prepareVisual(input: VisualSpec, tables: DataTable[], opts: { said?: SpokenNumber[] } = {}): PrepareResult {
  if (!input || typeof input !== "object" || !("template" in input)) {
    return { ok: false, stage: "schema", errors: ["not a visual spec"], violations: [] };
  }
  let spec: VisualSpec;
  try {
    spec = tidySpec(input);
  } catch (e) {
    return { ok: false, stage: "schema", errors: [`malformed spec: ${(e as Error).message}`], violations: [] };
  }
  const shapeErrors = checkShape(spec);
  if (shapeErrors.length) return { ok: false, stage: "schema", errors: shapeErrors, violations: [] };

  // Numbers the presenter did not say come out of the text; the visual still shows.
  const notes: string[] = [];
  const found = scanSpec(spec, opts.said ?? []);
  if (found.length) {
    spec = scrubNumbers(spec, found);
    notes.push(`Took out numbers you did not say: ${[...new Set(found.map((v) => v.match))].join(", ")}`);
    const violations = scanSpec(spec, opts.said ?? []);
    const stillBad = [...checkShape(spec), ...violations.map((v) => `${v.field}: "${v.match}" (${v.why})`)];
    if (stillBad.length) return { ok: false, stage: "grounding", errors: stillBad, violations };
  }

  try {
    const visual = resolve(spec, tables, opts.said ?? [], notes);
    return { ok: true, visual, spec, notes };
  } catch (e) {
    if (e instanceof RefError) return { ok: false, stage: "data", errors: [e.message], violations: [] };
    return { ok: false, stage: "schema", errors: [`malformed spec: ${(e as Error).message}`], violations: [] };
  }
}

/** Formatting info for a resolved value: its data column, or the unit it was said in. */
function columnOf(v: ResolvedValue, tables: DataTable[]): Pick<DataColumn, "kind" | "decimals" | "currency"> {
  if (v.table === "said") return { kind: v.kind, decimals: 1, currency: v.display.match(/^[^\d−-]+/)?.[0] ?? null };
  return findColumn(findTable(tables, v.table), v.column);
}

function resolve(spec: VisualSpec, tables: DataTable[], said: SpokenNumber[], notes: string[] = []): ResolvedVisual {
  const opts: ResolveOptions = { compact: true, said, notes };
  switch (spec.template) {
    case "metric": {
      const value = resolveScalar(spec.value, tables, opts);
      if (!value) throw new RefError("metric needs a value");
      const baseline = resolveScalar(spec.baseline, tables, opts);
      const trend = resolveSeries(spec.trend, tables, opts);
      let delta: ResolvedDelta | null = null;
      if (baseline) {
        if (baseline.table !== value.table || baseline.column !== value.column) {
          throw new RefError("baseline must come from the same column as the value");
        }
        const col = columnOf(value, tables);
        const diff = value.value - baseline.value;
        const direction = Math.abs(diff) < 1e-9 ? "flat" : diff > 0 ? "up" : "down";
        delta = { display: formatDelta(diff, col, baseline.value), direction, since: baseline.rowLabel };
      }
      return {
        template: "metric",
        title: spec.title,
        caption: spec.caption,
        value,
        delta,
        trend: trend && trend.points.length > 1 ? trend : null,
        accent: metricAccent(spec, delta?.direction ?? null),
      };
    }
    case "line": {
      const series = resolveSeries(spec.series, tables, opts);
      if (!series || series.points.length < 2) throw new RefError("line chart needs at least two points");
      // Extra lines: one that cannot be resolved is left out, the chart still shows.
      const more = (spec.more_series ?? []).flatMap((m) => {
        try {
          const r = resolveSeries(m.series, tables, opts);
          return r && r.points.length > 0 ? [{ name: m.name || r.yColumn, series: r }] : [];
        } catch (e) {
          if (!(e instanceof RefError)) throw e;
          opts.notes?.push(`Left out the ${m.name || "extra"} line: ${e.message}`);
          return [];
        }
      });
      return { template: "line", title: spec.title, subtitle: spec.subtitle, name: spec.series_name || (more.length ? series.yColumn : ""), series, more, accent: "blue" };
    }
    case "bar": {
      const series = resolveSeries(spec.series, tables, opts);
      if (!series) throw new RefError("bar chart needs a series");
      return {
        template: "bar",
        title: spec.title,
        subtitle: spec.subtitle,
        series: { ...series, points: series.points.slice(0, 30) },
        highlightIndex: labelIndex(series, spec.highlight_label),
        accent: "blue",
      };
    }
    case "funnel": {
      const steps = resolveSeries(spec.steps, tables, opts);
      if (!steps || steps.points.length < 2) throw new RefError("funnel needs at least two steps");
      const col = steps.table === "said" ? { kind: steps.kind, decimals: 1, currency: null } : findColumn(findTable(tables, steps.table), steps.yColumn);
      const drops = steps.points.map((p, i) => {
        if (i === 0) return null;
        const prev = steps.points[i - 1].value;
        return formatDelta(p.value - prev, col, prev);
      });
      return {
        template: "funnel",
        title: spec.title,
        subtitle: spec.subtitle,
        steps: { ...steps, points: steps.points.slice(0, 6) },
        highlightIndex: labelIndex(steps, spec.highlight_step),
        drops: drops.slice(0, 6),
        accent: "blue",
      };
    }
    case "comparison": {
      const side = (s: typeof spec.a) => ({ label: s.label, value: resolveScalar(s.value, tables, opts), points: s.points });
      return { template: "comparison", title: spec.title, a: side(spec.a), b: side(spec.b), favor: spec.favor, accent: "blue" };
    }
    case "strategy":
      return { template: "strategy", title: spec.title, reveal: spec.reveal, points: spec.points, accent: "blue" };
    case "roadmap":
      return { template: "roadmap", title: spec.title, reveal: spec.reveal, items: spec.items, accent: "blue" };
    case "process":
      return { template: "process", title: spec.title, reveal: spec.reveal, steps: spec.steps, accent: "blue" };
    case "ui_sketch":
      return {
        template: "ui_sketch",
        title: spec.title,
        caption: spec.caption,
        window_title: spec.window_title,
        sidebar: spec.sidebar,
        heading: spec.heading,
        blocks: spec.blocks,
        accent: "blue",
      };
    case "statement":
      return { template: "statement", title: spec.title, kicker: spec.kicker, text: spec.text, accent: "blue" };
    case "goal": {
      const from = resolveScalar(spec.from, tables, opts);
      const to = resolveScalar(spec.to, tables, opts);
      if (!from || !to) throw new RefError("goal needs a from value and a to value");
      const diff = to.value - from.value;
      const direction = Math.abs(diff) < 1e-9 ? "flat" : diff > 0 ? "up" : "down";
      const good = spec.good_direction === "down" ? "down" : "up";
      return {
        template: "goal",
        title: spec.title,
        from,
        to,
        fromLabel: spec.from_label || from.rowLabel,
        toLabel: spec.to_label || to.rowLabel,
        change: { display: formatDelta(diff, columnOf(from, tables), from.value), direction, since: "" },
        accent: direction === "flat" ? "blue" : direction === good ? "green" : "red",
      };
    }
    case "drawing":
      return {
        template: "drawing",
        title: spec.title,
        caption: spec.caption,
        aspect: spec.aspect,
        elements: spec.elements,
        pending: spec.status === "drawing" && spec.elements.length === 0,
        live: spec.status === "drawing",
        accent: "blue",
      };
    case "diagram": {
      const d = resolveDiagram(spec);
      if (d.regions.length + d.nodes.length + d.paths.length + d.markers.length === 0) {
        throw new RefError("diagram has nothing to draw");
      }
      return d;
    }
  }
}
