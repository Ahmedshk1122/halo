#!/usr/bin/env node
// Saves a model API key to .env without showing it on screen or in shell history,
// and switches Halo to that provider.
//
//   npm run key kimi            paste a Kimi (Moonshot AI) key
//   npm run key qwen            paste a Qwen (Alibaba Cloud Model Studio) key
//   npm run key gemini          paste a Google Gemini key
//   npm run key claude          paste an Anthropic key
//   npm run key kimi kimi-k3    same, and pick the model
//   npm run model kimi-k3       change the model for the current provider
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const examplePath = join(root, ".env.example");

// Defaults mirror server/config.ts.
const PROVIDERS = {
  kimi: { id: "kimi", label: "Kimi", key: "KIMI_API_KEY", models: ["KIMI_DIRECTOR_MODEL", "KIMI_PLANNER_MODEL"], fallback: "kimi-k3", where: "platform.moonshot.ai, API Keys" },
  qwen: { id: "qwen", label: "Qwen", key: "QWEN_API_KEY", models: ["QWEN_DIRECTOR_MODEL", "QWEN_PLANNER_MODEL"], fallback: "qwen-plus", where: "Alibaba Cloud Model Studio, API Keys" },
  gemini: { id: "gemini", label: "Gemini", key: "GEMINI_API_KEY", models: ["GEMINI_DIRECTOR_MODEL", "GEMINI_PLANNER_MODEL"], fallback: "gemini-flash-lite-latest", where: "aistudio.google.com, Get API key" },
  claude: { id: "anthropic", label: "Claude", key: "ANTHROPIC_API_KEY", models: ["HALO_DIRECTOR_MODEL", "HALO_PLANNER_MODEL"], fallback: "claude-haiku-5-5", where: "console.anthropic.com, API Keys" },
};
const ALIASES = { anthropic: "claude", moonshot: "kimi", dashscope: "qwen", google: "gemini" };
const pick = (name) => PROVIDERS[ALIASES[name] ?? name];

const readEnv = () => (existsSync(envPath) ? readFileSync(envPath, "utf8") : existsSync(examplePath) ? readFileSync(examplePath, "utf8") : "");
const writeEnv = (text) => {
  writeFileSync(envPath, text, { mode: 0o600 });
  chmodSync(envPath, 0o600);
};
const activeLine = (name) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=(.*)$`);
const commentedLine = (name) => new RegExp(`^\\s*#\\s*${name}\\s*=`);

/** The value Halo's server will see: like dotenv, the last line for a name wins. */
function getVar(text, name) {
  const re = activeLine(name);
  let value = "";
  for (const l of text.split("\n")) {
    const m = l.match(re);
    if (m) value = m[1].trim().replace(/^["']|["']$/g, "");
  }
  return value;
}

/**
 * Sets NAME=value. Keeps exactly one active line for the name (a repeated line
 * would win over the first one), else fills in a commented example line, else appends.
 */
function setVar(text, name, value) {
  const line = `${name}=${value}`;
  const re = activeLine(name);
  const lines = text.split("\n");
  if (lines.some((l) => re.test(l))) {
    let kept = false;
    return lines.flatMap((l) => (re.test(l) ? (kept ? [] : ((kept = true), [line])) : [l])).join("\n");
  }
  const i = lines.findIndex((l) => commentedLine(name).test(l));
  if (i >= 0) {
    lines[i] = line;
    return lines.join("\n");
  }
  return `${text.replace(/\n*$/, "\n")}${line}\n`;
}

/** Reads one line without echoing it. */
function askHidden(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (d) => (data += d));
      process.stdin.on("end", () => resolve(data.split(/\r?\n/)[0] ?? ""));
      return;
    }
    // Raw mode: read keystrokes and pasted text without echoing anything.
    process.stdout.write(question);
    let buf = "";
    const done = (value) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk) => {
      for (const ch of chunk.replace(/\x1b\[[0-9;?]*[A-Za-z~]/g, "")) {
        if (ch === "\r" || ch === "\n") return done(buf);
        if (ch === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdout.write("\nCancelled. Nothing was saved.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
        else if (ch >= " ") buf += ch;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.resume();
  });
}

/** Strips what people often paste along with a key: quotes, spaces, "Bearer", or a whole NAME=value line. */
function cleanKey(raw) {
  let k = raw.trim().replace(/^export\s+/i, "");
  if (/^[A-Z_]+=/.test(k)) k = k.slice(k.indexOf("=") + 1);
  return k.replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function lookalike(key) {
  if (key.startsWith("sk-ant-")) return "claude";
  if (key.startsWith("AIza")) return "gemini";
  return null;
}

const restart = "Restart Halo to use it: press Ctrl+C where Halo is running, then run npm run dev";
const [command, ...rest] = process.argv.slice(2);

if (command === "model") {
  const text = readEnv();
  const current = pick(getVar(text, "HALO_PROVIDER").toLowerCase() || "claude") ?? PROVIDERS.claude;
  const model = rest[0]?.trim();
  if (!model) {
    console.log(`${current.label} model: ${getVar(text, current.models[0]) || current.fallback}`);
    console.log("Change it with: npm run model <model-name>");
    process.exit(0);
  }
  let next = text;
  for (const name of current.models) next = setVar(next, name, model);
  writeEnv(next);
  console.log(`${current.label} now uses ${model}.`);
  console.log(restart);
  process.exit(0);
}

const provider = pick((command ?? "").toLowerCase());
if (!provider) {
  console.log("Which model provider is the key for?\n");
  console.log("  npm run key kimi      Kimi, from Moonshot AI");
  console.log("  npm run key qwen      Qwen, from Alibaba Cloud");
  console.log("  npm run key gemini    Google Gemini");
  console.log("  npm run key claude    Claude, from Anthropic");
  process.exit(command ? 1 : 0);
}

console.log(`Paste your ${provider.label} API key (from ${provider.where}) and press Enter.`);
const key = cleanKey(await askHidden("Nothing appears as you paste. That is normal, the key stays hidden: "));
if (key.length < 16 || !/^[\x21-\x7e]+$/.test(key)) {
  console.error("That does not look like an API key. Nothing was saved. Run the command again and paste the whole key.");
  process.exit(1);
}
const other = lookalike(key);
if (other && PROVIDERS[other] !== provider) {
  console.error(`That looks like a ${PROVIDERS[other].label} key, not a ${provider.label} key. Nothing was saved.`);
  console.error(`If it is a ${PROVIDERS[other].label} key, run: npm run key ${other}`);
  process.exit(1);
}

let text = readEnv();
text = setVar(text, provider.key, key);
text = setVar(text, "HALO_PROVIDER", provider.id);
const model = rest[0]?.trim();
if (model) for (const name of provider.models) text = setVar(text, name, model);
writeEnv(text);

console.log(`Saved your ${provider.label} key to .env (ending ...${key.slice(-4)}). It stays on this computer and is never committed.`);
const now = pick(getVar(text, "HALO_PROVIDER").toLowerCase());
if (now !== provider) {
  console.error(`Something else in .env still picks another provider. Open .env and remove the extra HALO_PROVIDER lines.`);
  process.exit(1);
}
console.log(`Halo now uses ${provider.label} with ${getVar(text, provider.models[0]) || provider.fallback}.`);
console.log(restart);
