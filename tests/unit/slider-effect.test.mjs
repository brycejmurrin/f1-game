// slider-effect.test.mjs — the no-browser LIGHTING TUNER classifier.
//
// Guards tools/slider-effect.mjs: TUNE_DEFS parse, gate/risk filters, and
// the documented failure-mode classes (docs/LIGHTING-TUNER-SLIDERS.md).
// No Chromium. Pixel MAD is the wrong instrument; this is consumer + gates.
//
// Run: node --test tests/unit/slider-effect.test.mjs  (npm run test:tooling-fast)

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TOOL = path.join(ROOT, "tools/slider-effect.mjs");

function run(args) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    encoding: "utf8", cwd: ROOT, timeout: 20000,
  });
}

function json(args) {
  const r = run(args);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

test("the tool exists", () => {
  assert.ok(existsSync(TOOL), "tools/slider-effect.mjs missing");
});

test("--help exits 0 and documents --live visual filter plus the failure-mode table", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--live/);
  assert.match(r.stdout, /--all/);
  assert.match(r.stdout, /--shots/);
  assert.match(r.stdout, /--levels/);
  assert.match(r.stdout, /lampLevel/);
  assert.match(r.stdout, /filter\.png/);
  assert.match(r.stdout, /APPLY_RACE_IDS/);
  assert.match(r.stdout, /LIGHTING-TUNER-SLIDERS/);
});

test("--json lists ~183 knobs with id/group", () => {
  const data = json(["--json"]);
  const knobs = data.knobs;
  assert.ok(Array.isArray(knobs), "expected { knobs: [...] }");
  assert.ok(knobs.length >= 170 && knobs.length <= 200,
    `expected ~183 knobs, got ${knobs.length}`);
  for (const k of knobs) {
    assert.equal(typeof k.id, "string");
    assert.ok(k.id.length, "empty id");
    assert.equal(typeof k.group, "string");
    assert.ok(k.group.length, `${k.id} missing group`);
  }
  assert.equal(data.counts.total, knobs.length);
});

test("nightAmbLift is classified as night-gated / ambient", () => {
  const { knobs } = json(["--json"]);
  const k = knobs.find((x) => x.id === "nightAmbLift");
  assert.ok(k, "nightAmbLift missing from TUNE_DEFS parse");
  assert.ok(k.gates.includes("night"), `gates=${JSON.stringify(k.gates)}`);
  assert.equal(k.consumer, "ambient");
  assert.ok(k.moves.includes("ambientSky") || k.moves.includes("ambientGround"),
    `moves=${JSON.stringify(k.moves)}`);
  assert.equal(k.class, "apply-only");
});

test("overcastFogMul / fogWxMul are weather-gated", () => {
  const { knobs } = json(["--json"]);
  const ovc = knobs.find((x) => x.id === "overcastFogMul");
  const fog = knobs.find((x) => x.id === "fogWxMul");
  assert.ok(ovc && fog, "missing overcastFogMul or fogWxMul");
  assert.equal(ovc.weatherGated, true, `overcastFogMul gates=${JSON.stringify(ovc.gates)}`);
  assert.equal(fog.weatherGated, true, `fogWxMul gates=${JSON.stringify(fog.gates)}`);
  assert.ok(ovc.gates.includes("overcast"), `overcastFogMul gates=${JSON.stringify(ovc.gates)}`);
  assert.ok(fog.gates.includes("fog"), `fogWxMul gates=${JSON.stringify(fog.gates)}`);
});

test("--gate night returns a non-empty subset smaller than all knobs", () => {
  const all = json(["--json"]);
  const night = json(["--gate", "night", "--json"]);
  assert.ok(night.knobs.length > 0, "night gate matched nothing");
  assert.ok(night.knobs.length < all.knobs.length,
    `night ${night.knobs.length} should be < all ${all.knobs.length}`);
  assert.ok(night.knobs.every((k) => k.gates.includes("night")));
});

test("--risk reapply flags apply-only knobs missing from APPLY_RACE_IDS (empty ok)", () => {
  const { knobs } = json(["--risk", "reapply", "--json"]);
  for (const k of knobs) {
    assert.ok(k.risks.includes("reapply"), k.id);
    assert.equal(k.applyRace, false, `${k.id} is in APPLY_RACE_IDS but flagged reapply`);
    assert.equal(k.class, "apply-only");
  }
});

test("--live without an id/--all/--group exits 2 and does not mention a browser launch", () => {
  const r = run(["--live"]);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stdout}\n${r.stderr}`, /--live <id>|--all|lampLevel/);
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /launchChromium|playwright/i);
});

test("--live lampLevel --dry-run prints a night chase recipe and launches nothing", () => {
  const r = run(["--live", "lampLevel", "--dry-run", "--from", "0", "--to", "0.55"]);
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.id, "lampLevel");
  assert.equal(plan.tod, "night");
  assert.equal(plan.from, 0);
  assert.equal(plan.to, 0.55);
  assert.ok(plan.track);
  assert.doesNotMatch(r.stderr, /PAGEERR|playwright/i);
});

function hasViewDeps() {
  const r = spawnSync("python3", ["-c", "from PIL import Image; import numpy"], {
    encoding: "utf8",
  });
  return r.status === 0;
}

test("slider-effect-view.py isolates changed pixels on a synthetic pair", {
  skip: hasViewDeps() ? false : "Pillow/numpy not installed (GitHub-hosted CI)",
}, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "slider-effect-"));
  try {
    const mk = spawnSync("python3", ["-c", `
from pathlib import Path
from PIL import Image
d = Path(${JSON.stringify(dir)})
a = Image.new("RGB", (32, 16), (10, 10, 10))
b = Image.new("RGB", (32, 16), (10, 10, 10))
for x in range(8, 16):
    for y in range(6, 12):
        b.putpixel((x, y), (220, 40, 20))
a.save(d / "a.png"); b.save(d / "b.png")
`], { encoding: "utf8" });
    assert.equal(mk.status, 0, mk.stderr);
    const view = path.join(ROOT, "tools/slider-effect-view.py");
    const r = spawnSync("python3", [view, path.join(dir, "a.png"), path.join(dir, "b.png"),
      "--out", dir, "--hud-crop", "0"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(path.join(dir, "filter.png")));
    assert.ok(existsSync(path.join(dir, "sheet.png")));
    const stats = JSON.parse(r.stdout.trim().split("\n")[0]);
    assert.ok(stats.changedPct > 1, `changedPct=${stats.changedPct}`);
    assert.ok(stats.changedPct < 50, `changedPct=${stats.changedPct} too high`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every TUNE_DEFS knob has a valid live recipe (no browser)", async () => {
  const { classifyKnobs, loadTuneDefs } = await import("../../tools/slider-effect.mjs");
  const { livePlan, RECIPE_BY_ID } = await import("../../tools/slider-effect-live.mjs");
  const knobs = classifyKnobs(ROOT);
  const defs = loadTuneDefs(ROOT);
  const byDef = new Map(defs.map((d) => [d.id, d]));
  assert.equal(knobs.length, defs.length, "catalog and TUNE_DEFS length drifted");
  const TODS = new Set(["dawn", "day", "dusk", "night"]);
  const WXS = new Set(["dry", "wet", "rain", "fog", "overcast"]);
  for (const knob of knobs) {
    const def = byDef.get(knob.id);
    assert.ok(def, `missing TUNE_DEFS for ${knob.id}`);
    const plan = livePlan({ id: knob.id }, knob, def, ROOT);
    assert.ok(TODS.has(plan.tod), `${knob.id} tod=${plan.tod}`);
    assert.ok(WXS.has(plan.weather), `${knob.id} weather=${plan.weather}`);
    assert.ok(Number.isFinite(plan.frac) && plan.frac >= 0 && plan.frac < 1, `${knob.id} frac`);
    assert.ok(Number.isFinite(plan.from), `${knob.id} from`);
    assert.ok(Number.isFinite(plan.to) && plan.to !== plan.from, `${knob.id} to==from`);
    assert.equal(plan.shots, 2, `${knob.id} default shots`);
    assert.deepEqual(plan.levels, [plan.from, plan.to], `${knob.id} default levels`);
    assert.match(plan.camera, /^(chase|sky|horizon)$/, `${knob.id} camera`);
    assert.ok(plan.bucket.includes(plan.track), `${knob.id} bucket`);
  }
  for (const id of Object.keys(RECIPE_BY_ID)) {
    assert.ok(byDef.has(id), `RECIPE_BY_ID stale id ${id}`);
  }
});

test("documented live recipes: weather / far-clip / traffic / stars", async () => {
  const { classifyKnobs, loadTuneDefs } = await import("../../tools/slider-effect.mjs");
  const { livePlan } = await import("../../tools/slider-effect-live.mjs");
  const knobs = Object.fromEntries(classifyKnobs(ROOT).map((k) => [k.id, k]));
  const defs = Object.fromEntries(loadTuneDefs(ROOT).map((d) => [d.id, d]));
  const plan = (id) => livePlan({ id }, knobs[id], defs[id], ROOT);

  assert.equal(plan("fogWxMul").weather, "fog");
  assert.equal(plan("overcastFogMul").weather, "overcast");
  assert.equal(plan("moonShadow").tod, "night");
  assert.equal(plan("moonShadow").weather, "wet");
  assert.equal(plan("renderDistMul").track, "spa");
  assert.equal(plan("renderDistMul").tod, "day");
  assert.equal(plan("renderDistMul").frac, 0.50);
  assert.equal(plan("starBright").track, "bahrain");
  assert.equal(plan("starBright").tod, "night");
  assert.equal(plan("starBright").camera, "sky");
  assert.equal(plan("lampReach").track, "singapore");
  assert.ok(Math.abs(plan("lampReach").frac - 0.55) < 1e-9);
  assert.equal(plan("floodDay").tod, "day");
  assert.equal(plan("sunElev").tod, "dawn");
  assert.equal(plan("lampCull").traffic, true);
  assert.equal(plan("tailLightMul").traffic, true);
  assert.equal(plan("drizzleCount").weather, "wet");
  assert.notEqual(plan("drizzleCount").weather, "rain");
  assert.equal(plan("rainCount").weather, "rain");
  assert.equal(plan("cloudDef").camera, "horizon");
});

test("--live --all --dry-run prints a plan for every knob, batched by condition", () => {
  const r = run(["--live", "--all", "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /PAGEERR|playwright|launchChromium/i);
  const data = JSON.parse(r.stdout);
  assert.ok(data.count >= 170 && data.count <= 200, `count=${data.count}`);
  assert.equal(data.plans.length, data.count);
  assert.ok(data.bucketCount >= 4, `bucketCount=${data.bucketCount} (one recipe is not enough)`);
  assert.ok(data.bucketCount < data.count, "should park once per condition, not per knob");
  const byId = Object.fromEntries(data.plans.map((p) => [p.id, p]));
  assert.equal(byId.fogWxMul.weather, "fog");
  assert.equal(byId.renderDistMul.track, "spa");
  assert.equal(byId.starBright.camera, "sky");
  assert.ok(data.buckets.every((b) => b.ids.length >= 1));
});

test("--live --ids dry-run is an explicit subset and launches nothing", () => {
  const r = run(["--live", "--ids", "fogWxMul,renderDistMul,starBright", "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /PAGEERR|playwright|launchChromium/i);
  const data = JSON.parse(r.stdout);
  assert.equal(data.count, 3);
  assert.deepEqual(data.plans.map((p) => p.id).sort(), ["fogWxMul", "renderDistMul", "starBright"]);
  assert.equal(data.plans.find((p) => p.id === "fogWxMul").weather, "fog");
});

test("--live --group LAMPS --dry-run is a subset, still night-heavy", () => {
  const r = run(["--live", "--group", "LAMPS", "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(r.stdout);
  assert.ok(data.count >= 15 && data.count < 80, `LAMPS count=${data.count}`);
  assert.ok(data.plans.every((p) => p.id));
  const flood = data.plans.find((p) => p.id === "floodDay");
  assert.ok(flood, "floodDay is in LAMPS");
  assert.equal(flood.tod, "day");
});

test("inventory tags: chunk-lamps / saturate / sparse-pixels / wet-drizzle", () => {
  const { knobs } = json(["--json"]);
  const byId = Object.fromEntries(knobs.map((k) => [k.id, k]));
  assert.ok(byId.perChunkLights.tags.includes("chunk-lamps"), byId.perChunkLights.tags);
  assert.ok(byId.roadChunkLamps.tags.includes("chunk-lamps"));
  assert.ok(byId.lampFogBase.tags.includes("saturate"));
  assert.ok(byId.starBright.tags.includes("sparse-pixels"));
  const drizzle = knobs.find((k) => k.id.startsWith("drizzle"));
  assert.ok(drizzle, "expected a drizzle* knob");
  assert.ok(drizzle.tags.includes("wet-drizzle"), drizzle.id);
  const glx = json(["--tag", "chunk-lamps", "--json"]);
  assert.deepEqual(glx.knobs.map((k) => k.id).sort(), ["perChunkLights", "roadChunkLamps"]);
});

test("--shots 5 --dry-run linspaces TUNE_DEFS min→max", () => {
  const r = run(["--live", "lampLevel", "--shots", "5", "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.id, "lampLevel");
  assert.equal(plan.shots, 5);
  assert.equal(plan.levels.length, 5);
  assert.equal(plan.levels[0], 0);
  assert.equal(plan.levels[4], 0.687);
  assert.equal(plan.from, plan.levels[0]);
  assert.equal(plan.to, plan.levels[4]);
  assert.ok(plan.levels[2] > plan.levels[1]);
});

test("--levels sets explicit values and wins over --shots", () => {
  const r = run(["--live", "lampLevel", "--shots", "5", "--levels", "0,0.26,0.55", "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.deepEqual(plan.levels, [0, 0.26, 0.55]);
  assert.equal(plan.shots, 3);
  assert.equal(plan.from, 0);
  assert.equal(plan.to, 0.55);
});

test("--from/--to without --shots stays a 2-shot A/B", () => {
  const r = run(["--live", "lampLevel", "--from", "0", "--to", "0.55", "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.deepEqual(plan.levels, [0, 0.55]);
  assert.equal(plan.shots, 2);
});

test("sampleLevels rejects shots < 2 and a single --levels value", async () => {
  const { loadTuneDefs } = await import("../../tools/slider-effect.mjs");
  const { sampleLevels } = await import("../../tools/slider-effect-live.mjs");
  const def = loadTuneDefs(ROOT).find((d) => d.id === "lampLevel");
  assert.throws(() => sampleLevels(def, { shots: 1 }), /shots/);
  assert.throws(() => sampleLevels(def, { levels: "0.26" }), /levels/);
});

test("glareStr recipe uses night + full 0→max range", async () => {
  const { classifyKnobs, loadTuneDefs } = await import("../../tools/slider-effect.mjs");
  const { livePlan } = await import("../../tools/slider-effect-live.mjs");
  const knobs = Object.fromEntries(classifyKnobs(ROOT).map((k) => [k.id, k]));
  const defs = Object.fromEntries(loadTuneDefs(ROOT).map((d) => [d.id, d]));
  const plan = livePlan({ id: "glareStr" }, knobs.glareStr, defs.glareStr, ROOT);
  console.log("[slider-effect] glareStr plan:", JSON.stringify({ tod: plan.tod, from: plan.from, to: plan.to }));
  console.log("[slider-effect] glareStr def max:", defs.glareStr?.max);
  assert.equal(plan.tod, "night", "glareStr must use night (lamp halos only fire at night)");
  assert.equal(plan.from, 0, "glareStr from should be 0 (min)");
  const glareMax = defs.glareStr.max;
  assert.equal(plan.to, glareMax, `glareStr to should be max (${glareMax})`);
});

test("slider-effect-view.py --batch-summary produces summary.png", () => {
  const VIEW = path.join(ROOT, "tools/slider-effect-view.py");
  const batchJson = path.join(ROOT, "artifacts/lighting/slider-effect/batch.json");
  if (!existsSync(batchJson)) {
    console.log("[slider-effect] batch.json not present — skipping batch-summary test");
    return;
  }
  console.log("[slider-effect] running --batch-summary on", batchJson);
  const r = spawnSync("python3", [VIEW, "--batch-summary", batchJson], {
    encoding: "utf8", cwd: ROOT, timeout: 30000,
  });
  console.log("[slider-effect] batch-summary exit:", r.status, "stdout:", r.stdout.trim().slice(0, 200));
  if (r.stderr) console.log("[slider-effect] batch-summary stderr:", r.stderr.trim().slice(0, 200));
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /summary\.png/);
  const summaryPath = path.join(path.dirname(batchJson), "summary.png");
  console.log("[slider-effect] checking summary.png at", summaryPath, "exists:", existsSync(summaryPath));
  assert.ok(existsSync(summaryPath), `summary.png not written to ${summaryPath}`);
});

test("slider-effect-view.py produces diff.png alongside filter/heat/sheet", () => {
  const VIEW = path.join(ROOT, "tools/slider-effect-view.py");
  const sampleDir = path.join(ROOT, "artifacts/lighting/slider-effect/bahrain-night-dry-lampLevel");
  if (!existsSync(path.join(sampleDir, "a.png"))) {
    console.log("[slider-effect] no live run artifacts in", sampleDir, "— skipping view test");
    return;
  }
  const tmp = mkdtempSync(path.join(tmpdir(), "se-view-"));
  console.log("[slider-effect] running slider-effect-view.py on", sampleDir, "→", tmp);
  try {
    const r = spawnSync("python3", [
      VIEW,
      path.join(sampleDir, "a.png"),
      path.join(sampleDir, "b.png"),
      "--out", tmp,
    ], { encoding: "utf8", cwd: ROOT, timeout: 20000 });
    console.log("[slider-effect] view.py exit:", r.status, "stdout:", r.stdout.trim().slice(0, 200));
    if (r.stderr) console.log("[slider-effect] view.py stderr:", r.stderr.trim().slice(0, 200));
    assert.equal(r.status, 0, r.stderr || r.stdout);
    for (const f of ["filter.png", "heat.png", "diff.png", "sheet.png", "view.json"]) {
      const exists = existsSync(path.join(tmp, f));
      console.log(`[slider-effect]   ${f}:`, exists ? "ok" : "MISSING");
      assert.ok(exists, `${f} not written`);
    }
    // diff.png must exist and be a non-empty PNG
    const diffPng = path.join(tmp, "diff.png");
    const { size } = statSync(diffPng);
    console.log("[slider-effect] diff.png size:", size, "bytes");
    assert.ok(size > 1000, `diff.png suspiciously small: ${size} bytes`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
