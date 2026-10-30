import { useEffect, useMemo, useState } from "react";
import { EMPTY_STAGE, type StageState } from "../../shared/stage";
import { HaloChannel, now } from "../sync/channel";
import { CameraVideo } from "./CameraVideo";
import { StageCanvas } from "./StageCanvas";
import { StageViewport } from "./StageViewport";

/**
 * /stage: the window OBS captures. Webcam plus Halo's visuals, nothing else:
 * no cursor, no chrome, no text except what is inside visuals. Never mirrored.
 */
export function StageApp() {
  const channel = useMemo(() => new HaloChannel(), []);
  const [state, setState] = useState<StageState>(EMPTY_STAGE);

  useEffect(() => {
    document.title = "Halo Stage";
    document.body.classList.add("is-stage");
    const off = channel.subscribe((msg) => {
      // One control window, and BroadcastChannel keeps its order: latest wins.
      if (msg.type === "state") setState(msg.state);
      if (msg.type === "control-hello") channel.post({ type: "stage-hello", at: now() });
    });
    channel.post({ type: "stage-hello", at: now() });
    const bye = () => channel.post({ type: "stage-bye" });
    window.addEventListener("beforeunload", bye);
    return () => {
      off();
      window.removeEventListener("beforeunload", bye);
    };
  }, [channel]);

  return (
    <StageViewport className="stage-root">
      <StageCanvas
        state={state}
        video={
          <CameraVideo
            deviceId={state.cameraDeviceId}
            onStatus={(s) =>
              channel.post({
                type: "stage-status",
                camera: s.state,
                size: s.state === "live" ? { w: s.width, h: s.height } : null,
              })
            }
          />
        }
        onRendered={(id) => channel.post({ type: "rendered", id, at: now() })}
      />
    </StageViewport>
  );
}
