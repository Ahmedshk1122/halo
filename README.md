# Halo

Live visuals on your camera feed during video calls. Halo listens as you talk, follows the arc of your talk, and puts supporting visuals on your video: metric cards, charts, strategy cards, roadmaps, rough UI sketches. Numbers only ever come from data you load ahead of time.

This is the web prototype. Halo renders a clean stage window in Chrome, OBS captures that window, and OBS Virtual Camera feeds it to Zoom, Teams or Meet.

## Requirements

- macOS with Google Chrome (the Web Speech API and MediaPipe run in Chrome)
- Node.js 20 or later
- [OBS Studio](https://obsproject.com) 30 or later
- An Anthropic API key

## Setup

```bash
git clone https://github.com/Ahmedshk1122/halo.git
cd halo
npm install
npm run setup:mediapipe   # downloads the hand and face models into public/mediapipe
cp .env.example .env      # then put your key in ANTHROPIC_API_KEY
```

`.env` is gitignored. The key is read only by the local server and never reaches the browser.

## Run

```bash
npm run dev
```

This starts the API server on `127.0.0.1:8787` and the app on `http://localhost:5173`.

Then open the two windows. The helper script opens them in a dedicated Chrome profile with background throttling turned off, so the stage keeps rendering while Zoom covers it:

```bash
./scripts/open-chrome.sh
```

Or open them yourself:

- `http://localhost:5173/control` — your presenter panel. Only you see this.
- `http://localhost:5173/stage` — the clean stage OBS captures. Size it to 1280×720 (the panel's "Open stage window" button does this).

Allow camera and microphone access when Chrome asks.

### Keep Chrome rendering in the background

macOS tells Chrome when a window is covered, and Chrome then stops painting it. OBS would capture a frozen stage. `scripts/open-chrome.sh` launches Chrome with:

```
--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling
```

If you open Chrome another way, quit it fully first and start it with those flags.

## OBS setup

1. In OBS, add a source: **+** → **macOS Screen Capture**.
2. Set **Method** to **Window Capture** and pick the **Halo Stage** window. Turn off **Show cursor**.
3. Crop to the canvas: right-click the source → **Transform** → **Edit Transform**, and crop away the window's title bar so only the 16:9 stage remains. Then **Transform** → **Fit to screen**. Use a 1280×720 or 1920×1080 base canvas (**Settings** → **Video**).
4. Click **Start Virtual Camera** in the Controls dock.
5. In Zoom, go to **Settings** → **Video** → **Camera** and pick **OBS Virtual Camera**. Teams and Meet have the same setting.
6. In Zoom, turn off **Mirror my video** so text reads correctly in your own preview. Everyone else always sees it unmirrored.

Halo's control window shows you a mirrored preview, so pointing at visuals feels natural.

## Routes

| Route | What it is |
| --- | --- |
| `/control` | Presenter panel: live preview, transcript, data, talk notes, decision log, rehearsal, settings |
| `/stage` | The 1280×720 window OBS captures: webcam plus visuals, nothing else |
| `/gallery` | Every template rendered with sample data, for design work |

## Development

```bash
npm test          # unit tests
npm run typecheck
```

See `CLAUDE.md` for the product rules and design system.
