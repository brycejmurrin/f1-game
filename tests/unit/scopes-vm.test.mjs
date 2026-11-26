/* scopes-vm.test.mjs — js/core/scopes.js and the race scope it carries (#6920 U2.1, #6949).
 *
 * Part 1 (pure): the bus on fake registrants — `after` order, cycle and
 * unknown-id throws, the `on` / `enterOn` / phase filters, idempotent exits, the
 * touches-overlap warn and the first-error-rethrown rule.
 *
 * Part 2 (VM, tools/lib/game-vm.cjs): the PER-TRANSITION SPY GOLDEN. Each race
 * transition clears a DIFFERENT subset on purpose (endRace: race control only;
 * a restart: never race control; a mid-quali quit: IncidentSim before the field
 * swap). The golden below was recorded on the deploy tip 16237b50 BEFORE the
 * migration, by wrapping the module globals as they evaluate (opts.onEval), and
 * the migrated game must produce the same ordered calls.
 *
 * Run: node --test tests/unit/scopes-vm.test.mjs
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gameSource } from "../helpers/game-source.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { createGame } = require("../../tools/lib/game-vm.cjs");

// ── Part 1: the bus ─────────────────────────────────────────────────────────
const plain = (v) => JSON.parse(JSON.stringify(v));   // VM-realm arrays/objects fail deepStrictEqual's prototype check
function freshScopes() {
  const warns = [];
  const ctx = vm.createContext({ Log: { warn: (...a) => warns.push(a) } });
  const src = fs.readFileSync(path.join(ROOT, "js/core/scopes.js"), "utf8").replace(/^const\b/gm, "var");
  vm.runInContext(src, ctx, { filename: path.join(ROOT, "js/core/scopes.js") });
  return { S: ctx.Scopes, warns };
}

test("exits run in `after` order (registration breaks ties); enter runs exits, then enters", () => {
  const { S } = freshScopes();
  const log = [];
  const reg = (id, extra) => S.register("race", { id, on: ["start"], exit: () => log.push("x:" + id), enter: () => log.push("n:" + id), ...extra });
  reg("a"); reg("c", { after: ["a"] }); reg("b");
  reg("d", { after: ["c", "b"] });
  S.exit("race", { why: "start" });
  assert.deepEqual(log, ["x:a", "x:c", "x:b", "x:d"]);
  log.length = 0;
  S.enter("race", { why: "start" });
  assert.deepEqual(log, ["x:a", "x:c", "x:b", "x:d", "n:a", "n:c", "n:b", "n:d"]);
  assert.equal(Object.isFrozen(S), true);
});

test("register throws on an unknown scope, an unknown `after` id, a self edge and a re-registered cycle", () => {
  const { S } = freshScopes();
  assert.throws(() => S.register("nope", { id: "a", on: ["start"] }), /unknown scope/);
  assert.throws(() => S.register("race", { id: "a", on: ["start"], after: ["ghost"] }), /unknown `after` id/);
  assert.throws(() => S.register("race", { id: "a", on: ["start"], after: ["a"] }), /unknown `after` id/);
  assert.throws(() => S.register("race", { id: "a", on: ["warp"] }), /unknown on why/);
  S.register("race", { id: "a", on: ["start"] });
  S.register("race", { id: "b", on: ["start"], after: ["a"] });
  assert.throws(() => S.register("race", { id: "a", on: ["start"], after: ["b"] }), /cycle/);
  assert.deepEqual(plain(S.ids("race")), ["a", "b"], "a refused re-register leaves the scope as it was");
  assert.throws(() => S.exit("race", { why: "warp" }), /ctx.why/);
});

test("`on`, `enterOn` and `phase` filter by transition; a repeated exit changes nothing", () => {
  const { S } = freshScopes();
  const st = { n: 5, primed: 0, watch: 3 };
  S.register("race", { id: "n", on: ["start", "episode"], exit: () => { st.n = 0; }, snapshot: () => st.n });
  S.register("race", { id: "p", on: ["restart-red"], enterOn: ["restart-red"], exit: () => {}, enter: () => { st.primed++; } });
  S.register("race", { id: "w", on: ["restart-red"], phase: "grid", exit: () => { st.watch = 0; } });
  S.exit("race", { why: "finish" });
  assert.equal(st.n, 5, "finish is not in n's on list");
  S.enter("race", { why: "restart-red" });
  assert.deepEqual([st.primed, st.watch], [1, 3], "the phased registrant waits for its phase");
  S.exit("race", { why: "restart-red", phase: "grid" });
  assert.equal(st.watch, 0);
  S.exit("race", { why: "episode" });
  const once = S.snapshot("race");
  S.exit("race", { why: "episode" });
  assert.deepEqual(plain(S.snapshot("race")), plain(once));
  assert.deepEqual(plain(once), { n: 0 });
});

test("a shared touches key with no `after` warns once per pair; an `after` edge silences it", () => {
  const { S, warns } = freshScopes();
  S.register("race", { id: "a", on: ["start"], touches: ["k"] });
  S.register("race", { id: "b", on: ["start"], touches: ["k"] });
  S.register("race", { id: "c", on: ["start"], touches: ["k"], after: ["a", "b"] });
  S.register("race", { id: "b", on: ["start"], touches: ["k"] });   // re-register: same pair, no second warn
  assert.equal(warns.length, 1, JSON.stringify(warns));
  assert.equal(warns[0][0], "scopes");
  assert.ok(warns[0][1].includes("a and b"), warns[0][1]);
});

test("a throwing registrant is logged, the rest still run, and the FIRST error is rethrown", () => {
  const { S, warns } = freshScopes();
  const ran = [];
  S.register("race", { id: "a", on: ["quit"], exit: () => { throw new Error("first"); } });
  S.register("race", { id: "b", on: ["quit"], exit: () => { ran.push("b"); throw new Error("second"); } });
  S.register("race", { id: "c", on: ["quit"], exit: () => ran.push("c") });
  assert.throws(() => S.exit("race", { why: "quit" }), /first/);
  assert.deepEqual(ran, ["b", "c"]);
  assert.deepEqual(warns.map((w) => w[1]), ["a", "b"]);
});

// ── Part 2: the race scope inside the real game ────────────────────────────
// Recorded on 16237b50 (before the migration). gridUp's two watch resets are
// inside `start` (U1.1 owns gridUp); quit's last two calls are
// js/perf/menu-quit-tail.js, which runs synchronously in the VM.
const GOLDEN = {
  start: ["IncidentSim.reset", "raceCtl.reset", "DebrisWorld.reset", "scWatch.reset", "blueWatch.reset", "DebrisWorld.prime"],
  "restart-red": ["IncidentSim.reset", "DebrisWorld.reset", "DebrisWorld.prime", "scWatch.reset", "blueWatch.reset"],
  "restart-declined": ["IncidentSim.reset", "DebrisWorld.reset", "DebrisWorld.prime"],
  finish: ["raceCtl.reset"],
  episode: ["IncidentSim.reset", "raceCtl.reset", "DebrisWorld.reset"],
  quit: ["IncidentSim.reset", "raceCtl.reset", "IncidentSim.reset", "DebrisWorld.reset"],
};

// Rebind each module global as it evaluates (the VM turns top-level const into
// var), BEFORE game.js captures RaceControl.create / SportingRegs.createPassWatch.
function spyOnEval(rel, ctx) {
  const ev = (s) => vm.runInContext(s, ctx, { filename: "scopes-vm:spy" });
  if (!ctx.__spy) ev(`globalThis.__spy = { on: false, log: [], forceRestart: false };
    globalThis.__spyRec = (n) => { if (__spy.on) __spy.log.push(n); };`);
  if (rel === "js/race/race-control.js") ev(`RaceControl = Object.assign({}, RaceControl, { __c: RaceControl.create, create(G) {
    const r = RaceControl.__c(G), reset = r.reset, take = r.takeRestart;
    r.reset = function () { __spyRec("raceCtl.reset"); return reset.apply(this, arguments); };
    r.takeRestart = function () { if (__spy.forceRestart) { __spy.forceRestart = false; return true; } return take.apply(this, arguments); };
    return r; } })`);
  if (rel === "js/race/sporting-regs.js") ev(`SportingRegs = Object.assign({}, SportingRegs, {
    __pw: SportingRegs.createPassWatch, __bw: SportingRegs.createBlueFlagWatch,
    createPassWatch() { const w = SportingRegs.__pw.apply(null, arguments), r = w.reset; w.reset = function () { __spyRec("scWatch.reset"); return r.apply(this, arguments); }; return w; },
    createBlueFlagWatch() { const w = SportingRegs.__bw.apply(null, arguments), r = w.reset; w.reset = function () { __spyRec("blueWatch.reset"); return r.apply(this, arguments); }; return w; } })`);
  if (rel === "js/physics/incident-sim.js") ev(`IncidentSim = Object.assign({}, IncidentSim, { __r: IncidentSim.reset,
    reset() { __spyRec("IncidentSim.reset"); return IncidentSim.__r.apply(this, arguments); } })`);
  if (rel === "js/physics/debris-world.js") ev(`DebrisWorld = Object.assign({}, DebrisWorld, { __r: DebrisWorld.reset, __p: DebrisWorld.prime,
    reset() { __spyRec("DebrisWorld.reset"); return DebrisWorld.__r.apply(this, arguments); },
    prime() { __spyRec("DebrisWorld.prime"); return DebrisWorld.__p.apply(this, arguments); } })`);
}

const games = [];
after(() => { for (const g of games) g.close(); });

test("the per-transition spy golden: every race transition clears exactly what it did on the tip, in order", async () => {
  const g = await createGame({ track: "monza", onEval: spyOnEval });
  games.push(g);
  const ev = (s) => vm.runInContext(s, g.ctx, { filename: "scopes-vm:spy" });
  const rec = async (fn) => { ev("__spy.log = []; __spy.on = true"); try { await fn(); } finally { ev("__spy.on = false"); } return JSON.parse(ev("JSON.stringify(__spy.log)")); };
  const G = g.G, a = g.apex, seen = {};
  seen.start = await rec(() => G.startRace());
  assert.equal((await g.stepUntil(() => a.info().state === "race", { maxSteps: 2000 })).ok, true);
  g.step(120);
  seen["restart-red"] = await rec(() => assert.ok(a.redFlag(), "the red flag re-grids"));
  assert.equal((await g.stepUntil(() => a.info().state === "race", { maxSteps: 2000 })).ok, true);
  g.step(30);
  // redFlagRestart declines once any car has finished: the update() branch clears the surface itself.
  const last = G.cars[G.cars.length - 1];
  last.finished = true;
  seen["restart-declined"] = await rec(() => { ev("__spy.forceRestart = true"); g.step(1); });
  last.finished = false;
  assert.equal(a.info().state, "race", "a declined restart keeps racing");
  seen.finish = await rec(() => a.finishRace());
  seen.episode = await rec(() => G.resetEpisodeOwners());
  G.flow = "gp"; G.timeTrial = false; G.session = "quali";
  await G.startRace();
  assert.equal(G.cars.length, 1, "qualifying trims the grid, so quit takes the pre-swap branch");
  seen.quit = await rec(() => G.quitToMenu());
  assert.deepEqual(seen, GOLDEN);
});

test("the race scope: registrants, filters and order", async () => {
  const g = await createGame({});
  games.push(g);
  const S = g.sandbox.Scopes;
  assert.deepEqual(plain(S.ids("race")), ["tlx-mem-scope", "results-cam", "incident-sim", "raceCtl", "debris", "quit-cams", "pass-watch"]);
  const byWhy = {};
  for (const why of S.WHYS) byWhy[why] = S.describe("race").filter((r) => r.on.includes(why) && !r.phase).map((r) => r.id);
  const phased = S.describe("race").filter((r) => r.phase).map((r) => [r.id, r.phase, [...r.on]]);
  assert.deepEqual(plain(phased), [["pass-watch", "grid", ["restart-red"]]], "the pass watches clear after the re-grid, not before");
  assert.deepEqual(plain(S.describe("race").find((r) => r.id === "debris").enterOn), ["restart-red", "restart-declined"], "a start primes debris later, after makeCars");
  assert.deepEqual(plain(byWhy), {
    start: ["tlx-mem-scope", "results-cam", "incident-sim", "raceCtl", "debris"],
    "restart-red": ["incident-sim", "debris"],
    "restart-declined": ["incident-sim", "debris"],
    finish: ["tlx-mem-scope", "raceCtl"],
    quit: ["tlx-mem-scope", "raceCtl", "quit-cams"],
    episode: ["incident-sim", "raceCtl", "debris"],
    cut: [],
  });
});

test("after a raced episode with a wall hit and a debris burst, two episode exits leave the scope as a fresh game's", async () => {
  const fresh = await createGame({ track: "monza" });
  games.push(fresh);
  const want = plain(fresh.sandbox.Scopes.snapshot("race"));
  const g = await createGame({ track: "monza" });
  games.push(g);
  const a = g.apex, G = g.G;
  a.setInput({ throttle: true, steer: 0 });
  g.step(600);
  a.clearInput();
  const p = G.player;
  vm.runInContext("try { IncidentSim.notifyWall(__G.player, 30); } catch (_) {} try { DebrisWorld.burst(__G.player.px, 0.5, __G.player.pz, 12); } catch (_) {}",
    Object.assign(g.ctx, { __G: G }), { filename: "scopes-vm:burst" });
  assert.ok(p, "the race has a player");
  G.holdCaution(2, "test");   // a scripted VSC: the caution machine is off green
  g.step(5);
  const S = g.sandbox.Scopes, dirty = plain(S.snapshot("race"));
  assert.notDeepEqual(dirty.debris, want.debris, "the burst queued debris (" + JSON.stringify(dirty.debris) + ")");
  assert.notDeepEqual(dirty.raceCtl, want.raceCtl, "the caution is out (" + JSON.stringify(dirty.raceCtl) + ")");
  S.exit("race", { why: "episode" });
  S.exit("race", { why: "episode" });
  assert.deepEqual(plain(S.snapshot("race")), want);
});

test("source pin: game.js resets debris and race control only inside the race-scope registration block", () => {
  const all = gameSource(), end = all.indexOf("\n// ==== ", 1);   // game.js is the union's first section
  const lines = (end > 0 ? all.slice(0, end) : all).split("\n");
  const hits = lines.map((l, i) => [i, l]).filter(([, l]) => /\b(DebrisWorld|raceCtl)\.reset\(/.test(l));
  const block = lines.findIndex((l) => l.startsWith('Scopes.register("race", { id: "incident-sim"'));
  assert.ok(block > 0, "the registration block exists");
  const outside = hits.filter(([i]) => i < block || i > block + 12).map(([i, l]) => (i + 1) + ": " + l.trim());
  assert.deepEqual(outside, []);
});
