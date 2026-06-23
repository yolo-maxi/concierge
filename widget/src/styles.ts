/**
 * Default look. Everything is driven by CSS variables (prefixed --cc-) so a
 * consumer can restyle the whole widget by overriding a handful of tokens,
 * or pass `className`/`style` for deeper control. Dark, glassy, modern by default.
 */
export const CSS = `
.cc-root {
  --cc-accent: #5b8cff;
  --cc-accent-ink: #ffffff;
  --cc-bg: #0e1117;
  --cc-surface: #161b22;
  --cc-surface-2: #1f2630;
  --cc-text: #e6edf3;
  --cc-muted: #8b949e;
  --cc-border: rgba(255,255,255,0.08);
  --cc-radius: 18px;
  --cc-shadow: 0 24px 60px -12px rgba(0,0,0,0.55);
  --cc-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  position: fixed;
  z-index: 2147483000;
  font-family: var(--cc-font);
  box-sizing: border-box;
}
.cc-root *, .cc-root *::before, .cc-root *::after { box-sizing: border-box; }
.cc-root.cc-br { right: 22px; bottom: 22px; }
.cc-root.cc-bl { left: 22px; bottom: 22px; }
.cc-root.cc-inline { position: relative; right: auto; bottom: auto; width: 100%; }

.cc-bubble {
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--cc-accent); color: var(--cc-accent-ink);
  border: none; cursor: pointer; display: grid; place-items: center;
  box-shadow: var(--cc-shadow); transition: transform .18s ease, box-shadow .18s ease;
}
.cc-bubble:hover { transform: translateY(-2px) scale(1.04); }
.cc-bubble svg { width: 26px; height: 26px; }

.cc-panel {
  width: 380px; max-width: calc(100vw - 32px);
  height: 560px; max-height: calc(100vh - 110px);
  background: var(--cc-bg); color: var(--cc-text);
  border: 1px solid var(--cc-border); border-radius: var(--cc-radius);
  box-shadow: var(--cc-shadow); display: flex; flex-direction: column;
  overflow: hidden; animation: cc-pop .18s ease;
}
.cc-root.cc-inline .cc-panel { height: 520px; width: 100%; animation: none; }
@keyframes cc-pop { from { opacity: 0; transform: translateY(8px) scale(.98);} to { opacity:1; transform: none; } }

.cc-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--cc-border);
  background: linear-gradient(180deg, var(--cc-surface), var(--cc-bg));
}
.cc-logo { width: 30px; height: 30px; border-radius: 9px; object-fit: cover;
  background: var(--cc-surface-2); display: grid; place-items: center; font-weight: 700; color: var(--cc-accent); }
.cc-title { font-size: 14px; font-weight: 650; line-height: 1.1; }
.cc-sub { font-size: 11px; color: var(--cc-muted); margin-top: 2px; }
.cc-x { margin-left: auto; background: none; border: none; color: var(--cc-muted);
  cursor: pointer; font-size: 20px; line-height: 1; padding: 4px; border-radius: 8px; }
.cc-x:hover { color: var(--cc-text); background: var(--cc-surface-2); }

.cc-scroll { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.cc-scroll::-webkit-scrollbar { width: 8px; }
.cc-scroll::-webkit-scrollbar-thumb { background: var(--cc-surface-2); border-radius: 8px; }

.cc-msg { max-width: 86%; padding: 10px 13px; border-radius: 14px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
.cc-msg.cc-user { align-self: flex-end; background: var(--cc-accent); color: var(--cc-accent-ink); border-bottom-right-radius: 5px; }
.cc-msg.cc-bot { align-self: flex-start; background: var(--cc-surface); border: 1px solid var(--cc-border); border-bottom-left-radius: 5px; }

.cc-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 2px; }
.cc-chip { font-size: 12.5px; padding: 7px 11px; border-radius: 999px; cursor: pointer;
  background: var(--cc-surface-2); border: 1px solid var(--cc-border); color: var(--cc-text); transition: border-color .15s; }
.cc-chip:hover { border-color: var(--cc-accent); }

.cc-dots { display: inline-flex; gap: 4px; align-items: center; }
.cc-dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--cc-muted); animation: cc-blink 1.2s infinite; }
.cc-dots span:nth-child(2){ animation-delay:.2s } .cc-dots span:nth-child(3){ animation-delay:.4s }
@keyframes cc-blink { 0%,60%,100%{ opacity:.25 } 30%{ opacity:1 } }

.cc-foot { padding: 12px; border-top: 1px solid var(--cc-border); display: flex; gap: 8px; }
.cc-input { flex: 1; background: var(--cc-surface); border: 1px solid var(--cc-border);
  color: var(--cc-text); border-radius: 12px; padding: 11px 13px; font-size: 14px; font-family: inherit; resize: none; outline: none; max-height: 110px; }
.cc-input:focus { border-color: var(--cc-accent); }
.cc-send { background: var(--cc-accent); color: var(--cc-accent-ink); border: none; border-radius: 12px;
  width: 42px; cursor: pointer; display: grid; place-items: center; transition: opacity .15s; }
.cc-send:disabled { opacity: .45; cursor: default; }
.cc-send svg { width: 18px; height: 18px; }
.cc-credit { text-align: center; font-size: 10.5px; color: var(--cc-muted); padding: 0 0 8px; }
`;
