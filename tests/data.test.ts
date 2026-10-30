import { describe, expect, it } from "vitest";
import { buildTable, describeCatalog, formatDelta, formatValue, parseCell } from "../shared/data";
import { sampleCatalog } from "./helpers";

describe("parseCell", () => {
  it("parses percents, currency and plain numbers", () => {
    expect(parseCell("31.0%")).toMatchObject({ kind: "percent", value: 31, decimals: 1 });
    expect(parseCell("$1,234.50")).toMatchObject({ kind: "currency", value: 1234.5, currency: "$" });
    expect(parseCell("(250)")).toMatchObject({ kind: "number", value: -250 });
    expect(parseCell("2026-06-29")).toMatchObject({ kind: "date", value: "2026-06-29" });
    expect(parseCell("W1")).toMatchObject({ kind: "text", value: "W1" });
  });
});

describe("sample catalog", () => {
  const [metrics, funnel] = sampleCatalog();

  it("types the q3 metrics table", () => {
    expect(metrics.name).toBe("q3_metrics");
    expect(metrics.rows).toHaveLength(13);
    expect(metrics.columns.map((c) => [c.name, c.kind])).toEqual([
      ["week", "text"],
      ["week_start", "date"],
      ["activation_rate", "percent"],
    ]);
    expect(metrics.labelColumn).toBe("week");
    expect(metrics.rows[0].activation_rate).toBe(31);
    expect(metrics.rows[12].activation_rate).toBe(44);
  });

  it("types the funnel table", () => {
    expect(funnel.name).toBe("onboarding_funnel");
    expect(funnel.rows.map((r) => r.share_of_signups)).toEqual([100, 86, 49, 44]);
    expect(funnel.labelColumn).toBe("step");
  });

  it("describes the catalog for the prompt", () => {
    const text = describeCatalog(sampleCatalog());
    expect(text).toContain('Table "q3_metrics" (13 rows');
    expect(text).toContain("activation_rate (percent)");
    expect(text).toContain("Set up workspace | 49%");
  });
});

describe("formatting", () => {
  it("formats values and deltas", () => {
    const pct = { kind: "percent" as const, decimals: 1, currency: null };
    expect(formatValue(44, pct)).toBe("44%");
    expect(formatValue(31.8, pct)).toBe("31.8%");
    expect(formatDelta(13, pct, 31)).toBe("+13 pts");
    expect(formatDelta(-37, { kind: "percent", decimals: 0, currency: null }, 86)).toBe("−37 pts");
    const usd = { kind: "currency" as const, decimals: 0, currency: "$" };
    expect(formatValue(1250000, usd, { compact: true })).toBe("$1.3M");
  });

  it("treats fractional rates as percentages", () => {
    const t = buildTable("x.csv", null, ["week", "conversion_rate"], [["a", "0.31"], ["b", "0.44"]]);
    expect(t.columns[1].kind).toBe("percent");
    expect(t.rows[1].conversion_rate).toBe(44);
  });
});
