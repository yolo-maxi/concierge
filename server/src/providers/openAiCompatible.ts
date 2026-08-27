import type {
  ChatProvider,
  ChatProviderConfig,
  ChatTurn,
  StreamChatOptions,
  StreamChatResult,
  ToolCall,
} from "./types.js";

export function createOpenAiCompatibleProvider(cfg: ChatProviderConfig): ChatProvider {
  return {
    name: cfg.provider,
    async streamChat(messages, onDelta, opts = {}) {
      const result = await streamChatWithToolCalls(cfg, messages, onDelta, opts);
      return result.content;
    },
    streamChatWithToolCalls(messages, onDelta, opts = {}) {
      return streamChatWithToolCalls(cfg, messages, onDelta, opts);
    },
  };
}

export async function streamChatWithToolCalls(
  cfg: ChatProviderConfig,
  messages: ChatTurn[],
  onDelta: (text: string) => void,
  opts: StreamChatOptions = {}
): Promise<StreamChatResult> {
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
      tools: opts.tools && opts.tools.length > 0 ? opts.tools : undefined,
      tool_choice: opts.tools && opts.tools.length > 0 ? "auto" : undefined,
      venice_parameters: { disable_thinking: true, strip_thinking_response: true },
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
  const toolCalls = new Map<number, ToolCall>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const result = parseStreamLine(line, toolCalls);
      if (!result) continue;
      if (result.done) return { content: full, toolCalls: [...toolCalls.values()] };
      if (result.delta) {
        full += result.delta;
        onDelta(result.delta);
      }
    }
  }

  return { content: full, toolCalls: [...toolCalls.values()] };
}

export function parseStreamLine(line: string, toolCalls = new Map<number, ToolCall>()): {
  done: boolean;
  delta?: string;
} | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return { done: true };

  try {
    const json = JSON.parse(data);
    const delta = json.choices?.[0]?.delta?.content;
    for (const item of json.choices?.[0]?.delta?.tool_calls ?? []) {
      const index = Number(item.index ?? 0);
      const existing =
        toolCalls.get(index) ??
        {
          id: item.id || `tool_${index}`,
          type: "function" as const,
          function: { name: "", arguments: "" },
        };
      if (item.id) existing.id = item.id;
      if (item.function?.name) existing.function.name += item.function.name;
      if (item.function?.arguments) existing.function.arguments += item.function.arguments;
      toolCalls.set(index, existing);
    }
    return { done: false, delta };
  } catch {
    return null;
  }
}
