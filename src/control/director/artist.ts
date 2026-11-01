// Fills a drawing on stage from the artist model as it streams. The visual is
// already on screen as a breathing placeholder; each finished line becomes a
// shape that draws in. An update keeps the current drawing up and adds new
// parts as they arrive, then settles on the new version (unchanged parts keep
// their identity, so they don't redraw).

import { parseElement, takeLines, elementLine, type DrawElement } from "../../../shared/drawing";
import { prepareVisual } from "../../../shared/resolve";
import type { SpokenNumber } from "../../../shared/spoken";
import type { DrawingSpec } from "../../../shared/visuals";
import { now } from "../../sync/channel";
import { updateVisual } from "../stageActions";
import { store, type DecisionEntry } from "../state";

/** One drawing request per visual; a newer one replaces it. */
const running = new Map<string, AbortController>();

const sayable = (n: SpokenNumber) => (n.unit === "percent" ? `${n.value}%` : n.currency ? `${n.currency}${n.value}` : String(n.value));

export interface DrawOptions {
  said: SpokenNumber[];
  /** Decision log entry to annotate with how the drawing went. */
  logId?: number;
  log?: (id: number, patch: Partial<DecisionEntry>) => void;
}

export function cancelAllDrawings() {
  for (const a of running.values()) a.abort();
  running.clear();
}

export function cancelDrawing(visualId: string) {
  running.get(visualId)?.abort();
  running.delete(visualId);
}

/** Streams the artist's drawing into a visual that is on stage (or tucked). */
export async function drawInto(visualId: string, previous: DrawElement[], opts: DrawOptions): Promise<void> {
  cancelDrawing(visualId);
  const abort = new AbortController();
  running.set(visualId, abort);
  const v = store.get().visuals[visualId];
  const spec = v?.spec as DrawingSpec | null;
  if (!v || !spec || spec.template !== "drawing") return;

  const started = now();
  const prevKeys = new Set(previous.map((e) => e.key));
  const fresh: DrawElement[] = [];
  let dirty = false;
  let firstAt = 0;

  const apply = (status: "drawing" | "done") => {
    const cur = store.get().visuals[visualId];
    if (!cur || abort.signal.aborted) return;
    // While an update streams, the current drawing stays and new parts join it.
    const elements = status === "done" && fresh.length ? fresh : previous.length ? [...previous, ...fresh.filter((e) => !prevKeys.has(e.key))] : fresh;
    const next: DrawingSpec = { ...(cur.spec as DrawingSpec), elements, status };
    const r = prepareVisual(next, store.get().tables, { said: opts.said });
    if (r.ok) updateVisual(visualId, r.visual, r.spec);
  };
  const timer = window.setInterval(() => {
    if (dirty) {
      dirty = false;
      apply("drawing");
    }
  }, 90);

  try {
    const res = await fetch("/api/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        title: spec.title,
        caption: spec.caption,
        brief: spec.brief,
        aspect: spec.aspect,
        style: spec.style ?? "card",
        said: opts.said.map(sayable),
        previous: previous.map(elementLine),
      }),
    });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `drawing failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let control: { done?: boolean; error?: string; model?: string; ms?: number } = {};
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const { lines, rest } = takeLines(done ? `${buffer}\n` : buffer);
      buffer = rest;
      for (const line of lines) {
        const t = line.trim();
        if (t.startsWith("{")) {
          try {
            control = { ...control, ...(JSON.parse(t) as typeof control) };
          } catch {
            // Not a control line.
          }
          continue;
        }
        const el = parseElement(t);
        if (!el || fresh.some((e) => e.key === el.key)) continue;
        fresh.push(el);
        if (!firstAt) firstAt = now();
        dirty = true;
      }
      if (done) break;
    }
    window.clearInterval(timer);
    if (control.error) throw new Error(control.error);
    if (fresh.length === 0) throw new Error("the drawing came back empty");
    apply("done");
    if (opts.logId !== undefined && opts.log) {
      const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
      opts.log(opts.logId, {
        notes: [`Drawn by ${control.model ?? "the artist"}: first strokes after ${secs(firstAt - started)}, done in ${secs(now() - started)}, ${fresh.length} parts`],
      });
    }
  } catch (err) {
    window.clearInterval(timer);
    if (abort.signal.aborted) return;
    // Keep whatever was drawn; with nothing drawn, the placeholder stops breathing.
    apply("done");
    if (opts.logId !== undefined && opts.log) opts.log(opts.logId, { errors: [`Drawing: ${(err as Error).message}`] });
  } finally {
    if (running.get(visualId) === abort) running.delete(visualId);
  }
}
