#!/usr/bin/env bash
# Opens Halo's control panel and stage in a dedicated Chrome profile with
# background throttling off, so the stage keeps rendering (and OBS keeps
# capturing) while Zoom or another app covers it.
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFILE="${HALO_CHROME_PROFILE:-$HOME/.halo-chrome}"
BASE="${HALO_URL:-http://localhost:5173}"
FLAGS=(
  --user-data-dir="$PROFILE"
  --disable-backgrounding-occluded-windows
  --disable-renderer-backgrounding
  --disable-background-timer-throttling
  --no-first-run
)

if [[ ! -x "$CHROME" ]]; then
  echo "Chrome not found at: $CHROME (set CHROME=/path/to/chrome)" >&2
  exit 1
fi

"$CHROME" "${FLAGS[@]}" --new-window "$BASE/control" >/dev/null 2>&1 &
sleep 2
# --app gives a window with no tabs or address bar: cleaner to capture.
"$CHROME" "${FLAGS[@]}" --app="$BASE/stage" --window-size=1280,758 >/dev/null 2>&1 &
echo "Opened $BASE/control and $BASE/stage"
