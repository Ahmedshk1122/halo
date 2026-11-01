import { describe, expect, it } from "vitest";
import { prepareVisual } from "../shared/resolve";
import { revealCount, type DiagramSpec } from "../shared/visuals";

const base: DiagramSpec = {
  template: "diagram",
  title: "How it works",
  caption: "",
  aliases: [],
  aspect: "square",
  reveal: "all",
  regions: [],
  nodes: [],
  links: [],
  paths: [],
  markers: [],
};

describe("diagram", () => {
  it("draws outlines the model gives as points, filled only when closed", () => {
    const r = prepareVisual(
      {
        ...base,
        paths: [
          { id: "body", label: "", points: [{ x: 40, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 90 }, { x: 40, y: 90 }], closed: true, filled: true, weight: "thin", arrow: false, tone: "muted", cue: "" },
          { id: "route", label: "", points: [{ x: 10, y: 10 }, { x: 90, y: 90 }], closed: false, filled: true, weight: "normal", arrow: true, tone: "accent", cue: "" },
        ],
        markers: [{ id: "h", label: "Heart", x: 53, y: 34, kind: "dot", tone: "highlight", cue: "" }],
      },
      [],
    );
    expect(r.ok).toBe(true);
    if (!r.ok || r.visual.template !== "diagram") return;
    expect(r.visual.paths.map((p) => p.filled)).toEqual([true, false]);
    expect(r.visual.markers[0]).toMatchObject({ x: 53, y: 34 });
  });

  it("lays out nodes the model stacked on one spot, and drops links to missing nodes", () => {
    const node = (id: string) => ({ id, label: id, detail: "", x: 0, y: 0, w: 0, h: 0, shape: "rect" as const, tone: "neutral" as const, icon: "none" as const, cue: "" });
    const r = prepareVisual(
      {
        ...base,
        nodes: [node("a"), node("b"), node("c")],
        links: [
          { from: "a", to: "b", label: "", style: "arrow", tone: "accent", cue: "" },
          { from: "a", to: "zz", label: "", style: "arrow", tone: "accent", cue: "" },
        ],
      },
      [],
    );
    expect(r.ok).toBe(true);
    if (!r.ok || r.visual.template !== "diagram") return;
    expect(new Set(r.visual.nodes.map((n) => n.x)).size).toBe(3);
    expect(r.visual.links).toHaveLength(1);
  });

  it("reveals parts as their cues are spoken", () => {
    const r = prepareVisual(
      {
        ...base,
        reveal: "progressive",
        regions: [{ label: "Macro", x: 0, y: 0, w: 50, h: 100, shape: "rect", tone: "neutral", cue: "macro headwinds" }],
        nodes: [{ id: "a", label: "Rates", detail: "", x: 25, y: 50, w: 0, h: 0, shape: "pill", tone: "accent", icon: "none", cue: "micro headwinds" }],
      },
      [],
    );
    expect(r.ok && revealCount(r.visual)).toBe(2);
  });

  it("keeps made-up numbers out of labels", () => {
    const r = prepareVisual({ ...base, nodes: [{ id: "a", label: "Grew 40%", detail: "", x: 50, y: 50, w: 0, h: 0, shape: "rect", tone: "accent", icon: "none", cue: "" }] }, []);
    expect(r.ok).toBe(true);
    expect(r.ok && r.visual.template === "diagram" && r.visual.nodes[0].label).toBe("Grew");
  });
});
