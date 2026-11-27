/* drill-grip-vm.test.mjs — LEARN's friction-circle drill end to end in the real game VM (#7040, #6559 step 4).
 * The drill launches through the game's own host (tests/helpers/drill-drive-vm.mjs): steering is SoakRun's control()
 * law, the pedals are GRIP_SCRIPTS. Pinned here:
 * 1. Determinism: two boots drive the same scripts to the same rim use, medal and gate time, and a RETRY of a run
 *    repeats it exactly; both match the reference runs in tests/data/learn-drill-refs.json "grip".
 * 2. The lesson: TRAIL (bleed the brake as the wheel turns) uses more of the circle than V-LINE, both clean.
 * 3. A fail: stamping the pedal at the turn-in and holding it locks the fronts; no medal.
 * 4. The shipped MEDALS are the tiers the refs give by the documented rule (#6559 §1e rule 4).
 * 5. A player's Pages build has no __apex (LAZY_AGENT): the host's DrillRegistry.physOf reads the same fields
 *    __apex.physState() does, and with window.__apex deleted a run still scores, medals and draws its guide (#7342).
 * 6. The card's NEXT moves the guide's variant: the pressed chip and the task are the run being scored (#7342).
 * Regenerate the refs: node tests/helpers/drill-drive-vm.mjs --write-grip
 *
 * Run: node --test tests/unit/drill-grip-vm.test.mjs
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillDrive, GRIP_SCRIPTS, GRIP_RUNS, deriveGripTiers, REFS } from "../helpers/drill-drive-vm.mjs";

const refs = JSON.parse(readFileSync(REFS, "utf8")).grip;
const pick = (r) => ({ value: r.value, clean: r.clean, reason: r.reason, gateS: r.gateS, medal: r.medal });
const runs = [];
after(() => { for (const r of runs) r.close(); });

/** One boot: the default V-LINE run, then TRAIL (rerun), then TRAIL again (RETRY). */
async function session() {
  const run = await drillDrive("grip");
  runs.push(run);
  const vline = run.drive(GRIP_SCRIPTS.vline());
  assert.ok(vline, "the V-line run reached the gate");
  assert.equal(run.rerun("trail"), true);
  const trail = run.drive(GRIP_SCRIPTS.trail());
  assert.ok(trail, "the trail run reached the gate");
  assert.equal(run.retry(), true);
  const again = run.drive(GRIP_SCRIPTS.trail());
  assert.ok(again, "the retried trail run reached the gate");
  return { run, vline, trail, again };
}

let A, B;
test("two boots drive the same scripts to the same score, medal and gate time; RETRY repeats a run", async () => {
  A = await session();
  B = await session();
  for (const k of ["vline", "trail", "again"]) assert.deepEqual(pick(B[k]), pick(A[k]), k + ": boot B differs from boot A");
  assert.deepEqual({ ...pick(A.again), medal: null }, { ...pick(A.trail), medal: null }, "RETRY repeats the trail run");
  assert.equal(A.trail.variant, "trail");
  assert.equal(A.vline.variant, "vline");
  // ...and the reference rollouts (a third boot, written by --write-grip) are these same runs.
  const ref = (script) => refs.runs.find((r) => r.script === script && !r.args.length);
  for (const [k, script] of [["vline", "vline"], ["trail", "trail"]]) {
    const { value, clean, reason, gateS } = ref(script);
    assert.deepEqual({ value, clean, reason, gateS }, { value: A[k].value, clean: A[k].clean, reason: A[k].reason, gateS: A[k].gateS }, script + " vs refs");
  }
});

test("TRAIL uses more of the circle than V-LINE, both clean", () => {
  assert.ok(A, "the first test booted");
  assert.equal(A.vline.clean, true, A.vline.reason);
  assert.equal(A.trail.clean, true, A.trail.reason);
  assert.ok(A.trail.value > A.vline.value + 5, `trail ${A.trail.value} % vs V-line ${A.vline.value} %`);
  assert.ok(A.vline.medal && A.trail.medal, "a clean run earns a medal");
});

test("stamping the pedal at the turn-in and holding it locks the fronts: the run fails, no medal", () => {
  assert.ok(A, "the first test booted");
  assert.equal(A.run.rerun("free"), true);
  const r = A.run.drive(GRIP_SCRIPTS.lock());
  assert.ok(r, "the lock-up run ended through the host");
  assert.equal(r.clean, false);
  assert.equal(r.reason, "locked the fronts");
  assert.equal(r.medal, null);
});

test("learn-drill-refs.json grip: GRIP_RUNS, the tiers follow by the rule, and grip.js ships them", () => {
  assert.deepEqual(refs.runs.map(({ variant, script, args }) => ({ variant, script, args })), GRIP_RUNS);
  assert.deepEqual(refs.tiers, deriveGripTiers(refs.runs));
  assert.ok(refs.runs.every((r) => r.clean), "every reference run is clean: " + JSON.stringify(refs.runs.filter((r) => !r.clean)));
  assert.ok(A, "the first test booted");
  const { silver, gold } = A.run.ev("GripDrill.MEDALS");
  assert.deepEqual({ silver, gold }, refs.tiers);
});

test("no __apex: physOf matches __apex.physState() field for field, and a run scores, medals and draws its guide (#7342)", async () => {
  const run = await drillDrive("grip");
  runs.push(run);
  const a = run.g.apex.physState(), b = run.ev("DrillRegistry").physOf(run.G);
  assert.ok(b && !b.error, "the car is placed");
  for (const k of Object.keys(b)) assert.equal(b[k], a[k], "physOf." + k + " vs __apex.physState()." + k);
  run.ev("delete window.__apex");
  assert.equal(run.ev("typeof window.__apex"), "undefined", "the agent surface is gone, as on a player's build");
  const r = run.drive(GRIP_SCRIPTS.vline());
  assert.ok(r, "the run reached the gate and the host scored it");
  assert.ok(Number.isFinite(r.value) && r.value > 0, "rim use " + r.value);
  assert.ok(r.medal, "a clean run earns a medal");
  assert.ok(r.metrics.every(([, v]) => !/NaN|undefined/.test(String(v))), JSON.stringify(r.metrics));
  const ref = refs.runs.find((x) => x.script === "vline" && !x.args.length);
  assert.deepEqual({ value: r.value, gateS: r.gateS }, { value: ref.value, gateS: ref.gateS }, "the same run as with __apex");
  const doc = run.g.sandbox.document;
  assert.ok(doc.getElementById("drill-card-medal").textContent.includes("%"), "the card is up");

  // 6. The card's NEXT ("TRY TRAIL") is rerun("trail"): the guide follows the host, not its own chip state.
  const next = doc.getElementById("drill-card-next");
  assert.equal(next.textContent, "TRY TRAIL");
  next.click();
  assert.equal(run.host.state().variant, "trail");
  run.host.guide().draw();
  assert.equal(doc.getElementById("learn-grip-guide").hidden, false, "the widget drew with no __apex");
  const pressed = ["vline", "trail", "free"].filter((v) => doc.getElementById("learn-grip-" + v).getAttribute("aria-pressed") === "true");
  assert.deepEqual(pressed, ["trail"]);
  const task = run.ev("GripDrill.VARIANTS.find((v) => v.id === 'trail').task");
  assert.equal(doc.getElementById("learn-grip-task").textContent, task);
  const r2 = run.drive(GRIP_SCRIPTS.trail());
  assert.equal(r2 && r2.variant, "trail", "scored and saved as the variant the guide shows");
});
