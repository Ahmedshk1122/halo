// Grounding check. Every generated text field is scanned before rendering.
// Month, quarter and year names and small item counts ("three steps") are
// fine. Any other number, percentage or currency rejects the visual: numbers
// may only reach the screen through data references.

import type { VisualSpec } from "./visuals";

export interface GroundingViolation {
  field: string;
  text: string;
  match: string;
  why: string;
}

const MONTHS =
  "jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december";
const MONTH_BEFORE = new RegExp(`\\b(${MONTHS})\\.?\\s*$`, "i");

/** Words that turn a number into a quantity claim rather than an item count. */
const UNIT_WORDS = new Set([
  "%",
  "percent",
  "percentage",
  "pct",
  "pts",
  "pt",
  "points",
  "point",
  "bps",
  "basis",
  "x",
  "×",
  "times",
  "fold",
  "k",
  "m",
  "mm",
  "b",
  "bn",
  "thousand",
  "million",
  "billion",
  "trillion",
  "hundred",
  "dollars",
  "dollar",
  "usd",
  "eur",
  "euro",
  "euros",
  "pounds",
  "gbp",
  "yen",
  "cents",
  "ms",
  "s",
  "sec",
  "secs",
  "second",
  "seconds",
  "min",
  "mins",
  "minute",
  "minutes",
  "hr",
  "hrs",
  "hour",
  "hours",
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  "kb",
  "mb",
  "gb",
  "tb",
]);

/** Number words that are always a quantity claim. */
const ALWAYS_NUMBER_WORDS =
  "zero|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|hundreds|thousand|thousands|million|millions|billion|billions|trillion|dozen|dozens|half|halve|halved|twice|double|doubled|triple|tripled|quadruple|tenfold|percent|percentage";

const LABEL_BEFORE = /\b(step|phase|stage|part|option|tier|level|version|v|wave|sprint|round)\s*$/i;

function nextWord(text: string, end: number): string {
  const m = text.slice(end).match(/^\s*([A-Za-z%×]+)/);
  return m ? m[1].toLowerCase() : "";
}

/** Returns the reasons a single string fails grounding (empty when clean). */
export function scanText(text: string, field = "text"): GroundingViolation[] {
  const out: GroundingViolation[] = [];
  const add = (match: string, why: string) => out.push({ field, text, match, why });

  // Currency symbols attached to a number.
  for (const m of text.matchAll(/[$€£¥]\s?\d/g)) add(m[0], "currency");

  // Digit runs.
  const digitRe = /\d[\d,]*(?:\.\d+)?/g;
  for (const m of text.matchAll(digitRe)) {
    const raw = m[0];
    const start = m.index ?? 0;
    const end = start + raw.length;
    const before = text.slice(0, start);
    const prevChar = before.slice(-1);
    const after = text.slice(end);
    const nextChar = after.slice(0, 1);

    if (/[.,]\d/.test(raw) || raw.includes(",")) {
      add(raw, "number not from data");
      continue;
    }
    const n = Number(raw);
    // Quarter / half / fiscal year: Q3, H1, FY26
    if (/q$/i.test(prevChar) && n >= 1 && n <= 4 && !/\d/.test(nextChar)) continue;
    if (/h$/i.test(prevChar) && /\bH$/.test(before) && n >= 1 && n <= 2 && !/\d/.test(nextChar)) continue;
    if (/fy$/i.test(before.slice(-2)) && (raw.length === 2 || raw.length === 4)) continue;
    // Years
    if (raw.length === 4 && n >= 1900 && n <= 2099 && !/[%$€£¥]/.test(nextChar) && !/[A-Za-z]/.test(nextChar)) {
      if (!/^\s*%/.test(after)) continue;
    }
    // Apostrophe years: '26
    if (prevChar === "'" && raw.length === 2) continue;
    // Day of month after a month name: "November 12"
    if (MONTH_BEFORE.test(before) && n >= 1 && n <= 31 && !/^\s*(%|[A-Za-z])/.test(after.replace(/^(st|nd|rd|th)\b/, ""))) continue;
    // Ordinals up to tenth: 1st, 2nd
    if (/^(st|nd|rd|th)\b/i.test(after) && n >= 1 && n <= 10) continue;
    // Labels: "Step 2", "Phase 3"
    if (LABEL_BEFORE.test(before) && n >= 1 && n <= 10 && !/^\s*(%|[A-Za-z])/.test(after)) continue;
    // Small item counts: "3 moves"
    if (n >= 1 && n <= 10 && !/[A-Za-z]/.test(nextChar) && !/[+\-−±#]$/.test(before.trimEnd())) {
      const word = nextWord(text, end);
      if (word && !UNIT_WORDS.has(word) && !/^\s*[%×]/.test(after)) continue;
    }
    add(raw, "number not from data");
  }

  // Number words.
  for (const m of text.matchAll(new RegExp(`\\b(${ALWAYS_NUMBER_WORDS})\\b`, "gi"))) {
    add(m[0], "number word");
  }
  for (const m of text.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi)) {
    const word = nextWord(text, (m.index ?? 0) + m[0].length);
    if (UNIT_WORDS.has(word)) add(`${m[0]} ${word}`, "quantity");
  }
  // A bare percent sign anywhere is a percentage claim.
  if (/%/.test(text) && !out.some((v) => v.match.includes("%"))) add("%", "percentage");

  return out;
}

/** Every generated (rendered) text field of a spec, with a path for logging. */
export function textFields(spec: VisualSpec): { field: string; text: string }[] {
  const f: { field: string; text: string }[] = [{ field: "title", text: spec.title }];
  const push = (field: string, text: string) => {
    if (text) f.push({ field, text });
  };
  switch (spec.template) {
    case "metric":
      push("caption", spec.caption);
      break;
    case "line":
    case "bar":
    case "funnel":
      push("subtitle", spec.subtitle);
      break;
    case "comparison":
      for (const side of ["a", "b"] as const) {
        push(`${side}.label`, spec[side].label);
        spec[side].points.forEach((p, i) => push(`${side}.points[${i}]`, p));
      }
      break;
    case "strategy":
      spec.points.forEach((p, i) => {
        push(`points[${i}].text`, p.text);
        push(`points[${i}].detail`, p.detail);
      });
      break;
    case "roadmap":
      spec.items.forEach((p, i) => {
        push(`items[${i}].when`, p.when);
        push(`items[${i}].label`, p.label);
        push(`items[${i}].detail`, p.detail);
      });
      break;
    case "process":
      spec.steps.forEach((p, i) => {
        push(`steps[${i}].label`, p.label);
        push(`steps[${i}].detail`, p.detail);
      });
      break;
    case "ui_sketch":
      push("caption", spec.caption);
      push("window_title", spec.window_title);
      push("heading", spec.heading);
      spec.sidebar.forEach((s, i) => push(`sidebar[${i}]`, s));
      spec.blocks.forEach((b, i) => {
        push(`blocks[${i}].label`, b.label);
        b.items.forEach((it, j) => push(`blocks[${i}].items[${j}]`, it));
      });
      break;
    case "statement":
      push("kicker", spec.kicker);
      push("text", spec.text);
      break;
  }
  return f;
}

export function scanSpec(spec: VisualSpec): GroundingViolation[] {
  return textFields(spec).flatMap(({ field, text }) => scanText(text, field));
}
