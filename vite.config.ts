import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(process.env.GITHUB_SHA || "local"),
  },
  plugins: [
    react(),
    {
      name: "release-metadata",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "release.json",
          source: JSON.stringify({
            commit: process.env.GITHUB_SHA || "local",
            builtAt: new Date().toISOString(),
          }),
        });
      },
    },
  ],
  base: process.env.VITE_BASE_PATH || process.env.E2E_BASE_PATH || "/",
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
