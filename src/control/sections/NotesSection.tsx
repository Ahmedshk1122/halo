import { useRef, useState } from "react";
import notesSample from "../../../samples/talk_notes.md?raw";
import { TEMPLATE_LABELS } from "../../../shared/visuals";
import { useStore } from "../createStore";
import { director } from "../director/director";
import { prepareFromNotes } from "../director/planner";
import { store } from "../state";
import { Button, Empty, Group, Pill, Row } from "../ui/controls";

export function NotesSection() {
  const prepared = useStore(store, (s) => s.prepared);
  const tables = useStore(store, (s) => s.tables);
  const provider = useStore(store, (s) => s.director.provider);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const run = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const r = await prepareFromNotes(notes);
      const ready = r.prepared.filter((p) => p.visual).length;
      setStatus({
        tone: "good",
        text: `${ready} of ${r.prepared.length} visuals ready${r.model && r.model !== "replay" ? ` · ${r.model}` : ""}${r.ms ? ` · ${(r.ms / 1000).toFixed(1)} s` : ""}`,
      });
    } catch (e) {
      setStatus({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Group
        title="Talk notes"
        footer="Halo reads your notes once, before you present, and prepares the visuals you will likely need. During the talk it can show them instantly."
        actions={
          <>
            <Button variant="plain" onClick={() => setNotes(notesSample)}>
              Use sample notes
            </Button>
            <Button variant="plain" onClick={() => input.current?.click()}>
              Open file…
            </Button>
            <Button variant="primary" onClick={run} disabled={busy || !notes.trim()}>
              {busy ? "Preparing…" : "Prepare visuals"}
            </Button>
          </>
        }
      >
        <textarea
          className="script-editor"
          placeholder="Paste your notes or outline here"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <input
          ref={input}
          type="file"
          accept=".md,.txt,.markdown,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setNotes(await f.text());
            e.target.value = "";
          }}
        />
        {tables.length === 0 && <p className="notice is-bad">Load your data first, so prepared visuals can use your numbers.</p>}
        {provider === "replay" && <p className="notice">Replay is on: preparing uses a recorded plan for the sample notes.</p>}
        {status && <p className={`notice is-${status.tone}`}>{status.text}</p>}
      </Group>

      <Group title="Prepared visuals">
        {prepared.length === 0 ? (
          <Empty title="Nothing prepared">Prepared visuals appear here with when Halo expects to use them.</Empty>
        ) : (
          prepared.map((p) => (
            <Row
              key={p.id}
              label={
                <span className="prepared-label">
                  {p.title}
                  <span className="muted mono">{p.id}</span>
                </span>
              }
              detail={p.visual ? `${TEMPLATE_LABELS[p.template]} · ${p.when}` : `Dropped: ${p.errors.join("; ")}`}
            >
              {p.visual ? (
                <Button onClick={() => director.showPrepared(p.id, `You showed ${p.title} from the panel`)}>Show now</Button>
              ) : (
                <Pill tone="bad">Dropped</Pill>
              )}
            </Row>
          ))
        )}
      </Group>
    </>
  );
}
