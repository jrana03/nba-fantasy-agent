// deno-lint-ignore-file no-explicit-any
// Minimal tool-calling agent loop on the OpenAI client (Responses API). The model decides which tools
// to call, we execute them, feed results back, and stop when it returns its final JSON answer.
import OpenAI from "npm:openai@5";
import { type RateLimit, usage } from "./usage.ts";
import { getValue, setValue } from "./cache.ts";

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
  run: (args: any) => Promise<unknown>;
};

const MAX_TOOL_RESULT_CHARS = 12_000;

export function agentEnabled(): boolean {
  return !!Deno.env.get("OPENAI_API_KEY");
}

/** Turns OpenAI failures into a stable code + human-readable reason for the UI. */
export function describeOpenAIError(err: any): { code: string; message: string } {
  const status = err?.status;
  const code = err?.code ?? err?.error?.code ?? err?.type;
  if (code === "insufficient_quota" || /quota|billing|credit/i.test(err?.message ?? "")) {
    return { code: "insufficient_quota", message: "OpenAI credits have run out. Add credits at platform.openai.com/settings/organization/billing." };
  }
  if (status === 401 || code === "invalid_api_key") {
    return { code: "invalid_api_key", message: "OpenAI rejected the API key (invalid or revoked). Check OPENAI_API_KEY." };
  }
  if (status === 429) {
    return { code: "rate_limited", message: "OpenAI rate limit hit. Summaries will retry on the next refresh." };
  }
  if (status === 404 || code === "model_not_found") {
    return { code: "model_not_found", message: `OpenAI model "${Deno.env.get("OPENAI_MODEL")}" isn't available to this key.` };
  }
  if (status >= 500) return { code: "openai_down", message: `OpenAI is having problems (HTTP ${status}). Try again shortly.` };
  if (err?.name === "APIConnectionError" || err?.name === "APIConnectionTimeoutError") {
    return { code: "openai_unreachable", message: "Couldn't reach OpenAI (network error or timeout)." };
  }
  return { code: "openai_error", message: String(err?.message ?? err) };
}

const intHeader = (h: Headers, k: string) => {
  const v = h.get(k);
  return v == null || v === "" ? null : Number(v);
};

function readRateLimit(h: Headers): RateLimit {
  return {
    limitRequests: intHeader(h, "x-ratelimit-limit-requests"),
    remainingRequests: intHeader(h, "x-ratelimit-remaining-requests"),
    resetRequests: h.get("x-ratelimit-reset-requests"),
    limitTokens: intHeader(h, "x-ratelimit-limit-tokens"),
    remainingTokens: intHeader(h, "x-ratelimit-remaining-tokens"),
    resetTokens: h.get("x-ratelimit-reset-tokens"),
  };
}

export async function runAgent<T = any>(opts: {
  system: string;
  user: string;
  tools: AgentTool[];
  maxSteps?: number;
}): Promise<T> {
  const client = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  const tools = opts.tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: false,
  }));
  const base = { model, instructions: opts.system, tools, text: { format: { type: "json_object" as const } } };

  // Every OpenAI call goes through here so tokens and rate-limit headroom are recorded.
  const call = async (params: Record<string, unknown>) => {
    const u = usage().openai;
    u.calls++;
    try {
      const { data, response } = await client.responses.create({ ...base, ...params } as any).withResponse();
      u.inputTokens += data.usage?.input_tokens ?? 0;
      u.outputTokens += data.usage?.output_tokens ?? 0;
      u.rateLimit = readRateLimit(response.headers);
      return data;
    } catch (err) {
      u.error = describeOpenAIError(err);
      throw Object.assign(new Error(u.error.message), { code: u.error.code });
    }
  };

  // Conversation state lives on OpenAI's side; each turn only sends the new tool outputs.
  // (json_object mode requires the word "JSON" in the input itself, not just the instructions.)
  let res = await call({ input: `${opts.user}\n\nRespond with JSON only.` });

  const maxSteps = opts.maxSteps ?? 8;
  for (let step = 1; ; step++) {
    const calls = res.output.filter((o: any) => o.type === "function_call") as any[];
    if (!calls.length) return JSON.parse(res.output_text || "{}") as T;

    const outputs = await Promise.all(
      calls.map(async (c) => {
        const tool = opts.tools.find((t) => t.name === c.name);
        let result: unknown;
        try {
          result = tool ? await tool.run(JSON.parse(c.arguments || "{}")) : { error: `Unknown tool ${c.name}` };
        } catch (err) {
          result = { error: String((err as Error)?.message ?? err) };
        }
        return {
          type: "function_call_output" as const,
          call_id: c.call_id,
          output: JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS),
        };
      }),
    );

    if (step < maxSteps) {
      res = await call({ previous_response_id: res.id, input: outputs });
      continue;
    }
    // Out of steps: hand back the last tool results and force a final answer.
    res = await call({
      previous_response_id: res.id,
      tool_choice: "none",
      input: [...outputs, { role: "user", content: "Stop calling tools and return your final JSON answer now." }],
    });
    return JSON.parse(res.output_text || "{}") as T;
  }
}

export type AgentStatus = {
  enabled: boolean;
  model: string | null;
  state: "ok" | "error" | "disabled" | "idle";
  error: { code: string; message: string } | null;
  checkedAt: string | null; // when OpenAI was last actually called
  rateLimit: RateLimit | null;
};

const STATUS_KEY = "openai:last-status";

/**
 * OpenAI status for the UI. If this request called OpenAI, that result is saved; if everything came from
 * cache, the last saved result is returned so the UI still knows about e.g. exhausted credits.
 */
export async function agentStatus(): Promise<AgentStatus> {
  const model = Deno.env.get("OPENAI_MODEL") ?? null;
  if (!agentEnabled()) {
    return { enabled: false, model, state: "disabled", checkedAt: null, rateLimit: null,
      error: { code: "missing_key", message: "OPENAI_API_KEY is not set, so the agent is turned off." } };
  }
  const u = usage().openai;
  if (u.calls > 0) {
    const status: AgentStatus = {
      enabled: true, model, state: u.error ? "error" : "ok", error: u.error,
      checkedAt: new Date().toISOString(), rateLimit: u.rateLimit,
    };
    await setValue(STATUS_KEY, status);
    return status;
  }
  const last = await getValue<AgentStatus>(STATUS_KEY);
  return last ? { ...last, model } : { enabled: true, model, state: "idle", error: null, checkedAt: null, rateLimit: null };
}
