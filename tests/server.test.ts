import { describe, expect, it } from "vitest";
import type { DirectorRequest } from "../shared/director";
import { decide } from "../server/director/director";
import type { LLMClient, ToolCallRequest, ToolCallResult } from "../server/llm/types";

const request: DirectorRequest = {
  arc: "Onboarding update.",
  beat: "Greeting",
  transcript: [{ text: "Activation went from 31 to 44%.", ageSec: 0.5, isNew: true }],
  onScreen: [],
  chips: [],
  history: [],
  secondsSinceLastShow: null,
  catalog: 'Table "q3_metrics"',
  prepared: [],
  proactivity: "balanced",
  request: null,
};

class FakeLLM implements LLMClient {
  provider = "anthropic" as const;
  available = true;
  describeError(err: unknown) {
    return { status: 500, message: String(err) };
  }
  last: ToolCallRequest | null = null;
  constructor(private result: Partial<ToolCallResult>) {}
  async callTools(req: ToolCallRequest): Promise<ToolCallResult> {
    this.last = req;
    return { calls: [], text: "", stopReason: "tool_use", model: "fake", ms: 12, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, ...this.result };
  }
}

describe("server director", () => {
  it("sends cached system blocks, the tools, and one-call mode", async () => {
    const llm = new FakeLLM({ calls: [{ name: "act", input: { action: "none", reason: "Greeting", beat: "Greeting", arc: "Onboarding update.", target_ids: [] } }] });
    const res = await decide(llm, request, { model: "claude-haiku-5-5", effort: "low" });
    expect(res.decision.action).toBe("none");
    expect(llm.last?.mode).toBe("one");
    expect(llm.last?.system.every((b) => b.cache)).toBe(true);
    expect(llm.last?.tools.map((t) => t.name)).toContain("show_metric");
    expect(llm.last?.user).toContain("Activation went from 31 to 44%.");
  });

  it("treats a refusal or a missing tool call as none, keeping the arc", async () => {
    const res = await decide(new FakeLLM({ stopReason: "refusal" }), request, { model: "m", effort: "low" });
    expect(res.decision).toMatchObject({ action: "none", arc: "Onboarding update.", beat: "Greeting" });
  });
});

describe("cache warm-up", () => {
  it("sends the same cached prefix with max_tokens 0", async () => {
    const { warm } = await import("../server/director/director");
    const llm = new FakeLLM({});
    await warm(llm, { catalog: 'Table "q3_metrics"', prepared: [] }, { model: "claude-haiku-5-5", effort: "low" });
    const real = new FakeLLM({});
    await decide(real, request, { model: "claude-haiku-5-5", effort: "low" });
    expect(llm.last?.maxTokens).toBe(0);
    expect(llm.last?.mode).toBe("warm");
    expect(llm.last?.system).toEqual(real.last?.system);
    expect(JSON.stringify(llm.last?.tools)).toBe(JSON.stringify(real.last?.tools));
    expect(llm.last?.effort).toBe(real.last?.effort);
  });
});

describe("Gemini errors", () => {
  it("turns rate limits into a wait the director can honor", async () => {
    const { ApiError } = await import("@google/genai");
    const { describeGeminiError } = await import("../server/llm/gemini");
    const minute = describeGeminiError(new ApiError({ status: 429, message: '{"error":{"details":[{"retryDelay":"23s"}]}}' }));
    expect(minute).toMatchObject({ status: 429, retryAfterSec: 23 });
    const daily = describeGeminiError(new ApiError({ status: 429, message: "Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel-FreeTier" }));
    expect(daily.message).toContain("daily limit");
    expect(describeGeminiError(new ApiError({ status: 400, message: "API key not valid. Please pass a valid API key." })).status).toBe(401);
  });
});
