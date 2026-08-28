/* gfx-debug-overlay.test.mjs — the overlay that exists because a player's
 * hardware is unreachable from here.
 *
 * This session spent rounds chasing a dark three.js/WebGPU frame with no way to
 * read the one number that settles it (GLX.gpuErrors()) on the machine that had
 * the bug: the reporter has no console, and this container has no GPU
 * (vulkaninfo: one PHYSICAL_DEVICE_TYPE_CPU, no /dev/dri). js/game/gfx-debug.js
 * turns the renderer's existing hooks into DOM the reporter can read and copy.
 *
 * The pins below are the properties that make it useful AND safe to ship:
 * off by default, no cost when off, and it never becomes a second source of
 * truth — every line it prints comes from a hook that already existed.
 *
 * Run: node --test tests/unit/gfx-debug-overlay.test.mjs  (test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SRC = read("js/game/gfx-debug.js");

test("gfx-debug is opt-in and silent otherwise", () => {
  assert.match(SRC, /\[\?&\]gfxdebug=1/,
    "the overlay must arm from the URL — a report should be one link, not a build");
  assert.match(SRC, /apex26\.gfxDebug/,
    "and from a localStorage key, for a reporter who cannot edit the URL");
  // wanted() gates the ONLY install site. Without this the overlay would paint
  // for every player, which is how a debug aid becomes a shipped regression.
  assert.match(SRC, /if \(typeof document !== "undefined" && wanted\(\)\)/,
    "installation must be gated on wanted() at eval time, not on a later branch");
  const installs = SRC.match(/setTimeout\(install, 0\)/g) || [];
  assert.equal(installs.length, 2,
    "install runs on a later turn of the loop (body-now and DOMContentLoaded paths)");
});

test("gfx-debug reports the facts that separate the bug classes", () => {
  // gpuErrors is the whole point: it splits "the frame is wrong" from "the
  // frame was never legally submitted". Those are unrelated bugs and a
  // screenshot cannot tell them apart.
  assert.match(SRC, /gpuErrors\(\)/, "the error tally must be on screen");
  assert.match(SRC, /gpuFirstError\(\)/, "and the first message, which names the pass");
  assert.match(SRC, /envState\(\)/, "env-probe state — a black cube lights the world black");
  assert.match(SRC, /backendState\(\)/, "which three backend actually bound");
  assert.match(SRC, /gfxTlxFail/, "a REFUSED backend explains the screen better than anything else");
  assert.match(SRC, /data-engine/, "the live canvas label, which survives a silent fallback");
});

test("gfx-debug reads only existing hooks and guards every one", () => {
  // A diagnostic that throws is worse than none: it would be blamed for the
  // very frame it was added to explain.
  assert.match(SRC, /typeof GLX !== "undefined" \? GLX : null/,
    "GLX may not exist yet — the overlay installs before a backend is picked");
  assert.doesNotMatch(SRC, /window\.GLX\b(?!\s*=)/,
    "page code uses the BARE global; window.GLX is not the same binding");
  // It must never invent a number. On a WebGPU-claimed canvas there is no 2D
  // readback at all, and printing a plausible zero there would have sent this
  // session down the same corner-sampling hole a second time.
  assert.match(SRC, /native swapchain \(no 2D readback\)/,
    "say when the frame cannot be measured instead of reporting a fake luma");
  // An all-zero blit canvas means EITHER a black frame or no blit yet. Calling
  // the second one "black" is the exact mistake that cost this session a round
  // (a top-left 64x64 sample of a dusk sky, read as maxLuma 0).
  assert.match(SRC, /nothing blitted yet \(not the same as black\)/,
    "an unpainted soft canvas must not be reported as a black frame");
});

test("gfx-debug can hand the reporter the text", () => {
  assert.match(SRC, /navigator\.clipboard/, "one-click copy is the point of the overlay");
  assert.match(SRC, /execCommand\("copy"\)/,
    "clipboard API needs a secure context — the textarea fallback is what makes it work on plain http");
});

test("gfx-debug obeys the file conventions", () => {
  assert.match(SRC, /^\/\* Apex 26 —/, "header comment first");
  assert.match(SRC, /"use strict";/, "IIFE modules are strict");
  assert.match(SRC, /^const GfxDebug = \(\(\) => \{/m, "one file, one global");
  assert.match(SRC, /window\.GfxDebug = GfxDebug;/, "and it publishes that global");
  const manifest = read("tools/manifest.cjs");
  assert.ok(manifest.includes('"js/game/gfx-debug.js"'),
    "new-file lockstep: the module roster must list it");
  const html = read("index.html");
  assert.match(html, /src="js\/game\/gfx-debug\.js\?v=[0-9a-f]{12}"/,
    "new-file lockstep: a content-hashed script tag in the shell");
});
