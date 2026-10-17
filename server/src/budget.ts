import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";
import type { ChatProvider, ChatTurn, StreamChatOptions } from "./providers/types.js";
import { ProviderFailure } from "./providerFailure.js";
import { HttpError } from "./runtime.js";

export const BUDGET_EVENTS = ["budget_warning", "budget_exhausted", "provider_exhausted", "provider_auth", "provider_rate_limited", "provider_failure"] as const;
export type BudgetEvent = typeof BUDGET_EVENTS[number];
export type Alert = { event: BudgetEvent; periodStart: number; requests: number; volume: number };
export interface BudgetOptions {
  path: string;
  requests: number;
  volume: number;
  periodMs: number;
  now?: () => number;
  send: (alert: Alert) => Promise<void>;
}
type Row = { start: number; requests: number; volume: number; blocked: string; until: number };

// One database belongs to one service. Transactions also serialize multiple processes.
export class UsageBudget {
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  constructor(private readonly options: BudgetOptions) {
    for (const n of [options.requests, options.volume, options.periodMs]) {
      if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Invalid usage budget configuration");
    }
    if (options.periodMs > 31 * 86_400_000) throw new Error("Usage period must not exceed 31 days");
    this.now = options.now ?? Date.now;
    this.db = new DatabaseSync(options.path);
    if (options.path !== ":memory:") chmodSync(options.path, 0o600);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK(id=1), start INTEGER NOT NULL, requests INTEGER NOT NULL, volume INTEGER NOT NULL, blocked TEXT NOT NULL, until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS alerts (event TEXT PRIMARY KEY, start INTEGER NOT NULL, status TEXT NOT NULL);
    `);
    this.db.prepare("INSERT OR IGNORE INTO budget VALUES (1, ?, 0, 0, '', 0)").run(this.now());
  }
  close() { this.db.close(); }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch { this.db.exec("ROLLBACK"); throw new HttpError(503, "budget_unavailable", "Chat usage controls are unavailable. Chat is paused."); }
  }
  private row(): Row {
    const row = this.db.prepare("SELECT * FROM budget WHERE id=1").get() as unknown as Row;
    if (this.now() >= row.start + this.options.periodMs) {
      row.start = this.now(); row.requests = 0; row.volume = 0;
      this.db.prepare("UPDATE budget SET start=?, requests=0, volume=0 WHERE id=1").run(row.start);
      // Unconfirmed alerts remain blocking across periods and restarts.
      this.db.exec("DELETE FROM alerts WHERE status='sent'");
    }
    return row;
  }
  private check(row: Row): HttpError | undefined {
    if (row.blocked) return new HttpError(503, row.blocked, "Chat is paused. The provider needs owner attention.");
    if (this.db.prepare("SELECT event FROM alerts WHERE status!='sent' LIMIT 1").get())
      return new HttpError(503, "alert_unconfirmed", "Chat is paused while the owner notification is checked.");
    if (row.until > this.now()) return new HttpError(503, "provider_rate_limited", "The chat provider is rate limited. Please wait before sending another message.");
    if (row.requests >= this.options.requests || row.volume >= this.options.volume)
      return new HttpError(503, "budget_exhausted", "The chat usage limit has been reached. Please return after the usage period resets.");
  }
  assertAvailable(): void {
    const error = this.transaction(() => this.check(this.row()));
    if (error) throw error;
  }
  async notify(event: BudgetEvent): Promise<void> {
    const alert = this.transaction(() => {
      const row = this.row();
      const result = this.db.prepare("INSERT OR IGNORE INTO alerts VALUES (?, ?, 'pending')").run(event, row.start);
      return result.changes ? { event, periodStart: row.start, requests: row.requests, volume: row.volume } : undefined;
    });
    if (!alert) return;
    try {
      await this.options.send(alert);
      this.db.prepare("UPDATE alerts SET status='sent' WHERE event=?").run(event);
    } catch {
      // An uncertain delivery is never automatically repeated. The pending row fails closed.
      console.error('[concierge] owner_alert_unconfirmed');
      throw new HttpError(503, "alert_unconfirmed", "Chat is paused while the owner notification is checked.");
    }
  }
  async reserve(volume: number): Promise<void> {
    const result = this.transaction(() => {
      const row = this.row();
      const error = this.check(row);
      if (error) return { error };
      if (!Number.isSafeInteger(volume) || volume <= 0 || row.volume + volume > this.options.volume)
        return { error: new HttpError(503, "budget_exhausted", "This reply exceeds the remaining chat usage limit."), exhausted: true };
      row.requests++; row.volume += volume;
      this.db.prepare("UPDATE budget SET requests=?, volume=? WHERE id=1").run(row.requests, row.volume);
      return { warning: row.requests >= this.options.requests * .8 || row.volume >= this.options.volume * .8,
        exhausted: row.requests >= this.options.requests || row.volume >= this.options.volume };
    });
    if (result.warning) await this.notify("budget_warning");
    if (result.exhausted || result.error?.code === "budget_exhausted") await this.notify("budget_exhausted");
    if (result.error) throw result.error;
  }
  async failure(error: unknown): Promise<void> {
    const code = error instanceof ProviderFailure ? error.code : "provider_failure";
    this.transaction(() => {
      if (code === "provider_exhausted" || code === "provider_auth")
        this.db.prepare("UPDATE budget SET blocked=? WHERE id=1").run(code);
      if (code === "provider_rate_limited")
        this.db.prepare("UPDATE budget SET until=? WHERE id=1").run(this.now() + 60_000);
    });
    if (code !== "provider_refused") await this.notify(code);
  }
  wrap(provider: ChatProvider): ChatProvider {
    const call = async <T>(messages: ChatTurn[], opts: StreamChatOptions | undefined, fn: (opts: StreamChatOptions) => Promise<T>): Promise<T> => {
      if (opts?.signal?.aborted) throw new HttpError(504, "request_aborted", "Request cancelled or timed out.");
      const bounded = { ...opts, maxTokens: Math.min(opts?.maxTokens ?? 600, 600) };
      // Bytes conservatively bound input volume. Output tokens are reserved at the hard cap.
      // Failed, cancelled, and interrupted calls are charged in full. No refunds or retries.
      await this.reserve(Buffer.byteLength(JSON.stringify({ messages, tools: opts?.tools ?? [] }), "utf8") + 600);
      try { return await fn(bounded); }
      catch (error) { await this.failure(error); throw error instanceof ProviderFailure ? error : new ProviderFailure("provider_failure"); }
    };
    return {
      name: provider.name,
      streamChat: (messages, delta, opts) => call(messages, opts, bounded => provider.streamChat(messages, delta, bounded)),
      streamChatWithToolCalls: (messages, delta, opts) => call(messages, opts, bounded => provider.streamChatWithToolCalls(messages, delta, bounded)),
    };
  }
}

export function budgetFromEnv(env: NodeJS.ProcessEnv, send: BudgetOptions["send"]): UsageBudget {
  return new UsageBudget({ path: env.CONCIERGE_BUDGET_PATH || "./usage.sqlite",
    requests: Number(env.CONCIERGE_BUDGET_REQUESTS || 200),
    volume: Number(env.CONCIERGE_BUDGET_VOLUME || 2_000_000),
    periodMs: Number(env.CONCIERGE_BUDGET_PERIOD_MS || 86_400_000), send });
}
