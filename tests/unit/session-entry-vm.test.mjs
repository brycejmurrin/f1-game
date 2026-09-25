/* js/race/session-entry.js, real game.js and lazy-script loader; script held across event
 * loop turns. This covers a user quit/change while scenery is downloading. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });
const tick = () => new Promise((r) => setImmediate(r));
function holdScenery(id) {
  delete g.sandbox.TrackScenery[id];
  const head = g.sandbox.document.head, append = head.appendChild;
  let held = null;
  head.appendChild = function (el) {
    if (el.tagName === "SCRIPT" && el.src.includes("/" + id + ".js")) { held = el; return el; }
    return append.call(this, el);
  };
  return {
    get held() { return !!held; },
    release() {
      assert.ok(held, "the actual lazy scenery script was requested");
      head.appendChild = append;
      append.call(head, held);
      held = null;
    },
    fail() {
      assert.ok(held, "the actual lazy scenery script was requested");
      const script = held;
      head.appendChild = append;
      held = null;
      script.onerror({ type: "error", error: new Error("injected scenery download failure") });
    },
    restore() { head.appendChild = append; },
  };
}
function select(id) { g.G.trackIdx = g.sandbox.Tracks.LIST.findIndex((t) => t.id === id); }

test("a synchronous scenery preparation failure releases the pending latch", async () => {
  const entry = vm.runInContext("SessionEntry", g.ctx).create();
  const p1 = entry.begin("race", "same", () => { throw new Error("inject refused"); },
    () => true, () => true, () => {});
  await assert.rejects(p1, /inject refused/);
  const p2 = entry.begin("race", "same", () => Promise.resolve(), () => true, () => true);
  assert.notStrictEqual(p2, p1);
  assert.equal(await p2, true);
});

test("quit invalidates a race whose scenery script has not arrived", async () => {
  g.G.quitToMenu(); select("bahrain");
  const h = holdScenery("bahrain");
  try {
    const oldCars = g.G.cars, p = g.G.startRace();
    await tick(); assert.ok(h.held);
    g.G.quitToMenu(); h.release();
    const outcome = await p;
    assert.equal(outcome.kind, "canceled");
    assert.equal(g.G.state, "menu");
    assert.strictEqual(g.G.cars, oldCars);
  } finally { h.restore(); }
});

test("quit invalidates a qualifying sheet whose scenery script is pending", async () => {
  g.G.quitToMenu(); select("bahrain"); g.G.session = "race";
  g.sandbox.document.getElementById("quali").hidden = true;
  const h = holdScenery("bahrain");
  try {
    const p = g.G.openQualiForNet(() => {});
    await tick(); assert.ok(h.held);
    g.G.quitToMenu(); h.release();
    const outcome = await p;
    assert.equal(outcome.kind, "canceled");
    assert.equal(g.G.session, "race");
    assert.equal(g.sandbox.document.getElementById("quali").hidden, true);
  } finally { h.restore(); }
});

test("changing selection during loading cancels the old request", async () => {
  g.G.quitToMenu(); select("bahrain");
  const h = holdScenery("bahrain");
  try {
    const p = g.G.startRace();
    await tick(); assert.ok(h.held);
    select("monza"); h.release();
    const outcome = await p;
    assert.equal(outcome.kind, "canceled");
    assert.equal(g.G.state, "menu");
    assert.notEqual(g.G.track?.def?.id, "bahrain");
  } finally { h.restore(); }
});

test("a weather change without another start cannot silently change the loading race", async () => {
  g.G.quitToMenu(); select("bahrain"); g.G.raceWeather = "dry";
  const h = holdScenery("bahrain");
  try {
    const p = g.G.startRace();
    await tick(); assert.ok(h.held);
    g.G.raceWeather = "rain"; h.release();
    assert.equal((await p).kind, "canceled");
    assert.equal(g.G.state, "menu");
  } finally { h.restore(); }
});

test("two agent requests have distinct outcomes when the later mode supersedes", async () => {
  g.G.quitToMenu(); g.G.raceGrid = "tier";
  const b = holdScenery("bahrain");
  let m;
  try {
    const old = g.apex.race("bahrain", "day", "dry");
    const oldResult = Promise.resolve(old).then(() => "started", (e) => e.message);
    await tick(); assert.ok(b.held);
    m = holdScenery("monaco");
    const next = g.apex.tt("monaco", "night");
    await tick(); assert.ok(m.held);
    m.release();
    const fresh = await next;
    b.release();
    assert.match(await oldResult, /superseded/);
    assert.equal(fresh.track, "monaco");
    assert.equal(g.G.track.def.id, "monaco");
    assert.equal(g.G.session, "tt");
  } finally { b.restore(); if (m) m.restore(); }
});

test("fire-and-forget start survives a delayed script failure without hiding awaiter rejection", async () => {
  g.G.quitToMenu(); select("bahrain");
  const previous = g.sandbox.TrackScenery.bahrain;
  const h = holdScenery("bahrain");
  const originalReset = g.sandbox.DebrisWorld.reset;
  const unhandled = [];
  const listener = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", listener);
  g.sandbox.DebrisWorld.reset = () => { throw new Error("injected delayed start failure"); };
  try {
    // The loader intentionally treats a script error as a completed request
    // (the track has fallback scenery). Fail the subsequent race commit to
    // exercise the actual rejecting promise AFTER that delayed load settles.
    const ignored = g.G.startRace();
    await tick(); assert.ok(h.held);
    h.fail();
    await tick(); await tick();
    assert.equal(g.G.state, "menu");
    assert.deepEqual(unhandled, [], "the ignored race promise must be observed");
    await assert.rejects(ignored, /injected delayed start failure/);

    // Attaching an awaiter after the fire-and-forget failure still sees the
    // original rejected promise; the observer did not replace its outcome.
    assert.equal(g.G.state, "menu");
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", listener);
    g.sandbox.DebrisWorld.reset = originalReset;
    g.sandbox.TrackScenery.bahrain = previous;
    h.restore();
  }
});
