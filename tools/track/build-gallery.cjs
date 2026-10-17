#!/usr/bin/env node
// build-gallery.cjs — static circuit survey gallery from track shots + survey docs.
// @doc Build a filterable HTML/WebP gallery from local captures or survey branches; preserves existing output.
// @skill survey-track
//
//   node tools/track/build-gallery.cjs
//   node tools/track/build-gallery.cjs --help
//   node tools/track/build-gallery.cjs --input artifacts/captures --circuit spa --out artifacts/gallery/spa
//
// Inputs (see docs/notes/LOCAL-SURVEY-GALLERY.md):
//   origin/cursor/*-survey* branches → artifacts/shots/tracks/<circuitId>/*
//   artifacts/shots/tracks/ (current branch), tracks-ui, look-survey, wgx research
// Survey prose: docs/tracks/surveys/<id>.md, else docs/tracks/<id>.md
//
// Default output (local artifacts; publish survey media only to track-survey-assets):
//   artifacts/gallery/tracks/{index.html,manifest.json,media/<circuit>/…}

"use strict";

const fs = require("fs");
const { createHash } = require("crypto");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  splitTodWeather,
  parseRepoSlug,
  rawGitHubUrl,
  surveyBranchesToScan,
  listBranchTrackImages,
  readGitBlob,
  branchSlug,
  IMAGE_EXT,
} = require("./survey-gallery-lib.cjs");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_OUT = path.join(ROOT, "artifacts", "gallery", "tracks");
const REPO = "https://github.com/brycejmurrin/f1-game";
const DOC_BRANCH = "claude/f1-game-project-26h3ng";
const pkg = require(path.join(ROOT, "package.json"));
const GH = parseRepoSlug(pkg.repository?.url);

const CANONICAL_PREFIX = /^([a-z][a-z0-9_]*)-(\d{2,})-(.+)\.(png|jpe?g|webp)$/i;
const WEATHER_TAIL = /^(?:(?:dawn|day|dusk|night|fog|overcast|grid|ui|unknown)-(?:dry|wet|rain|storm|fog|overcast)|(?:dry|wet|rain|storm|fog|overcast|grid|ui|unknown))$/i;
// Some surveyors name frames weather-then-tod (rain-night); read them as tod-weather.
const WEATHER_THEN_TOD = /^(dry|wet|rain|storm|fog|overcast)-(dawn|day|dusk|night)$/i;

function enrichTod(meta) {
  const { tod, condition } = splitTodWeather(meta.weather);
  return { ...meta, tod, condition };
}

function parseCanonical(base) {
  const m = base.match(CANONICAL_PREFIX);
  if (!m) return null;
  const tokens = m[3].split("-");
  if (tokens.length < 2) return null;
  let last2 = tokens.slice(-2).join("-");
  const swapped = last2.match(WEATHER_THEN_TOD);
  if (swapped && tokens.length >= 3) {
    last2 = `${swapped[2]}-${swapped[1]}`.toLowerCase();
    tokens.splice(-2, 2, ...last2.split("-"));
  }
  let weather;
  let sector;
  if (tokens.length >= 3 && WEATHER_TAIL.test(last2)) {
    weather = last2;
    sector = tokens.slice(0, -2).join("-");
  } else {
    weather = tokens[tokens.length - 1];
    sector = tokens.slice(0, -1).join("-");
  }
  if (!sector || !weather) return null;
  return enrichTod({
    circuit: m[1],
    seq: m[2],
    sector,
    weather,
    stem: `${m[1]}-${m[2]}-${sector}-${weather}`,
  });
}

function parseAgentDoubleUnderscore(base, circuitId) {
  const m = base.match(/^(.+?)__(.+)\.(png|jpe?g|webp)$/i);
  if (!m || !circuitId) return null;
  const sector = m[1];
  const weather = m[2];
  const safe = (s) => s.replace(/[^a-z0-9_-]+/gi, "-");
  return enrichTod({
    circuit: circuitId,
    seq: "55",
    sector,
    weather,
    stem: `${circuitId}-55-${safe(sector)}-${safe(weather)}`,
  });
}

function printHelp() {
  console.log(`build-gallery — circuit survey screenshot gallery

  node tools/track/build-gallery.cjs [--out DIR] [--skip-images] [--no-fetch]
  node tools/track/build-gallery.cjs --input artifacts/captures --circuit spa --out artifacts/gallery/spa

  --input DIR        local images only; reads shot.mjs .capture.json metadata, no network
  --circuit ID       fallback circuit for images without capture metadata
  --out DIR          output root (default artifacts/gallery/tracks); must not exist
  --standalone       also write gallery.html with embedded compressed images
  --skip-images      manifest + HTML only (use raw.githubusercontent.com URLs)
  --no-fetch         skip git fetch origin before scanning survey branches
  --help             this text

Scans every open cursor/*-survey* PR branch (and other origin survey branches with
shots). Convention: docs/notes/LOCAL-SURVEY-GALLERY.md
`);
}

function listImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => IMAGE_EXT.test(f))
    .map((f) => path.join(dir, f));
}

/**
 * @param {string} filePath
 * @param {{ circuitHint?: string, bucket?: string, branch?: string, repoRel?: string }} ctx
 */
function parseShotMeta(filePath, ctx = {}) {
  const base = path.basename(filePath);
  const stem = base.replace(IMAGE_EXT, "");
  const rel = ctx.repoRel || path.relative(ROOT, filePath).split(path.sep).join("/");
  const circuitHint = ctx.circuitHint
    || (rel.match(/artifacts\/shots\/tracks\/([^/]+)\//) || [])[1];

  const canon = parseCanonical(base);
  if (canon) {
    return {
      ...canon,
      source: ctx.bucket || "tracks",
      rel,
      branch: ctx.branch || null,
    };
  }

  const agent = parseAgentDoubleUnderscore(base, circuitHint);
  if (agent) {
    return {
      ...agent,
      source: ctx.branch ? `branch:${ctx.branch}` : "tracks",
      rel,
      branch: ctx.branch || null,
    };
  }

  let m = base.match(/^([a-z][a-z0-9_]*)_grid\.png$/i);
  if (m) {
    return enrichTod({
      circuit: m[1],
      seq: "00",
      sector: "overview",
      weather: "grid",
      source: "look-survey",
      rel,
      branch: null,
      stem: `${m[1]}-00-overview-grid`,
    });
  }

  m = base.match(/preview-([a-z][a-z0-9_]*)/i);
  if (m) {
    return enrichTod({
      circuit: m[1],
      seq: "90",
      sector: "picker-preview",
      weather: "ui",
      source: ctx.bucket || "tracks-ui",
      rel,
      branch: null,
      stem: `${m[1]}-90-picker-preview-ui`,
    });
  }

  m = base.match(/track-detail-([a-z][a-z0-9_]*)/i);
  if (m) {
    return enrichTod({
      circuit: m[1],
      seq: "91",
      sector: "detail-card",
      weather: "ui",
      source: ctx.bucket || "tracks-ui",
      rel,
      branch: null,
      stem: `${m[1]}-91-detail-card-ui`,
    });
  }

  if (ctx.circuitHint && /^[a-z0-9_-]+\.(png|jpe?g|webp)$/i.test(base)) {
    const id = ctx.circuitHint.replace(/\.(png|jpe?g|webp)$/i, "");
    return enrichTod({
      circuit: id,
      seq: "00",
      sector: "still",
      weather: "unknown",
      source: ctx.bucket || "research",
      rel,
      branch: ctx.branch || null,
      stem: `${id}-00-still-unknown`,
    });
  }

  if (ctx.bucket === "tracks-ui") {
    const tag = stem.replace(/^\d+-/, "").slice(0, 40) || "misc";
    return enrichTod({
      circuit: "tracks-ui",
      seq: (stem.match(/^(\d+)/) || ["", "99"])[1],
      sector: tag,
      weather: "ui",
      source: "tracks-ui",
      rel,
      branch: null,
      stem: `tracks-ui-${(stem.match(/^(\d+)/) || ["", "99"])[1]}-${tag}`,
    });
  }

  if (circuitHint) {
    return enrichTod({
      circuit: circuitHint,
      seq: "99",
      sector: stem.slice(0, 48),
      weather: "unknown",
      source: ctx.branch ? `branch:${ctx.branch}` : "tracks",
      rel,
      branch: ctx.branch || null,
      stem: `${circuitHint}-99-${stem}`.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80),
    });
  }

  return null;
}

function collectInputShots(input, circuit) {
  const dir = path.resolve(input);
  if (!fs.statSync(dir).isDirectory()) throw new Error("--input must be a directory");
  const managed = fs.existsSync(path.join(dir, "session.json"));
  return listImages(dir).filter(abs => !managed || fs.existsSync(abs + ".capture.json")).sort().map((abs, index) => {
    const sidecar = abs + ".capture.json";
    let capture = null;
    if (fs.existsSync(sidecar)) capture = JSON.parse(fs.readFileSync(sidecar, "utf8"));
    const job = capture?.job;
    const id = job?.trackId || job?.track || circuit;
    if (id && !/^[a-z][a-z0-9_]*$/i.test(id)) throw new Error("Invalid circuit id: " + id);
    const parsed = parseShotMeta(abs, { circuitHint: id, bucket: "local" });
    if (!parsed) throw new Error("Cannot identify circuit for " + path.basename(abs) + "; supply --circuit");
    const camera = job?.cam === "park" ? capture?.state?.plugin?.view?.camMode || job.cam : job?.cam;
    const meta = job ? { ...parsed, circuit: id || parsed.circuit, sector: camera || parsed.sector,
      tod: job.tod || "unknown", condition: job.weather || "unknown", weather: job.weather || "unknown",
      camera, location: job.location || null, angle: job.angle || null, job, sourceIdentity: capture.source || null, timings: capture.timings || null, fraction: job.frac, renderer: capture.state?.plugin?.renderer || null } : parsed;
    return { ...meta, seq: String(index).padStart(2, "0"), uid: "local:" + abs,
      abs, repoRel: path.basename(abs), gitBranch: null, rawUrl: null, branchSlug: "local" };
  });
}

function surveyDocPath(circuitId) {
  const surveys = path.join(ROOT, "docs", "tracks", "surveys", `${circuitId}.md`);
  if (fs.existsSync(surveys)) return `docs/tracks/surveys/${circuitId}.md`;
  const legacy = path.join(ROOT, "docs", "tracks", `${circuitId}.md`);
  if (fs.existsSync(legacy)) return `docs/tracks/${circuitId}.md`;
  return null;
}

function surveyDocUrl(docPath) {
  if (!docPath) return null;
  return `${REPO}/blob/${DOC_BRANCH}/${docPath}`;
}

function collectSurveyBranchShots() {
  /** @type {Map<string, object>} */
  const byUid = new Map();
  const branches = surveyBranchesToScan(ROOT);
  for (const branch of branches) {
    for (const repoRel of listBranchTrackImages(ROOT, branch)) {
      const circuitHint = repoRel.split("/")[3];
      const meta = parseShotMeta(path.basename(repoRel), {
        circuitHint,
        bucket: "tracks",
        branch,
        repoRel,
      });
      if (!meta) continue;
      const uid = `${branch}:${repoRel}`;
      const rawUrl = rawGitHubUrl(GH.owner, GH.repo, branch, repoRel);
      byUid.set(uid, {
        ...meta,
        uid,
        gitBranch: branch,
        repoRel,
        rawUrl,
        abs: null,
        branchSlug: branchSlug(branch),
      });
    }
  }
  return [...byUid.values()];
}

function collectLocalShots() {
  /** @type {Map<string, object>} */
  const byStem = new Map();

  const add = (abs, ctx) => {
    const meta = parseShotMeta(abs, ctx);
    if (!meta) return;
    const uid = `local:${meta.rel}`;
    const prev = byStem.get(uid);
    const rank = (s) => (s === "tracks" ? 3 : s === "look-survey" ? 2 : 1);
    if (!prev || rank(meta.source) > rank(prev.source)) {
      byStem.set(uid, {
        ...meta,
        uid,
        abs,
        gitBranch: null,
        repoRel: meta.rel,
        rawUrl: null,
        branchSlug: "local",
      });
    }
  };

  const tracksRoot = path.join(ROOT, "artifacts", "shots", "tracks");
  if (fs.existsSync(tracksRoot)) {
    for (const ent of fs.readdirSync(tracksRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(tracksRoot, ent.name);
      for (const abs of listImages(dir)) add(abs, { bucket: "tracks", circuitHint: ent.name });
    }
  }

  for (const abs of listImages(path.join(ROOT, "artifacts", "shots", "tracks-ui"))) {
    add(abs, { bucket: "tracks-ui" });
  }

  for (const abs of listImages(path.join(ROOT, "docs", "look-survey"))) {
    add(abs, { bucket: "look-survey" });
  }

  const wgx = path.join(ROOT, "docs", "research", "wgx-gallery");
  for (const abs of listImages(wgx)) {
    const hint = path.basename(abs).replace(IMAGE_EXT, "");
    add(abs, { bucket: "wgx-gallery", circuitHint: hint });
  }

  return [...byStem.values()];
}

function collectShots() {
  const branchShots = collectSurveyBranchShots();
  const local = collectLocalShots();
  const byUid = new Map();
  for (const s of branchShots) byUid.set(s.uid, s);
  for (const s of local) {
    if (!byUid.has(s.uid)) byUid.set(s.uid, s);
  }
  return [...byUid.values()].sort((a, b) =>
    a.circuit.localeCompare(b.circuit) ||
    a.sector.localeCompare(b.sector) ||
    (a.tod || "").localeCompare(b.tod || "") ||
    a.weather.localeCompare(b.weather) ||
    (a.branch || "").localeCompare(b.branch || ""));
}

async function loadSharp() {
  try {
    return require("sharp");
  } catch (_) {
    return null;
  }
}

async function writeImages(shots, mediaRoot, skipImages) {
  const sharp = skipImages ? null : await loadSharp();
  const out = [];

  for (const shot of shots) {
    const dir = path.join(mediaRoot, shot.circuit);
    fs.mkdirSync(dir, { recursive: true });
    const hash = createHash("sha256").update(shot.uid).digest("hex").slice(0, 16);
    const fileKey = `${shot.branchSlug}-${shot.stem}`.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 100) + "-" + hash;
    const thumbName = `${fileKey}-thumb.webp`;
    const webName = `${fileKey}-web.webp`;
    const thumbRel = `media/${shot.circuit}/${thumbName}`;
    const webRel = `media/${shot.circuit}/${webName}`;

    if (shot.rawUrl && (skipImages || !sharp)) {
      out.push({
        ...shot,
        thumb: shot.rawUrl,
        web: shot.rawUrl,
      });
      continue;
    }

    let buf = null;
    if (shot.abs && fs.existsSync(shot.abs)) buf = fs.readFileSync(shot.abs);
    else if (shot.gitBranch && shot.repoRel) {
      try {
        buf = readGitBlob(ROOT, shot.gitBranch, shot.repoRel);
      } catch (e) {
        console.warn(`build-gallery: skip ${shot.repoRel} on ${shot.gitBranch}: ${e.message}`);
        if (shot.rawUrl) {
          out.push({ ...shot, thumb: shot.rawUrl, web: shot.rawUrl });
        }
        continue;
      }
    }

    if (!buf) continue;

    if (sharp) {
      const input = sharp(buf);
      await input.clone().resize({ width: 420, withoutEnlargement: true }).webp({ quality: 72 })
        .toFile(path.join(dir, thumbName));
      await input.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 })
        .toFile(path.join(dir, webName));
      out.push({ ...shot, thumb: thumbRel, web: webRel });
    } else {
      const ext = path.extname(shot.repoRel || shot.abs || ".png").toLowerCase() || ".png";
      const copyName = `${fileKey}-web${ext}`;
      fs.writeFileSync(path.join(dir, copyName), buf);
      out.push({
        ...shot,
        thumb: `media/${shot.circuit}/${copyName}`,
        web: `media/${shot.circuit}/${copyName}`,
      });
    }
  }
  return out;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const { buildHtml } = require("./survey-gallery-page.cjs");

function maybeFetchOrigin(skipFetch) {
  if (skipFetch) return;
  try {
    execFileSync("git", ["fetch", "origin", "--prune"], { cwd: ROOT, stdio: "pipe" });
  } catch (e) {
    console.warn(`build-gallery: git fetch origin failed (${e.message}) — using local refs`);
  }
}

async function build(opts = {}) {
  const outRoot = opts.outRoot || DEFAULT_OUT;
  const skipImages = !!opts.skipImages;
  if (opts.standalone && skipImages) throw new Error("--standalone requires local images; omit --skip-images");
  // Never delete a user-selected directory or overwrite a previous good gallery.
  if (fs.existsSync(outRoot)) throw new Error("Output already exists; choose a new --out directory: " + outRoot);
  let rawShots, branches;
  if (opts.input) {
    rawShots = collectInputShots(opts.input, opts.circuit);
    branches = [];
  } else {
    maybeFetchOrigin(!!opts.noFetch);
    rawShots = collectShots();
    branches = surveyBranchesToScan(ROOT);
  }
  if (!rawShots.length) {
    console.warn("build-gallery: no shots found — commit under artifacts/shots/tracks/<id>/ on survey branches");
  }

  const mediaRoot = path.join(outRoot, "media");
  fs.mkdirSync(mediaRoot, { recursive: true });

  const processed = await writeImages(rawShots, mediaRoot, skipImages);
  const circuits = uniqueSorted(processed.map((s) => s.circuit));
  const circuitDocs = {};
  for (const c of circuits) {
    const docPath = surveyDocPath(c);
    circuitDocs[c] = docPath ? { path: docPath, url: surveyDocUrl(docPath) } : null;
  }

  const manifest = {
    builtAt: new Date().toISOString(),
    convention: "<circuit>-<nn>-<sector>-<tod>-<condition> or <view>__<tod>-<condition>",
    surveyBranches: branches,
    docBranch: DOC_BRANCH,
    circuits,
    sectors: uniqueSorted(processed.map((s) => s.sector)),
    tods: uniqueSorted(processed.map((s) => s.tod)),
    weathers: uniqueSorted(processed.map((s) => s.condition || s.weather)),
    circuitDocs,
    shots: processed.map((s) => ({
      circuit: s.circuit,
      seq: s.seq,
      sector: s.sector,
      weather: s.weather,
      tod: s.tod,
      condition: s.condition,
      branch: s.gitBranch,
      source: s.source,
      thumb: s.thumb,
      web: s.web,
      rawUrl: s.rawUrl,
      input: s.repoRel || s.rel,
      camera: s.camera || null,
      location: s.location || null, angle: s.angle || null, job: s.job || null, sourceIdentity: s.sourceIdentity || null, timings: s.timings || null,
      fraction: s.fraction ?? null,
      renderer: s.renderer || null,
    })),
  };

  fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(outRoot, "index.html"), buildHtml(manifest));
  if (opts.standalone) {
    const embedded = { ...manifest, shots: manifest.shots.map(shot => {
      if (!shot.web.startsWith("media/")) throw new Error("Standalone image unavailable locally: " + shot.input);
      const ext = path.extname(shot.web).slice(1).toLowerCase();
      const mime = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" }[ext];
      if (!mime) throw new Error("Unsupported standalone image format: " + ext);
      // Embed each viewing copy once; the page uses it for both grid and viewer.
      const web = "data:" + mime + ";base64," + fs.readFileSync(path.join(outRoot, shot.web)).toString("base64");
      return { ...shot, thumb: null, web };
    }) };
    fs.writeFileSync(path.join(outRoot, "gallery.html"), buildHtml(embedded));
  }
  console.log(`= gallery ${processed.length} shots, ${circuits.length} circuits, ${branches.length} survey branches → ${path.relative(ROOT, outRoot)}/`);
  return manifest;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const value = (name) => {
    const eq = argv.find(a => a.startsWith(name + "="));
    const i = argv.indexOf(name);
    const result = eq ? eq.slice(name.length + 1) : i >= 0 ? argv[i + 1] : null;
    if ((eq || i >= 0) && (!result || result.startsWith("--"))) throw new Error(name + " requires a value");
    return result;
  };
  const input = value("--input"), circuit = value("--circuit");
  value("--out");
  const outEq = argv.find((a) => a.startsWith("--out="));
  const outIdx = argv.indexOf("--out");
  const outVal = outEq ? outEq.slice("--out=".length) : outIdx >= 0 ? argv[outIdx + 1] : "";
  const outRoot = outVal ? path.resolve(outVal) : DEFAULT_OUT;
  const skipImages = argv.includes("--skip-images");
  const noFetch = argv.includes("--no-fetch");
  await build({ outRoot, skipImages, noFetch, input, circuit, standalone: argv.includes("--standalone") });
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  parseShotMeta,
  collectInputShots,
  buildHtml,
  parseAgentDoubleUnderscore,
  collectShots,
  collectSurveyBranchShots,
  surveyDocPath,
  build,
  parseCanonical,
  splitTodWeather,
  ROOT,
};
