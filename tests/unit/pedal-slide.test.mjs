/* pedal-slide.test.mjs — PEDAL SLIDE (#5996), measured through the real
 * hold-button listeners (js/input/hold-buttons.js + js/input/pedal-travel.js).
 *
 * A thumb on GAS slides onto BRAKE (the slide hand-off, #5575):
 *   INSTANT (shipped default): BRAKE arrives at 100 % at once.
 *   EASE: BRAKE arrives at PedalTravel.MIN and ramps to full over RAMP_PX of
 *         further travel; the ramp never falls back, and back on GAS it ramps again.
 * The steer arrows (no `easeIn`) keep the full-press arrival in both modes.
 *
 * Run: node --test tests/unit/pedal-slide.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");

// GAS is the lower box (y 200..300), BRAKE the upper one (y 100..200) at x 0..100.
function boot(mode) {
  const els = new Map();
  function el(id, box) {
    const on = {};
    const e = {
      id, hidden: false, disabled: false, isConnected: true, parentElement: null,
      addEventListener: (t, f) => { (on[t] ||= []).push(f); },
      fire(t, ev) { (on[t] || []).forEach((f) => f({ pointerId: 1, pointerType: "touch", isTrusted: true, preventDefault() {}, ...ev })); },
      setAttribute() {}, removeAttribute() {}, getBoundingClientRect: () => box,
      setPointerCapture() {}, releasePointerCapture() {},
    };
    els.set(id, e);
    return e;
  }
  el("gas", { left: 0, top: 200, width: 100, height: 100 });
  el("brake", { left: 0, top: 100, width: 100, height: 100 });
  el("left", { left: 0, top: 0, width: 100, height: 100 });
  el("right", { left: 100, top: 0, width: 100, height: 100 });
  const sb = { document: { getElementById: (id) => els.get(id) || null }, getComputedStyle: () => ({}), Math };
  vm.createContext(sb);
  for (const rel of ["js/input/pedal-travel.js", "js/input/hold-buttons.js"]) vm.runInContext(read(rel), sb, { filename: absSrc(rel) });
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const hb = sb.InputHoldButtons.create({ clamp, beforeReleaseAll() {}, slideEase: () => mode.v === "ease" });
  const lv = { gas: 0, brake: 0, left: 0, right: 0 };
  for (const id of ["gas", "brake"]) {
    hb.wireHold(id, () => {}, (l) => { lv[id] = l; }, { sibling: id === "gas" ? "brake" : "gas", easeIn: true });
  }
  hb.wireHold("left", () => {}, (l) => { lv.left = l; }, { axis: "x", dir: -1, sibling: "right" });
  hb.wireHold("right", () => {}, (l) => { lv.right = l; }, { axis: "x", dir: 1, sibling: "left" });
  return { els, lv, PT: sb.PedalTravel };
}
// pointermove goes to whichever button holds the pointer; the landing button forwards it.
const move = (els, x, y) => els.get("gas").fire("pointermove", { clientX: x, clientY: y });

test("INSTANT: sliding GAS onto BRAKE arrives at full brake (shipped behaviour)", () => {
  const { els, lv } = boot({ v: "instant" });
  els.get("gas").fire("pointerdown", { clientX: 50, clientY: 250 });
  assert.equal(lv.gas, 1);
  move(els, 50, 195);
  assert.equal(lv.brake, 1, "full press on arrival");
  assert.equal(lv.gas, 0, "GAS let go");
});

test("EASE: BRAKE arrives at the floor and ramps to full over RAMP_PX", () => {
  const { els, lv, PT } = boot({ v: "ease" });
  assert.equal(PT.RAMP_PX, 40);
  els.get("gas").fire("pointerdown", { clientX: 50, clientY: 250 });
  move(els, 50, 195);                       // crosses in at y 195
  assert.equal(lv.brake, PT.MIN, "arrives light, not 100 %");
  assert.equal(lv.gas, 0);
  move(els, 50, 175);                       // 20 px in
  assert.equal(lv.brake, 0.5);
  move(els, 50, 185);                       // back 10 px: the ramp never falls
  assert.equal(lv.brake, 0.5);
  move(els, 50, 150);                       // 45 px in: full
  assert.equal(lv.brake, 1);
  move(els, 50, 190);                       // ramp finished: stays full, no ease gesture
  assert.equal(lv.brake, 1);
  els.get("brake").fire("pointerup", {});
  assert.equal(lv.brake, 0);
});

test("EASE: sliding back onto GAS ramps the throttle in too", () => {
  const { els, lv, PT } = boot({ v: "ease" });
  els.get("brake").fire("pointerdown", { clientX: 50, clientY: 150 });
  assert.equal(lv.brake, 1, "a direct touch is still a full stamp");
  els.get("brake").fire("pointermove", { clientX: 50, clientY: 205 });
  assert.equal(lv.gas, PT.MIN);
  assert.equal(lv.brake, 0);
  els.get("brake").fire("pointermove", { clientX: 50, clientY: 225 });
  assert.equal(lv.gas, 0.5);
});

test("EASE leaves the steer arrows' slide arrival at full", () => {
  const { els, lv } = boot({ v: "ease" });
  els.get("left").fire("pointerdown", { clientX: 50, clientY: 50 });
  els.get("left").fire("pointermove", { clientX: 150, clientY: 50 });
  assert.equal(lv.right, 1);
});

test("the mode is read per slide: switching back to INSTANT restores the full press", () => {
  const mode = { v: "ease" };
  const { els, lv } = boot(mode);
  mode.v = "instant";
  els.get("gas").fire("pointerdown", { clientX: 50, clientY: 250 });
  move(els, 50, 195);
  assert.equal(lv.brake, 1);
});
