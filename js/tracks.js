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

    const track = { def, total, n, px, py, pz, tx, ty, tz, rx, ry, rz, hw, bank, meshes: {}, map: null };
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
      const exLen = Math.max(2, Math.round(c.hi * 0.7));
      ribbon(c.k + 1, c.k + 1 + exLen, -inside);
    }
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
      const stripe = (Math.floor((k * ds) / 4) % 2) === 0;
      const dash = (Math.floor((k * ds) / 7) % 2) === 0;   // dashed centre line
      const chk = stripe ? [0.95, 0.95, 0.97] : dark;
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
        if (v === 0 || v === 13) c = grass;                                   // grass shoulder
        else if (v === 1 || v === 12) c = grass;   // raised kerb ribbons added separately by buildKerbs
        else if (v === 2 || v === 3 || v === 10 || v === 11)                  // bold white edge line
          c = checker ? chk : line;
        else if (v === 6 || v === 7)                                          // dashed centre line
          c = checker ? chk : (dash ? line : asphalt);
        else                                                                   // asphalt running surface
          c = checker ? chk : asphalt;
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
    // two ribbons (left/right), 3 lateral verts each: inner, mid, outer.
    // The outer edge runs well past the track so the road sits on a wide
    // ground apron instead of floating against the sky.
    const latsL = [-2.2, -28, -120], latsR = [2.2, 28, 120];
    // flip: the right ribbon's lateral verts run the opposite way from the
    // left, so it needs the opposite winding to keep its top face front-facing
    // under BACK-face culling (otherwise the whole right apron is culled).
    function ribbon(lats, flip) {
      const base = pos.length / 3;
      const innerSign = lats[0] < 0 ? -1 : 1;     // which side this ribbon is on
      for (let k = 0; k < n; k++) {
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const u = upOf(track, k);
        const w = hw[k];
        const ramt = runoffAmt[k];
        // banking lift this ribbon's inner edge should inherit so it stays flush
        // with the (raised) road edge — full lift on the outer side, 0 on inner.
        const bankLift = bp ? bp.lift[k] : 0;
        const bankSide = bp ? bp.bsign[k] : 0;
        for (let v = 0; v < 3; v++) {
          // widen the inner apron at run-off zones: push the inner vert further
          // out and pull the mid vert inward so the flat tan band is broader.
          let lat = lats[v];
          if (v === 0) lat += innerSign * ramt * 8;        // inner edge out to ~10 m
          else if (v === 1) lat = lats[1] * (1 - 0.45 * ramt);
          const o = (lat < 0 ? -w : w) + lat;
          const sag = v === 0 ? -0.3 : -0.3 - Math.abs(lat) * 0.02;
          // inner vert (v=0) tracks road height to seal the edge at bridge sections;
          // outer verts blend down to gY so the ground stays flat away from the deck.
          const t = v / 2;
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
          // base ground colour blends runoff(near road) -> grass(far)
          let c0 = lerp(runoff[0], grass[0], t), c1 = lerp(runoff[1], grass[1], t), c2 = lerp(runoff[2], grass[2], t);
          // in run-off zones the inner/mid band turns tan tarmac/gravel instead
          // of grass; the outer vert stays grass so the apron has a clean edge.
          const apron = ramt * (v === 0 ? 1 : v === 1 ? 0.65 : 0);
          c0 = lerp(c0, APRON_COL[0], apron) + nz;
          c1 = lerp(c1, APRON_COL[1], apron) + nz;
          c2 = lerp(c2, APRON_COL[2], apron) + nz;
          col.push(c0, c1, c2);
        }
      }
      for (let k = 0; k < n; k++) {
        const a = base + k * 3, b = base + ((k + 1) % n) * 3;
        for (let v = 0; v < 2; v++) {
          if (flip) idxArr.push(a + v, a + v + 1, b + v, a + v + 1, b + v + 1, b + v);
          else idxArr.push(a + v, b + v, a + v + 1, a + v + 1, b + v, b + v + 1);
        }
      }
    }
    ribbon(latsL, false); ribbon(latsR, true);
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
    const place = (k, side, dist, sz, col) => {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const o = side * (hw[k] + dist);
      // sink the base 0.8m below grade so prop bottoms tuck under the terrain
      // apron instead of co-planar Z-fighting where box meets ground.
      const c = [px[k] + r[0] * o, py[k] + sz[1] / 2 - 0.8 + r[1] * o, pz[k] + r[2] * o];
      addBox(out, c, sz, col, [r, u, t]);
    };
    const every = (m, fn) => { const stp = Math.max(1, Math.round(m / ds)); for (let k = 0; k < n; k += stp) fn(k); };

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
          const o0 = side * (hw[k] + 0.35), o1 = side * (hw[kn] + 0.35);
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
      // occasional grandstand
      every(140, (k) => place(k, hash(k) < 0.5 ? -1 : 1, 14, [4, 6, 22], [0.5, 0.5, 0.55]));
    } else if (theme === "desert") {
      every(34, (k) => { for (const side of [-1, 1]) if (hash(k + side) > 0.6) place(k, side, 8 + hash(k) * 10, [2 + hash(k) * 3, 1.5, 2], [0.62, 0.5, 0.34]); });
    } else if (theme === "street_day") {  // Monaco
      every(20, (k) => {
        for (const side of [-1, 1]) {
          if (def.id === "monaco" && side === 1 && k < n * 0.14) continue; // leave the harbour open
          const s = hash(k * 3 + side), h = 10 + s * 26;
          const tone = 0.6 + s * 0.25;
          place(k, side, 5 + s * 3, [7, h, 7], [tone, tone * 0.92, tone * 0.78]);
        }
      });
    } else if (theme === "street_night") {  // Singapore / Vegas
      every(22, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 5 + side), h = 14 + s * 40;
          const neon = [[0.9, 0.1, 0.6], [0.1, 0.8, 0.9], [0.95, 0.75, 0.1], [0.5, 0.2, 0.9]][Math.floor(s * 4) % 4];
          // set taller towers further back so they don't fill the FOV and clip at
          // the viewport edge as the camera passes; short blocks stay near the wall.
          const dist = 9 + s * 18;
          place(k, side, dist, [8, h, 8], [0.05, 0.05, 0.08]);
          place(k, side, dist, [8.2, 2 + s * 3, 8.2], neon);  // glowing band
        }
      });
    } else if (theme === "modern") {  // Madrid
      every(30, (k) => { for (const side of [-1, 1]) { const s = hash(k + side); place(k, side, 9 + s * 6, [10, 8 + s * 14, 10], [0.8, 0.82, 0.86]); } });
      every(120, (k) => place(k, hash(k) < 0.5 ? -1 : 1, 14, [4, 6, 24], [0.85, 0.2, 0.2]));
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
      for (let i = 0; i < 13; i++) {
        const k = (i * 3) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const o = hw[k] + 28;
        addBox(out, [px[k] + r[0] * o, py[k] - 0.5, pz[k] + r[2] * o], [40, 0.6, 14], [0.13, 0.32, 0.5]); // water
        if (i % 2 === 0) {
          const yo = hw[k] + 18;
          addBox(out, [px[k] + r[0] * yo, py[k] + 1.2, pz[k] + r[2] * yo], [4, 3, 11], [0.95, 0.95, 0.97]); // yacht hull
          addBox(out, [px[k] + r[0] * yo, py[k] + 4, pz[k] + r[2] * yo], [2.2, 2, 5], [0.85, 0.86, 0.9]);   // cabin
        }
      }
    }

    // --- per-circuit iconic landmarks ---
    if (def.id === "cota") {
      // observation tower at Turn 1 (251 ft / 76 m steel structure)
      const kc = Math.round(n * 0.08) % n;
      const r = [track.rx[kc], track.ry[kc], track.rz[kc]];
      const tcx = px[kc] + r[0] * (hw[kc] + 55), tcy = py[kc], tcz = pz[kc] + r[2] * (hw[kc] + 55);
      addBox(out, [tcx, tcy + 42, tcz], [4.5, 84, 4.5], [0.88, 0.88, 0.90]);
      addBox(out, [tcx - r[0] * 10, tcy + 84, tcz - r[2] * 10], [22, 4, 10], [0.88, 0.88, 0.90]);
      addBox(out, [tcx - r[0] * 16, tcy + 87, tcz - r[2] * 16], [10, 3, 8], [0.95, 0.44, 0.05]);
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
    }
    if (def.id === "interlagos") {
      // São Paulo tower-block backdrop visible across the lake
      for (let i = 0; i < 9; i++) {
        const k = (Math.round(n * 0.22) + i * 8) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const s = hash(k * 11 + i), side = (i % 2 === 0) ? 1 : -1;
        const h = 48 + s * 46, o = hw[k] + 68 + s * 28;
        const tone = 0.50 + s * 0.22;
        addBox(out, [px[k] + r[0] * o * side, py[k] + h * 0.5, pz[k] + r[2] * o * side], [11, h, 11], [tone, tone * 0.93, tone * 0.86]);
      }
    }
    if (def.id === "zandvoort") {
      // Dutch windmill on the dunes
      const kc = Math.round(n * 0.36) % n;
      const r = [track.rx[kc], track.ry[kc], track.rz[kc]];
      const tl = Math.hypot(track.tx[kc], track.tz[kc]) || 1;
      const tn = [track.tx[kc] / tl, 0, track.tz[kc] / tl];
      const mcx = px[kc] + r[0] * (hw[kc] + 108), mcz = pz[kc] + r[2] * (hw[kc] + 108);
      const mby = py[kc];
      addBox(out, [mcx, mby + 15, mcz], [5, 30, 5], [0.85, 0.81, 0.70]);
      addBox(out, [mcx, mby + 32, mcz], [8, 5, 8], [0.78, 0.72, 0.60]);
      const hubX = mcx, hubY = mby + 32, hubZ = mcz;
      const wb = [r, [0, 1, 0], tn];
      addBox(out, [hubX + tn[0] * 8, hubY,     hubZ + tn[2] * 8], [2, 2, 14], [0.92, 0.90, 0.86], wb);
      addBox(out, [hubX - tn[0] * 8, hubY,     hubZ - tn[2] * 8], [2, 2, 14], [0.92, 0.90, 0.86], wb);
      addBox(out, [hubX,             hubY + 8,  hubZ            ], [2, 14, 2], [0.92, 0.90, 0.86], wb);
      addBox(out, [hubX,             hubY - 8,  hubZ            ], [2, 14, 2], [0.92, 0.90, 0.86], wb);
      // orange Dutch grandstands over the pit straight
      for (let i = 0; i < 5; i++) {
        const k = (Math.round(n * 0.02) + i * 5) % n;
        place(k, -1, 14, [4, 7, 20], [0.95, 0.44, 0.04]);
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
    }
    if (def.id === "silverstone") {
      // The Wing — curved pit-lane roof structure on the main straight
      for (let i = 0; i < 6; i++) {
        const k = (Math.round(n * 0.01) + i * 3) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const t = [track.tx[k], track.ty[k], track.tz[k]];
        const u = upOf(track, k);
        const rise = Math.sin((i / 5) * Math.PI) * 5;
        const scx = px[k] + r[0] * (hw[k] + 4), scy = py[k], scz = pz[k] + r[2] * (hw[k] + 4);
        addBox(out, [scx, scy + 12 + rise * 0.5, scz], [1.5, 24 + rise, 18], [0.88, 0.88, 0.90], [r, u, t]);
        addBox(out, [scx, scy + 25 + rise, scz], [36, 1.5, 20], [0.86, 0.86, 0.88], [r, u, t]);
      }
    }
    if (def.id === "bahrain") {
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
    for (const side of [-1, 1]) {
      const o = side * (w + 1.5);
      addBox(out, [track.px[0] + r[0] * o, track.py[0] + 3, track.pz[0] + r[2] * o], [1, 6, 1], [0.85, 0.1, 0.1], [r, u, t]);
    }
    addBox(out, [track.px[0], track.py[0] + 6.2, track.pz[0]], [w * 2 + 4, 0.8, 1.2], [0.1, 0.1, 0.12], [r, u, t]);
    addBox(out, [track.px[0], track.py[0] + 6.8, track.pz[0]], [w * 1.4, 0.6, 0.6], [0.95, 0.95, 0.97], [r, u, t]);
    return out;
  }

  // ---------- circuit layouts (turn +=right, lengths in meters pre-SCALE) ----------
  // palettes
  function dayPal(o) {
    return Object.assign({
      zenith: [0.18, 0.40, 0.78], horizon: [0.62, 0.74, 0.88], sun: [1, 0.96, 0.85],
      grass: [0.18, 0.42, 0.16], runoff: [0.55, 0.42, 0.28], fog: [0.62, 0.74, 0.88],
      asphalt: [0.16, 0.17, 0.19], line: [0.95, 0.95, 0.98],
      fogDensity: 0.0017, kerbA: [0.85, 0.12, 0.12], kerbB: [0.95, 0.95, 0.95],
      ambientSky: [0.45, 0.52, 0.62], ambientGround: [0.22, 0.22, 0.18],
      sunColor: [1, 0.95, 0.82], sunDir: norm([0.4, 0.72, 0.3]),
    }, o);
  }
  function nightPal(o) {
    return Object.assign({
      zenith: [0.01, 0.01, 0.04], horizon: [0.05, 0.06, 0.12], sun: [0.2, 0.2, 0.3],
      grass: [0.08, 0.12, 0.08], runoff: [0.18, 0.16, 0.14], fog: [0.03, 0.03, 0.07],
      asphalt: [0.10, 0.10, 0.13], line: [0.85, 0.85, 0.90],
      fogDensity: 0.0023, kerbA: [0.85, 0.12, 0.12], kerbB: [0.92, 0.92, 0.92],
      ambientSky: [0.42, 0.43, 0.5], ambientGround: [0.16, 0.16, 0.18],
      sunColor: [0.5, 0.52, 0.6], sunDir: norm([0.1, 0.9, 0.2]),
    }, o);
  }

  // Per-circuit bridge decks (arc fraction of the overpass centre, ramp
  // half-window in metres, peak rise). Suzuka is a figure-8: its back straight
  // crosses over the section out of the esses.
  const BRIDGES = {
    suzuka: [{ s: 0.811, halfM: 150, rise: 7 }],
  };

  const DEFS = [
    { id: "bahrain", name: "BAHRAIN", gp: "Bahrain GP", country: "Bahrain", night: true, theme: "desert", lengthKm: 5.4, baseHW: 7,
      pal: nightPal({ horizon: [0.10, 0.07, 0.10], runoff: [0.5, 0.4, 0.26] }),
      segs: [{ t: 0, l: 520 }, { t: 90, l: 100 }, { t: -40, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 240 }, { t: 80, l: 100 },
        { t: -30, l: 80 }, { t: 70, l: 100 }, { t: 0, l: 300, h: -4 }, { t: 60, l: 90, h: 4 }, { t: 0, l: 120 }, { t: 60, l: 110 }] },
    { id: "monaco", name: "MONACO", gp: "Monaco GP", country: "Monaco", night: false, theme: "street_day", lengthKm: 3.3, baseHW: 5,
      pal: dayPal({ horizon: [0.55, 0.68, 0.82], grass: [0.3, 0.45, 0.5], runoff: [0.7, 0.66, 0.55], fogDensity: 0.0014 }),
      segs: [{ t: 0, l: 230 }, { t: 70, l: 75 }, { t: -25, l: 260, h: 14 }, { t: -70, l: 110 }, { t: 80, l: 80, w: 4.8 },
        { t: 0, l: 90, h: -6 }, { t: 80, l: 80, w: 4.8 }, { t: 160, l: 120, w: 4.5, h: -4 }, { t: 55, l: 80 }, { t: 45, l: 80 },
        { t: -15, l: 260, h: -4 }, { t: 60, l: 70, w: 4.8 }, { t: 0, l: 40 }, { t: -65, l: 60 }, { t: 65, l: 60 }, { t: -40, l: 100 },
        { t: 70, l: 65, w: 4.8 }, { t: 0, l: 35 }, { t: -70, l: 65 }, { t: 80, l: 70 }, { t: -70, l: 65 }, { t: 75, l: 70, w: 4.8 }, { t: 40, l: 120 }] },
    { id: "silverstone", name: "SILVERSTONE", gp: "British GP", country: "UK", night: false, theme: "green", lengthKm: 5.9, baseHW: 8,
      pal: dayPal({ zenith: [0.30, 0.42, 0.62], horizon: [0.66, 0.72, 0.78], grass: [0.20, 0.46, 0.18], fogDensity: 0.0016 }),
      segs: [{ t: 0, l: 260 }, { t: 60, l: 120 }, { t: -50, l: 90 }, { t: 80, l: 80 }, { t: -150, l: 160 }, { t: 0, l: 120 },
        { t: -70, l: 90 }, { t: 120, l: 150 }, { t: 40, l: 100 }, { t: 0, l: 160 }, { t: 70, l: 130 },
        { t: -55, l: 70 }, { t: 60, l: 70 }, { t: -55, l: 70 }, { t: 50, l: 70 }, { t: 0, l: 300 }, { t: 75, l: 110 },
        { t: -40, l: 90 }, { t: 95, l: 90 }, { t: 60, l: 90 }] },
    { id: "spa", name: "SPA", gp: "Belgian GP", country: "Belgium", night: false, theme: "green", lengthKm: 7.0, baseHW: 8,
      pal: dayPal({ zenith: [0.34, 0.44, 0.56], horizon: [0.6, 0.65, 0.66], grass: [0.12, 0.34, 0.14], runoff: [0.4, 0.4, 0.4], fog: [0.66, 0.7, 0.72], fogDensity: 0.0026 }),
      segs: [{ t: 0, l: 120 }, { t: 170, l: 80, h: -4 }, { t: 0, l: 140, h: -18 }, { t: -40, l: 60, h: 6 }, { t: 50, l: 60, h: 14 },
        { t: -30, l: 80, h: 16 }, { t: 0, l: 480, h: 18 }, { t: 70, l: 90 }, { t: -60, l: 90, h: -6 }, { t: 50, l: 140, h: -12 },
        { t: -90, l: 160, h: -10 }, { t: 40, l: 90 }, { t: -50, l: 90 }, { t: 70, l: 110 }, { t: 0, l: 320, h: -6 },
        { t: -30, l: 180 }, { t: 80, l: 70 }, { t: -85, l: 70 }, { t: 30, l: 120 }] },
    { id: "monza", name: "MONZA", gp: "Italian GP", country: "Italy", night: false, theme: "green", lengthKm: 5.8, baseHW: 8,
      pal: dayPal({ zenith: [0.22, 0.42, 0.72], horizon: [0.7, 0.74, 0.7], grass: [0.2, 0.44, 0.18], sun: [1, 0.92, 0.7] }),
      segs: [{ t: 0, l: 560 }, { t: 70, l: 55 }, { t: -75, l: 60 }, { t: 80, l: 220 }, { t: 0, l: 200 }, { t: -60, l: 55 },
        { t: 70, l: 70 }, { t: 75, l: 130 }, { t: 60, l: 120 }, { t: 0, l: 260 }, { t: -50, l: 55 }, { t: 65, l: 70 },
        { t: 0, l: 360 }, { t: 150, l: 220 }] },
    { id: "suzuka", name: "SUZUKA", gp: "Japanese GP", country: "Japan", night: false, theme: "green", lengthKm: 5.8, baseHW: 7,
      pal: dayPal({ zenith: [0.28, 0.46, 0.72], horizon: [0.74, 0.74, 0.8], grass: [0.2, 0.44, 0.2] }),
      segs: [{ t: 0, l: 440, h: -6 }, { t: 50, l: 120 }, { t: -35, l: 100, h: 6 }, { t: 45, l: 110, h: 6 }, { t: -30, l: 100, h: 4 },
        { t: 55, l: 120 }, { t: 60, l: 110 }, { t: 80, l: 120, h: -4 }, { t: 70, l: 120, h: -6 }, { t: 0, l: 300 },
        { t: 45, l: 120, h: 6 }, { t: -20, l: 90 }, { t: 40, l: 140 }] },
    { id: "singapore", name: "SINGAPORE", gp: "Singapore GP", country: "Singapore", night: true, theme: "street_night", lengthKm: 4.9, baseHW: 6,
      pal: nightPal({ horizon: [0.08, 0.05, 0.14] }),
      segs: [{ t: 0, l: 160 }, { t: 60, l: 70 }, { t: -70, l: 70 }, { t: 55, l: 70 }, { t: 0, l: 220 }, { t: 90, l: 70 },
        { t: 0, l: 200 }, { t: 95, l: 70 }, { t: -90, l: 80 }, { t: 80, l: 60 }, { t: -60, l: 70 }, { t: 90, l: 90 },
        { t: 0, l: 180 }, { t: 90, l: 70 }, { t: 90, l: 70 }, { t: -85, l: 60 }, { t: 95, l: 80 }] },
    { id: "cota", name: "COTA", gp: "United States GP", country: "USA", night: false, theme: "green", lengthKm: 5.5, baseHW: 8,
      pal: dayPal({ zenith: [0.20, 0.46, 0.8], horizon: [0.72, 0.66, 0.5], grass: [0.34, 0.4, 0.14], runoff: [0.6, 0.35, 0.2] }),
      segs: [{ t: 0, l: 220, h: 30 }, { t: -120, l: 110, h: -6 }, { t: 0, l: 80, h: -22 }, { t: 60, l: 60 }, { t: -55, l: 60 },
        { t: 60, l: 60 }, { t: -55, l: 70 }, { t: 50, l: 70 }, { t: -40, l: 80 }, { t: -60, l: 90 }, { t: -120, l: 110 },
        { t: 0, l: 460 }, { t: -150, l: 130 }, { t: 70, l: 70 }, { t: -60, l: 70 }, { t: 80, l: 90 }, { t: 90, l: 160 }, { t: -130, l: 110 }] },
    { id: "interlagos", name: "INTERLAGOS", gp: "São Paulo GP", country: "Brazil", night: false, theme: "green", lengthKm: 4.3, baseHW: 7,
      pal: dayPal({ zenith: [0.26, 0.4, 0.6], horizon: [0.55, 0.58, 0.6], grass: [0.18, 0.46, 0.18], fog: [0.55, 0.58, 0.6], fogDensity: 0.0019 }),
      segs: [{ t: 0, l: 240, h: 8 }, { t: -55, l: 100, h: -10 }, { t: 40, l: 90, h: -6 }, { t: -20, l: 400, h: -4 },
        { t: -60, l: 110 }, { t: -50, l: 100, h: 6 }, { t: 70, l: 100 }, { t: -80, l: 110 }, { t: 0, l: 160 }, { t: -90, l: 100 },
        { t: 60, l: 90 }, { t: -70, l: 100 }, { t: -110, l: 140, h: 6 }, { t: -20, l: 440, h: 18 }] },
    { id: "vegas", name: "LAS VEGAS", gp: "Las Vegas GP", country: "USA", night: true, theme: "street_night", lengthKm: 6.2, baseHW: 7,
      pal: nightPal({ horizon: [0.1, 0.06, 0.16] }),
      segs: [{ t: 0, l: 140 }, { t: 90, l: 70 }, { t: -60, l: 60 }, { t: 60, l: 60 }, { t: 0, l: 120 }, { t: -60, l: 60 },
        { t: 70, l: 60 }, { t: -55, l: 60 }, { t: 0, l: 360 }, { t: 90, l: 80 }, { t: -50, l: 70 }, { t: 0, l: 900, t2: 0 },
        { t: -20, l: 200 }, { t: 90, l: 90 }, { t: -60, l: 60 }, { t: 70, l: 70 }, { t: 65, l: 120 }] },
    { id: "madrid", name: "MADRID", gp: "Spanish GP", country: "Spain", night: false, theme: "modern", lengthKm: 5.5, baseHW: 7,
      pal: dayPal({ zenith: [0.24, 0.46, 0.78], horizon: [0.74, 0.74, 0.72], grass: [0.3, 0.42, 0.2], sun: [1, 0.95, 0.8] }),
      segs: [{ t: 0, l: 320 }, { t: 70, l: 70 }, { t: -65, l: 70 }, { t: 50, l: 120 }, { t: 0, l: 360 }, { t: 90, l: 80 },
        { t: -85, l: 70 }, { t: 90, l: 80 }, { t: 0, l: 140 }, { t: 180, l: 240, b: 0.42, w: 9 }, { t: 0, l: 80 },
        { t: -60, l: 90, h: 6 }, { t: 70, l: 90, h: -4 }, { t: -50, l: 80 }, { t: 80, l: 90 }, { t: 60, l: 130 }] },
    { id: "zandvoort", name: "ZANDVOORT", gp: "Dutch GP", country: "Netherlands", night: false, theme: "green", lengthKm: 4.3, baseHW: 7,
      pal: dayPal({ zenith: [0.3, 0.44, 0.62], horizon: [0.72, 0.72, 0.68], grass: [0.42, 0.44, 0.24], runoff: [0.62, 0.54, 0.36], fog: [0.72, 0.72, 0.68], fogDensity: 0.0018 }),
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

  return { LIST, build, sample, curvature };
})();
