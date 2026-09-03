#!/usr/bin/env node
// tune-sweep — measure how DRIVEABLE each notch of each handling slider is.
// @doc How DRIVEABLE is each notch of each handling slider? Drives the real DOM slider, then a curvature-fed closed-loop lap.
// @skill tune-physics
//
// WHY THIS EXISTS. Every slider mapping in js/input/steer-tuning.js was written
// so that notch 5 reproduces the original hand-tuned constant. That made the
// shipped feel the CENTRE of every range by construction, and nobody ever
// checked whether the centre was where a driveable car actually lives. It is
// not: the default wheelbase is 3.23 m against a real F1 car's ~3.6 m, so
// "calmer" only exists BELOW the default and the top half of several sliders is
// dead range. This tool replaces "pick a number that feels right" with a
// measurement, so a recentre can be argued from data.
//
//   node tools/check/physics-tune-sweep.mjs                          # every slider, 3 circuits
//   node tools/check/physics-tune-sweep.mjs --sliders pm-rate,pm-pace
//   node tools/check/physics-tune-sweep.mjs --tracks monza,monaco --notches 1,3,5,7,10
//   node tools/check/physics-tune-sweep.mjs --aggr 0.80 --json out.json
//
// Env: APEX_WORKERS=N (default 3 — 4+ can OOM SwiftShader on small boxes)
//
// THE POLICY IS PACE-NORMALISED, WHICH IS THE WHOLE METHODOLOGICAL POINT.
// The two closed-loop policies already in the repo cannot be reused here:
// tests/specs/autopilot.spec.js hard-codes VMAX = 94 / aLat = 13 / A_BRAKE = 24 and
// tests/specs/agent-drive-bench.spec.js caps at `sp > 33` — bare m/s literals, which
// is exactly what AGENTS.md forbids ("comparing one against a literal means
// picking vTop() or vStd()"). Sweeping PACE with either measures the POLICY's
// mismatch rather than the car: the true force constants (LAT_MAX, BRAKE) do
// not scale with pace, so at low pace the grip margin over a fixed speed
// threshold grows and the policy looks artificially good.
//
// So this policy carries no speed literal at all. Its target speed comes from
// the CIRCUIT's own curvature and a GRIP BUDGET in m/s^2 — a force, and forces
// are pace-invariant by design (see the Physics section of AGENTS.md). The car
// is allowed to run to whatever top speed its pace gives it on the straights.
// The budget is a fixed yardstick held identical across every notch, so its
// absolute value only decides how hard the policy pushes, never which notch
// wins.
//
// SECOND METHODOLOGICAL HOLE, and why `completed` is reported per run:
// tests/specs/autopilot.spec.js says outright that a centreline follower cannot
// complete tight circuits, and deliberately does not assert lap completion. A
// sweep whose policy never finishes a lap is measuring the policy's ceiling,
// not the slider's knee. Check `completed` before trusting a single number —
// if a circuit reads 0/N completed at the SHIPPED defaults, drop that circuit
// or lower --aggr rather than reading the metrics.

import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url)).replace(/[\\/]$/, "");

// ---- CLI ----
const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}

// The handling sliders, by the DOM id the player actually drags. We set the
// real element and dispatch a real "input" event rather than reimplementing the
// mapping, so the sweep measures the SHIPPED slider-to-physics path — including
// anything steer-tuning.js does on the way (clearPreset, macro mirroring).
// `notches` is per-slider because they are no longer all 1..10: Phase C gave
// RACE PACE nineteen. A shared default would have swept only the bottom 53 % of
// the one control this tool exists to pick a default FOR, and it would have done
// it silently — the run would look complete and answer a different question.
const SLIDERS = [
  { id: "pm-pace",       label: "OVERALL SPEED (pace)", key: "pace", notches: 19 },
  { id: "pm-rate",       label: "RESPONSE (wheelbase)",          key: "wheelbase" },
  { id: "pm-expo",       label: "LINEARITY (steer expo)",        key: "expo" },
  { id: "pm-lock",       label: "STEER LOCK (max slip)",         key: "maxSlip" },
  { id: "pm-speedsteer", label: "SPEED STEER (speed ref)",       key: "speedRef" },
  { id: "pm-help",       label: "DRIVING HELP (road follow)",    key: "roadFollow" },
];

const wanted = flag("sliders", "").split(",").filter(Boolean);
const SWEEP = wanted.length ? SLIDERS.filter((s) => wanted.includes(s.id)) : SLIDERS;
const TRACKS = flag("tracks", "monza,suzuka,bahrain").split(",").filter(Boolean);
// An explicit --notches applies to every slider swept; otherwise each takes its
// own range (10 unless it says otherwise).
const NOTCHES_FLAG = flag("notches", "").split(",").map(Number).filter(Number.isFinite);
const notchesFor = (s) => NOTCHES_FLAG.length ? NOTCHES_FLAG
  : Array.from({ length: s.notches || 10 }, (_, i) => i + 1);
const AGGR = Number(flag("aggr", "0.88"));
const STEPS = Number(flag("steps", "2600"));
const JSON_OUT = flag("json", "");

function workers(def = 3) {
  return Math.max(1, Math.min(8, parseInt(process.env.APEX_WORKERS || String(def), 10) || def));
}

// ---- the in-page episode ----------------------------------------------------
// Everything below runs INSIDE the page so the control loop costs no round
// trips: at 2600 steps a per-tick page.evaluate() would dominate the runtime
// and add its own jitter to the measurement.
function episodeInPage({ sliderId, tuningKey, notch, aggr, steps }) {
  const A = window.__apex;

  // 1. Set the slider through the real DOM control, then read back what the
  //    physics actually got. Reporting the resolved value (not the notch) is
  //    what makes a recentred mapping comparable to the old one.
  if (sliderId) {
    const el = document.getElementById(sliderId);
    if (!el) return { error: "no such slider: " + sliderId };
    el.value = String(notch);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const tuning = A.tuning();

  // 2. THE TARGET SPEED PROFILE — a grip limit, not a speed literal.
  //    v_corner = sqrt(mu / |k|) at every station, then a backward pass so the
  //    car is already slow enough by the time it arrives. mu is in m/s^2, so
  //    this whole profile is pace-invariant: at half pace the car simply cannot
  //    reach the corner limits on the straights, which is exactly what "the
  //    slider changes what a speed MEANS on the ground" implies.
  const N = 480;
  const prof = A.trackProfile(N);
  if (!prof || !prof.length) return { error: "no track profile" };
  const total = A.world().track.lengthM;
  const ds = total / prof.length;
  // LAT_MAX (22) and BRAKE (22) are the shipped force constants. They are POLICY
  // constants here — a fixed yardstick, identical for every notch — not a
  // reimplementation of the car. playerGrip is folded in because it is the one
  // grip term the sliders can't touch, so leaving it out would make the policy
  // uniformly timid rather than uniformly honest.
  const mu = 22 * (tuning.playerGrip || 1) * aggr;
  const brake = 22 * aggr;
  const vt = new Float64Array(prof.length);
  for (let i = 0; i < prof.length; i++) {
    const k = Math.abs(prof[i].k);
    vt[i] = k > 1e-5 ? Math.sqrt(mu / k) : 1e4;
  }
  // Backward pass, twice around, so the braking zone before a corner converges
  // across the start/finish wrap as well as within the lap.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = prof.length - 1; i >= 0; i--) {
      const nx = (i + 1) % prof.length;
      const reach = Math.sqrt(vt[nx] * vt[nx] + 2 * brake * ds);
      if (reach < vt[i]) vt[i] = reach;
    }
  }
  const targetAt = (frac) => {
    let i = Math.floor(((frac % 1) + 1) % 1 * prof.length);
    if (!(i >= 0 && i < prof.length)) i = 0;
    return vt[i];
  };

  // 3. Drive. The steering is honest road geometry only — cancel the heading
  //    error against the tangent and hold roughly the centreline. No prescribed
  //    racing line, so the DRIVING HELP / RACING LINE assists are measured
  //    rather than duplicated.
  A.headless(true);
  A.reset(0.02, 25, 0, 4242);

  let excursions = 0, offSteps = 0, steppedT = 0;
  let slipSum = 0, slipPeak = 0, latPeak = 0, samples = 0;
  let wasOff = false, prevHead = null, lapTime = null, completed = false;
  const DT = 1 / 60, SUB = 4;

  let o = A.obs();
  const startLap = o ? o.lap : 0;
  for (let i = 0; i < steps; i++) {
    const w = A.world({ detail: "drive" });
    const he = w.ego.headingErrDeg || 0;
    const lat = w.ego.lateralM || 0;
    // + steer = right; + headingErrDeg = nose points right, so subtract it;
    // + lateralM = car is right of centre, so subtract.
    const steer = Math.max(-1, Math.min(1, -he / 12 - lat / 14));
    const sp = o.speed || 0;
    const tgt = targetAt((o.prog % total) / total);
    const braking = sp > tgt * 1.02 && sp > 3;
    o = A.act({ steer, throttle: !braking && sp < tgt, brake: braking }, DT, SUB);
    if (!o) break;
    steppedT += DT * SUB;

    // metrics
    const off = !!o.offT;
    if (off && !wasOff) excursions++;
    if (off) offSteps++;
    wasOff = off;
    const slip = Math.abs(o.slipDeg || 0);
    slipSum += slip; samples++;
    if (slip > slipPeak) slipPeak = slip;
    if (prevHead != null) {
      // lateral accel ~ v * yawRate, and yawRate is the heading delta over the
      // interval. Wrapped the short way — a lap's worth of heading change in one
      // step would otherwise read as an enormous g.
      let dh = o.head - prevHead;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      const g = Math.abs(dh / (DT * SUB)) * Math.abs(o.speed || 0) / 9.81;
      if (g > latPeak && g < 12) latPeak = g;   // 12 g = a teleport/rescue artefact
    }
    prevHead = o.head;

    if (o.lap > startLap && lapTime == null) { lapTime = steppedT; completed = true; break; }
    const t = A.terminal();
    if (t && t.done) break;
  }
  A.headless(false);
  A.clearInput();

  return {
    notch,
    value: tuningKey ? +(tuning[tuningKey] ?? 0).toFixed(4) : null,
    completed,
    lapTime: lapTime == null ? null : +lapTime.toFixed(2),
    distM: Math.round(o ? o.prog : 0),
    excursions,
    offSec: +(offSteps * DT * SUB).toFixed(2),
    slipMean: +(samples ? slipSum / samples : 0).toFixed(2),
    slipPeak: +slipPeak.toFixed(2),
    latPeak: +latPeak.toFixed(2),
  };
}

// ---- driver ----------------------------------------------------------------
async function bootWorker(baseUrl) {
  const browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
  });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 20000 });
  return { browser, page };
}

async function runTrack(page, trackId, jobs, onRow) {
  await page.evaluate((t) => window.__apex.race(t), trackId);
  await page.waitForFunction((t) => window.__apex.info().track === t, trackId, { timeout: 30000 });
  await sleep(1600);   // mesh build settle
  for (const job of jobs) {
    const row = await page.evaluate(
      ([fn, arg]) => new Function("return (" + fn + ")")()(arg),
      [episodeInPage.toString(), { ...job, aggr: AGGR, steps: STEPS }],
    );
    onRow(trackId, job, row);
  }
}

function fmtTable(slider, rows) {
  const head = "| notch | value | done | lap s | dist m | offs | off s | slip avg | slip pk | lat g |";
  const rule = "|---|---|---|---|---|---|---|---|---|---|";
  const body = rows.map((r) =>
    `| ${r.notch} | ${r.value ?? "-"} | ${r.completed ? "y" : "n"} | ${r.lapTime ?? "-"} | ` +
    `${r.distM} | ${r.excursions} | ${r.offSec} | ${r.slipMean} | ${r.slipPeak} | ${r.latPeak} |`);
  return [`\n### ${slider.label}  (#${slider.id})`, head, rule, ...body].join("\n");
}

async function main() {
  const srv = await startStaticServer(ROOT);
  const base = `http://127.0.0.1:${srv.port}/`;
  const results = {};
  try {
    const pool = [];
    const n = Math.min(workers(), TRACKS.length);
    for (let i = 0; i < n; i++) pool.push(await bootWorker(base));

    // One worker per circuit, each sweeping every slider x notch on it.
    const jobs = [];
    for (const s of SWEEP) for (const notch of notchesFor(s)) jobs.push({ sliderId: s.id, tuningKey: s.key, notch, label: s.label });

    const queue = TRACKS.slice();
    await Promise.all(pool.map(async (w) => {
      for (;;) {
        const t = queue.shift();
        if (!t) break;
        await runTrack(w.page, t, jobs, (trackId, job, row) => {
          (results[job.sliderId] ||= {});
          (results[job.sliderId][trackId] ||= []).push(row);
          const tag = `${trackId} ${job.sliderId}=${job.notch}`;
          console.log(`${tag.padEnd(28)} ${row.error ? "ERROR " + row.error
            : `${row.completed ? "lap " + row.lapTime + "s" : "DNF " + row.distM + "m"}` +
              `  offs=${row.excursions} off=${row.offSec}s slip=${row.slipMean}/${row.slipPeak} latG=${row.latPeak}`}`);
        });
      }
    }));

    // Summary: average each metric across circuits so one hard corner on one
    // track cannot decide a default.
    console.log("\n\n========== SUMMARY (mean across circuits) ==========");
    console.log(`policy aggression ${AGGR}, ${STEPS} steps, circuits: ${TRACKS.join(", ")}`);
    for (const s of SWEEP) {
      const per = results[s.id] || {};
      const byNotch = new Map();
      for (const t of Object.keys(per)) {
        for (const r of per[t]) {
          const acc = byNotch.get(r.notch) || { notch: r.notch, value: r.value, n: 0,
            completed: 0, lapTime: 0, laps: 0, distM: 0, excursions: 0, offSec: 0,
            slipMean: 0, slipPeak: 0, latPeak: 0 };
          acc.n++;
          acc.completed += r.completed ? 1 : 0;
          if (r.lapTime != null) { acc.lapTime += r.lapTime; acc.laps++; }
          acc.distM += r.distM; acc.excursions += r.excursions; acc.offSec += r.offSec;
          acc.slipMean += r.slipMean; acc.slipPeak = Math.max(acc.slipPeak, r.slipPeak);
          acc.latPeak = Math.max(acc.latPeak, r.latPeak);
          byNotch.set(r.notch, acc);
        }
      }
      const rows = [...byNotch.values()].sort((a, b) => a.notch - b.notch).map((a) => ({
        notch: a.notch, value: a.value,
        completed: a.completed === a.n,
        lapTime: a.laps ? +(a.lapTime / a.laps).toFixed(2) : null,
        distM: Math.round(a.distM / a.n),
        excursions: +(a.excursions / a.n).toFixed(1),
        offSec: +(a.offSec / a.n).toFixed(2),
        slipMean: +(a.slipMean / a.n).toFixed(2),
        slipPeak: a.slipPeak, latPeak: a.latPeak,
      }));
      console.log(fmtTable(s, rows));
    }
    if (JSON_OUT) {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(JSON_OUT), { recursive: true });
      writeFileSync(JSON_OUT, JSON.stringify({ aggr: AGGR, steps: STEPS, tracks: TRACKS, results }, null, 2));
      console.log(`\nwrote ${JSON_OUT}`);
    }
  } finally {
    await shutdown();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
