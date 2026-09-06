#!/usr/bin/env node
/**
 * Browser gate for the theming/isolation acceptance clauses of
 * fi_e9be0ff9ea5b9ebc9615.
 *
 * Those clauses name rendered behaviour — shadow-DOM isolation against a host
 * page with an aggressive CSS reset, 6 presets rendering, token composition —
 * and the package test runner (`tsx --test`) has no DOM, so nothing in the
 * suite can reach them. This is one driver: bundle the fixture with the repo's
 * own esbuild, serve it on a scratch port under a hostile global reset, drive
 * it with headless Chromium, assert, tear down.
 *
 * Playwright is not a dependency of this package; it is resolved from an
 * override env var, then a bare require, then a known local install. If none
 * is present the script exits 2 rather than reporting a failed assertion, so
 * "cannot run" is never mistaken for "red".
 *
 * Exit codes: 0 all assertions passed, 1 an assertion failed, 2 cannot run.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3498);

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    "/home/xiko/nomad-calendar/node_modules/playwright",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return require_(c);
    } catch {
      /* try next */
    }
  }
  console.error(
    "cannot run: playwright not resolvable. Set PLAYWRIGHT_MODULE=/abs/path/to/playwright or install it.",
  );
  process.exit(2);
}

/* ---------- assertions ---------- */
let failures = 0;
let checks = 0;
function check(name, ok, detail = "") {
  checks += 1;
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ---------- build ---------- */
const outdir = mkdtempSync(join(tmpdir(), "isolation-fixture-"));
const bundle = join(outdir, "fixture.js");
const esbuild = join(ROOT, "node_modules", ".bin", "esbuild");
const build = spawnSync(
  esbuild,
  [
    join(ROOT, "test", "isolation-fixture.tsx"),
    "--bundle",
    "--format=iife",
    "--target=es2019",
    `--outfile=${bundle}`,
  ],
  { encoding: "utf8" },
);
if (build.status !== 0) {
  console.error("cannot run: fixture bundle failed\n" + (build.stderr || build.stdout));
  rmSync(outdir, { recursive: true, force: true });
  process.exit(2);
}

/* The point of the isolation clause: a host page whose global CSS would wreck
   an unisolated widget. Everything here targets bare element selectors and
   uses !important, so any of it reaching inside the shadow root is a defect. */
const HOSTILE_RESET = `
  * { box-sizing: content-box !important; }
  div, span, p, button, input, h1, h2, h3, h4 {
    all: unset !important;
    font-family: "Comic Sans MS", cursive !important;
    color: #ff0000 !important;
    background: #00ff00 !important;
    border-radius: 0 !important;
    font-size: 41px !important;
    letter-spacing: 7px !important;
  }
  button { text-transform: uppercase !important; }
`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${HOSTILE_RESET}</style>
</head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;

const server = createServer((req, res) => {
  if (req.url === "/fixture.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(readFileSync(bundle, "utf8"));
    return;
  }
  if (req.url && req.url.startsWith("/no-such-endpoint")) {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("offline");
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(html);
});

const cleanup = () => {
  try {
    server.close();
  } catch {
    /* already closed */
  }
  rmSync(outdir, { recursive: true, force: true });
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

const { chromium } = loadPlaywright();

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(PORT, "127.0.0.1", resolve);
});
const BASE = `http://127.0.0.1:${PORT}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(BASE, { waitUntil: "load" });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });

const presets = await page.evaluate(() => window.__presets);

/* ---------- 1. shadow-DOM mount ---------- */
console.log("\nshadow-DOM isolation");
{
  const hostCount = await page.locator("[data-cc-shadow-host]").count();
  check("isolated instances create a shadow host", hostCount === presets.length + 2, `hosts=${hostCount}`);

  const shadowInfo = await page.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll("[data-cc-shadow-host]"));
    return {
      total: hosts.length,
      withRoot: hosts.filter((h) => h.shadowRoot).length,
      openMode: hosts.filter((h) => h.shadowRoot && h.shadowRoot.mode === "open").length,
      withStyles: hosts.filter((h) => h.shadowRoot?.querySelector("style[data-cc-styles]")).length,
      withMount: hosts.filter((h) => h.shadowRoot?.querySelector("[data-cc-shadow-mount] .cc-root")).length,
    };
  });
  check("every isolated host has an attached shadowRoot", shadowInfo.withRoot === shadowInfo.total, JSON.stringify(shadowInfo));
  check("shadow roots are mode=open", shadowInfo.openMode === shadowInfo.total, JSON.stringify(shadowInfo));
  check("each shadow root carries its own stylesheet", shadowInfo.withStyles === shadowInfo.total, JSON.stringify(shadowInfo));
  check("each shadow root mounted a .cc-root", shadowInfo.withMount === shadowInfo.total, JSON.stringify(shadowInfo));

  /* Styles must not leak OUT of an isolated instance. Scope this to the
     isolated cases only: the fixture also mounts a deliberate isolate={false}
     instance, which legitimately renders into the light DOM and injects
     #cc-styles. Counting document-wide would fail on the opt-out by design. */
  const leakedOut = await page.evaluate(() => {
    const isolatedWrappers = Array.from(
      document.querySelectorAll("[data-preset-case], [data-case='composed'], [data-case='token-object']"),
    );
    return {
      ccRootInLight: isolatedWrappers.reduce(
        (n, w) => n + w.querySelectorAll(":scope > .cc-root, :scope .cc-root").length,
        0,
      ),
      shadowRootsFound: isolatedWrappers.filter((w) =>
        w.querySelector("[data-cc-shadow-host]")?.shadowRoot?.querySelector(".cc-root"),
      ).length,
      isolatedWrappers: isolatedWrappers.length,
    };
  });
  check(
    "no isolated .cc-root leaks into the light DOM",
    leakedOut.ccRootInLight === 0,
    JSON.stringify(leakedOut),
  );
  check(
    "POSITIVE CONTROL: those same wrappers do render inside shadow roots",
    leakedOut.shadowRootsFound === leakedOut.isolatedWrappers,
    JSON.stringify(leakedOut),
  );
}

/* ---------- 2. host CSS does not bleed IN ---------- */
console.log("\nhostile host reset does not reach inside");
{
  /* Read computed style of the panel inside the first preset's shadow root and
     compare against the same properties on a light-DOM control element, which
     the reset definitely hits. The control proves the reset is live — without
     it, "not Comic Sans" could just mean the reset never applied. */
  const probe = await page.evaluate(() => {
    const host = document.querySelector('[data-preset-case="midnight"] [data-cc-shadow-host]');
    const panel = host?.shadowRoot?.querySelector(".cc-root");
    const control = document.createElement("div");
    control.textContent = "control";
    document.body.appendChild(control);
    const cs = panel ? getComputedStyle(panel) : null;
    const cc = getComputedStyle(control);
    const out = {
      control: {
        fontFamily: cc.fontFamily,
        color: cc.color,
        letterSpacing: cc.letterSpacing,
      },
      panel: cs
        ? {
            fontFamily: cs.fontFamily,
            color: cs.color,
            letterSpacing: cs.letterSpacing,
            boxSizing: cs.boxSizing,
          }
        : null,
    };
    control.remove();
    return out;
  });

  // positive control: the reset really is in force in the light DOM
  check(
    "POSITIVE CONTROL: hostile reset hits the light DOM",
    /Comic Sans/i.test(probe.control.fontFamily) && probe.control.letterSpacing === "7px",
    JSON.stringify(probe.control),
  );
  check("panel font-family is not the host's Comic Sans", probe.panel && !/Comic Sans/i.test(probe.panel.fontFamily), JSON.stringify(probe.panel));
  check("panel letter-spacing is not the host's 7px", probe.panel && probe.panel.letterSpacing !== "7px", JSON.stringify(probe.panel));
  check("panel color is not the host's red", probe.panel && probe.panel.color !== "rgb(255, 0, 0)", JSON.stringify(probe.panel));
  check("panel box-sizing is not the host's content-box", probe.panel && probe.panel.boxSizing === "border-box", JSON.stringify(probe.panel));
}

/* ---------- 3. six presets render, and render differently ---------- */
console.log("\npresets");
{
  check("six presets are exported", presets.length === 6, JSON.stringify(presets));

  const rendered = await page.evaluate((names) => {
    const out = {};
    for (const n of names) {
      const host = document.querySelector(`[data-preset-case="${n}"] [data-cc-shadow-host]`);
      const panel = host?.shadowRoot?.querySelector(".cc-root");
      if (!panel) {
        out[n] = null;
        continue;
      }
      const cs = getComputedStyle(panel);
      out[n] = {
        bg: cs.getPropertyValue("--cc-bg").trim(),
        text: cs.getPropertyValue("--cc-text").trim(),
        accent: cs.getPropertyValue("--cc-accent").trim(),
        visible: panel.getBoundingClientRect().height > 0,
      };
    }
    return out;
  }, presets);

  for (const n of presets) {
    check(`preset ${n} renders with a non-zero box`, rendered[n]?.visible === true, JSON.stringify(rendered[n]));
    check(`preset ${n} resolves --cc-bg`, !!rendered[n]?.bg, JSON.stringify(rendered[n]));
  }
  const bgs = new Set(presets.map((n) => rendered[n]?.bg));
  check("presets do not all share one background", bgs.size >= 4, JSON.stringify([...bgs]));
}

/* ---------- 4. theme composition ---------- */
console.log("\ntoken composition");
{
  const composed = await page.evaluate(() => {
    const host = document.querySelector('[data-case="composed"] [data-cc-shadow-host]');
    const panel = host?.shadowRoot?.querySelector(".cc-root");
    if (!panel) return null;
    const cs = getComputedStyle(panel);
    return {
      accent: cs.getPropertyValue("--cc-accent").trim(),
      radius: cs.getPropertyValue("--cc-radius-panel").trim(),
      text: cs.getPropertyValue("--cc-text").trim(),
      bg: cs.getPropertyValue("--cc-bg").trim(),
    };
  });
  check("accentColor overrides the preset accent", composed?.accent.toLowerCase() === "#ff0090", JSON.stringify(composed));
  check("themeVars override wins for --cc-radius-panel", composed?.radius === "3px", JSON.stringify(composed));
  check("themeVars override wins for --cc-text", composed?.text.toLowerCase() === "#010203", JSON.stringify(composed));
  check("untouched preset token survives composition", !!composed?.bg && composed.bg.toLowerCase() !== "#0c0f16", JSON.stringify(composed));

  const tokenObj = await page.evaluate(() => {
    const host = document.querySelector('[data-case="token-object"] [data-cc-shadow-host]');
    const panel = host?.shadowRoot?.querySelector(".cc-root");
    if (!panel) return null;
    const cs = getComputedStyle(panel);
    return { bg: cs.getPropertyValue("--cc-bg").trim(), text: cs.getPropertyValue("--cc-text").trim() };
  });
  check("partial token object applies its token", tokenObj?.bg.toLowerCase() === "#123456", JSON.stringify(tokenObj));
  check("partial token object falls back to midnight for the rest", !!tokenObj?.text, JSON.stringify(tokenObj));
}

/* ---------- 5. isolate={false} opt-out ---------- */
console.log("\nisolate={false} opt-out");
{
  const optOut = await page.evaluate(() => {
    const wrap = document.querySelector('[data-case="not-isolated"]');
    return {
      shadowHosts: wrap ? wrap.querySelectorAll("[data-cc-shadow-host]").length : -1,
      lightRoots: wrap ? wrap.querySelectorAll(".cc-root").length : -1,
      hostStyleTag: !!document.getElementById("cc-styles"),
    };
  });
  check("opt-out creates no shadow host", optOut.shadowHosts === 0, JSON.stringify(optOut));
  check("opt-out renders into the light DOM", optOut.lightRoots === 1, JSON.stringify(optOut));
  check("opt-out injects the stylesheet into the host document", optOut.hostStyleTag === true, JSON.stringify(optOut));
}

/* ---------- 6. no page errors ---------- */
console.log("\nruntime");
{
  // the fixture's endpoint deliberately 503s; chat network noise is not a defect
  const real = errors.filter((e) => !/503|Failed to fetch|NetworkError|offline/i.test(e));
  check("no uncaught page errors", real.length === 0, real.slice(0, 3).join(" | "));
}

await ctx.close();
await browser.close();
server.close();

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
