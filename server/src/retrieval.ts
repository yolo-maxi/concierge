import type { PageBrief, RetrievalCapability } from "./types.js";

const DEFAULT_TOP_K = 3;
const DEFAULT_MAX_INJECTED_CHARS = 4000;
const DEFAULT_CHUNK_CHARS = 1200;

interface RetrievalIndex {
  chunks: IndexedChunk[];
  topK: number;
  maxInjectedChars: number;
}

interface IndexedChunk {
  id: string;
  text: string;
  tokens: Map<string, number>;
}

const indexes = new WeakMap<PageBrief, Promise<RetrievalIndex | null>>();

export async function preloadRetrievalIndexes(briefs: PageBrief[]): Promise<void> {
  await Promise.all(briefs.map((brief) => ensureIndex(brief)));
}

export async function selectRetrievedContext(brief: PageBrief, query: string): Promise<string | undefined> {
  const index = await ensureIndex(brief);
  if (!index || index.chunks.length === 0) return undefined;

  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return undefined;

  const scored = index.chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, index.topK);

  let used = 0;
  const selected: string[] = [];
  for (const { chunk } of scored) {
    const prefix = selected.length === 0 ? "" : "\n\n";
    const label = `[${chunk.id}]\n`;
    const remaining = index.maxInjectedChars - used - prefix.length - label.length;
    if (remaining <= 0) break;
    const text = chunk.text.slice(0, remaining);
    selected.push(`${prefix}${label}${text}`);
    used += prefix.length + label.length + text.length;
  }

  return selected.length > 0 ? selected.join("") : undefined;
}

async function ensureIndex(brief: PageBrief): Promise<RetrievalIndex | null> {
  const cfg = brief.capabilities?.retrieval;
  if (!cfg) return null;

  let promise = indexes.get(brief);
  if (!promise) {
    promise = buildRetrievalIndex(cfg).catch((err) => {
      console.error("[concierge] retrieval boot failed:", err instanceof Error ? err.message : "unknown");
      return null;
    });
    indexes.set(brief, promise);
  }
  return promise;
}

async function buildRetrievalIndex(cfg: RetrievalCapability): Promise<RetrievalIndex | null> {
  const topK = clampPositive(cfg.topK, DEFAULT_TOP_K);
  const maxInjectedChars = clampPositive(cfg.maxInjectedChars, DEFAULT_MAX_INJECTED_CHARS);
  const rawChunks = await loadChunks(cfg);
  const chunks = rawChunks
    .map((text, i) => text.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `retrieval-${i + 1}`, text, tokens: tokenize(text) }));

  return { chunks, topK, maxInjectedChars };
}

async function loadChunks(cfg: RetrievalCapability): Promise<string[]> {
  if (Array.isArray(cfg.chunks) && cfg.chunks.length > 0) return cfg.chunks;

  const docs =
    cfg.source === "inline"
      ? cfg.docs ?? []
      : cfg.url
        ? [await fetchCorpusOnce(cfg.url)]
        : [];

  return docs.flatMap((doc) => chunkText(doc));
}

async function fetchCorpusOnce(url: string): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= DEFAULT_CHUNK_CHARS) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= DEFAULT_CHUNK_CHARS) {
      current = paragraph;
    } else {
      for (let i = 0; i < paragraph.length; i += DEFAULT_CHUNK_CHARS) {
        chunks.push(paragraph.slice(i, i + DEFAULT_CHUNK_CHARS));
      }
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function scoreChunk(chunk: IndexedChunk, queryTokens: Map<string, number>): number {
  let score = 0;
  for (const [token, queryCount] of queryTokens) {
    const chunkCount = chunk.tokens.get(token);
    if (!chunkCount) continue;
    score += queryCount * Math.log(1 + chunkCount);
  }
  return score;
}

function tokenize(text: string): Map<string, number> {
  const tokens = new Map<string, number>();
  for (const token of text.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []) {
    tokens.set(token, (tokens.get(token) ?? 0) + 1);
  }
  return tokens;
}

function clampPositive(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.floor(value);
}
