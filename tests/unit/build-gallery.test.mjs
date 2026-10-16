/* build-gallery.test.mjs — filename parsing + deploy output contract.
 * Run: node --test tests/unit/build-gallery.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  parseShotMeta,
  parseAgentDoubleUnderscore,
  collectShots,
  collectSurveyBranchShots,
  build,
  ROOT,
} from "../../tools/track/build-gallery.cjs";
import { rawGitHubUrl } from "../../tools/track/survey-gallery-lib.cjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("canonical survey filenames parse circuit, sector, and weather", () => {
  const m = parseShotMeta("/tmp/monza-04-t2-night-wet.png");
  assert.equal(m.circuit, "monza");
  assert.equal(m.seq, "04");
  assert.equal(m.sector, "t2");
  assert.equal(m.weather, "night-wet");
});

test("storm and weather-then-tod survey filenames keep tod and condition", () => {
  const a = parseShotMeta("/tmp/monza-12-orbit-f33-day-storm.jpg");
  assert.equal(a.sector, "orbit-f33");
  assert.equal(a.tod, "day");
  assert.equal(a.condition, "storm");
  const b = parseShotMeta("/tmp/monza-13-orbit-f50-rain-night.jpg");
  assert.equal(b.sector, "orbit-f50");
  assert.equal(b.tod, "night");
  assert.equal(b.condition, "rain");
});

test("look-survey grid sheets parse as overview/grid", () => {
  const m = parseShotMeta(path.join(ROOT, "docs/look-survey/spa_grid.png"));
  assert.equal(m.circuit, "spa");
  assert.equal(m.sector, "overview");
  assert.equal(m.weather, "grid");
});

test("agent hero-abbey__dusk-dry filenames parse sector, tod, and weather", () => {
  const m = parseAgentDoubleUnderscore("hero-abbey__dusk-dry.jpg", "silverstone");
  assert.equal(m.circuit, "silverstone");
  assert.equal(m.sector, "hero-abbey");
  assert.equal(m.weather, "dusk-dry");
  assert.equal(m.tod, "dusk");
  assert.equal(m.condition, "dry");
});

test("raw GitHub URLs use the committed branch path", () => {
  const url = rawGitHubUrl("brycejmurrin", "f1-game", "cursor/silverstone-survey-745b",
    "artifacts/shots/tracks/silverstone/hero-abbey__dusk-dry.jpg");
  assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/brycejmurrin\/f1-game\/cursor\//);
  assert.ok(!url.includes("/workspace"));
});

test("collectSurveyBranchShots returns circuit-tagged shots from the survey branches", () => {
  const shots = collectSurveyBranchShots();
  assert.ok(
    shots.length > 0 && shots.every((s) => s.circuit && s.rawUrl),
    `expected survey branch shots with circuit + rawUrl, got ${shots.length} total`,
  );
});

test("tracks-ui preview filenames map to a circuit", () => {
  const m = parseShotMeta("04-select-preview-monza.png", { bucket: "tracks-ui" });
  assert.equal(m.circuit, "monza");
  assert.equal(m.sector, "picker-preview");
});

test("collectShots finds committed look-survey grids", () => {
  const shots = collectShots();
  assert.ok(shots.some((s) => s.circuit === "monza" && s.weather === "grid"),
    "expected at least monza grid from docs/look-survey");
});

test("build writes index.html and manifest under gallery/tracks", async () => {
  const tmp = path.join(ROOT, "scratch", "gallery-test-out");
  fs.rmSync(tmp, { recursive: true, force: true });
  const manifest = await build({ outRoot: tmp, skipImages: true });
  assert.ok(manifest.shots.length >= 5);
  assert.ok(fs.existsSync(path.join(tmp, "index.html")));
  assert.ok(fs.existsSync(path.join(tmp, "manifest.json")));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("build-gallery.cjs --help exits 0", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/track/build-gallery.cjs"), "--help"],
    { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /build-gallery/);
});
