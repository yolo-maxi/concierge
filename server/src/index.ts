import express from "express";
import cors from "cors";
import { buildSystemPrompt } from "./prompt.js";
import { getBrief } from "./config.js";
import { streamChat, veniceFromEnv, type ChatTurn } from "./venice.js";
import { logToTelegram } from "./log.js";
import type { ChatRequestBody, ChatMessage } from "./types.js";

const PORT = Number(process.env.PORT || 8787);
const MAX_MESSAGES = 24; // conversation depth cap
const MAX_CHARS = 2000; // per-message input cap

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) || true,
  })
);

// --- crude in-memory rate limit (per IP, sliding window) ---
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = Number(process.env.RATE_LIMIT || 20);
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/chat", async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
  if (rateLimited(ip)) {
    res.status(429).json({ error: "Too many requests. Slow down a moment." });
    return;
  }

  const body = req.body as ChatRequestBody;
  const incoming = Array.isArray(body?.messages) ? body.messages : [];

  // Sanitize: accept only user/assistant turns, drop any client-supplied
  // system role, enforce caps. The system prompt is built server-side only.
  const clean: ChatMessage[] = incoming
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_MESSAGES);

  if (clean.length === 0 || clean[clean.length - 1].role !== "user") {
    res.status(400).json({ error: "Expected a trailing user message." });
    return;
  }

  let brief;
  try {
    brief = getBrief(body.pageId);
  } catch (e) {
    res.status(500).json({ error: "Page not configured." });
    return;
  }

  const turns: ChatTurn[] = [
    { role: "system", content: buildSystemPrompt(brief) },
    ...clean,
  ];

  // Server-Sent Events stream back to the widget.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const ac = new AbortController();
  let finished = false;
  // Abort the upstream only if the client really hangs up mid-stream.
  res.on("close", () => {
    if (!finished) ac.abort();
  });

  const question = clean[clean.length - 1].content;

  try {
    const full = await streamChat(
      veniceFromEnv(),
      turns,
      (delta) => res.write(`data: ${JSON.stringify({ delta })}\n\n`),
      { signal: ac.signal }
    );
    finished = true;
    res.write("data: [DONE]\n\n");
    res.end();

    // fire-and-forget log
    void logToTelegram({
      brandName: brief.brandName,
      question,
      answer: full,
      meta: {
        ip,
        pageId: body.pageId,
        sessionId: typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : undefined,
        pageUrl: typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 300) : undefined,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "stream failed";
    if (!res.headersSent) {
      res.status(502).json({ error: "Upstream error." });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Sorry — I hit a snag. Try again?" })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
    console.error("[concierge] chat error:", msg);
  }
});

app.listen(PORT, () => {
  console.log(`🪸 concierge server on :${PORT}`);
});
