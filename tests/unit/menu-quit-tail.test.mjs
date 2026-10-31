/* menu-quit-tail.test.mjs — MenuQuitTail.afterOverlay only needs the deps it reads.
 *
 * Run: node --test tests/unit/menu-quit-tail.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/perf/menu-quit-tail.js"), "utf8");

function load() {
  const calls = { setFlow: [], consume: 0, career: 0, tyre: null };
  const docEl = { dataset: { team: "mclaren" } };
  const ctx = {
    Object, Array, String, RegExp, location: { hash: "" },
    document: { documentElement: docEl },
    MenuTeardown: undefined,
  };
  const MenuQuitTail = vm.runInNewContext(SRC + "\n;MenuQuitTail", ctx, {
    filename: absSrc("js/perf/menu-quit-tail.js"),
  });
  const deps = {
    _doc: docEl,
    mirrorPass: { cancelPreparation() { calls.mirror = true; } },
    stormFx: { _ltNextT: 1, _thunderT: 2 },
    setFlow(v) { calls.setFlow.push(v); },
    session: "quali",
    tyres: { setLevel(v) { calls.tyre = v; } },
    raceTyreWear: 0.4,
    IncidentSim: { reset() { calls.inc = true; } },
    DebrisWorld: { reset() { calls.deb = true; } },
    SeasonCal: { load() { return { round: 0 }; }, hasProgress() { return false; }, rounds() { return 24; } },
    season: null,
    $() { return { hidden: true }; },
    refreshCareerButton() { calls.career++; },
    CustomTracks: { consumeTrackHash() { calls.consume++; } },
    ensureNet() { return Promise.resolve(false); },
    netLobby: { openFromUrl() {} },
  };
  MenuQuitTail.wire(deps);
  return { MenuQuitTail, deps, calls };
}

test("afterOverlay resets session flow without needing forgetGp or unused wire fields", () => {
  const { MenuQuitTail, deps, calls } = load();
  assert.equal("team" in deps._doc.dataset, true);
  MenuQuitTail.afterOverlay("ignored");
  assert.equal(calls.mirror, true);
  assert.equal(deps.stormFx._ltNextT, 0);
  assert.equal(deps.stormFx._thunderT, -1);
  assert.deepEqual(calls.setFlow, ["gp"]);
  assert.equal(deps.session, "race");
  assert.equal(calls.tyre, 0.4);
  assert.equal(calls.inc, true);
  assert.equal(calls.deb, true);
  assert.equal(calls.consume, 1);
  assert.equal(calls.career, 1);
  assert.equal("team" in deps._doc.dataset, false);
});

test("MenuTeardown.deferQuitPhases runs heavy then tail off-stack on software GL", () => {
  const order = [];
  const ctx = {
    Object, Array, String, RegExp, performance: { now: () => 0 },
    Log: { warn() {}, error() {} },
    PerfGov: { softwareRaster: () => true },
    LoopHealth: { noteSync() {} },
    setTimeout(fn) { fn(); },
    requestAnimationFrame(fn) { fn(); },
    clearTimeout() {},
  };
  const src = readFileSync(join(ROOT, "js/perf/menu-teardown.js"), "utf8");
  const MenuTeardown = vm.runInNewContext(src + "\n;MenuTeardown", ctx, { filename: absSrc("js/perf/menu-teardown.js") });
  const ok = MenuTeardown.deferQuitPhases(
    () => order.push("heavy"),
    () => order.push("tail"),
  );
  assert.equal(ok, true);
  assert.deepEqual(order, ["heavy", "tail"]);
  ctx.PerfGov.softwareRaster = () => false;
  assert.equal(MenuTeardown.deferQuitPhases(() => order.push("x"), null), false);
});
