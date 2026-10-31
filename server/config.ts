import "dotenv/config";
import type { AIProvider } from "../shared/director";

// Server-side configuration. API keys stay here and never reach the browser.
const env = (name: string) => process.env[name]?.trim() || "";

export type Provider = AIProvider;

const keys: Record<Provider, string> = {
  // HALO_ANTHROPIC_API_KEY is an alternative name for hosted environments where
  // ANTHROPIC_API_KEY is reserved for other tools.
  anthropic: env("ANTHROPIC_API_KEY") || env("HALO_ANTHROPIC_API_KEY"),
  gemini: env("GEMINI_API_KEY"),
  kimi: env("KIMI_API_KEY") || env("MOONSHOT_API_KEY"),
  qwen: env("QWEN_API_KEY") || env("DASHSCOPE_API_KEY"),
};

const ALIASES: Record<string, Provider> = {
  anthropic: "anthropic",
  claude: "anthropic",
  gemini: "gemini",
  google: "gemini",
  kimi: "kimi",
  moonshot: "kimi",
  qwen: "qwen",
  dashscope: "qwen",
};

/** HALO_PROVIDER picks the model provider; otherwise whichever key is present (Anthropic, Kimi, Qwen, Gemini). */
const provider: Provider =
  ALIASES[env("HALO_PROVIDER").toLowerCase()] ?? (["anthropic", "kimi", "qwen", "gemini"] as const).find((p) => keys[p]) ?? "anthropic";

const effort = (v: string, fallback: "low" | "medium" | "high") => (v === "low" || v === "medium" || v === "high" ? v : fallback);
const thinking = (v: string): "off" | "on" | "default" => (v === "on" || v === "default" ? v : "off");

/** An OpenAI-compatible chat completions API (Kimi from Moonshot AI, Qwen from Alibaba Cloud). */
export interface CompatConfig {
  provider: "kimi" | "qwen";
  label: string;
  keyName: string;
  apiKey: string;
  /** Where requests go. Empty in .env: Halo tries the international endpoint, then the China one. */
  baseUrl: string;
  baseUrlCandidates: readonly string[];
  directorModel: string;
  plannerModel: string;
  /** off: answer straight away (fastest). on: think first. default: the model's own setting. */
  thinking: "off" | "on" | "default";
}

const compat = (
  p: "kimi" | "qwen",
  label: string,
  defaults: { urls: string[]; model: string },
): CompatConfig => {
  const prefix = p.toUpperCase();
  const custom = env(`${prefix}_BASE_URL`).replace(/\/+$/, "");
  return {
    provider: p,
    label,
    keyName: `${prefix}_API_KEY`,
    apiKey: keys[p],
    baseUrl: custom || defaults.urls[0],
    baseUrlCandidates: custom ? [custom] : defaults.urls,
    directorModel: env(`${prefix}_DIRECTOR_MODEL`) || defaults.model,
    plannerModel: env(`${prefix}_PLANNER_MODEL`) || env(`${prefix}_DIRECTOR_MODEL`) || defaults.model,
    thinking: thinking(env(`${prefix}_THINKING`).toLowerCase()),
  };
};

export const config = {
  port: Number(env("HALO_SERVER_PORT") || 8787),
  provider,
  anthropic: {
    apiKey: keys.anthropic,
    directorModel: env("HALO_DIRECTOR_MODEL") || "claude-haiku-5-5",
    plannerModel: env("HALO_PLANNER_MODEL") || "claude-opus-5-5",
  },
  gemini: {
    apiKey: keys.gemini,
    // The "-latest" aliases follow Google's newest Flash-Lite, which has the most generous free tier.
    directorModel: env("GEMINI_DIRECTOR_MODEL") || "gemini-flash-lite-latest",
    plannerModel: env("GEMINI_PLANNER_MODEL") || "gemini-flash-lite-latest",
    /** minimal | low | medium | high, for models that support thinking levels. Empty: model default. */
    thinkingLevel: env("GEMINI_THINKING_LEVEL").toLowerCase(),
    /** Free-tier keys allow only a few requests a minute: space director calls at least this far apart. */
    minIntervalMs: Number(env("GEMINI_MIN_INTERVAL_MS") || 6000),
  },
  kimi: compat("kimi", "Kimi", { urls: ["https://api.moonshot.ai/v1", "https://api.moonshot.cn/v1"], model: "kimi-k3" }),
  qwen: compat("qwen", "Qwen", {
    urls: ["https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "https://dashscope.aliyuncs.com/compatible-mode/v1"],
    model: "qwen-plus",
  }),
  directorEffort: effort(env("HALO_DIRECTOR_EFFORT"), "low"),
  plannerEffort: effort(env("HALO_PLANNER_EFFORT"), "medium"),
  /** How long one director decision may take before Halo gives up on it. */
  directorTimeoutMs: Number(env("HALO_DIRECTOR_TIMEOUT_MS") || (provider === "kimi" || provider === "qwen" ? 20_000 : 9000)),
};

export const active = config[provider];

export const keyName: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  kimi: "KIMI_API_KEY",
  qwen: "QWEN_API_KEY",
};

/**
 * Pacing the control window applies to director requests. Free-tier Gemini keys
 * allow few requests a minute, so they get a minimum gap and no mid-sentence calls.
 * Paid providers decide as soon as speech arrives (HALO_MIN_INTERVAL_MS adds a gap if wanted).
 */
export const limits =
  provider === "gemini"
    ? { minIntervalMs: config.gemini.minIntervalMs, interimTriggers: false }
    : { minIntervalMs: Number(env("HALO_MIN_INTERVAL_MS") || 0), interimTriggers: true };
