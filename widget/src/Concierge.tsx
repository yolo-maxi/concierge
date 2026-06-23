import React, { useEffect, useRef, useState } from "react";
import { useChat } from "./useChat";
import { CSS } from "./styles";

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

  /** Accent color (drives bubble, buttons, user bubbles). */
  accentColor?: string;
  /** Override any --cc-* CSS variables. */
  themeVars?: Record<string, string>;
  /** Extra class + style on the root for deep overrides. */
  className?: string;
  style?: React.CSSProperties;
  /** Show the small "powered by" credit line. Default true. */
  showCredit?: boolean;
}

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
    accentColor,
    themeVars,
    className = "",
    style,
    showCredit = true,
  } = props;

  const inline = position === "inline";
  const [open, setOpen] = useState(inline || defaultOpen);
  const [draft, setDraft] = useState("");
  const { messages, send, busy } = useChat({ endpoint, pageId, greeting });
  const scrollRef = useRef<HTMLDivElement>(null);
  const styleInjected = useRef(false);

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
    ...(themeVars as React.CSSProperties),
    ...style,
  };

  const posClass = inline ? "cc-inline" : position === "bottom-left" ? "cc-bl" : "cc-br";
  const showChips = suggestions.length > 0 && messages.filter((m) => m.role === "user").length === 0;

  const submit = () => {
    const t = draft;
    setDraft("");
    void send(t);
  };

  const lastIsEmptyBot =
    busy && messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === "";

  return (
    <div className={`cc-root ${posClass} ${className}`} style={rootVars}>
      {!inline && !open && (
        <button className="cc-bubble" aria-label={`Chat with ${brandName}`} onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>
      )}

      {(inline || open) && (
        <div className="cc-panel" role="dialog" aria-label={`${brandName} assistant`}>
          <div className="cc-head">
            {logoUrl ? (
              <img className="cc-logo" src={logoUrl} alt="" />
            ) : (
              <div className="cc-logo">{brandName.charAt(0).toUpperCase()}</div>
            )}
            <div>
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
                  {m.content}
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
          {showCredit && <div className="cc-credit">AI assistant · answers from this page only</div>}
        </div>
      )}
    </div>
  );
}

export default Concierge;
