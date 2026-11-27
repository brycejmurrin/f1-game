/* learn-drill-vm.mjs — LEARN's Aero drill in the real game VM, through DrillRegistry's own host (#7039).
 * game.js makes its host on a LEARN door tap, which the VM stub DOM cannot reach yet (#7067 adds __apex.drill), so
 * this builds a second host over the same G with game.js's hooks and ticks it after each frame, where game.js would.
 *
 *   const run = await aeroDrill();          // boot, launch, begin
 *   const r = run.drive(duty);              // one run at a throttle duty (1 = flat out); returns the host's result
 *   run.retry();                            // RETRY: back to the begin() checkpoint
 *
 * Writer: `node tests/helpers/learn-drill-vm.mjs --write` re-runs the 20 calibration runs into
 * tests/data/learn-drill-refs.json (tiers derived by deriveAeroTiers below). */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REFS = ROOT + "tests/data/learn-drill-refs.json";
export const DUTIES = Array.from({ length: 20 }, (_, k) => +(1 - k * 0.05).toFixed(2));

const floor1 = (v) => Math.floor(v * 10 + 1e-9) / 10;
/** The documented rule: bronze = median metres closed of the 20 runs, silver = the furthest a run got before it
 *  dropped out of the wake, gold = the shortest clean finish in the wake (clean required). Floored to 0.1 m. */
export function deriveAeroTiers(runs) {
  const closed = runs.map((r) => r.closed).sort((a, b) => a - b);
  const mid = closed.length / 2;
  const median = closed.length % 2 ? closed[Math.floor(mid)] : (closed[mid - 1] + closed[mid]) / 2;
  const dropped = runs.filter((r) => r.reason === "dropped out of the wake").map((r) => r.closed);
  const clean = runs.filter((r) => r.clean).map((r) => r.closed);
  return { bronze: floor1(median), silver: floor1(Math.max(...dropped)), gold: floor1(Math.min(...clean)), goldClean: true };
}

export async function aeroDrill(opts = {}) {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  const g = await createGame({ storage: { dirtyAir: "classic", ...(opts.storage || {}) } });
  for (const rel of ["js/learn-drills/registry.js", "js/learn-drills/drill-card.js", "js/learn-drills/aero.js", "js/ui/learn-door.js"]) {
    vm.runInContext(readFileSync(ROOT + rel, "utf8"), g.ctx, { filename: ROOT + rel });
  }
  vm.runInContext("LearnDoor.defineDrills()", g.ctx);
  const G = g.G;
  const reopened = [];
  const host = vm.runInContext("DrillRegistry", g.ctx).create(G, {
    retry: () => G.coach.retry(),
    setDirtyAir: () => {},   // raceDirtyAir is a game.js let: the boot seeds the drill's "classic" instead
    insights: () => G.coach.insights,
    reopenLesson: (lesson, payload) => reopened.push({ lesson, payload }),
  });
  if (!host.launch("aero")) throw new Error("learn-drill-vm: launch refused");
  if (!(await g.settle(() => G.state === "count", 6000))) throw new Error("learn-drill-vm: no countdown");
  // game.js arms practice for a LEARN drill (practiceMode = !!drills.active()); this host is not game.js's.
  if (!G.coach.armPractice()) throw new Error("learn-drill-vm: practice refused");
  if (!host.begin()) throw new Error("learn-drill-vm: begin() could not place the cars");
  g.apex.headless(true);
  /** One run at a throttle duty: frames on in an even pattern. Returns the host's result (null: no finish). */
  function drive(duty, maxS = 50) {
    let acc = 0;
    for (let i = 0; i < 60 * maxS; i++) {
      acc += duty;
      const on = acc >= 1;
      if (on) acc -= 1;
      g.apex.act({ throttle: on, brake: false, steer: 0 }, 1 / 60, 1);
      const r = host.tick();
      if (r) return r;
    }
    return null;
  }
  return { g, G, host, reopened, drive, retry: () => host.retry(), close: () => g.close() };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--write")) {
  const run = await aeroDrill();
  const runs = [];
  try {
    for (const [k, duty] of DUTIES.entries()) {
      if (k && !run.retry()) throw new Error("retry refused before run " + k);
      const r = run.drive(duty);
      if (!r) throw new Error("no finish at duty " + duty);
      runs.push({ duty, closed: +r.value.toFixed(2), clean: r.clean, reason: r.reason });
    }
  } finally { run.close(); }
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs.aero = {
    how: "node tests/helpers/learn-drill-vm.mjs --write: 20 runs of the Monza Aero drill (24 m start, Classic dirty air), one boot, RETRY between runs, throttle duty 1.00 down to 0.05, no steering",
    metric: "metres closed = start gap - nearest gap reached (js/learn-drills/aero.js scoreAero)",
    rule: "bronze = median of the 20; silver = furthest before dropping out of the wake; gold = shortest clean finish (clean required); floored to 0.1 m",
    runs,
    tiers: deriveAeroTiers(runs),
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(refs.aero.tiers));
}
