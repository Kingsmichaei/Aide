import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // Same origin as the app, like the /api rewrite on Render (render.yaml).
    proxy: {
      "/api": {
        // Set API_PROXY_TARGET to run a second API on another port.
        target: process.env.API_PROXY_TARGET ?? "http://localhost:8000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // This machine starts jsdom slowly; the first test in a file can take >5s.
    testTimeout: 15_000,
  },
});
