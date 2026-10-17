# Concierge usage budget

The Hetzner service reserves usage before every Venice call. Tool follow-up calls
use the same budget. The default limit is 200 calls and 2,000,000 volume units
per 24 hours. The period starts with database creation. The next period starts
with the first check after expiry. This is a fixed period, not a rolling window.
Traffic across a period boundary can consume two period allowances.

Volume is the UTF-8 byte length of the serialized messages and tool definitions,
plus 600 output units per call. The provider output limit is 600 tokens. This is
an intentionally conservative local volume limit. It is not a dollar balance,
a provider token count, or a measurement of ChatGPT subscription use. Concierge
uses direct Venice with `deepseek-v4-flash`. Other Venice account consumers can
exhaust the shared allowance before this service reaches its local limit.

The owner receives a local warning at 80% of either limit. The owner also receives
an alert when the local limit refuses a call or reaches its cap. Venice HTTP 402
causes a separate allowance alert and a durable pause. Local accounting cannot
predict exhaustion caused by other consumers. There is no claim that it can.

## State and failure behavior

Node.js 24 is used in production. The built-in SQLite module stores counters,
provider pauses, and alert claims. SQLite transactions reserve usage before network
access. Full synchronous commits preserve reservations across process restarts.
Concurrent processes must use the same database path. Failed and cancelled calls
keep their full reservation. No automatic provider retry occurs.

Production uses `/home/xiko/concierge-deploy/usage.sqlite`, mode 0600. The systemd
unit uses umask 0077. Do not delete, replace, or restore this database during an
artifact rollback. A missing database creates a new allowance. Back up state only
with a SQLite-aware backup process. A corrupt or unwritable database fails closed.

The environment settings are `CONCIERGE_BUDGET_PATH`, `CONCIERGE_BUDGET_REQUESTS`,
`CONCIERGE_BUDGET_VOLUME`, and `CONCIERGE_BUDGET_PERIOD_MS`. Invalid settings stop
startup. The maximum configurable period is 31 days. Changing limits requires a
service restart. Preserve the database when changing limits.

| Condition | Visitor code | Recovery |
|---|---|---|
| Local limit | `budget_exhausted` | Period expiry |
| Venice HTTP 402 | `provider_exhausted` | Owner restores allowance and clears pause |
| Venice HTTP 401/403 | `provider_auth` | Owner fixes access and clears pause |
| Venice HTTP 429 | `provider_rate_limited` | One-minute cooldown |
| Other Venice HTTP 4xx or content refusal | `provider_refused` | No automatic retry |
| Venice HTTP 5xx, broken stream, network failure | `provider_failure` | Existing circuit breaker limits later calls |
| Unconfirmed alert | `alert_unconfirmed` | Owner verifies delivery and repairs the alert state |

HTTP error bodies from Venice are discarded. Stream errors use fixed messages.
A stream that closes before `[DONE]` is a failure. Once streaming starts, failures
use a structured server-sent event because the HTTP status is already sent.
Later requests receive HTTP 503 when a durable pause applies. `/health` remains
live. `/ready` returns 503 while the budget or provider pause prevents calls.

## Private alerts

Alerts reuse the existing service Telegram destination and topic. The service
requires that route at startup. Alert text contains only the event name, provider
name, period start, reserved call count, and reserved volume. It contains no
visitor identifier, prompt, response, credential, or provider response body.

Each event has one durable delivery claim per period. The service records the
claim before sending. Telegram must acknowledge delivery within five seconds.
An uncertain delivery leaves a pending claim and pauses chat. The service does
not resend that claim automatically. This prevents duplicate alerts after a crash
or timeout. It deliberately favors a pause over unobserved spend. A crash after
delivery but before acknowledgement can therefore require owner recovery.

Inspect counters with:

```sh
node scripts/budget-status.mjs /home/xiko/concierge-deploy/usage.sqlite
```

Before clearing a provider pause, restore the Venice allowance or access. Stop
`concierge.service`. Use the Node.js SQLite interface to set `budget.blocked` to
an empty string. Do not reset `requests`, `volume`, or `start`. For a pending
alert, first verify the private topic. After delivery is confirmed, set that
alert row's `status` to `sent`. If delivery did not occur, deliver the fixed
operations notice through the approved private route before marking it sent.
Restart the service and check `/ready`. There is no public reset endpoint.

## Verification and deployment

`server/test/budget.test.ts` uses fake providers and temporary databases. App tests
check the origin boundary, proxy-path rejection, budget refusal, and truthful
provider failure. Existing capability tests preserve server-owned prompts and
tool allowlists. Browser origins outside `ALLOWED_ORIGINS` are rejected before
request processing. CORS is not authentication. The firewall still restricts
port 3360 to the repo.box proxy. Public routes remain under `/concierge/*` on the
three approved hosts. No generic model endpoint is added.

`scripts/check-operations-alert.ts` makes a controlled test with a temporary
budget. It sends two clearly marked operations alerts and checks restart
deduplication. It makes no provider requests. Build it with esbuild and run it
through systemd with the service's existing EnvironmentFile. Do not copy or
print credentials. Its only output is acknowledgement counts and test status.

After test, lint, and build gates pass, commit and push. Build the deploy bundle
after the commit. Use `scripts/deploy-budget.sh --apply`. This script backs up
artifacts only. It preserves the credential file and the budget database. It
keeps Hetzner serving port 3360 and checks all three retained public paths.
It restores artifacts and its drop-in on verification failure. It does not edit
Caddy, migrate the service, or retire the Hetzner service.

Venice status classification follows the provider's
[chat API reference](https://github.com/veniceai/skills/blob/main/skills/venice-chat/SKILL.md).
