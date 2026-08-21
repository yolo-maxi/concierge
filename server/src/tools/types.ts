import type { PageBrief } from "../types.js";

export type JsonSchema = Record<string, unknown>;

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
  sanitizeArgs: (args: unknown) => Record<string, unknown>;
  handler: (args: unknown, ctx: ToolContext, signal: AbortSignal) => Promise<string>;
}
