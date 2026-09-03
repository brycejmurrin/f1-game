"use strict";
// Single source for WebGPU Chromium flags — harness.mjs, chrome-devtools-mcp.sh,
// @doc Single source for WebGPU Chromium flags, shared by `harness.mjs`, `chrome-devtools-mcp.sh` and tests.
// @skill mcp-probe
// and tests must agree or MCP probes read "no adapter" while wgx-shot passes.

/** Playwright launch args (full Chromium binary — NOT the headless shell). */
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
  mcpChromeArgs,
};
