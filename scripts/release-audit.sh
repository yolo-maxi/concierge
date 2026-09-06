#!/usr/bin/env bash
# Independent pre-deploy release audit for Concierge.
#
# Why this exists: fi_f92556660fd2b87d1f8d asks for one evidence-first pass over
# the whole product before calling it released. The individual feature items each
# verified their own clause; nothing re-checked them together, against the real
# production brief and the real deployable artifact, in a single run.
#
# This driver is deliberately ONE command so the evidence survives past whatever
# server happened to be alive when a step was run by hand. Every step is a child
# harness or an assertion here; nothing is assumed from a previous cycle's notes.
#
# What it does NOT cover, and cannot from here:
#   - deployed HTTP/browser behaviour on frontier.repo.box (nothing is deployed;
#     that is gated on approval appr_db63172114b39aaca6d3)
#   - rollback rehearsal against production (same gate)
# Those clauses stay open by design. See docs/rollback.md for the written plan.
#
# Exit: 0 all assertions passed · 1 an assertion failed · 2 cannot run
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

OUT="$ROOT/dist-deploy"
PORT="${AUDIT_PORT:-3364}"
PROD_ENV="${CONCIERGE_PROD_ENV:-/home/xiko/concierge-deploy/concierge.env}"
WORK="$(mktemp -d)"
trap 'fuser -k -n tcp "$PORT" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

PASS=0
FAIL=0
ok()   { PASS=$((PASS+1)); echo "ok   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; }
need() { echo "CANNOT RUN: $1" >&2; exit 2; }

export CI=true

echo "=== 0. provenance ==="
HEAD_SHA="$(git rev-parse --short HEAD)"
git fetch origin --quiet 2>/dev/null || true
if git merge-base --is-ancestor HEAD origin/master 2>/dev/null; then
  ok "HEAD $HEAD_SHA is an ancestor of origin/master"
else
  bad "HEAD $HEAD_SHA is NOT on origin/master - auditing unpublished code"
fi
DIRTY="$(git status --porcelain | grep -vE '^\?\? (dist-deploy/|scripts/\.mut-)' || true)"
if [ -z "$DIRTY" ]; then
  ok "working tree clean (build output ignored)"
else
  bad "working tree carries unexpected changes:"
  printf '       %s\n' "$DIRTY"
fi

# Run a child command, log it, and report pass/fail by its exit code alone.
# Deliberately if/else, not `A && ok || bad`: with that form a failing `ok`
# would silently also run `bad`, and a driver that mis-attributes its own
# result is worse than no driver.
step() { # step <label> <logfile> -- <command...>
  local label="$1" log="$2"; shift 3
  if "$@" >"$log" 2>&1; then
    ok "$label"
    return 0
  fi
  bad "$label"
  tail -25 "$log" | sed 's/^/       /'
  return 1
}

echo "=== 1. declared gates, re-run here ==="
step "pnpm lint (tsc --noEmit) clean" "$WORK/lint.log" -- pnpm lint || true
if step "pnpm test" "$WORK/test.log" -- pnpm test; then
  echo "       $(grep -Eo 'pass [0-9]+|fail [0-9]+' "$WORK/test.log" | tail -2 | tr '\n' ' ')"
fi
step "pnpm build" "$WORK/build.log" -- pnpm build || true
if step "smoke:concurrency" "$WORK/conc.log" -- pnpm --filter @concierge/server smoke:concurrency; then
  echo "       maxObservedConcurrent=$(grep -Eo '"maxObservedConcurrent": *[0-9]+' "$WORK/conc.log" | head -1 | grep -Eo '[0-9]+$') of bound 2"
fi

echo "=== 2. deployable artifact is reproducible from source ==="
step "build-bundle.sh emits the deployable artifact" "$WORK/bundle.log" -- bash scripts/build-bundle.sh || true
step "smoke-bundle.sh boots and verifies the artifact" "$WORK/smoke.log" -- bash scripts/smoke-bundle.sh 3363 || true

echo "=== 3. default-powerless: the REAL production brief grants nothing ==="
[ -r "$PROD_ENV" ] || need "cannot read $PROD_ENV"
BRIEF="$(grep -E '^CONCIERGE_BRIEF=' "$PROD_ENV" | cut -d= -f2-)"
[ -r "$BRIEF" ] || need "cannot read brief $BRIEF"
# Assert the positive shape (no capabilities grant anywhere) rather than
# grepping for forbidden words: a grep passes both when the grant is absent and
# when you are looking in the wrong place.
if node -e '
const b=require(process.argv[1]);
const bad=[];
(function walk(o,p){ if(o&&typeof o==="object"){ for(const k of Object.keys(o)){
  if(k==="capabilities") bad.push(p+"/"+k+" = "+JSON.stringify(o[k]));
  walk(o[k],p+"/"+k);} } })(b,"");
if(bad.length){console.error(bad.join("\n"));process.exit(1);} ' "$BRIEF"; then
  ok "production brief declares no capabilities: no tools, no retrieval, no render_ui"
else
  bad "production brief grants a capability (see above) - not powerless by default"
fi

echo "=== 4. API-key secrecy against a live boot ==="
[ -s "$OUT/server.bundle.mjs" ] || need "no built bundle to audit"
KEY="$(grep -E '^VENICE_API_KEY=' "$PROD_ENV" | cut -d= -f2-)"
[ -n "$KEY" ] || need "no VENICE_API_KEY in $PROD_ENV to test for"

# 4a. static: the key must not be baked into anything we ship.
STATIC_HITS=0
for f in "$OUT/server.bundle.mjs" "$OUT/concierge-embed.js" widget/dist/concierge-embed.js; do
  [ -f "$f" ] || continue
  if grep -qF -- "$KEY" "$f"; then bad "shipped artifact embeds the API key: $f"; STATIC_HITS=1; fi
done
[ "$STATIC_HITS" -eq 0 ] && ok "no shipped artifact embeds the provider API key"

# 4b. live: boot the real bundle with the real key and sweep responses,
# including error paths, which are where a key most often leaks.
sed -e "s#^PORT=.*#PORT=$PORT#" \
    -e "s#^CONCIERGE_EMBED_FILE=.*#CONCIERGE_EMBED_FILE=$OUT/concierge-embed.js#" \
    -e '/^TELEGRAM_/d' \
    "$PROD_ENV" > "$WORK/audit.env"
set -a
# audit.env is generated by mktemp above, so there is nothing to follow.
# shellcheck disable=SC1091
. "$WORK/audit.env"
set +a
node "$OUT/server.bundle.mjs" >"$WORK/server.log" 2>&1 &
SRV=$!
for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done
if ! curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  echo "--- server log ---"; cat "$WORK/server.log"; need "bundle never became ready on :$PORT"
fi

: >"$WORK/responses.txt"
sweep() { # label, curl args...
  local label="$1"; shift
  { echo "### $label"; curl -sS -i --max-time 25 "$@" 2>&1; echo; } >>"$WORK/responses.txt"
}
sweep "health"        "http://127.0.0.1:$PORT/health"
sweep "embed"         "http://127.0.0.1:$PORT/embed.js"
sweep "chat-bad-json" -X POST -H 'Content-Type: application/json' --data '{' "http://127.0.0.1:$PORT/chat"
sweep "chat-no-msgs"  -X POST -H 'Content-Type: application/json' --data '{}' "http://127.0.0.1:$PORT/chat"
sweep "chat-badshape" -X POST -H 'Content-Type: application/json' --data '{"messages":[{"role":"bogus"}]}' "http://127.0.0.1:$PORT/chat"
sweep "chat-badpage"  -X POST -H 'Content-Type: application/json' --data '{"pageId":"no-such-page","messages":[{"role":"user","content":"hi"}]}' "http://127.0.0.1:$PORT/chat"
sweep "chat-real"     -X POST -H 'Content-Type: application/json' --data '{"messages":[{"role":"user","content":"What is this?"}]}' "http://127.0.0.1:$PORT/chat"
sweep "notfound"      "http://127.0.0.1:$PORT/../../etc/passwd"

if grep -qF -- "$KEY" "$WORK/responses.txt"; then
  bad "the provider API key appeared in an HTTP response"
else
  ok "API key absent from $(grep -c '^### ' "$WORK/responses.txt") swept responses incl. 4 error paths"
fi
# The server log is not user-visible, but a key there ends up in journald.
if grep -qF -- "$KEY" "$WORK/server.log"; then
  bad "the provider API key was written to the server log"
else
  ok "API key absent from the server log"
fi
# Positive control: prove the two checks above can actually go red. Without
# this they pass identically when the needle could never appear.
printf 'x %s x\n' "$KEY" >"$WORK/control.txt"
if grep -qF -- "$KEY" "$WORK/control.txt"; then
  ok "positive control: the secrecy grep does detect the key when present"
else
  bad "positive control failed - the secrecy assertions are vacuous"
fi

kill "$SRV" 2>/dev/null || true

echo "=== 5. rollback plan is written down ==="
if [ -s "$ROOT/docs/rollback.md" ]; then
  ok "docs/rollback.md present ($(wc -l <"$ROOT/docs/rollback.md") lines)"
else
  bad "no docs/rollback.md - release has no documented way back"
fi

echo
echo "passed=$PASS failed=$FAIL  head=$HEAD_SHA"
[ "$FAIL" -eq 0 ] || exit 1
echo "RELEASE AUDIT PASSED (pre-deploy scope only; deployed-host clauses remain open)"
