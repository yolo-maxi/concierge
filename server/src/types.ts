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

export interface RetrievalCapability {
  source: "inline" | "url";
  /** Inline corpus documents. Only used when source is "inline". */
  docs?: string[];
  /** Boot-time corpus URL. Only used when source is "url"; never fetched per request. */
  url?: string;
  /** Optional pre-split chunks. If omitted, docs/url content is chunked at boot. */
  chunks?: string[];
  /** Number of chunks to inject per turn. */
  topK?: number;
  /** Hard cap on total retrieved context injected into the prompt. */
  maxInjectedChars?: number;
}

export interface BriefCapabilities {
  retrieval?: RetrievalCapability;
  /** Allowlist of server-defined tool names. */
  tools?: string[];
  /**
   * Opt-in generative UI. Off by default: a page that does not ask for it is
   * never offered the render_ui tool, so its stream stays text-and-tools only
   * and no component can appear.
   */
  ui?: boolean;
}

export interface PageBrief {
  /** Brand / product name the assistant represents. */
  brandName: string;
  /** Who the visitor is. Shapes register, not content. */
  audience: string;
  /** What this page is trying to get the visitor to do. */
  objective: string;
  /** Voice/tone descriptor, e.g. "confident, plain-spoken, a little playful". */
  tone: string;
  /** The call-to-action label, e.g. "Start free trial". */
  cta: string;
  /** Digested, agent-readable knowledge base. The default single source of truth. */
  docs: string;
  /** Optional server-side capability packs loaded only from CONCIERGE_BRIEF(S). */
  capabilities?: BriefCapabilities;
}
