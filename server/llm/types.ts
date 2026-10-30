// The LLM sits behind this interface so the provider can be swapped.
import type { ToolDef } from "../../shared/director";

export interface ToolCallRequest {
  model: string;
  effort: "low" | "medium" | "high";
  /** System blocks in order; each one marked cache: true ends a cached prefix. */
  system: { text: string; cache: boolean }[];
  user: string;
  tools: ToolDef[];
  /** Require exactly one tool call (director) or allow several (planner). */
  mode: "one" | "many";
  maxTokens: number;
  timeoutMs: number;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolCallResult {
  calls: ToolCall[];
  /** Any text the model wrote outside tool calls. */
  text: string;
  stopReason: string;
  model: string;
  ms: number;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface LLMClient {
  readonly available: boolean;
  callTools(req: ToolCallRequest): Promise<ToolCallResult>;
}
