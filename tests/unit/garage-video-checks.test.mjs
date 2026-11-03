/* garage-video-checks.test.mjs — pure flags for the garage video harness.
 *
 * tools/shot/garage-video-checks.mjs is the one home of ends-early / car-still /
 * camera-oob / never-finishes. No browser.
 *
 * Run: node --test tests/unit/garage-video-checks.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GARAGE_BOUNDS, STYLE_IDS, ANGLE_IDS, DIR_IDS, FLAG_IDS,
  clipId, tuneSlugOf, buildMatrix, carTravelM, cameraOutsideBounds,
  endsEarly, neverFinishes, flagClip, flagReport,
  parseTuneToken, parseTuneList, parseCsvList,
} from "../../tools/shot/garage-video-checks.mjs";

test("catalogs cover shipped styles, angles, dirs and the four flag ids", () => {
  assert.ok(STYLE_IDS.includes("broadcast") && STYLE_IDS.includes("qualify"));
  assert.ok(ANGLE_IDS.includes("cut") && ANGLE_IDS.includes("crane") && ANGLE_IDS.includes("steadicam"));
  assert.deepEqual([...DIR_IDS], ["in", "out", "home"]);
  assert.deepEqual([...FLAG_IDS], ["ends-early", "car-still", "camera-oob", "never-finishes"]);
  assert.ok(GARAGE_BOUNDS.xMax > 0 && GARAGE_BOUNDS.zMax > 0);
});

test("clipId / tuneSlug are stable and encode hold=0", () => {
  assert.equal(clipId({ style: "cinema", angle: "crane", dir: "out", tune: { hold: 0 } }),
    "cinema-crane-out-tune-hold=0");
  assert.equal(tuneSlugOf({ hold: null, speed: 1 }), "tune-hold=auto_speed=1");
  assert.equal(tuneSlugOf({}), "tune-default");
});

test("buildMatrix is the cartesian product of style × angle × dir × tune", () => {
  const rows = buildMatrix({
    styles: ["broadcast", "cinema"],
    angles: ["cut"],
    dirs: ["in", "out"],
    tunes: [{}, { hold: 0 }],
  });
  assert.equal(rows.length, 8);
  assert.equal(rows.filter((r) => r.tune.hold === 0).length, 4);
  assert.ok(rows.every((r) => r.id && r.angle === "cut"));
});

test("carTravelM measures max xz displacement from the first sample", () => {
  assert.equal(carTravelM([]), 0);
  assert.equal(carTravelM([{ x: 0, z: 0 }]), 0);
  assert.ok(Math.abs(carTravelM([{ x: 0, z: 13 }, { x: 0, z: 8 }, { x: 0, z: 0 }]) - 13) < 1e-9);
});

test("cameraOutsideBounds names every eye outside the bay AABB", () => {
  const ok = cameraOutsideBounds([
    { t: 0, eye: [0, 1.5, 0] },
    { t: 1, eye: [-3.8, 2.1, -4.8] },
  ]);
  assert.equal(ok.length, 0);
  const bad = cameraOutsideBounds([
    { t: 0.5, eye: [0, 1.5, 0] },
    { t: 1, eye: [9, 1.5, 0] },
    { t: 2, eye: [0, 10, 0] },
  ]);
  assert.equal(bad.length, 2);
  assert.equal(bad[0].i, 1);
  assert.equal(bad[1].eye[1], 10);
});

test("endsEarly compares recordedSec to expectedSec × ratio", () => {
  assert.equal(endsEarly({ recordedSec: 10, expectedSec: 10 }), false);
  assert.equal(endsEarly({ recordedSec: 8.5, expectedSec: 10 }), false); // exactly earlyRatio
  assert.equal(endsEarly({ recordedSec: 8.4, expectedSec: 10 }), true);
  assert.equal(endsEarly({ recordedSec: 0, expectedSec: 8 }), true);
  assert.equal(endsEarly({ recordedSec: 5, expectedSec: 0 }), false);
});

test("neverFinishes: last sample still active past the show, or wall hang, or hold=0 with no inactive", () => {
  const moving = [
    { t: 0, x: 0, z: 13, active: true, eye: [0, 1.5, 0] },
    { t: 4, x: 0, z: 8, active: true, eye: [0, 1.5, 1] },
    { t: 9, x: 0, z: 0, active: false, eye: [-3.8, 2.1, -4.8] },
  ];
  assert.equal(neverFinishes({ samples: moving, expectedSec: 8.7, wallSec: 9 }), false);

  const stuck = [
    { t: 0, x: 0, z: 13, active: true, eye: [0, 1.5, 0] },
    { t: 12, x: 0, z: 13, active: true, eye: [0, 1.5, 0] },
  ];
  assert.equal(neverFinishes({ samples: stuck, expectedSec: 8.7, wallSec: 9 }), true);

  // Wall hang without ever seeing inactive (the hold=0 / hung-preview case).
  assert.equal(neverFinishes({
    samples: [{ t: 0, active: true, x: 0, z: 13, eye: [0, 1.5, 0] }],
    expectedSec: 8, wallSec: 20,
  }), true);

  assert.equal(neverFinishes({ samples: [], expectedSec: 8, wallSec: 1 }), true);
  assert.equal(neverFinishes({ samples: moving, expectedSec: 0, wallSec: 1 }), true);
});

test("flagClip aggregates the four flags with detail", () => {
  const good = flagClip({
    id: "broadcast-cut-in-tune-default",
    expectedSec: 8.7,
    recordedSec: 9.1,
    wallSec: 9.2,
    samples: [
      { t: 0, x: 0, z: 13, active: true, eye: [-3.8, 2.1, -4.8] },
      { t: 4, x: 0, z: 8, active: true, eye: [-3.8, 2.1, -4.0] },
      { t: 9, x: 0, z: 0, active: false, eye: [4.1, 2.25, -4.9] },
    ],
  });
  assert.equal(good.ok, true);
  assert.deepEqual(good.flags, []);

  const bad = flagClip({
    id: "cinema-crane-out-tune-hold=0",
    tune: { hold: 0 },
    expectedSec: 10,
    recordedSec: 2,
    wallSec: 25,
    samples: [
      { t: 0, x: 0, z: 0, active: true, eye: [0, 1.5, 0] },
      { t: 1, x: 0.01, z: 0.01, active: true, eye: [20, 1.5, 0] },
      { t: 20, x: 0.02, z: 0.02, active: true, eye: [20, 1.5, 0] },
    ],
  });
  assert.equal(bad.ok, false);
  for (const id of FLAG_IDS) assert.ok(bad.flags.includes(id), id);
  assert.equal(bad.detail.hang.hold, 0);
});

test("flagReport rolls up byFlag ids", () => {
  const report = flagReport([
    {
      id: "a", expectedSec: 10, recordedSec: 10, wallSec: 10,
      samples: [
        { t: 0, x: 0, z: 5, active: true, eye: [0, 1.5, 0] },
        { t: 5, x: 0, z: 0, active: false, eye: [0, 1.5, 0] },
      ],
    },
    {
      id: "b", expectedSec: 10, recordedSec: 1, wallSec: 2,
      samples: [
        { t: 0, x: 0, z: 0, active: true, eye: [0, 1.5, 0] },
        { t: 1, x: 0, z: 0, active: true, eye: [0, 1.5, 0] },
      ],
    },
  ]);
  assert.equal(report.total, 2);
  assert.equal(report.flagged, 1);
  assert.ok(report.byFlag["ends-early"].includes("b"));
  assert.ok(report.byFlag["car-still"].includes("b"));
});

test("tune / csv parsers accept the CLI spellings", () => {
  assert.deepEqual(parseTuneToken("hold=0"), { hold: 0 });
  assert.deepEqual(parseTuneToken("hold:auto,speed:1.5"), { hold: null, speed: 1.5 });
  assert.deepEqual(parseTuneList("hold=0|hold:auto"), [{ hold: 0 }, { hold: null }]);
  assert.deepEqual(parseCsvList("cut,crane", ANGLE_IDS), ["cut", "crane"]);
  assert.equal(parseCsvList("all", STYLE_IDS).length, STYLE_IDS.length);
  assert.throws(() => parseTuneToken("=nope"), /bad tune/);
});
