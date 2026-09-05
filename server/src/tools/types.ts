import type { PageBrief } from "../types.js";

export type JsonSchema = Record<string, unknown>;

/**
 * How a tool touches the world.
 *
 * - `read`        — answers from data the server already holds. Safe to repeat.
 * - `side-effect` — changes something outside this process (a webhook POST, a
 *                   record written). Gated: the executor refuses the first call
 *                   and requires an explicit confirmation before it runs.
 * - `handoff`     — escalates the conversation to a human. It is itself the
 *                   handoff path the policy asks for, so it is not confirmation
 *                   gated, but it is still idempotency guarded so a retry loop
 *                   cannot page a human repeatedly.
 */
export type ToolEffect = "read" | "side-effect" | "handoff";

export interface ToolContext {
  brief: PageBrief;
  ip: string;
  pageId?: string;
  pageUrl?: string;
  sessionId?: string;
}

export interface ConciergeTool {
  name: string;
  description: string;
  schema: JsonSchema;
  /** Defaults to "side-effect" when omitted: unclassified tools are treated as dangerous. */
  effect?: ToolEffect;
  sanitizeArgs: (args: unknown) => Record<string, unknown>;
  handler: (args: unknown, ctx: ToolContext, signal: AbortSignal) => Promise<string>;
}

/** Unclassified tools are treated as side-effecting, never as read-only. */
export function toolEffect(tool: ConciergeTool): ToolEffect {
  return tool.effect ?? "side-effect";
}
