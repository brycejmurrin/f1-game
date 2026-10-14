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
  collectShots,
  build,
  ROOT,
} from "../../tools/track/build-gallery.cjs";
import { STAGE_DIRS } from "../../tools/desktop/stage-files.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("canonical survey filenames parse circuit, sector, and weather", () => {
  const m = parseShotMeta("/tmp/monza-04-t2-night-wet.png");
  assert.equal(m.circuit, "monza");
  assert.equal(m.seq, "04");
  assert.equal(m.sector, "t2");
  assert.equal(m.weather, "night-wet");
});

test("look-survey grid sheets parse as overview/grid", () => {
  const m = parseShotMeta(path.join(ROOT, "docs/look-survey/spa_grid.png"));
  assert.equal(m.circuit, "spa");
  assert.equal(m.sector, "overview");
  assert.equal(m.weather, "grid");
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

test("gallery/ is staged for GitHub Pages", () => {
  assert.ok(STAGE_DIRS.includes("gallery"), "add gallery/ to tools/desktop/stage-files.mjs");
});

test("build-gallery.cjs --help exits 0", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/track/build-gallery.cjs"), "--help"],
    { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /build-gallery/);
});
