// Chrome Web Speech API: continuous recognition with interim results,
// restarted automatically whenever Chrome ends the session.
import { now } from "../sync/channel";
import { Emitter, type SpeechEvent, type SpeechSource, type SpeechState } from "./types";

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function recognitionCtor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function webSpeechSupported(): boolean {
  return recognitionCtor() !== null;
}

export class WebSpeechSource implements SpeechSource {
  readonly kind = "live" as const;
  private events = new Emitter<[SpeechEvent]>();
  private states = new Emitter<[SpeechState, string | undefined]>();
  private rec: Recognition | null = null;
  private wanted = false;
  private failures = 0;
  private segmentStart = 0;
  private restartTimer = 0;

  constructor(private lang = "en-US") {}

  onEvent(listener: (e: SpeechEvent) => void) {
    return this.events.on(listener);
  }

  onState(listener: (state: SpeechState, detail?: string) => void) {
    return this.states.on(listener);
  }

  start() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      this.states.emit("unsupported", "This browser has no Web Speech API. Use Chrome.");
      return;
    }
    this.wanted = true;
    this.failures = 0;
    this.states.emit("starting", undefined);
    this.open(Ctor);
  }

  stop() {
    this.wanted = false;
    window.clearTimeout(this.restartTimer);
    this.rec?.abort();
    this.rec = null;
    this.states.emit("idle", undefined);
  }

  private open(Ctor: new () => Recognition) {
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      this.failures = 0;
      this.states.emit("listening", undefined);
    };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript.trim();
        if (!text) continue;
        if (r.isFinal) {
          const at = now();
          this.events.emit({ type: "final", text, at, startedAt: this.segmentStart || at });
          this.segmentStart = 0;
        } else {
          interim += (interim ? " " : "") + text;
        }
      }
      if (interim) {
        if (!this.segmentStart) this.segmentStart = now();
        this.events.emit({ type: "interim", text: interim, at: now() });
      }
    };
    rec.onerror = (e) => {
      // no-speech and aborted are routine; the end handler restarts.
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.wanted = false;
        this.states.emit("error", "Microphone access was denied");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        this.failures += 1;
        this.states.emit("restarting", e.error);
      }
    };
    rec.onend = () => {
      if (!this.wanted) return;
      // Chrome ends sessions after silence or about a minute; start again.
      const delay = Math.min(5000, this.failures * 500);
      this.states.emit("restarting", undefined);
      this.restartTimer = window.setTimeout(() => {
        if (this.wanted) this.open(Ctor);
      }, delay);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.failures += 1;
    }
  }
}
