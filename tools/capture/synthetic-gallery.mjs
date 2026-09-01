#!/usr/bin/env node
/*
 * @doc Wide gallery of the synthetic scenery models — many circuits / angles / times of day into one contact sheet.
 * @skill asset-pack
 * Wide gallery for synthetic scenery models — many circuits / angles / TOD.
 * Uses page.screenshot (not canvas locator) to avoid SwiftShader hangs.
 * Prefetches Assets.loadModels() before race() so bakedModel() placements mesh.
 */
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
} from "../harness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const outDir = resolve("/opt/cursor/artifacts/synthetic-models/gallery");
mkdirSync(outDir, { recursive: true });

/** @type {{ id: string, track: string, frac: number, az: number, el: number, dist: number, tod?: string }[]} */
const SHOTS = [];

function add(track, name, frac, az, el, dist, tod = "day") {
  SHOTS.push({
    id: `${track}-${name}`,
    track,
    frac,
    az,
    el,
    dist,
    tod,
  });
}

function multiAngle(track, tag, frac, base = {}) {
  const dist = base.dist ?? 70;
  const el = base.el ?? 14;
  const tod = base.tod ?? "day";
  const azs = base.azs ?? [-110, -70, -30, 30, 70, 110];
  for (const az of azs) {
    add(track, `${tag}-az${az}`, frac, az, el, dist, tod);
  }
  if (base.close) {
    add(track, `${tag}-close`, frac, base.closeAz ?? -90, 8, Math.max(28, dist * 0.45), tod);
  }
  if (base.high) {
    add(track, `${tag}-high`, frac, base.highAz ?? -95, 26, dist * 1.35, tod);
  }
}

// ─── Monza (paddock / warehouses / stands / barriers — primary bakedModel circuit)
multiAngle("monza", "paddock", 0.97, { dist: 110, el: 18, close: true, high: true });
multiAngle("monza", "warehouses", 0.94, { dist: 55, el: 10, azs: [-120, -90, -60], close: true });
add("monza", "chimney-tank", 0.95, -120, 18, 65);
add("monza", "rettifilo-barriers", 0.04, 100, 6, 20);
add("monza", "rettifilo-cones", 0.04, 70, 4, 14);
add("monza", "rettifilo-wide", 0.05, 40, 12, 45);
multiAngle("monza", "main-stand", 0.01, { dist: 80, el: 14, azs: [-90, 90, 0], close: true, high: true });
add("monza", "parabolica", 0.88, -60, 14, 70);
add("monza", "parabolica-in", 0.86, -40, 10, 40);
add("monza", "lesmo", 0.35, 80, 12, 55);
add("monza", "lesmo-out", 0.38, 100, 16, 70);
add("monza", "ascari", 0.62, -70, 12, 55);
add("monza", "variante-ascari", 0.65, 50, 10, 40);
add("monza", "roggia", 0.31, -80, 12, 50);
add("monza", "dusk-paddock", 0.97, -100, 18, 100, "dusk");
add("monza", "dusk-stand", 0.01, -90, 14, 75, "dusk");
add("monza", "night-paddock", 0.97, -100, 16, 90, "night");
add("monza", "night-rettifilo", 0.04, 90, 8, 35, "night");
add("monza", "dawn-paddock", 0.97, -105, 20, 100, "dawn");

// ─── Spa
multiAngle("spa", "eau-rouge", 0.14, { dist: 70, el: 14, azs: [-50, -20, 30], close: true, high: true });
add("spa", "raidillon", 0.18, 100, 16, 70);
add("spa", "raidillon-crest", 0.2, 80, 22, 90);
multiAngle("spa", "lasource", 0.02, { dist: 35, el: 10, azs: [60, 95, 130], close: true });
multiAngle("spa", "stavelot", 0.76, { dist: 85, el: 16, azs: [-110, -85, -50], close: true, high: true });
multiAngle("spa", "paddock", 0.98, { dist: 80, el: 16, azs: [-110, -80], close: true });
add("spa", "bus-stop", 0.94, 70, 12, 55);
add("spa", "pouhon", 0.42, -60, 14, 65);
add("spa", "campus", 0.62, 90, 12, 55);
add("spa", "blanchimont", 0.72, -100, 10, 50);
add("spa", "dusk-stavelot", 0.76, -95, 14, 80, "dusk");
add("spa", "night-paddock", 0.98, -100, 14, 70, "night");

// ─── Silverstone
multiAngle("silverstone", "paddock", 0.95, { dist: 95, el: 18, close: true, high: true });
add("silverstone", "wing", 0.55, 70, 16, 75);
add("silverstone", "wing-low", 0.55, 90, 8, 40);
add("silverstone", "barriers", 0.04, 95, 6, 18);
add("silverstone", "copse", 0.22, -60, 12, 55);
add("silverstone", "maggotts", 0.34, 50, 14, 60);
add("silverstone", "beckley", 0.38, -40, 12, 50);
add("silverstone", "stowe", 0.63, 80, 14, 65);
add("silverstone", "club", 0.94, -70, 12, 55);
add("silverstone", "abbey", 0.07, 100, 10, 45);
add("silverstone", "dusk-paddock", 0.95, -100, 16, 90, "dusk");
add("silverstone", "night-wing", 0.55, 70, 14, 70, "night");

// ─── Monaco (city / buildings)
multiAngle("monaco", "casino", 0.35, { dist: 50, el: 16, azs: [70, 90, 120], close: true, high: true });
add("monaco", "ste-devote", 0.07, -60, 12, 40);
add("monaco", "beau-rivage", 0.15, 80, 18, 55);
add("monaco", "massenet", 0.25, -90, 14, 45);
add("monaco", "mirabeau", 0.4, 60, 12, 35);
add("monaco", "loews", 0.43, -40, 10, 30);
add("monaco", "portier", 0.48, 20, 8, 35);
add("monaco", "tunnel", 0.5, 0, 6, 30);
add("monaco", "chicane", 0.55, -70, 12, 45);
add("monaco", "harbour", 0.58, -90, 14, 55);
add("monaco", "tabac", 0.64, 100, 10, 40);
add("monaco", "swimming", 0.72, 100, 12, 45);
add("monaco", "rascasse", 0.91, 80, 14, 40);
add("monaco", "anthony-noghes", 0.95, -70, 10, 35);
add("monaco", "night-casino", 0.35, 90, 16, 50, "night");
add("monaco", "dusk-harbour", 0.55, -80, 12, 50, "dusk");

// ─── Vegas
multiAngle("vegas", "strip", 0.12, { dist: 85, el: 18, tod: "dusk", azs: [-90, -70, -40], close: true, high: true });
add("vegas", "towers", 0.15, -90, 24, 110, "dusk");
add("vegas", "towers-day", 0.15, -90, 22, 100, "day");
add("vegas", "night-strip", 0.2, 60, 16, 70, "night");
add("vegas", "day-strip", 0.12, -70, 16, 80, "day");
add("vegas", "sphere-area", 0.3, 80, 18, 90, "dusk");
add("vegas", "paddock", 0.98, -100, 14, 70, "night");

// ─── Suzuka
multiAngle("suzuka", "130r", 0.72, { dist: 70, el: 14, azs: [-100, -80, -40], close: true });
add("suzuka", "paddock", 0.98, -100, 18, 90);
add("suzuka", "paddock-low", 0.985, -80, 8, 40);
add("suzuka", "s-curves", 0.2, 70, 12, 50);
add("suzuka", "degner", 0.34, -60, 14, 55);
add("suzuka", "hairpin", 0.48, 90, 12, 45);
add("suzuka", "spoon", 0.65, -70, 14, 60);
add("suzuka", "casio", 0.85, 50, 12, 50);
add("suzuka", "dusk-130r", 0.72, -80, 14, 70, "dusk");

// ─── Interlagos
multiAngle("interlagos", "senna", 0.08, { dist: 55, el: 14, azs: [50, 70, 100], close: true });
add("interlagos", "paddock", 0.95, -100, 18, 85);
add("interlagos", "paddock-low", 0.96, -80, 8, 40);
add("interlagos", "descida", 0.25, -50, 16, 60);
add("interlagos", "ferradura", 0.4, 80, 12, 50);
add("interlagos", "pinheirinho", 0.55, -70, 14, 55);
add("interlagos", "bico", 0.75, 90, 12, 50);
add("interlagos", "dusk-senna", 0.08, 70, 14, 55, "dusk");

// ─── Bahrain
multiAngle("bahrain", "paddock", 0.97, { dist: 90, el: 16, tod: "dusk", azs: [-110, -90, -60], close: true });
add("bahrain", "night-mid", 0.5, 80, 12, 60, "night");
add("bahrain", "night-paddock", 0.97, -100, 14, 80, "night");
add("bahrain", "sakhir", 0.2, -70, 14, 55, "dusk");
add("bahrain", "oasis", 0.65, 60, 12, 50, "dusk");
add("bahrain", "day-paddock", 0.97, -100, 16, 85, "day");

// ─── Albert Park (melbourne)
multiAngle("albert_park", "albert", 0.3, { dist: 65, el: 14, azs: [-90, -70, -40], close: true });
add("albert_park", "paddock", 0.98, -100, 16, 80);
add("albert_park", "lakeside", 0.5, 80, 12, 55);
add("albert_park", "chicane", 0.7, -60, 10, 45);
add("albert_park", "dusk", 0.3, -70, 14, 65, "dusk");

// ─── Shanghai
multiAngle("shanghai", "hairpin", 0.55, { dist: 55, el: 14, azs: [70, 90, 120], close: true });
add("shanghai", "paddock", 0.97, -100, 16, 85);
add("shanghai", "t1", 0.04, 80, 12, 50);
add("shanghai", "esses", 0.25, -50, 14, 55);
add("shanghai", "back", 0.7, 60, 12, 50);
add("shanghai", "dusk-hairpin", 0.55, 90, 14, 55, "dusk");

// ─── Extra season circuits (breadth)
for (const [track, spots] of [
  ["singapore", [[0.1, "t1"], [0.4, "mid"], [0.7, "stadium"], [0.95, "paddock"]]],
  ["cota", [[0.05, "t1"], [0.3, "esses"], [0.55, "stadium"], [0.95, "paddock"]]],
  ["jeddah", [[0.08, "t1"], [0.4, "mid"], [0.75, "fast"], [0.97, "paddock"]]],
  ["zandvoort", [[0.1, "t1"], [0.4, "bank"], [0.7, "mid"], [0.96, "paddock"]]],
  ["imola", [[0.08, "tamburello"], [0.35, "tosa"], [0.65, "acquaminerale"], [0.95, "paddock"]]],
  ["hungaroring", [[0.08, "t1"], [0.4, "mid"], [0.7, "chicane"], [0.96, "paddock"]]],
  ["redbull", [[0.1, "t1"], [0.35, "stadium"], [0.7, "mid"], [0.95, "paddock"]]],
  ["baku", [[0.05, "castle"], [0.35, "city"], [0.7, "straight"], [0.96, "paddock"]]],
  ["miami", [[0.1, "t1"], [0.4, "mid"], [0.75, "marina"], [0.96, "paddock"]]],
  ["mexico", [[0.08, "t1"], [0.4, "stadium"], [0.7, "mid"], [0.96, "paddock"]]],
  ["abudhabi", [[0.1, "t1"], [0.4, "hotel"], [0.7, "mid"], [0.96, "paddock"]]],
  ["montreal", [[0.08, "senna"], [0.35, "casino"], [0.7, "hairpin"], [0.95, "paddock"]]],
]) {
  for (const [frac, tag] of spots) {
    add(track, tag, frac, -90, 14, 70);
    add(track, `${tag}-alt`, frac, 70, 12, 50);
  }
  add(track, "dusk", spots[1][0], -80, 14, 65, "dusk");
}

console.log(`gallery plan: ${SHOTS.length} shots across ${new Set(SHOTS.map((s) => s.track)).size} circuits`);

const srv = await startStaticServer(ROOT);
const browser = await launchChromium({
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(srv.url);
await page.waitForFunction(() => window.__apex != null, { timeout: 15_000 });

const manifest = { outDir, models: null, shots: [], errors: [], planned: SHOTS.length };
let lastTrack = null;

try {
  const models = await page.evaluate(async () => {
    if (typeof Assets === "undefined" || !Assets.loadModels) return [];
    await Assets.loadModels();
    if (Assets.load) await Assets.load({ tier: "high" }).catch(() => {});
    return Assets.models();
  });
  manifest.models = models;
  console.log(`models loaded: ${models.length}; shots: ${SHOTS.length}`);

  for (let i = 0; i < SHOTS.length; i++) {
    const shot = SHOTS[i];
    try {
      if (shot.track !== lastTrack) {
        await page.evaluate((id) => window.__apex.race(id), shot.track);
        await page.waitForFunction(
          (id) => window.__apex.info && window.__apex.info().track === id,
          shot.track,
          { timeout: 45_000, polling: 100 }
        );
        await sleep(1000);
        lastTrack = shot.track;
      }

      const frame = await page.evaluate((s) => {
        const a = window.__apex;
        a.go();
        a.park(s.frac);
        a.freeze(true);
        if (a.setTimeOfDay) a.setTimeOfDay(s.tod || "day");
        if (a.hud) a.hud(false);
        a.orbit(s.frac, s.az, s.el, s.dist);
        if (a.step) a.step(1 / 60, 6);
        const cs = a.camState ? a.camState() : null;
        return { dbg: !!(cs && cs.debug) };
      }, shot);
      await sleep(220);

      const file = `${shot.id}.png`;
      const path = resolve(outDir, file);
      const buf = await page.screenshot({ path, type: "png" });
      const rec = {
        ...shot,
        file,
        bytes: buf.length,
        dbgCam: frame.dbg,
        blank: buf.length < 5000,
      };
      manifest.shots.push(rec);
      const mark = rec.blank ? " BLANK" : frame.dbg ? "" : " NO-DBG";
      console.log(`[${i + 1}/${SHOTS.length}] ${file}  ${(buf.length / 1024).toFixed(0)} KB${mark}`);
    } catch (e) {
      console.error(`FAIL ${shot.id}: ${e.message}`);
      manifest.errors.push({ id: shot.id, error: e.message });
      lastTrack = null;
    }
  }
} finally {
  writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await shutdown();
  await srv.close();
}

console.log(
  `done ${manifest.shots.length}/${SHOTS.length} ok, ${manifest.errors.length} errors → ${outDir}`
);
if (manifest.errors.length > manifest.shots.length / 2) process.exitCode = 1;
