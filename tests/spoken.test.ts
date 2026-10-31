import { describe, expect, it } from "vitest";
import { prepareVisual } from "../shared/resolve";
import { spokenNumbers, wasSaid } from "../shared/spoken";
import type { GoalSpec } from "../shared/visuals";
import { steadyPoint } from "../src/control/hands/pointing";

const values = (t: string) => spokenNumbers(t).map((n) => [n.value, n.unit, n.currency]);

describe("spokenNumbers", () => {
  it("reads numbers the way recognizers write them", () => {
    expect(values("We are at $100,000 in revenue today")).toEqual([[100000, "currency", "$"]]);
    expect(values("we want 200k next year")).toEqual([[200000, "number", null]]);
    expect(values("about 1.5 million dollars")).toEqual([[1500000, "currency", "$"]]);
    expect(values("activation went from 31 to 44%")).toEqual([
      [31, "number", null],
      [44, "percent", null],
    ]);
    expect(values("two hundred thousand dollars")).toEqual([[200000, "currency", "$"]]);
    expect(values("a hundred thousand users")).toEqual([[100000, "number", null]]);
    expect(values("fifty percent")).toEqual([[50, "percent", null]]);
    expect(values("Rs 5 lakh")).toEqual([[500000, "currency", "Rs"]]);
  });

  it("ignores small item counts", () => {
    expect(values("three moves and two ideas")).toEqual([]);
  });

  it("matches said values with rounding", () => {
    expect(wasSaid(1500000, spokenNumbers("1.5 million"))).toBe(true);
    expect(wasSaid(150000, spokenNumbers("1.5 million"))).toBe(false);
  });
});

const goal: GoalSpec = {
  template: "goal",
  title: "Revenue",
  aliases: [],
  from: { table: "", column: "", pick: "said", match_column: "", match_value: "", said_value: 100000, said_unit: "currency", said_currency: "$", said_label: "Today" },
  to: { table: "", column: "", pick: "said", match_column: "", match_value: "", said_value: 200000, said_unit: "currency", said_currency: "$", said_label: "Target" },
  from_label: "Today",
  to_label: "Tomorrow",
  good_direction: "up",
};

describe("numbers the presenter said", () => {
  it("go on screen when they were said", () => {
    const r = prepareVisual(goal, [], { said: spokenNumbers("we're at $100,000 today versus $200,000 tomorrow") });
    expect(r.ok).toBe(true);
    if (!r.ok || r.visual.template !== "goal") return;
    expect(r.visual.from.display).toBe("$100K");
    expect(r.visual.to.display).toBe("$200K");
    expect(r.visual.change).toMatchObject({ display: "+100%", direction: "up" });
    expect(r.visual.accent).toBe("green");
  });

  it("are refused when the AI makes them up", () => {
    const r = prepareVisual(goal, [], { said: spokenNumbers("we're at $100,000 today") });
    expect(r).toMatchObject({ ok: false, stage: "data" });
  });

  it("may appear in text when said", () => {
    const r = prepareVisual({ ...goal, title: "From $100K to $200K" }, [], { said: spokenNumbers("$100,000 now and 200k later") });
    expect(r.ok).toBe(true);
    const bad = prepareVisual({ ...goal, title: "Up to $300K" }, [], { said: spokenNumbers("$100,000 now and 200k later") });
    expect(bad).toMatchObject({ ok: false, stage: "grounding" });
  });
});

describe("pointing memory", () => {
  const sample = (t: number, x: number, y: number, pointing = true) => ({ t, x, y, pointing });
  it("finds a spot held still, not a passing hand", () => {
    const held = Array.from({ length: 20 }, (_, i) => sample(1000 + i * 33, 400 + (i % 3), 300));
    expect(steadyPoint(0, 5000, 450, 60, held)).toMatchObject({ x: expect.closeTo(401, 0), y: 300 });
    const sweeping = Array.from({ length: 20 }, (_, i) => sample(1000 + i * 33, 200 + i * 40, 300));
    expect(steadyPoint(0, 5000, 450, 60, sweeping)).toBeNull();
    const brief = Array.from({ length: 6 }, (_, i) => sample(1000 + i * 33, 400, 300));
    expect(steadyPoint(0, 5000, 450, 60, brief)).toBeNull();
  });
});
