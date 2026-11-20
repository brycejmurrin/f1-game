// scenery-region-warning — #5995 item 5.
//
// The boot warning "[scenery] bahrain: suppressed … floodMast=149" came from the
// GARAGE EXTERIOR (js/garage/exterior-geometry.js runs TrackBuildProps.buildSteps
// with a region window). A region build's rejBox also refuses every prop outside
// the window, so its suppressed tally is no guard signal: it is logged at info
// and says it is a region build. The full race build keeps the warning.
// Run: node --test tests/unit/scenery-region-warning.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require("../../tools/lib/track-build-vm.cjs");

function sceneryLines(run) {
  const h = buildContext({ assets: false });
  const ctx = vm.createContext(h.sandbox);
  const f = "js/garage/exterior-geometry.js";
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  const lines = [];
  for (const level of ["warn", "info"]) ctx.Log[level] = (tag, msg) => { if (tag === "scenery") lines.push({ level, msg: String(msg) }); };
  run(ctx, h.Tracks, h.Tracks.LIST.find((d) => d.id === "bahrain"));
  return lines;
}

test("the garage exterior's region build reports its drops as a region build, not a guard warning", () => {
  const lines = sceneryLines((ctx, _Tracks, def) => {
    const it = ctx.GarageExteriorGeometry.buildSteps(def, { teamId: "ferrari" });
    let next; do { next = it.next(); } while (!next.done);
    assert.equal(next.value.supported, true, "bahrain exterior builds");
  });
  assert.deepEqual(lines.filter((l) => l.level === "warn" && /suppressed/.test(l.msg)), [], "no suppressed warning");
  const region = lines.find((l) => l.level === "info" && /^bahrain: region build, outside the window or guarded .*floodMast=\d+/.test(l.msg));
  assert.ok(region, "the region tally is logged at info and names itself: " + JSON.stringify(lines));
});

test("the full bahrain build drops no flood mast (the region tally was never a placement bug)", () => {
  const lines = sceneryLines((_ctx, Tracks, def) => { Tracks.build(def); });
  assert.deepEqual(lines.filter((l) => /suppressed|region build/.test(l.msg)), [], "full build: no guard drops at all");
});
