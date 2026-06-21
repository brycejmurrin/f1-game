// @ts-check
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3456",
    viewport: { width: 1280, height: 720 },
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
    command: "python3 -m http.server 3456",
    url: "http://localhost:3456",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
