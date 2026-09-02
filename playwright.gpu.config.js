// @ts-check
// The REAL-GPU variant of playwright.config.js, for ci.yml's renderer-macos job:
//
//   npm run test:gfx -- --config=playwright.gpu.config.js
//
// Everything is inherited from the base config — projects, RENDER_SPECS, the
// webServer, reporters, timeouts — except the Chromium launch, which the base
// pins to SwiftShader (`--use-angle=swiftshader`) for every run because no dev
// box or ubuntu runner has anything else. macos-latest DOES: GitHub's Apple
// silicon image reports a hardware Metal adapter on STOCK flags
// (docs/research/CI-RENDERING-PERFORMANCE.md §There IS a real GPU), so this
// config:
//
//   1. drops `--use-angle=swiftshader` — the one flag that would throw the
//      GPU away — and keeps the rest of the base args (`--enable-unsafe-webgpu`
//      is measured to keep the Metal adapter; `--use-angle=vulkan` is NOT and
//      must never appear here: on macOS it forces ANGLE onto SwiftShader and
//      requestAdapter() returns null — trap 1 in that doc);
//   2. selects the FULL Chromium (`channel: "chromium"`). Playwright's default
//      is the headless shell, which ships without navigator.gpu — trap 2 —
//      and drops any base `executablePath`, which is the Linux sandbox binary
//      and cannot be combined with a channel.
//
// A separate file rather than an env switch inside playwright.config.js so the
// shared launch contract every other run depends on is byte-for-byte untouched;
// tests/unit/ci-coverage.test.mjs pins both halves of the flag rule above.
import base from "./playwright.config.js";

const SOFTWARE_ANGLE = "--use-angle=swiftshader";

function hardwareLaunch(launch) {
  const { executablePath, ...rest } = launch || {};
  void executablePath;
  const args = (rest.args || []).filter((a) => a !== SOFTWARE_ANGLE);
  if (args.some((a) => /^--use-angle=/.test(a))) {
    throw new Error(`playwright.gpu.config.js: a --use-angle flag survived (${args.join(" ")}) — on macOS that turns the real-GPU run into a software one`);
  }
  return { ...rest, channel: "chromium", args };
}

export default {
  ...base,
  projects: (base.projects || []).map((p) => ({
    ...p,
    use: { ...(p.use || {}), launchOptions: hardwareLaunch(p.use && p.use.launchOptions) },
  })),
};
