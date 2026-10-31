/* DAILY START BEFORE LAZY_RACE_SESSION LANDED (#3591, Pages 40322290836 garage-out-before-card DAILY).
 * The DAILY pick ran the session stub's no-op prepareDaily; the bundle's onRaceSessionReady (the 9 s idle
 * prefetch) then moved teamIdx/driverIdx/difficulty mid-intro, entrySettings changed, live() went false
 * and START came back with no garage-out. raceIntroFromSheet now loads the bundle under the sheet first
 * and snapshots the request after it. Runs the real function from js/game.js in a vm harness. */
import { test } from "node:test";
import assert from "node:assert";
import vm from "node:vm";
import { gameSource } from "../helpers/game-source.mjs";

const game = gameSource();
const wrapper = game.slice(game.indexOf("function raceIntroFromSheet("), game.indexOf("function raceIntro(go) {"));
const awaitWarm = game.slice(game.indexOf("async function awaitIntroWarm("), game.indexOf("// THE STUDIO DRIVE-OUT:"));

function harness({ dailyOn, stub, cls = "standard" }) {
  const events = [];
  const btn = { textContent: "START TIME TRIAL", disabled: false }, back = { disabled: false }, sheet = { hidden: false };
  const ctx = {
    _introRun: 0, state: "menu", settings: "before", flybyBuildTimer: 0, _menuGate: { generation: 0 }, _introSheet: null,
    $: () => back, clearTimeout() {}, Log: { warn: (...a) => events.push(["warn", a[1]]) }, announce: () => events.push(["failed"]),
    gfx: { warming: () => false }, introNow: () => 0, menuSlice: async () => {},
    RaceEntryProfile: { spanAsync: async (_n, fn) => fn(), beginUi() {}, setProgressSink() {}, afterPaint: async () => {} },
    // These cases isolate DAILY hydration with the departure payload already present.
    GarageDepartureMotion: {}, GarageDepartureWheels: {},
    UiExperience: { isPracticePick: () => false }, isTimeTrial: () => true,
    entrySettings: () => ctx.settings, loadingScreen: { stop() {} }, cancelIntro() { ctx._introRun++; ctx.sheetRelease(false); },
    daily: { isActive: () => dailyOn, current: () => (dailyOn ? { class: cls } : null) }, SessionRecords: stub ? { _stub: true } : {},
    // The bundle's ready hook: a STANDARD daily's prepareDaily moves the car/driver/difficulty.
    ensureRaceSession: async () => { events.push(["session"]); ctx.settings = "after"; return true; },
    raceIntro: () => events.push(["intro", ctx.settings]),
  };
  vm.createContext(ctx);
  vm.runInContext(`${awaitWarm}\n${wrapper}\nfunction sheetRelease(hide){ const h=_introSheet; if(!h) return; _introSheet=null; h.btn.disabled=false; if(hide) h.sheet.hidden=true; }
    this.sheetRelease = sheetRelease; this.raceIntroFromSheet = raceIntroFromSheet;`, ctx);
  return { ctx, events, sheet, btn };
}

test("a DAILY on the session stub loads the bundle under the sheet, then starts the intro (no silent release)", async () => {
  const h = harness({ dailyOn: true, stub: true });
  h.ctx.raceIntroFromSheet(() => {}, h.sheet, h.btn);
  assert.deepStrictEqual(h.events, [["session"]], "the bundle load starts; the intro waits for it");
  assert.strictEqual(h.btn.disabled, true, "START reads PREPARING while the bundle loads");
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.deepStrictEqual(h.events, [["session"], ["intro", "after"]], "the intro runs on the post-prepareDaily request");
});

test("no DAILY, the bundle already landed, or an OPEN-class daily: the intro starts at once, as before", () => {
  for (const [dailyOn, stub, cls] of [[false, true], [true, false], [true, true, "open"]]) {
    const h = harness({ dailyOn, stub, cls });
    h.ctx.raceIntroFromSheet(() => {}, h.sheet, h.btn);
    assert.deepStrictEqual(h.events, [["intro", "before"]], JSON.stringify({ dailyOn, stub, cls }));
  }
});
