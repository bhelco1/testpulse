#!/usr/bin/env bash
# Runs the Playwright suite inside the pinned Playwright image, the only place visual snapshots
# are generated or compared (spec section 16, "Visual snapshots"). CI runs it the same way.
# Arguments are passed to `playwright test`, e.g. --update-snapshots=all or --project=phone-dark.
#
# Local Supabase must be running and seeded first (supabase start, npm run db:reset,
# npm run db:seed). The container shares the host network, so the Supabase URL and :3000 mean
# the same thing inside and out.
set -euo pipefail

# Bump together with @playwright/test, which package.json pins exactly. The digest is the
# multi-arch index for this tag, so a re-pushed tag cannot change what renders the snapshots.
PLAYWRIGHT_VERSION=1.63.0
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27"

cd "$(dirname "$0")/.."

installed=$(node -p "JSON.parse(require('fs').readFileSync('node_modules/@playwright/test/package.json', 'utf8')).version")
if [ "$installed" != "$PLAYWRIGHT_VERSION" ]; then
  echo "@playwright/test is $installed but scripts/e2e-docker.sh pins the $PLAYWRIGHT_VERSION image; update both together." >&2
  exit 1
fi

# The container gets its own node_modules and .next in named volumes: the host's may hold
# macOS binaries, and a Linux build must not replace the host's .next.
# --platform: GitHub's runners are amd64, and an arm64 Mac would otherwise pull the arm64
# variant, whose rendering is not guaranteed to match.
# -e NAME forwards the host's value without printing it, and nothing if it is unset; locally
# the Supabase variables come from .env.local instead, read by playwright.config.ts. The secret
# key is for the writing specs' client only (tests/e2e/support/ingest.ts); the config
# withholds it from the server under test.
docker run --rm --init --ipc=host --network=host --platform=linux/amd64 \
  --volume "$PWD:/work" --workdir /work \
  --volume testpulse-e2e-node-modules:/work/node_modules \
  --volume testpulse-e2e-next:/work/.next \
  --env CI \
  --env NEXT_PUBLIC_SUPABASE_URL \
  --env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  --env SUPABASE_SECRET_KEY \
  --env TESTPULSE_E2E_IMAGE="$IMAGE" \
  "$IMAGE" \
  bash -c 'npm ci --no-audit --no-fund --loglevel=error && exec npx playwright test "$@"' e2e "$@"
