/* sporting-regs.test.mjs — the three 2026 Sporting Regulations the player is
 * held to (js/race/sporting-regs.js), in a VM: the two-dry-compound verdict at
 * the flag (B6.3.6), the give-back window for a place gained under the Safety
 * Car / VSC (B5.12.2(c), B5.13.2(c); priced per the 2026 Penalty Guidelines),
 * and the championship-order grid when no qualifying is held (B2.5.4(a)).
 *
 * The module is pure over the car records it is handed, so a car here is a
 * plain object: {prog, retired, finished, pitState, tyreLog, penalty}.
 *
 * Run: node --test tests/unit/sporting-regs.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ctx = vm.createContext({});
vm.runInContext(readFileSync(join(ROOT, "js/race/sporting-regs.js"), "utf8"), ctx);
const R = vm.runInContext("SportingRegs", ctx);

const log = (...codes) => codes.map((code, i) => ({ code, lap0: i * 5, lap1: null }));

// ── 1. TWO DRY COMPOUNDS ────────────────────────────────────────────────────

test("one dry compound is short; two different ones are not; a wet set lifts the rule", () => {
  assert.equal(R.compoundShort(log("M")), true, "a no-stop race");
  assert.equal(R.compoundShort(log("M", "M")), true, "a stop onto the SAME compound is still one");
  assert.equal(R.compoundShort(log("S", "H")), false);
  assert.equal(R.compoundShort(log("M", "I")), false, "an intermediate set lifts the obligation");
  assert.equal(R.compoundShort(log("W")), false);
  assert.equal(R.compoundShort(null), true, "no log is no second compound");
  assert.equal(R.compoundsRun(log("S", "M", "S")).dry, 2);
});

test("the verdict: DSQ in a race the rule covers, 30 s if it ended suspended, nothing otherwise", () => {
  const car = { tyreLog: log("M"), penalty: 0 };
  assert.equal(R.compoundVerdict(car, { applies: false }), null, "a sprint, a short race, a wet race: no rule");
  assert.equal(R.compoundVerdict(car, { applies: true }).dsq, "one dry compound");
  assert.equal(R.compoundVerdict(car, { applies: true, suspended: true }).penaltyS, 30);
  assert.equal(R.compoundVerdict({ tyreLog: log("M", "H") }, { applies: true }), null, "complied");
  assert.equal(R.compoundVerdict({ tyreLog: log("M"), retired: true }, { applies: true }), null,
    "a retirement is not judged on a stop it never reached");
});

test("applyCompoundRule marks every offender, prices a suspended race, and clears a stale verdict", () => {
  const a = { driverId: "a", tyreLog: log("M", "H"), penalty: 0 };
  const b = { driverId: "b", tyreLog: log("S"), penalty: 5 };
  const c = { driverId: "c", tyreLog: log("M", "S"), penalty: 0, dsq: "stale from last race" };
  const out = R.applyCompoundRule([a, b, c], { applies: true });
  assert.equal(out.map((x) => x.driverId).join(","), "b");   // joined: the array is the VM realm's
  assert.equal(b.dsq, "one dry compound");
  assert.equal(b.penalty, 5, "a DSQ adds no time");
  assert.equal(c.dsq, undefined, "the previous race's verdict does not survive");
  const d = { tyreLog: log("M"), penalty: 5 };
  assert.equal(R.applyCompoundRule([d], { applies: true, suspended: true }).length, 0);
  assert.equal(d.penalty, 35, "suspended, not resumed: +30 s instead");
  assert.equal(d.dsq, undefined);
  R.applyCompoundRule([b], { applies: false });
  assert.equal(b.dsq, undefined, "a race the rule does not cover clears it too");
});

// ── 2. NO PASSING UNDER A CAUTION ───────────────────────────────────────────

/** A tiny field: the player `p` and rivals, ordered by prog. */
function field(n) {
  const p = { id: "p", prog: 100, pitState: "none" };
  const rivals = Array.from({ length: n }, (_, i) => ({ id: "r" + i, prog: 110 + i * 10, pitState: "none" }));
  return { p, rivals, all: [p].concat(rivals) };
}
const DT = 0.1;
function run(w, f, level, seconds) {
  const evs = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) { const e = w.tick(f.p, f.all, level, DT); if (e) evs.push(e); }
  return evs;
}

test("the price scale: 10 s for one kept place, 20 for two, 30 for more", () => {
  assert.equal(R.passPenaltyS(0), 0);
  assert.equal(R.passPenaltyS(1), 10);
  assert.equal(R.passPenaltyS(2), 20);
  assert.equal(R.passPenaltyS(3), 30);
  assert.equal(R.passPenaltyS(7), 30);
});

test("a place gained under the SC opens the window; given back in time, nothing", () => {
  const w = R.createPassWatch(5), f = field(2);
  w.tick(f.p, f.all, 3, DT);                      // primes the order
  f.p.prog = 115;                                 // past r0 under the Safety Car
  const e = w.tick(f.p, f.all, 3, DT);
  assert.equal(e.type, "warn");
  assert.equal(e.n, 1);
  run(w, f, 3, 2);
  f.p.prog = 105;                                 // back behind r0 inside 5 s
  assert.equal(w.tick(f.p, f.all, 3, DT).type, "cleared");
  assert.deepEqual(run(w, f, 3, 10), [], "no penalty once the place is back");
  assert.equal(w.info().owed, 0);
});

test("a place KEPT past the window is +10 s; two places are +20 s", () => {
  let w = R.createPassWatch(5), f = field(3);
  w.tick(f.p, f.all, 2, DT);
  f.p.prog = 115;                                 // past r0 under the VSC
  const evs = run(w, f, 2, 6);
  const pen = evs.find((x) => x.type === "penalty");
  assert.ok(pen, JSON.stringify(evs));
  assert.equal(pen.sec, 10);
  assert.equal(pen.n, 1);
  assert.equal(evs.filter((x) => x.type === "penalty").length, 1, "priced once");

  w = R.createPassWatch(5); f = field(3);
  w.tick(f.p, f.all, 3, DT);
  f.p.prog = 125;                                 // past r0 AND r1 in one go
  const two = run(w, f, 3, 6).find((x) => x.type === "penalty");
  assert.equal(two.sec, 20);
  assert.equal(two.n, 2);
});

test("the window survives the caution ending: a place taken under it is still owed", () => {
  const w = R.createPassWatch(5), f = field(1);
  w.tick(f.p, f.all, 3, DT);
  f.p.prog = 115;
  w.tick(f.p, f.all, 3, DT);
  const pen = run(w, f, 0, 6).find((x) => x.type === "penalty");
  assert.equal(pen && pen.sec, 10);
});

test("green-flag passes, and passes of a retired, finished or pitting car, are not offences", () => {
  const w = R.createPassWatch(5), f = field(4);
  w.tick(f.p, f.all, 0, DT);
  f.p.prog = 115;                                 // green: fair
  assert.equal(w.tick(f.p, f.all, 0, DT), null);
  f.rivals[1].pitState = "lane";                  // r1 is in the pit lane
  f.p.prog = 125;
  assert.equal(w.tick(f.p, f.all, 3, DT), null, "a car in the pit lane is fair game");
  f.rivals[2].finished = true;
  f.p.prog = 135;
  assert.equal(w.tick(f.p, f.all, 3, DT), null, "a car that has taken the flag");
  f.rivals[3].retired = true;
  f.p.prog = 145;
  assert.equal(w.tick(f.p, f.all, 3, DT), null, "a retired car (and it is out of the field anyway)");
  assert.deepEqual(run(w, f, 3, 6), []);
});

test("re-passing a car that came past YOU under the caution is not an offence", () => {
  const w = R.createPassWatch(5), f = field(1);
  f.rivals[0].prog = 90;                          // r0 behind the player
  w.tick(f.p, f.all, 3, DT);
  f.rivals[0].prog = 105;                         // r0 passes the player under the SC
  assert.equal(w.tick(f.p, f.all, 3, DT), null);
  f.p.prog = 110;                                 // the player takes the place back
  assert.equal(w.tick(f.p, f.all, 3, DT), null);
  assert.deepEqual(run(w, f, 3, 6), []);
});

test("passing a car slowed by an obvious problem is legal; a healthy car beside it is still owed", () => {
  const stuck = new Set();
  const w = R.createPassWatch(5, (o) => stuck.has(o)), f = field(2);
  w.tick(f.p, f.all, 3, DT);
  stuck.add(f.rivals[0]);                         // r0 spun and stopped under the SC
  f.p.prog = 115;                                 // the player drives round it
  assert.equal(w.tick(f.p, f.all, 3, DT), null, "a stricken car is fair game");
  stuck.delete(f.rivals[0]);                      // r0 recovers behind: nothing owed
  assert.deepEqual(run(w, f, 3, 6), []);
  f.p.prog = 125;                                 // r1 is healthy: that pass counts
  const e = w.tick(f.p, f.all, 3, DT);
  assert.equal(e && e.type, "warn");
  assert.equal(e.n, 1, "only the healthy car is owed");
  assert.equal(run(w, f, 3, 6).find((x) => x.type === "penalty").sec, 10);
});

test("a stricken car that came past the player may be re-passed, and it cannot owe", () => {
  const stuck = new Set();
  const w = R.createPassWatch(5, (o) => stuck.has(o)), f = field(1);
  w.tick(f.p, f.all, 3, DT);
  stuck.add(f.rivals[0]);
  f.p.prog = 115;
  w.tick(f.p, f.all, 3, DT);
  stuck.delete(f.rivals[0]);
  f.rivals[0].prog = 120;                         // r0 recovers and repasses the player
  assert.equal(w.tick(f.p, f.all, 3, DT), null);
  assert.deepEqual(run(w, f, 3, 6), [], "nothing was owed either way");
});

test("game.js hands the pass watch its stricken-car predicate", () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  assert.match(src, /const scWatch = SportingRegs\.createPassWatch\(0, stricken\);/, "the watch reads the shared predicate");
  const def = (/const stricken = \(o\) => [\s\S]*?;\n/.exec(src) || [""])[0];
  assert.match(def, /incidentSim\.owns\(o\)/, "a car mid-incident may be passed");
  assert.match(def, /rescueT/, "a car being rescued as stuck may be passed");
  assert.match(def, /offroad/, "a beached car may be passed");
  assert.match(def, /vTop\(\) \* 0\.05/, "a car all but stopped on track may be passed");
});

test("a passed car that then pits or takes the flag drops the standing debt: no penalty", () => {
  for (const [label, hit] of [["pits", (o) => { o.pitState = "enter"; }], ["finishes", (o) => { o.finished = true; }]]) {
    const w = R.createPassWatch(5), f = field(1);
    w.tick(f.p, f.all, 3, DT);
    f.p.prog = 115;                               // past r0 under the SC
    assert.equal(w.tick(f.p, f.all, 3, DT).type, "warn", label);
    run(w, f, 3, 1);
    hit(f.rivals[0]);                             // the give-back is now impossible
    const evs = run(w, f, 3, 10);
    assert.ok(!evs.some((x) => x.type === "penalty"), `${label}: ${JSON.stringify(evs)}`);
    assert.equal(w.info().owed, 0, label);
  }
});

test("the player in the pit lane, or already flagged, gains nothing it must give back", () => {
  const w = R.createPassWatch(5), f = field(1);
  w.tick(f.p, f.all, 3, DT);
  f.p.pitState = "out";
  f.p.prog = 115;                                 // a quick stop under the SC jumps r0
  assert.equal(w.tick(f.p, f.all, 3, DT), null);
  assert.deepEqual(run(w, f, 3, 6), []);
});

test("reset() forgets the order, so a re-grid cannot read as a pass", () => {
  const w = R.createPassWatch(5), f = field(1);
  w.tick(f.p, f.all, 4, DT);
  w.reset();
  f.p.prog = 115;
  assert.equal(w.tick(f.p, f.all, 4, DT), null, "the first tick after a reset only primes");
});

// ── 3. CHAMPIONSHIP-ORDER GRID ──────────────────────────────────────────────

test("champOrder: scorers by the standings comparator, the pointless behind in pace order", () => {
  const cars = [
    { driverId: "a", tier: 2 }, { driverId: "b", tier: 0 }, { driverId: "c", tier: 1 }, { driverId: "d", tier: 3 },
  ];
  const pts = { a: 12, d: 30 };
  const cmp = (x, y) => (pts[y] || 0) - (pts[x] || 0) || (x < y ? -1 : 1);
  const out = R.champOrder(cars, cmp, (id) => pts[id] || 0);
  assert.equal(out.map((c) => c.driverId).join(","), "d,a,b,c");
  assert.equal(R.champOrder(cars, cmp, () => 0), null, "round 1: nobody has scored, the caller's default stands");
  assert.equal(cars.map((c) => c.driverId).join(","), "a,b,c,d", "the input is not reordered");
});

test("a place gained under a caution and still owed at the FINISH is charged at once, and the passed car cannot clear it", () => {
  // Bug hunt 2026-09-29: after the flag `caution` is false but the window
  // still counted down its 5 s, and the result countdown (2.2 s) ended the
  // race first — no penalty. A passed car coasting by the finished player
  // also "gave the place back" and cleared the debt.
  const w = R.createPassWatch(5), f = field(2);
  w.tick(f.p, f.all, 3, DT);                      // primes the order
  f.p.prog = 115;                                 // past r0 under the Safety Car
  assert.equal(w.tick(f.p, f.all, 3, DT).type, "warn");
  f.p.finished = true;                            // crosses the line with the place kept
  f.rivals[0].prog = 130;                         // r0 then goes by the coasting, finished car
  const e = w.tick(f.p, f.all, 0, DT);
  assert.ok(e && e.type === "penalty", "charged on the first finished tick: " + JSON.stringify(e));
  assert.equal(e.sec, 10);
  assert.equal(w.info().owed, 0);
});


test("a caution pass on the finishing step is charged once, including another same-step finisher", () => {
  for (const rivalFinished of [false, true]) {
    const w = R.createPassWatch(5), f = field(2);
    w.tick(f.p, f.all, 3, DT);
    f.p.prog = 115; f.p.finished = true; f.p.finishT = 100;
    if (rivalFinished) {
      f.rivals[0].finished = true; f.rivals[0].finishT = 100.005;
      f.rivals[0].prog = 116; // overshoot cannot overturn the crossing clock
    }
    const e = w.tick(f.p, f.all, 3, DT);
    assert.equal(e && e.type, "penalty");
    assert.equal(e.sec, 10);
    assert.equal(w.info().owed, 0);
    f.p.prog = 1000; // post-flag coasting past the next car is not an offence
    assert.equal(w.tick(f.p, f.all, 3, DT), null);
    w.reset();
    assert.equal(w.tick(f.p, f.all, 3, DT), null, "reset forgets the completed race");
  }
});


test("a lapped finisher gains no position by crossing before a car one lap ahead", () => {
  const w = R.createPassWatch(5);
  const winner = { lap: 5, prog: 4001, finished: true, finishT: 99 };
  const player = { lap: 3, prog: 2999.9 };
  const ahead = { lap: 4, prog: 3999.8 };
  const cars = [winner, player, ahead];
  w.tick(player, cars, 3, DT);
  Object.assign(player, { lap: 4, prog: 3000.2, finished: true, finishT: 100.01 });
  Object.assign(ahead, { lap: 5, prog: 4000.1, finished: true, finishT: 100.02 });
  assert.equal(w.tick(player, cars, 3, DT), null, "the later crossing remains one lap ahead in the classification");
  assert.equal(w.info().owed, 0);
});
