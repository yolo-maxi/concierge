import { veniceProviderFromEnv } from "./venice.js";
import type { ChatProvider, ChatProviderConfig } from "./types.js";

export function chatProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  defaults: Partial<ChatProviderConfig> = {}
): ChatProvider {
  const provider = env.CONCIERGE_PROVIDER || defaults.provider || "venice";
  if (provider !== "venice") {
    throw new Error(`Unsupported CONCIERGE_PROVIDER="${provider}". Only "venice" is currently supported.`);
  }
  return veniceProviderFromEnv(env, defaults);
}

export type {
  ChatProvider,
  ChatProviderConfig,
  ChatTurn,
  StreamChatOptions,
  StreamChatResult,
  ToolCall,
  ToolDefinition,
} from "./types.js";
