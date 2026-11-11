/* Apex 26 — chase-rig ride height: one smoothed centreline height and grade, plus the C1 ground-floor blend. GameCams.vantage calls these; the pose stays in vantage.js. */
const VantageRide = (function () {
  "use strict";

  // How the chase rigs decide their vertical framing. Two independent point
  // samples of the centreline (eye `back` m behind, target at the car) would make
  // the rig's pitch a finite DIFFERENCE of the elevation profile over ~12 m — the
  // one operator that AMPLIFIES short wavelengths, and this profile has
  // them on purpose: on top of the authored cosine bumps, buildCenterline adds a
  // "fine surface undulation" of three harmonics at 30-110 m wavelengths
  // (js/track/tracks.js) so the road isn't mathematically flat between corners.
  // The car is meant to ride that. The camera differentiating it is not.
  //
  // On flat road that difference is an invisible constant; on a hill it is not:
  // MEASURED on Monaco's climb out of Sainte Dévote (16 % over the rig's own
  // 5.8 m) two-sample pitch swung ±0.93° in the 10-60 m band — roughly 1-2 Hz at
  // racing speed, reversing every 17 m (the "camera bobs going up the incline").
  //
  // So the rig is built from ONE smoothed height and ONE smoothed gradient rather
  // than from two raw samples:
  //
  //     eyeY = rideY(s) - back * grade + eyeUp
  //
  // The pitch depends only on `grade`, so nothing differentiates the ripple. On
  // flat road and on ANY constant slope this equals the two-sample framing to the
  // millimetre (a Hann average of a straight line is the line); where the profile
  // BENDS it stays within 0.28 m of eye height and 1.0° of pitch on every circuit
  // measured, removes 78-90 % of the pitch bob band (monaco/spa/redbull/suzuka),
  // and GAINS ground-clamp margin (Spa's worst case 0.04 m → 0.15 m).
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
  // it matches a linear blend anywhere the nodes already lie on a line.
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

  return { crY, softFloor, centreY, rideY, rideGrade };
})();
Object.freeze(VantageRide);
