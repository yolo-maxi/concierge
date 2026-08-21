<div align="center">

# 🪸 Concierge

**A deliberately _powerless_ landing-page agent.**
An embeddable chat widget + a sandboxed proxy that answers visitor questions using **only** a page's digested docs — fast, on-brand, and impossible to jailbreak into doing anything.

</div>

---

## Why it's safe by design

The whole thing rests on one decision: **the agent has no capabilities.** No tools, no browser, no retrieval, no function calling — pure text in / text out against a fixed knowledge base baked into the system prompt. That single choice does the heavy lifting:

| Property | How it's achieved |
|---|---|
| **Sandboxed** | The agent has no hands. Jailbreak it and the worst case is an off-brand sentence — there's nothing to escalate *to*. |
| **No hallucination** | The entire digested doc lives in the system prompt. It answers from what's in front of it and refuses when the answer isn't there. No vector DB, no retrieval step. |
| **Fast** | Small model (`deepseek-v4-flash` via Venice by default), streamed tokens, no retrieval round-trip. First token lands quick. |
| **Locked down** | A hardened prompt scopes it to one brand and refuses off-topic, injection, persona-swap, and prompt-extraction. The server also strips any client-supplied `system` role, caps message depth/length, and rate-limits per IP. |

It's less "build an AI agent" and more "great widget + a deliberately powerless chatbot."

## Architecture

```
your page  ──>  <Concierge/> widget        (holds no secrets, just an endpoint URL)
                      │  POST /chat
                      ▼
                concierge server           (the lockdown layer)
                      │  injects digested docs + hardened prompt,
                      │  strips client system role, rate-limits,
                      ▼  streams SSE, logs each turn to Telegram
                  Venice (OpenAI-compatible)
```

The widget **cannot** hold the model key — it only knows an endpoint URL. The server is the only thing that touches the key and the docs.

---

## Quick start

```bash
pnpm install
cp server/.env.example server/.env     # add your Venice key + a page brief
pnpm dev:server                        # proxy on :8787
pnpm --filter @concierge/widget build  # builds the React lib + the standalone embed
```

Then integrate one of two ways.

### A) Drop-in script — any site, no build step

The widget ships as a single self-mounting bundle. The server serves it at `/embed.js` (set `CONCIERGE_EMBED_FILE`), so a host page needs **one tag** and never hosts the asset itself:

```html
<script
  defer
  src="https://your-host/concierge/embed.js"
  data-endpoint="/concierge/chat"
  data-brand-name="Frontier"
  data-tagline="The order book, explained"
  data-greeting="Ask me anything about Frontier."
  data-suggestions="What is it?|How does copy liquidity work?|What does it cost?"
  data-launcher="pill"
  data-launcher-label="Ask Frontier"
  data-nudge="New here? Ask me anything — no docs-diving required."
  data-accent-color="#35d07a"
  data-accent-color2="#62e6a6"
  data-position="bottom-right"
></script>
```

### B) React component

```tsx
import { Concierge } from "@concierge/widget";

<Concierge
  endpoint="https://your-host/concierge/chat"
  brandName="Frontier"
  greeting="Ask me anything about Frontier."
  suggestions={["What is it?", "How does copy liquidity work?", "What does it cost?"]}
  launcher="pill"
  launcherLabel="Ask Frontier"
  nudge="New here? Ask me anything — no docs-diving required."
  accentColor="#35d07a"
  accentColor2="#62e6a6"
/>
```

Both render the same widget. State (transcript + open/closed) persists in `sessionStorage`, so the conversation **follows the visitor across same-origin page navigations**. Markdown `[label](url)` and bare URLs in answers render as links.

---

## Customization

Every prop has a `data-*` equivalent for the script embed (`launcherLabel` → `data-launcher-label`).

| Prop / `data-*` | Default | What it does |
|---|---|---|
| `endpoint` **(required)** | — | URL of the server's `/chat` endpoint |
| `brandName` | `Assistant` | Name shown in the header |
| `tagline` | `Ask me anything` | Subtitle under the brand name |
| `logoUrl` | spark icon | Header avatar image |
| `greeting` | generic | The assistant's opening line |
| `suggestions` | none | Starter chips (`\|`-separated in `data-suggestions`) |
| `placeholder` | `Ask a question…` | Input placeholder |
| `launcher` | `pill` | `pill` (labelled) or `bubble` (round) |
| `launcherLabel` | `Ask AI` | Text on the pill |
| `launcherIcon` | spark ✦ | Emoji to use instead of the spark icon |
| `nudge` | none | Proactive teaser bubble above the launcher |
| `nudgeDelay` | `5000` | Delay (ms) before the nudge appears |
| `online` | `true` | Show the live green dot on the avatar |
| `position` | `bottom-right` | `bottom-right` \| `bottom-left` \| `inline` |
| `defaultOpen` | `false` | Start expanded |
| `theme` | `midnight` | `midnight` (dark) or `light` |
| `accentColor` | `#6d8bff` | Primary accent (gradient, buttons, user bubbles) |
| `accentColor2` | tint of accent | Second gradient stop |
| `themeVars` | — | Override any `--cc-*` token directly (React) |
| `creditText` / `showCredit` | on | The small line under the input |

### Theming tokens

Anything not covered by a prop is a CSS variable on `.cc-root`. Override `--cc-bg`, `--cc-surface`, `--cc-text`, `--cc-radius`, `--cc-font`, etc. via `themeVars` or your own stylesheet. The accent **auto-generates a gradient and glow** from `--cc-accent`, so a single color already looks rich.

```tsx
<Concierge … themeVars={{ "--cc-radius": "12px", "--cc-font": "'IBM Plex Sans', sans-serif" }} />
```

`window.Concierge.mount({...props})` is also exposed for manual mounting.

---

## The page brief (feeding it your agent)

A **brief** is the only thing that changes per page. It's the agent's entire world — and it doubles as the human docs source, so the two never drift:

```jsonc
{
  "brandName": "Frontier",
  "audience": "onchain traders who know what a CLOB is",
  "objective": "get them to open the live demo and place an order",
  "tone": "confident, technically precise, no marketing fluff",
  "cta": "Trade at the edge (clob.repo.box)",
  "docs": "Everything the agent is allowed to know, as plain digested text. Include a LINKS section with the exact URLs it may share — it can ONLY cite links that appear here, never invent one."
}
```

- **Single page:** point `CONCIERGE_BRIEF` at one brief JSON.
- **Multi page:** point `CONCIERGE_BRIEFS` at a `{ [pageId]: brief }` map; the widget selects with `pageId` / `data-page-id`.

**Tips for a good brief:** write `docs` as tight, factual prose (a few hundred words). State what the product *doesn't* do, so the agent refuses confidently. Add a `LINKS:` block of real URLs — the prompt lets it share links but only ones present verbatim in the brief.

---

## Optional capability packs

Concierge is powerless by default. With no `capabilities` block in the server-loaded brief, prompt assembly and chat behaviour stay on the original code path: no retrieval, no tools, no memory, no action surface. Every capability you add is a door you opened, so configure them only from trusted server-side brief JSON loaded via `CONCIERGE_BRIEF` or `CONCIERGE_BRIEFS`. The client `/chat` body cannot enable, inject, or modify capabilities; the server still strips client `system` messages and ignores capability-shaped request fields.

```jsonc
{
  "brandName": "Frontier",
  "audience": "...",
  "objective": "...",
  "tone": "...",
  "cta": "...",
  "docs": "Small digested brief remains the baseline source of truth.",
  "capabilities": {
    "retrieval": {
      "source": "inline",              // "inline" or "url"
      "docs": ["larger corpus text"],  // inline only
      "url": "https://example.com/corpus.txt", // url only; fetched once at boot
      "chunks": ["optional pre-split chunk"],
      "topK": 3,
      "maxInjectedChars": 4000
    },
    "tools": ["capture_lead", "handoff_human"]
  }
}
```

### Retrieval pack

`capabilities.retrieval` adds a larger configured corpus beside the small hand-digested brief. `source: "inline"` reads `docs` or `chunks` from the brief. `source: "url"` fetches `url` once when configured briefs are loaded at server start, then serves only that cached corpus; it never browses or fetches per visitor request. The server chunks text locally and ranks chunks by simple token overlap, injects at most `topK` matches, and enforces `maxInjectedChars` as a hard cap (default `4000`).

Threat model: if an attacker prompt-injects the model with retrieval enabled, they may coax it to quote or misuse more of the configured corpus than the small brief exposed. Mitigations: retrieval can only select from the configured corpus, no live network access happens per request, injected context is bounded by `maxInjectedChars`, and the system prompt still forbids bulk dumps and off-topic answers.

### Tool pack

`capabilities.tools` is an allowlist of server-defined handlers. It is not arbitrary function calling, user code, or tool names from the browser. The model sees only the name, description, and JSON schema for tools allowlisted by the brief.

Built-in tools:

| Tool | Args | Behaviour |
|---|---|---|
| `capture_lead` | `{ "name"?: string, "email": string, "message"?: string }` | Validates the email, POSTs `{ brand, pageId, pageUrl, sessionId, lead }` to `CONCIERGE_LEAD_WEBHOOK_URL`, sends `Authorization: Bearer <CONCIERGE_LEAD_WEBHOOK_SECRET>` if configured, and returns a visitor-safe confirmation. |
| `handoff_human` | `{ "reason"?: string }` | Emits a high-priority tool event through the existing sink fan-out, so console/webhook/Telegram receive it, and acknowledges the handoff to the visitor. |

Threat model: if an attacker prompt-injects the model with tools enabled, they may cause allowed side effects such as sending bogus leads or paging a human. Mitigations: tools are allowlisted per brief, arguments are validated and sanitized before logging, each tool has its own rate limit on top of the per-IP chat limit, each call has a timeout, loop depth is capped, and failures return safe plain text rather than stack traces or internal details.

To add another tool, create one file in `server/src/tools/` exporting a `ConciergeTool`, then add it to `ALL_TOOLS` in `server/src/tools/registry.ts`. A brief still must explicitly allowlist the new name before the model can see or call it.

New env vars:

| Env var | Default | What it does |
|---|---|---|
| `CONCIERGE_TOOL_RATE_LIMIT` | `5` | Per-IP, per-brand, per-tool calls per minute. |
| `CONCIERGE_TOOL_MAX_DEPTH` | `2` | Maximum tool-call loop depth per turn. |
| `CONCIERGE_TOOL_TIMEOUT_MS` | `5000` | Per-tool execution timeout. |
| `CONCIERGE_LEAD_WEBHOOK_URL` | unset | Destination for `capture_lead`; if unset, the tool degrades to a safe text acknowledgement. |
| `CONCIERGE_LEAD_WEBHOOK_SECRET` | unset | Optional bearer token sent only to the lead webhook. |

Tool calls emit `concierge.tool_call` events to the same sinks as turns. Events include tool name, sanitized args, outcome, and duration; secrets and raw credentials are never included.

---

## Conversation logging (optional, pluggable)

Each completed turn is normalized into one event and fanned out to every configured **sink**, fire-and-forget. Enable any combination; configure none and logging silently no-ops. The server keeps no transcript of its own — it stays stateless.

```jsonc
// the event every sink receives
{
  "type": "concierge.turn",
  "at": "2026-06-24T00:29:47.299Z",
  "brand": "Frontier",
  "pageId": "frontier",
  "pageUrl": "https://frontier.repo.box/",
  "sessionId": "s_ab12…",
  "emoji": "🛰️",            // stable per-session, handy for grouping
  "question": "is it custodial?",
  "answer": "No, Frontier is non-custodial. …",
  "ip": "203.0.113.7"
}
```

| Sink | Enable with | What it does |
|---|---|---|
| **Webhook** | `CONCIERGE_WEBHOOK_URL` (+ optional `CONCIERGE_WEBHOOK_SECRET`) | `POST`s the event as JSON to your backend. The secret is sent as `Authorization: Bearer <secret>`. The simplest, most flexible option — pipe it into your own DB/queue/analytics. |
| **Console** | `CONCIERGE_LOG_CONSOLE=1` | Writes one JSON line per turn to stdout — pipe it to a file, vector, journald, etc. |
| **Telegram** | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (+ optional `TELEGRAM_THREAD_ID`) | Formatted message to a chat/forum topic, question in a blockquote, led by the page + session emoji. |

Adding your own sink is a few lines — drop a `(event) => Promise<void>` into the `SINKS` array in `server/src/log.ts`.

## Server env

See `server/.env.example`:

- `VENICE_API_KEY` / `VENICE_BASE_URL` / `VENICE_MODEL` — the model (any OpenAI-compatible endpoint works)
- `CONCIERGE_BRIEF` or `CONCIERGE_BRIEFS` — the page brief(s)
- `CONCIERGE_EMBED_FILE` — path to `widget/dist/concierge-embed.js` to serve at `/embed.js`
- `TELEGRAM_*` — optional logging
- `ALLOWED_ORIGINS`, `RATE_LIMIT`, `PORT`

## Layout

```
concierge/
├─ widget/   # <Concierge/> React component + the standalone embed bundle
└─ server/   # the sandbox proxy (holds the key, injects docs + prompt, streams, logs)
```

## License

MIT
