#!/usr/bin/env node
// build-gallery.cjs — static circuit survey gallery from track shots + survey docs.
// @doc Scans open cursor/*-survey* branches + local seeds; WebP + gallery/tracks/index.html for Pages.
// @skill survey-track
//
//   node tools/track/build-gallery.cjs
//   node tools/track/build-gallery.cjs --help
//   npm run gallery:tracks
//
// Inputs (see docs/tracks/GALLERY.md):
//   origin/cursor/*-survey* branches → artifacts/shots/tracks/<circuitId>/*
//   artifacts/shots/tracks/ (current branch), tracks-ui, look-survey, wgx research
// Survey prose: docs/tracks/surveys/<id>.md, else docs/tracks/<id>.md
//
// Output (committed, staged for GitHub Pages via gallery/):
//   gallery/tracks/{index.html,manifest.json,media/<circuit>/…}

"use strict";

const fs = require("fs");
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
const DEFAULT_OUT = path.join(ROOT, "gallery", "tracks");
const REPO = "https://github.com/brycejmurrin/f1-game";
const DOC_BRANCH = "claude/f1-game-project-26h3ng";
const pkg = require(path.join(ROOT, "package.json"));
const GH = parseRepoSlug(pkg.repository?.url);

const CANONICAL_PREFIX = /^([a-z][a-z0-9_]*)-(\d{2,})-(.+)\.(png|jpe?g|webp)$/i;
const WEATHER_TAIL = /^(?:(?:dawn|day|dusk|night|fog|overcast|grid|ui|unknown)-(?:dry|wet|rain|fog|overcast)|(?:dry|wet|rain|fog|overcast|grid|ui|unknown))$/i;

function enrichTod(meta) {
  const { tod, condition } = splitTodWeather(meta.weather);
  return { ...meta, tod, condition };
}

function parseCanonical(base) {
  const m = base.match(CANONICAL_PREFIX);
  if (!m) return null;
  const tokens = m[3].split("-");
  if (tokens.length < 2) return null;
  const last2 = tokens.slice(-2).join("-");
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
  npm run gallery:tracks

  --out DIR          output root (default gallery/tracks)
  --skip-images      manifest + HTML only (use raw.githubusercontent.com URLs)
  --no-fetch         skip git fetch origin before scanning survey branches
  --help             this text

Scans every open cursor/*-survey* PR branch (and other origin survey branches with
shots). Convention: docs/tracks/GALLERY.md
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
    const fileKey = `${shot.branchSlug}-${shot.stem}`.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 120);
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

function buildHtml(manifest) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const data = JSON.stringify(manifest).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Apex 26 — circuit survey gallery</title>
<style>
  :root { color-scheme: dark; --bg:#0b0b10; --panel:#14141c; --line:#2a2a36; --text:#e8e8ee; --muted:#9a9aaa; --accent:#7fd89a; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--text); }
  header { padding: 20px 24px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: rgba(11,11,16,.92); backdrop-filter: blur(8px); z-index: 2; }
  h1 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
  .sub { color: var(--muted); font-size: 12px; }
  .layout { display: grid; grid-template-columns: 220px 1fr; min-height: calc(100vh - 88px); }
  nav { border-right: 1px solid var(--line); padding: 12px; overflow: auto; }
  nav button { display: block; width: 100%; text-align: left; background: transparent; border: 0; color: var(--text); padding: 8px 10px; border-radius: 6px; cursor: pointer; font: inherit; }
  nav button:hover, nav button.active { background: var(--panel); color: var(--accent); }
  main { padding: 16px 20px 40px; overflow: auto; }
  .filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; align-items: center; }
  label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  select { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font: inherit; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; cursor: zoom-in; }
  .card img { width: 100%; aspect-ratio: 16/10; object-fit: cover; display: block; background: #000; }
  .card .meta { padding: 8px 10px; font-size: 12px; }
  .card .meta strong { display: block; font-size: 13px; }
  .card .meta span { color: var(--muted); }
  .doc-link { margin-left: auto; font-size: 12px; }
  .doc-link a { color: var(--accent); text-decoration: none; }
  .doc-link a:hover { text-decoration: underline; }
  #lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.88); display: none; align-items: center; justify-content: center; z-index: 9; padding: 24px; }
  #lightbox.open { display: flex; }
  #lightbox img { max-width: min(1200px, 96vw); max-height: 90vh; border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,.5); }
  #lightbox .cap { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); color: #ddd; font-size: 13px; text-align: center; max-width: 90vw; }
  #lightbox button.close { position: absolute; top: 16px; right: 20px; background: var(--panel); border: 1px solid var(--line); color: var(--text); border-radius: 6px; padding: 8px 12px; cursor: pointer; }
  @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } nav { border-right: 0; border-bottom: 1px solid var(--line); max-height: 140px; } }
</style>
</head>
<body>
<header>
  <h1>Apex 26 — circuit survey gallery</h1>
  <p class="sub">All open <code>cursor/*-survey*</code> branches + seeds · ${manifest.shots.length} shots · rebuild <code>npm run gallery:tracks</code></p>
</header>
<div class="layout">
  <nav id="circuit-nav" aria-label="Circuits"></nav>
  <main>
    <div class="filters">
      <div><label for="sector-filter">Sector</label><br><select id="sector-filter"><option value="">All sectors</option></select></div>
      <div><label for="tod-filter">Time of day</label><br><select id="tod-filter"><option value="">All times</option></select></div>
      <div><label for="weather-filter">Weather</label><br><select id="weather-filter"><option value="">All weather</option></select></div>
      <p class="doc-link" id="survey-doc"></p>
    </div>
    <div class="grid" id="shot-grid"></div>
  </main>
</div>
<div id="lightbox" role="dialog" aria-modal="true" aria-label="Enlarged shot">
  <button type="button" class="close" id="lb-close">Close</button>
  <img id="lb-img" alt="">
  <div class="cap" id="lb-cap"></div>
</div>
<script type="application/json" id="manifest">${data}</script>
<script>
(function () {
  const manifest = JSON.parse(document.getElementById("manifest").textContent);
  const shots = manifest.shots;
  const circuits = manifest.circuits;
  const nav = document.getElementById("circuit-nav");
  const grid = document.getElementById("shot-grid");
  const sectorSel = document.getElementById("sector-filter");
  const todSel = document.getElementById("tod-filter");
  const weatherSel = document.getElementById("weather-filter");
  const docEl = document.getElementById("survey-doc");
  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lb-img");
  const lbCap = document.getElementById("lb-cap");
  let activeCircuit = circuits[0] || "";

  function escAttr(s) {
    return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;");
  }

  function fillSelect(sel, values, label) {
    sel.innerHTML = '<option value="">All ' + label + "</option>" +
      values.map((v) => '<option value="' + escAttr(v) + '">' + v + "</option>").join("");
  }

  function circuitShots(id) { return shots.filter((s) => s.circuit === id); }

  function refreshFilters() {
    const pool = activeCircuit ? circuitShots(activeCircuit) : shots;
    fillSelect(sectorSel, [...new Set(pool.map((s) => s.sector))].sort(), "sectors");
    fillSelect(todSel, [...new Set(pool.map((s) => s.tod))].sort(), "times");
    fillSelect(weatherSel, [...new Set(pool.map((s) => s.condition || s.weather))].sort(), "weather");
  }

  function renderNav() {
    nav.innerHTML = circuits.map((c) => {
      const n = shots.filter((s) => s.circuit === c).length;
      return '<button type="button" data-circuit="' + escAttr(c) + '"' +
        (c === activeCircuit ? ' class="active"' : "") + ">" + c + " (" + n + ")</button>";
    }).join("");
    nav.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
      activeCircuit = btn.dataset.circuit;
      renderNav();
      refreshFilters();
      renderGrid();
    }));
  }

  function renderDoc() {
    const row = manifest.circuitDocs[activeCircuit];
    docEl.innerHTML = row && row.url
      ? '<a href="' + escAttr(row.url) + '" target="_blank" rel="noopener">Survey doc</a>'
      : "";
  }

  function renderGrid() {
    const sec = sectorSel.value;
    const tod = todSel.value;
    const wx = weatherSel.value;
    const list = shots.filter((s) => {
      if (activeCircuit && s.circuit !== activeCircuit) return false;
      if (sec && s.sector !== sec) return false;
      if (tod && s.tod !== tod) return false;
      if (wx && (s.condition || s.weather) !== wx) return false;
      return true;
    });
    grid.innerHTML = list.map((s) => {
      const cap = s.circuit + " · " + s.sector + " · " + (s.tod || "?") + " · " + (s.condition || s.weather);
      const sub = (s.branch ? s.branch.split("/").pop() + " · " : "") + s.sector;
      return '<article class="card" tabindex="0" data-web="' + escAttr(s.web) + '" data-cap="' + escAttr(cap) + '">' +
        '<img src="' + escAttr(s.thumb) + '" alt="" loading="lazy">' +
        '<div class="meta"><strong>' + s.circuit + "</strong><span>" + sub + "</span></div></article>";
    }).join("");
    grid.querySelectorAll(".card").forEach((card) => {
      const open = () => {
        lbImg.src = card.dataset.web;
        lbCap.textContent = card.dataset.cap;
        lb.classList.add("open");
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    });
    renderDoc();
  }

  sectorSel.addEventListener("change", renderGrid);
  todSel.addEventListener("change", renderGrid);
  weatherSel.addEventListener("change", renderGrid);
  document.getElementById("lb-close").addEventListener("click", () => lb.classList.remove("open"));
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.classList.remove("open"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") lb.classList.remove("open"); });

  renderNav();
  refreshFilters();
  renderGrid();
})();
</script>
</body>
</html>`;
}

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
  maybeFetchOrigin(!!opts.noFetch);

  const rawShots = collectShots();
  const branches = surveyBranchesToScan(ROOT);
  if (!rawShots.length) {
    console.warn("build-gallery: no shots found — commit under artifacts/shots/tracks/<id>/ on survey branches");
  }

  const mediaRoot = path.join(outRoot, "media");
  fs.rmSync(outRoot, { recursive: true, force: true });
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
    })),
  };

  fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(outRoot, "index.html"), buildHtml(manifest));
  console.log(`= gallery ${processed.length} shots, ${circuits.length} circuits, ${branches.length} survey branches → ${path.relative(ROOT, outRoot)}/`);
  return manifest;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const outArg = argv.find((a) => a.startsWith("--out="));
  const outRoot = outArg ? path.resolve(outArg.slice("--out=".length)) : DEFAULT_OUT;
  const skipImages = argv.includes("--skip-images");
  const noFetch = argv.includes("--no-fetch");
  await build({ outRoot, skipImages, noFetch });
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  parseShotMeta,
  parseAgentDoubleUnderscore,
  collectShots,
  collectSurveyBranchShots,
  surveyDocPath,
  build,
  parseCanonical,
  splitTodWeather,
  ROOT,
};
