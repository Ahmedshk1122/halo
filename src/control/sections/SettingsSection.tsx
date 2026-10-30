import { useEffect, useState } from "react";
import { listCameras } from "../../stage/camera";
import { useStore } from "../createStore";
import { store } from "../state";
import { Group, Row, Segmented, Switch } from "../ui/controls";

export function SettingsSection() {
  const glass = useStore(store, (s) => s.glass);
  const reducedMotion = useStore(store, (s) => s.reducedMotion);
  const cameraDeviceId = useStore(store, (s) => s.cameraDeviceId);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    void listCameras().then(setCameras).catch(() => setCameras([]));
  }, []);

  return (
    <>
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
