import { defineConfig } from "@playwright/test";
const baseURL = `http://127.0.0.1:4173${process.env.E2E_BASE_PATH || "/"}`;
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL, viewport: { width: 390, height: 844 } },
  webServer: {
    command: process.env.E2E_PRODUCTION
      ? "npm run preview -- --port 4173"
      : "npm run dev -- --port 4173",
    url: baseURL,
    reuseExistingServer: false,
  },
  reporter: "list",
});
