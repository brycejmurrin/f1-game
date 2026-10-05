#!/usr/bin/env node
// @doc GARAGE tap from the title, prebuild ON vs OFF on one tree: tap-to-first-frame ms (__apex.garagePrebuild).
//   node tools/shot/garage-tap.mjs [--backend three|webgl2|webgpu] [--prewarm both|on|off] [--scene garage|static|track|…] [--runs N]
// @skill playwright-probe
//
// Boots the TITLE (no race — apex-eval.mjs always boots one), waits for the
// title's own warm and, when ON, for js/garage/prebuild.js to report `ready`,
// taps #mb-garage and reads __apex.garagePrebuild().firstFrame: tapMs (tap to
// the first garage frame that drew), workMs (time inside the frame calls).
// OFF sets localStorage apex26.garagePrewarm = "off" before boot (the
// behaviour before the prebuild). One fresh browser per run; runs alternate
// on/off so box load drifts hit both. Writes artifacts/garage-tap/<stamp>.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, startStaticServer, sleep } from "../lib/harness.mjs";
import { chromiumArgsForBackend, installProbeInit, gotoGame } from "./probe-page.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const argv = process.argv.slice(2);
exitIfHelp(argv, `garage-tap — GARAGE tap from the title, prebuild ON vs OFF (one tree)

  node tools/shot/garage-tap.mjs [--backend three|webgl2|webgpu] [--prewarm both|on|off]
                                 [--scene garage|night|studio|static|track|pitlane] [--runs N] [--wait MS]

Default: --backend three (the shipped TLX) --prewarm both --runs 1, the stored Home scene.
Prints one JSON line per run and writes artifacts/garage-tap/<stamp>.json.`);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : d;
};
const backend = flag("--backend", "three");
const which = flag("--prewarm", "both");
const scene = flag("--scene", null);
const runs = Math.max(1, +flag("--runs", "1") || 1);
const waitMs = Math.max(10000, +flag("--wait", "120000") || 120000);
const modes = which === "both" ? ["off", "on"] : [which];

async function tapOnce(srv, mode) {
  const browser = await launchChromium({ headless: true, args: chromiumArgsForBackend(backend) });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await installProbeInit(page, { backend });
    await page.addInitScript(({ off, sc }) => {
      try {
        if (off) localStorage.setItem("apex26.garagePrewarm", "off"); else localStorage.removeItem("apex26.garagePrewarm");
        if (sc) localStorage.setItem("apex26.homeScene", JSON.stringify(sc));
      } catch (_) { /* storage blocked: the run reports enabled */ }
    }, { off: mode === "off", sc: scene });
    const t0 = Date.now();
    await gotoGame(page, srv.url);
    // The title's own warm: no blocker but the switch itself, nothing compiling.
    await page.waitForFunction(() => {
      const s = window.__apex.garagePrebuild && window.__apex.garagePrebuild();
      if (!s) return false;
      if (s.enabled) return s.ready || (s.last && s.last.result !== "superseded");
      return s.blockers.every((b) => b === "off" || b === "home-unpainted");
    }, null, { polling: 250, timeout: waitMs }).catch(() => null);
    await sleep(2000);   // a quiet beat on both arms: the same idle before the tap
    const before = await page.evaluate(() => window.__apex.garagePrebuild());
    const visit = before.firstFrame ? before.firstFrame.visit : 0;
    await page.evaluate(() => document.getElementById("mb-garage").click());
    await page.waitForFunction((v) => {
      const s = window.__apex.garagePrebuild();
      return !!(s.firstFrame && s.firstFrame.visit > v);
    }, visit, { polling: 50, timeout: waitMs });
    const after = await page.evaluate(() => window.__apex.garagePrebuild());
    return { mode, backend, scene: scene || "stored", bootToTapMs: Date.now() - t0,
      enabled: before.enabled, ready: before.ready, kind: before.kind, blockers: before.blockers,
      prewarm: before.last, firstFrame: after.firstFrame };
  } finally { await browser.close(); }
}

const srv = await startStaticServer(ROOT);
const results = [];
try {
  for (let r = 0; r < runs; r++)
    for (const mode of (r % 2 ? [...modes].reverse() : modes)) {
      const res = await tapOnce(srv, mode).catch((e) => ({ mode, backend, error: String(e && e.message || e) }));
      console.log(JSON.stringify(res));
      results.push(res);
    }
} finally {
  await srv.close();
  await shutdown();
}
const outDir = join(ROOT, "artifacts", "garage-tap");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, new Date().toISOString().replace(/[:.]/g, "-") + ".json");
writeFileSync(out, JSON.stringify(results, null, 2));
for (const m of modes) {
  const ok = results.filter((x) => x.mode === m && x.firstFrame);
  if (!ok.length) continue;
  const med = (k) => ok.map((x) => x.firstFrame[k]).sort((a, b) => a - b)[ok.length >> 1];
  console.log(`= ${m}: tapMs median ${med("tapMs")} ms, workMs median ${med("workMs")} ms over ${ok.length} run(s)`);
}
console.log("wrote " + out);
process.exitCode = results.some((x) => x.error) ? 1 : 0;
