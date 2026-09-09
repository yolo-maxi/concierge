import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { createConciergeApp } from "../src/app.js";
import { createRuntime, limitsFromEnv } from "../src/runtime.js";
import { createSandboxStore, SANDBOX_LIMITS } from "../src/sandbox.js";
import { briefValidationErrors } from "../src/packet.js";
import type { ChatProvider, ChatTurn, StreamChatOptions, StreamChatResult } from "../src/providers/index.js";

// The configured brief is the ordinary page; the sandbox must never bleed into it.
const briefPath = join(mkdtempSync(join(tmpdir(), "concierge-sandbox-")), "brief.json");
writeFileSync(
  briefPath,
  JSON.stringify({
    brandName: "Tidepool",
    audience: "indie founders",
    objective: "start a trial",
    tone: "plain",
    cta: "Start free trial",
    docs: "Tidepool is a support workspace.",
  })
);
process.env.CONCIERGE_BRIEF = briefPath;

const validBrief = {
  brandName: "Acme Robots",
  audience: "plant managers",
  objective: "book a demo",
  tone: "direct",
  cta: "Book a demo",
  docs: "Acme sells palletising robots. Lead time is six weeks.",
};

test("briefValidationErrors reports every missing field at once", () => {
  assert.deepEqual(briefValidationErrors(validBrief), []);
  const errors = briefValidationErrors({ brandName: "", docs: 42 });
  assert.ok(errors.includes("brandName must not be empty"));
  assert.ok(errors.includes("docs must be a string"));
  assert.ok(errors.includes("audience must be a string"));
  assert.deepEqual(briefValidationErrors("nope"), ["brief must be a JSON object"]);
});

test("POST /brief/validate accepts a good brief and itemises a bad one without storing anything", async () => {
  const { url, close } = await serve(new EchoProvider(), null);
  try {
    const good = await fetch(`${url}/brief/validate`, post(validBrief));
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), { ok: true, errors: [] });

    const bad = await fetch(`${url}/brief/validate`, post({ brandName: "x", capabilities: { tools: ["capture_lead"] } }));
    assert.equal(bad.status, 422);
    const body = (await bad.json()) as { ok: boolean; errors: string[]; note?: string };
    assert.equal(body.ok, false);
    assert.ok(body.errors.length >= 5);
    assert.match(body.note ?? "", /powerless/);
  } finally {
    await close();
  }
});

test("sandbox is a 404 unless enabled", async () => {
  const { url, close } = await serve(new EchoProvider(), null);
  try {
    const res = await fetch(`${url}/sandbox/brief`, post(validBrief));
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as { code: string }).code, "sandbox_disabled");
  } finally {
    await close();
  }
});

test("a registered sandbox brief drives /chat, is powerless, and never falls back to the configured page", async () => {
  const provider = new EchoProvider();
  const store = createSandboxStore();
  const { url, close } = await serve(provider, store);
  try {
    // Capabilities in the submitted brief are discarded, not honoured.
    const reg = await fetch(`${url}/sandbox/brief`, post({ ...validBrief, capabilities: { tools: ["capture_lead"], ui: true } }));
    assert.equal(reg.status, 200);
    const { pageId } = (await reg.json()) as { pageId: string };
    assert.match(pageId, /^sandbox-[0-9a-f]{24}$/);

    const res = await chat(url, { messages: [{ role: "user", content: "What is the lead time?" }], pageId });
    assert.equal(res.status, 200);
    await res.text();
    const call = provider.calls.at(-1)!;
    const system = call.messages.find((m) => m.role === "system")!.content;
    assert.match(system, /Acme Robots/);
    assert.match(system, /six weeks/);
    assert.doesNotMatch(system, /Tidepool/);
    assert.equal(call.tools?.length ?? 0, 0, "sandbox pages advertise no tools");

    // An unknown or expired sandbox id is an error, not the default page.
    const stale = await chat(url, { messages: [{ role: "user", content: "hi" }], pageId: "sandbox-000000000000000000000000" });
    assert.equal(stale.status, 404);
    assert.equal(((await stale.json()) as { code: string }).code, "sandbox_expired");
  } finally {
    await close();
  }
});

test("sandbox store bounds size, field length, and lifetime", () => {
  const store = createSandboxStore({ maxEntries: 2, ttlMs: 1000, maxDocsChars: 10, maxFieldChars: 5 });
  const t0 = 1_000_000;
  const a = store.register({ ...validBrief, docs: "0123456789ABCDEF" }, t0);
  assert.ok(a.ok);
  assert.equal(a.brief.docs, "0123456789");
  assert.equal(a.brief.brandName, "Acme ");
  const b = store.register(validBrief, t0 + 1);
  const c = store.register(validBrief, t0 + 2);
  assert.ok(b.ok && c.ok);
  assert.equal(store.size(), 2, "oldest entry evicted at the cap");
  assert.equal(store.get(a.pageId, t0 + 3), null);
  assert.ok(store.get(c.pageId, t0 + 3));
  assert.equal(store.get(c.pageId, t0 + 2000), null, "expired after ttl");
  const bad = store.register({ brandName: "x" }, t0);
  assert.equal(bad.ok, false);
  assert.ok(SANDBOX_LIMITS.maxEntries > 0);
});

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  };
}

function chat(url: string, body: unknown): Promise<Response> {
  return fetch(`${url}/chat`, post(body));
}

async function serve(provider: ChatProvider, sandbox: ReturnType<typeof createSandboxStore> | null) {
  const runtime = createRuntime(limitsFromEnv({ CONCIERGE_RATE_LIMIT_IP: "100" }));
  const app = createConciergeApp({ providerFactory: () => provider, runtime, sandbox: sandbox ?? undefined });
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

class EchoProvider implements ChatProvider {
  readonly name = "venice";
  readonly calls: Array<{ messages: ChatTurn[]; tools?: StreamChatOptions["tools"] }> = [];
  async streamChat(messages: ChatTurn[], onDelta: (text: string) => void, opts: StreamChatOptions = {}): Promise<string> {
    return (await this.streamChatWithToolCalls(messages, onDelta, opts)).content;
  }
  async streamChatWithToolCalls(messages: ChatTurn[], onDelta: (text: string) => void, opts: StreamChatOptions = {}): Promise<StreamChatResult> {
    this.calls.push({ messages, tools: opts.tools });
    onDelta("ok");
    return { content: "ok", toolCalls: [] };
  }
}
