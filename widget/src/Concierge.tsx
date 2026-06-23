import React, { useEffect, useRef, useState } from "react";
import { useChat } from "./useChat";
import { CSS } from "./styles";

// Render assistant text with clickable links: supports [label](url) markdown and
// bare https URLs. Everything else stays literal text (no HTML injection).
const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL = /(https?:\/\/[^\s<>()]+)/g;

function renderRichText(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  // First pass: markdown links. Between them, linkify bare URLs.
  text.replace(MD_LINK, (m, label: string, url: string, offset: number) => {
    if (offset > last) out.push(...linkifyBare(text.slice(last, offset), key++));
    out.push(
      <a key={`l${key++}`} href={url} target="_blank" rel="noopener noreferrer nofollow">
        {label}
      </a>
    );
    last = offset + m.length;
    return m;
  });
  if (last < text.length) out.push(...linkifyBare(text.slice(last), key++));
  return out;
}

function linkifyBare(chunk: string, baseKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  chunk.replace(BARE_URL, (url: string, offset: number) => {
    if (offset > last) nodes.push(chunk.slice(last, offset));
    nodes.push(
      <a key={`b${baseKey}-${k++}`} href={url} target="_blank" rel="noopener noreferrer nofollow">
        {url.replace(/^https?:\/\//, "")}
      </a>
    );
    last = offset + url.length;
    return url;
  });
  if (last < chunk.length) nodes.push(chunk.slice(last));
  return nodes.length ? nodes : [chunk];
}

export interface ConciergeProps {
  /** URL of the Concierge server's /chat endpoint. Required. */
  endpoint: string;
  /** Optional page id when one server hosts multiple briefs. */
  pageId?: string;

  /** Brand display. */
  brandName?: string;
  /** Small subtitle under the brand name in the header. */
  tagline?: string;
  /** Logo image URL. Falls back to the first letter of brandName. */
  logoUrl?: string;

  /** First message the assistant "says". */
  greeting?: string;
  /** Suggested question chips shown before the first user message. */
  suggestions?: string[];
  /** Input placeholder. */
  placeholder?: string;

  /** "bottom-right" | "bottom-left" floating bubble, or "inline" embed. */
  position?: "bottom-right" | "bottom-left" | "inline";
  /** Start opened (ignored for inline, which is always open). */
  defaultOpen?: boolean;

  /** Launcher style: a labelled "pill" (default) or a round "bubble". */
  launcher?: "pill" | "bubble";
  /** Text on the pill launcher. Default "Ask AI". */
  launcherLabel?: string;
  /** Emoji to use as the launcher / header icon instead of the default spark. */
  launcherIcon?: string;
  /** Show a live "online" dot on the header avatar. Default true. */
  online?: boolean;

  /** Proactive teaser bubble shown above the launcher after a delay. */
  nudge?: string;
  /** Delay before the nudge appears, ms. Default 5000. */
  nudgeDelay?: number;

  /** Visual preset. Default "midnight" (dark). */
  theme?: "midnight" | "light";
  /** Primary accent color (drives gradient, buttons, user bubbles). */
  accentColor?: string;
  /** Secondary accent for the gradient. Defaults to a tint of accentColor. */
  accentColor2?: string;
  /** Override any --cc-* CSS variables. */
  themeVars?: Record<string, string>;
  /** Extra class + style on the root for deep overrides. */
  className?: string;
  style?: React.CSSProperties;
  /** Show the small credit line. Default true. */
  showCredit?: boolean;
  /** Override the credit line text. */
  creditText?: string;
}

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l1.7 4.8L18.5 8.5 13.7 10.2 12 15l-1.7-4.8L5.5 8.5l4.8-1.7L12 2z" />
    <path d="M19 13.5l.95 2.55L22.5 17l-2.55.95L19 20.5l-.95-2.55L15.5 17l2.55-.95L19 13.5z" opacity=".85" />
  </svg>
);

export function Concierge(props: ConciergeProps) {
  const {
    endpoint,
    pageId,
    brandName = "Assistant",
    tagline = "Ask me anything",
    logoUrl,
    greeting = "Hi! Ask me anything about this page.",
    suggestions = [],
    placeholder = "Ask a question…",
    position = "bottom-right",
    defaultOpen = false,
    launcher = "pill",
    launcherLabel = "Ask AI",
    launcherIcon,
    online = true,
    nudge,
    nudgeDelay = 5000,
    theme = "midnight",
    accentColor,
    accentColor2,
    themeVars,
    className = "",
    style,
    showCredit = true,
    creditText = "AI assistant · answers from this page only",
  } = props;

  const inline = position === "inline";
  const [open, setOpenState] = useState(() => {
    if (inline) return true;
    if (typeof window !== "undefined") {
      try {
        const saved = window.sessionStorage.getItem("cc_open");
        if (saved !== null) return saved === "1";
      } catch {
        /* ignore */
      }
    }
    return defaultOpen;
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("cc_open", v ? "1" : "0");
      } catch {
        /* ignore */
      }
    }
  };
  const [draft, setDraft] = useState("");
  const { messages, send, busy } = useChat({ endpoint, pageId, greeting });
  const scrollRef = useRef<HTMLDivElement>(null);
  const styleInjected = useRef(false);

  // Proactive nudge: a teaser above the launcher, shown once per tab after a
  // short delay, only if the visitor hasn't already engaged.
  const [showNudge, setShowNudge] = useState(false);
  const nudgeDismissed = useRef(false);
  useEffect(() => {
    if (!nudge || inline) return;
    try {
      if (window.sessionStorage.getItem("cc_nudge_seen") === "1") return;
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => {
      if (!nudgeDismissed.current && !open) setShowNudge(true);
    }, Math.max(0, nudgeDelay));
    return () => window.clearTimeout(t);
  }, [nudge, nudgeDelay, inline, open]);
  const dismissNudge = () => {
    nudgeDismissed.current = true;
    setShowNudge(false);
    try {
      window.sessionStorage.setItem("cc_nudge_seen", "1");
    } catch {
      /* ignore */
    }
  };

  // inject stylesheet once
  useEffect(() => {
    if (styleInjected.current) return;
    if (typeof document === "undefined") return;
    if (!document.getElementById("cc-styles")) {
      const el = document.createElement("style");
      el.id = "cc-styles";
      el.textContent = CSS;
      document.head.appendChild(el);
    }
    styleInjected.current = true;
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const rootVars: React.CSSProperties = {
    ...(accentColor ? ({ ["--cc-accent" as any]: accentColor } as React.CSSProperties) : {}),
    ...(accentColor2 ? ({ ["--cc-accent-2" as any]: accentColor2 } as React.CSSProperties) : {}),
    ...(themeVars as React.CSSProperties),
    ...style,
  };

  const icon = launcherIcon ? <span className="cc-emoji">{launcherIcon}</span> : <SparkIcon />;
  const themeClass = theme === "light" ? "cc-theme-light" : "";
  const posClass = inline ? "cc-inline" : position === "bottom-left" ? "cc-bl" : "cc-br";
  const showChips = suggestions.length > 0 && messages.filter((m) => m.role === "user").length === 0;

  const submit = () => {
    const t = draft;
    setDraft("");
    void send(t);
  };

  const lastIsEmptyBot =
    busy && messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === "";

  const openPanel = () => {
    dismissNudge();
    setOpen(true);
  };

  return (
    <div className={`cc-root ${posClass} ${themeClass} ${className}`} style={rootVars}>
      {!inline && !open && (
        <div className="cc-launchwrap">
          {showNudge && nudge && (
            <div className="cc-nudge" role="button" tabIndex={0} onClick={openPanel}>
              <button
                className="cc-nudge-x"
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissNudge();
                }}
              >
                ×
              </button>
              {nudge}
            </div>
          )}
          <button
            className={`cc-launch ${launcher === "pill" ? "cc-pill" : "cc-circle"}`}
            aria-label={`Chat with ${brandName}`}
            onClick={openPanel}
          >
            <span className="cc-launch-ic">{icon}</span>
            {launcher === "pill" && <span className="cc-launch-label">{launcherLabel}</span>}
          </button>
        </div>
      )}

      {(inline || open) && (
        <div className="cc-panel" role="dialog" aria-label={`${brandName} assistant`}>
          <div className="cc-head">
            {logoUrl ? (
              <div className="cc-logo" style={{ background: "transparent", boxShadow: "none" }}>
                <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: "inherit", objectFit: "cover" }} />
                {online && <span className="cc-dot" />}
              </div>
            ) : (
              <div className="cc-logo">
                {launcherIcon ? <span className="cc-emoji">{launcherIcon}</span> : <SparkIcon />}
                {online && <span className="cc-dot" />}
              </div>
            )}
            <div className="cc-htext">
              <div className="cc-title">{brandName}</div>
              <div className="cc-sub">{tagline}</div>
            </div>
            {!inline && (
              <button className="cc-x" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            )}
          </div>

          <div className="cc-scroll" ref={scrollRef}>
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              if (isLast && m.role === "assistant" && m.content === "" && busy) {
                return (
                  <div key={i} className="cc-msg cc-bot">
                    <span className="cc-dots">
                      <span /> <span /> <span />
                    </span>
                  </div>
                );
              }
              return (
                <div key={i} className={`cc-msg ${m.role === "user" ? "cc-user" : "cc-bot"}`}>
                  {m.role === "assistant" ? renderRichText(m.content) : m.content}
                </div>
              );
            })}

            {showChips && (
              <div className="cc-chips">
                {suggestions.map((s, i) => (
                  <button key={i} className="cc-chip" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="cc-foot">
            <textarea
              className="cc-input"
              rows={1}
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button className="cc-send" disabled={busy || !draft.trim()} onClick={submit} aria-label="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          {showCredit && <div className="cc-credit">{creditText}</div>}
        </div>
      )}
    </div>
  );
}

export default Concierge;
