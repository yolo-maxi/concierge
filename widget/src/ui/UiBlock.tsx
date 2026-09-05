import React, { useState } from "react";

/**
 * Client-side view of the generative-UI protocol.
 *
 * The types are duplicated rather than imported: the widget is a standalone
 * bundle with no dependency on the server package, and a shared package would
 * couple a public embed to server internals. The server is authoritative — it
 * validates before emitting — so this side re-checks only what protects the
 * DOM: component names it actually implements, and URL schemes.
 */

export type UiAction =
  | { kind: "send"; text: string }
  | { kind: "link"; url: string }
  | { kind: "tool"; tool: string; label?: string };

export interface UiEvent {
  component: string;
  props: Record<string, unknown>;
  text: string;
}

export function isUiEvent(value: unknown): value is UiEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.component === "string" && typeof v.text === "string";
}

/** Second line of defence: never put a non-http(s) URL into href or src. */
function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function str(props: Record<string, unknown>, key: string): string | undefined {
  const value = props[key];
  return typeof value === "string" && value ? value : undefined;
}

function action(raw: unknown): UiAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Record<string, unknown>;
  if (a.kind === "send" && typeof a.text === "string") return { kind: "send", text: a.text };
  if (a.kind === "link") {
    const url = safeUrl(a.url);
    return url ? { kind: "link", url } : null;
  }
  if (a.kind === "tool" && typeof a.tool === "string") {
    return { kind: "tool", tool: a.tool, label: typeof a.label === "string" ? a.label : undefined };
  }
  return null;
}

export interface UiBlockProps {
  event: UiEvent;
  /** Send a user turn. Every interactive action routes through here — the widget never calls a tool. */
  onSend: (text: string) => void;
  busy?: boolean;
}

/**
 * Render one UI event, or its text fallback.
 *
 * An unknown component is not an error and not a blank space: it renders the
 * server-supplied sentence. That is what makes an older embed safe against a
 * newer server.
 */
export function UiBlock({ event, onSend, busy }: UiBlockProps) {
  const fallback = <p className="cc-ui-fallback">{event.text}</p>;
  const props = event.props && typeof event.props === "object" ? event.props : {};

  switch (event.component) {
    case "button_group":
      return <ButtonGroup props={props} text={event.text} onSend={onSend} busy={busy} />;
    case "lead_form":
      return <LeadForm props={props} text={event.text} onSend={onSend} busy={busy} />;
    case "product_card":
      return <ProductCard props={props} text={event.text} onSend={onSend} busy={busy} />;
    case "handoff_card":
      return <HandoffCard props={props} text={event.text} onSend={onSend} busy={busy} />;
    default:
      return fallback;
  }
}

interface PartProps {
  props: Record<string, unknown>;
  text: string;
  onSend: (text: string) => void;
  busy?: boolean;
}

/**
 * Turn an action into a click handler.
 *
 * `tool` deliberately becomes a plain message, not a call: the widget has no
 * path to the tool executor, and every real invocation still goes through the
 * model and the server's allowlist, rate limit and confirmation gate.
 */
function ActionButton({
  act,
  label,
  onSend,
  busy,
  className = "cc-ui-btn",
}: {
  act: UiAction | null;
  label: string;
  onSend: (text: string) => void;
  busy?: boolean;
  className?: string;
}) {
  if (act && act.kind === "link") {
    return (
      <a className={className} href={act.url} target="_blank" rel="noopener noreferrer nofollow">
        {label}
      </a>
    );
  }
  const message = act?.kind === "send" ? act.text : act?.kind === "tool" ? act.label || label : label;
  return (
    <button type="button" className={className} disabled={busy} onClick={() => onSend(message)}>
      {label}
    </button>
  );
}

function ButtonGroup({ props, text, onSend, busy }: PartProps) {
  const buttons = Array.isArray(props.buttons) ? props.buttons : [];
  const usable = buttons
    .map((raw) => {
      if (typeof raw !== "object" || raw === null) return null;
      const b = raw as Record<string, unknown>;
      const label = typeof b.label === "string" ? b.label : null;
      return label ? { label, act: action(b.action) } : null;
    })
    .filter(Boolean) as { label: string; act: UiAction | null }[];

  if (usable.length === 0) return <p className="cc-ui-fallback">{text}</p>;

  return (
    <div className="cc-ui cc-ui-buttons" role="group" aria-label={str(props, "title") || "Suggested next steps"}>
      {str(props, "title") && <p className="cc-ui-title">{str(props, "title")}</p>}
      <div className="cc-ui-btn-row">
        {usable.map((b, i) => (
          <ActionButton key={i} act={b.act} label={b.label} onSend={onSend} busy={busy} />
        ))}
      </div>
    </div>
  );
}

function LeadForm({ props, text, onSend, busy }: PartProps) {
  const rawFields = Array.isArray(props.fields) ? props.fields : [];
  const fields = rawFields
    .map((raw) => {
      if (typeof raw !== "object" || raw === null) return null;
      const f = raw as Record<string, unknown>;
      const name = typeof f.name === "string" ? f.name : null;
      const label = typeof f.label === "string" ? f.label : name;
      if (!name || !label) return null;
      const type = typeof f.type === "string" ? f.type : "text";
      return {
        name,
        label,
        type: ["text", "email", "tel", "textarea"].includes(type) ? type : "text",
        required: f.required === true,
        placeholder: typeof f.placeholder === "string" ? f.placeholder : undefined,
      };
    })
    .filter(Boolean) as { name: string; label: string; type: string; required: boolean; placeholder?: string }[];

  const [values, setValues] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  if (fields.length === 0) return <p className="cc-ui-fallback">{text}</p>;

  const submitLabel = str(props, "submitLabel") || "Send";
  const missing = fields.filter((f) => f.required && !values[f.name]?.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || sent || missing.length > 0) return;
    // The form composes a message; it never posts anywhere itself. Whatever the
    // visitor typed reaches the server only as their own words, on the normal
    // /chat path, where the usual limits apply.
    const body = fields
      .filter((f) => values[f.name]?.trim())
      .map((f) => `${f.label}: ${values[f.name].trim()}`)
      .join("\n");
    setSent(true);
    onSend(body || submitLabel);
  };

  return (
    <form className="cc-ui cc-ui-form" onSubmit={submit} aria-label={str(props, "title") || "Contact form"}>
      {str(props, "title") && <p className="cc-ui-title">{str(props, "title")}</p>}
      {fields.map((f) => {
        const id = `cc-f-${f.name}`;
        const common = {
          id,
          name: f.name,
          required: f.required,
          placeholder: f.placeholder,
          disabled: busy || sent,
          value: values[f.name] || "",
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setValues((v) => ({ ...v, [f.name]: e.target.value })),
        };
        return (
          <div className="cc-ui-field" key={f.name}>
            <label htmlFor={id}>
              {f.label}
              {f.required && <span aria-hidden="true"> *</span>}
            </label>
            {f.type === "textarea" ? <textarea rows={3} {...common} /> : <input type={f.type} {...common} />}
          </div>
        );
      })}
      <button type="submit" className="cc-ui-btn cc-ui-btn-primary" disabled={busy || sent || missing.length > 0}>
        {sent ? "Sent" : submitLabel}
      </button>
    </form>
  );
}

function ProductCard({ props, text, onSend, busy }: PartProps) {
  const name = str(props, "name");
  if (!name) return <p className="cc-ui-fallback">{text}</p>;
  const image = safeUrl(props.imageUrl);
  const act = action(props.action);

  return (
    <div className="cc-ui cc-ui-card">
      {image && <img className="cc-ui-card-img" src={image} alt="" />}
      <div className="cc-ui-card-body">
        <p className="cc-ui-title">{name}</p>
        {str(props, "price") && <p className="cc-ui-price">{str(props, "price")}</p>}
        {str(props, "description") && <p className="cc-ui-desc">{str(props, "description")}</p>}
        {act && <ActionButton act={act} label={actionLabel(act, "Learn more")} onSend={onSend} busy={busy} />}
      </div>
    </div>
  );
}

function HandoffCard({ props, text, onSend, busy }: PartProps) {
  const act = action(props.action);
  return (
    <div className="cc-ui cc-ui-card cc-ui-handoff">
      <div className="cc-ui-card-body">
        <p className="cc-ui-title">{str(props, "title") || "Talk to a human"}</p>
        <p className="cc-ui-desc">{str(props, "body") || text}</p>
        {act && (
          <ActionButton
            act={act}
            label={actionLabel(act, "Get in touch")}
            onSend={onSend}
            busy={busy}
            className="cc-ui-btn cc-ui-btn-primary"
          />
        )}
      </div>
    </div>
  );
}

function actionLabel(act: UiAction, fallback: string): string {
  if (act.kind === "tool" && act.label) return act.label;
  if (act.kind === "send") return act.text.length <= 40 ? act.text : fallback;
  return fallback;
}
