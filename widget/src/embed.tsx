/**
 * Standalone embed entry.
 *
 * Bundles React + ReactDOM so the widget can be dropped into ANY page
 * (including a plain static site) with a single script tag — no build step,
 * no framework on the host page.
 *
 *   <script
 *     src="https://your-host/concierge-embed.js"
 *     data-endpoint="/concierge/chat"
 *     data-brand-name="Frontier"
 *     data-tagline="Ask about the order book"
 *     data-greeting="Hi — ask me anything about Frontier."
 *     data-accent-color="#36e27b"
 *     data-suggestions="What is Frontier?|How does copy liquidity work?|What chain is it on?"
 *     data-position="bottom-right"
 *   ></script>
 *
 * window.Concierge.mount({...props}) is also exposed for manual control.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { Concierge, type ConciergeProps } from "./Concierge";

const MOUNT_ID = "concierge-embed-root";

function mount(props: ConciergeProps): void {
  if (typeof document === "undefined") return;
  let host = document.getElementById(MOUNT_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = MOUNT_ID;
    document.body.appendChild(host);
  }
  createRoot(host).render(React.createElement(Concierge, props));
}

function readConfig(): ConciergeProps | null {
  const el =
    (document.currentScript as HTMLScriptElement | null) ||
    document.querySelector<HTMLScriptElement>("script[data-endpoint][src*='concierge']");
  if (!el) return null;
  const d = el.dataset;
  if (!d.endpoint) {
    console.error("[concierge] embed script is missing data-endpoint");
    return null;
  }
  const suggestions = d.suggestions
    ? d.suggestions.split("|").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const props: ConciergeProps = {
    endpoint: d.endpoint,
    pageId: d.pageId,
    brandName: d.brandName,
    tagline: d.tagline,
    logoUrl: d.logoUrl,
    greeting: d.greeting,
    suggestions,
    placeholder: d.placeholder,
    position: (d.position as ConciergeProps["position"]) || "bottom-right",
    defaultOpen: d.defaultOpen === "true",
    launcher: (d.launcher as ConciergeProps["launcher"]) || undefined,
    launcherLabel: d.launcherLabel,
    launcherIcon: d.launcherIcon,
    online: d.online !== "false",
    nudge: d.nudge,
    nudgeDelay: d.nudgeDelay ? Number(d.nudgeDelay) : undefined,
    theme: (d.theme as ConciergeProps["theme"]) || undefined,
    accentColor: d.accentColor,
    accentColor2: d.accentColor2,
    showCredit: d.showCredit !== "false",
    creditText: d.creditText,
  };
  return props;
}

// Expose for manual control.
(globalThis as any).Concierge = { mount };

// Auto-mount from the script tag's data-* attributes.
function boot(): void {
  const cfg = readConfig();
  if (cfg) mount(cfg);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
