import { Mic, MicOff, Play } from "lucide-react";
import { WebSpeechSource } from "../speech/webSpeech";
import { useStore } from "./createStore";
import { director } from "./director/director";
import { fmtMs, latencyTone } from "./Inspector";
import { store } from "./state";
import { Pill } from "./ui/controls";

/** Start or stop listening to the microphone (Web Speech). */
export function ListenButton() {
  const speech = useStore(store, (s) => s.speech);
  const live = speech.source === "live" && speech.status !== "idle";
  const label =
    speech.source === "rehearsal"
      ? "Rehearsing"
      : speech.status === "listening"
        ? "Listening"
        : speech.status === "restarting" || speech.status === "starting"
          ? "Starting…"
          : speech.status === "error" || speech.status === "unsupported"
            ? "Mic unavailable"
            : "Listen";
  return (
    <button
      type="button"
      className={`btn ${live ? "btn-primary" : "btn-default"} listen-btn`}
      title={speech.detail ?? (live ? "Stop listening" : "Start listening to your microphone")}
      onClick={() => (live ? director.detach() : director.attach(new WebSpeechSource()))}
    >
      {speech.source === "rehearsal" ? <Play size={14} strokeWidth={2} /> : live ? <Mic size={14} strokeWidth={2} /> : <MicOff size={14} strokeWidth={2} />}
      {label}
    </button>
  );
}

/** Median end-of-speech-to-visual latency over the last five visuals. */
export function LatencyPill() {
  const decisions = useStore(store, (s) => s.decisions);
  const samples = decisions
    .filter((d) => d.onScreenMs !== undefined && d.source !== "command")
    .slice(-5)
    .map((d) => d.onScreenMs!)
    .sort((a, b) => a - b);
  if (samples.length === 0) return null;
  const median = samples[Math.floor(samples.length / 2)];
  return (
    <Pill tone={latencyTone(median)} title="Median end of speech to visual on stage, last five visuals. Target 2.5 s.">
      Latency {fmtMs(median)}
    </Pill>
  );
}
