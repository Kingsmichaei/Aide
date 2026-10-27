import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Share the repo-root .env with the back end; Vite only exposes VITE_* keys.
  envDir: "..",
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
