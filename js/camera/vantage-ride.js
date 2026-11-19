const VantageRide = (function () {
  "use strict";

  const RIDE_OFF = [-22.5, -15, -7.5, 0, 7.5, 15, 22.5];
  const RIDE_W = [0.1464, 0.5, 0.8536, 1, 0.8536, 0.5, 0.1464];
  const RIDE_WSUM = 4.0;
  const RIDE_SPAN = 60;
  const RIDE_GRADE = 40;

  function crY(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
      + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

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
