// Caches agent output so each finished game is only summarized (and billed) once.
// Uses the `nba_agent_cache` table when Supabase credentials are present (always true when deployed),
// otherwise falls back to an in-memory map for local development.
import { createClient } from "npm:@supabase/supabase-js@2";
import { usage } from "./usage.ts";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
const memory = new Map<string, { payload: unknown; createdAt: number }>();
let dbBroken = false;

async function read(k: string) {
  if (db && !dbBroken) {
    const { data, error } = await db.from("nba_agent_cache").select("payload, created_at").eq("key", k).maybeSingle();
    if (error) {
      console.warn("cache read failed, using memory cache:", error.message);
      dbBroken = true;
    } else {
      return data ? { payload: data.payload, createdAt: Date.parse(data.created_at) } : null;
    }
  }
  return memory.get(k) ?? null;
}

async function write(k: string, payload: unknown) {
  memory.set(k, { payload, createdAt: Date.now() });
  if (db && !dbBroken) {
    const { error } = await db
      .from("nba_agent_cache")
      .upsert({ key: k, payload, created_at: new Date().toISOString() });
    if (error) console.warn("cache write failed:", error.message);
  }
}

/**
 * Returns the cached value for `k`, or computes, stores and returns it. `ttlMs = null` caches forever.
 * `force` skips the read and recomputes (used by the manual refresh button).
 */
export async function cached<T>(k: string, ttlMs: number | null, compute: () => Promise<T>, force = false): Promise<T> {
  const hit = force ? null : await read(k);
  if (hit && (ttlMs === null || Date.now() - hit.createdAt < ttlMs)) {
    usage().cache.hits++;
    return hit.payload as T;
  }
  usage().cache.misses++;
  const value = await compute();
  await write(k, value);
  return value;
}

/** Plain key/value access (no TTL), e.g. for remembering the last OpenAI status between requests. */
export async function getValue<T>(k: string): Promise<T | null> {
  return ((await read(k))?.payload as T) ?? null;
}

export const setValue = (k: string, v: unknown) => write(k, v);

export async function sha1(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
