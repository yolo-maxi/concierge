#!/usr/bin/env node
/**
 * Browser gate for concierge.repo.box.
 *
 * Boots the built server bundle (dist-deploy/server.bundle.mjs) on a scratch
 * port with a two-page packet (frontier + concierge) and CONCIERGE_SANDBOX=1,
 * serves site/dist through scripts/serve-site.mjs (the Caddy stand-in), then
 * drives the page with headless Chromium at 1440x900 and 390x844.
 *
 * Asserts the item's acceptance clauses that can be proven locally:
 *   hero widget mounted with the concierge brief; interview → server-validated
 *   brief → sandbox registration → preview re-mounted on the sandbox page and
 *   answering from it (one live provider turn); configurator preset/accent
 *   changes reach the preview's tokens; export snippet reflects the config and
 *   renders the widget when pasted into a blank HTML file; docs tables come
 *   from the bundle's own metadata (77 tokens); no overflow at 390px; no page
 *   errors; no secret in served files.
 *
 * Env: CONCIERGE_PROD_ENV (default /home/xiko/concierge-deploy/concierge.env)
 * supplies the provider key; FRONTIER_BRIEF the frontier brief path.
 * Exit 0 pass · 1 assertion failed · 2 cannot run.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER_PORT = Number(process.env.SERVER_PORT || 3471);
const SITE_PORT = Number(process.env.SITE_PORT || 3472);
const PROD_ENV = process.env.CONCIERGE_PROD_ENV || "/home/xiko/concierge-deploy/concierge.env";
const FRONTIER_BRIEF = process.env.FRONTIER_BRIEF || "/home/xiko/concierge-deploy/frontier.brief.json";
const SHOTS = process.env.SHOT_DIR || "";

function loadPlaywright() {
  for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "/home/xiko/nomad-calendar/node_modules/playwright"].filter(Boolean)) {
    try { return require_(c); } catch { /* next */ }
  }
  console.error("cannot run: playwright not found (set PLAYWRIGHT_MODULE)");
  process.exit(2);
}
for (const f of [join(ROOT, "dist-deploy/server.bundle.mjs"), join(ROOT, "site/dist/index.html"), PROD_ENV, FRONTIER_BRIEF]) {
  if (!existsSync(f)) { console.error(`cannot run: missing ${f}`); process.exit(2); }
}

// LIVE_URL=https://concierge.repo.box runs the same page assertions against a
// deployed site instead of booting a local server (deployed browser smoke).
const LIVE_URL = (process.env.LIVE_URL || "").replace(/\/$/, "");
const work = mkdtempSync(join(tmpdir(), "concierge-site-gate-"));
const packet = {
  manifestVersion: 1,
  name: "concierge-repo-box-gate",
  defaultPageId: "frontier",
  pages: {
    frontier: JSON.parse(readFileSync(FRONTIER_BRIEF, "utf8")),
    concierge: JSON.parse(readFileSync(join(ROOT, "site/briefs/concierge.brief.json"), "utf8")),
  },
};
writeFileSync(join(work, "packet.json"), JSON.stringify(packet));
const env = Object.fromEntries(
  readFileSync(PROD_ENV, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l) && !/^TELEGRAM_|^CONCIERGE_BRIEF|^PORT=|^CONCIERGE_EMBED_FILE|^ALLOWED_ORIGINS/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const serverEnv = { ...process.env, ...env, PORT: String(SERVER_PORT), CONCIERGE_PACKET: join(work, "packet.json"), CONCIERGE_EMBED_FILE: join(ROOT, "dist-deploy/concierge-embed.js"), CONCIERGE_SANDBOX: "1", ALLOWED_ORIGINS: `http://127.0.0.1:${SITE_PORT}` };
let serverLog = "";
const server = LIVE_URL ? null : spawn(process.execPath, [join(ROOT, "dist-deploy/server.bundle.mjs")], { env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
server?.stdout.on("data", (d) => (serverLog += d));
server?.stderr.on("data", (d) => (serverLog += d));
const site = LIVE_URL ? null : spawn(process.execPath, [join(ROOT, "scripts/serve-site.mjs"), "--port", String(SITE_PORT), "--upstream", `http://127.0.0.1:${SERVER_PORT}`], { stdio: "ignore" });

async function waitFor(url, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`not ready: ${url}`);
}

let fails = 0;
const ok = (what, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${what}`); if (!cond) fails++; };

const cleanup = () => { server?.kill(); site?.kill(); rmSync(work, { recursive: true, force: true }); };
process.on("exit", cleanup);

try {
  const base = LIVE_URL || `http://127.0.0.1:${SITE_PORT}`;
  if (!LIVE_URL) await waitFor(`http://127.0.0.1:${SERVER_PORT}/health`);
  await waitFor(`${base}/`);
  console.log(`target: ${base}`);

  // Served artifacts: no key, no source map, embed proxied byte-identical.
  const key = env.VENICE_API_KEY || "";
  for (const f of ["/", "/main.js", "/styles.css"]) {
    const t = await (await fetch(base + f)).text();
    ok(`${f} carries no provider key`, !key || !t.includes(key));
    ok(`${f} has no sourceMappingURL`, !t.includes("sourceMappingURL"));
  }
  const served = await (await fetch(base + "/concierge/embed.js")).text();
  ok("/concierge/embed.js is the built bundle", served === readFileSync(join(ROOT, "dist-deploy/concierge-embed.js"), "utf8"));
  if (LIVE_URL) ok("live embed carries the configurator API", /resolveThemeTokens/.test(served));
  ok("validate endpoint reachable through the site proxy", (await fetch(base + "/concierge/brief/validate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status === 422);

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(base + "/", { waitUntil: "networkidle" });

  // Hero widget: floating, concierge brief, opens.
  const hero = await page.evaluate(() => {
    const host = document.getElementById("concierge-embed-root");
    const r = host && host.firstElementChild && host.firstElementChild.shadowRoot;
    const btn = r && r.querySelector("button.cc-launch");
    return { mounted: !!r, label: btn ? btn.textContent.trim() : "" };
  });
  ok("hero widget mounted in a shadow root", hero.mounted);
  ok("hero launcher reads 'Ask Concierge'", hero.label === "Ask Concierge");
  await page.click("#hero-ask");
  await page.waitForTimeout(400);
  ok("hero button opens the panel", await page.evaluate(() => !!document.getElementById("concierge-embed-root").firstElementChild.shadowRoot.querySelector(".cc-panel")));

  // Docs generated from the bundle.
  const docs = await page.evaluate(() => ({ tokens: document.querySelectorAll("#tokens-table tbody tr").length, props: document.querySelectorAll("#props-table tbody tr").length, tokenInputs: document.querySelectorAll("#token-groups input[data-token]").length }));
  ok(`docs token table has 77 rows (got ${docs.tokens})`, docs.tokens === 77);
  ok(`configurator exposes 77 token inputs (got ${docs.tokenInputs})`, docs.tokenInputs === 77);
  ok("props table populated", docs.props > 20);

  // Preview mounted inline with the concierge brief, before any interview.
  const previewBefore = await page.evaluate(() => {
    const host = document.getElementById("preview");
    const r = host.shadowRoot || host.querySelector("*")?.shadowRoot;
    const root = host.querySelector("[style]");
    return { mounted: !!host.firstElementChild, panel: !!host.firstElementChild?.shadowRoot?.querySelector(".cc-panel") };
  });
  ok("preview widget mounted inline", previewBefore.mounted && previewBefore.panel);

  // Interview → brief → validated by server → sandbox → preview answers from it.
  const brief = { brandName: "Acme Robots", audience: "plant managers", objective: "book a demo", tone: "direct and technical", cta: "Book a demo at acme.example/demo", docs: "Acme Robots sells palletising robots for food and beverage lines. The flagship model is the PX-9, which stacks 1,400 cases per hour. Lead time is six weeks. Acme does not sell conveyors or forklifts.\n\nLINKS:\nhttps://acme.example\nhttps://acme.example/demo" };
  for (const [key, val] of Object.entries(brief)) {
    await page.fill("#q-" + key, val);
    await page.click("#step-next");
  }
  await page.waitForFunction(() => document.getElementById("brief-status").textContent.startsWith("valid"), null, { timeout: 10000 });
  const briefJson = JSON.parse(await page.textContent("#brief-json"));
  ok("interview emits the brief as JSON", briefJson.brandName === "Acme Robots" && briefJson.docs.includes("LINKS:"));
  ok("server validated the brief", (await page.textContent("#brief-status")).startsWith("valid"));
  await page.click("#brief-use");
  await page.waitForFunction(() => document.getElementById("sandbox-status").textContent.includes("page id sandbox-"), null, { timeout: 10000 });
  ok("sandbox brief registered and preview retargeted", (await page.textContent("#preview-brief")).includes("Acme Robots"));

  // One live turn through the real proxy: the answer must come from the sandbox brief.
  await page.evaluate(() => {
    const r = document.getElementById("preview").firstElementChild.shadowRoot;
    const input = r.querySelector("textarea, input");
    const setter = Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set;
    setter.call(input, "How many cases per hour does the PX-9 stack, and what is the lead time?");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    r.querySelector("button.cc-send, button[type=submit], .cc-send").click();
  });
  let answer = "";
  try {
    await page.waitForFunction(() => {
      const r = document.getElementById("preview").firstElementChild.shadowRoot;
      const bubbles = [...r.querySelectorAll(".cc-msg.cc-bot, .cc-bot, .cc-agent")];
      const last = bubbles[bubbles.length - 1];
      return last && /1,?400|six weeks/i.test(last.textContent);
    }, null, { timeout: 60000 });
    answer = await page.evaluate(() => { const r = document.getElementById("preview").firstElementChild.shadowRoot; const b = [...r.querySelectorAll(".cc-msg.cc-bot, .cc-bot, .cc-agent")]; return b[b.length - 1].textContent; });
  } catch { answer = await page.evaluate(() => document.getElementById("preview").firstElementChild.shadowRoot.textContent.slice(-400)); }
  ok(`preview answered from the sandbox brief (${answer.slice(0, 80).replace(/\s+/g, " ")}…)`, /1,?400|six weeks/i.test(answer));

  // Configurator → preview tokens.
  await page.click("#presets button:has-text('terminal')");
  await page.waitForTimeout(200);
  const tokenAfterPreset = await page.evaluate(() => getComputedStyle(document.getElementById("preview").firstElementChild.shadowRoot.querySelector(".cc-root")).getPropertyValue("--cc-bg").trim());
  ok(`terminal preset reaches the preview (--cc-bg=${tokenAfterPreset})`, tokenAfterPreset === "#050805");
  await page.evaluate(() => { const el = document.getElementById("accentColor"); el.value = "#ff0066"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForTimeout(200);
  const accent = await page.evaluate(() => getComputedStyle(document.getElementById("preview").firstElementChild.shadowRoot.querySelector(".cc-root")).getPropertyValue("--cc-accent").trim());
  ok(`accent change reaches the preview (--cc-accent=${accent})`, accent === "#ff0066");
  await page.evaluate(() => { const el = document.querySelector('#token-groups input[data-token="--cc-radius-panel"]'); el.value = "3px"; el.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.waitForTimeout(200);
  const radius = await page.evaluate(() => getComputedStyle(document.getElementById("preview").firstElementChild.shadowRoot.querySelector(".cc-root")).getPropertyValue("--cc-radius-panel").trim());
  ok(`token override reaches the preview (--cc-radius-panel=${radius})`, radius === "3px");

  // Export reflects config.
  const snippet = await page.textContent("#export-script");
  ok("export snippet carries theme, accent and brand", snippet.includes('data-theme="terminal"') && snippet.includes('data-accent-color="#ff0066"') && snippet.includes('data-brand-name="Acme Robots"'));
  ok("export snippet points at the public embed and chat endpoint", snippet.includes("https://concierge.repo.box/concierge/embed.js") && snippet.includes("https://concierge.repo.box/concierge/chat"));
  const exportedBrief = JSON.parse(await page.textContent("#export-brief"));
  ok("export brief tab carries the interview brief", exportedBrief.brandName === "Acme Robots");
  const react = await page.textContent("#export-react");
  ok("react export lists the same props", react.includes('theme="terminal"') && react.includes("themeVars="));

  // Paste the snippet into a blank HTML file: it must render the configured widget.
  const local = snippet.replace("https://concierge.repo.box/concierge/embed.js", base + "/concierge/embed.js").replace("https://concierge.repo.box/concierge/chat", base + "/concierge/chat").replace(/<!--[\s\S]*?-->/g, "");
  const pasteHtml = `<!doctype html><title>paste</title><p>blank host page</p>${local}`;
  const blank = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  // Serve the blank host page from the site's own origin so the relative and
  // absolute endpoints behave as they would for a real embedder.
  await blank.route(base + "/__paste-test.html", (route) => route.fulfill({ status: 200, contentType: "text/html", body: pasteHtml }));
  await blank.goto(base + "/__paste-test.html", { waitUntil: "networkidle" });
  await blank.waitForTimeout(500);
  const pasted = await blank.evaluate(() => { const r = document.getElementById("concierge-embed-root")?.firstElementChild?.shadowRoot; const root = r && r.querySelector(".cc-root"); return { mounted: !!root, bg: root ? getComputedStyle(root).getPropertyValue("--cc-bg").trim() : "", label: r ? r.querySelector("button.cc-launch")?.textContent.trim() : "" }; });
  ok(`pasted snippet renders the configured widget (theme bg=${pasted.bg}, label=${pasted.label})`, pasted.mounted && pasted.bg === "#050805" && pasted.label === "Ask Acme Robots");
  await blank.close();

  if (SHOTS) await page.screenshot({ path: join(SHOTS, "concierge-site-1440.png"), fullPage: false });
  ok("no page errors at 1440x900", errors.length === 0);
  if (errors.length) console.log(errors.join("\n"));
  await page.close();

  // Mobile.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const merrors = [];
  mobile.on("pageerror", (e) => merrors.push(e.message));
  await mobile.goto(base + "/", { waitUntil: "networkidle" });
  const m = await mobile.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, hero: !!document.getElementById("concierge-embed-root")?.firstElementChild?.shadowRoot?.querySelector("button.cc-launch"), preview: !!document.getElementById("preview").firstElementChild?.shadowRoot?.querySelector(".cc-panel") }));
  ok("390px: no horizontal overflow", !m.overflow);
  ok("390px: hero widget and inline preview present", m.hero && m.preview);
  ok("390px: no page errors", merrors.length === 0);
  if (SHOTS) await mobile.screenshot({ path: join(SHOTS, "concierge-site-390.png"), fullPage: false });
  await mobile.close();
  await browser.close();
} catch (err) {
  console.error("gate crashed:", err);
  console.error(serverLog.slice(-2000));
  fails++;
}
console.log(fails ? `SITE GATE FAILED (${fails})` : "SITE GATE PASSED");
process.exit(fails ? 1 : 0);
