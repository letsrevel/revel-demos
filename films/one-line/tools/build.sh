#!/usr/bin/env bash
# Rebuild timing → index.html → music carve. Run after any timing change or a pickup.
#   bash tools/build.sh [en|de]
set -euo pipefail
cd "$(dirname "$0")/.."
LANG_="${1:-en}"
node tools/timing.mjs "$LANG_"
node tools/build-index.mjs
CARVE="${HOME}/.claude/skills/hyperframes-audio/scripts/carve.mjs"
for bed in music-m1 music-m2 music-m3; do
  node "$CARVE" --comp index.html --bed "$bed" --strength 0.65 | tail -1
done
npx hyperframes lint | tail -2
