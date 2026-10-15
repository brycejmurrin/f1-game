// @doc Validated shared screenshot profiles, scope, rendering stack, and session options.
import { WEBGPU_CHROMIUM_ARGS } from "../lib/harness.mjs";
import { captureGpuOptions, glStack } from "../lib/browser-workers.mjs";

export const CAPTURE_PROFILES = Object.freeze({
  custom: Object.freeze({ width: null, height: null, type: null, quality: null }),
  preview: Object.freeze({ width: 640, height: 360, type: "jpeg", quality: 80 }),
  comparison: Object.freeze({ width: 1280, height: 720, type: "png", quality: null }),
});
const VALUES = new Set(["profile", "width", "height", "dpr", "scope", "gpu", "browser", "type", "quality", "seed"]);
const FLAGS = new Set(["trace", "cache-assets", "reuse", "isolated"]);
const range = (name, raw, low, high, integer = true) => {
  const value = Number(raw);
  if (raw === "" || !Number.isFinite(value) || value < low || value > high || (integer && !Number.isInteger(value))) {
    throw new Error(`capture: --${name} must be ${integer ? "an integer" : "a number"} ${low}-${high}`);
  }
  return value;
};
const oneOf = (name, value, allowed) => {
  if (!allowed.includes(value)) throw new Error(`capture: --${name} must be one of ${allowed.join(", ")}`);
  return value;
};

/** Strip only shared capture flags; command-specific arguments remain in positionals. */
export function parseCaptureOptions(argv = [], env = process.env) {
  const raw = {}, positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") { positionals.push(...argv.slice(i + 1)); break; }
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!match || (!VALUES.has(match[1]) && !FLAGS.has(match[1]))) { positionals.push(arg); continue; }
    const [, key, inline] = match;
    if (FLAGS.has(key)) {
      if (inline != null && !(key === "trace" && inline)) throw new Error(`capture: --${key} does not take a value`);
      raw[key] = inline ?? true;
    } else {
      const value = inline ?? argv[++i];
      if (value == null || value.startsWith("--")) throw new Error(`capture: --${key} requires a value`);
      raw[key] = value;
    }
  }
  if (raw.reuse && raw.isolated) throw new Error("capture: --reuse and --isolated are mutually exclusive");
  const profile = oneOf("profile", raw.profile || "custom", Object.keys(CAPTURE_PROFILES));
  const preset = CAPTURE_PROFILES[profile];
  const width = raw.width == null ? preset.width : range("width", raw.width, 1, 8192);
  const height = raw.height == null ? preset.height : range("height", raw.height, 1, 8192);
  const dpr = range("dpr", raw.dpr ?? 1, 0.25, 4, false);
  const type = raw.type == null ? preset.type : oneOf("type", raw.type === "jpg" ? "jpeg" : raw.type, ["png", "jpeg"]);
  const quality = raw.quality == null ? (type === "jpeg" ? preset.quality : null) : range("quality", raw.quality, 1, 100);
  if (type === "png" && quality != null) throw new Error("capture: --quality is only supported for JPEG");
  const gpu = oneOf("gpu", raw.gpu ?? glStack(env), ["swiftshader", "llvmpipe", "hardware", "lavapipe"]);
  const browserAliases = { unified: "chromium", "headless-shell": "shell" };
  const browser = oneOf("browser", browserAliases[raw.browser] || raw.browser || "auto", ["auto", "chromium", "shell"]);
  const options = { profile, width, height, viewport: width != null && height != null ? { width, height } : null,
    dpr, type, quality, scope: oneOf("scope", raw.scope || "scene", ["scene", "page"]),
    gpu, // An env-chosen stack (APEX_GPU/APEX_GL) is a request too: verify it, never accept a silent SwiftShader fallback.
    gpuExplicit: raw.gpu != null || !!(env.APEX_GPU || env.APEX_GL), browser, trace: !!raw.trace,
    tracePath: typeof raw.trace === "string" ? raw.trace : null,
    cacheAssets: !!raw["cache-assets"], reuse: !raw.isolated, isolated: !!raw.isolated,
    seed: raw.seed == null ? (profile === "comparison" ? 1 : null) : range("seed", raw.seed, 0, 4294967295), positionals };
  if (options.viewport) captureViewport(options, options.viewport);
  return options;
}

export function captureViewport(options, fallback = { width: 844, height: 390 }) {
  const viewport = { width: options.width ?? options.viewport?.width ?? fallback.width,
    height: options.height ?? options.viewport?.height ?? fallback.height };
  range("width", viewport.width, 1, 8192); range("height", viewport.height, 1, 8192);
  const dpr = range("dpr", options.dpr ?? 1, 0.25, 4, false);
  if (viewport.width * viewport.height * dpr * dpr > 64 * 1024 * 1024) throw new Error("capture: requested viewport/DPR exceeds 64 million pixels");
  return viewport;
}
export function captureContextOptions(options, fallback) {
  return { viewport: captureViewport(options, fallback), deviceScaleFactor: options.dpr ?? 1 };
}
export function captureLaunchOptions(options, runtime = {}) {
  if (runtime.backend === "webgpu" && options.gpu === "llvmpipe") throw new Error("capture: llvmpipe is WebGL-only; use lavapipe for software WebGPU");
  const launch = captureGpuOptions({ ...runtime, gpu: options.gpu });
  if (runtime.backend === "webgpu") {
    if (options.gpu === "swiftshader") launch.args = [...new Set([...launch.args, ...WEBGPU_CHROMIUM_ARGS.filter((arg) => arg !== "--headless=new")])];
  }
  return { ...launch, browserFlavor: options.browser };
}
export function captureScreenshotOptions(options, fallbackType = "png") {
  const type = options.type || fallbackType;
  return { type, ...(type === "jpeg" && options.quality != null ? { quality: options.quality } : {}), scope: options.scope || "scene" };
}
export function captureExtension(options, fallbackType = "png") {
  return (options.type || fallbackType) === "jpeg" ? "jpg" : "png";
}

/** Comparisons hold resolution and feature tier; previews only change output size. */
export async function applyCaptureProfile(page, options) {
  if (options.profile !== "comparison") return null;
  return page.evaluate(() => {
    const a = window.__apex;
    if (typeof a?.renderScale !== "function" || typeof a?.govHold !== "function" || typeof a?.renderClock !== "function") {
      throw new Error("capture: comparison profile requires __apex.renderScale, __apex.govHold and __apex.renderClock");
    }
    const before = a.renderScale();
    const scale = a.renderScale(1), tier = a.govHold(true), renderClock = a.renderClock(0, true);
    if (scale?.ok === false || scale?.scale !== 1 || tier?.tierHold !== true || renderClock !== 0) {
      throw new Error("capture: comparison profile could not pin render scale and governor tier");
    }
    return { profile: "comparison", before, scale, tier, renderClock };
  });
}
