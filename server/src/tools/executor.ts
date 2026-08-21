import { logToolCall } from "../log.js";
import type { PageBrief } from "../types.js";
import type { ConciergeTool, ToolContext } from "./types.js";

const TOOL_WINDOW_MS = 60_000;
const TOOL_MAX_PER_WINDOW = Number(process.env.CONCIERGE_TOOL_RATE_LIMIT || 5);
const TOOL_TIMEOUT_MS = Number(process.env.CONCIERGE_TOOL_TIMEOUT_MS || 5000);

const hits = new Map<string, number[]>();

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolRunResult {
  id: string;
  name: string;
  content: string;
}

export async function runAllowedTool(
  call: ToolCallRequest,
  allowed: Map<string, ConciergeTool>,
  ctx: ToolContext
): Promise<ToolRunResult> {
  const started = Date.now();
  const tool = allowed.get(call.name);
  if (!tool) {
    await logTool(ctx, call.name, {}, "blocked", Date.now() - started);
    return { id: call.id, name: call.name, content: "That action is not available here." };
  }

  const args = parseArgs(call.arguments);
  const sanitized = safeSanitize(tool, args);
  if (rateLimited(ctx, tool.name)) {
    await logTool(ctx, tool.name, sanitized, "rate_limited", Date.now() - started);
    return { id: call.id, name: tool.name, content: "That action is temporarily rate limited. Please try again shortly." };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TOOL_TIMEOUT_MS);
  try {
    const content = await tool.handler(args, ctx, ac.signal);
    clearTimeout(timer);
    await logTool(ctx, tool.name, sanitized, "ok", Date.now() - started);
    return { id: call.id, name: tool.name, content };
  } catch (err) {
    clearTimeout(timer);
    const outcome = err instanceof Error && err.name === "AbortError" ? "timeout" : "error";
    await logTool(ctx, tool.name, sanitized, outcome, Date.now() - started);
    return { id: call.id, name: tool.name, content: "I could not complete that action, but I can still answer questions here." };
  }
}

export function toolContext(input: {
  brief: PageBrief;
  ip: string;
  pageId?: string;
  pageUrl?: string;
  sessionId?: string;
}): ToolContext {
  return input;
}

function parseArgs(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function safeSanitize(tool: ConciergeTool, args: unknown): Record<string, unknown> {
  try {
    return tool.sanitizeArgs(args);
  } catch {
    return {};
  }
}

function rateLimited(ctx: ToolContext, toolName: string): boolean {
  const key = `${ctx.ip}:${ctx.brief.brandName}:${toolName}`;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < TOOL_WINDOW_MS);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > TOOL_MAX_PER_WINDOW;
}

async function logTool(
  ctx: ToolContext,
  toolName: string,
  args: Record<string, unknown>,
  outcome: "ok" | "error" | "rate_limited" | "timeout" | "blocked",
  durationMs: number
): Promise<void> {
  await logToolCall({
    brandName: ctx.brief.brandName,
    toolName,
    args,
    outcome,
    durationMs,
    meta: {
      ip: ctx.ip,
      pageId: ctx.pageId,
      pageUrl: ctx.pageUrl,
      sessionId: ctx.sessionId,
    },
  });
}
