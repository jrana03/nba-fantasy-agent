// Per-request usage tracking (external API calls, tokens, cache hits). AsyncLocalStorage keeps counters
// separate for concurrent requests, so deep helpers like espn() can record without passing context around.
import { AsyncLocalStorage } from "node:async_hooks";

export type RateLimit = {
  limitRequests: number | null;
  remainingRequests: number | null;
  resetRequests: string | null;
  limitTokens: number | null;
  remainingTokens: number | null;
  resetTokens: string | null;
};

export type Usage = {
  espn: { calls: number; failures: number; lastError: string | null };
  openai: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    rateLimit: RateLimit | null;
    error: { code: string; message: string } | null;
  };
  cache: { hits: number; misses: number };
};

const store = new AsyncLocalStorage<Usage>();

const fresh = (): Usage => ({
  espn: { calls: 0, failures: 0, lastError: null },
  openai: { calls: 0, inputTokens: 0, outputTokens: 0, rateLimit: null, error: null },
  cache: { hits: 0, misses: 0 },
});

export function withUsage<T>(fn: () => T): T {
  return store.run(fresh(), fn);
}

/** Current request's usage, or a throwaway object outside a request (so callers never need null checks). */
export function usage(): Usage {
  return store.getStore() ?? fresh();
}

export function hasUsageScope(): boolean {
  return store.getStore() !== undefined;
}
