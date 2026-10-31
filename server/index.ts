import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import type { DirectorRequest } from "../shared/director";
import { active, config } from "./config";
import { decide, warm } from "./director/director";
import { AnthropicLLM } from "./llm/anthropic";
import { GeminiLLM } from "./llm/gemini";
import type { LLMClient } from "./llm/types";
import { plan } from "./planner/planner";

// Tiny local API server. It holds the API key and proxies model calls for the
// control window. It binds to 127.0.0.1 only.
const app = new Hono();
const llm: LLMClient =
  config.provider === "gemini" ? new GeminiLLM(config.gemini.apiKey, config.gemini.thinkingLevel) : new AnthropicLLM(config.anthropic.apiKey);
const keyName = config.provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
const noKey = `${keyName} is not set in .env`;
const directorOpts = { model: active.directorModel, effort: config.directorEffort };

app.get("/api/health", (c) =>
  c.json({
    provider: config.provider,
    hasKey: llm.available,
    directorModel: active.directorModel,
    plannerModel: active.plannerModel,
    // Free-tier Gemini keys allow few requests a minute: pace the director and skip mid-sentence calls.
    limits: config.provider === "gemini" ? { minIntervalMs: config.gemini.minIntervalMs, interimTriggers: false } : { minIntervalMs: 0, interimTriggers: true },
  }),
);

const fail = (c: Context, label: string, err: unknown) => {
  const e = llm.describeError(err);
  console.error(`${label}: ${e.message}`);
  return c.json({ error: e.message, retryAfterSec: e.retryAfterSec }, e.status as 400);
};

app.post("/api/director", async (c) => {
  if (!llm.available) return c.json({ error: noKey }, 503);
  const req = (await c.req.json()) as DirectorRequest;
  try {
    return c.json(await decide(llm, req, directorOpts));
  } catch (err) {
    return fail(c, "director", err);
  }
});

app.post("/api/director/warm", async (c) => {
  if (!llm.available) return c.json({ error: noKey }, 503);
  const ctx = (await c.req.json()) as Pick<DirectorRequest, "catalog" | "prepared">;
  try {
    return c.json(await warm(llm, { catalog: ctx.catalog ?? "", prepared: ctx.prepared ?? [] }, directorOpts));
  } catch (err) {
    return fail(c, "warm", err);
  }
});

app.post("/api/plan", async (c) => {
  if (!llm.available) return c.json({ error: noKey }, 503);
  const { notes, catalog } = (await c.req.json()) as { notes: string; catalog: string };
  if (!notes?.trim()) return c.json({ error: "No notes to plan from" }, 400);
  try {
    return c.json(await plan(llm, notes, catalog ?? "", { model: active.plannerModel, effort: config.plannerEffort }));
  } catch (err) {
    return fail(c, "planner", err);
  }
});

serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, (info) => {
  console.log(`halo server on http://127.0.0.1:${info.port} · ${config.provider} · ${active.directorModel} (key ${llm.available ? "loaded" : "missing"})`);
});
