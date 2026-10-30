import { useEffect, useState } from "react";
import { listCameras } from "../../stage/camera";
import { useStore } from "../createStore";
import { store } from "../state";
import { Group, Row, Segmented, Switch } from "../ui/controls";

export function SettingsSection() {
  const glass = useStore(store, (s) => s.glass);
  const reducedMotion = useStore(store, (s) => s.reducedMotion);
  const cameraDeviceId = useStore(store, (s) => s.cameraDeviceId);
  const provider = useStore(store, (s) => s.director.provider);
  const proactivity = useStore(store, (s) => s.director.proactivity);
  const hands = useStore(store, (s) => s.hands);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    void listCameras().then(setCameras).catch(() => setCameras([]));
  }, []);

  return (
    <>
      <Group
        title="Director"
        footer="Replay plays back recorded decisions for the sample rehearsal script, so the pipeline can be tested without a key or network. Use Claude for real talks."
      >
        <Row label="How proactive Halo is" detail="Quiet waits for the strongest moments; eager shows more. Also sets the gap between visuals.">
          <Segmented
            value={proactivity}
            onChange={(p) => store.set((s) => ({ director: { ...s.director, proactivity: p } }))}
            options={[
              { value: "quiet", label: "Quiet" },
              { value: "balanced", label: "Balanced" },
              { value: "eager", label: "Eager" },
            ]}
          />
        </Row>
        <Row label="Decisions from" detail="Claude runs the director through the local server">
          <Segmented
            value={provider}
            onChange={(p) => store.set((s) => ({ director: { ...s.director, provider: p } }))}
            options={[
              { value: "claude", label: "Claude" },
              { value: "replay", label: "Replay (offline test)" },
            ]}
          />
        </Row>
      </Group>
      <Group title="Camera">
        <Row label="Camera" detail="Used by the stage window and this preview">
          <select
            className="select"
            value={cameraDeviceId ?? ""}
            onChange={(e) => store.set({ cameraDeviceId: e.target.value || null })}
          >
            <option value="">Default camera</option>
            {cameras.map((c, i) => (
              <option key={c.deviceId || i} value={c.deviceId}>
                {c.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </Row>
      </Group>
      <Group
        title="Hands"
        footer="Point and hold to ring part of a visual in orange. Pinch, hold and move to drag. A quick pinch expands or collapses. Visuals never cover your face."
      >
        <Row
          label="Hand tracking"
          detail={hands.status === "error" ? `Could not start: ${hands.detail}` : hands.status === "running" ? "Running in this window with MediaPipe" : hands.status === "loading" ? "Loading models…" : "Off"}
        >
          <Switch label="Hand tracking" checked={hands.enabled} onChange={(v) => store.set((s) => ({ hands: { ...s.hands, enabled: v } }))} />
        </Row>
        <Row label="Show face zone in preview" detail="The area visuals keep clear of. Only you see it.">
          <Switch label="Show face zone" checked={hands.showFaceZone} onChange={(v) => store.set((s) => ({ hands: { ...s.hands, showFaceZone: v } }))} />
        </Row>
      </Group>
      <Group title="Appearance">
        <Row label="Glass" detail="Light suits bright rooms, dark suits dim ones">
          <Segmented
            value={glass}
            onChange={(g) => store.set({ glass: g })}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Row>
        <Row label="Reduce motion" detail="Visuals fade instead of moving. The system setting is always respected.">
          <Switch label="Reduce motion" checked={reducedMotion} onChange={(v) => store.set({ reducedMotion: v })} />
        </Row>
      </Group>
    </>
  );
}
