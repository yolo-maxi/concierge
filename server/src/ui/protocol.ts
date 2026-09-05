/**
 * Declarative generative-UI event protocol.
 *
 * The model never emits markup. It selects a *registered component name* and a
 * *schema-validated prop bundle*; the server turns that into a typed `ui` event
 * on the SSE stream, and the widget renders it with its own React components.
 * No JSX, HTML or JavaScript ever crosses the wire, so a prompt-injected model
 * cannot render anything the widget does not already implement.
 *
 * Everything here is a rejection surface. The default answer is "no": an
 * unregistered component, an unknown prop, a prop of the wrong type, a URL with
 * a scheme other than http/https, or an action naming a tool the page has not
 * allowed all produce a validation failure and no event.
 */

/** A prop's declared shape. Deliberately small: this is not a JSON Schema engine. */
type PropSpec =
  | { kind: "string"; required?: boolean; maxLength?: number; enum?: readonly string[] }
  | { kind: "url"; required?: boolean }
  | { kind: "boolean"; required?: boolean }
  | { kind: "action"; required?: boolean }
  | { kind: "array"; required?: boolean; maxItems: number; item: ObjectSpec }
  | { kind: "object"; required?: boolean; shape: ObjectSpec };

type ObjectSpec = Record<string, PropSpec>;

export interface UiComponentSpec {
  /** Prop shape. Props not named here are rejected, never silently passed through. */
  props: ObjectSpec;
  /** Human description handed to the model so it can choose sensibly. */
  description: string;
}

/**
 * An action a component may carry.
 *
 * - `send` — puts words in the visitor's mouth *only when they click*. It
 *   re-enters the normal /chat path as a user turn.
 * - `link` — opens an http/https URL.
 * - `tool` — names a tool the model should call next. It does NOT invoke the
 *   tool: the client cannot reach the executor directly. Clicking sends a user
 *   turn, the model decides, and the executor still applies the allowlist,
 *   rate limit, and side-effect confirmation gate. The tool name is checked
 *   against the page's allowlist here purely so a component cannot advertise a
 *   capability the page does not have.
 */
export type UiAction =
  | { kind: "send"; text: string }
  | { kind: "link"; url: string }
  | { kind: "tool"; tool: string; label?: string };

export interface UiEvent {
  /** Registered component name. */
  component: string;
  /** Validated props. */
  props: Record<string, unknown>;
  /**
   * Plain-text equivalent. A client that does not know this component — an
   * older widget, a transcript export, a screen reader fallback — renders this
   * instead. Never optional: a UI event that cannot degrade is not allowed.
   */
  text: string;
}

const MAX_TEXT = 400;
const MAX_LABEL = 80;

const BUTTON_ITEM: ObjectSpec = {
  label: { kind: "string", required: true, maxLength: MAX_LABEL },
  action: { kind: "action", required: true },
};

const FIELD_ITEM: ObjectSpec = {
  name: { kind: "string", required: true, maxLength: 40 },
  label: { kind: "string", required: true, maxLength: MAX_LABEL },
  type: { kind: "string", enum: ["text", "email", "tel", "textarea"] },
  required: { kind: "boolean" },
  placeholder: { kind: "string", maxLength: MAX_LABEL },
};

export const UI_COMPONENTS: Record<string, UiComponentSpec> = {
  button_group: {
    description:
      "A row of suggested next steps as buttons. Use for a small set of clear choices, not as a menu of everything.",
    props: {
      title: { kind: "string", maxLength: MAX_LABEL },
      buttons: { kind: "array", required: true, maxItems: 4, item: BUTTON_ITEM },
    },
  },
  lead_form: {
    description:
      "A short contact form. Clicking submit sends the visitor's answers as a normal message; it does not itself perform any action.",
    props: {
      title: { kind: "string", maxLength: MAX_LABEL },
      submitLabel: { kind: "string", maxLength: MAX_LABEL },
      submitAction: { kind: "action" },
      fields: { kind: "array", required: true, maxItems: 5, item: FIELD_ITEM },
    },
  },
  product_card: {
    description: "A single product, plan or offering with an optional link.",
    props: {
      name: { kind: "string", required: true, maxLength: MAX_LABEL },
      description: { kind: "string", maxLength: MAX_TEXT },
      price: { kind: "string", maxLength: 40 },
      imageUrl: { kind: "url" },
      action: { kind: "action" },
    },
  },
  handoff_card: {
    description: "Offers a route to a human. Use when the page cannot answer the question.",
    props: {
      title: { kind: "string", maxLength: MAX_LABEL },
      body: { kind: "string", maxLength: MAX_TEXT },
      action: { kind: "action" },
    },
  },
};

export function isRegisteredComponent(name: unknown): name is string {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(UI_COMPONENTS, name);
}

export function componentCatalogue(): string {
  return Object.entries(UI_COMPONENTS)
    .map(([name, spec]) => `${name}: ${spec.description}`)
    .join("\n");
}

export type UiValidation =
  | { ok: true; event: UiEvent }
  | { ok: false; reason: string };

export interface UiValidateOptions {
  /** Tool names the page has allowed. An action naming anything else is rejected. */
  allowedToolNames?: string[];
}

/**
 * Validate a model-proposed UI event.
 *
 * Returns the event with *only* declared props, coerced to declared types, or a
 * reason. There is no partial success: a single bad prop rejects the event,
 * because half-rendered UI is worse than text.
 */
export function validateUiEvent(input: unknown, options: UiValidateOptions = {}): UiValidation {
  if (!isPlainObject(input)) return { ok: false, reason: "expected an object" };

  const component = input.component;
  if (!isRegisteredComponent(component)) {
    return {
      ok: false,
      reason: `unknown component ${JSON.stringify(String(component ?? "")).slice(0, 60)}`,
    };
  }

  const text = input.text;
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, reason: "text fallback is required so the component can degrade" };
  }

  const rawProps = input.props;
  if (rawProps !== undefined && !isPlainObject(rawProps)) {
    return { ok: false, reason: "props must be an object" };
  }

  const spec = UI_COMPONENTS[component];
  const validated = validateObject(rawProps ?? {}, spec.props, options, component);
  if (!validated.ok) return validated;

  return {
    ok: true,
    event: { component, props: validated.value, text: text.slice(0, MAX_TEXT) },
  };
}

function validateObject(
  input: Record<string, unknown>,
  shape: ObjectSpec,
  options: UiValidateOptions,
  path: string
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(shape, key)) {
      return { ok: false, reason: `${path}: unknown prop ${JSON.stringify(key).slice(0, 40)}` };
    }
  }

  const out: Record<string, unknown> = {};
  for (const [key, propSpec] of Object.entries(shape)) {
    const raw = input[key];
    if (raw === undefined || raw === null) {
      if (propSpec.required) return { ok: false, reason: `${path}: missing required prop "${key}"` };
      continue;
    }
    const result = validateProp(raw, propSpec, options, `${path}.${key}`);
    if (!result.ok) return result;
    out[key] = result.value;
  }
  return { ok: true, value: out };
}

function validateProp(
  raw: unknown,
  spec: PropSpec,
  options: UiValidateOptions,
  path: string
): { ok: true; value: unknown } | { ok: false; reason: string } {
  switch (spec.kind) {
    case "string": {
      if (typeof raw !== "string") return { ok: false, reason: `${path}: expected a string` };
      if (spec.enum && !spec.enum.includes(raw)) {
        return { ok: false, reason: `${path}: expected one of ${spec.enum.join("|")}` };
      }
      return { ok: true, value: raw.slice(0, spec.maxLength ?? MAX_TEXT) };
    }
    case "boolean": {
      if (typeof raw !== "boolean") return { ok: false, reason: `${path}: expected a boolean` };
      return { ok: true, value: raw };
    }
    case "url": {
      if (typeof raw !== "string") return { ok: false, reason: `${path}: expected a URL string` };
      const url = safeHttpUrl(raw);
      if (!url) return { ok: false, reason: `${path}: only http(s) URLs are allowed` };
      return { ok: true, value: url };
    }
    case "action":
      return validateAction(raw, options, path);
    case "array": {
      if (!Array.isArray(raw)) return { ok: false, reason: `${path}: expected an array` };
      if (raw.length === 0) return { ok: false, reason: `${path}: expected at least one entry` };
      if (raw.length > spec.maxItems) {
        return { ok: false, reason: `${path}: at most ${spec.maxItems} entries` };
      }
      const items: unknown[] = [];
      for (let i = 0; i < raw.length; i++) {
        const entry = raw[i];
        if (!isPlainObject(entry)) return { ok: false, reason: `${path}[${i}]: expected an object` };
        const result = validateObject(entry, spec.item, options, `${path}[${i}]`);
        if (!result.ok) return result;
        items.push(result.value);
      }
      return { ok: true, value: items };
    }
    case "object": {
      if (!isPlainObject(raw)) return { ok: false, reason: `${path}: expected an object` };
      const result = validateObject(raw, spec.shape, options, path);
      if (!result.ok) return result;
      return { ok: true, value: result.value };
    }
  }
}

function validateAction(
  raw: unknown,
  options: UiValidateOptions,
  path: string
): { ok: true; value: UiAction } | { ok: false; reason: string } {
  if (!isPlainObject(raw)) return { ok: false, reason: `${path}: expected an action object` };
  const kind = raw.kind;

  if (kind === "send") {
    if (typeof raw.text !== "string" || raw.text.trim() === "") {
      return { ok: false, reason: `${path}: send action needs text` };
    }
    return { ok: true, value: { kind: "send", text: raw.text.slice(0, MAX_TEXT) } };
  }

  if (kind === "link") {
    const url = typeof raw.url === "string" ? safeHttpUrl(raw.url) : null;
    if (!url) return { ok: false, reason: `${path}: link action needs an http(s) url` };
    return { ok: true, value: { kind: "link", url } };
  }

  if (kind === "tool") {
    if (typeof raw.tool !== "string" || raw.tool === "") {
      return { ok: false, reason: `${path}: tool action needs a tool name` };
    }
    const allowed = options.allowedToolNames ?? [];
    if (!allowed.includes(raw.tool)) {
      return { ok: false, reason: `${path}: tool "${raw.tool.slice(0, 40)}" is not available on this page` };
    }
    const label = typeof raw.label === "string" ? raw.label.slice(0, MAX_LABEL) : undefined;
    return { ok: true, value: label ? { kind: "tool", tool: raw.tool, label } : { kind: "tool", tool: raw.tool } };
  }

  return { ok: false, reason: `${path}: action kind must be send, link or tool` };
}

/**
 * Accept only absolute http/https URLs.
 *
 * This is the injection-relevant check: `javascript:`, `data:`, `vbscript:` and
 * scheme-relative forms are all refused rather than normalised, so a hostile
 * model cannot smuggle an executable URL into an href or an <img src>.
 */
function safeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length > 2000) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
