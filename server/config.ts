import "dotenv/config";

// Server-side configuration. The API key stays here and never reaches the browser.
export const config = {
  port: Number(process.env.HALO_SERVER_PORT ?? 8787),
  apiKey: process.env.ANTHROPIC_API_KEY?.trim() || "",
  directorModel: process.env.HALO_DIRECTOR_MODEL?.trim() || "claude-haiku-5-5",
  directorEffort: (process.env.HALO_DIRECTOR_EFFORT?.trim() || "low") as "low" | "medium" | "high",
  plannerModel: process.env.HALO_PLANNER_MODEL?.trim() || "claude-opus-5-5",
  plannerEffort: (process.env.HALO_PLANNER_EFFORT?.trim() || "medium") as "low" | "medium" | "high",
};
