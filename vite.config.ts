import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.HALO_SERVER_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
});
