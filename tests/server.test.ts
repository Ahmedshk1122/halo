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

describe("Kimi and Qwen (OpenAI-compatible)", async () => {
  const { OpenAICompatLLM, describeCompatError, CompatHttpError, parseArguments } = await import("../server/llm/openaiCompat");
  const { directorTools } = await import("../shared/director");
  const cfg = {
    provider: "kimi",
    label: "Kimi",
    keyName: "KIMI_API_KEY",
    apiKey: "sk-test",
    baseUrl: "https://intl.example/v1",
    baseUrlCandidates: ["https://intl.example/v1", "https://cn.example/v1"],
    directorModel: "kimi-k3",
    plannerModel: "kimi-k3",
    thinking: "off",
  } as const;
  const req: ToolCallRequest = {
    model: "kimi-k3",
    effort: "low",
    system: [
      { text: "rules", cache: true },
      { text: "catalog", cache: true },
    ],
    user: "Activation went from 31 to 44%.",
    tools: directorTools(),
    mode: "one",
    maxTokens: 2048,
    timeoutMs: 5000,
  };
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const fail = (status: number, message: string, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: { message, type: "invalid_request_error" } }), { status, headers });
  const toolReply = {
    model: "kimi-k3",
    choices: [
      {
        finish_reason: "tool_calls",
        message: { content: "", tool_calls: [{ function: { name: "act", arguments: '{"action":"none","reason":"Greeting","beat":"Intro","arc":"","target_ids":[]}' } }] },
      },
    ],
    usage: { prompt_tokens: 900, completion_tokens: 40, cached_tokens: 800 },
  };
  /** A fetch that answers from a queue and records what was sent. */
  function fakeFetch(queue: Response[]) {
    const sent: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
    const fn = (async (url: string, init: RequestInit = {}) => {
      sent.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : {} });
      const next = queue.shift();
      if (!next) throw new Error("no more responses");
      return next;
    }) as unknown as typeof fetch;
    return { fn, sent };
  }

  it("sends the tools as functions, forces a tool call, turns thinking off, and reads the call", async () => {
    const { fn, sent } = fakeFetch([ok(toolReply)]);
    const llm = new OpenAICompatLLM(cfg, fn);
    const res = await llm.callTools(req);
    expect(sent[0].url).toBe("https://intl.example/v1/chat/completions");
    expect((sent[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = sent[0].body as { messages: { role: string; content: string }[]; tools: { type: string; function: { name: string; strict: boolean } }[] } & Record<string, unknown>;
    expect(body.messages).toEqual([
      { role: "system", content: "rules\n\ncatalog" },
      { role: "user", content: req.user },
    ]);
    expect(body.tools[0].type).toBe("function");
    expect(body.tools.map((t) => t.function.name)).toContain("show_line_chart");
    expect(body.tools.every((t) => t.function.strict)).toBe(true);
    expect(body.tool_choice).toBe("required");
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(res.calls).toEqual([{ name: "act", input: { action: "none", reason: "Greeting", beat: "Intro", arc: "", target_ids: [] } }]);
    expect(res.usage).toMatchObject({ input: 100, output: 40, cacheRead: 800 });
  });

  it("feeds a real director decision", async () => {
    const { fn } = fakeFetch([ok(toolReply)]);
    const res = await decide(new OpenAICompatLLM(cfg, fn), request, { model: "kimi-k3", effort: "low", timeoutMs: 5000 });
    expect(res.decision).toMatchObject({ action: "none", beat: "Intro" });
  });

  it("retries without what the model rejects, and remembers it", async () => {
    const { fn, sent } = fakeFetch([
      fail(400, "tool_choice 'required' is not supported for this model"),
      fail(400, "max_tokens must be less than or equal to 4096"),
      ok(toolReply),
      ok(toolReply),
    ]);
    const llm = new OpenAICompatLLM(cfg, fn);
    await llm.callTools(req);
    expect(sent.map((s) => s.body.tool_choice)).toEqual(["required", "auto", "auto"]);
    expect(sent.map((s) => s.body.max_tokens)).toEqual([8192, 8192, 4096]);
    await llm.callTools(req);
    expect(sent[3].body).toMatchObject({ tool_choice: "auto", max_tokens: 4096 });
  });

  it("uses Qwen's own switch for thinking", async () => {
    const { fn, sent } = fakeFetch([ok(toolReply)]);
    await new OpenAICompatLLM({ ...cfg, provider: "qwen", label: "Qwen", keyName: "QWEN_API_KEY" }, fn).callTools(req);
    expect(sent[0].body.enable_thinking).toBe(false);
    expect(sent[0].body.thinking).toBeUndefined();
  });

  it("skips the warm-up request: these APIs cache prefixes on their own", async () => {
    const { fn, sent } = fakeFetch([]);
    const res = await new OpenAICompatLLM(cfg, fn).callTools({ ...req, mode: "warm", maxTokens: 0 });
    expect(sent).toHaveLength(0);
    expect(res.stopReason).toBe("skipped");
  });

  it("finds the endpoint that takes the key and lists models", async () => {
    const { fn, sent } = fakeFetch([fail(401, "Invalid Authentication"), ok({ data: [{ id: "kimi-k3" }, { id: "kimi-k2.6" }] }), ok(toolReply)]);
    const llm = new OpenAICompatLLM(cfg, fn);
    const probe = await llm.probe();
    expect(probe).toEqual({ ok: true, models: ["kimi-k2.6", "kimi-k3"] });
    await llm.callTools(req);
    expect(sent[2].url).toBe("https://cn.example/v1/chat/completions");
  });

  it("explains errors for the decision log", () => {
    expect(describeCompatError(new CompatHttpError(401, '{"error":{"message":"Invalid Authentication"}}', undefined), cfg).message).toContain("KIMI_API_KEY");
    expect(describeCompatError(new CompatHttpError(429, '{"error":{"message":"rate limit reached"}}', 7), cfg)).toMatchObject({ status: 429, retryAfterSec: 7 });
    expect(describeCompatError(new CompatHttpError(429, '{"error":{"message":"Your account is suspended due to insufficient balance"}}', undefined), cfg).status).toBe(402);
    expect(describeCompatError(new CompatHttpError(404, '{"error":{"message":"Not found the model qwen-max"}}', undefined), cfg).message).toContain("KIMI_DIRECTOR_MODEL");
    expect(describeCompatError(new DOMException("The operation was aborted due to timeout", "TimeoutError"), cfg).status).toBe(504);
  });

  it("reads arguments given as a string, an object or a fenced block", () => {
    expect(parseArguments('{"a":1}')).toEqual({ a: 1 });
    expect(parseArguments({ a: 1 })).toEqual({ a: 1 });
    expect(parseArguments('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseArguments("not json")).toBeNull();
  });
});
