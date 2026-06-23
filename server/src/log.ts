/**
 * Stateless conversation logging.
 *
 * Every completed turn is pushed to a Telegram chat, fire-and-forget. No DB,
 * no retention on the server. If the bot token is missing, logging silently
 * no-ops so local dev keeps working.
 *
 * The destination is HARDCODED: all concierge logs go to one place so they're
 * never mis-routed. The bot identity (token) is the only thing that comes from
 * the environment.
 */

// Where every concierge conversation is logged. Always this chat + topic.
const LOG_CHAT_ID = "-1003850294102";
const LOG_THREAD_ID = 29273;

// Stable emoji palette — a visitor's session always maps to the same emoji so
// a single conversation is easy to follow when the topic gets crowded.
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

interface LogTurn {
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

export async function logToTelegram(turn: LogTurn): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const chatId = process.env.TELEGRAM_CHAT_ID || LOG_CHAT_ID;
  const threadId = process.env.TELEGRAM_THREAD_ID
    ? Number(process.env.TELEGRAM_THREAD_ID)
    : LOG_THREAD_ID;

  const emoji = emojiFor(turn.meta?.sessionId);

  // Always lead with WHICH PAGE the question came from, plus the session emoji.
  const where = turn.meta?.pageId ? `${turn.brandName} · ${turn.meta.pageId}` : turn.brandName;
  const header = `${emoji} <b>${escapeHtml(where)}</b>`;
  const fromLine = turn.meta?.pageUrl ? `\n<i>from ${escapeHtml(turn.meta.pageUrl)}</i>` : "";

  const text =
    `${header}${fromLine}\n\n` +
    `<b>Q:</b> ${escapeHtml(turn.question)}\n` +
    `<b>A:</b> ${escapeHtml(turn.answer)}`;

  try {
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
  } catch {
    // logging must never break a reply
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
