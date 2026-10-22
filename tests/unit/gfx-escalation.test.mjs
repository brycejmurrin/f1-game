/* gfx-escalation — race-entry ctx-loss must not paint Graphics unavailable. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

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
  const game = read("js/game.js");
  assert.ok(game.includes("GfxEscalation.registerMenuRecover(quitToMenuAfterCtxLost)"));
  assert.ok(game.includes("installRaceEntrySoften"));
  assert.ok(!read("js/perf/gfx-escalation.js").includes("localStorage.setItem(\"apex26.envProbeOff\""));
});

test("race-entry soften does not persist envProbeOff to storage", () => {
  const game = read("js/game.js");
  assert.ok(game.includes("_raceEntryEnvProbeSession"));
  assert.ok(game.includes("clearRaceEntrySoften"));
  const soften = game.slice(game.indexOf("function installRaceEntrySoften()"), game.indexOf("// Same latch for PER-CHUNK LAMPS"));
  assert.ok(!soften.includes("localStorage.setItem"));
  assert.ok(soften.includes("envProbeOptOut"));
  assert.ok(soften.includes("softwareRaster"));
  assert.ok(soften.includes("setRenderScale(0.72)"));
  assert.ok(game.includes("!_raceEntryEnvProbeSession"));
});
