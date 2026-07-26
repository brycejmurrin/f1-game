/* Apex 26 — SceneryStructures: the linear track furniture + race-infrastructure
   band of the buildProps composite-model toolkit — the along() node walker,
   the barrier family (wall/fence/guardrail/tyreWall), the overhead gantry,
   marshal kit (flagQuad/marshalPost), signage (signDigit/signBoard) and the
   ferris-wheel landmark. Split out of js/track/tracks.js buildProps; created
   once per build via SceneryStructures.create(ctx) with the shared scenery
   ctx. anchor comes from SceneryNature via ctx (created before this module).
   Load order: before js/track/tracks.js (which calls create() at build). */
const SceneryStructures = (function () {
  "use strict";

  function create(ctx) {
    const { out, track, def, n, ds, hw, px, py, pz, NIGHT, MAT,
            addBox, addCyl, addFrustum, RAW, blockAt, recordBarrier,
            groundYAt, onTrack, overheadSpan, hash, cross, norm, vadd,
            anchor } = ctx;
    const { SIGN_SEG, SIGN_DIGIT } = TrackSceneryData;

    // ---------- linear track furniture (run along the track from s0→s1) ----------
    // Walk nodes from lap-fraction s0 to s1 (wrapping), ~stepM apart. Passes the
    // ACTUAL along-track spacing used (stepM rounds to a whole number of nodes,
    // so the real gap between consecutive k's is `step*ds`, not the requested
    // stepM) — callers that emit a full solid box per node MUST size its
    // tangent-axis length to this, not a padded constant. A fixed constant
    // larger than the true spacing (the old pattern: box length > stepM "to
    // avoid gaps on curves") makes adjacent full-solid boxes share real 3D
    // volume — on straights that's near-coincident z-fighting, on curves
    // (worst on tight hairpins) the boxes are rotated relative to each other so
    // the shared volume shows as visible interpenetration/clipping.
    const along = (s0, s1, stepM, fn) => {
      const k0 = Math.round(s0 * n) % n, k1 = Math.round(s1 * n) % n;
      const span = ((k1 - k0) + n) % n || n, step = Math.max(1, Math.round(stepM / ds));
      for (let i = 0; i <= span; i += step) fn((k0 + i) % n, step * ds);
    };
    // Continuous solid wall (concrete / pit wall) at clearance `gap` beyond the edge.
    const wall = (s0, s1, side, gap, h, col, thick) => {
      const a = thick || 0.5;
      recordBarrier(s0, s1, side, gap);
      along(s0, s1, 6, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], a / 2)) {
          console.warn(`[scenery] wall SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addBox(out, vadd(p.c, p.u, (h - 0.4) / 2), [a, h + 0.4, spacing], col || [0.78, 0.78, 0.80], [p.r, p.u, p.t]);   // base sunk 0.4 — no slope float
      });
    };
    // Catch / debris fence: posts + a pale mesh panel (reads as see-through wire).
    const fence = (s0, s1, side, gap, h, col) => {
      along(s0, s1, 5, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 0.5)) {
          console.warn(`[scenery] fence SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addCyl(out, vadd(p.c, p.u, -0.4), 0.13, h + 0.4, [0.28, 0.28, 0.30], 5, [p.r, p.u, p.t]);   // post, base sunk
        addBox(out, vadd(p.c, p.u, h * 0.55), [0.05, h * 0.9, spacing], col || [0.72, 0.74, 0.78], [p.r, p.u, p.t]);  // mesh
      });
    };
    // Armco guardrail: a waist-high steel rail on posts (open-circuit edge).
    const guardrail = (s0, s1, side, gap, col) => {
      recordBarrier(s0, s1, side, gap);
      along(s0, s1, 4, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 0.5)) {
          console.warn(`[scenery] guardrail SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addCyl(out, vadd(p.c, p.u, -0.35), 0.09, 1.05, [0.5, 0.5, 0.52], 4, [p.r, p.u, p.t]);   // post, base sunk
        addBox(out, vadd(p.c, p.u, 0.7), [0.18, 0.45, spacing], col || [0.82, 0.82, 0.85], [p.r, p.u, p.t]);
      });
    };
    // Stacked-tyre barrier with a coloured conveyor-belt cap.
    const tyreWall = (s0, s1, side, gap, capCol) => {
      recordBarrier(s0, s1, side, gap);
      along(s0, s1, 3.4, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 1.0)) {
          console.warn(`[scenery] tyreWall SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addCyl(out, vadd(p.c, p.u, -0.35), 1.0, 1.25, [0.10, 0.10, 0.11], 7, [p.r, p.u, p.t]);   // base sunk
        addBox(out, vadd(p.c, p.u, 0.95), [2.0, 0.3, spacing], capCol || [0.9, 0.9, 0.92], [p.r, p.u, p.t]);
      });
    };
    // Overhead gantry spanning the track (start/scoring/DRS): two legs + a beam.
    // Legs sit beyond the edge (guarded). Beam + under-beam lenses intentionally
    // span the racing line so cars pass under — emit via RAW, same pattern as
    // underpassPortal, or the footprint guard silently drops the span and leaves
    // two lonely posts that no longer straddle the track.
    const gantry = (s, h, col) => {
      const k = Math.round(s * n) % n, c = col || [0.16, 0.16, 0.19];
      const aL = anchor(k, -1, 1.5), aR = anchor(k, 1, 1.5), u = aL.u;
      const b = [aL.r, u, aL.t];
      addCyl(out, aL.c, 0.3, h, c, 6, b);
      addCyl(out, aR.c, 0.3, h, c, 6, [aR.r, u, aR.t]);
      const beam = [px[k] + u[0] * h, py[k] + u[1] * h, pz[k] + u[2] * h];
      // Span legs: half-width + 1.5 m clearance each side + 1 m past each mast.
      overheadSpan({
        id: `gantry-${k}`, frac: s, clearance: h - 0.45,
        thickness: 0.9, depth: 1.4, span: hw[k] * 2 + 5,
        color: c,
      });
      // Visual lens fixtures under the beam. Matching point lights are placed
      // near s=0 in buildTrackLights (js/game/lighting.js) — not parented to
      // this mesh. Bright cool-white at night (emissive bloom), muted by day.
      const gl = NIGHT ? [1.28, 1.30, 1.38] : [0.80, 0.81, 0.85];
      const r0 = [track.rx[k], track.ry[k], track.rz[k]];
      for (const lat of [-hw[k] * 0.55, 0, hw[k] * 0.55]) {
        RAW.addBox(out, [beam[0] + r0[0] * lat - u[0] * 0.62,
                         beam[1] + u[1] * (-0.62),
                         beam[2] + r0[2] * lat - u[2] * 0.62],
                   [1.1, 0.35, 1.0], gl, b);
      }
    };
    // Waving marshal flag: a two-sided quad hinged on the pole. Each vertex is
    // stamped MAT.FLAG plus a fractional wave weight (0 at the hoist edge →
    // 0.4 at the free edge); the lit VERTEX shader (LIT_VS) displaces FLAG
    // verts along their normal with a travelling sine scaled by that weight,
    // so the cloth flutters in the wind while the hoist stays pinned.
    const flagQuad = (c, t, u, w, h, col) => {
      const nv = norm(cross(t, u));   // face normal (shared by both sides)
      const push = (reverse) => {
        const base = out.pos.length / 3;
        for (const [ft, fu] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          out.pos.push(c[0] + t[0] * ft * w + u[0] * fu * h,
                       c[1] + t[1] * ft * w + u[1] * fu * h,
                       c[2] + t[2] * ft * w + u[2] * fu * h);
          out.nrm.push(nv[0], nv[1], nv[2]);
          out.col.push(col[0], col[1], col[2]);
          out.mat.push(MAT.FLAG + ft * 0.4);   // per-vertex wave weight in the fraction
        }
        if (reverse) out.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        else out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };
      push(false); push(true);   // both windings → visible from either side
    };
    // Marshal post / flag bunker: a small orange-roofed box with a pole.
    const marshalPost = (k, side, gap) => {
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 3)) {
        console.warn(`[scenery] marshalPost SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
        return;
      }
      addBox(out, vadd(p.c, p.u, 1.1), [2.2, 3.0, 2.2], [0.85, 0.86, 0.88], b);   // base sunk 0.4
      addBox(out, vadd(p.c, p.u, 2.7), [2.5, 0.4, 2.5], [0.95, 0.55, 0.08], b);
      const polePos = vadd(p.c, p.r, side * 1.4);
      addCyl(out, vadd(polePos, p.u, -0.35), 0.08, 4.35, [0.4, 0.4, 0.42], 4, b);   // base sunk
      // Marshal flag on the pole — waving cloth (see flagQuad above). Mostly
      // yellow (the flag a marshal post actually flies), occasionally blue.
      flagQuad(vadd(polePos, p.u, 3.3), p.t, p.u,
               1.05, 0.62, hash(k) < 0.72 ? [1.30, 1.02, 0.08] : [0.10, 0.42, 1.25]);
      // Marshal watch-lamp: a small amber beacon on the flag pole after dark so
      // the marshal line dots the circuit like real night-race infrastructure.
      if (NIGHT) addBox(out, vadd(polePos, p.u, 4.12), [0.24, 0.24, 0.24], [1.32, 0.72, 0.28], b);
      blockAt(k, side, gap, 1.3);   // solid hut
    };
    // Draw one digit centred at `c`, spanning [w,h] in the (t=horizontal,
    // u=vertical) plane, raised `proud` along r toward the viewer so the
    // segments sit visibly above the panel face instead of z-fighting it.
    const signDigit = (c, r, u, t, w, h, proud, col, digit) => {
      const segs = SIGN_DIGIT[digit] ?? SIGN_DIGIT[0];
      const base = vadd(c, r, proud);
      for (const name of segs) {
        const [x0, x1, y0, y1] = SIGN_SEG[name];
        const cc = vadd(vadd(base, t, (x0 + x1) / 2 * w - w / 2), u, (y0 + y1) / 2 * h - h / 2);
        addBox(out, cc, [0.03, (y1 - y0) * h, (x1 - x0) * w], col, [r, u, t]);
      }
    };
    // signBoard(k, side, gap, kind, value):
    //   kind: "corner" (value = corner number, 1-99) — white board, black digits.
    //   kind: "speed" (value = km/h, 10-99) — red-rimmed circular disc, black digits.
    //   kind: "braking" (value = stripe count, 1-3) — white panel, diagonal red
    //     stripes counting down to the corner (the real F1 100/50m board style).
    const signBoard = (k, side, gap, kind, value) => {
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 1.5)) {
        console.warn(`[scenery] signBoard SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
        return;
      }
      const postH = 1.35;
      const proud = -side * 0.05;   // segment relief toward the viewer
      addCyl(out, vadd(p.c, p.u, -0.3), 0.06, postH + 0.3, [0.55, 0.55, 0.58], 4, b);   // base sunk
      if (kind === "speed") {
        const R = 0.52, cc = vadd(p.c, p.u, postH + R);
        addFrustum(out, cc, R, R, 0.05, [0.85, 0.16, 0.14], 12, b);                       // red rim disc
        addFrustum(out, vadd(cc, p.r, -side * 0.02), R * 0.80, R * 0.80, 0.05, [0.95, 0.95, 0.93], 12, b);  // white face
        const digs = String(Math.max(10, Math.min(99, value || 80))).split("").map(Number);
        digs.forEach((d, i) => {
          const dc = vadd(cc, p.t, (i - (digs.length - 1) / 2) * 0.36);
          signDigit(dc, p.r, p.u, p.t, 0.34, 0.62, -side * 0.06, [0.10, 0.10, 0.12], d);
        });
      } else if (kind === "braking") {
        const w2 = 1.3, h2 = 0.9, cc = vadd(p.c, p.u, postH + h2 / 2);
        addBox(out, cc, [0.05, h2, w2], [0.92, 0.92, 0.90], b);   // white panel face
        const nStripes = Math.max(1, Math.min(3, value || 2));
        // Diagonal stripes: a proper unit tilt of (u,t) so a thin box reads as a
        // 45deg diagonal band across the panel, not an axis-aligned rectangle.
        const diagU = norm([p.u[0] + p.t[0], p.u[1] + p.t[1], p.u[2] + p.t[2]]);
        for (let i = 0; i < nStripes; i++) {
          const sx = (i - (nStripes - 1) / 2) * (w2 / (nStripes + 0.4));
          const sc = vadd(vadd(cc, p.t, sx), p.r, proud);
          addBox(out, sc, [0.02, h2 * 1.15, 0.16], [0.85, 0.15, 0.13], [p.r, diagU, p.t]);
        }
      } else {   // "corner" number board
        const w2 = 1.0, h2 = 0.85, cc = vadd(p.c, p.u, postH + h2 / 2);
        addBox(out, cc, [0.05, h2, w2], [0.92, 0.92, 0.90], b);
        const digs = String(Math.max(1, Math.min(99, value || 1))).split("").map(Number);
        digs.forEach((d, i) => {
          const dc = vadd(cc, p.t, (i - (digs.length - 1) / 2) * 0.38);
          signDigit(dc, p.r, p.u, p.t, 0.36, 0.58, proud, [0.10, 0.10, 0.12], d);
        });
      }
    };
    // --- iconic landmark: a ferris wheel beside the track (Suzuka, Singapore) ---
    function ferrisWheel(k, side, dist, radius) {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const tl = Math.hypot(track.tx[k], track.tz[k]) || 1;
      const tn = [track.tx[k] / tl, 0, track.tz[k] / tl];   // horizontal tangent
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      // Ground the wheel on the TERRAIN at its own footprint, not the road
      // height at k — at 60+ m out the park ground can sit well below the road,
      // which left the support legs (and the whole wheel) floating.
      const gy = groundYAt(k, dist);
      const hubY = gy + radius + 5;
      const hub = [cx, hubY, cz];
      for (const lo of [-3, 3]) {                            // support legs
        addBox(out, [cx + tn[0] * lo, gy + (hubY - gy) / 2 - 0.5, cz + tn[2] * lo],
               [1.6, hubY - gy + 0.4, 1.6], [0.32, 0.33, 0.38]);
      }
      addBox(out, hub, [3, 3, 3], [0.3, 0.3, 0.34]);         // hub
      const seg = 16;
      const wheelCol = def.night ? [0.30, 0.31, 0.4] : [0.62, 0.63, 0.68];
      // Rim points first, so we can lace SPOKES (hub→rim) and a RIM RING (rim→rim)
      // through them — the wheel now reads as a real structure, not floating cabins.
      const rim = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        rim.push([hub[0] + tn[0] * ca * radius, hub[1] + sa * radius, hub[2] + tn[2] * ca * radius]);
      }
      const strut = (p0, p1, thick, col) => {
        const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || 1;
        const up = [d[0] / L, d[1] / L, d[2] / L];
        let rr = norm(cross(up, tn)); if (!isFinite(rr[0])) rr = [1, 0, 0];
        const ff = norm(cross(up, rr));
        addBox(out, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2],
               [thick, L, thick], col, [rr, up, ff]);
      };
      for (let i = 0; i < seg; i++) {
        strut(hub, rim[i], 0.28, wheelCol);                  // spoke
        strut(rim[i], rim[(i + 1) % seg], 0.34, wheelCol);   // rim segment
      }
      for (let i = 0; i < seg; i++) {                        // cabins hung off the rim
        const cab = def.night
          ? [[0.95, 0.2, 0.5], [0.2, 0.85, 0.95], [0.95, 0.8, 0.2]][i % 3]
          : (i % 2 ? [0.9, 0.25, 0.25] : [0.95, 0.95, 0.98]);
        addBox(out, [rim[i][0], rim[i][1] - 1.5, rim[i][2]], [2.4, 2.2, 2.4], cab);
      }
      // solid base (legs + hub footprint) → stop the car before it on open tracks
      blockAt(k, side, dist - 0.8, 4);
    }

    return { along, wall, fence, guardrail, tyreWall, gantry, flagQuad,
             marshalPost, signDigit, signBoard, ferrisWheel };
  }

  return { create };
})();
