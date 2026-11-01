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


describe("Claude strict tools", async () => {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const { AnthropicLLM, strictToolNames } = await import("../server/llm/anthropic");
  const { directorTools } = await import("../shared/director");
  const tools = directorTools();
  const grammarError = () =>
    Anthropic.APIError.generate(
      400,
      { type: "error", error: { type: "invalid_request_error", message: "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools." } },
      undefined,
      new Headers(),
    );
  const reply = {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "t1", name: "act", input: { action: "none", reason: "Greeting", beat: "Intro", arc: "", target_ids: [] } }],
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
  const req: ToolCallRequest = { model: "claude-haiku-5-5", effort: "low", system: [{ text: "rules", cache: true }], user: "Hi", tools, mode: "one", maxTokens: 2048, timeoutMs: 5000 };

  it("keeps the smallest tools strict within the budget", () => {
    expect(strictToolNames(tools, 1).size).toBe(tools.length);
    expect(strictToolNames(tools, 0).size).toBe(0);
    const half = strictToolNames(tools, 0.5);
    expect(half.has("act")).toBe(true);
    expect(half.has("show_diagram")).toBe(false);
  });

  it("retries with fewer strict tools when the grammar is too large, and remembers it", async () => {
    const sent: { tools: { name: string; strict?: boolean }[] }[] = [];
    let failures = 2;
    const create = (async (body: unknown) => {
      sent.push(body as (typeof sent)[number]);
      if (failures-- > 0) throw grammarError();
      return reply;
    }) as unknown as ConstructorParameters<typeof AnthropicLLM>[1];
    const llm = new AnthropicLLM("sk-ant-test", create);
    const res = await llm.callTools(req);
    expect(res.calls[0].name).toBe("act");
    const strictCount = sent.map((b) => b.tools.filter((t) => t.strict).length);
    expect(strictCount[0]).toBe(tools.length);
    expect(strictCount[1]).toBeLessThan(strictCount[0]);
    expect(strictCount[2]).toBeLessThan(strictCount[1]);
    await llm.callTools(req);
    expect(sent).toHaveLength(4);
    expect(sent[3].tools.filter((t) => t.strict).length).toBe(strictCount[2]);
  });

  it("passes other errors straight through", async () => {
    const create = (async () => {
      throw Anthropic.APIError.generate(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, undefined, new Headers());
    }) as unknown as ConstructorParameters<typeof AnthropicLLM>[1];
    await expect(new AnthropicLLM("sk-ant-test", create).callTools(req)).rejects.toBeInstanceOf(Anthropic.AuthenticationError);
  });
});
