#!/usr/bin/env bash
# Publish site/dist to concierge.repo.box through the audited static publisher.
# Build first (scripts/build-site.sh); this only ships what is already built.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLISH="${REPO_BOX_PUBLISH:-$HOME/clawd/scripts/repo-box-publish.sh}"
[ -x "$PUBLISH" ] || { echo "publisher not found: $PUBLISH" >&2; exit 2; }
[ -s "$ROOT/site/dist/index.html" ] || { echo "no built site; run scripts/build-site.sh" >&2; exit 2; }
grep -q 'data-page-id="concierge"' "$ROOT/site/dist/index.html" || { echo "built index.html does not brief the hero widget on concierge" >&2; exit 1; }
exec "$PUBLISH" static "$ROOT/site/dist" concierge "$@"
