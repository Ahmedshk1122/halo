import { describe, expect, it } from "vitest";
import { countRevealed, cueMatches } from "../shared/reveal";
import { parseScript } from "../shared/rehearsalScript";

describe("cue matching", () => {
  it("matches cues as they are said, forgiving plurals", () => {
    const cues = ["templates blank page", "imports tools", "invites later"];
    expect(countRevealed(cues, "three moves")).toBe(0);
    expect(countRevealed(cues, "First, templates instead of a blank page.")).toBe(1);
    expect(countRevealed(cues, "First, templates instead of a blank page. Second, imports from the tools people use.")).toBe(2);
    expect(cueMatches("invites later", "And third, invite people later rather than first")).toBe(true);
  });
});

describe("rehearsal scripts", () => {
  it("parses beats, pauses and comments", () => {
    const lines = parseScript("# comment\n## greeting\nHi everyone.\n[pause 2]\n## close\nThank you.");
    expect(lines).toEqual([
      { kind: "speech", text: "Hi everyone.", beat: "greeting", seconds: 0, line: 3 },
      { kind: "pause", text: "", beat: "greeting", seconds: 2, line: 4 },
      { kind: "speech", text: "Thank you.", beat: "close", seconds: 0, line: 6 },
    ]);
  });
});
