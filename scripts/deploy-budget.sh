#!/usr/bin/env bash
# Deploy verified artifacts to the existing Hetzner service. Do not read or copy credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
LIVE=/home/xiko/concierge-deploy
DROPIN=/etc/systemd/system/concierge.service.d/usage-budget.conf
[ "${1:-}" = --apply ] || { echo 'Use --apply after verification.' >&2; exit 2; }
[ -s dist-deploy/server.bundle.mjs ] && [ -s dist-deploy/concierge-embed.js ]
[ "$(systemctl show concierge.service -p WorkingDirectory --value)" = "$LIVE" ]
[ "$(systemctl is-active concierge.service)" = active ]
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo 'Commit tracked changes before deployment.' >&2; exit 2; }
[ "$(stat -c %Y dist-deploy/server.bundle.mjs)" -ge "$(git log -1 --format=%ct)" ]
BACKUP=$(mktemp -d /home/xiko/concierge-deploy-budget-backup.XXXXXX)
chmod 700 "$BACKUP"
cp "$LIVE/server.bundle.mjs" "$LIVE/concierge-embed.js" "$BACKUP/"
if sudo -n test -f "$DROPIN"; then sudo -n cp "$DROPIN" "$BACKUP/usage-budget.conf"; fi
rollback() {
  trap - ERR
  install -m 644 "$BACKUP/server.bundle.mjs" "$LIVE/server.bundle.mjs"
  install -m 644 "$BACKUP/concierge-embed.js" "$LIVE/concierge-embed.js"
  if [ -f "$BACKUP/usage-budget.conf" ]; then sudo -n cp "$BACKUP/usage-budget.conf" "$DROPIN"; else sudo -n rm -f "$DROPIN"; fi
  sudo -n systemctl daemon-reload
  sudo -n systemctl restart concierge.service
  echo "Deployment failed. Restored artifacts from $BACKUP." >&2
  exit 1
}
trap rollback ERR
sudo -n install -d -m 755 /etc/systemd/system/concierge.service.d
sudo -n tee "$DROPIN" >/dev/null <<'UNIT'
[Service]
Environment=CONCIERGE_HOST=0.0.0.0
Environment=CONCIERGE_BUDGET_PATH=/home/xiko/concierge-deploy/usage.sqlite
Environment=CONCIERGE_BUDGET_REQUESTS=200
Environment=CONCIERGE_BUDGET_VOLUME=2000000
Environment=CONCIERGE_BUDGET_PERIOD_MS=86400000
UMask=0077
UNIT
install -m 644 dist-deploy/server.bundle.mjs "$LIVE/server.bundle.mjs"
install -m 644 dist-deploy/concierge-embed.js "$LIVE/concierge-embed.js"
sudo -n systemctl daemon-reload
sudo -n systemctl restart concierge.service
ready=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:3360/ready >/dev/null; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ]
for domain in concierge.repo.box frontier.repo.box repo.box; do
  curl -fsS --max-time 15 "https://$domain/concierge/health" >/dev/null
  curl -fsS --max-time 15 "https://$domain/concierge/embed.js" | cmp - dist-deploy/concierge-embed.js
  status=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "https://$domain/concierge/chat")
  [ "$status" = 400 ]
done
trap - ERR
echo "Deployment verified. Artifact backup: $BACKUP"
sha256sum "$LIVE/server.bundle.mjs" dist-deploy/server.bundle.mjs
