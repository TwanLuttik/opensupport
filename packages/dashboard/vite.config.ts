import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Served by the Open Support server at /. Root-relative URLs keep the
  // script and stylesheet loading when a nested screen such as /settings/ai
  // is refreshed. A relative ./assets path would look inside /settings/.
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
      "/uploads": "http://127.0.0.1:8787",
    },
  },
});
