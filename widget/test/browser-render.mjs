#!/usr/bin/env node
/**
 * Browser render gate for the generative-UI protocol (UiBlock).
 *
 * One driver: bundle the fixture with the repo's own esbuild, serve it on a
 * scratch port, drive it with headless Chromium at desktop and mobile
 * viewports, assert, tear down. Reproducing the evidence costs one command.
 *
 * Playwright is not a dependency of this package. It is resolved from an
 * override env var, then a bare require, then a known local install; if none
 * is present the script exits 2 with a one-line message rather than a stack
 * trace, so a missing tool is distinguishable from a failed assertion.
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
const PORT = Number(process.env.PORT || 3497);

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
const outdir = mkdtempSync(join(tmpdir(), "uiblock-fixture-"));
const bundle = join(outdir, "fixture.js");
const esbuild = join(ROOT, "node_modules", ".bin", "esbuild");
const build = spawnSync(
  esbuild,
  [
    join(ROOT, "test", "uiblock-fixture.tsx"),
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

const css = readFileSync(join(ROOT, "src", "styles.ts"), "utf8");
// styles.ts exports a template literal; take what is between the backticks.
const cssText = css.slice(css.indexOf("`") + 1, css.lastIndexOf("`"));

const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;font-family:system-ui}${cssText}</style>
</head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;

const server = createServer((req, res) => {
  if (req.url === "/fixture.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(readFileSync(bundle, "utf8"));
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

/* The widget must never call out. An <img src> on a product_card is expected
   and is the one legitimate outbound load; anything else — fetch, XHR, script,
   beacon — is a defect. Classified by resourceType, not blanket-counted. */
const requests = [];

async function open(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("request", (r) => {
    if (!r.url().startsWith(BASE)) requests.push({ url: r.url(), type: r.resourceType() });
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  return { ctx, page, errors };
}

/* ---------- desktop ---------- */
console.log("\n1440x900 (desktop)");
{
  const { ctx, page, errors } = await open({ width: 1440, height: 900 });

  const btnCase = page.locator('[data-case="buttons"]');
  check(
    "button_group renders a labelled group",
    (await btnCase.locator('[role="group"]').count()) === 1,
  );
  check("button_group renders 3 controls", (await btnCase.locator("button, a").count()) === 3);

  // send action emits exactly its text
  await btnCase.getByRole("button", { name: "Pricing" }).click();
  let sent = await page.evaluate(() => window.__sent);
  check(
    "send action emits its exact text",
    sent[sent.length - 1] === "Tell me about pricing",
    JSON.stringify(sent),
  );

  // link action is a real anchor, correctly attributed
  const link = btnCase.locator("a");
  check("link action renders an anchor", (await link.count()) === 1);
  check("anchor href is the https url", (await link.getAttribute("href")) === "https://example.com/docs");
  check("anchor rel is noopener noreferrer nofollow", (await link.getAttribute("rel")) === "noopener noreferrer nofollow");
  check('anchor target is _blank', (await link.getAttribute("target")) === "_blank");

  // tool action becomes a plain message, never a call
  await btnCase.getByRole("button", { name: "Book a call" }).click();
  sent = await page.evaluate(() => window.__sent);
  check(
    "tool action emits a plain message, not a call",
    sent[sent.length - 1] === "I want a call",
    JSON.stringify(sent),
  );

  // hostile URL never reaches href
  const hostile = page.locator('[data-case="buttons-hostile-url"]');
  check("javascript: url produces no anchor", (await hostile.locator("a").count()) === 0);
  const hostileHtml = await hostile.innerHTML();
  check("javascript: url appears nowhere in the DOM", !hostileHtml.includes("javascript:"));

  // hostile image src
  const hostileImg = page.locator('[data-case="card-hostile-image"]');
  check("javascript: imageUrl renders no img", (await hostileImg.locator("img").count()) === 0);

  // unknown component degrades to its sentence, not a blank
  const unknown = page.locator('[data-case="unknown"] .cc-ui-fallback');
  const unknownCount = await unknown.count();
  check("unknown component renders the text fallback", unknownCount === 1);
  check(
    "fallback carries the server sentence",
    unknownCount === 1 &&
      (await unknown.textContent()) === "We have three plans: Starter, Team and Enterprise.",
    unknownCount === 1 ? "" : "no fallback element to read",
  );
  check(
    "unknown component is not blank",
    ((await page.locator('[data-case="unknown"]').boundingBox())?.height ?? 0) > 5,
  );
  check(
    "empty button list degrades to text",
    (await page.locator('[data-case="empty-buttons"] .cc-ui-fallback').count()) === 1,
  );

  // lead form: labels bound, required gating, composed message
  const form = page.locator('[data-case="form"]');
  const labelBinding = await form.evaluate((el) => {
    const controls = [...el.querySelectorAll("input, textarea")];
    return controls.every((c) => {
      const l = c.id ? el.querySelector(`label[for="${c.id}"]`) : null;
      return Boolean(l && l.textContent && l.textContent.trim());
    });
  });
  check("every form control has a bound non-empty label", labelBinding);

  const submit = form.getByRole("button", { name: "Send it" });
  check("submit is disabled while a required field is empty", await submit.isDisabled());
  await form.locator("#cc-f-email").fill("a@b.test");
  check("submit enables once the required field is filled", await submit.isEnabled());
  await form.locator("#cc-f-note").fill("hello there");
  await submit.click();
  sent = await page.evaluate(() => window.__sent);
  check(
    "form composes Label: value lines",
    sent[sent.length - 1] === "Email: a@b.test\nNote: hello there",
    JSON.stringify(sent[sent.length - 1]),
  );
  check("submit locks after sending", await form.getByRole("button", { name: "Sent" }).isDisabled());

  check("product_card renders the https image", (await page.locator('[data-case="card"] img').count()) === 1);
  check("no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

/* ---------- mobile ---------- */
console.log("\n390x844 (mobile)");
{
  const { ctx, page, errors } = await open({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check(
    "no horizontal overflow",
    overflow.doc <= overflow.win,
    `scrollWidth ${overflow.doc} > innerWidth ${overflow.win}`,
  );

  const wide = await page.evaluate(() =>
    [...document.querySelectorAll("[data-case] *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => el.className || el.tagName),
  );
  check("no element extends past the viewport", wide.length === 0, wide.join(", "));

  // interaction still works at mobile width
  await page.locator('[data-case="handoff"]').getByRole("button", { name: "Talk to a human" }).click();
  const sent = await page.evaluate(() => window.__sent);
  check("handoff action works at mobile width", sent[sent.length - 1] === "Talk to a human");

  const tapTargets = await page.evaluate(() =>
    [...document.querySelectorAll("[data-case] button, [data-case] a")]
      .map((el) => el.getBoundingClientRect().height)
      .filter((h) => h > 0 && h < 24).length,
  );
  check("no control shorter than 24px", tapTargets === 0, `${tapTargets} undersized`);
  check("no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

/* ---------- network ---------- */
console.log("\nnetwork");
const nonImage = requests.filter((r) => r.type !== "image");
check(
  "the widget issued no non-image outbound request",
  nonImage.length === 0,
  nonImage.map((r) => `${r.type} ${r.url}`).join(", "),
);
check(
  "the only outbound loads are the declared card image",
  requests.every((r) => r.url === "https://example.com/w.png"),
  requests.map((r) => r.url).join(", "),
);

await browser.close();
cleanup();

console.log(`\n${checks - failures}/${checks} assertions passed`);
process.exit(failures === 0 ? 0 : 1);
