import "dotenv/config";

// Server-side configuration. API keys stay here and never reach the browser.
const env = (name: string) => process.env[name]?.trim() || "";

// HALO_ANTHROPIC_API_KEY is an alternative name for hosted environments where
// ANTHROPIC_API_KEY is reserved for other tools.
const anthropicKey = env("ANTHROPIC_API_KEY") || env("HALO_ANTHROPIC_API_KEY");
const geminiKey = env("GEMINI_API_KEY");

export type Provider = "anthropic" | "gemini";

/** HALO_PROVIDER picks the model provider; otherwise whichever key is present (Anthropic first). */
const provider: Provider =
  env("HALO_PROVIDER") === "gemini" ? "gemini" : env("HALO_PROVIDER") === "anthropic" ? "anthropic" : anthropicKey || !geminiKey ? "anthropic" : "gemini";

const effort = (v: string, fallback: "low" | "medium" | "high") => (v === "low" || v === "medium" || v === "high" ? v : fallback);

export const config = {
  port: Number(env("HALO_SERVER_PORT") || 8787),
  provider,
  anthropic: {
    apiKey: anthropicKey,
    directorModel: env("HALO_DIRECTOR_MODEL") || "claude-haiku-5-5",
    plannerModel: env("HALO_PLANNER_MODEL") || "claude-opus-5-5",
  },
  gemini: {
    apiKey: geminiKey,
    // The "-latest" aliases follow Google's newest Flash-Lite, which has the most generous free tier.
    directorModel: env("GEMINI_DIRECTOR_MODEL") || "gemini-flash-lite-latest",
    plannerModel: env("GEMINI_PLANNER_MODEL") || "gemini-flash-lite-latest",
    /** minimal | low | medium | high, for models that support thinking levels. Empty: model default. */
    thinkingLevel: env("GEMINI_THINKING_LEVEL").toLowerCase(),
    /** Free-tier keys allow only a few requests a minute: space director calls at least this far apart. */
    minIntervalMs: Number(env("GEMINI_MIN_INTERVAL_MS") || 6000),
  },
  directorEffort: effort(env("HALO_DIRECTOR_EFFORT"), "low"),
  plannerEffort: effort(env("HALO_PLANNER_EFFORT"), "medium"),
};

export const active = provider === "gemini" ? config.gemini : config.anthropic;
