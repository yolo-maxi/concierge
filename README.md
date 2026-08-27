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
| `launcher` / `data-launcher` | `pill` | `pill`, `bubble`, `bar`, or `inline-input` |
| `launcherLabel` | `Ask AI` | Text on the pill |
| `launcherIcon` | spark ✦ | Emoji to use instead of the spark icon |
| `avatar` / `data-avatar` | `emoji` | Header avatar: `emoji`, `none`, or an image URL |
| `nudge` | none | Proactive teaser bubble above the launcher |
| `nudgeDelay` | `5000` | Delay (ms) before the nudge appears |
| `online` | `true` | Show the live green dot on the avatar |
| `position` | `bottom-right` | `bottom-right` \| `bottom-left` \| `inline` |
| `defaultOpen` | `false` | Start expanded |
| `theme` | `midnight` | Preset name (`midnight`, `light`, `terminal`, `paper`, `neon`, `minimal`) or a partial token object in React |
| `accentColor` | `#6d8bff` | Primary accent (gradient, buttons, user bubbles) |
| `accentColor2` | tint of accent | Second gradient stop |
| `themeVars` | — | Override any `--cc-*` token directly (React) |
| `isolate` / `data-isolate` | `true` | Mount in a shadow root and inject styles there; set `false` for legacy global stylesheet behavior |
| `radiusScale` / `data-radius-scale` | `1` | Multiplier applied to radius tokens |
| `density` / `data-density` | `comfortable` | `comfortable` or `compact` spacing and type scale |
| `fontFamily` / `data-font-family` | system stack | Overrides `--cc-font-family` |
| `creditText` / `showCredit` | on | The small line under the input |

### Theming tokens

The widget is token-first. `THEME_PRESETS` and `TOKEN_METADATA` are exported from `@concierge/widget`; keep this table aligned with `widget/src/themes.ts` if adding tokens. Theme composition order is: preset tokens, then `accentColor` / `accentColor2` derivation, then `themeVars`. Later values win. By default the widget is mounted in a shadow root, so external CSS should use props, `themeVars`, or `::part(launcher)` / `::part(panel)` instead of depending on global selectors. Set `isolate={false}` / `data-isolate="false"` to keep the old global stylesheet behavior.

```tsx
<Concierge
  …
  theme="terminal"
  radiusScale={0.8}
  density="compact"
  themeVars={{ "--cc-radius-panel": "12px", "--cc-font-family": "'IBM Plex Sans', sans-serif" }}
/>
```

| Token | Category | Type | Controls | Midnight default | Preset differences |
|---|---|---|---|---|---|
| `--cc-bg` | color | color | Panel body background | `#0c0f16` | light/minimal `#ffffff`; terminal `#050805`; paper `#fbf7ef`; neon `#080713` |
| `--cc-surface` | color | color | Header, assistant bubble, input, and nudge surface | `#151b25` | light `#f5f7fb`; terminal `#0d160f`; paper/minimal `#ffffff`; neon `#111028` |
| `--cc-surface-raised` | color | color | Raised controls, hover states, scrollbar thumb, and secondary surfaces | `#1e2632` | light `#eaeef5`; terminal `#152219`; paper `#efe7da`; neon `#1a1740`; minimal `#f3f4f6` |
| `--cc-border` | color | color | Panel, bubble, input, chip, and divider border color | `rgba(255,255,255,0.09)` | light `rgba(10,20,40,0.10)`; terminal `rgba(95,255,133,0.22)`; paper `rgba(74,57,38,0.16)`; neon `rgba(114,238,255,0.22)`; minimal `#d9dee7` |
| `--cc-text` | color | color | Primary widget text color | `#eef2f8` | light `#131720`; terminal `#d8ffe2`; paper `#221d18`; neon `#f7f4ff`; minimal `#111827` |
| `--cc-text-muted` | color | color | Secondary labels, placeholders, icon buttons, and credit text | `#94a0b1` | light `#5d6b7e`; terminal `#7dbb8d`; paper `#75685a`; neon `#b8afd6`; minimal `#6b7280` |
| `--cc-accent` | color | color | Primary accent used for buttons, links, focus, and user bubbles | `#6d8bff` | terminal `#41ff7a`; paper `#2f6f73`; neon `#00e5ff`; minimal `#111827` |
| `--cc-accent-2` | color | color | Secondary accent used as the first gradient stop | `color-mix(in oklab, var(--cc-accent) 62%, #b07bff 38%)` | terminal `#d4ff4f`; paper `#c56b4c`; neon `#ff4fd8`; minimal `#4b5563` |
| `--cc-accent-ink` | color | color | Text and icon color placed on accent backgrounds | `#ffffff` | terminal `#041006`; paper `#fffdf8`; neon `#050713` |
| `--cc-bubble-user-bg` | color | color | User message bubble background | `linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent))` | same unless overridden |
| `--cc-bubble-user-text` | color | color | User message bubble text color | `var(--cc-accent-ink)` | same unless overridden |
| `--cc-bubble-agent-bg` | color | color | Assistant message bubble background | `var(--cc-surface)` | same unless overridden |
| `--cc-bubble-agent-text` | color | color | Assistant message bubble text color | `var(--cc-text)` | same unless overridden |
| `--cc-online` | color | color | Online status dot color | `#36d07a` | same unless overridden |
| `--cc-link` | color | color | Assistant message link color | `color-mix(in srgb, var(--cc-accent) 75%, #fff 25%)` | same unless overridden |
| `--cc-focus` | color | color | Input focus ring shadow | `0 0 0 3px color-mix(in srgb, var(--cc-accent) 22%, transparent)` | same unless overridden |
| `--cc-header-glow` | color | color | Radial accent wash in the panel header | `color-mix(in srgb, var(--cc-accent) 22%, transparent)` | same unless overridden |
| `--cc-hover-border` | color | color | Nudge hover border color | `color-mix(in srgb, var(--cc-accent) 50%, var(--cc-border))` | same unless overridden |
| `--cc-chip-hover-bg` | color | color | Suggestion chip hover background | `color-mix(in srgb, var(--cc-accent) 12%, var(--cc-surface-raised))` | same unless overridden |
| `--cc-credit-accent` | color | color | Accent color inside the credit line | `color-mix(in srgb, var(--cc-accent) 70%, var(--cc-text-muted))` | same unless overridden |
| `--cc-launcher-bg` | color | color | Floating launcher background | `linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent))` | same unless overridden |
| `--cc-launcher-icon-bg` | color | color | Inner launcher icon background | `rgba(255,255,255,0.16)` | same unless overridden |
| `--cc-logo-bg` | color | color | Header logo fallback background | `linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent))` | same unless overridden |
| `--cc-send-bg` | color | color | Send button background | `linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent))` | same unless overridden |
| `--cc-header-bg` | color | color | Panel header layered background | radial accent wash plus surface-to-bg gradient | same unless overridden |
| `--cc-glow` | shadow | color | Accent glow used by the launcher, logo, and pulse | `color-mix(in srgb, var(--cc-accent) 55%, transparent)` | neon uses `var(--cc-accent-2)` in the mix |
| `--cc-shadow-panel` | shadow | size | Main panel and nudge shadow | `0 28px 70px -16px rgba(0,0,0,0.62)` | light `0 24px 60px -18px rgba(20,30,60,0.28)`; paper `0 24px 54px -20px rgba(73,55,32,0.32)`; minimal `0 16px 40px -24px rgba(17,24,39,0.34)` |
| `--cc-shadow-launcher` | shadow | size | Launcher shadow including accent glow | `var(--cc-shadow-panel), 0 8px 28px -6px var(--cc-glow)` | same unless overridden |
| `--cc-shadow-launcher-hover` | shadow | size | Launcher hover shadow | `var(--cc-shadow-panel), 0 12px 34px -4px var(--cc-glow)` | same unless overridden |
| `--cc-shadow-logo` | shadow | size | Header avatar shadow | `0 6px 18px -6px var(--cc-glow)` | same unless overridden |
| `--cc-radius-panel` | radius | size | Panel corner radius | `20px` | minimal `12px` |
| `--cc-radius-bubble` | radius | size | Message bubble corner radius | `15px` | minimal `10px` |
| `--cc-radius-bubble-tail` | radius | size | Reduced radius on message tail corners | `5px` | same unless overridden |
| `--cc-radius-launcher` | radius | size | Floating launcher corner radius | `999px` | minimal `10px` |
| `--cc-radius-launcher-icon` | radius | size | Launcher icon corner radius | `50%` | same unless overridden |
| `--cc-radius-nudge` | radius | size | Nudge bubble corner radius | `16px` | same unless overridden |
| `--cc-radius-nudge-tail` | radius | size | Nudge tail corner radius | `6px` | same unless overridden |
| `--cc-radius-control` | radius | size | Input, send, and chip corner radius | `13px` | same unless overridden |
| `--cc-radius-logo` | radius | size | Header avatar corner radius | `11px` | same unless overridden |
| `--cc-font-family` | typography | font | Widget font stack | system sans stack | terminal uses mono stack |
| `--cc-font-size` | typography | size | Base message and input font size | `14px` | compact density `13px` |
| `--cc-font-size-launcher` | typography | size | Launcher label font size | `15px` | compact density `14px` |
| `--cc-font-size-nudge` | typography | size | Nudge font size | `13.5px` | compact density `12.5px` |
| `--cc-font-size-title` | typography | size | Header title font size | `14.5px` | compact density `13.5px` |
| `--cc-font-size-subtitle` | typography | size | Header subtitle font size | `11.5px` | compact density `11px` |
| `--cc-font-size-chip` | typography | size | Suggestion chip font size | `12.5px` | compact density `12px` |
| `--cc-font-size-credit` | typography | size | Credit line font size | `10.5px` | compact density `10px` |
| `--cc-font-size-logo` | typography | size | Fallback avatar letter font size | `16px` | same unless overridden |
| `--cc-font-size-logo-emoji` | typography | size | Header emoji avatar font size | `18px` | same unless overridden |
| `--cc-font-size-launcher-emoji` | typography | size | Launcher emoji font size | `22px` | same unless overridden |
| `--cc-font-size-close` | typography | size | Close button icon font size | `21px` | same unless overridden |
| `--cc-line-height` | typography | size | Base message and input line height | `1.5` | same unless overridden |
| `--cc-line-height-nudge` | typography | size | Nudge line height | `1.45` | same unless overridden |
| `--cc-line-height-title` | typography | size | Header title line height | `1.15` | same unless overridden |
| `--cc-font-weight-title` | typography | size | Header title weight | `680` | same unless overridden |
| `--cc-font-weight-launcher` | typography | size | Launcher label weight | `650` | same unless overridden |
| `--cc-font-weight-link` | typography | size | Assistant link and credit accent weight | `600` | same unless overridden |
| `--cc-letter-spacing` | typography | size | Launcher label letter spacing | `.1px` | same unless overridden |
| `--cc-space-unit` | spacing | size | Base spacing unit for derived layout measurements | `4px` | compact density `3px` |
| `--cc-border-width` | layout | size | Border width used by panels, bubbles, inputs, chips, and dividers | `1px` | same unless overridden |
| `--cc-z-index` | layout | size | Floating widget stacking level | `2147483000` | same unless overridden |
| `--cc-launcher-height` | layout | size | Launcher and round launcher diameter | `56px` | compact density `48px` |
| `--cc-launcher-icon-size` | layout | size | Inner launcher icon size | `44px` | compact density `38px` |
| `--cc-launcher-svg-size` | layout | size | Launcher SVG icon size | `24px` | same unless overridden |
| `--cc-launcher-circle-svg-size` | layout | size | Round launcher SVG icon size | `27px` | same unless overridden |
| `--cc-panel-width` | layout | size | Floating panel width | `392px` | same unless overridden |
| `--cc-panel-height` | layout | size | Floating panel height | `580px` | compact density `520px` |
| `--cc-inline-panel-height` | layout | size | Inline panel height | `540px` | compact density `500px` |
| `--cc-panel-max-width` | layout | size | Floating panel viewport max width | `calc(100vw - 32px)` | same unless overridden |
| `--cc-panel-max-height` | layout | size | Floating panel viewport max height | `calc(100vh - 120px)` | same unless overridden |
| `--cc-offset-x` | layout | size | Horizontal edge offset for floating placement | `24px` | same unless overridden |
| `--cc-offset-y` | layout | size | Vertical edge offset for floating placement | `24px` | same unless overridden |
| `--cc-motion-duration` | motion | size | Default transition and small entrance animation duration | `.2s` | same unless overridden |
| `--cc-motion-duration-panel` | motion | size | Panel entrance animation duration | `.22s` | same unless overridden |
| `--cc-motion-duration-nudge` | motion | size | Nudge entrance animation duration | `.35s` | same unless overridden |
| `--cc-motion-duration-launcher` | motion | size | Launcher entrance animation duration | `.4s` | same unless overridden |
| `--cc-motion-duration-pulse` | motion | size | Launcher attention pulse duration | `2.6s` | same unless overridden |

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
- **Reusable packet:** point `CONCIERGE_PACKET` at a versioned manifest containing a page map and optional provider metadata.

**Tips for a good brief:** write `docs` as tight, factual prose (a few hundred words). State what the product *doesn't* do, so the agent refuses confidently. Add a `LINKS:` block of real URLs — the prompt lets it share links but only ones present verbatim in the brief.

### Reusable Concierge packets

For packaging a Concierge configuration with multiple page briefs, use the versioned packet manifest. It is server-side configuration only: the browser still sends only the page id, transcript, session id, and page URL. The server validates `manifestVersion: 1`, selects the requested `pages[pageId]`, or falls back to `defaultPageId` when the page id is absent or unknown.

```jsonc
{
  "manifestVersion": 1,
  "name": "tidepool-concierge",
  "defaultPageId": "home",
  "provider": {
    "type": "venice",
    "model": "deepseek-v4-flash",
    "baseUrl": "https://api.venice.ai/api/v1"
  },
  "pages": {
    "home": {
      "brandName": "Tidepool",
      "audience": "indie founders",
      "objective": "start a trial",
      "tone": "plain",
      "cta": "Start free trial",
      "docs": "Everything the assistant may know for this page."
    }
  }
}
```

The packet `provider` block is descriptive and versioned with the manifest. Runtime credentials still come from environment variables; do not put API keys or webhook secrets in packet JSON.

### Provider adapter

Server-side model access now goes through a typed provider abstraction in `server/src/providers`. `CONCIERGE_PROVIDER` defaults to `venice`, and Venice remains the only supported adapter. That preserves the existing `VENICE_API_KEY`, `VENICE_BASE_URL`, and `VENICE_MODEL` behavior while leaving a narrow interface for future OpenAI-compatible providers. OAuth and local-agent credential paths are intentionally unsupported.

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
