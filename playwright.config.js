// @ts-check
import { defineConfig, devices } from "@playwright/test";
import fs from "fs";

// Per-run server port so several `playwright test` invocations can run at the
// same time without sharing (and tearing down) each other's static server —
// with the default fixed port, run B reuses run A's server and dies with
// net::ERR_CONNECTION_REFUSED when run A finishes and kills it.
//   APEX_PORT=3461 npx playwright test tests/foo.spec.js
// When APEX_PORT is set, report/artifact dirs get a -<port> suffix so
// concurrent runs don't clobber each other's output either.
const PORT = Number(process.env.APEX_PORT || 3456);
const SUF = process.env.APEX_PORT ? `-${PORT}` : "";

// Portable chromium resolution: prefer PW_CHROMIUM, else the Linux sandbox path
// only if it actually exists on disk, else omit executablePath so Playwright
// falls back to its own bundled browser (macOS/other dev machines).
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CHROMIUM_PATH =
  process.env.PW_CHROMIUM ||
  (fs.existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);

export default defineConfig({
  testDir: "./tests",
  // Scratch/scan suites are ad-hoc investigation scripts, not part of the
  // regression suite — keep them out of default discovery.
  testIgnore: ["**/inspect/**", "**/blank-scan/**", "**/galleries/**"],
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
          ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
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
    // python http.server logs every GET to stderr — hundreds of noise lines
    // per test that drown the reporter output in piped logs. Server startup
    // failures still surface as the webServer timeout error.
    stdout: "ignore",
    stderr: "ignore",
  },
  reporter: [
    // Live tail-able progress (see tests/live-reporter.js): timestamped
    // start/end line per test, written immediately — `tail -f` friendly.
    ["./tests/live-reporter.js"],
    ["html", { open: "never", outputFolder: `playwright-report${SUF}` }],
    ["junit", { outputFile: `test-results${SUF}/junit.xml` }],
  ],
});
