#!/usr/bin/env node
/**
 * @doc The AI field's tyre strategy over a whole race with TYRE WEAR real: stop counts, stints, compounds, stop reasons.
 * Full description: the AI field's tyre strategy over a whole race with TYRE WEAR real: stop counts, stints, compounds, why each stop was made.
 * @skill ai-racecraft
 * ai-strategy-census.mjs — what the field actually DOES with its tyres.
 *
 * ai-pace / ai-field / ai-line measure driving, and default to wear OFF, so
 * none of them says anything about strategy. This runs full races in the VM
 * (tools/lib/game-vm.cjs) with wear REAL and reports, per car, the plan it
 * gridded with, the compounds it ran, its stop count, and each stop's reason
 * (`plan`, `worn`, `weather`, `caution`) with the wear it was made at.
 *
 * What to read: a `worn` stop is a set the plan ran off its cliff; a stop
 * armed well past w1.00 is a plan that stopped too late; a DSQ is the
 * two-compound rule broken. The first census (2026-09-29) found Austria's
 * late-staggered third of the field over 100 % before its stop — fixed in
 * AiDrive.stintPlan; tests/unit/tyre-strategy-vm.test.mjs audits the plans
 * cheaply on every run, this measures the race they turn into.
 *
 * COST: ~5 min wall per 10-lap race (22 cars, 60 Hz). Not a CI step.
 *
 *   node tools/check/ai-strategy-census.mjs --track redbull --laps 10 [--seed 1] [--weather dry] [--json]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
if (argv.includes("--help") || argv.includes("-h")) {
  console.log("usage: node tools/check/ai-strategy-census.mjs --track <id> --laps <n> [--seed n] [--weather dry|wet|rain] [--json]");
  process.exit(0);
}
const TRACK = flag("track", "bahrain"), LAPS = +flag("laps", 10), SEED = +flag("seed", 1), WX = flag("weather", "dry");

const t0 = Date.now();
const g = await createGame({ track: TRACK, storage: { tyreWear: "real", difficulty: "normal" } });
if (g.apex.seed) g.apex.seed(SEED);
await g.race(TRACK, "day", WX, { laps: LAPS });
const G = g.G;
const ai = G.cars.filter((c) => !c.human);
const plan0 = new Map(ai.map((c) => [c, c.pitPlan ? { seq: c.pitPlan.seq.slice(), lapsAt: c.pitPlan.lapsAt.slice() } : null]));
const stops = new Map(ai.map((c) => [c, []])), armed = new Map();
const DT = 1 / 60, MAXF = Math.round((LAPS * 400 + 600) / DT);   // generous: 400 s a lap
let f = 0;
while (f < MAXF && G.state !== "results" && !ai.every((c) => c.finished || c.retired)) {
  g.step(1, DT); f++;
  if (f % 6) continue;
  for (const c of ai) {
    const a = !!c.pitArmed;
    if (a && !armed.get(c)) stops.get(c).push({ why: c.pitWhy || "?", lap: c.lap, wear: +G.tyres.spent(c).toFixed(2) });
    armed.set(c, a);
  }
}
const rows = ai.map((c) => ({
  code: c.code, stops: c.pitStops || 0, ran: (c.tyreLog || []).map((e) => e.code).join(""),
  plan: plan0.get(c) ? { seq: plan0.get(c).seq, lapsAt: plan0.get(c).lapsAt } : null,
  finalWear: +G.tyres.spent(c).toFixed(2), finished: !!c.finished, retired: !!c.retired, dsq: c.dsq || "",
  calls: stops.get(c),
}));
const hist = {}, reasons = {};
for (const r of rows) { hist[r.stops] = (hist[r.stops] || 0) + 1; for (const s of r.calls) reasons[s.why] = (reasons[s.why] || 0) + 1; }
const out = {
  track: TRACK, laps: LAPS, seed: SEED, weather: WX, severity: G.tyres.severity(), simS: Math.round(f * DT),
  wallS: Math.round((Date.now() - t0) / 1000), stopHistogram: hist, reasons,
  overLifeAtStop: rows.reduce((a, r) => a + r.calls.filter((s) => s.wear >= 1).length, 0),
  finishedOverLife: rows.filter((r) => r.finished && r.finalWear >= 1).length,
  dsq: rows.filter((r) => r.dsq).length, cars: rows,
};
if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`${TRACK} · ${LAPS} laps · ${WX} · severity ${out.severity} · ${out.cars.length} AI cars · ${out.simS} s sim / ${out.wallS} s wall`);
  console.log(`  stops ${JSON.stringify(hist)}  reasons ${JSON.stringify(reasons)}  armed over 100 %: ${out.overLifeAtStop}  finished over 100 %: ${out.finishedOverLife}  DSQ: ${out.dsq}`);
  for (const r of rows) {
    const p = r.plan ? r.plan.seq.map((s) => s[0].toUpperCase()).join("") + " @" + r.plan.lapsAt.join(",") : "-";
    console.log(`  ${r.code.padEnd(4)} plan ${p.padEnd(12)} ran ${r.ran.padEnd(4)} end w${r.finalWear.toFixed(2)} ${r.finished ? "fin" : r.retired ? "RET" : "run"} ${r.dsq} ${r.calls.map((s) => `${s.why}@L${s.lap}/w${s.wear}`).join(" ")}`);
  }
}
g.close();
process.exit(0);
