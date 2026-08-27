import { readFileSync } from "node:fs";
import { parseConciergePacket, type ConciergePacketManifestV1 } from "./packet.js";
import type { ChatProviderConfig } from "./providers/index.js";
import type { PageBrief } from "./types.js";

/**
 * Loads page briefs. Two modes:
 *  - Single page: point CONCIERGE_BRIEF at a JSON file ({ ...PageBrief }).
 *  - Multi page:  point CONCIERGE_BRIEFS at a JSON file ({ [pageId]: PageBrief }).
 * The Smithers landing-page workflow emits one brief JSON per generated page.
 */

type BriefMap = Record<string, PageBrief>;

let single: PageBrief | null = null;
let map: BriefMap | null = null;
let packet: ConciergePacketManifestV1 | null = null;

function load(): void {
  const packetPath = process.env.CONCIERGE_PACKET;
  const singlePath = process.env.CONCIERGE_BRIEF;
  const mapPath = process.env.CONCIERGE_BRIEFS;
  const configuredSources = [packetPath, singlePath, mapPath].filter(Boolean);
  if (configuredSources.length > 1) {
    throw new Error("Configure only one of CONCIERGE_PACKET, CONCIERGE_BRIEF, or CONCIERGE_BRIEFS.");
  }
  if (packetPath) {
    packet = parseConciergePacket(JSON.parse(readFileSync(packetPath, "utf8")));
    map = packet.pages;
  }
  if (singlePath) single = JSON.parse(readFileSync(singlePath, "utf8"));
  if (mapPath) map = JSON.parse(readFileSync(mapPath, "utf8"));
  if (!single && !map && !packet) {
    throw new Error(
      "No briefs configured. Set CONCIERGE_PACKET, CONCIERGE_BRIEF (single page), or CONCIERGE_BRIEFS (multi page)."
    );
  }
}

export function getBrief(pageId?: string): PageBrief {
  if (!single && !map) load();
  if (pageId && map && map[pageId]) return map[pageId];
  if (packet?.defaultPageId && map?.[packet.defaultPageId]) return map[packet.defaultPageId];
  if (single) return single;
  if (map) {
    const first = Object.values(map)[0];
    if (first) return first;
  }
  throw new Error(`No brief found for pageId="${pageId ?? "(none)"}"`);
}

export function getConfiguredBriefs(): PageBrief[] {
  if (!single && !map) load();
  return [...(single ? [single] : []), ...(map ? Object.values(map) : [])];
}

export function getConfiguredProviderDefaults(): Partial<ChatProviderConfig> {
  if (!single && !map) load();
  if (!packet?.provider) return {};
  return {
    provider: packet.provider.type,
    baseUrl: packet.provider.baseUrl,
    model: packet.provider.model,
  };
}
