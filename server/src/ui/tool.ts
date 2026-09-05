import { componentCatalogue, UI_COMPONENTS, validateUiEvent, type UiEvent } from "./protocol.js";

/**
 * The single server-owned tool through which the model may propose UI.
 *
 * It is a tool rather than a text convention on purpose: the model already has
 * a structured, provider-validated channel for tool calls, so there is nothing
 * to parse out of prose and nothing an injected instruction can spoof by typing
 * a fence into a message. It is handled in the chat loop rather than in the
 * tool executor because its result is a stream event, not a message to the
 * model.
 */
export const UI_TOOL_NAME = "render_ui";

export function uiToolDefinition() {
  return {
    type: "function" as const,
    function: {
      name: UI_TOOL_NAME,
      description:
        "Render a registered interactive component to the visitor. Only the listed components exist; " +
        "you cannot write HTML, JSX or scripts. Always supply `text`: the plain-sentence version shown " +
        "if the component cannot render. Prefer plain prose; use a component only when it genuinely " +
        "helps the visitor act.\n\nAvailable components:\n" +
        componentCatalogue(),
      parameters: {
        type: "object",
        properties: {
          component: {
            type: "string",
            enum: Object.keys(UI_COMPONENTS),
            description: "Name of a registered component.",
          },
          props: { type: "object", description: "Props for that component." },
          text: {
            type: "string",
            description: "Plain-text equivalent, always required.",
          },
        },
        required: ["component", "text"],
      },
    },
  };
}

export interface UiCallOutcome {
  /** Validated event to write to the stream, if it passed. */
  event?: UiEvent;
  /** What the model is told. On failure this names the fault so it can retry in text. */
  toolMessage: string;
}

/**
 * Validate one `render_ui` call.
 *
 * A rejection is never fatal: the model is told what was wrong and continues in
 * plain text, so a malformed component degrades to prose rather than to an
 * error page. That is the whole point of requiring `text` up front.
 */
export function handleUiCall(rawArguments: string, allowedToolNames: string[]): UiCallOutcome {
  let parsed: unknown;
  try {
    parsed = rawArguments ? JSON.parse(rawArguments) : {};
  } catch {
    return { toolMessage: "The UI payload was not valid JSON. Answer in plain text instead." };
  }

  const result = validateUiEvent(parsed, { allowedToolNames });
  if (!result.ok) {
    return {
      toolMessage: `That component was rejected (${result.reason}). Answer in plain text instead, or use a registered component with valid props.`,
    };
  }

  return {
    event: result.event,
    toolMessage: "Component rendered to the visitor. Do not repeat its contents in prose.",
  };
}
