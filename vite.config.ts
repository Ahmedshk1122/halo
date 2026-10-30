import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.HALO_SERVER_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  // A local app: one ~500 kB main chunk (React, Motion) is fine; SheetJS and MediaPipe load on demand.
  build: { chunkSizeWarningLimit: 700 },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
});
