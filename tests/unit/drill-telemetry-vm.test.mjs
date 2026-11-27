/* drill-telemetry-vm.test.mjs — LEARN's Telemetry Detective end to end in the real game VM (#6559 step 14, #6551 §4).
 * The drill launches through the game's own host (tests/helpers/drill-drive-vm.mjs): steering is SoakRun's control()
 * law; the pedals are SoakRun's own, except where a fault script overrides them. One boot drives:
 *   1. REF: SoakRun's pedals through Monza sector 2. The reference; no medal.
 *   2. EARLY: the same, but on the whole brake 25 m before the reference's first braking point. The card finds the
 *      window and names EARLY BRAKE; THIS CORNER at the window's middle with that cause is silver.
 *   3. FIX IT: SoakRun's pedals again. It wins back the window's time: gold.
 * Pinned: two boots give the same scores, windows, causes and medals; the faulted run loses time (Δ > 0) where the
 * fault is; the refs block in tests/data/learn-drill-refs.json "telemetry" is these runs (regenerate:
 * node tests/unit/drill-telemetry-vm.test.mjs --write). A LATE THROTTLE run (8 m off the throttle past the reference's
 * first throttle point after its first braking zone) is in the refs and names its own cause.
 *
 * Run: node --test tests/unit/drill-telemetry-vm.test.mjs
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drillDrive, REFS } from "../helpers/drill-drive-vm.mjs";

const EARLY_M = 25;
const into = (G) => { const a = G.drills().active(), acc = a && a.run && a.run.acc; return acc && acc.p0 != null ? G.player.prog - acc.p0 : 0; };
/** SoakRun's pedals; records where the brake first goes on past 100 m (the first braking zone)
 *  and where the throttle comes back after it. */
const soak = (mark) => ({ base, G }) => {
  const d = into(G);
  if (mark && d > 100 && base.brake && mark.on == null) mark.on = d;
  if (mark && mark.on != null && mark.thr == null && base.throttle) mark.thr = d;   // back on the throttle (SoakRun pumps the brake in between)
  return { throttle: base.throttle, brake: base.brake };
};
const early = (onM) => ({ base, G }) => {
  const d = into(G);
  return d > onM - EARLY_M && d < onM ? { throttle: false, brake: true, brakeLevel: 1 } : { throttle: base.throttle, brake: base.brake };
};
const LATE_M = 8;    // m held off the throttle past the reference's throttle point
const late = (thrM) => ({ base, G }) => {
  const d = into(G);
  return d > thrM && d < thrM + LATE_M ? { throttle: false, brake: base.brake } : { throttle: base.throttle, brake: base.brake };
};
const row = (r) => ({ value: r.value, clean: r.clean, reason: r.reason, medal: r.medal,
  total: r.analysis ? r.analysis.total : null, window: r.analysis ? { ...r.analysis.window } : null,
  cause: r.analysis ? r.analysis.cause : null, fix: r.fix ? { won: r.fix.won, frac: +r.fix.frac.toFixed(3), faster: r.fix.faster } : null });

async function session({ withLate = false } = {}) {
  const run = await drillDrive("telemetry");
  try {
    const T = run.ev("TelemetryDrill"), mark = {};
    const ref = run.drive(soak(mark), { maxS: 90 });
    assert.ok(ref && ref.clean, "the reference run finished clean: " + JSON.stringify(ref && ref.reason));
    assert.ok(mark.on > 100 && mark.thr > mark.on, "the reference braked, then got back on the throttle: " + JSON.stringify(mark));
    assert.equal(run.retry(), true);
    const faulted = run.drive(early(mark.on), { maxS: 90 });
    assert.ok(faulted && faulted.analysis, "the faulted run was compared");
    const w = faulted.analysis.window;
    const picked = T.pick(run.G, Math.round((w.from + w.to) / 10) * 5, faulted.analysis.cause);
    const out = { mark: { on: Math.round(mark.on), thr: Math.round(mark.thr) }, ref: row(ref), early: row(faulted), picked: { medal: picked && picked.medal, value: faulted.value } };
    assert.equal(run.retry(), true);
    out.fix = row(run.drive(soak(null), { maxS: 90 }));
    if (withLate) {
      assert.equal(run.retry(), true);
      out.late = row(run.drive(late(mark.thr), { maxS: 90 }));
    }
    return out;
  } finally { run.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--write")) {
  const runs = await session({ withLate: true });
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs.telemetry = {
    how: "node tests/unit/drill-telemetry-vm.test.mjs --write: one boot of the Monza Telemetry drill (solo TT, sector 2 from 40 m past the S1 line); steering is SoakRun's control() law, pedals SoakRun's own except the fault: REF, EARLY (whole brake 25 m before REF's first braking point), the pick at that window's middle with the found cause, FIX IT (REF's pedals), LATE (8 m off the throttle past REF's first throttle point after its first braking zone)",
    metric: "seconds located (the peak-loss 100 m window's loss, once picked) or won back (a FIX IT run, in the solved window) — js/learn-drills/telemetry.js analyze/pick/score",
    rule: "bronze = a pick within 60 m of the peak-loss window; silver = and the cause the trace names; gold = a clean FIX IT run that wins back 60 % of a silver window and is faster overall than the solved run (#6551 §4: geometric tiers, not score thresholds; the refs pin that the scripted fault is found)",
    runs,
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(runs));
} else {
  const refs = JSON.parse(readFileSync(REFS, "utf8")).telemetry;
  let A;
  test("two boots: the same reference, faulted run, pick and FIX IT, with the same scores and medals", async () => {
    A = await session();
    const B = await session();
    assert.deepEqual(B, A, "boot B differs from boot A");
    const { late: _late, ...pinned } = refs.runs;
    assert.deepEqual(A, pinned, "the refs (--write) are these runs");
  });

  test("the lesson: an early brake loses time at that corner, the card names it, and fixing it is gold", () => {
    assert.ok(A, "the first test booted");
    assert.equal(A.ref.medal, null, "the reference earns nothing");
    assert.ok(A.early.total > 0.05, "the early brake cost time: " + A.early.total);
    const w = A.early.window;
    assert.ok(w.from <= A.mark.on && A.mark.on - EARLY_M <= w.to + 60, "the window is at the faulted corner: " + JSON.stringify({ w, mark: A.mark }));
    assert.equal(A.early.cause, "brake", "EARLY BRAKE");
    assert.equal(A.picked.medal, "silver", "THIS CORNER with the right cause");
    assert.ok(A.picked.value > 0.05, "the seconds located: " + A.picked.value);
    assert.ok(A.fix.fix && A.fix.fix.frac >= 0.6, "the FIX IT run won the time back: " + JSON.stringify(A.fix.fix));
    assert.equal(A.fix.medal, "gold");
    assert.equal(refs.runs.late.cause, "throttle", "a late throttle names LATE THROTTLE");
    assert.equal(refs.runs.late.medal, null, "a run that loses more time elsewhere is no FIX IT gold");
  });
}
after(() => {});
