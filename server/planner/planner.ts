import { plannerTools, specFromToolInput, TEMPLATE_FOR_PLANNER_TOOL } from "../../shared/director";
import type { TemplateId, VisualSpec } from "../../shared/visuals";
import type { LLMClient } from "../llm/types";

export const PLANNER_SYSTEM = `You prepare visuals for Halo before someone goes on camera. Halo draws live visuals onto a person's video as they speak: in a meeting, a lesson, a product demo, a video for social media, any explanation on any topic. Read their notes and prepare the visuals they will most likely want, so each can appear instantly at the right moment.

- Prepare a visual for each moment worth seeing: something to picture or draw, how something works, a list, steps, a comparison, numbers, a place, a moment in a story. Skip greetings and thanks.
- Call one prepare tool per visual, all in this one response.
- Drawings (prepare_draw) are composed from scratch for any subject, real or imagined: draw the actual shapes, laid out so every label reads at a glance.
- Numbers come from the notes or the data catalog. For a number written in the notes, use pick "said" with said_value (exactly as written: $200K is 200000), said_unit, said_currency and a short said_label, or table "said" with said_points for a series. For catalog numbers use data references with table and column names exactly as written there. Never invent, estimate or compute a number. Keep digits out of titles and labels unless the notes contain that exact number.
- Copy is short and specific, sentence case. No exclamation marks, no emoji, no quotation marks. Distil the notes, do not copy sentences.
- For lists, steps and timelines they will walk through, use reveal "progressive" and give each item a cue: two to four distinctive words they will say for it, taken from the notes' wording.
- style: float for drawings and anything that should feel part of the scene, card for text-heavy visuals.
- prepared_id: short, lowercase, words joined by dashes. when: the moment to show it, in a few words.`;

export interface PlannedVisual {
  id: string;
  when: string;
  template: TemplateId;
  spec: VisualSpec;
}

export async function plan(llm: LLMClient, notes: string, catalog: string, opts: { model: string; effort: "low" | "medium" | "high" }) {
  const result = await llm.callTools({
    model: opts.model,
    effort: opts.effort,
    system: [{ text: PLANNER_SYSTEM, cache: true }],
    user: `<data_catalog>\n${catalog}\n</data_catalog>\n\n<talk_notes>\n${notes}\n</talk_notes>\n\nPrepare the visuals now.`,
    tools: plannerTools(),
    mode: "many",
    maxTokens: 16000,
    timeoutMs: 180_000,
  });
  const seen = new Set<string>();
  const visuals: PlannedVisual[] = [];
  for (const call of result.calls) {
    const template = TEMPLATE_FOR_PLANNER_TOOL[call.name];
    if (!template) continue;
    let id = String(call.input.prepared_id ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") || `${template}-${visuals.length + 1}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    visuals.push({ id, when: String(call.input.when ?? ""), template, spec: specFromToolInput(template, call.input) });
  }
  return { visuals, model: result.model, ms: Math.round(result.ms), stopReason: result.stopReason };
}
