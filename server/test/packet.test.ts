import assert from "node:assert/strict";
import test from "node:test";
import { createConciergePacket, parseConciergePacket } from "../src/packet.js";

const brief = {
  brandName: "Tidepool",
  audience: "indie founders",
  objective: "start a trial",
  tone: "plain",
  cta: "Start free trial",
  docs: "Tidepool facts.",
};

test("creates a versioned packet around page briefs", () => {
  const packet = createConciergePacket({
    name: "tidepool",
    defaultPageId: "home",
    provider: { type: "venice", model: "deepseek-v4-flash" },
    pages: { home: brief },
  });

  assert.equal(packet.manifestVersion, 1);
  assert.equal(packet.defaultPageId, "home");
  assert.deepEqual(packet.pages.home, brief);
});

test("rejects unsupported manifest versions", () => {
  assert.throws(
    () => parseConciergePacket({ manifestVersion: 2, pages: { home: brief } }),
    /Unsupported Concierge packet manifestVersion/
  );
});

test("rejects packet defaults that do not point at a page", () => {
  assert.throws(
    () => parseConciergePacket({ manifestVersion: 1, defaultPageId: "missing", pages: { home: brief } }),
    /defaultPageId="missing"/
  );
});
