#!/usr/bin/env node
// @doc Does this machine have a real GPU? Launches full Chromium per flag set and reports the adapter (`census_only` in CI).
/* gpu-census.mjs — ask a machine ONE question: is there a real GPU behind
 * navigator.gpu here, or is it a software adapter?
 *
 * Why this exists. Every rendering verdict this project can reach in its own
 * container is a SOFTWARE verdict: `vulkaninfo --summary` reports a single
 * PHYSICAL_DEVICE_TYPE_CPU (llvmpipe) and there is no /dev/dri at all, so no
 * Chrome flag, Xvfb run or MCP can produce hardware. That is survivable for
 * validation (llvmpipe is conformant, so Dawn rejects the same things it would
 * reject on a player's machine) and useless for anything that only shows up on
 * real silicon. Before spending a session making the probe portable, find out
 * whether any reachable runner HAS a GPU — GitHub's Linux, macOS-arm64 and
 * Windows images all claim different things, and the published answers
 * contradict each other.
 *
 * It reports, per flag set: the adapter's vendor/architecture/device/
 * description, whether that string looks like a known software rasteriser,
 * the WebGL2 unmasked renderer (a second opinion that needs no WebGPU), and
 * the adapter limits that give hardware away (maxBufferSize etc. are tiny on
 * some software stacks). NOTHING here touches the game — it is a machine
 * census, so it stays valid no matter what the renderer does next.
 *
 * Run: node tools/gpu-census.mjs [--json out.json]
 * CI:  .github/workflows/gpu-census.yml (workflow_dispatch, one job per image)
 */
import { chromium } from "playwright";
import http from "node:http";
import { writeFileSync, existsSync } from "node:fs";

// This container pins Chromium to a build number the installed playwright
// package no longer asks for, so channel:"chromium" resolves to a path that
// does not exist. Prefer the pinned binary when it is there (AGENTS.md
// §Pre-installed browser), and let CI runners take the channel.
const PINNED = ["/opt/pw-browsers/chromium", process.env.APEX_CHROMIUM].filter(Boolean).find((p) => {
  try { return existsSync(p); } catch (_) { return false; }
}) || null;

const SOFTWARE_RE = /swiftshader|llvmpipe|lavapipe|softpipe|warp|basic render|gdi generic|software/i;

// navigator.gpu is absent outside a secure context, and about:blank is NOT one
// — http://127.0.0.1 is. A four-line server is cheaper than any fixture.
function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((_, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><meta charset=utf-8><title>gpu census</title><canvas id=c></canvas>");
    });
    s.listen(0, "127.0.0.1", () => resolve({ server: s, port: s.address().port }));
  });
}

// Flag sets worth distinguishing. "stock" is what a player's browser does; the
// rest are the knobs CI guides recommend, and the census exists to find out
// which of them actually change the answer on each image.
const FLAG_SETS = {
  stock: [],
  unsafe: ["--enable-unsafe-webgpu"],
  vulkan: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan"],
  noBlocklist: [
    "--enable-unsafe-webgpu",
    "--enable-dawn-features=allow_unsafe_apis,disable_adapter_blocklist",
    "--ignore-gpu-blocklist",
  ],
};

async function census(name, extraArgs) {
  const { server, port } = await serve();
  let browser = null;
  try {
    browser = await chromium.launch({
      // channel:"chromium" is FULL Chromium. Playwright's default is the
      // headless shell, which ships without navigator.gpu — census it and every
      // image on earth answers "no-webgpu", which is a fact about the binary,
      // not about the machine.
      ...(PINNED ? { executablePath: PINNED } : { channel: "chromium" }),
      args: [...extraArgs, ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const out = await page.evaluate(async () => {
      const res = { hasGpu: !!navigator.gpu, adapter: null, error: null, webgl: null };
      try {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        if (gl) {
          const ext = gl.getExtension("WEBGL_debug_renderer_info");
          res.webgl = {
            renderer: (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER),
            vendor: (ext && gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) || gl.getParameter(gl.VENDOR),
          };
        }
      } catch (e) { res.webgl = { error: String((e && e.message) || e) }; }
      if (!navigator.gpu) return res;
      try {
        const a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!a) { res.error = "requestAdapter returned null"; return res; }
        const i = a.info || {};
        res.adapter = {
          // adapter.info is non-enumerable on some builds, so read the fields by
          // name — JSON.stringify(a.info) comes back "{}" and has already fooled
          // one probe in this repo into calling a software adapter unknown.
          vendor: i.vendor, architecture: i.architecture,
          device: i.device, description: i.description,
          isFallbackAdapter: a.isFallbackAdapter,
          features: [...(a.features || [])].slice(0, 40),
          limits: {
            maxBufferSize: a.limits && a.limits.maxBufferSize,
            maxTextureDimension2D: a.limits && a.limits.maxTextureDimension2D,
            maxComputeWorkgroupStorageSize: a.limits && a.limits.maxComputeWorkgroupStorageSize,
          },
        };
      } catch (e) { res.error = String((e && e.message) || e); }
      return res;
    });
    const blob = [out.adapter && out.adapter.vendor, out.adapter && out.adapter.architecture,
      out.adapter && out.adapter.device, out.adapter && out.adapter.description,
      out.webgl && out.webgl.renderer].filter(Boolean).join(" ");
    return {
      flags: name, args: extraArgs, ...out,
      software: SOFTWARE_RE.test(blob),
      // "hardware" means: an adapter came back AND nothing in any of its
      // identity strings looks like a known rasteriser. Stated as a claim about
      // the STRINGS, because that is all the platform gives us.
      verdict: !out.hasGpu ? "no-webgpu"
        : !out.adapter ? "no-adapter"
          : SOFTWARE_RE.test(blob) ? "software" : "hardware?",
    };
  } catch (e) {
    return { flags: name, args: extraArgs, error: String((e && e.message) || e), verdict: "launch-failed" };
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
}

const jsonAt = (() => {
  const i = process.argv.indexOf("--json");
  return i > -1 ? process.argv[i + 1] : null;
})();

const report = {
  platform: process.platform, arch: process.arch,
  node: process.version, runner: process.env.RUNNER_NAME || null,
  image: process.env.ImageOS || null, chromium: PINNED || "channel:chromium", runs: [],
};
for (const [name, args] of Object.entries(FLAG_SETS)) {
  const r = await census(name, args);
  report.runs.push(r);
  console.log(`[census] ${name.padEnd(12)} ${String(r.verdict).padEnd(13)} ` +
    `gpu=${r.hasGpu} adapter=${JSON.stringify(r.adapter && {
      v: r.adapter.vendor, a: r.adapter.architecture, d: r.adapter.description,
    })} webgl=${JSON.stringify(r.webgl && r.webgl.renderer)}${r.error ? ` err=${r.error}` : ""}`);
}
// TRI-STATE, and the third state is the point. `some(...) === false` answered
// two different questions with one word: "every flag set launched and none
// found hardware" and "nothing launched, so I have no idea". Downstream,
// gpu-census.yml turns anyHardware into `hardware`, which gates its three
// strongest clauses (a missing gpuErrors count, softAdapter on hardware) — so a
// census that failed to launch four times silently DOWNGRADED the real-GPU gate
// to a software gate and let it report success. That is the same
// absence-reads-as-normal shape as the vacuous gpuErrors check the gate was
// hardened against in the first place. docs/PERF-FINDINGS.md 2j.
const measured = report.runs.filter((r) => r.verdict !== "launch-failed");
report.anyHardware = measured.length ? measured.some((r) => r.verdict === "hardware?") : null;
report.measuredRuns = measured.length;
report.totalRuns = report.runs.length;
console.log("\n[census] ANY HARDWARE ADAPTER: " + report.anyHardware +
  ` (${measured.length}/${report.runs.length} flag sets actually launched)`);
console.log(JSON.stringify(report, null, 2));
if (jsonAt) writeFileSync(jsonAt, JSON.stringify(report, null, 2));
// A census where nothing launched measured NOTHING. Exiting 0 with a report
// full of nulls is how a consumer comes to believe it.
if (!measured.length) {
  console.error("[census] CENSUS MEASURED NOTHING — all " + report.runs.length +
    " flag sets failed to launch; anyHardware is null, not false. " +
    "Do not read this run as a software verdict.");
  process.exit(1);
}
process.exit(0);
