# Concierge deployment and rollback

The live Concierge service runs on the repo.box host. It listens on
`127.0.0.1:3360`. Caddy is the only public entry point.

## Runtime files

- `/home/fran/concierge-deploy/server.bundle.mjs`
- `/home/fran/concierge-deploy/concierge-embed.js`
- `/home/fran/concierge-deploy/packet.json`
- `/home/fran/concierge-deploy/concierge.env`
- `/etc/systemd/system/concierge.service`

The environment file has mode `0600`. Do not copy its values into the
repository or logs. The active provider is configured through the standard
Venice-compatible server variables.

## Public routes

- `https://repo.box/concierge/*`
- `https://frontier.repo.box/concierge/*`
- `https://concierge.repo.box/concierge/*`

The standalone `concierge.repo.box` host is a public, unlisted platform app.
The platform route targets `127.0.0.1:3360`. The two shared-host path routes
stay in the main Caddy configuration because the platform registry supports
host routes only.

## Deploy checks

1. Run `pnpm test`, `pnpm lint`, and `bash scripts/build-bundle.sh`.
2. Copy the two build artifacts to the runtime directory.
3. Preserve `packet.json` and `concierge.env`.
4. Restart `concierge.service`.
5. Check `/health`, `/ready`, and one provider completion on loopback.
6. Check all three public `/concierge/` paths.
7. Check that port `3360` does not accept a direct network connection.

## Rollback

1. Restore the previous runtime directory and unit from the deployment backup.
2. Restore the previous Caddy files with the rollback command printed by the
   guarded Caddy apply tool.
3. If the repo.box service cannot recover, re-enable the preserved Hetzner
   service and its repo.box-only firewall rule.
4. Restore the three route upstreams to `77.42.89.161:3360` through a validated
   Caddy candidate.
5. Check every public path before you end the rollback.

Do not expose ChatMock or copy its OAuth material. The migration did not use
ChatMock because the inspected production service used Venice directly.
