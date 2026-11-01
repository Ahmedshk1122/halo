import Anthropic from "@anthropic-ai/sdk";
import type { LLMClient, LLMError, TextRequest, ToolCall, ToolCallRequest, ToolCallResult } from "./types";

// Models that reject a forced tool_choice ("any"/"tool"); they get "auto" plus
// the prompt's "call exactly one tool" instruction instead.
const NO_FORCED_TOOL_CHOICE = /^claude-(opus-5-5|sonnet-5-5|fable-5-1|mythos-5-1)/;
// Models where the server-side refusal fallback is recommended by default.
const FALLBACK_DEFAULT = /^claude-(fable-5-1|opus-5-5|opus-5$|sonnet-5-5)/;

/**
 * Strict tools compile into one grammar per request, and the API caps its size.
 * When it says the grammar is too large, Halo keeps strict on the smallest tools
 * whose schemas fit in this share of the total, then tries the next level. Every
 * visual is still shape-checked by prepareVisual before it reaches the stage.
 */
const STRICT_LEVELS = [1, 0.5, 0.25, 0];

/** True for the 400 that says the strict tools' grammar is too large. */
export function isGrammarTooLarge(err: unknown): boolean {
  return err instanceof Anthropic.APIError && err.status === 400 && /grammar is too large|number of strict tools/i.test(err.message);
}

/** Names of the tools that stay strict at a level: the smallest schemas first, within the size budget. */
export function strictToolNames(tools: ToolCallRequest["tools"], level: number): Set<string> {
  if (level >= 1) return new Set(tools.map((t) => t.name));
  const sized = tools.map((t) => ({ name: t.name, size: JSON.stringify(t.input_schema).length })).sort((a, b) => a.size - b.size);
  const budget = sized.reduce((sum, t) => sum + t.size, 0) * level;
  const names = new Set<string>();
  let used = 0;
  for (const t of sized) {
    if (used + t.size > budget) break;
    used += t.size;
    names.add(t.name);
  }
  return names;
}

type CreateFn = (body: Anthropic.Beta.MessageCreateParamsNonStreaming, opts: { timeout: number }) => Promise<Anthropic.Beta.BetaMessage>;

export class AnthropicLLM implements LLMClient {
  readonly provider = "anthropic" as const;
  private create: CreateFn | null;
  private client: Anthropic | null;
  /** The strict level that worked, per model and tool set, so later requests (and the cache) stay the same. */
  private strictLevel = new Map<string, number>();

  constructor(apiKey: string, create?: CreateFn) {
    const client = apiKey ? new Anthropic({ apiKey, maxRetries: 1 }) : null;
    this.client = client;
    this.create = create ?? (client ? (body, opts) => client.beta.messages.create(body, opts) : null);
  }

  get available() {
    return this.create !== null;
  }

  async callTools(req: ToolCallRequest): Promise<ToolCallResult> {
    if (!this.create) throw new Error("ANTHROPIC_API_KEY is not set in .env");
    const key = `${req.model}|${req.tools.map((t) => t.name).join(",")}`;
    for (let i = this.strictLevel.get(key) ?? 0; ; i++) {
      try {
        const result = await this.send(req, strictToolNames(req.tools, STRICT_LEVELS[i]));
        this.strictLevel.set(key, i);
        return result;
      } catch (err) {
        if (!isGrammarTooLarge(err) || i + 1 >= STRICT_LEVELS.length) throw err;
        const next = strictToolNames(req.tools, STRICT_LEVELS[i + 1]).size;
        console.warn(`Claude: the strict tool grammar is too large; retrying with ${next} of ${req.tools.length} tools strict.`);
        this.strictLevel.set(key, i + 1);
      }
    }
  }

  async *streamText(req: TextRequest): AsyncIterable<string> {
    if (!this.client) throw new Error("ANTHROPIC_API_KEY is not set in .env");
    const fallback = FALLBACK_DEFAULT.test(req.model);
    const stream = this.client.beta.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system.map((b) => ({ type: "text" as const, text: b.text, ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}) })),
        messages: [{ role: "user", content: req.user }],
        output_config: { effort: req.effort },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { timeout: req.timeoutMs, signal: req.signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
  }

  private async send(req: ToolCallRequest, strict: Set<string>): Promise<ToolCallResult> {
    const forced = req.mode === "one" && !NO_FORCED_TOOL_CHOICE.test(req.model);
    const fallback = FALLBACK_DEFAULT.test(req.model);
    const started = performance.now();

    const response = await this.create!(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system.map((b) => ({
          type: "text" as const,
          text: b.text,
          ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
        })),
        messages: [{ role: "user", content: req.user }],
        tools: req.tools.map((t) => ({
          ...t,
          input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
          ...(strict.has(t.name) ? { strict: true } : {}),
        })),
        // A max_tokens: 0 warm-up only runs prefill to write the cache; it rejects a forced
        // tool_choice, and tool_choice does not affect the cached tools + system prefix.
        tool_choice:
          req.mode === "one"
            ? forced
              ? { type: "any", disable_parallel_tool_use: true }
              : { type: "auto", disable_parallel_tool_use: true }
            : { type: "auto" },
        output_config: { effort: req.effort },
        ...(fallback && req.mode !== "warm" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { timeout: req.timeoutMs },
    );
    const ms = performance.now() - started;

    const calls: ToolCall[] = [];
    let text = "";
    if (response.stop_reason !== "refusal") {
      for (const block of response.content) {
        if (block.type === "tool_use") calls.push({ name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
        else if (block.type === "text") text += block.text;
      }
    }
    return {
      calls,
      text,
      stopReason: response.stop_reason ?? "unknown",
      model: response.model,
      ms,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
        cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }

  describeError(err: unknown): LLMError {
    return describeAnthropicError(err);
  }
}

/** Human-readable message for an API error, without leaking request details. */
function describeAnthropicError(err: unknown): LLMError {
  if (err instanceof Anthropic.AuthenticationError) return { status: 401, message: "Anthropic rejected the API key" };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: "Rate limited by the Anthropic API" };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: `Bad request: ${err.message}` };
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 504, message: "Claude took too long" };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: "Could not reach the Anthropic API" };
  if (err instanceof Anthropic.APIError) return { status: err.status ?? 502, message: err.message };
  return { status: 500, message: err instanceof Error ? err.message : String(err) };
}
