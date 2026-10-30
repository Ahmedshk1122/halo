// Turns a visual spec into a resolved visual: data references become real
// values from the catalog, text is checked and tidied, and anything that
// cannot be grounded rejects the visual.

import { formatDelta, formatLabel, formatValue, normalizeName, type DataColumn, type DataTable } from "./data";
import { scanSpec, type GroundingViolation } from "./grounding";
import type {
  Accent,
  ResolvedDelta,
  MetricSpec,
  ResolvedSeries,
  ResolvedValue,
  ResolvedVisual,
  ScalarRef,
  SeriesRef,
  VisualSpec,
} from "./visuals";

export type PrepareResult =
  | { ok: true; visual: ResolvedVisual; spec: VisualSpec }
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

/** Resolves a single-cell reference. Returns null when pick is "none". */
export function resolveScalar(ref: ScalarRef, tables: DataTable[], opts: { compact?: boolean } = {}): ResolvedValue | null {
  if (ref.pick === "none") return null;
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
export function resolveSeries(ref: SeriesRef, tables: DataTable[]): ResolvedSeries | null {
  if (!ref.table) return null;
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

export function tidy(text: string, max = 120): string {
  let t = (text ?? "").replace(EMOJI, "").replace(/!+/g, ".").replace(/\s+/g, " ").trim();
  t = t.replace(/\.\.+$/, ".").replace(/\s+\./g, ".");
  if (t.length > max) {
    t = t.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + "…";
  }
  return t;
}

function tidyList(items: string[], maxItems: number, maxLen: number): string[] {
  return (items ?? []).map((s) => tidy(s, maxLen)).filter(Boolean).slice(0, maxItems);
}

/** Applies copy rules and limits. Returns a cleaned copy of the spec. */
export function tidySpec(spec: VisualSpec): VisualSpec {
  const base = { title: tidy(spec.title, 44), aliases: (spec.aliases ?? []).map((a) => a.toLowerCase().trim()).filter(Boolean).slice(0, 8) };
  switch (spec.template) {
    case "metric":
      return { ...spec, ...base, caption: tidy(spec.caption, 60) };
    case "line":
    case "bar":
      return { ...spec, ...base, subtitle: tidy(spec.subtitle, 60) };
    case "funnel":
      return { ...spec, ...base, subtitle: tidy(spec.subtitle, 60) };
    case "comparison":
      return {
        ...spec,
        ...base,
        a: { ...spec.a, label: tidy(spec.a.label, 28), points: tidyList(spec.a.points, 4, 48) },
        b: { ...spec.b, label: tidy(spec.b.label, 28), points: tidyList(spec.b.points, 4, 48) },
      };
    case "strategy":
      return {
        ...spec,
        ...base,
        points: spec.points.slice(0, 4).map((p) => ({ ...p, text: tidy(p.text, 52), detail: tidy(p.detail, 64), cue: p.cue ?? "" })),
      };
    case "roadmap":
      return {
        ...spec,
        ...base,
        items: spec.items.slice(0, 6).map((p) => ({ ...p, when: tidy(p.when, 16), label: tidy(p.label, 32), detail: tidy(p.detail, 48), cue: p.cue ?? "" })),
      };
    case "process":
      return {
        ...spec,
        ...base,
        steps: spec.steps.slice(0, 5).map((p) => ({ ...p, label: tidy(p.label, 28), detail: tidy(p.detail, 48), cue: p.cue ?? "" })),
      };
    case "ui_sketch":
      return {
        ...spec,
        ...base,
        caption: tidy(spec.caption, 60),
        window_title: tidy(spec.window_title, 28),
        heading: tidy(spec.heading, 36),
        sidebar: tidyList(spec.sidebar, 6, 18),
        blocks: spec.blocks.slice(0, 4).map((b) => ({ ...b, label: tidy(b.label, 32), items: tidyList(b.items, 6, 24) })),
      };
    case "statement":
      return { ...spec, ...base, kicker: tidy(spec.kicker, 28), text: tidy(spec.text, 90) };
  }
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

/** The whole pipeline: tidy → shape → resolve data → scan text. */
export function prepareVisual(input: VisualSpec, tables: DataTable[]): PrepareResult {
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

  const violations = scanSpec(spec);
  if (violations.length) {
    return {
      ok: false,
      stage: "grounding",
      errors: violations.map((v) => `${v.field}: "${v.match}" (${v.why})`),
      violations,
    };
  }

  try {
    const visual = resolve(spec, tables);
    return { ok: true, visual, spec };
  } catch (e) {
    if (e instanceof RefError) return { ok: false, stage: "data", errors: [e.message], violations: [] };
    return { ok: false, stage: "schema", errors: [`malformed spec: ${(e as Error).message}`], violations: [] };
  }
}

function resolve(spec: VisualSpec, tables: DataTable[]): ResolvedVisual {
  switch (spec.template) {
    case "metric": {
      const value = resolveScalar(spec.value, tables, { compact: true });
      if (!value) throw new RefError("metric needs a value");
      const baseline = resolveScalar(spec.baseline, tables, { compact: true });
      const trend = resolveSeries(spec.trend, tables);
      let delta: ResolvedDelta | null = null;
      if (baseline) {
        if (baseline.table !== value.table || baseline.column !== value.column) {
          throw new RefError("baseline must come from the same column as the value");
        }
        const table = findTable(tables, value.table);
        const col = findColumn(table, value.column);
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
      const series = resolveSeries(spec.series, tables);
      if (!series || series.points.length < 2) throw new RefError("line chart needs at least two points");
      return { template: "line", title: spec.title, subtitle: spec.subtitle, series, accent: "blue" };
    }
    case "bar": {
      const series = resolveSeries(spec.series, tables);
      if (!series) throw new RefError("bar chart needs a series");
      return {
        template: "bar",
        title: spec.title,
        subtitle: spec.subtitle,
        series: { ...series, points: series.points.slice(0, 12) },
        highlightIndex: labelIndex(series, spec.highlight_label),
        accent: "blue",
      };
    }
    case "funnel": {
      const steps = resolveSeries(spec.steps, tables);
      if (!steps || steps.points.length < 2) throw new RefError("funnel needs at least two steps");
      const table = findTable(tables, steps.table);
      const col = findColumn(table, steps.yColumn);
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
      const side = (s: typeof spec.a) => ({ label: s.label, value: resolveScalar(s.value, tables, { compact: true }), points: s.points });
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
  }
}
