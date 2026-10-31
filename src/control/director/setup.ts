// Chooses the director provider from settings and exposes hooks for tests.
import replay from "../../../fixtures/replay_onboarding.json";
import { store } from "../state";
import { director } from "./director";
import { ReplayDirector, ServerDirector, type ReplayFixture } from "./providers";
import { startWarmup } from "./warmup";

export const replayDirector = new ReplayDirector((replay as { fixtures: ReplayFixture[] }).fixtures);

/** Reads the server's provider and pacing limits (free-tier keys need slower pacing). */
async function syncServer() {
  try {
    const h = (await fetch("/api/health").then((r) => r.json())) as {
      provider?: "anthropic" | "gemini";
      limits?: { minIntervalMs: number; interimTriggers: boolean };
    };
    director.setLimits(h.limits ?? { minIntervalMs: 0, interimTriggers: true });
    if (store.get().ai.provider !== (h.provider ?? "anthropic")) store.set({ ai: { provider: h.provider ?? "anthropic" } });
  } catch {
    // Server offline: keep the last known settings.
  }
}

export function startDirector() {
  void syncServer();
  window.setInterval(() => void syncServer(), 15_000);
  const apply = () => {
    const p = store.get().director.provider;
    if (p === "replay") {
      replayDirector.reset();
      director.setProvider(replayDirector);
    } else {
      director.setProvider(new ServerDirector());
    }
  };
  apply();
  startWarmup();
  store.subscribe((s, prev) => {
    if (s.director.provider !== prev.director.provider) apply();
  });
  // Rehearsal restarts replay from the top.
  const reset = director.reset.bind(director);
  director.reset = () => {
    replayDirector.reset();
    reset();
  };
  (window as unknown as { halo: unknown }).halo = { store, director };
}
