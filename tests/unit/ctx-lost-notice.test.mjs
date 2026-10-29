/* ctx-lost-notice — graphics context loss explains itself on the menu and clears reload budget at green. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { bootGlx } from "../helpers/glx-mock.mjs";
import { fnSource } from "../helpers/fn-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const TLX_FILE = { filename: absSrc("js/render/three/tlx.js") };

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

test("GLX arms apex26.ctxLostNotice before an automatic reload", () => {
  const h = bootGlx();
  h.sandbox.sessionStorage.removeItem("apex26.ctxLostReloads");
  h.loseContext();
  assert.equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostReloads"), "1");
  for (const timer of h.sandbox.__timers.splice(0)) timer();
  assert.equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostNotice"), "1");
});

// #3513: the notice is the contract for EVERY automatic loss reload, not just GLX's timer.
test("GLX: webglcontextrestored winning the race against the timer still arms the notice", () => {
  const h = bootGlx();
  h.sandbox.sessionStorage.removeItem("apex26.ctxLostReloads");
  h.sandbox.sessionStorage.removeItem("apex26.ctxLostNotice");
  h.loseContext();
  h.restoreContext();   // before the 1.2 s timer runs
  assert.equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostNotice"), "1");
});

function tlxLossVm(store, out) {
  const ss = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const timers = [];
  const ctx = vm.createContext({
    initOwner: { active: true }, _threeOnLost: null, _deviceLost: false, _warmRequested: true, _warmPending: {}, _warmDone: false,
    document: { hidden: false, addEventListener() {}, removeEventListener() {}, getElementById: (id) => ({ id }) },
    _nowMs: () => 1e6, _shownAt: 0, _lossCounted: false,
    localStorage: { setItem() {}, removeItem() {} }, sessionStorage: ss,
    _glPin: "1", forceWebGL: true, _autoStayGL: false,
    setTimeout: (fn) => { timers.push(fn); }, location: { reload() { out.reloads.push(store["apex26.ctxLostNotice"] || null); } },
    recordGfxBudgetExhausted() {}, RendererPicker: { showUnavailable() {} }, window: { name: "" }, renderer: {},
    Log: { warn() {} },
  });
  vm.runInContext(read("js/perf/gfx-escalation.js"), ctx, { filename: absSrc("js/perf/gfx-escalation.js") });
  return { ctx, timers };
}

test("TLX: device-loss reloads (first, second, third) and refuseTab all arm the notice first", () => {
  const tlxSrc = read("js/render/three/tlx.js");
  const lossBody = fnSource(tlxSrc, "renderer.onDeviceLost = function (info) {");
  for (const prior of ["0", "1", "2"]) {
    const store = { "apex26.ctxLostReloads": prior }, out = { reloads: [] };
    const v = tlxLossVm(store, out);
    vm.runInContext(lossBody + "\n renderer.onDeviceLost", v.ctx, TLX_FILE)({});
    for (const t of v.timers.splice(0)) t();
    assert.deepEqual(out.reloads, ["1"], "loss after " + prior + " reloads: the notice is stashed before the reload");
  }
  const store = { "apex26.ctxLostReloads": "0" }, out = { reloads: [] };
  const v = tlxLossVm(store, out);
  vm.runInContext(fnSource(tlxSrc, "const refuseTab = () => {") + ";\n refuseTab();", v.ctx, TLX_FILE);
  assert.deepEqual(out.reloads, ["1"], "refuseTab's reload explains itself");
});

// Negative cases from Merlin's #3534: past the reload budget nothing reloads, so nothing is explained.
test("past the reload budget: no reload, no notice (TLX loss, TLX refuseTab, GLX restore)", () => {
  const tlxSrc = read("js/render/three/tlx.js");
  const lossBody = fnSource(tlxSrc, "renderer.onDeviceLost = function (info) {");
  const store = { "apex26.ctxLostReloads": "3" }, out = { reloads: [] };
  const v = tlxLossVm(store, out);
  vm.runInContext(lossBody + "\n renderer.onDeviceLost", v.ctx, TLX_FILE)({});
  for (const t of v.timers.splice(0)) t();
  assert.deepEqual(out.reloads, []);
  assert.equal(store["apex26.ctxLostNotice"], undefined, "a fourth TLX loss arms no notice");
  const rs = { "apex26.ctxLostReloads": "2" }, ro = { reloads: [] };
  vm.runInContext(fnSource(tlxSrc, "const refuseTab = () => {") + ";\n refuseTab();", tlxLossVm(rs, ro).ctx, TLX_FILE);
  assert.deepEqual(ro.reloads, []);
  assert.equal(rs["apex26.ctxLostNotice"], undefined, "refuseTab past the budget arms no notice");
  const h = bootGlx();
  h.sandbox.sessionStorage.setItem("apex26.ctxLostReloads", "3");
  h.sandbox.sessionStorage.removeItem("apex26.ctxLostNotice");
  h.restoreContext();
  assert.equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostNotice"), null, "GLX restore past the budget arms no notice");
});

test("TLX: a webglcontextrestored reload after a counted loss arms the notice; a bare one does not", () => {
  const src = read("js/render/three/tlx.js");
  const i = src.indexOf('canvas.addEventListener("webglcontextrestored", onRestored = function () {');
  assert.ok(i > 0, "the TLX restore handler moved — check this test, not the code");
  const from = src.indexOf("function () {", i);
  const body = src.slice(from, src.indexOf("}, false);", from) + 1);
  for (const counted of [true, false]) {
    const store = { "apex26.ctxLostReloads": "1" }, out = { reloads: [] };
    const v = tlxLossVm(store, out);
    v.ctx._lossCounted = counted;
    vm.runInContext("(" + body + ")()", v.ctx, TLX_FILE);
    assert.deepEqual(out.reloads, [counted ? "1" : null]);
  }
});

test("select-screen consumes apex26.ctxLostNotice and wires RETRY to startRace", () => {
  const menus = read("js/ui/select-screen.js");
  assert.ok(menus.includes('sessionStorage.getItem(CTX_LOST_NOTICE_KEY) === "1"'));
  assert.ok(menus.includes("sessionStorage.removeItem(CTX_LOST_NOTICE_KEY)"));
  assert.ok(menus.includes("location.reload()"));
  assert.ok(menus.includes("CTX_LOST_NEED_RELOAD_KEY"));
  const game = read("js/game.js");
  assert.ok(game.includes("function quitToMenuAfterCtxLost()"));
  assert.ok(game.includes("stashCtxLostNotice()"));
  assert.ok(game.includes("GfxEscalation.stashInPageRecoverFlags"));
  assert.ok(read("js/perf/gfx-escalation.js").includes("apex26.ctxLostNeedReload"));
  assert.ok(game.includes("Graphics reset — retrying with lighter settings"));
});

test("lights-out and goRolling clear apex26.ctxLostReloads", () => {
  const game = read("js/game.js");
  const lights = game.indexOf('setState("race", feel.restartPending ? "restart-green" : "lights-out")');
  assert.ok(lights > 0);
  assert.ok(game.slice(lights, lights + 220).includes('GfxEscalation.resetReloadBudget()'));
  assert.ok(game.includes('goRolling: () => { if (state !== "count") return false; GfxEscalation.resetReloadBudget()'));
});

test("endRace still clears apex26.ctxLostReloads (radio-voice pin)", () => {
  const game = read("js/game.js");
  const i = game.indexOf("function endRace(forcedOrder)");
  assert.ok(i >= 0);
  assert.ok(game.slice(i, i + 400).includes('GfxEscalation.resetReloadBudget()'));
});
