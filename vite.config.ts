import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.HALO_SERVER_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  // A local app: one ~500 kB main chunk (React, Motion) is fine; SheetJS and MediaPipe load on demand.
  build: { chunkSizeWarningLimit: 700 },
  // Pre-bundle the libraries that load on demand. Otherwise the dev server can discover them
  // late, rebuild its cache, and leave an open page with imports that no longer exist.
  optimizeDeps: { include: ["xlsx", "papaparse", "@mediapipe/tasks-vision"] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
});
