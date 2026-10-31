// A short memory of where the presenter's finger was. Pointing never creates a
// visual; when speech brings one, it goes where the presenter deliberately
// pointed (finger held still on a spot), not where a passing hand happened to be.
import type { Point } from "../../../shared/geometry";
import { now } from "../../sync/channel";

interface Sample {
  t: number;
  x: number;
  y: number;
  pointing: boolean;
}

const samples: Sample[] = [];
const KEEP_MS = 15_000;

/** Records the fingertip in the presenter's (mirrored) frame. */
export function recordPointer(x: number, y: number, pointing: boolean, t = now()) {
  samples.push({ t, x, y, pointing });
  while (samples.length && t - samples[0].t > KEEP_MS) samples.shift();
}

/**
 * The most recent spot the presenter held a pointing finger on, between
 * `from` and `to`. Held means still (within `radius`) for at least `holdMs`.
 */
export function steadyPoint(from: number, to: number, holdMs = 450, radius = 60, source: Sample[] = samples): Point | null {
  const inWindow = source.filter((s) => s.t >= from && s.t <= to);
  let best: Point | null = null;
  let run: Sample[] = [];
  const close = () => {
    if (run.length > 1 && run[run.length - 1].t - run[0].t >= holdMs) {
      best = { x: run.reduce((a, s) => a + s.x, 0) / run.length, y: run.reduce((a, s) => a + s.y, 0) / run.length };
    }
    run = [];
  };
  for (const s of inWindow) {
    if (!s.pointing) {
      close();
      continue;
    }
    if (run.length && Math.hypot(s.x - run[0].x, s.y - run[0].y) > radius) close();
    run.push(s);
  }
  close();
  return best;
}
