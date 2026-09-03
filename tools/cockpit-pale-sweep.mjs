// cockpit-pale-sweep — does anything in the COCKPIT view read as a blank pale
// @doc Does anything in the COCKPIT read as a blank pale slab? Ray-casts the real Car3D cockpit from the driver's eye.
// @skill debug-cameras / car-viewer
// slab? Ray-casts the real Car3D cockpit build from the driver's eye and
// reports every hit whose vertex colour is pale, bucketed by colour with its
// distance and screen angle. Offline (node:vm over the real source, no
// rasteriser, no browser), ~2 s, fully deterministic.
//
//   node tools/cockpit-pale-sweep.mjs [teamId ...]     (default: every team)
//
// WHY THIS EXISTS: a user reported "a little light grey box in front of the
// steering wheel". It was not a pale CONSTANT anywhere in the car — it was the
// livery ACCENT: ferrari's c2 is literally [1,1,1], so every cockpit trim
// element carrying the accent became a flat pale slab 0.8-2.9 m from the eye.
// Reading colours could not find that; casting rays at the built mesh could.
// Screenshots could not either — under a dusk tone-map a screen-space
// pale-pixel count returns zero both before AND after the fix.
// The guard built on this lives in tests/unit/cockpit-pale-surfaces.test.mjs.
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Pale = bright in EVERY channel with a modest spread, i.e. reads as a blank
// grey/white panel rather than as a coloured surface. A saturated accent
// (yellow [0.9,0.9,0.1], gold, cyan) is not pale however bright it is.
export const isPale = (c) =>
  Math.min(c[0], c[1], c[2]) > 0.45 &&
  (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])) < 0.35;

// The cockpit eye, car-local. Mirrors COCKPIT_EYE_UP / COCKPIT_EYE_FWD in
// js/camera/vantage.js — if those move, move this with them.
export const EYE = [0, 0.82, -0.20];

export function loadCar3D() {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String, Boolean, isFinite, isNaN };
  ctx.globalThis = ctx; vm.createContext(ctx);
  // liveries.js joins the load so callers can sweep the ACTUAL paint a player
  // races in. The first version of this loader stopped at teams.js, which is
  // why the guard built on it swept every team with `opts.livery` absent — and
  // therefore could not see nose/pod/halo/stripe/noseStripe at all.
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js", "js/car/liveries.js", "js/car/car3d.js"])
    vm.runInContext(readFileSync(f, "utf8"), ctx, { filename: f });
  return {
    Car3D: vm.runInContext("Car3D", ctx),
    Teams: vm.runInContext("typeof Teams !== 'undefined' ? Teams : null", ctx),
    Liveries: vm.runInContext("typeof Liveries !== 'undefined' ? Liveries : null", ctx),
    Parts: vm.runInContext("typeof Parts !== 'undefined' ? Parts : null", ctx),
  };
}

// PARTS AND LIVERY ARE NOT OPTIONAL. game.js's cockpitBodyMesh passes
// `parts: Parts.getVisualTiers(getTeamParts(team.id), team)` on every build, and
// a fitted car carries 612 more vertices than the bare one — engineCover alone
// gains 504 and lands 0.79 m from the eye. Sweeping without them measured a car
// the game never draws, so every pale surface those parts add was invisible to
// this tool AND to the guard built on it. `parts` may still be omitted for the
// legacy bare body; pass null to mean that deliberately.
//
// `livery` is the same hole one level up. loadCar3D was already widened to load
// liveries.js for it, but nothing ever passed one — so liv.stripe / liv.noseStripe
// / liv.nose / liv.pod / liv.halo were absent from every mesh this tool measured.
// The livery CREST STRIPE is the one that mattered: it ran from z 0.05, at the
// 0.30 m cockpit near plane, 1.5 m down the centre of the driver's view.
export function buildCockpit(Car3D, c1, c2, teamId, parts, livery) {
  return Car3D.build(c1, c2, { teamId, noWheels: true, noDriver: true, cockpit: true,
                               halo: true, parts: parts === undefined ? undefined : parts,
                               livery: livery || undefined });
}

// Nearest triangle along d, Moller-Trumbore. t is clamped to the 0.30 m cockpit
// near plane so geometry the projection already discards is not reported.
function nearestHit(m, d) {
  const P = m.pos, I = m.idx, COL = m.col;
  let best = null;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]; if (Math.abs(det) < 1e-9) continue;
    const f = 1 / det, s = [EYE[0] - P[a], EYE[1] - P[a + 1], EYE[2] - P[a + 2]];
    const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]); if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]); if (v < 0 || u + v > 1) continue;
    const t = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
    if (t > 0.30 && (!best || t < best.t)) best = { t, rgb: [COL[a], COL[a + 1], COL[a + 2]] };
  }
  return best;
}

// Cockpit FOV is 64..78 deg vertical (js/camera/vantage.js); 2.2 aspect is a
// phone in landscape, the widest shipped shape and so the worst case.
export function sweep(mesh, { vfov = 78, aspect = 2.2, step = 1.5 } = {}) {
  const buckets = new Map(); let rays = 0, pale = 0;
  const hfov = vfov * aspect;
  for (let py = -vfov / 2; py <= vfov / 2; py += step) {
    for (let yx = -hfov / 2; yx <= hfov / 2; yx += step) {
      const pr = py * Math.PI / 180, yr = yx * Math.PI / 180;
      const h = nearestHit(mesh, [Math.sin(yr) * Math.cos(pr), Math.sin(pr), Math.cos(yr) * Math.cos(pr)]);
      rays++;
      if (!h || !isPale(h.rgb)) continue;
      pale++;
      const key = h.rgb.map((v) => v.toFixed(2)).join(",");
      const e = buckets.get(key) || { n: 0, tMin: 9, tMax: 0, yaw: [9, -9], pitch: [9, -9] };
      e.n++; e.tMin = Math.min(e.tMin, h.t); e.tMax = Math.max(e.tMax, h.t);
      e.yaw[0] = Math.min(e.yaw[0], yx); e.yaw[1] = Math.max(e.yaw[1], yx);
      e.pitch[0] = Math.min(e.pitch[0], py); e.pitch[1] = Math.max(e.pitch[1], py);
      buckets.set(key, e);
    }
  }
  return { rays, pale, buckets };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { Car3D, Teams, Parts, Liveries } = loadCar3D();
  const visualTiers = (t) => (Parts && t ? Parts.getVisualTiers(Parts.DEFAULTS, t) : undefined);
  // The team's own default livery — the paint a player actually races in.
  const livFor = (t) => { if (!Liveries || !t) return undefined;
    const byTeam = (Liveries.BY_TEAM && Liveries.BY_TEAM[t.id]) || [];
    return byTeam[0] || (Liveries.UNIVERSAL && Liveries.UNIVERSAL[0]) || undefined; };
  const list = (Teams && (Teams.LIST || Teams.ALL || Teams.teams)) || [];
  const want = process.argv.slice(2);
  const teams = want.length ? want : list.map((t) => t.id);
  let bad = 0;
  for (const id of teams) {
    const t = list.find ? list.find((x) => x.id === id) : null;
    const c1 = (t && (t.color || t.c1)) || [0.78, 0.05, 0.06];
    const c2 = (t && (t.color2 || t.c2)) || [0.95, 0.85, 0.10];
    const r = sweep(buildCockpit(Car3D, c1, c2, id, visualTiers(t), livFor(t)));
    console.log(`${id.padEnd(12)} c2=[${c2.map((v) => v.toFixed(2))}] rays=${r.rays} pale=${r.pale}` +
      (r.pale ? "" : "  CLEAN"));
    for (const [rgb, e] of [...r.buckets].sort((a, b) => b[1].n - a[1].n))
      console.log(`  rgb=[${rgb}] hits=${e.n} t=${e.tMin.toFixed(2)}..${e.tMax.toFixed(2)}m ` +
        `yaw=${e.yaw[0].toFixed(0)}..${e.yaw[1].toFixed(0)} pitch=${e.pitch[0].toFixed(0)}..${e.pitch[1].toFixed(0)}`);
    if (r.pale) bad++;
  }
  process.exit(bad ? 1 : 0);
}
