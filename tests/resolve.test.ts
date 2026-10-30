import { describe, expect, it } from "vitest";
import { prepareVisual } from "../shared/resolve";
import type { FunnelSpec, MetricSpec, StrategySpec } from "../shared/visuals";
import { sampleCatalog } from "./helpers";

const catalog = sampleCatalog();

const metric: MetricSpec = {
  template: "metric",
  title: "Activation rate",
  caption: "Weekly, this quarter",
  aliases: ["activation"],
  value: { table: "q3_metrics", column: "activation_rate", pick: "last", match_column: "", match_value: "" },
  baseline: { table: "q3_metrics", column: "activation_rate", pick: "first", match_column: "", match_value: "" },
  trend: { table: "q3_metrics", x: "week", y: "activation_rate", filter_column: "", filter_value: "" },
  good_direction: "up",
};

describe("prepareVisual", () => {
  it("resolves a metric card from data", () => {
    const r = prepareVisual(metric, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok || r.visual.template !== "metric") return;
    expect(r.visual.value.display).toBe("44%");
    expect(r.visual.delta).toEqual({ display: "+13 pts", direction: "up", since: "W1" });
    expect(r.visual.trend?.points).toHaveLength(13);
    expect(r.visual.accent).toBe("green");
  });

  it("resolves a funnel with drops and a highlighted step", () => {
    const funnel: FunnelSpec = {
      template: "funnel",
      title: "Onboarding funnel",
      subtitle: "Share of sign-ups reaching each step",
      aliases: ["funnel"],
      steps: { table: "onboarding_funnel", x: "step", y: "share_of_signups", filter_column: "", filter_value: "" },
      highlight_step: "set up workspace",
    };
    const r = prepareVisual(funnel, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok || r.visual.template !== "funnel") return;
    expect(r.visual.steps.points.map((p) => p.display)).toEqual(["100%", "86%", "49%", "44%"]);
    expect(r.visual.drops).toEqual([null, "−14 pts", "−37 pts", "−5 pts"]);
    expect(r.visual.highlightIndex).toBe(2);
  });

  it("drops visuals whose references do not resolve", () => {
    const r = prepareVisual({ ...metric, value: { ...metric.value, column: "revenue" } }, catalog);
    expect(r).toMatchObject({ ok: false, stage: "data" });
  });

  it("matches rows by label", () => {
    const r = prepareVisual(
      { ...metric, value: { ...metric.value, pick: "match", match_column: "week", match_value: "W7" }, baseline: { ...metric.baseline, pick: "none" } },
      catalog,
    );
    expect(r.ok && r.visual.template === "metric" && r.visual.value.display).toBe("36.2%");
  });

  it("rejects typed numbers in text fields", () => {
    const r = prepareVisual({ ...metric, title: "Activation hit 44%" }, catalog);
    expect(r).toMatchObject({ ok: false, stage: "grounding" });
  });

  it("tidies copy: no exclamation marks or emoji", () => {
    const strategy: StrategySpec = {
      template: "strategy",
      title: "Three moves!",
      aliases: [],
      reveal: "progressive",
      points: [
        { icon: "layout-template", text: "Templates, not a blank page 🚀", detail: "", cue: "templates" },
        { icon: "download", text: "Import from your tools", detail: "", cue: "imports" },
      ],
    };
    const r = prepareVisual(strategy, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok || r.visual.template !== "strategy") return;
    expect(r.visual.title).toBe("Three moves.");
    expect(r.visual.points[0].text).toBe("Templates, not a blank page");
  });
});
