export const failureMessages = {
  provider_exhausted: "The chat provider allowance is exhausted. Chat is paused until the owner restores access.",
  provider_auth: "The chat provider needs owner attention. Chat is paused.",
  provider_rate_limited: "The chat provider is rate limited. Please wait before sending another message.",
  provider_refused: "The chat provider refused this request.",
  provider_failure: "The chat provider could not complete this reply. No automatic retry was made.",
} as const;
export type FailureCode = keyof typeof failureMessages;
export class ProviderFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(failureMessages[code]);
    this.name = "ProviderFailure";
  }
}
export function failureForStatus(status: number): ProviderFailure {
  return new ProviderFailure(status === 402 ? "provider_exhausted"
    : status === 401 || status === 403 ? "provider_auth"
    : status === 429 ? "provider_rate_limited"
    : status >= 400 && status < 500 ? "provider_refused" : "provider_failure");
}
