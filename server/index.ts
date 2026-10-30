import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config";

// Tiny local API server. It holds ANTHROPIC_API_KEY and proxies Claude calls
// for the control window. It binds to 127.0.0.1 only.
const app = new Hono();

app.get("/api/health", (c) =>
  c.json({
    hasKey: Boolean(config.apiKey),
    directorModel: config.directorModel,
    plannerModel: config.plannerModel,
  }),
);

serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, (info) => {
  console.log(`halo server on http://127.0.0.1:${info.port} (key ${config.apiKey ? "loaded" : "missing"})`);
});
