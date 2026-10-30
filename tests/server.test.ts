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
  available = true;
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
