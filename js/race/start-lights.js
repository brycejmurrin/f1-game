/* Apex 26 — the start gantry's lights. Five red lamps on the gantry nearest the
   start line come on one a second with the countdown and go out together at
   green, so the sequence the HUD shows is also in the world the player is
   looking at. Until 2026-10-01 the gantry carried three static grey boxes and
   nothing drove them (the second graphics-detail survey, item 5).

   The lamps are not geometry: each lit frame re-spawns one additive particle
   disc per lit lamp (Particles.glow, life 0.1 s), so the glow blooms like a
   floodlight, needs no uniform and no per-frame mesh, and costs five particles
   out of a 256 pool during the five seconds a race starts. The gantry comes
   from the scenery registry (track.props.list, kind "gantry", side 0) — the one
   with the fewest nodes to the start line, within 3 % of a lap. A record names
   its lamp row (`lamp`, the row's centre, and `face`, how far toward the grid
   it stands): gantry() its housing bar; a start/finish overheadSpan built
   with `startLights` its deck's grid-facing face, and it wins a tie with a
   gantry() at the same node. A record without them falls back to its
   measured box (DROP/FACE below). Without a gantry there, the
   lamps hang on the grid-facing face of the engine's start gate beam
   (track.startGate, js/track/tracks.js buildGate), which every circuit has —
   until 2026-10-04 the fallback was no lights at all, and 22 of 52 circuits
   started in the dark. Positions are memoised per track. Read by js/game.js:
   StartLights.create(G).update() each frame before Particles.update. */
const StartLights = (function () {
  "use strict";
  const LAMPS = 5;          // COUNTDOWN_S in js/game.js lights one a second
  const SPACING = 0.9;      // metres between lamp centres
  const DROP = 0.62;        // housing centre below the beam top (structures.js gantry)
  const FACE = 0.30;        // disc sits proud of the housing's grid-facing face
  const LIFE = 0.10;        // seconds: outlives one frame, dies before the next spawn stacks
  const NEAR = 0.03;        // the start gantry is within this fraction of a lap of the line

  function create(G, deps) {
    const P = (deps && deps.Particles) || (typeof Particles !== "undefined" ? Particles : null);
    // Memoised per track object, WEAKLY: a plain `_track` field pinned the whole
    // previous world (props list, node arrays) through the next circuit's build.
    const _lampsBy = new WeakMap();

    // Where the lamp row hangs: { c: its centre, tx/tz: the direction of
    // travel there, face: metres it stands toward the grid }, or null.
    function anchorFor(track) {
      const list = track.props && track.props.list, n = track.n;
      if (list && track.px && n > 2) {
        let best = null, bestD = Infinity;
        for (const r of list) {
          if (r.kind !== "gantry" || r.side !== 0 || !(r.k >= 0)) continue;
          const d = Math.min(r.k, n - r.k);   // nodes from the start line, either way round
          // On a tie, a span the circuit built as its start lights wins.
          if (d < bestD || (d === bestD && r.startLights && !best.startLights)) { bestD = d; best = r; }
        }
        if (best && bestD <= n * NEAR) {
          const k = best.k, k0 = (k + n - 1) % n, k1 = (k + 1) % n;
          return { c: best.lamp || [best.x, best.y + best.h / 2 - DROP, best.z],
                   tx: track.px[k1] - track.px[k0], tz: track.pz[k1] - track.pz[k0],
                   face: best.face > 0 ? best.face : FACE };
        }
      }
      const g = track.startGate;   // the engine gate 15 m before the line (tracks.js buildGate)
      if (g && g.c && g.t) return { c: g.c, tx: g.t[0], tz: g.t[2], face: g.face > 0 ? g.face : FACE };
      return null;
    }

    // World positions of the five lamps on the start gantry, or null.
    function lampsFor(track) {
      if (!track) return null;
      if (_lampsBy.has(track)) return _lampsBy.get(track);
      _lampsBy.set(track, null);
      const a = anchorFor(track);
      if (!a) return null;
      // Tangent from the neighbouring nodes; right = tangent rotated to +x-of-travel.
      const tl = Math.hypot(a.tx, a.tz) || 1, tx = a.tx / tl, tz = a.tz / tl;
      const rx = -tz, rz = tx;
      const lamps = [];
      for (let i = 0; i < LAMPS; i++) {
        const lat = (i - (LAMPS - 1) / 2) * SPACING;
        // Proud of the face that looks back down the grid (−tangent).
        lamps.push([a.c[0] + rx * lat - tx * a.face, a.c[1], a.c[2] + rz * lat - tz * a.face]);
      }
      _lampsBy.set(track, lamps);
      return lamps;
    }

    function update() {
      if (!P || !P.glow || G.state !== "count") return;
      const lit = G.lightsLit | 0;
      if (lit <= 0) return;
      const lamps = lampsFor(G.track);
      if (!lamps) return;
      for (let i = 0; i < lit && i < lamps.length; i++) {
        const l = lamps[i];
        P.glow(l[0], l[1], l[2], 0.55, 1.0, 0.10, 0.05, 0.95, LIFE);
      }
    }

    return { update, lampsFor };
  }

  return { create };
})();
Object.freeze(StartLights);
