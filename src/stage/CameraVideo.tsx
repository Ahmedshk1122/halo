import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { openCamera, stopStream } from "./camera";

interface Props {
  deviceId: string | null;
  /** Flip horizontally (presenter preview only; the stage is never mirrored). */
  mirror?: boolean;
  onStatus?: (status: CameraStatus) => void;
}

export type CameraStatus = { state: "starting" } | { state: "live"; width: number; height: number } | { state: "error"; message: string };

/** Full-bleed webcam video for the stage canvas. */
export const CameraVideo = forwardRef<HTMLVideoElement | null, Props>(function CameraVideo(
  { deviceId, mirror = false, onStatus },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    onStatus?.({ state: "starting" });
    openCamera({ deviceId })
      .then((s) => {
        if (cancelled) {
          stopStream(s);
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        video.onloadedmetadata = () => {
          onStatus?.({ state: "live", width: video.videoWidth, height: video.videoHeight });
        };
        void video.play().catch(() => undefined);
        setError(null);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        onStatus?.({ state: "error", message });
      });
    return () => {
      cancelled = true;
      stopStream(stream);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  return (
    <>
      <video
        ref={videoRef}
        className="camera-video"
        style={mirror ? { transform: "scaleX(-1)" } : undefined}
        autoPlay
        playsInline
        muted
      />
      {error && <div className="camera-missing" data-error={error} />}
    </>
  );
});
