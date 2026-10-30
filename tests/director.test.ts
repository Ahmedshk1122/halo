import { describe, expect, it } from "vitest";
import { directorTools, plannerTools, specFromToolInput, toolCallToDecision, type JsonSchema } from "../shared/director";
import { prepareVisual } from "../shared/resolve";
import { contextBlock, userMessage, DIRECTOR_SYSTEM } from "../server/director/prompt";
import replay from "../fixtures/replay_onboarding.json";
import { sampleCatalog } from "./helpers";

/** Walks a schema and checks the strict-mode rules we rely on. */
function checkStrict(schema: JsonSchema, path: string, issues: string[]) {
  if ("anyOf" in schema || "oneOf" in schema || Array.isArray(schema.type)) issues.push(`${path}: union type`);
  if (schema.type === "object") {
    const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
    const required = (schema.required ?? []) as string[];
    if (schema.additionalProperties !== false) issues.push(`${path}: additionalProperties must be false`);
    for (const key of Object.keys(props)) {
      if (!required.includes(key)) issues.push(`${path}.${key}: optional`);
      checkStrict(props[key], `${path}.${key}`, issues);
    }
  }
  if (schema.type === "array") checkStrict(schema.items as JsonSchema, `${path}[]`, issues);
}

describe("director tools", () => {
  it("are strict-mode safe: no unions, no optionals, closed objects", () => {
    const tools = [...directorTools(), ...plannerTools()];
    const issues: string[] = [];
    for (const t of tools) checkStrict(t.input_schema, t.name, issues);
    expect(issues).toEqual([]);
    expect(directorTools().length).toBeLessThanOrEqual(20);
  });

  it("are deterministic so the prompt prefix caches", () => {
    expect(JSON.stringify(directorTools())).toBe(JSON.stringify(directorTools()));
  });

  it("map tool calls to decisions", () => {
    const show = toolCallToDecision("show_statement", { reason: "r", beat: "b", arc: "a", replace_id: "", tuck_ids: ["v1"], title: "The ask", aliases: [], kicker: "The ask", text: "Back the plan" });
    expect(show).toMatchObject({ action: "show", tuckIds: ["v1"], visual: { template: "statement", text: "Back the plan" } });
    const update = toolCallToDecision("show_strategy", { reason: "", beat: "", arc: "", replace_id: "v3", tuck_ids: [], title: "Moves", aliases: [], reveal: "progressive", points: [] });
    expect(update).toMatchObject({ action: "update", targetIds: ["v3"] });
    expect(toolCallToDecision("act", { action: "recall", target_ids: ["v2"], reason: "", beat: "", arc: "" })).toMatchObject({ action: "recall", targetIds: ["v2"] });
    expect(toolCallToDecision("nonsense", {}).action).toBe("none");
  });

  it("rebuilds clean specs without the decision fields", () => {
    const spec = specFromToolInput("statement", { reason: "x", beat: "y", arc: "z", replace_id: "", tuck_ids: [], title: "T", aliases: ["a"], kicker: "K", text: "Line" });
    expect(spec).toEqual({ template: "statement", title: "T", aliases: ["a"], kicker: "K", text: "Line" });
  });
});

describe("replay fixtures", () => {
  it("every recorded visual resolves and passes grounding against the sample data", () => {
    const catalog = sampleCatalog();
    for (const f of (replay as { fixtures: { tool: string; input: Record<string, unknown> }[] }).fixtures) {
      const d = toolCallToDecision(f.tool, f.input);
      if (!d.visual) continue;
      const r = prepareVisual(d.visual, catalog);
      expect(r.ok, `${f.tool}: ${r.ok ? "" : r.errors.join("; ")}`).toBe(true);
    }
  });
});

describe("director prompt", () => {
  it("keeps volatile context out of the system prompt", () => {
    expect(DIRECTOR_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    const msg = userMessage({
      arc: "",
      beat: "",
      transcript: [
        { text: "Hi everyone", ageSec: 12, isNew: false },
        { text: "Activation went from 31 to 44%", ageSec: 1, isNew: true },
      ],
      onScreen: [],
      chips: [{ id: "v1", template: "metric", title: "Activation rate" }],
      history: [],
      secondsSinceLastShow: null,
      catalog: "",
      prepared: [],
      proactivity: "balanced",
      request: null,
    });
    expect(msg).toContain("<just_said>\n[1s ago] Activation went from 31 to 44%");
    expect(msg).toContain('- v1 metric "Activation rate"');
    expect(contextBlock({ catalog: "Table x", prepared: [] })).toContain("<prepared_visuals>\nNone.");
  });
});
