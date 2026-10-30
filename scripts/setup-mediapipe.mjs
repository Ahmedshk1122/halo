// Copies the MediaPipe Tasks Vision wasm runtime into public/ and downloads the
// hand and face models, so hand tracking works without a CDN at runtime.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = join(root, "public/mediapipe/wasm");
const modelsDst = join(root, "public/mediapipe/models");

const MODELS = {
  "hand_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  "blaze_face_short_range.tflite":
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
};

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDst, { recursive: true });
  cpSync(wasmSrc, wasmDst, { recursive: true });
  console.log("mediapipe: wasm copied to public/mediapipe/wasm");
} else {
  console.log("mediapipe: @mediapipe/tasks-vision not installed yet, skipping wasm copy");
}

if (!process.argv.includes("--wasm-only")) {
  mkdirSync(modelsDst, { recursive: true });
  for (const [name, url] of Object.entries(MODELS)) {
    const dst = join(modelsDst, name);
    if (existsSync(dst)) {
      console.log(`mediapipe: ${name} already present`);
      continue;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed for ${name}: ${res.status}`);
    writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
    console.log(`mediapipe: downloaded ${name}`);
  }
}
