/* Apex 26 — Tracks: 12 real circuits as authored centerlines, resampled into a
   closed Catmull-Rom spline, extruded into 3D meshes. Contract: docs/ARCHITECTURE.md.
   Depends on global GLX (at runtime) for mesh upload. */
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
    const bridges = BRIDGES[def.id];
    if (bridges) for (const b of bridges) {
      const cs = b.s * total;
      for (let k = 0; k < n; k++) {
        let d = Math.abs(k * ds - cs);
        d = Math.min(d, total - d);                 // wrap-around distance
        if (d < b.halfM) py[k] += b.rise * 0.5 * (1 + Math.cos(Math.PI * d / b.halfM));
      }
    }
    // elevation changes — terrain follows road (unlike BRIDGES where gY stays flat)
    const elevs = ELEVATIONS[def.id];
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

    const track = { def, total, n, px, py, pz, tx, ty, tz, rx, ry, rz, hw, bank, street: !!STREET_IDS[def.id], meshes: {}, map: null };
    track.map = buildMap(px, pz, n);
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
    // Banking is disabled for now: the road/terrain mesh banks correctly, but
    // cars take their height from the flat centreline so they float/sink on the
    // banked surface. Doing it right means making the car, camera, shadow and
    // collisions all follow the banked surface (and reworking the terrain ribbon
    // so its far edge doesn't over-tilt) — a focused follow-up. Returning null
    // keeps the run-off feature while neutralising the road/terrain lift.
    return null;
    /* eslint-disable no-unreachable */
    if (track.def.id !== "zandvoort") return null;
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

  function buildRoad(track) {
    const { n, px, py, pz, hw } = track;
    const pos = [], nrm = [], col = [];
    const idxArr = [];
    const bp = bankingProfile(track);
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
      const offs = [-w - 2.2, -w - 1.2,
                    -w, -w + 0.9, -w + 0.95,        // left edge line + step
                    -0.35, -0.30,                    // centre line (left half)
                    0.30, 0.35,                      // centre line (right half)
                    w - 0.95, w - 0.9, w,            // right step + edge line
                    w + 1.2, w + 2.2];
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
    const bp = bankingProfile(track);
    const ds = total / n;
    // Run-off aprons on permanent (non-street) circuits: a wide tan gravel/tarmac
    // band where cars actually run wide — fast corners (high |curvature|) and the
    // braking zone at the end of a straight (curvature rising ahead). Street
    // circuits keep runoffAmt ~0 (their walls are right at the edge).
    const APRON_COL = [0.62, 0.55, 0.42];
    const runoffAmt = new Float32Array(n);
    if (!STREET_IDS[track.def.id]) {
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
    // For bridge sections the terrain ribbon stays at ground level so the
    // elevated deck floats above flat ground (supported visually by the bridge
    // pillars in buildProps) instead of pulling the whole ground plane up with it.
    const gY = new Float32Array(py);
    const brs = BRIDGES[track.def.id];
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
    // Five lateral verts per side: inner seam, concrete apron, gravel/runoff,
    // grass mid, grass far. Gives concrete run-off → gravel trap → grass gradient.
    // Street circuits push the ribbon further from the road edge so barriers
    // fully hide it and it cannot visually bleed onto the road surface.
    const NTV = 5;
    const isStreet = !!STREET_IDS[track.def.id];
    const latsL = isStreet ? [-5.0, -10.0, -20, -55, -120] : [-2.2, -7.0, -14, -48, -120];
    const latsR = isStreet ? [ 5.0,  10.0,  20,  55,  120] : [ 2.2,  7.0,  14,  48,  120];
    const concrete = pal.concrete || (track.def.night ? [0.32, 0.30, 0.28] : [0.50, 0.48, 0.44]);
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
          // inner vert tracks road height; outer verts blend to gY (flat under bridges)
          const t = v / (NTV - 1);
          const yBase = py[k] * (1 - t) + gY[k] * t;
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
          let tc;
          if (v < 2) {
            tc = concrete;                                    // asphalt/concrete apron
          } else if (v === 2) {
            tc = runoff;                                      // gravel/runoff zone
          } else {
            const gt = (v - 2) / (NTV - 3);                 // 0→1 from runoff to grass
            tc = [lerp(runoff[0], grass[0], gt), lerp(runoff[1], grass[1], gt), lerp(runoff[2], grass[2], gt)];
          }
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

  // street circuits get a continuous barrier wall at the edge instead of grass
  const STREET_IDS = { monaco: 1, singapore: 1, vegas: 1, madrid: 1 };

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
      // apron instead of co-planar Z-fighting where box meets ground.
      const c = [cx, py[k] + sz[1] / 2 - 0.8 + r[1] * o, cz];
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
      addBox(out, [cx, py[k] - sz[1] / 2 - 1.0, cz], sz, col);
    };
    // backdrop(): a distant scenery box (skyline, hills, dunes) on the horizon.
    // Tall things go far enough back that they never clip the viewport edge, and
    // onTrack keeps them off any parallel stretch. Anchored to local py[k].
    const backdrop = (k, side, dist, sz, col) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      if (onTrack(cx, cz, sz[0] / 2 + 6)) return;
      addBox(out, [cx, py[k] + sz[1] / 2 - 2, cz], sz, col);
    };

    // continuous barrier wall hugging both edges on street circuits — going off
    // means hitting a wall, not open grass. Day circuits get red/white armco
    // striping; night circuits get a dark rail.
    if (STREET_IDS[def.id]) {
      const WH = 1.1, WT = 0.4;
      for (const side of [-1, 1]) {
        for (let k = 0; k < n; k++) {
          const kn = (k + 1) % n;
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
          const striped = (Math.floor(k / 3) % 2) === 0;
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
    if (!STREET_IDS[def.id]) {
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
    if (!STREET_IDS[def.id]) {
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
      if (def.id === "spa") {
        every(16, (k) => {
          for (const side of [-1, 1]) {
            if (hash(k * 3 + side) > 0.35) continue;
            const s = hash(k * 2 + side);
            const h = 8 + s * 7, d = 14 + s * 12;
            place(k, side, d, [1.0, 1.2, 1.0], [0.22, 0.15, 0.08]);
            place(k, side, d, [3.2, h, 3.2], [0.1, 0.32, 0.12]);
          }
        });
      }
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
      // La Monumental: 24% banked high-speed turn with distinctive white structure
      if (def.id === "madrid") {
        const kmono = Math.round(n * 0.65) % n;
        const kmr = [track.rx[kmono], track.ry[kmono], track.rz[kmono]];
        const kmu = upOf(track, kmono);
        for (let i = -3; i <= 3; i++) {
          const k = (kmono + i * Math.round(n / 20)) % n;
          // oriented + cleared so the white grandstand wraps the banked turn
          // alongside it instead of cutting across the apex (near face was ~2m in)
          prop(k, 1, 8, [10, 16, 26], [0.88, 0.88, 0.92]);
        }
        // Sierra mountain backdrop
        const kmtn = Math.round(n * 0.4) % n;
        const kmtnr = [track.rx[kmtn], track.ry[kmtn], track.rz[kmtn]];
        for (let i = 0; i < 4; i++) {
          const mtn_d = 280 + i * 60;
          const mx = px[kmtn] + kmtnr[0] * mtn_d, mz = pz[kmtn] + kmtnr[2] * mtn_d;
          if (onTrack(mx, mz, 155)) continue;
          addBox(out, [mx, py[kmtn] + 50, mz], [300, 100, 200], [0.5, 0.48, 0.52]);
        }
        // Spanish plains vegetation filler
        every(40, (k) => {
          for (const side of [-1, 1]) {
            if (hash(k * 57 + side) > 0.45) continue;
            const d = 30 + hash(k * 58 + side) * 50;
            const s = hash(k * 59 + side);
            const h = 5 + s * 5;
            place(k, side, d, [1.6, 1.6, 1.6], [0.30, 0.22, 0.12]);
            place(k, side, d, [3.5, h, 3.5], [0.26, 0.36, 0.16]);
          }
        });
        // Light towers (occasional)
        every(180, (k) => {
          const side = hash(k * 61) < 0.3 ? -1 : 1;
          place(k, side, hw[k] + 65, [1.8, 32, 1.8], [0.40, 0.40, 0.43]);
        });
      }
    }

    // --- circuit-specific surrounding landscape features with comprehensive filler ---
    // Bahrain: desert dunes, Persian Gulf, utility infrastructure
    if (def.id === "bahrain") {
      // Date-palm clusters (the circuit's oasis planting), set back behind the runoff
      every(24, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side) > 0.5) continue;
          const d = 12 + hash(k * 19 + side) * 22;
          const h = 6.5 + hash(k * 23 + side) * 4;
          prop(k, side, d, [0.9, h, 0.9], [0.34, 0.26, 0.14]);   // slender trunk
          prop(k, side, d, [5.0, 1.8, 5.0], [0.20, 0.34, 0.12]); // frond crown
        }
      });
      // Low sand-dune ridges far out on the flat-desert horizon. Pushed well
      // back and kept low so they read as a distant skyline, not tan walls
      // flanking the straights; darkened for the night race.
      every(120, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 360 + hash(k * 7 + side) * 160, [220, 14, 220], [0.46, 0.39, 0.28]);
        }
      });
      // Floodlit grandstand banking opposite the pits (night race spectators)
      every(110, (k) => {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        prop(k, side, 10, [8, 9, 24], [0.30, 0.30, 0.36]);     // stand shell
        prop(k, side, 8,  [8, 5, 22], [0.55, 0.30, 0.28]);     // crowd tier
      });
    }
    // Spa: dense Ardennes forest with ridges, streams, filler vegetation
    if (def.id === "spa") {
      // Dense tree filler (Ardennes forest density)
      every(12, (k) => {
        for (const side of [-1, 1]) {
          for (let j = 0; j < 3; j++) {
            const d = 35 + hash(k * 27 + j) * 50;
            const s = hash(k * 29 + side + j);
            const h = 8 + s * 9;
            place(k, side, d, [1.0, 1.2, 1.0], [0.22, 0.15, 0.08]);   // trunk
            place(k, side, d, [3.0, h, 3.0], [0.08, 0.28, 0.10]);      // canopy
          }
        }
      });
      // Forested Ardennes ridgelines rising behind the treeline
      every(60, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 170 + hash(k * 13 + side) * 120, [200, 50, 200], [0.16, 0.30, 0.18]);
        }
      });
      // Yellow marshal posts at trackside (a Spa staple), close but cleared
      every(46, (k) => {
        const side = hash(k * 33) < 0.5 ? -1 : 1;
        prop(k, side, 3, [1.4, 2.6, 1.4], [0.90, 0.78, 0.10]);
      });
      // Grass spectator banking with sparse crowd colour
      every(120, (k) => {
        const side = hash(k * 35) < 0.5 ? -1 : 1;
        prop(k, side, 6, [8, 5, 22], [0.18, 0.34, 0.16]);
        prop(k, side, 6, [8, 2, 20], [0.62, 0.4, 0.34]);
      });
    }
    // Silverstone: English countryside
    if (def.id === "silverstone") {
      // Hedgerows and oak copses around the old airfield perimeter
      every(20, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 21 + side) > 0.55) continue;
          const d = 40 + hash(k * 22 + side) * 60;
          const h = 6 + hash(k * 24 + side) * 6;
          place(k, side, d, [1.2, 1.4, 1.2], [0.30, 0.22, 0.12]);
          place(k, side, d, [4.2, h, 4.2], [0.20, 0.40, 0.18]);
        }
      });
      // Spectator grandstands at the fast corners (Stowe / Copse / Maggotts)
      for (const frac of [0.18, 0.34, 0.58, 0.78]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 5) < 0.5 ? -1 : 1;
        prop(k, side, 9, [8, 10, 30], [0.40, 0.42, 0.48]);   // stand shell
        prop(k, side, 7, [8, 6, 28], [0.66, 0.40, 0.34]);    // crowd
      }
      // Distant low Northamptonshire treeline
      every(80, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 180 + hash(k * 6 + side) * 90, [180, 22, 180], [0.22, 0.36, 0.20]);
        }
      });
    }
    // Monaco: steep hillside buildings and Mediterranean backdrop
    if (def.id === "monaco") {
      for (let i = 0; i < 8; i++) {
        const k = Math.round((i / 8) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const hillx = px[k] + r[0] * (hw[k] + 100);
        const hillz = pz[k] + r[2] * (hw[k] + 100);
        if (onTrack(hillx, hillz, 20)) continue; // skip if box would land on a parallel section
        const bldg_h = 25 + hash(k * 29) * 35;
        addBox(out, [hillx, py[k] + bldg_h / 2, hillz], [28, bldg_h, 22],
               [0.72 + hash(k) * 0.2, 0.68 + hash(k) * 0.2, 0.6 + hash(k) * 0.15]);
      }
    }
    // Monza: royal park lakes and Italian Milan distant skyline
    if (def.id === "monza") {
      // Park lakes
      for (let i = 0; i < 4; i++) {
        const k = Math.round((i / 4) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const lx = px[k] + r[0] * (hw[k] + 120), lz = pz[k] + r[2] * (hw[k] + 120);
        if (onTrack(lx, lz, 95)) continue;  // keep the 180m water slab off parallel sections
        addBox(out, [lx, pyMin - 3, lz], [180, 1.6, 240], [0.1, 0.24, 0.4]);  // lake water
      }
      // Distant Milan towers
      const kmilan = Math.round(n * 0.4) % n;
      const kmr = [track.rx[kmilan], track.ry[kmilan], track.rz[kmilan]];
      for (let i = 0; i < 5; i++) {
        const h = 50 + i * 15, d = 280 + i * 30;
        const mx = px[kmilan] + kmr[0] * d, mz = pz[kmilan] + kmr[2] * d;
        if (onTrack(mx, mz, 14)) continue;
        addBox(out, [mx, py[kmilan] + h / 2, mz], [16, h, 16], [0.48 + i * 0.08, 0.46 + i * 0.08, 0.44 + i * 0.08]);
      }
    }
    // Suzuka: distant Mount Fuji backdrop and Japanese rural surroundings
    if (def.id === "suzuka") {
      // Mt. Fuji silhouette (very distant, large)
      const kfuji = Math.round(n * 0.3) % n;
      const kfr = [track.rx[kfuji], track.ry[kfuji], track.rz[kfuji]];
      addBox(out, [px[kfuji] + kfr[0] * 400, py[kfuji] + 80, pz[kfuji] + kfr[2] * 400],
             [180, 160, 120], [0.6, 0.58, 0.62]);  // Mount Fuji distant peak
      // Japanese countryside hills
      for (let i = 0; i < 4; i++) {
        const k = Math.round((i / 4) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        for (const side of [-1, 1]) {
          const hx = px[k] + r[0] * side * 240, hz = pz[k] + r[2] * side * 240;
          if (onTrack(hx, hz, 90)) continue;  // figure-8 crossover loops back near itself
          addBox(out, [hx, py[k] + 20, hz], [160, 40, 240], [0.3, 0.38, 0.24]);  // green hills
        }
      }
    }
    // Singapore: tropical skyline and distant urban sprawl
    if (def.id === "singapore") {
      for (let i = 0; i < 8; i++) {
        const k = Math.round((i / 8) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const h = 35 + hash(k * 31) * 65;
        const sx = px[k] + r[0] * (hw[k] + 160), sz = pz[k] + r[2] * (hw[k] + 160);
        if (onTrack(sx, sz, 20)) continue;
        addBox(out, [sx, py[k] + h / 2, sz], [28, h, 28], [0.35, 0.32, 0.38]);  // distant skyscrapers
      }
      // Tropical vegetation background
      every(18, (k) => {
        for (const side of [-1, 1]) {
          const d = 140 + hash(k * side) * 60;
          place(k, side, d, [2.2, 2.0, 2.2], [0.28, 0.35, 0.18]);
          place(k, side, d, [5.5, 8 + hash(k) * 6, 5.5], [0.18, 0.42, 0.2]);
        }
      });
    }
    // COTA: Texas Hill Country terrain, scattered trees, utilities
    if (def.id === "cota") {
      // Oak/cedar tree coverage (scattered natural vegetation) - reduced density to avoid clustering
      every(60, (k) => {
        for (const side of [-1, 1]) {
          for (let j = 0; j < 2; j++) {
            const d = 35 + hash(k * 43 + j) * 50;
            const s = hash(k * 45 + side + j);
            const h = 6 + s * 7;
            place(k, side, d, [1.4, 1.6, 1.4], [0.32, 0.24, 0.14]);
            place(k, side, d, [3.8, h, 3.8], [0.28, 0.38, 0.16]);
          }
        }
      });
      // Floodlight towers (scattered for evening sessions)
      every(140, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 47 + side) > 0.6) continue;
          const tower_d = hw[k] + 75 + hash(k * 49) * 30;
          place(k, side, tower_d, [2.0, 35, 2.0], [0.38, 0.38, 0.42]);
        }
      });
      // Observation tower support infrastructure
      const kobs = Math.round(n * 0.08) % n;
      const kobsr = [track.rx[kobs], track.ry[kobs], track.rz[kobs]];
      place(kobs, -1, hw[kobs] + 45, [8, 6, 8], [0.55, 0.50, 0.42]);  // support facility
      place(kobs, 1, hw[kobs] + 45, [6, 5, 6], [0.65, 0.60, 0.52]);   // utilities
    }
    // Interlagos: São Paulo urban sprawl, tropical vegetation, lake, hillside filler
    if (def.id === "interlagos") {
      // Distant city towers (São Paulo skyline)
      const ksp = Math.round(n * 0.35) % n;
      const kspr = [track.rx[ksp], track.ry[ksp], track.rz[ksp]];
      for (let i = 0; i < 9; i++) {
        const h = 45 + hash(ksp * (i + 1)) * 50;
        const d = 240 + i * 40;
        const tx = px[ksp] + kspr[0] * d, tz = pz[ksp] + kspr[2] * d;
        if (onTrack(tx, tz, 16)) continue;
        addBox(out, [tx, py[ksp] + h / 2, tz], [22, h, 22], [0.52 + hash(i) * 0.12, 0.48 + hash(i) * 0.12, 0.46 + hash(i) * 0.1]);
      }
      // Dense tropical vegetation on hillsides
      every(12, (k) => {
        for (const side of [-1, 1]) {
          for (let j = 0; j < 2; j++) {
            if (hash(k * 43 + side + j) > 0.35) continue;
            const d = 160 + hash(k * 44 + j) * 80;
            const s = hash(k * 46 + j);
            const h = 7 + s * 8;
            place(k, side, d, [1.8, 1.4, 1.8], [0.26, 0.20, 0.10]);
            place(k, side, d, [4.4, h, 4.4], [0.18, 0.42, 0.16]);
          }
        }
      });
      // Lake features and water terrain
      every(180, (k) => {
        const lake_d = 90 + hash(k * 48) * 100;
        for (const side of [-1, 1]) {
          const lx = px[k] + track.rx[k] * side * lake_d, lz = pz[k] + track.rz[k] * side * lake_d;
          if (onTrack(lx, lz, 55)) continue;
          addBox(out, [lx, pyMin - 3, lz], [100, 1.2, 140], [0.08, 0.22, 0.38]);
        }
      });
      // Pit complex and infrastructure
      every(250, (k) => {
        const side = hash(k * 50) < 0.5 ? -1 : 1;
        place(k, side, hw[k] + 35, [14, 12, 10], [0.48, 0.46, 0.44]);
      });
    }
    // Vegas: desert rock formations, Strip hotels, neon glow structures, sparse vegetation
    if (def.id === "vegas") {
      // Red rock formations (distant)
      for (let i = 0; i < 8; i++) {
        const k = Math.round((i / 8) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const rock_h = 35 + hash(k * 47) * 45;
        const rock_d = 250 + hash(k * 49) * 150;
        for (const side of [-1, 1]) {
          const rx = px[k] + r[0] * side * rock_d, rz = pz[k] + r[2] * side * rock_d;
          if (onTrack(rx, rz, 95)) continue;
          addBox(out, [rx, py[k] + rock_h / 2, rz], [180, rock_h, 240], [0.65, 0.52, 0.38]);
        }
      }
      // Floodlight towers for night racing
      every(110, (k) => {
        for (const side of [-1, 1]) {
          const tower_d = hw[k] + 70 + hash(k * 51) * 25;
          place(k, side, tower_d, [2.2, 35, 2.2], [0.35, 0.35, 0.40]);
          for (let lt = 0; lt < 4; lt++) {
            place(k, side, tower_d + hash(k + lt * 3) * 7, [1.2, 1.8, 1.2], [0.90, 0.60, 0.10]);  // warm lights
          }
        }
      });
      // Sparse desert vegetation (occasional bushes)
      every(80, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 53 + side) > 0.4) continue;
          const d = 50 + hash(k * 54) * 60;
          place(k, side, d, [2.0, 1.5, 2.0], [0.45, 0.38, 0.25]);
        }
      });
      // Power/utility infrastructure
      every(220, (k) => {
        const side = hash(k * 55) > 0.5 ? -1 : 1;
        place(k, side, hw[k] + 40, [6, 8, 6], [0.65, 0.62, 0.58]);
      });
    }
    // Madrid: Spanish plains and distant mountain range
    if (def.id === "madrid") {
      // Sierra de Guadarrama distant mountains
      for (let i = 0; i < 4; i++) {
        const k = Math.round((i / 4) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const mtn_d = 280 + i * 60;
        const mx = px[k] + r[0] * mtn_d, mz = pz[k] + r[2] * mtn_d;
        if (onTrack(mx, mz, 155)) continue;
        addBox(out, [mx, py[k] + 50, mz], [300, 100, 200], [0.5, 0.48, 0.52]);  // distant mountains
      }
      // Spanish plains vegetation
      every(25, (k) => {
        for (const side of [-1, 1]) {
          const d = 120 + hash(k * side) * 60;
          place(k, side, d, [1.8, 1.8, 1.8], [0.32, 0.24, 0.14]);
          place(k, side, d, [3.8, 6 + hash(k) * 5, 3.8], [0.28, 0.38, 0.18]);
        }
      });
      // IFEMA-style modern grandstands with clean white roofs at key corners
      for (const frac of [0.14, 0.38, 0.82]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 5) < 0.5 ? -1 : 1;
        prop(k, side, 10, [9, 11, 32], [0.80, 0.82, 0.86]);  // white shell
        prop(k, side, 8,  [9, 6, 30], [0.55, 0.30, 0.30]);   // crowd
        prop(k, side, 9,  [11, 2, 34], [0.90, 0.92, 0.95]);  // roof canopy
      }
    }
    // Zandvoort: North Sea coastal features and dune landscape
    if (def.id === "zandvoort") {
      // North Sea horizon: a single distant water strip far beyond the dunes.
      // Anchored well below pyMin (the lowest track point) and pushed far out so
      // it reads as a sliver on the horizon — never a flat plane floating into
      // the cockpit on the banked, elevation-changing sections. The foreground
      // beach slab was removed: the dune mounds below already cover the verge,
      // and a large near-grade plane is exactly what produced the wall.
      const ksea = Math.round(n * 0.4) % n;
      const kser = [track.rx[ksea], track.ry[ksea], track.rz[ksea]];
      const seaX = px[ksea] + kser[0] * 420, seaZ = pz[ksea] + kser[2] * 420;
      // 9m below the lowest track point, so even over a parallel stretch it
      // stays under the road — no onTrack rejection needed.
      addBox(out, [seaX, pyMin - 9, seaZ], [520, 3, 520], [0.10, 0.26, 0.42]);
      // Distant wind turbines (Dutch renewable energy). Guarded with onTrack so
      // a turbine projected perpendicular from one point never lands beside a
      // parallel stretch of this compact, winding circuit (the "pole in the road").
      for (let i = 0; i < 4; i++) {
        const k = Math.round((i / 4) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const tx = px[k] + r[0] * 380, tz = pz[k] + r[2] * 380;
        if (onTrack(tx, tz, 90)) continue;
        addBox(out, [tx, py[k] + 60, tz], [6, 120, 6], [0.82, 0.82, 0.84]);  // turbine tower
        addBox(out, [tx, py[k] + 68, tz], [80, 4, 6], [0.8, 0.8, 0.78]);     // turbine blades
      }
      // Sand dunes hugging the circuit (Zandvoort runs through the dune belt)
      every(22, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 71 + side) > 0.6) continue;
          const d = 28 + hash(k * 72 + side) * 40;
          prop(k, side, d, [18, 6 + hash(k * 73 + side) * 6, 18], [0.78, 0.72, 0.56]); // dune mound
          prop(k, side, d, [16, 1.4, 16], [0.62, 0.66, 0.40]);                          // marram grass
        }
      });
      // Sea of orange: Dutch grandstands packed with fans at the banked corners
      for (const frac of [0.12, 0.30, 0.50, 0.72, 0.90]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 7) < 0.5 ? -1 : 1;
        prop(k, side, 8, [8, 10, 26], [0.36, 0.38, 0.42]);  // stand shell
        prop(k, side, 6, [8, 6, 24], [0.92, 0.46, 0.08]);   // orange crowd
      }
      // Beach huts along the seafront approach
      every(120, (k) => {
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const o = (hash(k * 8) < 0.5 ? -1 : 1) * (hw[k] + 120);
        const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
        if (onTrack(cx, cz, 12)) return;
        const hutCol = [[0.85, 0.25, 0.20], [0.20, 0.45, 0.70], [0.90, 0.85, 0.30]][Math.floor(hash(k * 9) * 3) % 3];
        addBox(out, [cx, py[k] + 1.6, cz], [5, 4, 5], hutCol);
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
    }
    if (def.id === "suzuka") ferrisWheel(Math.round(n * 0.06) % n, 1, 40, 24);
    if (def.id === "singapore") ferrisWheel(Math.round(n * 0.05) % n, 1, 46, 28);

    // --- Monaco harbour: water + moored yachts along the start straight ---
    if (def.id === "monaco") {
      // Casino Square building (ornate 1865 structure visible from Casino corner, ~Turn 9-10).
      // Offset must clear the box's own half-width (24m) plus the road so the
      // 48m-wide structure never sits on the tarmac. Anchored well back.
      const kcs = Math.round(n * 0.32) % n;
      const kcsr = [track.rx[kcs], track.ry[kcs], track.rz[kcs]];
      const csX = px[kcs] + kcsr[0] * (hw[kcs] + 50);
      const csZ = pz[kcs] + kcsr[2] * (hw[kcs] + 50);
      if (!onTrack(csX, csZ, 26)) {
        addBox(out, [csX, py[kcs] + 22, csZ], [48, 44, 36], [0.82, 0.78, 0.68]); // Casino main structure
        for (let i = 0; i < 4; i++) {
          addBox(out, [csX + kcsr[0] * (-20 + i * 15), py[kcs] + 32, csZ + kcsr[2] * (-20 + i * 15)],
                 [8, 20, 8], [0.92, 0.9, 0.85]); // ornate columns
        }
      }

      for (let i = 0; i < 13; i++) {
        const k = (i * 3) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const o = hw[k] + 40;
        // Removed water boxes that were creating a horizontal blocking plane
        if (i % 2 === 0) {
          const yo = hw[k] + 18;
          addBox(out, [px[k] + r[0] * yo, py[k] + 1.2, pz[k] + r[2] * yo], [4, 3, 11], [0.95, 0.95, 0.97]); // yacht hull
          addBox(out, [px[k] + r[0] * yo, py[k] + 4, pz[k] + r[2] * yo], [2.2, 2, 5], [0.85, 0.86, 0.9]);   // cabin
        }
      }
      // A pair of moored super-yachts further out in the harbour
      for (const yi of [2, 7]) {
        const k = (yi * 3) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const yo = hw[k] + 34;
        const yx = px[k] + r[0] * yo, yz = pz[k] + r[2] * yo;
        if (onTrack(yx, yz, 14)) continue;
        addBox(out, [yx, py[k] + 2.5, yz], [8, 6, 26], [0.97, 0.97, 0.99]); // hull
        addBox(out, [yx, py[k] + 7, yz], [5, 4, 13], [0.80, 0.83, 0.90]);   // superstructure
        addBox(out, [yx, py[k] + 10.5, yz], [3, 2, 6], [0.60, 0.66, 0.78]); // top deck
      }
      // Promenade date-palms along the harbour railing (open side only)
      every(34, (k) => {
        if (k > n * 0.5) return;
        prop(k, 1, 4, [0.6, 5, 0.6], [0.34, 0.26, 0.14]);
        prop(k, 1, 4, [3.6, 1.4, 3.6], [0.18, 0.36, 0.14]);
      });
      // Tunnel: concrete ceiling from Portier (~52%) to post-tunnel chicane (~58%).
      // The section runs underground parallel to the harbour — a unique Monaco feature.
      {
        const tunS = Math.round(0.51 * n) % n;
        const tunE = Math.round(0.585 * n) % n;
        const tunLen = ((tunE - tunS) + n) % n;
        const tunStep = Math.max(2, Math.round(5.0 / ds));
        for (let i = 0; i < tunLen; i += tunStep) {
          const k = (tunS + i) % n;
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          const cw = hw[k] * 2 + 4.5;
          addBox(out, [px[k], py[k] + 6.3, pz[k]], [cw, 1.1, ds * tunStep * 1.05],
                 [0.30, 0.29, 0.34], [r, u, t]);
        }
        // Tunnel portals at entry and exit
        for (const frac of [0.51, 0.585]) {
          const k = Math.round(frac * n) % n;
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          addBox(out, [px[k], py[k] + 3.6, pz[k]], [hw[k] * 2 + 6, 7.2, 1.8],
                 [0.34, 0.33, 0.38], [r, u, t]);
        }
      }
    }

    // --- per-circuit iconic landmarks ---
    if (def.id === "cota") {
      // observation tower at Turn 1 (251 ft / 76 m steel structure) - pushed further back to avoid clipping
      const kc = Math.round(n * 0.08) % n;
      const r = [track.rx[kc], track.ry[kc], track.rz[kc]];
      const tcx = px[kc] + r[0] * (hw[kc] + 90), tcy = py[kc], tcz = pz[kc] + r[2] * (hw[kc] + 90);
      addBox(out, [tcx, tcy + 42, tcz], [4.5, 84, 4.5], [0.88, 0.88, 0.90]);
      addBox(out, [tcx - r[0] * 10, tcy + 84, tcz - r[2] * 10], [22, 4, 10], [0.88, 0.88, 0.90]);
      addBox(out, [tcx - r[0] * 16, tcy + 87, tcz - r[2] * 16], [10, 3, 8], [0.95, 0.44, 0.05]);
      // Red steel tube grandstand framework (COTA signature design element) - increased spacing to avoid overlaps
      for (let i = 0; i < 8; i++) {
        const k = (Math.round(n * 0.15) + i * Math.round(n / 8)) % n;
        const rk = [track.rx[k], track.ry[k], track.rz[k]];
        const tk = [track.tx[k], 0, track.tz[k]];
        const o = hw[k] + 22 + (i % 2) * 10;
        for (const side of [-1, 1]) {
          addBox(out, [px[k] + rk[0] * side * o, py[k] + 12, pz[k] + rk[2] * side * o],
                 [3, 24, 20], [0.95, 0.44, 0.05], [rk, [0, 1, 0], tk]);
        }
      }
      // Austin360 Amphitheater: curved canopy roof behind Turn 12
      const kamp = Math.round(n * 0.62) % n;
      const kar = [track.rx[kamp], track.ry[kamp], track.rz[kamp]];
      const ampX = px[kamp] + kar[0] * (hw[kamp] + 70), ampZ = pz[kamp] + kar[2] * (hw[kamp] + 70);
      if (!onTrack(ampX, ampZ, 30)) {
        addBox(out, [ampX, py[kamp] + 18, ampZ], [48, 36, 30], [0.86, 0.84, 0.80]);
        addBox(out, [ampX, py[kamp] + 38, ampZ], [54, 4, 36], [0.70, 0.72, 0.76]);
      }
      // Texas Hill Country ridgeline on the horizon
      every(80, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 200 + hash(k * 8 + side) * 110, [180, 30, 180], [0.34, 0.34, 0.22]);
        }
      });
    }
    if (def.id === "vegas") {
      // MSG Sphere — distinctive multi-colour LED sphere east of the Strip
      const kc = Math.round(n * 0.50) % n;
      const r = [track.rx[kc], track.ry[kc], track.rz[kc]];
      const scx = px[kc] + r[0] * (hw[kc] + 148), scz = pz[kc] + r[2] * (hw[kc] + 148);
      const hubY = py[kc] + 58, rad = 52;
      const vc = [[0.9, 0.4, 0.05], [0.05, 0.75, 0.95], [0.9, 0.05, 0.85], [0.95, 0.9, 0.05]];
      for (let i = 1; i <= 6; i++) {
        const phi = (i / 7) * Math.PI, ringR = rad * Math.sin(phi), ringY = hubY + rad * Math.cos(phi);
        for (let j = 0; j < 14; j++) {
          const theta = (j / 14) * Math.PI * 2;
          addBox(out, [scx + ringR * Math.cos(theta), ringY, scz + ringR * Math.sin(theta)], [7, 7, 7], vc[(i + j) % 4]);
        }
      }
      addBox(out, [scx, hubY + rad, scz], [7, 7, 7], vc[0]);
      addBox(out, [scx, hubY - rad, scz], [7, 7, 7], vc[2]);
      // Strip hotel towers visible from pit area (Bellagio, Caesars Palace, Paris)
      const khot = Math.round(n * 0.08) % n;
      const khr = [track.rx[khot], track.ry[khot], track.rz[khot]];
      for (let i = 0; i < 4; i++) {
        const h = 40 + i * 20, d = 140 + i * 30;
        const hx = px[khot] + khr[0] * d, hz = pz[khot] + khr[2] * d;
        const tone = [0.8, 0.75, 0.7, 0.65][i];
        addBox(out, [hx, py[khot] + h / 2, hz], [30 + i * 8, h, 30 + i * 8], [tone, tone * 0.95, tone * 0.9]);
      }
    }
    if (def.id === "singapore") {
      // Gardens by the Bay supertrees alongside the circuit
      const ks = Math.round(n * 0.30) % n;
      const stc = [[0.9, 0.1, 0.6], [0.1, 0.8, 0.95], [0.95, 0.78, 0.1]];
      for (let i = 0; i < 6; i++) {
        const k = (ks + i * 5) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const o = hw[k] + 28 + i * 9, h = 20 + i * 5;
        const scx = px[k] + r[0] * o, scz = pz[k] + r[2] * o;
        addBox(out, [scx, py[k] + h * 0.5, scz], [2.5, h, 2.5], [0.15, 0.18, 0.22]);
        addBox(out, [scx, py[k] + h + 4, scz], [12 + i * 2, 8, 12 + i * 2], [0.06, 0.38, 0.14]);
        addBox(out, [scx, py[k] + h + 0.5, scz], [14 + i * 2, 1.5, 14 + i * 2], stc[i % 3]);
      }
      // Marina Bay Sands: 3-tower hotel complex near start/finish area with connecting bridge
      const kmb = Math.round(n * 0.03) % n;
      const kmbr = [track.rx[kmb], track.ry[kmb], track.rz[kmb]];
      for (let i = -1; i <= 1; i++) {
        const tx = px[kmb] + kmbr[0] * (hw[kmb] + 120 + i * 18);
        const tz = pz[kmb] + kmbr[2] * (hw[kmb] + 120 + i * 18);
        const h = 57 + i * 3;  // tallest in middle
        addBox(out, [tx, py[kmb] + h / 2, tz], [20, h, 20], [0.92, 0.92, 0.95]);
      }
      const mbs_mid = px[kmb] + kmbr[0] * (hw[kmb] + 120);
      const mbz_mid = pz[kmb] + kmbr[2] * (hw[kmb] + 120);
      addBox(out, [mbs_mid, py[kmb] + 50, mbz_mid], [60, 5, 12], [0.85, 0.85, 0.88]); // roof bridge
    }
    if (def.id === "interlagos") {
      // Lake: body of water visible from inside track (pit area perspective)
      const klake = Math.round(n * 0.18) % n;
      const klaker = [track.rx[klake], track.ry[klake], track.rz[klake]];
      const wlx = px[klake] + klaker[0] * 110, wlz = pz[klake] + klaker[2] * 110;
      if (!onTrack(wlx, wlz, 145)) addBox(out, [wlx, pyMin - 3, wlz], [280, 1.2, 200], [0.08, 0.25, 0.45]);
      // São Paulo tower-block backdrop visible across the lake
      for (let i = 0; i < 9; i++) {
        const k = (Math.round(n * 0.22) + i * 8) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const s = hash(k * 11 + i), side = (i % 2 === 0) ? 1 : -1;
        const h = 48 + s * 46, o = hw[k] + 68 + s * 28;
        const tone = 0.50 + s * 0.22;
        const bx = px[k] + r[0] * o * side, bz = pz[k] + r[2] * o * side;
        if (onTrack(bx, bz, 12)) continue;
        addBox(out, [bx, py[k] + h * 0.5, bz], [11, h, 11], [tone, tone * 0.93, tone * 0.86]);
      }
      // Pit complex: modernized brutalist control tower, oriented alongside the
      // start straight (prop() clears its depth so it never sits on the tarmac).
      const kpit = Math.round(n * 0.02) % n;
      prop(kpit, 1, 12, [14, 36, 44], [0.5, 0.48, 0.46]);   // control tower (14m deep)
      prop(kpit, 1, 12, [16, 6, 40], [0.42, 0.42, 0.44]);   // overhanging roof band
      // Colourful hillside houses (the São Paulo favela backdrop) — small boxes
      // set well back and onTrack-guarded so they never become a wall or ceiling.
      const favCol = [[0.82, 0.46, 0.34], [0.86, 0.74, 0.40], [0.46, 0.58, 0.66],
                      [0.78, 0.78, 0.72], [0.60, 0.70, 0.52]];
      every(14, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 61 + side) > 0.5) continue;
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const stack = 1 + Math.floor(hash(k * 62 + side) * 3);
          for (let j = 0; j < stack; j++) {
            const d = 95 + j * 12 + hash(k * 63 + side + j) * 40;
            const o = side * (hw[k] + d);
            const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
            if (onTrack(cx, cz, 10)) continue;
            const h = 5 + hash(k * 64 + side + j) * 4;
            addBox(out, [cx, py[k] + 6 + j * 7 + h / 2, cz], [7, h, 7],
                   favCol[Math.floor(hash(k * 65 + side + j) * 5) % 5]);
          }
        }
      });
      // Grandstands at the Senna S and the start straight
      for (const frac of [0.06, 0.30, 0.55]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 5) < 0.5 ? -1 : 1;
        prop(k, side, 9, [8, 9, 28], [0.42, 0.42, 0.48]);
        prop(k, side, 7, [8, 5, 26], [0.30, 0.46, 0.34]);   // green/yellow Brazilian crowd
      }
    }
    if (def.id === "monza") {
      // Italian umbrella pines — taller and narrower than the generic green trees
      every(28, (k) => {
        const s = hash(k * 31);
        if (s < 0.40) return;
        const side = s < 0.70 ? -1 : 1, d = 10 + s * 5, h = 15 + s * 9;
        place(k, side, d, [1.2, 1.8, 1.2], [0.28, 0.19, 0.10]);
        place(k, side, d, [3.0, h, 3.0], [0.07, 0.27, 0.09]);
      });
      // Tribuna Centrale: main grandstand spanning the pit straight (white/cream
      // Italian classic). Built as oriented segments via prop() so each sits
      // alongside the track with its inner face cleared — never a wall across it.
      const ktc = Math.round(n * 0.01) % n;
      const seg = Math.max(1, Math.round(n * 0.006));
      for (let i = 0; i < 6; i++) {
        const k = (ktc + i * seg) % n;
        prop(k, -1, 10, [9, 22, 24], [0.85, 0.83, 0.78]);   // stand shell (9m deep)
        prop(k, -1, 8,  [9, 13, 22], [0.66, 0.42, 0.36]);   // crowd tiers
      }
      // Control tower with press centre, set back beyond the stand
      prop(ktc, -1, 16, [10, 40, 12], [0.95, 0.95, 0.97]);
      // Sopraelevata: weathered banking of the abandoned oval, looming in the park
      for (let i = 0; i < 5; i++) {
        const k = (Math.round(n * 0.42) + i * 4) % n;
        backdrop(k, 1, 120 + i * 10, [30, 16, 60], [0.55, 0.54, 0.50]);
      }
      // Grandstands at Curva Grande and the Parabolica. prop()'s sz is
      // [depth(perpendicular), height, length(along track)] — shallow + long so
      // the stand runs alongside the corner instead of jutting into it.
      for (const frac of [0.10, 0.46, 0.88]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 5) < 0.5 ? -1 : 1;
        prop(k, side, 9, [8, 9, 30], [0.42, 0.42, 0.48]);
        prop(k, side, 7, [8, 5, 28], [0.66, 0.40, 0.34]);
      }
    }
    if (def.id === "suzuka") {
      // Sakura (cherry blossom) trees scattered among the green zones
      every(55, (k) => {
        const s = hash(k * 41);
        if (s < 0.45) return;
        const side = s < 0.72 ? -1 : 1, d = 11 + s * 7;
        place(k, side, d, [1.1, 1.3, 1.1], [0.32, 0.22, 0.12]);
        place(k, side, d, [3.8, 3.5 + s * 2, 3.8], [0.92, 0.55, 0.64]);
      });
      // Theme park area beside ferris wheel (recreational buildings)
      const ktp = Math.round(n * 0.05) % n;
      const ktpr = [track.rx[ktp], track.ry[ktp], track.rz[ktp]];
      for (let i = 0; i < 4; i++) {
        const h = 8 + i * 3, d = 60 + i * 12;
        addBox(out, [px[ktp] + ktpr[0] * d, py[ktp] + h / 2, pz[ktp] + ktpr[2] * d],
               [24 + i * 6, h, 28], [0.6 + i * 0.05, 0.45 + i * 0.08, 0.3 + i * 0.04]);
      }
      // Grandstands at the Esses and the Spoon (always packed at Suzuka)
      for (const frac of [0.16, 0.40, 0.62, 0.84]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 5) < 0.5 ? -1 : 1;
        prop(k, side, 9, [8, 9, 28], [0.42, 0.42, 0.48]);
        prop(k, side, 7, [8, 5, 26], [0.30, 0.40, 0.62]);   // blue-clad fans
      }
      // Forested Mie-prefecture hills beyond the park
      every(70, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 200 + hash(k * 6 + side) * 100, [180, 44, 180], [0.18, 0.32, 0.20]);
        }
      });
    }
    if (def.id === "silverstone") {
      // The Wing — curved pit-lane roof structure on the main straight (390m long, 1200 tonnes steel)
      for (let i = 0; i < 6; i++) {
        const k = (Math.round(n * 0.01) + i * 3) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const t = [track.tx[k], track.ty[k], track.tz[k]];
        const u = upOf(track, k);
        const rise = Math.sin((i / 5) * Math.PI) * 5;
        const scx = px[k] + r[0] * (hw[k] + 4), scy = py[k], scz = pz[k] + r[2] * (hw[k] + 4);
        // metallic silver polyester-coated steel panels (RAL 9006)
        addBox(out, [scx, scy + 12 + rise * 0.5, scz], [1.5, 24 + rise, 18], [0.75, 0.75, 0.78], [r, u, t]);
        addBox(out, [scx, scy + 25 + rise, scz], [36, 1.5, 20], [0.72, 0.72, 0.75], [r, u, t]);
        // support structures
        if (i > 0 && i < 5) {
          addBox(out, [scx - r[0] * 8, scy + 18 + rise * 0.3, scz - r[2] * 8], [2, 16, 4], [0.68, 0.68, 0.72], [r, u, t]);
          addBox(out, [scx + r[0] * 8, scy + 18 + rise * 0.3, scz + r[2] * 8], [2, 16, 4], [0.68, 0.68, 0.72], [r, u, t]);
        }
      }
    }
    if (def.id === "bahrain") {
      // Sakhir Tower: 9-storey conical race control with LED facade, visible from grid start
      const ksc = Math.round(n * 0.01) % n;
      const kr = [track.rx[ksc], track.ry[ksc], track.rz[ksc]];
      const ksX = px[ksc] + kr[0] * (hw[ksc] + 45), ksY = py[ksc], ksZ = pz[ksc] + kr[2] * (hw[ksc] + 45);
      addBox(out, [ksX, ksY + 20, ksZ], [14, 40, 14], [0.95, 0.95, 0.97]); // main tower
      addBox(out, [ksX, ksY + 38, ksZ], [10, 8, 10], [0.1, 0.1, 0.12]);    // top section
      addBox(out, [ksX, ksY + 42, ksZ], [8, 4, 8], [0.9, 0.3, 0.05]);       // orange cap
      // Arch grandstand + minaret: a nod to the circuit's Islamic architecture
      const kc = Math.round(n * 0.52) % n;
      const r = [track.rx[kc], track.ry[kc], track.rz[kc]];
      const tl = Math.hypot(track.tx[kc], track.tz[kc]) || 1;
      const tn = [track.tx[kc] / tl, 0, track.tz[kc] / tl];
      const scx = px[kc] + r[0] * (hw[kc] + 30), scz = pz[kc] + r[2] * (hw[kc] + 30), bY = py[kc];
      addBox(out, [scx + tn[0] * (-14), bY + 14, scz + tn[2] * (-14)], [4, 28, 4], [0.84, 0.77, 0.55]);
      addBox(out, [scx + tn[0] * 14,   bY + 14, scz + tn[2] * 14  ], [4, 28, 4], [0.84, 0.77, 0.55]);
      addBox(out, [scx,                 bY + 29, scz                ], [38, 3, 5], [0.84, 0.77, 0.55]);
      addBox(out, [scx + tn[0] * 24,   bY + 22, scz + tn[2] * 24  ], [3.5, 44, 3.5], [0.92, 0.83, 0.64]);
      addBox(out, [scx + tn[0] * 24,   bY + 46, scz + tn[2] * 24  ], [7, 4, 7], [0.92, 0.65, 0.10]);
    }

    // bridge supports: pillars from the ground up to the raised deck, set a
    // little along the deck from the exact crossing so they clear the lower road
    const brs = BRIDGES[def.id];
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
    return Object.assign({
      zenith: [0.18, 0.40, 0.78], horizon: [0.62, 0.74, 0.88], sun: [1, 0.96, 0.85],
      grass: [0.18, 0.42, 0.16], runoff: [0.55, 0.42, 0.28], fog: [0.62, 0.74, 0.88],
      asphalt: [0.16, 0.17, 0.19], line: [0.95, 0.95, 0.98],
      fogDensity: 0.0017, kerbA: [0.85, 0.12, 0.12], kerbB: [0.95, 0.95, 0.95], concrete: [0.50, 0.48, 0.44],
      ambientSky: [0.45, 0.52, 0.62], ambientGround: [0.22, 0.22, 0.18],
      sunColor: [1, 0.95, 0.82], sunDir: norm([0.4, 0.72, 0.3]),
    }, o);
  }
  function nightPal(o) {
    return Object.assign({
      zenith: [0.05, 0.06, 0.14], horizon: [0.12, 0.14, 0.24], sun: [0.4, 0.4, 0.5],
      grass: [0.14, 0.18, 0.14], runoff: [0.28, 0.26, 0.24], fog: [0.08, 0.09, 0.15],
      asphalt: [0.18, 0.19, 0.22], line: [0.9, 0.9, 0.95],
      fogDensity: 0.0023, kerbA: [0.85, 0.12, 0.12], kerbB: [0.92, 0.92, 0.92], concrete: [0.42, 0.40, 0.38],
      ambientSky: [0.55, 0.56, 0.64], ambientGround: [0.28, 0.28, 0.30],
      sunColor: [0.7, 0.72, 0.8], sunDir: norm([0.1, 0.9, 0.2]),
    }, o);
  }

  // Per-circuit bridge decks (arc fraction of the overpass centre, ramp
  // half-window in metres, peak rise). Suzuka is a figure-8: its back straight
  // crosses over the section out of the esses.
  const BRIDGES = {
    suzuka: [{ s: 0.811, halfM: 150, rise: 7 }],
  };

  // Elevation changes (terrain follows road; distinct from BRIDGES where terrain stays flat).
  // Each entry is a cosine bump centred at lap fraction s, spanning ±halfM metres.
  // Negative rise = descent (e.g. Eau Rouge dip before Raidillon climb).
  const ELEVATIONS = {
    spa:        [{ s: 0.07, halfM: 270, rise: -14 }, { s: 0.12, halfM: 500, rise: 26 }],
    monaco:     [{ s: 0.27, halfM: 340, rise: 18 }],
    // COTA kept flat: its compact, open infield exposed the elevated Turn 1
    // terrain ribbon as a green plane floating across the infield from lower
    // parts of the lap. (was [{ s: 0.06, halfM: 440, rise: 28 }])
    cota:       [],
    // Interlagos kept flat: the s=0.86 climb floated the terrain ribbon over the
    // lower road as a green plane on this compact circuit (same failure as COTA /
    // Bahrain). (was [{ s: 0.86, halfM: 560, rise: 16 }])
    interlagos: [],
    silverstone:[{ s: 0.62, halfM: 360, rise:  9 }],
    zandvoort:  [{ s: 0.56, halfM: 300, rise: 12 }],
    // Bahrain kept flat: the s=0.45 dip created a bowl whose higher rim pushed
    // the terrain ribbon across the lower road as a plane bisecting the car
    // (same failure COTA had). (was [{ s: 0.45, halfM: 380, rise: -8 }])
    bahrain:    [],
  };

  const DEFS = [
    { id: "bahrain", name: "BAHRAIN", gp: "Bahrain GP", country: "Bahrain", night: true, theme: "desert", lengthKm: 5.4, baseHW: 7,
      pal: nightPal({ horizon: [0.10, 0.07, 0.10], concrete: [0.27, 0.26, 0.25], runoff: [0.24, 0.23, 0.22], grass: [0.19, 0.17, 0.14] }),
      segs: [{ t: 0, l: 520 }, { t: 90, l: 100 }, { t: -40, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 240 }, { t: 80, l: 100 },
        { t: -30, l: 80 }, { t: 70, l: 100 }, { t: 0, l: 300 }, { t: 60, l: 90 }, { t: 0, l: 120 }, { t: 60, l: 110 }] },
    { id: "monaco", name: "MONACO", gp: "Monaco GP", country: "Monaco", night: false, theme: "street_day", lengthKm: 3.3, baseHW: 5,
      pal: dayPal({ horizon: [0.55, 0.68, 0.82], grass: [0.36, 0.35, 0.34], runoff: [0.42, 0.41, 0.40], concrete: [0.24, 0.23, 0.22], fogDensity: 0.0014,
        sunDir: norm([0.22, 0.88, 0.42]), sun: [1.0, 0.98, 0.93], sunColor: [1.0, 0.97, 0.90] }),
      segs: [{ t: 0, l: 230 }, { t: 70, l: 75 }, { t: -25, l: 260, h: 14 }, { t: -70, l: 110 }, { t: 80, l: 80, w: 4.8 },
        { t: 0, l: 90, h: -6 }, { t: 80, l: 80, w: 4.8 }, { t: 160, l: 120, w: 4.5, h: -4 }, { t: 55, l: 80 }, { t: 45, l: 80 },
        { t: -15, l: 260, h: -4 }, { t: 60, l: 70, w: 4.8 }, { t: 0, l: 40 }, { t: -65, l: 60 }, { t: 65, l: 60 }, { t: -40, l: 100 },
        { t: 70, l: 65, w: 4.8 }, { t: 0, l: 35 }, { t: -70, l: 65 }, { t: 80, l: 70 }, { t: -70, l: 65 }, { t: 75, l: 70, w: 4.8 }, { t: 40, l: 120 }] },
    { id: "silverstone", name: "SILVERSTONE", gp: "British GP", country: "UK", night: false, theme: "green", lengthKm: 5.9, baseHW: 8,
      pal: dayPal({ zenith: [0.30, 0.42, 0.62], horizon: [0.66, 0.72, 0.78], grass: [0.20, 0.46, 0.18], fogDensity: 0.0016,
        sunDir: norm([0.35, 0.46, 0.60]), sun: [0.88, 0.91, 1.0], sunColor: [0.84, 0.88, 0.96] }),
      segs: [{ t: 0, l: 260 }, { t: 60, l: 120 }, { t: -50, l: 90 }, { t: 80, l: 80 }, { t: -150, l: 160 }, { t: 0, l: 120 },
        { t: -70, l: 90 }, { t: 120, l: 150 }, { t: 40, l: 100 }, { t: 0, l: 160 }, { t: 70, l: 130 },
        { t: -55, l: 70 }, { t: 60, l: 70 }, { t: -55, l: 70 }, { t: 50, l: 70 }, { t: 0, l: 300 }, { t: 75, l: 110 },
        { t: -40, l: 90 }, { t: 95, l: 90 }, { t: 60, l: 90 }] },
    { id: "spa", name: "SPA", gp: "Belgian GP", country: "Belgium", night: false, theme: "green", lengthKm: 7.0, baseHW: 8,
      pal: dayPal({ zenith: [0.34, 0.44, 0.56], horizon: [0.6, 0.65, 0.66], grass: [0.12, 0.34, 0.14], runoff: [0.4, 0.4, 0.4], fog: [0.66, 0.7, 0.72], fogDensity: 0.0026,
        sunDir: norm([0.58, 0.36, 0.44]), sun: [0.98, 0.84, 0.64], sunColor: [0.90, 0.80, 0.62] }),
      segs: [{ t: 0, l: 120 }, { t: 170, l: 80, h: -4 }, { t: 0, l: 140, h: -18 }, { t: -40, l: 60, h: 6 }, { t: 50, l: 60, h: 14 },
        { t: -30, l: 80, h: 16 }, { t: 0, l: 480, h: 18 }, { t: 70, l: 90 }, { t: -60, l: 90, h: -6 }, { t: 50, l: 140, h: -12 },
        { t: -90, l: 160, h: -10 }, { t: 40, l: 90 }, { t: -50, l: 90 }, { t: 70, l: 110 }, { t: 0, l: 320, h: -6 },
        { t: -30, l: 180 }, { t: 80, l: 70 }, { t: -85, l: 70 }, { t: 30, l: 120 }] },
    { id: "monza", name: "MONZA", gp: "Italian GP", country: "Italy", night: false, theme: "green", lengthKm: 5.8, baseHW: 8,
      pal: dayPal({ zenith: [0.22, 0.42, 0.72], horizon: [0.7, 0.74, 0.7], grass: [0.2, 0.44, 0.18],
        sunDir: norm([0.74, 0.50, 0.22]), sun: [1.0, 0.88, 0.60], sunColor: [1.0, 0.86, 0.58] }),
      segs: [{ t: 0, l: 560 }, { t: 70, l: 55 }, { t: -75, l: 60 }, { t: 80, l: 220 }, { t: 0, l: 200 }, { t: -60, l: 55 },
        { t: 70, l: 70 }, { t: 75, l: 130 }, { t: 60, l: 120 }, { t: 0, l: 260 }, { t: -50, l: 55 }, { t: 65, l: 70 },
        { t: 0, l: 360 }, { t: 150, l: 220 }] },
    { id: "suzuka", name: "SUZUKA", gp: "Japanese GP", country: "Japan", night: false, theme: "green", lengthKm: 5.8, baseHW: 7,
      pal: dayPal({ zenith: [0.28, 0.46, 0.72], horizon: [0.74, 0.74, 0.8], grass: [0.2, 0.44, 0.2],
        sunDir: norm([0.84, 0.42, 0.14]), sun: [1.0, 0.84, 0.58], sunColor: [1.0, 0.82, 0.55] }),
      segs: [{ t: 0, l: 440, h: -6 }, { t: 50, l: 120 }, { t: -35, l: 100, h: 6 }, { t: 45, l: 110, h: 6 }, { t: -30, l: 100, h: 4 },
        { t: 55, l: 120 }, { t: 60, l: 110 }, { t: 80, l: 120, h: -4 }, { t: 70, l: 120, h: -6 }, { t: 0, l: 300 },
        { t: 45, l: 120, h: 6 }, { t: -20, l: 90 }, { t: 40, l: 140 }] },
    { id: "singapore", name: "SINGAPORE", gp: "Singapore GP", country: "Singapore", night: true, theme: "street_night", lengthKm: 4.9, baseHW: 6,
      pal: nightPal({ horizon: [0.08, 0.05, 0.14] }),
      segs: [{ t: 0, l: 160 }, { t: 60, l: 70 }, { t: -70, l: 70 }, { t: 55, l: 70 }, { t: 0, l: 220 }, { t: 90, l: 70 },
        { t: 0, l: 200 }, { t: 95, l: 70 }, { t: -90, l: 80 }, { t: 80, l: 60 }, { t: -60, l: 70 }, { t: 90, l: 90 },
        { t: 0, l: 180 }, { t: 90, l: 70 }, { t: 90, l: 70 }, { t: -85, l: 60 }, { t: 95, l: 80 }] },
    { id: "cota", name: "COTA", gp: "United States GP", country: "USA", night: false, theme: "green", lengthKm: 5.5, baseHW: 8,
      pal: dayPal({ zenith: [0.24, 0.50, 0.84], horizon: [0.76, 0.70, 0.54], grass: [0.34, 0.4, 0.14], runoff: [0.6, 0.35, 0.2], ambientSky: [0.52, 0.58, 0.68], ambientGround: [0.28, 0.28, 0.24],
        sunDir: norm([0.52, 0.54, 0.62]), sun: [1.0, 0.90, 0.70], sunColor: [1.0, 0.88, 0.68] }),
      segs: [{ t: 0, l: 220, h: 30 }, { t: -120, l: 110, h: -6 }, { t: 0, l: 80, h: -22 }, { t: 60, l: 60 }, { t: -55, l: 60 },
        { t: 60, l: 60 }, { t: -55, l: 70 }, { t: 50, l: 70 }, { t: -40, l: 80 }, { t: -60, l: 90 }, { t: -120, l: 110 },
        { t: 0, l: 460 }, { t: -150, l: 130 }, { t: 70, l: 70 }, { t: -60, l: 70 }, { t: 80, l: 90 }, { t: 90, l: 160 }, { t: -130, l: 110 }] },
    { id: "interlagos", name: "INTERLAGOS", gp: "São Paulo GP", country: "Brazil", night: false, theme: "green", lengthKm: 4.3, baseHW: 7,
      pal: dayPal({ zenith: [0.26, 0.4, 0.6], horizon: [0.55, 0.58, 0.6], grass: [0.18, 0.46, 0.18], fog: [0.55, 0.58, 0.6], fogDensity: 0.0019,
        sunDir: norm([0.18, 0.82, 0.54]), sun: [1.0, 0.95, 0.82], sunColor: [1.0, 0.93, 0.80] }),
      segs: [{ t: 0, l: 240, h: 8 }, { t: -55, l: 100, h: -10 }, { t: 40, l: 90, h: -6 }, { t: -20, l: 400, h: -4 },
        { t: -60, l: 110 }, { t: -50, l: 100, h: 6 }, { t: 70, l: 100 }, { t: -80, l: 110 }, { t: 0, l: 160 }, { t: -90, l: 100 },
        { t: 60, l: 90 }, { t: -70, l: 100 }, { t: -110, l: 140, h: 6 }, { t: -20, l: 440, h: 18 }] },
    { id: "vegas", name: "LAS VEGAS", gp: "Las Vegas GP", country: "USA", night: true, theme: "street_night", lengthKm: 6.2, baseHW: 7,
      pal: nightPal({ horizon: [0.1, 0.06, 0.16] }),
      segs: [{ t: 0, l: 140 }, { t: 90, l: 70 }, { t: -60, l: 60 }, { t: 60, l: 60 }, { t: 0, l: 120 }, { t: -60, l: 60 },
        { t: 70, l: 60 }, { t: -55, l: 60 }, { t: 0, l: 360 }, { t: 90, l: 80 }, { t: -50, l: 70 }, { t: 0, l: 900, t2: 0 },
        { t: -20, l: 200 }, { t: 90, l: 90 }, { t: -60, l: 60 }, { t: 70, l: 70 }, { t: 65, l: 120 }] },
    { id: "madrid", name: "MADRID", gp: "Spanish GP", country: "Spain", night: false, theme: "modern", lengthKm: 5.5, baseHW: 7,
      pal: dayPal({ zenith: [0.24, 0.46, 0.78], horizon: [0.74, 0.74, 0.72], grass: [0.3, 0.42, 0.2],
        sunDir: norm([0.12, 0.96, 0.22]), sun: [1.0, 0.99, 0.96], sunColor: [1.0, 0.98, 0.94] }),
      segs: [{ t: 0, l: 320 }, { t: 70, l: 70 }, { t: -65, l: 70 }, { t: 50, l: 120 }, { t: 0, l: 360 }, { t: 90, l: 80 },
        { t: -85, l: 70 }, { t: 90, l: 80 }, { t: 0, l: 140 }, { t: 180, l: 240, b: 0.42, w: 9 }, { t: 0, l: 80 },
        { t: -60, l: 90, h: 6 }, { t: 70, l: 90, h: -4 }, { t: -50, l: 80 }, { t: 80, l: 90 }, { t: 60, l: 130 }] },
    { id: "zandvoort", name: "ZANDVOORT", gp: "Dutch GP", country: "Netherlands", night: false, theme: "green", lengthKm: 4.3, baseHW: 7,
      pal: dayPal({ zenith: [0.3, 0.44, 0.62], horizon: [0.72, 0.72, 0.68], grass: [0.42, 0.44, 0.24], runoff: [0.62, 0.54, 0.36], fog: [0.72, 0.72, 0.68], fogDensity: 0.0018,
        sunDir: norm([0.50, 0.58, 0.46]), sun: [1.0, 0.92, 0.76], sunColor: [1.0, 0.90, 0.74] }),
      segs: [{ t: 0, l: 260 }, { t: 75, l: 120, b: 0.16 }, { t: -50, l: 90 }, { t: 130, l: 150, b: 0.3 }, { t: 0, l: 180, h: 8 },
        { t: 40, l: 110, h: -8 }, { t: 60, l: 100 }, { t: -50, l: 90, h: 4 }, { t: 70, l: 90 }, { t: -60, l: 90 }, { t: 90, l: 90 },
        { t: -50, l: 90 }, { t: 50, l: 90 }, { t: 160, l: 160, b: 0.31, w: 8 }] },
  ];

  // Real circuit centerlines (js/circuits.js): projected OSM traces in metres.
  // We use the real layout instead of the authored segment lists. Points are
  // kept flat (y = 0) — the old per-segment elevation distributed a vertical
  // residual that tilted the whole loop, which is the height glitch on Monaco.
  function realPoints(id, baseHW) {
    const path = (typeof CircuitPaths !== "undefined") && CircuitPaths[id];
    if (!path) return null;
    let pts = path.pts.map((p) => [p[0], 0, p[1], baseHW, 0]);
    // light closed-loop smoothing to take the digitisation jitter off the
    // raw trace so the Catmull-Rom pass doesn't overshoot at noisy vertices
    const N = pts.length;
    for (let it = 0; it < 2; it++) {
      const sx = pts.map((p) => p[0]), sz = pts.map((p) => p[2]);
      const L = 0.25;
      for (let i = 0; i < N; i++) {
        const a = (i - 1 + N) % N, b = (i + 1) % N;
        pts[i][0] = sx[i] + L * ((sx[a] + sx[b]) * 0.5 - sx[i]);
        pts[i][2] = sz[i] + L * ((sz[a] + sz[b]) * 0.5 - sz[i]);
      }
    }
    return pts;
  }

  const LIST = DEFS.map((d) => {
    const def = { id: d.id, name: d.name, gp: d.gp, country: d.country, laps: 3, night: d.night, theme: d.theme, lengthKm: d.lengthKm, palette: d.pal };
    def.points = realPoints(d.id, d.baseHW) || centerline(d.segs, d.baseHW);
    return def;
  });

  return { LIST, build, sample, curvature, onKerb };
})();
