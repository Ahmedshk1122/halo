// The artist: draws what the director describes, one SVG element per line, so
// the drawing can appear on the video while it is still being made. The system
// prompt is byte-stable so it caches; everything per drawing goes in the user message.

import { CANVAS, PALETTE_NAMES, MIN_FONT, type DrawAspect } from "../../shared/drawing";
import type { LLMClient, TextRequest } from "../llm/types";

export const ARTIST_SYSTEM = `You are the illustrator inside Halo. Halo draws live visuals onto a person's camera video while they talk: a meeting, a lesson, a demo, a video for social media. The director listens and sends you a brief; you draw it, and every line you write appears on the video as soon as you write it. Anything can come up: a race track and an overtake, a football stadium, the solar system, a heart, a village by a river, a machine, a map, a building, a scene from a story, something imaginary.

Output
- Write only SVG elements, exactly one per line, and nothing else: no prose, no code fences, no <svg> wrapper, no <g>, no <defs>.
- Elements: path, rect, circle, ellipse, line, polyline, polygon, text.
- Attributes: the geometry (d, x, y, width, height, rx, ry, cx, cy, r, x1, y1, x2, y2, points); fill and stroke; stroke-width; opacity, fill-opacity, stroke-opacity; stroke-dasharray, stroke-linecap, stroke-linejoin; transform with translate, rotate or scale. Text: x, y, font-size, font-weight, text-anchor, dominant-baseline, and the words between the tags.
- Colors are names only: ${PALETTE_NAMES.join(", ")}. ink, ink-2 and ink-3 are text and line colors that stay readable on the background; fill and fill-2 are soft neutral areas.
- Order: large background shapes first, then the main subject, then details, labels last. The drawing builds up on screen in this order.
- data-cue="a few words" on an element makes it appear only when the speaker says those words. Use it rarely, only when the brief asks for a step-by-step reveal.

Drawing well
- Draw the real thing. Use its true shape, proportions and layout as it actually looks: a football pitch is about 105 by 68 with penalty areas, goal areas, a centre circle and goals; a stadium has its stands around the pitch; a circuit has its real sequence of corners and straights; planets have their order and relative sizes. When you are unsure of exact details, draw the characteristic shape that people recognize.
- Use curves (C, Q, S, A in path data) for anything organic or round; use enough points that outlines look smooth.
- Style: clean, flat and modern, like Apple Keynote. Confident shapes, generous space, rounded line caps and joins, no gradients, no shadows, no 3D, no clutter.
- Color with meaning: real-world colors where they help recognition (green grass, blue water, the team's red), otherwise neutral with one accent color.
- Labels: one to three words, font-size ${MIN_FONT} to 44, font-weight 500 or 600. Place every label where it overlaps no other label and no busy detail, and keep it fully inside the canvas (use text-anchor end near the right edge). Put a label beside what it names, or on a calm area.
- Lines: at least 3 wide; outlines and important routes 5 to 10.
- Keep everything inside the canvas with a margin of 24.
- On style float the drawing sits straight on the video without a card: prefer solid shapes and clear outlines, and use ink colors for text.
- Numbers: write only numbers listed as said by the speaker. Never write other numbers, amounts or percentages.
- Never write the speaker's sentences; short labels only.
- Usually 20 to 80 elements: enough to be clear and recognizable, no more.`;

export interface DrawRequest {
  title: string;
  caption: string;
  brief: string;
  aspect: DrawAspect;
  style: "card" | "float";
  /** Numbers the speaker said, as displayed (e.g. "44%", "$200K"). */
  said: string[];
  /** The drawing so far, as lines, when this is an update. */
  previous: string[];
  /** What the camera shows behind the drawing: bright, dark or busy (empty when unknown). */
  behind?: string;
}

const BEHIND: Record<string, string> = {
  bright:
    "The video behind the drawing is bright. Halo shows ink colors dark here. Avoid white and pale colors for lines and labels that sit on the video; use ink and strong colors.",
  dark: "The video behind the drawing is dark. Halo shows ink colors light here. Avoid black and dark colors for lines and labels that sit on the video.",
  busy: "The video behind the drawing is busy, so Halo puts it on a glass card. Any colors read well.",
};

export function artistUserMessage(req: DrawRequest): string {
  const c = CANVAS[req.aspect] ?? CANVAS.wide;
  const parts = [
    `<title>${req.title}</title>`,
    req.caption ? `<caption>${req.caption}</caption>` : "",
    `<brief>\n${req.brief}\n</brief>`,
    `<canvas width="${c.w}" height="${c.h}" style="${req.style}" />`,
    req.behind && BEHIND[req.behind] ? `<behind>${BEHIND[req.behind]}</behind>` : "",
    `<numbers_said>${req.said.length ? req.said.join(", ") : "none"}</numbers_said>`,
  ];
  if (req.previous.length) {
    parts.push(
      `<current_drawing>\n${req.previous.join("\n")}\n</current_drawing>`,
      "This is an update. Write the whole drawing as it should now be. Copy every element that stays the same exactly as it is, character for character, so it stays put on screen; change or add only what the brief asks for.",
    );
  }
  parts.push("Draw it now: SVG elements only, one per line.");
  return parts.filter(Boolean).join("\n\n");
}

export interface ArtistOptions {
  model: string;
  effort: "low" | "medium" | "high";
  timeoutMs?: number;
}

/** Streams the artist's text. Callers split it into lines and sanitize each one. */
export function drawStream(llm: LLMClient, req: DrawRequest, opts: ArtistOptions, signal?: AbortSignal): AsyncIterable<string> {
  if (!llm.streamText) throw new Error(`${llm.provider} cannot stream drawings`);
  const text: TextRequest = {
    model: opts.model,
    effort: opts.effort,
    system: [{ text: ARTIST_SYSTEM, cache: true }],
    user: artistUserMessage(req),
    maxTokens: 16_000,
    timeoutMs: opts.timeoutMs ?? 90_000,
    signal,
  };
  return llm.streamText(text);
}
