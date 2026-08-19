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
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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

test("--live without an id exits 2 and does not mention a browser launch", () => {
  const r = run(["--live"]);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stdout}\n${r.stderr}`, /--live <id>|lampLevel/);
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

test("slider-effect-view.py isolates changed pixels on a synthetic pair", () => {
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

test("inventory tags: glx-only / saturate / sparse-pixels / wet-drizzle", () => {
  const { knobs } = json(["--json"]);
  const byId = Object.fromEntries(knobs.map((k) => [k.id, k]));
  assert.ok(byId.perChunkLights.tags.includes("glx-only"), byId.perChunkLights.tags);
  assert.ok(byId.roadChunkLamps.tags.includes("glx-only"));
  assert.ok(byId.lampFogBase.tags.includes("saturate"));
  assert.ok(byId.starBright.tags.includes("sparse-pixels"));
  const drizzle = knobs.find((k) => k.id.startsWith("drizzle"));
  assert.ok(drizzle, "expected a drizzle* knob");
  assert.ok(drizzle.tags.includes("wet-drizzle"), drizzle.id);
  const glx = json(["--tag", "glx-only", "--json"]);
  assert.deepEqual(glx.knobs.map((k) => k.id).sort(), ["perChunkLights", "roadChunkLamps"]);
});
