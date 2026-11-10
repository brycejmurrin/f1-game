/* load-scaled-budget.mjs — a wall-clock hang ceiling that does not fail on a busy box.
 *
 * Used by tests/unit/game-vm.test.mjs ("boot and track build do not hang") and
 * tests/unit/perf-hot-bench.test.mjs ("monza hot functions stay within the hang
 * ceiling"). Both are wall-clock budgets; both failed at machine load ~11 on a
 * 4-CPU box and passed alone. A hang ceiling must not fail on a busy box
 * (decision recorded with the W29 audit), so the cap is scaled by how slow THIS
 * process is right now:
 *
 *   1. calibrate(): time a fixed, deterministic JS workload (float math, small
 *      object allocation, an array sort, string building: the shape of the VM's
 *      own work) in the same process, immediately before and after the measured
 *      work. A box that gives this process a third of a CPU runs it ~3x slower.
 *   2. scale = max(1, calMs / REF_CAL_MS). Never below 1: a fast or idle box
 *      keeps exactly the base cap the test had before.
 *   3. cap = min(baseCap * scale, hardCap). hardCap is an absolute ceiling at a
 *      value that only a real hang reaches, so no amount of load can hide one.
 *
 * REF_CAL_MS is the calibration measured on the reference dev container
 * (4 CPUs) — re-measure with `node tests/helpers/load-scaled-budget.mjs`
 * on a quiet box if the workload changes.
 */
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

// Measured 2026-11-10 on the dev container: 18.1-20.6 ms median per pass at
// load 6 on 4 CPUs (the quietest the shared box got); an idle box is at or
// below this, so it scales by 1 and keeps the base cap.
export const REF_CAL_MS = 18;

/** The fixed workload. Returns a checksum so the JIT cannot drop it. */
export function calibrationWork(n = 500000) {
  let acc = 0;
  const objs = [];
  for (let i = 0; i < n; i++) {
    const x = Math.sin(i * 0.001) * Math.sqrt(i + 1);
    const o = { i, x, y: x * 0.5 };
    if ((i & 31) === 0) objs.push(o);
    acc += o.y;
  }
  objs.sort((a, b) => a.x - b.x);
  let s = "";
  for (let i = 0; i < objs.length; i += 4) s += objs[i].i.toString(36);
  return acc + s.length;
}

/**
 * Median wall-clock ms of `runs` calibration passes (one discarded warm-up).
 * `interleave` is a test seam: it runs inside every timed pass, standing in
 * for CPU another process took from this one.
 */
export function calibrate({ runs = 5, interleave = null } = {}) {
  calibrationWork();
  const times = [];
  let sink = 0;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    sink += calibrationWork();
    if (interleave) interleave();
    times.push(performance.now() - t0);
  }
  if (!Number.isFinite(sink)) throw new Error("calibration checksum is not finite");
  times.sort((a, b) => a - b);
  return times[times.length >> 1];
}

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * The effective cap for a base cap measured on a quiet box.
 * @param {{ baseCap: number, hardCap: number, calMs: number, refMs?: number }} o
 */
export function scaledCap({ baseCap, hardCap, calMs, refMs = REF_CAL_MS }) {
  if (!(baseCap > 0) || !(hardCap >= baseCap)) throw new Error(`bad caps base ${baseCap} hard ${hardCap}`);
  const scale = Number.isFinite(calMs) && calMs > 0 ? Math.max(1, calMs / refMs) : 1;
  const cap = Math.min(baseCap * scale, hardCap);
  return { calMs: round(calMs), refMs, scale: round(scale), baseCap, hardCap, cap: round(cap) };
}

/**
 * Time `work` between two calibrations and judge it against the scaled cap.
 * The slower calibration is the one used: load that arrived mid-measure counts.
 * @returns {Promise<{ ms: number, pass: boolean, calMs: number, scale: number, cap: number, baseCap: number, hardCap: number, refMs: number, value: any }>}
 */
export async function timeWithinScaledCap(work, { baseCap, hardCap, refMs = REF_CAL_MS, interleave = null }) {
  const cal0 = calibrate({ interleave });
  const t0 = performance.now();
  const value = await work();
  const ms = performance.now() - t0;
  const cal1 = calibrate({ interleave });
  const budget = scaledCap({ baseCap, hardCap, calMs: Math.max(cal0, cal1), refMs });
  return { ...budget, ms: round(ms), pass: ms < budget.cap, value };
}

/** One-line description for an assertion message or a PR body. */
export function describeBudget(b) {
  return `calibration ${b.calMs} ms (ref ${b.refMs}) -> scale ${b.scale}x -> cap ${b.cap} (base ${b.baseCap}, hard ${b.hardCap})`;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const samples = [];
  for (let i = 0; i < 5; i++) samples.push(round(calibrate()));
  console.log(JSON.stringify({ samples, refMs: REF_CAL_MS }));
}
