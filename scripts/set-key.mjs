#!/usr/bin/env node
// Saves a model API key to .env without showing it on screen or in shell history,
// and switches Halo to that provider.
//
//   npm run key gemini                           paste a Google Gemini key
//   npm run key claude                           paste an Anthropic key
//   npm run key gemini gemini-flash-latest       same, and pick the model
//   npm run model gemini-flash-latest            change the model for the current provider
//   npm run use gemini                           switch provider, using the key already in .env
//   npm run artist gemini | claude               which provider draws the drawings
//   npm run artist claude-opus-5-5               which model draws them
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const examplePath = join(root, ".env.example");

// Defaults mirror server/config.ts.
const PROVIDERS = {
  gemini: { id: "gemini", label: "Gemini", key: "GEMINI_API_KEY", models: ["GEMINI_DIRECTOR_MODEL", "GEMINI_PLANNER_MODEL"], fallback: "gemini-flash-lite-latest", where: "aistudio.google.com, Get API key" },
  claude: { id: "anthropic", label: "Claude", key: "ANTHROPIC_API_KEY", models: ["HALO_DIRECTOR_MODEL", "HALO_PLANNER_MODEL"], fallback: "claude-haiku-5-5", where: "console.anthropic.com, API Keys" },
};
const ALIASES = { anthropic: "claude", google: "gemini" };
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

// Settings for providers Halo no longer supports (Kimi, Qwen): removed when switching.
const RETIRED = /^\s*(?:export\s+)?(?:KIMI|MOONSHOT|QWEN|DASHSCOPE)_[A-Z_]*\s*=/;

if (command === "use") {
  const target = pick((rest[0] ?? "").toLowerCase());
  if (!target) {
    console.log("Switch provider with: npm run use gemini (or: npm run use claude)");
    process.exit(rest[0] ? 1 : 0);
  }
  const text = readEnv();
  if (!getVar(text, target.key)) {
    console.error(`There is no ${target.label} key in .env yet. Add one with: npm run key ${target === PROVIDERS.claude ? "claude" : "gemini"}`);
    process.exit(1);
  }
  const lines = text.split("\n");
  const kept = lines.filter((l) => !RETIRED.test(l));
  writeEnv(setVar(kept.join("\n"), "HALO_PROVIDER", target.id));
  if (kept.length < lines.length) console.log("Removed the old Kimi settings and key from .env.");
  console.log(`Halo now uses ${target.label}.`);
  console.log(restart);
  process.exit(0);
}

if (command === "artist") {
  const text = readEnv();
  const arg = (rest[0] ?? "").trim();
  const DEFAULT_ARTIST = { anthropic: "claude-sonnet-5-5", gemini: "gemini-flash-latest" };
  const modelVar = { anthropic: "HALO_ARTIST_MODEL", gemini: "GEMINI_ARTIST_MODEL" };
  const current = (pick(getVar(text, "HALO_ARTIST_PROVIDER").toLowerCase()) ?? pick(getVar(text, "HALO_PROVIDER").toLowerCase()) ?? PROVIDERS.gemini).id;
  if (!arg) {
    console.log(`Drawings: ${current === "gemini" ? "Gemini" : "Claude"}, ${getVar(text, modelVar[current]) || DEFAULT_ARTIST[current]}`);
    console.log("Change with: npm run artist gemini, npm run artist claude, or a model name like claude-opus-5-5");
    process.exit(0);
  }
  let prov;
  let model = "";
  if (/^claude-/i.test(arg)) [prov, model] = ["anthropic", arg];
  else if (/^gemini-/i.test(arg)) [prov, model] = ["gemini", arg];
  else prov = pick(arg.toLowerCase())?.id;
  if (!prov) {
    console.error("Use: npm run artist gemini, npm run artist claude, or a model name like claude-opus-5-5");
    process.exit(1);
  }
  const keyVar = prov === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!getVar(text, keyVar)) {
    console.error(`There is no ${prov === "gemini" ? "Gemini" : "Claude"} key in .env yet. Add one with: npm run key ${prov === "gemini" ? "gemini" : "claude"}`);
    process.exit(1);
  }
  let next = setVar(text, "HALO_ARTIST_PROVIDER", prov);
  if (model) next = setVar(next, modelVar[prov], model);
  writeEnv(next);
  console.log(`Drawings now come from ${prov === "gemini" ? "Gemini" : "Claude"}, ${model || getVar(next, modelVar[prov]) || DEFAULT_ARTIST[prov]}.`);
  console.log(restart);
  process.exit(0);
}

if (command === "model") {
  const text = readEnv();
  // Same rule as server/config.ts: Gemini unless .env picks Claude (or holds only an Anthropic key).
  const chosen = pick(getVar(text, "HALO_PROVIDER").toLowerCase());
  const current = chosen ?? (!getVar(text, "GEMINI_API_KEY") && getVar(text, "ANTHROPIC_API_KEY") ? PROVIDERS.claude : PROVIDERS.gemini);
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
