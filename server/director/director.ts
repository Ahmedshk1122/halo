import {
  directorTools,
  noneDecision,
  toolCallToDecision,
  type DirectorRequest,
  type DirectorResponse,
} from "../../shared/director";
import type { LLMClient } from "../llm/types";
import { DIRECTOR_SYSTEM, contextBlock, userMessage } from "./prompt";

export interface DirectorOptions {
  model: string;
  effort: "low" | "medium" | "high";
}

const TOOLS = directorTools();

/** One director decision: prompt → one strict tool call → decision. */
export async function decide(llm: LLMClient, req: DirectorRequest, opts: DirectorOptions): Promise<DirectorResponse> {
  const started = performance.now();
  const result = await llm.callTools({
    model: opts.model,
    effort: opts.effort,
    system: [
      { text: DIRECTOR_SYSTEM, cache: true },
      { text: contextBlock(req), cache: true },
    ],
    user: userMessage(req),
    tools: TOOLS,
    mode: "one",
    maxTokens: 2048,
    timeoutMs: 9000,
  });

  const call = result.calls[0];
  const decision = call
    ? toolCallToDecision(call.name, call.input)
    : noneDecision(
        result.stopReason === "refusal" ? "The model declined this request" : "No tool call came back, so nothing changes",
        { beat: req.beat, arc: req.arc },
      );
  // Keep the arc and beat if the model left them empty.
  if (!decision.arc) decision.arc = req.arc;
  if (!decision.beat) decision.beat = req.beat;

  return {
    decision,
    timing: { modelMs: Math.round(result.ms), serverMs: Math.round(performance.now() - started) },
    model: result.model,
    usage: result.usage,
  };
}

/**
 * Writes the director's cached prefix (tools, rules, catalog, prepared visuals)
 * before the talk, with a max_tokens: 0 request, so the first real decision
 * reads it from cache. Same model and effort as real traffic.
 */
export async function warm(llm: LLMClient, ctx: Pick<DirectorRequest, "catalog" | "prepared">, opts: DirectorOptions) {
  const result = await llm.callTools({
    model: opts.model,
    effort: opts.effort,
    system: [
      { text: DIRECTOR_SYSTEM, cache: true },
      { text: contextBlock(ctx), cache: true },
    ],
    user: "warmup",
    tools: TOOLS,
    mode: "warm",
    maxTokens: 0,
    timeoutMs: 15000,
  });
  return { ms: Math.round(result.ms), cacheWrite: result.usage.cacheWrite, cacheRead: result.usage.cacheRead };
}
