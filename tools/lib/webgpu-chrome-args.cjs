"use strict";
// Single source for WebGPU Chromium flags — harness.mjs, chrome-devtools-mcp.sh,
// @doc Single source for WebGPU Chromium flags, shared by `harness.mjs`, `chrome-devtools-mcp.sh` and tests.
// @skill mcp-probe
// and tests must agree or MCP probes read "no adapter" while wgx-shot passes.

/** Software WebGPU launch args. Prefer full Chromium; verify adapter support. */
const WEBGPU_CHROMIUM_ARGS = [
  "--headless=new",
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan",
  "--use-vulkan=swiftshader",
  "--use-webgpu-adapter=swiftshader",
  "--no-sandbox",
];

/** Extra flags for chrome-devtools-mcp (WebGL software path used by GLX/TLX). */
const WEBGPU_CHROMIUM_MCP_EXTRA = [
  "--enable-unsafe-swiftshader",
];

// The "lavapipe" launch: it ASKS for Mesa lavapipe (native Vulkan, lvp ICD), but Dawn does not take it. WebGPU
// gets the SwiftShader fallback adapter (#5450): perf-census-webgpu run 42979924558 recorded
// {vendor:"google",architecture:"swiftshader"}, and a local probe on 2026-11-11 (mesa-vulkan-drivers 25.2.8)
// got the same, isFallbackAdapter true, with --ignore-gpu-blocklist, --use-webgpu-adapter=default, a high-performance
// power preference or --disable-software-rasterizer added. So WebGPU numbers from this launch are SOFTWARE WebGPU
// on SwiftShader; WEBGPU_CENSUS_ADAPTER names that, and a census exits 1 when the adapter it ran on is not it.
const WEBGPU_LAVAPE_CHROMIUM_ARGS = [
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE",
  "--use-angle=vulkan",
  "--use-vulkan=native",
  "--disable-vulkan-surface",
  "--no-sandbox",
];

const WEBGPU_LAVAPE_ENV = {
  VK_ICD_FILENAMES: "/usr/share/vulkan/icd.d/lvp_icd.json",
};

/** The WebGPU adapter a census on the launch above runs on, and the arm's truthful name (#5450). A run that finds
 *  another adapter fails rather than file its numbers under the wrong label: a real lavapipe adapter would be a
 *  new arm with its own name and baseline, not a silent swap. */
const WEBGPU_CENSUS_ADAPTER = Object.freeze({ vendor: "google", architecture: "swiftshader" });
const WEBGPU_CENSUS_ARM = "software WebGPU (google/swiftshader adapter)";

/** null when `info` (GPUAdapterInfo-shaped) is the expected adapter, else why not. A missing read is a mismatch. */
function adapterMismatch(info, want = WEBGPU_CENSUS_ADAPTER) {
  if (!info || typeof info !== "object") return `no WebGPU adapterInfo read (want ${want.vendor}/${want.architecture})`;
  const got = `${info.vendor || "?"}/${info.architecture || "?"}`;
  for (const k of Object.keys(want)) {
    if (String(info[k] || "").toLowerCase() !== String(want[k]).toLowerCase()) {
      return `WebGPU adapter is ${got}${info.description ? ` (${info.description})` : ""}, not ${want.vendor}/${want.architecture}`;
    }
  }
  return null;
}

/** Flags passed as --chromeArg=… to chrome-devtools-mcp (headless is separate). */
function mcpChromeArgs() {
  return [
    ...WEBGPU_CHROMIUM_ARGS.filter((a) => a !== "--headless=new"),
    ...WEBGPU_CHROMIUM_MCP_EXTRA,
  ];
}

if (require.main === module) {
  const mode = process.argv[2] || "mcp";
  if (mode === "mcp") {
    for (const a of mcpChromeArgs()) console.log(a);
  } else if (mode === "json") {
    console.log(JSON.stringify({
      playwright: WEBGPU_CHROMIUM_ARGS,
      mcp: mcpChromeArgs(),
      lavapipe: WEBGPU_LAVAPE_CHROMIUM_ARGS,
    }, null, 2));
  } else {
    console.error("usage: node tools/lib/webgpu-chrome-args.cjs [mcp|json]");
    process.exit(1);
  }
}

module.exports = {
  WEBGPU_CHROMIUM_ARGS,
  WEBGPU_CHROMIUM_MCP_EXTRA,
  WEBGPU_LAVAPE_CHROMIUM_ARGS,
  WEBGPU_LAVAPE_ENV,
  WEBGPU_CENSUS_ADAPTER,
  WEBGPU_CENSUS_ARM,
  adapterMismatch,
  mcpChromeArgs,
};
