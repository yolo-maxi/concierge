#!/usr/bin/env bash
# Build the deployable Concierge server bundle + widget embed from source.
#
# Why this exists: concierge-deploy/server.bundle.cjs was a hand-made artifact
# with no build path in this repo, so the deployed service could not be
# reproduced or rolled forward. This script makes the artifact reproducible.
#
# Output: dist-deploy/server.bundle.mjs and dist-deploy/concierge-embed.js
# Deployment itself lives in scripts/deploy.sh and is a separate, gated step.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist-deploy"
cd "$ROOT"

# pnpm aborts without a TTY unless CI is set.
export CI=true

echo "==> workspace build"
pnpm build

WIDGET="$ROOT/widget/dist/concierge-embed.js"
[ -s "$WIDGET" ] || { echo "FAIL: widget bundle missing or empty: $WIDGET" >&2; exit 1; }

# The widget must be the shadow-DOM/token build, not a pre-theming artifact.
if ! grep -q attachShadow "$WIDGET"; then
  echo "FAIL: widget bundle has no attachShadow; shadow-DOM isolation missing" >&2
  exit 1
fi
TOKENS=$(grep -oE -- '--cc-[a-z0-9-]+' "$WIDGET" | sort -u | wc -l)
if [ "$TOKENS" -lt 50 ]; then
  echo "FAIL: only $TOKENS --cc-* tokens; expected the token-first theming build" >&2
  exit 1
fi

echo "==> bundling server (esm + require shim for cjs deps)"
mkdir -p "$OUT"
BANNER='import{createRequire as __cr}from "node:module";'
BANNER+='import{fileURLToPath as __f2p}from "node:url";'
BANNER+='import{dirname as __dn}from "node:path";'
BANNER+='const require=__cr(import.meta.url);'
BANNER+='const __filename=__f2p(import.meta.url);'
BANNER+='const __dirname=__dn(__filename);'

# NOTE: format=cjs fails here — server/src/index.ts uses top-level await.
# ESM is required, and the banner supplies require/__dirname for express et al.
node_modules/.bin/esbuild server/src/index.ts \
  --bundle --platform=node --target=node20 --format=esm \
  --outfile="$OUT/server.bundle.mjs" \
  --banner:js="$BANNER" \
  --log-level=warning

cp "$WIDGET" "$OUT/concierge-embed.js"

[ -s "$OUT/server.bundle.mjs" ] || { echo "FAIL: server bundle empty" >&2; exit 1; }

echo "==> built"
ls -l "$OUT"
echo "widget: $TOKENS --cc-* tokens, attachShadow present"
