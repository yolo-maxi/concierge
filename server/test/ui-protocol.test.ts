import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUiEvent, isRegisteredComponent, componentCatalogue } from "../src/ui/protocol.js";
import { handleUiCall, uiToolDefinition, UI_TOOL_NAME } from "../src/ui/tool.js";

const TOOLS = ["capture_lead", "handoff_human"];

function valid(input: unknown, allowed = TOOLS) {
  const result = validateUiEvent(input, { allowedToolNames: allowed });
  assert.equal(result.ok, true, `expected valid, got: ${result.ok ? "" : result.reason}`);
  return result.ok ? result.event : (undefined as never);
}

function rejected(input: unknown, allowed = TOOLS): string {
  const result = validateUiEvent(input, { allowedToolNames: allowed });
  assert.equal(result.ok, false, "expected rejection but the event validated");
  return result.ok ? "" : result.reason;
}

test("a well-formed button group validates and keeps only declared props", () => {
  const event = valid({
    component: "button_group",
    text: "You can book a demo or read the docs.",
    props: {
      title: "Next steps",
      buttons: [
        { label: "Book a demo", action: { kind: "send", text: "I'd like a demo" } },
        { label: "Docs", action: { kind: "link", url: "https://example.com/docs" } },
      ],
    },
  });
  assert.equal(event.component, "button_group");
  assert.equal((event.props.buttons as unknown[]).length, 2);
  assert.equal(event.text, "You can book a demo or read the docs.");
});

test("an unregistered component is refused", () => {
  const reason = rejected({ component: "script_tag", text: "hi", props: {} });
  assert.match(reason, /unknown component/);
});

test("the text fallback is mandatory, so every event can degrade", () => {
  const reason = rejected({
    component: "button_group",
    props: { buttons: [{ label: "Go", action: { kind: "send", text: "go" } }] },
  });
  assert.match(reason, /text fallback is required/);
  assert.match(rejected({ component: "button_group", text: "   ", props: {} }), /text fallback is required/);
});

test("an unknown prop is refused rather than passed through to the client", () => {
  const reason = rejected({
    component: "product_card",
    text: "Our plan.",
    props: { name: "Pro", dangerouslySetInnerHTML: "<img onerror=alert(1)>" },
  });
  assert.match(reason, /unknown prop/);
});

test("a prop of the wrong type is refused, not coerced", () => {
  assert.match(rejected({ component: "product_card", text: "x", props: { name: 42 } }), /expected a string/);
  assert.match(
    rejected({ component: "button_group", text: "x", props: { buttons: "not-an-array" } }),
    /expected an array/
  );
});

test("javascript:, data: and other executable URL schemes are refused everywhere", () => {
  for (const url of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox",
    "//evil.example.com/x",
    "file:///etc/passwd",
  ]) {
    assert.match(
      rejected({ component: "product_card", text: "x", props: { name: "P", imageUrl: url } }),
      /only http\(s\) URLs are allowed/,
      `imageUrl accepted a hostile scheme: ${url}`
    );
    assert.match(
      rejected({
        component: "button_group",
        text: "x",
        props: { buttons: [{ label: "Click", action: { kind: "link", url } }] },
      }),
      /link action needs an http\(s\) url/,
      `link action accepted a hostile scheme: ${url}`
    );
  }
});

test("http and https URLs are accepted", () => {
  const event = valid({
    component: "product_card",
    text: "x",
    props: { name: "P", imageUrl: "http://example.com/a.png" },
  });
  assert.equal(event.props.imageUrl, "http://example.com/a.png");
});

test("a tool action naming a tool the page has not allowed is refused", () => {
  const reason = rejected({
    component: "handoff_card",
    text: "I can put you in touch.",
    props: { action: { kind: "tool", tool: "delete_everything" } },
  });
  assert.match(reason, /is not available on this page/);
});

test("a tool action is refused when the page has no tools at all", () => {
  const reason = rejected(
    { component: "handoff_card", text: "x", props: { action: { kind: "tool", tool: "capture_lead" } } },
    []
  );
  assert.match(reason, /is not available on this page/);
});

test("an allowlisted tool action validates", () => {
  const event = valid({
    component: "handoff_card",
    text: "I can put you in touch.",
    props: { action: { kind: "tool", tool: "handoff_human", label: "Talk to us" } },
  });
  assert.deepEqual(event.props.action, { kind: "tool", tool: "handoff_human", label: "Talk to us" });
});

test("an unknown action kind is refused", () => {
  assert.match(
    rejected({
      component: "handoff_card",
      text: "x",
      props: { action: { kind: "eval", code: "alert(1)" } },
    }),
    /action kind must be send, link or tool/
  );
});

test("array props are bounded, so a model cannot emit a hundred buttons", () => {
  const buttons = Array.from({ length: 9 }, (_, i) => ({
    label: `b${i}`,
    action: { kind: "send", text: "x" },
  }));
  assert.match(rejected({ component: "button_group", text: "x", props: { buttons } }), /at most 4 entries/);
});

test("an empty required array is refused rather than rendering an empty shell", () => {
  assert.match(
    rejected({ component: "button_group", text: "x", props: { buttons: [] } }),
    /at least one entry/
  );
});

test("missing required props are refused", () => {
  assert.match(rejected({ component: "button_group", text: "x", props: {} }), /missing required prop "buttons"/);
  assert.match(rejected({ component: "product_card", text: "x", props: {} }), /missing required prop "name"/);
});

test("enum props reject values outside the declared set", () => {
  assert.match(
    rejected({
      component: "lead_form",
      text: "x",
      props: { fields: [{ name: "a", label: "A", type: "password" }] },
    }),
    /expected one of text\|email\|tel\|textarea/
  );
});

test("over-long strings are truncated, not rejected, so a chatty model still renders", () => {
  const event = valid({
    component: "product_card",
    text: "x",
    props: { name: "N".repeat(500) },
  });
  assert.equal((event.props.name as string).length, 80);
});

test("non-objects and arrays are refused at the top level", () => {
  assert.match(rejected(null), /expected an object/);
  assert.match(rejected("button_group"), /expected an object/);
  assert.match(rejected([{ component: "button_group" }]), /expected an object/);
});

test("the tool definition advertises exactly the registered components", () => {
  const def = uiToolDefinition();
  assert.equal(def.function.name, UI_TOOL_NAME);
  const enumerated = (def.function.parameters.properties.component as { enum: string[] }).enum;
  assert.deepEqual([...enumerated].sort(), ["button_group", "handoff_card", "lead_form", "product_card"]);
  for (const name of enumerated) assert.ok(isRegisteredComponent(name));
  assert.ok(def.function.parameters.required.includes("text"));
  assert.match(componentCatalogue(), /button_group:/);
});

test("handleUiCall turns a good call into an event and a bad one into guidance", () => {
  const good = handleUiCall(
    JSON.stringify({
      component: "handoff_card",
      text: "I can put you in touch with the team.",
      props: { title: "Talk to a human" },
    }),
    TOOLS
  );
  assert.ok(good.event);
  assert.equal(good.event?.component, "handoff_card");

  const bad = handleUiCall(JSON.stringify({ component: "iframe", text: "hi" }), TOOLS);
  assert.equal(bad.event, undefined);
  assert.match(bad.toolMessage, /rejected/);
  assert.match(bad.toolMessage, /plain text/);
});

test("malformed JSON arguments degrade to text instead of throwing", () => {
  const outcome = handleUiCall("{not json", TOOLS);
  assert.equal(outcome.event, undefined);
  assert.match(outcome.toolMessage, /not valid JSON/);
});
