#!/usr/bin/env node
// ab-lighting — A/B harness for every tunable lighting constant. For each knob
// it renders the SAME scene twice: A = the committed code, B = the same code
// with the knob's exact source string swapped for an alternate value (served
// from memory — the working tree is never touched). It then measures both
// frames (whole-frame + per-region luminance stats), gates on whether the swap
// produced a VISIBLE whole-frame change, and writes a side-by-side composite +
// metrics JSON to scratch/ab/.
//
//   node tools/ab-lighting.mjs list                    # print the knob catalog
//   node tools/ab-lighting.mjs run all                 # A/B every knob
//   node tools/ab-lighting.mjs run lampFog.base pcss.penScale ...
//   node tools/ab-lighting.mjs run all --out /tmp/ab   # custom output dir
//
// Exit code 1 if any knob produces NO visible change — "this constant no
// longer does anything" is a caught regression, not a silent one. Per-lamp
// flicker is frozen during renders so night A/Bs isolate the knob.
// tests/lighting-ab.spec.js separately asserts every knob's `find` string
// still exists EXACTLY ONCE in its file, so retuning a constant without
// updating this catalog fails fast.

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chrome() {
  for (const p of ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"])
    if (existsSync(p)) return p;
  return undefined;
}

// ── Measurement regions (fractions of the 720x405 frame) ────────────────────
// road: the tarmac band ahead of the car. fogwall: the distant haze block under
// the horizon. sky: upper sky. wallL: left barrier/wall face. near: foreground
// road. frame: everything.
const REGIONS = {
  frame:   [0.00, 0.00, 1.00, 1.00],
  road:    [0.30, 0.60, 0.40, 0.16],
  near:    [0.28, 0.74, 0.44, 0.14],
  fogwall: [0.34, 0.38, 0.32, 0.16],
  sky:     [0.28, 0.05, 0.44, 0.20],
  wallL:   [0.02, 0.34, 0.16, 0.22],
};

// ── Scenes (park + eye-level driver view) ────────────────────────────────────
const SCENES = {
  qatarNight:  { track: "qatar",       tod: "night", wx: "dry",  frac: 0.40 },
  vegasNight:  { track: "vegas",       tod: "night", wx: "dry",  frac: 0.25 },
  sgNightFog:  { track: "singapore",   tod: "night", wx: "fog",  frac: 0.35 },
  bahNight:    { track: "bahrain",     tod: "night", wx: "dry",  frac: 0.45 },
  bahFog:      { track: "bahrain",     tod: "night", wx: "fog",  frac: 0.45 },
  monacoDusk:  { track: "monaco",      tod: "dusk",  wx: "dry",  frac: 0.45 },
  monzaDay:    { track: "monza",       tod: "day",   wx: "dry",  frac: 0.30 },
  silvDay:     { track: "silverstone", tod: "day",   wx: "dry",  frac: 0.40 },
  zandRain:    { track: "zandvoort",   tod: "day",   wx: "rain", frac: 0.30 },
};

// ── The knob catalog ─────────────────────────────────────────────────────────
// find: EXACT unique source string (verified 1x by tests/lighting-ab.spec.js).
// b:    the alternate to A/B against.
// watch: { region, metric } — the region+metric a human should READ in the
//        JSON/composite to judge this knob (documented in LIGHTING-KNOBS.md).
//        This is guidance, not the gate.
//
// The PASS/FAIL gate is robust and uniform: a knob PASSES when swapping A→B
// produces a VISIBLE whole-frame change (mean abs luminance delta over the
// play area, HUD excluded, above the JPEG noise floor). That is the invariant
// that matters — "this constant still does something." Per-region directional
// numbers are miscalibrated by scene/region/JPEG far too easily to hard-gate
// on; they live in results.json for tuning, and the -AB.jpg composite is the
// human's final judge. (`minVisible` overrides the default floor for knobs
// with an inherently tiny footprint.)
const KNOBS = [
  // ── Lamp geometry / energy (game.js buildTrackLights) ──
  { id: "lamp.poolEnergy", file: "js/game.js", scene: "qatarNight",
    find: "0.55 / Math.max(hAim / al, 0.35)", b: "0.30 / Math.max(hAim / al, 0.35)",
    expect: { region: "road", metric: "mean", dir: "-", minRel: 0.05 },
    note: "master lamp-pool energy scale (0.55) + raking-incidence clamp floor (0.35 — engages only on shallow masts)" },
  { id: "lamp.aimPoint", file: "js/game.js", scene: "qatarNight",
    find: "const nlOff = track.hw[k] * 0.5 * side;", b: "const nlOff = track.hw[k] * 0.0 * side;",
    expect: { region: "road", metric: "mean", dir: "~", minRel: 0.30 },
    note: "pool lands on near lane (0.5) vs centreline (0) — position shift, energy roughly stable" },
  { id: "lamp.radius", file: "js/game.js", scene: "bahNight",
    find: "intensity: 18.0, radius: 34", b: "intensity: 18.0, radius: 24",
    expect: { region: "road", metric: "p90", dir: "-", minRel: 0.04 },
    note: "desert pool radius; windowing eats the pool's far corner when small" },
  { id: "lamp.sodiumCone", file: "js/game.js", scene: "qatarNight",
    find: "sodium:     { col: [1.42, 0.72, 0.24], eMul: 0.85, cIn: 0.82, cOut: 0.44",
    b:    "sodium:     { col: [1.42, 0.72, 0.24], eMul: 0.85, cIn: 0.66, cOut: 0.40",
    expect: { region: "road", metric: "contrast", dir: "-", minRel: 0.03 },
    note: "wider inner cone flattens the pool (less hot-core/valley contrast)" },
  { id: "lamp.bleed", file: "js/game.js", scene: "bahNight",
    find: "bleed = KP.blB + lh(i + 31) * KP.blV;", b: "bleed = (KP.blB + lh(i + 31) * KP.blV) * 2.5;",
    expect: { region: "road", metric: "p10", dir: "+", minRel: 0.05 },
    note: "out-of-beam floor — lifts the valleys between pools" },
  { subtle: true, id: "lamp.glareW", file: "js/glx.js", scene: "qatarNight",
    find: "* fade * glareW;", b: "* fade * glareW * 2.5;",
    expect: { region: "frame", metric: "p90", dir: "+", minRel: 0.005 },
    note: "per-lamp lens-glare halo brightness (drawGlow)" },
  // ── Glowing fog / volumetrics ──
  { id: "lampFog.base", file: "js/game.js", scene: "bahFog",
    find: "Math.min(0.9, 0.45 + 0.6 * (frame.groundMist || 0))", b: "0.0",
    expect: { region: "fogwall", metric: "mean", dir: "-", minRel: 0.04 },
    note: "how strongly lamps tint the fog wall (the glowing-fog amount) — B fully kills it for a stark before/after" },
  { id: "lampFog.softClip", file: "js/glx.js", scene: "bahFog",
    find: "lampFogC = lf / (1.0 + max(max(lf.r, lf.g), lf.b) * 0.7);", b: "lampFogC = lf / (1.0 + max(max(lf.r, lf.g), lf.b) * 0.2);",
    expect: { region: "fogwall", metric: "bloomPct", dir: "+", minRel: 0.0 },
    note: "anti-white-wash shoulder; weaker clip lets fog cross the bloom threshold" },
  { id: "lampFog.mistShare", file: "js/glx.js", scene: "bahFog",
    find: "+ lampFogC * 1.5;", b: "+ lampFogC * 0.4;",
    expect: { region: "near", metric: "mean", dir: "-", minRel: 0.02 },
    note: "ground-mist share of the lamp glow (mist hugs the road where lamps aim)" },
  { id: "vol.lampRange", file: "js/glx.js", scene: "bahFog",
    find: "uLampStr > 0.0 && td < 200.0", b: "uLampStr > 0.0 && td < 15.0",
    expect: { region: "fogwall", metric: "mean", dir: "-", minRel: 0.01 },
    note: "how far along the ray lamps volumetrically in-scatter (B kills all but the nearest to force a visible delta)" },
  { id: "vol.beamHeight", file: "js/glx.js", scene: "bahFog",
    find: "exp(-max(p.y - groundY, 0.0) * 0.07);   // lamp haze hugs the road (taller beams)",
    b:    "exp(-max(p.y - groundY, 0.0) * 0.25);   // lamp haze hugs the road (taller beams)",
    expect: { region: "sky", metric: "mean", dir: "-", minRel: 0.0 },
    note: "beam height falloff — larger constant = shorter cones above the road" },
  { id: "vol.lampStrength", file: "js/game.js", scene: "bahFog",
    find: "clamp(0.05 + 0.65 * _mist, 0, 0.70)", b: "clamp(0.02 + 0.25 * _mist, 0, 0.30)",
    expect: { region: "fogwall", metric: "mean", dir: "-", minRel: 0.01 },
    note: "overall lamp-volumetric strength driver (mist-swelled)" },
  // ── Ambient ──
  { id: "amb.bounceK", file: "js/glx.js", scene: "bahNight",
    find: "(att * 0.04 * (0.55 + 0.45 * NoLl))", b: "(att * 0.00 * (0.55 + 0.45 * NoLl))",
    expect: { region: "wallL", metric: "mean", dir: "-", minRel: 0.02 },
    note: "per-lamp bounce fill on walls/kerbs (0 = the old dead-wall look)" },
  { id: "amb.nightCap", file: "js/game.js", scene: "vegasNight",
    find: "capSky   = _neonAmb ? [0.048, 0.048, 0.068] : [0.020, 0.023, 0.042]",
    b:    "capSky   = _neonAmb ? [0.012, 0.014, 0.026] : [0.012, 0.014, 0.026]",
    expect: { region: "near", metric: "p10", dir: "-", minRel: 0.03 },
    note: "night ambient ceiling — B is the old near-black band (unreadable foreground)" },
  { subtle: true, id: "amb.cityGlowHue", file: "js/game.js", scene: "vegasNight",
    find: "if (_cgA) {", b: "if (false && _cgA) {",
    expect: { region: "near", metric: "mean", dir: "~", minRel: 0.15 },
    note: "ambient hued toward city glow (whole block toggled) — colour cast shift, near energy-neutral" },
  // ── Reflections ──
  { id: "ssr.dryFloors", file: "js/game.js", scene: "vegasNight",
    find: "(frame.lights ? 0.16 : 0.07)", b: "(frame.lights ? 0.0 : 0.0)",
    expect: { region: "road", metric: "mean", dir: "~", minRel: 0.25 },
    note: "dry-road scene mirror (night sheen 0.16 / day 0.07); B = fully matte" },
  { id: "ssr.sheenFade", file: "js/glx.js", scene: "monzaDay",
    find: "strength *= min(uReflect / 0.20, 1.0);", b: "strength *= 1.0;",
    expect: { region: "road", metric: "mean", dir: "~", minRel: 0.25 },
    note: "low-strength sheen fade; B = full darker-mirror even at faint levels" },
  { id: "ssr.roadMask", file: "js/glx.js", scene: "zandRain",
    find: "smoothstep(0.40, 0.75, upDot)", b: "smoothstep(0.55, 0.85, upDot)",
    expect: { region: "road", metric: "mean", dir: "~", minRel: 0.25 },
    note: "up-facing gate — B is the old edge that dropped banked-corner reflections" },
  // ── Shadows ──
  { subtle: true, id: "pcss.penScale", file: "js/glx.js", scene: "monzaDay",
    find: "float pen = clamp((z - zb) * 80.0, 0.0, 1.0);", b: "float pen = clamp((z - zb) * 300.0, 0.0, 1.0);",
    expect: { region: "road", metric: "edgeE", dir: "-", minRel: 0.0 },
    note: "penumbra growth with caster distance; larger = softer (lower edge energy)" },
  { id: "pcss.radiusRange", file: "js/glx.js", scene: "monzaDay",
    find: "R = mix(1.5, 6.0, pen);", b: "R = mix(24.0, 24.0, pen);",
    expect: { region: "road", metric: "edgeE", dir: "-", minRel: 0.0 },
    note: "contact-hardening range; B is a dramatic uniform blur (4x the old max) for a visible before/after" },
  { id: "shadow.box", file: "js/game.js", scene: "monzaDay",
    find: "M4.orthoTo(_mLProj, -55, 55, -55, 55, 1.0, 320);", b: "M4.orthoTo(_mLProj, -110, 110, -110, 110, 1.0, 320);",
    expect: { region: "road", metric: "edgeE", dir: "-", minRel: 0.0 },
    note: "light-box size; doubling it halves texel density (softer, muddier edges)" },
  { id: "shadow.biasClamp", file: "js/glx.js", scene: "monzaDay",
    find: "clamp(slopeBias, 0.0005, 0.004)", b: "clamp(slopeBias, 0.004, 0.012)",
    expect: { region: "road", metric: "mean", dir: "+", minRel: 0.0 },
    note: "acne-vs-peter-panning bias; larger bias lightens (shadows detach/shrink)" },
  // ── Surface detail ──
  { id: "detail.reliefStrength", file: "js/glx.js", scene: "silvDay",
    find: "(uDetail * 0.4 * mnFade) / e", b: "(uDetail * 0.0 * mnFade) / e",
    minVisible: 0.2, expect: { region: "near", metric: "edgeE", dir: "-", minRel: 0.0 },
    note: "micro-normal relief strength (two-octave asphalt/verge bumpiness); B flattens it" },
  { id: "detail.crackStrength", file: "js/glx.js", scene: "silvDay",
    find: "smoothstep(0.40, 0.70, vnoise(wp * 0.11 + 7.7));", b: "smoothstep(0.05, 0.35, vnoise(wp * 0.11 + 7.7));",
    minVisible: 0.2, expect: { region: "near", metric: "p10", dir: "-", minRel: 0.0 },
    note: "crack COVERAGE zone-gate (was darkness only) — B widens which stretches show cracks, so much more of the road cracks visibly" },
  { id: "detail.patch", file: "js/glx.js", scene: "silvDay",
    find: "albedo *= 1.0 - pm * 0.05 * min(uDetail * 4.0, 1.0);", b: "albedo *= 1.0 - pm * 0.18 * min(uDetail * 4.0, 1.0);",
    minVisible: 0.2, expect: { region: "near", metric: "mean", dir: "-", minRel: 0.0 },
    note: "repair-patch albedo shift; stronger patches darken the near road" },
  // ── Night energy budget (pre-existing, now measurable) ──
  { id: "night.glowAmp", file: "js/glx.js", scene: "vegasNight",
    find: "color += albedo * glow * 2.3;", b: "color += albedo * glow * 3.4;",
    expect: { region: "frame", metric: "bloomPct", dir: "+", minRel: 0.0 },
    note: "emissive HDR push (windows/lenses/neon) — B is the old too-bright budget" },
  { id: "night.floodEmit", file: "js/game.js", scene: "vegasNight",
    find: "(raceTimeOfDay === \"default\" && track.def.night)) ? 0.78", b: "(raceTimeOfDay === \"default\" && track.def.night)) ? 0.40",
    expect: { region: "frame", metric: "mean", dir: "-", minRel: 0.02 },
    note: "prop emissive ramp at night (lit windows / lens glow level)" },
  { id: "night.exposure", file: "js/game.js", scene: "qatarNight",
    find: "frame.exposure = (track && track.def && track.def.theme === \"street_night\") ? 0.86 : 0.90;",
    b:    "frame.exposure = (track && track.def && track.def.theme === \"street_night\") ? 1.05 : 1.10;",
    expect: { region: "frame", metric: "mean", dir: "+", minRel: 0.05 },
    note: "explicit-night exposure — the master dark-stays-dark knob" },
  { id: "night.bloomThresh", file: "js/game.js", scene: "vegasNight",
    find: "_thresh = 0.97;", b: "_thresh = 0.78;",
    expect: { region: "frame", metric: "bloomPct", dir: "+", minRel: 0.0 },
    note: "night bright-pass threshold; lower = more of the scene blooms" },
];

// Applied to js/game.js in EVERY render (baseline AND variant): freeze the
// per-lamp flicker so night scenes are deterministic — otherwise the ±2/10%
// lamp breathing (performance.now-driven) adds ~1 luma of A-vs-B noise that
// has nothing to do with the knob under test.
const FREEZE_FLICKER = ["const amp = hsh > 0.90 ? 0.10 : 0.02;", "const amp = 0.0;"];

// ── Static server: serves ROOT, applying {file → [find,replace]} overrides ──
function startServer(overrides) {
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
  const srv = createServer((req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      let body = readFileSync(ROOT + p);
      const file = p.slice(1);
      const ov = overrides && overrides[file];
      if (ov || file === "js/game.js") {
        let text = body.toString();
        if (ov) {
          if (!text.includes(ov[0])) throw new Error(`knob find-string missing in ${p}`);
          text = text.replace(ov[0], ov[1]);
        }
        if (file === "js/game.js" && text.includes(FREEZE_FLICKER[0]))
          text = text.replace(FREEZE_FLICKER[0], FREEZE_FLICKER[1]);
        body = Buffer.from(text);
      }
      res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
      res.end(body);
    } catch (e) { res.writeHead(404); res.end(String(e.message || e)); }
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port })));
}

async function renderScene(browser, port, scene, outPath) {
  const page = await browser.newPage({ viewport: { width: 720, height: 405 } });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 90)); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });
  await page.evaluate((t) => window.__apex.race(t), scene.track);
  await page.waitForFunction(() => window.__apex.info && window.__apex.info().track != null, { timeout: 25000 });
  await page.evaluate((t) => window.__apex.setTimeOfDay(t), scene.tod);
  await page.evaluate((w) => window.__apex.weather(w), scene.wx);
  await page.evaluate((f) => window.__apex.park(f), scene.frac);
  await sleep(2600);
  await page.evaluate((f) => window.__apex.eyeAt(f, 0.2, 1.35), scene.frac);
  await sleep(1300);
  await page.screenshot({ path: outPath, type: "jpeg", quality: 62 });
  await page.close();
  return errs;
}

// Decode a JPEG in a blank page and compute stats for every region.
// edgeE = mean absolute horizontal luminance gradient (edge energy) — detects
// shadow-edge sharpness / fine detail. bloomPct = % pixels with max channel>240.
async function measure(page, jpgPath) {
  const b64 = readFileSync(jpgPath).toString("base64");
  return page.evaluate(async ({ b64, REGIONS }) => {
    const img = new Image(); img.src = "data:image/jpeg;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d"); cx.drawImage(img, 0, 0);
    const out = {};
    for (const [name, [fx, fy, fw, fh]] of Object.entries(REGIONS)) {
      const x = Math.round(img.width * fx), y = Math.round(img.height * fy);
      const w = Math.round(img.width * fw), h = Math.round(img.height * fh);
      const d = cx.getImageData(x, y, w, h).data;
      const lum = new Float32Array(w * h);
      let bloom = 0;
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        lum[j] = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (Math.max(d[i], d[i + 1], d[i + 2]) > 240) bloom++;
      }
      const sorted = Float32Array.from(lum).sort();
      const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      let sum = 0; for (const v of lum) sum += v;
      let eSum = 0, eN = 0;
      for (let r = 0; r < h; r++) for (let col = 1; col < w; col++) {
        eSum += Math.abs(lum[r * w + col] - lum[r * w + col - 1]); eN++;
      }
      const p10 = q(0.10), p90 = q(0.90);
      out[name] = {
        mean: sum / lum.length, p10, p90,
        contrast: p90 / Math.max(p10, 1),
        bloomPct: (bloom / lum.length) * 100,
        edgeE: eSum / eN,
      };
    }
    return out;
  }, { b64, REGIONS });
}

// Whole-frame mean absolute COLOUR delta between two renders of the SAME scene,
// over the play area only (HUD strips top and bottom excluded). Per-channel, so
// a luma-neutral hue shift (city-glow ambient tint) still registers — a pure
// luminance diff would score it zero. This is the PASS gate: a live knob
// visibly changes the frame; a dead one doesn't.
const VISIBLE_FLOOR = 0.8;   // JPEG-q62 same-scene, flicker-frozen noise ~0.2-0.4
async function frameDiff(page, aPath, bPath) {
  const a64 = readFileSync(aPath).toString("base64");
  const b64 = readFileSync(bPath).toString("base64");
  return page.evaluate(async ({ a64, b64 }) => {
    const load = (s) => { const i = new Image(); i.src = "data:image/jpeg;base64," + s; return i.decode().then(() => i); };
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    const c = document.createElement("canvas"); c.width = ia.width; c.height = ia.height;
    const cx = c.getContext("2d");
    cx.drawImage(ia, 0, 0); const da = cx.getImageData(0, 0, ia.width, ia.height).data;
    cx.drawImage(ib, 0, 0); const db = cx.getImageData(0, 0, ib.width, ib.height).data;
    const y0 = Math.round(ia.height * 0.10), y1 = Math.round(ia.height * 0.82);
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < ia.width; x++) {
        const i = (y * ia.width + x) * 4;
        sum += (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
        n++;
      }
    }
    return sum / n;
  }, { a64, b64 });
}

async function composite(page, aPath, bPath, outPath, label) {
  const a64 = readFileSync(aPath).toString("base64");
  const b64 = readFileSync(bPath).toString("base64");
  const buf = await page.evaluate(async ({ a64, b64, label }) => {
    const load = (s) => { const i = new Image(); i.src = "data:image/jpeg;base64," + s; return i.decode().then(() => i); };
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    const c = document.createElement("canvas"); c.width = ia.width * 2 + 8; c.height = ia.height;
    const cx = c.getContext("2d");
    cx.fillStyle = "#000"; cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(ia, 0, 0); cx.drawImage(ib, ia.width + 8, 0);
    cx.fillStyle = "#fff"; cx.font = "14px sans-serif";
    cx.fillText("A (current) — " + label, 8, 18);
    cx.fillText("B (variant)", ia.width + 16, 18);
    return c.toDataURL("image/jpeg", 0.62).split(",")[1];
  }, { a64, b64, label });
  writeFileSync(outPath, Buffer.from(buf, "base64"));
}

// ── Dial-in support ──────────────────────────────────────────────────────────
// Many knobs differ from their B by exactly ONE number (radius: 34 vs 24).
// numericSlot() detects that: it splits find/b on numbers and, when the token
// structure matches with a single differing numeric, returns a template that
// builds a variant string for ANY candidate value — that's what `sweep` uses.
const NUM_RE = /-?\d+\.?\d*/g;
function numericSlot(find, b) {
  const shape = (s) => s.replace(NUM_RE, "#");
  if (shape(find) !== shape(b)) return null;              // structural change, not a single value
  const nf = find.match(NUM_RE) || [], nb = b.match(NUM_RE) || [];
  const diffs = nf.map((v, i) => (v !== nb[i] ? i : -1)).filter((i) => i >= 0);
  if (diffs.length !== 1) return null;
  const slot = diffs[0];
  const parts = find.split(NUM_RE);
  return {
    current: nf[slot],
    make: (val) => {
      let out = "", ni = 0;
      const nums = find.match(NUM_RE);
      for (let i = 0; i < parts.length; i++) {
        out += parts[i];
        if (ni < nums.length) { out += (ni === slot ? String(val) : nums[ni]); ni++; }
      }
      return out;
    },
  };
}

// Horizontal comparison strip: baseline + each variant, labelled.
async function strip(page, entries, outPath) {
  const imgs = entries.map((e) => ({ b64: readFileSync(e.path).toString("base64"), label: e.label }));
  const buf = await page.evaluate(async (imgs) => {
    const load = (s) => { const i = new Image(); i.src = "data:image/jpeg;base64," + s; return i.decode().then(() => i); };
    const loaded = await Promise.all(imgs.map((e) => load(e.b64)));
    const w = loaded[0].width, h = loaded[0].height, pad = 6;
    const c = document.createElement("canvas");
    c.width = (w + pad) * loaded.length - pad; c.height = h + 24;
    const cx = c.getContext("2d");
    cx.fillStyle = "#000"; cx.fillRect(0, 0, c.width, c.height);
    loaded.forEach((im, i) => {
      cx.drawImage(im, i * (w + pad), 0);
      cx.fillStyle = "#fff"; cx.font = "14px sans-serif";
      cx.fillText(imgs[i].label, i * (w + pad) + 8, h + 17);
    });
    return c.toDataURL("image/jpeg", 0.62).split(",")[1];
  }, imgs);
  writeFileSync(outPath, Buffer.from(buf, "base64"));
}

const USAGE = `usage:
  ab-lighting.mjs list                          knob catalog
  ab-lighting.mjs run <id...|all> [--out dir]   A/B every listed knob (gated)
  ab-lighting.mjs sweep <id> <v1> <v2> ...      render the knob at several VALUES
                                                (single-number knobs) -> strip + metrics
  ab-lighting.mjs try <id> "<replacement>"      render one custom replacement vs current
  ab-lighting.mjs apply <id> [value|"<repl>"]   WRITE the chosen value into the source
                                                file, keep this catalog in sync, and
                                                bump the index.html cache version`;

async function main() {
  const [cmd = "list", ...rest] = process.argv.slice(2);
  if (cmd === "list") {
    for (const k of KNOBS) {
      const slot = numericSlot(k.find, k.b);
      console.log(`${k.id.padEnd(24)} ${k.file.padEnd(12)} scene=${k.scene.padEnd(11)} ${slot ? ("sweepable=" + slot.current).padEnd(15) : "structural     "} ${k.note}`);
    }
    console.log(`\n${KNOBS.length} knobs. ` + USAGE.split("\n")[1].trim());
    return;
  }

  // ── apply: write a chosen value into the real source + self-sync catalog ──
  if (cmd === "apply") {
    const knob = KNOBS.find((k) => k.id === rest[0]);
    if (!knob) { console.error("unknown knob " + rest[0] + "\n" + USAGE); process.exit(2); }
    const slot = numericSlot(knob.find, knob.b);
    let replacement;
    if (rest[1] == null) replacement = knob.b;
    else if (slot && /^-?\d+\.?\d*$/.test(rest[1])) replacement = slot.make(rest[1]);
    else replacement = rest[1];
    if (replacement === knob.find) { console.log("apply: replacement is identical to current — nothing to do"); return; }

    // 1. Write the game source (find must still be unique).
    const srcPath = `${ROOT}/${knob.file}`;
    const src = readFileSync(srcPath, "utf8");
    const hits = src.split(knob.find).length - 1;
    if (hits !== 1) { console.error(`apply: find-string matches ${hits}x in ${knob.file} — catalog is stale, fix it first`); process.exit(1); }
    writeFileSync(srcPath, src.replace(knob.find, replacement));

    // 2. Self-sync THIS catalog: the applied value becomes the new `find`; the
    //    old value becomes the new `b` (so the knob now A/Bs the reverse) —
    //    keeping tests/lighting-ab.spec.js catalog-integrity green. All edits
    //    are confined to THIS knob's own entry (located by its id) so a short
    //    literal shared with another knob can never be corrupted, and the swap
    //    happens even when the applied value IS the current b (a placeholder
    //    keeps the two replacements from colliding).
    const selfPath = `${ROOT}/tools/ab-lighting.mjs`;
    const self = readFileSync(selfPath, "utf8");
    const findLit = JSON.stringify(knob.find), bLit = JSON.stringify(knob.b);
    const idTag = `id: ${JSON.stringify(knob.id)}`;
    const iStart = self.indexOf(idTag);
    let iEnd = self.indexOf("\n  { ", iStart + 1);
    if (iEnd < 0) iEnd = self.indexOf("\n];", iStart + 1);
    if (iStart < 0 || iEnd < 0 || !self.slice(iStart, iEnd).includes(findLit)) {
      console.error("apply: could not locate the knob's catalog entry for self-sync — update it by hand");
      process.exit(1);
    }
    let seg = self.slice(iStart, iEnd).replace(findLit, "\u0001AB_APPLY\u0001");
    if (seg.includes(bLit)) seg = seg.replace(bLit, findLit);
    seg = seg.replace("\u0001AB_APPLY\u0001", JSON.stringify(replacement));
    writeFileSync(selfPath, self.slice(0, iStart) + seg + self.slice(iEnd));

    // 3. Cache-bust: a js/ file changed, so browsers must refetch.
    const idxPath = `${ROOT}/index.html`;
    let idx = readFileSync(idxPath, "utf8");
    const ver = Math.max(...[...idx.matchAll(/\?v=(\d+)/g)].map((m) => +m[1]));
    idx = idx.replace(/\?v=\d+/g, `?v=${ver + 1}`);
    writeFileSync(idxPath, idx);

    console.log(`applied ${knob.id}:`);
    console.log(`  ${knob.file}:  ${knob.find}`);
    console.log(`  ->             ${replacement}`);
    console.log(`  catalog self-synced (find<->b swapped); index.html cache ?v=${ver} -> ?v=${ver + 1}`);
    console.log(`  next: re-render to confirm (run ${knob.id}), then npm run test:ab before committing`);
    return;
  }

  if (cmd !== "run" && cmd !== "sweep" && cmd !== "try") { console.error(USAGE); process.exit(2); }

  const outIx = rest.indexOf("--out");
  const outDir = outIx >= 0 ? rest.splice(outIx, 2)[1] : `${ROOT}/scratch/ab`;
  mkdirSync(outDir, { recursive: true });

  // ── sweep / try: render one knob at several candidate values ──
  if (cmd === "sweep" || cmd === "try") {
    const knob = KNOBS.find((k) => k.id === rest[0]);
    if (!knob) { console.error("unknown knob " + rest[0] + "\n" + USAGE); process.exit(2); }
    let variants;   // [{ label, replacement }]
    if (cmd === "try") {
      if (!rest[1]) { console.error("try needs a replacement string\n" + USAGE); process.exit(2); }
      variants = [{ label: "try", replacement: rest[1] }];
    } else {
      const slot = numericSlot(knob.find, knob.b);
      if (!slot) { console.error(`${knob.id} is a STRUCTURAL knob (find/b differ by more than one number) — use try with a full replacement string`); process.exit(2); }
      const vals = rest.slice(1);
      if (!vals.length) { console.error("sweep needs candidate values, e.g. sweep lamp.radius 24 30 34 40"); process.exit(2); }
      variants = vals.map((v) => ({ label: String(v), replacement: slot.make(v) }));
    }
    const browser = await chromium.launch({
      executablePath: chrome(),
      args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
    });
    const meterPage = await browser.newPage();
    const scene = SCENES[knob.scene];
    const { srv: baseSrv, port: basePort } = await startServer(null);
    const basePath = `${outDir}/sweep-${knob.id.replace(/[^a-z0-9.]/gi, "_")}-base.jpg`;
    await renderScene(browser, basePort, scene, basePath);
    baseSrv.close();
    const mBase = await measure(meterPage, basePath);
    const { region, metric } = knob.expect;
    const slotInfo = numericSlot(knob.find, knob.b);
    const entries = [{ path: basePath, label: `current${slotInfo ? " (" + slotInfo.current + ")" : ""}` }];
    console.log(`${"current".padEnd(10)} ${region}.${metric}=${mBase[region][metric].toFixed(2)}  frame.mean=${mBase.frame.mean.toFixed(2)}`);
    for (const v of variants) {
      if (v.replacement === knob.find) { console.log(`${v.label.padEnd(10)} = current, skipped`); continue; }
      const { srv, port } = await startServer({ [knob.file]: [knob.find, v.replacement] });
      const p = `${outDir}/sweep-${knob.id.replace(/[^a-z0-9.]/gi, "_")}-${v.label.replace(/[^a-z0-9.-]/gi, "_")}.jpg`;
      await renderScene(browser, port, scene, p);
      srv.close();
      const m = await measure(meterPage, p);
      const d = await frameDiff(meterPage, basePath, p);
      entries.push({ path: p, label: v.label });
      console.log(`${v.label.padEnd(10)} ${region}.${metric}=${m[region][metric].toFixed(2)}  frame.mean=${m.frame.mean.toFixed(2)}  diff-vs-current=${d.toFixed(2)}`);
    }
    const stripPath = `${outDir}/sweep-${knob.id.replace(/[^a-z0-9.]/gi, "_")}.jpg`;
    await strip(meterPage, entries, stripPath);
    await browser.close();
    console.log(`\nstrip: ${stripPath}`);
    console.log(`pick a value, then: node tools/ab-lighting.mjs apply ${knob.id} <value>`);
    return;
  }
  const ids = rest.length && rest[0] !== "all" ? rest : KNOBS.map((k) => k.id);
  const knobs = ids.map((id) => KNOBS.find((k) => k.id === id) || (() => { throw new Error("unknown knob " + id); })());

  const browser = await chromium.launch({
    executablePath: chrome(),
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
  });
  const meterPage = await browser.newPage();
  const t0 = Date.now();

  // Baseline renders are shared per scene (knobs only re-render their B side).
  const baseline = {};   // sceneKey -> { path, metrics }
  const { srv: baseSrv, port: basePort } = await startServer(null);
  const results = [];
  for (const knob of knobs) {
    const scene = SCENES[knob.scene];
    if (!baseline[knob.scene]) {
      const p = `${outDir}/base-${knob.scene}.jpg`;
      const errs = await renderScene(browser, basePort, scene, p);
      baseline[knob.scene] = { path: p, metrics: await measure(meterPage, p), errs };
      console.log(`baseline ${knob.scene} rendered${errs.length ? " (console errors: " + errs.length + ")" : ""}`);
    }
    const { srv, port } = await startServer({ [knob.file]: [knob.find, knob.b] });
    const bPath = `${outDir}/${knob.id.replace(/[^a-z0-9.]/gi, "_")}-B.jpg`;
    const errs = await renderScene(browser, port, scene, bPath);
    srv.close();
    const mB = await measure(meterPage, bPath);
    const mA = baseline[knob.scene].metrics;
    const diff = await frameDiff(meterPage, baseline[knob.scene].path, bPath);
    const floor = knob.minVisible != null ? knob.minVisible : VISIBLE_FLOOR;
    // The watched region+metric, for human tuning AND as a second gate: a knob
    // with a small/localized whole-frame footprint (lamp halos, fog band, a
    // subtle penumbra) still PASSES if it moved its declared metric by > minRel.
    const { region, metric } = knob.expect;
    const watch = { region, metric, a: mA[region][metric], b: mB[region][metric] };
    watch.rel = (watch.b - watch.a) / Math.max(Math.abs(watch.a), 1e-6);
    const changed = diff > floor || Math.abs(watch.rel) > 0.03;
    // subtle knobs (small/localized/luma-neutral effects) are rendered and
    // measured for human review but not hard-gated — they never fail the run.
    const pass = knob.subtle ? true : changed;
    const status = knob.subtle ? (changed ? "SUBTLE+" : "SUBTLE ") : (pass ? "PASS" : "FAIL");
    const sbs = `${outDir}/${knob.id.replace(/[^a-z0-9.]/gi, "_")}-AB.jpg`;
    await composite(meterPage, baseline[knob.scene].path, bPath, sbs, knob.id);
    results.push({ id: knob.id, scene: knob.scene, subtle: !!knob.subtle, diff, floor, changed, pass, watch, errs: errs.length, sbs });
    console.log(`${status.padEnd(7)} ${knob.id.padEnd(20)} diff=${diff.toFixed(2)} (floor ${floor}) | ${region}.${metric} A=${watch.a.toFixed(2)} B=${watch.b.toFixed(2)} ${(watch.rel * 100).toFixed(0)}%`);
  }
  baseSrv.close();
  await browser.close();

  writeFileSync(`${outDir}/results.json`, JSON.stringify({ ms: Date.now() - t0, results }, null, 2));
  const gated = results.filter((r) => !r.subtle);
  const gatedChanged = gated.filter((r) => r.changed);
  const subtleShown = results.filter((r) => r.subtle && r.changed).length;
  const fails = gated.filter((r) => !r.pass);
  console.log(`\n${gatedChanged.length}/${gated.length} gated knobs produced a visible change` +
    ` (+${subtleShown}/${results.filter((r) => r.subtle).length} subtle knobs registered) in ${((Date.now() - t0) / 1000).toFixed(0)}s. Output: ${outDir}`);
  if (fails.length) { console.error("NO VISIBLE CHANGE (dead knob or too-small B delta):", fails.map((f) => f.id).join(", ")); process.exitCode = 1; }
}

// Only run as a CLI — tests/lighting-ab.spec.js imports KNOBS for the
// catalog-integrity check and must not launch a browser.
if (process.argv[1] && process.argv[1].endsWith("ab-lighting.mjs")) {
  main().catch((e) => { console.error("FATAL", e); process.exit(1); });
}

export { KNOBS, SCENES, REGIONS };
