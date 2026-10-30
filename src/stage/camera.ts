// Camera input. Kept separate from everything else: today it is getUserMedia in
// a browser window captured by OBS; later a native macOS camera extension
// replaces the output side without touching visuals or the director.

export interface CameraOptions {
  deviceId: string | null;
}

export async function openCamera({ deviceId }: CameraOptions): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    aspectRatio: { ideal: 16 / 9 },
    frameRate: { ideal: 30 },
  };
  if (deviceId) video.deviceId = { exact: deviceId };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
