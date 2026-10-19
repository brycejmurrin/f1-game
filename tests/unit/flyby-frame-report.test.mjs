/* FLYBY FRAME REPORT — runs tools/shot/frame-report.mjs as a child on Spa,
 * Monza and Monaco and holds its per-shot scores and flags.
 *
 * Split out of tests/unit/flyby-shots.test.mjs (2026-10-19, test review #2952
 * R1-10): ~53 s of that file's 138 s, in test:node-slow with flyby-fleet.
 * The score floors below are REGRESSION floors recorded at the measured
 * scores ("was 77" etc.), not requirements; the flag assertions (SUBJECT_SMALL,
 * EMPTY_GROUND, NEAR_OBSTRUCTION ...) are the requirements, and a floor moves
 * only with a frame-report change that says why.
 */
import { test } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---- the three measured cases (frame report, 2026-10-05) --------------------
//
// tools/shot/frame-report.mjs on the tip found: Spa's landmark shots 52-62 with
// SUBJECT_SMALL 0 % (the report's road clear had dropped the grandstand it was
// filming — FlybySight.offRoad — so its box was never in the scene), Spa's wide
// shots 70-77 with 34-44 % of the lap visible through the pines, Monza's wide
// shots 72-80 % flat lawn (EMPTY_GROUND), and Monaco's grid walk with a barrier
// across 31-32 % of its left third. These run the report itself, as a child,
// so the numbers pinned are the report's own.

function frameReport(id) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(ROOT, "tools/shot/frame-report.mjs"), "--track", id, "--json", "--thumb", "0"],
      { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, timeout: 240000 }, (err, out) => {
        if (err) return reject(err);
        const byShot = {};
        for (const f of JSON.parse(out).frames) (byShot[f.shot] = byShot[f.shot] || []).push(f);
        resolve(byShot);
      });
  });
}
const minScore = (fs) => Math.min(...fs.map((f) => f.score));
const flagged = (fs, re) => fs.flatMap((f) => f.flags).filter((s) => re.test(s));

test("frame report: the subject landmark stays in the scene (Spa's stands framed, not 0 %); Spa's wide shots see more lap", async () => {
  const spa = await frameReport("spa");
  for (const id of ["landmark1", "landmark2"]) {
    assert.deepEqual(flagged(spa[id], /SUBJECT_SMALL/), [], `spa ${id}: the grandstand is in frame (was SUBJECT_SMALL 0.0 %)`);
    assert.ok(spa[id].every((f) => f.subject.coverPct > 20), `spa ${id}: ${spa[id].map((f) => f.subject.coverPct)} % of the frame is the stand`);
    assert.ok(minScore(spa[id]) >= 80, `spa ${id}: worst frame ${minScore(spa[id])} (was 52-62)`);
  }
  // The wide shots: the crest eye sees down into the forest.
  // Then the HIGH crest (W_HIGH, look raised to hold the 23 deg pitch) for a
  // lap the plain framings still see under 60 % of: Spa's wide was 77-79 with
  // 45-48 % visible (SUBJECT_OCCLUDED); it is 81-82 at 60-62 % from 30 deg.
  for (const id of ["wide", "wide2"]) {
    assert.ok(minScore(spa[id]) >= (id === "wide" ? 80 : 75), `spa ${id}: worst frame ${minScore(spa[id])} (wide was 77-79)`);
    assert.deepEqual(flagged(spa[id], /SUBJECT_OCCLUDED|SUBJECT_SMALL|EMPTY_GROUND|STEEP_DOWN/), [], `spa ${id}: the lap is not hidden by the pines, nor traded for lawn or a thread`);
    assert.ok(spa[id].every((f) => f.subject.inFramePct >= 40), `spa ${id}: ${spa[id].map((f) => f.subject.inFramePct)} % of the lap in frame (a raised eye must not frame it out)`);
  }
  assert.ok(spa.wide.every((f) => f.subject.visiblePct >= 56), `spa wide: ${spa.wide.map((f) => f.subject.visiblePct)} % of the lap visible (was 45-48)`);
});

test("frame report: Monza's wide shots tilt the horizon down out of the lawn; Monaco's grid walk steps off its barrier", async () => {
  const [monza, monaco] = await Promise.all([frameReport("monza"), frameReport("monaco")]);
  for (const id of ["wide", "wide2"]) {
    assert.deepEqual(flagged(monza[id], /EMPTY_GROUND/), [], `monza ${id}: under groundMaxPct (was 72-80 % ground)`);
    assert.ok(minScore(monza[id]) >= 77, `monza ${id}: worst frame ${minScore(monza[id])} (was 76)`);
  }
  assert.deepEqual(flagged(monaco["grid-walk"], /NEAR_OBSTRUCTION/), [], "monaco grid-walk: no barrier across a third (was 31-32 %)");
  assert.ok(minScore(monaco["grid-walk"]) >= 80, `monaco grid-walk: worst frame ${minScore(monaco["grid-walk"])} (was 77)`);
  assert.ok(minScore(monaco.wide2) >= 76, `monaco wide2: worst frame ${minScore(monaco.wide2)} (was 73)`);
  // monza turn-first 78 -> 77 (2026-10-14): same eye and frame; the generic
  // grey shed that stood in front of the near stone pine is gone, so the pine
  // fills 10.9 % of the left third (was 9.9 %), past the 10 % near penalty.
  for (const id of ["landmark1", "landmark2", "turn-first", "turn-mid", "grid-crane", "grid-front", "grid-mine"]) {
    const monzaFloor = id === "turn-first" ? 77 : 78;
    assert.ok(minScore(monza[id]) >= monzaFloor && minScore(monaco[id]) >= 78, `${id}: untouched shots hold (monza ${minScore(monza[id])}, monaco ${minScore(monaco[id])})`);
  }
});

