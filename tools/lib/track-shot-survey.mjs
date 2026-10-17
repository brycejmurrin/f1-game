// track-shot-survey.mjs — plan + index for multi-shot track scenery surveys (apex_shot_survey / apex_track op survey).
// @doc Shot-survey plans: presets, resume filters, findings/progress JSON, HTML galleries (apex-extras / shot-survey).
// @skill survey-track
import fs from "node:fs";
import path from "node:path";
import { cameraControls, scenarioShots } from "./survey-scenarios.mjs";
import zlib from "node:zlib";

const CAMS = new Set(["park", "eye", "orbit", "cinematic", "trackside"]);
const TODS = new Set(["day", "dusk", "dawn", "night"]);
const WEATHERS = new Set(["dry", "wet", "rain", "overcast", "fog"]);
/** null = leave the session's weather as it is (track-session's contract). */
const normWeather = (w, where) => {
  if (w == null || w === "") return null;
  if (!WEATHERS.has(String(w))) throw new Error(`${where} invalid (${[...WEATHERS].join("|")})`);
  return String(w);
};
const NAME_RE = /^[A-Za-z0-9._-]{1,80}$/;
export const MAX_SURVEY_SHOTS = 32;
export const MAX_SURVEY_TRACKS = 12;

/** Rough wall-clock estimate used to choose sync vs async (job) path. */
export const SURVEY_BOOT_MS = 30000;
export const SURVEY_SHOT_MS = 15000;
/** Above this estimate, apex_shot_survey defaults to async (job) unless async:false.
 *  Tuned under Cursor's ~60 s MCP cancel: even a 4-cell "quick" pass should job. */
export const SURVEY_ASYNC_MS = 60000;

/** Evenly spaced lap fractions in [0, 1), never duplicating start/finish. */
export function linspaceFracs(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 1 || n > MAX_SURVEY_SHOTS) {
    throw new Error(`count must be 1..${MAX_SURVEY_SHOTS}`);
  }
  if (n === 1) return [0.5];
  return Array.from({ length: n }, (_, i) => +((i / n).toFixed(4)));
}

export const SURVEY_PRESETS = {
  /** Fast explore: 4 orbit cells. */
  quick: { count: 4, cam: ["orbit"], el: 22, dist: 45, az: 45, tod: "day" },
  /** Dual-lite: 4 fracs × orbit+trackside = 8 cells. */
  dual_lite: { count: 4, cam: ["orbit", "trackside"], el: 20, dist: 42, az: 45, tod: "day" },
  /** Night lighting pass: 6 orbit cells at night. */
  night_pass: { count: 6, cam: ["orbit"], el: 18, dist: 40, az: 45, tod: "night" },
  /** Default scenery pass: orbit every ~1/12 lap. */
  scenery: { count: 12, cam: ["orbit"], el: 22, dist: 45, az: 45, tod: "day" },
  /** Alias for scenery (agents asking for a "full" pass). */
  full: { count: 12, cam: ["orbit"], el: 22, dist: 45, az: 45, tod: "day" },
  /** Quarter-lap anchors. */
  lap: { fracs: [0, 0.25, 0.5, 0.75], cam: ["orbit"], el: 22, dist: 45, az: 45, tod: "day" },
  /** Orbit + trackside at the same fractions (max 16 fracs → 32 cells). */
  dual: { count: 8, cam: ["orbit", "trackside"], el: 20, dist: 42, az: 45, tod: "day" },
  /** Driver eye + orbit for prop/gap spotting (8 fracs × 2 cams). */
  inspect: { count: 8, cam: ["eye", "orbit"], el: 18, dist: 40, az: 45, tod: "day" },
};

export const SURVEY_PRESET_KEYS = Object.keys(SURVEY_PRESETS);

function pctTag(frac) {
  return String(Math.round(Number(frac) * 100)).padStart(2, "0");
}

function normCam(v) {
  const cams = Array.isArray(v) ? v : v == null || v === "" ? ["orbit"] : [v];
  for (const c of cams) {
    if (!CAMS.has(String(c))) throw new Error(`cam must be one of ${[...CAMS].join("|")}`);
  }
  return cams.map(String);
}

function normFracs(raw) {
  if (!Array.isArray(raw) || raw.length < 1) throw new Error("fracs must be a non-empty array");
  if (raw.length > MAX_SURVEY_SHOTS) throw new Error(`fracs max ${MAX_SURVEY_SHOTS}`);
  const out = raw.map((v) => Number(v));
  if (!out.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error("fracs must be numbers in 0..1");
  return out;
}

function normLabel(label) {
  const s = String(label || "survey").trim();
  if (!NAME_RE.test(s)) throw new Error("label must match [A-Za-z0-9._-]{1,80}");
  return s;
}

/** Normalize track | tracks[] into a deduped list (1..MAX_SURVEY_TRACKS). */
export function normalizeSurveyTracks(args = {}, known = null) {
  let raw = [];
  if (Array.isArray(args.tracks) && args.tracks.length) raw = args.tracks.map(String);
  else if (args.track != null && args.track !== "") raw = [String(args.track)];
  if (!raw.length) throw new Error("track or tracks[] required");
  if (raw.length > MAX_SURVEY_TRACKS) throw new Error(`tracks max ${MAX_SURVEY_TRACKS}`);
  const seen = new Set();
  const out = [];
  for (const id of raw) {
    if (!/^[a-z0-9_]{2,40}$/.test(id)) throw new Error(`bad track id ${id}`);
    if (known && !known.includes(id)) throw new Error(`unknown track ${id}`);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Two cells with one name write and replace ONE image, so a gallery would count a single final view twice
 *  (`fracs:[.101,.104]` both round to `-10-`; #1982). Reject at plan time, naming the colliding fracs. */
export function assertUniqueShotNames(shots) {
  const by = new Map();
  for (const s of shots) by.set(s.name, [...(by.get(s.name) || []), s.frac]);
  const dup = [...by].filter(([, fr]) => fr.length > 1);
  if (dup.length) {
    throw new Error(`survey cells share a name and would overwrite one image: ${dup.map(([n, fr]) => `${n} (fracs ${fr.join(", ")})`).join("; ")}`
      + " — space the fracs further apart (names round to 1 %) or give shots[] explicit unique names");
  }
  return shots;
}

/** Machine-readable plan for a survey run (no I/O). */
export function buildTrackShotSurveyPlan(args = {}) {
  if (!args.location && (args.angles || args.weathers || args.camera)) throw new Error("angles/weathers/camera require a named location");
  if (args.location) args = { ...args, preset: "custom", shots: scenarioShots(args) };
  const label = normLabel(args.label ?? args.prefix ?? "survey");
  const presetKey = args.preset == null || args.preset === "" ? "scenery" : String(args.preset);
  const presetDef = presetKey === "custom" ? null : SURVEY_PRESETS[presetKey];
  if (presetKey !== "custom" && !presetDef) {
    throw new Error(`preset must be custom or one of ${SURVEY_PRESET_KEYS.join(", ")}`);
  }

  if (Array.isArray(args.shots) && args.shots.length) {
    const shots = args.shots.map((s, i) => {
      const name = s.name ? normLabel(s.name) : `${label}-${i + 1}`;
      const cam = String(s.cam || "orbit");
      if (!CAMS.has(cam)) throw new Error(`shots[${i}].cam invalid`);
      const frac = Number(s.frac ?? 0.5);
      if (!(frac >= 0 && frac <= 1)) throw new Error(`shots[${i}].frac must be 0..1`);
      const tod = String(s.tod || "day");
      if (!TODS.has(tod)) throw new Error(`shots[${i}].tod invalid`);
      return {
        name,
        frac,
        cam,
        tod,
        weather: normWeather(s.weather ?? args.weather, `shots[${i}].weather`),
        az: s.az == null ? 45 : Number(s.az),
        el: s.el == null ? 22 : Number(s.el),
        dist: s.dist == null ? 45 : Number(s.dist),
        h: s.h == null ? null : Number(s.h),
        side: s.side == null ? 1 : Number(s.side),
        hud: !!s.hud,
        ...cameraControls(s),
        ...(s.location ? { location: s.location, angle: s.angle, verification: s.verification } : {}),
      };
    });
    if (shots.length > MAX_SURVEY_SHOTS) throw new Error(`shots max ${MAX_SURVEY_SHOTS}`);
    assertUniqueShotNames(shots);
    return {
      preset: presetKey,
      label,
      sheetName: normLabel(args.sheetName ?? `${label}-panel`),
      cols: Number(args.cols) || 0,
      shots,
    };
  }

  let fracs;
  if (args.fracs != null) fracs = normFracs(args.fracs);
  else if (presetDef?.fracs) fracs = normFracs(presetDef.fracs);
  else {
    const count = args.count ?? presetDef?.count ?? 12;
    fracs = linspaceFracs(count);
  }

  const cams = normCam(args.cam ?? args.cams ?? presetDef?.cam);
  const tod = String(args.tod ?? presetDef?.tod ?? "day");
  if (!TODS.has(tod)) throw new Error("tod invalid");
  const weather = normWeather(args.weather, "weather");

  const shots = [];
  for (const frac of fracs) {
    for (const cam of cams) {
      const pct = pctTag(frac);
      shots.push({
        name: `${label}-${pct}-${cam}`,
        frac,
        cam,
        tod,
        weather,
        az: args.az == null ? (presetDef?.az ?? 45) : Number(args.az),
        el: args.el == null ? (presetDef?.el ?? 22) : Number(args.el),
        dist: args.dist == null ? (presetDef?.dist ?? 45) : Number(args.dist),
        h: args.h == null ? null : Number(args.h),
        side: args.side == null ? 1 : Number(args.side),
        hud: !!args.hud,
      });
    }
  }
  if (shots.length > MAX_SURVEY_SHOTS) {
    throw new Error(`survey would take ${shots.length} shots (max ${MAX_SURVEY_SHOTS}); lower count or use one cam`);
  }
  assertUniqueShotNames(shots);

  return {
    preset: presetKey,
    label,
    sheetName: normLabel(args.sheetName ?? `${label}-panel`),
    cols: Number(args.cols) || 0,
    shots,
  };
}

/** Wall-clock estimate for one or more tracks (same shot plan per track). */
export function estimateSurveyMs(shotCount, trackCount = 1) {
  const n = Math.max(0, Number(shotCount) || 0);
  const t = Math.max(1, Number(trackCount) || 1);
  return t * (SURVEY_BOOT_MS + n * SURVEY_SHOT_MS);
}

/** Prefer async (job) when multi-track or long estimate, unless async:false. */
export function shouldSurveyAsync(args = {}, plan, trackCount = 1) {
  if (args.async === false) return false;
  if (args.async === true) return true;
  const shots = plan?.shots?.length ?? 0;
  return trackCount > 1 || estimateSurveyMs(shots, trackCount) >= SURVEY_ASYNC_MS;
}

export function shotPngPath(outDir, name) {
  return path.join(outDir, `${name}.png`);
}

/** Split planned shots into already-on-disk (resume) vs still needed. */
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Structural PNG check (signature, IHDR with a real size, every chunk's CRC, a closing IEND). Existence is not
 *  evidence: a truncated or text-filled file used to count as a finished cell on resume (#1982). Pixels are not
 *  decoded; that stays the capture's own spread/kb score. -> null when sound, else the reason. */
export function pngProblem(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { return `unreadable (${e.code || e.message})`; }
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return "not a PNG (bad signature)";
  let off = 8, first = true, sawEnd = false;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (off + 12 + len > buf.length) return `truncated in a ${type} chunk`;
    if (first && (type !== "IHDR" || len !== 13)) return "first chunk is not IHDR";
    if (first && (buf.readUInt32BE(off + 8) < 1 || buf.readUInt32BE(off + 12) < 1)) return "zero-size image";
    first = false;
    if (zlib.crc32(buf.subarray(off + 4, off + 8 + len)) !== buf.readUInt32BE(off + 8 + len)) return `bad CRC in a ${type} chunk`;
    off += 12 + len;
    if (type === "IEND") { sawEnd = true; break; }
  }
  return sawEnd ? null : "no IEND chunk (truncated)";
}

/** Split a plan into cells to capture and cells already on disk. A cell only counts as resumed when its PNG is
 *  structurally sound; an unsound one is listed in `invalid` (with why) and recaptured. */
export function filterResumeShots(outDir, shots, resume = false, context = null) {
  if (!resume) return { pending: shots.slice(), resumed: [], invalid: [] };
  const pending = [];
  const resumed = [];
  const invalid = [];
  for (const s of shots) {
    const png = context?.extension ? path.join(outDir, `${s.name}.${context.extension}`) : shotPngPath(outDir, s.name);
    let matches = !context;
    if (context) { try { matches = JSON.parse(fs.readFileSync(png + ".capture.json", "utf8")).identity === context.identities[s.name]; } catch {} }
    if (!fs.existsSync(png)) { pending.push(s); continue; }
    // An unsound PNG is recaptured whatever its receipt says (#1982); other formats (preview JPEG) are judged by identity alone.
    const why = png.endsWith(".png") ? pngProblem(png) : null;
    if (why) { invalid.push({ name: s.name, reason: why }); pending.push(s); }
    else if (matches) resumed.push({ ...s, png, resumed: true });
    else pending.push(s);
  }
  return { pending, resumed, invalid };
}

/** Heuristic flags for a captured cell (spread/kb from track-session). */
export function scoreShotFindings(shot = {}) {
  const flags = [];
  const spread = Number(shot.spread);
  const kb = Number(shot.kb);
  if (Number.isFinite(spread) && spread < 5) flags.push("low_spread");
  if (Number.isFinite(spread) && spread < 2) flags.push("near_blank");
  if (Number.isFinite(kb) && kb < 80) flags.push("tiny_png");
  if (Number.isFinite(kb) && kb > 2500) flags.push("huge_png");
  return flags;
}

export function writeSurveyProgress(outDir, progress) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "progress.json");
  fs.writeFileSync(file, JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }, null, 2) + "\n");
  return file;
}

/** The one terminal state the CLI and the MCP adapter both write to progress.json. The adapter used to write
 *  "done" unconditionally and then answer ok:false, so a poller saw success for a run whose shots failed (#1983). */
export function surveyTerminalState(trackResults = [], hardFail = false) {
  const bad = hardFail || trackResults.some((t) => t.error || t.failed > 0 || !(t.captured > 0 || t.skipped));
  return bad ? "failed" : "done";
}

export function writeSurveyFindings(outDir, meta) {
  fs.mkdirSync(outDir, { recursive: true });
  const shots = (meta.shots || []).map((s) => {
    const flags = s.flags || scoreShotFindings(s);
    return { ...s, flags };
  });
  const flagged = shots.filter((s) => (s.flags || []).length);
  const body = {
    ok: meta.ok !== false,
    track: meta.track,
    tracks: meta.tracks,
    label: meta.label,
    preset: meta.preset,
    captured: shots.length,
    flagged: flagged.length,
    shots,
    panel: meta.panelPng || null,
    indexHtml: meta.indexHtml || null,
    writtenAt: new Date().toISOString(),
  };
  const file = path.join(outDir, "findings.json");
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
  return { file, findings: body };
}

/** Static HTML gallery beside the PNGs (relative img paths). */
export function writeSurveyIndex(outDir, meta) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const rows = (meta.shots || []).map((s) => {
    const file = `${esc(s.name)}.png`;
    const cap = `${s.name} · ${s.track || meta.track} · frac ${s.frac} · ${s.cam} · ${s.tod}${s.weather ? ` · ${s.weather}` : ""}`;
    return `<figure><a href="${file}"><img src="${file}" loading="lazy" alt="${esc(cap)}"></a><figcaption>${esc(cap)}</figcaption></figure>`;
  }).join("\n");
  const panel = meta.panelPng ? `<p>Panel: <a href="${esc(path.basename(meta.panelPng))}">${esc(path.basename(meta.panelPng))}</a></p>` : "";
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(meta.track || "track")} shot survey</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:1rem;background:#14161c;color:#e6e9ef}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
figure{margin:0} img{width:100%;height:auto;border-radius:4px;background:#000}
figcaption{font:11px/1.3 monospace;margin-top:4px;color:#9aa3b2}
</style></head><body>
<h1>${esc(meta.track || "")} — ${esc(meta.label || "survey")}</h1>
<p>${meta.ok ?? meta.shots?.length ?? 0} shot(s), preset ${esc(meta.preset || "custom")}. ${panel}</p>
<div class="grid">${rows}</div>
</body></html>`;
  const file = path.join(outDir, "index.html");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, html);
  return file;
}

/** Multi-track compare gallery (relative paths into per-track dirs). */
export function writeCompareIndex(outDir, meta) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const tracks = meta.tracks || [];
  const sections = tracks.map((t) => {
    const rel = esc(t.relIndex || `${t.track}/index.html`);
    const panel = t.panel ? `<p><a href="${esc(t.panel)}">${esc(path.basename(t.panel))}</a></p>` : "";
    return `<section><h2><a href="${rel}">${esc(t.track)}</a> — ${t.captured ?? 0} shot(s)</h2>${panel}</section>`;
  }).join("\n");
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>compare shot survey</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:1rem;background:#14161c;color:#e6e9ef}
a{color:#8ec7ff} section{margin:1rem 0;padding:0.75rem 0;border-bottom:1px solid #2a2f3a}
</style></head><body>
<h1>compare — ${esc(meta.label || "survey")}</h1>
<p>preset ${esc(meta.preset || "custom")}; ${tracks.length} track(s).</p>
${sections}
</body></html>`;
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "index.html");
  fs.writeFileSync(file, html);
  return file;
}
