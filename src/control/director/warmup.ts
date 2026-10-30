// Keeps the director's prompt prefix in Claude's cache: warm it when a talk or
// rehearsal starts and when the data or prepared visuals change, and refresh it
// every few minutes while listening (the cache lives five minutes).
import { describeCatalog } from "../../../shared/data";
import { store, type ControlState } from "../state";

const REFRESH_MS = 4 * 60 * 1000;
let timer = 0;
let lastKey = "";
let lastAt = 0;

function context(s: ControlState) {
  return {
    catalog: describeCatalog(s.tables),
    prepared: s.prepared.filter((p) => p.visual).map((p) => ({ id: p.id, template: p.template, title: p.title, when: p.when })),
  };
}

async function warmNow(force = false) {
  const s = store.get();
  if (s.director.provider !== "claude") return;
  const ctx = context(s);
  const key = JSON.stringify(ctx);
  if (!force && key === lastKey && performance.now() - lastAt < REFRESH_MS) return;
  lastKey = key;
  lastAt = performance.now();
  await fetch("/api/director/warm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ctx) }).catch(() => undefined);
}

export function startWarmup() {
  store.subscribe((s, prev) => {
    const listening = s.speech.status !== "idle" && s.speech.status !== "error" && s.speech.status !== "unsupported";
    const wasListening = prev.speech.status !== "idle" && prev.speech.status !== "error" && prev.speech.status !== "unsupported";
    if (listening && !wasListening) {
      void warmNow();
      window.clearInterval(timer);
      timer = window.setInterval(() => void warmNow(true), REFRESH_MS);
    } else if (!listening && wasListening) {
      window.clearInterval(timer);
    }
    if (listening && (s.tables !== prev.tables || s.prepared !== prev.prepared)) void warmNow();
  });
}
