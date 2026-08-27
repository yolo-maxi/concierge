export interface ChatProviderConfig {
  provider: "venice";
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatTurn {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface StreamChatOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
}

export interface StreamChatResult {
  content: string;
  toolCalls: ToolCall[];
}

export interface ChatProvider {
  readonly name: ChatProviderConfig["provider"];
  streamChat(
    messages: ChatTurn[],
    onDelta: (text: string) => void,
    opts?: StreamChatOptions
  ): Promise<string>;
  streamChatWithToolCalls(
    messages: ChatTurn[],
    onDelta: (text: string) => void,
    opts?: StreamChatOptions
  ): Promise<StreamChatResult>;
}
