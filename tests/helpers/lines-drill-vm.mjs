/* lines-drill-vm.mjs — LEARN's Racing Lines drill (js/learn-drills/lines.js, #6559 step 10) in the real game VM,
 * through DrillRegistry's own host, ticked after each frame where game.js would (the learn-drill-vm.mjs pattern).
 *
 *   const run = await linesDrill();         // boot, launch, begin: the car on the run to the Parabolica
 *   const r = run.drive("late");            // one run at the LATE cone; {result, trace} (result null: no finish)
 *   run.retry();                            // RETRY: back to the begin() checkpoint
 *
 * THE DRIVER is a test-side pursuit law with no curvature and no racing line in it: a lateral target that runs
 * outside → the run's cone on the inside kerb → outside again by the end of the arc, from the turn mark
 * (track.def.turns) and a fixed half-width, steered by PD on the car's lateral offset; it brakes to a fixed entry
 * speed and lifts when it runs wide of its own path. It reads only what a player sees. Writer:
 * `node tests/helpers/lines-drill-vm.mjs --write` re-runs the reference runs into tests/data/learn-drill-refs.json. */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REFS = ROOT + "tests/data/learn-drill-refs.json";
export const DRIVER = Object.freeze({ entry: 45, kp: 0.6, kd: 0.5, look: 15, lift: 1.5, turnIn: 140, trackOut: 300, hw: 8 });
const LAZY = ["js/learn-drills/registry.js", "js/learn-drills/drill-card.js", "js/ui/learn-door.js", "js/learn-drills/lines.js"];

export async function linesDrill(opts = {}) {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  const g = await createGame({ storage: { ...(opts.storage || {}) } });
  for (const rel of LAZY) vm.runInContext(readFileSync(ROOT + rel, "utf8"), g.ctx, { filename: ROOT + rel });
  vm.runInContext("LearnDoor.defineDrills()", g.ctx);
  const G = g.G, LD = vm.runInContext("LinesDrill", g.ctx);
  const host = vm.runInContext("DrillRegistry", g.ctx).create(G, {
    retry: () => G.coach.retry(), setDirtyAir: () => {}, insights: () => G.coach.insights, reopenLesson: () => {},
  });
  if (!host.launch("lines")) throw new Error("lines-drill-vm: launch refused");
  if (!(await g.settle(() => G.state === "count", 6000))) throw new Error("lines-drill-vm: no countdown");
  G.coach.armPractice();
  if (!host.begin()) throw new Error("lines-drill-vm: begin() could not place the car");
  g.apex.headless(true);
  const tr = G.track, L = tr.total, turnS = tr.def.turns[tr.def.turns.length - 1] * L, D = DRIVER;
  const ins = LD.INSIDE, out = -ins * (D.hw - 1.5), inn = ins * (D.hw - 1);
  const ease = t => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2;
  const past = s => ((s - turnS) % L + L * 1.5) % L - L / 2;   // signed metres past the turn mark

  /** One run at a cone. tick: the host samples and scores (false: the drill machinery is not run at all, for the
   *  contract test); guide: its widget draws every frame. steps caps the frames; the trace is one row per frame. */
  function drive(id, { tick = true, guide = true, steps = 60 * 40 } = {}) {
    LD.aim(id);
    const off = LD.VARIANTS.find(v => v.id === id).off, a0 = -D.turnIn + Math.min(0, off) - 40, b0 = off + 10;
    const target = s => { const d = past(s);
      return d < off ? out + (inn - out) * ease((d - a0) / (off - a0)) : d < b0 ? inn : inn + (out - inn) * ease((d - b0) / (D.trackOut - b0)); };
    const gd = host.guide(), trace = [];
    let px = G.player.x;
    for (let i = 0; i < steps; i++) {
      const p = G.player, d = past(p.s), xd = (p.x - px) * 60;
      px = p.x;
      const steer = Math.max(-1, Math.min(1, D.kp * (target(p.s + D.look) - p.x) - D.kd * xd));
      const brake = d - off > -300 && d - off < -120 && p.speed > D.entry;   // the braking zone, 300 → 120 m before the cone
      const wide = (p.x - target(p.s)) * -ins;
      g.apex.act({ throttle: !brake && wide < D.lift, brake, steer }, 1 / 60, 1);
      trace.push([p.px, p.pz, p.head, p.speed, p.x]);
      if (guide && gd) gd.draw({}, {}, 1, true);
      const r = tick ? host.tick() : null;
      if (r) return { result: r, trace };
    }
    return { result: null, trace };
  }
  return { g, G, LD, host, drive, turnS, retry: () => host.retry(), close: () => g.close() };
}

/** The reference row of a finished run: the drill's own book entry (m/s, s, m), rounded to 0.01. */
export function refRun(LD) {
  const r = LD.book().runs.at(-1), n = v => +(+v).toFixed(2);
  return { variant: r.variant, counted: r.counted, miss: n(r.miss), vMin: n(r.vMin), vExit: n(r.vExit), gateS: n(r.gateS) };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--write")) {
  const run = await linesDrill();
  const runs = [];
  try {
    for (const [k, id] of ["early", "geometric", "late"].entries()) {
      if (k && !run.retry()) throw new Error("retry refused before " + id);
      const { result } = run.drive(id);
      if (!result) throw new Error("no finish at " + id);
      runs.push(refRun(run.LD));
    }
  } finally { run.close(); }
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs.lines = {
    how: "node tests/helpers/lines-drill-vm.mjs --write: one boot, one run per cone (EARLY, GEOMETRIC, LATE) by the helper's pursuit driver (DRIVER), RETRY between runs",
    metric: "per run: cone miss (m), minimum speed and exit speed at +320 m (m/s), time to the +650 m gate (s) (js/learn-drills/lines.js score)",
    rule: "the medal is a stage, not a threshold: bronze = all three cones within 1.5 m; silver = plus the right answer (the fastest gate); gold = plus a later run on the winner within 0.5 m that beats its best gate. These runs prove each cone is reachable within 1.5 m and that LATE exits faster than EARLY",
    driver: { ...DRIVER },
    runs,
    tiers: { bronze: 1, silver: 2, gold: 3, goldClean: true },
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(runs));
}
