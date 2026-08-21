export const CSS = `
.cc-root {
  position: fixed;
  z-index: var(--cc-z-index);
  font-family: var(--cc-font-family);
  box-sizing: border-box;
  color: var(--cc-text);
  font-size: var(--cc-font-size);
  line-height: var(--cc-line-height);
}
.cc-root *, .cc-root *::before, .cc-root *::after { box-sizing: border-box; }
.cc-root.cc-br { right: var(--cc-offset-x); bottom: var(--cc-offset-y); }
.cc-root.cc-bl { left: var(--cc-offset-x); bottom: var(--cc-offset-y); }
.cc-root.cc-bl .cc-launchwrap, .cc-root.cc-bl .cc-nudge { align-items: flex-start; }
.cc-root.cc-inline { position: relative; right: auto; bottom: auto; width: 100%; }

.cc-launchwrap { display: flex; flex-direction: column; align-items: flex-end; gap: calc(var(--cc-space-unit) * 3); }
.cc-launch {
  position: relative; display: inline-flex; align-items: center; gap: calc(var(--cc-space-unit) * 2.25);
  height: var(--cc-launcher-height); padding: 0 calc(var(--cc-space-unit) * 1.5); border-radius: var(--cc-radius-launcher); cursor: pointer;
  color: var(--cc-bubble-user-text); border: none;
  background: var(--cc-launcher-bg);
  box-shadow: var(--cc-shadow-launcher);
  transition: transform var(--cc-motion-duration) cubic-bezier(.2,.8,.2,1), box-shadow var(--cc-motion-duration) ease, filter var(--cc-motion-duration) ease;
  animation: cc-rise var(--cc-motion-duration-launcher) cubic-bezier(.2,.8,.2,1) both;
  font-family: inherit;
}
.cc-launch.cc-pill { padding: 0 calc(var(--cc-space-unit) * 5) 0 calc(var(--cc-space-unit) * 2); }
.cc-launch.cc-circle { width: var(--cc-launcher-height); padding: 0; justify-content: center; }
.cc-launch.cc-bar { width: var(--cc-panel-width); max-width: var(--cc-panel-max-width); justify-content: flex-start; }
.cc-launch.cc-inline-input { width: var(--cc-panel-width); max-width: var(--cc-panel-max-width); justify-content: flex-start; color: var(--cc-text-muted); background: var(--cc-surface); border: var(--cc-border-width) solid var(--cc-border); box-shadow: var(--cc-shadow-panel); }
.cc-launch.cc-circle .cc-launch-ic { width: var(--cc-launcher-height); height: var(--cc-launcher-height); background: transparent; }
.cc-launch.cc-circle .cc-launch-ic svg { width: var(--cc-launcher-circle-svg-size); height: var(--cc-launcher-circle-svg-size); }
.cc-launch.cc-circle .cc-launch-ic .cc-emoji { font-size: calc(var(--cc-font-size-launcher-emoji) * 1.1363636); }
.cc-launch:hover { transform: translateY(calc(var(--cc-space-unit) * -.5)); filter: brightness(1.06); box-shadow: var(--cc-shadow-launcher-hover); }
.cc-launch:active { transform: translateY(0) scale(.98); }
.cc-launch-ic { width: var(--cc-launcher-icon-size); height: var(--cc-launcher-icon-size); border-radius: var(--cc-radius-launcher-icon); display: grid; place-items: center;
  background: var(--cc-launcher-icon-bg); flex: none; }
.cc-launch-ic svg { width: var(--cc-launcher-svg-size); height: var(--cc-launcher-svg-size); }
.cc-launch-ic .cc-emoji { font-size: var(--cc-font-size-launcher-emoji); line-height: 1; }
.cc-launch-label { font-size: var(--cc-font-size-launcher); font-weight: var(--cc-font-weight-launcher); letter-spacing: var(--cc-letter-spacing); padding-right: var(--cc-space-unit); white-space: nowrap; }
.cc-launch::after { content: ""; position: absolute; inset: 0; border-radius: inherit;
  box-shadow: 0 0 0 0 var(--cc-glow); animation: cc-pulse var(--cc-motion-duration-pulse) ease-out 3; pointer-events: none; }
@keyframes cc-pulse { 0% { box-shadow: 0 0 0 0 var(--cc-glow); } 70%,100% { box-shadow: 0 0 0 calc(var(--cc-space-unit) * 4) transparent; } }
@keyframes cc-rise { from { opacity: 0; transform: translateY(calc(var(--cc-space-unit) * 3.5)) scale(.92); } to { opacity: 1; transform: none; } }

.cc-nudge {
  position: relative; max-width: calc(var(--cc-space-unit) * 67.5); margin-bottom: calc(var(--cc-space-unit) * .5);
  background: var(--cc-surface); color: var(--cc-text);
  border: var(--cc-border-width) solid var(--cc-border); border-radius: var(--cc-radius-nudge); border-bottom-right-radius: var(--cc-radius-nudge-tail);
  padding: calc(var(--cc-space-unit) * 3.25) calc(var(--cc-space-unit) * 7.5) calc(var(--cc-space-unit) * 3.25) calc(var(--cc-space-unit) * 3.5); font-size: var(--cc-font-size-nudge); line-height: var(--cc-line-height-nudge);
  box-shadow: var(--cc-shadow-panel); cursor: pointer;
  animation: cc-rise var(--cc-motion-duration-nudge) cubic-bezier(.2,.8,.2,1) both;
}
.cc-nudge:hover { border-color: var(--cc-hover-border); }
.cc-nudge-x { position: absolute; top: calc(var(--cc-space-unit) * 1.5); right: calc(var(--cc-space-unit) * 1.75); background: none; border: none;
  color: var(--cc-text-muted); cursor: pointer; font-size: var(--cc-font-size-logo); line-height: 1; padding: calc(var(--cc-space-unit) * .5) var(--cc-space-unit); border-radius: var(--cc-radius-nudge-tail); font-family: inherit; }
.cc-nudge-x:hover { color: var(--cc-text); background: var(--cc-surface-raised); }

.cc-panel {
  width: var(--cc-panel-width); max-width: var(--cc-panel-max-width);
  height: var(--cc-panel-height); max-height: var(--cc-panel-max-height);
  background: var(--cc-bg); color: var(--cc-text);
  border: var(--cc-border-width) solid var(--cc-border); border-radius: var(--cc-radius-panel);
  box-shadow: var(--cc-shadow-panel); display: flex; flex-direction: column;
  overflow: hidden; animation: cc-pop var(--cc-motion-duration-panel) cubic-bezier(.2,.8,.2,1);
  transform-origin: bottom right;
}
.cc-root.cc-bl .cc-panel { transform-origin: bottom left; }
.cc-root.cc-inline .cc-panel { height: var(--cc-inline-panel-height); width: 100%; animation: none; }
@keyframes cc-pop { from { opacity: 0; transform: translateY(calc(var(--cc-space-unit) * 3)) scale(.96);} to { opacity:1; transform: none; } }

.cc-head {
  position: relative; display: flex; align-items: center; gap: calc(var(--cc-space-unit) * 2.75);
  padding: calc(var(--cc-space-unit) * 3.75) calc(var(--cc-space-unit) * 4); border-bottom: var(--cc-border-width) solid var(--cc-border);
  background: var(--cc-header-bg);
}
.cc-logo { position: relative; width: calc(var(--cc-space-unit) * 9); height: calc(var(--cc-space-unit) * 9); border-radius: var(--cc-radius-logo); object-fit: cover; flex: none;
  background: var(--cc-logo-bg); color: var(--cc-accent-ink);
  display: grid; place-items: center; font-weight: var(--cc-font-weight-link); font-size: var(--cc-font-size-logo);
  box-shadow: var(--cc-shadow-logo); overflow: visible; }
.cc-logo .cc-dot { position: absolute; right: calc(var(--cc-space-unit) * -.5); bottom: calc(var(--cc-space-unit) * -.5); width: calc(var(--cc-space-unit) * 2.75); height: calc(var(--cc-space-unit) * 2.75); border-radius: var(--cc-radius-launcher-icon);
  background: var(--cc-online); border: calc(var(--cc-space-unit) * .5) solid var(--cc-bg); }
.cc-logo svg { width: calc(var(--cc-space-unit) * 5); height: calc(var(--cc-space-unit) * 5); }
.cc-logo .cc-emoji { font-size: var(--cc-font-size-logo-emoji); line-height: 1; }
.cc-logo-img { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
.cc-htext { min-width: 0; }
.cc-title { font-size: var(--cc-font-size-title); font-weight: var(--cc-font-weight-title); line-height: var(--cc-line-height-title); }
.cc-sub { font-size: var(--cc-font-size-subtitle); color: var(--cc-text-muted); margin-top: calc(var(--cc-space-unit) * .5); }
.cc-x { margin-left: auto; background: none; border: none; color: var(--cc-text-muted);
  cursor: pointer; font-size: var(--cc-font-size-close); line-height: 1; padding: calc(var(--cc-space-unit) * 1.25); border-radius: calc(var(--cc-space-unit) * 2.25); flex: none; font-family: inherit; }
.cc-x:hover { color: var(--cc-text); background: var(--cc-surface-raised); }

.cc-scroll { flex: 1; overflow-y: auto; padding: calc(var(--cc-space-unit) * 4); display: flex; flex-direction: column; gap: calc(var(--cc-space-unit) * 2.5); scroll-behavior: smooth; }
.cc-scroll::-webkit-scrollbar { width: calc(var(--cc-space-unit) * 2); }
.cc-scroll::-webkit-scrollbar-thumb { background: var(--cc-surface-raised); border-radius: calc(var(--cc-space-unit) * 2); }

.cc-msg { max-width: 86%; padding: calc(var(--cc-space-unit) * 2.5) calc(var(--cc-space-unit) * 3.25); border-radius: var(--cc-radius-bubble); font-size: var(--cc-font-size); line-height: var(--cc-line-height);
  white-space: pre-wrap; word-wrap: break-word; animation: cc-msg-in var(--cc-motion-duration) ease both; }
@keyframes cc-msg-in { from { opacity: 0; transform: translateY(var(--cc-space-unit)); } to { opacity: 1; transform: none; } }
.cc-msg.cc-user { align-self: flex-end; color: var(--cc-bubble-user-text); border-bottom-right-radius: var(--cc-radius-bubble-tail);
  background: var(--cc-bubble-user-bg); }
.cc-msg.cc-bot { align-self: flex-start; color: var(--cc-bubble-agent-text); background: var(--cc-bubble-agent-bg); border: var(--cc-border-width) solid var(--cc-border); border-bottom-left-radius: var(--cc-radius-bubble-tail); }
.cc-msg.cc-bot a { color: var(--cc-link); text-decoration: underline;
  text-underline-offset: calc(var(--cc-space-unit) * .5); font-weight: var(--cc-font-weight-link); word-break: break-word; }
.cc-msg.cc-bot a:hover { opacity: .85; }

.cc-chips { display: flex; flex-wrap: wrap; gap: calc(var(--cc-space-unit) * 1.75); margin-top: var(--cc-space-unit); }
.cc-chip { font-size: var(--cc-font-size-chip); padding: calc(var(--cc-space-unit) * 2) calc(var(--cc-space-unit) * 3); border-radius: var(--cc-radius-launcher); cursor: pointer; color: var(--cc-text);
  background: var(--cc-surface-raised); border: var(--cc-border-width) solid var(--cc-border); transition: border-color var(--cc-motion-duration), background var(--cc-motion-duration), transform var(--cc-motion-duration); font-family: inherit; }
.cc-chip:hover { border-color: var(--cc-accent); background: var(--cc-chip-hover-bg); transform: translateY(calc(var(--cc-space-unit) * -.25)); }

.cc-dots { display: inline-flex; gap: var(--cc-space-unit); align-items: center; }
.cc-dots span { width: calc(var(--cc-space-unit) * 1.5); height: calc(var(--cc-space-unit) * 1.5); border-radius: var(--cc-radius-launcher-icon); background: var(--cc-text-muted); animation: cc-blink calc(var(--cc-motion-duration) * 6) infinite; }
.cc-dots span:nth-child(2){ animation-delay: var(--cc-motion-duration) } .cc-dots span:nth-child(3){ animation-delay: calc(var(--cc-motion-duration) * 2) }
@keyframes cc-blink { 0%,60%,100%{ opacity:.25 } 30%{ opacity:1 } }

.cc-foot { padding: calc(var(--cc-space-unit) * 3); border-top: var(--cc-border-width) solid var(--cc-border); display: flex; gap: calc(var(--cc-space-unit) * 2); align-items: flex-end; }
.cc-input { flex: 1; background: var(--cc-surface); border: var(--cc-border-width) solid var(--cc-border);
  color: var(--cc-text); border-radius: var(--cc-radius-control); padding: calc(var(--cc-space-unit) * 2.75) calc(var(--cc-space-unit) * 3.25); font-size: var(--cc-font-size); font-family: inherit;
  resize: none; outline: none; max-height: calc(var(--cc-space-unit) * 27.5); transition: border-color var(--cc-motion-duration), box-shadow var(--cc-motion-duration); line-height: var(--cc-line-height); }
.cc-input::placeholder { color: var(--cc-text-muted); }
.cc-input:focus { border-color: var(--cc-accent); box-shadow: var(--cc-focus); }
.cc-send { background: var(--cc-send-bg); color: var(--cc-accent-ink);
  border: none; border-radius: var(--cc-radius-control); height: calc(var(--cc-space-unit) * 10.5); width: calc(var(--cc-space-unit) * 11); cursor: pointer; display: grid; place-items: center;
  transition: opacity var(--cc-motion-duration), transform var(--cc-motion-duration), filter var(--cc-motion-duration); flex: none; }
.cc-send:not(:disabled):hover { filter: brightness(1.08); transform: translateY(calc(var(--cc-space-unit) * -.25)); }
.cc-send:disabled { opacity: .4; cursor: default; }
.cc-send svg { width: calc(var(--cc-space-unit) * 4.5); height: calc(var(--cc-space-unit) * 4.5); }
.cc-credit { text-align: center; font-size: var(--cc-font-size-credit); color: var(--cc-text-muted); padding: 0 0 calc(var(--cc-space-unit) * 2.25); }
.cc-credit b { color: var(--cc-credit-accent); font-weight: var(--cc-font-weight-link); }
.cc-avatar-none { display: none; }

@media (prefers-reduced-motion: reduce) {
  .cc-launch, .cc-nudge, .cc-panel, .cc-msg { animation: none !important; }
  .cc-launch::after { animation: none !important; }
}
`;
