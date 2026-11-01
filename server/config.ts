import "dotenv/config";
import type { AIProvider } from "../shared/director";

// Server-side configuration. API keys stay here and never reach the browser.
const env = (name: string) => process.env[name]?.trim() || "";

export type Provider = AIProvider;

const keys: Record<Provider, string> = {
  gemini: env("GEMINI_API_KEY"),
  // HALO_ANTHROPIC_API_KEY is an alternative name for hosted environments where
  // ANTHROPIC_API_KEY is reserved for other tools.
  anthropic: env("ANTHROPIC_API_KEY") || env("HALO_ANTHROPIC_API_KEY"),
};

const ALIASES: Record<string, Provider> = { gemini: "gemini", google: "gemini", anthropic: "anthropic", claude: "anthropic" };
const chosen = env("HALO_PROVIDER").toLowerCase();

/** HALO_PROVIDER picks the model provider; otherwise Gemini, unless only an Anthropic key is present. */
const provider: Provider = ALIASES[chosen] ?? (!keys.gemini && keys.anthropic ? "anthropic" : "gemini");
if (chosen && !ALIASES[chosen]) console.warn(`HALO_PROVIDER=${chosen} is not supported (use gemini or anthropic). Using ${provider}.`);

/** Drawings can come from a different provider than decisions (e.g. Claude decides, free Gemini draws). */
const artistProvider: Provider = ALIASES[env("HALO_ARTIST_PROVIDER").toLowerCase()] ?? provider;

const effort = (v: string, fallback: "low" | "medium" | "high") => (v === "low" || v === "medium" || v === "high" ? v : fallback);

export const config = {
  port: Number(env("HALO_SERVER_PORT") || 8787),
  provider,
  artistProvider,
  anthropic: {
    apiKey: keys.anthropic,
    directorModel: env("HALO_DIRECTOR_MODEL") || "claude-haiku-5-5",
    plannerModel: env("HALO_PLANNER_MODEL") || "claude-opus-5-5",
    /** Draws the drawings. A stronger model than the director: drawings are few, and quality shows. */
    artistModel: env("HALO_ARTIST_MODEL") || "claude-sonnet-5-5",
  },
  gemini: {
    apiKey: keys.gemini,
    // The "-latest" aliases follow Google's newest Flash-Lite, which has the most generous free tier.
    directorModel: env("GEMINI_DIRECTOR_MODEL") || "gemini-flash-lite-latest",
    plannerModel: env("GEMINI_PLANNER_MODEL") || "gemini-flash-lite-latest",
    // Flash rather than Flash-Lite: drawing needs the stronger of the free models.
    artistModel: env("GEMINI_ARTIST_MODEL") || "gemini-flash-latest",
    /** minimal | low | medium | high, for models that support thinking levels. Empty: model default. */
    thinkingLevel: env("GEMINI_THINKING_LEVEL").toLowerCase(),
    /** Free-tier keys allow only a few requests a minute: space director calls at least this far apart. */
    minIntervalMs: Number(env("GEMINI_MIN_INTERVAL_MS") || 6000),
  },
  directorEffort: effort(env("HALO_DIRECTOR_EFFORT"), "low"),
  plannerEffort: effort(env("HALO_PLANNER_EFFORT"), "medium"),
  artistEffort: effort(env("HALO_ARTIST_EFFORT"), "low"),
  /** How long one director decision may take before Halo gives up on it. */
  directorTimeoutMs: Number(env("HALO_DIRECTOR_TIMEOUT_MS") || 12_000),
};

export const active = config[provider];
export const artist = config[artistProvider];

export const keyName: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

/**
 * Pacing the control window applies to director requests. Free-tier Gemini keys
 * allow few requests a minute, so they get a minimum gap and no mid-sentence calls.
 * Claude decides as soon as speech arrives (HALO_MIN_INTERVAL_MS adds a gap if wanted).
 */
export const limits =
  provider === "gemini"
    ? { minIntervalMs: config.gemini.minIntervalMs, interimTriggers: false }
    : { minIntervalMs: Number(env("HALO_MIN_INTERVAL_MS") || 0), interimTriggers: true };
