import { createHash } from "node:crypto";
import { logToolCall } from "../log.js";
import type { PageBrief } from "../types.js";
import { toolEffect, type ConciergeTool, type JsonSchema, type ToolContext } from "./types.js";

const TOOL_WINDOW_MS = 60_000;
const TOOL_MAX_PER_WINDOW = Number(process.env.CONCIERGE_TOOL_RATE_LIMIT || 5);
const TOOL_TIMEOUT_MS = Number(process.env.CONCIERGE_TOOL_TIMEOUT_MS || 5000);
/** How long a confirmation ticket stays answerable, and how long a completed
 * side effect stays deduplicated. Same window: a retry outside it is a new
 * intent, not a duplicate of the old one. */
const TOOL_INTENT_TTL_MS = Number(process.env.CONCIERGE_TOOL_INTENT_TTL_MS || 10 * 60_000);

const hits = new Map<string, number[]>();

/** Side-effect calls awaiting an explicit confirmation. Key -> ticket + expiry. */
const pendingConfirmations = new Map<string, { token: string; expiresAt: number }>();
/** Completed effects, so an identical repeat returns the first result instead of running again. */
const completedEffects = new Map<string, { content: string; expiresAt: number }>();

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

/**
 * The parameter schema advertised to the model.
 *
 * Confirmation-gated tools must be able to carry the ticket back, so the
 * `confirm` property is added to their advertised schema. It is added here
 * rather than in each tool so a tool author cannot forget it, and so tools
 * stay unaware of the gate.
 */
export function toolParameterSchema(tool: ConciergeTool): JsonSchema {
  if (toolEffect(tool) !== "side-effect") return tool.schema;
  const base = tool.schema && typeof tool.schema === "object" ? tool.schema : {};
  const properties = (base as { properties?: Record<string, unknown> }).properties ?? {};
  return {
    ...base,
    properties: {
      ...properties,
      confirm: {
        type: "string",
        description:
          "Confirmation ticket. Omit on the first call; the tool will return a ticket to show the visitor. Only send it back after the visitor has explicitly agreed.",
      },
    },
  };
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

  const effect = toolEffect(tool);
  const intentKey = effect === "read" ? null : effectKey(ctx, tool.name, args);

  // Idempotency: an identical effect already carried out in this window is not
  // repeated. Providers retry, models re-emit, visitors double-tap.
  if (intentKey) {
    const done = liveEntry(completedEffects, intentKey);
    if (done) {
      await logTool(ctx, tool.name, sanitized, "duplicate", Date.now() - started);
      return { id: call.id, name: tool.name, content: done.content };
    }
  }

  if (effect === "side-effect" && intentKey) {
    const supplied = confirmationToken(args);
    const pending = liveEntry(pendingConfirmations, intentKey);
    if (!supplied || !pending || supplied !== pending.token) {
      const ticket = pending?.token ?? randomTicket();
      pendingConfirmations.set(intentKey, { token: ticket, expiresAt: Date.now() + TOOL_INTENT_TTL_MS });
      await logTool(ctx, tool.name, sanitized, "confirmation_required", Date.now() - started);
      return {
        id: call.id,
        name: tool.name,
        content:
          `This action changes something outside this page, so it needs the visitor's explicit go-ahead first. ` +
          `Ask them to confirm in plain words, and only if they agree call ${tool.name} again with the same arguments plus confirm: "${ticket}".`,
      };
    }
    pendingConfirmations.delete(intentKey);
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TOOL_TIMEOUT_MS);
  try {
    const content = await tool.handler(args, ctx, ac.signal);
    clearTimeout(timer);
    if (intentKey) completedEffects.set(intentKey, { content, expiresAt: Date.now() + TOOL_INTENT_TTL_MS });
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

function confirmationToken(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const value = (args as Record<string, unknown>).confirm;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Identity of an intent: same caller, same tool, same meaningful arguments.
 * `confirm` is excluded so the confirming call resolves to the same intent as
 * the call that asked for confirmation.
 */
function effectKey(ctx: ToolContext, toolName: string, args: unknown): string {
  const caller = ctx.sessionId || ctx.ip;
  const material = args && typeof args === "object" ? { ...(args as Record<string, unknown>) } : {};
  delete material.confirm;
  const digest = createHash("sha256").update(stableStringify(material)).digest("hex").slice(0, 32);
  return `${caller}:${ctx.brief.brandName}:${toolName}:${digest}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

function randomTicket(): string {
  return createHash("sha256")
    .update(`${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
}

function liveEntry<T extends { expiresAt: number }>(store: Map<string, T>, key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

/** Test seam: drop confirmation tickets and dedup records between cases. */
export function resetToolEffectState(): void {
  pendingConfirmations.clear();
  completedEffects.clear();
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
  outcome: "ok" | "error" | "rate_limited" | "timeout" | "blocked" | "confirmation_required" | "duplicate",
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
