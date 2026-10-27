#!/usr/bin/env node
/**
 * @doc Brake-cue calibration (VM): cue call point vs AiDrive.brakeTarget, dry/rain on slicks, conditionCues off/on.
 * @skill tune-physics
 *
 *   node tools/check/brake-cue-calibrate.mjs [--json] [--track monza] [--notch 6]
 *
 * Headless and deterministic (tools/lib/game-vm.cjs boots the real circuit; no
 * browser). A probe car rides the lap at vTop() and, every STEP metres, asks
 * two questions of the SAME road (Tracks.curvature):
 *   cue — the real js/physics/brake-cue.js tick(), loaded into its own VM with a
 *         stepped clock, at the given slider notch: is urgency past URGENCY_GATE?
 *   ref — AiDrive.brakeTarget() for an ideal driver (skill 1, no style/attack/
 *         optimism) on the PLAYER's tyre in that weather: is vTop over the entry
 *         budget? Grip and brake use the game's own scaling (gripMult per tread,
 *         brake × gmC/gm0, game.js updateAi).
 * A rising edge of `ref` is a braking point; the matching cue edge is the last
 * one inside the GATE metres before it (or after it, up to the corner). The
 * margin is ref − cue in metres and in seconds at vTop: positive = the cue
 * calls EARLIER than the reference driver brakes (safe), negative = late.
 * A cue edge with no reference braking in the GATE metres after it is a "flat
 * call" (the car takes the corner flat yet the cue pulses); a reference edge
 * with no cue call in the GATE metres before it is "missed". This is a point-mass sweep, not a driven
 * lap: the cue sees the speed it would have arriving flat out, its worst case.
 * Results: docs/notes/BRAKE-CUE-CALIBRATION-2026-10-27.md.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseFlags } from "../lib/cli-args.mjs";
const require = createRequire(import.meta.url);
const { createGame } = require("../lib/game-vm.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STEP = 2;          // m between probe positions
const GATE = 300;        // m: how far before a reference edge a cue edge may sit and still pair
const REF_LOOK = 320;    // m of look-ahead for the reference planner

/** Load brake-cue.js into its own context so its clock is ours to step. */
function cueVm(S) {
  const src = fs.readFileSync(path.join(ROOT, "js/physics/brake-cue.js"), "utf8").replace(/^const\b/gm, "var");
  const clock = { ms: 1000 };
  const cx = { window: { PhysicsConsts: S.PhysicsConsts }, PhysicsConsts: S.PhysicsConsts, M4: S.M4,
    performance: { now: () => clock.ms }, Tracks: S.Tracks };
  vm.runInNewContext(src, cx, { filename: path.join(ROOT, "js/physics/brake-cue.js") });
  return { BrakeCue: cx.BrakeCue, clock };
}

function onWithin(flags, i0, i1) {
  for (let i = Math.floor(i0); i <= Math.ceil(i1); i++) if (flags[(i % flags.length + flags.length) % flags.length]) return true;
  return false;
}

function rising(flags) {
  const out = [];
  for (let i = 0; i < flags.length; i++) if (flags[i] && !flags[(i - 1 + flags.length) % flags.length]) out.push(i);
  return out;
}

/** One condition: returns { refEdges, cueEdges, pairs, flat, missed } in metres of lap. */
export function sweep(g, { weather, conditionCues, notch = 6 }) {
  const S = g.sandbox, G = g.G, track = G.track, PC = S.PhysicsConsts, TM = S.TyreModel, AI = S.AiDrive;
  const wet = weather === "rain" ? 1 : weather === "wet" ? 0.5 : 0;
  const wgSlick = TM.weatherGrip(0, wet);                  // the player on slicks
  const gm0 = TM.weatherGrip(TM.treadFor(weather, wet), wet);   // gripMult(): the tyre the weather asks for
  const vt = G.vTop(), L = track.total, n = Math.floor(L / STEP);
  const { BrakeCue, clock } = cueVm(S);
  const player = { speed: vt, s: 0, axEstSm: 0, _cueConditionGrip: wgSlick, _cueCornering: 1, _cueBraking: 1 };
  const cue = BrakeCue.create({ paused: false, state: "race", soundOn: false, store: null, track, player, vTop: () => vt });
  cue.setLevel(notch);
  cue.setConditionAware(conditionCues);
  // Settle the 0.6 s capacity smoothing before the lap (a race has been running for seconds by the first corner).
  for (let i = 0; i < 300; i++) { clock.ms += 1000 / 60; cue.tick(); }
  const traits = { skill: 1, craft: 0, optimism: 0 };
  const ctx = { traits, samples: null, latMax: PC.LAT_MAX, aeroLoad: 0.5, brake: PC.BRAKE * (wgSlick / gm0),
    grip: wgSlick, pace: vt / PC.VMAX, vmax: PC.VMAX, speed: vt, team: null, seat: 0, stats: null, errMul: 1, diffCorner: 1 };
  const cueOn = new Uint8Array(n), refOn = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * STEP;
    player.s = s;
    clock.ms += (STEP / vt) * 1000;
    cue.tick();
    cueOn[i] = cue.debug().urgency >= BrakeCue.URGENCY_GATE ? 1 : 0;
    AI.beginLook();
    for (let d = 2; d < REF_LOOK; d += 4) {
      const ss = ((s + d) % L + L) % L;
      AI.pushLook(d, S.Tracks.curvature(track, ss), Math.abs(S.Tracks.bankAngle(track, ss)));
    }
    ctx.samples = AI.endLook();
    refOn[i] = vt > AI.brakeTarget(ctx) ? 1 : 0;
  }
  const refEdges = rising(refOn).map((i) => i * STEP), cueEdges = rising(cueOn).map((i) => i * STEP);
  const used = new Set(), pairs = [], missed = [];
  for (const r of refEdges) {
    // The cue edge for this braking point: the latest one at most GATE m before it, else the first one after it.
    let best = null;
    for (const c of cueEdges) {
      if (used.has(c)) continue;
      const lead = ((r - c) % L + L) % L;
      if (lead <= GATE && (best == null || lead < best.lead)) best = { c, lead };
    }
    if (!best) for (const c of cueEdges) {
      if (used.has(c)) continue;
      const lag = ((c - r) % L + L) % L;
      if (lag <= 120 && (best == null || -lag > best.lead)) best = { c, lead: -lag };
    }
    if (!best) {
      // Not a fresh call: a re-brake inside a complex the cue is still calling (Ascari's second part) is covered.
      if (!onWithin(cueOn, r / STEP - GATE / STEP, r / STEP)) missed.push(r);
      continue;
    }
    used.add(best.c);
    pairs.push({ ref: r, cue: best.c, marginM: best.lead, marginS: +(best.lead / vt).toFixed(2) });
  }
  // A flat call: the cue starts pulsing and the reference driver does not brake within GATE m of it.
  const flat = cueEdges.filter((c) => !used.has(c) && !onWithin(refOn, c / STEP, c / STEP + GATE / STEP));
  return { weather, conditionCues, notch, vTop: +vt.toFixed(1), gripSlick: +wgSlick.toFixed(3), refEdges, cueEdges, pairs, flat, missed };
}

// Corners, not edges: a cue hovering at the gate restarts several times in one corner.
function clusters(edges) { return edges.filter((e, i) => i === 0 || e - edges[i - 1] > GATE / 2).length; }

export function summarize(r) {
  const m = r.pairs.map((p) => p.marginM).sort((a, b) => a - b);
  const q = (f) => (m.length ? m[Math.min(m.length - 1, Math.floor(f * m.length))] : null);
  return { weather: r.weather, conditionCues: r.conditionCues, refPoints: r.refEdges.length, paired: r.pairs.length,
    late: r.pairs.filter((p) => p.marginM < 0).length, minM: m[0] ?? null, medianM: q(0.5), maxM: m.at(-1) ?? null,
    flatCalls: clusters(r.flat), missed: r.missed.length };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2), ["--json", "--track", "--notch"]);
  const trackId = flags.flag("--track", process.env.TRACK || "monza"), notch = +flags.flag("--notch", "6");
  const g = await createGame({ track: trackId });
  await g.race(trackId, "day", "dry");
  const rows = [];
  for (const weather of ["dry", "rain"]) for (const conditionCues of [false, true])
    rows.push(sweep(g, { weather, conditionCues, notch }));
  if (flags.has("--json")) { process.stdout.write(JSON.stringify({ track: trackId, rows }, null, 2) + "\n", () => process.exit(0)); return; }
  console.log(`brake-cue calibration — ${trackId}, notch ${notch}, vTop ${rows[0].vTop} m/s (margin = ref − cue, + = cue earlier)`);
  console.table(rows.map(summarize));
  for (const r of rows) console.log(`${r.weather.padEnd(4)} cond=${r.conditionCues ? "on " : "off"} `
    + r.pairs.map((p) => `${p.ref}m:${p.marginM >= 0 ? "+" : ""}${p.marginM}`).join(" "));
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
