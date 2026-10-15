// GL-aware worker defaults for capture tools and remote-group.
// Run: node --test tests/unit/browser-workers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  glStack,
  defaultCaptureWorkers,
  defaultRemoteWorkers,
  scriptIsRenderHeavy,
  RENDER_HEAVY_SPEC_IDS,
  captureCpuBudget,
  captureChromiumArgs,
  captureGpuOptions,
} from "../../tools/lib/browser-workers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPTS = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;

test("glStack reads APEX_GL / GL", () => {
  assert.equal(glStack({}), "swiftshader");
  assert.equal(glStack({ APEX_GL: "llvmpipe" }), "llvmpipe");
  assert.equal(glStack({ GL: "llvmpipe" }), "llvmpipe");
  assert.equal(glStack({ APEX_GL: "angle,llvmpipe" }), "llvmpipe");
});

test("defaultCaptureWorkers: explicit override, CPU headroom and actual jobs bound pools", () => {
  assert.equal(defaultCaptureWorkers({ env: { APEX_WORKERS: "3" }, cpus: 8 }), 3);
  assert.equal(defaultCaptureWorkers({ env: {}, cpus: 4, defSwift: 2 }), 1);
  assert.equal(defaultCaptureWorkers({ env: {}, cpus: 8, defSwift: 2 }), 2);
  assert.equal(defaultCaptureWorkers({ env: { APEX_GL: "llvmpipe" }, cpus: 8 }), 4);
  assert.equal(defaultCaptureWorkers({ env: { APEX_GL: "llvmpipe" }, cpus: 2 }), 1);
  assert.equal(defaultCaptureWorkers({ env: {}, cpus: 1 }), 1);
  assert.equal(defaultCaptureWorkers({ env: { APEX_WORKERS: "8" }, jobs: 1 }), 1);
  assert.equal(defaultCaptureWorkers({ env: { APEX_GL: "llvmpipe" }, cpus: 32, jobs: 3 }), 3);
  assert.equal(defaultCaptureWorkers({ env: {}, jobs: 0 }), 0);
});

test("capture CPU budget respects affinity and fractional cgroup quota", () => {
  const read = (value) => () => value;
  assert.equal(captureCpuBudget({ parallelism: 32, read: read('400000 100000') }), 4);
  assert.equal(captureCpuBudget({ parallelism: 2, read: read('400000 100000') }), 2);
  assert.equal(captureCpuBudget({ parallelism: 32, read: read('150000 100000') }), 1);
  assert.equal(captureCpuBudget({ parallelism: 3, read: read('max 100000') }), 3);
  assert.equal(captureCpuBudget({ parallelism: 3, read: () => { throw new Error('not Linux'); } }), 3);
});

test("capture launcher uses the same requested GL stack as the worker budget", () => {
  assert.ok(captureChromiumArgs({}).includes('--use-angle=swiftshader'));
  const args = captureChromiumArgs({ APEX_GL: 'llvmpipe' });
  assert.ok(args.includes('--use-angle=gl'));
  assert.ok(args.includes('--use-gl=angle'));
  assert.ok(args.includes('--ignore-gpu-blocklist'));
  assert.ok(!args.includes('--use-angle=swiftshader'));
  assert.ok(!args.includes('--disable-frame-rate-limit'));
});

test("explicit GPU stacks avoid fallback pins and divide Mesa threads across workers", () => {
  const hardware = captureGpuOptions({ gpu: 'hardware', env: { LIBGL_ALWAYS_SOFTWARE: '1', GALLIUM_DRIVER: 'llvmpipe', VK_DRIVER_FILES: '/lvp.json' } });
  assert.ok(!hardware.args.some((arg) => arg.includes('swiftshader')));
  assert.equal(hardware.env.LIBGL_ALWAYS_SOFTWARE, undefined);
  assert.equal(hardware.env.GALLIUM_DRIVER, undefined);
  assert.equal(hardware.env.VK_DRIVER_FILES, undefined);
  const mesa = captureGpuOptions({ gpu: 'llvmpipe', env: {}, cpus: 8, workers: 4 });
  assert.equal(mesa.env.LP_NUM_THREADS, '2');
  assert.equal(mesa.env.LIBGL_ALWAYS_SOFTWARE, '1');
  assert.equal(mesa.env.GALLIUM_DRIVER, 'llvmpipe');
  assert.ok(mesa.args.includes('--use-angle=gl'));
  assert.equal(captureGpuOptions({ gpu: 'llvmpipe', env: { LP_NUM_THREADS: '3' }, cpus: 8, workers: 4 }).env.LP_NUM_THREADS, '3');
  assert.throws(() => captureGpuOptions({ gpu: 'llvmpipe', env: { LP_NUM_THREADS: 'bogus' } }), /LP_NUM_THREADS/);
  assert.equal(defaultCaptureWorkers({ env: { APEX_GPU: 'hardware' }, cpus: 8 }), 4);
  assert.equal(defaultCaptureWorkers({ env: { APEX_GPU: 'lavapipe' }, cpus: 4 }), 1);
});

test("lavapipe uses the current Vulkan loader override and rejects missing ICD", () => {
  const gpu = captureGpuOptions({ gpu: 'lavapipe', env: { VK_ICD_FILENAMES: '/old.json' }, lavapipeIcd: '/lvp.json', exists: (file) => file === '/lvp.json', cpus: 4, workers: 2 });
  assert.equal(gpu.env.VK_DRIVER_FILES, '/lvp.json');
  assert.equal(gpu.env.VK_ICD_FILENAMES, undefined);
  assert.equal(gpu.env.LP_NUM_THREADS, '2');
  assert.ok(gpu.args.includes('--use-angle=vulkan'));
  assert.throws(() => captureGpuOptions({ gpu: 'lavapipe', env: {}, exists: () => false }), /installed Mesa Vulkan ICD/);
  assert.throws(() => captureGpuOptions({ gpu: 'other', env: {} }), /unsupported GPU/);
});

test("scriptIsRenderHeavy matches spec basenames, not substrings", () => {
  assert.equal(scriptIsRenderHeavy("node tools/ci/run-playwright.mjs --project=render", "x"), true);
  assert.equal(scriptIsRenderHeavy("", "render"), true);
  assert.equal(scriptIsRenderHeavy(
    "node tools/ci/run-playwright.mjs tests/specs/hud-audit.spec.js", "ui"), true);
  assert.equal(scriptIsRenderHeavy(
    "node tools/ci/run-playwright.mjs tests/specs/debris.spec.js", "physics-core"), false);
  // "car" must not match inside an unrelated path; only carview-parts.spec.js etc.
  assert.equal(scriptIsRenderHeavy(
    "node tools/ci/run-playwright.mjs tests/specs/multiplayer-lobby.spec.js", "net"), false);
});

test("defaultRemoteWorkers: render-heavy → 1, light llvmpipe → 2, swiftshader → 1", () => {
  assert.deepEqual(defaultRemoteWorkers({
    group: "render", gl: "llvmpipe", script: SCRIPTS["test:render"],
  }), { workers: "1" });
  assert.deepEqual(defaultRemoteWorkers({
    group: "ui", gl: "llvmpipe", script: SCRIPTS["test:ui"],
  }), { workers: "1" });
  assert.deepEqual(defaultRemoteWorkers({
    group: "physics-core", gl: "llvmpipe", script: SCRIPTS["test:physics-core"] || "",
  }), { workers: "2" });
  assert.deepEqual(defaultRemoteWorkers({
    group: "net", gl: "llvmpipe", script: SCRIPTS["test:net"] || "",
  }), { workers: "2" });
  assert.deepEqual(defaultRemoteWorkers({
    group: "net", gl: "swiftshader", script: SCRIPTS["test:net"] || "",
  }), { workers: "1" });
  assert.deepEqual(defaultRemoteWorkers({
    group: "net", gl: "llvmpipe", script: SCRIPTS["test:net"] || "", requested: "3",
  }), { workers: "3" });
  assert.ok(defaultRemoteWorkers({ requested: "9" }).error);
});

test("RENDER_HEAVY_SPEC_IDS stays aligned with playwright.config.js RENDER_SPECS", () => {
  const cfg = fs.readFileSync(path.join(ROOT, "playwright.config.js"), "utf8");
  const block = cfg.match(/const RENDER_SPECS = \[([\s\S]*?)\]\.map/);
  assert.ok(block, "RENDER_SPECS list");
  const ids = [...block[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...RENDER_HEAVY_SPEC_IDS].sort(), [...ids].sort());
});

test("CI retries run isolated at the end of the shard; local runs keep immediate (#1716)", async () => {
  const { execFileSync } = await import("node:child_process");
  const read = (ci) => execFileSync(process.execPath, ["--input-type=module", "-e",
    "const c = (await import(process.argv[1])).default; process.stdout.write(JSON.stringify({ r: c.retries, s: c.retryStrategy }))",
    path.join(ROOT, "playwright.config.js")],
  { cwd: ROOT, encoding: "utf8", env: { ...process.env, CI: ci ? "true" : "" } });
  assert.deepEqual(JSON.parse(read(true)), { r: 1, s: "isolated" });
  assert.deepEqual(JSON.parse(read(false)), { r: 0, s: "immediate" });
});
