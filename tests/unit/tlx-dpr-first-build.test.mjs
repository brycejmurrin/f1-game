/* tlx-dpr-first-build.test.mjs — the FIRST-BUILD DPR HOLD (#6362, Refs #5222).
 * iPhone WebGPU at 852×368 CSS, DPR 3: the first `race monza` after loading ?lab=dpr2 (1704×736) or ?lab=dpr3
 * (2556×1104) reloaded the tab; cap 1.5 (1278×552) never did, and steady state at dpr3 ran ~60 fps. The post
 * chain's render targets are JS objects sized at boot but take GPU memory on their first draw, which is the entry
 * warm's drawWarm (tlx.js drawWarmStage), in the same window as every pipeline compile. So a phone holds a raised cap
 * at its tier's 1.5 until a world presents after a race-entry warm, then grows on the next animation frame.
 * This file pins the rule, the create() state machine (lifted verbatim), the release ORDER inside present(), and
 * the byte reckoning the issue quotes.
 * Run: node --test tests/unit/tlx-dpr-first-build.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const SRC = fs.readFileSync(absSrc("js/render/three/tlx.js"), "utf8");
const slice = (from, to) => { const a = SRC.indexOf(from); assert.notEqual(a, -1, "tlx.js moved: " + from); return SRC.slice(a, SRC.indexOf(to, a) + to.length); };

// tlx.js under a stubbed `location` (three cannot boot in the node VM), plus create()'s own cap lines lifted after it.
const CREATE_CAP = slice("let _dprBoost = 0, _dprCeil = 0;", "\n") + slice("let DPR_CAP = ", "\n") +
  slice("function reCapDpr() {", "\n      }") + "\n" + slice("let _dprHoldWarmed = false", "\n") +
  slice("function _releaseDprHold() {", "\n      }") + "\nvar f = {" + slice("capDpr(n) {", "\n        },") + "};";
function tlx(search, create = null) {
  const ctx = vm.createContext({ location: { search }, URLSearchParams, WeakSet, WeakMap, Math, Object, Number, String,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, ...(create || {}) });
  ctx.window = ctx;
  const lifted = create ? "\nvar dprCapFor = TLX.dprCapFor; function resizeNow() { resized++; }\n" + CREATE_CAP : "";
  vm.runInContext(SRC.replace(/^const TLX = /m, "var TLX = ") + lifted, ctx, { filename: absSrc("js/render/three/tlx.js") });
  return ctx;
}
const ev = (c, ctx) => vm.runInContext(c, ctx, { filename: "vm-page:evaluate" });

test("dprCapFor's hold keeps a RAISED cap at the tier's; it never raises, and the sentinel's ceiling still wins", () => {
  const f = tlx("").TLX.dprCapFor, dpr3 = tlx("?lab=dpr3").TLX.dprCapFor;
  // [fn, lite, mobileTier, boost, ceil, hold] -> cap
  const rows = [
    [[f, null, true, 3, 0, true], 1.5], [[f, null, true, 3, 0, false], 3],     // RESOLUTION MAX: held, then released
    [[dpr3, null, true, 0, 0, true], 1.5], [[dpr3, null, true, 0, 0, false], 3],
    [[f, null, true, 0, 0, true], 1.5], [[f, null, false, 0, 0, true], 2],     // nothing raised: the hold is a no-op
    [[f, null, true, 3, 1, true], 1], [[dpr3, { dprCap: 1.25 }, true, 0, 0, true], 1.25],
  ];
  assert.deepEqual(rows.map(([[fn, ...a]]) => fn(...a)), rows.map(([, v]) => v));
});

test("create(): a phone boots held, a desktop does not; release re-sizes once on the next frame", () => {
  const run = (search, mobileTier) => {
    const frames = [];
    const ctx = tlx(search, { mobileTier, _lite: null, resized: 0, requestAnimationFrame: (fn) => frames.push(fn), Log: { warn() {} } });
    const boot = ev("[DPR_CAP, _dprHold]", ctx);
    ev("_releaseDprHold()", ctx);
    const beforeFrame = [ev("DPR_CAP", ctx), ctx.resized];
    frames.forEach((fn) => fn());
    return { boot: [...boot], beforeFrame, after: [ev("DPR_CAP", ctx), ctx.resized] };
  };
  assert.deepEqual(run("?lab=dpr3", true), { boot: [1.5, true], beforeFrame: [1.5, 0], after: [3, 1] }, "phone, ?lab=dpr3");
  assert.deepEqual(run("?lab=dpr2", true), { boot: [1.5, true], beforeFrame: [1.5, 0], after: [2, 1] }, "phone, ?lab=dpr2");
  assert.deepEqual(run("", true), { boot: [1.5, true], beforeFrame: [1.5, 0], after: [1.5, 0] }, "phone, nothing raised: no re-size");
  assert.deepEqual(run("?lab=dpr3", false).boot, [3, false], "desktop: no hold");
});

test("capDpr compares against the UNHELD cap, so the crash sentinel's ceiling is kept through the hold", () => {
  const ctx = tlx("?lab=dpr3", { mobileTier: true, _lite: null, resized: 0 });
  const step = (c) => [ev(c, ctx), ev("DPR_CAP", ctx)];
  // Held at 1.5 under ?lab=dpr3: capDpr(2) records a ceiling (the unheld cap is 3) and the release lands on it.
  assert.deepEqual([step("f.capDpr(2)"), step("_dprHold = false; reCapDpr()"), step("f.capDpr(2.5)")], [[false, 1.5], [true, 2], [false, 2]]);
});

test("ORDER: the hold releases only on a painted world frame after any warm in flight, armed by a race-entry warm", () => {
  const pending = SRC.indexOf("if (_warmPending) return;");
  const release = SRC.indexOf("_releaseDprHold();", pending);
  const painted = SRC.lastIndexOf("painted = true;", release);
  assert.ok(pending > 0 && painted > pending && release > painted, "present(): warm gate -> painted -> release");
  // The release line and the warm's arming line, run as shipped.
  const releaseLine = SRC.slice(SRC.lastIndexOf("\n", release) + 1, SRC.indexOf("\n", release));
  const fires = (st) => { const c = vm.createContext({ ...st, n: 0, _releaseDprHold() { c.n++; } }); ev(releaseLine, c); return c.n; };
  const world = { _postF: { proj: [], noEnv: false }, _dprHold: true, _dprHoldWarmed: true, _dprHoldFrames: 0 };
  assert.deepEqual([fires(world), fires({ ...world, _postF: { proj: [], noEnv: true } }), fires({ ...world, _dprHoldWarmed: false }),
    fires({ ...world, _dprHoldWarmed: false, _dprHoldFrames: 1800 }), fires({ ...world, _dprHold: false })], [1, 0, 0, 1, 0],
  "a world frame after the race warm releases; a garage frame, a menu-only world (until 1800 frames) and a released hold do not");
  const arm = SRC.indexOf("_dprHoldWarmed = true;"), armLine = SRC.slice(SRC.lastIndexOf("\n", arm) + 1, SRC.indexOf("\n", arm));
  const armed = (where) => { const c = vm.createContext({ _warmWhere: where, _dprHold: true, _dprHoldWarmed: false }); ev(armLine, c); return c._dprHoldWarmed; };
  assert.deepEqual(["menu", "loading", "race"].map(armed), [false, true, true]);
});

// The reckoning the issue quotes: the phone WebGPU chain at GRAPHICS LOW (SSAO / godray / SSR targets shed).
// scene rg11b10 4 B + ssrTag r16float 2 B + depth 4 B; ldr rgba8 4 B; bloom 5 levels rg11b10 at half size and
// halving (layoutBloom: a level exists while both sides >= 8); swap chain bgra8 x3.
function postBytes(w, h) {
  let bloom = 0, bw = Math.floor(w / 2), bh = Math.floor(h / 2);
  for (let i = 0; i < 5; i++) { if (bw >= 8 && bh >= 8) bloom += bw * bh * 4; bw >>= 1; bh >>= 1; }
  return { post: w * h * (4 + 2 + 4 + 4) + bloom, swap: w * h * 4 * 3 };
}
test("byte reckoning: the held first build allocates the cap-1.5 chain whatever the lab (MB)", () => {
  const size = (dpr) => [Math.round(852 * dpr), Math.round(368 * dpr)];
  const mb = (dpr) => { const b = postBytes(...size(dpr)); return [Math.round(b.post / 1e5) / 10, Math.round((b.post + b.swap) / 1e5) / 10]; };
  assert.deepEqual([size(1.5), size(2), size(3)], [[1278, 552], [1704, 736], [2556, 1104]]);
  // [post targets, + swap chain]: the first-build allocation scaled 1 : 1.78 : 4.0 with the buffer.
  assert.deepEqual([mb(1.5), mb(2), mb(3)], [[10.8, 19.3], [19.2, 34.3], [43.3, 77.1]]);
  // Held, the first build's post targets at dpr2 / dpr3 are the 1.5 chain's: the only size known not to reload.
  const held = tlx("?lab=dpr3").TLX.dprCapFor(null, true, 0, 0, true);
  assert.deepEqual(postBytes(...size(held)), postBytes(...size(1.5)));
});
