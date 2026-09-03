#!/usr/bin/env node
// wgx-validate.mjs — REAL Dawn validation of the WGX (WebGPU) renderer,
// @doc REAL Dawn validation of the WGX renderer in-container (~5 s): full Chromium, races a track, fails on any GPU error.
// @skill webgpu-debug
// in-container.
//
// For months this repo believed "WGSL is not compilable in this container" and
// shipped read-verified-only WGSL (447e904b's own commit message says so). That
// is FALSE: the full Playwright Chromium binary (NOT the headless shell — it
// has no navigator.gpu) with new-headless + the flags below exposes a real Dawn
// WebGPU device on SwiftShader. Dawn then does what no amount of read-review
// does: it PARSES every WGSL module (the derivative_uniformity violation that
// painted the whole road NaN-white on phones was a one-line Dawn error here),
// VALIDATES every pipeline (the spec-invalid MSAA count 2, the non-renderable
// rg11b10ufloat), and runs the full frame graph.
//
// THE CEILING — read this before chasing pixels: this environment VALIDATES
// but does not EXECUTE. Submitted work completes with zeroed results, canvas
// present composites nothing (screenshots of the WGX canvas are BLANK — that is
// the environment, not a bug), and under the full desktop stack SwiftShader may
// LOSE the device a few seconds in ("createBuffer failed, size (N) is too
// large" on a tiny N is Chrome's misleading lost-device error). Validation
// evidence here is exact; pixel sign-off needs a real GPU.
//
// Usage:
//   node spike/backends/tools/wgx-validate.mjs --static
//   node spike/backends/tools/wgx-validate.mjs [trackId] [--lite] [--frames N] [--no-rg11b10] [--lax-uniformity]
//
// --static is the default no-browser gate. Bare / --lite / --no-rg11b10
// launch Chromium (parent session only).
//
// --no-rg11b10 spoofs an adapter WITHOUT 'rg11b10ufloat-renderable' (common on
// phones), forcing the POST_HDR_FORMAT -> rgba16float fallback branch that the
// container adapter — which HAS the feature — never exercises on its own.
//
// PASS (exit 0): WGX binds (no GLX fallback), zero WGSL parse errors, zero GPU
// validation errors across init + a raced frame. Device-lost AFTER a clean
// init is reported as an environment note, not a failure — but any validation
// error is fatal.

import { startStaticServer, launchChromium, shutdown, WEBGPU_CHROMIUM_ARGS } from "../lib/harness.mjs";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const args = process.argv.slice(2);
const track = args.find((a) => !a.startsWith("--")) || "montreal";
const lite = args.includes("--lite");
const noRg11b10 = args.includes("--no-rg11b10");
const staticOnly = args.includes("--static");
// Default ON: the live gate compiles as WebKit does (see the init script).
// --lax-uniformity restores Dawn's warning-only default to bisect a red run.
const uniformityError = !args.includes("--lax-uniformity");
const framesArg = args.indexOf("--frames");
const frames = framesArg >= 0 ? Math.max(1, parseInt(args[framesArg + 1], 10) || 60) : 60;

// Source invariants the Dawn pass cannot see on a software adapter (it forces
// MSAA 1) and cannot see at all for legal-but-wrong pipeline state (sky
// depthCompare: "always" validates). Run these FIRST, and `--static` stops here
// so a verify-agent can gate WGX edits without launching Chromium.

// Every WGX file that CARRIES WGSL, not just the two the invariants below read.
// The WGSL lives in JS template literals, so a stray backtick in a shader
// comment ends the string and the whole module stops parsing — and until this
// check existed `--static` reported ok:true for exactly that, because it only
// ever regex-matched wgx.js and wgsl-chunks.js as TEXT and never looked at
// wgsl-post.js or wgsl-fx.js at all. A file that does not parse cannot define
// WGX, so the page falls back to GLX with one console line: the silent-fallback
// failure this whole tool exists to catch. vm.Script COMPILES without running,
// which is what makes it safe to point at an IIFE backend file from node.
const WGSL_FILES = [
  "spike/backends/webgpu/wgx.js",
  "spike/backends/webgpu/wgsl-chunks.js",
  "spike/backends/webgpu/wgsl-post.js",
  "spike/backends/webgpu/wgsl-fx.js",
];
function parseCheck() {
  for (const rel of WGSL_FILES) {
    let src = null;
    try { src = readFileSync(join(ROOT, rel), "utf8"); }
    catch (e) { fail(rel + " could not be read: " + (e && e.message)); continue; }
    try { new vm.Script(src, { filename: rel }); }
    catch (e) { fail(rel + " does not parse as JavaScript: " + (e && e.message)); }
  }
}

function staticCheck() {
  parseCheck();
  const wgx = readFileSync(join(ROOT, "spike/backends/webgpu/wgx.js"), "utf8");
  const chunks = readFileSync(join(ROOT, "spike/backends/webgpu/wgsl-chunks.js"), "utf8");
  const sky = [...wgx.matchAll(/skyPipeline\w*\s*=\s*device\.createRenderPipeline\(\{[\s\S]*?depthCompare:\s*"(\w+)"/g)];
  for (const m of sky) {
    if (m[1] === "always") fail("sky pipeline depthCompare is \"always\" — late sky erases the world; must be less-equal");
  }
  if (/MSAA_COUNT\s*=\s*[^;\n]*\b2\b/.test(wgx) || /sampleCount:\s*2\b/.test(wgx)) {
    fail("MSAA sampleCount 2 is not a legal WebGPU value (only 1 or 4)");
  }
  if (!/pBloomDown = fsPipe\([^,]+,\s*POST_HDR_FORMAT/.test(wgx)) {
    fail("pBloomDown must target POST_HDR_FORMAT (mismatch vs bloom textures when rg11b10 is granted)");
  }
  if (!/textureLoad\(src,\s*c,\s*3\)/.test(chunks)) {
    fail("DEPTH_RESOLVE must min sample 3 (4× MSAA leftover mined only 0 and 1)");
  }
  if (/\bfn\s+fw1\s*\(/.test(chunks)) {
    fail("fn fw1 is back — derivatives must stay hoisted in fs_main, not wrapped");
  }
}

let failures = 0;
const fail = (msg) => { failures += 1; console.error("FAIL:", msg); };

staticCheck();
if (staticOnly) {
  if (failures) { console.error("FAIL: wgx-validate --static (" + failures + ")"); process.exit(1); }
  console.log(JSON.stringify({ ok: true, static: true }, null, 2));
  process.exit(0);
}

try {
  const srv = await startStaticServer(ROOT);
  // The FULL Chromium build: the headless shell playwright launches by default
  // has no navigator.gpu at all. launchChromium's pickChromium() already
  // resolves the sandbox's full build; passing chromium.executablePath() here
  // OVERRODE it with playwright's registry path for whatever build the npm
  // pin wants — which broke the moment playwright 1.61 pinned chromium-1228
  // in a container whose egress allowlist blocks cdn.playwright.dev, while
  // /opt/pw-browsers/chromium (full 1194, navigator.gpu present) sat unused.
  const browser = await launchChromium({
    headless: true,
    args: WEBGPU_CHROMIUM_ARGS,
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

  const gpuErrLines = [];
  const parseErrLines = [];
  let fellBack = null;
  page.on("console", (m) => {
    const t = m.text();
    if (/WGX GPU error/.test(t)) gpuErrLines.push(t.slice(0, 400));
    if (/Error while parsing WGSL/.test(t)) parseErrLines.push(t.slice(0, 400));
    if (/WGX unavailable/.test(t)) fellBack = t.slice(0, 300);
  });
  page.on("pageerror", (e) => fail("pageerror: " + String(e).slice(0, 300)));

  await page.addInitScript(([wantLite, dropRg, uniErr]) => {
    localStorage.setItem("apex26.gfxBackend", "webgpu");
    // WebKit runs WGSL uniformity analysis at ERROR severity by default
    // (UniformityAnalysis.cpp: a textureSample / dpdx under non-uniform
    // control flow fails createShaderModule, and the pipeline built from it
    // never draws); Dawn defaults the same diagnostic to a WARNING that only
    // reaches the console. A module that validates here but not on an iPhone
    // is exactly the silent-fallback WGX cannot report about itself, so the
    // live gate compiles every module as WebKit would: prepend the directive
    // (global directives may appear in any order before the first
    // declaration, so it sits safely ahead of `enable f16;`). Modules that
    // already carry a diagnostic() directive keep their own severity.
    if (uniErr && typeof GPUDevice !== "undefined" && GPUDevice.prototype.createShaderModule) {
      const origCSM = GPUDevice.prototype.createShaderModule;
      GPUDevice.prototype.createShaderModule = function (desc) {
        if (desc && typeof desc.code === "string" && !/^\s*diagnostic\s*\(/m.test(desc.code)) {
          desc = Object.assign({}, desc, {
            code: "diagnostic(error, derivative_uniformity);\n" + desc.code });
        }
        return origCSM.call(this, desc);
      };
    }
    // Soft-adapter gate refuses Dawn SwiftShader by default (native swapchain
    // never composites). This tool intentionally validates/captures on software.
    localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
    if (wantLite) localStorage.setItem("apex26.gfxWgxLite", "1");
    if (dropRg && navigator.gpu) {
      // Present the adapter as a phone-class one: same device, but features
      // reports no 'rg11b10ufloat-renderable', so WGX must take (and Dawn must
      // validate) the rgba16float post-target fallback.
      const orig = navigator.gpu.requestAdapter.bind(navigator.gpu);
      navigator.gpu.requestAdapter = async (opts) => {
        const a = await orig(opts);
        if (!a) return a;
        const feats = new Set();
        a.features.forEach((f) => { if (f !== "rg11b10ufloat-renderable") feats.add(f); });
        return new Proxy(a, {
          get(t, p) {
            if (p === "features") return feats;
            const v = t[p];
            return typeof v === "function" ? v.bind(t) : v;
          },
        });
      };
    }
  }, [lite, noRg11b10, uniformityError]);

  await page.goto(srv.url + "index.html");
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 60000 });
  await page.evaluate((id) => { __apex.race(id); __apex.go(); }, track);
  await page.waitForFunction(
    () => { try { const p = __apex.physState(); return p && p.ok !== false; } catch { return false; } },
    null, { polling: 100, timeout: 120000 });
  await page.evaluate(() => { __apex.jump(0.10); __apex.snapCam(); });
  await page.evaluate(
    (n) => new Promise((res) => { let i = 0; const t = () => (++i > n ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); }),
    frames);

  const state = await page.evaluate(() => {
    const out = {};
    try { out.env = __apex.diag({ download: false }).env; } catch (e) { out.env = { error: String(e) }; }
    try { out.gpuErrors = window.WGX && WGX.gpuErrors ? WGX.gpuErrors() : null; } catch (e) { out.gpuErrors = String(e); }
    try { out.lastFailure = (window.WGX && WGX.lastFailure) || null; } catch (_) { out.lastFailure = null; }
    // A lost device shows up as createMesh alloc failures on tiny buffers in
    // the gfx ring — Chrome's "size (N) is too large" wording is misleading.
    try {
      out.deviceLostHint = __apex.logs().some(
        (l) => l.ns === "gfx" && /too large for the implementation/.test(l.msg));
    } catch (_) { out.deviceLostHint = null; }
    try { const v = __apex.render({ what: "view" }); out.coveragePct = v && v.coveragePct; } catch (_) {}
    return out;
  });

  const backend = state.env && state.env.backend;
  if (fellBack) fail("WGX refused and fell back: " + fellBack);
  if (backend !== "webgpu") fail("bound backend is " + JSON.stringify(backend) + ", expected \"webgpu\"");
  if (parseErrLines.length) fail(parseErrLines.length + " WGSL parse error(s):\n" + parseErrLines.join("\n---\n"));
  if (gpuErrLines.length) fail(gpuErrLines.length + " GPU validation error(s):\n" + gpuErrLines.join("\n---\n"));
  if (state.gpuErrors !== 0) fail("WGX.gpuErrors() = " + JSON.stringify(state.gpuErrors));

  console.log(JSON.stringify({
    ok: failures === 0,
    track, lite, frames,
    rg11b10Spoofed: noRg11b10,
    uniformityError,
    backend,
    msaa: state.env && state.env.msaa,
    hdr: state.env && state.env.hdr,
    gpuErrors: state.gpuErrors,
    wgslParseErrors: parseErrLines.length,
    deviceLostHint: state.deviceLostHint || false,
    sceneCoveragePct: state.coveragePct || null,
  }, null, 2));
  if (state.deviceLostHint) {
    console.error("note: SwiftShader lost the device after init (environment limit, " +
      "not a validation failure) — try --lite for a longer-lived run.");
  }
} catch (e) {
  fail(String((e && e.message) || e).slice(0, 500));
} finally {
  await shutdown();
}
process.exit(failures ? 1 : 0);
