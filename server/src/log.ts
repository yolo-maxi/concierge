/**
 * Stateless conversation logging via pluggable sinks.
 *
 * Each completed turn becomes a structured event that is fanned out to every
 * configured sink, fire-and-forget. No DB, no retention on the server. If no
 * sink is configured, logging silently no-ops so local dev keeps working.
 *
 * Built-in sinks (enable by env):
 *   - webhook : POST the event as JSON to your own backend  (CONCIERGE_WEBHOOK_URL)
 *   - telegram: push a formatted message to a chat/topic     (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
 *   - console : write one JSON line to stdout                (CONCIERGE_LOG_CONSOLE=1)
 *
 * Adding your own sink is a few lines — push a function into SINKS below.
 */

// Stable emoji palette — a visitor's session always maps to the same emoji so
// a single conversation is easy to follow across turns.
const SESSION_EMOJI = [
  "🦊", "🐙", "🦉", "🐝", "🦋", "🐳", "🦀", "🐢", "🦜", "🦝",
  "🐸", "🦔", "🦓", "🦌", "🐯", "🦒", "🐼", "🦅", "🦩", "🐺",
  "🍄", "🌵", "🌊", "⚡", "🔮", "🎲", "🧩", "🪐", "🛰️", "🗿",
  "🔥", "❄️", "🌙", "⭐", "🍀", "🌶️", "🍒", "🥑", "🧊", "🎯",
];

function emojiFor(sessionId?: string): string {
  if (!sessionId) return "👤";
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) {
    h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return SESSION_EMOJI[h % SESSION_EMOJI.length];
}

export interface LogTurn {
  brandName: string;
  question: string;
  answer: string;
  meta?: {
    ip?: string;
    pageId?: string;
    sessionId?: string;
    pageUrl?: string;
  };
}

/** The normalized event every sink receives. */
export interface ConciergeEvent {
  type: "concierge.turn";
  at: string;
  brand: string;
  pageId?: string;
  pageUrl?: string;
  sessionId?: string;
  /** Stable per-session emoji (handy for grouping in a feed). */
  emoji: string;
  question: string;
  answer: string;
  ip?: string;
}

type Sink = (e: ConciergeEvent) => Promise<void>;

/** POST the raw event JSON to your own backend. The simplest, most flexible sink. */
const webhookSink: Sink = async (e) => {
  const url = process.env.CONCIERGE_WEBHOOK_URL;
  if (!url) return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.CONCIERGE_WEBHOOK_SECRET;
  if (secret) headers["Authorization"] = `Bearer ${secret}`;
  await fetch(url, { method: "POST", headers, body: JSON.stringify(e) });
};

/** One JSON line per turn on stdout — pipe it anywhere (files, vector, etc.). */
const consoleSink: Sink = async (e) => {
  if (process.env.CONCIERGE_LOG_CONSOLE !== "1") return;
  console.log(JSON.stringify(e));
};

/** Formatted Telegram message to a chat/topic. */
const telegramSink: Sink = async (e) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const threadId = process.env.TELEGRAM_THREAD_ID ? Number(process.env.TELEGRAM_THREAD_ID) : undefined;

  const where = e.pageId ? `${e.brand} · ${e.pageId}` : e.brand;
  const header = `${e.emoji} <b>${escapeHtml(where)}</b>`;
  const fromLine = e.pageUrl ? `\n<i>from ${escapeHtml(e.pageUrl)}</i>` : "";
  const text =
    `${header}${fromLine}\n` +
    `<blockquote>${escapeHtml(e.question)}</blockquote>\n` +
    `${escapeHtml(e.answer)}`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: threadId,
      text: text.slice(0, 4000),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
};

const SINKS: Sink[] = [webhookSink, telegramSink, consoleSink];

export async function logConversation(turn: LogTurn): Promise<void> {
  const event: ConciergeEvent = {
    type: "concierge.turn",
    at: new Date().toISOString(),
    brand: turn.brandName,
    pageId: turn.meta?.pageId,
    pageUrl: turn.meta?.pageUrl,
    sessionId: turn.meta?.sessionId,
    emoji: emojiFor(turn.meta?.sessionId),
    question: turn.question,
    answer: turn.answer,
    ip: turn.meta?.ip,
  };
  // Each sink is isolated — one failing (or being unconfigured) never affects
  // the others, and logging never breaks a reply.
  await Promise.allSettled(SINKS.map((sink) => sink(event)));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
