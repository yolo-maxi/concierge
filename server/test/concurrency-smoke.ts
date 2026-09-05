import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:http";
import { createConciergeApp } from "../src/app.js";
import { createRuntime, limitsFromEnv } from "../src/runtime.js";
import type { ChatProvider, ChatTurn, StreamChatOptions, StreamChatResult } from "../src/providers/index.js";

const briefPath = join(mkdtempSync(join(tmpdir(), "concierge-smoke-")), "brief.json");
writeFileSync(
  briefPath,
  JSON.stringify({
    brandName: "Smoke",
    audience: "test visitors",
    objective: "answer deterministically",
    tone: "plain",
    cta: "Try it",
    docs: "Smoke docs only.",
  })
);
process.env.CONCIERGE_BRIEF = briefPath;

const provider = new SlowProvider(75);
const runtime = createRuntime(
  limitsFromEnv({
    CONCIERGE_MAX_CONCURRENT: "2",
    CONCIERGE_MAX_QUEUE_DEPTH: "8",
    CONCIERGE_REQUEST_TIMEOUT_MS: "2000",
    CONCIERGE_RATE_LIMIT_IP: "50",
    CONCIERGE_RATE_LIMIT_SESSION: "50",
  })
);
const server = createServer(createConciergeApp({ providerFactory: () => provider, runtime }));
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const responses = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.100.${i}` },
        body: JSON.stringify({
          sessionId: `smoke-${i}`,
          messages: [{ role: "user", content: `request ${i}` }],
        }),
      })
    )
  );
  const bodies = await Promise.all(responses.map((res) => res.text()));
  const evidence = {
    statusCodes: responses.map((res) => res.status),
    completed: bodies.filter((body) => body.includes("data: [DONE]")).length,
    maxObservedConcurrent: provider.maxObservedConcurrent,
    providerCalls: provider.calls,
    runtime: runtime.state(),
  };
  assert.equal(evidence.statusCodes.every((status) => status === 200), true);
  assert.equal(evidence.completed, 10);
  assert.equal(evidence.maxObservedConcurrent <= 2, true);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

class SlowProvider implements ChatProvider {
  readonly name = "venice";
  calls = 0;
  currentConcurrent = 0;
  maxObservedConcurrent = 0;

  constructor(private readonly delayMs: number) {}

  async streamChat(messages: ChatTurn[], onDelta: (text: string) => void, opts: StreamChatOptions = {}): Promise<string> {
    const result = await this.streamChatWithToolCalls(messages, onDelta, opts);
    return result.content;
  }

  async streamChatWithToolCalls(
    _messages: ChatTurn[],
    onDelta: (text: string) => void,
    opts: StreamChatOptions = {}
  ): Promise<StreamChatResult> {
    this.calls++;
    this.currentConcurrent++;
    this.maxObservedConcurrent = Math.max(this.maxObservedConcurrent, this.currentConcurrent);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.delayMs);
        opts.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      });
      onDelta("smoke-ok");
      return { content: "smoke-ok", toolCalls: [] };
    } finally {
      this.currentConcurrent--;
    }
  }
}
