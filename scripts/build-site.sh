#!/usr/bin/env bash
# Build the concierge.repo.box static site into site/dist.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[ -x node_modules/.bin/esbuild ] || { echo "run pnpm install first" >&2; exit 2; }
node site/build.mjs
