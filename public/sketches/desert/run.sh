#!/usr/bin/env bash
# Start a static server in this directory and open the desert scene.
set -euo pipefail

PORT="${PORT:-8000}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="http://localhost:${PORT}/"

cd "$DIR"

# Pick a static server: prefer python3 (built-in on macOS), fall back to npx serve.
if command -v python3 >/dev/null 2>&1; then
  CMD=(python3 -m http.server "$PORT")
elif command -v npx >/dev/null 2>&1; then
  CMD=(npx --yes serve -l "$PORT" .)
else
  echo "Need python3 or npx to serve files. Install one and re-run." >&2
  exit 1
fi

echo "Serving $DIR on $URL  (Ctrl+C to stop)"

# Open the browser shortly after the server starts.
( sleep 1 && {
    if command -v open >/dev/null 2>&1; then open "$URL"
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
    fi
  } ) &

exec "${CMD[@]}"
