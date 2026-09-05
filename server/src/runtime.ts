import type { NextFunction, Request, Response } from "express";
import type { ChatProvider } from "./providers/index.js";

export interface RuntimeLimits {
  maxConcurrent: number;
  maxQueueDepth: number;
  requestTimeoutMs: number;
  ipWindowMs: number;
  ipMax: number;
  sessionWindowMs: number;
  sessionMax: number;
  circuitFailures: number;
  circuitResetMs: number;
}

export interface RuntimeState {
  queue: {
    active: number;
    queued: number;
    maxConcurrent: number;
    maxQueueDepth: number;
  };
  circuit: CircuitState;
}

// Declared as a type alias, not an interface: TypeScript only gives object
// *type aliases* an implicit index signature, so an interface here cannot be
// passed as HttpError's `detail: Record<string, unknown>` (TS2345).
export type CircuitState = {
  state: "closed" | "open" | "half_open";
  failures: number;
  openedAt?: string;
  nextAttemptAt?: string;
};

export interface ProviderCallStats {
  ok: boolean;
  durationMs: number;
  errorName?: string;
}

type Release = () => void;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export function limitsFromEnv(env: NodeJS.ProcessEnv = process.env): RuntimeLimits {
  return {
    maxConcurrent: readPositiveInt(env.CONCIERGE_MAX_CONCURRENT, 4),
    maxQueueDepth: readNonNegativeInt(env.CONCIERGE_MAX_QUEUE_DEPTH, 16),
    requestTimeoutMs: readPositiveInt(env.CONCIERGE_REQUEST_TIMEOUT_MS, 30_000),
    ipWindowMs: readPositiveInt(env.CONCIERGE_RATE_LIMIT_WINDOW_MS, 60_000),
    ipMax: readPositiveInt(env.CONCIERGE_RATE_LIMIT_IP || env.RATE_LIMIT, 20),
    sessionWindowMs: readPositiveInt(env.CONCIERGE_SESSION_RATE_LIMIT_WINDOW_MS, 60_000),
    sessionMax: readPositiveInt(env.CONCIERGE_RATE_LIMIT_SESSION, 12),
    circuitFailures: readPositiveInt(env.CONCIERGE_CIRCUIT_FAILURES, 3),
    circuitResetMs: readPositiveInt(env.CONCIERGE_CIRCUIT_RESET_MS, 30_000),
  };
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly now: () => number = Date.now
  ) {}

  hit(key: string): { allowed: boolean; count: number; limit: number; retryAfterMs: number } {
    const now = this.now();
    const arr = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    arr.push(now);
    this.hits.set(key, arr);
    const oldest = arr[0] ?? now;
    return {
      allowed: arr.length <= this.max,
      count: arr.length,
      limit: this.max,
      retryAfterMs: Math.max(0, this.windowMs - (now - oldest)),
    };
  }
}

export class RequestQueue {
  private active = 0;
  private readonly queue: Array<{ resolve: (release: Release) => void; reject: (err: Error) => void; signal: AbortSignal }> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueueDepth: number
  ) {}

  snapshot(): RuntimeState["queue"] {
    return {
      active: this.active,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueueDepth: this.maxQueueDepth,
    };
  }

  acquire(signal: AbortSignal): Promise<Release> {
    if (signal.aborted) return Promise.reject(abortError(signal));
    if (this.active < this.maxConcurrent) return Promise.resolve(this.takeSlot());
    if (this.queue.length >= this.maxQueueDepth) {
      return Promise.reject(
        new HttpError(503, "queue_full", "The server is busy. Try again shortly.", this.snapshot())
      );
    }

    return new Promise((resolve, reject) => {
      // The entry that gets pushed must be the SAME object the abort handler
      // searches for. Building a separate literal at push time made
      // indexOf(entry) always return -1, so an aborted client rejected its
      // promise but left its slot in the queue forever, permanently shrinking
      // effective queue depth until the process restarted.
      const entry = {
        resolve: (release: Release) => {
          signal.removeEventListener("abort", onAbort);
          resolve(release);
        },
        reject,
        signal,
      };
      const onAbort = () => {
        const idx = this.queue.indexOf(entry);
        if (idx >= 0) this.queue.splice(idx, 1);
        reject(abortError(signal));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.queue.push(entry);
    });
  }

  private takeSlot(): Release {
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
      this.drain();
    };
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next || next.signal.aborted) continue;
      next.resolve(this.takeSlot());
    }
  }
}

function abortError(signal: AbortSignal): HttpError {
  const reason = signal.reason instanceof Error ? signal.reason.message : "";
  if (reason === "request_timeout") return new HttpError(504, "request_timeout", "Request timed out while queued.");
  return new HttpError(499, "request_cancelled", "Request was cancelled.");
}

export class ProviderCircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private probing = false;

  constructor(
    private readonly threshold: number,
    private readonly resetMs: number,
    private readonly now: () => number = Date.now
  ) {}

  canAttempt(): boolean {
    if (this.openedAt === 0) return true;
    return this.now() - this.openedAt >= this.resetMs && !this.probing;
  }

  snapshot(): CircuitState {
    const state = this.openedAt === 0 ? "closed" : this.now() - this.openedAt >= this.resetMs ? "half_open" : "open";
    return {
      state,
      failures: this.failures,
      openedAt: this.openedAt ? new Date(this.openedAt).toISOString() : undefined,
      nextAttemptAt: this.openedAt ? new Date(this.openedAt + this.resetMs).toISOString() : undefined,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canAttempt()) {
      throw new HttpError(503, "provider_circuit_open", "The upstream provider is temporarily unavailable.", this.snapshot());
    }
    this.probing = this.openedAt !== 0;
    const started = this.now();
    try {
      const value = await fn();
      this.failures = 0;
      this.openedAt = 0;
      return value;
    } catch (err) {
      this.failures++;
      if (this.failures >= this.threshold) this.openedAt = this.now();
      const name = err instanceof Error ? err.name : "Error";
      console.error(
        JSON.stringify({
          type: "concierge.provider_call",
          ok: false,
          durationMs: this.now() - started,
          errorName: name,
          circuit: this.snapshot(),
        } satisfies ProviderCallStats & { type: string; circuit: CircuitState })
      );
      throw err;
    } finally {
      this.probing = false;
    }
  }
}

export interface Runtime {
  readonly limits: RuntimeLimits;
  readonly queue: RequestQueue;
  readonly ipLimiter: SlidingWindowRateLimiter;
  readonly sessionLimiter: SlidingWindowRateLimiter;
  readonly circuit: ProviderCircuitBreaker;
  state(): RuntimeState;
}

export function createRuntime(limits: RuntimeLimits = limitsFromEnv()): Runtime {
  const queue = new RequestQueue(limits.maxConcurrent, limits.maxQueueDepth);
  const circuit = new ProviderCircuitBreaker(limits.circuitFailures, limits.circuitResetMs);
  return {
    limits,
    queue,
    ipLimiter: new SlidingWindowRateLimiter(limits.ipWindowMs, limits.ipMax),
    sessionLimiter: new SlidingWindowRateLimiter(limits.sessionWindowMs, limits.sessionMax),
    circuit,
    state: () => ({ queue: queue.snapshot(), circuit: circuit.snapshot() }),
  };
}

export function requestGate(runtime: Runtime) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error("request_timeout")), runtime.limits.requestTimeoutMs);
    const abort = () => ac.abort(new Error("request_cancelled"));
    // `req.on("aborted")` does not fire for an aborted Express request on
    // current Node (verified on v24): only res "close" does, and only with
    // writableEnded === false. It is kept as a belt-and-braces signal for
    // older runtimes, but res "close" is the one that actually works.
    req.on("aborted", abort);
    // This MUST be registered before awaiting the queue. Registering it after
    // acquire() meant a client that hung up while still queued never aborted
    // its signal, so its entry sat in the wait queue until process restart.
    const onEarlyClose = () => {
      if (!res.writableEnded) abort();
    };
    res.on("close", onEarlyClose);
    res.locals.conciergeAbortSignal = ac.signal;

    let release: Release | undefined;
    try {
      release = await runtime.queue.acquire(ac.signal);
    } catch (err) {
      clearTimeout(timer);
      req.off("aborted", abort);
      res.off("close", onEarlyClose);
      writeHttpError(res, err);
      return;
    }

    const cleanup = () => {
      clearTimeout(timer);
      req.off("aborted", abort);
      res.off("close", onEarlyClose);
      release?.();
      release = undefined;
    };
    res.once("finish", cleanup);
    res.once("close", cleanup);
    next();
  };
}

export function enforceRateLimits(runtime: Runtime, ip: string, sessionId?: string): HttpError | null {
  const ipResult = runtime.ipLimiter.hit(`ip:${ip}`);
  if (!ipResult.allowed) {
    return new HttpError(429, "rate_limited_ip", "Too many requests from this IP.", ipResult);
  }
  if (sessionId) {
    const sessionResult = runtime.sessionLimiter.hit(`session:${sessionId}`);
    if (!sessionResult.allowed) {
      return new HttpError(429, "rate_limited_session", "Too many requests from this session.", sessionResult);
    }
  }
  return null;
}

export function writeHttpError(res: Response, err: unknown): void {
  const fallback = new HttpError(500, "internal_error", "Unexpected server error.");
  const http = err instanceof HttpError ? err : fallback;
  if (res.headersSent) {
    res.write(`data: ${JSON.stringify({ error: http.message, code: http.code, detail: http.detail })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }
  res.status(http.status).json({ error: http.message, code: http.code, detail: http.detail });
}

export function providerWithCircuit(provider: ChatProvider, runtime: Runtime): ChatProvider {
  return {
    name: provider.name,
    streamChat(messages, onDelta, opts) {
      return runtime.circuit.execute(() => provider.streamChat(messages, onDelta, opts));
    },
    streamChatWithToolCalls(messages, onDelta, opts) {
      return runtime.circuit.execute(() => provider.streamChatWithToolCalls(messages, onDelta, opts));
    },
  };
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function readNonNegativeInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
