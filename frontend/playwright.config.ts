import { defineConfig, devices } from "@playwright/test";

// Golden-journey E2E (Part 11). Specs live under e2e/; Vitest ignores that dir.
// In CI the stubbed stack is brought up out-of-band (docker compose) and its URL is passed via
// PLAYWRIGHT_BASE_URL; locally Playwright spins up `npm run dev` itself. reuseExistingServer is
// always on so the CI run binds to the already-running container instead of erroring on the port.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    locale: "ar",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
