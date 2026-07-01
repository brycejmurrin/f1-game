/* Apex 26 — track mesh builders: road ribbon (+ markings, kerbs), terrain,
 * floor plane, start gate & chequered line, plus the banking/kerb query
 * helpers. Extends TracksKit (needs tracks-spline.js loaded first). */
"use strict";

(function () {
"use strict";
const { cross, lerp, curvature } = TracksKit;

  // ---------- mesh helpers ----------

  function upOf(track, k) {
    const t = [track.tx[k], track.ty[k], track.tz[k]];
    const r = [track.rx[k], track.ry[k], track.rz[k]];
    return cross(r, t);
  }
  const hash = (i) => { let x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

  // Corner apexes: local maxima of |curvature| above thresh. Returns
  // [{k, sign, lo, hi}] — sign>0 = right turn (center of curvature on the
  // right), lo/hi = node span where curvature stays above ~half the apex.
  function findCorners(track, thresh) {
    const n = track.n, ds = track.total / n;
    const kv = new Float32Array(n), sg = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const c = curvature(track, k * ds);
      kv[k] = Math.abs(c); sg[k] = Math.sign(c) || 1;
    }
    const sm = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      sm[k] = 0.25 * kv[a] + 0.5 * kv[k] + 0.25 * kv[b];
    }
    const corners = [];
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      if (sm[k] >= thresh && sm[k] >= sm[a] && sm[k] > sm[b]) {
        const half = sm[k] * 0.45;
        let lo = 0, hi = 0;
        while (lo < n / 4 && sm[(k - lo - 1 + n) % n] > half) lo++;
        while (hi < n / 4 && sm[(k + hi + 1) % n] > half) hi++;
        corners.push({ k, sign: sg[k], lo, hi });
      }
    }
    return corners;
  }

  // Zandvoort-style banked corners. Returns null for every circuit except
  // Zandvoort; otherwise per-node arrays describing how much the OUTER road
  // edge rises (metres) and which side that outer edge is on. The lift is
  // cosine-ramped to zero over the corner span plus a few run-in/out nodes,
  // exactly like the localized BRIDGES bump on py — so the rest of the lap
  // stays dead flat (no global tilt). buildRoad and buildTerrain both read this
  // so the banked road edge and the terrain that meets it rise together.
  function bankingProfile(track) {
    // Opt-in per circuit via the `banked` data flag. The road/terrain mesh raises
    // its outer edge here; game.js makes the car, shadow and camera ride the
    // banked surface (height + roll) so nothing floats. The terrain ribbon's bank
    // lift already tapers to zero at its far edge (see buildTerrain), so the
    // distant ground stays flat.
    if (!track.def.banked) return null;
    const n = track.n;
    const corners = findCorners(track, 0.006);
    if (!corners.length) return null;
    // pick the two highest-curvature corners (apex |curvature|)
    const ds = track.total / n;
    const scored = corners.map((c) => ({ c, k: Math.abs(curvature(track, c.k * ds)) }));
    scored.sort((a, b) => b.k - a.k);
    const picks = scored.slice(0, 2).map((s) => s.c);

    const lift = new Float32Array(n);
    const bsign = new Float32Array(n);   // outer side: +1 = right edge, -1 = left
    const TAN18 = Math.tan(18 * Math.PI / 180);
    const RUN = 6;                       // extra run-in/out nodes each side
    for (const c of picks) {
      const outer = -c.sign;             // outer edge is opposite the turn centre
      const peak = 2 * track.hw[c.k] * TAN18;
      const lo = c.lo + RUN, hi = c.hi + RUN;
      for (let i = -lo; i <= hi; i++) {
        const k = (c.k + i + n) % n;
        // cosine window: 1 at apex, 0 at the span edges
        const t = i <= 0 ? (i + lo) / lo : (hi - i) / hi;   // 0..1..0 ramp
        const w = 0.5 * (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t))));
        const add = peak * w;
        if (add > lift[k]) { lift[k] = add; bsign[k] = outer; }
      }
    }
    return { lift, bsign };
  }

  // Lay raised red/white kerb ribbons at corner apexes (inside edge, full
  // corner) and exits (outside edge, shorter), appended to the road mesh.
  function buildKerbs(track, out) {
    const { n, px, py, pz, hw } = track;
    const pal = track.def.palette, ka = pal.kerbA, kb = pal.kerbB;
    const ds = track.total / n;
    // per-node kerb map (which side has a kerb) so the car can detect riding one
    track.kerbL = new Uint8Array(n);
    track.kerbR = new Uint8Array(n);
    const markKerb = (k0, k1, side) => {
      for (let i = 0; i <= k1 - k0; i++) { const k = (k0 + i + n) % n; if (side > 0) track.kerbR[k] = 1; else track.kerbL[k] = 1; }
    };
    const KW = 0.9, KH = 0.06;
    const stripeNodes = Math.max(1, Math.round(1.6 / ds));
    // one ribbon strip over node range, on `side` (-1 left edge, +1 right).
    function ribbon(k0, k1, side) {
      const count = k1 - k0;
      const base = [];
      for (let i = 0; i <= count; i++) {
        const k = (k0 + i + n) % n;
        const u = upOf(track, k);
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const w = hw[k];
        // two rails; push the smaller offset first so winding matches the road
        const oA = side > 0 ? w + 0.05 : -(w + 0.05 + KW);
        const oB = side > 0 ? w + 0.05 + KW : -(w + 0.05);
        const ai = out.pos.length / 3;
        for (const o of [oA, oB]) {
          out.pos.push(px[k] + r[0] * o + u[0] * KH, py[k] + r[1] * o + u[1] * KH + 0.03, pz[k] + r[2] * o + u[2] * KH);
          out.nrm.push(u[0], u[1], u[2]);
        }
        const c = (Math.floor(i / stripeNodes) % 2) === 0 ? ka : kb;
        out.col.push(c[0], c[1], c[2], c[0], c[1], c[2]);
        base.push(ai);
      }
      for (let i = 0; i < count; i++) {
        const a = base[i], b = base[i + 1];
        // match buildRoad winding (top face up under BACK-face culling)
        out.idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    for (const c of findCorners(track, 0.006)) {
      const inside = c.sign > 0 ? 1 : -1;
      ribbon(c.k - c.lo, c.k + c.hi, inside);
      markKerb(c.k - c.lo, c.k + c.hi, inside);
      const exLen = Math.max(2, Math.round(c.hi * 0.7));
      ribbon(c.k + 1, c.k + 1 + exLen, -inside);
      markKerb(c.k + 1, c.k + 1 + exLen, -inside);
    }
  }

  // Is the car at arc-distance s, lateral offset x, riding a kerb? Kerbs sit just
  // outside the road edge at corners; a car counts as "on" one when it's near/over
  // the edge on a side that has a kerb here. Returns 0 (no) or 1 (yes).
  function onKerb(track, s, x) {
    if (!track.kerbR) return 0;
    const n = track.n, L = track.total;
    const k = Math.floor((((s % L) + L) % L) / L * n) % n;
    const hw = track.hw[k], ax = Math.abs(x);
    // the kerb sits just OUTSIDE the road edge; a car is riding it when straddling
    // the edge on a side that has a kerb here (a band from a bit inside the edge
    // to ~1.1m past it).
    if (ax < hw - 0.6 || ax > hw + 1.1) return 0;
    if (x > 0 && track.kerbR[k]) return 1;
    if (x < 0 && track.kerbL[k]) return 1;
    return 0;
  }

  // Banking under a car at arc-distance s, lateral offset x: how far the surface
  // is raised there (dy, metres) and the roll of that surface about the tangent
  // (rad, + tips the car toward the corner's inside). Lets game.js sit the car,
  // its shadow and the camera ON the banked road instead of the flat centreline.
  // Returns null on un-banked circuits/sections.
  // Authored per-segment bank angle (radians) at arc-position s. This is the bank
  // baked into the road basis from each segment's `b` field — the road and car
  // already tilt with it visually, but it's separate from the auto bankingProfile
  // (bankP) used by banking()/grip, so physics needs this to grant grip on
  // authored-banked corners (e.g. Zandvoort's banking).
  function bankAngle(track, s) {
    if (!track.bank) return 0;
    const n = track.n, L = track.total;
    const k = Math.floor((((s % L) + L) % L) / L * n) % n;
    return track.bank[k] || 0;
  }

  function banking(track, s, x) {
    const bp = track.bankP;
    if (!bp) return null;
    const n = track.n, L = track.total;
    const k = Math.floor((((s % L) + L) % L) / L * n) % n;
    const lift = bp.lift[k];
    if (!lift) return null;
    const side = bp.bsign[k], w = track.hw[k];
    let frac = (side * x + w) / (2 * w);
    frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
    return { dy: lift * frac, roll: -side * Math.atan2(lift, 2 * w) };
  }

  function buildRoad(track) {
    const { n, px, py, pz, hw } = track;
    const pos = [], nrm = [], col = [];
    const idxArr = [];
    const bp = track.bankP;
    const pal = track.def.palette;
    const ka = pal.kerbA, kb = pal.kerbB;
    const line = pal.line || [0.95, 0.95, 0.98];
    // Per-circuit tarmac & verge shade: nudge the base asphalt/grass by a stable
    // per-track hash so no two circuits share the exact same road tone — some
    // run a cooler/darker fresh-laid black, others a sun-bleached warmer grey;
    // verges range from lush to dry. Subtle (centred near 1.0) so deliberately
    // tuned palettes stay close to their authored colour.
    const _did = track.def.id || "";
    let _idn = 0; for (let _i = 0; _i < _did.length; _i++) _idn += _did.charCodeAt(_i) * (_i + 3);
    const _aBri = 0.85 + hash(_idn * 1.3) * 0.32;            // 0.85 … 1.17 brightness
    const _aWarm = (hash(_idn * 2.7) - 0.5) * 0.05;          // warm(+R/−B) ↔ cool skew
    const _bA = pal.asphalt || [0.17, 0.18, 0.21];
    const asphalt = [Math.max(0, _bA[0] * _aBri + _aWarm), _bA[1] * _aBri, Math.max(0, _bA[2] * _aBri - _aWarm)];
    const _gBri = 0.86 + hash(_idn * 3.9) * 0.30;            // verge lush ↔ dry
    const _gWarm = (hash(_idn * 4.4) - 0.5) * 0.07;
    const _bG = pal.grass || [0.30, 0.42, 0.22];
    const grass = [_bG[0] * _gBri + _gWarm, _bG[1] * _gBri, Math.max(0, _bG[2] * _gBri - _gWarm)];
    // Within-road wear: the racing line (centre verts) is rubbered darker; the
    // edges sit dustier/lighter — so the surface reads as used, not flat paint.
    const wearF = (v) => (v >= 5 && v <= 8) ? 0.86 : (v === 4 || v === 9 ? 1.07 : 1.0);
    const ds = track.total / n;
    // Cross-section, left to right (lateral offset, yRaise). Crisp painted
    // markings come from placing the two verts of each white band at the same
    // colour, then stepping sharply (5 cm) into the dark asphalt so the edge
    // stays a hard line instead of fading the whole width to grey. 14 verts:
    //   0 grass | 1 kerb | 2-3 bold edge line | 4 asphalt | 5 asphalt
    //   6-7 dashed centre line | 8 asphalt | 9 asphalt | 10-11 bold edge line
    //   12 kerb | 13 grass
    const V = 14;
    for (let k = 0; k < n; k++) {
      const u = upOf(track, k);
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const w = hw[k];
      const offs = [-w - 2.2, -w - 0.4,
                    -w, -w + 0.2, -w + 0.25,        // left edge line + step
                    -0.35, -0.30,                    // centre line (left half)
                    0.30, 0.35,                      // centre line (right half)
                    w - 0.25, w - 0.2, w,            // right step + edge line
                    w + 0.4, w + 2.2];
      // Grass-border verts (0,1,12,13) sit a hair below the asphalt plane to
      // avoid z-fighting at the verge seam. The real over-tarmac protection for
      // the inside of corners (the green-wedge fix) is the shoulder clip below;
      // keeping the shoulder only slightly recessed means props (fences, walls)
      // anchored to the terrain height still meet it with no gap underneath.
      const rise = [-0.05, -0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.02, -0.05];
      const dash = (Math.floor((k * ds) / 7) % 2) === 0;   // dashed centre line
      // banking: raise each cross-section vert along `up` proportional to how
      // far it sits toward the outer edge (inner edge -> 0, outer edge -> full
      // lift). Verts past the edges clamp to 0/full so kerbs/shoulder ride up
      // with the road edge rather than tearing away from it.
      const bankLift = bp ? bp.lift[k] : 0;
      const bankSide = bp ? bp.bsign[k] : 0;
      for (let v = 0; v < V; v++) {
        const o = offs[v];
        let by = 0;
        if (bankLift > 0) {
          // fraction across road: 0 at inner edge (-bankSide*w), 1 at outer (+bankSide*w)
          let frac = (bankSide * o + w) / (2 * w);
          frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
          by = bankLift * frac;
        }
        const wx = px[k] + r[0] * o + u[0] * (rise[v] + by);
        let   wy = py[k] + r[1] * o + u[1] * (rise[v] + by) + 0.02;
        const wz = pz[k] + r[2] * o + u[2] * (rise[v] + by);
        // The grass shoulder verts (0,1,12,13) extend ~2 m past the tarmac edge.
        // On a tight corner the inside shoulder chords across the apex and would
        // render green OVER the racing line (Miami T6, s≈0.11). Bury any shoulder
        // vert that lands over ANOTHER node's tarmac just under that road, so the
        // asphalt always occludes it — mirrors buildTerrain's over-track clip.
        if (v === 0 || v === 1 || v === 12 || v === 13) {
          for (let j = 0; j < n; j++) {
            let dd = Math.abs(j - k); dd = dd < n - dd ? dd : n - dd;
            if (dd * ds < 6) continue;
            const ex = wx - px[j], ez = wz - pz[j];
            const lim = hw[j] - 0.3;
            if (ex * ex + ez * ez < lim * lim && wy > py[j] - 0.05) wy = py[j] - 0.05;
          }
        }
        pos.push(wx, wy, wz);
        nrm.push(u[0], u[1], u[2]);
        // The start/finish line is a separate chequered decal mesh (buildStartLine)
        // laid just above the asphalt here at s=0 — far cleaner than painting a
        // whole road segment solid white, which read as a sprayed-on blob.
        let c;
        if (v === 0 || v === 13) {
          c = grass;
        } else if (v === 1 || v === 12) {
          c = grass;   // kerb ribbons added separately by buildKerbs
        } else if (v === 2 || v === 3 || v === 10 || v === 11) {
          c = line;    // bold white edge line
        } else if (v === 6 || v === 7) {
          if (dash) c = line;          // dashed centre line
          else { const f = wearF(v), g = (hash(k * 13 + v) - 0.5) * 0.016; c = [asphalt[0] * f + g, asphalt[1] * f + g, asphalt[2] * f + g]; }
        } else {
          // asphalt running surface: racing-line wear + subtle aggregate grain
          const f = wearF(v), grain = (hash(k * 13 + v) - 0.5) * 0.016;
          c = [asphalt[0] * f + grain, asphalt[1] * f + grain, asphalt[2] * f + grain];
        }
        col.push(c[0], c[1], c[2]);
      }
    }
    for (let k = 0; k < n; k++) {
      const a = k * V, b = ((k + 1) % n) * V;
      for (let v = 0; v < V - 1; v++) {
        // Wind CCW as seen from above (lateral verts run left->right, so the
        // top face is the front face) — otherwise BACK-face culling drops the
        // whole road. The quad is (k,v)-(k,v+1)-(k+1,v+1)-(k+1,v).
        idxArr.push(a + v, a + v + 1, b + v, a + v + 1, b + v + 1, b + v);
      }
    }
    buildKerbs(track, { pos, nrm, col, idx: idxArr });
    return { pos, nrm, col, idx: idxArr };
  }

  function buildTerrain(track) {
    const { n, px, py, pz, hw, total } = track;
    const pos = [], nrm = [], col = [];
    const idxArr = [];
    const pal = track.def.palette, grass = pal.grass, runoff = pal.runoff;
    const bp = track.bankP;
    const ds = total / n;
    // Run-off aprons on permanent (non-street) circuits: a wide tan gravel/tarmac
    // band where cars actually run wide — fast corners (high |curvature|) and the
    // braking zone at the end of a straight (curvature rising ahead). Street
    // circuits keep runoffAmt ~0 (their walls are right at the edge).
    const APRON_COL = [0.62, 0.55, 0.42];
    const runoffAmt = new Float32Array(n);
    if (!track.def.street) {
      const cur = new Float32Array(n);
      for (let k = 0; k < n; k++) cur[k] = Math.abs(curvature(track, k * ds));
      const aheadNodes = Math.max(1, Math.round(60 / ds));  // ~60 m look-ahead
      for (let k = 0; k < n; k++) {
        // fast-corner term: corners with moderate (not hairpin) curvature shed
        // cars onto the run-off; peaks around 0.012 rad/m then tapers for slow turns
        const corner = Math.max(0, Math.min(1, cur[k] / 0.012)) * Math.max(0, 1 - cur[k] / 0.06);
        // braking-zone term: low curvature now but a corner soon ahead
        const ahead = cur[(k + aheadNodes) % n];
        const brake = Math.max(0, Math.min(1, ahead / 0.012)) * Math.max(0, 1 - cur[k] / 0.004);
        runoffAmt[k] = Math.max(corner, brake);
      }
      // smooth (closed-loop box blur, a few passes) so aprons grow/shrink gently
      for (let it = 0; it < 4; it++) {
        const src = new Float32Array(runoffAmt);
        for (let k = 0; k < n; k++) {
          const a = (k - 1 + n) % n, b = (k + 1) % n;
          runoffAmt[k] = 0.25 * src[a] + 0.5 * src[k] + 0.25 * src[b];
        }
      }
    }
    // Lowest point on the whole lap. The OUTER edge of every terrain ribbon
    // settles to this baseline so that, on circuits with real elevation, the far
    // grass of a raised section (e.g. COTA's Turn 1) never floats up across a
    // lower part of the lap as a plane bisecting the car. The inner seam still
    // tracks the road exactly; only the distant verts drop away.
    let pyMin = Infinity;
    for (let k = 0; k < n; k++) if (py[k] < pyMin) pyMin = py[k];
    // For bridge sections the terrain ribbon stays at ground level so the
    // elevated deck floats above flat ground (supported visually by the bridge
    // pillars in buildProps) instead of pulling the whole ground plane up with it.
    const gY = new Float32Array(py);
    const brs = track.def.bridges;
    if (brs) {
      const ds = total / n;
      for (const b of brs) {
        const cs = b.s * total;
        for (let k = 0; k < n; k++) {
          let d = Math.abs(k * ds - cs);
          d = Math.min(d, total - d);
          if (d < b.halfM) gY[k] -= b.rise * 0.5 * (1 + Math.cos(Math.PI * d / b.halfM));
        }
      }
    }
    // Five lateral verts per side: a gravel/runoff verge at the road edge graded
    // out to grass. The old bright concrete apron has been removed — it read as a
    // glaring light slab flanking the track — so the verge is gravel, not tarmac.
    // Street circuits push the ribbon further from the road edge so barriers
    // fully hide it and it cannot visually bleed onto the road surface.
    const NTV = 5;
    const isStreet = !!track.def.street;
    // flatTerrain: a WIDE, dead-flat grass ribbon (a man-made island like Île
    // Notre-Dame sits ~level with the water, not sloping into it). Spreads the 5
    // verts evenly out to outerW and skips the lateral sag/ease so trees and props
    // sit on real ground all the way out instead of floating over a sunk fallback.
    const flat = !!track.def.flatTerrain;
    const outerW = track.def.terrainOuter || 120;
    const cap = (v) => Math.min(v, outerW);
    const latsL = isStreet ? [-5.0, -cap(10), -cap(20), -cap(55), -outerW]
                : flat ? [-2.2, -cap(outerW * 0.3), -cap(outerW * 0.55), -cap(outerW * 0.8), -outerW]
                : [-2.2, -cap(7.0), -cap(14), -cap(48), -outerW];
    const latsR = isStreet ? [ 5.0,  cap(10),  cap(20),  cap(55),  outerW]
                : flat ? [ 2.2,  cap(outerW * 0.3),  cap(outerW * 0.55),  cap(outerW * 0.8),  outerW]
                : [ 2.2,  cap(7.0),  cap(14),  cap(48),  outerW];
    // flip: the right ribbon needs opposite winding to stay front-facing under BACK culling.
    function ribbon(lats, flip) {
      const base = pos.length / 3;
      const innerSign = lats[0] < 0 ? -1 : 1;     // which side this ribbon is on
      for (let k = 0; k < n; k++) {
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const u = upOf(track, k);
        const w = hw[k];
        const ramt = runoffAmt[k];
        const bankLift = bp ? bp.lift[k] : 0;
        const bankSide = bp ? bp.bsign[k] : 0;
        for (let v = 0; v < NTV; v++) {
          const o = (lats[v] < 0 ? -w : w) + lats[v];
          // Sag: push terrain below road level. Inner vertex gets extra sag on
          // elevation-change sections so the terrain face doesn't visually clip
          // the road surface when the road climbs steeply.
          const localGrade = v === 0 ? Math.abs(py[k] - py[(k + 1) % n]) : 0;
          const innerExtra = v === 0 ? Math.min(localGrade * 2, 1.2) : 0;
          // flat island: tiny constant sag, no lateral fall-off, so the whole
          // ribbon stays a level shelf just below road grade out to outerW.
          const sag = flat ? -0.12
                    : (isStreet ? -1.5 : -0.3) - Math.abs(lats[v]) * 0.018 - innerExtra;
          // inner vert tracks road height; outer verts ease down to the lap's
          // low point (or the flattened bridge ground, whichever is lower). The
          // quadratic ease keeps the run-off apron near track grade and pushes
          // the drop out to the distant grass, so a raised corner reads as an
          // embankment rather than a high plateau hanging over the rest of the lap.
          // Cap the lateral drop so elevated sections look like natural slopes
          // rather than cliff walls (without the cap, a 15 m elevation above pyMin
          // produces a 12.5 % lateral grade — visually a near-vertical wall).
          const t = v / (NTV - 1);
          const ease = t * t;
          const DROP_CAP = 10;
          const rawFloor = Math.min(gY[k], pyMin);
          const floorY = Math.max(py[k] - DROP_CAP, rawFloor);
          // flat island keeps every vert at road grade (no quadratic drop-away);
          // otherwise the outer verts ease down to the lap's low baseline.
          const yBase = flat ? py[k] : py[k] * (1 - ease) + floorY * ease;
          // match the road's banked outer edge: rise along up by the same lift,
          // tapering across the ribbon (full at inner edge, 0 at outer) so the
          // far ground stays flat. frac uses the same formula as buildRoad.
          let by = 0;
          if (bankLift > 0) {
            let frac = (bankSide * o + w) / (2 * w);
            frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
            by = bankLift * frac * (1 - t);
          }
          const wx = px[k] + r[0] * o + u[0] * by;
          const wz = pz[k] + r[2] * o + u[2] * by;
          let wy = yBase + sag + u[1] * by;
          // Clip terrain that rises OVER the track. The near verge verts sit at
          // ~road height, so on the INSIDE of a corner (and at crossings / fold-
          // backs / elevation changes) they can hang over the tarmac of a nearby
          // node and cover the racing surface with grass. Lower any such vert to
          // just under that road, easing the dip with distance so it slopes under
          // rather than stepping.
          //
          // Arc distance alone can't tell "my own road continuing straight" (must
          // leave alone — don't trench the verge) from "the track that curved away
          // right here" (must clip). The discriminator is HEADING: same tangent =
          // same road run → skip; diverging tangent = the track bends/folds over
          // this vert → clip, at ANY arc distance (so tight corners are caught).
          for (let j = 0; j < n; j++) {
            let dd = Math.abs(j - k); dd = dd < n - dd ? dd : n - dd;
            if (dd * ds < 6) continue;                  // always skip the vert's immediate own road
            const ex = wx - px[j], ez = wz - pz[j];
            const d2 = ex * ex + ez * ez;
            // A vert (or the face it anchors) that lands ON another node's tarmac
            // is buried well under that road UNCONDITIONALLY — heading-independent.
            // This kills the green wedge where the inside verge of a corner chords
            // across the racing line (Miami T6, s≈0.11). The same-direction skip
            // below only protects the apron BAND outside the tarmac; a straight's
            // own verge sits ~2 m beyond its edge so it never enters this radius.
            const onEdge = hw[j] - 0.3;
            if (d2 < onEdge * onEdge) {
              if (wy > py[j] - 0.5) wy = py[j] - 0.5;
              continue;
            }
            // Elevated terrain hanging over a LOWER road: an elevation mound
            // (e.g. Miami's s≈0.42 Hard Rock rise, 280 m radius) bulges over a
            // flat part of the track that passes near it, covering the racing
            // line with green from up to ~20 m out — beyond the apron reach
            // below. Carve the road's channel through it: pull terrain that sits
            // clearly ABOVE this road down under it near the edge, easing back up
            // to the mound's natural height further out. Heading-independent, and
            // gated on wy>py[j]+0.3 so flat verges (always at/below grade) are
            // untouched.
            if (wy > py[j] + 0.3) {
              const fr = hw[j] + 26, nr = hw[j] + 0.5;
              if (d2 < fr * fr) {
                const dist = Math.sqrt(d2);
                const tt = Math.max(0, Math.min(1, (dist - nr) / (fr - nr)));
                const tgt = (py[j] - 0.4) * (1 - tt * tt) + wy * (tt * tt);
                if (wy > tgt) wy = tgt;
              }
            }
            const align = track.tx[k] * track.tx[j] + track.tz[k] * track.tz[j];
            if (align > 0.55 && dd * ds < 60) continue; // same-direction nearby road: leave the verge
            const far = hw[j] + 12;
            if (d2 > far * far) continue;               // not over/near this node's tarmac
            const near = hw[j] + 1.0;
            const dist = Math.sqrt(d2);
            const tt = Math.max(0, Math.min(1, (dist - near) / (far - near)));
            const target = (py[j] - 1.6) + tt * tt * 1.6;   // dip under the road, easing back to grade
            if (wy > target) wy = target;
          }
          pos.push(wx, wy, wz);
          nrm.push(0, 1, 0);
          const nz = (hash(k * 3 + v) - 0.5) * 0.04;
          // gravel/runoff verge at the road edge, grading out to grass (no apron)
          const gt = v / (NTV - 1);                          // 0 inner edge → 1 far
          const tc = [lerp(runoff[0], grass[0], gt), lerp(runoff[1], grass[1], gt), lerp(runoff[2], grass[2], gt)];
          col.push(tc[0] + nz, tc[1] + nz, tc[2] + nz);
        }
      }
      for (let k = 0; k < n; k++) {
        const a = base + k * NTV, b = base + ((k + 1) % n) * NTV;
        for (let v = 0; v < NTV - 1; v++) {
          if (flip) idxArr.push(a + v, a + v + 1, b + v, a + v + 1, b + v + 1, b + v);
          else idxArr.push(a + v, b + v, a + v + 1, a + v + 1, b + v, b + v + 1);
        }
      }
    }
    // Street circuits have barriers and buildings right at the road edge —
    // no open terrain apron should be visible beside the car.
    if (!isStreet) { ribbon(latsL, false); ribbon(latsR, true); }
    return { pos, nrm, col, idx: idxArr };
  }

  // A single large flat ground plane under the WHOLE circuit. Street circuits
  // skip the terrain ribbon (their barriers sit at the road edge), which used to
  // leave the city band floating over grey void; open circuits have the ribbon
  // but only out to ~120 m, so a big infield or the far horizon also showed
  // through. This floor fills both: it sits just below the lap's low point and
  // every other mesh (road, terrain, props) renders on top of it. It extends far
  // enough to meet the exp2 fog, so the ground reads continuously to the horizon.
  function buildFloor(track) {
    const { n, px, py, pz } = track;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, pyMin = Infinity;
    for (let k = 0; k < n; k++) {
      if (px[k] < minx) minx = px[k]; if (px[k] > maxx) maxx = px[k];
      if (pz[k] < minz) minz = pz[k]; if (pz[k] > maxz) maxz = pz[k];
      if (py[k] < pyMin) pyMin = py[k];
    }
    // Reach well past the track so the plane always disappears into fog/horizon
    // rather than ending in a visible edge, regardless of camera position.
    const margin = Math.max(1400, (maxx - minx), (maxz - minz));
    const x0 = minx - margin, x1 = maxx + margin;
    const z0 = minz - margin, z1 = maxz + margin;
    const y = pyMin - 0.6;   // just under the lowest terrain so nothing z-fights
    const pal = track.def.palette;
    // Match the terrain ribbon's outer colour (grass) so the seam is invisible on
    // open circuits; on street circuits grass is the neutral urban grey, which
    // reads fine as paved ground. Darkened slightly so the lit road still pops.
    const g = pal.grass || [0.30, 0.34, 0.22];
    const c = [g[0] * 0.88, g[1] * 0.88, g[2] * 0.88];
    const pos = [x0, y, z0,  x1, y, z0,  x1, y, z1,  x0, y, z1];
    const nrm = [0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0];
    const col = [c[0], c[1], c[2],  c[0], c[1], c[2],  c[0], c[1], c[2],  c[0], c[1], c[2]];
    // Double-sided (both windings) so the up-facing ground is never back-face
    // culled regardless of the renderer's winding convention.
    const idx = [0, 1, 2,  0, 2, 3,   0, 2, 1,  0, 3, 2];
    return { pos, nrm, col, idx };
  }

  function buildGate(track) {
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const r = [track.rx[0], track.ry[0], track.rz[0]];
    const t = [track.tx[0], track.ty[0], track.tz[0]];
    const u = upOf(track, 0);
    const w = track.hw[0];
    // Move gate back along track tangent to avoid clipping car at start position
    const backDist = -15;
    const gateX = track.px[0] + t[0] * backDist;
    const gateY = track.py[0];
    const gateZ = track.pz[0] + t[2] * backDist;
    for (const side of [-1, 1]) {
      const o = side * (w + 1.5);
      TracksKit.addBox(out, [gateX + r[0] * o, gateY + 3, gateZ + r[2] * o], [1, 6, 1], [0.85, 0.1, 0.1], [r, u, t]);
    }
    TracksKit.addBox(out, [gateX, gateY + 6.2, gateZ], [w * 2 + 4, 0.8, 1.2], [0.1, 0.1, 0.12], [r, u, t]);
    TracksKit.addBox(out, [gateX, gateY + 6.8, gateZ], [w * 1.4, 0.6, 0.6], [0.95, 0.95, 0.97], [r, u, t]);
    return out;
  }

  // Chequered start/finish line: a grid of black/white squares laid as a thin
  // decal across the road at s=0, sitting a hair above the asphalt and following
  // the local road basis (so it banks/slopes with the surface). Real circuits
  // paint a proper chequered line here — far cleaner than the old solid-white
  // band that filled a whole ~4 m road segment and looked sprayed on.
  function buildStartLine(track) {
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const r = [track.rx[0], track.ry[0], track.rz[0]];
    const t = [track.tx[0], track.ty[0], track.tz[0]];
    const u = upOf(track, 0);
    const w = track.hw[0];
    const P = [track.px[0], track.py[0], track.pz[0]];
    const white = track.def.palette.line || [0.95, 0.95, 0.98];
    const dark = [0.05, 0.05, 0.06];
    const SQ = 0.5;                          // square size (m)
    const rows = 2;                          // two squares deep (~1 m line)
    const depth = rows * SQ;
    const cols = Math.max(2, Math.round((2 * w) / SQ));
    const colW = (2 * w) / cols;
    const lift = 0.05;                        // along the road normal, just above the asphalt
    let base = 0;
    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < cols; ci++) {
        const c = (((ri + ci) & 1) === 0) ? white : dark;
        const o0 = -w + ci * colW, o1 = o0 + colW;
        const d0 = -depth / 2 + ri * SQ, d1 = d0 + SQ;
        const vert = (o, d) => {
          out.pos.push(P[0] + r[0] * o + t[0] * d + u[0] * lift,
                       P[1] + r[1] * o + t[1] * d + u[1] * lift,
                       P[2] + r[2] * o + t[2] * d + u[2] * lift);
          out.nrm.push(u[0], u[1], u[2]);
          out.col.push(c[0], c[1], c[2]);
        };
        // verts: (o0,d0) (o1,d0) (o0,d1) (o1,d1) — same CCW winding as the road
        vert(o0, d0); vert(o1, d0); vert(o0, d1); vert(o1, d1);
        out.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        base += 4;
      }
    }
    return out;
  }


Object.assign(TracksKit, {
  upOf, hash, findCorners, bankingProfile, buildKerbs,
  onKerb, bankAngle, banking, buildRoad, buildTerrain, buildFloor,
  buildGate, buildStartLine,
});
})();
