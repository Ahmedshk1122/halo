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
      return { w: 1120, h: 150 + (hasValue ? 116 : 0) + rows * 46 + 24 };
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
    case "roadmap":
      return { w: Math.min(1400, 260 * Math.max(3, v.items.length) + 120), h: 330 };
    case "process":
      return { w: Math.min(1500, 290 * Math.max(3, v.steps.length) + 40), h: 300 };
    case "ui_sketch":
      return { w: 680, h: 540 };
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
