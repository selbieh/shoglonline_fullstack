import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // E2E specs live under e2e/ and run with Playwright, not Vitest.
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "components/**"],
      // Regression floor on the shared client logic (lib/) and reusable components/. Set just below
      // the current numbers so a drop in tested surface fails CI (Part 11 step 11); page-level flows
      // are covered by the Playwright e2e suite, not Vitest.
      thresholds: { statements: 40, branches: 65, functions: 45, lines: 40 },
    },
  },
});
