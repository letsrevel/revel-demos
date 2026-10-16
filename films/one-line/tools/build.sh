#!/usr/bin/env bash
# Rebuild timing → index.html → music carve for one language (index.html then IS that
# language). Run after any timing change, a pickup, or to switch languages.
#   bash tools/build.sh [en|de]
set -euo pipefail
cd "$(dirname "$0")/.."
LANG_="${1:-en}"
node tools/timing.mjs "$LANG_"
node tools/build-index.mjs "$LANG_"
INDEX=index.html
CARVE="${HOME}/.claude/skills/hyperframes-audio/scripts/carve.mjs"
for bed in music-m1 music-m2 music-m3; do
  node "$CARVE" --comp "$INDEX" --bed "$bed" --strength 0.65 | tail -1
done
npx hyperframes lint | tail -2
