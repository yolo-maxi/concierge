# Concierge: deploy and rollback

Scope: the Frontier instance served at `frontier.repo.box`, run by the
`concierge.service` systemd unit on this host.

Nothing here has been rehearsed against production. It is a written plan, not a
verified procedure — the production deploy is gated on approval
`appr_db63172114b39aaca6d3` and no deploy has been performed. Treat every step
below as untested until that gate is answered and a rehearsal is recorded here.

## What is live right now

Measured 2026-09-06:

| | live | built from source |
|---|---|---|
| server | `/home/xiko/concierge-deploy/server.bundle.cjs`, md5 `898b4fa2`, mtime 2026-06-24 | `dist-deploy/server.bundle.mjs`, md5 `b2f57fe7` |
| widget | `/home/xiko/concierge-deploy/concierge-embed.js`, md5 `00f6e9f7`, 162035 bytes | `dist-deploy/concierge-embed.js`, md5 `01cac6df`, 180984 bytes |

`concierge.service` has been up since 2026-08-01 and is serving the June
artifact. Every feature merged since then is absent from the live instance.

## The module-format gap

The live unit runs a **CommonJS** bundle:

```
ExecStart=/usr/bin/node /home/xiko/concierge-deploy/server.bundle.cjs
```

`scripts/build-bundle.sh` emits **ESM** (`server.bundle.mjs`) — deliberately, as
the server has top-level await, which `--format=cjs` cannot express. So the
first deploy is not a file swap: it also requires editing `ExecStart` and a
`systemctl daemon-reload`. A deploy that only copies the new file over the old
name will not start.

This is the single most likely way the first deploy fails. It is called out
here so it is not discovered at deploy time.

## Deploy (not yet performed)

1. `bash scripts/build-bundle.sh` — reproducible artifacts into `dist-deploy/`.
2. `bash scripts/smoke-bundle.sh` — boots the artifact on a scratch port against
   the real brief and provider, asserts the served widget is byte-identical to
   the build output and that `/chat` streams to `[DONE]`.
3. `bash scripts/release-audit.sh` — the full pre-deploy pass, including
   API-key secrecy against a live boot.
4. Back up the live tree, timestamped:
   `cp -a /home/xiko/concierge-deploy /home/xiko/concierge-deploy.bak.$(date -u +%Y%m%dT%H%M%SZ)`
5. `install -m 0644` the two new artifacts into `/home/xiko/concierge-deploy/`,
   keeping `server.bundle.cjs` in place and untouched.
6. Point the unit at the ESM bundle, `daemon-reload`, `restart`.
7. Verify: `systemctl is-active`, `/health` 200, and the served `/embed.js`
   md5 equal to the build output — not just that the service is running.

`concierge.env` and `frontier.brief.json` are configuration, not build output.
Never overwrite them from the repo.

## Rollback

The old artifact is never deleted, so rollback is a unit edit and a restart:

1. Restore `ExecStart` to `/home/xiko/concierge-deploy/server.bundle.cjs`.
2. If the widget was replaced, restore `concierge-embed.js` from the timestamped
   backup taken in step 4.
3. `systemctl daemon-reload && systemctl restart concierge`.
4. Confirm `/health` 200 and the served `/embed.js` md5 matches the restored
   file, then record what failed.

Recovery time is a restart. The risk is not the rollback, it is noticing the
need for one: `Restart=on-failure` will keep restarting a bundle that boots but
answers wrongly, and `systemctl is-active` will stay green throughout. Check the
served bytes, not the unit state.

## Known gaps

- No rehearsal. Steps above are reasoned from the unit file and the artifacts,
  not executed.
- No health check beyond `/health` returning 200; a provider outage presents as
  a healthy service.
- The backup is a manual `cp -a` — there is no retention or pruning.
