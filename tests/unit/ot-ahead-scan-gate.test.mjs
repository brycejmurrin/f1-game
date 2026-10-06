/* ot-ahead-scan-gate.test.mjs — the updateCar O(n) overtake ahead walk is gated.
 *
 * Line-level CDP (Monza, 22 cars): the walk was ~17 % of updateCar positionTicks
 * and pulled pits.inLane to ~2.6 % of all JS self-time, even on steps where
 * gapAhead is unused (no detection-line crossing, no OT allowance). The gate
 * must keep the scan body when gapAhead matters, and skip it otherwise.
 *
 * Run: node --test tests/unit/ot-ahead-scan-gate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(ROOT, p), "utf8");

function loadOM() {
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, isNaN, isFinite, console, window: {} });
  ctx.window = ctx;
  seedLog(ctx);
  for (const f of ["js/physics/consts.js", "js/track/core/space.js", "js/race/overtake-mode.js"])
    vm.runInContext(src(f), ctx, { filename: f });
  return vm.runInContext("OvertakeMode", ctx);
}

test("updateCar gates the overtake ahead scan on otNeedAhead", () => {
  const game = src("js/game.js");
  const a = game.indexOf("let ahead = null, gapAhead = Infinity;");
  const endMark = "gapAhead = ahead && c.speed > 1 ? gapAhead / c.speed : Infinity;";
  const b = game.indexOf(endMark, a);
  assert.ok(a > 0 && b > a, "ahead scan site present");
  const block = game.slice(a, b + endMark.length);
  assert.match(block, /otNeedAhead/, "scan is gated");
  assert.match(block, /OvertakeMode\.crossed\s*\(/, "crossing check feeds the gate");
  assert.match(block, /c\.otE\s*>\s*0/, "held allowance still pays for the walk");
  assert.match(block, /if\s*\(\s*otNeedAhead\s*\)/, "walk runs only when needed");
  assert.match(block, /Collide\.scanOtAhead/, "ahead walk is the wrap-aware bucket scan");
  const collide = src("js/physics/collide.js");
  const fn = collide.slice(collide.indexOf("function _onOtO"), collide.indexOf("function scanOtAhead"));
  assert.match(fn, /o\.finished \|\| o\.retired/);
  assert.match(fn, /s\.skip && s\.skip\(o\)/);
});

test("otNeedAhead is true on a detection-line crossing when open, false in clear air with no allowance", () => {
  const OM = loadOM();
  const L = 5000;
  const track = { total: L, def: {} };
  const det = OM.detectS(track);
  // Mirror the game.js seed + gate (no raceCtl — open is an argument).
  const need = (c, open) => {
    if (c._otLap == null || c._otS == null) { c._otLap = c.lap | 0; c._otS = c.s; }
    return (c.otE > 0 || c.otOn) ||
      (!!track && open && OM.crossed(c._otS, c.s, OM.detectS(track), L));
  };
  const coast = { s: 100, lap: 2, otE: 0, otOn: false, _otS: 90, _otLap: 2 };
  assert.equal(need(coast, true), false, "mid-lap clear air: skip");
  assert.equal(need({ s: 100, lap: 2, otE: 0.125, otOn: false, _otS: 90, _otLap: 2 }, true), true, "held OT energy: scan");
  assert.equal(need({ s: 100, lap: 2, otE: 0, otOn: true, _otS: 90, _otLap: 2 }, true), true, "deploying: scan");
  const cross = { s: det + 5, lap: 2, otE: 0, otOn: false, _otS: det - 10, _otLap: 2 };
  assert.equal(need(cross, true), true, "crossed detection while open: scan");
  assert.equal(need({ ...cross }, false), false, "crossed while closed: gap unused (no earn)");
});
