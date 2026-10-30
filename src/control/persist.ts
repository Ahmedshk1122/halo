// Keeps loaded data and preferences across reloads (per browser, local only).
import { store, type ControlState } from "./state";

const KEY = "halo.v1";
type Persisted = Pick<ControlState, "tables" | "glass" | "cameraDeviceId" | "reducedMotion"> & {
  provider?: ControlState["director"]["provider"];
  proactivity?: ControlState["director"]["proactivity"];
  hands?: boolean;
  faceZone?: boolean;
};

export function restore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<Persisted>;
    store.set({
      ...(Array.isArray(saved.tables) ? { tables: saved.tables } : {}),
      ...(saved.glass === "dark" || saved.glass === "light" ? { glass: saved.glass } : {}),
      ...(typeof saved.cameraDeviceId === "string" ? { cameraDeviceId: saved.cameraDeviceId } : {}),
      ...(typeof saved.reducedMotion === "boolean" ? { reducedMotion: saved.reducedMotion } : {}),
    });
    store.set((s) => ({
      director: {
        ...s.director,
        ...(saved.provider === "claude" || saved.provider === "replay" ? { provider: saved.provider } : {}),
        ...(saved.proactivity === "quiet" || saved.proactivity === "balanced" || saved.proactivity === "eager" ? { proactivity: saved.proactivity } : {}),
      },
      hands: {
        ...s.hands,
        ...(typeof saved.hands === "boolean" ? { enabled: saved.hands } : {}),
        ...(typeof saved.faceZone === "boolean" ? { showFaceZone: saved.faceZone } : {}),
      },
    }));
  } catch {
    // Private window or blocked storage: start fresh.
  }
}

export function startPersisting() {
  store.subscribe((s, prev) => {
    if (
      s.tables === prev.tables &&
      s.glass === prev.glass &&
      s.cameraDeviceId === prev.cameraDeviceId &&
      s.reducedMotion === prev.reducedMotion &&
      s.director.provider === prev.director.provider &&
      s.director.proactivity === prev.director.proactivity &&
      s.hands.enabled === prev.hands.enabled &&
      s.hands.showFaceZone === prev.hands.showFaceZone
    ) {
      return;
    }
    const data: Persisted = {
      tables: s.tables,
      glass: s.glass,
      cameraDeviceId: s.cameraDeviceId,
      reducedMotion: s.reducedMotion,
      provider: s.director.provider,
      proactivity: s.director.proactivity,
      hands: s.hands.enabled,
      faceZone: s.hands.showFaceZone,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked: not fatal.
    }
  });
}
