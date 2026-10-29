/* gfx-escalation — race-entry ctx-loss must not paint Graphics unavailable. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { gameSource, symbolSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const runSrc = (ctx, rel) => vm.runInContext(read(rel), ctx, { filename: absSrc(rel) });

test("onReloadBudgetExceeded prefers menu recovery while RaceEntryProfile is armed", () => {
  const ctx = vm.createContext({
    RaceEntryProfile: { armed: () => true },
    RendererPicker: { showUnavailable: () => { ctx.panels.push("nogl"); } },
    sessionStorage: { setItem() {} },
    document: { getElementById: () => ({ id: "nogl" }) },
    panels: [],
    menu: 0,
  });
  runSrc(ctx, "js/perf/gfx-escalation.js");
  vm.runInContext(`GfxEscalation.registerMenuRecover(() => { menu++; });
    GfxEscalation.onReloadBudgetExceeded(4, {
      recordGfxBudgetExhausted: () => {},
      showUnavailable: () => { panels.push("nogl"); },
      panel: { id: "nogl" },
    });`, ctx);
  assert.equal(ctx.menu, 1);
  assert.equal(ctx.panels.length, 0);
});

test("onReloadBudgetExceeded paints unavailable when race entry is not armed", () => {
  const ctx = vm.createContext({
    RaceEntryProfile: { armed: () => false },
    RendererPicker: { showUnavailable: () => { ctx.panels.push("picker"); } },
    sessionStorage: { setItem() {} },
    document: { getElementById: () => ({ id: "nogl" }) },
    panels: [],
  });
  runSrc(ctx, "js/perf/gfx-escalation.js");
  vm.runInContext(`const verdict = GfxEscalation.onReloadBudgetExceeded(4, {
    recordGfxBudgetExhausted: () => {},
    showUnavailable: (opts) => { panels.push(opts.panel.id); },
    panel: { id: "nogl" },
  });
    verdict;`, ctx);
  assert.deepEqual(ctx.panels, ["nogl"]);
});

test("GLX dedupes repeated webglcontextlost before spending reload budget", () => {
  const src = read("js/render/glx/glx.js");
  assert.ok(src.includes("if (_ctxLost) return;"));
});

test("game.js wires GfxEscalation to quitToMenuAfterCtxLost", () => {
  const union = gameSource();
  assert.ok(union.includes("GfxEscalation.registerMenuRecover(quitToMenuAfterCtxLost)"));
  assert.ok(union.includes("installRaceEntrySoften"));
  assert.ok(!read("js/perf/gfx-escalation.js").includes("localStorage.setItem(\"apex26.envProbeOff\""));
});

test("race-entry soften does not persist envProbeOff to storage", () => {
  const union = gameSource();
  const soften = symbolSource("function installRaceEntrySoften()");
  assert.ok(union.includes("_raceEntryEnvProbeSession"));
  assert.ok(union.includes("clearRaceEntrySoften"));
  assert.ok(!soften.includes("localStorage.setItem"));
  assert.ok(soften.includes("envProbeOptOut"));
  assert.ok(soften.includes("softwareRaster"));
  assert.ok(!soften.includes("setRenderScale("), "software entry must not resize; PerfGov chooses the scale once");
  assert.ok(!symbolSource("function clearRaceEntrySoften()").includes("setRenderScale("));
  assert.ok(union.includes("!_raceEntryEnvProbeSession"));
});

function budgetTab({ getDenied = false, setDenied = false, removeDenied = false, storage = new Map(), win = { name: "player-window" } } = {}) {
  const mode = { getDenied, setDenied, removeDenied };
  const ctx = vm.createContext({ window: win, sessionStorage: {
    getItem(k) { if (mode.getDenied) throw Error("denied get"); return storage.get(k) ?? null; },
    setItem(k, v) { if (mode.setDenied) throw Error("denied set"); storage.set(k, String(v)); },
    removeItem(k) { if (mode.removeDenied) throw Error("denied remove"); storage.delete(k); },
  } });
  runSrc(ctx, "js/perf/gfx-escalation.js");
  return { ctx, mode, storage, win, budget: vm.runInContext("GfxEscalation", ctx) };
}

for (const [getDenied, setDenied] of [[true, false], [false, true], [true, true], [false, false]]) {
  test(`reload budget survives fresh documents (denied get=${getDenied}, set=${setDenied})`, () => {
    const win = { name: "player\nowned name" }, storage = new Map();
    for (let n = 1; n <= 5; n++) {
      const h = budgetTab({ getDenied, setDenied, storage, win });
      assert.equal(h.budget.reloadCount(), n - 1);
      assert.equal(h.budget.nextReloadCount(), n);
      assert.equal(win.name, `player\nowned name\napex26.ctxLostReloads=${n}`);
    }
  });
}

test("partial storage recovery and a clean race preserve the same recovery episode", () => {
  const h = budgetTab({ getDenied: true, setDenied: true, removeDenied: true });
  assert.equal(h.budget.nextReloadCount(), 1);
  assert.equal(h.budget.nextReloadCount(), 2);
  h.mode.getDenied = false; // reads recover first: empty storage must not erase fallback
  assert.equal(h.budget.nextReloadCount(), 3);
  h.mode.setDenied = false;
  assert.equal(h.budget.nextReloadCount(), 4);
  assert.equal(h.storage.get("apex26.ctxLostReloads"), "4");
  h.mode.setDenied = true;
  h.budget.resetReloadBudget();
  assert.equal(h.budget.reloadCount(), 0, "stale readable storage cannot undo clean reset");
  const next = budgetTab({ storage: h.storage, win: h.win });
  assert.equal(next.budget.reloadCount(), 0, "zero reset marker survives fresh document");
  assert.equal(next.budget.nextReloadCount(), 1);
  next.budget.resetReloadBudget();
  assert.equal(h.win.name, "player-window");
  assert.equal(h.storage.has("apex26.ctxLostReloads"), false);
});

test("legacy whole-name marker migrates and clean reset preserves unrelated names", () => {
  const h = budgetTab({ win: { name: "apex26.ctxLostReloads=3" } });
  assert.equal(h.budget.nextReloadCount(), 4);
  h.budget.resetReloadBudget();
  assert.equal(h.win.name, "");
  h.win.name = "not apex26.ctxLostReloads=9";
  h.budget.resetReloadBudget();
  assert.equal(h.win.name, "not apex26.ctxLostReloads=9");
});

test("fresh navigate entry clears a stale reload budget", () => {
  const storage = new Map([["apex26.ctxLostReloads", "3"]]);
  const win = { name: "player\napex26.ctxLostReloads=3" };
  const ctx = vm.createContext({
    window: win,
    sessionStorage: {
      getItem(k) { return storage.get(k) ?? null; },
      setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); },
    },
    performance: { getEntriesByType(type) { return type === "navigation" ? [{ type: "navigate" }] : []; } },
    document: { querySelector: () => ({ content: "1695" }) },
  });
  runSrc(ctx, "js/perf/gfx-escalation.js");
  assert.equal(vm.runInContext("GfxEscalation.reloadCount()", ctx), 0);
  assert.equal(storage.has("apex26.ctxLostReloads"), false);
});

test("noteCleanMenuBoot clears budget when the shell build changed on reload", () => {
  const storage = new Map([
    ["apex26.ctxLostReloads", "3"],
    ["apex26.ctxLostBudgetBuild", "1694"],
  ]);
  const ctx = vm.createContext({
    window: { name: "apex26.ctxLostReloads=3" },
    sessionStorage: {
      getItem(k) { return storage.get(k) ?? null; },
      setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); },
    },
    performance: { getEntriesByType(type) { return type === "navigation" ? [{ type: "reload" }] : []; } },
    document: { querySelector: () => ({ content: "1695" }) },
  });
  runSrc(ctx, "js/perf/gfx-escalation.js");
  vm.runInContext("GfxEscalation.noteCleanMenuBoot()", ctx);
  assert.equal(vm.runInContext("GfxEscalation.reloadCount()", ctx), 0);
});

// Fresh VM documents exercise the real loss handlers and real budget owner.
// No GPU is simulated; hidden loss and duplicate-event latches remain production code.
for (const backend of ["three", "glx"]) {
  test(`${backend} visible losses after boot stop reloading across denied-storage documents`, () => {
    const src = read(backend === "three" ? "js/render/three/tlx.js" : "js/render/glx/glx.js");
    const from = backend === "three" ? "renderer.onDeviceLost = function (info) {" : 'canvas.addEventListener("webglcontextlost", function (e) {';
    const until = backend === "three" ? "\n      try {\n        let onRestored" : "\n    // Restore obeys";
    const a = src.indexOf(from), b = src.indexOf(until, a);
    assert.ok(a > 0 && b > a);
    assert.equal(/window\.name\s*=/.test(src), false, "the shared owner alone mutates the fallback counter");
    const win = { name: "player-window" }, storage = new Map();
    let reloads = 0, terminal = 0, last;
    for (let boot = 1; boot <= 6; boot++) {
      const h = budgetTab({ getDenied: true, setDenied: true, removeDenied: true, win, storage });
      const timers = [], events = {};
      Object.assign(h.ctx, {
        renderer: {}, canvas: { addEventListener(type, fn) { events[type] = fn; } },
        initOwner: { active: true }, _threeOnLost: null, _deviceLost: false, _ctxLost: false,
        _warmRequested: true, _warmPending: {}, _warmDone: false, _lossCounted: false,
        _nowMs: () => 6000, _shownAt: -1e9, _bgLoss: () => false,
        _glPin: "0", forceWebGL: false, _autoStayGL: false,
        document: { hidden: false, getElementById: () => ({}), addEventListener() {}, removeEventListener() {} },
        localStorage: { setItem() {}, removeItem() {} },
        setTimeout(fn) { timers.push(fn); }, location: { reload() { reloads++; } },
        recordGfxBudgetExhausted() {}, RendererPicker: { showUnavailable() { terminal++; } },
      });
      vm.runInContext(src.slice(a, b), h.ctx, { filename: "vm-snippet:renderer-loss-handler" });
      const lost = backend === "three" ? h.ctx.renderer.onDeviceLost : events.webglcontextlost;
      last = { h, lost };
      lost({ preventDefault() {} }); lost({ preventDefault() {} });
      for (const fn of timers) fn();
      assert.equal(h.budget.reloadCount(), boot, "duplicate events spend one strike only");
    }
    assert.equal(reloads, backend === "three" ? 3 : 2);
    assert.equal(terminal, backend === "three" ? 3 : 4);
    // A background loss still reloads on visibility, without consuming budget.
    const { h, lost } = last;
    h.budget.resetReloadBudget(); h.ctx._deviceLost = false; h.ctx._ctxLost = false;
    h.ctx.document.hidden = true;
    let visible;
    h.ctx.document.addEventListener = (type, fn) => { if (type === "visibilitychange") visible = fn; };
    const prior = reloads;
    lost({ preventDefault() {} });
    assert.equal(h.budget.reloadCount(), 0);
    assert.equal(reloads, prior);
    h.ctx.document.hidden = false; visible();
    assert.equal(reloads, prior + 1);
    assert.equal(h.budget.reloadCount(), 0);
  });
}
