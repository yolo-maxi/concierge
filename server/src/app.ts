import express from "express";
import cors from "cors";
import { buildSystemPrompt } from "./prompt.js";
import { getBrief, getConfiguredProviderDefaults } from "./config.js";
import { selectRetrievedContext } from "./retrieval.js";
import { chatProviderFromEnv, type ChatProvider, type ChatTurn, type ToolDefinition } from "./providers/index.js";
import { logConversation } from "./log.js";
import type { ChatRequestBody, ChatMessage } from "./types.js";
import { getAllowedTools } from "./tools/registry.js";
import { runAllowedTool, toolContext, toolParameterSchema } from "./tools/executor.js";
import { handleUiCall, uiToolDefinition, UI_TOOL_NAME } from "./ui/tool.js";
import {
  createRuntime,
  enforceRateLimits,
  providerWithCircuit,
  requestGate,
  writeHttpError,
  type Runtime,
} from "./runtime.js";

const MAX_MESSAGES = 24;
const MAX_CHARS = 2000;
const MAX_TOOL_DEPTH = Number(process.env.CONCIERGE_TOOL_MAX_DEPTH || 2);

export interface ConciergeAppOptions {
  env?: NodeJS.ProcessEnv;
  runtime?: Runtime;
  providerFactory?: () => ChatProvider;
}

export function createConciergeApp(options: ConciergeAppOptions = {}) {
  const env = options.env ?? process.env;
  const runtime = options.runtime ?? createRuntime();
  const providerFactory =
    options.providerFactory ?? (() => chatProviderFromEnv(env, getConfiguredProviderDefaults()));

  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) || true,
    })
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ...runtime.state() });
  });

  app.get("/ready", (_req, res) => {
    const state = runtime.state();
    const queueSaturated = state.queue.active >= state.queue.maxConcurrent && state.queue.queued >= state.queue.maxQueueDepth;
    const ready = !queueSaturated && state.circuit.state !== "open";
    res.status(ready ? 200 : 503).json({ ok: ready, ...state });
  });

  const embedPath = env.CONCIERGE_EMBED_FILE;
  if (embedPath) {
    app.get("/embed.js", (_req, res) => {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.sendFile(embedPath);
    });
  }

  app.post("/chat", requestGate(runtime), async (req, res) => {
    const ip = clientIp(req);
    const body = req.body as ChatRequestBody;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 64) : undefined;
    const rateError = enforceRateLimits(runtime, ip, sessionId);
    if (rateError) {
      writeHttpError(res, rateError);
      return;
    }

    const incoming = Array.isArray(body?.messages) ? body.messages : [];
    const clean: ChatMessage[] = incoming
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
      .slice(-MAX_MESSAGES);

    if (clean.length === 0 || clean[clean.length - 1].role !== "user") {
      res.status(400).json({ error: "Expected a trailing user message.", code: "bad_request" });
      return;
    }

    let brief;
    try {
      brief = getBrief(body.pageId);
    } catch {
      res.status(500).json({ error: "Page not configured.", code: "page_not_configured" });
      return;
    }

    const state = runtime.state();
    if (state.circuit.state === "open") {
      res.status(503).json({
        error: "The upstream provider is temporarily unavailable.",
        code: "provider_circuit_open",
        detail: state.circuit,
      });
      return;
    }

    const retrievedContext = await selectRetrievedContext(brief, clean[clean.length - 1].content);
    const turns: ChatTurn[] = [
      { role: "system", content: buildSystemPrompt(brief, retrievedContext) },
      ...clean,
    ];
    const allowedTools = getAllowedTools(brief.capabilities?.tools);
    const toolMap = new Map(allowedTools.map((tool) => [tool.name, tool]));
    const allowedToolNames = allowedTools.map((tool) => tool.name);
    const toolDefinitions: ToolDefinition[] = allowedTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: toolParameterSchema(tool),
      },
    }));
    // Generative UI is opt-in per page. When it is off, render_ui is not
    // advertised at all, so the model has no name to call and the stream
    // carries text and tool results only.
    const uiEnabled = brief.capabilities?.ui === true;
    if (uiEnabled) toolDefinitions.push(uiToolDefinition() as ToolDefinition);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const requestSignal = res.locals.conciergeAbortSignal as AbortSignal | undefined;
    const question = clean[clean.length - 1].content;
    let finished = false;

    try {
      const provider = providerWithCircuit(providerFactory(), runtime);
      let full = "";
      if (toolDefinitions.length === 0) {
        full = await provider.streamChat(
          turns,
          (delta) => res.write(`data: ${JSON.stringify({ delta })}\n\n`),
          { signal: requestSignal }
        );
      } else {
        const ctx = toolContext({
          brief,
          ip,
          pageId: body.pageId,
          sessionId,
          pageUrl: typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 300) : undefined,
        });
        for (let depth = 0; depth <= MAX_TOOL_DEPTH; depth++) {
          const result = await provider.streamChatWithToolCalls(
            turns,
            (delta) => res.write(`data: ${JSON.stringify({ delta })}\n\n`),
            { signal: requestSignal, tools: toolDefinitions }
          );
          full += result.content;
          if (result.toolCalls.length === 0) break;
          if (depth === MAX_TOOL_DEPTH) {
            const fallback = full
              ? "\n\nI can keep helping from the information on this page."
              : "I can keep helping from the information on this page.";
            full += fallback;
            res.write(`data: ${JSON.stringify({ delta: fallback })}\n\n`);
            break;
          }

          turns.push({ role: "assistant", content: result.content, tool_calls: result.toolCalls });
          for (const call of result.toolCalls) {
            // render_ui is handled here, not in the tool executor: its output is
            // a stream event for the visitor, not a message the model acts on.
            // It also never reaches runAllowedTool, so a page cannot allowlist
            // it as a capability and it cannot be confirmation-gated or
            // rate-limited as if it changed something. It changes nothing.
            if (uiEnabled && call.function.name === UI_TOOL_NAME) {
              const outcome = handleUiCall(call.function.arguments, allowedToolNames);
              if (outcome.event) {
                res.write(`data: ${JSON.stringify({ ui: outcome.event })}\n\n`);
                // The text fallback joins the transcript, so the logged answer
                // and any non-rendering client both still read coherently.
                full += (full ? "\n\n" : "") + outcome.event.text;
              }
              turns.push({ role: "tool", tool_call_id: call.id, content: outcome.toolMessage });
              continue;
            }

            const toolResult = await runAllowedTool(
              {
                id: call.id,
                name: call.function.name,
                arguments: call.function.arguments,
              },
              toolMap,
              ctx
            );
            turns.push({
              role: "tool",
              tool_call_id: toolResult.id,
              content: toolResult.content,
            });
          }
        }
      }
      finished = true;
      res.write("data: [DONE]\n\n");
      res.end();

      void logConversation({
        brandName: brief.brandName,
        question,
        answer: full,
        meta: {
          ip,
          pageId: body.pageId,
          sessionId,
          pageUrl: typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 300) : undefined,
        },
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      const message = requestSignal?.aborted ? "Request cancelled or timed out." : "Sorry, I hit a snag. Try again?";
      const code = requestSignal?.aborted ? "request_aborted" : "upstream_error";
      if (!res.headersSent) {
        res.status(requestSignal?.aborted ? 504 : 502).json({ error: message, code, detail: { errorName: name } });
      } else if (!finished) {
        res.write(`data: ${JSON.stringify({ error: message, code, detail: { errorName: name } })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
      console.error("[concierge] chat error:", name);
    }
  });

  return app;
}

function clientIp(req: express.Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}
