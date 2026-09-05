#!/usr/bin/env bash
# Boot the built Concierge bundle on a scratch port against the real brief and
# verify it actually serves the current widget. Touches nothing in production.
#
# Usage: scripts/smoke-bundle.sh [port]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist-deploy"
PORT="${1:-3361}"
PROD_ENV="${CONCIERGE_PROD_ENV:-/home/xiko/concierge-deploy/concierge.env}"
WORK="$(mktemp -d)"
trap 'fuser -k -n tcp "$PORT" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

[ -s "$OUT/server.bundle.mjs" ] || { echo "FAIL: run scripts/build-bundle.sh first" >&2; exit 1; }
[ -r "$PROD_ENV" ] || { echo "FAIL: cannot read env file $PROD_ENV" >&2; exit 1; }

# Reuse provider credentials and brief, but override the port and embed path and
# strip Telegram so a smoke run cannot emit notifications.
sed -e "s#^PORT=.*#PORT=$PORT#" \
    -e "s#^CONCIERGE_EMBED_FILE=.*#CONCIERGE_EMBED_FILE=$OUT/concierge-embed.js#" \
    -e '/^TELEGRAM_/d' \
    "$PROD_ENV" > "$WORK/smoke.env"

set -a; . "$WORK/smoke.env"; set +a
node "$OUT/server.bundle.mjs" > "$WORK/server.log" 2>&1 &
SRV=$!

ready=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/embed.js" 2>/dev/null; then ready=1; break; fi
  kill -0 "$SRV" 2>/dev/null || break
  sleep 0.5
done
if [ "$ready" -ne 1 ]; then
  echo "FAIL: server did not become ready on :$PORT" >&2
  cat "$WORK/server.log" >&2
  exit 1
fi

fail=0

# /health must answer; the app has no /healthz.
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/health")
if [ "$code" = "200" ]; then echo "ok   /health 200"; else echo "FAIL /health $code"; fail=1; fi

# The served widget must be byte-identical to the build output.
curl -fsS -o "$WORK/served.js" "http://127.0.0.1:$PORT/embed.js"
if cmp -s "$WORK/served.js" "$OUT/concierge-embed.js"; then
  echo "ok   /embed.js byte-identical to build output"
else
  echo "FAIL /embed.js differs from build output"; fail=1
fi

# And it must be the themed build, not a stale pre-theming bundle.
if grep -q attachShadow "$WORK/served.js"; then
  echo "ok   served widget has shadow-DOM isolation"
else
  echo "FAIL served widget has no attachShadow"; fail=1
fi
tok=$(grep -oE -- '--cc-[a-z0-9-]+' "$WORK/served.js" | sort -u | wc -l)
if [ "$tok" -ge 50 ]; then
  echo "ok   served widget exposes $tok --cc-* tokens"
else
  echo "FAIL served widget exposes only $tok --cc-* tokens"; fail=1
fi

# End-to-end chat must stream, proving provider wiring survived bundling.
if curl -fsS -m 60 -X POST -H 'Content-Type: application/json' \
     -d '{"messages":[{"role":"user","content":"Reply with one short sentence."}]}' \
     "http://127.0.0.1:$PORT/chat" 2>/dev/null | grep -q '\[DONE\]'; then
  echo "ok   /chat streamed to [DONE]"
else
  echo "FAIL /chat did not stream a completed response"; fail=1
fi

kill "$SRV" 2>/dev/null || true
wait "$SRV" 2>/dev/null || true

if [ "$fail" -ne 0 ]; then echo "SMOKE FAILED"; exit 1; fi
echo "SMOKE PASSED"
