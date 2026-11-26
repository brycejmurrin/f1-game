/* driving-coach-lazy.test.mjs — #4748: the coach body (DrivingCoachBody, js/race/driving-coach.js) is LAZY_RACE_SESSION
 * behind the FULL façade js/race/driving-coach-boot.js. Before the body lands the façade must wire the same Settings
 * rows, answer "no practice" to game.js's per-frame reads, keep the player's COACH and GOAL choices, and ask for the
 * bundle once; the first call after it lands creates the body ONCE, with that GOAL, and paints the whole panel.
 *
 * Run: node --test tests/unit/driving-coach-lazy.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");

function fixture() {
  const ids = ["pm-coach", "pm-drill", "pm-pit-choice", "pm-coach-status", "pm-coach-tip", "pm-coach-summary", "pm-drill-status",
    "pm-lap-report", "pm-practice-state", "pm-driving-trace", "pm-practice-set", "pm-practice-retry", "pm-practice-rewind", "pm-practice-arm"];
  const nodes = new Map(ids.map((id) => [id, { id, textContent: "" }]));
  const saved = new Map([["drivingCoach", false]]), wired = new Map(), painted = new Map();
  let ensures = 0, land = null;
  const G = { player: null, state: "title", raceT: 0, paused: false, announceBusy: false, practice: false, timeTrial: false,
    $: (id) => nodes.get(id) || null, store: { get: (k, d) => saved.get(k) ?? d, set: (k, v) => saved.set(k, v) },
    daily: { isActive: () => false }, netPlay: { active: () => false }, cautionLevel: () => 0, tyres: { on: () => false },
    records: { invalidate() {}, config: () => ({}) }, pits: { ownedTyres: () => [], choices: () => [], estimate: () => null },
    fmtTime: (t) => String(t), announce() { return true; } };
  const ins = { update() {}, reset() {}, summary: () => ({}), journal: () => [], forecast: () => null, network: () => null,
    startDrill: () => true, attempts: () => [], mastery: () => null };
  const ctx = vm.createContext({
    RaceInsights: { create: () => ins, DRILLS: { free: "Free practice", corner: "Drive through the next corner" }, needsRivals: () => false },
    SettingRow: { wire: (row, o) => { if (row) wired.set(row.id, o); }, paint: (row, v) => { if (row) painted.set(row.id, v); }, disable() {} },
    LazyBundles: { live: () => ({ ensureRaceSession: () => { ensures++; return new Promise((r) => { land = r; }); } }) },
    Ghost: { timeAt: () => null, bestTime: () => 60 }, PhysicsConsts: { BRAKE: 22, REVISION: "t" },
  });
  vm.runInContext(read("js/race/driving-coach-boot.js"), ctx, { filename: absSrc("js/race/driving-coach-boot.js") });
  const coach = vm.runInContext("DrivingCoach", ctx).create(G);
  vm.runInContext(read("js/race/car-fields.js"), ctx, { filename: absSrc("js/race/car-fields.js") });   // FULL: SimState reads CarFields.SNAPSHOT
  vm.runInContext(read("js/core/sim-state.js"), ctx, { filename: absSrc("js/core/sim-state.js") });   // LAZY_RACE_SESSION order: the registry (#6860) lands before the body
  const evalBody = () => vm.runInContext(read("js/race/driving-coach.js"), ctx, { filename: absSrc("js/race/driving-coach.js") });
  return { ctx, G, coach, nodes, saved, wired, painted, evalBody, ensures: () => ensures, land: (ok) => land(ok) };
}

test("before the body lands: the rows are wired and the per-frame reads answer 'no practice'", () => {
  const { coach, wired, saved, G } = fixture();
  assert.deepEqual([...wired.keys()].sort(), ["pm-coach", "pm-drill", "pm-pit-choice"]);
  assert.equal(wired.get("pm-drill").values.length, 14, "the full GOAL list, as the body wired it");
  assert.equal(coach.retry(), false, "RECOVER rescues: no checkpoint to restore");
  assert.equal(coach.practiceActive(), false);
  assert.equal(coach.status(), null);
  assert.equal(coach.insights, null);
  assert.equal(JSON.stringify(coach.trace()), "[]");
  coach.update(0.016);   // a no-op, never a throw
  assert.equal(JSON.stringify(coach.feedback()), JSON.stringify({ enabled: false, state: "off", reminders: 0, latest: null,
    counts: [], total: 0, turns: [], suggest: null }));
  // COACH ON before the body: the stored choice is the body's starting value.
  wired.get("pm-coach").write("on");
  assert.equal(saved.get("drivingCoach"), true);
  assert.equal(wired.get("pm-coach").read(), "on");
  G.player = { pitNext: { id: "soft" } };
  assert.equal(wired.get("pm-pit-choice").read(), "soft");
  assert.equal(coach.setPracticeGoal("nope"), false);
  assert.equal(coach.setPracticeGoal("corner"), true);
  assert.equal(coach.practiceGoal(), "corner");
});

test("a Settings visit asks for the bundle once; its landing creates the body ONCE with the stored choices", async () => {
  const f = fixture();
  f.wired.get("pm-coach").write("on");
  f.coach.setPracticeGoal("corner");
  f.coach.paint(); f.coach.paint();
  assert.equal(f.ensures(), 1, "one ask, however many paints");
  assert.equal(f.painted.get("pm-coach"), "on");
  assert.equal(f.painted.get("pm-drill"), "corner");
  assert.equal(f.nodes.get("pm-coach-status").textContent, "", "the body's copy waits for the body");
  f.evalBody();
  f.land(true);
  await new Promise((r) => setImmediate(r));
  assert.equal(f.nodes.get("pm-coach-status").textContent, "Ready for your next drive.", "the landing paints the whole panel");
  assert.equal(f.coach.practiceGoal(), "corner", "the GOAL picked before the body is the body's");
  assert.equal(f.wired.get("pm-coach").read(), "on");
  assert.ok(f.coach.insights, "the body's insights are reachable");
  assert.equal(f.coach.feedback().enabled, true);
  const body = f.coach.insights;
  f.coach.paint();
  assert.equal(f.coach.insights, body, "created once");
  assert.equal(f.ensures(), 1);
});

test("a shell that evaluated the body first gets it at create", () => {
  const f = fixture();
  f.evalBody();
  const again = vm.runInContext("DrivingCoach", f.ctx).create(f.G);
  assert.ok(again.insights, "body made at create");
  again.paint();
  assert.equal(f.ensures(), 0, "nothing to fetch");
});
