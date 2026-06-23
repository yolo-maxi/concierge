/**
 * Minimal OpenAI-compatible streaming client, pointed at Venice.
 * No SDK dependency — just fetch + SSE parsing.
 */

export interface VeniceConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export function veniceFromEnv(): VeniceConfig {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) throw new Error("VENICE_API_KEY is not set");
  return {
    baseUrl: process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1",
    apiKey,
    model: process.env.VENICE_MODEL || "deepseek-v4-flash",
  };
}

/**
 * Streams completion token deltas. Calls onDelta for each chunk of text.
 * Returns the full accumulated text once the stream ends.
 */
export async function streamChat(
  cfg: VeniceConfig,
  messages: ChatTurn[],
  onDelta: (text: string) => void,
  opts: { signal?: AbortSignal; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    signal: opts.signal,
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 600,
      messages,
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Venice error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return full;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // ignore keep-alive / partial frames
      }
    }
  }
  return full;
}
