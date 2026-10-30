// Rehearsal: plays a timed text script through the same pipeline as live
// speech. Words arrive as interim results at speaking pace, then each line
// is finalized, just like Web Speech.
import { parseScript, type ScriptLine } from "../../shared/rehearsalScript";
import { now } from "../sync/channel";
import { Emitter, type SpeechEvent, type SpeechSource, type SpeechState } from "./types";

export interface RehearsalOptions {
  wordsPerMinute: number;
  speed: number;
  /** Silence after each line before the next one starts (seconds at 1×). */
  lineGap: number;
}

export interface RehearsalProgress {
  index: number;
  total: number;
  line: ScriptLine | null;
  done: boolean;
}

export class RehearsalSource implements SpeechSource {
  readonly kind = "rehearsal" as const;
  private events = new Emitter<[SpeechEvent]>();
  private states = new Emitter<[SpeechState, string | undefined]>();
  private progress = new Emitter<[RehearsalProgress]>();
  private timer = 0;
  private running = false;
  private lines: ScriptLine[];

  constructor(
    script: string,
    private opts: RehearsalOptions,
  ) {
    this.lines = parseScript(script);
  }

  onEvent(listener: (e: SpeechEvent) => void) {
    return this.events.on(listener);
  }
  onState(listener: (state: SpeechState, detail?: string) => void) {
    return this.states.on(listener);
  }
  onProgress(listener: (p: RehearsalProgress) => void) {
    return this.progress.on(listener);
  }

  get total() {
    return this.lines.length;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.states.emit("listening", undefined);
    this.playLine(0);
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    this.states.emit("idle", undefined);
  }

  private wait(seconds: number, then: () => void) {
    this.timer = window.setTimeout(() => {
      if (this.running) then();
    }, (seconds * 1000) / this.opts.speed);
  }

  private playLine(i: number) {
    if (i >= this.lines.length) {
      this.progress.emit({ index: i, total: this.lines.length, line: null, done: true });
      this.running = false;
      this.states.emit("idle", undefined);
      return;
    }
    const line = this.lines[i];
    this.progress.emit({ index: i, total: this.lines.length, line, done: false });
    if (line.kind === "pause") {
      this.wait(line.seconds, () => this.playLine(i + 1));
      return;
    }
    const words = line.text.split(/\s+/).filter(Boolean);
    const perWord = 60 / this.opts.wordsPerMinute;
    const startedAt = now();
    const speakWord = (w: number) => {
      if (w < words.length) {
        this.events.emit({ type: "interim", text: words.slice(0, w + 1).join(" "), at: now(), label: line.beat });
        this.wait(perWord, () => speakWord(w + 1));
        return;
      }
      // Recognizers finalize shortly after the speaker stops.
      this.wait(0.35, () => {
        this.events.emit({ type: "final", text: line.text, at: now(), startedAt, label: line.beat });
        this.wait(this.opts.lineGap, () => this.playLine(i + 1));
      });
    };
    speakWord(0);
  }
}
