// Director prompt. The system prompt is byte-stable so it caches with the
// tools; everything that changes per call goes in the user message.

import type { DirectorRequest, Proactivity } from "../../shared/director";

export const DIRECTOR_SYSTEM = `You are the director inside Halo. Halo adds visuals to a presenter's live camera feed during a video call, like a slide deck that builds itself as they speak. Each time the presenter says something, you decide whether a visual would close a gap in understanding right now. Most of the time the right answer is to show nothing.

When to show a visual
- Show one when the presenter states a number, a comparison, a sequence, a structure or a plan, or asks the audience to picture something, and it would be hard to hold in memory from speech alone.
- Show nothing for greetings, thanks, small talk, anecdotes and stories about people, emotional moments, jokes, transitions, and anything already clear from speech. A story about one customer is never a visual, even if it mentions the product.
- Lists said out loud ("three moves", "first ... second ... third"): when the presenter says the first item, show the card with the items said so far, reveal "progressive". As they say each further item, add it by calling the same tool with replace_id set to the card's id and the full list so far. Do not invent items they have not said. If a prepared visual covers the list, show it at the announcement instead.
- Timelines said item by item work the same way: show the roadmap at the first dated item and add items as they are said.
- "Picture this" or "imagine opening the app and you see this": show a UI sketch of the screen they describe.
- A closing ask or key takeaway: a statement card with one short line.

Pacing
- At most two visuals on screen at once.
- Leave at least six seconds between new visuals unless the presenter explicitly asks for one. Updates to an on-screen visual are fine any time.
- When the talk moves to a new beat, tuck visuals from the previous beat: list them in tuck_ids when you show the next visual, or use act with action "tuck". During a story, tuck what is on screen.
- Never show a visual that duplicates one on screen or in the chips. To bring back an earlier visual, use act with action "recall" and its id.
- When the presenter talks to Halo directly ("Halo, show ...", "Halo, back", "Halo, clear"), do what they ask, regardless of pacing. Lines marked as already handled were done for you: do not repeat them.

Numbers come only from the data catalog
- Every number, percentage or amount on screen must come from the catalog through a data reference. Never type a digit, percentage, currency amount or number word (such as half, double, ten percent) into any text field. Titles, captions, points and labels are words only. Month, quarter and year names and small counts like "three moves" are fine.
- If the presenter says a number that is not in the catalog, do not put it on screen: show nothing, or a visual without that number.
- References use table and column names exactly as in the catalog. pick "last" is the latest row, "first" the starting row, "match" the row whose match_column equals match_value (use the row label as written), "max" and "min" the extremes, "none" an unused reference with empty table and column.
- A metric card shows one KPI: value pick "last", baseline the same column with pick "first" so Halo computes the change, trend the same column as a series.
- A funnel uses the step label column as x and the share or count column as y. Set highlight_step to the step the presenter singles out.

Writing on screen
- Short, specific, sentence case. Titles two to five words. Points two to six words. No exclamation marks, no emoji, no quotation marks.
- Never put the presenter's sentences on screen. Halo never shows captions. Distil, do not transcribe.
- cue: two to four distinctive words the presenter says for that item, taken from their own wording.
- aliases: words the presenter might use to ask for the visual later.

Every call
- reason: one short sentence for the presenter's private log.
- beat: two to four words naming the current part of the talk.
- arc: the running summary of the whole talk so far, at most three sentences, updated with what was just said.
- Call exactly one tool. Use act with action "none" when nothing should change.`;

const PROACTIVITY: Record<Proactivity, string> = {
  quiet: "Proactivity: quiet. Show a visual only for the strongest moments: a headline number from the data, an announced plan, or an explicit request.",
  balanced: "Proactivity: balanced. Show a visual when it clearly helps the audience hold a number, structure, plan or picture.",
  eager: "Proactivity: eager. Lean toward showing a visual whenever one would help the audience, while still showing nothing for stories, greetings and small talk.",
};

/** Catalog and prepared visuals: stable for the whole talk, so they get their own cache breakpoint. */
export function contextBlock(req: Pick<DirectorRequest, "catalog" | "prepared">): string {
  const prepared =
    req.prepared.length === 0
      ? "None."
      : req.prepared.map((p) => `- ${p.id} (${p.template}) "${p.title}": ${p.when}`).join("\n");
  return `<data_catalog>\n${req.catalog}\n</data_catalog>\n\n<prepared_visuals>\n${prepared}\n</prepared_visuals>`;
}

function fmtAge(sec: number): string {
  return `${Math.max(0, Math.round(sec))}s ago`;
}

export function userMessage(req: DirectorRequest): string {
  const lines: string[] = [];
  lines.push(`<talk_so_far>\n${req.arc || "Just started."}\n</talk_so_far>`);
  lines.push(`<current_beat>${req.beat || "unknown"}</current_beat>`);

  const old = req.transcript.filter((l) => !l.isNew);
  const fresh = req.transcript.filter((l) => l.isNew);
  const fmt = (l: (typeof req.transcript)[number]) =>
    `[${fmtAge(l.ageSec)}] ${l.text}${l.interim ? " …" : ""}${l.handled ? ` (voice command, already handled: ${l.handled})` : ""}`;
  lines.push(
    `<transcript note="last minute, oldest first">\n${old.map(fmt).join("\n") || "(nothing earlier)"}\n<just_said>\n${fresh.map(fmt).join("\n") || "(nothing new)"}\n</just_said>\n</transcript>`,
  );

  const vis = (v: (typeof req.onScreen)[number]) =>
    `- ${v.id} ${v.template} "${v.title}"${v.ageSec !== undefined ? `, shown ${fmtAge(v.ageSec)}` : ""}${v.reveal ? `, revealed ${v.reveal}` : ""}${v.status ? ` (${v.status})` : ""}`;
  lines.push(
    `<stage>\nOn screen:\n${req.onScreen.map(vis).join("\n") || "- nothing"}\nChips (tucked, recallable):\n${req.chips.map(vis).join("\n") || "- none"}\nEarlier visuals:\n${req.history.map(vis).join("\n") || "- none"}\nSeconds since the last new visual: ${req.secondsSinceLastShow === null ? "none shown yet" : Math.round(req.secondsSinceLastShow)}\n</stage>`,
  );
  if (req.request) lines.push(`<presenter_request>${req.request}</presenter_request>`);
  lines.push(PROACTIVITY[req.proactivity]);
  lines.push("Decide now for what was just said. Call exactly one tool.");
  return lines.join("\n\n");
}
