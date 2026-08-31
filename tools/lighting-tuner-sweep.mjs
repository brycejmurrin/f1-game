#!/usr/bin/env node
/* lighting-tuner-sweep.mjs — does each LIGHTING TUNER slider actually change the image?
 *
 * SHARDED and RESUMABLE. One shard = one (condition, knob-range). Each knob's
 * result is flushed to disk as it lands, so a kill costs the current knob and
 * nothing else, and a re-run skips whatever is already recorded.
 *
 *   node tools/lighting-tuner-sweep.mjs --cond=day-dry                 # one condition
 *   node tools/lighting-tuner-sweep.mjs --cond=night-dry --from=0 --to=40
 *   node tools/lighting-tuner-sweep.mjs --list                         # conditions + knob count
 *   node tools/lighting-tuner-sweep.mjs --report                       # read the shards, no browser
 *   node tools/lighting-tuner-sweep.mjs --cond=day-dry --force         # ignore recorded results
 *
 * WHY PAIRED SAMPLING. The obvious design — capture one baseline, then compare
 * every knob against it — is WRONG here, and measurably so. The scene animates
 * (clouds drift, the car idles, particles run), so the image diverges from a
 * stale baseline as time passes, and the metric ends up reading elapsed time
 * rather than the knob. Measured with that design: `starBright` scored 24.18
 * mean-abs-diff on a DAYLIGHT Monaco frame, where stars cannot render at all,
 * and no knob in 178 scored below 1.6. Every knob looked alive; the sweep
 * proved nothing.
 *
 * So each knob is sampled as A → B → A': baseline, knob at its extreme,
 * baseline restored, all back-to-back.
 *   signal = mad(A, B)   the knob's effect
 *   noise  = mad(A, A')  what the scene did on its own over the same interval
 * A knob counts as LIVE only when signal clears the noise by a real margin.
 * When noise is high the sample says so instead of pretending to a number.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, startStaticServer } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "artifacts/graphics/tuner-sweep");
const W = 320, H = 180, SW = 160, SH = 90;
export const FLOOR = 2.0;

// Conditions chosen to exercise different consumers. Monza has night:false, so
// a night probe needs a track whose def allows it.
export const CONDS = {
  "day-dry":      { track: "monaco",    tod: "day",   wx: "dry",      s: 0.45 },
  "night-dry":    { track: "vegas",     tod: "night", wx: "dry",      s: 0.25 },
  "dusk-wet":     { track: "singapore", tod: "dusk",  wx: "wet",      s: 0.30 },
  "day-overcast": { track: "monaco",    tod: "day",   wx: "overcast", s: 0.45 },
  "day-fog":      { track: "monaco",    tod: "day",   wx: "fog",      s: 0.45 },
};

/** @type {Record<string, (c: typeof CONDS[string]) => boolean>} */
export const KNOB_OPEN = {
  moonBright: (c) => c.tod !== "day",
  nightAmbLift: (c) => c.tod === "night" || c.tod === "dusk",
  bounceK: (c) => c.tod === "night" || c.tod === "dusk",
  overcastFogMul: (c) => c.wx === "overcast",
  fogWxMul: (c) => c.wx === "fog",
};

/** Knobs that need a real GPU PCSS path — SwiftShader GL2 has no R16F blocker FBO. */
export const KNOB_ENV_GATED = new Set(["pcssPen"]);

export function pushExtreme(def, condKey) {
  const { id, min, max, def: d } = def;
  if (id === "sunElev" && condKey.startsWith("day")) return min;
  return (Math.abs(max - d) >= Math.abs(d - min)) ? max : min;
}

export function knobGateReason(id, condKey, cond, { softwareGl2 = true } = {}) {
  const open = KNOB_OPEN[id];
  if (open && !open(cond)) {
    if (id === "moonBright" || id === "nightAmbLift") return "night-only";
    if (id === "bounceK") return "lamps-off";
    if (id === "overcastFogMul") return "needs-overcast";
    if (id === "fogWxMul") return "needs-fog";
    return "condition-gated";
  }
  if (softwareGl2 && KNOB_ENV_GATED.has(id)) return "software-gl2-no-pcss";
  return null;
}

export function verdict(r) {
  if (!r) return "-";
  if (r.gated) return "gated";
  if (r.noise > FLOOR && r.signal < r.noise * 3) return "noisy";
  return r.signal > Math.max(FLOOR, r.noise * 3) ? "live" : "inert";
}

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const has = (k) => process.argv.includes(`--${k}`);

const mad = (a, b) => { let d = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3;
  } return n ? d / n : 0; };

const shardPath = (cond) => path.join(DIR, `${cond}.json`);
const loadShard = (cond) => (existsSync(shardPath(cond)) ? JSON.parse(readFileSync(shardPath(cond), "utf8")) : {});

// ---------------------------------------------------------------- report mode
function report() {
  const conds = Object.keys(CONDS);
  const all = {};
  for (const c of conds) for (const [id, r] of Object.entries(loadShard(c))) (all[id] ||= {})[c] = r;
  const ids = Object.keys(all);
  if (!ids.length) { console.log("no shards yet — run a --cond= sweep first"); return; }

  const dead = [], noisy = [], gatedOnly = [];
  for (const id of ids) {
    const byCond = all[id];
    const vs = conds.map((c) => verdict(byCond[c])).filter((v) => v !== "-");
    if (!vs.length) continue;
    const measurable = vs.filter((v) => v !== "gated");
    if (!measurable.length) { gatedOnly.push(id); continue; }
    if (measurable.every((v) => v === "inert")) dead.push(id);
    else if (measurable.every((v) => v === "noisy" || v === "inert")) noisy.push(id);
  }
  console.log(`knobs measured: ${ids.length}   conditions present: ${conds.filter((c) => Object.keys(loadShard(c)).length).join(", ")}`);
  console.log(`\nINERT IN EVERY MEASURED (non-gated) CONDITION (${dead.length}) — candidates for a real defect:`);
  for (const id of dead.sort()) {
    console.log(`  ${id.padEnd(20)} ` + conds.map((c) => {
      const r = all[id][c];
      if (!r) return `${c} —`;
      if (r.gated) return `${c} gated(${r.gated})`;
      return `${c} sig ${r.signal.toFixed(2)}/noise ${r.noise.toFixed(2)}`;
    }).join("   "));
  }
  console.log(`\nCONDITION- OR ENV-GATED ONLY (${gatedOnly.length}): ${gatedOnly.sort().join(", ") || "(none)"}`);
  console.log(`\nTOO NOISY TO JUDGE (${noisy.length}): ${noisy.sort().join(", ") || "(none)"}`);
}

// ----------------------------------------------------------------- sweep mode
async function sweep() {
  const cond = arg("cond");
  if (!cond || !CONDS[cond]) { console.error(`--cond= one of: ${Object.keys(CONDS).join(", ")}`); process.exit(2); }
  const C = CONDS[cond];
  mkdirSync(DIR, { recursive: true });
  const done = has("force") ? {} : loadShard(cond);

  const srv = await startStaticServer(ROOT);
  let browser;
  try {
    browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on("pageerror", (e) => console.error("PAGEERR", e.message));
    await page.goto(srv.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: 30000 });

    const defs = await page.evaluate(() => LightTune.TUNE_DEFS.map((d) =>
      ({ id: d.id, min: d.min, max: d.max, def: d.def, group: d.group })));
    const from = +arg("from", 0), to = Math.min(+arg("to", defs.length), defs.length);
    const slice = defs.slice(from, to).filter((d) => !(d.id in done));
    console.error(`${cond}: ${slice.length} knobs to do (${Object.keys(done).length} already recorded, range ${from}..${to})`);
    if (!slice.length) { console.error("nothing to do"); return; }

    await page.evaluate((t) => window.__apex.race(t), C.track);
    await page.waitForFunction((t) => window.__apex.info().track === t, C.track, { polling: 200, timeout: 300000 });
    await page.evaluate(async (c) => {
      const A = window.__apex;
      A.go(); A.hud(false); A.setTimeOfDay(c.tod); A.weather(c.wx);
      A.camera("chase"); A.park(c.s, 0); A.snapCam();
      for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
    }, C);

    const prepKnobCam = async (id) => {
      await page.evaluate(({ s, tod, knob }) => {
        if (knob === "sunShaftMul" && (tod === "day" || tod === "dusk")) {
          window.__apex.orbit(s, 35, 18, 50);
          window.__apex.snapCam();
        }
      }, { s: C.s, tod: C.tod, knob: id });
    };

    const shot = () => page.evaluate(async ({ SW, SH }) => {
      window.__apex.snapCam();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const cv = document.querySelector("canvas"), t = document.createElement("canvas");
      t.width = SW; t.height = SH;
      const c = t.getContext("2d", { willReadFrequently: true });
      c.drawImage(cv, 0, 0, SW, SH);
      return Array.from(c.getImageData(0, 0, SW, SH).data);
    }, { SW, SH });

    for (let i = 0; i < slice.length; i++) {
      const d = slice[i];
      const gate = knobGateReason(d.id, cond, C);
      if (gate) {
        done[d.id] = { group: d.group, def: d.def, gated: gate, signal: 0, noise: 0 };
        writeFileSync(shardPath(cond), JSON.stringify(done, null, 1));
        continue;
      }
      const v = pushExtreme(d, cond);
      await prepKnobCam(d.id);
      const A = await shot();
      await page.evaluate(({ id, v }) => window.__apex.lightTune({ [id]: v }), { id: d.id, v });
      const B = await shot();
      await page.evaluate(({ id, def }) => window.__apex.lightTune({ [id]: def }), { id: d.id, def: d.def });
      const A2 = await shot();
      done[d.id] = { group: d.group, def: d.def, pushedTo: v,
                     signal: +mad(A, B).toFixed(4), noise: +mad(A, A2).toFixed(4) };
      writeFileSync(shardPath(cond), JSON.stringify(done, null, 1));
      if (i % 10 === 0) console.error(`  ${i}/${slice.length} ${d.id} sig ${done[d.id].signal} noise ${done[d.id].noise}`);
    }
    console.error(`${cond}: done, ${Object.keys(done).length} knobs recorded`);
  } finally { await shutdown(); }
}

function invokedAsCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === path.resolve(entry);
  } catch {
    return false;
  }
}

if (invokedAsCli()) {
  if (has("list")) {
    console.log("conditions:", Object.keys(CONDS).join(", "));
    for (const c of Object.keys(CONDS)) console.log(`  ${c.padEnd(10)} recorded: ${Object.keys(loadShard(c)).length}`);
  } else if (has("report")) report();
  else await sweep();
}
