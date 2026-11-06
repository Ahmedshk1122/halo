import { describe, expect, it } from "vitest";
import { objectLine, parseSceneLine } from "../shared/scene3d";
import { prepareVisual } from "../shared/resolve";
import { spokenNumbers } from "../shared/spoken";
import type { DrawingSpec } from "../shared/visuals";

describe("3D models", () => {
  it("reads the scene line and parts", () => {
    expect(parseSceneLine('{"scene":{"view":"side","exploded":true}}')).toEqual({ kind: "scene", scene: { view: "side", exploded: true, turntable: true } });
    const p = parseSceneLine('{"id":"shaft","shape":"cylinder","r":0.3,"h":9,"pos":[0,0,0],"rot":[0,0,90],"color":"white","material":"metal","label":"Shaft","explode":[6,0,0],"anim":"spin y 1.5"}');
    expect(p?.kind).toBe("object");
    if (p?.kind !== "object") return;
    expect(p.object).toMatchObject({ id: "shaft", shape: "cylinder", r: 0.3, h: 9, rot: [0, 0, 90], color: "white", material: "metal", label: "Shaft", explode: [6, 0, 0], anim: "spin y 1.5" });
  });

  it("keeps only checked values", () => {
    const p = parseSceneLine('{"shape":"box","size":[1e9,"x",2],"color":"url(#x)","material":"lava","label":"<b>Hi</b>","anim":"wobble"}');
    expect(p?.kind === "object" && p.object).toMatchObject({ size: [50, 1, 2], color: "gray", material: "satin", label: "bHi/b", anim: "" });
    expect(parseSceneLine('{"shape":"teapot"}')).toBeNull();
    expect(parseSceneLine('{"done":true}')).toBeNull();
    expect(parseSceneLine("not json")).toBeNull();
    expect(parseSceneLine('{"shape":"lathe","profile":[[1,0]]}')).toBeNull();
  });

  it("keeps a part's identity through an update", () => {
    const p = parseSceneLine('{"id":"a","shape":"sphere","r":1,"label":"Core"}');
    if (p?.kind !== "object") throw new Error("expected a part");
    const again = parseSceneLine(objectLine(p.object));
    expect(again?.kind === "object" && again.object.key).toBe(p.object.key);
  });

  it("takes unsaid numbers out of part labels", () => {
    const p = parseSceneLine('{"id":"a","shape":"box","size":[1,1,1],"label":"Bay 44"}');
    const q = parseSceneLine('{"id":"b","shape":"box","size":[1,1,1],"label":"Output 900"}');
    if (p?.kind !== "object" || q?.kind !== "object") throw new Error("expected parts");
    const spec: DrawingSpec = { template: "drawing", title: "Plant", aliases: [], caption: "", aspect: "square", brief: "", dimension: "3d", elements: [], objects: [p.object, q.object], status: "done" };
    const r = prepareVisual(spec, [], { said: spokenNumbers("bay 44 is new") });
    expect(r.ok && r.visual.template === "drawing" && r.visual.objects.map((o) => o.label)).toEqual(["Bay 44", "Output"]);
  });
});
