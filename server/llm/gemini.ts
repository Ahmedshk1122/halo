import { ApiError, FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type FunctionDeclaration } from "@google/genai";
import type { LLMClient, LLMError, ToolCall, ToolCallRequest, ToolCallResult } from "./types";

const THINKING: Record<string, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** Google Gemini behind the same interface as Claude: the same tools, as JSON-schema function declarations. */
export class GeminiLLM implements LLMClient {
  readonly provider = "gemini" as const;
  private ai: GoogleGenAI | null;

  constructor(
    apiKey: string,
    private thinkingLevel = "",
  ) {
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  get available() {
    return this.ai !== null;
  }

  async callTools(req: ToolCallRequest): Promise<ToolCallResult> {
    if (!this.ai) throw new Error("GEMINI_API_KEY is not set in .env");
    const empty = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    // Gemini caches repeated prefixes on its own; a warm-up would only spend free-tier quota.
    if (req.mode === "warm") return { calls: [], text: "", stopReason: "skipped", model: "", ms: 0, usage: empty };

    const functionDeclarations: FunctionDeclaration[] = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parametersJsonSchema: t.input_schema,
    }));
    const thinking = THINKING[this.thinkingLevel];
    const started = performance.now();
    const res = await this.ai.models.generateContent({
      model: req.model,
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      config: {
        systemInstruction: req.system.map((b) => b.text).join("\n\n"),
        tools: [{ functionDeclarations }],
        // ANY: the reply must be function calls. The planner may make several in one reply.
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
        // Room for models that think before calling a function; unused tokens cost nothing.
        maxOutputTokens: Math.max(req.maxTokens, 8192),
        // A client-side timeout: Gemini rejects server deadlines under 10 s (httpOptions.timeout).
        abortSignal: AbortSignal.timeout(req.timeoutMs),
        ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
      },
    });
    const ms = performance.now() - started;

    let calls: ToolCall[] = (res.functionCalls ?? []).map((fc) => ({ name: fc.name ?? "", input: (fc.args ?? {}) as Record<string, unknown> }));
    if (req.mode === "one") calls = calls.slice(0, 1);
    const usage = res.usageMetadata;
    const cached = usage?.cachedContentTokenCount ?? 0;
    return {
      calls,
      text: "",
      stopReason: String(res.candidates?.[0]?.finishReason ?? "unknown").toLowerCase(),
      model: res.modelVersion ?? req.model,
      ms,
      usage: { input: (usage?.promptTokenCount ?? 0) - cached, output: usage?.candidatesTokenCount ?? 0, cacheRead: cached, cacheWrite: 0 },
    };
  }

  describeError(err: unknown): LLMError {
    return describeGeminiError(err);
  }
}

/** Turns Gemini API errors into short messages; rate-limit errors carry the wait Google asks for. */
export function describeGeminiError(err: unknown): LLMError {
  if (err instanceof ApiError) {
    const text = err.message ?? "";
    if (err.status === 429) {
      const delay = text.match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/);
      const daily = /per ?day|PerDay/i.test(text);
      return {
        status: 429,
        message: daily
          ? "Gemini free-tier daily limit reached. It resets at midnight Pacific time."
          : "Gemini free-tier limit reached for this minute. Halo waits, then continues.",
        retryAfterSec: delay ? Math.ceil(Number(delay[1])) : daily ? 3600 : 30,
      };
    }
    if (err.status === 400 && /api key not valid|API_KEY_INVALID/i.test(text)) return { status: 401, message: "Google rejected the Gemini API key" };
    if (err.status === 403) return { status: 403, message: "Google refused the request. Check the Gemini API key and that the Gemini API is enabled for it." };
    if (err.status === 404) return { status: 404, message: `Model not found. Set GEMINI_DIRECTOR_MODEL in .env to a model your key can use. (${text.slice(0, 160)})` };
    return { status: err.status || 502, message: `Gemini error ${err.status}: ${text.slice(0, 300)}` };
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/timed? ?out|aborted/i.test(message)) return { status: 504, message: "Gemini took too long" };
  if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(message)) return { status: 502, message: "Could not reach the Gemini API" };
  return { status: 500, message };
}
