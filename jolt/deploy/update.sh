#!/usr/bin/env bash
# Pull-and-rebuild, but only when the remote actually moved. Run by jolt-update.timer.
set -euo pipefail
cd "$(dirname "$0")/../.."   # repo root
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "$BRANCH" --quiet
LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse "origin/$BRANCH")
[ "$LOCAL" = "$REMOTE" ] && exit 0
echo "updating $LOCAL -> $REMOTE"
git reset --hard "origin/$BRANCH" --quiet
cd jolt
npm ci --silent
npx vite build --base=./ >/dev/null
echo "updated and rebuilt at $(date -Is)"
# No restart needed: serve.mjs reads dist/ from disk per-request.
