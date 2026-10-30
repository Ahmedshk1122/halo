import { useState } from "react";
import { prepareVisual } from "../../../shared/resolve";
import { revealCount, type RStatement } from "../../../shared/visuals";
import { SAMPLE_SPECS } from "../../gallery/sampleSpecs";
import { useStore } from "../createStore";
import { Preview } from "../Preview";
import { clearStage, removeVisual, setReveal, showVisual } from "../stageActions";
import { store } from "../state";
import { Group, Row, Segmented, Switch } from "../ui/controls";

const TEST_CARD: RStatement = {
  template: "statement",
  title: "Test card",
  kicker: "Halo",
  text: "Stage and control are in sync",
  accent: "blue",
};

export function LiveSection() {
  const glass = useStore(store, (s) => s.glass);
  const testId = useStore(store, (s) => s.onStage.find((id) => s.visuals[id]?.source === "test") ?? null);
  const [sample, setSample] = useState(0);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const showSample = () => {
    const { spec } = SAMPLE_SPECS[sample];
    const result = prepareVisual(spec, store.get().tables);
    if (!result.ok) {
      setNotice({ tone: "bad", text: `Dropped (${result.stage}): ${result.errors.join("; ")}` });
      return;
    }
    const id = showVisual(result.visual, { spec: result.spec, source: "manual", aliases: result.spec.aliases });
    setReveal(id, revealCount(result.visual));
    setNotice({ tone: "good", text: `Showing ${result.visual.title}. Every number came from your data.` });
  };

  return (
    <>
      <Preview interactive />
      <Group title="Stage">
        <Row label="Test card" detail="A static glass card, to check the stage window and OBS capture">
          <Switch
            label="Test card"
            checked={!!testId}
            onChange={(on) => {
              if (on) showVisual(TEST_CARD, { source: "test" });
              else if (testId) removeVisual(testId);
            }}
          />
        </Row>
        <Row label="Try a visual" detail="Resolves a sample spec against your loaded data">
          <div className="inline-form">
            <select className="select" value={sample} onChange={(e) => setSample(Number(e.target.value))}>
              {SAMPLE_SPECS.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-default" onClick={showSample}>
              Show
            </button>
          </div>
        </Row>
        {notice && <p className={`notice is-${notice.tone}`}>{notice.text}</p>}
        <Row label="Glass" detail="Material behind every visual">
          <Segmented
            value={glass}
            onChange={(g) => store.set({ glass: g })}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Row>
        <Row label="Clear stage" detail="Everything leaves the video. History is kept.">
          <button type="button" className="btn btn-default" onClick={clearStage}>
            Clear
          </button>
        </Row>
      </Group>
    </>
  );
}
