// Chooses the director provider from settings and exposes hooks for tests.
import replay from "../../../fixtures/replay_onboarding.json";
import { store } from "../state";
import { director } from "./director";
import { ReplayDirector, ServerDirector, type ReplayFixture } from "./providers";

export const replayDirector = new ReplayDirector((replay as { fixtures: ReplayFixture[] }).fixtures);

export function startDirector() {
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
