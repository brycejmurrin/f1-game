/* vsc-drill-vm.mjs — LEARN's VSC: BOX OR STAY drill (js/learn-drills/vsc.js, #6559 step 17) in the real game VM,
 * through game.js's own host (__apex.drillLaunch). SimDrill.sync(true): each round's two DrillFork branches run in
 * one drain() call instead of frame slices.
 *
 *   const d = await vscDrill();          // boot, launch, round 1 on the decision card
 *   const r = d.play(["box", "stay", "stay"]);   // three calls; returns the host's result
 *   d.retry();                           // RETRY: the three rounds again from the drill's start
 *
 * Writer: `node tests/helpers/vsc-drill-vm.mjs --write` plays all-BOX then all-STAY and writes every round's two
 * branch times into tests/data/learn-drill-refs.json "vsc". */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REFS = ROOT + "tests/data/learn-drill-refs.json";

export async function vscDrill() {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  const g = await createGame({ carMeshes: false });
  const G = g.G;
  const launched = await g.apex.drillLaunch("vsc");
  if (!launched.ok) throw new Error("vsc-drill-vm: launch refused " + JSON.stringify(launched));
  const up = await g.stepUntil(() => G.state === "race" && g.apex.drillState().staging === false, { maxSteps: 900 });
  if (!up.ok) throw new Error("vsc-drill-vm: the drill race never started");
  const V = vm.runInContext("VscDrill", g.ctx), S = vm.runInContext("SimDrill", g.ctx);
  S.sync(true);
  for (let i = 0; i < 50 && (!V.state() || V.state().phase !== "decide"); i++) await new Promise((r) => setTimeout(r, 10));   // DrillFork's bundle load
  if (!V.state() || V.state().phase !== "decide") throw new Error("vsc-drill-vm: no decision card " + JSON.stringify(V.state()));
  function play(picks) {
    const before = G.drills().lastResult();
    for (const p of picks) {
      if (!V.choose(p)) throw new Error("vsc-drill-vm: choose refused in " + JSON.stringify(V.state()));
      const st = V.drain();
      if (st.phase !== "result") throw new Error("vsc-drill-vm: round did not finish " + JSON.stringify(st));
      V.next();
    }
    const r = G.drills().lastResult();
    return r && r !== before ? r : null;
  }
  return { g, G, V, S, play, retry: () => g.apex.drillRetry().ok, close: () => g.close() };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--write")) {
  const d = await vscDrill();
  let box, stay;
  try {
    box = d.play(["box", "box", "box"]);
    if (!d.retry()) throw new Error("retry refused");
    stay = d.play(["stay", "stay", "stay"]);
  } finally { d.close(); }
  const rounds = box.rounds.map((x, k) => ({ id: x.id, box: x.box, stay: x.stay, best: x.best, boxPick: box.rounds[k].lost, stayPick: stay.rounds[k].lost }));
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs.vsc = {
    how: "node tests/helpers/vsc-drill-vm.mjs --write: the Red Bull Ring VSC drill, one boot, all-BOX then RETRY and all-STAY; each round's BOX and STAY branches run by DrillFork to the flag",
    metric: "your car's race time to the flag in each branch, s (js/learn-drills/vsc.js timeToFlag); a round is right when the pick is the faster branch",
    rule: "medals count right calls: bronze 1, silver 2, gold 3 (#6554 §1.4); deterministic, so no noise band (#6559 decision 4)",
    rounds,
    tiers: { bronze: 1, silver: 2, gold: 3 },
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(rounds));
}
