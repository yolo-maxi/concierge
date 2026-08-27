/**
 * Compatibility exports for the original Venice module path.
 * New code should depend on server-side provider abstractions in ./providers.
 */

import { createOpenAiCompatibleProvider, streamChatWithToolCalls as streamOpenAiCompatible } from "./providers/openAiCompatible.js";
import { veniceConfigFromEnv } from "./providers/venice.js";
import type {
  ChatProviderConfig,
  ChatTurn,
  StreamChatOptions,
  StreamChatResult,
  ToolCall,
  ToolDefinition,
} from "./providers/index.js";

export type VeniceConfig = ChatProviderConfig;
export type { ChatTurn, StreamChatOptions, StreamChatResult, ToolCall, ToolDefinition };

export function veniceFromEnv(): VeniceConfig {
  return veniceConfigFromEnv();
}

export async function streamChat(
  cfg: VeniceConfig,
  messages: ChatTurn[],
  onDelta: (text: string) => void,
  opts: Omit<StreamChatOptions, "tools"> = {}
): Promise<string> {
  return createOpenAiCompatibleProvider(cfg).streamChat(messages, onDelta, opts);
}

export async function streamChatWithToolCalls(
  cfg: VeniceConfig,
  messages: ChatTurn[],
  onDelta: (text: string) => void,
  opts: StreamChatOptions = {}
): Promise<StreamChatResult> {
  return streamOpenAiCompatible(cfg, messages, onDelta, opts);
}
