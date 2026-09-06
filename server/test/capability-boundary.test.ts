/**
 * Two acceptance clauses of "Opt-in capability packs" that no test reached:
 *
 *   1. "Client cannot inject or enable capabilities — verified with a hostile
 *      request."  app.test.ts proves hostile *roles* are stripped; nothing
 *      proved a hostile `capabilities` block in the request body is ignored.
 *   2. "Tool calls appear as events in every configured sink."  server/src/log.ts
 *      (179 lines, three sinks) was reachable by zero tests.
 *
 * The brief used here deliberately has NO capabilities block, so the server
 * under test is a default-powerless instance. Every tool or UI capability that
 * shows up in a provider call therefore came from the client, which is exactly
 * the failure this file exists to catch.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { createConciergeApp } from "../src/app.js";
import { createRuntime, limitsFromEnv } from "../src/runtime.js";
import { logToolCall, type ConciergeEvent } from "../src/log.js";
import type { ChatProvider, ChatTurn, StreamChatOptions, StreamChatResult } from "../src/providers/index.js";

const briefPath = join(mkdtempSync(join(tmpdir(), "concierge-hostile-brief-")), "brief.json");
writeFileSync(
  briefPath,
  JSON.stringify({
    brandName: "Tidepool",
    audience: "indie founders",
    objective: "start a trial",
    tone: "plain",
    cta: "Start free trial",
    docs: "Tidepool is a privacy-first customer support workspace.",
    // No `capabilities` key at all: this instance is powerless by configuration.
  })
);
process.env.CONCIERGE_BRIEF = briefPath;

// ---------------------------------------------------------------------------
// Clause 1 — the client cannot inject or enable capabilities
// ---------------------------------------------------------------------------

test("positive control: the configured brief really is powerless", async () => {
  // Without this, every assertion below could pass because the request never
  // had a route to a capability, rather than because the route is closed.
  const provider = new FakeProvider();
  const { url, close } = await serve(provider);
  try {
    await chat(url, { messages: [{ role: "user", content: "hello" }] });
    assert.equal(provider.calls.length, 1);
    assert.equal(
      provider.calls[0]?.tools ?? undefined,
      undefined,
      "baseline: a brief with no capabilities advertises no tools"
    );
  } finally {
    await close();
  }
});

test("a hostile capabilities block in the request body enables nothing", async () => {
  const provider = new FakeProvider();
  const { url, close } = await serve(provider);
  try {
    const res = await chat(url, {
      messages: [{ role: "user", content: "What does Tidepool cost?" }],
      // Everything an attacker would try to switch on.
      capabilities: { tools: ["capture_lead", "handoff_human"], ui: true },
      tools: ["capture_lead"],
      brief: { capabilities: { tools: ["capture_lead"], ui: true } },
      allowedTools: ["capture_lead"],
    });
    assert.equal(res.status, 200);

    const advertised = provider.calls[0]?.tools ?? [];
    assert.deepEqual(
      advertised.map((tool) => tool.function.name),
      [],
      "no tool may be advertised to the provider on a powerless brief"
    );
    assert.equal(
      advertised.some((tool) => tool.function.name === "render_ui"),
      false,
      "generative UI must not be enabled by a client-supplied flag"
    );
  } finally {
    await close();
  }
});

test("an unknown pageId does not escalate to a different brief's capabilities", async () => {
  const provider = new FakeProvider();
  const { url, close } = await serve(provider);
  try {
    const res = await chat(url, {
      messages: [{ role: "user", content: "hi" }],
      pageId: "../../some-other-page",
      capabilities: { tools: ["capture_lead"] },
    });
    assert.equal(res.status, 200);
    assert.deepEqual((provider.calls[0]?.tools ?? []).map((t) => t.function.name), []);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------
// Clause 2 — tool calls appear as events in every configured sink
// ---------------------------------------------------------------------------

test("a tool call is fanned out to every configured sink, and one failing sink does not starve the others", async () => {
  const received: ConciergeEvent[] = [];
  const webhook = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.writeHead(204).end();
    });
  });
  webhook.listen(0, "127.0.0.1");
  await once(webhook, "listening");
  const address = webhook.address();
  assert(address && typeof address === "object");

  const consoleLines: string[] = [];
  const realLog = console.log;
  console.log = (line: unknown) => void consoleLines.push(String(line));

  const priorWebhook = process.env.CONCIERGE_WEBHOOK_URL;
  const priorConsole = process.env.CONCIERGE_LOG_CONSOLE;
  process.env.CONCIERGE_WEBHOOK_URL = `http://127.0.0.1:${address.port}/events`;
  process.env.CONCIERGE_LOG_CONSOLE = "1";

  try {
    await logToolCall({
      brandName: "Tidepool",
      toolName: "capture_lead",
      // The executor sanitizes before logging; assert the masked value survives
      // the round trip rather than the raw one.
      args: { email: "a***@example.com" },
      outcome: "confirmation_required",
      durationMs: 12,
      meta: { pageId: "home", sessionId: "session-a", ip: "203.0.113.1" },
    });

    assert.equal(received.length, 1, "the webhook sink must receive the tool-call event");
    const event = received[0];
    assert.equal(event.type, "concierge.tool_call");
    assert.equal(event.type === "concierge.tool_call" && event.toolName, "capture_lead");
    assert.equal(event.type === "concierge.tool_call" && event.outcome, "confirmation_required");
    assert.equal(event.type === "concierge.tool_call" && event.durationMs, 12);
    assert.equal(event.brand, "Tidepool");

    assert.equal(consoleLines.length, 1, "the console sink must receive the same event");
    assert.equal(JSON.parse(consoleLines[0]).type, "concierge.tool_call");

    // Isolation: point the webhook at a dead port and confirm the console sink
    // still gets its event. Promise.allSettled is the mechanism; this is the
    // assertion that it is actually load bearing.
    consoleLines.length = 0;
    process.env.CONCIERGE_WEBHOOK_URL = "http://127.0.0.1:1/events";
    await logToolCall({
      brandName: "Tidepool",
      toolName: "handoff_human",
      args: {},
      outcome: "ok",
      durationMs: 3,
    });
    assert.equal(received.length, 1, "the dead webhook must not have received anything");
    assert.equal(consoleLines.length, 1, "a failing sink must not starve the remaining sinks");
    assert.equal(JSON.parse(consoleLines[0]).toolName, "handoff_human");
  } finally {
    console.log = realLog;
    if (priorWebhook === undefined) delete process.env.CONCIERGE_WEBHOOK_URL;
    else process.env.CONCIERGE_WEBHOOK_URL = priorWebhook;
    if (priorConsole === undefined) delete process.env.CONCIERGE_LOG_CONSOLE;
    else process.env.CONCIERGE_LOG_CONSOLE = priorConsole;
    await new Promise<void>((resolve, reject) => webhook.close((err) => (err ? reject(err) : resolve())));
  }
});

test("an unconfigured sink is a silent no-op, not an error", async () => {
  const priorWebhook = process.env.CONCIERGE_WEBHOOK_URL;
  const priorConsole = process.env.CONCIERGE_LOG_CONSOLE;
  delete process.env.CONCIERGE_WEBHOOK_URL;
  delete process.env.CONCIERGE_LOG_CONSOLE;
  try {
    await logToolCall({ brandName: "Tidepool", toolName: "capture_lead", args: {}, outcome: "ok", durationMs: 1 });
  } finally {
    if (priorWebhook !== undefined) process.env.CONCIERGE_WEBHOOK_URL = priorWebhook;
    if (priorConsole !== undefined) process.env.CONCIERGE_LOG_CONSOLE = priorConsole;
  }
});

// ---------------------------------------------------------------------------

async function serve(provider: ChatProvider, runtime = createRuntime(limitsFromEnv({ CONCIERGE_RATE_LIMIT_IP: "100" }))) {
  const app = createConciergeApp({ providerFactory: () => provider, runtime });
  const server: Server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function chat(url: string, body: unknown, ip = "203.0.113.9"): Promise<Response> {
  return fetch(`${url}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

class FakeProvider implements ChatProvider {
  readonly name = "venice";
  readonly calls: Array<{ messages: ChatTurn[]; tools?: StreamChatOptions["tools"] }> = [];

  async streamChat(messages: ChatTurn[], onDelta: (text: string) => void, opts: StreamChatOptions = {}): Promise<string> {
    const result = await this.streamChatWithToolCalls(messages, onDelta, opts);
    return result.content;
  }

  async streamChatWithToolCalls(
    messages: ChatTurn[],
    onDelta: (text: string) => void,
    opts: StreamChatOptions = {}
  ): Promise<StreamChatResult> {
    this.calls.push({ messages, tools: opts.tools });
    onDelta("Tidepool reply");
    return { content: "Tidepool reply", toolCalls: [] };
  }
}
