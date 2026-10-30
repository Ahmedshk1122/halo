import { useRef, type ReactNode } from "react";
import { CameraVideo } from "../stage/CameraVideo";
import { StageCanvas } from "../stage/StageCanvas";
import { StageViewport } from "../stage/StageViewport";
import { useStore } from "./createStore";
import { deriveStageState } from "./stageSync";
import { store } from "./state";

/**
 * Presenter preview of the stage. Mirrored like a mirror: the video and the
 * positions of visuals flip, the text inside visuals stays readable.
 */
export function Preview({
  interactive,
  overlay,
  videoRef,
  children,
}: {
  interactive?: boolean;
  overlay?: ReactNode;
  videoRef?: React.Ref<HTMLVideoElement | null>;
  children?: ReactNode;
}) {
  const state = useStore(store, deriveStageState);
  const cameraDeviceId = useStore(store, (s) => s.cameraDeviceId);
  const viewport = useRef<HTMLDivElement>(null);
  return (
    <div className={`preview${interactive ? " is-interactive" : ""}`} ref={viewport}>
      <StageViewport>
        <StageCanvas
          state={state}
          mirror
          video={<CameraVideo ref={videoRef} deviceId={cameraDeviceId} mirror />}
          overlay={overlay}
        />
      </StageViewport>
      {children}
    </div>
  );
}
