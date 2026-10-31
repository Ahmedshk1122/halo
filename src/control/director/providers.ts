// Where decisions come from. The LLM sits behind this interface so it can be
// swapped: Claude via the local server, or an offline replay of recorded tool
// calls that exercises the whole pipeline without a key or network.

import { toolCallToDecision, type DirectorRequest, type DirectorResponse, type VisualRef } from "../../../shared/director";
import type { TemplateId } from "../../../shared/visuals";

export interface DirectorProvider {
  readonly name: "claude" | "replay";
  decide(req: DirectorRequest): Promise<DirectorResponse>;
}

export class ServerDirector implements DirectorProvider {
  readonly name = "claude" as const;
  async decide(req: DirectorRequest): Promise<DirectorResponse> {
    const res = await fetch("/api/director", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    const body = (await res.json().catch(() => ({}))) as DirectorResponse & { error?: string; retryAfterSec?: number };
    if (!res.ok || body.error) {
      // retryAfterSec: the provider asked to slow down; the director waits before its next request.
      throw Object.assign(new Error(body.error ?? `Server error ${res.status}`), { retryAfterSec: body.retryAfterSec });
    }
    return body;
  }
}

export interface ReplayFixture {
  /** Case-insensitive regex tested against what was just said. */
  when: string;
  tool: string;
  input: Record<string, unknown>;
}

/**
 * Offline test double for the director: returns recorded tool calls when the
 * new speech matches a fixture, else "none". Ids like "$funnel" are resolved
 * to the latest visual of that template.
 */
export class ReplayDirector implements DirectorProvider {
  readonly name = "replay" as const;
  private fired = new Set<number>();

  constructor(
    private fixtures: ReplayFixture[],
    private latencyMs = 700,
  ) {}

  reset() {
    this.fired.clear();
  }

  async decide(req: DirectorRequest): Promise<DirectorResponse> {
    const started = performance.now();
    const said = req.transcript
      .filter((l) => l.isNew && !l.handled)
      .map((l) => l.text)
      .join(" ");
    const all = [...req.onScreen, ...req.chips, ...req.history];
    let decision = toolCallToDecision("act", { action: "none", reason: "Nothing here needs a visual", beat: req.beat, arc: req.arc, target_ids: [] });
    const i = this.fixtures.findIndex((f, idx) => !this.fired.has(idx) && new RegExp(f.when, "i").test(said));
    if (i >= 0) {
      this.fired.add(i);
      const f = this.fixtures[i];
      decision = toolCallToDecision(f.tool, resolveRefs(f.input, all) as Record<string, unknown>);
    }
    const jitter = this.latencyMs * (0.85 + Math.random() * 0.3);
    await new Promise((r) => setTimeout(r, jitter));
    const ms = Math.round(performance.now() - started);
    return { decision, timing: { modelMs: ms, serverMs: ms }, model: "replay" };
  }
}

function resolveRefs(value: unknown, visuals: VisualRef[]): unknown {
  if (typeof value === "string" && value.startsWith("$")) {
    const template = value.slice(1) as TemplateId;
    const num = (id: string) => Number(id.replace(/\D/g, "")) || 0;
    const match = [...visuals].sort((a, b) => num(b.id) - num(a.id)).find((v) => v.template === template);
    return match?.id ?? "";
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, visuals)).filter((v) => v !== "");
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v, visuals)]));
  }
  return value;
}
