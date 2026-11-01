# Halo

Live visuals on your camera video, for anything you talk about. In a meeting, a lesson, a product demo or a video for social media, Halo listens and draws what you're describing as you speak: a race track and the overtake, the solar system, how a heart pumps, a village and its river, your ten reasons, the steps of a recipe, a chart of numbers you just said. It keeps building the visual as you add to it, and you can point at it, grab it, move it and throw it away.

Say a number and Halo can show it; load a spreadsheet if you want Halo to pull up figures you ask about. Halo never makes up numbers, and never puts captions or your words on the video.

This is the web prototype. Halo renders a clean stage window in Chrome, OBS captures that window, and OBS Virtual Camera feeds it to Zoom, Teams or Meet.

## Requirements

- macOS with Google Chrome (the Web Speech API and MediaPipe run in Chrome)
- Node.js 20 or later
- [OBS Studio](https://obsproject.com) 30 or later
- A Google Gemini API key (free tier, the default), or an Anthropic API key for Claude

## Setup

```bash
git clone https://github.com/Ahmedshk1122/halo.git
cd halo
npm install
npm run setup:mediapipe   # downloads the hand and face models into public/mediapipe
npm run key gemini        # or: npm run key claude
```

`npm run key` asks you to paste the key (it stays hidden), saves it to `.env` and switches Halo to that provider. `npm run use gemini` or `npm run use claude` switches between keys already saved. `.env` is gitignored. The key is read only by the local server and never reaches the browser.

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

Above all, drawings it composes live from scratch for anything you talk about: places, objects, machines, the body, space, a race, a story. Also lists of any length, steps, timelines, comparisons, line charts (several lines when you add a metric), bar charts, single numbers, from → to, funnels, app sketches and one-line statements. Drawings float straight on your video with no card behind them; text-heavy visuals sit on frosted glass (Settings → Behind visuals). Open `/gallery` to see them all.

## Before your talk

1. **Data (optional).** Drag CSV or XLSX files into **Data** if you want Halo to pull up figures you ask about. Numbers you say out loud need no file.
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

## Gemini (default)

Halo runs on Google Gemini by default, which has a free tier. Get a key at aistudio.google.com (Get API key), then:

```bash
npm run key gemini
```

- Defaults: `gemini-flash-lite-latest` for the director and planner. Change it with `npm run model <name>` (sets `GEMINI_DIRECTOR_MODEL` / `GEMINI_PLANNER_MODEL`).
- Free-tier keys allow only a few requests a minute, so Halo spaces director calls at least 6 seconds apart (`GEMINI_MIN_INTERVAL_MS`), decides at the end of each sentence rather than mid-sentence, and waits whenever Google asks it to slow down.
- Same tools and grounding as Claude. Halo's prompts were written for Claude, so choices may differ. Check Google's terms for how free-tier requests may be used.

## Claude

To use Claude instead, run `npm run key claude` (it sets `HALO_PROVIDER=anthropic`).

Halo uses two models. The **director** (Haiku, fast) decides on every few words what to show and writes lists, steps and charts. The **artist** (Sonnet 5.5) draws the drawings: the director writes a brief, and the artist draws it line by line while you watch, so the first strokes appear in a few seconds. Drawings happen a few times per talk, so a stronger model costs little there.

```bash
npm run artist claude-opus-5-5       # draw with Opus 5.5
npm run artist claude-sonnet-5-5     # back to Sonnet 5.5 (default)
npm run artist gemini                # draw with free Gemini Flash (needs a Gemini key)
```

Restart `npm run dev` after switching. Each drawing's decision log entry says which model drew it and how long the first strokes and the whole drawing took.

Models are set in `.env`:

| Variable | Default | Used for |
| --- | --- | --- |
| `HALO_DIRECTOR_MODEL` | `claude-haiku-5-5` | The director, on every speech segment. Fast by default. |
| `HALO_DIRECTOR_EFFORT` | `low` | Lower is faster. |
| `HALO_PLANNER_MODEL` | `claude-opus-5-5` | The one planning pass over your talk notes. |
| `HALO_PLANNER_EFFORT` | `medium` | |
| `HALO_ARTIST_MODEL` | `claude-sonnet-5-5` | Draws the drawings, streamed line by line. |
| `HALO_ARTIST_EFFORT` | `low` | |
| `HALO_ARTIST_PROVIDER` | same as `HALO_PROVIDER` | `gemini` to draw with Gemini (`GEMINI_ARTIST_MODEL`, default `gemini-flash-latest`). |

- Output is structured with tool use and JSON schemas: one tool per template (`draw` is the main one), plus `show_prepared` and `act`. Strict schemas are used where the API's grammar size allows.
- The director's rules, tools and data catalog are prompt-cached, and pre-warmed when you start listening. The cache is refreshed every four minutes while you listen.
- On models that support it (Opus 5.5, Sonnet 5.5), requests use Anthropic's server-side refusal fallback (`fallbacks: "default"`). The default Haiku director does not need it.

## Settings

- **How proactive Halo is:** quiet, balanced or eager. Quiet also leaves about 8 seconds between new visuals; balanced and eager show each one as soon as it helps.
- **Glass:** Auto (default) matches each visual to what your camera shows behind it: light glass on bright backgrounds, dark glass on dark ones. Or always light, always dark.
- **Behind visuals:** Auto lets drawings float straight on your video, with dark text on bright backgrounds and light text on dark ones, and puts them on glass when the background is too busy to read. Or always glass, or never.
- **Hand tracking**, **face zone** in the preview, **reduce motion** (the macOS setting is always respected), **camera**.

## Privacy

- Live speech recognition uses Chrome's Web Speech API, which sends audio to Google's speech service.
- The director receives the transcript of the last minute, a running summary, and a description of your data (column names, types and sample rows).
- Data, notes and settings stay in this browser's local storage.

## Troubleshooting

- **"Your credit balance is too low"** in the decision log: the Anthropic account has no credit. Add credit, or switch to Gemini with `npm run key gemini`.

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
