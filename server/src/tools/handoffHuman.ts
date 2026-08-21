import { logToolCall } from "../log.js";
import type { ConciergeTool, ToolContext } from "./types.js";

export const handoffHumanTool: ConciergeTool = {
  name: "handoff_human",
  description: "Request urgent human attention for the current visitor conversation.",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: { type: "string", maxLength: 500 },
    },
  },
  sanitizeArgs(args) {
    const reason = args && typeof args === "object" && typeof (args as Record<string, unknown>).reason === "string"
      ? (args as Record<string, string>).reason.slice(0, 200)
      : undefined;
    return { reason };
  },
  async handler(args: unknown, ctx: ToolContext): Promise<string> {
    const reason = args && typeof args === "object" && typeof (args as Record<string, unknown>).reason === "string"
      ? (args as Record<string, string>).reason.slice(0, 500)
      : undefined;

    await logToolCall({
      brandName: ctx.brief.brandName,
      toolName: "handoff_human.priority_event",
      args: { reason },
      outcome: "ok",
      durationMs: 0,
      meta: {
        ip: ctx.ip,
        pageId: ctx.pageId,
        pageUrl: ctx.pageUrl,
        sessionId: ctx.sessionId,
      },
    });

    return "I flagged this for a human. Someone from the team can take it from here.";
  },
};
