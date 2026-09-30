/* ai-pack-stuck-vm.test.mjs — pack bunching / dig-out deadlock on a street
 * circuit (monaco), in the Node VM harness.
 *
 * THE DEFECT, measured on monaco before the fix (scratch/ai-pack-probe.mjs,
 * scratch/monaco-stuck-detail.mjs, 90–120 s AI-only field):
 *   - dig-out (`unstuckActive`) permanently vetoed AI rescue (`!unstuckActive`
 *     in the aiStuck gate), so a car boxed against the wall at 0 m/s climbed
 *     stuckT to 7.6 s with rescueT stuck at 0 — never teleported, never free;
 *   - digOutStarve car-seconds (stuckT>1 ∧ speed<5) reached ~18 s in 120 s;
 *   - longest nose-to-tail train behind the SAME car hit 58 s.
 *
 * The gate below pins the recovery promise: after dig-out runs past its budget,
 * rescue MUST arm, and no AI may sit crawl-slow for longer than the dig-out
 * budget + free rescue delay without either clearing or being rescued.
 *
 * Run: node --test tests/unit/ai-pack-stuck-vm.test.mjs   (~20 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monaco" }); });
after(() => { if (g) g.close(); });

const DT = 1 / 60;
const SAMPLE = 6; // 10 Hz

test("dig-out that fails escalates to rescue — no forever-crawl on monaco", async () => {
  const A = g.apex;
  await g.race("monaco");
  A.headless(true);
  const pIdx = A.cars().findIndex((c) => c.p);
  A.carRole(pIdx, { human: false });
  A.go();

  // Per-car longest consecutive crawl while dig-out is armed (speed < 5 after
  // the launch window). Before the fix Hulkenberg sat ~5.5 s at 0–2 m/s with
  // stuckT climbing and rescueT never leaving 0.
  const crawl = new Map(); // car id → current streak s
  let worstCrawl = 0;
  let sawRescue = false;
  let digOutStarveS = 0;
  const SECONDS = 45;

  for (let i = 0; i < SECONDS / DT; i++) {
    A.step(DT, 1);
    if (i % SAMPLE !== 0) continue;
    const t = i * DT;
    if (t < 5) continue; // launch / T1 settle
    for (const c of g.G.cars) {
      if (c.retired || c.finished || c.human) continue;
      if (c.pitState === "box") continue;
      const stuckT = c.stuckT || 0;
      const spd = c.speed || 0;
      const key = c.name || c.id || String(c.num);
      if (stuckT > 1 && spd < 5) {
        digOutStarveS += SAMPLE * DT;
        const next = (crawl.get(key) || 0) + SAMPLE * DT;
        crawl.set(key, next);
        worstCrawl = Math.max(worstCrawl, next);
      } else {
        crawl.set(key, 0);
      }
      if ((c.rescueT || 0) > 0.5) sawRescue = true;
      // A live teleport clears stuckT; also count a car that was stuck and is
      // now back above crawl as recovered.
    }
  }
  A.headless(false);

  // Dig-out budget (~1.2–2.1 s on streets) + escalated rescue delay (~1.25 s)
  // keeps a consecutive crawl well under the pre-fix 5+ s with rescueT=0.
  const budgetPlusDelay = 5.0;
  assert.ok(worstCrawl <= budgetPlusDelay,
    `an AI crawled for ${worstCrawl.toFixed(1)} s while dig-out was armed ` +
    `(cap ${budgetPlusDelay} s — dig-out must escalate to rescue)`);
  // Anti-vacuity: monaco at a standing start DOES produce dig-out episodes.
  // If this ever goes to zero the scenario stopped stressing the gate.
  assert.ok(digOutStarveS > 0.5 || sawRescue,
    "scenario never stressed dig-out/rescue — setup drifted");
});

test("the monaco field keeps progressing — no multi-car pack freeze", async () => {
  const A = g.apex;
  await g.race("monaco");
  A.headless(true);
  const pIdx = A.cars().findIndex((c) => c.p);
  A.carRole(pIdx, { human: false });
  A.go();

  const start = g.G.cars.map((c) => c.prog);
  const SECONDS = 30;
  let slowPackFrames = 0, frames = 0;
  for (let i = 0; i < SECONDS / DT; i++) {
    A.step(DT, 1);
    if (i % 30 !== 0) continue;
    const t = i * DT;
    if (t < 8) continue;
    frames++;
    const racing = g.G.cars.filter((c) => !c.retired && !c.finished && c.pitState !== "box");
    const slow = racing.filter((c) => (c.speed || 0) < 8).length;
    // Three or more cars crawl-slow at once is a pack freeze, not a single
    // incident. Pre-fix monaco hit this repeatedly around t=16–22.
    if (slow >= 3) slowPackFrames++;
  }
  const end = g.G.cars.map((c) => c.prog);
  A.headless(false);

  const deltas = end.map((p, i) => p - start[i]);
  const minDelta = Math.min(...deltas.filter((_, i) => !g.G.cars[i].retired));
  // 30 s on monaco at even a crawl floor should clear a few hundred metres;
  // a welded pack leaves cars near their start prog.
  assert.ok(minDelta > 80,
    `a car barely moved in 30 s: Δprog ${minDelta.toFixed(0)} m`);
  assert.ok(slowPackFrames / Math.max(frames, 1) < 0.25,
    `pack freeze: ${(100 * slowPackFrames / frames).toFixed(0)}% of samples ` +
    `had ≥3 cars under 8 m/s`);
});
