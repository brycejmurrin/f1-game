// @ts-check
import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import os from "os";

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

// Shared Chromium launch (SwiftShader software-GL). Both projects use it — the
// "headless"/"render" split is about worker concurrency, not GL capability.
const LAUNCH = {
  ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-webgpu",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
};

// The render suite: specs that take screenshots / pixel-diffs, drive real GL
// rendering, or assert DOM visibility. SwiftShader renders on the CPU, so past
// ~4-6 concurrent renderers a 16-core box THRASHES (measured) rather than speeds
// up. These run in the "render" project (cap its workers via
// `--project=render --workers=4`). Everything NOT in this list is a headless
// physics/geometry/hook/data spec that scales wide — the "headless" project.
// Keep this list exhaustive against tests/*.spec.js (a coverage-audit npm script
// asserts every spec lands in exactly one project).
const RENDER_SPECS = [
  "dev-tools", "f1-track-accuracy", "hud-audit", "lighting-ab",
  "parts-budget", "parts-catalog", "parts-persistence",
  "ui-audit", "ui-button-touch", "ui-desktop",
  "tracks-visual", "webgl-probes", "camera", "smoke", "season", "time-trial",
].map((n) => `**/${n}.spec.js`);

// Default worker cap: SwiftShader is CPU-bound, so cap at ~half the cores (min 4)
// to avoid the render-thrash the old `undefined` (= 50% cores, but unbounded by
// render cost) allowed. Override per run with --workers=N.
const WORKERS = process.env.CI ? 2 : Math.max(4, Math.floor((os.cpus().length || 8) / 4));

export default defineConfig({
  testDir: "./tests",
  // Scratch/scan suites are ad-hoc investigation scripts, not part of the
  // regression suite — keep them out of default discovery.
  testIgnore: ["**/inspect/**", "**/blank-scan/**", "**/galleries/**"],
  globalSetup: './tests/global-setup.js',
  fullyParallel: true,
  workers: WORKERS,
  // retries:1 hides flakiness the deterministic (mocked network, headless
  // obs/act/reset, geometry) suite is designed to avoid — surface it locally,
  // keep one retry in CI for genuine infra blips. live-reporter reports flaky
  // (passed-on-retry) counts either way.
  retries: process.env.CI ? 1 : 0,
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
      // Physics / geometry / hooks / data specs — assertion-only, scale wide.
      // Everything NOT in RENDER_SPECS. Run alone (fast) with:
      //   npx playwright test --project=headless --workers=8
      name: "headless",
      testIgnore: RENDER_SPECS,
      use: { ...devices["Desktop Chrome"], launchOptions: LAUNCH },
    },
    {
      // Screenshot / GL-heavy / DOM specs — cap workers to avoid SwiftShader
      // CPU thrash:  npx playwright test --project=render --workers=4
      name: "render",
      testMatch: RENDER_SPECS,
      use: { ...devices["Desktop Chrome"], launchOptions: LAUNCH },
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
