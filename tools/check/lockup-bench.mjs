#!/usr/bin/env node
/**
 * @doc Straight-line brake sweep: peak axFracF / afF, wheelLock, flat-spot growth.
 * @skill tune-physics
 *
 *   node tools/check/lockup-bench.mjs [--json]
 *   TRACK=monza FRAC=0 node tools/check/lockup-bench.mjs
 *
 * Sweeps launch speeds, pedal level (scripted brakeLevel), and setup brake bias.
 * Weather: dry and rain. Pin seat (McLaren, empty sheet) on a pinned straight.
 */
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createGame } = require("../lib/game-vm.cjs");

const DT = 1 / 60;
const SPEEDS = [20, 40, 55];
const PEDALS = [
  { label: "digital", brake: true, brakeLevel: 1 },
  { label: "pedal75", brake: true, brakeLevel: 0.75 },
  { label: "pedal50", brake: true, brakeLevel: 0.5 },
];
const BIASES = [
  { label: "bbRef", bb: null },
  { label: "bb60f", bb: 0.6 },
  { label: "bb52r", bb: 0.52 },
];
const WEATHER = ["dry", "rain"];

function r3(v) { return +v.toFixed(3); }

function afFOf(P, SetupTune) {
  const ax = P.axFracF;
  if (ax == null) return 0;
  if (P.axEstSm == null || P.axEstSm >= 0) return ax;
  if (P.brakeBias == null || P.brakeBias === SetupTune.BB_REF) return ax;
  const bb = SetupTune.bbScales(P.brakeBias);
  return Math.min(1, ax * bb.f);
}

/** One stop from v0; returns peaks while speed > 2 m/s. */
function runStop(g, frac, v0, input, brakeBias, weather) {
  const P = g.G.player;
  const track = g.G.track;
  const SetupTune = g.sandbox.SetupTune;
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  const s0 = frac * track.total;
  g.sandbox.Tracks.sample(track, s0, smp);
  const head0 = Math.atan2(smp.t[0], smp.t[2]);
  for (const c of g.G.cars) if (c !== P) { c.retired = true; c.x = 80; }
  const pin = () => { P.px = smp.p[0]; P.pz = smp.p[2]; P.s = s0; P.x = 0; };

  g.apex.jump(frac, v0, 0);
  P.axEstSm = 0;
  P.vertLoad = 0;
  P.flatSpot = 0;
  P.px = smp.p[0]; P.pz = smp.p[2]; P.head = head0;
  P.brakeBias = brakeBias == null ? SetupTune.BB_REF : brakeBias;

  let peakAxF = 0, peakAfF = 0, peakLock = 0, lockFrames = 0, flat0 = P.flatSpot || 0;
  let t = 0;
  while (P.speed > 2 && t < 12) {
    g.apex.setInput({ steer: 0, throttle: false, ...input });
    g.step(1, DT);
    pin();
    t += DT;
    const axF = P.axFracF ?? 0;
    const afF = afFOf(P, SetupTune);
    peakAxF = Math.max(peakAxF, axF);
    peakAfF = Math.max(peakAfF, afF);
    const lock = P.wheelLock || 0;
    peakLock = Math.max(peakLock, lock);
    if (lock > 0.25) lockFrames++;
  }
  g.apex.clearInput();
  return {
    peakAxFracF: r3(peakAxF),
    peakAfF: r3(peakAfF),
    peakWheelLock: r3(peakLock),
    lockFramesGt025: lockFrames,
    flatSpotDelta: r3((P.flatSpot || 0) - flat0),
    stop_s: r3(t),
  };
}

export async function measureLockup(opts = {}) {
  const track = opts.track || process.env.TRACK || "monza";
  const frac = +(opts.frac ?? process.env.FRAC ?? 0);
  const g = await createGame({
    track,
    seat: "pin",
    storage: { difficulty: "normal", autoThrottle: false },
  });
  await g.race(track, "day", "dry");
  const rows = [];
  for (const wx of WEATHER) {
    if (wx !== "dry") await g.race(track, "day", wx);
    for (const v0 of SPEEDS) {
      for (const ped of PEDALS) {
        for (const bb of BIASES) {
          rows.push({
            weather: wx,
            v0_m_s: v0,
            pedal: ped.label,
            bias: bb.label,
            ...runStop(g, frac, v0, ped, bb.bb, wx),
          });
        }
      }
    }
  }
  g.close();
  return { track, frac, rows };
}

async function main() {
  const out = await measureLockup();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`lockup-bench  ${out.track} frac=${out.frac}`);
  console.log("wx   v  pedal   bias   axF   afF   lock  fr>0.25  dFlat");
  for (const r of out.rows) {
    console.log(
      `${r.weather.padEnd(4)} ${String(r.v0_m_s).padStart(2)}  ${r.pedal.padEnd(7)} ${r.bias.padEnd(5)}  ` +
      `${String(r.peakAxFracF).padStart(5)} ${String(r.peakAfF).padStart(5)} ${String(r.peakWheelLock).padStart(5)}  ` +
      `${String(r.lockFramesGt025).padStart(7)}  ${r.flatSpotDelta}`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
