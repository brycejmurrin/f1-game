// frame-fleet.test.mjs — the FLEET half of the framing report (tools/lib/frame-fleet.mjs):
// frame identity across a shot-list edit, flag-name comparison, the old-vs-new
// diff and the worst-frame summary. Hand-built fleets, no game VM, ~0.1 s.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as FF from "../../tools/lib/frame-fleet.mjs";

// A full single-circuit report frame, the shape frame-report.mjs --json prints.
const frame = (shot, pos, score, flags = [], u = 0.1) => ({
  u, shot, pos, score, flags,
  subject: { kind: "corner", coverPct: 12.34, visiblePct: 88.88, inFramePct: 90, label: "x", occluders: [] },
  skyPct: 20.04, roadPct: 11.96, nearest: { distM: 31, kind: "pine", id: 4, third: "left" }, cars: { visible: 2 },
  thumb: ["...."],
});
const fleetOf = (tracks) => ({ kind: FF.FLEET_KIND, version: FF.FLEET_VERSION, tracks });
const entry = (frames) => FF.compactReport({ bootMs: 1, analyseMs: 2, raster: [96, 28], frames, cuts: [] });

test("flagName strips the measurement: detail drift is not flag churn", () => {
  assert.equal(FF.flagName("SUBJECT_OCCLUDED(46% visible, by pine)"), "SUBJECT_OCCLUDED");
  assert.equal(FF.flagName("EYE_INSIDE:stonePine/canopy"), "EYE_INSIDE");
  assert.equal(FF.flagName("STEEP_DOWN"), "STEEP_DOWN");
});

test("frameKey: shot@pos, shot@u for explicit u, #n for repeats", () => {
  const seen = new Map();
  assert.equal(FF.frameKey({ shot: "wide", pos: "start", u: 0.004 }, seen), "wide@start");
  assert.equal(FF.frameKey({ shot: "wide", pos: "start", u: 0.9 }, seen), "wide@start#2");
  assert.equal(FF.frameKey({ shot: "grid", pos: null, u: 0.41234 }, seen), "grid@u0.412");
  assert.equal(FF.frameKey({ shot: "pose", u: null }, seen), "pose@pose");
});

test("compactReport keeps the diffable fields and drops the thumbnail", () => {
  const e = entry([frame("wide", "start", 50, ["SUBJECT_SMALL(1%)"]), frame("wide", "mid", 70)]);
  assert.equal(e.meanScore, 60);
  assert.deepEqual(e.frames.map((f) => f.key), ["wide@start", "wide@mid"]);
  assert.equal(e.frames[0].thumb, undefined);
  assert.equal(e.frames[0].subject.coverPct, 12.3);
  assert.equal(e.frames[0].cars, 2);
  assert.deepEqual(e.frames[0].flags, ["SUBJECT_SMALL(1%)"]);
});

test("diffFleet: score moves, flag names gained/lost, below-threshold noise hidden", () => {
  const old = fleetOf({
    monza: entry([frame("wide", "start", 50, ["SUBJECT_OCCLUDED(46% visible, by pine)"]),
                  frame("wide", "mid", 70), frame("grid", "end", 90)]),
    spa: entry([frame("wide", "start", 80)]),
  });
  const neu = fleetOf({
    monza: entry([frame("wide", "start", 50, ["SUBJECT_OCCLUDED(44% visible, by pine)"]),   // same name: not a change
                  frame("wide", "mid", 40, ["EYE_INSIDE:pine/canopy"]),                      // worse + flag
                  frame("grid", "end", 90.5)]),                                               // |Δ| < 1: hidden
    spa: entry([frame("wide", "start", 80)]),
  });
  const d = FF.diffFleet(old, neu);
  const m = d.tracks.find((t) => t.track === "monza");
  assert.equal(m.status, "changed");
  assert.equal(m.frames.length, 1);
  assert.deepEqual(m.frames[0], { key: "wide@mid", status: "changed", old: 70, new: 40, dScore: -30,
                                  flagsAdded: ["EYE_INSIDE"], flagsRemoved: [] });
  assert.equal(d.tracks.find((t) => t.track === "spa").status, "same");
  assert.equal(d.totals.changed, 1);
  assert.equal(d.totals.worse, 1);
  assert.equal(d.totals.better, 0);
  assert.equal(d.totals.changedCircuits, 1);
  // A flag that goes away with the score unchanged is still a change.
  const fixed = FF.diffFleet(neu, old).tracks.find((t) => t.track === "monza").frames[0];
  assert.deepEqual(fixed.flagsRemoved, ["EYE_INSIDE"]);
  assert.equal(fixed.dScore, 30);
  // minDelta widens the dead band.
  assert.equal(FF.diffFleet(old, neu, { minDelta: 0.1 }).totals.changed, 2);
});

test("diffFleet: frames and circuits that appear, vanish or error", () => {
  const old = fleetOf({
    monza: entry([frame("wide", "start", 50), frame("wide2", "start", 60)]),
    spa: entry([frame("wide", "start", 80)]),
    imola: entry([frame("wide", "start", 80)]),
  });
  const neu = fleetOf({
    monza: entry([frame("wide", "start", 50), frame("wide3", "start", 65)]),
    imola: { error: "exit 1: boom" },
    vegas: entry([frame("wide", "start", 10)]),
  });
  const d = FF.diffFleet(old, neu);
  const by = Object.fromEntries(d.tracks.map((t) => [t.track, t]));
  assert.deepEqual(by.monza.frames.map((f) => [f.key, f.status]), [["wide2@start", "removed"], ["wide3@start", "added"]]);
  assert.equal(by.spa.status, "removed");
  assert.equal(by.vegas.status, "added");
  assert.equal(by.imola.status, "error");
  assert.equal(by.imola.error, "exit 1: boom");
  assert.equal(d.totals.added, 1);
  assert.equal(d.totals.removed, 1);
  const txt = FF.formatDiff(d);
  assert.match(txt, /^frame-report diff: 4\/4 circuits changed/);
  assert.match(txt, /imola: ERROR \(exit 1: boom\)/);
  assert.match(txt, /wide3@start\s+ADDED score 65/);
});

test("formatDiff names each changed frame and collapses unchanged circuits", () => {
  const a = fleetOf({ monza: entry([frame("t1", "mid", 83)]), spa: entry([frame("t1", "mid", 20)]) });
  const b = fleetOf({ monza: entry([frame("t1", "mid", 57, ["STEEP_DOWN"])]), spa: entry([frame("t1", "mid", 20)]) });
  const txt = FF.formatDiff(FF.diffFleet(a, b));
  assert.match(txt, /monza: mean 83 → 57 \(-26\)/);
  assert.match(txt, /t1@mid\s+83 →\s+57 \(-26\)\s+\+STEEP_DOWN/);
  assert.match(txt, /unchanged \(1\): spa/);
});

test("worstFrames / formatSummary: lowest score first, errors listed", () => {
  const f = fleetOf({
    monza: entry([frame("a", "start", 40, ["X(1)"]), frame("a", "mid", 0, ["EYE_INSIDE:pine"])]),
    spa: entry([frame("a", "start", 0), frame("b", "end", 99)]),
    imola: { error: "timeout" },
  });
  const w = FF.worstFrames(f, 3);
  assert.deepEqual(w.map((r) => [r.track, r.key, r.score]), [["monza", "a@mid", 0], ["spa", "a@start", 0], ["monza", "a@start", 40]]);
  const txt = FF.formatSummary(f, 2);
  assert.match(txt, /2\/3 circuits, 4 frames/);
  assert.match(txt, /errors: imola \(timeout\)/);
  assert.match(txt, /EYE_INSIDE 1/);
  assert.equal(txt.split("\n").filter((l) => /^\s+\d+\s+\S+\s+\S+@/.test(l)).length, 2);
});

test("assertFleet refuses a single-circuit report and junk", () => {
  assert.throws(() => FF.assertFleet({ track: "monza", frames: [] }, "a.json"), /single-circuit report/);
  assert.throws(() => FF.assertFleet(null, "b.json"), /not a fleet record/);
  assert.ok(FF.assertFleet(fleetOf({}), "c.json"));
});
