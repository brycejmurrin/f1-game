"use strict";
// @doc Centreline kink scan: nodes whose chord-to-chord turn radius is below the road half-width (#2209).
//
// A single node that turns much harder than its neighbours pinches the inside road edge and
// kerb (the "centreline" row of verify-track says it is circuit DATA). R is the same
// chord-to-chord radius TrackSpline.surfaceFolds uses: R = 0.5 (Li + Lo) / dTheta.
function kinkNodes(track) {
  const n = track.n, px = track.px, pz = track.pz, hw = track.hw;
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k - 1 + n) % n, b = (k + 1) % n;
    const ix = px[k] - px[a], iz = pz[k] - pz[a], ox = px[b] - px[k], oz = pz[b] - pz[k];
    const Li = Math.hypot(ix, iz), Lo = Math.hypot(ox, oz);
    const dth = Math.abs(Math.atan2(ix * oz - iz * ox, ix * ox + iz * oz));
    if (!(dth > 1e-9)) continue;
    const R = 0.5 * (Li + Lo) / dth;
    if (R < hw[k]) out.push({ k, frac: k / n, R, hw: hw[k] });
  }
  return out;
}

// Nearest 1-based index into def.turns (racing-lap apex fractions), or 0 when the def has none.
function nearestTurn(def, frac) {
  const turns = (def && def.turns) || [];
  let best = 0, bd = Infinity;
  turns.forEach((t, i) => {
    const f = typeof t === "number" ? t : t && typeof t.frac === "number" ? t.frac : null;
    if (f == null) return;
    const d = Math.min(Math.abs(f - frac), 1 - Math.abs(f - frac));
    if (d < bd) { bd = d; best = i + 1; }
  });
  return best;
}

module.exports = { kinkNodes, nearestTurn };
