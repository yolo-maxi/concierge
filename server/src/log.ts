/**
 * Stateless conversation logging.
 *
 * Every completed turn is pushed to a Telegram chat, fire-and-forget. No DB,
 * no retention on the server. If the env vars are missing, logging silently
 * no-ops so local dev keeps working.
 */

interface LogTurn {
  brandName: string;
  question: string;
  answer: string;
  meta?: { ip?: string; pageId?: string; refused?: boolean };
}

export async function logToTelegram(turn: LogTurn): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const threadId = process.env.TELEGRAM_THREAD_ID;
  const tag = turn.meta?.pageId ? ` · ${turn.meta.pageId}` : "";
  const text =
    `💬 <b>${escapeHtml(turn.brandName)}</b>${escapeHtml(tag)}\n\n` +
    `<b>Q:</b> ${escapeHtml(turn.question)}\n` +
    `<b>A:</b> ${escapeHtml(turn.answer)}`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: threadId ? Number(threadId) : undefined,
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
