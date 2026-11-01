// Natural sizes of each template at 1080p, and which default slot they prefer.
// Sizes are deterministic so the control window can place visuals without
// measuring the DOM. Templates are designed to fill exactly this box.

import { CANVAS } from "./drawing";
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
/** Diagram drawing area (inside padding, below title and caption). */
export function diagramArea(v: { aspect: "wide" | "square" | "tall"; caption: string }): Size {
  const w = v.aspect === "wide" ? 900 : v.aspect === "tall" ? 600 : 680;
  const h = v.aspect === "wide" ? 520 : v.aspect === "tall" ? 800 : 660;
  return { w: w - PAD * 2, h: h - PAD * 2 - 46 - (v.caption ? 31 : 0) - 16 };
}
export const TITLE_LINE = 46; // 40px title line height
export const BODY_LINE = 35; // 28px body line height

/**
 * Long lists still fit: past five points the strategy card goes compact (smaller
 * icons, no detail lines), past ten it uses two columns.
 */
export function strategyLayout(n: number): { compact: boolean; columns: 1 | 2; rows: number } {
  const columns = n > 10 ? 2 : 1;
  return { compact: n > 5, columns, rows: Math.ceil(n / columns) };
}

/** Steps and milestones wrap onto more rows instead of running off the stage. */
export function rowsOf<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return rows.length ? rows : [[]];
}
export const PROCESS_PER_ROW = (n: number) => (n <= 5 ? Math.max(1, n) : 4);
export const ROADMAP_PER_ROW = (n: number) => (n <= 6 ? Math.max(1, n) : 5);

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
      const { compact, columns, rows } = strategyLayout(v.points.length);
      const w = columns === 2 ? 1080 : 600;
      const colW = columns === 2 ? (w - PAD * 2 - 32) / 2 : w - PAD * 2;
      const tile = compact ? 48 : 64;
      const gap = compact ? 14 : 22;
      const textW = colW - tile - (compact ? 16 : 22);
      const rowH = v.points.map((p) => {
        const lines = estimateLines(p.text, 28, textW);
        const detailLines = !compact && p.detail ? estimateLines(p.detail, 24, textW) : 0;
        return Math.max(tile, lines * BODY_LINE + detailLines * 30 + 4);
      });
      // Two columns fill top to bottom, then the second column; the taller column sets the height.
      const colHeights = Array.from({ length: columns }, (_, c) => rowH.slice(c * rows, (c + 1) * rows).reduce((a, b) => a + b + gap, 0));
      return { w, h: PAD + TITLE_LINE + 26 + Math.max(0, ...colHeights) - gap + PAD };
    }
    case "roadmap": {
      const perRow = ROADMAP_PER_ROW(v.items.length);
      const n = Math.max(1, perRow);
      const col = n <= 3 ? 340 : n === 4 ? 300 : 250;
      const textW = col - 24;
      const tracks = rowsOf(v.items, perRow);
      const trackH = tracks.map((t) => {
        const labelLines = Math.max(1, ...t.map((i) => estimateLines(i.label, 28, textW)));
        const detailLines = Math.max(0, ...t.map((i) => (i.detail ? estimateLines(i.detail, 24, textW) : 0)));
        return 4 + 30 + 12 + 22 + 18 + labelLines * BODY_LINE + detailLines * 30;
      });
      return {
        w: PAD * 2 + Math.max(2, n) * col,
        h: PAD * 2 + TITLE_LINE + 20 + trackH.reduce((a, b) => a + b, 0) + (tracks.length - 1) * 28,
      };
    }
    case "process": {
      const perRow = PROCESS_PER_ROW(v.steps.length);
      const n = Math.max(1, perRow);
      const inner = 260 - 48;
      const rows = rowsOf(v.steps, perRow);
      const rowH = rows.map((r) => {
        const labelLines = Math.max(1, ...r.map((s) => estimateLines(s.label, 28, inner)));
        const detailLines = Math.max(0, ...r.map((s) => (s.detail ? estimateLines(s.detail, 24, inner) : 0)));
        return 24 + 56 + 12 + labelLines * BODY_LINE + detailLines * 30 + 4 + 24;
      });
      return {
        w: PAD * 2 + Math.max(2, n) * 260 + (Math.max(2, n) - 1) * 48,
        h: PAD * 2 + TITLE_LINE + 20 + rowH.reduce((a, b) => a + b, 0) + (rows.length - 1) * 20,
      };
    }
    case "ui_sketch":
      return { w: 720, h: 620 + (v.caption ? 31 : 0) };
    case "goal":
      return { w: 560, h: 560 };
    case "drawing": {
      const c = CANVAS[v.aspect];
      return { w: c.w + PAD * 2, h: c.h + PAD * 2 + TITLE_LINE + 16 + (v.caption ? 31 : 0) };
    }
    case "diagram":
      return v.aspect === "wide" ? { w: 900, h: 520 } : v.aspect === "tall" ? { w: 600, h: 800 } : { w: 680, h: 660 };
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
