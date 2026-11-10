"use strict";
/**
 * Debug env flags for the Electron main process.
 *
 * APEX_DESKTOP_SOFT_GL (ANGLE SwiftShader + unsafe WebGPU) and
 * APEX_DESKTOP_NO_SANDBOX (Chromium --no-sandbox) weaken the shell. They are
 * honoured ONLY in an unpackaged dev run (`npm start` / `npm run smoke`).
 * A packaged build (`app.isPackaged`) ignores them, so a stray environment
 * variable on a player's machine can never turn the sandbox off.
 *
 * The packaged Playwright suite needs the same switches under xvfb; it passes
 * them as command-line arguments (`switchArgs`), which is a deliberate choice
 * by whoever launches the binary rather than ambient state.
 */

const FLAGS = {
  APEX_DESKTOP_SOFT_GL: [
    ["use-gl", "angle"],
    ["use-angle", "swiftshader"],
    ["enable-unsafe-swiftshader"],
    ["enable-unsafe-webgpu"],
    ["disable-dev-shm-usage"],
  ],
  APEX_DESKTOP_NO_SANDBOX: [["no-sandbox"]],
};

function on(env, name) {
  const v = env && env[name];
  return v === "1" || v === "true";
}

/** Every switch the set flags ask for, regardless of packaging. */
function requestedSwitches(env) {
  const out = [];
  for (const [name, switches] of Object.entries(FLAGS)) {
    if (on(env, name)) out.push(...switches);
  }
  return out;
}

/** Flags that are set in `env` (for the "ignored in a packaged build" log). */
function requestedFlags(env) {
  return Object.keys(FLAGS).filter((name) => on(env, name));
}

/** Switches main.js applies: none at all in a packaged build. */
function debugSwitches(env, { isPackaged }) {
  if (isPackaged) return [];
  return requestedSwitches(env);
}

/** The same switches as argv (`--use-gl=angle`, `--no-sandbox`) for a test launcher. */
function switchArgs(env) {
  return requestedSwitches(env).map(([k, v]) => (v === undefined ? `--${k}` : `--${k}=${v}`));
}

module.exports = { FLAGS, debugSwitches, requestedFlags, switchArgs };
