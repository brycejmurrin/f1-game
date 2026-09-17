/* FLYBY SHOT EDITOR — the half that is data, not pixels.
 *
 * js/camera/flyby-panel.js is a DOM panel, and nothing here boots one: the
 * framing it authors can only be judged by looking, and this container has no
 * GPU. What IS checkable without a browser is the list algebra underneath —
 * add / duplicate / delete / reorder — and the validator that stands between a
 * pasted blob and js/camera/flyby-seq.js's shipped DEFAULT.
 *
 * That validator is the one worth a test. tools/gen/bake-flyby.mjs does a FULL
 * REPLACE of the DEFAULT array, so every rule it fails to enforce is a way to
 * delete the shipped sequence by pasting the wrong thing — which is exactly how
 * the lighting tuner's bake earned its own name interlock (see that tool's
 * header). The cases below are the four that cost something: a good blob, a
 * DELTA-named one, an unknown anchor, and durations that do not sum to 1.
 *
 * Run: node --test tests/unit/flyby-panel.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { parseBlob, validateShots as bakeValidate, bake, render } from "../../tools/gen/bake-flyby.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** FlybyPanel's module surface, evaluated on its own. `const` at top level is
 *  rewritten to `var` so the IIFE's assignment lands on the sandbox, the same
 *  trick tests/unit/ui-improve-pass.test.mjs uses for the other UI modules. */
function loadPanel() {
  const sb = { Math, JSON, Object, Array, Number, String, isFinite, Date, console };
  sb.window = sb;
  vm.runInNewContext(read("js/camera/flyby-panel.js").replace(/^const\b/gm, "var"), sb,
    { filename: "js/camera/flyby-panel.js" });
  assert.ok(sb.FlybyPanel, "js/camera/flyby-panel.js assigns the FlybyPanel global");
  return sb.FlybyPanel;
}

const FP = loadPanel();

/** A minimal list that passes everything, as the starting point for each case. */
function goodList() {
  const shot = (id, at) => ({
    id, dur: 0.5, ease: "inOut",
    eye: [{ at, off: -40, x: 8, y: 6 }, { at, off: 10, x: 6, y: 5 }],
    look: [{ at, off: 0, x: 0, y: 0.8 }, { at, off: 40, x: 0, y: 0.8 }],
    fov: [36, 40],
  });
  return [shot("one", "start"), shot("two", "corner")];
}

/* ── the list algebra ─────────────────────────────────────────────────────── */

test("the module freezes and exports its pure operations", () => {
  assert.ok(Object.isFrozen(FP), "FlybyPanel is frozen");
  for (const fn of ["create", "addShot", "duplicateShot", "deleteShot", "moveShot",
                    "normaliseDurs", "validateShots", "switchPoseAt", "toBlob"]) {
    assert.equal(typeof FP[fn], "function", `FlybyPanel.${fn} is exported`);
  }
});

test("add inserts AFTER the selection and never collides an id", () => {
  const before = goodList();
  const after = FP.addShot(before, 0);
  assert.equal(after.length, 3);
  assert.deepEqual(after.map((s) => s.id), ["one", "shot", "two"]);
  assert.deepEqual(before.map((s) => s.id), ["one", "two"], "the input list is not mutated");
  // The new shot must itself be valid, or ADD hands the author a list that
  // cannot be copied out until they find which field is missing.
  // Spread into a host array: the module is evaluated in its own VM realm, so
  // the array it returns has that realm's Array.prototype and deepStrictEqual
  // (rightly) calls it a different type.
  assert.deepEqual([...FP.validateShots(FP.normaliseDurs([after[1]]))], []);
});

test("duplicate copies the shot and renames the copy", () => {
  const out = FP.duplicateShot(goodList(), 0);
  assert.deepEqual(out.map((s) => s.id), ["one", "one-2", "two"]);
  assert.deepEqual(out[1].eye, out[0].eye, "the copy carries the framing");
  out[1].eye[0].x = 99;
  assert.notEqual(out[0].eye[0].x, 99, "…as a deep copy, not a shared reference");
});

/* THE LIST MAY NOT BE EMPTIED. FlybySeq.solve() falls back to its own DEFAULT
   when handed an empty array, so a zero-shot editor would preview the SHIPPED
   sequence while claiming to preview the edit — the one state in which the live
   preview lies about what it is showing. */
test("delete removes one shot and refuses the last", () => {
  const out = FP.deleteShot(goodList(), 0);
  assert.deepEqual(out.map((s) => s.id), ["two"]);
  const kept = FP.deleteShot(out, 0);
  assert.deepEqual(kept.map((s) => s.id), ["two"], "the final shot survives DELETE");
});

test("reorder moves a shot and ignores a move off either end", () => {
  const list = goodList();
  assert.deepEqual(FP.moveShot(list, 1, -1).map((s) => s.id), ["two", "one"]);
  assert.deepEqual(FP.moveShot(list, 0, -1).map((s) => s.id), ["one", "two"], "already first");
  assert.deepEqual(FP.moveShot(list, 1, 1).map((s) => s.id), ["one", "two"], "already last");
});

test("normalise rescales durations to sum to exactly 1", () => {
  const list = goodList().map((s) => ({ ...s, dur: 0.4 }));       // sums to 0.8
  const out = FP.normaliseDurs(list);
  const sum = out.reduce((a, s) => a + s.dur, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `durations sum to ${sum}`);
  assert.ok(Math.abs(out[0].dur - out[1].dur) < 1e-6, "…keeping their relative weights");
});

test("switching a pose's anchor carries what the new anchor can still use", () => {
  const pose = { at: "corner", n: "first", off: -40, x: 8, y: 6 };
  const centre = FP.switchPoseAt(pose, "centre");
  assert.equal(centre.at, "centre");
  assert.equal(centre.y, 6, "height survives the switch");
  assert.equal(centre.off, undefined, "an arc offset means nothing around the lap's centroid");
  assert.equal(typeof centre.distR, "number", "and the new anchor's own fields arrive with defaults");
  assert.equal(FP.switchPoseAt(pose, "nonsense").at, "corner", "an unknown anchor changes nothing");
});

/* ── the export, and the bake it is aimed at ──────────────────────────────── */

test("COPY VALUES emits the one name bake-flyby.mjs accepts", () => {
  const blob = FP.toBlob(FP.normaliseDurs(goodList()));
  assert.match(blob, /^window\.FlybyShots = \[/,
    "the name is the interlock: bake-flyby.mjs does a FULL REPLACE and refuses every other name");
  const round = parseBlob(blob);
  assert.deepEqual(round.map((s) => s.id), ["one", "two"], "…and the blob parses back to the list");
});

test("the panel's validator and the bake tool's validator agree", () => {
  const cases = [
    FP.normaliseDurs(goodList()),
    (() => { const l = FP.normaliseDurs(goodList()); l[0].eye[0].at = "somewhere"; return l; })(),
    (() => { const l = FP.normaliseDurs(goodList()); l[0].dur = 0.9; return l; })(),
    (() => { const l = FP.normaliseDurs(goodList()); l[1].ease = "bounce"; return l; })(),
  ];
  // Compared on the CLAIM, not the prose: both ends carry the same rules, but
  // the bake's duration message goes on to explain what a fraction of a run is
  // (a CLI has room to; a panel row does not). The part before the dash is the
  // finding, and THAT may not drift.
  const claims = (l) => l.map((s) => String(s).split(" \u2014 ")[0]);
  for (const list of cases) {
    assert.deepEqual(claims([...FP.validateShots(list)]), claims(bakeValidate(list)),
      "two copies of one rule set, so neither end is the only guard — they may not drift");
  }
});

test("a good blob validates", () => {
  assert.deepEqual(bakeValidate(FP.normaliseDurs(goodList())), []);
  // And the shipped DEFAULT itself — the sequence this tool would replace —
  // must pass its own validator, or the bake refuses a round trip of no change.
  const src = read("js/camera/flyby-seq.js");
  const m = src.match(/^ {2}const DEFAULT = \[[\s\S]*?^ {2}\];/m);
  assert.ok(m, "flyby-seq.js's DEFAULT array is where bake-flyby.mjs's anchored regex expects it");
  const shipped = vm.runInNewContext("(" + m[0].replace(/^ {2}const DEFAULT = /, "").replace(/;$/, "") + ")");
  assert.deepEqual(bakeValidate(shipped), [], "the shipped sequence passes the rules the editor enforces");
});

test("a DELTA-named blob is refused, with the reason", () => {
  const blob = FP.toBlob(FP.normaliseDurs(goodList())).replace("window.FlybyShots", "window.FlybyEdits");
  assert.throws(() => parseBlob(blob), (e) => {
    assert.match(e.message, /FlybyEdits/, "the refusal names the blob it was handed");
    assert.match(e.message, /FlybyShots/, "…and the name it wanted");
    assert.match(e.message, /REPLACES|delete/i, "…and why: this is a full replace, not a merge");
    return true;
  });
});

test("an unknown pose anchor is refused", () => {
  const list = FP.normaliseDurs(goodList());
  list[1].look[1] = { at: "landmarks", rank: 0 };      // plural: a real typo, not a fantasy one
  const bad = bakeValidate(list);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /unknown at: "landmarks"/);
  assert.throws(() => parseBlob(FP.toBlob(list)), /will not bake/);
});

test("durations that do not sum to 1 are refused", () => {
  const list = goodList();                  // two shots at 0.5 each -> 1.0
  list[0].dur = 0.9;                        // …now 1.4
  const bad = bakeValidate(list);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /sum to 1\.4000, not 1/);
  // Just inside the tolerance is fine: the editor's sliders step in 0.005 and a
  // hand-rounded list should not be rejected for a thousandth.
  const near = goodList();
  near[0].dur = 0.505;
  assert.deepEqual(bakeValidate(near), []);
});

/* ── the write ────────────────────────────────────────────────────────────── */

test("the bake replaces the DEFAULT literal and nothing else", () => {
  const src = read("js/camera/flyby-seq.js");
  const list = FP.normaliseDurs(goodList());
  const out = bake(src, list);
  assert.notEqual(out, src);
  assert.ok(out.includes(render(list)), "the new literal is written verbatim");
  assert.ok(out.includes("const FlybySeq = (function () {"), "the module survives");
  assert.ok(out.includes("Object.freeze(FlybySeq);"), "…including its tail");
  // The header comment documents the pose shape with the same words; an
  // unanchored regex would have eaten the documentation instead of the data.
  assert.ok(out.includes('{ at: "start"|"pole"|"grid"|"corner", n, off, x, y }'),
    "the header comment is untouched — the regex is anchored at two-space indent for this reason");
  assert.equal(out.match(/^ {2}const DEFAULT = \[/gm).length, 1, "still exactly one DEFAULT");
});
