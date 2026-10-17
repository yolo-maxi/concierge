# Concierge deployment and rollback

The public cutover to repo.box is blocked. The Hetzner service stays live at
`77.42.89.161:3360`. Its firewall permits the repo.box host only.

## Ready repo.box candidate

The candidate service is active on the repo.box host. It listens only on
`127.0.0.1:3360`. No public route uses it.

- `/home/fran/concierge-deploy/server.bundle.mjs`
- `/home/fran/concierge-deploy/concierge-embed.js`
- `/home/fran/concierge-deploy/packet.json`
- `/home/fran/concierge-deploy/concierge.env`
- `/etc/systemd/system/concierge.service`

The environment file has mode `0600`. Do not copy its values into the
repository or logs. The candidate uses the same direct Venice provider as the
inspected live service. It does not use ChatMock or its OAuth material.

## Retained public routes

- `https://repo.box/concierge/*`
- `https://frontier.repo.box/concierge/*`
- `https://concierge.repo.box/concierge/*`

Each route strips `/concierge/` before it sends a request to the service. The
`concierge.repo.box` host also serves its static site at `/`.

## Cutover blocker

The platform registry generates full-host routes. It cannot generate a host
that serves static content at `/` and a stripped proxy at `/concierge/*`.
Registering `concierge.repo.box` as a proxy replaced the static site. It also
sent `/concierge/health` to the service without removing the prefix.

The guarded apply tool rolled back that test. The registry record was removed.
The platform database backup is
`/var/lib/repobox-platform/backups/platform.pre-concierge-20261017T001958Z.db`.
The Caddy rollback backups are under `/etc/caddy/backups/` with timestamp
`20261017T002003Z`.

Do not change the three Caddy routes by hand. Resume the cutover only after the
platform route schema and renderer support this composite path contract, or a
documented validated apply tool supports these existing path routes.

## Candidate checks

1. Run `pnpm test`, `pnpm lint`, and `bash scripts/build-bundle.sh`.
2. Check `/health`, `/ready`, and a provider completion on repo.box loopback.
3. Check that repo.box port `3360` rejects direct network connections.
4. Check all retained HTTPS routes against the still-live Hetzner service.

## Candidate rollback

The candidate has no public traffic. To remove it, stop and disable the
repo.box `concierge.service`. The public service does not change.
