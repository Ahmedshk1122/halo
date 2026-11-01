// Small chart helpers shared by the chart templates.

export interface Pt {
  x: number;
  y: number;
}

/** A padded y-domain that reads well: not forced to zero, rounded to a nice step. */
export function niceDomain(values: number[], { zero = false } = {}): [number, number] {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (zero) min = Math.min(0, min);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const step = niceStep(span / 4);
  const lo = zero ? min : Math.floor((min - span * 0.12) / step) * step;
  const hi = Math.ceil((max + span * 0.08) / step) * step;
  return [lo, hi];
}

export function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * mag;
}

export function scale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

export function linePath(points: Pt[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("");
}

export function areaPath(points: Pt[], baseline: number): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)}L${last.x.toFixed(2)},${baseline}L${first.x.toFixed(2)},${baseline}Z`;
}

/** Rounded-top bar from the baseline (Apple Health style caps). */
export function barPath(x: number, w: number, baseline: number, h: number, radius: number): string {
  const r = Math.min(radius, w / 2, Math.max(0, h));
  const top = baseline - h;
  if (h <= 0) return `M${x},${baseline}Z`;
  return [
    `M${x},${baseline}`,
    `L${x},${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `L${x + w - r},${top}`,
    `Q${x + w},${top} ${x + w},${top + r}`,
    `L${x + w},${baseline}`,
    "Z",
  ].join("");
}

/** Indices of x labels to show: first, last, and a few evenly spaced in between. */
export function labelIndices(n: number, max = 4): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>([0, n - 1]);
  const inner = max - 2;
  for (let k = 1; k <= inner; k++) out.add(Math.round((k * (n - 1)) / (inner + 1)));
  return [...out].sort((a, b) => a - b);
}

/**
 * Axis labels that fit: starts from labelIndices and drops labels whose text
 * would run into a neighbor (first and last are kept), for 22px axis text.
 */
export function fittingLabels(labels: string[], xAt: (i: number) => number, max = 4, fontSize = 22, gap = 10): number[] {
  const n = labels.length;
  const width = (i: number) => labels[i].length * fontSize * 0.55;
  const span = (i: number) => {
    const x = xAt(i);
    const w = width(i);
    return i === 0 ? [x, x + w] : i === n - 1 ? [x - w, x] : [x - w / 2, x + w / 2];
  };
  const kept: number[] = [];
  for (const i of labelIndices(n, max)) {
    const [a] = span(i);
    while (kept.length && span(kept[kept.length - 1])[1] + gap > a) {
      // The last label always stays; otherwise drop the newcomer.
      if (i === n - 1 && kept.length > 1) kept.pop();
      else break;
    }
    if (!kept.length || span(kept[kept.length - 1])[1] + gap <= a) kept.push(i);
  }
  return kept;
}
