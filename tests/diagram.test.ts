import { describe, expect, it } from "vitest";
import { prepareVisual } from "../shared/resolve";
import { revealCount, type DiagramSpec } from "../shared/visuals";

const base: DiagramSpec = {
  template: "diagram",
  title: "How it works",
  caption: "",
  aliases: [],
  aspect: "square",
  backdrop: "none",
  reveal: "all",
  regions: [],
  nodes: [],
  links: [],
  paths: [],
  markers: [],
};

describe("diagram", () => {
  it("places markers on backdrop anchors and drops unknown anchors", () => {
    const r = prepareVisual(
      {
        ...base,
        backdrop: "human_body",
        markers: [
          { id: "h", label: "Heart", anchor: "heart", x: 0, y: 0, kind: "dot", tone: "highlight", cue: "" },
          { id: "x", label: "Spleen", anchor: "spleen", x: 0, y: 0, kind: "dot", tone: "accent", cue: "" },
        ],
      },
      [],
    );
    expect(r.ok).toBe(true);
    if (!r.ok || r.visual.template !== "diagram") return;
    expect(r.visual.markers).toHaveLength(1);
    expect(r.visual.markers[0]).toMatchObject({ x: 50, y: 41 });
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
    expect(r).toMatchObject({ ok: false, stage: "grounding" });
  });
});
