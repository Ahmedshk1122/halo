import type { RStatement } from "../../../shared/visuals";
import { useStore } from "../createStore";
import { Preview } from "../Preview";
import { clearStage, removeVisual, showVisual } from "../stageActions";
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
