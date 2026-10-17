import type { Alert } from "./budget.js";

// Reuse the existing private service logging destination. Never accept a caller destination.
export function operationsAlertSender(env: NodeJS.ProcessEnv, controlledTest = false) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !env.TELEGRAM_THREAD_ID)
    throw new Error("Private operations alert route is not configured");
  return async (alert: Alert): Promise<void> => {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, message_thread_id: Number(env.TELEGRAM_THREAD_ID),
        text: `${controlledTest ? "CONTROLLED TEST. No provider call was made. " : ""}Concierge operations: ${alert.event}. Provider: Venice. Period: ${new Date(alert.periodStart).toISOString()}. Reserved calls: ${alert.requests}. Reserved volume: ${alert.volume}.`,
        disable_web_page_preview: true }),
    });
    const result = await response.json().catch(() => null) as { ok?: boolean } | null;
    if (!response.ok || result?.ok !== true) throw new Error("Owner alert delivery failed");
  };
}
