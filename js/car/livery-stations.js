/* Apex 26 — extra livery decal stations (nose tip cap, cockpit-side driver code, sidepod top, halo top).
   Each station is an atlas region (LiveryTex.REGIONS) plus decal quads placed from the SAME
   anchors the body is built from, so a mark lies on its panel instead of over it. Survey and
   real-F1 precedent: docs/notes/LIVERY-LAYOUTS-2026-10-19.md §Decal stations. */
"use strict";
const LiveryStations = (function () {
  const IDS = Object.freeze(["noseTip", "cockpitSide", "podTop", "haloTop"]);
  const HALO_GREY = [0.22, 0.225, 0.245];   // CarMaterials HALO: the untinted titanium hoop
  // Livery field per station: "off" leaves its atlas region clear, so the quad shows the body
  // underneath. Paint-only — the geometry stays, and a toggle never rebuilds the car mesh.
  const TOGGLES = Object.freeze({ noseTip: "decalNoseTip", cockpitSide: "decalCockpit", podTop: "decalPodTop", haloTop: "decalHalo" });
  const on = (colors, id) => !colors || colors[TOGGLES[id]] !== "off";

  // Same lookup the fin and spine "code" badges use (Teams.LIST, else the team short name).
  function driverCode(teamId, num) {
    return LiveryTex.driverCode(teamId, num);
  }

  // Atlas art. `h` carries liverytex's own painters so ink rules stay in one place.
  function paint(ctx, R, h) {
    const { teamId, colors, c1, accent, names, num } = h;
    if (R.noseTip && on(colors, "noseTip")) h.fillRegion(ctx, R.noseTip, colors.noseTip || accent);
    if (R.cockpitSide && on(colors, "cockpitSide")) {
      const ink = h.inkOn([c1]);
      h.drawWordmark(ctx, driverCode(teamId, num), R.cockpitSide, ink, { align: "center", spacing: 0.12, halo: h.haloIf(ink) });
    }
    if (!names.length) return;   // `clean`: no sponsor text
    if (R.podTop && on(colors, "podTop")) {
      const ink = h.inkOn([colors.pod || c1]);   // the sidepod shell wears `pod` paint (c1 when unset)
      h.drawWordmark(ctx, names[0], R.podTop, ink, { align: "center", spacing: 0.05, halo: h.haloIf(ink) });
    }
    if (R.haloTop && on(colors, "haloTop")) {
      const ink = h.inkOn([colors.halo || HALO_GREY]);
      h.drawWordmark(ctx, names[5] || names[1], R.haloTop, ink, { align: "center", spacing: 0.08, halo: h.haloIf(ink) });
    }
  }

  // Decal geometry. quadUv(corners, normal, uvs) with corners [BL, BR, TR, TL] seen from outside;
  // uvOf(region) → { uL, uR, vT, vB } with u pre-flipped for the model reflection (car-mesh quad()).
  function emit(quadUv0, uvOf, R, anchors, ctx) {
    if (!anchors) return;   // imported bodies: no anchors, no stations
    // Every decal winds counter-clockwise about its normal (back faces are culled): a quad
    // given the other way round is reversed here, each corner keeping its own uv.
    const quadUv = (c, n, uv) => {
      const e1 = [c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]], e2 = [c[2][0] - c[0][0], c[2][1] - c[0][1], c[2][2] - c[0][2]];
      const w = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2];
      if (w < 0) quadUv0([c[3], c[2], c[1], c[0]], n, [uv[3], uv[2], uv[1], uv[0]]); else quadUv0(c, n, uv);
    };
    const lerp = M4.lerp;
    const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

    // NOSE TIP: a colour cap over the last 280 mm of the nose — top, both sides and the front face.
    if (R.noseTip && ctx.noseTipZ != null) {
      const u = uvOf(R.noseTip), P = 0.004, zT = ctx.noseTipZ - 0.004, zB = ctx.noseTipZ - 0.28;
      const a = anchors.noseAt(zB), b = anchors.noseAt(zT);
      quadUv([[-a.topSide, a.top + P, zB], [a.topSide, a.top + P, zB], [b.topSide, b.top + P, zT], [-b.topSide, b.top + P, zT]],
             [0, 1, 0], [[u.uR, u.vB], [u.uL, u.vB], [u.uL, u.vT], [u.uR, u.vT]]);
      for (const s of [-1, 1]) {
        const n = norm(a.top - a.bottom, a.side - a.topSide), off = (p, k) => [s * (p.side * (1 - k) + p.topSide * k + n[0] * P), lerp(p.bottom, p.top, k) + n[1] * P];
        const A0 = off(a, 0), A1 = off(a, 1), B0 = off(b, 0), B1 = off(b, 1);
        quadUv([[A0[0], A0[1], zB], [B0[0], B0[1], zT], [B1[0], B1[1], zT], [A1[0], A1[1], zB]],
               [s * n[0], n[1], 0], [[u.uR, u.vB], [u.uL, u.vB], [u.uL, u.vT], [u.uR, u.vT]]);
      }
      const zf = ctx.noseTipZ + P;
      quadUv([[-b.side, b.bottom, zf], [b.side, b.bottom, zf], [b.topSide, b.top, zf], [-b.topSide, b.top, zf]],
             [0, 0, 1], [[u.uR, u.vB], [u.uL, u.vB], [u.uL, u.vT], [u.uR, u.vT]]);
    }

    // COCKPIT SIDE: the driver code on the monocoque's raked flank ahead of the sidepod inlet.
    const mono = ctx.monocoque;
    if (R.cockpitSide && mono && mono.length >= 2) {
      const u = uvOf(R.cockpitSide), zF = 0.98, zR = 0.68, f0 = 0.34, f1 = 0.78, P = 0.005;
      const at = (z) => {
        const t = (mono[0].z - z) / (mono[0].z - mono[1].z), m0 = mono[0], m1 = mono[1];
        const w = lerp(m0.w, m1.w, t), hh = lerp(m0.h, m1.h, t), y = lerp(m0.y, m1.y, t), tt = lerp(m0.t, m1.t, t);
        const xb = w / 2, xt = w * tt / 2, yb = y - hh / 2, n = norm(hh, xb - xt);
        return { n, p: (f) => [xb + (xt - xb) * f + n[0] * P, yb + hh * f + n[1] * P] };
      };
      const A = at(zF), B = at(zR), a0 = A.p(f0), a1 = A.p(f1), b0 = B.p(f0), b1 = B.p(f1), n = A.n;
      // Right flank reads front-at-left from outside; the left flank mirrors (podDecal's convention).
      quadUv([[a0[0], a0[1], zF], [b0[0], b0[1], zR], [b1[0], b1[1], zR], [a1[0], a1[1], zF]], [n[0], n[1], 0],
             [[u.uR, u.vB], [u.uL, u.vB], [u.uL, u.vT], [u.uR, u.vT]]);
      quadUv([[-b0[0], b0[1], zR], [-a0[0], a0[1], zF], [-a1[0], a1[1], zF], [-b1[0], b1[1], zR]], [-n[0], n[1], 0],
             [[u.uR, u.vB], [u.uL, u.vB], [u.uL, u.vT], [u.uR, u.vT]]);
    }

    // SIDEPOD TOP: the main sponsor along the pod's upper face, inner edge = top of the letters.
    if (R.podTop && anchors.podAt) {
      const u = uvOf(R.podTop), zF = 0.42, zR = -0.30, P = 0.008, g0 = 0.18, g1 = 0.84;
      const stops = [zF, ...((anchors.podStops || anchors.podStations || []).map((p) => p.z).filter((z) => z < zF && z > zR)), zR];
      // A sculpted roof (channel / crown) is curved across: drape the band over it in strips.
      const roof = anchors.podRoof, G = roof ? [0, 0.25, 0.5, 0.75, 1].map((f) => g0 + (g1 - g0) * f) : [g0, g1];
      const face = (z, g) => {
        if (roof) {
          const a = roof(z, g - 0.01), b = roof(z, g + 0.01), r = roof(z, g);
          let n = norm(a[1] - b[1], b[0] - a[0]); if (n[1] < 0) n = [-n[0], -n[1]];
          return { n, p: [r[0] + n[0] * P, r[1] + n[1] * P] };
        }
        const p = anchors.podAt(z), dx = p.x - p.inner, dy = p.top - p.innerTop;
        let n = norm(-dy, dx); if (n[1] < 0) n = [-n[0], -n[1]];
        return { n, p: [p.inner + dx * g + n[0] * P, p.innerTop + dy * g + n[1] * P] };
      };
      const rU = (t) => u.uR + (u.uL - u.uR) * t, lU = (t) => u.uL + (u.uR - u.uL) * t;
      const vOf = (j) => u.vT + (u.vB - u.vT) * (G[j] - g0) / (g1 - g0);   // inner edge = top of the letters
      for (let k = 0; k < stops.length - 1; k++) {
        const za = stops[k], zb = stops[k + 1], ta = (zF - za) / (zF - zR), tb = (zF - zb) / (zF - zR);
        for (let j = 0; j < G.length - 1; j++) {
          const Ai = face(za, G[j]), Ao = face(za, G[j + 1]), Bi = face(zb, G[j]), Bo = face(zb, G[j + 1]);
          const vI = vOf(j), vO = vOf(j + 1), n = Ai.n;
          quadUv([[Ao.p[0], Ao.p[1], za], [Bo.p[0], Bo.p[1], zb], [Bi.p[0], Bi.p[1], zb], [Ai.p[0], Ai.p[1], za]], [n[0], n[1], 0],
                 [[rU(ta), vO], [rU(tb), vO], [rU(tb), vI], [rU(ta), vI]]);
          quadUv([[-Bo.p[0], Bo.p[1], zb], [-Ao.p[0], Ao.p[1], za], [-Ai.p[0], Ai.p[1], za], [-Bi.p[0], Bi.p[1], zb]], [-n[0], n[1], 0],
                 [[lU(tb), vO], [lU(ta), vO], [lU(ta), vI], [lU(tb), vI]]);
        }
      }
    }

    // HALO TOP: a strip on top of the crown bar, through the tube's own ring vertices (addTube's
    // frame), 3 mm proud — on the blade fairing when one sleeves the hoop. None between the fenced hoop's vanes.
    const H = ctx.halo;
    if (R.haloTop && H && H.path && H.path.length > 2) {
      const u = uvOf(R.haloTop), path = H.path, sides = H.sides, r = H.r + 0.003;
      const K = sides >= 12 ? 2 : 1, step = Math.PI * 2 / sides;
      let ux = 0, uy = 1, uz = 0;
      const rings = [];
      for (let i = 0; i < path.length; i++) {   // parallel transport exactly as CarGeometry addTube
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        const d = ux * tx + uy * ty + uz * tz; ux -= d * tx; uy -= d * ty; uz -= d * tz;
        let ul = Math.hypot(ux, uy, uz);
        if (ul < 1e-5) { ux = -tz; uy = 0; uz = tx; ul = Math.hypot(ux, uy, uz) || 1; }
        ux /= ul; uy /= ul; uz /= ul;
        const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux, p = path[i];
        rings.push({ p, u: [ux, uy, uz], v: [vx, vy, vz] });
      }
      const crown = [];
      for (let i = 0; i < path.length; i++) if (path[i][2] >= H.midZ - 1e-4) crown.push(i);
      if (crown.length > 1) {
        // The transported frame has turned by the time it reaches the crown, so its `u` no longer
        // points up: centre the strip on the tube vertex facing most nearly +Y (measured at the crown's
        // middle; the crown arc is near-planar, so the same vertex index faces up along all of it).
        const mid = rings[crown[crown.length >> 1]], k0 = Math.round(Math.atan2(mid.v[1], mid.u[1]) / step);
        for (const i of crown) {
          const { p, u: a, v: b } = rings[i], ring = [];
          for (let k = -K; k <= K; k++) {
            const c = Math.cos((k0 + k) * step), s = Math.sin((k0 + k) * step);
            const nx = a[0] * c + b[0] * s, ny = a[1] * c + b[1] * s, nz = a[2] * c + b[2] * s;
            ring.push({ p: [p[0] + nx * r, p[1] + ny * r, p[2] + nz * r], n: [nx, ny, nz] });
          }
          rings[i] = ring;
        }
        const len = [0];
        for (let j = 1; j < crown.length; j++) {
          const a = path[crown[j - 1]], b = path[crown[j]];
          len.push(len[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
        }
        const L = len[len.length - 1] || 1, uu = (s) => u.uR + (u.uL - u.uR) * (s / L);
        const vv = (k) => u.vB + (u.vT - u.vB) * ((k + K) / (2 * K));
        for (let j = 0; j < crown.length - 1; j++) {
          const A = rings[crown[j]], B = rings[crown[j + 1]];
          for (let k = 0; k < 2 * K; k++) {
            const m = [A[k].n[0] + A[k + 1].n[0], A[k].n[1] + A[k + 1].n[1], A[k].n[2] + A[k + 1].n[2]], ml = Math.hypot(...m) || 1;
            quadUv([A[k].p, B[k].p, B[k + 1].p, A[k + 1].p], [m[0] / ml, m[1] / ml, m[2] / ml],
                   [[uu(len[j]), vv(k - K)], [uu(len[j + 1]), vv(k - K)], [uu(len[j + 1]), vv(k + 1 - K)], [uu(len[j]), vv(k + 1 - K)]]);
          }
        }
      }
    }
  }

  // The outermost tube over the halo crown the car mesh builds (car3d.js exterior hoop): the bare
  // hoop, or the low blade fairing that sleeves it (haloBlade 1: path pts 3..11, 8 mm fatter) —
  // the Garage's stock cockpits wear that fairing, and a strip on the hoop inside it never shows.
  // Null for the fenced crown (vanes, and the full shroud's spine, cover the bar). Literals mirror
  // car3d's haloHoopPath and fairing calls; tests/unit/livery-stations.test.mjs holds them in lockstep.
  const HALO_ARGS = Object.freeze([0.235, 0.505, -0.46, 0.30, 0.02, 0.845, 0.49]);
  function haloOf(cockpit, round) {
    if (typeof Car3D === "undefined" || !Car3D.haloHoopPath) return null;
    const sty = Math.max(0, Math.min(2, Math.round((cockpit && cockpit.halo) || 0)));
    const blade = Math.max(0, Math.min(2, Math.round((cockpit && cockpit.haloBlade) || 0)));
    if (sty === 2 || blade === 2) return null;
    const a = HALO_ARGS, crownY = a[5] - (sty === 1 ? 0.008 : 0), fine = round && typeof CarShade !== "undefined" && CarShade.fine;
    const hoop = Car3D.haloHoopPath(a[0], a[1], a[2], a[3], a[4], crownY, a[6]);
    const path = blade ? (fine ? CarShade.fine(hoop, 3, 3, 12) : hoop.slice(3, 12)) : (fine ? CarShade.fine(hoop, 3) : hoop);
    return { path, r: (sty === 1 ? 0.024 : 0.028) + (blade ? 0.008 : 0), sides: round ? 12 : 6, midZ: a[4] };
  }

  return Object.freeze({ IDS, TOGGLES, paint, emit, haloOf, driverCode, HALO_ARGS });
})();
