/* perf-frametime.mjs — shared scenario, percentile math, and baseline compare
 * for tests/specs/perf-frametime.spec.js (SwiftShader frame-cost regression lane).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = path.join(HERE, "..", "data", "perf-frametime-baseline.json");

/** Fixed scenario — every run must match this or the baseline is not comparable. */
export const SCENARIO = {
  track: "monza",
  tod: "night",
  wx: "clear",
  seed: 4242,
  startFrac: 0.002,
  gfxPreset: "high",
  viewport: { width: 844, height: 390 },
  warmMs: 5000,
  sampleMs: 20000,
  renderScale: 1,
};

/** Soft report vs strict fail: only large swings trip strict mode. */
export const REGRESSION = {
  p50Ratio: 1.2,
  p95Ratio: 1.25,
  p99Ratio: 1.35,
  longTasksDelta: 8,
  heapRatio: 1.3,
};

export const STRICT = process.env.APEX_PERF_FRAMETIME_STRICT === "1"
  || process.env.APEX_PERF_STRICT === "1";

export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return +sorted[i].toFixed(3);
}

export function summariseFrameMs(samples) {
  const s = samples.filter((x) => x > 0 && x < 2000).sort((a, b) => a - b);
  if (s.length < 5) {
    return { ok: false, reason: "insufficient_frames", frames: s.length };
  }
  return {
    ok: true,
    frames: s.length,
    p50: quantile(s, 0.5),
    p95: quantile(s, 0.95),
    p99: quantile(s, 0.99),
    max: quantile(s, 1),
  };
}

/** What a frame time depends on beyond the scenario: two runs that differ in
 *  any of these measure different machines, so a ratio between them is noise. */
export const ENV_KEYS = ["renderer", "api", "adapter", "browser", "viewport"];

/** The page-side env read, run as `page.evaluate(readPageEnv)`: self-contained
 *  (Playwright ships its source text, so it may not touch this module's scope).
 *  `api` is the BOUND backend's own account via `__apex.lifecycle().api`; the
 *  bare `gfx` this used to read is not a page global (the module is `Gfx`, the
 *  picker; the bound backend lives on G), so every CI run recorded `api: null`
 *  and no baseline could ever match on it. `w` is the window; a unit test
 *  passes a fake. The adapter comes from a throwaway canvas: a GL sniff on
 *  #game would bind it (__apex.diag's trap). */
export function readPageEnv(w = globalThis) {
  const safe = (fn) => { try { return fn(); } catch (_) { return null; } };
  const meta = (name) => safe(() => (w.document.querySelector(`meta[name="${name}"]`) || {}).content || null);
  // A script-level `const` is a global binding, not a window property: read it bare in the page, from `w` in a test.
  // eslint-disable-next-line no-undef
  const rp = w.RendererPicker || safe(() => (typeof RendererPicker !== "undefined" ? RendererPicker : null));
  const life = safe(() => (w.__apex && typeof w.__apex.lifecycle === "function" ? w.__apex.lifecycle() : null));
  const adapter = safe(() => {
    const gl = w.document.createElement("canvas").getContext("webgl2");
    if (!gl) return null;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return name;
  });
  return {
    build: meta("apex-build"),
    sha: meta("apex-sha"),
    renderer: safe(() => (rp && rp.liveBackend && rp.liveBackend()) || w.sessionStorage.getItem("apex26.gfxBound")),
    api: life && typeof life.api === "string" ? life.api : null,
    adapter,
    userAgent: safe(() => w.navigator.userAgent),
    viewport: { width: w.innerWidth, height: w.innerHeight, dpr: w.devicePixelRatio },
  };
}

/** The run's environment in the compared shape: browser by name and major
 *  version, viewport as "WxH@dpr"; a field the page could not read is null. */
export function envOf(raw) {
  const r = raw || {};
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const m = str(r.browserVersion) && /^(\d+)/.exec(r.browserVersion);
  const vp = r.viewport && r.viewport.width > 0 && r.viewport.height > 0
    ? `${r.viewport.width}x${r.viewport.height}@${r.viewport.dpr || 1}` : str(r.viewport);
  return {
    renderer: str(r.renderer), api: str(r.api), adapter: str(r.adapter),
    browser: str(r.browser) ? str(r.browser) + (m ? " " + m[1] : "") : null, viewport: vp,
  };
}

/** Field-by-field mismatches between this run's env and the baseline's; a
 *  field missing on either side is a mismatch (unknown is not "the same"). */
export function envMismatches(env, baselineEnv) {
  const out = [];
  for (const k of ENV_KEYS) {
    const a = env && env[k], b = baselineEnv && baselineEnv[k];
    if (a == null) out.push(`${k}: this run records none`);
    else if (b == null) out.push(`${k}: the baseline records none`);
    else if (a !== b) out.push(`${k}: ${a} vs baseline ${b}`);
  }
  return out;
}

/** outcome: "pass" | "regressed" | "not-comparable" (a different renderer,
 *  adapter, browser or viewport — or one side unrecorded — compares nothing).
 *  @returns {{ outcome: string, mismatches: string[], regressions: string[], deltas: object }} */
export function compareToBaseline(measured, baseline, env) {
  const regressions = [];
  const mismatches = envMismatches(env, baseline.env);
  const report = { scenario: SCENARIO, measured, baseline: baseline.metrics, env: env || null, baselineEnv: baseline.env || null, deltas: {}, mismatches };
  if (mismatches.length) { report.outcome = "not-comparable"; report.regressions = regressions; return report; }

  const ratio = (key) => {
    const b = baseline.metrics[key];
    const m = measured[key];
    if (b == null || m == null || !(b > 0)) return null;
    return m / b;
  };

  for (const key of ["p50", "p95", "p99"]) {
    const r = ratio(key);
    if (r != null) {
      report.deltas[key] = +r.toFixed(4);
      const cap = REGRESSION[`${key}Ratio`];
      if (r > cap) regressions.push(`${key} ${measured[key]}ms > ${(cap * 100 - 100).toFixed(0)}% vs baseline ${baseline.metrics[key]}ms (ratio ${r.toFixed(3)})`);
    }
  }

  if (baseline.metrics.longTasks != null && measured.longTasks != null) {
    const d = measured.longTasks - baseline.metrics.longTasks;
    report.deltas.longTasks = d;
    if (d > REGRESSION.longTasksDelta) {
      regressions.push(`longTasks +${d} vs baseline ${baseline.metrics.longTasks} (cap +${REGRESSION.longTasksDelta})`);
    }
  }

  if (baseline.metrics.heapUsedMB != null && measured.heapUsedMB != null && baseline.metrics.heapUsedMB > 0) {
    const r = measured.heapUsedMB / baseline.metrics.heapUsedMB;
    report.deltas.heapUsedMB = +r.toFixed(4);
    if (r > REGRESSION.heapRatio) {
      regressions.push(`heap ${measured.heapUsedMB}MB > ${(REGRESSION.heapRatio * 100 - 100).toFixed(0)}% vs baseline ${baseline.metrics.heapUsedMB}MB`);
    }
  }

  report.regressions = regressions;
  report.outcome = regressions.length ? "regressed" : "pass";
  return report;
}

export function writeArtifact(dir, payload) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "perf-frametime.json");
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
  return file;
}

export function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}
