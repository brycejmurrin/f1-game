// @doc GL-aware Playwright / capture worker defaults (llvmpipe vs SwiftShader).
// Shared by apex-capture, remote-group, and unit tests. Measure before raising
// further — render-heavy specs timed out at --workers=4 on 4-vCPU llvmpipe
// (docs/notes/TESTING-FIELD-NOTES.md 2026-09-30).
import os from "node:os";
import { readFileSync } from "node:fs";

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
  const common = ["--enable-unsafe-swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"];
  return glStack(env) === "llvmpipe"
    ? ["--use-angle=gl", "--use-gl=angle", "--ignore-gpu-blocklist", ...common]
    : ["--use-angle=swiftshader", ...common];
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
  "menu-baseline",
];

/** Which software GL stack env asks for. */
export function glStack(env = process.env) {
  const g = String(env.APEX_GL || env.GL || "").toLowerCase();
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
  if (glStack(env) === "llvmpipe") {
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
