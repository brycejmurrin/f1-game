// @doc Pure helpers for shot.mjs: CLI/batch job parse, output format, track grouping.
import { readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { assertSafePathToken, resolveRepoDefault } from "../lib/output-paths.mjs";

const CAMS = new Set(["park", "eye", "orbit", "cinematic", "trackside"]);

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
  const showHud = !!(raw.hud ?? raw.showHud ?? defaults.showHud);
  const team = raw.team ?? defaults.team ?? null;
  const jpegFlag = !!(raw.jpeg ?? defaults.jpeg);
  let out = raw.out ? resolve(String(raw.out)) : null;
  const fmtHint = out ? imageFormatFor(out, { jpegFlag }) : imageFormatFor("", { jpegFlag: jpegFlag || !!defaults.jpeg });
  if (!out) {
    out = defaultOutPath(defaults.ROOT, { trackId, frac, cam, type: fmtHint.type });
  }
  const format = imageFormatFor(out, { jpegFlag: jpegFlag || fmtHint.type === "jpeg" });
  return {
    trackId, frac, cam, az, el, dist, side, tod, showHud, team, out,
    type: format.type,
    quality: format.quality,
    raster: !!(raw.raster ?? defaults.raster),
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
  const batchPath = flag(argv, "--batch", null);
  const raster = has(argv, "--raster");
  const jpeg = has(argv, "--jpeg");
  const TEAM = flag(argv, "--team", null);
  const WAIT_MS = Math.max(5, parseFloat(flag(argv, "--wait", "120"))) * 1000;
  const defaults = {
    ROOT,
    az: flag(argv, "--az", "45"),
    el: flag(argv, "--el", "18"),
    dist: flag(argv, "--dist", "45"),
    side: flag(argv, "--side", "1"),
    tod: flag(argv, "--tod", "day"),
    showHud: has(argv, "--hud"),
    team: TEAM,
    jpeg,
    raster,
  };

  if (batchPath) {
    const jobs = loadBatchFile(resolve(batchPath)).map((raw) => normalizeJob(raw, defaults));
    if (!jobs.length) throw new Error("batch file has no jobs");
    return { mode: "batch", jobs, waitMs: WAIT_MS, team: TEAM, raster };
  }

  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      if (argv[i] !== "--hud" && argv[i] !== "--jpeg" && argv[i] !== "--raster"
        && i + 1 < argv.length && !argv[i + 1].startsWith("--")) i++;
      continue;
    }
    positionals.push(argv[i]);
  }
  const [trackId = "monza", fracArg = "0.1", cam = "orbit", outArg] = positionals;
  const job = normalizeJob({
    trackId, frac: fracArg, cam, out: outArg || undefined,
  }, defaults);
  return { mode: "single", jobs: [job], waitMs: WAIT_MS, team: TEAM, raster };
}

/** Stable order: same track consecutive so race() runs once per track. */
export function groupJobsByTrack(jobs) {
  const order = [];
  const map = new Map();
  for (const j of jobs) {
    if (!map.has(j.trackId)) {
      map.set(j.trackId, []);
      order.push(j.trackId);
    }
    map.get(j.trackId).push(j);
  }
  return order.map((id) => ({ trackId: id, jobs: map.get(id) }));
}

export const SHOT_USAGE = `usage: node tools/shot/shot.mjs <trackId> <frac> [cam] [out.png|out.jpg]
       node tools/shot/shot.mjs --batch <jobs.json|jsonl> [--jpeg] [--raster] [--wait S]
  One Chromium boot; --batch reuses the race() per track (many frames without relaunch).
  cam: park | eye | orbit | cinematic | trackside.
  --jpeg / .jpg → JPEG q85 (human review). --raster → __apex.render view only (no PNG).
  Default out: scratch/captures/playwright-probe/<track>-<frac%>-<cam>.png`;
