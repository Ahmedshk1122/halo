// Natural sizes of each template at 1080p, and which default slot they prefer.
// Sizes are deterministic so the control window can place visuals without
// measuring the DOM. Templates are designed to fill exactly this box.

import type { ResolvedVisual } from "./visuals";

export type Slot = "left" | "right" | "lower";

export interface Size {
  w: number;
  h: number;
}

/** Rough width of a line of SF Pro text, for sizing only. */
export function estimateTextWidth(text: string, fontSize: number, weight: "regular" | "semibold" = "semibold"): number {
  const perChar = weight === "semibold" ? 0.53 : 0.5;
  return text.length * fontSize * perChar;
}

export function estimateLines(text: string, fontSize: number, maxWidth: number): number {
  if (!text) return 0;
  // Word wrap estimate.
  const words = text.split(/\s+/);
  let lines = 1;
  let current = 0;
  const space = fontSize * 0.28;
  for (const word of words) {
    const w = estimateTextWidth(word, fontSize);
    if (current > 0 && current + space + w > maxWidth) {
      lines += 1;
      current = w;
    } else {
      current += (current > 0 ? space : 0) + w;
    }
  }
  return lines;
}

export const PAD = 36;
export const TITLE_LINE = 46; // 40px title line height
export const BODY_LINE = 35; // 28px body line height

export function templateSize(v: ResolvedVisual): Size {
  switch (v.template) {
    case "metric":
      return { w: 560, h: (v.delta ? 0 : -50) + (v.trend && v.trend.points.length > 1 ? 470 : 360) };
    case "line":
      return { w: 640, h: 460 };
    case "bar":
      return { w: 640, h: 460 };
    case "funnel":
      return { w: 640, h: PAD * 2 + TITLE_LINE + (v.subtitle ? 31 : 0) + 22 + v.steps.points.length * 82 - 16 };
    case "comparison": {
      const rows = Math.max(v.a.points.length, v.b.points.length);
      const hasValue = !!(v.a.value || v.b.value);
      return { w: 1120, h: 14 + 22 + TITLE_LINE + 18 + 26 + BODY_LINE + (hasValue ? 8 + 96 + 6 : 0) + 18 + rows * 44 - 9 + 26 + 14 };
    }
    case "strategy": {
      const textW = 600 - PAD * 2 - 64 - 22;
      let h = PAD + TITLE_LINE + 26;
      for (const p of v.points) {
        const lines = estimateLines(p.text, 28, textW);
        const detailLines = p.detail ? estimateLines(p.detail, 24, textW) : 0;
        h += Math.max(64, lines * BODY_LINE + detailLines * 30 + 4) + 22;
      }
      return { w: 600, h: h - 22 + PAD };
    }
    case "roadmap": {
      const n = Math.max(1, v.items.length);
      const col = n <= 3 ? 340 : n === 4 ? 300 : 250;
      const textW = col - 24;
      const labelLines = Math.max(1, ...v.items.map((i) => estimateLines(i.label, 28, textW)));
      const detailLines = Math.max(0, ...v.items.map((i) => (i.detail ? estimateLines(i.detail, 24, textW) : 0)));
      return {
        w: PAD * 2 + Math.max(2, n) * col,
        h: PAD * 2 + TITLE_LINE + 20 + 4 + 30 + 12 + 22 + 18 + labelLines * BODY_LINE + detailLines * 30,
      };
    }
    case "process": {
      const n = Math.max(1, v.steps.length);
      const inner = 260 - 48;
      const labelLines = Math.max(1, ...v.steps.map((s) => estimateLines(s.label, 28, inner)));
      const detailLines = Math.max(0, ...v.steps.map((s) => (s.detail ? estimateLines(s.detail, 24, inner) : 0)));
      return {
        w: PAD * 2 + Math.max(2, n) * 260 + (Math.max(2, n) - 1) * 48,
        h: PAD * 2 + TITLE_LINE + 20 + 24 + 56 + 12 + labelLines * BODY_LINE + detailLines * 30 + 4 + 24,
      };
    }
    case "ui_sketch":
      return { w: 720, h: 620 + (v.caption ? 31 : 0) };
    case "goal":
      return { w: 560, h: 560 };
    case "statement": {
      const innerW = 1100 - 88;
      const lines = Math.min(3, estimateLines(v.text, 56, innerW));
      return { w: 1100, h: 44 * 2 + (v.kicker ? 34 + 14 : 0) + lines * 62 };
    }
  }
}

export function preferredSlots(v: ResolvedVisual): Slot[] {
  switch (v.template) {
    case "comparison":
    case "roadmap":
    case "process":
    case "statement":
      return ["lower"];
    case "ui_sketch":
      return ["right", "left"];
    default:
      return ["left", "right"];
  }
}
