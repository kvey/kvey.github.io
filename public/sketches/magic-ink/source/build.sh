#!/usr/bin/env bash
# Rebuild the Magic Ink sketch and publish the bundle to the served folder
# (../index.html and ../assets/). Run from this directory.
set -euo pipefail
cd "$(dirname "$0")"

npm install
npx vite build            # base: './' comes from vite.config.ts

# Publish built output up to the statically-served sketch root.
rm -rf ../assets
cp -R dist/assets ../assets
cp dist/index.html ../index.html

echo "Published magic-ink -> /sketches/magic-ink/"
