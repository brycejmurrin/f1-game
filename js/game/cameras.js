/* Apex 26 — the camera-vantage solver for js/game.js: all per-mode framing
   (cockpit/hood/tcam/rear, chase/far/drift, heli/side/cinematic/low/overhead/
   reverse) as a pure function of (track, mode, position, speed). Shared by the
   live camera in render(), snapGameCam() and __apex.previewCam(), so a framing
   change lands in all three. Consumes Tracks (sampling) only; the game's VMAX
   pace constant is injected once via GameCams.init({vmax}).
   Must load BEFORE js/game.js (see index.html). */
const GameCams = (function () {
  "use strict";

let VMAX = 72;              // injected at boot (GameCams.init) — speed normaliser
function init(opts) { if (opts && opts.vmax) VMAX = opts.vmax; }

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Scratch samples reused every call (no per-frame allocation).
const cvA = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const cvB = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };

// Cockpit eye offsets from the car origin (fwd along tangent, up in metres).
// Shared by vantage() and the camera-anchored cockpit-rig draw in render() —
// the rig origin is derived by SUBTRACTING these from the live camEye, so the
// two must stay identical or the driver's eye drifts out of the cockpit.
const COCKPIT_EYE_FWD = 0.32, COCKPIT_EYE_UP = 0.99;

// vantage(track, mode, s, x, spd, now, extra) → { eye, tgt, fov }
// extra — { bankDy (banking lift), deploy (ERS FOV kick), slipLat (lateral
// slip m/s, for the drift cam) } — all optional and treated as 0 when absent.
function vantage(track, mode, s, x, spd, now, extra) {
  extra = extra || {};
  const wrapS = (v) => { const L = track.total; v %= L; return v < 0 ? v + L : v; };
  const bankDy = extra.bankDy || 0;
  const dep = extra.deploy ? 1 : 0;
  const spN = clamp(spd / VMAX, 0, 1);
  Tracks.sample(track, wrapS(s), cvA);
  const p = [cvA.p[0] + cvA.r[0] * x, cvA.p[1] + bankDy, cvA.p[2] + cvA.r[2] * x];
  const t = cvA.t, r = cvA.r;
  // Curved look-ahead: aim at the actual centreline `d` m up the road — it bends
  // with the corner — instead of a straight tangent extrapolation, so the chase
  // and onboard cams look INTO the bend rather than out the side of it. `lat`
  // keeps a fraction of the car's offset so the aim still leads where it's headed.
  const aheadPt = (d, h, lat) => {
    Tracks.sample(track, wrapS(s + d), cvB);
    const lx = lat || 0;
    return [cvB.p[0] + cvB.r[0] * lx, cvB.p[1] + (h || 0), cvB.p[2] + cvB.r[2] * lx];
  };
  // Curvature of the bend we're approaching (speed-scaled look-ahead) — drives the
  // broadcast cams to the OUTSIDE of the corner so they shoot across the apex.
  const kA = Tracks.curvature(track, wrapS(s + lerp(15, 45, spN)));
  // Street-circuit camera corridor: city tracks run a continuous building wall a
  // few metres past the barriers, and the wide broadcast offsets (15-25 m) put
  // the eye INSIDE the towers — the whole view fills with a glowing facade
  // interior. The verge strip just outside the barriers is no better: it's where
  // the trees and lamp masts stand, so a camera there stares into foliage.
  // Instead, on street tracks the broadcast cams stay over the ROAD EDGE itself
  // (furniture is never on the tarmac) and trade the lost width for extra
  // height — a crane-over-the-circuit shot. Open circuits keep the full framing.
  const corr = track.def && track.def.street ? Math.max(cvA.hw - 1.0, 4) : Infinity;
  let eye, tgt, fov;
  if (mode === "cockpit" || mode === "hood") {
    // COCKPIT: at the DRIVER's eye — low + at the seat = the authentic "barely
    // see over the nose" F1 sensation. HOOD: on the chassis spine just ahead of
    // the cockpit so the nose and front wing read at the bottom of the frame.
    // Values live in COCKPIT_EYE_FWD/UP — shared with the camera-anchored
    // cockpit-rig draw, which derives the rig origin from the live camEye
    // minus these offsets.
    const eyeFwd = mode === "cockpit" ? COCKPIT_EYE_FWD : 0.55;
    const eyeUp  = mode === "cockpit" ? COCKPIT_EYE_UP : 0.95;
    eye = [p[0] + t[0] * eyeFwd, p[1] + eyeUp, p[2] + t[2] * eyeFwd];
    if (mode === "cockpit") {
      // Face straight FORWARD down the car's own heading (the tangent at the
      // car, not the curved centreline ahead) — the driver looks where the
      // NOSE points, so the view doesn't swing toward the apex on corner
      // entry. A tiny fraction of the curved look-ahead is kept so it still
      // gently leads into a bend rather than staring rigidly at a fixed point.
      // Follow the road's gradient: aim 30 m along the FULL 3D tangent — t[1] is
      // the slope (+uphill / −downhill), so the look point rises on a climb and
      // drops on a descent; the cockpit pitches with the road like a camera
      // bolted to the chassis. Flat road (t[1]=0) is unchanged.
      const straight = [p[0] + t[0] * 30, p[1] + eyeUp - 0.15 + t[1] * 30, p[2] + t[2] * 30];
      const lead = aheadPt(30, eyeUp - 0.15, x * 0.4);
      tgt = [straight[0] * 0.85 + lead[0] * 0.15,
             straight[1] * 0.85 + lead[1] * 0.15,
             straight[2] * 0.85 + lead[2] * 0.15];
    } else {
      tgt = aheadPt(30, eyeUp + 1.2, x * 0.6);
    }
    fov = lerp(64, 78, spN) + dep * 3;               // wider = faster feel
  } else if (mode === "overhead") {
    eye = [p[0] - t[0] * 9, p[1] + 42, p[2] - t[2] * 9];
    tgt = [p[0] + t[0] * 12, p[1], p[2] + t[2] * 12];
    fov = 46;
  } else if (mode === "heli") {
    // Broadcast helicopter — corner-aware: hovers on the OUTSIDE of the
    // upcoming bend so it looks across the apex.
    Tracks.sample(track, wrapS(s - 26), cvB);
    const sgn = kA > 0.001 ? -1 : kA < -0.001 ? 1 : 1;
    const hl = Math.min(18, corr);              // stay inside the street canyon
    eye = [cvB.p[0] + cvB.r[0] * hl * sgn, cvB.p[1] + 21 + (18 - hl) * 0.6 + bankDy, cvB.p[2] + cvB.r[2] * hl * sgn];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = 36 + dep * 2;
  } else if (mode === "reverse") {
    eye = [p[0] + t[0] * 5.5, p[1] + 1.35, p[2] + t[2] * 5.5];
    tgt = [p[0] - t[0] * 26, p[1] + 0.9, p[2] - t[2] * 26];
    fov = lerp(60, 72, spN);
  } else if (mode === "side") {
    // TV trackside: sits on the OUTSIDE of the bend looking across the apex.
    const sgn = kA > 0.002 ? 1 : kA < -0.002 ? -1 : 1;
    const sl = Math.min(25, corr);              // stay inside the street canyon
    eye = [p[0] + r[0] * sgn * sl, p[1] + 5.5 + (25 - sl) * 0.30, p[2] + r[2] * sgn * sl];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = 44 + (25 - sl) * 0.5;                 // closer eye → widen so framing holds
  } else if (mode === "cinematic") {
    // Outside-of-corner cinematic that gently breathes its angle instead of doing
    // full disorienting loops. Auto-picks the outside of the bend; on a straight it
    // slowly drifts a three-quarter angle. Angle is measured around the car from
    // the track tangent, so the framing reads consistently corner to corner.
    const base = kA === 0 ? 0.6 : (kA > 0 ? -1 : 1) * 1.15;
    const a = base + Math.sin(now * 0.00022) * 0.5;
    // Cap the WHOLE orbit radius at the street-canyon corridor — since
    // |cos a|,|sin a| ≤ 1, capping od itself bounds BOTH axes by the corridor
    // (capping only the lateral component left the tangent-axis reach unbounded,
    // which could put the eye inside a building wall on tight street circuits).
    const od = Math.min(15, corr);
    const dir = [Math.cos(a) * t[0] + Math.sin(a) * r[0], 0, Math.cos(a) * t[2] + Math.sin(a) * r[2]];
    eye = [p[0] + dir[0] * od, p[1] + 6.5 + (15 - od) * 0.45, p[2] + dir[2] * od];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = lerp(50, 60, spN);
  } else if (mode === "low") {
    Tracks.sample(track, wrapS(s - 10), cvB);
    const cx = x * 0.3;
    eye = [cvB.p[0] + cvB.r[0] * cx, cvB.p[1] + 0.45 + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = [p[0], p[1] + 0.6, p[2]];
    fov = lerp(55, 68, spN);
  } else if (mode === "tcam") {
    // Broadcast T-cam: perched on the T-bar above/behind the driver, tilted
    // DOWN enough that the helmet, airbox and nose fill the lower frame — the
    // signature F1 onboard.
    eye = [p[0] - t[0] * 0.52, p[1] + 1.46, p[2] - t[2] * 0.52];
    tgt = aheadPt(20, 0.35, x * 0.5);
    fov = 46 + dep * 2;
  } else if (mode === "rear") {
    // Onboard rear-view: perched above the airbox looking back OVER the wing —
    // wing at the bottom of frame, the road and the chasing pack visible.
    eye = [p[0] - t[0] * 0.95, p[1] + 1.38, p[2] - t[2] * 0.95];
    tgt = [p[0] - t[0] * 26, p[1] + 0.7, p[2] - t[2] * 26];
    fov = lerp(58, 70, spN) + dep * 2;
  } else if (mode === "drift") {
    // Action chase that swings to the OUTSIDE of the slide so the car's flank faces
    // camera under oversteer, then settles directly behind once the car hooks up.
    const slipN = clamp((extra.slipLat || 0) / 8, -1, 1);
    Tracks.sample(track, wrapS(s - 6.2), cvB);
    const cx = x * 0.5 - slipN * 5.5;
    eye = [cvB.p[0] + cvB.r[0] * cx, cvB.p[1] + 2.4 + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = [p[0], p[1] + 0.75, p[2]];
    fov = lerp(55, 70, spN) + dep * 3;
  } else {
    // chase / far — anchored a FIXED arc-distance behind so the car stays a constant
    // readable size; the target leads into the curved road ahead.
    const far = mode === "far";
    const back  = far ? 10.5 : 5.8;
    const eyeUp = far ? 4.2 : 2.1;
    Tracks.sample(track, wrapS(s - back), cvB);
    const cx = x * 0.5;
    eye = [cvB.p[0] + cvB.r[0] * cx, cvB.p[1] + eyeUp + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = aheadPt(far ? 9 : 6, far ? 1.0 : 0.7, x * 0.4);
    fov = lerp(52, 66, spN) + (far ? 4 : 0) + dep * 3;
  }
  // ---- ground floor -------------------------------------------------------
  // The broadcast framings (heli, cinematic, roadside, low, drift) place the eye
  // by arc offset and lateral distance with no idea what the ground does out
  // there. On a circuit with real relief that puts the camera INSIDE a hillside
  // or under a banked verge, and once the eye is below the surface the world
  // renders from the inside: near faces cull as backfacing and you see straight
  // through the terrain. Zandvoort's banked corners are the worst case — the
  // outer edge alone stands 2.4 m above the centreline plane these offsets are
  // measured from.
  //
  // Clamp the eye to the ground beneath it plus a small clearance. The ground
  // is the same lateral profile the terrain ribbon is built from, plus the
  // corner's banking, so this agrees with what is actually drawn. Cockpit and
  // hood are exempt — they ride the car, and their eye is already on the
  // surface by construction.
  if (mode !== "cockpit" && mode !== "hood" && track.surface) {
    const n = track.n;
    const k = ((Math.round(s / track.total * n) % n) + n) % n;
    // lateral distance of the eye from this node's centreline
    const ex = eye[0] - track.px[k], ez = eye[2] - track.pz[k];
    const lat = ex * track.rx[k] + ez * track.rz[k];
    const beyond = Math.max(0, Math.abs(lat) - track.hw[k]);
    const bank = Tracks.banking ? Tracks.banking(track, s, lat) : null;
    const ground = track.surface.heightAt(k, beyond) + (bank ? bank.dy : 0);
    const MIN_CLEAR = 0.8;
    if (eye[1] < ground + MIN_CLEAR) eye[1] = ground + MIN_CLEAR;
  }
  return { eye, tgt, fov };
}

return { init, vantage, COCKPIT_EYE_FWD, COCKPIT_EYE_UP };
})();
