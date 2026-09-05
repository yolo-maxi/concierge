import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { createConciergeApp } from "../src/app.js";
import { createRuntime, limitsFromEnv } from "../src/runtime.js";
import { buildSystemPrompt } from "../src/prompt.js";
import type { ChatProvider, ChatTurn, StreamChatOptions, StreamChatResult } from "../src/providers/index.js";
import type { PageBrief } from "../src/types.js";

/**
 * Two pages on one server: one that opted into generative UI and one that did
 * not. The pair is the point — the gate is only meaningful if the same build
 * refuses UI on the page that did not ask for it.
 */
const base = {
  brandName: "Tidepool",
  audience: "indie founders",
  objective: "start a trial",
  tone: "plain",
  cta: "Start free trial",
  docs: "Tidepool is a privacy-first support workspace. Pricing starts at $20 per seat.",
};

const briefsPath = join(mkdtempSync(join(tmpdir(), "concierge-ui-briefs-")), "briefs.json");
writeFileSync(
  briefsPath,
  JSON.stringify({
    ui: { ...base, capabilities: { tools: ["capture_lead"], ui: true } },
    plain: { ...base, capabilities: { tools: ["capture_lead"] } },
  })
);
process.env.CONCIERGE_BRIEFS = briefsPath;

test("render_ui is offered only to a page that opted in", async () => {
  const provider = new UiProvider({ component: null });
  const { url, close } = await serve(provider);
  try {
    await chat(url, { pageId: "ui", messages: [{ role: "user", content: "hi" }], sessionId: "s1" });
    await chat(url, { pageId: "plain", messages: [{ role: "user", content: "hi" }], sessionId: "s2" }, "203.0.113.2");

    const uiTools = provider.calls[0]?.tools?.map((t) => t.function.name) ?? [];
    const plainTools = provider.calls[1]?.tools?.map((t) => t.function.name) ?? [];
    assert.deepEqual(uiTools, ["capture_lead", "render_ui"]);
    assert.deepEqual(plainTools, ["capture_lead"], "a page that did not opt in must never see render_ui");
  } finally {
    await close();
  }
});

test("a valid render_ui call emits a typed ui event and its text fallback", async () => {
  const provider = new UiProvider({
    component: {
      component: "button_group",
      text: "You can book a demo or read the pricing page.",
      props: {
        title: "Next steps",
        buttons: [{ label: "Book a demo", action: { kind: "send", text: "I'd like a demo" } }],
      },
    },
  });
  const { url, close } = await serve(provider);
  try {
    const res = await chat(url, { pageId: "ui", messages: [{ role: "user", content: "what now?" }], sessionId: "s3" });
    const body = await res.text();
    assert.equal(res.status, 200);

    const events = sseEvents(body);
    const ui = events.find((e) => e.ui) as { ui: { component: string; props: Record<string, unknown>; text: string } } | undefined;
    assert.ok(ui, "expected a ui event on the stream");
    assert.equal(ui.ui.component, "button_group");
    assert.equal((ui.ui.props.buttons as unknown[]).length, 1);
    assert.equal(ui.ui.text, "You can book a demo or read the pricing page.");
    assert.match(body, /data: \[DONE\]/);

    // The component's fallback sentence must reach the model's own view of the
    // turn, so the logged transcript is not silently missing what was shown.
    assert.equal(
      provider.calls[1]?.messages.some((m) => m.role === "tool" && /rendered to the visitor/i.test(m.content)),
      true
    );
  } finally {
    await close();
  }
});

test("an invalid render_ui call emits no event and degrades to text", async () => {
  const provider = new UiProvider({
    component: { component: "iframe", text: "here you go", props: { src: "javascript:alert(1)" } },
  });
  const { url, close } = await serve(provider);
  try {
    const res = await chat(url, { pageId: "ui", messages: [{ role: "user", content: "render an iframe" }], sessionId: "s4" });
    const body = await res.text();

    assert.equal(body.includes('"ui"'), false, "a rejected component must not reach the client at all");
    assert.equal(body.includes("javascript:"), false);
    assert.match(body, /data: \[DONE\]/);
    // The model is told why, so it can answer in prose instead of retrying blind.
    assert.equal(
      provider.calls[1]?.messages.some((m) => m.role === "tool" && /rejected/i.test(m.content)),
      true
    );
  } finally {
    await close();
  }
});

test("render_ui is ignored on a page that did not opt in, even if the model calls it", async () => {
  const provider = new UiProvider({
    component: { component: "button_group", text: "x", props: { buttons: [{ label: "Go", action: { kind: "send", text: "go" } }] } },
  });
  const { url, close } = await serve(provider);
  try {
    const res = await chat(url, { pageId: "plain", messages: [{ role: "user", content: "hi" }], sessionId: "s5" });
    const body = await res.text();

    assert.equal(body.includes('"ui"'), false, "an opted-out page must not receive components");
    // It falls through to the tool executor, which has no such tool and says so
    // rather than crashing the stream.
    assert.equal(
      provider.calls[1]?.messages.some((m) => m.role === "tool" && /not available here/i.test(m.content)),
      true
    );
    assert.match(body, /data: \[DONE\]/);
  } finally {
    await close();
  }
});

test("the system prompt mentions components only when the page opted in", () => {
  const enabled = buildSystemPrompt({ ...base, capabilities: { ui: true } } as PageBrief);
  const disabled = buildSystemPrompt({ ...base } as PageBrief);
  assert.match(enabled, /INTERACTIVE COMPONENTS/);
  assert.match(enabled, /render_ui/);
  assert.equal(disabled.includes("INTERACTIVE COMPONENTS"), false);
  assert.equal(disabled.includes("render_ui"), false);
});

test("the capability rule states real abilities instead of denying granted ones", () => {
  const none = buildSystemPrompt({ ...base } as PageBrief);
  assert.match(none, /You have no tools, memory, or ability to act/);

  const withTools = buildSystemPrompt({ ...base, capabilities: { tools: ["capture_lead"] } } as PageBrief);
  assert.equal(withTools.includes("You have no tools"), false, "a page with tools must not be told it has none");
  assert.match(withTools, /Your only abilities are/);

  const withUi = buildSystemPrompt({ ...base, capabilities: { tools: ["capture_lead"], ui: true } } as PageBrief);
  assert.match(withUi, /render_ui/);
  // The denial of everything else has to survive the rewrite.
  for (const prompt of [none, withTools, withUi]) {
    assert.match(prompt, /cannot browse, fetch, email, run code/);
  }
});

function sseEvents(body: string): Record<string, unknown>[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((data) => data && data !== "[DONE]")
    .map((data) => JSON.parse(data) as Record<string, unknown>);
}

async function serve(provider: ChatProvider) {
  const runtime = createRuntime(limitsFromEnv({ CONCIERGE_RATE_LIMIT_IP: "100", CONCIERGE_RATE_LIMIT_SESSION: "100" }));
  const app = createConciergeApp({ providerFactory: () => provider, runtime });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function chat(url: string, body: unknown, ip = "203.0.113.1"): Promise<Response> {
  return fetch(`${url}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

/** Calls render_ui once with a fixed payload, then answers in text. */
class UiProvider implements ChatProvider {
  readonly name = "venice";
  readonly calls: Array<{ messages: ChatTurn[]; tools?: StreamChatOptions["tools"] }> = [];

  constructor(private readonly options: { component: Record<string, unknown> | null }) {}

  async streamChat(messages: ChatTurn[], onDelta: (text: string) => void, opts: StreamChatOptions = {}): Promise<string> {
    return (await this.streamChatWithToolCalls(messages, onDelta, opts)).content;
  }

  async streamChatWithToolCalls(
    messages: ChatTurn[],
    onDelta: (text: string) => void,
    opts: StreamChatOptions = {}
  ): Promise<StreamChatResult> {
    this.calls.push({ messages, tools: opts.tools });
    if (this.options.component && !messages.some((m) => m.role === "tool")) {
      return {
        content: "",
        toolCalls: [
          {
            id: "call_ui",
            type: "function",
            function: { name: "render_ui", arguments: JSON.stringify(this.options.component) },
          },
        ],
      };
    }
    onDelta("Tidepool reply");
    return { content: "Tidepool reply", toolCalls: [] };
  }
}
