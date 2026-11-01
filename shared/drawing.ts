// Drawings made live by the artist model: one SVG element per line, parsed
// into a whitelist of shapes and attributes. Nothing else gets through: no
// scripts, links, images, styles, groups or free colors. Pure and shared, so
// the server, the control window and the tests all sanitize the same way.

export type DrawAspect = "wide" | "square" | "tall";

/**
 * Drawing canvas in stage pixels (the viewBox); text sizes are in the same units.
 * Sized so a drawing fits beside the face at full size, keeping text at its real size.
 */
export const CANVAS: Record<DrawAspect, { w: number; h: number }> = {
  wide: { w: 520, h: 330 },
  square: { w: 500, h: 500 },
  tall: { w: 440, h: 700 },
};

/** Colors the artist may use, by name. Each maps to a design token, so drawings stay on brand and adapt to light and dark. */
export const PALETTE: Record<string, string> = {
  ink: "var(--label)",
  "ink-2": "var(--label-2)",
  "ink-3": "var(--label-3)",
  fill: "var(--fill)",
  "fill-2": "var(--fill-2)",
  accent: "var(--accent)",
  blue: "var(--blue)",
  green: "var(--green)",
  red: "var(--red)",
  orange: "var(--orange)",
  yellow: "var(--yellow)",
  teal: "var(--teal)",
  indigo: "var(--indigo)",
  purple: "var(--purple)",
  pink: "var(--pink)",
  brown: "var(--brown)",
  gray: "var(--gray)",
  white: "#ffffff",
  black: "#000000",
  none: "none",
};
export const PALETTE_NAMES = Object.keys(PALETTE);

export type DrawTag = "path" | "rect" | "circle" | "ellipse" | "line" | "polyline" | "polygon" | "text";
const TAGS: DrawTag[] = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text"];

export interface DrawElement {
  tag: DrawTag;
  /** Whitelisted attributes, values already checked. Colors are palette names. */
  attrs: Record<string, string>;
  /** Text content (text elements only). */
  text: string;
  /** Words the speaker says when this part should appear; empty shows it at once. */
  cue: string;
  /** Stable identity for animation: same element, same key, no replay. */
  key: string;
}

const NUMERIC = new Set(["x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "x1", "y1", "x2", "y2", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "font-size"]);
const COLOR = new Set(["fill", "stroke"]);
const ENUM: Record<string, string[]> = {
  "text-anchor": ["start", "middle", "end"],
  "font-weight": ["400", "500", "600", "700", "normal", "bold"],
  "stroke-linecap": ["round", "butt", "square"],
  "stroke-linejoin": ["round", "miter", "bevel"],
  "dominant-baseline": ["middle", "central", "hanging", "alphabetic"],
};
const ALLOWED: Record<DrawTag, string[]> = {
  path: ["d"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"],
  polyline: ["points"],
  polygon: ["points"],
  text: ["x", "y", "font-size", "font-weight", "text-anchor", "dominant-baseline"],
};
const COMMON = ["fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "transform"];

/** Smallest text the artist may use, in canvas units: still 22px on screen when a placement squeezes the drawing. */
export const MIN_FONT = 28;
const MAX_FONT = 120;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e: string) => ENTITIES[e]);

function cleanNumber(v: string, name: string): string | null {
  const n = Number(v.trim().replace(/px$/, ""));
  if (!Number.isFinite(n)) return null;
  if (name === "font-size") return String(Math.min(MAX_FONT, Math.max(MIN_FONT, n)));
  if (name.includes("opacity")) return String(Math.min(1, Math.max(0, n)));
  if (name === "stroke-width") return String(Math.min(60, Math.max(0, n)));
  return String(Math.round(n * 10) / 10);
}

/** Path data and point lists: only commands, numbers, commas and spaces. */
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]{1,20000}$/;
const POINTS = /^[0-9eE.,\s+-]{1,8000}$/;
const TRANSFORM = /^((translate|rotate|scale)\(\s*-?[\d.]+(\s*[, ]\s*-?[\d.]+){0,2}\s*\)\s*)+$/;
const DASH = /^[\d.\s,]{1,40}$/;

function cleanAttr(tag: DrawTag, name: string, value: string): string | null {
  if (!ALLOWED[tag].includes(name) && !COMMON.includes(name)) return null;
  if (COLOR.has(name)) {
    const c = value.trim().toLowerCase();
    return c in PALETTE ? c : null;
  }
  if (NUMERIC.has(name)) return cleanNumber(value, name);
  if (name in ENUM) return ENUM[name].includes(value.trim()) ? value.trim() : null;
  if (name === "d") return PATH_DATA.test(value) ? value.trim() : null;
  if (name === "points") return POINTS.test(value) ? value.trim() : null;
  if (name === "transform") return TRANSFORM.test(value.trim()) ? value.trim() : null;
  if (name === "stroke-dasharray") return DASH.test(value) ? value.trim() : null;
  return null;
}

/** A small, stable hash for element keys. */
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

const ELEMENT = /^<\s*(path|rect|circle|ellipse|line|polyline|polygon|text)\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/\s*text\s*>)\s*$/i;
const ATTR = /([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

/**
 * Parses one line of artist output into a safe element, or null for anything
 * else (prose, code fences, unknown tags, empty shapes).
 */
export function parseElement(line: string): DrawElement | null {
  const src = line.trim();
  const m = src.match(ELEMENT);
  if (!m) return null;
  const tag = m[1].toLowerCase() as DrawTag;
  if (!TAGS.includes(tag)) return null;
  const attrs: Record<string, string> = {};
  let cue = "";
  for (const a of m[2].matchAll(ATTR)) {
    const name = a[1].toLowerCase();
    const value = unescape(a[3] ?? a[4] ?? "");
    if (name === "data-cue") {
      cue = value.trim().slice(0, 40);
      continue;
    }
    const clean = cleanAttr(tag, name, value);
    if (clean !== null) attrs[name] = clean;
  }
  const text = tag === "text" ? unescape((m[3] ?? "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (tag === "text" && !text) return null;
  if (tag === "path" && !attrs.d) return null;
  if ((tag === "polyline" || tag === "polygon") && !attrs.points) return null;
  if (tag === "text" && !attrs["font-size"]) attrs["font-size"] = String(MIN_FONT + 4);
  return { tag, attrs, text, cue, key: hash(`${tag}|${JSON.stringify(attrs)}|${text}`) };
}

/** Splits streamed text into complete lines; returns the parsed elements and the unfinished rest. */
export function takeLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

/** Serializes elements back to lines, for showing the artist the current drawing when it updates it. */
export function elementLine(e: DrawElement): string {
  const attrs = Object.entries(e.attrs)
    .map(([k, v]) => `${k}="${v.replace(/"/g, "&quot;")}"`)
    .join(" ");
  const cue = e.cue ? ` data-cue="${e.cue.replace(/"/g, "&quot;")}"` : "";
  return e.tag === "text" ? `<text ${attrs}${cue}>${e.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>` : `<${e.tag} ${attrs}${cue}/>`;
}

/** Cues in the order their elements appear, without repeats. */
export function drawingCues(elements: DrawElement[]): string[] {
  const seen: string[] = [];
  for (const e of elements) if (e.cue && !seen.includes(e.cue)) seen.push(e.cue);
  return seen;
}
