// Speech-synced reveal: a progressive item appears once the presenter says
// its cue words. Matching is forgiving (plurals, word order, filler words).

const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "from", "by", "at", "is", "are", "be",
  "we", "our", "you", "your", "it", "its", "that", "this", "than", "rather", "instead", "into", "as", "then",
]);

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/** Rough stem so "templates" matches "template" and "invites" matches "inviting". */
export function stem(w: string): string {
  const base = w.replace(/(ings|ing|ies|es|s|ed|er)$/, "").replace(/e$/, "");
  return (base.length >= 3 ? base : w.replace(/s$/, "")).slice(0, 6);
}

function cueTokens(cue: string): string[] {
  return words(cue).filter((w) => !STOP.has(w) && w.length > 2);
}

/** Whether the spoken text contains enough of the cue's significant words. */
export function cueMatches(cue: string, spoken: string): boolean {
  const tokens = cueTokens(cue);
  if (tokens.length === 0) return false;
  const said = new Set(words(spoken).map(stem));
  const hits = tokens.filter((t) => said.has(stem(t))).length;
  const need = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);
  return hits >= need;
}

/** Items revealed: up to and including the last item whose cue was said. */
export function countRevealed(cues: string[], spoken: string): number {
  let revealed = 0;
  cues.forEach((cue, i) => {
    if (cueMatches(cue, spoken)) revealed = i + 1;
  });
  return revealed;
}

export function wordCount(text: string): number {
  return words(text).length;
}
