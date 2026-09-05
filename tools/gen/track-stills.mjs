#!/usr/bin/env node
// track-stills — the in-game hero stills behind the circuit picker.
// @doc One car-free in-game still per circuit into `assets/stills/<id>.webp` for the picker hero (`--only`, `--frac`, `--force`).
// @skill playwright-probe
//
//   node tools/gen/track-stills.mjs                  # every circuit missing a still
//   node tools/gen/track-stills.mjs --force          # re-shoot all of them
//   node tools/gen/track-stills.mjs --only monza,spa # a subset
//   node tools/gen/track-stills.mjs --frac 0.12      # lap fraction (default 0.06)
//
// One headless Chromium, one page, every circuit in turn: __apex.tt(id) builds
// the world SOLO (no rivals), the player is parked half a lap away so no car is
// in frame, and a TV-style free camera looks down the road at the circuit's
// SIGNATURE section (HERO below — Eau Rouge, Turn 8, the Casino climb), HUD
// off, at the time of day the table picks for the mood (night races stay night).
// The still is the PLACE, not the race: the picker's hero shows where you are
// about to drive, and the outline drawn over it says which way the lap goes. The 1280x720 canvas clip is
// downsampled to STILL_W x STILL_H WebP — ~30 KB a circuit, cheap enough to
// ship for the whole catalogue and load lazily (js/ui/select-screen.js only
// asks for the selected circuit's still).
//
// Same staging as tools/shot/shot.mjs (boot budget, models before the build,
// free-cam without snapCam, clip screenshot instead of locator.screenshot).
// `--frac` overrides HERO for every circuit shot in that run.
// Output is a committed asset, not a scratch capture: the select screen reads
// assets/stills/<id>.webp and falls back to a gradient when the file is absent,
// so a missing still degrades the look, never the screen.
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const OUT_DIR = resolve(ROOT, "assets", "stills");
export const STILL_W = 800, STILL_H = 450;

function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i < 0 || i + 1 >= argv.length ? fallback : argv[i + 1];
}
const argv = process.argv.slice(2);
const force = argv.includes("--force");
const fracArg = flag(argv, "--frac", "");

// The signature section per circuit — [arc lap fraction, time of day].
// The fraction is in the frame Tracks.sample() and __apex.orbit() read
// (docs/tracks/<id>.md quotes its landmarks in this frame; the frac-keyed
// grandstand tables in js/circuits/ are in the scenery-shifted frame and must
// NOT be copied here). The time of day is a MOOD choice, not the race's: a
// catalogue shot entirely at noon reads as one photo forty times, so the
// stills spread across dawn / day / dusk / night. "default" keeps the
// circuit's own — the seven night races stay night. A circuit missing from
// the table gets the first braking zone at the circuit default.
const HERO = {
  abudhabi:     [0.88,  "default"], // under the Yas Hotel gridshell (night race)
  albert_park:  [0.47,  "dawn"],    // the lakeside run
  bahrain:      [0.10,  "default"], // the Turn 1 hairpin (night race)
  baku:         [0.44,  "default"], // the Old City castle squeeze (night)
  buenos_aires: [0.06,  "dusk"],
  catalunya:    [0.44,  "day"],     // the Campsa crest
  cota:         [0.10,  "dusk"],    // the Turn 1 climb
  estoril:      [0.88,  "dawn"],    // into the Parabolica
  hockenheim:   [0.46,  "day"],     // the Spitzkehre
  hungaroring:  [0.04,  "day"],     // the downhill Turn 1
  imola:        [0.12,  "dawn"],    // Tamburello
  indianapolis: [0.88,  "dusk"],    // the banked sweep onto the straight
  interlagos:   [0.06,  "dusk"],    // the Senna S plunge
  istanbul:     [0.40,  "day"],     // Turn 8
  jacarepagua:  [0.06,  "day"],
  jeddah:       [0.50,  "default"], // the fast mid-lap sweeps (night race)
  kyalami:      [0.80,  "dusk"],    // the plunge to the main straight
  madrid:       [0.50,  "day"],     // El Búnker
  magny_cours:  [0.24,  "dawn"],    // Estoril
  mexico:       [0.80,  "dusk"],    // the Foro Sol stadium
  miami:        [0.06,  "day"],
  monaco:       [0.18,  "dusk"],    // the climb to Casino Square
  montreal:     [0.96,  "day"],     // the Wall of Champions
  monza:        [0.172, "dawn"],    // the gateway into Curva Grande
  mugello:      [0.52,  "day"],     // the Arrabbiate climb
  nurburgring:  [0.05,  "dawn"],    // the Mercedes-Arena
  paul_ricard:  [0.50,  "day"],     // Signes at the end of the Mistral
  portimao:     [0.06,  "dusk"],    // the plunge into Turn 1
  qatar:        [0.12,  "default"], // (night race)
  redbull:      [0.18,  "dawn"],    // the Remus crest
  sepang:       [0.06,  "dusk"],
  shanghai:     [0.06,  "day"],     // the snail
  silverstone:  [0.12,  "dawn"],    // Maggotts / Becketts
  singapore:    [0.714, "default"], // City Hall (night race)
  sochi:        [0.10,  "dusk"],    // the long Turn 3
  spa:          [0.07,  "dawn"],    // Eau Rouge in the mist
  suzuka:       [0.16,  "dusk"],    // the Esses
  vegas:        [0.60,  "default"], // the Strip (night race)
  watkins_glen: [0.70,  "day"],     // the climb out of the Boot
  zandvoort:    [0.15,  "dawn"],    // the Hugenholtz bowl
};
const heroOf = (id) => {
  const h = HERO[id] || [0.06, "default"];
  return { frac: fracArg ? parseFloat(fracArg) : h[0], tod: h[1] };
};
const only = (flag(argv, "--only", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const WAIT_MS = Math.max(5, parseFloat(flag(argv, "--wait", "180"))) * 1000;

const circuits = readdirSync(resolve(ROOT, "js", "circuits"))
  .filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, ""))
  .filter((id) => !only.length || only.includes(id))
  .filter((id) => force || !existsSync(resolve(OUT_DIR, id + ".webp")));

if (!circuits.length) { console.log("track-stills: nothing to shoot"); process.exit(0); }
mkdirSync(OUT_DIR, { recursive: true });

const srv = await startStaticServer(ROOT);
try {
  const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // domcontentloaded, not load: a cold SwiftShader boot can hold the load
  // event past Playwright's 30 s default while the page is perfectly alive;
  // the __apex wait below is the real readiness signal.
  await page.goto(srv.url, { waitUntil: "domcontentloaded", timeout: WAIT_MS });
  await page.waitForFunction(() => window.__apex != null, null, { timeout: WAIT_MS, polling: 100 });
  await page.evaluate(async () => {
    if (typeof Assets !== "undefined" && Assets.loadModels) { try { await Assets.loadModels(); } catch (_) { /* procedural look */ } }
  });
  const failed = [];
  for (const id of circuits) {
    const t0 = Date.now();
    try {
    const { frac, tod } = heroOf(id);
    // tt(), not race(): time trial is solo, so the only car on the circuit is
    // the player — parked half a lap from the camera below.
    await page.evaluate(({ id, tod }) => window.__apex.tt(id, tod), { id, tod });
    await page.waitForFunction((id) => {
      const i = window.__apex.info();
      return i && i.track === id;
    }, id, { timeout: WAIT_MS, polling: 100 });
    await sleep(1200);
    await page.evaluate(({ frac }) => {
      const a = window.__apex;
      a.go(); a.park((frac + 0.5) % 1); a.freeze(true);
      if (a.hud) a.hud(false);
      // TV camera: 42 m behind the section, a touch to the right, 11 degrees
      // up, looking down the road so the shape of the section reads. A free
      // cam sets G.dbgCam directly — never snapCam() after it (that clears it).
      a.orbit(frac, 155, 11, 42, 1.5, { fov: 50 });
      a.step && a.step(1 / 60, 4);
      // Every DOM overlay off the frame — the screenshot clips the page, not the
      // canvas, so the CAM badge and any HUD chip would bake into the still.
      for (const el of document.body.children) if (el.id !== "game" && el.tagName !== "CANVAS") el.style.visibility = "hidden";
    }, { frac });
    await sleep(500);
    // 240 s, not Playwright's 30 s or shot.mjs's 60 s: a night street circuit
    // (Singapore, Las Vegas — thousands of lit windows) costs SwiftShader
    // several seconds a frame, and the screenshot waits for a frame. Under
    // load those two timed out three passes running while every other
    // circuit shot in under 90 s.
    const box = await page.locator("canvas#game").boundingBox({ timeout: 30000 }).catch(() => null);
    const png = box
      ? await page.screenshot({ clip: box, timeout: 240000, animations: "disabled" })
      : await page.screenshot({ timeout: 240000, animations: "disabled" });
    const webp = await sharp(png).resize(STILL_W, STILL_H, { fit: "cover" }).webp({ quality: 78 }).toBuffer();
    writeFileSync(resolve(OUT_DIR, id + ".webp"), webp);
    console.log(`${id} @${frac} ${tod}: ${(webp.length / 1024).toFixed(1)} KB in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } catch (err) {
      // One circuit's timeout (a SwiftShader screenshot past 60 s under load)
      // must not end the batch: log it, move on, re-run for the missing ones.
      failed.push(id);
      console.error(`${id}: FAILED — ${err.message.split("\n")[0]}`);
    }
  }
  if (failed.length) { console.error(`track-stills: ${failed.length} failed: ${failed.join(", ")} — re-run to retry the missing ones`); process.exitCode = 1; }
} catch (err) {
  console.error("track-stills failed:", err.message);
  process.exitCode = 1;
} finally {
  await shutdown();
}
