/* Apex 26 — Tracks engine: turns per-circuit definitions (js/tracks/<id>.js,
   registered on the global TrackDefs list) into resampled closed Catmull-Rom
   splines extruded into 3D meshes. Contract: docs/ARCHITECTURE.md.
   Depends on globals TrackDefs + CircuitPaths (data) and GLX (mesh upload). */
const Tracks = (function () {
  "use strict";

  const SCALE = 1.45;            // scale authored lengths for arcade racing
  const WORLD_UP = [0, 1, 0];

  // ---------- small math (self-contained; doesn't depend on M4/V3) ----------
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- authoring: segment list -> closed control points ----------
  // seg = {t:turnDeg(+right), l:len m, h:hillDelta m, b:bank rad, w:halfWidth}
  // Integrates a heading where direction = (sin t, cos t); +turn = right.
  // A real circuit must net ~±360°; we distribute any deficit as gentle
  // curvature across the whole lap so corner character is preserved and the
  // loop closes without squashing.
  function centerline(segs, baseHW) {
    // pass 1: break into fine steps (cap degrees-per-step to avoid Catmull overshoot)
    const steps = [];
    let totalDeg = 0;
    for (const s of segs) {
      const len = s.l * SCALE;
      const nst = Math.max(1, Math.ceil(Math.max(len / 14, Math.abs(s.t || 0) / 13)));
      const dlDeg = (s.t || 0) / nst;
      for (let i = 0; i < nst; i++) {
        steps.push({ dl: len / nst, deg: dlDeg, dy: (s.h || 0) / nst, w: s.w || baseHW, b: s.b || 0 });
        totalDeg += dlDeg;
      }
    }
    // closure curvature: bend the whole lap toward net ±360
    const target = 360 * (totalDeg >= 0 ? 1 : -1);
    const corr = (target - totalDeg) / steps.length;
    // pass 2: integrate
    const pts = [];
    let x = 0, z = 0, y = 0, th = 0;
    for (const st of steps) {
      th += (st.deg + corr) * Math.PI / 180;
      x += Math.sin(th) * st.dl; z += Math.cos(th) * st.dl; y += st.dy;
      pts.push([x, y, z, st.w, st.b]);
    }
    // distribute residual position + elevation so the loop closes seamlessly
    const N = pts.length;
    const ex = pts[N - 1][0], ez = pts[N - 1][2], ey = pts[N - 1][1];
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      pts[i][0] -= ex * f; pts[i][2] -= ez * f; pts[i][1] -= ey * f;
    }
    // mild closed-loop Laplacian smoothing relaxes overshoot kinks at chicane
    // reversals (raises effective min radius) while keeping the layout shape
    for (let it = 0; it < 2; it++) {
      const sx = pts.map((p) => p[0]), sz = pts.map((p) => p[2]);
      const L = 0.18;
      for (let i = 0; i < N; i++) {
        const a = (i - 1 + N) % N, b = (i + 1) % N;
        pts[i][0] = sx[i] + L * ((sx[a] + sx[b]) * 0.5 - sx[i]);
        pts[i][2] = sz[i] + L * ((sz[a] + sz[b]) * 0.5 - sz[i]);
      }
    }
    return pts;
  }

  // Catmull-Rom (centripetal-ish uniform) for one component
  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  // ---------- build ----------
  // Cheap centreline-only build: runs just the spline engine (positions,
  // tangents, banking, map, banking profile) WITHOUT generating the road /
  // terrain / props meshes or uploading anything to the GPU. Used by TrackMaps
  // to draw the 2D minimaps without paying the full 3D build cost (24 of those
  // on the select screen was a ~16 s first-open stall).
  function buildCenterline(def) {
    const P = def.points, N = P.length;
    const idx = (i) => ((i % N) + N) % N;
    // dense sampling for arc-length parameterization
    const SUB = 16;
    const dx = [], dy = [], dz = [], dhw = [], dbank = [], dlen = [0];
    for (let i = 0; i < N; i++) {
      const a = P[idx(i - 1)], b = P[i], c = P[idx(i + 1)], d = P[idx(i + 2)];
      for (let j = 0; j < SUB; j++) {
        const t = j / SUB;
        const x = cr(a[0], b[0], c[0], d[0], t);
        const y = cr(a[1], b[1], c[1], d[1], t);
        const z = cr(a[2], b[2], c[2], d[2], t);
        dx.push(x); dy.push(y); dz.push(z);
        dhw.push(lerp(b[3], c[3], t));
        dbank.push(lerp(b[4], c[4], t));
        const k = dx.length - 1;
        if (k > 0) dlen.push(dlen[k - 1] + Math.hypot(dx[k] - dx[k - 1], dy[k] - dy[k - 1], dz[k] - dz[k - 1]));
      }
    }
    const M = dx.length;
    // close the gap length
    const closeGap = Math.hypot(dx[0] - dx[M - 1], dy[0] - dy[M - 1], dz[0] - dz[M - 1]);
    const total = dlen[M - 1] + closeGap;

    const n = Math.max(200, Math.round(total / 4));
    const ds = total / n;
    const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
    const tx = new Float32Array(n), ty = new Float32Array(n), tz = new Float32Array(n);
    const rx = new Float32Array(n), ry = new Float32Array(n), rz = new Float32Array(n);
    const hw = new Float32Array(n), bank = new Float32Array(n);

    let di = 0;
    for (let k = 0; k < n; k++) {
      const target = k * ds;
      while (di < M - 2 && dlen[di + 1] < target) di++;
      const seg = dlen[di + 1] - dlen[di] || 1;
      const f = (target - dlen[di]) / seg;
      px[k] = lerp(dx[di], dx[di + 1], f);
      py[k] = lerp(dy[di], dy[di + 1], f);
      pz[k] = lerp(dz[di], dz[di + 1], f);
      hw[k] = lerp(dhw[di], dhw[di + 1], f);
      bank[k] = lerp(dbank[di], dbank[di + 1], f);
    }
    // Localized bridges (figure-8 crossovers): raise one section into a smooth
    // deck so it passes OVER the lower section instead of clipping through it.
    // The cosine bump returns to 0 at the window edges, so the rest of the lap
    // stays flat — no global tilt.
    const bridges = def.bridges;
    if (bridges) for (const b of bridges) {
      const cs = b.s * total;
      for (let k = 0; k < n; k++) {
        let d = Math.abs(k * ds - cs);
        d = Math.min(d, total - d);                 // wrap-around distance
        if (d < b.halfM) py[k] += b.rise * 0.5 * (1 + Math.cos(Math.PI * d / b.halfM));
      }
    }
    // elevation changes — terrain follows road (unlike BRIDGES where gY stays flat)
    const elevs = def.elevations;
    if (elevs) for (const e of elevs) {
      const cs = e.s * total;
      for (let k = 0; k < n; k++) {
        let d = Math.abs(k * ds - cs);
        d = Math.min(d, total - d);
        if (d < e.halfM) py[k] += e.rise * 0.5 * (1 + Math.cos(Math.PI * d / e.halfM));
      }
    }

    // tangents by central difference (wrap), then right + banking
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      let t = norm([px[b] - px[a], py[b] - py[a], pz[b] - pz[a]]);
      tx[k] = t[0]; ty[k] = t[1]; tz[k] = t[2];
      let r = norm(cross(t, WORLD_UP));
      // bake banking: rotate right & up around tangent
      const bk = bank[k];
      if (bk) {
        const u = cross(r, t);
        const cb = Math.cos(bk), sb = Math.sin(bk);
        r = [r[0] * cb + u[0] * sb, r[1] * cb + u[1] * sb, r[2] * cb + u[2] * sb];
      }
      rx[k] = r[0]; ry[k] = r[1]; rz[k] = r[2];
    }

    const track = { def, total, n, px, py, pz, tx, ty, tz, rx, ry, rz, hw, bank, street: !!def.street, meshes: {}, map: null };
    track.map = buildMap(px, pz, n);
    // Banking profile (outer-edge lift per node). Computed once and shared by the
    // road/terrain meshes and the car/camera placement in game.js.
    track.bankP = bankingProfile(track);
    return track;
  }

  // Full build: centreline + 3D meshes (road/terrain/props/gate) uploaded to the
  // GPU. This is the heavy one — only needed to actually render/drive a circuit.
  function build(def, opts) {
    const track = buildCenterline(def);
    // Session darkness drives whether buildings/skyline light their windows.
    // Falls back to the track's default (def.night) when not specified.
    track._night = opts && opts.night != null ? !!opts.night : !!def.night;
    if (typeof GLX !== "undefined" && GLX.createMesh) {
      track.meshes.floor = GLX.createMesh(buildFloor(track));
      track.meshes.road = GLX.createMesh(buildRoad(track));
      const terrainGeo = buildTerrain(track);
      track.terrainGeo = terrainGeo;   // raw geometry kept for the groundY() debug probe
      track.meshes.terrain = GLX.createMesh(terrainGeo);
      const _props = buildProps(track);
      track.meshes.props = GLX.createMesh(_props.out);
      track.meshes.glass = GLX.createMesh(_props.glass);
      track.meshes.gate = GLX.createMesh(buildGate(track));
      track.meshes.startline = GLX.createMesh(buildStartLine(track));
    }
    return track;
  }

  function buildMap(px, pz, n) {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < n; i++) {
      if (px[i] < minx) minx = px[i]; if (px[i] > maxx) maxx = px[i];
      if (pz[i] < minz) minz = pz[i]; if (pz[i] > maxz) maxz = pz[i];
    }
    const w = maxx - minx || 1, h = maxz - minz || 1, sc = 1 / Math.max(w, h);
    const ox = (1 - w * sc) / 2, oz = (1 - h * sc) / 2;
    const out = [], step = Math.max(1, Math.floor(n / 200));
    for (let i = 0; i < n; i += step) out.push([ox + (px[i] - minx) * sc, oz + (maxz - pz[i]) * sc]);
    return out;
  }

  // ---------- sampling ----------
  function sample(track, s, out) {
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const fi = s / L * n;
    const i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    out.p[0] = lerp(track.px[i], track.px[j], f);
    out.p[1] = lerp(track.py[i], track.py[j], f);
    out.p[2] = lerp(track.pz[i], track.pz[j], f);
    out.t[0] = lerp(track.tx[i], track.tx[j], f);
    out.t[1] = lerp(track.ty[i], track.ty[j], f);
    out.t[2] = lerp(track.tz[i], track.tz[j], f);
    out.r[0] = lerp(track.rx[i], track.rx[j], f);
    out.r[1] = lerp(track.ry[i], track.ry[j], f);
    out.r[2] = lerp(track.rz[i], track.rz[j], f);
    out.hw = lerp(track.hw[i], track.hw[j], f);
    return out;
  }

  // Hot path: called several times per car per physics step. Inlined (no inner
  // closure / array allocation) so it produces zero garbage while keeping the
  // exact same math as before.
  function curvature(track, s) {
    const n = track.n, L = track.total, w = 12;
    const tx = track.tx, tz = track.tz;
    let fi = (((s + w) % L + L) % L) / L * n;
    let i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    const h1 = Math.atan2(tx[i] + (tx[j] - tx[i]) * f, tz[i] + (tz[j] - tz[i]) * f);
    fi = (((s - w) % L + L) % L) / L * n;
    i = Math.floor(fi) % n; j = (i + 1) % n; f = fi - Math.floor(fi);
    const h2 = Math.atan2(tx[i] + (tx[j] - tx[i]) * f, tz[i] + (tz[j] - tz[i]) * f);
    let d = h1 - h2;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d / (2 * w);   // rad per meter, + = right
  }

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
    const ka = pal.kerbA, kb = pal.kerbB, grass = pal.grass;
    const asphalt = pal.asphalt || [0.17, 0.18, 0.21];
    const line = pal.line || [0.95, 0.95, 0.98];
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
          c = dash ? line : asphalt;   // dashed centre line
        } else {
          // asphalt running surface with subtle aggregate grain
          const grain = (hash(k * 13 + v) - 0.5) * 0.016;
          c = [asphalt[0] + grain, asphalt[1] + grain, asphalt[2] + grain];
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
    const outerW = track.def.terrainOuter || 120;
    const cap = (v) => Math.min(v, outerW);
    const latsL = isStreet ? [-5.0, -cap(10), -cap(20), -cap(55), -outerW] : [-2.2, -cap(7.0), -cap(14), -cap(48), -outerW];
    const latsR = isStreet ? [ 5.0,  cap(10),  cap(20),  cap(55),  outerW] : [ 2.2,  cap(7.0),  cap(14),  cap(48),  outerW];
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
          const sag = (isStreet ? -1.5 : -0.3) - Math.abs(lats[v]) * 0.018 - innerExtra;
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
          const yBase = py[k] * (1 - ease) + floorY * ease;
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

  // oriented box; basis optional [right,up,fwd]
  function addBox(out, c, sz, col, basis) {
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const hx = sz[0] / 2, hy = sz[1] / 2, hz = sz[2] / 2;
    const corner = (sx, sy, sz2) => [
      c[0] + r[0] * sx * hx + u[0] * sy * hy + f[0] * sz2 * hz,
      c[1] + r[1] * sx * hx + u[1] * sy * hy + f[1] * sz2 * hz,
      c[2] + r[2] * sx * hx + u[2] * sy * hy + f[2] * sz2 * hz,
    ];
    const faces = [
      [[-1, 1, 1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], f],
      [[1, 1, -1], [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [-f[0], -f[1], -f[2]]],
      [[1, 1, 1], [1, -1, 1], [1, -1, -1], [1, 1, -1], r],
      [[-1, 1, -1], [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-r[0], -r[1], -r[2]]],
      [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1], u],
      [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-u[0], -u[1], -u[2]]],
    ];
    for (const fc of faces) {
      const base = out.pos.length / 3;
      const nv = fc[4];
      for (let i = 0; i < 4; i++) {
        const p = corner(fc[i][0], fc[i][1], fc[i][2]);
        out.pos.push(p[0], p[1], p[2]); out.nrm.push(nv[0], nv[1], nv[2]); out.col.push(col[0], col[1], col[2]);
      }
      out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // ---------- richer primitives (beyond the box) ----------
  // Emit one flat convex polygon (3+ coplanar verts in perimeter order), fan-
  // triangulated, auto-oriented so its face points AWAY from `ref` (an interior
  // point) — so callers never have to reason about CCW winding under backface
  // culling. Normal is the face normal (flat shading, matches the box look).
  function emit(out, verts, col, ref) {
    let nv = norm(cross(
      [verts[1][0] - verts[0][0], verts[1][1] - verts[0][1], verts[1][2] - verts[0][2]],
      [verts[2][0] - verts[0][0], verts[2][1] - verts[0][1], verts[2][2] - verts[0][2]]));
    if (ref) {
      let fx = 0, fy = 0, fz = 0;
      for (const v of verts) { fx += v[0]; fy += v[1]; fz += v[2]; }
      fx = fx / verts.length - ref[0]; fy = fy / verts.length - ref[1]; fz = fz / verts.length - ref[2];
      if (nv[0] * fx + nv[1] * fy + nv[2] * fz < 0) { verts = verts.slice().reverse(); nv = [-nv[0], -nv[1], -nv[2]]; }
    }
    const base = out.pos.length / 3;
    for (const v of verts) { out.pos.push(v[0], v[1], v[2]); out.nrm.push(nv[0], nv[1], nv[2]); out.col.push(col[0], col[1], col[2]); }
    for (let i = 1; i < verts.length - 1; i++) out.idx.push(base, base + i, base + i + 1);
  }
  const vadd = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s, p[2] + v[2] * s];

  // Triangular prism / ridge: base sz[0] wide × sz[2] long, rising to a ridge
  // line along the LENGTH at height sz[1]. A-frame roofs, mountain ridges.
  function addPrism(out, c, sz, col, basis) {
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const hx = sz[0] / 2, hl = sz[2] / 2, h = sz[1], ref = vadd(c, u, h * 0.4);
    const b0 = vadd(vadd(c, r, -hx), f, -hl), b1 = vadd(vadd(c, r, hx), f, -hl);
    const b2 = vadd(vadd(c, r, hx), f, hl), b3 = vadd(vadd(c, r, -hx), f, hl);
    const p0 = vadd(vadd(c, u, h), f, -hl), p1 = vadd(vadd(c, u, h), f, hl);
    emit(out, [b0, b1, p0], col, ref); emit(out, [b3, b2, p1], col, ref);  // gables
    emit(out, [b1, b2, p1, p0], col, ref); emit(out, [b0, p0, p1, b3], col, ref);  // slopes
  }

  // Pyramid: base sz[0]×sz[2] up to a single apex at height sz[1]. Peaks, spires.
  function addPyramid(out, c, sz, col, basis) {
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const hx = sz[0] / 2, hl = sz[2] / 2, ref = vadd(c, u, sz[1] * 0.35);
    const b0 = vadd(vadd(c, r, -hx), f, -hl), b1 = vadd(vadd(c, r, hx), f, -hl);
    const b2 = vadd(vadd(c, r, hx), f, hl), b3 = vadd(vadd(c, r, -hx), f, hl);
    const ap = vadd(c, u, sz[1]);
    emit(out, [b0, b1, ap], col, ref); emit(out, [b1, b2, ap], col, ref);
    emit(out, [b2, b3, ap], col, ref); emit(out, [b3, b0, ap], col, ref);
  }

  // Cone: n-gon base radius `rad` up to an apex at `h`. Conifers, spires, towers.
  function addCone(out, c, rad, h, col, seg, basis) {
    seg = seg || 8;
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const ap = vadd(c, u, h), ref = vadd(c, u, h * 0.35);
    const ring = (a) => vadd(vadd(c, r, Math.cos(a) * rad), f, Math.sin(a) * rad);
    for (let i = 0; i < seg; i++) emit(out, [ring(i / seg * 6.2832), ring((i + 1) / seg * 6.2832), ap], col, ref);
  }

  // Cylinder: n-gon column radius `rad`, height `h` (+ top cap). Trunks, towers.
  function addCyl(out, c, rad, h, col, seg, basis) {
    seg = seg || 8;
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const ref = vadd(c, u, h * 0.5), top = vadd(c, u, h);
    const lo = (a) => vadd(vadd(c, r, Math.cos(a) * rad), f, Math.sin(a) * rad);
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 6.2832, a1 = (i + 1) / seg * 6.2832;
      emit(out, [lo(a0), lo(a1), vadd(lo(a1), u, h), vadd(lo(a0), u, h)], col, ref);
      emit(out, [vadd(lo(a0), u, h), vadd(lo(a1), u, h), top], col, ref);
    }
  }

  // Frustum: n-gon truncated cone, base radius `rBase` → top radius `rTop` over
  // height `h`. Stack these for colour-banded mountains (forest → rock → snow).
  function addFrustum(out, c, rBase, rTop, h, col, seg, basis) {
    seg = seg || 8;
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const ref = vadd(c, u, h * 0.5);
    const lo = (a) => vadd(vadd(c, r, Math.cos(a) * rBase), f, Math.sin(a) * rBase);
    const hi = (a) => vadd(vadd(vadd(c, u, h), r, Math.cos(a) * rTop), f, Math.sin(a) * rTop);
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 6.2832, a1 = (i + 1) / seg * 6.2832;
      emit(out, [lo(a0), lo(a1), hi(a1), hi(a0)], col, ref);
    }
  }

  // Organic mountain at world `c`, base radius `baseR`, height `h`. A radial mesh
  // of stacked rings whose per-angle radius is perturbed (vertical ridges/gullies)
  // and whose apex is jittered off-centre, so no two read as the same symmetric
  // cone. Faces are coloured by height — forested base → rock → ragged snow cap.
  // opts: { seg, seed, rough, forest, rock, snow, snowline, right, fwd }.
  function addMountain(out, c, baseR, h, opts) {
    opts = opts || {};
    const seg = opts.seg || 10, seed = opts.seed || 0, rough = opts.rough != null ? opts.rough : 0.34;
    const forest = opts.forest || [0.22, 0.38, 0.22];
    const rock = opts.rock || [0.40, 0.38, 0.36];
    const snow = opts.snow || [0.93, 0.95, 0.99];
    const snowline = opts.snowline != null ? opts.snowline : 0.62;
    const rx = opts.right || [1, 0, 0], fz = opts.fwd || [0, 0, 1];
    const h2 = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233 + seed * 0.137) * 43758.5453; return x - Math.floor(x); };
    const ridgeOff = [];
    for (let i = 0; i < seg; i++) ridgeOff.push(h2(i, 7) - 0.5);            // shared down each ridge
    const rings = [[0, 1], [0.38, 0.64], [0.70, 0.34]];                    // [heightFrac, radiusFrac]
    const pt = (hf, rf, i) => {
      const a = i / seg * 6.2832;
      const rad = baseR * rf * (1 + ridgeOff[i] * rough * 1.4) * (1 + (h2(i, hf * 97 + 3) - 0.5) * rough * 0.7);
      const y = h * (hf + (h2(i, hf * 97 + 9) - 0.5) * rough * 0.12);
      return [c[0] + rx[0] * Math.cos(a) * rad + fz[0] * Math.sin(a) * rad, c[1] + y, c[2] + rx[2] * Math.cos(a) * rad + fz[2] * Math.sin(a) * rad];
    };
    const ref = [c[0], c[1] + h * 0.4, c[2]];
    const colAt = (fy, i) => {
      const fr = fy / h + (h2(i, 99) - 0.5) * 0.07;                        // ragged zone edges
      if (fr > snowline + 0.04) return snow;
      if (fr > snowline - 0.16) return [(rock[0] + snow[0]) / 2, (rock[1] + snow[1]) / 2, (rock[2] + snow[2]) / 2];
      if (fr > 0.34) return rock;
      const j = 0.88 + 0.24 * h2(i, 21);
      return [forest[0] * j, forest[1] * j, forest[2] * j];
    };
    const V = rings.map(([hf, rf]) => { const row = []; for (let i = 0; i < seg; i++) row.push(pt(hf, rf, i)); return row; });
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < seg; i++) {
        const a = V[r][i], b = V[r][(i + 1) % seg], cc = V[r + 1][(i + 1) % seg], d = V[r + 1][i];
        emit(out, [a, b, cc, d], colAt((a[1] + b[1] + cc[1] + d[1]) / 4 - c[1], i + r), ref);
      }
    }
    const apex = [c[0] + (h2(1, 1) - 0.5) * baseR * 0.14, c[1] + h * (0.97 + h2(2, 2) * 0.06), c[2] + (h2(3, 3) - 0.5) * baseR * 0.14];
    const tr = rings.length - 1;
    for (let i = 0; i < seg; i++) {
      const a = V[tr][i], b = V[tr][(i + 1) % seg];
      emit(out, [a, b, apex], colAt((a[1] + b[1] + apex[1]) / 3 - c[1], i), ref);
    }
  }

  // Raw (unguarded) emitters, captured so buildProps can wrap them with the
  // on-track rejection guard below while still reaching the real implementations.
  const RAW = { addBox, addCyl, addCone, addFrustum, addPrism, addPyramid, addMountain };

  function buildProps(track) {
    const { n, px, py, pz, hw } = track;
    const out = { pos: [], nrm: [], col: [], idx: [] };
    // Separate GLASS buffer: reflective window panes are emitted here and drawn
    // with a low-roughness material so the lit shader's env term mirrors the sky
    // (real view-dependent reflection, not a faked colour). Day windows only.
    const glassBuf = { pos: [], nrm: [], col: [], idx: [] };
    const def = track.def, theme = def.theme, pal = def.palette, ds = track.total / n;
    // Session darkness (set by Tracks.build from the chosen time of day) drives
    // window/skyline lighting — so buildings respond to dusk/night even on a
    // day-default circuit, and stay daytime on a night-default one raced by day.
    const NIGHT = track._night != null ? track._night : !!def.night;

    // Rendered-terrain raycast for exact prop anchoring: anchor-based props
    // (walls, fences, trees) sit on the ACTUAL carved/clipped terrain ribbon
    // rather than the closed-form groundYAt approximation, so they never float
    // or sink where the ribbon is lowered (corner-inside verges, the channel cut
    // through an elevation mound — Miami s≈0.11). Triangles are binned into a
    // coarse XZ grid so each lookup is ~O(1); huge distant triangles are skipped
    // (props are never that far out — those fall back to groundYAt).
    const _tg = track.terrainGeo;
    const _CELL = 6; let _grid = null;
    const _buildGrid = () => {
      _grid = new Map(); const pos = _tg.pos, idx = _tg.idx;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const mnx = Math.min(pos[a], pos[b], pos[c]), mxx = Math.max(pos[a], pos[b], pos[c]);
        const mnz = Math.min(pos[a + 2], pos[b + 2], pos[c + 2]), mxz = Math.max(pos[a + 2], pos[b + 2], pos[c + 2]);
        if (mxx - mnx > 30 || mxz - mnz > 30) continue;
        for (let cx = Math.floor(mnx / _CELL); cx <= Math.floor(mxx / _CELL); cx++)
          for (let cz = Math.floor(mnz / _CELL); cz <= Math.floor(mxz / _CELL); cz++) {
            const key = cx + "," + cz; let arr = _grid.get(key); if (!arr) { arr = []; _grid.set(key, arr); } arr.push(t);
          }
      }
    };
    const terrainYAt = (x, z) => {
      if (!_tg || !_tg.idx) return null;
      if (!_grid) _buildGrid();
      const arr = _grid.get(Math.floor(x / _CELL) + "," + Math.floor(z / _CELL));
      if (!arr) return null;
      const pos = _tg.pos; let best = null;
      for (const t of arr) {
        const ia = _tg.idx[t] * 3, ib = _tg.idx[t + 1] * 3, ic = _tg.idx[t + 2] * 3;
        const ax = pos[ia], az = pos[ia + 2], bx = pos[ib], bz = pos[ib + 2], cx = pos[ic], cz = pos[ic + 2];
        const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
        const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
        const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-9) continue;
        const u = (d11 * d20 - d01 * d21) / den, vv = (d00 * d21 - d01 * d20) / den;
        if (u < -0.01 || vv < -0.01 || u + vv > 1.01) continue;
        const y = pos[ia + 1] + u * (pos[ic + 1] - pos[ia + 1]) + vv * (pos[ib + 1] - pos[ia + 1]);
        if (best === null || y > best) best = y;
      }
      return best;
    };

    // ===================================================================
    // Hard guarantee: NO scenery primitive may sit on the racing surface.
    // Every shape — the helpers below AND the raw emitters handed to each
    // circuit's bespoke scenery() — funnels through these guarded wrappers.
    // Before emitting, a primitive's ground footprint is tested against the
    // tarmac at road height; if it covers any part of the road it is dropped
    // whole, so a misplaced or self-overlapping prop (common on street
    // circuits whose straights run close in world space) can never enclose the
    // chase camera or wall off the track. Sub-grade slabs (water, the universal
    // ground floor) sit below road level and are exempt via the topY check.
    // ===================================================================
    let _culled = 0;
    // True if a footprint covers the tarmac at any node it rises above. A
    // circular footprint is given by rad>0 at (cx,cz); otherwise an oriented
    // rectangle with unit XZ axes (arx,arz)/(afx,afz) and half-extents hx,hz.
    const onRoadHit = (cx, cz, topY, rad, arx, arz, afx, afz, hx, hz) => {
      for (let k = 0; k < n; k++) {
        if (topY < py[k] - 0.3) continue;                 // sits below road here
        const w = hw[k];
        const dxc = px[k] - cx, dzc = pz[k] - cz;
        // Reach to the farthest footprint point: an oriented box can extend to its
        // half-DIAGONAL, not just max(hx,hz), so the prefilter must use the diagonal
        // or it will skip road nodes a large rotated box actually covers.
        // Far reject: the Minkowski test below expands the footprint by w on each
        // axis, so the prefilter reach must use the EXPANDED half-extents (a thin
        // box's hit corner can sit at hypot(hx+w, hz+w) from centre).
        const reach = (rad > 0 ? rad + w : Math.hypot(hx + w, hz + w)) + 2;
        if (dxc * dxc + dzc * dzc > reach * reach) continue;   // cheap far reject
        // Minkowski test: expand the footprint by the road half-width `w` and ask
        // whether the road CENTRE-line node falls inside it. This catches a prop
        // overhanging the tarmac even when the prop is THIN and oblique — e.g. a
        // tall building's narrow side face (0.5 m across) that sweeps over a
        // CURVING stretch of track. The previous version sampled five points
        // ACROSS the road and tested point-in-box; a 0.5 m-wide slab crossing the
        // road between those samples slipped through and walled the track off at
        // corners (Miami back-straight cityFront, etc.). Expanding the box by the
        // road radius and testing the single centre point is exact for that case
        // and cheaper (one test per node instead of five).
        const ex = px[k] - cx, ez = pz[k] - cz;
        if (rad > 0) {
          // circle footprint vs road capsule of radius w
          const rr = rad + w;
          if (ex * ex + ez * ez <= rr * rr) return true;
        } else {
          // oriented rectangle expanded by w on each axis
          const a = Math.abs(ex * arx + ez * arz), b = Math.abs(ex * afx + ez * afz);
          if (a <= hx + w && b <= hz + w) return true;
        }
      }
      return false;
    };
    const rejBox = (c, sz, basis) => {
      const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
      const topY = c[1] + Math.abs(sz[0] / 2 * r[1]) + Math.abs(sz[1] / 2 * u[1]) + Math.abs(sz[2] / 2 * f[1]);
      return onRoadHit(c[0], c[2], topY, 0, r[0], r[2], f[0], f[2], sz[0] / 2, sz[2] / 2);
    };
    const rejRad = (c, rad, h, basis) => {
      const u = basis ? basis[1] : [0, 1, 0];
      const topY = c[1] + Math.max(0, h * u[1]) + rad;     // generous top estimate
      return onRoadHit(c[0], c[2], topY, rad, 0, 0, 0, 0, 0, 0);
    };
    // Guarded wrappers shadow the raw emitter names for the whole of buildProps
    // (helpers + the api passed to def.scenery). Each returns false when dropped
    // so a caller can also skip its barrier record (e.g. place/building).
    const addBox = (o, c, sz, col, basis) => { if (rejBox(c, sz, basis)) { _culled++; return false; } RAW.addBox(o, c, sz, col, basis); return true; };
    const addCyl = (o, c, rad, h, col, seg, basis) => { if (rejRad(c, rad, h, basis)) { _culled++; return false; } RAW.addCyl(o, c, rad, h, col, seg, basis); return true; };
    const addCone = (o, c, rad, h, col, seg, basis) => { if (rejRad(c, rad, h, basis)) { _culled++; return false; } RAW.addCone(o, c, rad, h, col, seg, basis); return true; };
    const addFrustum = (o, c, rB, rT, h, col, seg, basis) => { if (rejRad(c, Math.max(rB, rT), h, basis)) { _culled++; return false; } RAW.addFrustum(o, c, rB, rT, h, col, seg, basis); return true; };
    const addPrism = (o, c, sz, col, basis) => { if (rejBox(c, sz, basis)) { _culled++; return false; } RAW.addPrism(o, c, sz, col, basis); return true; };
    const addPyramid = (o, c, sz, col, basis) => { if (rejBox(c, sz, basis)) { _culled++; return false; } RAW.addPyramid(o, c, sz, col, basis); return true; };
    const addMountain = (o, c, baseR, h, opts) => { if (onRoadHit(c[0], c[2], c[1] + h, baseR, 0, 0, 0, 0, 0, 0)) { _culled++; return false; } RAW.addMountain(o, c, baseR, h, opts); return true; };
    // Per-segment driving boundary (lateral limit from the centreline on each
    // side). Initialised to the default runoff, then TIGHTENED wherever a solid
    // barrier (wall/guardrail/tyre wall/grandstand) is actually placed, so the car
    // always stops just before a model instead of clipping into it. WALL_CLEAR is
    // the car's half-width + margin: the limit sits that far inside the barrier
    // face. recordBarrier() fills the boundary along a barrier's node range.
    const WALL_CLEAR = 1.1;
    const RUNOFF_DEFAULT = 9;   // loose default; tightened wherever a barrier sits
    track.barL = new Float32Array(n);
    track.barR = new Float32Array(n);
    for (let k = 0; k < n; k++) { track.barL[k] = hw[k] + RUNOFF_DEFAULT; track.barR[k] = hw[k] + RUNOFF_DEFAULT; }
    // Tighten one node's boundary on a side to a barrier at clearance `gap`.
    const markBarrier = (k, side, gap) => {
      const lim = Math.max(hw[k] - 1.2, hw[k] + gap - WALL_CLEAR);
      const arr = side > 0 ? track.barR : track.barL;
      if (lim < arr[k]) arr[k] = lim;
    };
    // Record a SOLID roadside model so the car stops before it: inner face at
    // `innerGap` beyond the road edge, spanning ±halfM metres along the track.
    // Only tightens where the model is within reach, so models out past the
    // runoff have no effect.
    const blockAt = (k, side, innerGap, halfM) => {
      const half = Math.max(0, Math.round((halfM || 0) / ds));
      for (let d = -half; d <= half; d++) markBarrier(((k + d) % n + n) % n, side, innerGap);
    };
    // Lowest track elevation. Large flat terrain planes (water, sand, lakes) and
    // tall distant backdrops (dunes, ridges, hills) are anchored to this baseline
    // rather than a single point's py — otherwise, on tracks with elevation
    // changes, a plane anchored at a high point floats above the view as a
    // "ceiling" or rises into the foreground as a wall when seen from a lower
    // section. Anchoring the base low keeps terrain below the road everywhere.
    let pyMin = Infinity;
    for (let i = 0; i < n; i++) if (py[i] < pyMin) pyMin = py[i];
    // Terrain surface height `dist` metres beyond the road edge at node k. Mirrors
    // the ribbon built in buildTerrain: the inner verts hug the road, the outer
    // ones ease (quadratically) down to the lap's low point. Roadside props anchor
    // to THIS instead of the road height, so on an elevated or embanked section
    // they sit on the sloping ground rather than floating at the old flat grade.
    const isStreetT = !!track.def.street;
    const gLats = isStreetT ? [5, 10, 20, 55, 120] : [2.2, 7, 14, 48, 120];
    const gSag = isStreetT ? -1.5 : -0.3;
    const groundYAt = (k, dist) => {
      const base = py[k];
      if (dist <= 0) return base;
      let prevD = 0, prevY = base + gSag;
      for (let v = 0; v < 5; v++) {
        const e = (v / 4) * (v / 4);
        const y = base * (1 - e) + pyMin * e + (gSag - gLats[v] * 0.018);
        if (dist <= gLats[v]) return prevY + (y - prevY) * ((dist - prevD) / (gLats[v] - prevD || 1));
        prevD = gLats[v]; prevY = y;
      }
      return prevY;   // beyond the last vert: the lap's low baseline
    };
    // Universal ground floor: one big flat slab at the lap's low point, sized to
    // reach well past the farthest scenery. The terrain ribbon only extends ~120 m
    // from the road, so without this, distant hills/skylines would sit over open
    // sky (reading as "floating"). Tucked just under the ribbon's far edge so it
    // only shows through the gap beyond it. Coloured from the circuit's ground.
    {
      let gx = 0, gz = 0;
      for (let i = 0; i < n; i++) { gx += px[i]; gz += pz[i]; }
      gx /= n; gz /= n;
      let grad = 0;
      for (let i = 0; i < n; i++) grad = Math.max(grad, Math.hypot(px[i] - gx, pz[i] - gz));
      const gc = pal.grass || [0.2, 0.38, 0.18];
      // top sits at pyMin-3 — below the terrain ribbon's far edge and the water
      // planes (~pyMin-2.4) so it fills the gap without hiding lakes/sea.
      addBox(out, [gx, pyMin - 5, gz], [grad * 2 + 1600, 4, grad * 2 + 1600],
             [gc[0] * 0.9, gc[1] * 0.9, gc[2] * 0.9]);
    }
    // True if (x,z) lies on (or within `margin` of) the tarmac of ANY track
    // segment. Uses segment lateral distance (closest point on centerline →
    // perpendicular distance) rather than per-node circles, so hairpin interiors
    // don't create false-positive blobs that swallow outside-of-corner scenery.
    const onTrack = (x, z, margin) => {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = px[j] - px[i], dz = pz[j] - pz[i];
        const len2 = dx * dx + dz * dz;
        if (len2 < 0.01) continue;
        const t = Math.max(0, Math.min(1, ((x - px[i]) * dx + (z - pz[i]) * dz) / len2));
        const cx = px[i] + t * dx, cz = pz[i] + t * dz;
        const lat = Math.hypot(x - cx, z - cz);
        const hwt = hw[i] + (hw[j] - hw[i]) * t;
        if (lat < hwt + margin) return true;
      }
      return false;
    };
    // Tighten the driving boundary along a solid barrier placed from lap-fraction
    // s0→s1 on `side` at clearance `gap` beyond the road edge. Skips nodes where
    // the barrier geometry would be suppressed (a parallel stretch of track), so
    // we never raise a phantom wall the player can't see.
    const recordBarrier = (s0, s1, side, gap) => {
      const k0 = Math.round(s0 * n) % n, k1 = Math.round(s1 * n) % n;
      const span = ((k1 - k0) + n) % n;
      const arr = side > 0 ? track.barR : track.barL;
      for (let i = 0; i <= span; i++) {
        const k = (k0 + i) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const o = side * (hw[k] + gap);
        if (onTrack(px[k] + r[0] * o, pz[k] + r[2] * o, 0.3)) continue;
        const lim = Math.max(hw[k] - 1.2, hw[k] + gap - WALL_CLEAR);
        if (lim < arr[k]) arr[k] = lim;
      }
    };
    const place = (k, side, dist, sz, col) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      // skip if this prop would overlap a parallel stretch of track
      if (onTrack(cx, cz, sz[0] / 2 + 1.5)) {
        console.warn(`[scenery] place SUPPRESSED at k=${k} side=${side}: dist=${dist} sz[0]=${sz[0]} (need dist>${(sz[0]/2+1.5).toFixed(1)})`);
        return;
      }
      // sink the base 0.8m below grade so prop bottoms tuck under the terrain
      // apron instead of co-planar Z-fighting where box meets ground. Anchored to
      // the terrain height at this lateral distance (not the road) so it sits on
      // the ground on elevated/embanked sections.
      const c = [cx, groundYAt(k, dist) + sz[1] / 2 - 0.8, cz];
      if (addBox(out, c, sz, col, [r, u, t]) === false) return;   // on-track: dropped, no phantom barrier
      // solid box → the car must stop before its inner face (sz[0] across, sz[2] long)
      blockAt(k, side, dist - sz[0] / 2, sz[2] / 2);
    };
    const every = (m, fn) => { const stp = Math.max(1, Math.round(m / ds)); for (let k = 0; k < n; k += stp) fn(k); };

    // --- safe-placement helpers (the rules learned from Monaco/Vegas walls) ---
    // prop(): place a roadside object by CLEARANCE. `gap` is how far the box's
    // inner face sits beyond the road edge, so however wide the box is it can
    // never reach the tarmac and loom as a wall against the car. Inherits
    // place()'s onTrack overlap guard and base-sink.
    const prop = (k, side, gap, sz, col) => place(k, side, gap + sz[0] / 2, sz, col);
    // groundPlane(): a large flat feature (water / sand / paddock apron) whose
    // top sits just below the LOCAL track height at k — never the global minimum,
    // which on elevation-changing circuits floats up as a ceiling or rises as a
    // wall. Skipped if it would overlap any stretch of track.
    const groundPlane = (k, side, gap, sz, col) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const o = side * (hw[k] + gap + sz[0] / 2);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      if (onTrack(cx, cz, sz[0] / 2 + 4)) {
        console.warn(`[scenery] groundPlane SUPPRESSED at k=${k} side=${side}: gap=${gap} sz[0]=${sz[0]} (need gap>4)`);
        return;
      }
      addBox(out, [cx, groundYAt(k, gap + sz[0] / 2) - sz[1] / 2 - 1.0, cz], sz, col);
    };
    // backdrop(): a distant scenery box (skyline, hills, dunes) on the horizon.
    // Tall things go far enough back that they never clip the viewport edge, and
    // onTrack keeps them off any parallel stretch. Anchored to local py[k].
    // Box is track-aligned ([t,u,r] basis) so its large face always runs parallel
    // to the road — a forward camera only ever sees the thin sz[2] edge, never
    // the full sz[0]×sz[1] face regardless of the track's world-space heading.
    const backdrop = (k, side, dist, sz, col) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      if (onTrack(cx, cz, sz[0] / 2 + 6)) {
        console.warn(`[scenery] backdrop SUPPRESSED at k=${k} side=${side}: dist=${dist} sz[0]=${sz[0]}`);
        return;
      }
      // distant scenery settles to the lap's low baseline (groundYAt past the last
      // ribbon vert returns it), so a ridge/skyline never floats on a high section
      const cy0 = groundYAt(k, dist) + sz[1] / 2 - 2;
      const greenDom = col[1] > col[0] && col[1] > col[2] * 1.05;
      // GREEN terrain → render as a ROUNDED organic mound (stacked frustums +
      // dome cap) instead of a boxy slab, so wooded hills read as hills. Radius
      // from the footprint; height from sz[1]. A small hash jitter keeps a run
      // of mounds from looking like identical bumps.
      if (greenDom) {
        const foot = groundYAt(k, dist) - 2;
        const R = Math.max(sz[0], sz[2]) * 0.5 * (0.92 + hash(k * 2.3 + side) * 0.2);
        const H = sz[1] * (0.9 + hash(k * 3.7 + side * 1.3) * 0.35);
        const c1 = [col[0], col[1], col[2]];
        const c3 = [col[0] * 0.92, col[1] * 0.94, col[2] * 0.92];   // shaded crown
        addFrustum(out, [cx, foot, cz], R, R * 0.5, H * 0.5, c1, 7);  // rounded base
        addCone(out,    [cx, foot + H * 0.5, cz], R * 0.5, H * 0.5, c3, 7);  // dome cap
        return;
      }
      const isBld = sz[1] > 26 && sz[1] > sz[2];
      // Night skyline walls get a small glow floor so they aren't black planes.
      const bcol = (isBld && NIGHT)
        ? [Math.max(col[0], 0.20), Math.max(col[1], 0.19), Math.max(col[2], 0.24)] : col;
      addBox(out, [cx, cy0, cz], sz, bcol, [t, u, r]);
      // If this distant box reads as a BUILDING — tall, taller than it is deep,
      // and not green terrain — give it window bands + a parapet so a city
      // skyline doesn't render as flat dark planes. Wide/low/dune silhouettes
      // (dunes, mesas) are left as plain masses.
      if (isBld) {
        const lit = NIGHT;
        // Night skyline windows are HDR so the distant towers glow (and bloom)
        // as a lit skyline rather than dim grey bands — matches the near-building
        // glass curtain walls. Day keeps a reflective-glass tint.
        const win = lit ? [1.45, 1.28, 0.84]
                        : [Math.min(1, col[0] * 1.6 + 0.05), Math.min(1, col[1] * 1.6 + 0.05), Math.min(1, col[2] * 1.6 + 0.07)];
        const darkWin = [col[0] * 0.55, col[1] * 0.55, col[2] * 0.6];
        const floors = Math.max(2, Math.min(4, Math.round(sz[1] / 18)));
        const fh = sz[1] / floors;
        const base = cy0 - sz[1] / 2;
        for (let i = 1; i < floors; i++) {
          const wc = (lit && hash(k * 7.7 + i * 3.3 + dist * 0.1) < 0.34) ? darkWin : win;
          // band on the camera-facing (u × sz2) face; thin in up, proud in sz2
          addBox(out, [cx, base + (i + 0.5) * fh, cz], [sz[0] * 0.98, fh * 0.5, sz[2] * 1.03], wc, [t, u, r]);
        }
        // parapet cap so the roofline isn't a bare slab edge
        addBox(out, [cx, base + sz[1] + 0.6, cz], [sz[0] * 1.02, 1.2, sz[2] * 1.04], col, [t, u, r]);
      }
    };

    // ---------- composite scenery models (beyond single boxes) ----------
    // Resolve a trackside anchor: ground position + the track basis [r,u,t] at
    // node k, `dist` beyond the road edge on `side`. Shared by the model helpers.
    const anchor = (k, side, dist) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      // Sit on the ACTUAL rendered terrain when available (exact — no float/sink
      // where the ribbon is carved or sags); fall back to the groundYAt estimate
      // for points the terrain mesh doesn't cover (far out / off the ribbon).
      const ty = terrainYAt(cx, cz);
      return { c: [cx, ty == null ? groundYAt(k, dist) : ty, cz], r, u, t };
    };
    // Conifer/pine: tapered trunk + stacked cones. col = needle green.
    const pine = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 3)) {
        console.warn(`[scenery] pine SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      // per-instance size jitter so a treeline doesn't read as identical clones
      const j = 0.85 + hash(k * 3.7 + side * 1.3 + dist) * 0.3;
      const c2 = [col[0] * 0.86, col[1] * 0.86, col[2] * 0.82];   // shaded lower needles
      addCyl(out, a.c, 0.35 + h * 0.02, h * 0.4, [0.30, 0.22, 0.13], 6, b);
      let y = h * 0.3;
      // 4 stacked cones (was 3) — adds a fuller silhouette for little cost; the
      // lowest skirt cone uses a darker shade for depth.
      for (let i = 0; i < 4; i++) {
        const w = 2.7 * j * (1 - i * 0.21);
        addCone(out, vadd(a.c, a.u, y), w, h * 0.32, i === 0 ? c2 : col, 7, b);
        y += h * 0.18 * j;
      }
    };
    // Broadleaf tree: short trunk + a rounded canopy (squat wide cone + cap cone).
    const tree = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 4)) {
        console.warn(`[scenery] tree SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      // per-instance jitter so adjacent broadleaves vary in size/shape
      const j = 0.85 + hash(k * 2.9 + side * 1.7 + dist) * 0.3;
      const c2 = [col[0] * 0.88, col[1] * 0.9, col[2] * 0.84];   // sunlit upper foliage
      addCyl(out, a.c, 0.4, h * 0.4, [0.32, 0.23, 0.13], 6, b);
      // three rounded layers (was two): squat base + mid + sunlit cap give the
      // canopy more volume without a big vertex hit.
      addCone(out, vadd(a.c, a.u, h * 0.30), (2.9 + h * 0.12) * j, h * 0.46, col, 8, b);
      addCone(out, vadd(a.c, a.u, h * 0.52), (2.2 + h * 0.08) * j, h * 0.34, col, 7, b);
      addCone(out, vadd(a.c, a.u, h * 0.74), (1.4 + h * 0.05) * j, h * 0.26, c2, 6, b);
    };
    // Palm: tall thin trunk + a crown of drooping frond prisms.
    const palm = (k, side, dist, h, frond) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 4)) {
        console.warn(`[scenery] palm SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      addCyl(out, a.c, 0.3, h, [0.45, 0.36, 0.22], 6, b);
      const top = vadd(a.c, a.u, h);
      for (let i = 0; i < 6; i++) {
        const ang = i / 6 * 6.2832, dir = [Math.cos(ang), 0, Math.sin(ang)];
        const fr = [dir[0] * a.r[0] + dir[2] * a.t[0], 0, dir[0] * a.r[2] + dir[2] * a.t[2]];
        const fc = vadd(vadd(top, fr, 2.4), a.u, -0.4);
        addPrism(out, fc, [1.6, 0.5, 4.4], frond || [0.18, 0.40, 0.16], [fr, a.u, [-fr[2], 0, fr[0]]]);
      }
    };
    // Distant mountain peak (world coords), pyramid so it reads as a summit, with
    // a lower foot skirt so it doesn't look like a floating spike. Simple/clean —
    // use mountain() for organic, colour-zoned, snow-capped summits.
    const peak = (x, z, baseY, w, h, col) => {
      // Skip if the pyramid's footprint (outer base radius w*0.75) reaches tarmac.
      if (onTrack(x, z, w * 0.75)) {
        console.warn(`[scenery] peak SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: w=${w}`);
        return;
      }
      addPyramid(out, [x, baseY, z], [w, h, w], col, null);
      addPyramid(out, [x, baseY - 2, z], [w * 1.5, h * 0.45, w * 1.5], [col[0] * 0.9, col[1] * 0.92, col[2] * 0.9], null);
    };
    // Organic mountain (world coords): irregular craggy summit with height colour
    // zones (forest → rock → snow). opts passes seed/snowline/colours — see
    // addMountain. A low foot skirt blends the base into the ground.
    const mountain = (x, z, baseY, w, h, opts) => {
      // Skip if the skirt footprint (radius w*0.62) would reach the tarmac.
      // This prevents backdrop mountains from clipping through the racing surface
      // when extra < w*0.62 (ring placed too close relative to mountain width).
      if (onTrack(x, z, w * 0.62)) {
        console.warn(`[scenery] mountain SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: w=${w}`);
        return;
      }
      opts = opts || {};
      addFrustum(out, [x, baseY - 2, z], w * 0.62, w * 0.42, h * 0.18,
                 opts.forest || [0.20, 0.34, 0.20], 9, null);   // skirt
      addMountain(out, [x, baseY, z], w * 0.5, h, opts);
    };
    // Mountain ridge segment (world coords) — a prism whose ridge runs along
    // `ang` (radians, in the XZ plane). Chain these for a jagged range.
    const ridge = (x, z, baseY, ang, len, w, h, col) => {
      // Skip if footprint half-extent reaches tarmac.
      if (onTrack(x, z, Math.max(len, w) * 0.5)) {
        console.warn(`[scenery] ridge SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: len=${len} w=${w}`);
        return;
      }
      const f = [Math.cos(ang), 0, Math.sin(ang)], r = [-f[2], 0, f[0]];
      addPrism(out, [x, baseY, z], [w, h, len], col, [r, [0, 1, 0], f]);
    };
    // Tiered grandstand running along the track: a raked seating wedge (prism on
    // its side reads as a rake), a back shell and a flat roof slab on posts.
    // Uses addBox directly to avoid place()'s per-box onTrack guard, which fires
    // false-positives at hairpins (La Source at Spa, etc.). Single guard uses the
    // crowd inner face — only skips if the seating literally overlaps the tarmac.
    const grandstand = (s, side, gap, len, shell, crowd) => {
      const k = Math.round(s * n) % n;
      const halfFrac = (len / 2) / track.total;
      recordBarrier(s - halfFrac, s + halfFrac, side, gap);
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      // Skip only if crowd inner face (= road edge + gap) literally sits on track.
      const oInner = side * (hw[k] + gap);
      const ifx = px[k] + r[0] * oInner, ifz = pz[k] + r[2] * oInner;
      if (onTrack(ifx, ifz, 0)) {
        console.warn(`[scenery] grandstand SUPPRESSED at s=${s} side=${side}: gap=${gap} (inner face on track)`);
        return;
      }
      // Back shell — center at gap+7.5 beyond road edge
      const oShell = side * (hw[k] + gap + 7.5);
      const cShell = [px[k] + r[0] * oShell, groundYAt(k, gap + 7.5) + 6 - 0.8, pz[k] + r[2] * oShell];
      addBox(out, cShell, [10, 12, len], shell || [0.40, 0.41, 0.46], [r, u, t]);
      // Raked crowd — center at gap+4.5 beyond road edge
      const oCrowd = side * (hw[k] + gap + 4.5);
      const cCrowd = [px[k] + r[0] * oCrowd, groundYAt(k, gap + 4.5) + 3.5 - 0.8, pz[k] + r[2] * oCrowd];
      addBox(out, cCrowd, [9, 7, len - 2], crowd || [0.55, 0.32, 0.30], [r, u, t]);
      // Roof slab cantilevered over the crowd, lifted on the up axis
      const a = anchor(k, side, gap + 5);
      addBox(out, vadd(a.c, a.u, 13), [12, 0.8, len + 2], [0.86, 0.88, 0.92], [a.r, a.u, a.t]);
    };

    // ---------- linear track furniture (run along the track from s0→s1) ----------
    // Walk nodes from lap-fraction s0 to s1 (wrapping), ~stepM apart.
    const along = (s0, s1, stepM, fn) => {
      const k0 = Math.round(s0 * n) % n, k1 = Math.round(s1 * n) % n;
      const span = ((k1 - k0) + n) % n || n, step = Math.max(1, Math.round(stepM / ds));
      for (let i = 0; i <= span; i += step) fn((k0 + i) % n);
    };
    // Continuous solid wall (concrete / pit wall) at clearance `gap` beyond the edge.
    const wall = (s0, s1, side, gap, h, col, thick) => {
      const a = thick || 0.5;
      recordBarrier(s0, s1, side, gap);
      along(s0, s1, 6, (k) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], a / 2)) {
          console.warn(`[scenery] wall SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addBox(out, vadd(p.c, p.u, h / 2), [a, h, 6.3], col || [0.78, 0.78, 0.80], [p.r, p.u, p.t]);
      });
    };
    // Catch / debris fence: posts + a pale mesh panel (reads as see-through wire).
    const fence = (s0, s1, side, gap, h, col) => {
      along(s0, s1, 5, (k) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 0.5)) {
          console.warn(`[scenery] fence SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addCyl(out, p.c, 0.13, h, [0.28, 0.28, 0.30], 5, [p.r, p.u, p.t]);          // post
        addBox(out, vadd(p.c, p.u, h * 0.55), [0.05, h * 0.9, 5.2], col || [0.72, 0.74, 0.78], [p.r, p.u, p.t]);  // mesh
      });
    };
    // Armco guardrail: a waist-high steel rail on posts (open-circuit edge).
    const guardrail = (s0, s1, side, gap, col) => {
      recordBarrier(s0, s1, side, gap);
      along(s0, s1, 4, (k) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 0.5)) {
          console.warn(`[scenery] guardrail SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addCyl(out, p.c, 0.09, 0.7, [0.5, 0.5, 0.52], 4, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 0.7), [0.18, 0.45, 4.2], col || [0.82, 0.82, 0.85], [p.r, p.u, p.t]);
      });
    };
    // Stacked-tyre barrier with a coloured conveyor-belt cap.
    const tyreWall = (s0, s1, side, gap, capCol) => {
      recordBarrier(s0, s1, side, gap);
      along(s0, s1, 3.4, (k) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 1.0)) {
          console.warn(`[scenery] tyreWall SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addCyl(out, p.c, 1.0, 0.9, [0.10, 0.10, 0.11], 7, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 0.95), [2.0, 0.3, 3.6], capCol || [0.9, 0.9, 0.92], [p.r, p.u, p.t]);
      });
    };
    // Low clipped hedge / continuous treeline.
    const hedge = (s0, s1, side, gap, h, col) => {
      along(s0, s1, 4, (k) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 1.2)) {
          console.warn(`[scenery] hedge SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addBox(out, vadd(p.c, p.u, h / 2), [2.4, h, 4.3], col || [0.18, 0.36, 0.16], [p.r, p.u, p.t]);
      });
    };
    // forestEdge(): a DENSE treeline (mix of pine/tree) from s0→s1 on `side`,
    // GUARANTEED not to clip barriers. Foliage is placed so the canopy's INNER
    // edge stays at least `gap` beyond the road edge — i.e. the per-tree `dist`
    // accounts for the canopy radius (which grows with tree height), so a tree
    // called at small gap can never poke its canopy through a wall/hedge/fence.
    //   opts: { density, hMin, hMax, col, col2, pineFrac }
    const forestEdge = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const hMin = opts.hMin != null ? opts.hMin : 7;
      const hMax = opts.hMax != null ? opts.hMax : 13;
      const pineCol = opts.col || [0.16, 0.36, 0.16];
      const treeCol = opts.col2 || [0.20, 0.40, 0.16];
      const pineFrac = opts.pineFrac != null ? opts.pineFrac : 0.55;
      // density 0..1 → step 7m (sparse) … 3m (dense). Default ~medium-dense.
      const dens = opts.density != null ? Math.max(0.05, Math.min(1, opts.density)) : 0.7;
      const step = 7 - dens * 4;
      along(s0, s1, step, (k) => {
        const s = hash(k * 4.3 + side * 1.1);
        const h = hMin + s * (hMax - hMin);
        const isPine = hash(k * 6.7 + side * 0.7) < pineFrac;
        // Canopy outer radius: pine peaks at ~2.7*1.15 (jitter max) for its widest
        // skirt cone; tree's base cone is (2.9 + h*0.12)*1.15. Add a small margin.
        const jMax = 1.15;
        const canopyR = isPine ? 2.7 * jMax + 0.4
                               : (2.9 + h * 0.12) * jMax + 0.4;
        // dist so the canopy's inner edge sits `gap` beyond the road edge
        const dist = gap + canopyR;
        // stagger a back row slightly for depth on the densest treelines
        const back = (dens > 0.6 && hash(k * 8.9 + side) < 0.4) ? canopyR * 1.4 : 0;
        if (isPine) pine(k, side, dist + back, h, pineCol);
        else        tree(k, side, dist + back, h, treeCol);
      });
    };

    // ---------- structures ----------
    // neonFacade(): the shared, DETAILED night facade for both building kinds —
    // an INSET-WINDOW curtain wall (the b6fbf4a style) on the track-facing face:
    // proud dark structural frame rails + vertical mullions, with recessed glass
    // panes set behind them so the facade reads as a real glazed building from any
    // angle. Most panes are DARK; only a minority are lit (mostly warm office
    // light, a few neon) so it stays mostly dark — "less neon, more detail".
    // Neon is ADDED ONLY on neon-city (street_night) tracks: a couple of thin
    // edge lines + a slightly higher share of neon-lit panes. Other night tracks
    // get warm-lit windows and no neon. `side` gives the track-facing direction.
    // neonAmt (0..1) sets how "neon" the facade is: 0 = a plain GENERAL building
    // (warm office windows, no neon edges); ~0.3 = mostly warm with a few neon
    // panes; 1 = a full neon tower (neon-tinted panes + glowing edge lines + a
    // cornice). This lets general buildings and neon buildings share one facade.
    const neonFacade = (mid, bb, side, sw, sh, sd, neon, seed, neonAmt) => {
      const u = bb[1];
      const frameCol = [0.12, 0.12, 0.15];                       // dark structural frame
      const dark = [0.035, 0.035, 0.055];                        // unlit glass pane
      const warm = [1.0, 0.80, 0.46];
      const nc = [neon[0] * 0.95, neon[1] * 0.95, neon[2] * 0.95];
      const litShare = 0.20 + neonAmt * 0.08, neonShare = neonAmt * 0.7;
      const rows = Math.max(4, Math.min(15, Math.round(sh / 3.4)));
      const fh = sh / rows, frameT = 0.30, railH = Math.max(0.4, fh * 0.24), winH = Math.max(0.5, fh - railH);
      // Draw the inset curtain wall on ONE vertical face. nAxis = outward axis idx
      // (0=r,2=t), nSign = its sign, nHalf = half-extent along it; wAxis = the
      // in-plane horizontal axis idx, faceW = that face's width. Box dims are built
      // per-axis so the same code does the track-facing face AND the two sides.
      const drawFace = (nAxis, nSign, nHalf, wAxis, faceW, sOff, simple) => {
        const nVec = bb[nAxis], wVec = bb[wAxis];
        // SIMPLE sides = a coarse pane grid only (no rails / mullions / neon edges)
        // so the sides are cheap and the city can stay dense.
        const cols = simple ? Math.max(2, Math.min(4, Math.round(faceW / 4.2))) : Math.max(2, Math.min(8, Math.round(faceW / 2.6)));
        const rowN = simple ? Math.max(3, Math.min(9, Math.round(sh / 5.0))) : rows;
        const fhh = sh / rowN, winHH = Math.max(0.5, fhh - railH);
        const fBase = vadd(mid, nVec, nSign * (nHalf + 0.34));
        const gBase = vadd(mid, nVec, nSign * (nHalf + 0.04));
        const dim = (thin, hgt, wid) => { const a = [0, 0, 0]; a[nAxis] = thin; a[1] = hgt; a[wAxis] = wid; return a; };
        if (!simple) for (let i = 0; i <= rowN; i++) addBox(out, vadd(fBase, u, (i / rowN - 0.5) * sh), dim(frameT, railH, faceW * 1.005), frameCol, bb);
        for (let c = 0; c < cols; c++) {
          const cx = (-0.5 + (c + 0.5) / cols) * faceW;
          for (let ri = 0; ri < rowN; ri++) {
            const ry = (-0.5 + (ri + 0.5) / rowN) * sh;
            let col = dark;
            if (hash(seed + sOff + c * 12.9 + ri * 7.3) < litShare) {
              const tw = 0.65 + hash(seed + sOff + c * 5.5 + ri * 2.2) * 0.5;
              col = hash(seed + sOff + c * 3.1 + ri * 1.7) < neonShare
                ? [nc[0] * tw, nc[1] * tw, nc[2] * tw] : [warm[0] * tw, warm[1] * tw, warm[2] * tw];
            }
            addBox(out, vadd(vadd(gBase, wVec, cx), u, ry), dim(0.08, winHH, (faceW / cols) * 0.82), col, bb);
          }
        }
        if (simple) return;
        const nm = Math.max(2, Math.min(5, cols - 1));
        for (let c = 1; c <= nm; c++) addBox(out, vadd(fBase, wVec, (-0.5 + c / (nm + 1)) * faceW), dim(frameT, sh, 0.4), frameCol, bb);
        if (neonAmt > 0.3) {
          const ST = Math.min(0.4, faceW * 0.04);
          for (const dr of [-1, 1]) addBox(out, vadd(fBase, wVec, dr * faceW * 0.5), dim(frameT * 1.05, sh * 0.96, ST), nc, bb);
          addBox(out, vadd(vadd(mid, nVec, nSign * (nHalf + 0.36)), u, sh * 0.48), dim(frameT * 1.1, Math.min(0.5, sh * 0.018), faceW), nc, bb);
        }
      };
      drawFace(0, -side, sw / 2, 2, sd, 0, false);   // track-facing facade: full detail
      drawFace(2, 1, sd / 2, 0, sw, 137, true);      // +t side: simple
      drawFace(2, -1, sd / 2, 0, sw, 311, true);     // -t side: simple
    };
    // Multi-storey building with real MASSING — not a single box. Picks an
    // archetype (flat / stepped / tapered / tower) by hash and stacks setback
    // sections so the silhouette reads as a built structure. Each section is a
    // solid core + inset glazing bands (corner columns show) + a mullion rib;
    // the roofline gets a parapet and hash-varied clutter. `gap` is the inner
    // face clearance from the road edge (dist = gap + w/2).
    const building = (k, side, gap, w, h, d, opts) => {
      opts = opts || {};
      if (w > d * 2.5)
        console.warn(`[scenery] building: w=${w} >> d=${d} at k=${k} — dimensions likely swapped`);
      const dist = gap + w / 2;
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      const ifx = p.c[0] - p.r[0] * side * w / 2;
      const ifz = p.c[2] - p.r[2] * side * w / 2;
      // Keep the façade clear of the track. Margin accounts for the proud window/
      // mullion overhang AND, on street circuits, the edge barrier — so buildings
      // sit BEHIND the wall instead of faces poking through onto the racing line.
      const clearMargin = def.street ? 3.0 : 1.2;
      if (onTrack(ifx, ifz, clearMargin)) {
        console.warn(`[scenery] building SUPPRESSED at k=${k} side=${side}: gap=${gap} w=${w} (too close to track)`);
        return;
      }
      // Lit windows follow the SESSION (NIGHT), not a baked flag — otherwise a
      // casino marked lit:true glows neon in broad daylight. opts.lit:false can
      // still force a building to stay unlit even at night.
      const nightLit = NIGHT && opts.lit !== false;
      let body = opts.wall || [0.62, 0.64, 0.68];
      // Night city-glow floor: ambient + neon spill keep real building walls off
      // pure black at night. Without this, dark-walled night facades (e.g. Vegas
      // [0.20]) read as black silhouettes once the sun is low.
      if (nightLit) body = [Math.max(body[0], 0.26), Math.max(body[1], 0.24), Math.max(body[2], 0.30)];
      // HDR-bright lit glazing. The lit shader's emissive term reads the albedo
      // directly, so window colours >1 glow strongly and trip the bloom threshold
      // — this is what turns flat dark boxes into a skyline that actually lights
      // up at night. Day glass stays a reflective blue-grey window panel.
      const winBase = opts.windowCol || opts.window || [1.0, 0.88, 0.55];
      const HDR = 1.85;
      const litGlass = [winBase[0] * HDR, winBase[1] * HDR, winBase[2] * HDR];
      const darkW = [0.05, 0.06, 0.11];                       // unlit pane at night
      // Day glazing: a muted, slightly-darker blue-grey window — desaturated so
      // daytime shows LESS colour (the neon window tint barely reads by day).
      const dayGlass = opts.window
        ? [Math.min(0.9, opts.window[0] * 0.25 + 0.30), Math.min(0.9, opts.window[1] * 0.25 + 0.33), Math.min(0.9, opts.window[2] * 0.25 + 0.38)]
        : [0.34, 0.40, 0.50];
      const glass = nightLit ? litGlass : dayGlass;
      const floorH = opts.floor || 4.0;
      // One mass section, yBase → yBase+sh. Two distinct design languages:
      //  • NIGHT  → a glowing GLASS CURTAIN WALL. The lit skin is the dominant
      //    surface, broken only by a fine grid of thin dark mullions + floor
      //    spandrels. No bright-pane-on-dark-wall checker. Some towers stay dark
      //    for contrast; skin brightness/tint vary per building for skyline depth.
      //  • DAY    → a solid wall with flush bright window bands set into it.
      const section = (yBase, sw, sh, sd) => {
        if (nightLit) {
          // NIGHT = a dark neutral-grey concrete mass (NOT tinted by the neon, so
          // the floodlights render it grey, never a glowing colour) with shared
          // thin-pinstripe detailing on top. Mostly dark; the neon is a few lines.
          const lum = (body[0] + body[1] + body[2]) / 3;
          const bv = lum > 0.4 ? 0.22 : 0.15;
          const bodyTint = [bv, bv, bv * 1.12];
          const ok = addBox(out, vadd(p.c, p.u, yBase + sh / 2), [sw, sh, sd], bodyTint, b);
          if (ok === false) return false;
          // Landmark buildings: full neon on neon-city tracks, a lighter touch on
          // any other night circuit so every night track gets some neon.
          neonFacade(vadd(p.c, p.u, yBase + sh / 2), b, side, sw, sh, sd, winBase, k * 7.1 + side * 3.3, theme === "street_night" ? 0.85 : 0.32);
          return ok;
        }
        // DAY: solid wall mass with flush bright window bands cut into a grid.
        // Walls tuned near-black for night glow look like dark navy boxes in day
        // (even their lit faces, and especially shadowed sides). So in daylight a
        // dark night-wall is REPLACED by a light concrete/tan tone (varied per
        // building); genuinely light facades (cream landmarks) keep their colour.
        const wallLuma = (body[0] + body[1] + body[2]) / 3;
        const cv = hash(k * 1.7 + side * 2.9);
        // Muted, darker daytime concrete (the user wants day darker / less colour);
        // very light cream landmarks are pulled down a touch too.
        const dayWall = wallLuma > 0.45
          ? [body[0] * 0.78, body[1] * 0.78, body[2] * 0.78]
          : [0.42 + cv * 0.12, 0.42 + cv * 0.11, 0.41 + cv * 0.10];
        const ok = addBox(out, vadd(p.c, p.u, yBase + sh / 2), [sw, sh, sd], dayWall, b);   // solid wall mass
        const rows = Math.max(2, Math.min(8, Math.round(sh / floorH)));
        const fh = sh / rows;
        // Inset-window facade: a proud structural frame surrounds glass set back
        // near the wall face. Frame protrudes 0.38 m (dayMull shade); glass only
        // 0.05 m — clear depth difference from any angle so panes read as inset.
        const dayMull = [dayWall[0] * 0.82, dayWall[1] * 0.82, dayWall[2] * 0.82];
        const frameOut = 0.38;
        const glassOut = 0.05;
        const frameT   = 0.30;
        const glassT   = 0.08;
        const fR = -side * (sw / 2 + frameOut);
        const gR = -side * (sw / 2 + glassOut);
        const fBase = vadd(p.c, p.r, fR);
        const gBase = vadd(p.c, p.r, gR);
        const railH = Math.max(0.45, fh * 0.28);
        for (let r = 0; r <= rows; r++) {
          addBox(out, vadd(fBase, p.u, yBase + r * fh), [frameT, railH, sd], dayMull, b);
        }
        const winH = Math.max(0.6, fh - railH);
        // Reflective glass bands routed to the glass mesh (real sky reflection);
        // warm-light (Mediterranean) facades get dark recessed windows on props.
        const dMed = dayWall[0] > 0.6 && dayWall[0] > dayWall[2] + 0.08;
        for (let r = 0; r < rows; r++) {
          const ry01 = (r + 0.5) / rows;
          if (dMed) {
            addBox(out, vadd(gBase, p.u, yBase + (r + 0.5) * fh), [glassT, winH, sd * 0.94], [dayWall[0] * 0.34, dayWall[1] * 0.30, dayWall[2] * 0.26], b);
          } else {
            const t01 = 0.42 + ry01 * 0.16;
            addBox(glassBuf, vadd(gBase, p.u, yBase + (r + 0.5) * fh), [glassT, winH, sd * 0.94], [t01 * 0.62, t01 * 0.72, t01 * 0.92], b);
          }
        }
        const nm = Math.max(2, Math.min(4, Math.round(sd / 6)));
        for (let c = 1; c <= nm; c++) {
          const off = -sd / 2 + (c / (nm + 1)) * sd;
          addBox(out, vadd(vadd(fBase, p.u, yBase + sh / 2), p.t, off), [frameT, sh, 0.5], dayMull, b);
        }
        const nmR = sw > 18 ? 2 : 1;
        for (let c = 1; c <= nmR; c++) {
          const off = -sw / 2 + (c / (nmR + 1)) * sw;
          addBox(out, vadd(vadd(p.c, p.u, yBase + sh / 2), p.r, off), [0.5, sh, sd * 1.02], dayMull, b);
        }
        return ok;
      };
      // Ground-floor plinth, grounded but never near-black (day) / glows (night).
      const plH = Math.min(3.2, h * 0.14);
      const plinth = nightLit ? [body[0] * 0.8, body[1] * 0.8, body[2] * 0.9]
                              : [Math.max(body[0] * 1.2, 0.40), Math.max(body[1] * 1.2, 0.40), Math.max(body[2] * 1.2, 0.44)];
      addBox(out, vadd(p.c, p.u, plH / 2), [w * 1.02, plH, d * 1.02], plinth, b);
      // Archetype: favour slender TAPERED + individually-crowned forms over
      // stacked rectangular prisms. Short blocks stay simple; mid/tall ones taper
      // and always get a sculpted crown (never a bare cut-off box top). The crown
      // colour follows the lit glass at night so the whole tower reads as one form.
      // Day crowns/caps take the SAME lifted concrete tone as the day walls — not
      // the dark night body — so from above (and at the roofline) the tops aren't
      // dark navy caps on an otherwise light tower.
      const crownCol = nightLit ? [glass[0] * 0.30, glass[1] * 0.30, glass[2] * 0.32]
                                : [Math.max(body[0] * 1.1, 0.42), Math.max(body[1] * 1.1, 0.42), Math.max(body[2] * 1.1, 0.44)];
      const t = hash(k * 4.1 + side * 2.7);
      const arch = opts.arch || (h < 20 ? "flat"
                                : h < 40 ? (t < 0.5 ? "flat" : "taper")
                                : (t < 0.30 ? "setback" : t < 0.64 ? "taper" : "spire"));
      let topY = h, topW = w, topD = d;
      const diag = Math.max(w, d);
      if (arch === "flat") {
        if (section(0, w, h, d) === false) return;
      } else if (arch === "setback") {
        // base + a narrower upper joined by a short tapered collar (not an abrupt
        // box step) so the setback reads as sculpted massing.
        const h1 = h * 0.55, collar = h * 0.05;
        if (section(0, w, h1, d) === false) return;
        addFrustum(out, vadd(p.c, p.u, h1), diag * 0.5, diag * 0.40, collar, crownCol, 8, b);
        section(h1 + collar, w * 0.72, h - h1 - collar, d * 0.72);
        topW = w * 0.72; topD = d * 0.72;
      } else if (arch === "taper") {
        // Windowed shaft takes almost the whole height; the frustum is only a SMALL
        // tapered cap. (A tall frustum was a giant blank angled wall with no window
        // detail — the "angled wall / blank box" look.) A couple of glazing rings
        // keep even that small cap from reading blank.
        const bh = h * 0.90;
        if (section(0, w, bh, d) === false) return;
        addFrustum(out, vadd(p.c, p.u, bh), diag * 0.5, diag * 0.33, h - bh, crownCol, 8, b);
        addCyl(out, vadd(p.c, p.u, bh + (h - bh) * 0.4), diag * 0.40, (h - bh) * 0.16, glass, 8, b);
        topW = w * 0.5; topD = d * 0.5; topY = h;
      } else { // spire: windowed shaft → a short tapered cap → a tall lit spire
        const bh = h * 0.86, crownH = h * 0.10;
        if (section(0, w, bh, d) === false) return;
        addFrustum(out, vadd(p.c, p.u, bh), diag * 0.5, diag * 0.30, crownH, crownCol, 8, b);
        topY = bh + crownH; topW = w * 0.36; topD = d * 0.36;
      }
      // Sculpted crown — a short chamfered cap, then a hash-varied finial so no
      // two rooflines match and none is a flat box edge.
      {
        const capR = Math.max(topW, topD) * 0.5, capH = Math.min(3.5, h * 0.07 + 1);
        addFrustum(out, vadd(p.c, p.u, topY), capR, capR * 0.45, capH, crownCol, 6, b);
        topY += capH;
        const rt = hash(k * 3.3 + side * 1.9);
        if (h > 30 && rt < 0.58) {
          // slim spire/mast — taller on taller towers; lit tip beacon at night
          const spH = 4 + hash(k * 5.1 + side) * Math.min(20, h * 0.26);
          addCyl(out, vadd(p.c, p.u, topY), 0.22, spH, [0.5, 0.5, 0.56], 4, b);
          if (nightLit) addBox(out, vadd(p.c, p.u, topY + spH), [0.9, 0.9, 0.9], [3.2, 0.4, 0.3], b);
        } else if (rt < 0.82) {
          addBox(out, vadd(p.c, p.u, topY + 1.3), [topW * 0.32, 2.6, topD * 0.32], [0.30, 0.30, 0.34], b);  // plant housing
        }
        // else: clean chamfered cap, no finial
      }
      // Night signage: a bright HDR neon band wrapping the crown of lit buildings
      // — the casino / strip glow. Hue varies per building (warm gold, ice cyan,
      // hot magenta, electric green). Plus a red aircraft-warning beacon on tall
      // towers. Both are HDR so they bloom; gated to night-lit buildings only.
      if (nightLit) {
        const NEON = [[2.6, 1.5, 0.5], [0.5, 1.9, 2.6], [2.6, 0.6, 1.7], [0.9, 2.4, 0.9], [2.2, 0.9, 2.4]];
        if (hash(k * 6.7 + side * 1.3) < 0.62) {
          const neon = NEON[Math.floor(hash(k * 8.9 + side * 2.1) * NEON.length) % NEON.length];
          const by = topY * (0.5 + hash(k * 2.3 + side) * 0.32);
          addBox(out, vadd(p.c, p.u, by), [topW * 1.05, 0.7, topD * 1.05], neon, b);
        }
        if (h > 38) addBox(out, vadd(p.c, p.u, topY + 2.4), [1.1, 1.1, 1.1], [3.2, 0.4, 0.3], b);  // red beacon
      }
      blockAt(k, side, gap, d / 2);   // solid: stop the car before the façade
    };
    // neonTower(): the INNER-ring filler model — a dark detailed tower sharing the
    // neonFacade() treatment with the building() landmarks. `kind` varies the
    // silhouette (setback / tiered ziggurat / podium-and-tower) so the street wall
    // isn't a row of identical boxes.
    const neonTower = (k, side, dist, w, h, d, neon, kind, tone, neonAmt) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const reach = Math.max(w, d);
      const ifx = a.c[0] - a.r[0] * side * reach / 2, ifz = a.c[2] - a.r[2] * side * reach / 2;
      if (onTrack(ifx, ifz, def.street ? 3.0 : 1.2)) return;
      const bodyCol = NIGHT ? (tone && tone.n || [0.14, 0.14, 0.17]) : (tone && tone.d || [0.40, 0.41, 0.44]);
      const cap = NIGHT ? [0.09, 0.09, 0.12] : [0.31, 0.32, 0.35];
      const na = neonAmt == null ? (theme === "street_night" ? 1 : 0) : neonAmt;  // 0=general … 1=neon
      const neonOn = NIGHT && na > 0.3;                                           // bright neon trim?
      const warm = [1.0, 0.80, 0.46];                                            // general office light
      // Day window grid around a mass centre. Modern buildings get REFLECTIVE
      // GLASS panes routed to the glass mesh (real sky reflection via the shader);
      // warm-light "Mediterranean" tones (Monaco) instead get small recessed dark
      // windows on the cream wall, so they read as stone apartments, not glass.
      const med = bodyCol[0] > 0.6 && bodyCol[0] > bodyCol[2] + 0.08;   // warm light wall
      const medWin = [bodyCol[0] * 0.34, bodyCol[1] * 0.30, bodyCol[2] * 0.26];   // dark window reveal
      const dayGridAt = (cen, sw, sh, sd) => {
        const rows = Math.max(4, Math.round(sh / 3.4));
        // Draw the window grid on one vertical face (track-facing or a side). Same
        // per-axis box-dim trick as neonFacade so the sides are glazed too.
        const dface = (nAxis, nSign, nHalf, wAxis, faceW, simple) => {
          const cols = simple ? Math.max(2, Math.min(4, Math.round(faceW / 4.0))) : Math.max(2, Math.min(7, Math.round(faceW / 2.4)));
          const rowN = simple ? Math.max(3, Math.min(9, Math.round(sh / 5.0))) : rows;
          const gB = vadd(cen, b[nAxis], nSign * (nHalf + 0.03));
          const dim = (thin, hgt, wid) => { const a = [0, 0, 0]; a[nAxis] = thin; a[1] = hgt; a[wAxis] = wid; return a; };
          for (let c = 0; c < cols; c++) {
            const cx = (-0.5 + (c + 0.5) / cols) * faceW;
            for (let r = 0; r < rowN; r++) {
              const ry01 = (r + 0.5) / rowN, ctr = vadd(vadd(gB, b[wAxis], cx), b[1], (-0.5 + ry01) * sh);
              if (med) addBox(out, ctr, dim(0.06, (sh / rowN) * 0.42, (faceW / cols) * 0.42), medWin, b);
              else { const t01 = 0.42 + ry01 * 0.16; addBox(glassBuf, ctr, dim(0.08, (sh / rowN) * 0.62, (faceW / cols) * 0.6), [t01 * 0.62, t01 * 0.72, t01 * 0.92], b); }
            }
          }
        };
        dface(0, -side, sw / 2, 2, sd, false);   // track-facing: full
        dface(2, 1, sd / 2, 0, sw, true);        // +t side: simple
        dface(2, -1, sd / 2, 0, sw, true);       // -t side: simple
      };
      // One stacked section centred at up=yb+sh/2, optionally offset along tangent.
      const sec = (yb, sw, sh, sd, seed, to) => {
        const cen = vadd(vadd(a.c, a.u, yb + sh / 2), b[2], to || 0);
        addBox(out, cen, [sw, sh, sd], bodyCol, b);
        if (NIGHT) neonFacade(cen, b, side, sw, sh, sd, neon, seed, na);
        else dayGridAt(cen, sw, sh, sd);
      };
      if (kind === "tiered") {
        let yb = 0, tw = w, td = d;
        const frac = [0.46, 0.32, 0.22];
        for (let i = 0; i < 3; i++) { const th = h * frac[i]; sec(yb, tw, th, td, k * 3.7 + side * 1.9 + i * 11); yb += th; tw *= 0.66; td *= 0.66; }
        addBox(out, vadd(a.c, a.u, h + 0.5), [tw, 1.0, td], cap, b);
      } else if (kind === "podium") {
        const podH = h * 0.28;
        sec(0, w * 1.35, podH, d * 1.35, k * 3.1 + side);          // wide retail podium
        sec(podH, w * 0.7, h - podH, d * 0.7, k * 5.1 + side * 2);  // slender tower
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.45, 1.0, d * 0.45], cap, b);
      } else if (kind === "slab") {
        sec(0, w, h, d, k * 3.7 + side * 1.9);                     // clean tall slab
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.92, 1.0, d * 0.92], cap, b);
      } else if (kind === "twin") {
        const td = d * 0.4, off = d * 0.28;
        for (let i = 0; i < 2; i++) {
          const o = i === 0 ? -off : off, th = h * (i === 0 ? 1 : 0.82);
          sec(0, w * 0.9, th, td, k * 3.1 + side + i * 7, o);
          addBox(out, vadd(vadd(a.c, a.u, th + 0.4), b[2], o), [w * 0.6, 0.8, td * 0.8], cap, b);
        }
      } else if (kind === "jenga") {                              // offset stacked boxes
        const n2 = 4, bh = h / n2;
        for (let i = 0; i < n2; i++) sec(i * bh, w * 0.86, bh, d * 0.72, k + i * 9.1, (hash(k + i * 5.5) - 0.5) * d * 0.5);
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.5, 1.0, d * 0.5], cap, b);
      } else if (kind === "cylinder") {                           // round glass tower
        const R = reach * 0.5, segs = 14;
        addCyl(out, a.c, R, h, bodyCol, segs, b);
        const rings = Math.max(3, Math.min(14, Math.round(h / 6)));
        for (let r = 1; r < rings; r++) {
          const isLit = NIGHT && hash(k + r * 3.3 + side) < (0.26 + na * 0.18);
          const col = isLit ? (neonOn ? neon : warm) : [0.06, 0.06, 0.09];
          addCyl(out, vadd(a.c, a.u, r * (h / rings)), R * 1.01, (h / rings) * (isLit ? 0.22 : 0.1), col, segs, b);
        }
        addCyl(out, vadd(a.c, a.u, h), R * 0.6, 1.4, cap, segs, b);
      } else if (kind === "spire") {                              // tapered shaft + antenna
        const bh = h * 0.74, R = reach * 0.5;
        addFrustum(out, a.c, R, R * 0.42, bh, bodyCol, 8, b);
        const rings = Math.max(3, Math.round(bh / 7));
        for (let r = 1; r < rings; r++) {
          const isLit = NIGHT && hash(k + r * 2.1 + side) < (0.26 + na * 0.16);
          const col = isLit ? (neonOn ? neon : warm) : [0.06, 0.06, 0.09];
          addCyl(out, vadd(a.c, a.u, r * (bh / rings)), R * (1 - 0.55 * r / rings) * 1.02, (bh / rings) * (isLit ? 0.2 : 0.09), col, 8, b);
        }
        addCyl(out, vadd(a.c, a.u, bh), 0.35, h - bh, neonOn ? neon : [0.4, 0.4, 0.45], 4, b);
        if (NIGHT) addBox(out, vadd(a.c, a.u, h), [0.9, 0.9, 0.9], [3.0, 0.6, 0.4], b);  // beacon
      } else if (kind === "pyramid") {                            // Luxor-style taper
        const R = reach * 0.62;
        addFrustum(out, a.c, R, R * 0.08, h, bodyCol, 4, b);
        if (neonOn) {
          for (const e of [-1, 1]) addBox(out, vadd(vadd(a.c, a.u, h * 0.5), b[2], e * R * 0.5), [R, h * 0.96, 0.3], [neon[0] * 0.7, neon[1] * 0.7, neon[2] * 0.7], b);
        }
        if (NIGHT) addBox(out, vadd(a.c, a.u, h + 1.2), [1.4, 1.4, 1.4], neonOn ? [3.0, 1.6, 0.6] : [3.0, 0.6, 0.4], b);  // apex beacon
      } else if (kind === "screen") {                             // giant neon screen building (BRIGHT)
        sec(0, w, h, d, k * 3.7 + side * 1.9);
        const sc = neonOn ? [neon[0] * 1.25, neon[1] * 1.25, neon[2] * 1.25] : (NIGHT ? [warm[0] * 0.9, warm[1] * 0.9, warm[2] * 0.9] : [0.30, 0.33, 0.40]);
        addBox(out, vadd(vadd(a.c, a.u, h * 0.56), b[0], -side * (w / 2 + 0.25)), [0.3, h * 0.66, d * 0.82], sc, b);
        if (neonOn) addBox(out, vadd(vadd(a.c, a.u, h * 0.56), b[0], -side * (w / 2 + 0.28)), [0.1, h * 0.6, d * 0.74], [neon[0] * 0.4, neon[1] * 0.4, neon[2] * 0.4], b);
      } else if (kind === "clad") {                               // neon-banded tower (BRIGHT)
        sec(0, w, h, d, k * 3.7 + side * 1.9);
        if (neonOn) { const bands = Math.max(4, Math.round(h / 5)); for (let i = 1; i < bands; i++) addBox(out, vadd(a.c, a.u, i * (h / bands)), [w * 1.04, (h / bands) * 0.22, d * 1.04], neon, b); }
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.6, 1.0, d * 0.6], cap, b);
      } else { // setback
        const setH = h * 0.84;
        sec(0, w, setH, d, k * 3.7 + side * 1.9);
        addBox(out, vadd(a.c, a.u, setH + (h - setH) / 2), [w * 0.72, h - setH, d * 0.72], bodyCol, b);
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.5, 1.0, d * 0.5], cap, b);
      }
      blockAt(k, side, dist - reach / 2, reach / 2);
    };
    // neonSign(): a tall thin illuminated sign blade beside the track — vertical
    // signage to dress the gaps between towers. Pole + a slim bright neon panel.
    const neonSign = (k, side, dist, h, neon) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 2)) return;
      addBox(out, vadd(a.c, a.u, h * 0.5), [0.6, h, 0.6], [0.10, 0.10, 0.12], b);          // mast
      const col = NIGHT ? neon : [neon[0] * 0.4 + 0.3, neon[1] * 0.4 + 0.3, neon[2] * 0.4 + 0.3];
      addBox(out, vadd(a.c, a.u, h * 0.62), [0.9, h * 0.6, 0.35], col, b);                  // vertical blade
      blockAt(k, side, dist - 0.6, 0.6);
    };
    // cityFront(): a CONTINUOUS, ALIGNED street wall of buildings from lap-fraction
    // s0→s1 on `side` at clearance `gap`. Steps along the track (~18–26 m) and emits
    // one building() per step with hash-varied height/width/colour so it reads as a
    // real facade rather than scattered boxes. The inner face is held at a constant
    // setback (`gap`) so the row aligns. On night circuits (or opts.lit) windows are
    // emissive-bright so the skyline is legible after dark. Inherits building()'s
    // onTrack guard and blockAt() boundary.
    //   opts: { minH, maxH, depth, palette:[colA,colB,…], lit, windowCol, step }
    const cityFront = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const minH = opts.minH != null ? opts.minH : 16;
      const maxH = opts.maxH != null ? opts.maxH : 46;
      const depth = opts.depth != null ? opts.depth : 22;
      const lit = opts.lit === false ? false : NIGHT;
      const palette = (opts.palette && opts.palette.length) ? opts.palette
        : (lit ? [[0.17, 0.19, 0.27], [0.20, 0.21, 0.28], [0.15, 0.17, 0.24], [0.22, 0.20, 0.26]]
               : [[0.60, 0.62, 0.66], [0.66, 0.64, 0.60], [0.56, 0.58, 0.62], [0.70, 0.68, 0.64]]);
      // Per-building window tint when lit: a spread of warm office light, cool
      // daylight-balanced glass and the occasional saturated accent so a long
      // street wall shimmers with colour instead of one flat hue. HDR-boosted in
      // building(), so these are kept near 1.0 here.
      const WINTINTS = [
        [0.98, 0.86, 0.56], [0.92, 0.82, 0.60],   // warm office
        [0.62, 0.76, 1.00], [0.72, 0.84, 0.98],   // cool glass
        [1.00, 0.70, 0.85], [0.70, 0.95, 0.90],   // soft accents
      ];
      const step = opts.step || 22;
      let idx = 0;
      along(s0, s1, step, (k) => {
        const s = hash(k * 5.3 + side * 0.9);
        const w = 14 + s * 16;                    // 14–30 m wide facade unit
        // Height = blend of a per-building hash and a slow per-cluster hash so the
        // skyline has runs of related heights (a real street), not jarring
        // tall-short-tall noise. Occasional unit spikes into a landmark tower.
        const hLocal = hash(k * 9.1 + side * 1.7);
        const hCluster = hash(Math.floor(k / 3) * 2.7 + side * 1.3);
        let h = minH + (0.6 * hLocal + 0.4 * hCluster) * (maxH - minH);
        if (hash(k * 1.7 + side * 3.1) < 0.10) h = Math.min(maxH * 1.5, h * 1.5);  // landmark tower
        const col = palette[((idx % palette.length) + palette.length) % palette.length];
        const wcol = lit ? WINTINTS[Math.floor(hash(k * 2.1 + side) * WINTINTS.length) % WINTINTS.length] : undefined;
        building(k, side, gap, w, h, depth + (s - 0.5) * depth * 0.3, {
          wall: col, floor: opts.floor || (4 + s * 3),
          lit: lit, windowCol: opts.windowCol || wcol,
          setback: h > minH + (maxH - minH) * 0.66,   // tall units step back at the top
        });
        idx++;
      });
    };
    // Tapered tower (control tower, spire) + optional antenna mast.
    const tower = (k, side, dist, baseW, h, opts) => {
      opts = opts || {};
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      const ifx = p.c[0] - p.r[0] * side * baseW / 2;
      const ifz = p.c[2] - p.r[2] * side * baseW / 2;
      if (onTrack(ifx, ifz, 0)) {
        console.warn(`[scenery] tower SUPPRESSED at k=${k} side=${side}: dist=${dist} baseW=${baseW}`);
        return;
      }
      addFrustum(out, p.c, baseW * 0.5, baseW * 0.32, h, opts.col || [0.70, 0.72, 0.75], opts.seg || 8, b);
      if (opts.cap) addBox(out, vadd(p.c, p.u, h), [baseW * 0.7, baseW * 0.18, baseW * 0.7], opts.capCol || [0.2, 0.2, 0.24], b);
      if (opts.mast) addCyl(out, vadd(p.c, p.u, h + (opts.cap ? baseW * 0.18 : 0)), 0.18, opts.mast, [0.3, 0.3, 0.32], 4, b);
      blockAt(k, side, dist - baseW * 0.5, baseW * 0.5);   // solid base
    };
    // Advertising hoarding / billboard: a panel on two slim posts.
    const billboard = (k, side, gap, w, h, col) => {
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], w / 2 + 1)) {
        console.warn(`[scenery] billboard SUPPRESSED at k=${k} side=${side}: gap=${gap} w=${w} (need gap>${(w/2+1).toFixed(1)})`);
        return;
      }
      for (const o of [-w * 0.4, w * 0.4]) addCyl(out, vadd(p.c, p.t, o), 0.12, h, [0.2, 0.2, 0.22], 4, b);
      addBox(out, vadd(p.c, p.u, h + 1.6), [0.3, 3.2, w], col || [0.9, 0.85, 0.2], b);
      blockAt(k, side, gap, w * 0.4);   // posts + panel face → stop before it
    };
    // Overhead gantry spanning the track (start/scoring/DRS): two legs + a beam.
    const gantry = (s, h, col) => {
      const k = Math.round(s * n) % n, c = col || [0.16, 0.16, 0.19];
      const aL = anchor(k, -1, 1.5), aR = anchor(k, 1, 1.5), u = aL.u;
      addCyl(out, aL.c, 0.3, h, c, 6, [aL.r, u, aL.t]); addCyl(out, aR.c, 0.3, h, c, 6, [aR.r, u, aR.t]);
      addBox(out, [px[k] + u[0] * h, py[k] + u[1] * h, pz[k] + u[2] * h], [hw[k] * 2 + 5, 0.9, 1.4], c, [aL.r, u, aL.t]);
    };
    // Marshal post / flag bunker: a small orange-roofed box with a pole.
    const marshalPost = (k, side, gap) => {
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 3)) {
        console.warn(`[scenery] marshalPost SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
        return;
      }
      addBox(out, vadd(p.c, p.u, 1.3), [2.2, 2.6, 2.2], [0.85, 0.86, 0.88], b);
      addBox(out, vadd(p.c, p.u, 2.7), [2.5, 0.4, 2.5], [0.95, 0.55, 0.08], b);
      addCyl(out, vadd(p.c, p.r, side * 1.4), 0.08, 4, [0.4, 0.4, 0.42], 4, b);
      blockAt(k, side, gap, 1.3);   // solid hut
    };
    // Bush / shrub clump (low rounded greenery).
    const bush = (k, side, dist, col) => {
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 2)) {
        console.warn(`[scenery] bush SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      addCone(out, vadd(p.c, p.u, 0.3), 1.6, 2.2, col || [0.20, 0.38, 0.18], 6, b);
    };

    // continuous barrier wall hugging both edges on street circuits — going off
    // means hitting a wall, not open grass. Day circuits get red/white armco
    // striping; night circuits get a dark rail.
    if (def.street) {
      // Barriers are straight panels — span a few nodes each instead of one box
      // per ~4 m node, roughly halving the barrier vertex cost on long street laps.
      const WH = 1.1, WT = 0.4, STEP = 2;
      for (const side of [-1, 1]) {
        for (let k = 0; k < n; k += STEP) {
          const kn = (k + STEP) % n;
          const r0 = [track.rx[k], track.ry[k], track.rz[k]];
          const r1 = [track.rx[kn], track.ry[kn], track.rz[kn]];
          const u0 = upOf(track, k);
          const barrierOffset = def.barrierGap != null ? def.barrierGap : (def.id === "monaco" ? 2.0 : 0.35);
          const o0 = side * (hw[k] + barrierOffset), o1 = side * (hw[kn] + barrierOffset);
          const ax = px[k] + r0[0] * o0, ay = py[k], az = pz[k] + r0[2] * o0;
          const bx = px[kn] + r1[0] * o1, by = py[kn], bz = pz[kn] + r1[2] * o1;
          const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
          const len = Math.hypot(bx - ax, by - ay, bz - az) + 0.05;
          const f = norm([bx - ax, by - ay, bz - az]);
          const rr = norm(cross(f, u0));
          const striped = (Math.floor(k / (STEP * 3)) % 2) === 0;
          const col = def.night ? [0.18, 0.18, 0.22]
            : (striped ? [0.92, 0.92, 0.94] : [0.85, 0.18, 0.16]);
          addBox(out, [cx, cy + WH / 2, cz], [WT, WH, len], col, [rr, [0, 1, 0], f]);
        }
      }
      // Record the boundary for EVERY node (the geometry loop steps by 2, which
      // would leave gaps), both sides, at the barrier offset.
      const off = def.barrierGap != null ? def.barrierGap : (def.id === "monaco" ? 2.0 : 0.35);
      for (let k = 0; k < n; k++) { markBarrier(k, -1, off); markBarrier(k, 1, off); }
    }
    // floodlights for night tracks
    if (def.night) every(70, (k) => {
      for (const side of [-1, 1]) {
        place(k, side, 10, [0.5, 9, 0.5], [0.1, 0.1, 0.12]);
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const o = side * (hw[k] + 10);
        addBox(out, [px[k] + r[0] * o, py[k] + 8.6, pz[k] + r[2] * o], [3, 1, 1.4], [1, 1, 0.95], [r, [0, 1, 0], [track.tx[k], 0, track.tz[k]]]);
      }
    });
    // tire barriers at outside of tight corners on permanent (non-street) circuits
    if (!def.street) {
      for (const c of findCorners(track, 0.014)) {
        const outside = c.sign > 0 ? -1 : 1;
        const lo = Math.max(1, Math.round(c.lo * 0.35));
        const hi = Math.max(1, Math.round(c.hi * 0.35));
        const step = Math.max(2, Math.round(3.5 / ds));
        for (let i = -lo; i <= hi; i += step) {
          const k = ((c.k + i) + n) % n;
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          const o = outside * (hw[k] + 2.2);
          const slen = ds * step * 1.1;
          addBox(out, [px[k] + r[0] * o, py[k] + 0.45, pz[k] + r[2] * o],
                 [1.0, 0.9, slen], [0.24, 0.22, 0.20], [r, u, t]);
          // record the tyre barrier along its span so the car stops just short of it
          for (let d = 0; d < step; d++) markBarrier((k + d) % n, outside, 2.2);
        }
      }
    }

    // marshal post + signal board every 270 m on alternating sides (skip street circuits with continuous barriers)
    if (!def.street) {
      every(270, (k) => {
        const side = hash(k * 7) < 0.5 ? -1 : 1;
        place(k, side, hw[k] + 25, [0.55, 1.3, 0.55], [0.95, 0.55, 0.08]);
        place(k, side, hw[k] + 25, [1.2, 0.75, 0.08], [0.95, 0.95, 0.97]);
      });
    }

    if (theme === "green") {
      every(26, (k) => {
        const s = hash(k);
        for (const side of [-1, 1]) {
          if (hash(k * 2 + side) < 0.5) continue;
          const h = 5 + s * 6, d = 9 + s * 8;
          place(k, side, d, [1.2, 1.4, 1.2], [0.32, 0.22, 0.12]);   // trunk
          place(k, side, d, [3.5, h, 3.5], [0.12 + s * 0.06, 0.36, 0.14]);  // canopy
        }
      });
      // denser forest for Spa (Ardennes forest setting)
      
      // occasional grandstand
      every(140, (k) => place(k, hash(k) < 0.5 ? -1 : 1, 14, [4, 6, 22], [0.5, 0.5, 0.55]));
    } else if (theme === "desert") {
      every(34, (k) => { for (const side of [-1, 1]) if (hash(k + side) > 0.6) place(k, side, 8 + hash(k) * 10, [2 + hash(k) * 3, 1.5, 2], [0.62, 0.5, 0.34]); });
    } else if (theme === "street_day" || theme === "street_night" || theme === "modern") {
      // UNIFIED CITY GENERATOR — every city circuit gets its own character via a
      // per-track STYLE: a distinct neon palette, a building-MODEL mix (regular
      // building silhouettes + a few bright "neon" types), a concrete tone, and a
      // neonBias (how many buildings are neon vs plain). At night EVERY building
      // gets at least a touch of neon; by day they're plain detailed concrete. Two
      // staggered rows give depth; sign blades + retail boxes dress the gaps.
      const NC = {
        mag: [0.95, 0.15, 0.55], cyan: [0.18, 0.85, 0.98], gold: [1.00, 0.78, 0.12],
        violet: [0.62, 0.22, 1.0], blue: [0.22, 0.48, 1.0], orange: [1.00, 0.42, 0.08],
        red: [1.0, 0.16, 0.22], teal: [0.0, 0.92, 0.78], white: [0.86, 0.92, 1.0],
        green: [0.25, 1.0, 0.45], pink: [1.0, 0.30, 0.62], lime: [0.66, 1.0, 0.22],
        ice: [0.55, 0.82, 1.0], yellow: [1.0, 0.92, 0.25], purple: [0.82, 0.30, 0.96],
        rose: [1.0, 0.45, 0.55], amber: [1.00, 0.55, 0.12],
      };
      const BLD = ["setback", "tiered", "podium", "slab", "twin", "jenga", "cylinder", "spire"];
      // fh / bh = front / back-row height [min, range]. Real-circuit character:
      // Vegas/Singapore tall; Baku = low sandstone Old City + tall flame towers;
      // Monaco = SHORT tan Mediterranean apartment blocks; Jeddah/Madrid/Miami mid.
      const STYLES = {
        vegas:     { neon: [NC.mag, NC.gold, NC.red, NC.cyan, NC.violet, NC.pink, NC.orange], bias: 0.62, fh: [18, 50], bh: [44, 78],
                     kinds: ["setback", "tiered", "podium", "slab", "twin", "jenga"], neonKinds: ["screen", "clad"], tone: null },
        singapore: { neon: [NC.cyan, NC.blue, NC.teal, NC.white, NC.green, NC.violet], bias: 0.42, fh: [20, 52], bh: [48, 88],
                     kinds: ["podium", "setback", "cylinder", "spire", "twin", "slab"], neonKinds: ["clad", "screen"], tone: { n: [0.12, 0.13, 0.18], d: [0.44, 0.46, 0.50] } },
        baku:      { neon: [NC.orange, NC.red, NC.amber, NC.gold, NC.cyan, NC.white], bias: 0.40, fh: [10, 26], bh: [38, 84],
                     kinds: ["setback", "slab", "tiered", "podium", "spire", "cylinder"], neonKinds: ["clad"], tone: { n: [0.16, 0.14, 0.13], d: [0.62, 0.56, 0.46] } },
        jeddah:    { neon: [NC.gold, NC.teal, NC.green, NC.white, NC.cyan, NC.amber], bias: 0.46, fh: [16, 40], bh: [36, 78],
                     kinds: ["setback", "podium", "slab", "cylinder", "pyramid", "spire"], neonKinds: ["screen", "clad"], tone: { n: [0.15, 0.14, 0.16], d: [0.50, 0.48, 0.42] } },
        monaco:    { neon: [NC.gold, NC.teal, NC.white, NC.rose], bias: 0.12, fh: [9, 17], bh: [14, 28],
                     kinds: ["setback", "slab", "podium", "tiered"], neonKinds: [], tone: { n: [0.22, 0.19, 0.15], d: [0.88, 0.81, 0.66] } },
        madrid:    { neon: [NC.red, NC.gold, NC.white, NC.cyan, NC.violet], bias: 0.28, fh: [14, 38], bh: [30, 70],
                     kinds: ["setback", "slab", "cylinder", "podium", "spire"], neonKinds: ["clad"], tone: { n: [0.16, 0.16, 0.18], d: [0.64, 0.63, 0.66] } },
        shanghai:  { neon: [NC.cyan, NC.blue, NC.white, NC.teal, NC.purple, NC.pink], bias: 0.42, fh: [22, 54], bh: [56, 110],
                     kinds: ["cylinder", "spire", "setback", "podium", "twin", "slab"], neonKinds: ["clad", "screen"], tone: { n: [0.12, 0.13, 0.18], d: [0.46, 0.48, 0.52] } },
        mexico:    { neon: [NC.pink, NC.green, NC.orange, NC.gold, NC.cyan], bias: 0.34, fh: [12, 34], bh: [28, 64],
                     kinds: ["setback", "slab", "podium", "cylinder", "tiered"], neonKinds: ["clad"], tone: { n: [0.16, 0.15, 0.16], d: [0.58, 0.56, 0.53] } },
        miami:     { neon: [NC.pink, NC.cyan, NC.teal, NC.orange, NC.purple], bias: 0.44, fh: [11, 30], bh: [28, 68],
                     kinds: ["setback", "podium", "slab", "cylinder", "twin"], neonKinds: ["clad", "screen"], tone: { n: [0.15, 0.14, 0.18], d: [0.58, 0.60, 0.64] } },
      };
      const THEME_DEF = {
        street_night: { neon: [NC.mag, NC.cyan, NC.gold, NC.violet, NC.teal], bias: 0.5, fh: [16, 48], bh: [34, 80], kinds: BLD, neonKinds: ["screen", "clad"], tone: null },
        street_day:   { neon: [NC.gold, NC.teal, NC.white, NC.rose], bias: 0.16, fh: [9, 19], bh: [14, 30], kinds: ["setback", "slab", "podium", "tiered"], neonKinds: [], tone: { n: [0.22, 0.19, 0.15], d: [0.82, 0.77, 0.66] } },
        modern:       { neon: [NC.cyan, NC.blue, NC.white, NC.violet, NC.teal], bias: 0.3, fh: [14, 40], bh: [30, 74], kinds: ["setback", "slab", "cylinder", "podium", "spire"], neonKinds: ["clad"], tone: { n: [0.16, 0.16, 0.18], d: [0.62, 0.62, 0.66] } },
      };
      const style = STYLES[def.id] || THEME_DEF[theme] || THEME_DEF.modern;
      const cn = (k, s) => style.neon[Math.floor(hash(k * 3 + s) * style.neon.length) % style.neon.length];
      const harbourSkip = (side, k) => def.id === "monaco" && side === 1 && k < n * 0.14;
      // neonAmt per building: day = plain; night = neon buildings bright, the rest
      // (general/regular buildings) get just a touch of neon so the city still
      // sparkles without being a wall of neon.
      const naFor = (k, side) => {
        if (!NIGHT) return 0;
        return hash(k * 7.7 + side * 2.1) < style.bias
          ? 0.55 + hash(k * 9.3 + side) * 0.45
          : 0.10 + hash(k * 11.1 + side) * 0.10;
      };
      const pickKind = (k, s, na) => {
        if (na > 0.5 && style.neonKinds.length && hash(k * 4.4 + s) < 0.3)
          return style.neonKinds[Math.floor(hash(k * 6.6 + s) * style.neonKinds.length) % style.neonKinds.length];
        return style.kinds[Math.floor(hash(k * 2.3 + s) * style.kinds.length) % style.kinds.length];
      };
      // Front row — dense.
      every(18, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side * 4) < 0.12 || harbourSkip(side, k)) continue;
          const s = hash(k * 5 + side), na = naFor(k, side);
          const h = style.fh[0] + s * style.fh[1], w = 8 + s * 10, d = 8 + hash(k * 9 + side) * 9;
          neonTower(k, side, 13 + s * 12, w, h, d, cn(k, side), pickKind(k, side, na), style.tone, na);
        }
      });
      // Back row — taller, set further back, staggered, for skyline depth.
      every(26, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 23 + side * 7) < 0.34 || harbourSkip(side, k)) continue;
          const s = hash(k * 11 + side * 2), na = naFor(k * 1.3, side);
          const h = style.bh[0] + s * style.bh[1], w = 11 + s * 12, d = 11 + s * 10;
          neonTower(k, side, 40 + s * 30, w, h, d, cn(k * 1.7, side), pickKind(k * 1.9, side, na), style.tone, na);
        }
      });
      // Sign blades + low retail boxes dressing the gaps.
      every(34, (k) => {
        const side = hash(k * 13) < 0.5 ? -1 : 1;
        if (harbourSkip(side, k)) return;
        const lc = cn(k * 3.3, side);
        if (NIGHT && style.bias > 0.3 && hash(k * 19) < 0.5) neonSign(k, side, 8 + hash(k) * 4, 10 + hash(k * 2) * 10, lc);
        else { place(k, side, 9, [9, 4 + hash(k) * 3, 7], NIGHT ? [0.13, 0.13, 0.16] : [style.tone ? style.tone.d[0] : 0.5, style.tone ? style.tone.d[1] : 0.5, style.tone ? style.tone.d[2] : 0.54]); place(k, side, 9, [9.3, 1.0, 7.3], NIGHT ? lc : [lc[0] * 0.4 + 0.3, lc[1] * 0.4 + 0.3, lc[2] * 0.4 + 0.3]); }
      });
      // Occasional illuminated billboard accent (more on high-neon circuits).
      if (style.bias > 0.25) every(80, (k) => {
        const side = hash(k * 31) < 0.5 ? -1 : 1;
        if (harbourSkip(side, k)) return;
        const neon = cn(k * 5.5, side);
        prop(k, side, 6, [1.0, 6, 1.0], [0.10, 0.10, 0.12]);
        prop(k, side, 6, [1.2, 3.4, 5], NIGHT ? neon : [neon[0] * 0.5 + 0.25, neon[1] * 0.5 + 0.25, neon[2] * 0.5 + 0.25]);
      });
    }

    // --- main grandstand + pit complex on the start/finish straight (every GP) ---
    const crowd = def.night ? [0.45, 0.28, 0.3] : [0.78, 0.42, 0.32];
    for (let i = 0; i < 7; i++) {
      const k = (i * 4) % n;
      place(k, -1, 14, [6, 11, 16], [0.5, 0.5, 0.56]);     // grandstand shell
      place(k, -1, 10, [1.4, 7, 16], crowd);                // tiered seating
      place(k, 1, 12, [7, 5.5, 16], [0.83, 0.83, 0.86]);    // pit building
    }

    // --- iconic landmark: a ferris wheel beside the track (Suzuka, Singapore) ---
    function ferrisWheel(k, side, dist, radius) {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const tl = Math.hypot(track.tx[k], track.tz[k]) || 1;
      const tn = [track.tx[k] / tl, 0, track.tz[k] / tl];   // horizontal tangent
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      const hubY = py[k] + radius + 5;
      const hub = [cx, hubY, cz];
      for (const lo of [-3, 3]) {                            // support legs
        addBox(out, [cx + tn[0] * lo, py[k] + (hubY - py[k]) / 2 - 0.3, cz + tn[2] * lo],
               [1.6, hubY - py[k], 1.6], [0.32, 0.33, 0.38]);
      }
      addBox(out, hub, [3, 3, 3], [0.3, 0.3, 0.34]);         // hub
      const seg = 16;
      for (let i = 0; i < seg; i++) {                        // rim of cabins
        const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const p = [hub[0] + tn[0] * ca * radius, hub[1] + sa * radius, hub[2] + tn[2] * ca * radius];
        const cab = def.night
          ? [[0.95, 0.2, 0.5], [0.2, 0.85, 0.95], [0.95, 0.8, 0.2]][i % 3]
          : (i % 2 ? [0.9, 0.25, 0.25] : [0.95, 0.95, 0.98]);
        addBox(out, p, [2.4, 2.4, 2.4], cab);
      }
      // solid base (legs + hub footprint) → stop the car before it on open tracks
      blockAt(k, side, dist - 0.8, 4);
    }
    
    

    // Per-circuit bespoke scenery lives in js/tracks/<id>.js (def.scenery).
    if (def.scenery) def.scenery({
      out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin,
      // Session darkness (chosen time of day) — lets bespoke scenery render a lit
      // night version vs a daytime version of the same structure.
      night: NIGHT,
      place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack,
      ferrisWheel, hash, upOf, cross, norm, lerp, vadd,
      // richer primitives (world coords): non-cube shapes
      addPrism, addPyramid, addCone, addCyl, addFrustum, addMountain, anchor, along,
      // landscape + vegetation
      pine, tree, palm, bush, hedge, peak, mountain, ridge, forestEdge,
      // structures
      building, tower, grandstand, billboard, gantry, marshalPost, cityFront,
      // barriers / track furniture
      wall, fence, guardrail, tyreWall, recordBarrier,
    });

    // Generic floodlight masts — EVERY circuit gets them (visible day and night).
    // Co-located with the point lights (game.js buildTrackLights uses the same
    // 40 m stride, hw+6 offset and side parity) so each light pool reads as cast
    // by a real mast. Street/modern circuits get slim lamp posts with an arm over
    // the track; open circuits get tall floodlight banks. The lens uses a bright
    // albedo so the prop-emissive (ramped up as the sun drops) makes it glow at
    // night. Theme tints the lens warm (desert) / cool (street/modern) / neutral.
    {
      const stTheme = theme === "street_night" || theme === "street_day" || theme === "modern";
      const mastH = stTheme ? 9 : 13;
      // Lens albedo mirrors floodColor(theme) in game.js so the visible mast glow
      // matches the colour of the point light it casts: desert warm sodium,
      // street_night cool LED, modern warm-white, street_day warm, green neutral.
      const lensCol = theme === "desert"       ? [1.00, 0.84, 0.50]
                    : theme === "street_night" ? [0.90, 0.95, 1.05]
                    : theme === "modern"       ? [1.00, 0.97, 0.90]
                    : theme === "street_day"   ? [1.06, 0.98, 0.82]
                    : [1.00, 0.93, 0.78];
      const poleCol = [0.16, 0.16, 0.19];
      const mstride = Math.max(1, Math.round(34 / ds));
      let mi = 0;
      for (let k = 0; k < n; k += mstride, mi++) {
        const side = (mi % 2 === 0) ? 1 : -1;
        const a = anchor(k, side, 6);
        if (onTrack(a.c[0], a.c[2], 1.2)) continue;
        const b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.17, mastH, poleCol, 6, b);
        const top = vadd(a.c, a.u, mastH);
        if (stTheme) {
          const arm = vadd(top, a.r, -side * 1.0);
          addBox(out, arm, [2.0, 0.26, 0.45], poleCol, b);
          addBox(out, vadd(arm, a.r, -side * 0.85), [0.9, 0.42, 0.66], lensCol, b);
        } else {
          addBox(out, top, [2.6, 1.0, 1.2], [0.70, 0.70, 0.74], b);
          addBox(out, vadd(top, a.r, -side * 0.7), [2.2, 0.8, 0.4], lensCol, b);
        }
      }
    }

    // bridge supports: pillars from the ground up to the raised deck, set a
    // little along the deck from the exact crossing so they clear the lower road
    const brs = def.bridges;
    if (brs) for (const b of brs) {
      const kc = Math.round(b.s * n) % n;
      for (const off of [-18, -9, 9, 18]) {
        const k = ((kc + off) % n + n) % n;
        const deckY = py[k];
        if (deckY < 1) continue;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const tg = [track.tx[k], 0, track.tz[k]];
        for (const side of [-1, 1]) {
          const o = side * (hw[k] + 0.7);
          addBox(out, [px[k] + r[0] * o, deckY / 2 - 0.3, pz[k] + r[2] * o],
                 [1.6, deckY + 0.4, 1.6], [0.42, 0.42, 0.47], [r, [0, 1, 0], tg]);
          blockAt(k, side, 0.7, 1);   // solid pillar at the deck edge
        }
      }
    }
    if (out.pos.length === 0) addBox(out, [px[0] + 30, 1, pz[0]], [2, 2, 2], [0.4, 0.4, 0.4]);
    if (_culled) console.info(`[scenery] ${def.id}: culled ${_culled} on-track primitive(s)`);
    return { out, glass: glassBuf };
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
      addBox(out, [gateX + r[0] * o, gateY + 3, gateZ + r[2] * o], [1, 6, 1], [0.85, 0.1, 0.1], [r, u, t]);
    }
    addBox(out, [gateX, gateY + 6.2, gateZ], [w * 2 + 4, 0.8, 1.2], [0.1, 0.1, 0.12], [r, u, t]);
    addBox(out, [gateX, gateY + 6.8, gateZ], [w * 1.4, 0.6, 0.6], [0.95, 0.95, 0.97], [r, u, t]);
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

  // ---------- circuit layouts (turn +=right, lengths in meters pre-SCALE) ----------
  // palettes
  function dayPal(o) {
    const p = Object.assign({
      zenith: [0.18, 0.40, 0.78], horizon: [0.62, 0.74, 0.88], sun: [1, 0.96, 0.85],
      grass: [0.18, 0.42, 0.16], runoff: [0.55, 0.42, 0.28], fog: [0.62, 0.74, 0.88],
      asphalt: [0.16, 0.17, 0.19], line: [0.95, 0.95, 0.98],
      fogDensity: 0.0017, kerbA: [0.85, 0.12, 0.12], kerbB: [0.95, 0.95, 0.95], concrete: [0.50, 0.48, 0.44],
      ambientSky: [0.45, 0.52, 0.62], ambientGround: [0.22, 0.22, 0.18],
      sunColor: [1, 0.95, 0.82], sunDir: [0.4, 0.72, 0.3],
    }, o);
    p.sunDir = norm(p.sunDir);   // data files store raw sunDir; normalize here
    return p;
  }
  function nightPal(o) {
    const p = Object.assign({
      zenith: [0.05, 0.06, 0.14], horizon: [0.12, 0.14, 0.24], sun: [0.4, 0.4, 0.5],
      grass: [0.14, 0.18, 0.14], runoff: [0.28, 0.26, 0.24], fog: [0.08, 0.09, 0.15],
      asphalt: [0.18, 0.19, 0.22], line: [0.9, 0.9, 0.95],
      fogDensity: 0.0023, kerbA: [0.85, 0.12, 0.12], kerbB: [0.92, 0.92, 0.92], concrete: [0.42, 0.40, 0.38],
      ambientSky: [0.62, 0.64, 0.76], ambientGround: [0.44, 0.44, 0.48],
      sunColor: [0.7, 0.72, 0.8], sunDir: [0.1, 0.9, 0.2],
    }, o);
    p.sunDir = norm(p.sunDir);
    return p;
  }

  // Circuit definitions live in js/tracks/<id>.js — each registers itself on the
  // global TrackDefs list (loaded before this engine). Palette is resolved here
  // from the `night` flag; bridges/elevations/street travel with each def.
  const DEFS = (typeof window !== "undefined" && window.TrackDefs) || [];

  // Surveyed elevation profile lookup. js/circuit-elevations.js (baked offline
  // by tools/bake-elevation.mjs from SRTM) registers CircuitElevations[id] as an
  // array of metres, relative to the start, sampled evenly by arc-fraction. When
  // present it supersedes the authored cosine `elevations` bumps for that
  // circuit. Returns 0 when no profile is loaded (the shipped default).
  function elevationAt(id, frac) {
    const prof = (typeof CircuitElevations !== "undefined") && CircuitElevations[id];
    if (!prof || !prof.length) return null;
    const M = prof.length, f = (((frac % 1) + 1) % 1) * M;
    const i = Math.floor(f) % M, j = (i + 1) % M, t = f - Math.floor(f);
    return prof[i] + (prof[j] - prof[i]) * t;
  }
  function hasRealElevation(id) {
    return (typeof CircuitElevations !== "undefined") && !!(CircuitElevations[id] && CircuitElevations[id].length);
  }

  // Real circuit centerlines (js/circuits.js): projected OSM traces in metres.
  // We use the real layout instead of the authored segment lists. Points are
  // kept flat (y = 0) unless a surveyed elevation profile is loaded — the old
  // per-segment elevation distributed a vertical residual that tilted the whole
  // loop, which is the height glitch on Monaco; the profile path closes the
  // elevation seam explicitly instead.
  function realPoints(id, baseHW) {
    const path = (typeof CircuitPaths !== "undefined") && CircuitPaths[id];
    if (!path) return null;
    const N = path.pts.length;
    const real = hasRealElevation(id);
    let pts = path.pts.map((p, i) => [p[0], real ? elevationAt(id, i / N) : 0, p[1], baseHW, 0]);
    // light closed-loop smoothing to take the digitisation jitter off the
    // raw trace so the Catmull-Rom pass doesn't overshoot at noisy vertices
    for (let it = 0; it < 2; it++) {
      const sx = pts.map((p) => p[0]), sz = pts.map((p) => p[2]);
      const L = 0.25;
      for (let i = 0; i < N; i++) {
        const a = (i - 1 + N) % N, b = (i + 1) % N;
        pts[i][0] = sx[i] + L * ((sx[a] + sx[b]) * 0.5 - sx[i]);
        pts[i][2] = sz[i] + L * ((sz[a] + sz[b]) * 0.5 - sz[i]);
      }
    }
    if (real) {
      // close the elevation loop: ramp out any start↔end residual so the lap
      // meets itself seamlessly (same idea as the xz closure in centerline()).
      const eEnd = pts[N - 1][1] - pts[0][1];
      for (let i = 0; i < N; i++) pts[i][1] -= eEnd * (i / (N - 1));
    }
    return pts;
  }

  const LIST = DEFS.map((d) => {
    const def = {
      id: d.id, name: d.name, gp: d.gp, country: d.country, laps: 3,
      night: d.night, theme: d.theme, lengthKm: d.lengthKm,
      palette: (d.night ? nightPal : dayPal)(d.pal || {}),
      street: !!d.street, banked: !!d.banked, bridges: d.bridges || null,
      barrierGap: d.barrierGap || null,
      terrainOuter: d.terrainOuter,
      // bespoke per-circuit scenery (js/tracks/<id>.js); run by buildProps
      scenery: d.scenery || null,
      // surveyed elevation (if js/circuit-elevations.js is loaded) is baked into
      // the points below and supersedes the authored cosine bumps.
      elevations: hasRealElevation(d.id) ? null : (d.elevations || null),
    };
    def.points = realPoints(d.id, d.baseHW) || centerline(d.segs, d.baseHW);
    return def;
  });

  // ---------- world -> track projection ----------
  // Project a world ground point (wx, wz) onto the centreline polyline and return
  // its arc-length s, signed lateral offset (along the local `right`, matching the
  // (s,x) model's x), the nearest node index, the tangent heading, and the
  // perpendicular distance. This is the inverse of sample()+offset and the bridge
  // that lets the car physics live in world space while gameplay still reasons in
  // (s, lateral). `hint` (an arc-length s from last frame) restricts the search to
  // a small window of segments so it's O(1) per car; omit it for a full search.
  function project(track, wx, wz, hint) {
    const n = track.n, L = track.total, ds = L / n;
    const px = track.px, pz = track.pz, rx = track.rx, rz = track.rz, tx = track.tx, tz = track.tz;
    let bestD2 = Infinity, bestCost = Infinity, bestK = 0, bestT = 0, bestCx = 0, bestCz = 0;
    // Continuity bias: when we have a hint (last frame's arc-length), prefer the
    // segment closest to it ALONG THE LAP, not just in space. At a hairpin the
    // inbound and outbound legs are only metres apart but far apart in s, so a car
    // running slightly wide could otherwise snap onto the wrong leg and teleport
    // its lap distance (phantom wrong-way / lost progress). Penalising arc-length
    // jumps breaks that tie toward the continuous choice; it only changes the
    // outcome when two segments are near-equidistant in space.
    const hs = (hint != null && isFinite(hint)) ? (((hint % L) + L) % L) : -1;
    const CONT = 0.08;                    // weight of the arc-length penalty
    function evalSeg(i) {
      const j = (i + 1) % n;
      const ax = px[i], az = pz[i];
      const dx = px[j] - ax, dz = pz[j] - az;
      const len2 = dx * dx + dz * dz || 1e-6;
      let t = ((wx - ax) * dx + (wz - az) * dz) / len2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = ax + t * dx, cz = az + t * dz;
      const ex = wx - cx, ez = wz - cz;
      const d2 = ex * ex + ez * ez;
      let cost = d2;
      if (hs >= 0) {
        let da = Math.abs(((i + t) * ds) - hs); da = Math.min(da, L - da);
        cost += CONT * da * da;
      }
      if (cost < bestCost) { bestCost = cost; bestD2 = d2; bestK = i; bestT = t; bestCx = cx; bestCz = cz; }
    }
    if (hint != null && isFinite(hint)) {
      const h = ((Math.round(hint / ds) % n) + n) % n;
      const W = 16;                       // ±16 nodes around last position
      for (let d = -W; d <= W; d++) evalSeg(((h + d) % n + n) % n);
    } else {
      for (let i = 0; i < n; i++) evalSeg(i);
    }
    const j = (bestK + 1) % n;
    const s = ((bestK + bestT) * ds) % L;
    // signed lateral offset along the interpolated right vector (ground plane)
    let r0 = rx[bestK] + (rx[j] - rx[bestK]) * bestT;
    let r2 = rz[bestK] + (rz[j] - rz[bestK]) * bestT;
    const rl = Math.hypot(r0, r2) || 1; r0 /= rl; r2 /= rl;
    const lat = (wx - bestCx) * r0 + (wz - bestCz) * r2;
    // tangent heading (same convention as centreline: dir = (sin θ, cos θ))
    const h0 = tx[bestK] + (tx[j] - tx[bestK]) * bestT;
    const h2 = tz[bestK] + (tz[j] - tz[bestK]) * bestT;
    const heading = Math.atan2(h0, h2);
    return { s, lat, k: bestK, heading, dist: Math.sqrt(bestD2) };
  }

  // Driving boundary (max |lateral| from the centreline) at arc-length s on a
  // side (sideSign >= 0 = right/+x, < 0 = left). Derived from where solid barriers
  // were placed (see buildProps), so the car stops just before a model. Uses the
  // tighter of the two bracketing nodes — conservative, never lets the car past a
  // barrier at a node transition.
  function wallAt(track, s, sideSign) {
    const arr = sideSign >= 0 ? track.barR : track.barL;
    const n = track.n, L = track.total;
    if (!arr) {                                   // pre-build fallback
      const i0 = (((Math.round(s / L * n) % n) + n) % n);
      return track.hw[i0] + (track.def && track.def.street ? -0.8 : 9);
    }
    let f = (((s % L) + L) % L) / L * n;
    const i = Math.floor(f) % n, j = (i + 1) % n;
    return Math.min(arr[i], arr[j]);
  }

  // Rendered ground height at world (x,z): the max Y of any terrain triangle
  // covering that point (vertical ray-cast against the stashed terrain geometry).
  // Returns null if no terrain covers the point. Debug aid — finds where the
  // carved terrain ends up so props can be checked for floating / gaps.
  function terrainY(track, x, z) {
    const g = track.terrainGeo; if (!g) return null;
    const pos = g.pos, idx = g.idx; let best = null;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2];
      // barycentric in XZ
      const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
      const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
      const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-9) continue;
      const u = (d11 * d20 - d01 * d21) / den, vv = (d00 * d21 - d01 * d20) / den;
      if (u < -0.01 || vv < -0.01 || u + vv > 1.01) continue;
      const y = pos[a + 1] + u * (pos[c + 1] - pos[a + 1]) + vv * (pos[b + 1] - pos[a + 1]);
      if (best === null || y > best) best = y;
    }
    return best;
  }

  return { LIST, build, buildCenterline, sample, curvature, onKerb, banking, bankAngle, project, wallAt, terrainY };
})();
