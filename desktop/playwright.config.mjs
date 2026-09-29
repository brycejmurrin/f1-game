// @ts-check
/**
 * Playwright config for the Electron packaged-app suite.
 * Isolated from the root web suite (no webServer, no SwiftShader Chromium project).
 *
 *   cd desktop && npm run pack && npm run test:electron
 *   # Linux CI: xvfb-run -a npm run test:electron
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.(js|mjs|ts)/,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results",
  // Electron launch is owned by each spec (executablePath to --dir binary).
});
