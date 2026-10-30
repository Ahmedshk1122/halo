// Speech-to-text sits behind this interface so it can be swapped (Web Speech
// today; a native or cloud recognizer later). Rehearsal mode implements it too,
// so scripted runs go through exactly the same pipeline as live speech.

export type SpeechEvent =
  | { type: "interim"; text: string; at: number; label?: string }
  | { type: "final"; text: string; at: number; startedAt: number; label?: string };

export type SpeechState = "idle" | "starting" | "listening" | "restarting" | "error" | "unsupported";

export interface SpeechSource {
  readonly kind: "live" | "rehearsal";
  start(): void;
  stop(): void;
  onEvent(listener: (e: SpeechEvent) => void): () => void;
  onState(listener: (state: SpeechState, detail?: string) => void): () => void;
}

/** Tiny event helper for sources. */
export class Emitter<T extends unknown[]> {
  private listeners = new Set<(...args: T) => void>();
  on(listener: (...args: T) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(...args: T) {
    this.listeners.forEach((l) => l(...args));
  }
}
