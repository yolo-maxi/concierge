/**
 * Stateless conversation logging.
 *
 * Every completed turn is pushed to a Telegram chat, fire-and-forget. No DB,
 * no retention on the server. Logging is enabled only when both
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set; otherwise it silently
 * no-ops so local dev keeps working. Set TELEGRAM_THREAD_ID to target a
 * specific forum topic. Pin these in the deployment env so logs always land
 * in one place.
 */

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
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const threadId = process.env.TELEGRAM_THREAD_ID
    ? Number(process.env.TELEGRAM_THREAD_ID)
    : undefined;

  const emoji = emojiFor(turn.meta?.sessionId);

  // Always lead with WHICH PAGE the question came from, plus the session emoji.
  const where = turn.meta?.pageId ? `${turn.brandName} · ${turn.meta.pageId}` : turn.brandName;
  const header = `${emoji} <b>${escapeHtml(where)}</b>`;
  const fromLine = turn.meta?.pageUrl ? `\n<i>from ${escapeHtml(turn.meta.pageUrl)}</i>` : "";

  // The visitor's question goes in a blockquote so it's instantly clear what
  // they wrote; the agent's reply follows underneath.
  const text =
    `${header}${fromLine}\n` +
    `<blockquote>${escapeHtml(turn.question)}</blockquote>\n` +
    `${escapeHtml(turn.answer)}`;

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
