// Voice commands, handled locally for speed: "Halo, show X", "Halo, back",
// "let's go back to the funnel", "Halo, clear". Anything we can't resolve
// locally goes to the director as an explicit request.

import { stem, words } from "../../../shared/reveal";
import { TEMPLATE_LABELS, type TemplateId } from "../../../shared/visuals";
import type { ControlState, VisualInstance } from "../state";

export type Command =
  | { kind: "clear" }
  | { kind: "back" }
  | { kind: "recall"; query: string }
  | { kind: "show"; query: string }
  | { kind: "hide"; query: string }
  | { kind: "expand"; query: string }
  | { kind: "collapse"; query: string }
  | { kind: "next" };

export interface ParsedCommand {
  command: Command;
  /** Addressed to Halo by name (vs. a natural "let's go back to the funnel"). */
  addressed: boolean;
  text: string;
}

// Speech recognizers often hear "Halo" as "hello" or "hallo".
const WAKE = /(?:^|[\s,.!?])(?:hey |ok |okay )?(?:halo|hallo|haylo|hailo|hello)[\s,.!?:]+(.+)$/i;
const NATURAL_BACK =
  /\b(?:let'?s |let us |we'?ll |i'?ll |i want to |now )?(?:go|going|come|coming|jump|head|get|turn|flip)(?:ing)? back to (?:the |our |that |this )?([a-z][a-z\s-]{1,40}?)\s*(?:[.,!?;]|$)/i;

const clean = (s: string) => s.replace(/[.,!?;:]+$/g, "").trim();
/** "hide that" / "expand it" refer to the current visual, not a named one. */
const deictic = (q: string | undefined) => (!q || /^(that|this|it|them|those|these|everything|all)$/.test(q.trim()) ? "" : q);

export function parseCommand(text: string): ParsedCommand | null {
  const wake = text.match(WAKE);
  if (wake) {
    const rest = clean(wake[1]).toLowerCase();
    const command = parseAddressed(rest);
    if (command) return { command, addressed: true, text };
  }
  const natural = text.match(NATURAL_BACK);
  if (natural) return { command: { kind: "recall", query: clean(natural[1]) }, addressed: false, text };
  return null;
}

function parseAddressed(rest: string): Command | null {
  let m: RegExpMatchArray | null;
  if (/^(clear|clear (the |it |everything|all|the screen|the stage)|clear everything|hide everything|start fresh|reset)\b/.test(rest)) {
    return { kind: "clear" };
  }
  if ((m = rest.match(/^(?:go |take (?:me|us) )?back(?: to (?:the |our |that )?(.+))?$/))) {
    return m[1] ? { kind: "recall", query: m[1] } : { kind: "back" };
  }
  if ((m = rest.match(/^(?:show|bring up|bring back|pull up|put up|open|display)(?: me| us)?(?: the| our| that)? (.+?)(?: again)?$/))) {
    return /\b(again|back)\b/.test(rest) ? { kind: "recall", query: m[1] } : { kind: "show", query: m[1] };
  }
  if ((m = rest.match(/^(?:hide|tuck|put away|dismiss|close|remove)(?: (?:the |that |this )?(.+))?$/))) {
    return { kind: "hide", query: deictic(m[1]) };
  }
  if ((m = rest.match(/^(?:expand|enlarge|zoom in|make (?:it|that) bigger|bigger)(?: (?:the |that )?(.+))?$/))) {
    return { kind: "expand", query: deictic(m[1]) };
  }
  if ((m = rest.match(/^(?:collapse|shrink|zoom out|make (?:it|that) smaller|smaller)(?: (?:the |that )?(.+))?$/))) {
    return { kind: "collapse", query: deictic(m[1]) };
  }
  if (/^next\b/.test(rest)) return { kind: "next" };
  return null;
}

const SYNONYMS: Record<TemplateId, string[]> = {
  metric: ["metric", "number", "kpi", "card", "headline"],
  line: ["line", "chart", "trend", "graph"],
  bar: ["bar", "bars", "chart", "graph"],
  funnel: ["funnel", "dropoff", "drop", "steps"],
  comparison: ["comparison", "compare", "versus", "before", "after"],
  strategy: ["strategy", "moves", "plan", "points", "pillars"],
  roadmap: ["roadmap", "timeline", "rollout", "schedule", "plan"],
  process: ["process", "flow", "steps"],
  ui_sketch: ["sketch", "screen", "mockup", "app", "wireframe", "picture"],
  statement: ["statement", "ask", "takeaway"],
};

const FILLER = new Set([
  "the", "a", "an", "that", "this", "our", "my", "one", "again", "please", "card", "visual", "slide", "it", "for", "of",
  "to", "in", "on", "at", "and", "second", "minute", "moment", "bit", "now", "quickly", "real", "quick", "where", "we", "were",
]);

/** Best visual for a spoken reference like "the funnel". Null if nothing plausibly matches. */
export function matchVisual(query: string, candidates: VisualInstance[]): VisualInstance | null {
  const q = words(query).filter((w) => !FILLER.has(w) && w.length > 1).map(stem);
  if (q.length === 0) return null;
  let best: { v: VisualInstance; score: number } | null = null;
  for (const v of candidates) {
    const hay = new Set(
      words([v.title, ...v.aliases, TEMPLATE_LABELS[v.visual.template], ...SYNONYMS[v.visual.template]].join(" ")).map(stem),
    );
    // Words near the start of the phrase matter most: "the funnel for a second".
    const score = q.reduce((sum, t, i) => sum + (hay.has(t) ? 1 / (1 + i * 0.25) : 0), 0);
    const num = Number(v.id.replace(/\D/g, ""));
    if (score > 0 && (!best || score > best.score || (score === best.score && num > Number(best.v.id.replace(/\D/g, ""))))) {
      best = { v, score };
    }
  }
  return best?.v ?? null;
}

/** All visuals, newest first. */
export function allVisuals(s: ControlState): VisualInstance[] {
  return Object.values(s.visuals).sort((a, b) => b.createdAt - a.createdAt);
}
