#!/usr/bin/env bash
# Pulls the latest main branch into this deploy directory and logs the result.
# Run via cron; see the "Deployment" section in ../README.md.
set -euo pipefail

cd "$(dirname "$0")/.."

git fetch origin main --quiet

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  exit 0
fi

git reset --hard origin/main --quiet

echo "$(date -Is) deployed $REMOTE_SHA"
