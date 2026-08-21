export type ThemeTokenType = "color" | "size" | "font";
export type ThemeTokenCategory = "color" | "radius" | "shadow" | "typography" | "layout" | "motion" | "spacing";

export interface ThemeTokenMeta {
  name: `--cc-${string}`;
  description: string;
  category: ThemeTokenCategory;
  type: ThemeTokenType;
}

export type ThemeTokens = Record<string, string>;
export type ThemePresetName = "midnight" | "light" | "terminal" | "paper" | "neon" | "minimal";

export const TOKEN_METADATA = [
  { name: "--cc-bg", description: "Panel body background.", category: "color", type: "color" },
  { name: "--cc-surface", description: "Header, assistant bubble, input, and nudge surface.", category: "color", type: "color" },
  { name: "--cc-surface-raised", description: "Raised controls, hover states, scrollbar thumb, and secondary surfaces.", category: "color", type: "color" },
  { name: "--cc-border", description: "Panel, bubble, input, chip, and divider border color.", category: "color", type: "color" },
  { name: "--cc-text", description: "Primary widget text color.", category: "color", type: "color" },
  { name: "--cc-text-muted", description: "Secondary labels, placeholders, icon buttons, and credit text.", category: "color", type: "color" },
  { name: "--cc-accent", description: "Primary accent used for buttons, links, focus, and user bubbles.", category: "color", type: "color" },
  { name: "--cc-accent-2", description: "Secondary accent used as the first gradient stop.", category: "color", type: "color" },
  { name: "--cc-accent-ink", description: "Text and icon color placed on accent backgrounds.", category: "color", type: "color" },
  { name: "--cc-bubble-user-bg", description: "User message bubble background.", category: "color", type: "color" },
  { name: "--cc-bubble-user-text", description: "User message bubble text color.", category: "color", type: "color" },
  { name: "--cc-bubble-agent-bg", description: "Assistant message bubble background.", category: "color", type: "color" },
  { name: "--cc-bubble-agent-text", description: "Assistant message bubble text color.", category: "color", type: "color" },
  { name: "--cc-online", description: "Online status dot color.", category: "color", type: "color" },
  { name: "--cc-link", description: "Assistant message link color.", category: "color", type: "color" },
  { name: "--cc-focus", description: "Input focus ring shadow.", category: "color", type: "color" },
  { name: "--cc-header-glow", description: "Radial accent wash in the panel header.", category: "color", type: "color" },
  { name: "--cc-hover-border", description: "Nudge hover border color.", category: "color", type: "color" },
  { name: "--cc-chip-hover-bg", description: "Suggestion chip hover background.", category: "color", type: "color" },
  { name: "--cc-credit-accent", description: "Accent color inside the credit line.", category: "color", type: "color" },
  { name: "--cc-launcher-bg", description: "Floating launcher background.", category: "color", type: "color" },
  { name: "--cc-launcher-icon-bg", description: "Inner launcher icon background.", category: "color", type: "color" },
  { name: "--cc-logo-bg", description: "Header logo fallback background.", category: "color", type: "color" },
  { name: "--cc-send-bg", description: "Send button background.", category: "color", type: "color" },
  { name: "--cc-header-bg", description: "Panel header layered background.", category: "color", type: "color" },
  { name: "--cc-glow", description: "Accent glow used by the launcher, logo, and pulse.", category: "shadow", type: "color" },
  { name: "--cc-shadow-panel", description: "Main panel and nudge shadow.", category: "shadow", type: "size" },
  { name: "--cc-shadow-launcher", description: "Launcher shadow including accent glow.", category: "shadow", type: "size" },
  { name: "--cc-shadow-launcher-hover", description: "Launcher hover shadow.", category: "shadow", type: "size" },
  { name: "--cc-shadow-logo", description: "Header avatar shadow.", category: "shadow", type: "size" },
  { name: "--cc-radius-panel", description: "Panel corner radius.", category: "radius", type: "size" },
  { name: "--cc-radius-bubble", description: "Message bubble corner radius.", category: "radius", type: "size" },
  { name: "--cc-radius-bubble-tail", description: "Reduced radius on message tail corners.", category: "radius", type: "size" },
  { name: "--cc-radius-launcher", description: "Floating launcher corner radius.", category: "radius", type: "size" },
  { name: "--cc-radius-launcher-icon", description: "Launcher icon corner radius.", category: "radius", type: "size" },
  { name: "--cc-radius-nudge", description: "Nudge bubble corner radius.", category: "radius", type: "size" },
  { name: "--cc-radius-nudge-tail", description: "Nudge tail corner radius.", category: "radius", type: "size" },
  { name: "--cc-radius-control", description: "Input, send, and chip corner radius.", category: "radius", type: "size" },
  { name: "--cc-radius-logo", description: "Header avatar corner radius.", category: "radius", type: "size" },
  { name: "--cc-font-family", description: "Widget font stack.", category: "typography", type: "font" },
  { name: "--cc-font-size", description: "Base message and input font size.", category: "typography", type: "size" },
  { name: "--cc-font-size-launcher", description: "Launcher label font size.", category: "typography", type: "size" },
  { name: "--cc-font-size-nudge", description: "Nudge font size.", category: "typography", type: "size" },
  { name: "--cc-font-size-title", description: "Header title font size.", category: "typography", type: "size" },
  { name: "--cc-font-size-subtitle", description: "Header subtitle font size.", category: "typography", type: "size" },
  { name: "--cc-font-size-chip", description: "Suggestion chip font size.", category: "typography", type: "size" },
  { name: "--cc-font-size-credit", description: "Credit line font size.", category: "typography", type: "size" },
  { name: "--cc-font-size-logo", description: "Fallback avatar letter font size.", category: "typography", type: "size" },
  { name: "--cc-font-size-logo-emoji", description: "Header emoji avatar font size.", category: "typography", type: "size" },
  { name: "--cc-font-size-launcher-emoji", description: "Launcher emoji font size.", category: "typography", type: "size" },
  { name: "--cc-font-size-close", description: "Close button icon font size.", category: "typography", type: "size" },
  { name: "--cc-line-height", description: "Base message and input line height.", category: "typography", type: "size" },
  { name: "--cc-line-height-nudge", description: "Nudge line height.", category: "typography", type: "size" },
  { name: "--cc-line-height-title", description: "Header title line height.", category: "typography", type: "size" },
  { name: "--cc-font-weight-title", description: "Header title weight.", category: "typography", type: "size" },
  { name: "--cc-font-weight-launcher", description: "Launcher label weight.", category: "typography", type: "size" },
  { name: "--cc-font-weight-link", description: "Assistant link and credit accent weight.", category: "typography", type: "size" },
  { name: "--cc-letter-spacing", description: "Launcher label letter spacing.", category: "typography", type: "size" },
  { name: "--cc-space-unit", description: "Base spacing unit for derived layout measurements.", category: "spacing", type: "size" },
  { name: "--cc-border-width", description: "Border width used by panels, bubbles, inputs, chips, and dividers.", category: "layout", type: "size" },
  { name: "--cc-z-index", description: "Floating widget stacking level.", category: "layout", type: "size" },
  { name: "--cc-launcher-height", description: "Launcher and round launcher diameter.", category: "layout", type: "size" },
  { name: "--cc-launcher-icon-size", description: "Inner launcher icon size.", category: "layout", type: "size" },
  { name: "--cc-launcher-svg-size", description: "Launcher SVG icon size.", category: "layout", type: "size" },
  { name: "--cc-launcher-circle-svg-size", description: "Round launcher SVG icon size.", category: "layout", type: "size" },
  { name: "--cc-panel-width", description: "Floating panel width.", category: "layout", type: "size" },
  { name: "--cc-panel-height", description: "Floating panel height.", category: "layout", type: "size" },
  { name: "--cc-inline-panel-height", description: "Inline panel height.", category: "layout", type: "size" },
  { name: "--cc-panel-max-width", description: "Floating panel viewport max width.", category: "layout", type: "size" },
  { name: "--cc-panel-max-height", description: "Floating panel viewport max height.", category: "layout", type: "size" },
  { name: "--cc-offset-x", description: "Horizontal edge offset for floating placement.", category: "layout", type: "size" },
  { name: "--cc-offset-y", description: "Vertical edge offset for floating placement.", category: "layout", type: "size" },
  { name: "--cc-motion-duration", description: "Default transition and small entrance animation duration.", category: "motion", type: "size" },
  { name: "--cc-motion-duration-panel", description: "Panel entrance animation duration.", category: "motion", type: "size" },
  { name: "--cc-motion-duration-nudge", description: "Nudge entrance animation duration.", category: "motion", type: "size" },
  { name: "--cc-motion-duration-launcher", description: "Launcher entrance animation duration.", category: "motion", type: "size" },
  { name: "--cc-motion-duration-pulse", description: "Launcher attention pulse duration.", category: "motion", type: "size" },
] as const satisfies readonly ThemeTokenMeta[];

const baseLayoutTokens: ThemeTokens = {
  "--cc-radius-panel": "20px",
  "--cc-radius-bubble": "15px",
  "--cc-radius-bubble-tail": "5px",
  "--cc-radius-launcher": "999px",
  "--cc-radius-launcher-icon": "50%",
  "--cc-radius-nudge": "16px",
  "--cc-radius-nudge-tail": "6px",
  "--cc-radius-control": "13px",
  "--cc-radius-logo": "11px",
  "--cc-font-family": '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
  "--cc-font-size": "14px",
  "--cc-font-size-launcher": "15px",
  "--cc-font-size-nudge": "13.5px",
  "--cc-font-size-title": "14.5px",
  "--cc-font-size-subtitle": "11.5px",
  "--cc-font-size-chip": "12.5px",
  "--cc-font-size-credit": "10.5px",
  "--cc-font-size-logo": "16px",
  "--cc-font-size-logo-emoji": "18px",
  "--cc-font-size-launcher-emoji": "22px",
  "--cc-font-size-close": "21px",
  "--cc-line-height": "1.5",
  "--cc-line-height-nudge": "1.45",
  "--cc-line-height-title": "1.15",
  "--cc-font-weight-title": "680",
  "--cc-font-weight-launcher": "650",
  "--cc-font-weight-link": "600",
  "--cc-letter-spacing": ".1px",
  "--cc-space-unit": "4px",
  "--cc-border-width": "1px",
  "--cc-z-index": "2147483000",
  "--cc-launcher-height": "56px",
  "--cc-launcher-icon-size": "44px",
  "--cc-launcher-svg-size": "24px",
  "--cc-launcher-circle-svg-size": "27px",
  "--cc-panel-width": "392px",
  "--cc-panel-height": "580px",
  "--cc-inline-panel-height": "540px",
  "--cc-panel-max-width": "calc(100vw - 32px)",
  "--cc-panel-max-height": "calc(100vh - 120px)",
  "--cc-offset-x": "24px",
  "--cc-offset-y": "24px",
  "--cc-motion-duration": ".2s",
  "--cc-motion-duration-panel": ".22s",
  "--cc-motion-duration-nudge": ".35s",
  "--cc-motion-duration-launcher": ".4s",
  "--cc-motion-duration-pulse": "2.6s",
};

const midnightColors: ThemeTokens = {
  "--cc-bg": "#0c0f16",
  "--cc-surface": "#151b25",
  "--cc-surface-raised": "#1e2632",
  "--cc-text": "#eef2f8",
  "--cc-text-muted": "#94a0b1",
  "--cc-border": "rgba(255,255,255,0.09)",
  "--cc-accent": "#6d8bff",
  "--cc-accent-2": "color-mix(in oklab, var(--cc-accent) 62%, #b07bff 38%)",
  "--cc-accent-ink": "#ffffff",
  "--cc-bubble-user-bg": "linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent))",
  "--cc-bubble-user-text": "var(--cc-accent-ink)",
  "--cc-bubble-agent-bg": "var(--cc-surface)",
  "--cc-bubble-agent-text": "var(--cc-text)",
  "--cc-online": "#36d07a",
  "--cc-link": "color-mix(in srgb, var(--cc-accent) 75%, #fff 25%)",
  "--cc-focus": "0 0 0 3px color-mix(in srgb, var(--cc-accent) 22%, transparent)",
  "--cc-header-glow": "color-mix(in srgb, var(--cc-accent) 22%, transparent)",
  "--cc-hover-border": "color-mix(in srgb, var(--cc-accent) 50%, var(--cc-border))",
  "--cc-chip-hover-bg": "color-mix(in srgb, var(--cc-accent) 12%, var(--cc-surface-raised))",
  "--cc-credit-accent": "color-mix(in srgb, var(--cc-accent) 70%, var(--cc-text-muted))",
  "--cc-launcher-bg": "linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent))",
  "--cc-launcher-icon-bg": "rgba(255,255,255,0.16)",
  "--cc-logo-bg": "linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent))",
  "--cc-send-bg": "linear-gradient(135deg, var(--cc-accent-2), var(--cc-accent))",
  "--cc-header-bg":
    "radial-gradient(120% 140% at 0% 0%, var(--cc-header-glow), transparent 60%), linear-gradient(180deg, var(--cc-surface), var(--cc-bg))",
  "--cc-glow": "color-mix(in srgb, var(--cc-accent) 55%, transparent)",
  "--cc-shadow-panel": "0 28px 70px -16px rgba(0,0,0,0.62)",
  "--cc-shadow-launcher": "var(--cc-shadow-panel), 0 8px 28px -6px var(--cc-glow)",
  "--cc-shadow-launcher-hover": "var(--cc-shadow-panel), 0 12px 34px -4px var(--cc-glow)",
  "--cc-shadow-logo": "0 6px 18px -6px var(--cc-glow)",
};

export const THEME_PRESETS = {
  midnight: {
    ...baseLayoutTokens,
    ...midnightColors,
  },
  light: {
    ...baseLayoutTokens,
    ...midnightColors,
    "--cc-bg": "#ffffff",
    "--cc-surface": "#f5f7fb",
    "--cc-surface-raised": "#eaeef5",
    "--cc-text": "#131720",
    "--cc-text-muted": "#5d6b7e",
    "--cc-border": "rgba(10,20,40,0.10)",
    "--cc-shadow-panel": "0 24px 60px -18px rgba(20,30,60,0.28)",
  },
  terminal: {
    ...baseLayoutTokens,
    ...midnightColors,
    "--cc-bg": "#050805",
    "--cc-surface": "#0d160f",
    "--cc-surface-raised": "#152219",
    "--cc-text": "#d8ffe2",
    "--cc-text-muted": "#7dbb8d",
    "--cc-border": "rgba(95,255,133,0.22)",
    "--cc-accent": "#41ff7a",
    "--cc-accent-2": "#d4ff4f",
    "--cc-accent-ink": "#041006",
    "--cc-font-family": '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
  },
  paper: {
    ...baseLayoutTokens,
    ...midnightColors,
    "--cc-bg": "#fbf7ef",
    "--cc-surface": "#fffdf8",
    "--cc-surface-raised": "#efe7da",
    "--cc-text": "#221d18",
    "--cc-text-muted": "#75685a",
    "--cc-border": "rgba(74,57,38,0.16)",
    "--cc-accent": "#2f6f73",
    "--cc-accent-2": "#c56b4c",
    "--cc-accent-ink": "#fffdf8",
    "--cc-shadow-panel": "0 24px 54px -20px rgba(73,55,32,0.32)",
  },
  neon: {
    ...baseLayoutTokens,
    ...midnightColors,
    "--cc-bg": "#080713",
    "--cc-surface": "#111028",
    "--cc-surface-raised": "#1a1740",
    "--cc-text": "#f7f4ff",
    "--cc-text-muted": "#b8afd6",
    "--cc-border": "rgba(114,238,255,0.22)",
    "--cc-accent": "#00e5ff",
    "--cc-accent-2": "#ff4fd8",
    "--cc-accent-ink": "#050713",
    "--cc-glow": "color-mix(in srgb, var(--cc-accent-2) 50%, transparent)",
  },
  minimal: {
    ...baseLayoutTokens,
    ...midnightColors,
    "--cc-bg": "#ffffff",
    "--cc-surface": "#ffffff",
    "--cc-surface-raised": "#f3f4f6",
    "--cc-text": "#111827",
    "--cc-text-muted": "#6b7280",
    "--cc-border": "#d9dee7",
    "--cc-accent": "#111827",
    "--cc-accent-2": "#4b5563",
    "--cc-accent-ink": "#ffffff",
    "--cc-shadow-panel": "0 16px 40px -24px rgba(17,24,39,0.34)",
    "--cc-radius-panel": "12px",
    "--cc-radius-bubble": "10px",
    "--cc-radius-launcher": "10px",
  },
} as const satisfies Record<ThemePresetName, ThemeTokens>;

export function isThemePresetName(value: unknown): value is ThemePresetName {
  return typeof value === "string" && value in THEME_PRESETS;
}

export function deriveAccentTokens(accentColor?: string, accentColor2?: string): ThemeTokens {
  const tokens: ThemeTokens = {};
  if (accentColor) {
    tokens["--cc-accent"] = accentColor;
    tokens["--cc-accent-2"] = accentColor2 || `color-mix(in oklab, ${accentColor} 62%, #b07bff 38%)`;
    tokens["--cc-glow"] = `color-mix(in srgb, ${accentColor} 55%, transparent)`;
  } else if (accentColor2) {
    tokens["--cc-accent-2"] = accentColor2;
  }
  return tokens;
}

const radiusTokens = [
  "--cc-radius-panel",
  "--cc-radius-bubble",
  "--cc-radius-bubble-tail",
  "--cc-radius-nudge",
  "--cc-radius-nudge-tail",
  "--cc-radius-control",
  "--cc-radius-logo",
  "--cc-radius-launcher",
] as const;

export function scaleRadiusTokens(tokens: ThemeTokens, scale?: number): ThemeTokens {
  if (scale === undefined || !Number.isFinite(scale)) return {};
  const clamped = Math.max(0, scale);
  return Object.fromEntries(
    radiusTokens.map((name) => [name, `calc(${tokens[name] || THEME_PRESETS.midnight[name]} * ${clamped})`])
  );
}

export function densityTokens(density?: "comfortable" | "compact"): ThemeTokens {
  if (density !== "compact") return {};
  return {
    "--cc-space-unit": "3px",
    "--cc-launcher-height": "48px",
    "--cc-launcher-icon-size": "38px",
    "--cc-panel-height": "520px",
    "--cc-inline-panel-height": "500px",
    "--cc-font-size": "13px",
    "--cc-font-size-launcher": "14px",
    "--cc-font-size-nudge": "12.5px",
    "--cc-font-size-title": "13.5px",
    "--cc-font-size-subtitle": "11px",
    "--cc-font-size-chip": "12px",
    "--cc-font-size-credit": "10px",
  };
}
