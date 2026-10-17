const messages: Record<string, string> = {
  budget_exhausted: "The chat usage limit has been reached. Please return after the usage period resets.",
  budget_unavailable: "Chat usage controls are unavailable. Chat is paused.",
  alert_unconfirmed: "Chat is paused while the owner notification is checked.",
  provider_exhausted: "The chat provider allowance is exhausted. Chat is paused until the owner restores access.",
  provider_auth: "The chat provider needs owner attention. Chat is paused.",
  provider_rate_limited: "The chat provider is rate limited. Please wait before sending another message.",
  provider_circuit_open: "The chat provider is temporarily unavailable.",
  provider_refused: "The chat provider refused this request.",
  provider_failure: "The chat provider could not complete this reply. No automatic retry was made.",
  rate_limited_ip: "Too many chat requests. Please wait before sending another message.",
  rate_limited_session: "Too many chat requests. Please wait before sending another message.",
  origin_denied: "Chat is not available from this site.",
};
export class ChatHttpFailure extends Error {}
export async function readHttpFailure(response: Response): Promise<ChatHttpFailure> {
  const body = await response.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  return new ChatHttpFailure(Object.prototype.hasOwnProperty.call(messages, code) ? messages[code] : "Chat is temporarily unavailable.");
}
