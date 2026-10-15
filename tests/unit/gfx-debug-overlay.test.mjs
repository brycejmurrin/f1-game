/* gfx-debug-overlay.test.mjs — the overlay that exists because a player's
 * hardware is unreachable from here.
 *
 * This session spent rounds chasing a dark three.js/WebGPU frame with no way to
 * read the one number that settles it (GLX.gpuErrors()) on the machine that had
 * the bug: the reporter has no console, and this container has no GPU
 * (vulkaninfo: one PHYSICAL_DEVICE_TYPE_CPU, no /dev/dri). js/perf/gfx-debug-overlay.js
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
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SRC = read("js/perf/gfx-debug-overlay.js");

test("gfx-debug is opt-in and silent otherwise", () => {
  assert.match(SRC, /DevFlags\.get\("gfxdebug"\)/,
    "the overlay arms through the central DevFlags registry");
  assert.match(SRC, /localStorage\.getItem\("apex26\.gfxDebug"\) === "1"/,
    "without DevFlags (a page that skips dev-flags.js) the old ?gfxdebug=1 / storage read still arms it");
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

// Run the real overlay's text() against a stub DOM: which present path it
// names is behaviour, and a source regex cannot tell the branches apart.
function overlayText({ softPresent, gameSoft, game2d }) {
  const img = { data: new Uint8ClampedArray([40, 40, 40, 255, 80, 80, 80, 255]) };
  const ctx2d = { getImageData: () => img };
  const els = {
    game: { id: "game", width: 2, height: 1, getAttribute: () => "wgx", getContext: (t) => (t === "2d" && game2d ? ctx2d : null) },
    "game-soft": gameSoft ? { id: "game-soft", width: 2, height: 1, getContext: () => ctx2d } : null,
  };
  const store = { getItem: () => null };
  const sandbox = {
    document: { getElementById: (id) => els[id] || null, querySelector: () => null },
    location: { search: "" }, localStorage: store, sessionStorage: store, performance,
    GLX: { gpuErrors: () => 0, softPresent: softPresent == null ? undefined : () => softPresent },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SRC.replace(/^const GfxDebug\b/m, "var GfxDebug"), ctx);
  return vm.runInContext("GfxDebug.text()", ctx);
}

test("gfx-debug asks the backend whether it soft-presents before saying native (hunt 4 I6)", () => {
  // WGX soft-presents onto #game itself — no #game-soft — so the DOM-only
  // check printed "native swapchain" over a CPU readback every frame.
  const wgxSoft = overlayText({ softPresent: true, gameSoft: false, game2d: true });
  assert.doesNotMatch(wgxSoft, /native swapchain/, "a soft-presenting backend is not on the swapchain");
  assert.match(wgxSoft, /soft-present onto #game/);
  assert.match(wgxSoft, /frame\(soft\) mean=60\.0 max=80/, "and the luma comes from the blit it really paints");
  const native = overlayText({ softPresent: false, gameSoft: false, game2d: false });
  assert.match(native, /frame: native swapchain \(no 2D readback\)/);
  const glxSoft = overlayText({ softPresent: true, gameSoft: true, game2d: false });
  assert.match(glxSoft, /frame\(soft\) mean=60\.0/, "GLX/TLX keep reading their #game-soft overlay");
  assert.doesNotMatch(glxSoft, /onto #game/);
  const unreadable = overlayText({ softPresent: true, gameSoft: false, game2d: false });
  assert.match(unreadable, /frame\(soft\) unreadable/, "never steal or invent: a non-2D #game reads as unreadable");
});

test("gfx-debug can hand the reporter the text", () => {
  assert.match(SRC, /ApexClipboard\.write/, "one-click copy goes through ApexClipboard");
  const clip = read("js/core/clipboard.js");
  assert.match(clip, /navigator\.clipboard/, "ApexClipboard owns the clipboard API call");
  assert.match(clip, /execCommand\("copy"\)/,
    "clipboard API needs a secure context — the textarea fallback is what makes it work on plain http");
});

test("gfx-debug obeys the file conventions", () => {
  assert.match(SRC, /^\/\* Apex 26 —/, "header comment first");
  assert.match(SRC, /"use strict";/, "IIFE modules are strict");
  assert.match(SRC, /^const GfxDebug = \(\(\) => \{/m, "one file, one global");
  assert.match(SRC, /window\.GfxDebug = GfxDebug;/, "and it publishes that global");
  const manifest = read("tools/manifest.cjs");
  assert.ok(manifest.includes('"js/perf/gfx-debug-overlay.js"'),
    "new-file lockstep: the module roster must list it");
  const html = read("index.html");
  assert.match(html, /src="js\/perf\/gfx-debug-overlay\.js\?v=[A-Za-z0-9._-]+"/,
    "new-file lockstep: a script tag in the shell (gen-shell writes it from the manifest)");
});
