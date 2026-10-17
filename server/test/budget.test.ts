import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { UsageBudget, type Alert } from "../src/budget.js";
import { failureForStatus, ProviderFailure } from "../src/providerFailure.js";
import { createOpenAiCompatibleProvider, parseStreamLine } from "../src/providers/openAiCompatible.js";
import { operationsAlertSender } from "../src/operationsAlert.js";

function fixture(requests = 5, volume = 10000) {
  let now = 1000;
  const alerts: Alert[] = [];
  const options = { path: join(mkdtempSync(join(tmpdir(), "concierge-budget-")), "usage.sqlite"), requests, volume,
    periodMs: 1000, now: () => now, send: async (event: Alert) => { alerts.push(event); } };
  return { options, alerts, budget: new UsageBudget(options), advance: () => { now += 1000; } };
}

test("reserves quota durably, alerts at 80% and exhaustion once, and resets the bounded period", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) await f.budget.reserve(100);
  await assert.rejects(f.budget.reserve(100), { code: "budget_exhausted" });
  assert.deepEqual(f.alerts.map(a => a.event), ["budget_warning", "budget_exhausted"]);
  f.budget.close();
  const restarted = new UsageBudget(f.options);
  await assert.rejects(restarted.reserve(100), { code: "budget_exhausted" });
  assert.equal(f.alerts.length, 2);
  f.advance();
  await restarted.reserve(100);
  restarted.close();
});

test("volume refusal cannot overshoot or spend and concurrent reservations share one database", async () => {
  const f = fixture(100, 1000);
  const second = new UsageBudget(f.options);
  const results = await Promise.allSettled([f.budget.reserve(600), second.reserve(600)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.alerts.filter(a => a.event === "budget_exhausted").length, 1);
  second.close(); f.budget.close();
});

test("provider exhaustion persists across restarts and periods without more calls", async () => {
  const f = fixture();
  let calls = 0;
  const provider = f.budget.wrap({ name: "venice", streamChat: async () => { calls++; throw failureForStatus(402); },
    streamChatWithToolCalls: async () => { throw new Error("not called"); } });
  await assert.rejects(provider.streamChat([{ role: "user", content: "private content" }], () => {}), { code: "provider_exhausted" });
  await assert.rejects(provider.streamChat([], () => {}), { code: "provider_exhausted" });
  assert.equal(calls, 1);
  assert.deepEqual(f.alerts.map(a => a.event), ["provider_exhausted"]);
  assert.ok(!JSON.stringify(f.alerts).includes("private content"));
  f.budget.close(); f.advance();
  const restarted = new UsageBudget(f.options);
  assert.throws(() => restarted.assertAvailable(), { code: "provider_exhausted" });
  restarted.close();
});

test("rate limits persist for a cooldown and failures are distinct from refusals", async () => {
  const f = fixture();
  await f.budget.failure(failureForStatus(429));
  assert.throws(() => f.budget.assertAvailable(), { code: "provider_rate_limited" });
  await f.budget.failure(failureForStatus(500));
  await f.budget.failure(failureForStatus(500));
  await f.budget.failure(failureForStatus(400));
  assert.deepEqual(f.alerts.map(a => a.event), ["provider_rate_limited", "provider_failure"]);
  assert.equal(failureForStatus(401).code, "provider_auth");
  assert.equal(failureForStatus(403).code, "provider_auth");
  f.budget.close();
});

test("uncertain alert delivery fails closed and is not repeated after restart", async () => {
  const f = fixture(1);
  f.budget.close();
  let sends = 0;
  const options = { ...f.options, send: async () => { sends++; throw new Error("unsafe response"); } };
  const budget = new UsageBudget(options);
  await assert.rejects(budget.reserve(100), { code: "alert_unconfirmed" });
  budget.close();
  const restarted = new UsageBudget(options);
  await assert.rejects(restarted.reserve(100), { code: "alert_unconfirmed" });
  assert.equal(sends, 1);
  restarted.close();
});

test("the wrapper charges every tool follow-up and caps output", async () => {
  const f = fixture(2);
  let calls = 0;
  const provider = f.budget.wrap({ name: "venice", streamChat: async () => "",
    streamChatWithToolCalls: async (_messages, _delta, opts) => {
      assert.equal(opts?.maxTokens, 600); calls++; return { content: "ok", toolCalls: [] };
    } });
  await provider.streamChatWithToolCalls([], () => {}, { maxTokens: 10000 });
  await provider.streamChatWithToolCalls([], () => {});
  await assert.rejects(provider.streamChatWithToolCalls([], () => {}), { code: "budget_exhausted" });
  assert.equal(calls, 2); f.budget.close();
});

test("HTTP provider errors never retain response text or retry", async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, code] of [[402, "provider_exhausted"], [429, "provider_rate_limited"], [500, "provider_failure"], [400, "provider_refused"]] as const) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response("sensitive provider detail", { status }); };
      const provider = createOpenAiCompatibleProvider({ provider: "venice", model: "fake", baseUrl: "https://example.invalid", apiKey: "test-only" });
      await assert.rejects(provider.streamChat([], () => {}), (error: unknown) => {
        assert.ok(error instanceof ProviderFailure); assert.equal(error.code, code);
        assert.ok(!error.message.includes("sensitive")); return true;
      });
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = original; }
});

test("stream errors and refusals cannot look like successful replies", () => {
  assert.throws(() => parseStreamLine('data: {"error":{"message":"private"}}'), { code: "provider_failure" });
  assert.throws(() => parseStreamLine('data: {"choices":[{"delta":{"refusal":"private"}}]}'), { code: "provider_refused" });
  assert.throws(() => parseStreamLine('data: broken'), { code: "provider_failure" });
});

test("private alert route uses fixed fields and checks Telegram delivery acknowledgement", async () => {
  const original = globalThis.fetch;
  try {
    let body = "";
    globalThis.fetch = async (_url, opts) => { body = String(opts?.body); return Response.json({ ok: true }); };
    const send = operationsAlertSender({ TELEGRAM_BOT_TOKEN: "test-only", TELEGRAM_CHAT_ID: "private-test", TELEGRAM_THREAD_ID: "12" });
    await send({ event: "budget_warning", periodStart: 1000, requests: 4, volume: 800 });
    assert.ok(!body.includes("test-only"));
    assert.equal(JSON.parse(body).message_thread_id, 12);
    globalThis.fetch = async () => Response.json({ ok: false });
    await assert.rejects(send({ event: "budget_warning", periodStart: 1000, requests: 4, volume: 800 }));
  } finally { globalThis.fetch = original; }
});
