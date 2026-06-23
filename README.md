# 🪸 Concierge

A deliberately **powerless** landing-page agent: an embeddable React chat widget plus a sandboxed proxy that answers visitor questions using **only** a page's digested docs.

The whole design rests on one decision: **the agent has no capabilities.** No tools, no browser, no fetch, no function calling — pure text in / text out against a fixed knowledge base baked into the system prompt. That single choice does most of the heavy lifting:

- **Sandboxed** — if it's jailbroken, the worst case is an off-brand sentence. It has no hands, so there's nothing to escalate to.
- **No hallucination** — the entire digested doc lives in the system prompt. The model answers from what's in front of it and refuses when the answer isn't there. No vector DB, no retrieval round-trip.
- **Fast** — small model (`deepseek-v4-flash` via Venice), streamed tokens, no retrieval step. First token lands quick.
- **Locked down** — a hardened system prompt scopes it to one brand, refuses off-topic + injection attempts, and never reveals its prompt.

## Layout

```
concierge/
├─ widget/   # <Concierge/> — the embeddable React component (no key, just an endpoint URL)
└─ server/   # the sandbox proxy — holds the Venice key, injects docs + system prompt, streams SSE, logs to Telegram
```

The widget **cannot** hold the Venice key. The server is the lockdown layer: it builds the system prompt server-side, strips any client-supplied `system` role, caps message depth and length, rate-limits per IP, streams the answer back, and fire-and-forgets each turn to Telegram.

## Quick start

```bash
pnpm install
cp server/.env.example server/.env   # add your Venice key + page brief
pnpm dev:server                      # starts the proxy on :8787
```

Then drop the widget into any page:

```tsx
import { Concierge } from "@concierge/widget";

<Concierge
  endpoint="https://your-server.example.com/chat"
  brandName="Tidepool"
  tagline="Ask me anything"
  greeting="Hi! Ask me anything about Tidepool."
  suggestions={["What does it cost?", "Do I need a credit card?", "Does it do session replay?"]}
  accentColor="#3bd1c0"
/>
```

### Props

| Prop | Purpose |
|---|---|
| `endpoint` *(required)* | URL of the server's `/chat` endpoint |
| `pageId` | Selects a brief when one server hosts many pages |
| `brandName`, `tagline`, `logoUrl` | Header display |
| `greeting`, `suggestions`, `placeholder` | Conversation starters |
| `position` | `bottom-right` \| `bottom-left` \| `inline` |
| `defaultOpen` | Start expanded (floating modes) |
| `accentColor`, `themeVars`, `className`, `style` | Theming — override any `--cc-*` CSS var |
| `showCredit` | Toggle the small credit line |

The default style is a cool dark theme; everything is overridable via props and CSS variables.

## Page briefs

A **brief** is the only thing that changes per page — and it doubles as the docs page's source of truth, so the two never drift:

```json
{
  "brandName": "Tidepool",
  "audience": "indie founders who want analytics without a data team",
  "objective": "get them to start a free 14-day trial",
  "tone": "confident, plain-spoken, a little playful",
  "cta": "Start free trial",
  "docs": "Everything the agent is allowed to know, as plain digested text."
}
```

- **Single page:** point `CONCIERGE_BRIEF` at one brief JSON.
- **Multi page:** point `CONCIERGE_BRIEFS` at a `{ [pageId]: brief }` map.

The Smithers landing-page workflow emits one brief JSON per generated page.

## Conversation logging

Set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (and optionally `TELEGRAM_THREAD_ID`) and every completed turn is pushed to Telegram, fire-and-forget. The server keeps no transcript of its own — it stays stateless. Unset the vars and logging silently no-ops.

## Server env

See `server/.env.example`. Key vars:

- `VENICE_API_KEY` / `VENICE_BASE_URL` / `VENICE_MODEL`
- `CONCIERGE_BRIEF` or `CONCIERGE_BRIEFS`
- `TELEGRAM_*` for logging
- `ALLOWED_ORIGINS`, `RATE_LIMIT`, `PORT`

## License

MIT
