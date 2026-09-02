#!/usr/bin/env node
/*
 * @doc Curated free-cam gallery of `bakedModel` sites (Monza/Spa/Silverstone/Monaco/Vegas); PNGs + `manifest.json`.
 * @skill playwright-probe / scenery-dress
 * Apex 26 — scenery / baked-model screenshot gallery.
 *
 * Framed free-cam shots that wait for Assets.loadModels() before race() so
 * api.bakedModel() placements are actually in the prop mesh. Writes PNGs under
 * artifacts/ (or --out DIR) and prints a JSON manifest.
 *
 *   node tools/capture/baked-scenery.mjs
 *   node tools/capture/baked-scenery.mjs --out /opt/cursor/artifacts/baked-models
 *
 * Does NOT call snapCam after orbit/view (see mcp-probe / DEBUG-HOOKS).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
} from "../harness.mjs";
import { resolveRepoDefault } from "../output-paths.mjs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

const outFlag = process.argv.indexOf("--out");
const outDir = outFlag >= 0 && process.argv[outFlag + 1]
  ? resolve(process.argv[outFlag + 1])
  : resolveRepoDefault(ROOT, "artifacts", "galleries", "baked-scenery");

mkdirSync(outDir, { recursive: true });

/** Curated framings aimed at the Monza/Spa bakedModel sites. */
const SHOTS = [
  {
    id: "monza-paddock-warehouses",
    track: "monza",
    frac: 0.97,
    // From LEFT (paddock) looking at hospitality + Kenney warehouses behind.
    az: -105, el: 26, dist: 110, tod: "day",
  },
  {
    id: "monza-paddock-low",
    track: "monza",
    frac: 0.955,
    az: -80, el: 12, dist: 55, tod: "day",
  },
  {
    id: "monza-rettifilo-barriers",
    track: "monza",
    frac: 0.04,
    // From runoff looking along jersey barriers + orange cones (side +1).
    az: 100, el: 6, dist: 22, tod: "day",
  },
  {
    id: "spa-stavelot-buildings",
    track: "spa",
    frac: 0.76,
    az: -100, el: 22, dist: 95, tod: "day",
  },
  {
    id: "spa-lasource-barriers",
    track: "spa",
    frac: 0.02,
    az: 95, el: 8, dist: 20, tod: "day",
  },
  {
    id: "silverstone-paddock",
    track: "silverstone",
    frac: 0.95,
    az: -100, el: 22, dist: 100, tod: "day",
  },
  {
    id: "monaco-rascasse",
    track: "monaco",
    frac: 0.91,
    az: 80, el: 18, dist: 40, tod: "day",
  },
  {
    id: "vegas-boh-towers",
    track: "vegas",
    frac: 0.12,
    az: -70, el: 20, dist: 90, tod: "dusk",
  },
];

const srv = await startStaticServer(ROOT);
const browser = await launchChromium({
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(srv.url);
await page.waitForFunction(() => window.__apex != null, null, { timeout: 10_000 });

const manifest = { outDir, models: null, shots: [] };

try {
  const models = await page.evaluate(async () => {
    if (typeof Assets === "undefined" || !Assets.loadModels) return [];
    await Assets.loadModels();
    return Assets.models();
  });
  manifest.models = models;
  console.log(`models loaded: ${models.length}`);

  for (const shot of SHOTS) {
    await page.evaluate((id) => window.__apex.race(id), shot.track);
    await page.waitForFunction(
      (id) => window.__apex.info().track === id,
      shot.track,
      { timeout: 25_000 }
    );
    await sleep(1500);

    const frame = await page.evaluate((s) => {
      const a = window.__apex;
      a.go();
      a.park(s.frac);
      a.freeze(true);
      if (a.setTimeOfDay) a.setTimeOfDay(s.tod || "day");
      if (a.hud) a.hud(false);
      a.orbit(s.frac, s.az, s.el, s.dist);
      a.step && a.step(1 / 60, 5);
      const cs = a.camState ? a.camState() : null;
      return { dbg: !!(cs && cs.debug), eye: cs && cs.eye, models: Assets.models().length };
    }, shot);
    await sleep(350);

    const file = `${shot.id}.png`;
    const path = resolve(outDir, file);
    const buf = await page.screenshot({ path, type: "png" });
    // Prefer full-page screenshot: canvas#game locator.screenshot can hang on
    // heavy circuits (Vegas) waiting for "element stable" under SwiftShader.
    const rec = {
      ...shot,
      file,
      bytes: buf.length,
      dbgCam: frame.dbg,
      blank: buf.length < 5000,
    };
    manifest.shots.push(rec);
    console.log(
      `${file}  ${(buf.length / 1024).toFixed(0)} KB` +
        (rec.blank ? "  BLANK" : "") +
        (frame.dbg ? "" : "  NO-DBG-CAM")
    );
  }
} finally {
  writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await shutdown(browser, srv);
}

const failed = manifest.shots.filter((s) => s.blank || !s.dbgCam);
if (failed.length) {
  console.error(`failed ${failed.length}/${manifest.shots.length}:`, failed.map((s) => s.id));
  process.exitCode = 1;
} else {
  console.log(`ok ${manifest.shots.length} shots → ${outDir}`);
}
