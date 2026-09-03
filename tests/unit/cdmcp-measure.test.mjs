// cdmcp-measure.test.mjs — guards the Chromium MCP background measure harness.
// Does NOT launch Chromium (that is minutes + SwiftShader). Checks CLI surface,
// log terminal-marker contract, and that the bg launcher exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MEASURE = path.join(ROOT, "tools/cdmcp-measure.py");
const LAMPS = path.join(ROOT, "tools/cdmcp-lamps.py");
const LAMPS_TUNE = path.join(ROOT, "tools/cdmcp-lamps-tune.py");
const CLI = path.join(ROOT, "tools/cdmcp-cli.py");
const BG = path.join(ROOT, "tools/cdmcp-bg.mjs");

test("cdmcp-measure.py and cdmcp-bg.mjs exist and are executable-ish", () => {
  assert.ok(fs.existsSync(MEASURE));
  assert.ok(fs.existsSync(BG));
  const py = fs.readFileSync(MEASURE, "utf8");
  assert.match(py, /= run (passed|failed|timedout|interrupted)/);
  assert.match(py, /artifacts\/logs\/cdmcp-measure\.log/);
  assert.match(py, /roots\/list/);
  const bg = fs.readFileSync(BG, "utf8");
  assert.match(bg, /cdmcp-measure\.py/);
  assert.match(bg, /--status/);
  assert.match(bg, /= run \(passed\|failed\|timedout\|interrupted\)/);
});

test("cdmcp-cli.py advertises roots so filePath writes under /workspace work", () => {
  assert.ok(fs.existsSync(CLI));
  const py = fs.readFileSync(CLI, "utf8");
  assert.match(py, /roots\/list/);
  assert.match(py, /listChanged/);
  assert.match(py, /file:\/\/\{ROOT\}/);
});

test("cdmcp-lamps.py exists with terminal-marker log contract", () => {
  assert.ok(fs.existsSync(LAMPS));
  const py = fs.readFileSync(LAMPS, "utf8");
  assert.match(py, /= run (passed|failed|timedout|interrupted)/);
  assert.match(py, /artifacts\/logs\/cdmcp-lamps\.log/);
  assert.match(py, /lampDensity/);
  assert.match(py, /--bg/);
  assert.match(py, /--status/);
});

test("cdmcp-lamps-tune.py asserts dens + warmth + energy with terminal marker", () => {
  assert.ok(fs.existsSync(LAMPS_TUNE));
  const py = fs.readFileSync(LAMPS_TUNE, "utf8");
  assert.match(py, /= run (passed|failed|timedout|interrupted)/);
  assert.match(py, /artifacts\/logs\/cdmcp-lamps-tune\.log/);
  assert.match(py, /lampDensity/);
  assert.match(py, /lampTemp/);
  assert.match(py, /poolEnergy/);
  assert.match(py, /meanLampRGB/);
  assert.match(py, /rOverB/);
  assert.match(py, /--bg/);
  assert.match(py, /--port/);
  assert.match(py, /APEX_PORT/);
});

test("apex lightState documents meanLampRGB / bakedLights / lampPosts probes", () => {
  const apex = fs.readFileSync(path.join(ROOT, "js/agent/apex.js"), "utf8");
  assert.match(apex, /meanLampRGB/);
  assert.match(apex, /bakedLights/);
  assert.match(apex, /_alwaysLights/);
  assert.match(apex, /lampPosts/);
  const hooks = fs.readFileSync(path.join(ROOT, "docs/DEBUG-HOOKS.md"), "utf8");
  assert.match(hooks, /meanLampRGB/);
  assert.match(hooks, /cdmcp-lamps-tune/);
});

test("cdmcp-measure --help exits 0 and lists profiles", () => {
  const r = spawnSync("python3", [MEASURE, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /boot/);
  assert.match(r.stdout, /--bg/);
  assert.match(r.stdout, /artifacts\/logs/);
});

test("cdmcp-lamps --help exits 0 and mentions background mode", () => {
  const r = spawnSync("python3", [LAMPS, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--bg/);
  assert.match(r.stdout, /--port/);
  assert.match(r.stdout, /APEX_PORT|--only/);
});

test("cdmcp-lamps-tune --help exits 0 and lists slider assertions", () => {
  const r = spawnSync("python3", [LAMPS_TUNE, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--bg/);
  assert.match(r.stdout, /--port/);
  assert.match(r.stdout, /lampTemp|LAMP TEMPERATURE|warmth/i);
});

test("cdmcp-measure and cdmcp-lamps honour APEX_PORT in --help defaults", () => {
  const env = { ...process.env, APEX_PORT: "3462" };
  const m = spawnSync("python3", [MEASURE, "--help"], { encoding: "utf8", env });
  assert.equal(m.status, 0, m.stderr);
  assert.match(m.stdout, /3462/);
  const l = spawnSync("python3", [LAMPS, "--help"], { encoding: "utf8", env });
  assert.equal(l.status, 0, l.stderr);
  assert.match(l.stdout, /3462/);
  const t = spawnSync("python3", [LAMPS_TUNE, "--help"], { encoding: "utf8", env });
  assert.equal(t.status, 0, t.stderr);
  assert.match(t.stdout, /3462/);
});

test("cdmcp-lamps.py documents --port and APEX_PORT", () => {
  const py = fs.readFileSync(LAMPS, "utf8");
  assert.match(py, /--port/);
  assert.match(py, /APEX_PORT/);
  assert.match(py, /--only/);
  assert.match(py, /--limit/);
});

test("cdmcp-bg with no args exits 2 and prints usage", () => {
  const r = spawnSync("node", [BG], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr + r.stdout, /usage:/);
});

test("cdmcp-bg --status is safe when idle", () => {
  const r = spawnSync("node", [BG, "--status"], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cdmcp-measure/);
});

test("look-survey settles 1.6s only on day/dark rebuild, not every weather flip", () => {
  const py = fs.readFileSync(CLI, "utf8");
  assert.match(py, /def look_settle_js/);
  assert.match(py, /def sort_combos_min_rebuild/);
  assert.match(py, /sessionDark|tod !== "day"/);
  assert.match(py, /builtNight/);
  assert.match(py, /const rebuilt = prevDark == null \|\| nowDark !== prevDark/);
  assert.match(py, /if \(prevTod !== tod && a\.setTimeOfDay\)/);
  assert.doesNotMatch(py, /await wait\(1600\)/);
  const help = spawnSync("python3", [CLI, "look-survey", "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--plan/);
  assert.match(help.stdout, /tod\|wx|time-of-day|weather/i);
});

test("look-survey-sheet.py writes tracked docs/look-survey grids", () => {
  const sheet = path.join(ROOT, "tools/look-survey-sheet.py");
  assert.ok(fs.existsSync(sheet));
  const py = fs.readFileSync(sheet, "utf8");
  assert.match(py, /docs\/look-survey/);
  assert.match(py, /--ready/);
  const help = spawnSync("python3", [sheet, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--ready/);
  assert.match(help.stdout, /20 PNGs|shots/);
});

test("sort_combos_min_rebuild groups sessionDark so loadTrack flips once", () => {
  const r = spawnSync("python3", ["-c", `
import importlib.util
from pathlib import Path
p = Path("tools/cdmcp-cli.py")
spec = importlib.util.spec_from_file_location("cdmcp_cli", p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
combos = [("night","rain"),("day","dry"),("dawn","wet"),("day","fog"),("dusk","dry")]
dark_first = m.sort_combos_min_rebuild(combos, True)
assert [c[0] == "day" for c in dark_first] == [False, False, False, True, True], dark_first
day_first = m.sort_combos_min_rebuild(combos, False)
assert [c[0] == "day" for c in day_first] == [True, True, False, False, False], day_first
js = m.look_settle_js("dawn", "wet", 0.12, "dawn", True)
assert "await wait(1600)" not in js
assert "builtNight" in js
print("ok")
`], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /ok/);
});
