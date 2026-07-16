// @ts-check
import { defineConfig, devices } from "@playwright/test";

// Per-run server port so several `playwright test` invocations can run at the
// same time without sharing (and tearing down) each other's static server —
// with the default fixed port, run B reuses run A's server and dies with
// net::ERR_CONNECTION_REFUSED when run A finishes and kills it.
//   APEX_PORT=3461 npx playwright test tests/foo.spec.js
// When APEX_PORT is set, report/artifact dirs get a -<port> suffix so
// concurrent runs don't clobber each other's output either.
const PORT = Number(process.env.APEX_PORT || 3456);
const SUF = process.env.APEX_PORT ? `-${PORT}` : "";

export default defineConfig({
  testDir: "./tests",
  globalSetup: './tests/global-setup.js',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 1,
  timeout: 120_000,
  outputDir: `test-results${SUF}`,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
          args: [
            "--use-angle=swiftshader",
            "--enable-unsafe-webgpu",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
          ],
        },
      },
    },
  ],
  webServer: {
    // python's http.server starts instantly with no package resolution, unlike
    // `npx serve` (which cold-resolves the package and often missed the old 10 s
    // window — the cause of flaky net::ERR_CONNECTION_REFUSED on the first specs).
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: `playwright-report${SUF}` }],
    ["junit", { outputFile: `test-results${SUF}/junit.xml` }],
  ],
});
