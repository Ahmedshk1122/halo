// MediaPipe Tasks Vision in the browser: hand landmarks every frame, face
// detection a few times a second. Runs on its own hidden camera stream so it
// keeps working whichever section of the control window is open.
import { FaceDetector, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "../../shared/gestures";
import { openCamera, stopStream } from "../stage/camera";

const LOCAL_WASM = "/mediapipe/wasm";
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
const MODELS = {
  hand: ["/mediapipe/models/hand_landmarker.task", "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"],
  face: [
    "/mediapipe/models/blaze_face_short_range.tflite",
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
  ],
};

export interface TrackerFrame {
  t: number;
  hand: Landmark[] | null;
  /** Normalized face box, refreshed a few times a second. Undefined when not measured this frame. */
  face?: { x: number; y: number; w: number; h: number } | null;
  videoW: number;
  videoH: number;
}

async function firstAvailable(urls: string[]): Promise<string> {
  for (const url of urls) {
    if (!url.startsWith("/")) return url;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok && !(res.headers.get("content-type") ?? "").includes("text/html")) return url;
    } catch {
      // try the next one
    }
  }
  return urls[urls.length - 1];
}

export class VisionTracker {
  private video = document.createElement("video");
  private stream: MediaStream | null = null;
  private hands: HandLandmarker | null = null;
  private face: FaceDetector | null = null;
  private running = false;
  private frame = 0;
  private lastTs = -1;
  private handle = 0;

  constructor(private onFrame: (f: TrackerFrame) => void) {
    this.video.muted = true;
    this.video.playsInline = true;
  }

  async start(deviceId: string | null) {
    this.running = true;
    const wasm = (await firstAvailable([`${LOCAL_WASM}/vision_wasm_internal.js`])).startsWith("/") ? LOCAL_WASM : CDN_WASM;
    const vision = await FilesetResolver.forVisionTasks(wasm);
    const [handModel, faceModel] = await Promise.all([firstAvailable(MODELS.hand), firstAvailable(MODELS.face)]);
    const create = async <T>(make: (delegate: "GPU" | "CPU") => Promise<T>) => {
      try {
        return await make("GPU");
      } catch {
        return make("CPU");
      }
    };
    this.hands = await create((delegate) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: handModel, delegate },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      }),
    );
    this.face = await create((delegate) =>
      FaceDetector.createFromOptions(vision, { baseOptions: { modelAssetPath: faceModel, delegate }, runningMode: "VIDEO", minDetectionConfidence: 0.5 }),
    );
    this.stream = await openCamera({ deviceId });
    this.video.srcObject = this.stream;
    await this.video.play();
    if (!this.running) return this.stop();
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && this.hands) {
      let ts = performance.now();
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      this.lastTs = ts;
      const res = this.hands.detectForVideo(v, ts);
      const frame: TrackerFrame = { t: ts, hand: res.landmarks[0] ?? null, videoW: v.videoWidth, videoH: v.videoHeight };
      if (this.face && this.frame % 6 === 0) {
        const det = this.face.detectForVideo(v, ts).detections;
        const best = det.sort((a, b) => (b.boundingBox?.width ?? 0) - (a.boundingBox?.width ?? 0))[0]?.boundingBox;
        frame.face = best ? { x: best.originX / v.videoWidth, y: best.originY / v.videoHeight, w: best.width / v.videoWidth, h: best.height / v.videoHeight } : null;
      }
      this.frame += 1;
      this.onFrame(frame);
    }
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
    this.handle = rvfc ? rvfc.call(v, this.loop) : requestAnimationFrame(this.loop);
  };

  stop() {
    this.running = false;
    cancelAnimationFrame(this.handle);
    stopStream(this.stream);
    this.stream = null;
    this.hands?.close();
    this.face?.close();
    this.hands = null;
    this.face = null;
  }
}
