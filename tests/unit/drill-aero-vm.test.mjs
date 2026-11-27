/* drill-aero-vm.test.mjs — the Aero drill end to end in the game VM (#7067: #6555 A7 + #6559 step 0).
 * 1. The LEARN door: the title is top, the door opens #learn, the Aero lesson's Scenario message
 *    launches the drill, and quitting puts every setting back. On base this failed at the first line:
 *    each DOM stub read hidden:false, so UiLayers.top() was #trackdesigner and the door refused.
 * 2. __apex.drill*: drillList pins the registry; drillLaunch / drillState / drillEnd round-trip.
 * 3. The stubs' seeds: `hidden` as index.html has it, and a detached element never shadows a shell id.
 *
 * Run: node --test tests/unit/drill-aero-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

// The player's own settings, which the drill (Monza GP, tier grid, Classic dirty air, real wind) overwrites.
const PLAYER = { raceGrid: "random", dirtyAir: "modern", wind: "off" };

const plain = (v) => JSON.parse(JSON.stringify(v));   // VM-realm objects compare by value

async function boot() {
  const g = await createGame({ carMeshes: false });
  const ev = (src) => vm.runInContext(src, g.ctx, { filename: "drill-aero-vm:ev" });
  return { g, ev };
}

function settings(g, ev) {
  const G = g.G;
  return { flow: G.flow, session: G.session, track: G.trackIdx, weather: G.raceWeather, grid: G.raceGrid,
    duel: G.duel, dirtyAir: G.raceDirtyAir, wind: ev("Wind.level()"), goal: G.coach.practiceGoal() };
}

/** Frames until the drill's rolling start is up: state "race", the drill no longer staging. */
async function toRace(g) {
  const r = await g.stepUntil(() => g.G.state === "race" && g.apex.drillState().staging === false, { maxSteps: 600 });
  assert.ok(r.ok, "the drill race never started: " + JSON.stringify(g.apex.drillState()));
}

function assertDrillRace(g, ev) {
  const G = g.G, st = g.apex.drillState();
  assert.equal(st.id, "aero");
  assert.equal(ev("Tracks.LIST[" + G.trackIdx + "].id"), "monza");
  assert.deepEqual(plain([G.flow, G.session, G.raceGrid, G.raceDirtyAir, ev("Wind.level()")]), ["gp", "race", "tier", "classic", "real"]);
  assert.equal(st.cars, 2, "the drill races the player and one rival");
  assert.equal(st.lap, 1);
  assert.ok(st.s >= 100, "begin() placed the player past the line: s=" + st.s);
  assert.equal(G.coach.practiceGoal(), "slipstream");
}

test("the LEARN door opens in the VM and launches and quits the Aero drill", async () => {
  const { g, ev } = await boot();
  try {
    G_settings(g);
    const before = settings(g, ev);
    assert.equal(ev("UiLayers.top()?.id"), "overlay", "the title is the top layer at the menu");
    ev('document.getElementById("mb-learn").click()');
    const opened = await g.settleAsync(() => ev('typeof LearnDoor !== "undefined" && document.getElementById("learn").tagName === "DIALOG"'));
    assert.ok(opened, "LAZY_LEARN loaded and LearnDoor built #learn");
    assert.equal(ev('document.getElementById("learn").hidden'), false);
    assert.equal(ev("UiLayers.top()?.id"), "learn", "#learn is the top layer once open");
    ev('document.getElementById("learn-open-aero").click()');
    assert.equal(ev('document.getElementById("learn-lab").getAttribute("src")'), "learn/aero/index.html");
    // The lab's SCENARIO button posts this from its same-origin iframe.
    ev('dispatchEvent({ type: "message", origin: location.origin, source: document.getElementById("learn-lab").contentWindow, data: { type: "apex-learn-scenario", id: "aero" } })');
    await g.settleAsync(() => g.G.state !== "menu");
    assert.equal(ev('document.getElementById("learn").hidden'), true, "LEARN closed for the drill");
    await toRace(g);
    assertDrillRace(g, ev);
    g.G.quitToMenu();
    assert.equal(g.G.state, "menu");
    assert.equal(g.apex.drillState().active, false);
    assert.deepEqual(settings(g, ev), before, "quitting restored every setting the drill wrote");
    assert.deepEqual(g.record.rejections.filter((r) => /MutationObserver/.test(r)), [], "no observer callback threw");
  } finally { g.close(); }
});

test("__apex.drill*: drillList, then a drillLaunch / drillState / drillEnd round trip", async () => {
  const { g, ev } = await boot();
  try {
    G_settings(g);
    const before = settings(g, ev);
    assert.deepEqual(plain(g.apex.drillList()), [], "nothing listed before LAZY_LEARN loads");
    assert.deepEqual(plain(g.apex.drillState()), { active: false, state: "menu" });
    assert.deepEqual(plain(g.apex.drillEnd()), { ok: false, error: "no_drill" });
    assert.deepEqual(plain(g.apex.drillRetry()), { ok: false, error: "no_drill" });
    // Definition order is evaluation order (grip.js defines at eval when the registry is up; LearnDoor lazily): sorted.
    const nope = plain(await g.apex.drillLaunch("nope"));
    assert.deepEqual({ ...nope, ids: nope.ids.sort() }, { ok: false, error: "unknown_drill", ids: ["aero", "grip", "telemetry"] });
    assert.deepEqual(plain(g.apex.drillList()).sort((a, b) => a.id.localeCompare(b.id)), [
      { id: "aero", lesson: "aero", track: "monza", flow: "gp", session: "race" },
      { id: "grip", lesson: "braking", track: "monza", flow: "gp", session: "tt" },
      { id: "telemetry", lesson: "telemetry", track: "monza", flow: "gp", session: "tt" },
    ]);
    const launched = await g.apex.drillLaunch("aero");
    assert.equal(launched.ok, true, JSON.stringify(launched));
    assert.equal(launched.id, "aero");
    assert.equal((await g.apex.drillLaunch("aero")).ok, false, "one drill at a time");
    await toRace(g);
    assertDrillRace(g, ev);
    assert.equal(g.apex.drillRetry().ok, true, "RETRY LAP inside the drill");
    const ended = g.apex.drillEnd();
    assert.deepEqual(plain(ended), { ok: true, id: "aero", reason: "quit", state: "menu" });
    assert.deepEqual(settings(g, ev), before, "drillEnd restored every setting the drill wrote");
  } finally { g.close(); }
});

test("stub seeds: hidden as the shell has it, and a detached element never shadows a shell id", async () => {
  const { g, ev } = await boot();
  try {
    assert.equal(ev('document.getElementById("overlay").hidden'), false, "#overlay has no hidden attribute in index.html");
    assert.equal(ev('document.getElementById("pausemenu").hidden'), true, "#pausemenu is hidden in index.html");
    assert.equal(ev('document.getElementById("no-such-id-7067").hidden'), true, "an id the shell lacks reads hidden");
    assert.equal(ev('(() => { const d = document.createElement("div"); d.id = "pausemenu"; return document.getElementById("pausemenu") !== d; })()'), true,
      "a created, never-attached element does not replace the shell's #pausemenu");
    assert.equal(ev('(() => { const d = document.createElement("div"); d.id = "fresh-7067"; document.body.appendChild(d); return document.getElementById("fresh-7067") === d; })()'), true,
      "an attached element is found by its id");
  } finally { g.close(); }
});

// The VM pins wind off and a random grid; dirty air is set apart so a restore of each is visible.
function G_settings(g) {
  g.G.raceGrid = PLAYER.raceGrid;
  g.G.raceDirtyAir = PLAYER.dirtyAir;
}
