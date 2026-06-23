export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestBody {
  /** Conversation so far. Only user/assistant turns are accepted. */
  messages: ChatMessage[];
  /** Optional page id to select a brief when the server hosts several. */
  pageId?: string;
  /** Stable per-visitor session id (set by the widget). Drives the log emoji. */
  sessionId?: string;
  /** URL of the page the question was asked from. Logged for context. */
  pageUrl?: string;
}
