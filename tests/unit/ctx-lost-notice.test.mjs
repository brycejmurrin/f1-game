/* ctx-lost-notice — graphics context loss explains itself on the menu and clears reload budget at green. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { bootGlx } from "../helpers/glx-mock.mjs";
import { fnSource } from "../helpers/fn-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

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

test("GLX restore-race reload also arms apex26.ctxLostNotice", () => {
  const h = bootGlx();
  h.sandbox.sessionStorage.removeItem("apex26.ctxLostReloads");
  h.loseContext();
  // The 1.2 s loss timer is NOT run: webglcontextrestored wins the race and
  // reloads first, so the stash must come from the restore handler itself.
  h.restoreContext();
  assert.equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostNotice"), "1");
});

test("GLX restore past the reload budget does not reload or arm the notice", () => {
  const h = bootGlx();
  h.sandbox.sessionStorage.setItem("apex26.ctxLostReloads", "3");
  h.restoreContext();
  assert.equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostNotice"), null);
});

// TLX onDeviceLost, run for real (fnSource extraction, the tlx-fail-scope
// refuseTab pattern): the handler's closure deps are stubbed on the VM global.
function tlxDeviceLost(o = {}) {
  const src = read("js/render/three/tlx.js");
  const body = fnSource(src, "renderer.onDeviceLost = function (info) {");
  const store = { ...(o.ss || {}) };
  const local = {};
  const timers = [];
  const out = { store, local, timers, reloads: 0, errors: [] };
  const ctx = vm.createContext({
    renderer: {},
    initOwner: null,
    _threeOnLost: null,
    _deviceLost: false, _warmRequested: true, _warmPending: {}, _warmDone: false,
    _glPin: o.pin ?? null,
    _sessLostN: 0,
    _shownAt: -1e9,
    _nowMs: () => 100000,
    _fallbackLossCount: () => 0,
    _rememberFallbackLoss: () => {},
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: {
      setItem: (k, v) => { local[k] = String(v); },
      getItem: (k) => (k in local ? local[k] : null),
    },
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    location: { reload() { out.reloads++; } },
    window: { __apexReportError: (w, e) => out.errors.push([w, e.message]) },
    recordGfxBudgetExhausted: (w, e) => out.errors.push([w, e.message]),
    performance: { now: () => 100000 },
  });
  vm.runInContext(body, ctx, { filename: absSrc("js/render/three/tlx.js") });
  out.call = (info) => ctx.renderer.onDeviceLost(info || { reason: "unknown" });
  out.runTimers = () => { for (const t of timers.splice(0)) t(); };
  return out;
}

test("TLX device-loss reload arms apex26.ctxLostNotice", () => {
  const h = tlxDeviceLost();
  h.call();
  assert.equal(h.store["apex26.ctxLostReloads"], "1");
  assert.equal(h.store["apex26.ctxLostNotice"], undefined, "no notice before the reload timer fires");
  h.runTimers();
  assert.equal(h.reloads, 1);
  assert.equal(h.store["apex26.ctxLostNotice"], "1");
});

test("TLX third-loss fallback reload arms apex26.ctxLostNotice", () => {
  const h = tlxDeviceLost({ ss: { "apex26.ctxLostReloads": "2" } });
  h.call();
  assert.equal(h.store["apex26.tlxAutoGL"], "1", "AUTO stays on three WebGL2");
  h.runTimers();
  assert.equal(h.reloads, 1);
  assert.equal(h.store["apex26.ctxLostNotice"], "1");
});

test("TLX device loss past the budget reloads nothing and arms no notice", () => {
  const h = tlxDeviceLost({ ss: { "apex26.ctxLostReloads": "3" } });
  h.call();
  h.runTimers();
  assert.equal(h.reloads, 0);
  assert.equal(h.store["apex26.ctxLostNotice"], undefined);
  assert.equal(h.errors.length, 1, "the exhausted budget is still reported (ring helper)");
});

test("TLX context-restored reload arms the notice (restore race)", () => {
  const src = read("js/render/three/tlx.js");
  const i = src.indexOf('canvas.addEventListener("webglcontextrestored"');
  assert.ok(i > 0, "TLX registers a webglcontextrestored handler");
  const handler = src.slice(i, src.indexOf("}, false);", i));
  const stash = handler.indexOf('sessionStorage.setItem("apex26.ctxLostNotice", "1")');
  assert.ok(stash > 0, "the restore handler stashes the notice");
  assert.ok(stash < handler.indexOf("location.reload()"), "the stash lands before the reload");
});

// TLX refuseTab, run for real (same extraction pattern as tlx-fail-scope).
function tlxRefuse(o = {}) {
  const src = read("js/render/three/tlx.js");
  const body = fnSource(src, "const refuseTab = () => {") + ";";
  const store = { ...(o.ss || {}) };
  const out = { store, reloads: 0, errors: [] };
  const ctx = vm.createContext({
    _glPin: o.pin ?? null, forceWebGL: !!o.forceWebGL, _autoStayGL: !!o.autoStayGL, _sessLostN: 0,
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    localStorage: { removeItem: () => {} },
    location: { reload() { out.reloads++; } },
    window: { __apexReportError: (w, e) => out.errors.push([w, e.message]) },
    recordGfxBudgetExhausted: (w, e) => out.errors.push([w, e.message]),
  });
  out.call = vm.runInContext(body + "\n refuseTab", ctx, { filename: absSrc("js/render/three/tlx.js") });
  return out;
}

test("TLX refuseTab present-failure reload arms apex26.ctxLostNotice", () => {
  const r = tlxRefuse();
  r.call();
  assert.equal(r.reloads, 1);
  assert.equal(r.store["apex26.ctxLostNotice"], "1");
});

test("TLX refuseTab past the budget reloads nothing and arms no notice", () => {
  const r = tlxRefuse({ ss: { "apex26.ctxLostReloads": "2" } });
  r.call();
  assert.equal(r.reloads, 0);
  assert.equal(r.store["apex26.ctxLostNotice"], undefined);
  assert.equal(r.errors.length, 1);
});

// WGX _wgxEscalate, run for real (fnSource extraction): both reload rungs.
function wgxEscalate(o = {}) {
  const src = read("js/render/webgpu/wgx.js");
  const body = fnSource(src, "function _wgxEscalate(why, force) {");
  const local = { ...(o.ls || {}) };
  const session = { ...(o.ss || {}) };
  const out = { local, session, reloads: 0, glxBound: false };
  const ctx = vm.createContext({
    _lost: false,
    _capMuteWarned: false,
    WGX_MINIMAL: !!o.minimal, WGX_LITE: !!o.lite,
    _outProbeOff: !!o.outProbeOff,
    initActive: () => true,
    _rejectCapture: () => {},
    _healReset: () => {},
    _markGlxBound: () => { out.glxBound = true; },
    Log: { warn() {} },
    localStorage: {
      getItem: (k) => (k in local ? local[k] : null),
      setItem: (k, v) => { local[k] = String(v); },
      removeItem: (k) => { delete local[k]; },
    },
    sessionStorage: {
      getItem: (k) => (k in session ? session[k] : null),
      setItem: (k, v) => { session[k] = String(v); },
      removeItem: (k) => { delete session[k]; },
    },
    location: { reload() { out.reloads++; } },
  });
  const escalate = vm.runInContext(body + "\n_wgxEscalate", ctx, { filename: absSrc("js/render/webgpu/wgx.js") });
  out.call = (why, force) => escalate(why || "device lost (unknown)", force);
  return out;
}

test("WGX escalate rung-retry reload arms apex26.ctxLostNotice", () => {
  const h = wgxEscalate();
  h.call("device lost (unknown)", true);
  assert.equal(h.local["apex26.gfxWgxLevel"], "1", "first loss climbs to the lite rung");
  assert.equal(h.reloads, 1);
  assert.equal(h.session["apex26.ctxLostNotice"], "1");
});

test("WGX escalate GLX-fallback reload arms apex26.ctxLostNotice", () => {
  const h = wgxEscalate({ minimal: true });
  h.call("device lost (unknown)", true);
  assert.equal(h.glxBound, true);
  assert.equal(h.session["apex26.gfxClaimFail"], "1", "minimal loss surrenders the tab to GLX");
  assert.equal(h.reloads, 1);
  assert.equal(h.session["apex26.ctxLostNotice"], "1");
});

test("WGX escalate muted in capture mode reloads nothing and arms no notice", () => {
  const h = wgxEscalate({ outProbeOff: true });
  h.call("runtime GPU errors", false);
  assert.equal(h.reloads, 0);
  assert.equal(h.session["apex26.ctxLostNotice"], undefined);
});

test("select-screen consumes apex26.ctxLostNotice and wires RETRY to startRace", () => {
  const menus = read("js/ui/select-screen.js");
  assert.ok(menus.includes('sessionStorage.getItem(CTX_LOST_NOTICE_KEY) === "1"'));
  assert.ok(menus.includes("sessionStorage.removeItem(CTX_LOST_NOTICE_KEY)"));
  assert.ok(menus.includes("if (G.startRace) G.startRace()"));
  const game = read("js/game.js");
  assert.ok(game.includes("function quitToMenuAfterCtxLost()"));
  assert.ok(game.includes("stashCtxLostNotice()"));
  assert.ok(game.includes("Graphics reset — retrying with lighter settings"));
});

test("lights-out and goRolling clear apex26.ctxLostReloads", () => {
  const game = read("js/game.js");
  const lights = game.indexOf('setState("race", feel.restartPending ? "restart-green" : "lights-out")');
  assert.ok(lights > 0);
  assert.ok(game.slice(lights, lights + 220).includes('sessionStorage.removeItem("apex26.ctxLostReloads")'));
  assert.ok(game.includes('goRolling: () => { if (state !== "count") return false; try { sessionStorage.removeItem("apex26.ctxLostReloads")'));
});

test("endRace still clears apex26.ctxLostReloads (radio-voice pin)", () => {
  const game = read("js/game.js");
  const i = game.indexOf("function endRace(forcedOrder)");
  assert.ok(i >= 0);
  assert.ok(game.slice(i, i + 400).includes('sessionStorage.removeItem("apex26.ctxLostReloads")'));
});
