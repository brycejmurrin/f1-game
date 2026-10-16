/* tumftm-import — tools/lib/tumftm.mjs + tools/track/tumftm-import.mjs
 *
 * Converts the TUMFTM racetrack-database CSV format into the track designer's
 * apex26.track envelope. Uses a SYNTHETIC oval only (no network, no upstream
 * LGPL data in the tree). Catalog overlap vs the shipped roster is pinned.
 *
 * Run: node --test tests/unit/tumftm-import.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  CATALOG, LICENSE, SOURCE_URL, PTS_MAX,
  catalogEntry, missingEntries,
  parseTrackCsv, parseRacelineCsv,
  decimate, rowsToDesign, racelineOffsets, fileEnvelope, widthZones,
  syntheticOvalCsv, syntheticRacelineCsv, seedFrom,
} from "../../tools/lib/tumftm.mjs";
import { main as tumftmMain } from "../../tools/track/tumftm-import.mjs";
import { bootEditor } from "../helpers/editor-vm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

test("catalog: 25 upstream stems, three true missing, Nuerburgring flagged layout-diff", () => {
  assert.equal(CATALOG.length, 25);
  assert.equal(LICENSE, "LGPL-3.0");
  assert.match(SOURCE_URL, /TUMFTM\/racetrack-database/);
  const miss = missingEntries();
  assert.deepEqual(miss.map((e) => e.tumftm).sort(), [
    "MoscowRaceway", "Norisring", "Nuerburgring", "Oschersleben",
  ]);
  assert.equal(catalogEntry("norisring").status, "missing");
  assert.equal(catalogEntry("Monza").apexId, "monza");
  assert.equal(catalogEntry("Nuerburgring").status, "layout-diff");
  // Overlaps must name a real shipped circuit id.
  const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));
  const Tracks = buildContext(undefined, { quiet: true });
  const ids = new Set(Tracks.LIST.map((t) => t.id));
  for (const e of CATALOG) {
    if (e.apexId) assert.ok(ids.has(e.apexId), `${e.tumftm} → ${e.apexId} not in Tracks.LIST`);
    else assert.equal(e.status === "missing" || e.status === "unknown", true);
  }
});

test("parse + design: synthetic oval lands inside designer limits and sanitizes", () => {
  const rows = parseTrackCsv(syntheticOvalCsv(64));
  assert.ok(rows.length >= 60);
  const design = rowsToDesign(rows, { name: "Test Oval", theme: "harbour", maxPts: 48 });
  assert.ok(design.pts.length >= 8 && design.pts.length <= PTS_MAX);
  assert.ok(design.baseHW >= 5 && design.baseHW <= 8);
  assert.equal(design.theme, "harbour");
  assert.equal(design.name, "Test Oval");
  // Lattice.
  for (const [x, z] of design.pts) {
    assert.equal(x, Math.round(x * 4) / 4);
    assert.equal(z, Math.round(z * 4) / 4);
  }
  const { C } = bootEditor();
  const it = C.sanitize(design);
  assert.ok(it, "CustomTracks.sanitize accepts the converted design");
  assert.match(it.id, /^custom-[0-9a-f]{8}$/);
  assert.equal(it.name, "TEST OVAL");
  assert.ok(it.lengthM > 1500);
});

test("decimate never exceeds the designer ptsMax and keeps the start sample", () => {
  const rows = parseTrackCsv(syntheticOvalCsv(400));
  const slim = decimate(rows, 100);
  assert.ok(slim.length <= 100);
  assert.equal(slim[0].x, rows[0].x);
  assert.equal(slim[0].y, rows[0].y);
});

test("widthZones: marked widenings become ≤ 16 hwZones", () => {
  const s = [];
  const hw = [];
  for (let i = 0; i < 40; i++) {
    s.push(i / 40);
    hw.push(i >= 10 && i < 20 ? 7.5 : 6.0);
  }
  const zones = widthZones(s, hw, 6.0, 16);
  assert.ok(zones.length >= 1 && zones.length <= 16);
  assert.ok(zones.some((z) => z.hw >= 7));
});

test("racelineOffsets: inset raceline reports a consistent bias", () => {
  const design = rowsToDesign(parseTrackCsv(syntheticOvalCsv(48)), { maxPts: 48, name: "O" });
  // syntheticRacelineCsv uses the same frame as the oval CSV (already centred at 0).
  const race = parseRacelineCsv(syntheticRacelineCsv(48));
  const off = racelineOffsets(design.pts, race);
  assert.equal(off.length, design.pts.length);
  const mean = off.reduce((a, b) => a + b, 0) / off.length;
  // Inside bias on a CCW oval → offsets should not all be zero.
  assert.ok(Math.abs(mean) > 0.05 || off.some((v) => Math.abs(v) > 0.5),
    `expected non-trivial offsets, mean=${mean}`);
});

test("fileEnvelope carries LGPL attribution and the designer format key", () => {
  const design = rowsToDesign(parseTrackCsv(syntheticOvalCsv()), { name: "N", theme: "parkland" });
  const env = fileEnvelope(design, catalogEntry("Norisring"));
  assert.equal(env.format, "apex26.track");
  assert.equal(env.attribution.license, "LGPL-3.0");
  assert.match(env.attribution.notice, /OpenStreetMap/);
  assert.equal(env.attribution.tumftm, "Norisring");
  assert.equal(env.design.theme, "parkland");
});

test("seedFrom is stable", () => {
  assert.equal(seedFrom("NORISRING"), seedFrom("NORISRING"));
  assert.notEqual(seedFrom("A"), seedFrom("B"));
});

test("CLI --help / --list / --self-check exit cleanly", async () => {
  assert.equal(await tumftmMain(["--help"]), 0);
  assert.equal(await tumftmMain(["--self-check"]), 0);
  // --list prints to stdout; just ensure it returns 0.
  assert.equal(await tumftmMain(["--list"]), 0);
  assert.equal(await tumftmMain(["--missing"]), 0);
});

test("CLI --source writes an importable envelope under artifacts/", async () => {
  const dir = path.join(ROOT, "artifacts/tumftm-test");
  fs.mkdirSync(dir, { recursive: true });
  const csvPath = path.join(dir, "Synthetic.csv");
  fs.writeFileSync(csvPath, syntheticOvalCsv(36));
  const code = await tumftmMain(["Synthetic", "--source", csvPath, "-o", dir, "--theme", "alpine"]);
  assert.equal(code, 0);
  const out = path.join(dir, "Synthetic.track.json");
  assert.ok(fs.existsSync(out));
  const env = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(env.format, "apex26.track");
  assert.equal(env.design.theme, "alpine");
  assert.equal(env.attribution.license, "LGPL-3.0");
  // Round-trip through the editor codec's fromFile shape.
  const { CD, C } = bootEditor();
  const parsed = CD.fromFile(env);
  assert.ok(parsed && parsed.design);
  assert.ok(C.sanitize(parsed.design));
  // Keep the fixture out of accidental commits (artifacts/ is regenerable).
  fs.rmSync(dir, { recursive: true, force: true });
});

test("converted design builds a centreline through the real track VM", () => {
  const design = rowsToDesign(parseTrackCsv(syntheticOvalCsv(72, 500, 300)), {
    name: "Build Oval", theme: "parkland", maxPts: 60,
  });
  const { Tracks } = bootEditor({ customTracks: { v: 1, items: [design] } });
  const custom = Tracks.LIST.filter((t) => t.custom);
  assert.equal(custom.length, 1);
  const tr = Tracks.buildCenterline(custom[0]);
  assert.ok(tr.total > 2000, `built lap ${tr.total}`);
  assert.ok(tr.line && tr.curv.length === tr.n, "TrackLine still bakes on a TUMFTM-derived design");
});
