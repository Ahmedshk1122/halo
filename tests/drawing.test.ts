import { describe, expect, it } from "vitest";
import { elementLine, parseElement, takeLines } from "../shared/drawing";
import { prepareVisual } from "../shared/resolve";
import { spokenNumbers } from "../shared/spoken";
import type { DrawingSpec } from "../shared/visuals";

describe("drawing elements", () => {
  it("keeps whitelisted shapes, attributes and palette colors", () => {
    const e = parseElement('<rect x="20" y="30" width="400" height="260" rx="12" fill="green" stroke="white" stroke-width="6"/>');
    expect(e).toMatchObject({ tag: "rect", attrs: { x: "20", y: "30", width: "400", height: "260", rx: "12", fill: "green", stroke: "white", "stroke-width": "6" } });
  });

  it("drops anything unsafe or off-brand", () => {
    expect(parseElement('<script>alert(1)</script>')).toBeNull();
    expect(parseElement('<image href="http://x/y.png"/>')).toBeNull();
    expect(parseElement("Here is your drawing:")).toBeNull();
    const e = parseElement('<path d="M0 0 L10 10" onclick="steal()" style="fill:red" fill="#ff0000" stroke="url(#x)" href="x"/>');
    expect(e?.attrs).toEqual({ d: "M0 0 L10 10" });
    expect(parseElement('<path d="M0 0 L10 10 url(javascript:1)"/>')).toBeNull();
  });

  it("reads text, keeps it short and makes small text readable", () => {
    const e = parseElement('<text x="10" y="40" font-size="12" text-anchor="middle">Penalty &amp; box</text>');
    expect(e).toMatchObject({ tag: "text", text: "Penalty & box", attrs: { "font-size": "28", "text-anchor": "middle" } });
  });

  it("round-trips through a line, so unchanged parts keep their identity on redraw", () => {
    const e = parseElement('<circle cx="480" cy="270" r="60" fill="none" stroke="white" stroke-width="4" data-cue="centre circle"/>')!;
    const again = parseElement(elementLine(e))!;
    expect(again).toEqual(e);
    expect(again.cue).toBe("centre circle");
  });

  it("splits streamed text into finished lines", () => {
    expect(takeLines('<rect x="1"/>\n<circ')).toEqual({ lines: ['<rect x="1"/>'], rest: "<circ" });
  });
});

describe("drawing visuals", () => {
  const base: DrawingSpec = { template: "drawing", title: "The pitch", aliases: [], caption: "", aspect: "wide", brief: "A football pitch", elements: [], status: "drawing" };

  it("shows a placeholder while the artist draws", () => {
    const r = prepareVisual(base, []);
    expect(r.ok && r.visual.template === "drawing" && r.visual.pending).toBe(true);
  });

  it("takes numbers the speaker did not say out of labels, keeps the ones they said", () => {
    const elements = [parseElement('<text x="10" y="40">Lap 44</text>')!, parseElement('<text x="10" y="90">Top speed 330</text>')!];
    const r = prepareVisual({ ...base, elements, status: "done" }, [], { said: spokenNumbers("he pitted on lap 44") });
    expect(r.ok).toBe(true);
    if (!r.ok || r.visual.template !== "drawing") return;
    expect(r.visual.elements.map((e) => e.text)).toEqual(["Lap 44", "Top speed"]);
  });

  it("drops a finished drawing that came back empty", () => {
    expect(prepareVisual({ ...base, status: "done" }, []).ok).toBe(false);
  });
});
