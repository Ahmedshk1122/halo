# Halo

Live visuals on your camera feed during video calls. Halo listens as you talk, follows the arc of your talk, and puts supporting visuals on your video: metric cards, charts, strategy cards, roadmaps, rough UI sketches. It's like a slide deck building itself as you speak. Often the right answer is to show nothing, and Halo knows that.

Numbers come from you: say a number and Halo can chart it, or load your data so Halo can pull up figures you ask about. Halo never invents a number, and never puts captions or your words on the video.

This is the web prototype. Halo renders a clean stage window in Chrome, OBS captures that window, and OBS Virtual Camera feeds it to Zoom, Teams or Meet.

## Requirements

- macOS with Google Chrome (the Web Speech API and MediaPipe run in Chrome)
- Node.js 20 or later
- [OBS Studio](https://obsproject.com) 30 or later
- An API key for one model provider: Claude (Anthropic), Kimi (Moonshot AI), Qwen (Alibaba Cloud) or Gemini (Google)

## Setup

```bash
git clone https://github.com/Ahmedshk1122/halo.git
cd halo
npm install
npm run setup:mediapipe   # downloads the hand and face models into public/mediapipe
npm run key claude        # or: npm run key kimi / qwen / gemini
```

`npm run key` asks you to paste the key (it stays hidden), saves it to `.env` and switches Halo to that provider. `.env` is gitignored. The key is read only by the local server and never reaches the browser.

## Run

```bash
npm run dev
```

This starts the API server on `127.0.0.1:8787` and the app on `http://localhost:5173`. Then open the two windows. The helper script opens them in a dedicated Chrome profile with background throttling off, so the stage keeps rendering while Zoom covers it:

```bash
./scripts/open-chrome.sh
```

Or open them yourself:

- `http://localhost:5173/control`: your presenter panel. Only you see it.
- `http://localhost:5173/stage`: the clean stage OBS captures. Size it to 1280×720 (the panel's **Open stage window** button does this).

Allow camera and microphone access when Chrome asks.

## What Halo can show

Metric cards, line and bar charts, funnels, comparisons, strategy cards, roadmaps, process flows, rough app sketches, from → to cards, statements, and diagrams it composes live for anything else: a framework, your target segments, headwinds and tailwinds, how something works, a part of the body, a moment in a race. Open `/gallery` to see them all.

## Before your talk

1. **Data.** Drag your CSV or XLSX files into **Data** (or click **Load sample data**). Each sheet becomes a table with typed columns. These files are the only place numbers on screen can come from.
2. **Talk notes (optional).** Paste or open your notes in **Talk notes** and click **Prepare visuals**. One planning pass prepares the visuals you will likely need; during the talk Halo can show them instantly.
3. **Rehearse.** In **Rehearsal**, play a script through the exact same pipeline as live speech. The sample script is an onboarding update; edit it or paste your own. The beat-by-beat report shows what Halo did and how fast.

## During your talk

Click **Listen** in the toolbar. Halo decides on its own when a visual helps. You can steer it by voice:

| Say | What happens |
| --- | --- |
| "Halo, show the roadmap" | Recalls it, shows a prepared one, or asks the director to build it now |
| "Halo, back" | Brings back the most recently tucked visual |
| "Halo, back to the funnel" / "let's go back to the funnel" | Recalls that visual from its chip |
| "Halo, hide that" / "take that away" | Tucks it into a chip |
| "get rid of the chart" / "remove that" | Removes it from the stage (history keeps it) |
| "Halo, clear" | Clears the stage (history is kept) |
| "Halo, expand" / "collapse" | Grows or shrinks the visual on screen |
| "Halo, next" | Reveals the next item of a list |

**Hands** (MediaPipe, in the control window):

- Gestures only count when they're deliberate, so talking with your hands is fine.
- Hold a pointing finger on a spot while you talk about something, and the visual Halo brings appears there. Pointing alone never creates anything.
- Point and hold still for about 0.6 s to ring part of a visual in orange.
- Pinch (or close your hand for a moment) and move to drag a visual. It stays where you put it.
- Grab a visual and fling it off the screen to get rid of it.
- On a from → to card, hold your pointing finger on it, then raise your hand: the chart grows with it.
- A quick pinch-tap expands or collapses it.
- Your face is a keep-out zone: visuals never cover it, whether placed by Halo or by you.

**Mouse fallback** in the preview: click a part to ring it, drag to move, double-click to expand, click a chip to recall.

The control window shows the transcript (only you see it), every decision with its reason, and the end-of-speech-to-visual latency (target under 2.5 s).

## OBS setup

1. In OBS, add a source: **+** → **macOS Screen Capture**.
2. Set **Method** to **Window Capture** and pick the **Halo Stage** window. Turn off **Show cursor**.
3. Crop to the canvas: right-click the source → **Transform** → **Edit Transform**, and crop away the window's title bar so only the 16:9 stage remains. Then **Transform** → **Fit to screen**. Use a 1280×720 or 1920×1080 base canvas (**Settings** → **Video**).
4. Click **Start Virtual Camera** in the Controls dock.
5. In Zoom, go to **Settings** → **Video** → **Camera** and pick **OBS Virtual Camera**. Teams and Meet have the same setting.
6. In Zoom, turn off **Mirror my video** so text reads correctly in your own preview. Everyone else always sees it unmirrored.

### Keep Chrome rendering in the background

macOS tells Chrome when a window is covered, and Chrome then stops painting it, so OBS would capture a frozen stage. `scripts/open-chrome.sh` launches Chrome with:

```
--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling
```

If you open Chrome another way, quit it fully first and start it with those flags.

## Acceptance test

With `npm run dev` running:

```bash
npm run acceptance
```

This plays `samples/rehearsal_onboarding.txt` through real control and stage windows (your installed Chrome on macOS) and checks the expected outcomes:

1. Nothing during the greeting
2. A pinned activation metric card
3. A funnel, with the metric card tucked into a chip
4. Nothing during the anecdote
5. A three-moves strategy card revealed point by point
6. A template-screen UI sketch
7. A roadmap
8. The funnel recalled on command
9. A closing statement card

It also checks that every number on screen traces back to the sample files, and reports the median latency. Screenshots of each beat and a JSON report go to `artifacts/acceptance/`. Options: `--director claude|replay`, `--speed 1|1.5|2`, `--headed`.

**Replay director.** Settings → Decisions from → **Replay** plays back recorded tool calls for the sample script (`fixtures/`). It runs the whole pipeline (grounding, placement, tucking, reveal, recall, latency) without a key or network. It is a test double for the pipeline, not a stand-in for Claude's judgment. Run the acceptance test with `--director claude` to test the real director.

## Claude

Models are set in `.env`:

| Variable | Default | Used for |
| --- | --- | --- |
| `HALO_DIRECTOR_MODEL` | `claude-haiku-5-5` | The director, on every speech segment. Fast by default. |
| `HALO_DIRECTOR_EFFORT` | `low` | Lower is faster. |
| `HALO_PLANNER_MODEL` | `claude-opus-5-5` | The one planning pass over your talk notes. |
| `HALO_PLANNER_EFFORT` | `medium` | |

- Output is structured with tool use and strict JSON schemas: one tool per template, plus `show_prepared` and `act`.
- The director's rules, tools and data catalog are prompt-cached, and pre-warmed when you start listening. The cache is refreshed every four minutes while you listen.
- On models that support it (Opus 5.5, Sonnet 5.5), requests use Anthropic's server-side refusal fallback (`fallbacks: "default"`). The default Haiku director does not need it.

### Using Kimi or Qwen instead

Halo can run on Kimi (Moonshot AI) or Qwen (Alibaba Cloud Model Studio) through their OpenAI-compatible APIs:

```bash
npm run key kimi          # paste the key from platform.moonshot.ai
npm run key qwen          # paste the key from Alibaba Cloud Model Studio
```

Then restart `npm run dev`. When the server starts it checks the key, picks the endpoint that accepts it (international or China), and prints the models the key can use. To change the model:

```bash
npm run model kimi-k3
```

- Defaults: `kimi-k3` for Kimi, `qwen-plus` for Qwen (`KIMI_DIRECTOR_MODEL` / `KIMI_PLANNER_MODEL`, `QWEN_DIRECTOR_MODEL` / `QWEN_PLANNER_MODEL`). A Kimi key runs Kimi models and a Qwen key runs Qwen models; they are different companies.
- No pacing between requests: Halo decides as soon as speech arrives, mid-sentence included. If the provider asks it to slow down (a rate limit), it waits and carries on. `HALO_MIN_INTERVAL_MS` adds a gap if you want one.
- Thinking is off for speed (`KIMI_THINKING` / `QWEN_THINKING`: `off`, `on` or `default`). Each decision may take up to 20 seconds (`HALO_DIRECTOR_TIMEOUT_MS`).
- Providers differ in which request options they accept. When one is rejected (for example a forced tool call), Halo retries without it and remembers that for the model.
- Same tools, same grounding: every number still has to be one you said or one in your data. Halo's prompts were written for Claude, so choices may differ.
- `KIMI_BASE_URL` / `QWEN_BASE_URL` point Halo at another OpenAI-compatible endpoint.

### Using Gemini instead

Halo can also run on Google Gemini, which has a free tier: `npm run key gemini`, or in `.env`:

```
HALO_PROVIDER=gemini
GEMINI_API_KEY=your-key
```

It uses the same tools and grounding. Defaults: `gemini-flash-lite-latest` for the director and planner (change with `GEMINI_DIRECTOR_MODEL` / `GEMINI_PLANNER_MODEL`). Free-tier keys allow only a few requests a minute, so with Gemini Halo spaces director calls at least 6 seconds apart (`GEMINI_MIN_INTERVAL_MS`), decides at the end of each sentence rather than mid-sentence, and waits whenever Google asks it to slow down. Visuals can arrive a few seconds later than with Claude, and Halo's prompts were written for Claude, so choices may differ. Check Google's terms for how free-tier requests may be used.

## Settings

- **How proactive Halo is:** quiet, balanced or eager. This also sets the minimum gap between new visuals (10, 6 or 4 seconds).
- **Glass:** light or dark material.
- **Hand tracking**, **face zone** in the preview, **reduce motion** (the macOS setting is always respected), **camera**.

## Privacy

- Live speech recognition uses Chrome's Web Speech API, which sends audio to Google's speech service.
- The director receives the transcript of the last minute, a running summary, and a description of your data (column names, types and sample rows).
- Data, notes and settings stay in this browser's local storage.

## Troubleshooting

- **"Your credit balance is too low"** in the decision log: the Anthropic account has no credit. Add credit, or use another provider (above).
- **"Model not found"** with Kimi or Qwen: the server terminal lists the models your key can use when it starts. Pick one with `npm run model <name>` and restart.
- **"No credit left"** with Kimi or Qwen: add balance on the provider's platform.

- **The stage freezes in OBS when another window covers it.** Start Chrome with the flags above (`./scripts/open-chrome.sh`).
- **"No ... key in .env"** in the sidebar. Run `npm run key <provider>` and restart `npm run dev`.
- **Hand tracking says it could not start.** Run `npm run setup:mediapipe`. Without local models it loads them from Google's CDN.
- **Listening keeps restarting.** Chrome ends speech sessions after silence or about a minute; Halo restarts them automatically. Check the microphone permission for `localhost` if it never starts.

## Routes

| Route | What it is |
| --- | --- |
| `/control` | Presenter panel: live preview, transcript, data, talk notes, decision log, rehearsal, settings |
| `/stage` | The window OBS captures: webcam plus visuals, nothing else |
| `/gallery` | Every template rendered with sample data, for design work |

## Development

```bash
npm test          # unit tests
npm run typecheck
npm run build
```

See `CLAUDE.md` for the product rules, design system and architecture.

Spreadsheet parsing uses SheetJS 0.18.5 from npm (the last version published there). For untrusted files, switch to the current build from the SheetJS CDN: `npm i https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`.
