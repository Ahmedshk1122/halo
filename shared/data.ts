// The data catalog. Each loaded CSV/XLSX sheet becomes a table with typed
// columns. These tables are the only source of numbers Halo ever shows.

import type { ColumnKind } from "./visuals";

export type CellValue = number | string | null;

export interface DataColumn {
  name: string;
  kind: ColumnKind;
  /** Decimal places seen in the source, used when formatting. */
  decimals: number;
  /** Currency symbol for currency columns. */
  currency: string | null;
}

export interface DataTable {
  /** Catalog name, e.g. "q3_metrics" (file name, plus sheet name for multi-sheet workbooks). */
  name: string;
  file: string;
  sheet: string | null;
  columns: DataColumn[];
  /** Numbers for numeric kinds (percent values are in percent units: 31.0 for 31%). */
  rows: Record<string, CellValue>[];
  /** Column used to label rows ("W13", "Set up workspace"). */
  labelColumn: string;
}

export function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// Parsing raw cells
// ---------------------------------------------------------------------------

const CURRENCY = /^[$€£¥]/;
const NUMERIC = /^[+\-−]?\d[\d,]*(\.\d+)?$|^[+\-−]?\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/;
const US_DATE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

interface ParsedCell {
  kind: "number" | "percent" | "currency" | "date" | "text" | "empty";
  value: CellValue;
  decimals: number;
  currency: string | null;
}

function decimalsOf(s: string): number {
  const m = s.match(/\.(\d+)/);
  return m ? m[1].length : 0;
}

export function parseCell(raw: unknown): ParsedCell {
  if (raw === null || raw === undefined) return { kind: "empty", value: null, decimals: 0, currency: null };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { kind: "empty", value: null, decimals: 0, currency: null };
    return { kind: "number", value: raw, decimals: decimalsOf(String(raw)), currency: null };
  }
  if (raw instanceof Date) {
    return { kind: "date", value: raw.toISOString().slice(0, 10), decimals: 0, currency: null };
  }
  let s = String(raw).trim();
  if (s === "") return { kind: "empty", value: null, decimals: 0, currency: null };
  // Accounting negatives: (1,234)
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  let currency: string | null = null;
  if (CURRENCY.test(s)) {
    currency = s[0];
    s = s.slice(1).trim();
  }
  let percent = false;
  if (s.endsWith("%")) {
    percent = true;
    s = s.slice(0, -1).trim();
  }
  if (NUMERIC.test(s)) {
    const n = Number(s.replace(/,/g, "").replace("−", "-")) * (negative ? -1 : 1);
    if (Number.isFinite(n)) {
      const kind = percent ? "percent" : currency ? "currency" : "number";
      return { kind, value: n, decimals: decimalsOf(s), currency };
    }
  }
  const original = String(raw).trim();
  if (ISO_DATE.test(original)) return { kind: "date", value: original.slice(0, 10), decimals: 0, currency: null };
  if (US_DATE.test(original)) {
    const [m, d, y] = original.split("/").map(Number);
    const year = y < 100 ? 2000 + y : y;
    return {
      kind: "date",
      value: `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      decimals: 0,
      currency: null,
    };
  }
  return { kind: "text", value: original, decimals: 0, currency: null };
}

const PERCENT_NAME = /(rate|pct|percent|share|ratio|conversion|retention|churn|margin)/i;

/** Builds a typed table from header names and raw rows. */
export function buildTable(file: string, sheet: string | null, headers: string[], rawRows: unknown[][]): DataTable {
  const base = normalizeName(file);
  const name = sheet ? `${base}_${normalizeName(sheet)}` : base;
  const cleanHeaders = headers.map((h, i) => (String(h ?? "").trim() || `column_${i + 1}`));
  const parsed = rawRows
    .filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""))
    .map((r) => cleanHeaders.map((_, i) => parseCell(r[i])));

  // Fractions in a column named like a rate are percentages: 0.31 → 31%.
  const fractional: boolean[] = [];
  const columns: DataColumn[] = cleanHeaders.map((h, ci) => {
    const cells = parsed.map((r) => r[ci]).filter((c) => c.kind !== "empty");
    const kinds = new Set(cells.map((c) => c.kind));
    let kind: ColumnKind = "text";
    if (cells.length > 0 && kinds.size === 1) {
      const only = [...kinds][0];
      kind = only === "empty" ? "text" : only;
    } else if (cells.length > 0 && [...kinds].every((k) => k === "number" || k === "percent" || k === "currency")) {
      kind = kinds.has("percent") ? "percent" : kinds.has("currency") ? "currency" : "number";
    }
    const decimals = Math.max(0, ...cells.map((c) => c.decimals));
    const currency = cells.find((c) => c.currency)?.currency ?? null;
    const isFraction =
      kind === "number" &&
      PERCENT_NAME.test(h) &&
      cells.every((c) => typeof c.value === "number" && c.value >= 0 && c.value <= 1);
    fractional.push(isFraction);
    if (isFraction) return { name: h, kind: "percent", decimals: Math.max(0, decimals - 2), currency: null };
    return { name: h, kind, decimals, currency };
  });

  const rows = parsed.map((r) => {
    const row: Record<string, CellValue> = {};
    columns.forEach((col, ci) => {
      let v = r[ci].value;
      if (fractional[ci] && typeof v === "number") v = Math.round(v * 100 * 1e6) / 1e6;
      if ((col.kind === "text" || col.kind === "date") && v !== null) v = String(v);
      row[col.name] = v;
    });
    return row;
  });

  const label = columns.find((c) => c.kind === "text") ?? columns.find((c) => c.kind === "date") ?? columns[0];
  return { name, file, sheet, columns, rows, labelColumn: label?.name ?? "" };
}

// ---------------------------------------------------------------------------
// Formatting (all numbers on screen pass through here)
// ---------------------------------------------------------------------------

function fixed(n: number, decimals: number): string {
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: Math.min(decimals, 2) });
  return s;
}

function compact(n: number, decimals: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${fixed(n / 1e9, 1)}B`;
  if (abs >= 1e6) return `${fixed(n / 1e6, 1)}M`;
  if (abs >= 1e4) return `${fixed(n / 1e3, 1)}K`;
  return fixed(n, decimals);
}

export function formatValue(value: number, col: Pick<DataColumn, "kind" | "decimals" | "currency">, opts: { compact?: boolean } = {}): string {
  const body = opts.compact ? compact(value, col.decimals) : fixed(value, col.decimals);
  switch (col.kind) {
    case "percent":
      return `${fixed(value, col.decimals)}%`;
    case "currency": {
      const sym = col.currency ?? "$";
      return value < 0 ? `−${sym}${body.replace("-", "")}` : `${sym}${body}`;
    }
    default:
      return body.replace("-", "−");
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatLabel(value: CellValue, kind: ColumnKind): string {
  if (value === null) return "";
  if (kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const m = Number(value.slice(5, 7));
    const d = Number(value.slice(8, 10));
    return `${MONTHS[m - 1]} ${d}`;
  }
  if (typeof value === "number") return value.toLocaleString("en-US");
  return value;
}

/** Difference between two values of the same column, formatted for a delta. */
export function formatDelta(diff: number, col: Pick<DataColumn, "kind" | "decimals" | "currency">, base: number): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const abs = Math.abs(diff);
  if (col.kind === "percent") return `${sign}${fixed(abs, col.decimals)} pts`;
  if (base !== 0) {
    const rel = (abs / Math.abs(base)) * 100;
    return `${sign}${fixed(rel, rel < 10 ? 1 : 0)}%`;
  }
  return `${sign}${formatValue(abs, col, { compact: true })}`;
}

// ---------------------------------------------------------------------------
// Catalog summary for prompts
// ---------------------------------------------------------------------------

export interface CatalogSummaryOptions {
  sampleRows?: number;
}

/** Compact, deterministic description of the loaded data for the director prompt. */
export function describeCatalog(tables: DataTable[], { sampleRows = 4 }: CatalogSummaryOptions = {}): string {
  if (tables.length === 0) return "No data loaded. Do not show any numbers.";
  return tables
    .map((t) => {
      const cols = t.columns.map((c) => `${c.name} (${c.kind})`).join(", ");
      const showAll = t.rows.length <= 16;
      const rows = showAll ? t.rows : [...t.rows.slice(0, sampleRows), ...t.rows.slice(-2)];
      const fmt = (r: Record<string, unknown>) =>
        t.columns
          .map((c) => {
            const v = r[c.name];
            if (v === null || v === undefined) return "";
            if (typeof v === "number") return formatValue(v, c);
            return String(v);
          })
          .join(" | ");
      const lines = rows.map(fmt);
      if (!showAll) lines.splice(sampleRows, 0, `… ${t.rows.length - sampleRows - 2} more rows …`);
      return `Table "${t.name}" (${t.rows.length} rows, label column "${t.labelColumn}")\nColumns: ${cols}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}
