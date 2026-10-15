// @doc GL-aware Playwright / capture worker defaults (llvmpipe vs SwiftShader).
// Shared by apex-capture, remote-group, and unit tests. Measure before raising
// further — render-heavy specs timed out at --workers=4 on 4-vCPU llvmpipe
// (docs/notes/TESTING-FIELD-NOTES.md 2026-09-30).
import os from "node:os";
import { readFileSync, existsSync } from "node:fs";

/** Affinity and container quota, rather than the host's logical CPU count. */
export function captureCpuBudget({ parallelism = os.availableParallelism(), read = readFileSync } = {}) {
  let cpus = Math.max(1, parallelism);
  try {
    const [quota, period] = read("/sys/fs/cgroup/cpu.max", "utf8").trim().split(/\s+/);
    if (quota !== "max" && Number(quota) > 0 && Number(period) > 0) {
      cpus = Math.min(cpus, Math.max(1, Math.floor(Number(quota) / Number(period))));
    }
  } catch { /* Non-cgroup hosts use availableParallelism. */ }
  return cpus;
}

/** Match the llvmpipe ANGLE selection used by playwright.config.js. */
export function captureChromiumArgs(env = process.env) {
  if (glStack(env) === "hardware") return ["--enable-gpu", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"];
  const common = ["--enable-unsafe-swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"];
  return glStack(env) === "llvmpipe"
    ? ["--use-angle=gl", "--use-gl=angle", "--ignore-gpu-blocklist", ...common]
    : ["--use-angle=swiftshader", ...common];
}

/** Explicit rendering stack; no silent fallback for unavailable requested ICDs. */
export function captureGpuOptions({ env = process.env, gpu = glStack(env),
  cpus = captureCpuBudget(), workers = 1, lavapipeIcd = env.APEX_LAVAPIPE_ICD,
  exists = existsSync } = {}) {
  if (!["swiftshader", "llvmpipe", "hardware", "lavapipe"].includes(gpu)) {
    throw new Error(`capture: unsupported GPU profile ${gpu}`);
  }
  const launchEnv = { ...env, APEX_GPU: gpu, APEX_GL: gpu };
  if (gpu === "hardware") {
    // Explicit hardware selection must not inherit a software-driver pin.
    for (const key of ["LIBGL_ALWAYS_SOFTWARE", "GALLIUM_DRIVER", "VK_DRIVER_FILES", "VK_ICD_FILENAMES", "MESA_LOADER_DRIVER_OVERRIDE"]) delete launchEnv[key];
    return { args: captureChromiumArgs(launchEnv), env: launchEnv };
  }
  if (gpu === "llvmpipe" || gpu === "lavapipe") {
    const requested = env.LP_NUM_THREADS;
    const threads = requested == null || requested === ""
      ? Math.max(1, Math.floor(cpus / Math.max(1, workers))) : Number(requested);
    if (!Number.isInteger(threads) || threads < 1 || threads > 256) throw new Error("capture: LP_NUM_THREADS must be an integer 1-256");
    launchEnv.LP_NUM_THREADS = String(threads);
    if (gpu === "llvmpipe") {
      // Mesa's GL llvmpipe loads through a DRM node; without one Chromium silently
      // falls back to SwiftShader (docs/notes/CI-RENDERING-PERFORMANCE.md §llvmpipe).
      if (!exists("/dev/dri") && !env.GITHUB_ACTIONS) throw new Error("capture: llvmpipe needs /dev/dri (CI only); this container has none — use --gpu swiftshader or unset APEX_GL");
      launchEnv.LIBGL_ALWAYS_SOFTWARE = "1";
      launchEnv.GALLIUM_DRIVER = "llvmpipe";
      return { args: captureChromiumArgs(launchEnv), env: launchEnv };
    }
    const icd = lavapipeIcd || ["/usr/share/vulkan/icd.d/lvp_icd.json", "/usr/share/vulkan/icd.d/lvp_icd.x86_64.json"].find(exists);
    if (!icd || !exists(icd)) throw new Error("capture: lavapipe requires an installed Mesa Vulkan ICD; set APEX_LAVAPIPE_ICD to its manifest");
    launchEnv.VK_DRIVER_FILES = icd;
    delete launchEnv.VK_ICD_FILENAMES;
    return { args: ["--use-angle=vulkan", "--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE", "--use-vulkan=native", "--disable-vulkan-surface", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"], env: launchEnv };
  }
  return { args: captureChromiumArgs(launchEnv), env: launchEnv };
}

/** Spec basenames in playwright.config.js RENDER_SPECS (no .spec.js). */
export const RENDER_HEAVY_SPEC_IDS = [
  "dev-tools", "f1-track-accuracy", "hud-audit", "image-grade-visual",
  "lighting-ab", "lighting-tuner-grade",
  "carview-parts", "parts-budget", "parts-catalog", "parts-persistence",
  "parts-liveries",
  "ui-audit", "ui-button-touch", "menu-survey", "menu-keyboard", "photo-studio",
  "webgl-probes", "camera", "smoke", "season", "time-trial",
  "material-shimmer", "instanced-draw",
  "menu-baseline", "garage-first-frame",
];

/** Which software GL stack env asks for. */
export function glStack(env = process.env) {
  if (["hardware", "lavapipe"].includes(env.APEX_GPU || env.APEX_GL)) return env.APEX_GPU || env.APEX_GL;
  const g = String(env.APEX_GPU || env.APEX_GL || env.GL || "").toLowerCase();
  return g.includes("llvmpipe") ? "llvmpipe" : "swiftshader";
}

/**
 * Local / capture pool size. Explicit APEX_WORKERS wins.
 * llvmpipe: half the CPU budget (cap 4). SwiftShader: one per four CPUs,
 * capped by defSwift. Cold shaders made two workers slower on four CPUs.
 * Neither pool exceeds actual jobs; an explicit override may exceed CPU budget.
 */
export function defaultCaptureWorkers({
  env = process.env,
  cpus = captureCpuBudget(),
  defSwift = 2,
  jobs = Infinity,
} = {}) {
  const jobCap = Number.isFinite(jobs) ? Math.max(0, Math.floor(jobs)) : Infinity;
  const requested = Number.parseInt(env.APEX_WORKERS || "", 10);
  if (Number.isFinite(requested) && requested > 0) {
    return Math.min(jobCap, 8, Math.max(1, requested));
  }
  if (["llvmpipe", "hardware"].includes(glStack(env))) {
    return Math.min(jobCap, 4, Math.max(1, Math.floor(cpus / 2)));
  }
  return Math.min(jobCap, 8, Math.max(1, Math.floor(cpus / 4)), Math.max(1, defSwift));
}

/** True when a package.json test:* script will run RENDER_SPECS work. */
export function scriptIsRenderHeavy(script, group = "") {
  const s = String(script || "");
  const g = String(group || "").trim();
  if (g === "render" || /--project=render\b/.test(s)) return true;
  for (const id of RENDER_HEAVY_SPEC_IDS) {
    // Match `tests/specs/<id>.spec.js` only — not substrings like "car" in "career".
    if (new RegExp(`(?:^|[\\s/"'])${id}\\.spec\\.(?:js|mjs)\\b`).test(s)) return true;
  }
  return false;
}

/**
 * Workers per browser-group shard when the dispatch leaves workers empty.
 * Returns { workers: "N" } or { error }.
 * llvmpipe + headless-ish group → 2; render-heavy or SwiftShader → 1.
 */
export function defaultRemoteWorkers({
  group,
  gl = "llvmpipe",
  script = "",
  requested = "",
} = {}) {
  if (requested != null && String(requested).trim() !== "") {
    const n = Number(requested);
    if (!Number.isInteger(n) || n < 1 || n > 8) {
      return { error: `workers must be an integer 1-8, not ${requested}` };
    }
    return { workers: String(n) };
  }
  const stack = String(gl || "llvmpipe").toLowerCase() === "swiftshader"
    ? "swiftshader"
    : "llvmpipe";
  if (stack === "swiftshader") return { workers: "1" };
  if (scriptIsRenderHeavy(script, group)) return { workers: "1" };
  return { workers: "2" };
}
