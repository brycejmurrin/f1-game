#!/usr/bin/env node
/**
 * @doc Rubber-band profile: dead zone, forward/reverse, _bandNow vs gap — Melder checklist.
 * @skill ai-racecraft
 * ai-band.mjs — does the rubber band do what Game AI Pro ch.42 says it should?
 *
 * ai-field / ai-pace deliberately run AI-ONLY so the band never fires. That left
 * the band unfalsifiable: start/lapping guards are unit-pinned, but dead zone,
 * forward banding, and "skill not vmax" have no census. This one puts a human
 * on track and samples every AI car's gap and `c._bandNow`.
 *
 *   node tools/check/ai-band.mjs                      monza, normal, 90 s
 *   node tools/check/ai-band.mjs --diff easy --seconds 120 --runs 3
 *   node tools/check/ai-band.mjs --json
 *   node tools/check/ai-race.mjs band
 *
 * --wear off|light|real, DEFAULT off (harness pin). Band math does not read
 * tyre wear; the flag exists so a wear-on A/B cannot silently drift the default.
 *
 * Reading it AFTER Slice 5: expect dead zone (|gap|<40 m → band off), forward
 * frames with band≠0 when AI ahead (signed _bandNow < 0), reverse when behind,
 * vmaxMul retired (skill/corner levers). Tip before Slice 5 was reverse-only.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { wearArg } from "../lib/cli-args.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`ai-band — rubber-band profile with a human on track

  node tools/check/ai-band.mjs [--track monza] [--diff normal] [--seconds 90] [--runs 1] [--json]
  every run: --wear off|light|real  (default off)

Owned by ai-racecraft.`);
  process.exit(0);
}

const TRACK = flag("track", "monza");
const DIFF = flag("diff", "normal");
const WEAR = wearArg(argv);
const SECONDS = Math.max(30, +flag("seconds", 90));
const RUNS = Math.max(1, Math.min(9, +flag("runs", 1) || 1));
const SEED0 = +flag("seed", 1) || 1;
const JSON_OUT = argv.includes("--json");
const DT = 1 / 60;
const SETTLE = 10;          // ignore standing-start chaos (band itself waits until t>8)
const DEAD_M = 40;          // proposed dead-zone half-width for reporting (Slice 5 tunes)
const SAMPLE_EVERY = 4;     // frames (~15 Hz at 60 Hz phys — light)

function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

async function measure(seed) {
  const g = await createGame({ track: TRACK, storage: { difficulty: DIFF, tyreWear: WEAR } });
  if (g.apex && typeof g.apex.seed === "function") {
    g.apex.seed(seed);
    await g.race(TRACK);
  }
  if (g.go) await g.go();
  else if (g.apex && typeof g.apex.go === "function") g.apex.go();

  const track = g.G.track;
  const half = track.total * 0.5;
  const cars = g.G.cars;
  const human = cars.find((c) => c.isPlayer || c.human);
  if (!human) throw new Error("ai-band: no human on the grid — band never fires");
  // Keep the player as a human so the band has a lead target. Drive them slowly
  // enough that the pack both catches and stretches: pace ~0.92 of free field.
  if (g.apex && typeof g.apex.setInput === "function") {
    /* input applied each sample below */
  }

  let frames = 0, samples = 0;
  let bandOn = 0, behind = 0, ahead = 0, dead = 0, lapped = 0;
  let bandBehind = 0, bandAhead = 0, bandDead = 0, bandLapped = 0;
  let bandSum = 0, gapWhenBanded = [];
  const steps = Math.round(SECONDS / DT);

  for (let i = 0; i < steps; i++) {
    // Mild throttle so the human stays on track and the field can both lead
    // and trail — enough to exercise reverse AND (once Slice 5 lands) forward.
    if (g.apex && typeof g.apex.setInput === "function") {
      g.apex.setInput({ throttle: 0.55, brake: 0, steer: 0 });
    }
    g.step(1, DT);
    frames++;
    if (frames < Math.round(SETTLE / DT)) continue;
    if (frames % SAMPLE_EVERY !== 0) continue;
    samples++;

    const lead = human; // lead-human selection lives in update(); human is fine for solo player
    for (const c of cars) {
      if (c.human || c.isPlayer || c.retired || c.finished) continue;
      let gap = lead.prog - c.prog; // >0 => human ahead of this AI (reverse-band case)
      // wrap into (-half, half] only for classifying "near"; lapping uses raw magnitude
      const wrapped = ((gap + half) % track.total + track.total) % track.total - half;
      const band = c._bandNow || 0;
      const isLapped = Math.abs(gap) >= half;
      const isDead = !isLapped && Math.abs(wrapped) < DEAD_M;
      const isBehind = !isLapped && wrapped > 0;  // AI behind human
      const isAhead = !isLapped && wrapped < 0;   // AI ahead of human

      if (isLapped) lapped++;
      else if (isDead) dead++;
      else if (isBehind) behind++;
      else if (isAhead) ahead++;

      // Slice 5: band is signed (ahead < 0). Count any non-zero engagement.
      if (band !== 0) {
        bandOn++;
        bandSum += Math.abs(band);
        gapWhenBanded.push(wrapped);
        if (isLapped) bandLapped++;
        else if (isDead) bandDead++;
        else if (isBehind) bandBehind++;
        else if (isAhead) bandAhead++;
      }
    }
  }

  const aiSamples = behind + ahead + dead + lapped;
  return {
    seed,
    samples,
    aiSamples,
    raceT: g.G.raceT,
    bandOnShare: aiSamples ? bandOn / aiSamples : 0,
    behindShare: aiSamples ? behind / aiSamples : 0,
    aheadShare: aiSamples ? ahead / aiSamples : 0,
    deadShare: aiSamples ? dead / aiSamples : 0,
    lappedShare: aiSamples ? lapped / aiSamples : 0,
    // Of the frames in each bucket, how often was the band on?
    bandGivenBehind: behind ? bandBehind / behind : 0,
    bandGivenAhead: ahead ? bandAhead / ahead : 0,
    bandGivenDead: dead ? bandDead / dead : 0,
    bandGivenLapped: lapped ? bandLapped / lapped : 0,
    meanBandWhenOn: bandOn ? bandSum / bandOn : 0,
    medianGapWhenBanded: median(gapWhenBanded),
    // Structural flags for the Melder checklist (Slice 5 targets)
    reverseOnly: bandAhead === 0 && bandBehind > 0, // pre-Slice-5 shape; Slice 5 expects false
    forwardBandPresent: bandAhead > 0,
    deadZoneHolds: bandDead === 0,
    lappingQuiet: bandLapped === 0,
    deadZoneM: DEAD_M,
  };
}

function show(runs, key, digits = 3) {
  const vals = runs.map((r) => r[key]).filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return "n/a";
  const med = median(vals);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const f = (x) => (typeof x === "number" ? x.toFixed(digits) : x);
  return runs.length === 1 ? f(med) : `${f(med)} [${f(lo)}–${f(hi)}]`;
}

const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await measure(SEED0 + i));

const out = {
  track: TRACK,
  diff: DIFF,
  wear: WEAR,
  seconds: SECONDS,
  runs: RUNS,
  deadZoneM: DEAD_M,
  results: runs,
};

if (JSON_OUT) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`ai-band — ${TRACK} ${DIFF} wear=${WEAR} ${SECONDS}s ×${RUNS}`);
  console.log(`  band-on share      ${show(runs, "bandOnShare")}`);
  console.log(`  behind / ahead / dead / lapped shares  ${show(runs, "behindShare")} / ${show(runs, "aheadShare")} / ${show(runs, "deadShare")} / ${show(runs, "lappedShare")}`);
  console.log(`  P(band|behind)     ${show(runs, "bandGivenBehind")}   (reverse band)`);
  console.log(`  P(band|ahead)      ${show(runs, "bandGivenAhead")}   (forward band — shipped tip expects 0)`);
  console.log(`  P(band|dead <${DEAD_M}m) ${show(runs, "bandGivenDead")}   (dead zone — shipped tip may be >0)`);
  console.log(`  P(band|lapped)     ${show(runs, "bandGivenLapped")}   (must stay 0)`);
  console.log(`  mean _bandNow|on   ${show(runs, "meanBandWhenOn")}`);
  console.log(`  median gap|banded  ${show(runs, "medianGapWhenBanded", 1)} m`);
  const flags = runs[0];
  console.log(`  checklist (run 1): reverseOnly=${flags.reverseOnly} forward=${flags.forwardBandPresent} deadHolds=${flags.deadZoneHolds} lappingQuiet=${flags.lappingQuiet}`);
}
