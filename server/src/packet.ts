import type { PageBrief } from "./types.js";

export const CONCIERGE_PACKET_VERSION = 1;

export interface ConciergePacketManifestV1 {
  manifestVersion: 1;
  name?: string;
  defaultPageId?: string;
  provider?: {
    type: "venice";
    model?: string;
    baseUrl?: string;
  };
  pages: Record<string, PageBrief>;
}

export type ConciergePacketManifest = ConciergePacketManifestV1;

export function createConciergePacket(input: {
  name?: string;
  defaultPageId?: string;
  provider?: ConciergePacketManifestV1["provider"];
  pages: Record<string, PageBrief>;
}): ConciergePacketManifestV1 {
  validatePages(input.pages);
  return {
    manifestVersion: CONCIERGE_PACKET_VERSION,
    name: input.name,
    defaultPageId: input.defaultPageId,
    provider: input.provider,
    pages: input.pages,
  };
}

export function parseConciergePacket(value: unknown): ConciergePacketManifestV1 {
  if (!isRecord(value)) throw new Error("Concierge packet must be a JSON object.");
  if (value.manifestVersion !== CONCIERGE_PACKET_VERSION) {
    throw new Error(`Unsupported Concierge packet manifestVersion="${String(value.manifestVersion)}".`);
  }
  if (!isRecord(value.pages)) throw new Error("Concierge packet pages must be an object.");

  const pages = value.pages as Record<string, PageBrief>;
  validatePages(pages);
  const defaultPageId = value.defaultPageId;
  if (defaultPageId !== undefined && typeof defaultPageId !== "string") {
    throw new Error("Concierge packet defaultPageId must be a string when set.");
  }
  if (defaultPageId && !pages[defaultPageId]) {
    throw new Error(`Concierge packet defaultPageId="${defaultPageId}" is not present in pages.`);
  }
  if (value.provider !== undefined) validateProvider(value.provider);

  return value as unknown as ConciergePacketManifestV1;
}

function validatePages(pages: Record<string, PageBrief>): void {
  const entries = Object.entries(pages);
  if (entries.length === 0) throw new Error("Concierge packet must include at least one page.");
  for (const [pageId, brief] of entries) {
    if (!pageId.trim()) throw new Error("Concierge packet page ids must be non-empty.");
    validateBrief(pageId, brief);
  }
}

function validateBrief(pageId: string, brief: PageBrief): void {
  if (!isRecord(brief)) throw new Error(`Concierge packet page "${pageId}" must be an object.`);
  for (const key of ["brandName", "audience", "objective", "tone", "cta", "docs"] as const) {
    if (typeof brief[key] !== "string" || brief[key].trim().length === 0) {
      throw new Error(`Concierge packet page "${pageId}" is missing ${key}.`);
    }
  }
}

function validateProvider(provider: unknown): void {
  if (!isRecord(provider)) throw new Error("Concierge packet provider must be an object when set.");
  if (provider.type !== "venice") {
    throw new Error(`Unsupported Concierge packet provider.type="${String(provider.type)}".`);
  }
  for (const key of ["model", "baseUrl"] as const) {
    if (provider[key] !== undefined && typeof provider[key] !== "string") {
      throw new Error(`Concierge packet provider.${key} must be a string when set.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
