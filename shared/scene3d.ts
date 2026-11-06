// 3D models made live by the artist: one JSON object per line, each a part
// built from a whitelisted primitive. Like drawings, nothing but checked numbers,
// palette colors and short labels gets through. Pure and shared, so the server,
// the control window, the stage and the tests all sanitize the same way.

import { PALETTE_NAMES } from "./drawing";

export type Shape3D = "box" | "sphere" | "cylinder" | "cone" | "torus" | "capsule" | "lathe" | "tube" | "extrude";
export const SHAPES_3D: Shape3D[] = ["box", "sphere", "cylinder", "cone", "torus", "capsule", "lathe", "tube", "extrude"];
export type Material3D = "matte" | "satin" | "metal" | "glass" | "glow";
const MATERIALS: Material3D[] = ["matte", "satin", "metal", "glass", "glow"];
export type View3D = "front" | "three-quarter" | "side" | "top";
const VIEWS: View3D[] = ["front", "three-quarter", "side", "top"];

export type Vec3 = [number, number, number];

export interface SceneObject {
  id: string;
  shape: Shape3D;
  /** Shape parameters, by shape: box size [w,h,d]; sphere r; cylinder r (or r_top, r_bottom) and h; cone r, h; torus r, tube; capsule r, h. */
  size: Vec3;
  r: number;
  r_top: number;
  r_bottom: number;
  h: number;
  tube: number;
  /** lathe: [radius, y] profile revolved around the y axis. extrude: [x, y] outline. */
  profile: [number, number][];
  /** tube: the centre line. */
  path: Vec3[];
  depth: number;
  pos: Vec3;
  /** Degrees around x, y, z. */
  rot: Vec3;
  color: string;
  material: Material3D;
  opacity: number;
  /** Short name shown as a callout; empty for none. */
  label: string;
  /** Where this part moves in the exploded view. */
  explode: Vec3;
  /** "spin <axis> <seconds>" (negative seconds turn the other way), "pulse <seconds>" or "bob <seconds>". */
  anim: string;
  cue: string;
  key: string;
}

export interface SceneSettings {
  view: View3D;
  /** Parts apart along their explode offsets, to show what is inside. */
  exploded: boolean;
  /** Slowly turn the whole model. */
  turntable: boolean;
}

export const DEFAULT_SCENE: SceneSettings = { view: "three-quarter", exploded: false, turntable: true };

const LIMIT = 50;
const num = (v: unknown, fallback: number, min = -LIMIT, max = LIMIT) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)) : fallback;
};
const vec = (v: unknown, fallback: Vec3, min = -LIMIT, max = LIMIT): Vec3 =>
  Array.isArray(v) && v.length >= 3 ? [num(v[0], fallback[0], min, max), num(v[1], fallback[1], min, max), num(v[2], fallback[2], min, max)] : fallback;
const pairs = (v: unknown, maxLen: number): [number, number][] =>
  Array.isArray(v) ? v.filter((p) => Array.isArray(p) && p.length >= 2).slice(0, maxLen).map((p) => [num(p[0], 0), num(p[1], 0)]) : [];
const triples = (v: unknown, maxLen: number): Vec3[] => (Array.isArray(v) ? v.slice(0, maxLen).map((p) => vec(p, [0, 0, 0])) : []);
const text = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

function cleanAnim(v: unknown): string {
  const t = String(v ?? "").trim().replace(/\s+/g, " ");
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^spin ([xyz]) (-?\d+(?:\.\d+)?)$/))) {
    const s = Number(m[2]);
    return `spin ${m[1]} ${Math.sign(s || 1) * Math.min(60, Math.max(0.5, Math.abs(s)))}`;
  }
  if ((m = t.match(/^(pulse|bob) (\d+(?:\.\d+)?)$/))) return `${m[1]} ${Math.min(60, Math.max(0.5, Number(m[2])))}`;
  return "";
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** One part, checked. Returns null for anything that isn't a usable part. */
export function sanitizeObject(o: Record<string, unknown>, index = 0): SceneObject | null {
  const shape = String(o.shape ?? "") as Shape3D;
  if (!SHAPES_3D.includes(shape)) return null;
  const color = String(o.color ?? "gray").toLowerCase();
  const material = String(o.material ?? "satin") as Material3D;
  const obj: Omit<SceneObject, "key"> = {
    id: text(o.id, 32) || `part${index + 1}`,
    shape,
    size: vec(o.size, [1, 1, 1], 0.01, LIMIT),
    r: num(o.r, 1, 0.005, LIMIT),
    r_top: num(o.r_top ?? o.r, 1, 0, LIMIT),
    r_bottom: num(o.r_bottom ?? o.r, 1, 0, LIMIT),
    h: num(o.h, 1, 0.005, LIMIT),
    tube: num(o.tube, 0.2, 0.005, LIMIT),
    profile: pairs(o.profile, 64),
    path: triples(o.path, 64),
    depth: num(o.depth, 0.5, 0.005, LIMIT),
    pos: vec(o.pos, [0, 0, 0]),
    rot: vec(o.rot, [0, 0, 0], -720, 720),
    color: PALETTE_NAMES.includes(color) && color !== "none" ? color : "gray",
    material: MATERIALS.includes(material) ? material : "satin",
    opacity: num(o.opacity, 1, 0.05, 1),
    label: text(o.label, 28),
    explode: vec(o.explode, [0, 0, 0]),
    anim: cleanAnim(o.anim),
    cue: text(o.cue, 40),
  };
  if (shape === "lathe" && obj.profile.length < 2) return null;
  if (shape === "extrude" && obj.profile.length < 3) return null;
  if (shape === "tube" && obj.path.length < 2) return null;
  return { ...obj, key: hash(JSON.stringify(obj)) };
}

export function sanitizeScene(o: Record<string, unknown>): SceneSettings {
  const view = String(o.view ?? "") as View3D;
  return {
    view: VIEWS.includes(view) ? view : DEFAULT_SCENE.view,
    exploded: o.exploded === true,
    turntable: o.turntable !== false,
  };
}

export type SceneLine = { kind: "object"; object: SceneObject } | { kind: "scene"; scene: SceneSettings };

/** Parses one line of the artist's 3D output: a part, the scene settings, or null for anything else. */
export function parseSceneLine(line: string, index = 0): SceneLine | null {
  const t = line.trim().replace(/,$/, "");
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  let o: unknown;
  try {
    o = JSON.parse(t);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const rec = o as Record<string, unknown>;
  if (rec.scene && typeof rec.scene === "object") return { kind: "scene", scene: sanitizeScene(rec.scene as Record<string, unknown>) };
  // Control lines from the server ({"done": ...}, {"error": ...}) are not parts.
  if (!("shape" in rec)) return null;
  const object = sanitizeObject(rec, index);
  return object ? { kind: "object", object } : null;
}

/** A part back as a line, for showing the artist the current model when it updates it. */
export function objectLine(o: SceneObject): string {
  const { key: _k, ...rest } = o;
  return JSON.stringify(rest);
}
