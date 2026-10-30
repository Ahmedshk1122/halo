// Rehearsal scripts: plain text, one spoken segment per line.
//   ## beat name      labels the following lines (for the timeline only)
//   [pause 2]         waits two seconds
//   # comment         ignored
// Everything else is spoken, word by word, at the chosen pace.

export interface ScriptLine {
  kind: "speech" | "pause";
  text: string;
  beat: string;
  seconds: number;
  /** 1-based line number in the source, for highlighting. */
  line: number;
}

export function parseScript(source: string): ScriptLine[] {
  const out: ScriptLine[] = [];
  let beat = "";
  source.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith("##")) {
      beat = line.replace(/^#+/, "").trim();
      return;
    }
    if (line.startsWith("#")) return;
    const pause = line.match(/^\[pause\s+([\d.]+)\s*s?\]$/i);
    if (pause) {
      out.push({ kind: "pause", text: "", beat, seconds: Number(pause[1]), line: i + 1 });
      return;
    }
    out.push({ kind: "speech", text: line, beat, seconds: 0, line: i + 1 });
  });
  return out;
}

export function beatsOf(lines: ScriptLine[]): string[] {
  return [...new Set(lines.map((l) => l.beat).filter(Boolean))];
}
