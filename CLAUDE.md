# Halo

Halo puts live visuals on the presenter's camera feed during video calls. It listens, follows the arc of the talk, and decides on its own when a visual would close a gap in understanding: metric cards, charts, strategy cards, roadmaps, rough UI sketches. Often the right answer is to show nothing. It should feel like a slide deck building itself as the presenter speaks.

This repo is the web prototype: a Vite + React + TypeScript app plus a tiny local Node server. Chrome renders a clean `/stage` window, OBS captures it, and OBS Virtual Camera feeds Zoom/Teams/Meet. A native macOS camera extension comes later.

## Product rules (never break these)

- **The presenter leads; Halo assists.** Halo helps them land their points and never gets in their way. When they ask for something, do it; never refuse because it isn't in their data.
- **Proactive by default, with judgment.** The director decides when to show something, and when not to, like an assistant who knows the talk. Voice commands ("Halo, show X", "Halo, back", "let's go back to the funnel", "take that away", "Halo, clear") are the secondary way to steer.
- **No captions, ever.** Never put a transcript, captions or the presenter's spoken words on the video. The transcript is visible only in the control window.
- **Numbers come from the presenter, never from the AI.** A number reaches the screen because the presenter said it (or wrote it in their talk notes), or because it's in data they loaded (CSV/XLSX). Loaded data is there to pull up figures they ask about or mention.
  - Templates that show numbers take references, never typed numbers: a data reference (table, column, row or filter) or a said value (`pick: "said"` / table `"said"`), which is checked against what the presenter actually said (`shared/spoken.ts`).
  - If any reference fails to resolve or a said value wasn't said, drop the visual and log it.
  - Scan every generated text field before rendering. Month, quarter and year names, small item counts ("three steps") and numbers the presenter said are fine. Any other number, percentage or currency rejects the visual.
  - The AI never invents, estimates or computes a number; Halo computes changes and percentages itself.
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
- Visuals aren't limited to numbers: the `diagram` template is composed live from regions, nodes, links, paths and markers on a 0–100 canvas, so the director can draw any topic (frameworks, segments, factors, mechanisms, anatomy, a race). `shared/backdrops.ts` holds ready-made drawings (human body, race track) with named anchors for things simple shapes can't draw well.
- Speech-to-text and the LLM are behind interfaces so they can be swapped.
- Routes: `/stage`, `/control` (also `/`), `/gallery` (every template with sample data).

## Claude

- Look up current model IDs in Anthropic's docs; models are configurable in `.env`.
- Director (runs on every speech segment) defaults to the fast model `claude-haiku-5-5` at low effort. Planner (one pass over talk notes) defaults to `claude-opus-5-5`.
- Structured output uses tool use with `strict: true` schemas. Strict schemas: keep every property required, no nullable/union types (limit is 16 across a request), `additionalProperties: false`. Absent values are empty strings, empty arrays, or `pick: "none"`.
- Keep the system prompt and tool list byte-stable so they cache; put volatile context in the user message.
- Optional provider: Google Gemini (`HALO_PROVIDER=gemini`, `server/llm/gemini.ts`) behind the same `LLMClient` interface, using the same tool schemas as JSON-schema function declarations. Free-tier pacing comes from `/api/health` limits: minimum interval between director calls, no mid-sentence triggers, and a cooldown when the provider returns a retry delay.

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
- **Gestures must be deliberate.** Presenters talk with their hands; nothing may trigger from a passing or waving hand.
- Pointing never creates a visual. Speech decides whether to show something; if the presenter held a pointing finger still on a spot (~450ms) while saying it, the visual is placed there.
- Point and dwell ~600ms on part of a visual to target it (orange ring). Pinch (or a fist held ~250ms) and move to drag; it stays where it is put. Grab and fling to throw a visual away. Quick pinch-tap expands or collapses.
- A goal (from → to) card grows with a raised pointing hand, after the finger is held on it first; bars stay in true proportion.
- Default slots: left third, right third, lower band, 48px safe margin; chips along the top edge. The control window has a mouse fallback for all of it.

## How the pieces fit

- **Director loop** (`src/control/director/director.ts`): triggers on each final speech segment and when the interim transcript grows ~12 words without a final. One request in flight; later speech merges into the next request. Each request carries the running arc summary, the last ~60 s of transcript (new lines marked), what is on stage, chips and history, the data catalog, and prepared visuals.
- **Decisions** are `none | show | update | tuck | recall | clear` with a reason (control window only), a beat name and an updated arc. Claude answers with exactly one strict tool call (`shared/director.ts`): one `show_*` tool per template (`replace_id` makes it an update), `show_prepared`, and `act`.
- **Grounding** (`shared/resolve.ts`, `shared/grounding.ts`): every visual goes through `prepareVisual` (tidy copy → shape check → text scan → resolve references) before it reaches the stage. Templates render only `ResolvedVisual`.
- **Pacing in code, not just the prompt:** at most two on stage (oldest tucked), spacing between new visuals by proactivity (quiet 10 s, balanced 6 s, eager 4 s) unless the presenter asked, no duplicates (recall instead).
- **Reveal** (`shared/reveal.ts`): list items appear when their cue words are spoken. The director builds lists item by item with `replace_id` as they are said; prepared visuals reveal on cues with a pacing fallback.
- **Voice commands** (`src/control/director/commands.ts`) are handled locally for speed; anything unresolved becomes an explicit director request.
- **Notes planning** (`server/planner/planner.ts`): one pass with `prepare_*` tools; every prepared visual is grounded before use.
- **Hands** (`shared/gestures.ts` pure state machine, `src/hands/tracker.ts` MediaPipe, `src/control/hands/`): gestures and the mouse fallback work in the presenter's mirrored frame; the face keep-out flows into placement.
- **Latency:** end of speech → stage render ack (`rendered` message) is logged per decision; the toolbar shows the median of the last five. The director prefix is pre-warmed with a `max_tokens: 0` request when listening starts.

## Testing

- `npm test`: unit tests (grounding, resolver, placement, strict-schema rules, commands, cue matching, gestures, server with a fake LLM).
- `npm run acceptance`: plays `samples/rehearsal_onboarding.txt` through real windows and checks the nine outcomes from the brief plus number tracing. `--director claude` tests the real director; `--director replay` uses recorded tool calls.
- The replay director (`fixtures/`) is a test double for the pipeline. Never present replay results as Claude's behavior.

## Working in this repo

- `npm run dev` runs the server and Vite together. `npm test`, `npm run typecheck`, `npm run build`.
- Build in milestones; after each one, run it, check it in the browser, commit, and summarize how to try it.
- Every number on screen must trace back to a loaded file. If you add a template, add its type to `shared/visuals.ts`, sizes to `shared/layout.ts`, tool schema to `shared/director.ts`, text fields to `shared/grounding.ts`, resolution to `shared/resolve.ts`, a component in `src/templates/`, and a `/gallery` sample.
