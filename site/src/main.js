/* concierge.repo.box — interview, configurator, export, docs.
 * Plain JS, no framework. The widget bundle (window.Concierge) is loaded
 * before this file by the page's deferred script order. */

const ENDPOINT = "/concierge/chat";
const VALIDATE_URL = "/concierge/brief/validate";
const SANDBOX_URL = "/concierge/sandbox/brief";
const EMBED_SRC = "https://concierge.repo.box/concierge/embed.js";
const CHAT_ABS = "https://concierge.repo.box/concierge/chat";
const DEFAULT_PAGE_ID = "concierge";

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ state */
const state = {
  preset: "midnight",
  accentColor: "#6d8bff",
  accentColor2: "",
  accent2auto: true,
  radiusScale: 1,
  density: "comfortable",
  launcher: "pill",
  position: "bottom-right",
  fontFamily: "",
  launcherLabel: "Ask AI",
  tagline: "Ask me anything",
  greeting: "Hi — ask me anything about this page.",
  suggestions: "What is this?|What does it cost?|How do I get started?",
  nudge: "",
  overrides: {},
  brief: null,
  briefValid: false,
  sandbox: null, // { pageId, expiresAt }
};

/* -------------------------------------------------------------- interview */
const QUESTIONS = [
  { key: "brandName", label: "What is the product called?", hint: "The name the assistant speaks for. Shown in the widget header.", placeholder: "Acme Robots" },
  { key: "audience", label: "Who is the visitor?", hint: "Shapes register, not content. Be specific.", placeholder: "plant managers evaluating palletising automation" },
  { key: "objective", label: "What should this page get them to do?", hint: "One action. The assistant steers towards it and never invents another.", placeholder: "book a 20-minute demo" },
  { key: "tone", label: "How should it sound?", hint: "A voice descriptor. Three or four words is plenty.", placeholder: "direct, technical, a little dry" },
  { key: "cta", label: "What is the call to action?", hint: "The label it points to when it cannot answer or the visitor is ready.", placeholder: "Book a demo (acme.example/demo)" },
  {
    key: "docs",
    label: "What is it allowed to know?",
    hint: "Tight, factual prose. State what the product does NOT do so it can refuse confidently. End with a LINKS: block of the exact URLs it may share — it can only cite links written here verbatim.",
    textarea: true,
    placeholder: "Acme sells palletising robots for food and beverage lines…\n\nLINKS:\nhttps://acme.example\nhttps://acme.example/demo",
  },
];
let stepIndex = 0;
const answers = { brandName: "", audience: "", objective: "", tone: "", cta: "", docs: "" };

function buildSteps() {
  const ol = $("steps");
  ol.innerHTML = "";
  QUESTIONS.forEach((q, i) => {
    const li = document.createElement("li");
    li.className = "step" + (i === 0 ? " active" : "");
    li.dataset.index = String(i);
    const id = "q-" + q.key;
    const field = q.textarea
      ? `<textarea id="${id}" placeholder="${escapeAttr(q.placeholder)}" spellcheck="false"></textarea>
         <div class="fetch-row"><input type="url" id="docs-url" placeholder="…or fetch plain text from a URL that allows cross-origin reads (llms.txt, raw GitHub)" /><button type="button" class="btn small" id="docs-fetch">Fetch</button></div>
         <p class="muted small" id="docs-fetch-status" aria-live="polite"></p>`
      : `<input type="text" id="${id}" placeholder="${escapeAttr(q.placeholder)}" autocomplete="off" />`;
    li.innerHTML = `<label for="${id}">${i + 1}. ${q.label}</label><p class="hint">${q.hint}</p>${field}`;
    ol.appendChild(li);
  });
  QUESTIONS.forEach((q) => {
    const el = $("q-" + q.key);
    el.addEventListener("input", () => {
      answers[q.key] = el.value;
      renderBrief();
    });
    if (!q.textarea) el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nextStep(); } });
  });
  $("docs-fetch").addEventListener("click", fetchDocs);
  $("step-back").addEventListener("click", () => showStep(stepIndex - 1));
  $("step-next").addEventListener("click", nextStep);
  showStep(0);
}

function showStep(i) {
  stepIndex = Math.max(0, Math.min(QUESTIONS.length - 1, i));
  document.querySelectorAll(".step").forEach((li) => li.classList.toggle("active", Number(li.dataset.index) === stepIndex));
  $("step-back").disabled = stepIndex === 0;
  $("step-next").textContent = stepIndex === QUESTIONS.length - 1 ? "Done" : "Next";
  $("step-count").textContent = `${stepIndex + 1} / ${QUESTIONS.length}`;
  const el = $("q-" + QUESTIONS[stepIndex].key);
  if (el && document.activeElement !== el) el.focus({ preventScroll: true });
}
function nextStep() {
  if (stepIndex < QUESTIONS.length - 1) showStep(stepIndex + 1);
  else { renderBrief(); $("brief-json").focus(); }
}

async function fetchDocs() {
  const url = $("docs-url").value.trim();
  const status = $("docs-fetch-status");
  if (!/^https?:\/\//i.test(url)) { status.textContent = "Enter an http(s) URL."; return; }
  status.textContent = "Fetching…";
  try {
    const res = await fetch(url, { mode: "cors", headers: { accept: "text/plain, text/markdown, text/*;q=0.9, */*;q=0.1" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let text = await res.text();
    if (/<html[\s>]/i.test(text)) text = htmlToText(text);
    text = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 8000);
    if (!text) throw new Error("empty response");
    $("q-docs").value = text;
    answers.docs = text;
    renderBrief();
    status.textContent = `Fetched ${text.length} characters. Trim it to what the assistant should actually know.`;
  } catch (err) {
    status.textContent = `Could not read that URL from the browser (${err.message}). Sites without CORS headers cannot be fetched client-side and this page has no server-side fetcher by design — paste the text instead.`;
  }
}
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript,svg,nav,footer").forEach((n) => n.remove());
  return (doc.body?.innerText || doc.body?.textContent || "").replace(/[ \t]+\n/g, "\n");
}

function currentBrief() {
  const b = {};
  for (const q of QUESTIONS) b[q.key] = (answers[q.key] || "").trim();
  return b;
}
function localErrors(b) {
  const errors = [];
  for (const q of QUESTIONS) if (!b[q.key]) errors.push(`${q.key} must not be empty`);
  return errors;
}

let validateTimer = null;
let validateSeq = 0;
function renderBrief() {
  const b = currentBrief();
  state.brief = b;
  $("brief-json").textContent = JSON.stringify(b, null, 2);
  const errors = localErrors(b);
  const pill = $("brief-status");
  const list = $("brief-errors");
  list.innerHTML = "";
  if (errors.length) {
    state.briefValid = false;
    pill.textContent = "incomplete";
    pill.className = "pill";
    $("brief-use").disabled = true;
    renderExport();
    return;
  }
  pill.textContent = "checking with server…";
  pill.className = "pill";
  clearTimeout(validateTimer);
  const seq = ++validateSeq;
  validateTimer = setTimeout(async () => {
    try {
      const res = await fetch(VALIDATE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
      const data = await res.json();
      if (seq !== validateSeq) return;
      if (data.ok) {
        state.briefValid = true;
        pill.textContent = "valid — server accepts it";
        pill.className = "pill ok";
        $("brief-use").disabled = false;
      } else {
        state.briefValid = false;
        pill.textContent = "rejected by server";
        pill.className = "pill bad";
        for (const e of data.errors || [`HTTP ${res.status}`]) { const li = document.createElement("li"); li.textContent = e; list.appendChild(li); }
        $("brief-use").disabled = true;
      }
    } catch (err) {
      if (seq !== validateSeq) return;
      pill.textContent = "server unreachable";
      pill.className = "pill bad";
      $("brief-use").disabled = true;
    }
    renderExport();
  }, 350);
  renderExport();
}

async function useBrief() {
  const status = $("sandbox-status");
  if (!state.briefValid) return;
  status.textContent = "Registering a 30-minute sandbox brief…";
  try {
    const res = await fetch(SANDBOX_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state.brief) });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error((data.errors && data.errors.join("; ")) || data.error || `HTTP ${res.status}`);
    state.sandbox = { pageId: data.pageId, expiresAt: data.expiresAt };
    // Copy the brief's voice into the preview defaults.
    $("tagline").value = state.tagline = `Ask about ${state.brief.brandName}`;
    $("launcherLabel").value = state.launcherLabel = `Ask ${state.brief.brandName}`;
    $("greeting").value = state.greeting = `Hi — ask me anything about ${state.brief.brandName}.`;
    status.textContent = `Preview now answers from your brief (page id ${data.pageId}, expires ${new Date(data.expiresAt).toLocaleTimeString()}). The sandbox is powerless: no tools, no retrieval, and nothing from the browser can change that.`;
    $("preview-brief").textContent = `brief: ${state.brief.brandName} (sandbox)`;
    $("preview-brief").className = "pill ok";
    renderPreview(true);
    renderExport();
    document.getElementById("configure").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    status.textContent = `Could not register the sandbox brief: ${err.message}`;
  }
}

/* ------------------------------------------------------------ configurator */
function presetSwatch(name) {
  const t = window.Concierge.THEME_PRESETS[name];
  return `<span class="swatch" style="background:${t["--cc-bg"]};box-shadow:inset 0 0 0 3px ${t["--cc-accent"]}"></span>`;
}
function buildPresets() {
  const wrap = $("presets");
  wrap.innerHTML = "";
  for (const name of Object.keys(window.Concierge.THEME_PRESETS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(name === state.preset));
    b.innerHTML = presetSwatch(name) + name;
    b.addEventListener("click", () => {
      state.preset = name;
      const accent = window.Concierge.THEME_PRESETS[name]["--cc-accent"];
      if (/^#[0-9a-f]{6}$/i.test(accent)) { state.accentColor = accent; $("accentColor").value = accent; }
      wrap.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      onConfigChange();
    });
    wrap.appendChild(b);
  }
}

function bindControls() {
  const bind = (id, key, parse = (v) => v) => {
    const el = $(id);
    el.addEventListener("input", () => { state[key] = parse(el.value); onConfigChange(); });
  };
  bind("accentColor", "accentColor");
  bind("accentColor2", "accentColor2");
  $("accent2auto").addEventListener("change", (e) => { state.accent2auto = e.target.checked; $("accentColor2").disabled = state.accent2auto; onConfigChange(); });
  $("accentColor2").disabled = true;
  bind("radiusScale", "radiusScale", Number);
  $("radiusScale").addEventListener("input", () => { $("radiusScaleOut").value = Number($("radiusScale").value).toFixed(2); });
  bind("density", "density");
  bind("launcher", "launcher");
  bind("position", "position");
  bind("fontFamily", "fontFamily");
  bind("launcherLabel", "launcherLabel");
  bind("tagline", "tagline");
  bind("greeting", "greeting");
  bind("suggestions", "suggestions");
  bind("nudge", "nudge");
  $("tokens-reset").addEventListener("click", () => { state.overrides = {}; onConfigChange(); });
}

function baseThemeOptions() {
  return {
    theme: state.preset,
    accentColor: state.accentColor,
    accentColor2: state.accent2auto ? undefined : state.accentColor2 || undefined,
    radiusScale: state.radiusScale,
    density: state.density,
    fontFamily: state.fontFamily || undefined,
  };
}

function buildTokenInputs() {
  const groups = {};
  for (const meta of window.Concierge.TOKEN_METADATA) (groups[meta.category] ||= []).push(meta);
  const wrap = $("token-groups");
  wrap.innerHTML = "";
  $("token-count").textContent = `(${window.Concierge.TOKEN_METADATA.length})`;
  for (const [cat, metas] of Object.entries(groups)) {
    const g = document.createElement("div");
    g.className = "token-group";
    g.innerHTML = `<h4>${cat}</h4>`;
    for (const meta of metas) {
      const row = document.createElement("div");
      row.className = "token-row";
      const id = "tok-" + meta.name.slice(5);
      row.innerHTML = `<label for="${id}" title="${escapeAttr(meta.description)}">${meta.name}</label><input id="${id}" data-token="${meta.name}" spellcheck="false" />`;
      g.appendChild(row);
    }
    wrap.appendChild(g);
  }
  wrap.addEventListener("change", (e) => {
    const input = e.target.closest("input[data-token]");
    if (!input) return;
    const v = input.value.trim();
    if (v) state.overrides[input.dataset.token] = v; else delete state.overrides[input.dataset.token];
    onConfigChange();
  });
  refreshTokenInputs();
}
function refreshTokenInputs() {
  const effective = window.Concierge.resolveThemeTokens({ ...baseThemeOptions(), themeVars: state.overrides });
  document.querySelectorAll("#token-groups input[data-token]").forEach((input) => {
    const name = input.dataset.token;
    if (document.activeElement === input) return;
    input.value = state.overrides[name] ?? effective[name] ?? "";
    input.classList.toggle("overridden", name in state.overrides);
  });
}

function previewProps(fresh) {
  const pageId = state.sandbox ? state.sandbox.pageId : DEFAULT_PAGE_ID;
  return {
    endpoint: ENDPOINT,
    pageId,
    position: "inline",
    brandName: state.sandbox ? state.brief.brandName : "Concierge",
    tagline: state.tagline,
    greeting: state.greeting,
    suggestions: state.suggestions.split("|").map((s) => s.trim()).filter(Boolean),
    launcher: state.launcher,
    launcherLabel: state.launcherLabel,
    nudge: state.nudge || undefined,
    theme: state.preset,
    accentColor: state.accentColor,
    accentColor2: state.accent2auto ? undefined : state.accentColor2 || undefined,
    radiusScale: state.radiusScale,
    density: state.density,
    fontFamily: state.fontFamily || undefined,
    themeVars: Object.keys(state.overrides).length ? { ...state.overrides } : undefined,
  };
}
function renderPreview(fresh) {
  const host = $("preview");
  if (fresh) window.Concierge.unmount(host);
  window.Concierge.mount(previewProps(fresh), { container: host });
}
function onConfigChange() {
  refreshTokenInputs();
  renderPreview(false);
  renderExport();
}

/* ------------------------------------------------------------------ export */
function exportAttrs() {
  const a = [
    ["data-endpoint", CHAT_ABS],
  ];
  if (state.sandbox) a.push(["data-page-id", "your-page-id"]);
  const brand = state.sandbox ? state.brief.brandName : "Your brand";
  a.push(["data-brand-name", brand]);
  a.push(["data-tagline", state.tagline]);
  a.push(["data-greeting", state.greeting]);
  a.push(["data-suggestions", state.suggestions]);
  a.push(["data-launcher", state.launcher]);
  a.push(["data-launcher-label", state.launcherLabel]);
  if (state.nudge) a.push(["data-nudge", state.nudge]);
  a.push(["data-position", state.position]);
  if (state.preset !== "midnight") a.push(["data-theme", state.preset]);
  a.push(["data-accent-color", state.accentColor]);
  if (!state.accent2auto && state.accentColor2) a.push(["data-accent-color2", state.accentColor2]);
  if (state.radiusScale !== 1) a.push(["data-radius-scale", String(state.radiusScale)]);
  if (state.density !== "comfortable") a.push(["data-density", state.density]);
  if (state.fontFamily) a.push(["data-font-family", state.fontFamily]);
  return a;
}
function renderExport() {
  const attrs = exportAttrs();
  const overrideNote = Object.keys(state.overrides).length
    ? `\n<!-- token overrides are not expressible as data-* attributes; mount manually instead:\n     Concierge.mount({ ...same props, themeVars: ${JSON.stringify(state.overrides)} }) -->`
    : "";
  $("export-script").textContent =
    `<script\n  defer\n  src="${EMBED_SRC}"\n` +
    attrs.map(([k, v]) => `  ${k}="${escapeAttr(v)}"`).join("\n") +
    `\n></script>` + overrideNote +
    (state.sandbox ? `\n<!-- point src/data-endpoint at YOUR server once you self-host; data-page-id selects the page in CONCIERGE_BRIEFS / a packet -->` : "");

  $("export-brief").textContent = JSON.stringify(state.brief && state.briefValid ? state.brief : exampleBrief(), null, 2);

  const props = [];
  for (const [k, v] of attrs) {
    const name = k.slice(5).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    if (name === "suggestions") props.push(`  suggestions={${JSON.stringify(v.split("|").map((s) => s.trim()).filter(Boolean))}}`);
    else if (name === "radiusScale") props.push(`  radiusScale={${v}}`);
    else props.push(`  ${name}=${JSON.stringify(v)}`);
  }
  if (Object.keys(state.overrides).length) props.push(`  themeVars={${JSON.stringify(state.overrides)}}`);
  $("export-react").textContent = `import { Concierge } from "@concierge/widget";\n\n<Concierge\n${props.join("\n")}\n/>`;
}
function exampleBrief() {
  return {
    brandName: "Your brand",
    audience: "who the visitor is",
    objective: "the one thing this page should get them to do",
    tone: "confident, plain-spoken",
    cta: "Start free trial",
    docs: "Everything the assistant is allowed to know, as tight factual prose. Say what the product does NOT do.\n\nLINKS:\nhttps://example.com\nhttps://example.com/pricing",
  };
}

function bindExport() {
  document.querySelectorAll(".tabs [role=tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tabs [role=tab]").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      document.querySelectorAll(".tabpanel").forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
    });
  });
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = $(btn.dataset.copy).textContent;
      try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; } catch { btn.textContent = "Select and copy"; }
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    });
  });
  $("brief-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("brief-json").textContent); $("brief-copy").textContent = "Copied"; } catch { $("brief-copy").textContent = "Select and copy"; }
    setTimeout(() => { $("brief-copy").textContent = "Copy JSON"; }, 1500);
  });
  $("brief-use").addEventListener("click", useBrief);
}

/* -------------------------------------------------------------------- docs */
const PROPS = [
  ["endpoint", "—", "URL of the server's /chat endpoint (required)"],
  ["pageId", "—", "Selects a brief when the server hosts several"],
  ["brandName", "Assistant", "Name shown in the header"],
  ["tagline", "Ask me anything", "Subtitle under the brand name"],
  ["logoUrl", "spark icon", "Header avatar image"],
  ["greeting", "generic", "The assistant's opening line"],
  ["suggestions", "none", "Starter chips (| separated in data-suggestions)"],
  ["placeholder", "Ask a question…", "Input placeholder"],
  ["launcher", "pill", "pill, bubble, bar, or inline-input"],
  ["launcherLabel", "Ask AI", "Text on the pill"],
  ["launcherIcon", "spark ✦", "Emoji to use instead of the spark icon"],
  ["avatar", "emoji", "Header avatar: emoji, none, or an image URL"],
  ["nudge", "none", "Proactive teaser bubble above the launcher"],
  ["nudgeDelay", "5000", "Delay (ms) before the nudge appears"],
  ["online", "true", "Show the live green dot on the avatar"],
  ["position", "bottom-right", "bottom-right | bottom-left | inline"],
  ["defaultOpen", "false", "Start expanded"],
  ["theme", "midnight", "Preset name or a partial token object (React)"],
  ["accentColor", "#6d8bff", "Primary accent (gradient, buttons, user bubbles)"],
  ["accentColor2", "tint of accent", "Second gradient stop"],
  ["themeVars", "—", "Override any --cc-* token directly (React)"],
  ["isolate", "true", "Mount in a shadow root; set false for the legacy global stylesheet"],
  ["radiusScale", "1", "Multiplier applied to radius tokens"],
  ["density", "comfortable", "comfortable or compact spacing and type scale"],
  ["fontFamily", "system stack", "Overrides --cc-font-family"],
  ["creditText / showCredit", "on", "The small line under the input"],
];
function dataName(prop) {
  return "data-" + prop.split(" / ")[0].replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}
function buildDocs() {
  const tbody = $("props-table").querySelector("tbody");
  for (const [prop, def, what] of PROPS) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><code>${prop}</code></td><td><code>${prop === "themeVars" ? "—" : dataName(prop)}</code></td><td>${escapeHtml(def)}</td><td>${escapeHtml(what)}</td>`;
    tbody.appendChild(tr);
  }
  const presets = window.Concierge.THEME_PRESETS;
  const names = Object.keys(presets).filter((n) => n !== "midnight");
  const tb = $("tokens-table").querySelector("tbody");
  for (const meta of window.Concierge.TOKEN_METADATA) {
    const mid = presets.midnight[meta.name] ?? "";
    const diffs = names.filter((n) => presets[n][meta.name] !== undefined && presets[n][meta.name] !== mid).map((n) => `${n} <code>${escapeHtml(presets[n][meta.name])}</code>`);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><code>${meta.name}</code></td><td>${meta.category}</td><td>${escapeHtml(meta.description)}</td><td class="val">${escapeHtml(mid)}</td><td class="val">${diffs.length ? diffs.join("; ") : "same unless overridden"}</td>`;
    tb.appendChild(tr);
  }
  $("docs-install-script").textContent = `<script defer src="https://your-host/concierge/embed.js"\n  data-endpoint="/concierge/chat"\n  data-brand-name="Frontier"\n  data-greeting="Ask me anything about Frontier."\n  data-suggestions="What is it?|How does copy liquidity work?"\n  data-launcher="pill" data-launcher-label="Ask Frontier"\n  data-accent-color="#35d07a" data-position="bottom-right"></script>`;
  $("docs-install-react").textContent = `import { Concierge } from "@concierge/widget";\n\n<Concierge endpoint="https://your-host/concierge/chat" brandName="Frontier"\n  greeting="Ask me anything about Frontier." launcher="pill" launcherLabel="Ask Frontier"\n  accentColor="#35d07a" theme="terminal" radiusScale={0.8} density="compact" />`;
  $("docs-brief-schema").textContent = JSON.stringify({
    brandName: "string — the brand the assistant represents",
    audience: "string — who the visitor is",
    objective: "string — what this page should get them to do",
    tone: "string — voice descriptor",
    cta: "string — the call-to-action label",
    docs: "string — digested knowledge; end with LINKS: and the exact URLs it may share",
    "capabilities?": { "retrieval?": { source: "inline | url", "docs?": ["…"], "url?": "https://…", "topK?": 3, "maxInjectedChars?": 4000 }, "tools?": ["capture_lead", "handoff_human"], "ui?": true },
  }, null, 2);
  $("docs-selfhost-code").textContent = `git clone https://github.com/yolo-maxi/concierge && cd concierge
pnpm install
cp server/.env.example server/.env   # VENICE_API_KEY + CONCIERGE_BRIEF=/path/brief.json
pnpm dev:server                      # proxy on :8787 — serves /chat, /embed.js, /health, /ready
pnpm build                           # widget lib + standalone embed
scripts/build-bundle.sh              # one server bundle + embed for a systemd unit
scripts/deploy.sh --dry-run|--staging <dir>|--apply|--rollback <backup>`;
  $("docs-capabilities-code").textContent = JSON.stringify({
    brandName: "Frontier", audience: "…", objective: "…", tone: "…", cta: "…",
    docs: "Small digested brief remains the baseline source of truth.",
    capabilities: { retrieval: { source: "url", url: "https://example.com/corpus.txt", topK: 3, maxInjectedChars: 4000 }, tools: ["capture_lead", "handoff_human"], ui: false },
  }, null, 2);
}

/* ------------------------------------------------------------------- hero */
function bindHero() {
  $("hero-ask").addEventListener("click", () => {
    const host = document.getElementById("concierge-embed-root");
    const root = host && host.firstElementChild && host.firstElementChild.shadowRoot;
    const btn = root ? root.querySelector("button.cc-launch") : host && host.querySelector("button");
    if (btn) { btn.click(); $("hero-status").textContent = ""; }
    else $("hero-status").textContent = "The widget has not loaded yet — check that /concierge/embed.js is reachable.";
  });
}

/* ------------------------------------------------------------------ utils */
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function escapeAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

/* ------------------------------------------------------------------- boot */
function boot() {
  if (!window.Concierge || !window.Concierge.TOKEN_METADATA) {
    $("hero-status").textContent = "The widget bundle did not load; the interactive sections need /concierge/embed.js.";
    return;
  }
  buildSteps();
  buildPresets();
  bindControls();
  buildTokenInputs();
  bindExport();
  buildDocs();
  bindHero();
  renderBrief();
  renderPreview(true);
  renderExport();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
