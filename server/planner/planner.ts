import { plannerTools, specFromToolInput, TEMPLATE_FOR_TOOL } from "../../shared/director";
import type { TemplateId, VisualSpec } from "../../shared/visuals";
import type { LLMClient } from "../llm/types";

export const PLANNER_SYSTEM = `You prepare visuals for Halo before a talk. During the talk Halo puts visuals on the presenter's camera feed as they speak, like a slide deck that builds itself. Read the presenter's notes and prepare the visuals Halo will most likely need, so each can be shown instantly at the right moment.

- Prepare one visual for each moment that needs one: a headline number from the data, a comparison, a sequence, a structure, a plan, a "picture this" screen, a closing ask. Skip greetings, stories, thanks and anything already clear from speech. Usually three to eight visuals.
- Call one prepare tool per visual, all in this one response.
- Numbers come only from the data catalog, through data references with table and column names exactly as written there. Never type a digit, percentage, currency amount or number word into any text field. Month, quarter and year names and small counts like "three moves" are fine. If the notes mention a number that is not in the catalog, leave it off.
- Copy is short, specific and sentence case: titles of two to five words, points of two to six words. No exclamation marks, no emoji, no quotation marks. Distil the notes, do not copy sentences.
- For lists and timelines the presenter will walk through, use reveal "progressive" and give each item a cue: two to four distinctive words they will say for it, taken from the notes' wording.
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
    const template = TEMPLATE_FOR_TOOL[call.name.replace("prepare_", "show_")];
    if (!template) continue;
    let id = String(call.input.prepared_id ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") || `${template}-${visuals.length + 1}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    visuals.push({ id, when: String(call.input.when ?? ""), template, spec: specFromToolInput(template, call.input) });
  }
  return { visuals, model: result.model, ms: Math.round(result.ms), stopReason: result.stopReason };
}
