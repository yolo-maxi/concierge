/**
 * Browser fixture for the token-first theming / shadow-DOM isolation clauses.
 *
 * The widget's acceptance criteria name a rendered surface: shadow-DOM mount
 * verified against a host page with an aggressive global CSS reset, 6 presets
 * rendering, and `theme` composing with accentColor + themeVars. The package
 * test runner is `tsx --test` with no DOM, so none of that is reachable there.
 * This mounts the real Concierge component into a real document so headless
 * Chromium can assert on it.
 *
 * The host page deliberately carries a hostile global reset (see the driver):
 * if isolation works, none of it reaches inside the shadow root.
 *
 * This file is test scaffolding, not part of the shipped bundle.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { Concierge } from "../src/Concierge";
import { THEME_PRESETS } from "../src/themes";

declare global {
  interface Window {
    __ready: boolean;
    __presets: string[];
  }
}

const PRESETS = Object.keys(THEME_PRESETS);
window.__presets = PRESETS;

/* Endpoint points at a route the fixture server answers with an error, so the
   widget never needs a live model. We assert on rendering, not on chat. */
const ENDPOINT = "/no-such-endpoint";

function App() {
  return (
    <div>
      {/* isolated (default) — one per preset, inline so the panel is open */}
      {PRESETS.map((p) => (
        <div key={p} data-preset-case={p}>
          <Concierge
            endpoint={ENDPOINT}
            pageId={`preset-${p}`}
            position="inline"
            theme={p as never}
            brandName={`Preset ${p}`}
            showCredit={false}
          />
        </div>
      ))}

      {/* composition: preset + accentColor + themeVars, themeVars must win */}
      <div data-case="composed">
        <Concierge
          endpoint={ENDPOINT}
          pageId="composed"
          position="inline"
          theme="light"
          accentColor="#ff0090"
          themeVars={{ "--cc-radius-panel": "3px", "--cc-text": "#010203" }}
          brandName="Composed"
          showCredit={false}
        />
      </div>

      {/* partial token object as `theme` */}
      <div data-case="token-object">
        <Concierge
          endpoint={ENDPOINT}
          pageId="token-object"
          position="inline"
          theme={{ "--cc-bg": "#123456" } as never}
          brandName="TokenObject"
          showCredit={false}
        />
      </div>

      {/* opt-out of isolation */}
      <div data-case="not-isolated">
        <Concierge
          endpoint={ENDPOINT}
          pageId="not-isolated"
          position="inline"
          isolate={false}
          brandName="NotIsolated"
          showCredit={false}
        />
      </div>
    </div>
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(<App />);

/* Ready when every isolated instance has attached its shadow root and mounted.
   Polling rather than a fixed delay so the driver never races the effects. */
const started = Date.now();
const poll = window.setInterval(() => {
  const hosts = document.querySelectorAll("[data-cc-shadow-host]");
  const mounted = Array.from(hosts).filter(
    (h) => (h as HTMLElement).shadowRoot?.querySelector("[data-cc-shadow-mount] .cc-root"),
  );
  // PRESETS + composed + token-object are isolated; not-isolated is not.
  if (mounted.length >= PRESETS.length + 2) {
    window.clearInterval(poll);
    window.__ready = true;
  } else if (Date.now() - started > 12000) {
    window.clearInterval(poll);
    window.__ready = true; // let the driver report precise failures
  }
}, 50);
