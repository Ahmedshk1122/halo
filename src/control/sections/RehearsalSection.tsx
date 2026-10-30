import { useEffect, useMemo, useRef, useState } from "react";
import sampleScript from "../../../samples/rehearsal_onboarding.txt?raw";
import { beatsOf, parseScript } from "../../../shared/rehearsalScript";
import { RehearsalSource, type RehearsalProgress } from "../../speech/rehearsal";
import { useStore } from "../createStore";
import { director } from "../director/director";
import { fmtMs, latencyTone } from "../Inspector";
import { Preview } from "../Preview";
import { store, type DecisionEntry } from "../state";
import { Button, Group, Pill, Row, Segmented } from "../ui/controls";

const SPEEDS = ["1", "1.5", "2"] as const;

let active: RehearsalSource | null = null;

export function RehearsalSection() {
  const [script, setScript] = useState(sampleScript);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>("1");
  const [progress, setProgress] = useState<RehearsalProgress | null>(null);
  const [running, setRunning] = useState(false);
  const provider = useStore(store, (s) => s.director.provider);
  const decisions = useStore(store, (s) => s.decisions);
  const lines = useMemo(() => parseScript(script), [script]);
  const offs = useRef<(() => void)[]>([]);

  useEffect(() => () => offs.current.forEach((o) => o()), []);

  const play = () => {
    director.reset();
    const source = new RehearsalSource(script, { wordsPerMinute: 165, speed: Number(speed), lineGap: 0.7 });
    offs.current.forEach((o) => o());
    offs.current = [
      source.onProgress((p) => {
        setProgress(p);
        if (p.done) {
          setRunning(false);
          // Let the last decision land before releasing the speech input.
          window.setTimeout(() => {
            if (active === source) {
              director.detach();
              active = null;
            }
          }, 4000);
          window.dispatchEvent(new CustomEvent("halo:rehearsal-done"));
        }
      }),
    ];
    active = source;
    setRunning(true);
    director.attach(source);
  };

  const stop = () => {
    if (active) director.detach();
    active = null;
    setRunning(false);
  };

  const current = progress?.line ?? null;
  return (
    <>
      <Preview />
      <Group
        title="Rehearsal"
        actions={
          running ? (
            <Button onClick={stop}>Stop</Button>
          ) : (
            <Button variant="primary" onClick={play}>
              Play script
            </Button>
          )
        }
        footer="The script runs through the same pipeline as live speech: interim words, final segments, the director, grounding and the stage. Playing resets the stage and log."
      >
        <Row label="Pace" detail="165 words a minute at 1×">
          <Segmented value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))} />
        </Row>
        <Row label="Director" detail={provider === "replay" ? "Replay: recorded decisions, no network. Switch in Settings." : "Claude, through the local server"}>
          <Pill tone={provider === "replay" ? "warn" : "accent"}>{provider === "replay" ? "Replay" : "Claude"}</Pill>
        </Row>
        {progress && (
          <Row label={progress.done ? "Finished" : `Line ${Math.min(progress.index + 1, progress.total)} of ${progress.total}`} detail={current?.beat}>
            <span className="muted rehearsal-now">{current?.text}</span>
          </Row>
        )}
      </Group>
      <RehearsalReport beats={beatsOf(lines)} decisions={decisions} />
      <Group title="Script" footer="One spoken line per row. ## names a beat, [pause 2] waits two seconds, # is a comment.">
        <textarea
          className="script-editor mono"
          value={script}
          spellCheck={false}
          onChange={(e) => setScript(e.target.value)}
          disabled={running}
        />
      </Group>
    </>
  );
}

/** What Halo did in each beat of the script. */
function RehearsalReport({ beats, decisions }: { beats: string[]; decisions: DecisionEntry[] }) {
  if (decisions.length === 0) return null;
  return (
    <Group title="What Halo did, beat by beat">
      {beats.map((beat) => {
        const inBeat = decisions.filter((d) => d.label === beat && d.outcome !== "pending");
        const changes = inBeat.filter((d) => d.outcome === "applied" || d.outcome === "dropped" || d.outcome === "deferred");
        return (
          <Row
            key={beat}
            label={beat}
            detail={
              changes.length === 0
                ? inBeat.length
                  ? "Nothing shown"
                  : "No decisions yet"
                : changes.map((d) => `${d.outcome === "dropped" ? "Dropped" : d.action} ${d.title ?? ""}`.trim()).join(" · ")
            }
          >
            {changes
              .filter((d) => d.onScreenMs !== undefined)
              .slice(0, 1)
              .map((d) => (
                <Pill key={d.id} tone={latencyTone(d.onScreenMs)}>
                  {fmtMs(d.onScreenMs)}
                </Pill>
              ))}
          </Row>
        );
      })}
    </Group>
  );
}
