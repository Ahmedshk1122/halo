import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(update: Partial<T> | ((prev: T) => Partial<T>)): void;
  subscribe(listener: (state: T, prev: T) => void): () => void;
}

/** Minimal external store; the control window keeps all Halo state in one of these. */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(state: T, prev: T) => void>();
  return {
    get: () => state,
    set(update) {
      const prev = state;
      const patch = typeof update === "function" ? update(prev) : update;
      state = { ...prev, ...patch };
      listeners.forEach((l) => l(state, prev));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => selector(store.get()),
    () => selector(store.get()),
  );
}
