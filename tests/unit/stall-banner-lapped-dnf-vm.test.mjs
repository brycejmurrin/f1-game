/* stall-banner-lapped-dnf-vm.test.mjs — #6634 F7 + F8 (issue #7086), the real game in the Node VM.
 * F7: a stall retirement queues ONE banner (the sweep added a second one on top of retireCar's).
 * F8: a drawn DNF fraction is the RACE's, tested against the leader — a backmarker at 0.93 pace never reaches `at` 0.93 itself. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
const DT = 1 / 60;
let g, A, G;

before(async () => {
  g = await createGame({ track: "monza" });
  A = g.apex;
  await g.race("monza");
  A.headless(true);
  A.go();
  for (let i = 0; i < 300; i++) A.step(DT, 1);
  G = g.G;
});

test("F7: a stall retirement queues exactly one banner", () => {
  const el = g.sandbox.document.getElementById("announce-text");
  const writes = [];
  let cur = el.textContent;
  Object.defineProperty(el, "textContent", { configurable: true, get: () => cur, set: (v) => { cur = v; writes.push(v); } });
  const p = G.cars.find((c) => c.local && !c.retired);
  assert.ok(p, "a local car");
  p.stallT = 59.99; p.speed = 0;
  try { for (let i = 0; i < 5; i++) A.step(DT, 1); } finally { delete el.textContent; }
  assert.ok(p.retired && p.dnf === "stationary", "the stall retired the car");
  const said = writes.filter((w) => /RETIR/.test(w));
  assert.deepEqual(said, ["RETIRED — CAR STATIONARY FOR 60 s"]);
});

test("F8: a car one lap down at 0.93 pace still retires at `at` 0.93", () => {
  const dist = G.lapsTarget * G.track.total;
  const rivals = G.cars.filter((c) => !c.human && !c.retired && !c.finished);
  const lapped = rivals[rivals.length - 1], leader = rivals[0];
  const keep = [lapped.prog, leader.prog];
  lapped.dnfAt = 0.93; lapped.dnfWhy = "engine";
  lapped.prog = 0.93 * 0.93 * dist;     // 0.93 pace: it has covered 0.865 of the race when the leader is at 0.93
  leader.prog = 0.93 * dist;
  G.cars.forEach((c) => { if (c !== leader && c !== lapped) c.dnfAt = null; });
  A.step(DT, 1);
  assert.ok(lapped.retired && lapped.dnf === "engine", `lapped car retired (prog ${(lapped.prog / dist).toFixed(3)})`);
  void keep;
});
