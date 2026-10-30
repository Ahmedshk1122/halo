import Anthropic from "@anthropic-ai/sdk";
import type { LLMClient, ToolCall, ToolCallRequest, ToolCallResult } from "./types";

// Models that reject a forced tool_choice ("any"/"tool"); they get "auto" plus
// the prompt's "call exactly one tool" instruction instead.
const NO_FORCED_TOOL_CHOICE = /^claude-(opus-5-5|sonnet-5-5|fable-5-1|mythos-5-1)/;
// Models where the server-side refusal fallback is recommended by default.
const FALLBACK_DEFAULT = /^claude-(fable-5-1|opus-5-5|opus-5$|sonnet-5-5)/;

export class AnthropicLLM implements LLMClient {
  private client: Anthropic | null;

  constructor(apiKey: string) {
    this.client = apiKey ? new Anthropic({ apiKey, maxRetries: 1 }) : null;
  }

  get available() {
    return this.client !== null;
  }

  async callTools(req: ToolCallRequest): Promise<ToolCallResult> {
    if (!this.client) throw new Error("ANTHROPIC_API_KEY is not set in .env");
    const forced = !NO_FORCED_TOOL_CHOICE.test(req.model);
    const fallback = FALLBACK_DEFAULT.test(req.model);
    const started = performance.now();

    const response = await this.client.beta.messages.create(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system.map((b) => ({
          type: "text" as const,
          text: b.text,
          ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
        })),
        messages: [{ role: "user", content: req.user }],
        tools: req.tools.map((t) => ({ ...t, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema, strict: true })),
        tool_choice:
          req.mode === "one"
            ? forced
              ? { type: "any", disable_parallel_tool_use: true }
              : { type: "auto", disable_parallel_tool_use: true }
            : { type: "auto" },
        output_config: { effort: req.effort },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
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
}

/** Human-readable message for an API error, without leaking request details. */
export function describeLLMError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError) return { status: 401, message: "Anthropic rejected the API key" };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: "Rate limited by the Anthropic API" };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: `Bad request: ${err.message}` };
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 504, message: "Claude took too long" };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: "Could not reach the Anthropic API" };
  if (err instanceof Anthropic.APIError) return { status: err.status ?? 502, message: err.message };
  return { status: 500, message: err instanceof Error ? err.message : String(err) };
}
