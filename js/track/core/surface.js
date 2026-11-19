const TrackSurface = (function () {
  "use strict";

  const clamp01 = (v) => M4.clamp(v, 0, 1);
  const lerp = M4.lerp;
  const SHELF_END = 12, SHELF_BLEND = 30;

  function monotonicRails(def, outerW, street, flat, extra) {
    const seeds = (street
      ? [5, 10, 16, 22, outerW]
      : flat
        ? [2.2, outerW * 0.3, outerW * 0.55, outerW * 0.8, outerW]
        : [2.2, 7, 14, 48, outerW]).concat(extra || []).sort((x, y) => x - y);
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
    const falloffStart = Number.isFinite(def.terrainFalloffStart) &&
      def.terrainFalloffStart >= SHELF_BLEND && def.terrainFalloffStart < outerW
      ? def.terrainFalloffStart : null;
    const pit = track && track.pit && !track.pit.painted ? track.pit : null;
    const pitRails = pit ? [pit.off.outer + 0.3, pit.off.outer + 8.3,
                            pit.off.outer + 0.3 + pit.bay.depth + 3, pit.off.outer + 8.3 + pit.bay.depth + 3] : null;
    const rails = monotonicRails(def, outerW, street, flat, pitRails);
    const n = track.n;
    const bp = track.bankP;
    let pyMin = Infinity;
    for (let k = 0; k < n; k++) {
      const lift = bp && bp.lift[k] > 0 ? bp.lift[k] / 2 : 0;
      pyMin = Math.min(pyMin, track.py[k] - lift);
    }
    const floorY = pyMin - 1;
    const ground = new Float32Array(track.py);

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
      heightAt(k, lateralDistance, side) {
        const i = ((Math.round(k) % n) + n) % n;
        const dist = Math.max(0, Math.abs(Number(lateralDistance) || 0));
        const base = ground[i];
        const pit = track && track.pit;
        if (pit && side === pit.side && pit.keep[i] > 0) {
          const edge = pit.keep[i], wk = pit.w[i], ew = wk * wk * (3 - 2 * wk);
          const flat = (d) => lerp(p.heightAt(k, d, 0), base - 0.03, ew);
          if (dist <= edge) return flat(dist);
          if (dist < edge + 8) {
            const t = (dist - edge) / 8, e = t * t * (3 - 2 * t);
            return lerp(flat(dist), p.heightAt(k, dist, 0), e);
          }
        }
        if (dist >= outerW) return floorY;
        const bermLift = () => {
          if (!def.berms || flat || street || !bp) return 0;
          const lift = bp.lift[i] || 0;
          if (!(lift > 0.15)) return 0;
          const outer = bp.bsign[i] || 0;
          if (!outer || !side || side !== outer) return 0;
          if (dist < 2.0 || dist > 22) return 0;
          const peak = Math.min(2.4, 0.55 + lift * 0.35);
          let w = 1;
          if (dist < 6) w = clamp01((dist - 2.0) / 4);
          else if (dist > 10) w = 1 - clamp01((dist - 10) / 12);
          const e = w * w * (3 - 2 * w);
          return peak * e;
        };
        if (flat || street) {
          const shelf = base - 0.12 - dist * 0.004;
          const edgeStart = outerW * 0.72;
          if (dist <= edgeStart) return shelf + bermLift();
          const t = clamp01((dist - edgeStart) / Math.max(0.01, outerW - edgeStart));
          const ease = t * t * (3 - 2 * t);
          return lerp(shelf, floorY, ease) + bermLift();
        }
        const t = clamp01(dist / outerW);
        const ease = t * t * (3 - 2 * t);
        const localFloor = Math.max(base - 10, Math.min(ground[i], pyMin));
        let slope = lerp(base - 0.3 - dist * 0.018, localFloor, ease);
        if (dist < SHELF_BLEND) {
          const shelf = base - 0.08 - Math.max(0, dist - 2.2) * 0.004;
          const u = clamp01((dist - SHELF_END) / (SHELF_BLEND - SHELF_END));
          slope = lerp(shelf, slope, u * u * (3 - 2 * u));
        }
        slope += bermLift();
        if (falloffStart !== null) {
          const edgeT = clamp01((dist - falloffStart) / (outerW - falloffStart));
          return lerp(slope, floorY, edgeT * edgeT * (3 - 2 * edgeT));
        }
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
Object.freeze(TrackSurface);
