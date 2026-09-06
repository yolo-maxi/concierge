/**
 * Browser fixture for UiBlock.
 *
 * Mounts every registered component plus the degradation cases into a real
 * DOM so a headless Chromium can assert on rendered output and interaction,
 * which `tsx --test` cannot reach. Every onSend call is recorded on
 * window.__sent so the driver can prove what a click actually emits.
 *
 * This file is test scaffolding, not part of the shipped bundle.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { UiBlock, type UiEvent } from "../src/ui/UiBlock";
import { THEME_PRESETS } from "../src/themes";

declare global {
  interface Window {
    __sent: string[];
    __ready: boolean;
  }
}

window.__sent = [];
const onSend = (text: string) => {
  window.__sent.push(text);
};

const cases: { id: string; event: UiEvent }[] = [
  {
    id: "buttons",
    event: {
      component: "button_group",
      text: "Pick one of: pricing, docs.",
      props: {
        title: "Where next?",
        buttons: [
          { label: "Pricing", action: { kind: "send", text: "Tell me about pricing" } },
          { label: "Docs", action: { kind: "link", url: "https://example.com/docs" } },
          { label: "Book a call", action: { kind: "tool", tool: "capture_lead", label: "I want a call" } },
        ],
      },
    },
  },
  {
    id: "buttons-hostile-url",
    event: {
      component: "button_group",
      text: "Fallback sentence for hostile url case.",
      props: {
        buttons: [{ label: "Click me", action: { kind: "link", url: "javascript:alert(1)" } }],
      },
    },
  },
  {
    id: "form",
    event: {
      component: "lead_form",
      text: "Leave your details.",
      props: {
        title: "Get in touch",
        submitLabel: "Send it",
        fields: [
          { name: "email", label: "Email", type: "email", required: true },
          { name: "note", label: "Note", type: "textarea" },
        ],
      },
    },
  },
  {
    id: "card",
    event: {
      component: "product_card",
      text: "Widget Pro, 49 dollars.",
      props: {
        name: "Widget Pro",
        price: "$49",
        description: "The bigger one.",
        imageUrl: "https://example.com/w.png",
        action: { kind: "send", text: "Tell me more about Widget Pro" },
      },
    },
  },
  {
    id: "card-hostile-image",
    event: {
      component: "product_card",
      text: "Fallback sentence for hostile image case.",
      props: { name: "Sketchy", imageUrl: "javascript:alert(1)" },
    },
  },
  {
    id: "handoff",
    event: {
      component: "handoff_card",
      text: "A human can help.",
      props: { title: "Talk to a human", body: "We reply within a day.", action: { kind: "send", text: "Talk to a human" } },
    },
  },
  {
    id: "unknown",
    event: {
      component: "quantum_carousel_9000",
      text: "We have three plans: Starter, Team and Enterprise.",
      props: { anything: "at all" },
    },
  },
  {
    id: "empty-buttons",
    event: { component: "button_group", text: "Nothing usable here, read this instead.", props: { buttons: [] } },
  },
];

function App() {
  // Apply the same token set the real widget applies to its root, so the
  // fixture measures shipped spacing rather than unresolved var() fallbacks.
  const style = THEME_PRESETS.midnight as React.CSSProperties;
  return (
    <div className="cc-root" style={style}>
      {cases.map((c) => (
        <section key={c.id} data-case={c.id}>
          <UiBlock event={c.event} onSend={onSend} />
        </section>
      ))}
    </div>
  );
}

const host = document.getElementById("root");
if (!host) throw new Error("fixture: #root missing");
createRoot(host).render(<App />);
window.__ready = true;
