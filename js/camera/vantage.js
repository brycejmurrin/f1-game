/* Apex 26 — the camera-vantage solver for js/game.js: all per-mode framing (cockpit/hood/tcam/rear, chase/far/drift, heli/side/cinematic/low/overhead/ reverse) as… */
const GameCams = (function () {
  "use strict";

let VMAX = 72;              // injected at boot (GameCams.init) — speed normaliser
function init(opts) {
  Log.info("game", "GameCams.init");
  if (opts && opts.vmax) VMAX = opts.vmax;
}

const clamp = M4.clamp, lerp = M4.lerp;       // shared scalar helpers (js/core/mat4.js)

// Scratch samples reused every call (no per-frame allocation).
const cvA = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const cvB = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _bankScr = { dy: 0, roll: 0 };   // pooled Tracks.banking out-param (ground clamp)

// Cockpit eye offsets from the car origin (fwd along tangent, up in metres).
// Shared by vantage() and the camera-anchored cockpit-rig draw in render() —
// the rig origin is derived by SUBTRACTING these from the live camEye, so the
// two must stay identical or the driver's eye drifts out of the cockpit.
// -0.20, not 0.32: the rig origin IS the car origin (game.js derives it as
// camEye − fwd·FWD − up·UP), so FWD is literally where the driver's head sits in
// CAR-LOCAL z — and the tub is built around z 0. At 0.32 the eye sat forward of
// the dash coaming (car3d.js builds it at z 0.60) with the survival-cell walls,
// the halo pillar and the mirrors all BEHIND the camera: measured on Monza, the
// "cockpit" view rendered no cockpit at all, just the nose from above, which is
// a hood cam by another name. -0.20 puts the head back between the tub shoulders
// where it belongs, with the coaming, halo and mirrors ahead of it in frame.
// UP is metres above the ROAD, and car3d.js builds the tub around it: dash
// coaming y 0.62, halo hoop 0.74-0.81, survival-cell walls topping out at 0.88.
// At 0.99 the eye floated ABOVE all of it (live value is 0.82) — above the halo, above the shoulders
// — which is why the "cockpit" rendered as a hovering hood cam with no car in
// frame however far back it was pulled. 0.72 seats the driver where the tub
// says the seat is: just over the coaming, inside the halo, between the walls.
// (Live values today: COCKPIT_EYE_FWD -0.20, COCKPIT_EYE_UP 0.82 — the prose
// above records why the pair moved, not the current numbers.)
// Eye height is set by how far the driver sits ABOVE THE DECK, not by taste:
// at 0.72 the monocoque crest (y 0.545 at z 1.05) was only 0.17 m below the
// sightline, so the car's own nose occupied 0.7% of the frame and an onboard
// looked like a floating dash. A real F1 eye sits ~0.30 m over the chassis top.
// 0.82 gives 0.27 m and the nose reads as a nose. Anything moved here must be
// re-checked with docs/OCCLUSION-PROBE.md — the wheel rig (game.js _rigT), the
// ckpt monocoque cap and the coaming are all positioned against this number.
const COCKPIT_EYE_FWD = -0.20, COCKPIT_EYE_UP = 0.82;

const CHASE_SIDE_FRAC = 0.3;
// CHASE g-response: the camera leans with longitudinal weight transfer even
// though it is bolted to nothing. Driven by the SMOOTHED body pitch
// (js/physics/body-attitude.js, spring ω=9, clamped ±0.024 rad ≈ 1.4°), NEVER raw
// accel — so it cannot reintroduce the fore/aft jitter the car-frame camera
// damping just removed. baPitch > 0 = nose-down = braking.
const CHASE_G_DOLLY = 14;    // m of nose-IN per rad of dive (≈0.34 m at full braking)
const CHASE_G_AIM   = 5;     // m the aim drops per rad of dive, so you watch the car dive

// How the chase rigs decide their vertical framing. They used to take it from
// two independent point samples of the centreline — the eye from the road
// `back` m behind, the target from the road at (or ahead of) the car — so the
// rig's pitch was a finite DIFFERENCE of the elevation profile over ~12 m. That
// is the one operator that AMPLIFIES short wavelengths, and this profile has
// them on purpose: on top of the authored cosine bumps, buildCenterline adds a
// "fine surface undulation" of three harmonics at 30-110 m wavelengths
// (js/track/tracks.js) so the road isn't mathematically flat between corners.
// The car is meant to ride that. The camera differentiating it is not.
//
// On flat road that difference is a constant nobody can see, which is why the
// bug only shows up on a hill. Put a real gradient under it and it stops being
// constant: MEASURED on Monaco's climb out of Sainte Dévote (16 % over the rig's
// own 5.8 m) the chase pitch swung ±0.93° in the 10-60 m band — roughly 1-2 Hz
// at racing speed, reversing every 17 m. That is the "camera bobs up and down
// going up the incline" report.
//
// So the rig is built from ONE smoothed height and ONE smoothed gradient rather
// than from two raw samples:
//
//     eyeY = rideY(s) - back * grade + eyeUp
//
// The pitch now depends only on `grade`, so nothing differentiates the ripple.
// On flat road (grade 0) and on ANY constant slope this reproduces the old
// framing to the millimetre — a Hann average of a straight line is the line, and
// -back*grade is exactly what the old sample `back` m behind returned. It can
// only differ where the profile BENDS, which is exactly where the bob was, and
// even there it stays within 0.28 m of eye height and 1.0° of pitch on every
// circuit measured. What it removes is 78-90 % of the pitch bob band
// (monaco/spa/redbull/suzuka), and because the eye no longer sits on individual
// ripple peaks it GAINS ground-clamp margin rather than spending it (Spa's worst
// case 0.04 m → 0.15 m).
//
// rideY is a 7-tap Hann average 60 m wide: a null at the 30 m harmonic (which
// carries nearly all the vertical acceleration, bob scaling as amplitude ÷
// wavelength²) and effectively transparent to real terrain — a 340 m cosine
// bump like Monaco's loses 7 cm at its crest. RIDE_GRADE is the half-baseline
// the slope is measured over; ±40 m is long enough to be steady and short
// enough that the camera pitches for the hill it is ON, not one it can't see.
// Nothing else changes: the car, the physics, the road mesh and every other
// camera mode still read the raw profile, so the undulation you feel through
// the car is untouched. It just stops steering the horizon.
//
// Offsets are metres of arc either side; weights are 0.5(1+cos(πd/30)). The two
// zero-weight end taps are dropped rather than summed for nothing.
const RIDE_OFF = [-22.5, -15, -7.5, 0, 7.5, 15, 22.5];
const RIDE_W = [0.1464, 0.5, 0.8536, 1, 0.8536, 0.5, 0.1464];
const RIDE_WSUM = 4.0;                    // == RIDE_W summed
const RIDE_SPAN = 60;                     // full window width, for the short-lap guard
const RIDE_GRADE = 40;                    // half-baseline the road slope is read over

// Centreline height alone at arc `s` — the height component of Tracks.sample
// without the tangent/right/half-width lerps this never looks at. Called 21x a
// frame in chase (three times through rideY), which is why it skips sample().
//
// CATMULL-ROM, not the lerp Tracks.sample uses. A linear blend between the ~4 m
// nodes is only C0: the height is continuous but its SLOPE jumps at every node
// boundary, so the eye's vertical VELOCITY steps ~11 times a second at racing
// speed. On flat road that is invisible (adjacent nodes are level, so there is
// no slope to jump) and at the shipped framing it is about a pixel — which is
// why it survived every earlier measurement. Pull the camera DOWN and IN with
// the CAMERA TUNER and both of those excuses evaporate: the eye-to-target
// baseline shortens, and the rig goes near-level so pitch is driven by exactly
// these small vertical differences instead of a healthy few degrees. MEASURED
// at HEIGHT -1.5 / DIST -3 on Beau Rivage: 11 pitch reversals in 2.6 s with a
// worst-to-rms acceleration ratio of 10.2, i.e. plainly discontinuous.
//
// Catmull-Rom is C1, so the velocity is continuous and no node rate survives at
// all. It still passes exactly through every node, and on collinear nodes (flat
// road, constant slope) it reproduces the straight line to floating-point — so
// this changes nothing anywhere the old curve was already smooth.
function crY(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
// max(v, floor) with a C1 handover across a band of `k` metres. Outside the band
// it IS the plain max; inside, a quadratic joins the two branches with matching
// slope at both ends (v = floor+k and v = floor-k), which is what a hard max
// cannot do. Only ever returns >= floor, so it never weakens the guarantee it
// implements.
function softFloor(v, floor, k) {
  const d = v - floor;
  if (d > k) return v;
  if (d < -k) return floor;
  const t = (d + k) / (2 * k);
  return floor + k * t * t;
}
function centreY(track, s) {
  const n = track.n, L = track.total, py = track.py;
  let v = s % L; if (v < 0) v += L;
  const fi = v / L * n;
  const i = Math.floor(fi) % n, f = fi - Math.floor(fi);
  const a = (i - 1 + n) % n, b = (i + 1) % n, c = (i + 2) % n;
  return crY(py[a], py[i], py[b], py[c], f);
}
function rideY(track, s) {
  if (!track.py || track.total < RIDE_SPAN * 2) return centreY(track, s);
  let acc = 0;
  for (let k = 0; k < RIDE_OFF.length; k++) acc += centreY(track, s + RIDE_OFF[k]) * RIDE_W[k];
  return acc / RIDE_WSUM;
}
function rideGrade(track, s) {
  if (!track.py || track.total < RIDE_GRADE * 4) return 0;
  return (rideY(track, s + RIDE_GRADE) - rideY(track, s - RIDE_GRADE)) / (2 * RIDE_GRADE);
}

// AN ONBOARD CAMERA IS BOLTED TO THE CHASSIS, so it inherits what the chassis
// does. js/physics/body-attitude.js already pitches, rolls and heaves the car BODY
// under braking, power and cornering — visibly, on the mesh — but the onboard
// eye was built purely from the road, so the one view where you sit IN the car
// was the one view that could not feel it: brake from 300 and the world stayed
// dead level while the car it is bolted to dived.
//
// These offsets are render-only and read state bodyattitude already published
// (baPitch/baRoll/baHeave, all small and clamped there). Applied ONLY to
// cockpit/hood — a broadcast camera is on a tripod and must stay level.
//
// KERB RUMBLE IS SPATIAL, not temporal: a rumble strip is a row of physical
// ribs, so the shake is driven off arc position `s`, not a clock. That makes it
// deterministic (no Date.now — the same rule bodyattitude.js keeps), and it
// scales itself with speed for free, because s advances faster when you do.
const KERB_RIB_M = 3.4;      // metres per rumble cycle as the view feels it
const KERB_AMP = 0.011;      // m of eye travel at full scaling — a shiver, not a bounce
function onboardAttitude(mode, eye, tgt, extra, s, spN) {
  const a = extra.att;
  if (!a) return;
  const heave = a.baHeave || 0, pitch = a.baPitch || 0;
  const kerb = a.onKerb ? Math.sin(s * (2 * Math.PI / KERB_RIB_M)) * KERB_AMP * spN : 0;
  eye[1] += heave + kerb;
  tgt[1] += heave + pitch * 24;
}

const _vantEye = [0, 0, 0], _vantTgt = [0, 0, 0];
const _vantOut = { eye: _vantEye, tgt: _vantTgt, fov: 60 };

function vantage(track, mode, s, x, spd, now, extra) {
  extra = extra || {};
  const wrapS = (v) => { const L = track.total; v %= L; return v < 0 ? v + L : v; };
  const bankDy = extra.bankDy || 0;
  const dep = extra.deploy ? 1 : 0;
  const spN = clamp(spd / VMAX, 0, 1);
  Tracks.sample(track, wrapS(s), cvA);
  // WHICH ELEVATION A CAMERA READS. Tracks.sample lerps py between the ~4 m
  // nodes, which is only C0 — the height is continuous but its slope jumps at
  // every node, so any eye built on it steps its vertical velocity ~11 times a
  // second on a gradient (see centreY). chase/far were moved onto the C1 curve
  // when that was diagnosed; every other world-facing mode was left on the raw
  // sample and MEASURED spiky at stock framing on Monaco's climb — drift 8.6,
  // heli 9.4, tcam/rear/cinematic/reverse 10.2 (worst vertical acceleration as a
  // multiple of its own rms; a smooth curve stays near 3).
  //
  // cockpit and hood deliberately keep the RAW sample. They are bolted to the
  // car, the car body is drawn from the raw profile, and an eye that disagreed
  // with the chassis by even a centimetre would float in the cockpit — matching
  // the car matters more there than smoothness, and riding the car's own bumps
  // is what an onboard camera is FOR.
  const onboard = mode === "cockpit" || mode === "hood";
  const elevY = (at) => (onboard ? null : centreY(track, at));
  const p = [cvA.p[0] + cvA.r[0] * x,
             (onboard ? cvA.p[1] : centreY(track, s)) + bankDy,
             cvA.p[2] + cvA.r[2] * x];
  const t = cvA.t, r = cvA.r;
  const aheadPt = (d, h, lat) => {
    Tracks.sample(track, wrapS(s + d), cvB);
    const lx = lat || 0;
    const ey = elevY(s + d);
    return [cvB.p[0] + cvB.r[0] * lx, (ey === null ? cvB.p[1] : ey) + (h || 0), cvB.p[2] + cvB.r[2] * lx];
  };
  // Curvature of the bend we're approaching (speed-scaled look-ahead) — drives the
  // broadcast cams to the OUTSIDE of the corner so they shoot across the apex.
  // ONLY those three read it, and Tracks.curvature is a real sample-and-difference,
  // so computing it unconditionally spent that every frame in chase, cockpit, hood,
  // tcam, rear, drift, low, overhead and reverse — i.e. in every mode anyone
  // actually races in — to throw the answer away.
  const kA = (mode === "heli" || mode === "side" || mode === "cinematic")
    ? Tracks.curvature(track, wrapS(s + lerp(15, 45, spN)))
    : 0;
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
    const eyeFwd = mode === "cockpit" ? COCKPIT_EYE_FWD : 0.55;
    const eyeUp  = mode === "cockpit" ? COCKPIT_EYE_UP : 0.95;
    if (extra.carPos) {
      // FREE-WORLD ONBOARD. These are bolted to the CAR, so they must sit at the
      // car and look down the CAR's nose. They used to be built from the road:
      // the eye was placed along the ROAD tangent from a road-frame point, and
      // the aim ran 30 m down the centreline — hood was 100 % curved look-ahead,
      // cockpit 85 % road tangent + 15 % curve. (The old cockpit comment claimed
      // it faced "the car's own heading"; `t` is the road tangent at the car, not
      // c.head, so it never did.) Driving straight through a bend swung the view
      // round the corner while the nose slid across the frame — the arc reaching
      // the driver through the most immersive camera in the game.
      // The road still supplies eye HEIGHT and the gradient the view pitches
      // with (t[1]) — surface, not line.
      const hx = Math.sin(extra.carHead || 0), hz = Math.cos(extra.carHead || 0);
      eye = [extra.carPos[0] + hx * eyeFwd, p[1] + eyeUp, extra.carPos[1] + hz * eyeFwd];
      const aimUp = mode === "cockpit" ? eyeUp - 0.15 : eyeUp + 1.2;
      // TURN CHASING (SETTINGS > COCKPIT, default OFF — js/camera/cockpit-opts.js).
      // At 0 the aim is the car's heading and NOTHING else, which is the state
      // AGENTS.md's "the arc must not reach the driver" rule asks for: no read of
      // curvature or the racing line reaches the player unless they switch it on.
      const tcL = mode === "cockpit" && typeof CockpitOpts !== "undefined"
        ? CockpitOpts.turnChaseLead() : 0;
      let aimX = extra.carPos[0] + hx * 30, aimZ = extra.carPos[1] + hz * 30;
      if (tcL > 0) {
        const lp = aheadPt(30, aimUp, x * 0.4);
        aimX = aimX * (1 - tcL) + lp[0] * tcL;
        aimZ = aimZ * (1 - tcL) + lp[2] * tcL;
      }
      tgt = [aimX, p[1] + aimUp + t[1] * 30, aimZ];
      fov = lerp(64, 78, spN) + dep * 3;
    } else {
      eye = [p[0] + t[0] * eyeFwd, p[1] + eyeUp, p[2] + t[2] * eyeFwd];
      if (mode === "cockpit") {
        const straight = [p[0] + t[0] * 30, p[1] + eyeUp - 0.15 + t[1] * 30, p[2] + t[2] * 30];
        const w = typeof CockpitOpts !== "undefined" ? CockpitOpts.turnChaseLead() : 0;
        const lead = w > 0 ? aheadPt(30, eyeUp - 0.15, x * 0.4) : straight;
        tgt = [straight[0] * (1 - w) + lead[0] * w,
               straight[1] * (1 - w) + lead[1] * w,
               straight[2] * (1 - w) + lead[2] * w];
      } else {
        tgt = aheadPt(30, eyeUp + 1.2, x * 0.6);
      }
      fov = lerp(64, 78, spN) + dep * 3;             // wider = faster feel
    }
  } else if (mode === "overhead") {
    eye = [p[0] - t[0] * 9, p[1] + 42, p[2] - t[2] * 9];
    tgt = [p[0] + t[0] * 12, p[1], p[2] + t[2] * 12];
    fov = 46;
  } else if (mode === "heli") {
    // Broadcast helicopter — corner-aware: hovers on the OUTSIDE of the
    // upcoming bend so it looks across the apex. +kA is a LEFT bend (measured —
    // agentview.js corner-table note) whose outside is +r; this read -1 for
    // kA>0 while the old "+k = right" comment lived, hovering on the INSIDE.
    Tracks.sample(track, wrapS(s - 26), cvB);
    const sgn = kA > 0.001 ? 1 : kA < -0.001 ? -1 : 1;
    const hl = Math.min(18, corr);              // stay inside the street canyon
    eye = [cvB.p[0] + cvB.r[0] * hl * sgn, centreY(track, s - 26) + 21 + (18 - hl) * 0.6 + bankDy, cvB.p[2] + cvB.r[2] * hl * sgn];
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
    // +kA = LEFT bend → outside is +r → positive angle (same fix as heli above).
    const base = kA === 0 ? 0.6 : (kA > 0 ? 1 : -1) * 1.15;
    const a = base + Math.sin(now * 0.00022) * 0.5;
    const od = Math.min(15, corr);
    const dir = [Math.cos(a) * t[0] + Math.sin(a) * r[0], 0, Math.cos(a) * t[2] + Math.sin(a) * r[2]];
    eye = [p[0] + dir[0] * od, p[1] + 6.5 + (15 - od) * 0.45, p[2] + dir[2] * od];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = lerp(50, 60, spN);
  } else if (mode === "low") {
    Tracks.sample(track, wrapS(s - 10), cvB);
    const cx = x * 0.3;
    eye = [cvB.p[0] + cvB.r[0] * cx, centreY(track, s - 10) + 0.45 + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = [p[0], p[1] + 0.6, p[2]];
    fov = lerp(55, 68, spN);
  } else if (mode === "tcam") {
    eye = [p[0] - t[0] * 0.52, p[1] + 1.46, p[2] - t[2] * 0.52];
    tgt = aheadPt(20, 0.35, x * 0.5);
    fov = 46 + dep * 2;
  } else if (mode === "rear") {
    eye = [p[0] - t[0] * 0.95, p[1] + 1.38, p[2] - t[2] * 0.95];
    tgt = [p[0] - t[0] * 26, p[1] + 0.7, p[2] - t[2] * 26];
    fov = lerp(58, 70, spN) + dep * 2;
  } else if (mode === "drift") {
    // Action chase that swings to the OUTSIDE of the slide so the car's flank faces
    // camera under oversteer, then settles directly behind once the car hooks up.
    const slipN = clamp((extra.slipLat || 0) / 8, -1, 1);
    Tracks.sample(track, wrapS(s - 6.2), cvB);
    const cx = x * 0.5 - slipN * 5.5;
    eye = [cvB.p[0] + cvB.r[0] * cx, centreY(track, s - 6.2) + 2.4 + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = [p[0], p[1] + 0.75, p[2]];
    fov = lerp(55, 70, spN) + dep * 3;
  } else {
    const far = mode === "far";
    const back  = far ? 10.5 : 5.8;
    const eyeUp = far ? 4.2 : 2.1;
    Tracks.sample(track, wrapS(s - back), cvB);
    const cx = x * 0.5;
    const lead = far ? 9 : 6;
    const tgtUp = far ? 1.0 : 0.7;
    const rideC = rideY(track, s), grade = rideGrade(track, s);
    const rideEye = rideC - back * grade;          // road under the eye, smoothed
    const rideTgtAhead = rideC + lead * grade;
    if (extra.carPos) {
      const hx = Math.sin(extra.carHead || 0), hz = Math.cos(extra.carHead || 0);
      const rx = hz, rz = -hx;
      const side = back * CHASE_SIDE_FRAC;
      eye = [extra.carPos[0] - hx * back + rx * side, rideEye + eyeUp + bankDy, extra.carPos[1] - hz * back + rz * side];
      tgt = [extra.carPos[0] + hx * lead, rideC + bankDy + tgtUp, extra.carPos[1] + hz * lead];
      // CORNER LEAD (CAMERA TUNER, opt-in, default 0). Blend the whole rig toward
      // the road-frame chase below — eye an arc-distance back along the ROAD, aim
      // at the curved centreline ahead — so the camera leads and swings INTO the
      // bend, the classic chase feel. This is the one place the arc is allowed to
      // reach the chase view, and only because the player asked for it on a slider:
      // it moves where the camera looks, never the car (px/pz/(s,x) are untouched).
      const lead2 = (typeof CamTune !== "undefined") ? clamp(CamTune.get(mode, "cornerLead") || 0, 0, 1) : 0;
      if (lead2 > 0) {
        const eyeR0 = cvB.p[0] + cvB.r[0] * cx, eyeR1 = rideEye + eyeUp + bankDy, eyeR2 = cvB.p[2] + cvB.r[2] * cx;
        const tgtR = aheadPt(lead, 0, x * 0.4);
        tgtR[1] = rideTgtAhead + tgtUp;
        eye = [lerp(eye[0], eyeR0, lead2), lerp(eye[1], eyeR1, lead2), lerp(eye[2], eyeR2, lead2)];
        tgt = [lerp(tgt[0], tgtR[0], lead2), lerp(tgt[1], tgtR[1], lead2), lerp(tgt[2], tgtR[2], lead2)];
      }
      const gP = (extra.att && extra.att.baPitch) || 0;
      eye[0] += hx * gP * CHASE_G_DOLLY; eye[2] += hz * gP * CHASE_G_DOLLY;   // +heading = toward the car
      tgt[1] -= gP * CHASE_G_AIM;
    } else {
      eye = [cvB.p[0] + cvB.r[0] * cx, rideEye + eyeUp + bankDy, cvB.p[2] + cvB.r[2] * cx];
      tgt = aheadPt(lead, 0, x * 0.4);   // XZ only; the height is the smoothed one
      tgt[1] = rideTgtAhead + tgtUp;
    }
    fov = lerp(57, 63, spN) + (far ? 4 : 0) + dep * 3;
  }
  // Per-mode HEIGHT/DISTANCE/SIDE/PITCH/YAW/FOV nudges from js/camera/offsets.js,
  // applied to the solved rig rather than baked into each branch — one place to
  // reason about, and every mode gets the same six knobs for free. A no-op (and
  // an early return inside apply()) until the player actually tunes something,
  // so an untuned install frames exactly as it did before this existed.
  // Deliberately BEFORE the ground clamp: a lowered eye must still be caught by
  // the terrain floor, or a −3 m HEIGHT would render the world from inside a hill.
  if (typeof CamTune !== "undefined") fov = CamTune.apply(mode, eye, tgt, fov);
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
    // INTERPOLATE THE FLOOR BETWEEN NODES. surface.heightAt() rounds its node
    // index and reads py at that node, so asking it once at Math.round(s) makes
    // the floor a STAIRCASE with one step per ~4 m node. That is invisible while
    // the eye rides clear of it — which it does at the shipped framing, by about
    // half a metre on Monaco — and it is why this went unnoticed. Drop the eye
    // into the clamp (the CAMERA TUNER's HEIGHT/DISTANCE do exactly that, which
    // is the whole point of applying them above this) and the eye inherits the
    // staircase: on a gradient each step is nodeSpacing x grade, MEASURED at
    // 0.45 m on Beau Rivage, snapping ~11 times a second at racing speed. It
    // vanishes when parked and on the flat (adjacent nodes are level there), so
    // it reads as a fast vertical judder that only happens while climbing.
    //
    // Sampling both neighbours and lerping makes the floor continuous, so a
    // lowered camera SLIDES along the terrain instead of stepping down it.
    // js/track/core/mesh.js banking() lerps for exactly this reason ("so cars and
    // cameras do not jump between the road mesh's ~4 m longitudinal nodes") —
    // this clamp simply never got the same treatment.
    const pos = (((s % track.total) + track.total) % track.total) / track.total * n;
    const k0 = Math.floor(pos) % n, kf = pos - Math.floor(pos);
    // kPrev, NOT kA: this function's outer scope declares kA as a CURVATURE
    // (1/m) ~200 lines up; reusing the name here for a node index was a
    // landmine for any future edit wanting curvature inside this block.
    const kPrev = (k0 - 1 + n) % n, k1 = (k0 + 1) % n, kB = (k0 + 2) % n;
    // Lateral offset of the eye, measured against the INTERPOLATED frame at s
    // (cvA still holds that sample) rather than one node's — same reason: a
    // per-node frame steps the lateral reading too.
    const ex = eye[0] - cvA.p[0], ez = eye[2] - cvA.p[2];
    const lat = ex * cvA.r[0] + ez * cvA.r[2];
    const beyond = Math.max(0, Math.abs(lat) - cvA.hw);
    const bank = Tracks.banking ? Tracks.banking(track, s, lat, _bankScr, true) : null;
    const ground = crY(track.surface.heightAt(kPrev, beyond), track.surface.heightAt(k0, beyond),
                       track.surface.heightAt(k1, beyond), track.surface.heightAt(kB, beyond), kf)
                 + (bank ? bank.dy : 0);
    // SOFT floor, not a hard max(). `eye = max(eye, floor)` is continuous but its
    // SLOPE jumps the instant the clamp takes over, so every engage/disengage is
    // a kink — and a camera the player has parked NEAR the floor crosses it over
    // and over, turning one threshold into a repeating judder. MEASURED on Spa
    // with HEIGHT -1.5 / DIST -3: a single crossing produced a vertical
    // acceleration 18.8x the local rms, while the same rig on the same road read
    // 2.3x untuned (it never reaches the floor). Easing over CLAMP_BLEND makes
    // the handover C1, so the eye settles onto the terrain instead of catching
    // on it. The eye still never ends up below the floor — the blend only ever
    // pushes it UP, so the "never render from inside a hill" guarantee holds.
    const MIN_CLEAR = 0.8, CLAMP_BLEND = 0.35, FLOOR_LEAD = 0.25;
    // Over the ROAD the floor reference is the SAME smoothed ride height the
    // chase rig frames from, not the raw profile. The raw floor undid the whole
    // RIDE HEIGHT design for any camera parked near it: a CAMERA TUNER height
    // below ~-1.3 m sits inside the knee on flat road, so the eye stopped
    // following the smoothed line and rode raw ripple crests through the clamp
    // — and on a climb the rig's -back*grade pressed it onto that raw floor
    // just above the car ("lowered the camera and it drops on every hill").
    // Floored on rideY instead, a clamped eye follows the C1 60 m-smoothed
    // line: ripple-free on the flat, and on a grade it tracks the CAR's
    // smoothed height (the clamp samples at the car's s), so the tuned framing
    // keeps a constant ~MIN_CLEAR above the car instead of sinking below it.
    // Safety is bounded in STRUCTURE, not by today's data: the smoothed
    // reference may sit at most FLOOR_LEAD below the raw ground, so the eye
    // is guaranteed ground + (MIN_CLEAR - FLOOR_LEAD) = 0.55 m of true
    // clearance even where the smoothed line leads a genuine drop (the -6 m
    // cliff torture case in tests/unit/camera-ride.test.mjs). On every real
    // circuit the bound is slack: MEASURED fleet-wide, raw never stands more
    // than 0.202 m above rideY over the road (suzuka worst), so the smooth
    // reference governs everywhere and the full 0.8 m holds in practice.
    // Off the road (beyond > 0: heli/roadside/cinematic) terrain is not
    // ripple, it is relief — the raw floor stays.
    let floorY = ground + MIN_CLEAR;
    if (beyond === 0) {
      const smoothG = rideY(track, s) + (bank ? bank.dy : 0);
      floorY = Math.max(smoothG, ground - FLOOR_LEAD) + MIN_CLEAR;
    }
    eye[1] = softFloor(eye[1], floorY, CLAMP_BLEND);
  }
  if (onboard || mode === "tcam") onboardAttitude(mode, eye, tgt, extra, s, spN);
  _vantEye[0] = eye[0]; _vantEye[1] = eye[1]; _vantEye[2] = eye[2];
  _vantTgt[0] = tgt[0]; _vantTgt[1] = tgt[1]; _vantTgt[2] = tgt[2];
  _vantOut.eye = _vantEye; _vantOut.tgt = _vantTgt; _vantOut.fov = fov;
  return _vantOut;
}

return { init, vantage, COCKPIT_EYE_FWD, COCKPIT_EYE_UP };
})();
