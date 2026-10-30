# Halo

Halo puts live visuals on the presenter's camera feed during video calls. It listens, follows the arc of the talk, and decides on its own when a visual would close a gap in understanding: metric cards, charts, strategy cards, roadmaps, rough UI sketches. Often the right answer is to show nothing. It should feel like a slide deck building itself as the presenter speaks.

This repo is the web prototype: a Vite + React + TypeScript app plus a tiny local Node server. Chrome renders a clean `/stage` window, OBS captures it, and OBS Virtual Camera feeds Zoom/Teams/Meet. A native macOS camera extension comes later.

## Product rules (never break these)

- **Proactive by default.** The director decides when to show something. Voice commands ("Halo, show X", "Halo, back", "let's go back to the funnel", "Halo, clear") are the secondary way to steer.
- **No captions, ever.** Never put a transcript, captions or the presenter's spoken words on the video. The transcript is visible only in the control window.
- **Numbers come only from loaded data.** Metrics and numbers come only from CSV/XLSX files the presenter loads ahead of time. Everything else is generated live from what they say.
  - Templates that show numbers take data references (table, column, row or filter), never typed numbers. The app resolves references and renders the real values.
  - If any reference fails to resolve, drop the visual and log it.
  - Scan every generated text field before rendering. Month, quarter and year names and small item counts ("three steps") are fine. Any other number, percentage or currency that did not come from data rejects the visual.
  - If the presenter says a number that is not in their data, it does not go on screen.
- **Restraint.** Show a visual for a number, comparison, sequence, structure, plan or "picture this" moment that would be hard to hold in memory. Show nothing for greetings, small talk, anecdotes, stories, emotional moments, or anything already clear.
- **At most two visuals on screen.** At least ~6 seconds between new visuals unless the presenter asks. Tuck visuals away when the beat moves on. Tucked visuals become chips along the top edge so they can be recalled.
- **The face is a keep-out zone.** Visuals never cover it, whether placed automatically or by hand.
- **The stage is clean.** `/stage` shows only the webcam and Halo's visuals: no UI chrome, cursors, or text outside visuals. It is never mirrored. The control preview is mirrored (video and visual positions flip, text stays readable).
- **The API key never reaches the browser** and is never committed. It lives in `.env`, read only by the server.

## Architecture

- `shared/` — types and pure logic used by both browser and server: visual specs and resolved visuals (`visuals.ts`), stage protocol (`stage.ts`), geometry, template sizes (`layout.ts`), placement, chip layout. Keep it framework-free and unit-tested.
- `server/` — Hono server on 127.0.0.1. Holds `ANTHROPIC_API_KEY`, builds prompts, calls Claude. The LLM sits behind an interface so it can be swapped.
- `src/stage/` — the stage renderer. `StageCanvas` is shared by `/stage` and the control preview. Camera input lives in `camera.ts`/`CameraVideo.tsx`; keep the camera/output layer separate from everything else (it gets replaced by a native camera extension).
- `src/control/` — the presenter panel. **The control window owns all state** (`state.ts` store); every change to what is on stage goes through `stageActions.ts`; `stageSync.ts` broadcasts a `StageState` snapshot over `BroadcastChannel("halo")`.
- `src/templates/` — one React component per template, driven by a resolved JSON spec. Templates never see raw specs or typed numbers.
- Speech-to-text and the LLM are behind interfaces so they can be swapped.
- Routes: `/stage`, `/control` (also `/`), `/gallery` (every template with sample data).

## Claude

- Look up current model IDs in Anthropic's docs; models are configurable in `.env`.
- Director (runs on every speech segment) defaults to the fast model `claude-haiku-5-5` at low effort. Planner (one pass over talk notes) defaults to `claude-opus-5-5`.
- Structured output uses tool use with `strict: true` schemas. Strict schemas: keep every property required, no nullable/union types (limit is 16 across a request), `additionalProperties: false`. Absent values are empty strings, empty arrays, or `pick: "none"`.
- Keep the system prompt and tool list byte-stable so they cache; put volatile context in the user message.

## Look and feel: as if Apple built it

Every visual on the video should feel like Apple Keynote or visionOS made it: calm, precise, confident. Tokens live in `src/styles/tokens.css` and `src/templates/motion.ts`.

- **Canvas:** design at 1920×1080 logical pixels; the stage scales to its window (1280×720 recommended).
- **Type:** system font stack only (`-apple-system, BlinkMacSystemFont, system-ui`), no web fonts. Hero numbers 120–160px semibold with tabular figures; titles ~40px semibold; body 28px. **Nothing smaller than 22px** (meeting apps compress video hard).
- **Material:** frosted glass. Light `rgba(255,255,255,0.72)`, dark `rgba(28,28,30,0.6)`; `backdrop-filter: blur(40px) saturate(180%)`; hairline `0.5px` border `rgba(255,255,255,0.5)`; soft deep shadow. Never put `opacity` or `filter` on an ancestor of a glass element (it breaks backdrop-filter); animate opacity on the glass itself and blur on its content.
- **Shape:** 28px corner radius on cards. Nested elements use concentric radii (inner radius = outer radius − inset). Generous padding.
- **Color:** neutral first; Apple system colors for meaning only. Blue `#0A84FF` primary data; green `#30D158` positive; red `#FF453A` negative; orange `#FF9F0A` for targets and highlights only. One accent per visual. On light glass, colored text is deepened slightly for legibility (`--*-text` tokens).
- **Charts:** Apple Health / Stocks style. Rounded bar caps, no chart borders, faint or no gridlines, direct labels instead of legends, values on the data. Bars grow from the baseline; lines draw in.
- **Motion:** springs (stiffness 260, damping 30). Entrances fade in, scale up from 0.96 and un-blur. Exits are quicker than entrances. Tucking shrinks the visual into its chip. No bouncing, spinning or decorative motion. Respect reduced motion.
- **Icons:** Lucide at a 1.75 stroke with rounded caps (SF Symbols can't be used on the web). No Apple logos or trademarks.
- **Copy:** short, sentence case, no exclamation marks, no emoji.
- **Control window:** looks like a native macOS app: translucent sidebar, segmented controls, switches, light/dark following the system. UI text at 13px.

## Hands and placement

- MediaPipe Tasks Vision in the browser for hand landmarks and face detection.
- Point (index finger out) and dwell ~600ms on part of a visual to target it (orange ring). Pinch, hold and move to drag; it stays where it is put. Quick pinch-tap expands or collapses.
- Default slots: left third, right third, lower band, 48px safe margin; chips along the top edge. The control window has a mouse fallback for all of it.

## Working in this repo

- `npm run dev` runs the server and Vite together. `npm test` runs unit tests. `npm run typecheck`.
- Build in milestones; after each one, run it, check it in the browser, commit, and summarize how to try it.
- Every number on screen must trace back to a loaded file. If you add a template, add its sizes to `shared/layout.ts`, its schema to the director tools, grounding coverage, and a `/gallery` entry.
