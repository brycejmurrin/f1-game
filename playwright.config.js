// @ts-check
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 1,
  timeout: 30_000,
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
          args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
        },
      },
    },
  ],
  webServer: {
    command: "npx serve -l 3456 --no-clipboard",
    url: "http://localhost:3456",
    reuseExistingServer: false,
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
