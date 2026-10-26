/* A·W50 (2026-10-25): TitleWarm runs the menu's race prep + program warm on an idle TITLE, once per update on a
 * phone (Bryce: "Once per update"). Device Farm S5 (iPhone 14 Pro WebGPU): 45 s of title idle advanced nothing,
 * and a cold title -> START compiled every race pipeline at the lights (mirrorPrepare 32-35 s). The real module
 * runs in a VM with a fake DOM, store and clock; GaragePrebuild is the real one (its saveData / phoneHold). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { gameSource } from "../helpers/game-source.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function rig({ phone = false, saveData = false, stored = null, build = "1700", home = false, warmable = true } = {}) {
  const els = {
    overlay: { hidden: false, inert: false, hasAttribute: () => false },
    select: { hidden: true }, "race-settings": { hidden: true },
  };
  const disk = new Map(stored === null ? [] : [["titleWarm", stored]]);
  const store = { raw: (k) => (disk.has(k) ? disk.get(k) : null), rawSet: (k, v) => { disk.set(k, String(v)); return true; } };
  const clock = { t: 0 };
  const ctx = vm.createContext({
    performance: { now: () => clock.t },
    navigator: { connection: { saveData }, deviceMemory: 8 },
    matchMedia: () => ({ matches: false }),
    document: { hidden: false, querySelector: (q) => (q === 'meta[name="apex-build"]' ? { content: build } : null) },
    Log: { info() {}, warn() {} },
    MenuSheetGate: { open: () => false },
  });
  for (const f of ["js/garage/prebuild.js", "js/perf/title-warm.js"]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const G = { state: "menu", setupPreviewOn: false, headlessMode: false, gfx: { isMobile: phone, warm() {} } };
  const calls = { schedule: 0 };
  let ready = false;
  const W = vm.runInContext("TitleWarm", ctx).create(G, {
    $: (id) => els[id], ui: () => ({ state: () => ({ home }) }), store, idleMs: 1200,
    warmable: () => warmable, schedule: () => { calls.schedule++; }, prepReady: () => ready,
  });
  const tick = (ms) => { clock.t += ms; W.poll(); };
  // The quiet clock starts at the first poll (a title that just appeared is noisy, as GaragePrebuild's): poll, then idle.
  const idle = () => { tick(100); tick(2000); };
  return { W, G, els, disk, clock, calls, setReady: (v) => { ready = v; }, tick, idle };
}

test("a phone runs the title warm once per update: schedules after idle, records the build when the prep is warm", () => {
  const h = rig({ phone: true, stored: "1699", build: "1700" });
  h.tick(100); h.tick(1000);
  assert.equal(h.calls.schedule, 0, "not before MENU_IDLE_MS of quiet");
  h.tick(500);
  assert.equal(h.calls.schedule, 1, "an idle title starts the race prep");
  assert.equal(h.W.wants(), true, "scheduleFlybyTrack's current() accepts the title while it warms");
  h.tick(1000);
  assert.equal(h.disk.get("titleWarm"), "1699", "nothing recorded until the prep's warm has finished");
  h.setReady(true); h.tick(1000);
  assert.equal(h.disk.get("titleWarm"), "1700", "the build whose title warm completed");
  assert.equal(h.W.wants(), false);
  h.tick(5000);
  assert.equal(h.calls.schedule, 1, "once per session");
});

test("a phone that already warmed this build skips it; a new build warms again; a desktop warms every session", () => {
  const same = rig({ phone: true, stored: "1700", build: "1700" });
  same.idle();
  assert.equal(same.calls.schedule, 0, "Safari kept the pipelines: no speculative world on the title");
  assert.ok(same.W.state().last.why.includes("done-this-build"));
  const next = rig({ phone: true, stored: "1700", build: "1701" });
  next.idle();
  assert.equal(next.calls.schedule, 1, "the first title session after a deploy warms");
  const desk = rig({ phone: false, stored: "1700", build: "1700" });
  desk.idle();
  assert.equal(desk.calls.schedule, 1, "desktop / hardware: every session");
});

test("never under Save-Data, a 3D Home, no warm(), a hidden tab, or off the title", () => {
  for (const [name, opts, why] of [["save-data", { saveData: true }, "save-data"], ["3D Home", { home: true }, "home-3d"],
    ["GLX/WGX (no warm())", { warmable: false }, "no-warm"]]) {
    const h = rig(opts);
    h.idle();
    assert.equal(h.calls.schedule, 0, name);
    assert.ok(h.W.state().last.why.includes(why), `${name}: ${JSON.stringify(h.W.state().last.why)}`);
  }
  const pick = rig();
  pick.els.select.hidden = false; pick.idle();
  assert.equal(pick.calls.schedule, 0, "the picker runs its own prep");
  assert.ok(pick.W.state().last.why.includes("surface"));
});

test("leaving the menus mid-prep re-arms it; tapping RACE keeps it running through the picker", () => {
  const h = rig({ phone: true });
  h.idle();
  assert.equal(h.calls.schedule, 1);
  h.els.overlay.hidden = true; h.els.select.hidden = false; h.tick(1000);
  assert.equal(h.W.state().wanted, true, "RACE -> the picker: the prep runs on (its own current() covers the picker)");
  h.setReady(true); h.tick(1000);
  assert.equal(h.disk.get("titleWarm"), "1700", "and the build is recorded when it finishes there");
  const g = rig({ phone: true });
  g.idle();
  g.els.overlay.hidden = true; g.tick(1000);
  assert.equal(g.W.state().wanted, false, "left for another screen: dropped");
  g.els.overlay.hidden = false; g.idle();
  assert.equal(g.calls.schedule, 2, "back on an idle title: it starts again");
});

test("game.js wiring: the prep's current() accepts a title warm, and the poll is created and started", () => {
  const GAME = gameSource();
  const at = GAME.indexOf("const current = prep.current = ");
  const cur = GAME.slice(at, GAME.indexOf("\n  const prepare = ", at));
  assert.ok(cur.includes('|| (typeof titleWarm !== "undefined" && titleWarm.wants())'), "scheduleFlybyTrack's liveness includes the title warm (typeof: canary sandboxes lift it alone)");
  assert.ok(GAME.includes("schedule: () => scheduleFlybyTrack(true)") && GAME.includes("titleWarm.start();"), "created and started");
  assert.ok(GAME.includes("p.world && p.done && p.warmed && p.warmFrames === 0 && !p.warming"), "done = census-entry menuPrepReady's test");
  assert.ok(read("tools/manifest.cjs").includes('"js/perf/title-warm.js"'), "loaded");
  assert.ok(read("js/core/save-schema-registry.js").includes('"titleWarm": entry('), "store key registered");
});
