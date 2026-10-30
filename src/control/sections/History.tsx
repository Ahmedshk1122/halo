import { TemplateIcon } from "../../templates/icons";
import { TEMPLATE_LABELS } from "../../../shared/visuals";
import { useStore } from "../createStore";
import { recallVisual, removeVisual, toggleExpand, tuckVisual } from "../stageActions";
import { store, type VisualInstance } from "../state";
import { Button, Empty, Group, Pill } from "../ui/controls";

/** Everything Halo has shown this session: on stage, tucked into chips, or cleared. */
export function History() {
  const visuals = useStore(store, (s) => s.visuals);
  const onStage = useStore(store, (s) => s.onStage);
  const chips = useStore(store, (s) => s.chips);
  const all = Object.values(visuals)
    .filter((v) => v.source !== "test")
    .sort((a, b) => b.createdAt - a.createdAt);
  const status = (v: VisualInstance) => (onStage.includes(v.id) ? "On stage" : chips.includes(v.id) ? "Chip" : "Earlier");
  return (
    <Group title="Visuals" footer="Recall brings a visual back to the stage. Voice works too: “Halo, back to the funnel”.">
      {all.length === 0 ? (
        <Empty title="Nothing shown yet">Visuals Halo shows appear here, newest first.</Empty>
      ) : (
        all.map((v) => {
          const st = status(v);
          return (
            <div key={v.id} className="row history-row">
              <span className="history-icon">
                <TemplateIcon template={v.visual.template} size={16} />
              </span>
              <div className="row-text">
                <div className="row-label">{v.title}</div>
                <div className="row-detail">
                  {TEMPLATE_LABELS[v.visual.template]} · {v.id}
                  {v.beat ? ` · ${v.beat}` : ""}
                </div>
              </div>
              <div className="row-control">
                <Pill tone={st === "On stage" ? "accent" : "neutral"}>{st}</Pill>
                {st === "On stage" ? (
                  <>
                    <Button variant="plain" onClick={() => toggleExpand(v.id)}>
                      {v.expanded ? "Collapse" : "Expand"}
                    </Button>
                    <Button onClick={() => tuckVisual(v.id)}>Tuck</Button>
                  </>
                ) : (
                  <Button onClick={() => recallVisual(v.id)}>Recall</Button>
                )}
                <Button variant="plain" onClick={() => removeVisual(v.id)} title="Remove from history">
                  Remove
                </Button>
              </div>
            </div>
          );
        })
      )}
    </Group>
  );
}
