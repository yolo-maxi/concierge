import assert from "node:assert/strict";
import test from "node:test";
import { selectRetrievedContext } from "../src/retrieval.js";
import { buildSystemPrompt } from "../src/prompt.js";
import type { PageBrief } from "../src/types.js";

// Why this file exists
// --------------------
// fi_1ce472c0fafa13b16c10 ("Opt-in capability packs: retrieval and tools, off by
// default") declares two acceptance clauses that had NO test anywhere in the
// repository, despite the item's note claiming it was purely deploy-gated:
//
//   1. "Retrieval pack answers from a corpus larger than the brief while
//      respecting the injected-char cap."
//   2. "With no capabilities block, behaviour is byte-identical to today."
//
// server/src/retrieval.ts was reachable by zero tests. The tool half of the
// same item is covered in tools.test.ts; retrieval was not. These tests assert
// against the shipped defaults the server actually runs with, not against
// injected values (per the module-load env trap already documented on the tool
// rate-limit tests).

const baseBrief: PageBrief = {
  brandName: "Tidepool",
  audience: "indie founders",
  objective: "start a trial",
  tone: "plain",
  cta: "Start free trial",
  docs: "Tidepool is a privacy-first customer support workspace.",
};

/** Fresh object per test: the retrieval index is cached in a WeakMap keyed by brief identity. */
function briefWith(capabilities: PageBrief["capabilities"]): PageBrief {
  return { ...baseBrief, capabilities };
}

// The default-off assertions below must query with terms that DO appear in
// brief.docs. Mutation MUT-B (make ensureIndex fall back to indexing brief.docs
// when no pack is configured) initially failed to turn these red, because the
// query "pricing" matches nothing in baseBrief.docs — so they were passing for
// the wrong reason, i.e. vacuously. DEFAULT_OFF_QUERY is drawn from the docs
// string on purpose, and the positive control below pins that relationship so a
// future edit to baseBrief.docs cannot silently re-hollow these three tests.
const DEFAULT_OFF_QUERY = "privacy-first customer support workspace";

test("positive control: the default-off query does match the brief docs", () => {
  for (const term of ["privacy", "customer", "support", "workspace"]) {
    assert.ok(
      baseBrief.docs.toLowerCase().includes(term),
      `default-off tests would be vacuous: "${term}" is absent from brief.docs`
    );
  }
});

test("a brief with no capabilities block retrieves nothing at all", async () => {
  const context = await selectRetrievedContext(briefWith(undefined), DEFAULT_OFF_QUERY);
  assert.equal(context, undefined);
});

test("a capabilities block with no retrieval pack still retrieves nothing", async () => {
  const context = await selectRetrievedContext(briefWith({ tools: ["capture_lead"] }), DEFAULT_OFF_QUERY);
  assert.equal(context, undefined);
});

test("with no retrieval the system prompt is byte-identical to the no-context prompt", async () => {
  const brief = briefWith(undefined);
  const context = await selectRetrievedContext(brief, DEFAULT_OFF_QUERY);
  assert.equal(
    buildSystemPrompt(brief, context),
    buildSystemPrompt(brief),
    "an unconfigured brief must not gain a RETRIEVED CONTEXT section"
  );
});

test("retrieval answers from a corpus strictly larger than the brief docs", async () => {
  // Facts that appear ONLY in the corpus, never in brief.docs. If the answer
  // material comes back, it came from the corpus and not from the brief.
  const brief = briefWith({
    retrieval: {
      source: "inline",
      docs: [
        "Tidepool offers a ninety day enterprise pilot programme with a dedicated onboarding engineer.",
        "\n\nTidepool stores every conversation transcript in Frankfurt for European customers.",
        "\n\nTidepool integrates with Zendesk, Intercom and a plain webhook sink.",
      ],
    },
  });

  const context = await selectRetrievedContext(brief, "tell me about the enterprise pilot programme");
  assert.ok(context, "expected retrieved context for a query matching the corpus");
  assert.match(context, /pilot programme/i);
  assert.equal(
    baseBrief.docs.includes("pilot programme"),
    false,
    "positive control: the fact must be absent from the brief, or this test proves nothing"
  );
});

test("a query matching nothing in the corpus injects nothing rather than dumping it", async () => {
  const brief = briefWith({
    retrieval: { source: "inline", docs: ["Tidepool ships a Frankfurt data residency option."] },
  });
  const context = await selectRetrievedContext(brief, "zzzqqq unrelated gibberish token");
  assert.equal(context, undefined);
});

test("the injected-char cap is enforced even when many chunks score", async () => {
  const cap = 200;
  const brief = briefWith({
    retrieval: {
      source: "inline",
      // Twenty separately-scoring paragraphs, all matching the query term.
      docs: [Array.from({ length: 20 }, (_, i) => `Tidepool pricing note number ${i} about pricing.`).join("\n\n")],
      topK: 20,
      maxInjectedChars: cap,
    },
  });

  const context = await selectRetrievedContext(brief, "pricing");
  assert.ok(context, "expected retrieved context");
  assert.ok(
    context.length <= cap,
    `injected ${context.length} chars, cap is ${cap} — the cap is not being enforced`
  );
});

test("the cap truncates rather than dropping the corpus entirely", async () => {
  const brief = briefWith({
    retrieval: {
      source: "inline",
      docs: ["Tidepool pricing starts at twenty dollars per seat per month for the standard plan."],
      maxInjectedChars: 40,
    },
  });
  const context = await selectRetrievedContext(brief, "pricing");
  assert.ok(context, "a cap smaller than the chunk must still inject a truncated chunk, not nothing");
  assert.ok(context.length <= 40);
});

test("a url-source pack is never fetched per request when chunks are pre-supplied", async () => {
  // No network stub is installed. If loadChunks reached out, this would hang or
  // throw; pre-split chunks must short-circuit the fetch entirely.
  const brief = briefWith({
    retrieval: {
      source: "url",
      url: "http://127.0.0.1:1/never-reachable",
      chunks: ["Tidepool publishes a quarterly reliability report."],
    },
  });
  const context = await selectRetrievedContext(brief, "reliability report");
  assert.ok(context);
  assert.match(context, /reliability report/i);
});

test("retrieved context is labelled and fenced when it does reach the prompt", async () => {
  const brief = briefWith({
    retrieval: { source: "inline", docs: ["Tidepool supports SAML single sign on."] },
  });
  const context = await selectRetrievedContext(brief, "SAML single sign on");
  assert.ok(context);
  const prompt = buildSystemPrompt(brief, context);
  assert.match(prompt, /<retrieved>/);
  assert.match(prompt, /<\/retrieved>/);
  assert.match(prompt, /not from the visitor/i);
});
