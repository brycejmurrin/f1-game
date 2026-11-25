/* steer-tuning-lock.test.mjs — shipped STEER LOCK slider mapping (notch 7 = NORMAL)
 * and TOUCH SENSITIVITY (notch 5 = the shipped 0.12 drag range). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/input/steer-tuning.js"), "utf8");

/** The REAL slider maps, cut out of the source (brace-balanced) and evaluated. */
function extractFn(name) {
  const at = SRC.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} not found in steer-tuning.js`);
  let depth = 0, i = SRC.indexOf("{", at);
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}" && --depth === 0) break;
  }
  return new Function(`${SRC.slice(at, i + 1)}; return ${name};`)();
}

test("lockFromSlider (the real one): notch 7 is 0.35 rad (NORMAL / STANDARD steerLock)", () => {
  const lockFromSlider = extractFn("lockFromSlider");
  assert.ok(Math.abs(lockFromSlider(7) - 0.35) < 1e-9, `notch 7 = ${lockFromSlider(7)} rad`);
  assert.ok(Math.abs(lockFromSlider(5) - 0.293333) < 0.001, "notch 5 ~0.293");
  assert.ok(Math.abs(lockFromSlider(1) - 0.18) < 1e-9, "notch 1 = 0.18");
  assert.ok(Math.abs(lockFromSlider(10) - 0.435) < 1e-9, "notch 10 = 0.435");
});

test("touchRangeFromSlider: notch 5 is input.js TOUCH_RANGE_FRAC 0.12, ends 0.24 / 0.06, monotonic", () => {
  const f = extractFn("touchRangeFromSlider");
  const inputSrc = fs.readFileSync(path.join(ROOT, "js/input/input.js"), "utf8");
  const shipped = Number(/const TOUCH_RANGE_FRAC = ([\d.]+);/.exec(inputSrc)?.[1]);
  assert.equal(shipped, 0.12, "input.js TOUCH_RANGE_FRAC");
  assert.ok(Math.abs(f(5) - shipped) < 1e-12, `notch 5 = ${f(5)}, want ${shipped} (the default must be a no-op)`);
  assert.ok(Math.abs(f(1) - 0.24) < 1e-12, `notch 1 = ${f(1)}`);
  assert.ok(Math.abs(f(10) - 0.06) < 1e-12, `notch 10 = ${f(10)}`);
  for (let v = 1; v < 10; v++) assert.ok(f(v + 1) < f(v), `not decreasing at notch ${v}: ${f(v)} -> ${f(v + 1)}`);
});

// #5900: apex26.tiltDeg reached the ADVANCED fold's innerHTML as stored text (clamp passes a string
// through). The fold painter escapes its labels; a stored string is coerced to a number first.
test("the fold summary escapes its labels, so a stored tiltDeg string never becomes markup", async () => {
  const vm = await import("node:vm");
  const ctx = vm.createContext({ WeakMap, String });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/dom.js"), "utf8") + ";this.Dom=Dom;", ctx,
    { filename: path.join(ROOT, "js/ui/dom.js") });
  const target = { innerHTML: "" };
  ctx.Dom.paintFold(target, [["k", "FEEL"], ["val", "TILT <img src=x onerror=alert(1)>"]]);
  assert.equal(target.innerHTML, '<span data-fold="k">FEEL</span><span data-fold="sep"> · </span>'
    + '<span data-fold="val">TILT &#60;img src=x onerror=alert(1)&#62;</span>');
});

// #6620 row 4: a non-numeric stored slider value (a hand-edited apex26.* key) read through
// numStore falls back to the knob's default instead of walking through clamp to a NaN car state.
/** The REAL numStore line, cut out of the source and evaluated over a fake store. */
function storedNumWith(stored) {
  const line = SRC.split("\n").find((l) => l.startsWith("const numStore = "));
  assert.ok(line, "numStore not found in steer-tuning.js");
  const store = { get: (k, d) => (k in stored ? stored[k] : d) };
  const numStore = new Function("store", `${line} return numStore;`)(store);
  return (k, d) => numStore.get(k, d);
}

test("numStore.get: a finite number is returned untouched", () => {
  const n = storedNumWith({ a: 7, b: 0, c: -3.5 });
  assert.equal(n("a", 1), 7);
  assert.equal(n("b", 1), 0);
  assert.equal(n("c", 1), -3.5);
  assert.equal(n("absent", 6), 6, "an absent key gets its default");
});

test("numStore.get: a string, NaN, Infinity, null, object or boolean falls back to the default", () => {
  const n = storedNumWith({ s: "x", d: "5", nan: NaN, inf: Infinity, nul: null, o: {}, arr: [3], t: true });
  for (const k of ["s", "d", "nan", "inf", "nul", "o", "arr", "t"]) assert.equal(n(k, 4), 4, k);
});

test("every slider read in applySteerTuning goes through numStore, not a raw store.get", () => {
  const at = SRC.indexOf("function applySteerTuning(");
  const body = SRC.slice(at, SRC.indexOf("\n}\n", at));
  assert.doesNotMatch(body, /clamp\(store\.get\(/, "a raw store.get inside clamp lets a string through");
  for (const k of ["steerRate", "steerLock", "drivingHelp", "pace", "carWeight", "padSaturation", "gripSteer"])
    assert.match(body, new RegExp(`numStore\\.get\\("${k}"`), k);
});
