// track-shot-survey.mjs — plan + index for multi-shot track scenery surveys (apex_shot_survey / apex_track op survey).
// @doc Shot-survey plans: presets, resume filters, findings/progress JSON, HTML galleries (apex-extras / shot-survey).
// @skill survey-track
import fs from "node:fs";
import { escapeHtml as galleryEscape, screenshotCard, renderGallery } from "./screenshot-gallery.cjs";
import path from "node:path";
import { cameraControls, scenarioShots } from "./survey-scenarios.mjs";

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
    if (!/^(?:[a-z0-9_]{2,40}|custom-[a-f0-9]{8})$/.test(id)) throw new Error(`bad track id ${id}`);
    if (known && !known.includes(id)) throw new Error(`unknown track ${id}`);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Partition circuit-qualified targets before any browser is started. */
export function buildSurveyPlans(args, tracks) {
  if (args.locations && (!Array.isArray(args.locations) || !args.locations.length || args.locations.length > 32 || new Set(args.locations).size !== args.locations.length)) throw new Error('locations must contain 1..32 unique ids');
  if (args.locations && tracks.length > 1) for (const id of args.locations) {
    if (typeof id !== 'string' || !tracks.some(track => id.startsWith(track + '/'))) throw new Error('Location does not match a selected track: ' + id);
  }
  const plans = new Map(tracks.map(track => {
    const locations = args.locations?.filter(id => tracks.length === 1 || id.startsWith(track + '/'));
    if (locations && !locations.length) throw new Error('No locations selected for ' + track);
    return [track, buildTrackShotSurveyPlan({ ...args, track, ...(locations ? { locations, tracks: [track] } : {}) })];
  }));
  if (args.select) {
    if (!Array.isArray(args.select) || !args.select.length || args.select.length > 32) throw new Error('select must contain 1..32 shot names');
    const names = new Set(args.select);
    for (const name of names) if (![...plans.values()].some(p => p.shots.some(s => s.name === name))) throw new Error('Unknown selected shot: ' + name);
    for (const p of plans.values()) p.shots = p.shots.filter(s => names.has(s.name));
  }
  return plans;
}

/** Machine-readable plan for a survey run (no I/O). */
export function buildTrackShotSurveyPlan(args = {}) {
  if (args.location && args.locations) throw new Error('Use location or locations, not both');
  if (args.locations) {
    if (!Array.isArray(args.locations) || !args.locations.length || args.locations.length > 32 || new Set(args.locations).size !== args.locations.length) throw new Error('locations must contain 1..32 unique ids');
    const shots = args.locations.flatMap(location => scenarioShots({ ...args, locations: undefined, location }));
    const plan = buildTrackShotSurveyPlan({ ...args, location: undefined, locations: undefined, angles: undefined, weathers: undefined, camera: undefined, preset: 'custom', shots });
    plan.shots.sort((a, b) => a.tod.localeCompare(b.tod) || String(a.weather).localeCompare(String(b.weather)));
    return plan;
  }
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
export function filterResumeShots(outDir, shots, resume = false, context = null) {
  if (!resume) return { pending: shots.slice(), resumed: [] };
  const pending = [];
  const resumed = [];
  for (const s of shots) {
    const png = context?.extension ? path.join(outDir, `${s.name}.${context.extension}`) : shotPngPath(outDir, s.name);
    let matches = !context;
    if (context) { try { matches = JSON.parse(fs.readFileSync(png + ".capture.json", "utf8")).identity === context.identities[s.name]; } catch {} }
    if (fs.existsSync(png) && matches) resumed.push({ ...s, png, resumed: true });
    else pending.push(s);
  }
  return { pending, resumed };
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

const galleryPath = (outDir, file) => {
  const relative = path.isAbsolute(file) ? path.relative(outDir, file) : file;
  return relative.split(path.sep).map(encodeURIComponent).join("/");
};

function surveyCards(outDir, shots, track) {
  return shots.map((shot) => screenshotCard({
    title: shot.name || "View",
    caption: [shot.track || track, shot.frac != null ? `lap ${Math.round(shot.frac * 100)}%` : "", shot.cam, shot.tod, shot.weather].filter(Boolean).join(" · "),
    image: galleryPath(outDir, shot.png || shot.file || `${shot.name}.png`),
    metadata: shot,
  }));
}

/** Static HTML gallery beside the captures; actual JPEG/PNG paths are preserved. */
export function writeSurveyIndex(outDir, meta) {
  const links = meta.panelPng ? `<a href="${galleryEscape(galleryPath(outDir, meta.panelPng))}">Contact sheet</a>` : "";
  const html = renderGallery({ title: `${meta.track || "Track"} — ${meta.label || "survey"}`,
    summary: `${meta.ok ?? meta.shots?.length ?? 0} captures · ${meta.preset || "custom"}`,
    groups: [{ title: meta.track || "Track", cards: surveyCards(outDir, meta.shots || [], meta.track), links }],
  });
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "index.html");
  fs.writeFileSync(file, html);
  return file;
}

/** Combined gallery; supports both captured frames and legacy panel/index rows. */
export function writeCompareIndex(outDir, meta) {
  const tracks = meta.tracks || [];
  const groups = tracks.map((track) => {
    const title = track.actualTrack || track.track || "Unknown track";
    const links = [];
    if (track.relIndex !== null) links.push(`<a href="${galleryEscape(galleryPath(outDir, track.relIndex || `${title}/index.html`))}">Track index</a>`);
    if (track.panel) links.push(`<a href="${galleryEscape(galleryPath(outDir, track.panel))}">Contact sheet</a>`);
    const cards = surveyCards(outDir, track.shots || [], title);
    if (!cards.length && track.panel) cards.push(screenshotCard({ title: "Contact sheet", image: galleryPath(outDir, track.panel) }));
    const failures = [...(track.failures || []), ...(track.error ? [track.error] : [])];
    return { title: track.label || title, cards, links: links.join(" "),
      description: `${track.captured ?? track.shots?.length ?? 0} captured · ${Math.max(Number(track.failed) || 0, failures.length)} failed`,
      extra: failures.length ? `<details><summary>Capture failures</summary><pre>${galleryEscape(JSON.stringify(failures, null, 2))}</pre></details>` : "",
    };
  });
  const html = renderGallery({ title: `Track surveys — ${meta.label || "compare"}`, summary: `${tracks.length} tracks · ${meta.preset || "custom"}`, groups });
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "index.html");
  fs.writeFileSync(file, html);
  return file;
}
