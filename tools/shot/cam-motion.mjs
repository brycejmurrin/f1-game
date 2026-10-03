#!/usr/bin/env node
// cam-motion.mjs — does each camera MOVE differently, or did they collapse
// back into one dolly? A still frame cannot answer that. This drives every
// mode through speed, a turn, a brake, and a slide, on the same live path
// the race uses (CamFeel.drive), and checks the signature of each one.
//
//   node tools/shot/cam-motion.mjs            # table, exit 1 on a miss
//   node tools/shot/cam-motion.mjs --svg out.svg
//
// A parked solve (no dt) is not in here on purpose: that path must not move,
// and camera-feel.test.mjs already pins it. This file is the moving one.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DT = 1 / 60;
const HOLD = 180; // 3s, long enough for the slow crane to finish arriving
const BASE = { eye: [0, 2, -6], tgt: [0, 1, 4], fov: 50 };

function loadFeel() {
  const ctx = {
    console, Math, Object, Array, isFinite,
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) },
    GameStore: { store: { get(k, d) { return d; }, set() { return true; }, raw() { return null; }, rawSet() { return true; } } },
    Log: { info() {} },
  };
  const src = ["drive-chase.js", "drive-broadcast.js", "drive-onboard.js", "feel.js"]
    .map((f) => fs.readFileSync(path.join(ROOT, "js/camera", f), "utf8")).join("\n");
  vm.runInNewContext(src + "\nthis.CamFeel = CamFeel;", ctx);
  return ctx.CamFeel;
}

function metrics(frame) {
  return {
    back: BASE.eye[2] - frame.eye[2],
    lift: frame.eye[1] - BASE.eye[1],
    lat: frame.eye[0] - BASE.eye[0],
    fov: frame.fov - BASE.fov,
    aim: BASE.tgt[1] - frame.tgt[1],
    eye: frame.eye,
  };
}

function hold(CamFeel, mode, spec, n) {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const eye = BASE.eye.slice();
    const tgt = BASE.tgt.slice();
    const fov = CamFeel.drive(mode, eye, tgt, BASE.fov, {
      dt: DT,
      att: { yawRateCur: spec.yaw, baPitch: spec.brake },
      slipLat: spec.slip,
    }, spec.sp);
    frames.push(metrics({ eye, tgt, fov }));
  }
  return frames;
}

function at90(frames, key) {
  const end = Math.abs(frames[frames.length - 1][key]);
  if (end < 0.05) return 0;
  const goal = end * 0.9;
  for (let i = 0; i < frames.length; i++) if (Math.abs(frames[i][key]) >= goal) return i;
  return frames.length;
}

/** Run the four holds for every mode. Returns { ok, rows, failures, series }. */
export function checkCamMotion() {
  const CamFeel = loadFeel();
  const modes = [
    "chase", "far", "drift", "low", "reverse",
    "heli", "side", "cinematic", "overhead", "drone", "rival", "pitwall", "trackside",
    "cockpit", "hood", "visor", "tcam", "rear",
  ];
  const rows = [];
  const series = {};
  for (const mode of modes) {
    CamFeel.resetFollow();
    // First live sample snaps. Prime at rest so the holds that follow have to
    // ease in, which is what makes a crane slower than a drift cam.
    CamFeel.drive(mode, [0, 0, 0], [0, 0, 1], BASE.fov, { dt: DT, att: {}, slipLat: 0 }, 0);
    const speed = hold(CamFeel, mode, { sp: 1, yaw: 0, brake: 0, slip: 0 }, HOLD);
    const yaw = hold(CamFeel, mode, { sp: 1, yaw: 1.1, brake: 0, slip: 0 }, HOLD);
    const brake = hold(CamFeel, mode, { sp: 1, yaw: 0, brake: 0.025, slip: 0 }, HOLD);
    const slip = hold(CamFeel, mode, { sp: 1, yaw: 0, brake: 0, slip: 6 }, HOLD);
    const s = speed[speed.length - 1];
    const y = yaw[yaw.length - 1];
    const b = brake[brake.length - 1];
    const sl = slip[slip.length - 1];
    series[mode] = speed;
    rows.push({
      mode, s, y, b, sl,
      rise: at90(speed, Math.abs(s.lift) >= Math.abs(s.back) ? "lift" : "back"),
    });
  }
  const by = Object.fromEntries(rows.map((r) => [r.mode, r]));
  const failures = [];
  const must = (cond, msg) => { if (!cond) failures.push(msg); };
  const eyeStill = (m, label) => {
    const r = by[m];
    for (const [name, p] of [["speed", r.s], ["yaw", r.y], ["brake", r.b]]) {
      must(Math.abs(p.back) < 0.02 && Math.abs(p.lift) < 0.02 && Math.abs(p.lat) < 0.02, `${m} eye moved on ${name} (${label})`);
    }
  };

  // Chase family: different jobs, not one dolly.
  must(by.far.s.back > by.chase.s.back + 0.8, "far should pull back further than chase");
  must(by.far.s.lift > by.chase.s.lift + 0.3, "far should rise more than chase");
  must(by.drift.s.back < by.chase.s.back, "drift stays closer than chase at speed");
  must(by.low.s.lift < 0.2, "low cam stays on the road");
  must(by.chase.b.back < by.chase.s.back - 0.8, "chase tucks in under braking");
  must(by.low.b.lift < 0, "low cam drops under braking");
  must(by.reverse.b.back < by.reverse.s.back - 0.4, "reverse closes the gap under braking");
  must(Math.abs(by.chase.y.lat) > 2, "chase swings outside a turn");
  must(Math.abs(by.drift.sl.lat) > Math.abs(by.chase.sl.lat) + 2, "drift hangs on the slide more than chase");

  // Broadcast: heli is not overhead is not a fixed wall.
  must(by.heli.s.lift > by.chase.s.lift + 0.6, "heli climbs more than chase");
  must(by.drone.s.back > by.heli.s.back, "drone pulls back further than heli");
  must(by.overhead.s.lift > by.heli.s.lift, "overhead rises more than heli");
  must(Math.abs(by.overhead.y.lat) < 0.05, "overhead must not slide off the car in a turn");
  must(Math.abs(by.heli.y.lat) > Math.abs(by.chase.y.lat), "heli swings wider than chase");
  must(Math.abs(by.heli.b.back - by.heli.s.back) < 0.25, "heli does not dive on the brakes");
  must(by.side.s.back < -0.8, "TV side runs ahead instead of chasing");
  must(by.cinematic.rise > by.drift.rise * 2, "the crane arrives slower than the drift cam");
  eyeStill("trackside", "fixed corner camera");
  must(by.trackside.s.fov > 2, "trackside opens the lens with speed");
  eyeStill("pitwall", "wall camera");
  must(by.pitwall.b.aim > 0.1, "pit wall dips its aim under braking");

  // Onboard: bolted down. The lens does the work.
  eyeStill("cockpit", "bolted");
  eyeStill("visor", "bolted");
  eyeStill("rear", "bolted");
  must(by.cockpit.s.fov > by.visor.s.fov, "visor breathes less than the cockpit");
  must(by.cockpit.b.fov > by.cockpit.s.fov, "cockpit lens opens further on the brakes");
  must(by.hood.b.lift < -0.03, "hood dips a few centimetres on the brakes");
  must(Math.abs(by.hood.b.back) < 0.02, "hood does not dolly");
  must(by.rear.b.fov > by.rear.s.fov + 2, "rear lens opens when a car is catching you");
  must(by.tcam.s.lift > 0.04 && by.tcam.s.lift < 0.08, "t-cam lift stays inside a few centimetres");

  return { ok: failures.length === 0, rows, failures, series };
}

function table(rows) {
  const line = (r) => [
    r.mode.padEnd(10),
    r.s.back.toFixed(2).padStart(6),
    r.s.lift.toFixed(2).padStart(6),
    Math.abs(r.y.lat).toFixed(2).padStart(6),
    r.b.back.toFixed(2).padStart(6),
    Math.abs(r.sl.lat).toFixed(2).padStart(6),
    String(r.rise).padStart(5),
  ].join("  ");
  return ["mode        back   lift    yaw  brake   slip  rise", ...rows.map(line)].join("\n");
}

function svg(series) {
  const shown = ["chase", "far", "drift", "heli", "overhead", "side", "cinematic", "low"];
  const colors = ["#e85d04", "#9a3412", "#ca8a04", "#1d4ed8", "#0f766e", "#7c3aed", "#64748b", "#16a34a"];
  const W = 960, H = 540, pad = 48;
  const n = HOLD;
  const ys = [];
  for (const m of shown) for (const f of series[m]) ys.push(f.back, f.lift);
  const lo = Math.min(-1, ...ys), hi = Math.max(1, ...ys);
  const X = (i) => pad + (i / (n - 1)) * (W - pad * 2);
  const Y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2);
  let d = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  d += `<rect width="${W}" height="${H}" fill="#0e1116"/>`;
  d += `<text x="${pad}" y="28" fill="#e7e9ee" font-family="ui-sans-serif,sans-serif" font-size="16">Camera motion — metres of pull-back (solid) and lift (dashed) as speed arrives</text>`;
  shown.forEach((m, i) => {
    const back = series[m].map((f, k) => `${k ? "L" : "M"}${X(k).toFixed(1)},${Y(f.back).toFixed(1)}`).join("");
    const lift = series[m].map((f, k) => `${k ? "L" : "M"}${X(k).toFixed(1)},${Y(f.lift).toFixed(1)}`).join("");
    d += `<path d="${back}" fill="none" stroke="${colors[i]}" stroke-width="2"/>`;
    d += `<path d="${lift}" fill="none" stroke="${colors[i]}" stroke-width="1.25" stroke-dasharray="4 3"/>`;
    d += `<text x="${pad + i * 112}" y="${H - 16}" fill="${colors[i]}" font-family="ui-sans-serif,sans-serif" font-size="13">${m}</text>`;
  });
  d += `</svg>`;
  return d;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = checkCamMotion();
  console.log(table(r.rows));
  const svgArg = process.argv.indexOf("--svg");
  if (svgArg >= 0 && process.argv[svgArg + 1]) {
    fs.writeFileSync(process.argv[svgArg + 1], svg(r.series));
    console.log("svg " + process.argv[svgArg + 1]);
  }
  if (!r.ok) {
    console.error("\n" + r.failures.join("\n"));
    process.exit(1);
  }
  console.log("\n" + r.rows.length + " cameras, each with its own motion");
}
