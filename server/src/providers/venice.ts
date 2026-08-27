import { createOpenAiCompatibleProvider } from "./openAiCompatible.js";
import type { ChatProvider, ChatProviderConfig } from "./types.js";

export function veniceConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  defaults: Partial<Pick<ChatProviderConfig, "baseUrl" | "model">> = {}
): ChatProviderConfig {
  const apiKey = env.VENICE_API_KEY;
  if (!apiKey) throw new Error("VENICE_API_KEY is not set");
  return {
    provider: "venice",
    baseUrl: env.VENICE_BASE_URL || defaults.baseUrl || "https://api.venice.ai/api/v1",
    apiKey,
    model: env.VENICE_MODEL || defaults.model || "deepseek-v4-flash",
  };
}

export function veniceProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  defaults: Partial<Pick<ChatProviderConfig, "baseUrl" | "model">> = {}
): ChatProvider {
  return createOpenAiCompatibleProvider(veniceConfigFromEnv(env, defaults));
}
