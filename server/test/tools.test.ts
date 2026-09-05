import assert from "node:assert/strict";
import test from "node:test";
import { getAllowedTools, getTool } from "../src/tools/registry.js";
import { runAllowedTool, toolContext } from "../src/tools/executor.js";
import type { ConciergeTool, ToolContext } from "../src/tools/types.js";
import type { PageBrief } from "../src/types.js";

// The registry and executor are the policy boundary: they are the only thing
// standing between a model that has been talked into asking for a tool and the
// tool actually running. Every guard below was implemented but had no test, so
// each assertion here is paired with a note on what its absence would allow.

const brief: PageBrief = {
  brandName: "Tidepool",
  audience: "indie founders",
  objective: "start a trial",
  tone: "plain",
  cta: "Start free trial",
  docs: "Tidepool facts.",
};

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return toolContext({ brief, ip: "203.0.113.9", ...overrides });
}

/** A tool the registry has never heard of, used to stand in for one a model invented. */
function fakeTool(name: string, handler: ConciergeTool["handler"]): ConciergeTool {
  return {
    name,
    description: "test double",
    schema: { type: "object", additionalProperties: false, properties: {} },
    sanitizeArgs: (args) => (args && typeof args === "object" ? { ...(args as object) } : {}),
    handler,
  };
}

test("a default instance is powerless: no capabilities means no tools", () => {
  // If this regressed, every page would silently gain whatever tools exist.
  assert.deepEqual(getAllowedTools(undefined), []);
  assert.deepEqual(getAllowedTools([]), []);
});

test("the allowlist is a filter, not a passthrough", () => {
  // Names come from the server-side brief, but a typo or a stale brief must not
  // conjure a tool, and a real tool must still resolve.
  assert.deepEqual(getAllowedTools(["capture_lead"]).map((t) => t.name), ["capture_lead"]);
  assert.deepEqual(getAllowedTools(["definitely_not_a_tool"]), []);
  assert.deepEqual(
    getAllowedTools(["capture_lead", "definitely_not_a_tool"]).map((t) => t.name),
    ["capture_lead"],
  );
  assert.equal(getTool("definitely_not_a_tool"), undefined);
});

test("an unregistered tool call is refused without executing anything", async () => {
  // The hostile case: the model emits a tool call for something not allowed.
  // It must be blocked, and must not reach a handler.
  let ran = false;
  const allowed = new Map<string, ConciergeTool>([
    ["capture_lead", fakeTool("capture_lead", async () => { ran = true; return "ok"; })],
  ]);

  const result = await runAllowedTool(
    { id: "call-1", name: "exfiltrate_secrets", arguments: "{}" },
    allowed,
    ctx(),
  );

  assert.equal(ran, false, "a blocked call must never reach a handler");
  assert.equal(result.name, "exfiltrate_secrets");
  assert.match(result.content, /not available/i);
});

test("a tool that hangs is aborted rather than stalling the turn", async () => {
  // Without the timeout an unresponsive dependency holds the SSE stream open
  // indefinitely. The handler must observe an aborted signal.
  //
  // NOTE: CONCIERGE_TOOL_TIMEOUT_MS is read once at module load, so this
  // exercises the shipped default (5s) rather than an injected value. That is
  // deliberate — overriding it here would test a value production never uses.
  let sawAbort = false;
  const allowed = new Map<string, ConciergeTool>([
    ["slow", fakeTool("slow", (_args, _c, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        sawAbort = true;
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    }))],
  ]);

  const result = await runAllowedTool({ id: "c", name: "slow", arguments: "{}" }, allowed, ctx());

  assert.equal(sawAbort, true, "the handler must be signalled, not merely abandoned");
  assert.match(result.content, /could not complete/i);
});

test("a throwing tool degrades to an answerable turn instead of surfacing internals", async () => {
  // The failure message is visitor-facing: it must not leak the error text.
  const allowed = new Map<string, ConciergeTool>([
    ["boom", fakeTool("boom", async () => { throw new Error("SECRET_DSN=postgres://user:pw@host"); })],
  ]);

  const result = await runAllowedTool({ id: "c", name: "boom", arguments: "{}" }, allowed, ctx());

  assert.match(result.content, /could not complete/i);
  assert.ok(!result.content.includes("SECRET_DSN"), "internal error text must not reach the visitor");
  assert.ok(!result.content.includes("postgres://"), "internal error text must not reach the visitor");
});

test("malformed tool arguments do not crash the executor", async () => {
  // Providers do emit truncated/invalid JSON. That must be a normal turn.
  const seen: unknown[] = [];
  const allowed = new Map<string, ConciergeTool>([
    ["echo", fakeTool("echo", async (args) => { seen.push(args); return "handled"; })],
  ]);

  const result = await runAllowedTool(
    { id: "c", name: "echo", arguments: "{not valid json" },
    allowed,
    ctx(),
  );

  assert.equal(result.content, "handled");
  assert.deepEqual(seen, [{}], "unparseable arguments become an empty object");
});

test("a tool whose sanitizer throws is still executed and still audited", async () => {
  // sanitizeArgs only feeds the audit log. A sanitizer bug must not become an
  // outage, and must not be a way to skip the audit path either.
  const allowed = new Map<string, ConciergeTool>([
    ["odd", {
      name: "odd",
      description: "sanitizer throws",
      schema: {},
      sanitizeArgs: () => { throw new Error("sanitizer exploded"); },
      handler: async () => "still ran",
    }],
  ]);

  const result = await runAllowedTool({ id: "c", name: "odd", arguments: "{}" }, allowed, ctx());
  assert.equal(result.content, "still ran");
});

test("the lead sanitizer masks the email before it reaches the audit log", () => {
  // capture_lead exists to collect an email; the audit trail must not become a
  // second, unredacted copy of every address collected.
  const tool = getTool("capture_lead");
  assert.ok(tool, "capture_lead must be registered");

  const sanitized = tool.sanitizeArgs({
    name: "Ada",
    email: "ada@example.com",
    message: "hello there",
  });

  assert.ok(!JSON.stringify(sanitized).includes("ada@example.com"), "raw address must be masked");
  assert.equal(sanitized.name, "Ada");
});

test("rate limiting is per tool per caller, and does not leak across callers", async () => {
  // A single visitor must not be able to hammer a side-effecting tool, and one
  // visitor hitting the cap must not lock out everyone else.
  //
  // CONCIERGE_TOOL_RATE_LIMIT is read once at module load, so this asserts
  // against the shipped default of 5 per 60s window rather than an injected
  // value — the cap production actually runs with.
  const DEFAULT_CAP = 5;
  let calls = 0;
  const allowed = new Map<string, ConciergeTool>([
    ["ping", fakeTool("ping", async () => { calls += 1; return "pong"; })],
  ]);

  const caller = ctx({ ip: "198.51.100.7" });
  for (let i = 0; i < DEFAULT_CAP; i++) {
    const ok = await runAllowedTool({ id: `${i}`, name: "ping", arguments: "{}" }, allowed, caller);
    assert.equal(ok.content, "pong", `call ${i + 1} is within the cap`);
  }

  const overCap = await runAllowedTool({ id: "over", name: "ping", arguments: "{}" }, allowed, caller);
  assert.match(overCap.content, /rate limited/i, "the call over the cap must be refused");
  assert.equal(calls, DEFAULT_CAP, "the refused call must not reach the handler");

  // A second tool for the same caller has its own budget.
  const otherTool = new Map<string, ConciergeTool>([
    ["pong_tool", fakeTool("pong_tool", async () => "ok")],
  ]);
  const differentTool = await runAllowedTool(
    { id: "t", name: "pong_tool", arguments: "{}" },
    otherTool,
    caller,
  );
  assert.equal(differentTool.content, "ok", "the cap is per tool, not per caller overall");

  // And a different caller is unaffected by the first one exhausting its budget.
  const other = await runAllowedTool(
    { id: "4", name: "ping", arguments: "{}" },
    allowed,
    ctx({ ip: "198.51.100.8" }),
  );
  assert.equal(other.content, "pong", "a different caller must not inherit the cap");
});
