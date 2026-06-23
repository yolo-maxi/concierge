export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestBody {
  /** Conversation so far. Only user/assistant turns are accepted. */
  messages: ChatMessage[];
  /** Optional page id to select a brief when the server hosts several. */
  pageId?: string;
}
