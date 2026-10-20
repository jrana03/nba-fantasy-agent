import { hasUsageScope, usage, withUsage } from "./usage.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-refresh-password",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** JSON response. Inside a request scope, the request's usage (API calls, tokens, cache) is attached. */
export function json(body: Record<string, unknown>, status = 200, extra: Record<string, string> = {}) {
  const payload = hasUsageScope() ? { ...body, usage: usage() } : body;
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

/** Wraps a handler with CORS preflight, per-request usage tracking and error handling. */
export function withHttp(fn: (req: Request) => Promise<Response>) {
  return (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return withUsage(async () => {
      try {
        return await fn(req);
      } catch (err) {
        console.error(err);
        const message = String((err as Error)?.message ?? err);
        // ESPN problems are an upstream data-source failure (502), not a bug in this function.
        return message.startsWith("ESPN")
          ? json({ error: `Data source error: ESPN request failed (${message}).`, source: "espn" }, 502)
          : json({ error: message, source: "server" }, 500);
      }
    });
  };
}
