// Talk notes → prepared visuals. One planning pass up front; the director can
// then show a prepared visual by id, which is much faster than building one.
import replayPlan from "../../../fixtures/replay_plan.json";
import { describeCatalog } from "../../../shared/data";
import { specFromToolInput, TEMPLATE_FOR_TOOL } from "../../../shared/director";
import { prepareVisual } from "../../../shared/resolve";
import type { TemplateId, VisualSpec } from "../../../shared/visuals";
import { store, type PreparedVisual } from "../state";

interface PlannedVisual {
  id: string;
  when: string;
  template: TemplateId;
  spec: VisualSpec;
}

async function fromServer(notes: string): Promise<{ visuals: PlannedVisual[]; model: string; ms: number }> {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes, catalog: describeCatalog(store.get().tables) }),
  });
  const body = (await res.json().catch(() => ({}))) as { visuals?: PlannedVisual[]; model?: string; ms?: number; error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `Server error ${res.status}`);
  return { visuals: body.visuals ?? [], model: body.model ?? "", ms: body.ms ?? 0 };
}

function fromReplay(): { visuals: PlannedVisual[]; model: string; ms: number } {
  const calls = (replayPlan as { calls: { name: string; input: Record<string, unknown> }[] }).calls;
  const visuals = calls.flatMap((c) => {
    const template = TEMPLATE_FOR_TOOL[c.name.replace("prepare_", "show_")];
    if (!template) return [];
    return [{ id: String(c.input.prepared_id), when: String(c.input.when), template, spec: specFromToolInput(template, c.input) }];
  });
  return { visuals, model: "replay", ms: 0 };
}

/** Runs the planning pass and grounds every prepared visual against the loaded data. */
export async function prepareFromNotes(notes: string): Promise<{ prepared: PreparedVisual[]; model: string; ms: number }> {
  const started = performance.now();
  const result = store.get().director.provider === "replay" ? fromReplay() : await fromServer(notes);
  const tables = store.get().tables;
  const prepared: PreparedVisual[] = result.visuals.map((p) => {
    const r = prepareVisual(p.spec, tables);
    return {
      id: p.id,
      when: p.when,
      template: p.template,
      title: r.ok ? r.visual.title : p.spec.title,
      spec: r.ok ? r.spec : p.spec,
      visual: r.ok ? r.visual : null,
      errors: r.ok ? [] : r.errors,
    };
  });
  store.set({ prepared });
  return { prepared, model: result.model, ms: result.ms || Math.round(performance.now() - started) };
}
