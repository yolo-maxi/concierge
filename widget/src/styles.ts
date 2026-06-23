/**
 * Default look. Everything is driven by CSS variables (prefixed --cc-) so a
 * consumer can restyle the whole widget by overriding a handful of tokens, or
 * pass `className`/`style`/`themeVars` for deeper control.
 *
 * The default is a dark, glassy, slightly luminous theme that reads as "smart
 * concierge" rather than "support ticket" — a gradient/glow launcher, an
 * optional proactive nudge, an avatar with a live dot, and soft motion.
 * A `light` preset ships too (set data-theme="light" / theme="light").
 */
export const CSS = `
.cc-root {
  --cc-accent: #6d8bff;
  --cc-accent-2: color-mix(in oklab, var(--cc-accent) 62%, #b07bff 38%);
  --cc-accent-ink: #ffffff;
  --cc-glow: color-mix(in srgb, var(--cc-accent) 55%, transparent);
  --cc-bg: #0c0f16;
  --cc-surface: #151b25;
  --cc-surface-2: #1e2632;
  --cc-text: #eef2f8;
  --cc-muted: #94a0b1;
  --cc-border: rgba(255,255,255,0.09);
  --cc-radius: 20px;
  --cc-shadow: 0 28px 70px -16px rgba(0,0,0,0.62);
  --cc-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  position: fixed;
  z-index: 2147483000;
  font-family: var(--cc-font);
  box-sizing: border-box;
}
.cc-root *, .cc-root *::before, .cc-root *::after { box-sizing: border-box; }
.cc-root.cc-br { right: 24px; bottom: 24px; }
.cc-root.cc-bl { left: 24px; bottom: 24px; }
.cc-root.cc-bl .cc-launchwrap, .cc-root.cc-bl .cc-nudge { align-items: flex-start; }
.cc-root.cc-inline { position: relative; right: auto; bottom: auto; width: 100%; }

/* ---- Launcher ---- */
.cc-launchwrap { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
.cc-launch {
  position: relative; display: inline-flex; align-items: center; gap: 9px;
  height: 56px; padding: 0 6px; border-radius: 999px; cursor: pointer;
  color: var(--cc-accent-ink); border: none;
  background: linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent));
  box-shadow: var(--cc-shadow), 0 8px 28px -6px var(--cc-glow);
  transition: transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s ease, filter .2s ease;
  animation: cc-rise .4s cubic-bezier(.2,.8,.2,1) both;
}
.cc-launch.cc-pill { padding: 0 20px 0 8px; }
.cc-launch.cc-circle { width: 56px; padding: 0; justify-content: center; }
.cc-launch.cc-circle .cc-launch-ic { width: 56px; height: 56px; background: transparent; }
.cc-launch.cc-circle .cc-launch-ic svg { width: 27px; height: 27px; }
.cc-launch.cc-circle .cc-launch-ic .cc-emoji { font-size: 25px; }
.cc-launch:hover { transform: translateY(-2px); filter: brightness(1.06);
  box-shadow: var(--cc-shadow), 0 12px 34px -4px var(--cc-glow); }
.cc-launch:active { transform: translateY(0) scale(.98); }
.cc-launch-ic { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
  background: rgba(255,255,255,0.16); }
.cc-launch-ic svg { width: 24px; height: 24px; }
.cc-launch-ic .cc-emoji { font-size: 22px; line-height: 1; }
.cc-launch-label { font-size: 15px; font-weight: 650; letter-spacing: .1px; padding-right: 4px; white-space: nowrap; }
/* one-time attention pulse */
.cc-launch::after { content: ""; position: absolute; inset: 0; border-radius: inherit;
  box-shadow: 0 0 0 0 var(--cc-glow); animation: cc-pulse 2.6s ease-out 3; pointer-events: none; }
@keyframes cc-pulse { 0% { box-shadow: 0 0 0 0 var(--cc-glow); } 70%,100% { box-shadow: 0 0 0 16px transparent; } }
@keyframes cc-rise { from { opacity: 0; transform: translateY(14px) scale(.92); } to { opacity: 1; transform: none; } }

/* ---- Proactive nudge ---- */
.cc-nudge {
  position: relative; max-width: 270px; margin-bottom: 2px;
  background: var(--cc-surface); color: var(--cc-text);
  border: 1px solid var(--cc-border); border-radius: 16px; border-bottom-right-radius: 6px;
  padding: 13px 30px 13px 14px; font-size: 13.5px; line-height: 1.45;
  box-shadow: var(--cc-shadow); cursor: pointer;
  animation: cc-rise .35s cubic-bezier(.2,.8,.2,1) both;
}
.cc-nudge:hover { border-color: color-mix(in srgb, var(--cc-accent) 50%, var(--cc-border)); }
.cc-nudge-x { position: absolute; top: 6px; right: 7px; background: none; border: none;
  color: var(--cc-muted); cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 6px; }
.cc-nudge-x:hover { color: var(--cc-text); background: var(--cc-surface-2); }

/* ---- Panel ---- */
.cc-panel {
  width: 392px; max-width: calc(100vw - 32px);
  height: 580px; max-height: calc(100vh - 120px);
  background: var(--cc-bg); color: var(--cc-text);
  border: 1px solid var(--cc-border); border-radius: var(--cc-radius);
  box-shadow: var(--cc-shadow); display: flex; flex-direction: column;
  overflow: hidden; animation: cc-pop .22s cubic-bezier(.2,.8,.2,1);
  transform-origin: bottom right;
}
.cc-root.cc-bl .cc-panel { transform-origin: bottom left; }
.cc-root.cc-inline .cc-panel { height: 540px; width: 100%; animation: none; }
@keyframes cc-pop { from { opacity: 0; transform: translateY(12px) scale(.96);} to { opacity:1; transform: none; } }

.cc-head {
  position: relative; display: flex; align-items: center; gap: 11px;
  padding: 15px 16px; border-bottom: 1px solid var(--cc-border);
  background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--cc-accent) 22%, transparent), transparent 60%),
    linear-gradient(180deg, var(--cc-surface), var(--cc-bg));
}
.cc-logo { position: relative; width: 36px; height: 36px; border-radius: 11px; object-fit: cover; flex: none;
  background: linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent)); color: var(--cc-accent-ink);
  display: grid; place-items: center; font-weight: 700; font-size: 16px;
  box-shadow: 0 6px 18px -6px var(--cc-glow); }
.cc-logo .cc-dot { position: absolute; right: -2px; bottom: -2px; width: 11px; height: 11px; border-radius: 50%;
  background: #36d07a; border: 2px solid var(--cc-bg); }
.cc-logo svg { width: 20px; height: 20px; }
.cc-logo .cc-emoji { font-size: 18px; line-height: 1; }
.cc-htext { min-width: 0; }
.cc-title { font-size: 14.5px; font-weight: 680; line-height: 1.15; }
.cc-sub { font-size: 11.5px; color: var(--cc-muted); margin-top: 2px; }
.cc-x { margin-left: auto; background: none; border: none; color: var(--cc-muted);
  cursor: pointer; font-size: 21px; line-height: 1; padding: 5px; border-radius: 9px; flex: none; }
.cc-x:hover { color: var(--cc-text); background: var(--cc-surface-2); }

.cc-scroll { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth; }
.cc-scroll::-webkit-scrollbar { width: 8px; }
.cc-scroll::-webkit-scrollbar-thumb { background: var(--cc-surface-2); border-radius: 8px; }

.cc-msg { max-width: 86%; padding: 10px 13px; border-radius: 15px; font-size: 14px; line-height: 1.5;
  white-space: pre-wrap; word-wrap: break-word; animation: cc-msg-in .2s ease both; }
@keyframes cc-msg-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.cc-msg.cc-user { align-self: flex-end; color: var(--cc-accent-ink); border-bottom-right-radius: 5px;
  background: linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent)); }
.cc-msg.cc-bot { align-self: flex-start; background: var(--cc-surface); border: 1px solid var(--cc-border); border-bottom-left-radius: 5px; }
.cc-msg.cc-bot a { color: color-mix(in srgb, var(--cc-accent) 75%, #fff 25%); text-decoration: underline;
  text-underline-offset: 2px; font-weight: 600; word-break: break-word; }
.cc-msg.cc-bot a:hover { opacity: 0.85; }

.cc-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 4px; }
.cc-chip { font-size: 12.5px; padding: 8px 12px; border-radius: 999px; cursor: pointer; color: var(--cc-text);
  background: var(--cc-surface-2); border: 1px solid var(--cc-border); transition: border-color .15s, background .15s, transform .12s; }
.cc-chip:hover { border-color: var(--cc-accent); background: color-mix(in srgb, var(--cc-accent) 12%, var(--cc-surface-2)); transform: translateY(-1px); }

.cc-dots { display: inline-flex; gap: 4px; align-items: center; }
.cc-dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--cc-muted); animation: cc-blink 1.2s infinite; }
.cc-dots span:nth-child(2){ animation-delay:.2s } .cc-dots span:nth-child(3){ animation-delay:.4s }
@keyframes cc-blink { 0%,60%,100%{ opacity:.25 } 30%{ opacity:1 } }

.cc-foot { padding: 12px; border-top: 1px solid var(--cc-border); display: flex; gap: 8px; align-items: flex-end; }
.cc-input { flex: 1; background: var(--cc-surface); border: 1px solid var(--cc-border);
  color: var(--cc-text); border-radius: 13px; padding: 11px 13px; font-size: 14px; font-family: inherit;
  resize: none; outline: none; max-height: 110px; transition: border-color .15s, box-shadow .15s; }
.cc-input::placeholder { color: var(--cc-muted); }
.cc-input:focus { border-color: var(--cc-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cc-accent) 22%, transparent); }
.cc-send { background: linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent)); color: var(--cc-accent-ink);
  border: none; border-radius: 13px; height: 42px; width: 44px; cursor: pointer; display: grid; place-items: center;
  transition: opacity .15s, transform .12s, filter .15s; }
.cc-send:not(:disabled):hover { filter: brightness(1.08); transform: translateY(-1px); }
.cc-send:disabled { opacity: .4; cursor: default; }
.cc-send svg { width: 18px; height: 18px; }
.cc-credit { text-align: center; font-size: 10.5px; color: var(--cc-muted); padding: 0 0 9px; }
.cc-credit b { color: color-mix(in srgb, var(--cc-accent) 70%, var(--cc-muted)); font-weight: 600; }

/* ---- Light preset ---- */
.cc-root.cc-theme-light {
  --cc-bg: #ffffff; --cc-surface: #f5f7fb; --cc-surface-2: #eaeef5;
  --cc-text: #131720; --cc-muted: #5d6b7e; --cc-border: rgba(10,20,40,0.10);
  --cc-shadow: 0 24px 60px -18px rgba(20,30,60,0.28);
}

@media (prefers-reduced-motion: reduce) {
  .cc-launch, .cc-nudge, .cc-panel, .cc-msg { animation: none !important; }
  .cc-launch::after { animation: none !important; }
}
`;
