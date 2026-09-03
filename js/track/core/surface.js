/* Apex 26 — shared terrain ribbon and prop-grounding profile.
   Pure IIFE global; loaded before tracks.js. */
const TrackSurface = (function () {
  "use strict";

  const clamp01 = (v) => M4.clamp(v, 0, 1);
  const lerp = M4.lerp;

  function monotonicRails(def, outerW, street, flat) {
    const seeds = street
      ? [5, 10, 16, 22, outerW]
      : flat
        ? [2.2, outerW * 0.3, outerW * 0.55, outerW * 0.8, outerW]
        : [2.2, 7, 14, 48, outerW];
    const clipped = [];
    for (const value of seeds) {
      const v = Math.max(0.25, Math.min(outerW, value));
      if (!clipped.length || v - clipped[clipped.length - 1] > 1e-6) clipped.push(v);
    }
    if (!clipped.length || Math.abs(clipped[clipped.length - 1] - outerW) > 1e-6)
      clipped.push(outerW);

    const rails = [];
    let previous = 0;
    for (const end of clipped) {
      const pieces = Math.max(1, Math.ceil((end - previous) / 16));
      for (let i = 1; i <= pieces; i++) rails.push(lerp(previous, end, i / pieces));
      previous = end;
    }
    return rails.filter((v, i, a) => i === 0 || v - a[i - 1] > 1e-6);
  }

  function profile(def, track) {
    def = def || {};
    Log.info("track", "surface profile " + def.id);
    const street = !!def.street;
    const flat = !!def.flatTerrain;
    const outerW = Math.max(0.5, Number(def.terrainOuter) || (street ? 28 : 120));
    const rails = monotonicRails(def, outerW, street, flat);
    const n = track.n;
    // pyMin must be the lowest point of the ROAD SURFACE, not of the centreline.
    // Banking pivots about the centre, so a banked node's low edge sits lift/2
    // BELOW py[k] — and floorY is the flat world slab every circuit is drawn on.
    // Measuring the centreline alone let that slab cover the bottom of a banked
    // corner: at Zandvoort the deepest banking (4.82 m lift) coincides with the
    // lowest part of the lap, putting the low edge 1.37 m under the floor, which
    // reads on screen as the ground swallowing the inside of the bank.
    const bp = track.bankP;
    let pyMin = Infinity;
    for (let k = 0; k < n; k++) {
      const lift = bp && bp.lift[k] > 0 ? bp.lift[k] / 2 : 0;
      pyMin = Math.min(pyMin, track.py[k] - lift);
    }
    const floorY = pyMin - 1;
    const ground = new Float32Array(track.py);

    // Bridges lift the deck but not the terrain beneath it.
    // The bridge fracs were authored in pre-rotation racing space; buildCenterline
    // raises the deck at `(b.s + def._sceneryShift) % 1` (tracks.js), so this carve
    // has to use the SAME shift or the flat-terrain window lands somewhere else on
    // the lap — on Suzuka (shift 0.6198) it carved a 13.5 m trench under plain road
    // at frac 0.817 and left the real crossover at 0.437 with zero clearance.
    // Same omission class as the bankZones fix (ed5a310f).
    if (def.bridges) {
      const ds = track.total / n;
      const dress = def._sceneryShift || 0;
      for (const bridge of def.bridges) {
        const center = TrackSpace.wrap01(bridge.s + dress) * track.total;
        for (let k = 0; k < n; k++) {
          let d = Math.abs(k * ds - center);
          d = Math.min(d, track.total - d);
          if (d < bridge.halfM)
            ground[k] -= bridge.rise * 0.5 * (1 + Math.cos(Math.PI * d / bridge.halfM));
        }
      }
    }

    const p = {
      outerW, rails, street, flat, pyMin, floorY, ground,
      heightAt(k, lateralDistance) {
        const i = ((Math.round(k) % n) + n) % n;
        const dist = Math.max(0, Math.abs(Number(lateralDistance) || 0));
        const base = ground[i];
        if (dist >= outerW) return floorY;
        if (flat || street) {
          const shelf = base - 0.12 - dist * 0.004;
          const edgeStart = outerW * 0.72;
          if (dist <= edgeStart) return shelf;
          const t = clamp01((dist - edgeStart) / Math.max(0.01, outerW - edgeStart));
          const ease = t * t * (3 - 2 * t);
          return lerp(shelf, floorY, ease);
        }
        const t = clamp01(dist / outerW);
        const ease = t * t * (3 - 2 * t);
        const localFloor = Math.max(base - 10, Math.min(ground[i], pyMin));
        const slope = lerp(base - 0.3 - dist * 0.018, localFloor, ease);
        // Last 18% meets the universal floor exactly; no hanging ribbon edge.
        const edgeT = clamp01((t - 0.82) / 0.18);
        return lerp(slope, floorY, edgeT * edgeT * (3 - 2 * edgeT));
      },
    };
    return p;
  }

  function heightAt(surface, k, lateralDistance) {
    return surface.heightAt(k, lateralDistance);
  }

  return { profile, heightAt };
})();
