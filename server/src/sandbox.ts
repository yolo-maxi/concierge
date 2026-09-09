import { randomBytes } from "node:crypto";
import { BRIEF_REQUIRED_KEYS, briefValidationErrors } from "./packet.js";
import type { PageBrief } from "./types.js";

/**
 * Sandbox briefs: short-lived, server-held page briefs submitted by the
 * concierge.repo.box configurator so a visitor can talk to the widget about
 * THEIR product before self-hosting.
 *
 * The security model is unchanged. The client still cannot put a brief in the
 * /chat body; it registers one here, gets an opaque page id, and /chat looks
 * the brief up server-side like any other page. A sandbox brief is always
 * powerless: any `capabilities` block is discarded, so no retrieval, tools, or
 * generative UI can be switched on from the browser. Everything is bounded:
 * field lengths, entry count, and lifetime. Off unless CONCIERGE_SANDBOX=1.
 */

export const SANDBOX_PAGE_PREFIX = "sandbox-";
export const SANDBOX_LIMITS = {
  maxEntries: 200,
  ttlMs: 30 * 60 * 1000,
  maxDocsChars: 8000,
  maxFieldChars: 300,
} as const;

interface SandboxEntry {
  brief: PageBrief;
  expiresAt: number;
}

export interface SandboxStore {
  register(candidate: unknown, now?: number): { ok: true; pageId: string; expiresAt: number; brief: PageBrief } | { ok: false; errors: string[] };
  get(pageId: string, now?: number): PageBrief | null;
  size(): number;
}

export function isSandboxPageId(pageId: unknown): pageId is string {
  return typeof pageId === "string" && pageId.startsWith(SANDBOX_PAGE_PREFIX);
}

export function createSandboxStore(limits: Partial<typeof SANDBOX_LIMITS> = {}): SandboxStore {
  const cfg = { ...SANDBOX_LIMITS, ...limits };
  const entries = new Map<string, SandboxEntry>();

  function sweep(now: number): void {
    for (const [id, entry] of entries) if (entry.expiresAt <= now) entries.delete(id);
    // Map preserves insertion order, so the oldest registration goes first.
    while (entries.size > cfg.maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    register(candidate, now = Date.now()) {
      const errors = briefValidationErrors(candidate);
      if (errors.length) return { ok: false, errors };
      const source = candidate as Record<string, unknown>;
      const brief = Object.fromEntries(
        BRIEF_REQUIRED_KEYS.map((key) => {
          const cap = key === "docs" ? cfg.maxDocsChars : cfg.maxFieldChars;
          return [key, String(source[key]).trim().slice(0, cap)];
        })
      ) as unknown as PageBrief;
      // Deliberately no `capabilities`: a sandbox page is powerless by construction.
      const pageId = SANDBOX_PAGE_PREFIX + randomBytes(12).toString("hex");
      const expiresAt = now + cfg.ttlMs;
      sweep(now);
      entries.set(pageId, { brief, expiresAt });
      sweep(now);
      return { ok: true, pageId, expiresAt, brief };
    },
    get(pageId, now = Date.now()) {
      const entry = entries.get(pageId);
      if (!entry) return null;
      if (entry.expiresAt <= now) {
        entries.delete(pageId);
        return null;
      }
      return entry.brief;
    },
    size() {
      return entries.size;
    },
  };
}
