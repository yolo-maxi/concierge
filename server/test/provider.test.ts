import assert from "node:assert/strict";
import test from "node:test";
import { parseStreamLine } from "../src/providers/openAiCompatible.js";
import { chatProviderFromEnv } from "../src/providers/index.js";
import { veniceConfigFromEnv } from "../src/providers/venice.js";

test("keeps Venice as the default server-side provider", () => {
  const cfg = veniceConfigFromEnv({ VENICE_API_KEY: "test-key" });

  assert.equal(cfg.provider, "venice");
  assert.equal(cfg.baseUrl, "https://api.venice.ai/api/v1");
  assert.equal(cfg.model, "deepseek-v4-flash");
  assert.equal(cfg.apiKey, "test-key");
});

test("allows packet provider metadata to supply non-secret defaults", () => {
  const cfg = veniceConfigFromEnv(
    { VENICE_API_KEY: "test-key" },
    { baseUrl: "https://venice.example.test/api/v1", model: "packet-model" }
  );

  assert.equal(cfg.baseUrl, "https://venice.example.test/api/v1");
  assert.equal(cfg.model, "packet-model");
});

test("requires the Venice API key instead of offering local auth paths", () => {
  assert.throws(() => veniceConfigFromEnv({}), /VENICE_API_KEY is not set/);
});

test("rejects unsupported provider names", () => {
  assert.throws(
    () => chatProviderFromEnv({ CONCIERGE_PROVIDER: "local-agent", VENICE_API_KEY: "test-key" }),
    /Only "venice" is currently supported/
  );
});

test("parses streamed content and incremental tool calls", () => {
  const toolCalls = new Map();
  const first = parseStreamLine(
    'data: {"choices":[{"delta":{"content":"Hi","tool_calls":[{"index":0,"id":"call_1","function":{"name":"capture_","arguments":"{\\"email\\":"}}]}}]}',
    toolCalls
  );
  const second = parseStreamLine(
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"lead","arguments":"\\"a@example.com\\"}"}}]}}]}',
    toolCalls
  );

  assert.equal(first?.delta, "Hi");
  assert.equal(second?.done, false);
  assert.deepEqual([...toolCalls.values()], [
    {
      id: "call_1",
      type: "function",
      function: { name: "capture_lead", arguments: '{"email":"a@example.com"}' },
    },
  ]);
});
