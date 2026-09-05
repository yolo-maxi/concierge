import type { ConciergeTool, ToolContext } from "./types.js";

interface LeadArgs {
  name?: string;
  email: string;
  message?: string;
}

export const captureLeadTool: ConciergeTool = {
  name: "capture_lead",
  description: "Capture a visitor's email address and optional name/message for follow-up.",
  // POSTs the address to an external webhook: a real side effect, and one a
  // visitor must agree to before it leaves the page.
  effect: "side-effect",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["email"],
    properties: {
      name: { type: "string", maxLength: 120 },
      email: { type: "string", format: "email", maxLength: 254 },
      message: { type: "string", maxLength: 1000 },
    },
  },
  sanitizeArgs(args) {
    const parsed = parseLeadArgs(args);
    return {
      name: parsed.name,
      email: maskEmail(parsed.email),
      message: parsed.message ? parsed.message.slice(0, 160) : undefined,
    };
  },
  async handler(args: unknown, ctx: ToolContext, signal: AbortSignal): Promise<string> {
    const parsed = parseLeadArgs(args);
    const url = process.env.CONCIERGE_LEAD_WEBHOOK_URL;
    if (!url) return "I can take your email here, but follow-up is not configured yet.";

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const secret = process.env.CONCIERGE_LEAD_WEBHOOK_SECRET;
    if (secret) headers.Authorization = `Bearer ${secret}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        brand: ctx.brief.brandName,
        pageId: ctx.pageId,
        pageUrl: ctx.pageUrl,
        sessionId: ctx.sessionId,
        lead: parsed,
      }),
    });

    if (!res.ok) throw new Error("lead webhook failed");
    return "Thanks, I passed that along. A human can follow up from here.";
  },
};

function parseLeadArgs(args: unknown): LeadArgs {
  if (!args || typeof args !== "object") throw new Error("invalid lead");
  const obj = args as Record<string, unknown>;
  const email = typeof obj.email === "string" ? obj.email.trim().slice(0, 254) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid email");
  const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 120) : undefined;
  const message = typeof obj.message === "string" ? obj.message.trim().slice(0, 1000) : undefined;
  return { email, name: name || undefined, message: message || undefined };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "[redacted-email]";
  return `${local.slice(0, 2)}***@${domain}`;
}
