#!/usr/bin/env bash
# Deploy the built Concierge artifacts to the systemd-managed instance.
#
# Why this exists: approval appr_db63172114b39aaca6d3 describes the deploy as
# "refresh /home/xiko/concierge-deploy from the current build and restart".
# Doing exactly that produces a service that cannot boot. The unit runs
#   ExecStart=/usr/bin/node .../server.bundle.cjs
# but scripts/build-bundle.sh emits ESM (the server has top-level await, which
# --format=cjs cannot express). Copying the new bundle over the old .cjs name
# dies with "Cannot use import statement outside a module", and Restart=on-failure
# then restart-loops it. Verified 2026-09-06 by running the ESM bundle under a
# .cjs name: node exits 1 on SyntaxError.
#
# So the deploy is a unit change plus a file copy, and it needs a real way back.
# That is what this script is.
#
# Usage:
#   scripts/deploy.sh --dry-run                 # print the plan, touch nothing
#   scripts/deploy.sh --staging <dir>           # rehearse into a scratch tree
#   scripts/deploy.sh --apply                   # the real thing (gated decision)
#   scripts/deploy.sh --rollback <backup-dir>   # restore a previous snapshot
#
# --apply refuses unless CONCIERGE_DEPLOY_APPROVAL is set to an approval id, so
# it cannot be run casually or by a heartbeat that wandered in.
#
# Exit: 0 done · 1 a check failed and nothing was changed (or was rolled back) · 2 cannot run
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

OUT="$ROOT/dist-deploy"
LIVE="${CONCIERGE_DEPLOY_DIR:-/home/xiko/concierge-deploy}"
UNIT="${CONCIERGE_UNIT:-concierge}"
UNIT_FILE="/etc/systemd/system/${UNIT}.service"
HEALTH_URL="${CONCIERGE_HEALTH_URL:-http://127.0.0.1:3360/health}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

MODE=""
STAGING=""
ROLLBACK_FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)  MODE="dry" ;;
    --apply)    MODE="apply" ;;
    --staging)  MODE="staging"; STAGING="${2:?--staging needs a directory}"; shift ;;
    --rollback) MODE="rollback"; ROLLBACK_FROM="${2:?--rollback needs a backup directory}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
[ -n "$MODE" ] || { echo "one of --dry-run / --staging <dir> / --apply / --rollback <dir> is required" >&2; exit 2; }

say()  { echo "==> $1"; }
fail() { echo "FAIL $1" >&2; exit 1; }
need() { echo "CANNOT RUN: $1" >&2; exit 2; }

# ---------------------------------------------------------------- rollback ---
if [ "$MODE" = "rollback" ]; then
  [ -d "$ROLLBACK_FROM" ] || need "no such backup directory: $ROLLBACK_FROM"
  [ -s "$ROLLBACK_FROM/server.bundle.cjs" ] || [ -s "$ROLLBACK_FROM/server.bundle.mjs" ] \
    || need "backup carries no server bundle: $ROLLBACK_FROM"
  say "restoring $LIVE from $ROLLBACK_FROM"
  # Config is never restored from a backup blindly: it may have been changed
  # deliberately since. Only the artifacts and the unit go back.
  for f in server.bundle.cjs server.bundle.mjs concierge-embed.js; do
    [ -f "$ROLLBACK_FROM/$f" ] && install -m 0644 "$ROLLBACK_FROM/$f" "$LIVE/$f"
  done
  if [ -f "$ROLLBACK_FROM/unit.service" ]; then
    sudo -n install -m 0644 "$ROLLBACK_FROM/unit.service" "$UNIT_FILE" \
      || need "cannot write $UNIT_FILE (needs passwordless sudo)"
    sudo -n systemctl daemon-reload
  fi
  sudo -n systemctl restart "$UNIT" || need "cannot restart $UNIT"
  sleep 2
  curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null || fail "rolled back but $HEALTH_URL is not answering"
  say "rolled back; $HEALTH_URL 200; service $(systemctl is-active "$UNIT")"
  exit 0
fi

# ------------------------------------------------------------- preflight ----
say "preflight"
[ -s "$OUT/server.bundle.mjs" ]  || need "no built server bundle; run scripts/build-bundle.sh"
[ -s "$OUT/concierge-embed.js" ] || need "no built widget bundle; run scripts/build-bundle.sh"

# The artifact must be the current themed build, not a stale one lying around.
grep -q attachShadow "$OUT/concierge-embed.js" || fail "built widget has no attachShadow"
TOKENS="$(grep -oE -- '--cc-[a-z0-9-]+' "$OUT/concierge-embed.js" | sort -u | wc -l)"
[ "$TOKENS" -ge 50 ] || fail "built widget exposes only $TOKENS --cc-* tokens; expected the token-first build"

# Refuse to deploy an artifact older than the code it is supposed to contain.
HEAD_EPOCH="$(git log -1 --format=%ct HEAD)"
BUNDLE_EPOCH="$(stat -c %Y "$OUT/server.bundle.mjs")"
[ "$BUNDLE_EPOCH" -ge "$HEAD_EPOCH" ] || fail "built bundle predates HEAD; rebuild before deploying"

# The provider key must never be baked into an artifact we are about to serve.
if [ -r "$LIVE/concierge.env" ]; then
  KEY="$(grep -E '^VENICE_API_KEY=' "$LIVE/concierge.env" | cut -d= -f2- || true)"
  if [ -n "$KEY" ]; then
    for f in "$OUT/server.bundle.mjs" "$OUT/concierge-embed.js"; do
      grep -qF -- "$KEY" "$f" && fail "artifact embeds the provider API key: $f"
    done
  fi
fi
say "preflight ok (widget $TOKENS tokens, attachShadow present, no embedded key)"

TARGET="$LIVE"
[ "$MODE" = "staging" ] && TARGET="$STAGING"

cat <<EOPLAN

PLAN ($MODE)
  source      $OUT/server.bundle.mjs  ($(stat -c %s "$OUT/server.bundle.mjs") bytes)
              $OUT/concierge-embed.js ($(stat -c %s "$OUT/concierge-embed.js") bytes)
  target      $TARGET
  unit        $UNIT_FILE
  ExecStart   node .../server.bundle.cjs  ->  node .../server.bundle.mjs
  preserved   concierge.env, frontier.brief.json, server.bundle.cjs (old, kept for rollback)
  backup      $LIVE.bak.$STAMP
EOPLAN

if [ "$MODE" = "dry" ]; then
  say "dry run: nothing was changed"
  exit 0
fi

# --------------------------------------------------------------- staging ----
if [ "$MODE" = "staging" ]; then
  [ -n "$STAGING" ] || need "no staging directory"
  mkdir -p "$STAGING"
  # Config comes from the live tree; artifacts from the build.
  for f in concierge.env frontier.brief.json; do
    [ -f "$LIVE/$f" ] && install -m 0600 "$LIVE/$f" "$STAGING/$f"
  done
  install -m 0644 "$OUT/server.bundle.mjs"  "$STAGING/server.bundle.mjs"
  install -m 0644 "$OUT/concierge-embed.js" "$STAGING/concierge-embed.js"

  PORT="${CONCIERGE_STAGING_PORT:-3365}"
  WORK="$(mktemp -d)"
  trap 'fuser -k -n tcp "$PORT" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
  sed -e "s#^PORT=.*#PORT=$PORT#" \
      -e "s#^CONCIERGE_EMBED_FILE=.*#CONCIERGE_EMBED_FILE=$STAGING/concierge-embed.js#" \
      -e '/^TELEGRAM_/d' \
      "$STAGING/concierge.env" > "$WORK/staging.env"
  set -a
  # staging.env is generated by mktemp above, so there is nothing to follow.
  # shellcheck disable=SC1091
  . "$WORK/staging.env"
  set +a

  say "booting the staged tree on :$PORT exactly as the unit would"
  node "$STAGING/server.bundle.mjs" >"$WORK/server.log" 2>&1 &
  for _ in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
    sleep 0.5
  done
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 \
    || { echo "--- server log ---"; cat "$WORK/server.log"; fail "staged tree never became ready on :$PORT"; }

  SERVED_MD5="$(curl -fsS "http://127.0.0.1:$PORT/embed.js" | md5sum | cut -d' ' -f1)"
  BUILT_MD5="$(md5sum "$OUT/concierge-embed.js" | cut -d' ' -f1)"
  [ "$SERVED_MD5" = "$BUILT_MD5" ] || fail "served /embed.js ($SERVED_MD5) != build output ($BUILT_MD5)"
  say "staging ok: /health 200, /embed.js byte-identical to the build ($BUILT_MD5)"
  say "production untouched"
  exit 0
fi

# ----------------------------------------------------------------- apply ----
[ -n "${CONCIERGE_DEPLOY_APPROVAL:-}" ] \
  || need "--apply requires CONCIERGE_DEPLOY_APPROVAL=<approval id>; this deploy is a gated decision"
say "applying, authorised by ${CONCIERGE_DEPLOY_APPROVAL}"

BACKUP="$LIVE.bak.$STAMP"
cp -a "$LIVE" "$BACKUP" || need "could not snapshot $LIVE"
cp "$UNIT_FILE" "$BACKUP/unit.service" 2>/dev/null || true
say "snapshot: $BACKUP"

install -m 0644 "$OUT/server.bundle.mjs"  "$LIVE/server.bundle.mjs"
install -m 0644 "$OUT/concierge-embed.js" "$LIVE/concierge-embed.js"

sudo -n sed -i "s#^ExecStart=.*#ExecStart=/usr/bin/node $LIVE/server.bundle.mjs#" "$UNIT_FILE" \
  || { say "unit edit failed; restoring"; "$0" --rollback "$BACKUP"; exit 1; }
sudo -n systemctl daemon-reload
sudo -n systemctl restart "$UNIT"

sleep 2
READY=0
for _ in $(seq 1 40); do
  curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1 && { READY=1; break; }
  sleep 0.5
done
if [ "$READY" -ne 1 ]; then
  say "health check failed after restart; rolling back automatically"
  "$0" --rollback "$BACKUP"
  fail "deploy rolled back: $HEALTH_URL never answered"
fi

# is-active is not evidence: check the bytes actually served.
SERVED_MD5="$(curl -fsS "${HEALTH_URL%/health}/embed.js" | md5sum | cut -d' ' -f1)"
BUILT_MD5="$(md5sum "$OUT/concierge-embed.js" | cut -d' ' -f1)"
if [ "$SERVED_MD5" != "$BUILT_MD5" ]; then
  say "served widget does not match the build; rolling back automatically"
  "$0" --rollback "$BACKUP"
  fail "deploy rolled back: served $SERVED_MD5 != built $BUILT_MD5"
fi

say "deployed: $HEALTH_URL 200, /embed.js $BUILT_MD5, unit $(systemctl is-active "$UNIT")"
say "rollback if needed: scripts/deploy.sh --rollback $BACKUP"
