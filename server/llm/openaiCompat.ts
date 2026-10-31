import type { CompatConfig } from "../config";
import type { LLMClient, LLMError, ToolCall, ToolCallRequest, ToolCallResult } from "./types";

/**
 * Optional request features. Providers and models differ in what they accept, so
 * when the API rejects one with a 400, Halo retries without it and remembers that
 * for the model. Nothing else about the request changes.
 */
type Feature = "required" | "strict" | "thinking";

/** An HTTP error from the provider, with its body kept for the decision log. */
export class CompatHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterSec: number | undefined,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

interface ChatResponse {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: unknown } }[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}

/** Reads a tool call's arguments, which arrive as a JSON string (sometimes wrapped in a code fence). */
export function parseArguments(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const v = JSON.parse(text || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The provider's own error message from a JSON error body, or the body itself. */
function messageOf(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const m = typeof j.error === "string" ? j.error : (j.error?.message ?? j.message);
    if (m) return m;
  } catch {
    // Not JSON.
  }
  return body;
}

/** Which optional feature a 400 error is about, or the next one to try without. */
export function featureToDrop(body: string, dropped: Set<Feature>, usesThinking: boolean): Feature | null {
  const text = body.toLowerCase();
  const can = (f: Feature) => !dropped.has(f) && (f !== "thinking" || usesThinking);
  if (/tool_choice/.test(text) && can("required")) return "required";
  if (/thinking/.test(text) && can("thinking")) return "thinking";
  if (/strict/.test(text) && can("strict")) return "strict";
  // An unexplained 400: try without the optional extras, least important first.
  for (const f of ["strict", "thinking", "required"] as Feature[]) if (can(f)) return f;
  return null;
}

/**
 * Kimi (Moonshot AI) or Qwen (Alibaba Cloud) through their OpenAI-compatible chat
 * completions APIs, behind the same interface as Claude: the same tools as
 * JSON-schema functions, one forced tool call per director decision.
 */
export class OpenAICompatLLM implements LLMClient {
  readonly provider: "kimi" | "qwen";
  private baseUrl: string;
  private dropped = new Map<string, Set<Feature>>();
  /** Output caps learned from the API ("max_tokens must be at most ..."), per model. */
  private outputCap = new Map<string, number>();

  constructor(
    private cfg: CompatConfig,
    private fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    this.provider = cfg.provider;
    this.baseUrl = cfg.baseUrl;
  }

  get available() {
    return Boolean(this.cfg.apiKey);
  }

  get endpoint() {
    return this.baseUrl;
  }

  private headers() {
    return { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json" };
  }

  /**
   * Finds the endpoint that accepts the key (international or China) and lists the
   * models it can use. Called once when the server starts; failures are only logged.
   */
  async probe(timeoutMs = 8000): Promise<{ ok: boolean; models: string[]; status?: number; message?: string }> {
    let last: { status?: number; message?: string } = {};
    for (const url of this.cfg.baseUrlCandidates) {
      try {
        const res = await this.fetchImpl(`${url}/models`, { headers: this.headers(), signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) {
          this.baseUrl = url;
          const body = (await res.json()) as { data?: { id?: string }[] };
          return { ok: true, models: (body.data ?? []).map((m) => m.id ?? "").filter(Boolean).sort() };
        }
        last = { status: res.status, message: messageOf(await res.text()) };
        // Only a rejected key suggests the key belongs to the other region's endpoint.
        if (res.status !== 401 && res.status !== 403) break;
      } catch (err) {
        last = { message: err instanceof Error ? err.message : String(err) };
      }
    }
    return { ok: false, models: [], ...last };
  }

  private body(req: ToolCallRequest, off: Set<Feature>) {
    const cap = this.outputCap.get(req.model);
    const wanted = Math.max(req.maxTokens, 8192);
    const thinkingParams =
      this.cfg.thinking === "default" || off.has("thinking")
        ? {}
        : this.provider === "kimi"
          ? { thinking: { type: this.cfg.thinking === "on" ? "enabled" : "disabled" } }
          : { enable_thinking: this.cfg.thinking === "on" };
    return {
      model: req.model,
      messages: [
        { role: "system", content: req.system.map((b) => b.text).join("\n\n") },
        { role: "user", content: req.user },
      ],
      tools: req.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.input_schema, ...(off.has("strict") ? {} : { strict: true }) },
      })),
      // required: the reply must be a tool call. Where a model does not accept it, auto and the prompt do the job.
      tool_choice: off.has("required") ? "auto" : "required",
      max_tokens: cap ? Math.min(wanted, cap) : wanted,
      stream: false,
      ...thinkingParams,
    };
  }

  async callTools(req: ToolCallRequest): Promise<ToolCallResult> {
    if (!this.cfg.apiKey) throw new Error(`${this.cfg.keyName} is not set in .env`);
    const empty = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    // These APIs cache repeated prefixes on their own; a warm-up would only add a paid request.
    if (req.mode === "warm") return { calls: [], text: "", stopReason: "skipped", model: "", ms: 0, usage: empty };

    const off = this.dropped.get(req.model) ?? new Set<Feature>();
    this.dropped.set(req.model, off);
    // One deadline for the whole call, retries included.
    const signal = AbortSignal.timeout(req.timeoutMs);
    const started = performance.now();

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.body(req, off)),
        signal,
      });
      if (res.ok) {
        const json = (await res.json()) as ChatResponse;
        return this.toResult(req, json, performance.now() - started);
      }
      const text = await res.text();
      if (res.status === 400 || res.status === 422) {
        // "max_tokens must be at most 8192": remember the cap for this model and retry.
        if (/max_tokens/i.test(text) && !this.outputCap.has(req.model)) {
          const asked = this.body(req, off).max_tokens;
          const caps = (text.match(/\d{3,7}/g) ?? []).map(Number).filter((n) => n >= 256 && n < asked);
          if (caps.length > 0) {
            this.outputCap.set(req.model, Math.max(...caps));
            continue;
          }
        }
        const drop = featureToDrop(messageOf(text), off, this.cfg.thinking !== "default");
        if (drop) {
          off.add(drop);
          console.warn(`${this.cfg.label} (${req.model}) rejected "${drop}"; retrying without it.`);
          continue;
        }
      }
      const retry = Number(res.headers.get("retry-after"));
      throw new CompatHttpError(res.status, text, Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined);
    }
    throw new CompatHttpError(400, "The request was rejected after retrying without optional features", undefined);
  }

  private toResult(req: ToolCallRequest, json: ChatResponse, ms: number): ToolCallResult {
    const choice = json.choices?.[0];
    let calls: ToolCall[] = (choice?.message?.tool_calls ?? [])
      .map((c) => ({ name: c.function?.name ?? "", input: parseArguments(c.function?.arguments) }))
      .filter((c): c is ToolCall => Boolean(c.name) && c.input !== null);
    if (req.mode === "one") calls = calls.slice(0, 1);
    const u = json.usage;
    const cached = u?.cached_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? 0;
    return {
      calls,
      text: typeof choice?.message?.content === "string" ? choice.message.content : "",
      stopReason: choice?.finish_reason ?? "unknown",
      model: json.model ?? req.model,
      ms,
      usage: { input: (u?.prompt_tokens ?? 0) - cached, output: u?.completion_tokens ?? 0, cacheRead: cached, cacheWrite: 0 },
    };
  }

  describeError(err: unknown): LLMError {
    return describeCompatError(err, this.cfg);
  }
}

/** Short messages for the decision log; rate limits carry a wait the director honors. */
export function describeCompatError(err: unknown, cfg: Pick<CompatConfig, "label" | "keyName" | "provider" | "baseUrl">): LLMError {
  const name = cfg.label;
  const modelVar = `${cfg.provider.toUpperCase()}_DIRECTOR_MODEL`;
  if (err instanceof CompatHttpError) {
    const msg = messageOf(err.body);
    const lower = msg.toLowerCase();
    const outOfCredit = /balance|insufficient|quota|arrear|recharge|billing|suspended/.test(lower);
    if (err.status === 401) return { status: 401, message: `${name} rejected the API key. Check ${cfg.keyName} in .env.` };
    if (outOfCredit && (err.status === 429 || err.status === 402 || err.status === 403))
      return { status: 402, message: `Your ${name} account has no credit left. Add balance on the ${name} platform, then try again.`, retryAfterSec: 60 };
    if (err.status === 429)
      return { status: 429, message: `${name} rate limit reached. Halo waits, then continues.`, retryAfterSec: err.retryAfterSec ?? 10 };
    if (err.status === 403) return { status: 403, message: `${name} refused the request: ${msg.slice(0, 200)}` };
    if (err.status === 404 || /model.*(not found|not exist|does not exist|unknown)|invalid model/.test(lower))
      return {
        status: 404,
        message: `Model not found. Set ${modelVar} in .env to a model your key can use (the server lists them when it starts). (${msg.slice(0, 160)})`,
      };
    return { status: err.status >= 400 && err.status < 600 ? err.status : 502, message: `${name} error ${err.status}: ${msg.slice(0, 300)}` };
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/timed? ?out|aborted|TimeoutError/i.test(message) || (err instanceof Error && err.name === "TimeoutError"))
    return { status: 504, message: `${name} took too long. Try a faster model, or raise HALO_DIRECTOR_TIMEOUT_MS in .env.` };
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|network/i.test(message)) return { status: 502, message: `Could not reach the ${name} API at ${cfg.baseUrl}` };
  return { status: 500, message };
}
