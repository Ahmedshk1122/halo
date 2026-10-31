import { describe, expect, it } from "vitest";
import { matchVisual, parseCommand } from "../src/control/director/commands";
import type { VisualInstance } from "../src/control/state";

const cmd = (t: string) => parseCommand(t)?.command ?? null;

describe("parseCommand", () => {
  it("understands addressed commands", () => {
    expect(cmd("Halo, back to the funnel.")).toEqual({ kind: "recall", query: "funnel" });
    expect(cmd("Halo, back")).toEqual({ kind: "back" });
    expect(cmd("Halo, clear.")).toEqual({ kind: "clear" });
    expect(cmd("Hey Halo, show the roadmap")).toEqual({ kind: "show", query: "roadmap" });
    expect(cmd("Hello, show me the funnel again")).toEqual({ kind: "recall", query: "funnel" });
    expect(cmd("Halo, hide that")).toEqual({ kind: "hide", query: "" });
    expect(cmd("Halo, remove that chart")).toEqual({ kind: "remove", query: "" });
    expect(cmd("Halo, get rid of the funnel")).toEqual({ kind: "remove", query: "funnel" });
    expect(cmd("Halo next")).toEqual({ kind: "next" });
  });

  it("understands natural recalls", () => {
    expect(cmd("Let's go back to the funnel for a second.")).toEqual({ kind: "recall", query: "funnel for a second" });
    expect(parseCommand("Going back to the funnel")?.addressed).toBe(false);
  });

  it("understands natural removal, without the wake word", () => {
    expect(cmd("Okay, take that away.")).toEqual({ kind: "hide", query: "" });
    expect(cmd("Let's get rid of the chart.")).toEqual({ kind: "remove", query: "" });
    expect(cmd("Remove the funnel please")).toEqual({ kind: "remove", query: "funnel" });
    expect(cmd("Can you clear the screen?")).toEqual({ kind: "clear" });
  });

  it("ignores ordinary speech", () => {
    expect(cmd("We need to remove friction from onboarding.")).toBeNull();
    expect(cmd("We will remove it from the flow in January.")).toBeNull();
    expect(cmd("Hello everyone, thanks for joining.")).toBeNull();
    expect(cmd("Activation went from 31 to 44%.")).toBeNull();
    expect(cmd("Show of hands, who has tried it?")).toBeNull();
  });
});

describe("matchVisual", () => {
  const v = (id: string, template: VisualInstance["visual"]["template"], title: string, aliases: string[] = []) =>
    ({ id, title, aliases, createdAt: Number(id.slice(1)), visual: { template, title } }) as unknown as VisualInstance;
  const visuals = [v("v1", "metric", "Activation rate", ["activation"]), v("v2", "funnel", "Onboarding funnel", ["drop-off"]), v("v5", "roadmap", "Rollout")];

  it("finds visuals by title, alias or kind", () => {
    expect(matchVisual("funnel for a second", visuals)?.id).toBe("v2");
    expect(matchVisual("the activation number", visuals)?.id).toBe("v1");
    expect(matchVisual("timeline", visuals)?.id).toBe("v5");
    expect(matchVisual("pricing", visuals)).toBeNull();
  });
});
