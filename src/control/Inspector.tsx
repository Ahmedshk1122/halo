import { useEffect, useRef, useState } from "react";
import { TEMPLATE_LABELS } from "../../shared/visuals";
import { useStore } from "./createStore";
import { store, type DecisionEntry } from "./state";
import { Empty, Pill, Segmented } from "./ui/controls";

type Tab = "transcript" | "decisions" | "arc";

export const LATENCY_TARGET_MS = 2500;

export function latencyTone(ms: number | undefined): "good" | "warn" | "bad" | "neutral" {
  if (ms === undefined) return "neutral";
  if (ms <= LATENCY_TARGET_MS) return "good";
  if (ms <= LATENCY_TARGET_MS * 1.6) return "warn";
  return "bad";
}

export function fmtMs(ms: number | undefined): string {
  if (ms === undefined) return "–";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Right-hand inspector: transcript, Halo's decision log, and the arc of the talk. Presenter only. */
export function Inspector() {
  const [tab, setTab] = useState<Tab>("decisions");
  return (
    <aside className="ctl-inspector">
      <div className="ctl-inspector-head">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          label="Inspector"
          options={[
            { value: "transcript", label: "Transcript" },
            { value: "decisions", label: "Decisions" },
            { value: "arc", label: "Arc" },
          ]}
        />
      </div>
      <div className="ctl-inspector-body">
        {tab === "transcript" && <TranscriptView />}
        {tab === "decisions" && <DecisionsView />}
        {tab === "arc" && <ArcView />}
      </div>
    </aside>
  );
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function TranscriptView() {
  const transcript = useStore(store, (s) => s.transcript);
  const interim = useStore(store, (s) => s.interim);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [transcript.length, interim?.text]);
  if (transcript.length === 0 && !interim) {
    return <Empty title="No speech yet">Only you can see the transcript. It never appears on the video.</Empty>;
  }
  let lastLabel: string | undefined;
  return (
    <div className="transcript">
      {transcript.map((l) => {
        const header = l.label && l.label !== lastLabel ? l.label : null;
        lastLabel = l.label ?? lastLabel;
        return (
          <div key={l.id}>
            {header && <div className="transcript-beat">{header}</div>}
            <p className="transcript-line">
              <span className="transcript-time">{clock(l.at)}</span>
              {l.text}
              {l.command && (
                <Pill tone="accent" title="Handled as a voice command">
                  {l.command}
                </Pill>
              )}
            </p>
          </div>
        );
      })}
      {interim && <p className="transcript-line is-interim">{interim.text}</p>}
      <div ref={end} />
    </div>
  );
}

const ACTION_LABEL: Record<DecisionEntry["action"], string> = {
  none: "None",
  show: "Show",
  update: "Update",
  tuck: "Tuck",
  recall: "Recall",
  clear: "Clear",
  error: "Error",
};

function outcomeTone(d: DecisionEntry): "good" | "warn" | "bad" | "neutral" | "accent" {
  if (d.outcome === "error" || d.outcome === "dropped") return "bad";
  if (d.outcome === "deferred" || d.outcome === "superseded") return "warn";
  if (d.outcome === "pending") return "neutral";
  if (d.action === "none" || d.outcome === "none") return "neutral";
  return "accent";
}

function DecisionsView() {
  const decisions = useStore(store, (s) => s.decisions);
  const inFlight = useStore(store, (s) => s.director.inFlight);
  const [filter, setFilter] = useState<"all" | "changes">("all");
  const shown = decisions.filter((d) => filter === "all" || (d.action !== "none" && d.outcome !== "none")).slice().reverse();
  return (
    <div className="decisions">
      <div className="decisions-head">
        <Segmented
          size="small"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "changes", label: "Changes" },
          ]}
        />
        {inFlight && <span className="muted">Thinking…</span>}
      </div>
      {shown.length === 0 && <Empty title="No decisions yet">Halo logs every decision here, with its reason and latency.</Empty>}
      {shown.map((d) => (
        <article key={d.id} className="decision" data-action={d.action} data-outcome={d.outcome}>
          <header className="decision-head">
            <Pill tone={outcomeTone(d)}>
              {d.outcome === "dropped" ? "Dropped" : d.outcome === "deferred" ? "Waiting" : d.outcome === "superseded" ? "Replaced" : d.outcome === "pending" ? "…" : ACTION_LABEL[d.action]}
            </Pill>
            <span className="decision-title">{d.title ?? (d.action === "none" ? "Nothing on screen changes" : d.beat)}</span>
            {d.template && <span className="muted">{TEMPLATE_LABELS[d.template]}</span>}
          </header>
          {d.reason && <p className="decision-reason">{d.reason}</p>}
          {d.errors?.map((e) => (
            <p key={e} className="decision-error">
              {e}
            </p>
          ))}
          <footer className="decision-meta">
            <span>{clock(d.at)}</span>
            <span>{d.source === "command" ? "voice command" : d.trigger === "interim" ? "mid-sentence" : d.trigger === "request" ? "your request" : "end of sentence"}</span>
            {d.label && <span>{d.label}</span>}
            {d.requestMs !== undefined && <span title="Round trip to the director">director {fmtMs(d.requestMs)}</span>}
            {d.onScreenMs !== undefined && (
              <Pill tone={latencyTone(d.onScreenMs)} title="End of speech to visual on stage (target 2.5 s)">
                on screen {fmtMs(d.onScreenMs)}
              </Pill>
            )}
          </footer>
        </article>
      ))}
    </div>
  );
}

function ArcView() {
  const arc = useStore(store, (s) => s.arc);
  const visuals = useStore(store, (s) => s.visuals);
  if (!arc.summary && arc.beats.length === 0) return <Empty title="No arc yet">Beats of your talk appear here as Halo follows along.</Empty>;
  return (
    <div className="arc">
      {arc.summary && <p className="arc-summary">{arc.summary}</p>}
      <ol className="arc-beats">
        {arc.beats.map((b, i) => (
          <li key={i} className={`arc-beat${i === arc.beats.length - 1 ? " is-current" : ""}`}>
            <span className="arc-beat-name">{b.name}</span>
            <span className="muted">{clock(b.at)}</span>
            {b.visualIds.length > 0 && (
              <span className="arc-beat-visuals">{b.visualIds.map((id) => visuals[id]?.title ?? id).join(", ")}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
