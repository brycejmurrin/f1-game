// @doc Pure helpers for shot.mjs: CLI/batch job parse, output format, track grouping.
import { readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { assertSafePathToken, resolveRepoDefault } from "../lib/output-paths.mjs";

import { parseCaptureOptions, captureViewport, captureScreenshotOptions } from "./capture-options.mjs";

const CAMS = new Set(["park", "eye", "orbit", "cinematic", "trackside"]);
export const WEATHERS = ["dry", "wet", "rain", "overcast", "fog"];

export function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) return fallback;
  return argv[i + 1];
}

export function has(argv, name) {
  return argv.includes(name);
}

/** Infer capture type from path / --jpeg. JPEG is for human review; PNG for diffs. */
export function imageFormatFor(outPath, { jpegFlag = false } = {}) {
  const ext = extname(String(outPath || "")).toLowerCase();
  if (jpegFlag || ext === ".jpg" || ext === ".jpeg") {
    return { type: "jpeg", quality: 85 };
  }
  return { type: "png", quality: undefined };
}

export function defaultOutPath(ROOT, { trackId, frac, cam, type = "png" }) {
  const safeTrackId = assertSafePathToken(trackId, "track id");
  const safeCam = assertSafePathToken(cam, "camera");
  const ext = type === "jpeg" ? "jpg" : "png";
  return resolveRepoDefault(
    ROOT,
    "scratch",
    "captures",
    "playwright-probe",
    `${safeTrackId}-${Math.round(frac * 100)}-${safeCam}.${ext}`,
  );
}

/**
 * One capture job. Defaults match the historical single-shot CLI.
 */
export function normalizeJob(raw, defaults = {}) {
  const trackId = assertSafePathToken(String(raw.trackId ?? raw.track ?? defaults.trackId ?? "monza"), "track id");
  const cam = assertSafePathToken(String(raw.cam ?? defaults.cam ?? "orbit"), "camera");
  if (!CAMS.has(cam)) throw new Error(`unknown cam "${cam}" — park|eye|orbit|cinematic|trackside`);
  const frac = parseFloat(raw.frac ?? defaults.frac ?? 0.1);
  if (!Number.isFinite(frac)) throw new Error(`bad frac: ${raw.frac}`);
  const az = parseFloat(raw.az ?? defaults.az ?? 45);
  const el = parseFloat(raw.el ?? defaults.el ?? 18);
  const dist = parseFloat(raw.dist ?? defaults.dist ?? 45);
  const side = parseInt(raw.side ?? defaults.side ?? 1, 10) || 1;
  const tod = String(raw.tod ?? defaults.tod ?? "day");
  const weather = String(raw.weather ?? defaults.weather ?? "dry");
  if (!WEATHERS.includes(weather)) throw new Error(`unknown weather "${weather}" — ${WEATHERS.join("|")}`);
  const showHud = !!(raw.hud ?? raw.showHud ?? defaults.showHud);
  const team = raw.team ?? defaults.team ?? null;
  const baseCapture = defaults.capture || parseCaptureOptions([]);
  const captureArgs = ["--profile", String(raw.profile ?? baseCapture.profile)];
  for (const key of ["width", "height", "dpr", "scope", "gpu", "browser", "type", "quality", "seed"]) {
    const value = raw[key] ?? (raw.profile == null ? baseCapture[key] : key === "width" || key === "height" || key === "type" || key === "quality" ? null : baseCapture[key]);
    if (value != null) captureArgs.push(`--${key}`, String(value));
  }
  if (raw.isolated ?? baseCapture.isolated) captureArgs.push("--isolated");
  const capture = parseCaptureOptions(captureArgs);
  capture.gpuExplicit = raw.gpu != null || baseCapture.gpuExplicit;
  const viewport = captureViewport(capture, { width: 1280, height: 720 });
  const backend = String(raw.backend ?? defaults.backend ?? "three");
  if (!["three", "webgl2", "webgpu"].includes(backend)) throw new Error(`unknown backend "${backend}"`);
  if (!["day", "dusk", "dawn", "night"].includes(tod)) throw new Error(`unknown time of day "${tod}"`);
  const jpegFlag = !!(raw.jpeg ?? defaults.jpeg);
  let out = raw.out ? resolve(String(raw.out)) : null;
  const fmtHint = capture.type ? captureScreenshotOptions(capture) : out ? imageFormatFor(out, { jpegFlag }) : imageFormatFor("", { jpegFlag: jpegFlag || !!defaults.jpeg });
  if (!out) {
    out = defaultOutPath(defaults.ROOT, { trackId, frac, cam, type: fmtHint.type });
  }
  const format = capture.type ? captureScreenshotOptions(capture) : imageFormatFor(out, { jpegFlag: jpegFlag || fmtHint.type === "jpeg" });
  return {
    trackId, frac, cam, az, el, dist, side, tod, weather, showHud, team, out, backend, capture, viewport,
    type: format.type,
    quality: format.type === "jpeg" ? capture.quality ?? format.quality ?? 85 : undefined,
    raster: !!(raw.raster ?? defaults.raster),
    // orbit / cinematic / trackside re-site the eye out of scenery (__apex opts.clear, #2253); opt-in so
    // existing shots and survey baselines keep their framing.
    clear: !!(raw.clear ?? defaults.clear),
  };
}

/** Parse --batch file: JSON array, `{jobs:[…]}`, or JSONL (one object per line). */
export function loadBatchFile(path) {
  const text = readFileSync(path, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Whole-file JSON first — a JSONL file of `{…}` lines fails this parse.
  try {
    const data = JSON.parse(trimmed);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.jobs)) return data.jobs;
    throw new Error("batch JSON must be an array or { jobs: [...] }");
  } catch (e) {
    if (/batch JSON must/.test(e.message)) throw e;
  }
  return trimmed.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).map((l, i) => {
    try { return JSON.parse(l); }
    catch (e) { throw new Error(`batch JSONL line ${i + 1}: ${e.message}`); }
  });
}

/** Single-shot positionals + flags → one job. */
export function parseShotArgv(argv, ROOT) {
  const capture = parseCaptureOptions(argv);
  argv = capture.positionals;
  const batchPath = flag(argv, "--batch", null);
  const raster = has(argv, "--raster");
  const jpeg = has(argv, "--jpeg");
  const TEAM = flag(argv, "--team", null);
  const WAIT_MS = Math.max(5, parseFloat(flag(argv, "--wait", "120"))) * 1000;
  const defaults = {
    ROOT, capture, backend: flag(argv, "--backend", "three"),
    az: flag(argv, "--az", "45"),
    el: flag(argv, "--el", "18"),
    dist: flag(argv, "--dist", "45"),
    side: flag(argv, "--side", "1"),
    tod: flag(argv, "--tod", "day"),
    weather: flag(argv, "--weather", "dry"),
    showHud: has(argv, "--hud"),
    team: TEAM,
    jpeg,
    raster,
    clear: has(argv, "--clear"),
  };

  if (batchPath) {
    const jobs = loadBatchFile(resolve(batchPath)).map((raw) => normalizeJob(raw, defaults));
    if (!jobs.length) throw new Error("batch file has no jobs");
    return { mode: "batch", jobs, waitMs: WAIT_MS, team: TEAM, raster, capture };
  }

  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      if (argv[i] !== "--hud" && argv[i] !== "--jpeg" && argv[i] !== "--raster" && argv[i] !== "--clear"
        && i + 1 < argv.length && !argv[i + 1].startsWith("--")) i++;
      continue;
    }
    positionals.push(argv[i]);
  }
  const [trackId = "monza", fracArg = "0.1", cam = "orbit", outArg] = positionals;
  const job = normalizeJob({
    trackId, frac: fracArg, cam, out: outArg || undefined,
  }, defaults);
  return { mode: "single", jobs: [job], waitMs: WAIT_MS, team: TEAM, raster, capture };
}

/** Team/backend/viewport boundaries require a fresh isolated browser context. */
export function shotSessionKey(job) {
  return JSON.stringify([job.team ?? null, job.backend ?? "three", job.viewport?.width ?? 1280,
    job.viewport?.height ?? 720, job.capture?.dpr ?? 1, job.capture?.profile ?? "custom", job.capture?.seed ?? null]);
}

/** Stable grouping keeps compatible scenes warm without changing another team's boot. */
export function groupJobsByTrack(jobs) {
  const order = [];
  const map = new Map();
  for (const [index, j] of jobs.entries()) {
    const key = JSON.stringify([shotSessionKey(j), j.trackId, j.tod, j.weather ?? "dry", j.capture?.isolated ? index : null]);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(j);
  }
  return order.map((key) => ({ trackId: map.get(key)[0].trackId, sessionKey: shotSessionKey(map.get(key)[0]), jobs: map.get(key) }));
}

export const SHOT_USAGE = `usage: node tools/shot/shot.mjs <trackId> <frac> [cam] [out.png|out.jpg]
       node tools/shot/shot.mjs --batch <jobs.json|jsonl> [--jpeg] [--raster] [--wait S]
  One Chromium boot; --batch groups compatible track/team/tod/weather/backend/viewport jobs.
  --tod day|dusk|dawn|night --weather dry|wet|rain|overcast|fog (batch fields tod/weather)
  --profile preview|comparison --width N --height N --dpr N --scope scene|page
  --gpu swiftshader|llvmpipe|hardware|lavapipe --browser auto|chromium|shell
  --backend three|webgl2|webgpu --trace[=path] --cache-assets --isolated --seed N
  cam: park | eye | orbit | cinematic | trackside.
  --clear: orbit/cinematic/trackside re-site the eye out of scenery (batch field clear).
  --jpeg / .jpg → JPEG q85 (human review). --raster → __apex.render view only (no PNG).
  Default out: scratch/captures/playwright-probe/<track>-<frac%>-<cam>.png`;
