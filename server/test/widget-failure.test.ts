import assert from "node:assert/strict";
import test from "node:test";
import { readHttpFailure } from "../../widget/src/httpFailure.js";

test("the widget explains budget and allowance refusals without a retry instruction", async () => {
  for (const code of ["budget_exhausted", "provider_exhausted", "provider_auth", "alert_unconfirmed"]) {
    const error = await readHttpFailure(Response.json({ code, error: "unsafe detail" }, { status: 503 }));
    assert.doesNotMatch(error.message, /unsafe detail|couldn't reach|Try again/);
    assert.match(error.message, /limit|allowance|paused/);
  }
});
test("the widget never displays unknown HTTP response content", async () => {
  for (const response of [Response.json({ code: "unknown", error: "private response" }), new Response("private response"), Response.json({ code: "__proto__" })]) {
    assert.equal((await readHttpFailure(response)).message, "Chat is temporarily unavailable.");
  }
});
