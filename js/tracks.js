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
  function build(def) {
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
    if (typeof GLX !== "undefined" && GLX.createMesh) {
      track.meshes.road = GLX.createMesh(buildRoad(track));
      track.meshes.terrain = GLX.createMesh(buildTerrain(track));
      track.meshes.props = GLX.createMesh(buildProps(track));
      track.meshes.gate = GLX.createMesh(buildGate(track));
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
    for (let i = 0; i < n; i += step) out.push([ox + (px[i] - minx) * sc, oz + (pz[i] - minz) * sc]);
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

  function curvature(track, s) {
    const n = track.n, L = track.total, w = 12;
    const head = (ss) => {
      let f = (ss % L + L) % L / L * n;
      const i = Math.floor(f) % n;
      return Math.atan2(track.tx[i], track.tz[i]);
    };
    let d = head(s + w) - head(s - w);
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
    const dark = [0.05, 0.05, 0.06];
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
      const rise = [0, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0];
      const checker = (k * ds) < 9;                  // start/finish band
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
        pos.push(px[k] + r[0] * o + u[0] * (rise[v] + by), py[k] + r[1] * o + u[1] * (rise[v] + by) + 0.02, pz[k] + r[2] * o + u[2] * (rise[v] + by));
        nrm.push(u[0], u[1], u[2]);
        let c;
        if (checker && v !== 0 && v !== 13) {
          // true 2D checkerboard at start/finish: alternate by both along-track and lateral position
          const latBand = Math.floor((o + w + 2.2) / 2.5) % 2;
          const longBand = Math.floor((k * ds) / 2.5) % 2;
          c = (latBand + longBand) % 2 === 0 ? [0.95, 0.95, 0.97] : dark;
        } else if (v === 0 || v === 13) {
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
    const latsL = isStreet ? [-5.0, -10.0, -20, -55, -120] : [-2.2, -7.0, -14, -48, -120];
    const latsR = isStreet ? [ 5.0,  10.0,  20,  55,  120] : [ 2.2,  7.0,  14,  48,  120];
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
          const sag = (isStreet ? -1.5 : -0.3) - Math.abs(lats[v]) * 0.018;
          // inner vert tracks road height; outer verts ease down to the lap's
          // low point (or the flattened bridge ground, whichever is lower). The
          // quadratic ease keeps the run-off apron near track grade and pushes
          // the drop out to the distant grass, so a raised corner reads as an
          // embankment rather than a high plateau hanging over the rest of the lap.
          const t = v / (NTV - 1);
          const ease = t * t;
          const floorY = Math.min(gY[k], pyMin);
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
          pos.push(px[k] + r[0] * o + u[0] * by, yBase + sag + u[1] * by, pz[k] + r[2] * o + u[2] * by);
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

  function buildProps(track) {
    const { n, px, py, pz, hw } = track;
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const def = track.def, theme = def.theme, pal = def.palette, ds = track.total / n;
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
    // station. Used to stop props being dropped onto a *parallel* section of the
    // circuit — e.g. a tree placed perpendicular to one point landing on the
    // road at a hairpin or where two straights run close together (COTA,
    // Suzuka's crossover, etc.).
    const onTrack = (x, z, margin) => {
      for (let i = 0; i < n; i++) {
        const dx = x - px[i], dz = z - pz[i];
        const rr = hw[i] + margin;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
      return false;
    };
    const place = (k, side, dist, sz, col) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      // skip if this prop would overlap a parallel stretch of track
      if (onTrack(cx, cz, sz[0] / 2 + 1.5)) return;
      // sink the base 0.8m below grade so prop bottoms tuck under the terrain
      // apron instead of co-planar Z-fighting where box meets ground. Anchored to
      // the terrain height at this lateral distance (not the road) so it sits on
      // the ground on elevated/embanked sections.
      const c = [cx, groundYAt(k, dist) + sz[1] / 2 - 0.8, cz];
      addBox(out, c, sz, col, [r, u, t]);
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
      if (onTrack(cx, cz, sz[0] / 2 + 4)) return;
      addBox(out, [cx, groundYAt(k, gap + sz[0] / 2) - sz[1] / 2 - 1.0, cz], sz, col);
    };
    // backdrop(): a distant scenery box (skyline, hills, dunes) on the horizon.
    // Tall things go far enough back that they never clip the viewport edge, and
    // onTrack keeps them off any parallel stretch. Anchored to local py[k].
    const backdrop = (k, side, dist, sz, col) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      if (onTrack(cx, cz, sz[0] / 2 + 6)) return;
      // distant scenery settles to the lap's low baseline (groundYAt past the last
      // ribbon vert returns it), so a ridge/skyline never floats on a high section
      addBox(out, [cx, groundYAt(k, dist) + sz[1] / 2 - 2, cz], sz, col);
    };

    // ---------- composite scenery models (beyond single boxes) ----------
    // Resolve a trackside anchor: ground position + the track basis [r,u,t] at
    // node k, `dist` beyond the road edge on `side`. Shared by the model helpers.
    const anchor = (k, side, dist) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const o = side * (hw[k] + dist);
      return { c: [px[k] + r[0] * o, groundYAt(k, dist), pz[k] + r[2] * o], r, u, t };
    };
    // Conifer/pine: tapered trunk + stacked cones. col = needle green.
    const pine = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      addCyl(out, a.c, 0.35 + h * 0.02, h * 0.4, [0.30, 0.22, 0.13], 6, b);
      let y = h * 0.3;
      for (let i = 0; i < 3; i++) {
        const w = 2.6 * (1 - i * 0.27);
        addCone(out, vadd(a.c, a.u, y), w, h * 0.34, col, 7, b);
        y += h * 0.22;
      }
    };
    // Broadleaf tree: short trunk + a rounded canopy (squat wide cone + cap cone).
    const tree = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      addCyl(out, a.c, 0.4, h * 0.4, [0.32, 0.23, 0.13], 6, b);
      addCone(out, vadd(a.c, a.u, h * 0.32), 2.8 + h * 0.12, h * 0.5, col, 8, b);
      addCone(out, vadd(a.c, a.u, h * 0.62), 1.8 + h * 0.06, h * 0.32, col, 7, b);
    };
    // Palm: tall thin trunk + a crown of drooping frond prisms.
    const palm = (k, side, dist, h, frond) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
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
      if (onTrack(x, z, w * 0.75)) return;
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
      if (onTrack(x, z, w * 0.62)) return;
      opts = opts || {};
      addFrustum(out, [x, baseY - 2, z], w * 0.62, w * 0.42, h * 0.18,
                 opts.forest || [0.20, 0.34, 0.20], 9, null);   // skirt
      addMountain(out, [x, baseY, z], w * 0.5, h, opts);
    };
    // Mountain ridge segment (world coords) — a prism whose ridge runs along
    // `ang` (radians, in the XZ plane). Chain these for a jagged range.
    const ridge = (x, z, baseY, ang, len, w, h, col) => {
      // Skip if footprint half-extent reaches tarmac.
      if (onTrack(x, z, Math.max(len, w) * 0.5)) return;
      const f = [Math.cos(ang), 0, Math.sin(ang)], r = [-f[2], 0, f[0]];
      addPrism(out, [x, baseY, z], [w, h, len], col, [r, [0, 1, 0], f]);
    };
    // Tiered grandstand running along the track: a raked seating wedge (prism on
    // its side reads as a rake), a back shell and a flat roof slab on posts.
    const grandstand = (s, side, gap, len, shell, crowd) => {
      const k = Math.round(s * n) % n;
      prop(k, side, gap + 2.5, [10, 12, len], shell || [0.40, 0.41, 0.46]);   // back shell
      prop(k, side, gap, [9, 7, len - 2], crowd || [0.55, 0.32, 0.30]);        // raked crowd
      // roof slab cantilevered over the crowd, lifted on the up axis
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
      along(s0, s1, 6, (k) => { const p = anchor(k, side, gap); addBox(out, vadd(p.c, p.u, h / 2), [a, h, 6.3], col || [0.78, 0.78, 0.80], [p.r, p.u, p.t]); });
    };
    // Catch / debris fence: posts + a pale mesh panel (reads as see-through wire).
    const fence = (s0, s1, side, gap, h, col) => {
      along(s0, s1, 5, (k) => {
        const p = anchor(k, side, gap);
        addCyl(out, p.c, 0.13, h, [0.28, 0.28, 0.30], 5, [p.r, p.u, p.t]);          // post
        addBox(out, vadd(p.c, p.u, h * 0.55), [0.05, h * 0.9, 5.2], col || [0.72, 0.74, 0.78], [p.r, p.u, p.t]);  // mesh
      });
    };
    // Armco guardrail: a waist-high steel rail on posts (open-circuit edge).
    const guardrail = (s0, s1, side, gap, col) => {
      along(s0, s1, 4, (k) => {
        const p = anchor(k, side, gap);
        addCyl(out, p.c, 0.09, 0.7, [0.5, 0.5, 0.52], 4, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 0.7), [0.18, 0.45, 4.2], col || [0.82, 0.82, 0.85], [p.r, p.u, p.t]);
      });
    };
    // Stacked-tyre barrier with a coloured conveyor-belt cap.
    const tyreWall = (s0, s1, side, gap, capCol) => {
      along(s0, s1, 3.4, (k) => {
        const p = anchor(k, side, gap);
        addCyl(out, p.c, 1.0, 0.9, [0.10, 0.10, 0.11], 7, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 0.95), [2.0, 0.3, 3.6], capCol || [0.9, 0.9, 0.92], [p.r, p.u, p.t]);
      });
    };
    // Low clipped hedge / continuous treeline.
    const hedge = (s0, s1, side, gap, h, col) => {
      along(s0, s1, 4, (k) => { const p = anchor(k, side, gap); addBox(out, vadd(p.c, p.u, h / 2), [2.4, h, 4.3], col || [0.18, 0.36, 0.16], [p.r, p.u, p.t]); });
    };

    // ---------- structures ----------
    // Multi-storey building: mass + horizontal window bands + optional setback top.
    const building = (k, side, dist, w, h, d, opts) => {
      opts = opts || {};
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      const body = opts.wall || [0.62, 0.64, 0.68], win = opts.window || [0.18, 0.26, 0.34];
      addBox(out, vadd(p.c, p.u, h / 2), [w, h, d], body, b);
      const floors = Math.max(2, Math.round(h / (opts.floor || 4)));
      for (let i = 0; i < floors; i++) {
        addBox(out, vadd(p.c, p.u, (i + 0.62) * (h / floors)), [w * 1.01, (h / floors) * 0.46, d * 1.01], win, b);  // glazing band
      }
      if (opts.setback) addBox(out, vadd(p.c, p.u, h + h * 0.1), [w * 0.6, h * 0.22, d * 0.6], body, b);
      if (opts.roof) addBox(out, vadd(p.c, p.u, h + (opts.setback ? h * 0.22 : 0) + 1), [w * 0.3, 2, d * 0.3], [0.3, 0.3, 0.33], b);  // rooftop plant
    };
    // Tapered tower (control tower, spire) + optional antenna mast.
    const tower = (k, side, dist, baseW, h, opts) => {
      opts = opts || {};
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      addFrustum(out, p.c, baseW * 0.5, baseW * 0.32, h, opts.col || [0.70, 0.72, 0.75], opts.seg || 8, b);
      if (opts.cap) addBox(out, vadd(p.c, p.u, h), [baseW * 0.7, baseW * 0.18, baseW * 0.7], opts.capCol || [0.2, 0.2, 0.24], b);
      if (opts.mast) addCyl(out, vadd(p.c, p.u, h + (opts.cap ? baseW * 0.18 : 0)), 0.18, opts.mast, [0.3, 0.3, 0.32], 4, b);
    };
    // Advertising hoarding / billboard: a panel on two slim posts.
    const billboard = (k, side, gap, w, h, col) => {
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      for (const o of [-w * 0.4, w * 0.4]) addCyl(out, vadd(p.c, p.t, o), 0.12, h, [0.2, 0.2, 0.22], 4, b);
      addBox(out, vadd(p.c, p.u, h + 1.6), [0.3, 3.2, w], col || [0.9, 0.85, 0.2], b);
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
      addBox(out, vadd(p.c, p.u, 1.3), [2.2, 2.6, 2.2], [0.85, 0.86, 0.88], b);
      addBox(out, vadd(p.c, p.u, 2.7), [2.5, 0.4, 2.5], [0.95, 0.55, 0.08], b);
      addCyl(out, vadd(p.c, p.r, side * 1.4), 0.08, 4, [0.4, 0.4, 0.42], 4, b);
    };
    // Bush / shrub clump (low rounded greenery).
    const bush = (k, side, dist, col) => {
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
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
          const barrierOffset = def.id === "monaco" ? 2.0 : 0.35;
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
    } else if (theme === "street_day") {  // Monaco
      // Mediterranean palette: cream, terracotta, coral, ochre, off-white
      const medPal = [
        [0.94, 0.88, 0.74], [0.82, 0.52, 0.38], [0.90, 0.72, 0.58],
        [0.88, 0.78, 0.52], [0.93, 0.90, 0.83],
      ];
      every(20, (k) => {
        for (const side of [-1, 1]) {
          if (def.id === "monaco" && side === 1 && k < n * 0.14) continue; // leave the harbour open
          const s = hash(k * 3 + side), h = 12 + s * 28;
          const col = medPal[Math.floor(hash(k * 7 + side) * 5) % 5];
          place(k, side, 16 + s * 10, [8, h, 8], col);
        }
      });
    } else if (theme === "street_night") {  // Singapore / Vegas
      every(22, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 5 + side), h = 14 + s * 40;
          const neon = [[0.9, 0.1, 0.6], [0.1, 0.8, 0.9], [0.95, 0.75, 0.1], [0.5, 0.2, 0.9]][Math.floor(s * 4) % 4];
          // set taller towers further back so they don't fill the FOV and clip at
          // the viewport edge as the camera passes; even short blocks must clear
          // their own half-width plus the barrier so no tower face becomes a wall
          // beside the car.
          const dist = 18 + s * 18;
          place(k, side, dist, [8, h, 8], [0.05, 0.05, 0.08]);
          place(k, side, dist, [8.2, 2 + s * 3, 8.2], neon);  // glowing band
        }
      });
      // Illuminated billboards: thin laterally so the face never walls the car,
      // mounted on a slim pole and angled along the straight.
      every(40, (k) => {
        const side = hash(k * 13) < 0.5 ? -1 : 1;
        const neon = [[0.95, 0.15, 0.55], [0.15, 0.85, 0.95], [0.98, 0.80, 0.15]][Math.floor(hash(k * 14) * 3) % 3];
        prop(k, side, 5, [1.0, 7, 1.0], [0.10, 0.10, 0.12]);   // pole
        prop(k, side, 5, [1.4, 5, 9], neon);                   // glowing panel
      });
    } else if (theme === "modern") {  // Madrid
      every(30, (k) => { for (const side of [-1, 1]) { const s = hash(k + side); place(k, side, hw[k] + 20 + s * 3, [10, 8 + s * 14, 10], [0.8, 0.82, 0.86]); } });
      every(120, (k) => place(k, hash(k) < 0.5 ? -1 : 1, hw[k] + 25, [4, 6, 24], [0.85, 0.2, 0.2]));
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
    }
    
    

    // Per-circuit bespoke scenery lives in js/tracks/<id>.js (def.scenery).
    if (def.scenery) def.scenery({
      out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin,
      place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack,
      ferrisWheel, hash, upOf, cross, norm, lerp, vadd,
      // richer primitives (world coords): non-cube shapes
      addPrism, addPyramid, addCone, addCyl, addFrustum, addMountain, anchor, along,
      // landscape + vegetation
      pine, tree, palm, bush, hedge, peak, mountain, ridge,
      // structures
      building, tower, grandstand, billboard, gantry, marshalPost,
      // barriers / track furniture
      wall, fence, guardrail, tyreWall,
    });

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
        }
      }
    }
    if (out.pos.length === 0) addBox(out, [px[0] + 30, 1, pz[0]], [2, 2, 2], [0.4, 0.4, 0.4]);
    return out;
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
      // bespoke per-circuit scenery (js/tracks/<id>.js); run by buildProps
      scenery: d.scenery || null,
      // surveyed elevation (if js/circuit-elevations.js is loaded) is baked into
      // the points below and supersedes the authored cosine bumps.
      elevations: hasRealElevation(d.id) ? null : (d.elevations || null),
    };
    def.points = realPoints(d.id, d.baseHW) || centerline(d.segs, d.baseHW);
    return def;
  });

  return { LIST, build, sample, curvature, onKerb, banking };
})();
