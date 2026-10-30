import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { DirectorRequest } from "../shared/director";
import { config } from "./config";
import { decide } from "./director/director";
import { AnthropicLLM, describeLLMError } from "./llm/anthropic";
import { plan } from "./planner/planner";

// Tiny local API server. It holds ANTHROPIC_API_KEY and proxies Claude calls
// for the control window. It binds to 127.0.0.1 only.
const app = new Hono();
const llm = new AnthropicLLM(config.apiKey);

app.get("/api/health", (c) =>
  c.json({
    hasKey: llm.available,
    directorModel: config.directorModel,
    plannerModel: config.plannerModel,
  }),
);

app.post("/api/director", async (c) => {
  if (!llm.available) return c.json({ error: "ANTHROPIC_API_KEY is not set in .env" }, 503);
  const req = (await c.req.json()) as DirectorRequest;
  try {
    const res = await decide(llm, req, { model: config.directorModel, effort: config.directorEffort });
    return c.json(res);
  } catch (err) {
    const { status, message } = describeLLMError(err);
    console.error(`director: ${message}`);
    return c.json({ error: message }, status as 400);
  }
});

app.post("/api/plan", async (c) => {
  if (!llm.available) return c.json({ error: "ANTHROPIC_API_KEY is not set in .env" }, 503);
  const { notes, catalog } = (await c.req.json()) as { notes: string; catalog: string };
  if (!notes?.trim()) return c.json({ error: "No notes to plan from" }, 400);
  try {
    return c.json(await plan(llm, notes, catalog ?? "", { model: config.plannerModel, effort: config.plannerEffort }));
  } catch (err) {
    const { status, message } = describeLLMError(err);
    console.error(`planner: ${message}`);
    return c.json({ error: message }, status as 400);
  }
});

serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, (info) => {
  console.log(`halo server on http://127.0.0.1:${info.port} (key ${config.apiKey ? "loaded" : "missing"})`);
});
