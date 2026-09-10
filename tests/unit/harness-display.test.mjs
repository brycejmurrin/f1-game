/**
 * Dead DISPLAY must not poison headless SwiftShader WebGL.
 * Measured 2026-09-10 on Cloud: DISPLAY=:1 with no /tmp/.X11-unix/X1 made
 * canvas.getContext("webgl2") return null, so game.js never finished and
 * garage-angles timed out waiting for __apex. Unsetting the var restored GL.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const harnessPath = join(ROOT, "tools/lib/harness.mjs");

test("harness exports display helpers and clears a dead DISPLAY for headless", async () => {
  const src = readFileSync(harnessPath, "utf8");
  assert.match(src, /export function displaySocketAlive/, "probe X11 socket before launch");
  assert.match(src, /export function clearDeadDisplay/, "shared clear for shot tools");
  assert.match(src, /clearDeadDisplay\(/, "launchChromium must call it");
  assert.match(src, /\/tmp\/\.X11-unix\/X/, "local :N displays use the unix socket");

  const { displaySocketAlive, clearDeadDisplay, x11SocketPath } =
    await import(pathToFileURL(harnessPath).href);

  assert.equal(x11SocketPath(":1"), "/tmp/.X11-unix/X1");
  assert.equal(x11SocketPath("localhost:0.0"), null, "remote DISPLAY left alone");
  assert.equal(displaySocketAlive(""), false);
  assert.equal(displaySocketAlive(undefined), false);

  const env = { DISPLAY: ":1" };
  const logs = [];
  const cleared = clearDeadDisplay({
    headed: false,
    env,
    socketAlive: () => false,
    log: (m) => logs.push(m),
  });
  assert.equal(cleared, true);
  assert.equal(env.DISPLAY, undefined);
  assert.match(logs.join("\n"), /DISPLAY=:1/);

  const kept = { DISPLAY: ":1" };
  assert.equal(clearDeadDisplay({
    headed: true,
    env: kept,
    socketAlive: () => false,
  }), false, "headed launches need a real X — do not clear");
  assert.equal(kept.DISPLAY, ":1");

  const alive = { DISPLAY: ":0" };
  assert.equal(clearDeadDisplay({
    headed: false,
    env: alive,
    socketAlive: () => true,
  }), false);
  assert.equal(alive.DISPLAY, ":0");

  const forced = { DISPLAY: ":1", APEX_KEEP_DISPLAY: "1" };
  assert.equal(clearDeadDisplay({
    headed: false,
    env: forced,
    socketAlive: () => false,
  }), false, "APEX_KEEP_DISPLAY opts out");
  assert.equal(forced.DISPLAY, ":1");
});

test("chromiumArgsForBackend pins unsafe SwiftShader for GLX/TLX", () => {
  const src = readFileSync(join(ROOT, "tools/shot/probe-page.mjs"), "utf8");
  assert.match(src, /--enable-unsafe-swiftshader/,
    "Chromium 1xx blocks SwiftShader WebGL without this flag");
  assert.match(src, /gotoGameBootDiag|__apex never appeared/,
    "boot timeout must name WebGL / DISPLAY, not a bare waitForFunction");
});
