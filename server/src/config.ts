import { readFileSync } from "node:fs";
import type { PageBrief } from "./prompt.js";

/**
 * Loads page briefs. Two modes:
 *  - Single page: point CONCIERGE_BRIEF at a JSON file ({ ...PageBrief }).
 *  - Multi page:  point CONCIERGE_BRIEFS at a JSON file ({ [pageId]: PageBrief }).
 * The Smithers landing-page workflow emits one brief JSON per generated page.
 */

type BriefMap = Record<string, PageBrief>;

let single: PageBrief | null = null;
let map: BriefMap | null = null;

function load(): void {
  const singlePath = process.env.CONCIERGE_BRIEF;
  const mapPath = process.env.CONCIERGE_BRIEFS;
  if (singlePath) single = JSON.parse(readFileSync(singlePath, "utf8"));
  if (mapPath) map = JSON.parse(readFileSync(mapPath, "utf8"));
  if (!single && !map) {
    throw new Error(
      "No briefs configured. Set CONCIERGE_BRIEF (single page) or CONCIERGE_BRIEFS (multi page)."
    );
  }
}

export function getBrief(pageId?: string): PageBrief {
  if (!single && !map) load();
  if (pageId && map && map[pageId]) return map[pageId];
  if (single) return single;
  if (map) {
    const first = Object.values(map)[0];
    if (first) return first;
  }
  throw new Error(`No brief found for pageId="${pageId ?? "(none)"}"`);
}
