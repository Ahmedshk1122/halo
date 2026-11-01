import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import type { DirectorRequest } from "../shared/director";
import { active, artist, config, keyName, limits } from "./config";
import { decide, warm } from "./director/director";
import { AnthropicLLM } from "./llm/anthropic";
import { GeminiLLM } from "./llm/gemini";
import type { LLMClient } from "./llm/types";
import { stream } from "hono/streaming";
import { drawStream, type DrawRequest } from "./artist/artist";
import { plan } from "./planner/planner";

// Tiny local API server. It holds the API key and proxies model calls for the
// control window. It binds to 127.0.0.1 only.
const app = new Hono();
const makeClient = (p: typeof config.provider): LLMClient =>
  p === "gemini" ? new GeminiLLM(config.gemini.apiKey, config.gemini.thinkingLevel) : new AnthropicLLM(config.anthropic.apiKey);
const llm = makeClient(config.provider);
/** Draws: the same client unless drawings come from another provider. */
const artistLLM = config.artistProvider === config.provider ? llm : makeClient(config.artistProvider);
const noKey = `${keyName[config.provider]} is not set in .env. Run: npm run key ${config.provider === "anthropic" ? "claude" : "gemini"}`;
const directorOpts = { model: active.directorModel, effort: config.directorEffort, timeoutMs: config.directorTimeoutMs };

app.get("/api/health", (c) =>
  c.json({
    provider: config.provider,
    hasKey: llm.available,
    directorModel: active.directorModel,
    plannerModel: active.plannerModel,
    artistProvider: config.artistProvider,
    artistModel: artist.artistModel,
    // Free-tier Gemini keys allow few requests a minute: pace the director and skip mid-sentence calls.
    limits,
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

// Drawings stream: the artist's text is passed through as it arrives (one SVG
// element per line); the control window sanitizes each line. A failure after
// the stream started is reported as a final {"error": ...} line.
app.post("/api/draw", async (c) => {
  if (!artistLLM.available) return c.json({ error: `${keyName[config.artistProvider]} is not set in .env (drawings use ${config.artistProvider})` }, 503);
  if (!artistLLM.streamText) return c.json({ error: `${config.artistProvider} cannot draw` }, 501);
  const body = (await c.req.json()) as Partial<DrawRequest>;
  if (!body.brief?.trim()) return c.json({ error: "No brief to draw from" }, 400);
  const req: DrawRequest = {
    title: String(body.title ?? ""),
    caption: String(body.caption ?? ""),
    brief: String(body.brief),
    aspect: body.aspect === "square" || body.aspect === "tall" ? body.aspect : "wide",
    style: body.style === "float" ? "float" : "card",
    said: Array.isArray(body.said) ? body.said.map(String).slice(0, 40) : [],
    previous: Array.isArray(body.previous) ? body.previous.map(String).slice(0, 600) : [],
    behind: typeof body.behind === "string" ? body.behind : "",
  };
  const started = performance.now();
  c.header("Content-Type", "text/plain; charset=utf-8");
  c.header("Cache-Control", "no-store");
  return stream(c, async (out) => {
    const abort = new AbortController();
    out.onAbort(() => abort.abort());
    try {
      for await (const text of drawStream(artistLLM, req, { model: artist.artistModel, effort: config.artistEffort }, abort.signal)) {
        await out.write(text);
      }
      await out.write(`\n${JSON.stringify({ done: true, model: artist.artistModel, ms: Math.round(performance.now() - started) })}\n`);
    } catch (err) {
      if (abort.signal.aborted) return;
      const e = artistLLM.describeError(err);
      console.error(`artist: ${e.message}`);
      await out.write(`\n${JSON.stringify({ error: e.message })}\n`);
    }
  });
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

const server = serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, (info) => {
  console.log(
    `halo server on http://127.0.0.1:${info.port} · ${config.provider} · ${active.directorModel}, drawings by ${artist.artistModel} (key ${llm.available ? "loaded" : "missing"})`,
  );
});

// An older Halo server still running would keep answering with its old settings.
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code !== "EADDRINUSE") throw err;
  console.error(
    `Port ${config.port} is already in use: Halo is probably still running in another Terminal window or tab. Press Ctrl+C there (or close it), then run npm run dev again.`,
  );
  process.exit(1);
});
