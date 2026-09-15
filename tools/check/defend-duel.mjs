#!/usr/bin/env node
/**
 * defend-duel.mjs — DETERMINISTIC staged duel grid for defendPull's
 * straight branch (commit e9a9f56ca). Pure node, no browser.
 * @doc Staged two-car duels on a straight: defendPull ON vs OFF, same cell both arms (`--track --fracs --gaps --dxs --pair`).
 *
 * The 22-car field bench is chaotic: a 0.3 mm perturbation reshuffles it
 * (measured, scratch/defend-ab.mjs --arms off,sham --sham-eps 0.001). This
 * instrument removes the chaos instead of averaging over it: every other car is
 * retired, two AI cars are placed on a STRAIGHT at a chosen gap / lateral offset
 * / closing rate, and the pair is stepped for a few seconds. Each cell has a
 * binary outcome (did the attacker get by?) and reproduces to the digit.
 *
 * What it measures: how hard it is to complete a pass from a given starting
 * geometry, with the branch ON vs OFF. What it does NOT measure: whether that
 * makes a 22-car race better — use scratch/defend-ab.mjs for that.
 *
 *   node scratch/defend-duel.mjs --track monza --json artifacts/defend-duel-monza.json
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const ROOT = "/home/user/f1-game";
const { createGame } = require(ROOT + "/tools/lib/game-vm.cjs");

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const TRACK = flag("track", "monza"), DIFF = flag("diff", "normal"), OUT = flag("json", "");
const SECS = +flag("secs", 8), NFRAC = +flag("fracs", 4);
const GAPS_F = flag("gaps", ""), DXS_F = flag("dxs", ""), DVS_F = flag("dvs", "");
const DT = 1 / 60, KS = 0.004;
const GAPS = GAPS_F ? GAPS_F.split(",").map(Number) : [2, 4, 6, 8, 10];        // metres of prog the attacker is behind
const DXS  = DXS_F  ? DXS_F.split(",").map(Number)  : [-1.6, -0.9, -0.4, 0, 0.4, 0.9, 1.6];   // attacker lateral offset MINUS defender's
const DVS  = DVS_F  ? DVS_F.split(",").map(Number)  : [1.0, 2.0];              // attacker speed advantage, m/s (stays under the letPass gate)
const PAIR = flag("pair", "0,1").split(",").map(Number);
const A = PAIR[0], B = PAIR[1];                      // defender, attacker (car indices)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const g = await createGame({ track: TRACK, storage: { difficulty: DIFF } });
// A long race: every cell steps the sim 8 s forward and the session ENDS at
// lapsTarget (3 by default), after which the cars stop and every later cell
// silently measures a finished race. 60 laps is ~5000 s of headroom.
g.G.raceLaps = 60;
let setups = 0;
async function setup() {
  setups++;
  g.apex.seed(1); await g.race(TRACK);
  const pi = g.G.cars.findIndex((c) => c.isPlayer);
  if (pi >= 0) g.apex.carRole(pi, { human: false });   // retiring the PLAYER ends the race (state -> "results", measured); converting it does not
  g.G.cars.forEach((c, i) => { if (i !== A && i !== B) g.apex.retire(i, "bench"); });
}
await setup();
const Tracks = g.sandbox.Tracks, track = g.G.track, L = track.total;
const wrapS = (s) => { s %= L; return s < 0 ? s + L : s; };

// PICK THE STRAIGHTS the branch actually fires on: fracs whose whole
// lookahead window (18-70 m, as game.js:4289 reads it) stays under defendPull's
// own |kA| <= 0.004, for the length of the duel.
const cand = [];
for (let f = 0; f < 1; f += 1 / 400) {
  let ok = true;
  for (let d = 0; d <= 380; d += 20) if (Math.abs(Tracks.curvature(track, wrapS(f * L + d + 45))) > KS) { ok = false; break; }
  if (ok) cand.push(+f.toFixed(4));
}
const FRACS = [];
for (let i = 0; i < NFRAC && cand.length; i++) FRACS.push(cand[Math.floor((i + 0.5) * cand.length / NFRAC)]);
if (!FRACS.length) { console.error("no straight long enough on " + TRACK); process.exit(1); }

const origPull = g.sandbox.AiDrive.defendPull;
let ARM = "on", nzStraight = 0;
g.sandbox.AiDrive.defendPull = function (ctx) {
  if (ARM === "off" && Math.abs(ctx.kA || 0) <= KS) return 0;   // git show e9a9f56ca^ verbatim
  const r = origPull.call(this, ctx);
  if (r && Math.abs(ctx.kA || 0) <= KS) nzStraight++;
  return r;
};

function reset(c) {   // clear everything the previous cell could have left behind
  c.defendSide = 0; c.aiBias = null; c.aiFam = 0; c.aiHead = 0; c.contactT = 0;
  c.letPassT = 0; c.stuckT = 0; c.rescueT = 0; c.offT = 0; c.errT = 0; c.holdOff = null;
  c.passOf = null; c.passT = 0; c.passCool = 0; c.passFailT = 0; c.otT = 0; c.otCool = 0;
  c.lane = c.lanePref != null ? c.lanePref : 0; c.vLat = 0; c.steerVis = 0; c.yawVis = 0;
}

const cells = [];
for (const frac of FRACS) for (const gap of GAPS) for (const dx of DXS) for (const dv of DVS) cells.push({ frac, gap, dx, dv });

function runCell(cell, v0) {
  const a = g.G.cars[A], b = g.G.cars[B];
  reset(a); reset(b);
  g.apex.aiPlace(A, cell.frac, v0, 0);
  g.apex.aiPlace(B, cell.frac - cell.gap / L, v0 + cell.dv, cell.dx);
  let passT = null, minGap = 1e9, maxDefX = 0;
  const p0 = a.prog;
  for (let f = 0; f < Math.round(SECS / DT); f++) {
    g.step(1, DT);
    const dp = a.prog - b.prog;
    if (dp < minGap) minGap = dp;
    if (Math.abs(a.x) > maxDefX) maxDefX = Math.abs(a.x);
    if (passT == null && dp < 0) passT = +(f * DT).toFixed(2);
  }
  return { ...cell, pass: passT != null ? 1 : 0, passT, minGap: +minGap.toFixed(2),
           endGap: +(a.prog - b.prog).toFixed(2), maxDefX: +maxDefX.toFixed(2),
           defAdvance: +(a.prog - p0).toFixed(1) };
}

const V0 = +flag("v0", 68);   // a speed the straight actually carries; both cars start on it
// INTERLEAVED, cell by cell: both arms see the same accumulated sim state, so a
// difference is the branch and not how far into the session the cell landed.
const out = { on: { rows: [] }, off: { rows: [] } };
const nz = { on: 0, off: 0 };
for (const c of cells) {
  if (g.apex.info().state !== "race") await setup();
  for (const arm of ["on", "off"]) {
    ARM = arm; nzStraight = 0;
    out[arm].rows.push(runCell(c, V0));
    nz[arm] += nzStraight;
  }
  // The session still ends on its own after enough accumulated distance; when it
  // does, re-grid and carry on. Both arms of a cell always run inside one session.
  if (g.apex.info().state !== "race") await setup();
}
for (const arm of ["on", "off"]) {
  const rows = out[arm].rows;
  Object.assign(out[arm], { passes: rows.reduce((s, r) => s + r.pass, 0), n: rows.length,
               medPassT: (() => { const v = rows.filter((r) => r.passT != null).map((r) => r.passT).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; })(),
               medEndGap: (() => { const v = rows.map((r) => r.endGap).sort((x, y) => x - y); return v[v.length >> 1]; })(),
               medDefAdvance: (() => { const v = rows.map((r) => r.defAdvance).sort((x, y) => x - y); return v[v.length >> 1]; })(),
               defNzStraight: nz[arm] });
}
const flips = cells.map((c, i) => ({ ...c, on: out.on.rows[i].pass, off: out.off.rows[i].pass }))
  .filter((r) => r.on !== r.off);
const summary = { track: TRACK, setups, pair: PAIR, fracs: FRACS, cells: cells.length, secs: SECS, v0: V0,
  on: { passes: out.on.passes, n: out.on.n, medPassT: out.on.medPassT, medEndGap: out.on.medEndGap, medDefAdvance: out.on.medDefAdvance, defNzStraight: out.on.defNzStraight },
  off: { passes: out.off.passes, n: out.off.n, medPassT: out.off.medPassT, medEndGap: out.off.medEndGap, medDefAdvance: out.off.medDefAdvance, defNzStraight: out.off.defNzStraight },
  cellsChanged: flips.length, defendedOnly: flips.filter((r) => r.off === 1 && r.on === 0).length,
  passedOnly: flips.filter((r) => r.on === 1 && r.off === 0).length, flips };
console.log(JSON.stringify({ ...summary, flips: summary.flips.length > 12 ? summary.flips.slice(0, 12) : summary.flips }, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify({ summary, rows: out }, null, 1));
g.close();
