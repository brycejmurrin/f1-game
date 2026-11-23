/* delta-sign-colour.test.mjs — two widgets, one sign convention, opposite colours.
 *
 * The TELEMETRY tab's compare gauge painted the TRAILING driver green and the
 * leading one red. js/data/telemetry-player.js computes both the gauge delta and the
 * lane-board delta with the same expression and comments both the same way:
 *
 *     const delta = timeAtDist(view.compare.cum, dP) - refT;   // >0: compare is behind
 *     const dl    = timeAtDist(lane.cum, dRef)     - refT;   // >0: this lane is behind the ref
 *
 * so `dh-pos` is the SLOWER side on each. css/data.css had
 * `.dh-laneboard-dl.dh-pos -> --slower` (right, and commented "behind the
 * reference") and `.dh-gdelta.dh-pos -> --faster` (inverted), fifty lines apart.
 *
 * NOTHING COULD HAVE CAUGHT IT. Neither half is wrong alone: the JS sign is
 * right, the CSS is valid, and each rule is individually plausible. Only the
 * PAIRING is wrong, and no test compared them — a screenshot would not either,
 * because a green number and a red number both look like a working widget
 * unless you know which car is ahead.
 *
 * So this asserts the invariant rather than the values: every delta class keyed
 * on the ">0 = behind" convention resolves `.dh-pos` to the same token. Adding
 * a third such widget with the colours flipped fails here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/data.css"), "utf8");

/** The colour token `.<base>.<state>` resolves to, e.g. ("dh-gdelta","dh-pos"). */
function tokenFor(base, state) {
  const re = new RegExp("\\." + base + "\\." + state + "\\s*\\{[^}]*color:\\s*var\\(([^)]+)\\)", "m");
  const m = re.exec(css);
  assert.ok(m, `css/data.css has no colour rule for .${base}.${state}`);
  return m[1].trim();
}

// Both widgets key on `timeAtDist(other, d) - refT`, so positive means BEHIND.
const BEHIND_IS_POS = ["dh-gdelta", "dh-laneboard-dl"];

// The REAL paint block (DataTelemetryPlayer.paintFrame -> updateGauges) over a
// fake classList: the side that is BEHIND the reference must come out `dh-pos`
// on the gauge AND on the lane board, the side ahead `dh-neg`. If either sign
// drifts, the CSS assertions below are measuring the wrong thing.
const ctx = vm.createContext({});
seedLog(ctx);
for (const file of ["js/core/mat4.js", "js/data/tab-utils.js", "js/data/telemetry-model.js", "js/data/telemetry-player.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: absSrc(file) });
const player = vm.runInContext("DataTelemetryPlayer", ctx).create({}, { paintFrame() {} });

function cell() {
  const cls = new Set();
  return { textContent: "", style: {}, cls,
    classList: { toggle(c, on) { if (on) cls.add(c); else cls.delete(c); return !!on; }, contains: (c) => cls.has(c) } };
}
// A constant-speed lap over 1000 m that takes `finish` seconds.
const lane = (finish) => ({
  car: [{ t: 0, speed: 180 }, { t: finish, speed: 180 }],
  cum: { t: [0, finish], d: [0, 1000] },
});
function paint(primaryT, compareT, thirdT) {
  const primary = lane(primaryT), compare = lane(compareT), third = lane(thirdT);
  const view = {
    cursorT: 40, primary, compare, laps: [primary, compare, third], rpmMax: 12000,
    g: { speed: [], gear: [], thr: [], brk: [], rpm: [], drs: [],
      delta: cell(), board: [{ spd: cell(), ref: true }, { spd: cell(), dl: cell() }, { spd: cell(), dl: cell() }] },
  };
  player.paintFrame(view);
  const state = (c) => [...c.cls].filter((k) => k === "dh-pos" || k === "dh-neg").join(",");
  return { gauge: state(view.g.delta), compareLane: state(view.g.board[1].dl), thirdLane: state(view.g.board[2].dl) };
}

test("the paint block marks the BEHIND side dh-pos and the AHEAD side dh-neg on both widgets", () => {
  // compare (82 s) and third (84 s) trail the 80 s reference: both are behind.
  assert.deepEqual(paint(80, 82, 84), { gauge: "dh-pos", compareLane: "dh-pos", thirdLane: "dh-pos" },
    "a trailing driver must be dh-pos (the slower ink) on the gauge and the lane board");
  // compare (78 s) and third (76 s) lead it: both are ahead.
  assert.deepEqual(paint(80, 78, 76), { gauge: "dh-neg", compareLane: "dh-neg", thirdLane: "dh-neg" },
    "a leading driver must be dh-neg (the faster ink) on the gauge and the lane board");
  // Level within the 0.02 s dead band: neither colour.
  assert.deepEqual(paint(80, 80, 80), { gauge: "", compareLane: "", thirdLane: "" },
    "a dead heat paints neither colour");
});

test("a positive delta is the SLOWER colour on every widget that uses it", () => {
  for (const base of BEHIND_IS_POS)
    assert.equal(tokenFor(base, "dh-pos"), "--slower-ink",
      `.${base}.dh-pos must be --slower-ink (the red TEXT ink): dh-pos means "behind" in telemetry-player.js`);
});

test("a negative delta is the FASTER colour on every widget that uses it", () => {
  for (const base of BEHIND_IS_POS)
    assert.equal(tokenFor(base, "dh-neg"), "--faster",
      `.${base}.dh-neg must be --faster: dh-neg means "ahead" in telemetry-player.js`);
});
