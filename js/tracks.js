/* Apex 26 — Tracks engine: turns per-circuit definitions (js/tracks/<id>.js,
   registered on the global TrackDefs list) into resampled closed Catmull-Rom
   splines extruded into 3D meshes. Contract: docs/ARCHITECTURE.md.
   Depends on globals TrackDefs + CircuitPaths (data) and GLX (mesh upload). */
const Tracks = (function () {
  "use strict";
  let keepGeometry = false;

  const SCALE = 1.45;            // scale authored lengths for arcade racing
  const WORLD_UP = [0, 1, 0];

  // Geometry primitives + the MAT material-id map live in js/track-geom.js
  // (global TrackGeom, loaded before this file — index.html and
  // tools/verify-track.cjs). MAT is re-exposed to per-track scenery() via
  // api.MAT; buildProps shadows the raw emitters with on-track rejection
  // guards (see RAW below).
  const { MAT, cross, norm, vadd, emit, addBox, addPrism, addPyramid,
          addCone, addCyl, addFrustum, addMountain } = TrackGeom;
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
    // Bake the static curvature LUT (rad/m per node) BEFORE anything derives from
    // it — findCorners/bankingProfile call curvature(), which now indexes this.
    track.curv = new Float32Array(n);
    { const cds = total / n; for (let k = 0; k < n; k++) track.curv[k] = curvatureRaw(track, k * cds); }
    // Banking profile (outer-edge lift per node). Computed once and shared by the
    // road/terrain meshes and the car/camera placement in game.js.
    track.bankP = bankingProfile(track);
    return track;
  }

  // Full build: centreline + 3D meshes (road/terrain/props/gate) uploaded to the
  // GPU. This is the heavy one — only needed to actually render/drive a circuit.
  function build(def, opts) {
    const track = buildCenterline(def);
    // One profile drives terrain generation, floor blending, and scenery
    // grounding. Keeping it on the track also makes diagnostics deterministic.
    track.surface = TrackSurface.profile(def, track);
    // Session darkness drives whether buildings/skyline light their windows.
    // Falls back to the track's default (def.night) when not specified.
    track._night = opts && opts.night != null ? !!opts.night : !!def.night;
    if (typeof GLX !== "undefined" && GLX.createMesh) {
      track.geometryDiagnostics = [];
      const safe = (name, geo) => {
        const result = TrackModels.validateGeometry(geo);
        track.geometryDiagnostics.push(Object.assign({ name }, result));
        if (result.ok) return geo;
        console.warn(`[geometry] ${def.id}/${name} skipped: ${result.reason}`);
        return { pos: [], nrm: [], col: [], idx: [], mat: [] };
      };
      track.meshes.floor = GLX.createMesh(safe("floor", buildFloor(track)));
      const roadGeo = safe("road", buildRoad(track));
      track.roadGeo = roadGeo;
      track.meshes.road = GLX.createMesh(roadGeo);
      const terrainGeo = buildTerrain(track);
      const terrainSafe = safe("terrain", terrainGeo);
      track.terrainGeo = terrainSafe;   // validated raw geometry kept for the groundY() debug probe
      track.meshes.terrain = GLX.createMesh(terrainSafe);
      const _props = buildProps(track);
      // Chunked + frustum-culled: the city/props mesh is huge (up to ~5 M verts),
      // and most of it is off-screen each frame — drawing only visible XZ cells
      // (and only shadow-casting cells inside the light frustum) is the big win.
      const propsGeo = safe("props", _props.out);
      track.propsGeo = propsGeo;
      propsGeo._keepPositions = keepGeometry;
      track.meshes.props = GLX.createChunkedMesh ? GLX.createChunkedMesh(propsGeo, 72) : GLX.createMesh(propsGeo);
      const glassGeo = safe("glass", _props.glass);
      const waterGeo = safe("water", _props.water);
      track.glassGeo = glassGeo;
      track.waterGeo = waterGeo;
      glassGeo._keepPositions = keepGeometry;
      // Glass rides the SAME chunk grid as the props: it was one un-culled
      // createMesh draw of every window pane in the whole city, every frame —
      // full clearcoat+env fill for panes behind the camera and past the fog.
      track.meshes.glass = GLX.createChunkedMesh ? GLX.createChunkedMesh(glassGeo, 72) : GLX.createMesh(glassGeo);
      track.meshes.water = GLX.createMesh(waterGeo);
      track.meshes.gate = GLX.createMesh(safe("gate", buildGate(track)));
      track.meshes.startline = GLX.createMesh(safe("startline", buildStartLine(track)));
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
    // Minimap projection: flipped over the Y (vertical) axis — x = maxx-px — so the
    // 2D outline reads the same handedness as the 3D drive view (e.g. Bahrain's
    // long straight on the left with Turn 1 to the right). y = maxz-pz (north → top).
    for (let i = 0; i < n; i += step) out.push([ox + (maxx - px[i]) * sc, oz + (maxz - pz[i]) * sc]);
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

  // Direct curvature from the centreline heading over a ±12 m window. This is a
  // STATIC per-position quantity, so it's baked once into track.curv at build
  // (see buildCenterline) and read via O(1) index+lerp in curvature() below.
  // Kept as the source of the LUT and as a fallback for tracks built before the
  // field existed.
  function curvatureRaw(track, s) {
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

  // Hot path: the AI calls this ~500× per physics substep. Curvature is static,
  // so read the baked per-node LUT (track.curv) with the same index+lerp math as
  // sample()/bankAngle() — zero garbage, no atan2s. Node-aligned samples (k*ds,
  // e.g. findCorners) return the exact baked value. Falls back to the direct
  // computation for any track built before the LUT existed. Signature unchanged.
  function curvature(track, s) {
    const cv = track.curv;
    if (!cv) return curvatureRaw(track, s);
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const fi = s / L * n;
    const i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    return cv[i] + (cv[j] - cv[i]) * f;
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

  // Author-driven banked corners. A track def can bank its corners two ways:
  //   • `bankZones: [{ frac, angleDeg, widthM }]` — bank explicit fraction
  //     windows at authored angles (used by Zandvoort's Hugenholtz/Luyendyk and
  //     Madrid's La Monumental), OR
  //   • `banked: true` — auto-pick the two highest-curvature corners and bank
  //     them at ~18° (legacy fallback for any track without bankZones).
  // Returns null when neither is present; otherwise per-node arrays describing how
  // much the OUTER road edge rises (metres) and which side that outer edge is on.
  // The lift is cosine-ramped to zero over the corner span, exactly like the
  // localized BRIDGES bump on py — so the rest of the lap stays dead flat (no
  // global tilt). buildRoad and buildTerrain both read this so the banked road
  // edge and the terrain that meets it rise together; game.js makes the car,
  // shadow and camera ride the banked surface (height + roll) so nothing floats.
  function bankingProfile(track) {
    const def = track.def;
    const zones = def.bankZones;
    if (!def.banked && !(zones && zones.length)) return null;
    const n = track.n;
    const ds = track.total / n;
    const lift = new Float32Array(n);
    const bsign = new Float32Array(n);   // outer side: +1 = right edge, -1 = left

    // Explicit authored zones take precedence over the curvature auto-pick.
    if (zones && zones.length) {
      for (const z of zones) {
        const frac = (((z.frac || 0) % 1) + 1) % 1;
        const kc = Math.round(frac * n) % n;
        const tanA = Math.tan((z.angleDeg || 18) * Math.PI / 180);
        const half = Math.max(1, Math.round((z.widthM || 40) / ds / 2));
        // outer edge is opposite the turn centre at the zone apex (curv + = right)
        const outer = curvature(track, kc * ds) >= 0 ? -1 : 1;
        for (let i = -half; i <= half; i++) {
          const k = (kc + i + n) % n;
          // cosine window: 1 at apex, 0 at the span edges
          const t = 1 - Math.abs(i) / half;
          const w = 0.5 * (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t))));
          const add = 2 * track.hw[k] * tanA * w;
          if (add > lift[k]) { lift[k] = add; bsign[k] = outer; }
        }
      }
      return { lift, bsign };
    }

    // Legacy auto-pick: the two highest-curvature corners, banked at 18°.
    const corners = findCorners(track, 0.006);
    if (!corners.length) return null;
    const scored = corners.map((c) => ({ c, k: Math.abs(curvature(track, c.k * ds)) }));
    scored.sort((a, b) => b.k - a.k);
    const picks = scored.slice(0, 2).map((s) => s.c);
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

  // Banking under a car at arc-distance s, lateral offset x: the surface offset
  // from the centreline (dy, metres) and its roll about the tangent
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

  // `out` (optional): a reusable { dy, roll } scratch. When supplied it's written
  // in place and returned, so per-frame callers (once per car) avoid allocating a
  // fresh object each call. Still returns null on non-banked sections.
  function banking(track, s, x, out) {
    const bp = track.bankP;
    if (!bp) return null;
    const n = track.n, L = track.total;
    const pos = (((s % L) + L) % L) / L * n;
    const k = Math.floor(pos) % n, j = (k + 1) % n, f = pos - Math.floor(pos);
    // Interpolate the signed cross-track lift so cars and cameras do not jump
    // between the road mesh's ~4 m longitudinal nodes.
    const signedLift = lerp(bp.lift[k] * bp.bsign[k], bp.lift[j] * bp.bsign[j], f);
    if (!signedLift) return null;
    const w = lerp(track.hw[k], track.hw[j], f);
    const cx = x < -w ? -w : x > w ? w : x;
    const o = out || {};
    // Pivot around the centreline: inner and outer edges move equally in
    // opposite directions instead of turning the bank into a longitudinal hump.
    o.dy = signedLift * cx / (2 * w);
    // Match the actual road-plane slope. game.js rotates the car basis with this
    // angle, making its up-axis perpendicular to the banked asphalt.
    o.roll = Math.atan2(signedLift, 2 * w);
    return o;
  }

  // Coarse XZ bucket of road-centreline node indices, built once per track and
  // shared by buildRoad's shoulder clip, buildTerrain's over-track clip and
  // buildProps' onRoadHit/onTrack guards. Each of those used to scan ALL n nodes
  // per emitted vertex/primitive (O(prims·n) — tens of millions of checks on the
  // city meshes); with the grid a query visits only the handful of nodes whose
  // footprint can reach the query point. The accept/reject maths in each caller
  // is unchanged — the grid only narrows the candidate SET to a superset of every
  // node that could pass, so the resulting geometry is identical.
  function nodeGrid(track) {
    if (track._nodeGrid) return track._nodeGrid;
    const n = track.n, px = track.px, pz = track.pz, hw = track.hw;
    const CELL = 10, OFFSET = 2048, STRIDE = 4096;   // numeric packed key, cf. glx.createChunkedMesh
    const map = new Map();
    let maxHw = 0;
    for (let k = 0; k < n; k++) {
      if (hw[k] > maxHw) maxHw = hw[k];
      const key = (Math.floor(px[k] / CELL) + OFFSET) * STRIDE + (Math.floor(pz[k] / CELL) + OFFSET);
      let arr = map.get(key); if (!arr) { arr = []; map.set(key, arr); } arr.push(k);
    }
    const grid = { maxHw };
    // Write every node index whose cell lies within radius R of (x,z) into `out`,
    // returning the count. A node within R of (x,z) is within R on both axes, so
    // its (single) cell falls in the scanned cell rectangle — the candidate set is
    // always a superset of the nodes any caller's inner test could accept. When
    // `doSort` is set the indices are returned ascending, so a clip loop that
    // reads `wy` mid-iteration reproduces the original 0..n-1 sequencing exactly.
    grid.query = (x, z, R, out, doSort) => {
      let cnt = 0;
      const x0 = Math.floor((x - R) / CELL), x1 = Math.floor((x + R) / CELL);
      const z0 = Math.floor((z - R) / CELL), z1 = Math.floor((z + R) / CELL);
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) {
          const arr = map.get((cx + OFFSET) * STRIDE + (cz + OFFSET));
          if (!arr) continue;
          for (let a = 0; a < arr.length; a++) out[cnt++] = arr[a];
        }
      if (doSort) for (let a = 1; a < cnt; a++) { const v = out[a]; let b = a - 1; while (b >= 0 && out[b] > v) { out[b + 1] = out[b]; b--; } out[b + 1] = v; }
      return cnt;
    };
    track._nodeGrid = grid;
    return grid;
  }

  function buildRoad(track) {
    const { n, px, py, pz, hw } = track;
    const pos = [], nrm = [], col = [];
    const idxArr = [];
    const bp = track.bankP;
    const grid = nodeGrid(track);              // shared node grid (also used by buildTerrain/buildProps)
    const _cand = new Array(n);                // reusable candidate scratch for the shoulder clip
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
      // Banking pivots each cross-section around its centreline (inner edge
      // -> -lift/2, outer edge -> +lift/2). Verts past the road clamp to those
      // edge heights so kerbs/shoulders ride with it rather than tearing away.
      const bankLift = bp ? bp.lift[k] : 0;
      const bankSide = bp ? bp.bsign[k] : 0;
      for (let v = 0; v < V; v++) {
        const o = offs[v];
        let by = 0;
        if (bankLift > 0) {
          // Pivot around the centreline: -lift/2 at the inner edge, +lift/2
          // at the outer edge. This preserves the intended crossfall without
          // raising the whole road into a short longitudinal hump.
          let frac = (bankSide * o + w) / (2 * w);
          frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
          by = bankLift * (frac - 0.5);
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
          // Only nodes within hw[j]-0.3 (< maxHw) of the vert can clip it — query
          // the shared grid instead of scanning all n. Pure min op, no ordering.
          const _cn = grid.query(wx, wz, grid.maxHw + 0.5, _cand, false);
          for (let _ci = 0; _ci < _cn; _ci++) {
            const j = _cand[_ci];
            let dd = Math.abs(j - k); dd = dd < n - dd ? dd : n - dd;
            if (dd * ds < 6) continue;
            const ex = wx - px[j], ez = wz - pz[j];
            const lim = hw[j] - 0.3;
            // Bury only near-grade chords. A shoulder well ABOVE the other road
            // is a bridge deck passing over it (Suzuka figure-8): burying it
            // tears a full-height green curtain from deck edge to lower grade.
            if (ex * ex + ez * ez < lim * lim && wy > py[j] - 0.05 && wy < py[j] + 3)
              wy = py[j] - 0.05;
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
    // ── Edge skirts: close the slot under the road plane on elevation ────────
    // The road is a one-sided ribbon and the terrain's inner rail deliberately
    // sits below it (heightAt's -0.3 seam drop, and the clip passes above trench
    // it to py-1.6 near elevation mounds). Approaching a climbing corner the
    // camera looks at that slot edge-on and sees daylight/floor UNDER the road —
    // kerbs appear to float over a gap at every crest. Hang a vertical earth
    // skirt from each grass-shoulder edge vert (v=0 / v=13, their final clipped
    // positions) down past the deepest the adjacent terrain can sit, so the road
    // always reads as continuous ground. Double-sided (both windings) so it
    // shows from any angle; the below-terrain part is simply occluded.
    {
      const surf = track.surface ||
        (typeof TrackSurface !== "undefined" ? TrackSurface.profile(track.def, track) : null);
      if (surf) {
        const innerLat = surf.rails[0];
        const topC = [grass[0] * 0.72, grass[1] * 0.72, grass[2] * 0.72];
        const botC = [grass[0] * 0.42, grass[1] * 0.42, grass[2] * 0.42];
        const skirt = (v) => {
          const base = pos.length / 3;
          const sgn = v === 0 ? -1 : 1;
          for (let k = 0; k < n; k++) {
            const i3 = (k * V + v) * 3;
            const ex = pos[i3], ey = pos[i3 + 1], ez = pos[i3 + 2];
            // Deep enough for both the seam drop and the clip trench…
            let bottom = Math.min(surf.heightAt(k, innerLat), py[k] - 1.6) - 0.6;
            // …but on bridge spans stay a shallow deck fascia: the ground below
            // is meant to show under the deck (pillars carry it visually).
            if (py[k] - surf.ground[k] > 0.5) bottom = Math.max(bottom, py[k] - 1.2);
            if (bottom > ey - 0.3) bottom = ey - 0.3;
            const nx = track.rx[k] * sgn, nz = track.rz[k] * sgn;
            pos.push(ex, ey, ez, ex, bottom, ez);
            nrm.push(nx, 0, nz, nx, 0, nz);
            col.push(topC[0], topC[1], topC[2], botC[0], botC[1], botC[2]);
          }
          for (let k = 0; k < n; k++) {
            const a = base + k * 2, b = base + ((k + 1) % n) * 2;
            idxArr.push(a, a + 1, b, a + 1, b + 1, b);
            idxArr.push(a, b, a + 1, a + 1, b, b + 1);
          }
        };
        skirt(0); skirt(13);
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
    const grid = nodeGrid(track);              // shared node grid (built in buildRoad)
    const _cand = new Array(n);                // reusable candidate scratch for the over-track clip
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
    // Adaptive lateral verts per side: a gravel/runoff verge at the road edge graded
    // out to grass. The old bright concrete apron has been removed — it read as a
    // glaring light slab flanking the track — so the verge is gravel, not tarmac.
    // Street circuits push the ribbon further from the road edge so barriers
    // fully hide it and it cannot visually bleed onto the road surface.
    const surface = track.surface || TrackSurface.profile(track.def, track);
    const NTV = surface.rails.length;
    const isStreet = !!track.def.street;
    // flatTerrain: a WIDE, dead-flat grass ribbon (a man-made island like Île
    // Notre-Dame sits ~level with the water, not sloping into it). Spreads the 5
    // verts evenly out to outerW and skips the lateral sag/ease so trees and props
    // sit on real ground all the way out instead of floating over a sunk fallback.
    const flat = !!track.def.flatTerrain;
    // Street ribbon is NARROW (out to ~street width, def.terrainOuter or 28 m) —
    // a city street's ground only reaches the buildings, and the flat buildFloor
    // slab fills everything beyond. A wide street ribbon at road grade chords over
    // PARALLEL straights running close in world space (Monaco out-and-back, Jeddah)
    // — the over-track clip skips same-direction neighbours, so it can't carve
    // those, and green pokes over the far straight. Keeping it narrow avoids ever
    // reaching a parallel road. Open/flat circuits keep the wide 120 m ribbon.
    const outerW = surface.outerW;
    const latsL = surface.rails.map((d) => -d);
    const latsR = surface.rails.slice();
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
          const t = NTV <= 1 ? 1 : v / (NTV - 1);
          const yBase = surface.heightAt(k, Math.abs(lats[v]));
          // Match the centre-pivoted road bank at the verge, then taper its
          // signed height offset to zero so the far ground stays flat.
          let by = 0;
          if (bankLift > 0) {
            let frac = (bankSide * o + w) / (2 * w);
            frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
            by = bankLift * (frac - 0.5) * (1 - t);
          }
          const wx = px[k] + r[0] * o + u[0] * by;
          const wz = pz[k] + r[2] * o + u[2] * by;
          let wy = yBase + u[1] * by;
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
          // Only nodes within hw[j]+26 (the widest clip radius, the channel carve)
          // of this vert can lower it — query the shared grid instead of all n.
          // Sorted ascending so the `wy`-dependent gates evaluate in the original
          // 0..n-1 order (this clip reads/updates `wy` as it iterates).
          const _cn = grid.query(wx, wz, grid.maxHw + 27, _cand, true);
          for (let _ci = 0; _ci < _cn; _ci++) {
            const j = _cand[_ci];
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
            // Same-direction nearby road: normally leave the verge (it's this
            // straight's own apron). But on STREET circuits a narrow flat shelf at
            // road grade beside one straight chords over a PARALLEL same-direction
            // straight running close by (Monaco/Jeddah) — so still carve there when
            // the neighbour is a genuinely separate road (well beyond this verge).
            if (align > 0.55 && dd * ds < 60 && !(isStreet && d2 > (hw[j] + 6) * (hw[j] + 6))) continue;
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
      const faceSafe = (ia, ib, ic) => {
        const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
        const bx = pos[ib * 3], by = pos[ib * 3 + 1], bz = pos[ib * 3 + 2];
        const cx = pos[ic * 3], cy = pos[ic * 3 + 1], cz = pos[ic * 3 + 2];
        const x = (ax + bx + cx) / 3, y = (ay + by + cy) / 3, z = (az + bz + cz) / 3;
        const cn = grid.query(x, z, grid.maxHw + 1, _cand, false);
        for (let qi = 0; qi < cn; qi++) {
          const j = _cand[qi], ex = x - px[j], ez = z - pz[j], lim = hw[j] - 0.15;
          if (ex * ex + ez * ez < lim * lim && y > py[j] + 0.12) return false;
        }
        return true;
      };
      const tri = (a, b, c) => { if (faceSafe(a, b, c)) idxArr.push(a, b, c); };
      for (let k = 0; k < n; k++) {
        const a = base + k * NTV, b = base + ((k + 1) % n) * NTV;
        for (let v = 0; v < NTV - 1; v++) {
          if (flip) {
            tri(a + v, a + v + 1, b + v);
            tri(a + v + 1, b + v + 1, b + v);
          } else {
            tri(a + v, b + v, a + v + 1);
            tri(a + v + 1, b + v, b + v + 1);
          }
        }
      }
    }
    // Street circuits have barriers and buildings right at the road edge —
    // no open terrain apron should be visible beside the car.
    // Street circuits now get the ribbon too (street lats above start at ±5 m so
    // the barrier still hides the seam). Previously they were skipped and relied
    // on the flat buildFloor slab at the lap's low point — which left a grey void
    // and floating props anywhere the road rose above that baseline (Baku castle
    // climb, Monaco's hills). The ribbon tracks the road height per node, so props
    // anchored via anchor()/groundYAt sit on real ground along the whole lap.
    ribbon(latsL, false); ribbon(latsR, true);
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
    const y = track.surface ? track.surface.floorY : pyMin - 1.0;
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


  // Raw (unguarded) emitters, captured so buildProps can wrap them with the
  // on-track rejection guard below while still reaching the real implementations.
  const RAW = { addBox, addCyl, addCone, addFrustum, addPrism, addPyramid, addMountain };

  // Wrap a scenery api so a bespoke scenery() authored for the forward lap places
  // correctly on a REVERSED lap (optionally with the start rotated to fraction
  // `phi`). Transforms: s-fraction s→phi-s, node index k→round(phi*n)-k, side
  // ±1→∓1. Helpers are grouped by their leading-argument signature.
  function transformSceneryApi(api, def, n) {
    const RK = (k) => TrackSpace.sceneryNode(def, k, n);
    const RS = (s) => TrackSpace.sceneryFrac(def, s);
    const SIDE = (side) => def.reverse ? -side : side;
    const w = Object.assign({}, api);
    // (k, side, ...rest): index + side based
    for (const name of ["place", "prop", "backdrop", "groundPlane", "anchor", "pine", "tree",
                        "palm", "conifer", "building", "house", "motorhome", "tower", "billboard",
                        "marshalPost", "bush", "signBoard", "ferrisWheel", "floodMast", "runoffApron"]) {
      const f = api[name]; if (f) w[name] = (k, side, ...r) => f(RK(k), SIDE(side), ...r);
    }
    // (s, side, ...rest): single fraction + side
    for (const name of ["grandstand"]) {
      const f = api[name]; if (f) w[name] = (s, side, ...r) => f(RS(s), SIDE(side), ...r);
    }
    // (s0, s1, side, ...rest): fraction RANGE + side — swap ends and mirror both
    for (const name of ["wall", "fence", "guardrail", "tyreWall", "hedge",
                        "forestEdge", "cityFront", "recordBarrier", "concreteCanyon",
                        "bankedKerbStrip", "bowlSeatWall", "pastelStreetRow"]) {
      const f = api[name]; if (f) w[name] = (s0, s1, side, ...r) => {
        const range = TrackSpace.range(def, s0, s1, "source");
        return f(range.s0, range.s1, SIDE(side), ...r);
      };
    }
    // (s0, s1, stepM, fn): fraction range, no side
    if (api.along) w.along = (s0, s1, ...r) => {
      const range = TrackSpace.range(def, s0, s1, "source");
      return api.along(range.s0, range.s1, ...r);
    };
    // (s, …): single fraction, no side (gantry / underpass portal)
    if (api.gantry) w.gantry = (s, ...r) => api.gantry(RS(s), ...r);
    if (api.underpassPortal) w.underpassPortal = (s, ...r) => api.underpassPortal(RS(s), ...r);
    // floodMastRing places BOTH sides via every() — no remapping needed
    // NOTE: node-index utilities (groundYAt, upOf) and the raw px/py/pz arrays are
    // intentionally NOT remapped — the few direct px[k]/upOf(k) reads in bespoke
    // scenery stay mutually consistent on the reversed centreline (cosmetic only).
    return w;
  }

  function buildProps(track) {
    // Static dressing tables (barrier liveries, furniture, crowd/sign/city
    // palettes, building styles) live in js/track-scenery-data.js.
    const { NC, DC, BLD, CROWD_DAY, WINTINTS, HOUSE_WALLS, HOUSE_ROOFS,
            MOTORHOME_BODY, SIGN_SEG, SIGN_DIGIT, BARRIER, FURN, FURN_DEF,
            STYLES, THEME_DEF, ATM, COL } = TrackSceneryData;
    const { n, px, py, pz, hw } = track;
    // Mobile geometry LOD: the street-circuit city facade is the single biggest GPU
    // allocation (the props VBO is ~88 MB on Vegas, ~73 on Baku), and the detailed
    // window-pane grid dominates it. On memory-limited phones (mobileTier = a phone
    // NOT opted into GRAPHICS: HIGH) coarsen that grid, cutting ~20-24% of the props
    // verts on the dense street tracks that OOM-crash iOS — the exact jetsam trigger.
    // CITY_LOD = 1 on desktop and HIGH-tier phones ⇒ geometry is byte-identical there;
    // `lod()` only ever shrinks a count and never below its floor.
    const CITY_LOD = (typeof GLX !== "undefined" && GLX.mobileTier) ? 0.72 : 1;
    const lod = (nn, floor) => Math.max(floor, Math.round(nn * CITY_LOD));
    // `mat` holds a per-vertex procedural-material id (0 = FLAT). `_mat` is the
    // CURRENT material register: emitters (addBox/emit) stamp it onto every vertex,
    // so a model sets `out._mat = MAT.BRICK` around a block instead of threading a
    // param through every call. Untagged geometry stays FLAT (unchanged look).
    const out = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 };
    // Separate GLASS buffer: reflective window panes are emitted here and drawn
    // with a low-roughness material so the lit shader's env term mirrors the sky
    // (real view-dependent reflection, not a faked colour). Day windows only.
    const glassBuf = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 };
    // Separate WATER buffer: lake/sea/marina surfaces emit here and draw with a
    // low-roughness material so the lit shader's env term mirrors the live sky
    // (real time-of-day reflection + sun glint), turning flat blue slabs into
    // reflective water. Flagged via groundPlane(..., water=true).
    const waterBuf = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 };
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
    // Numeric packed cell key (no per-triangle/per-lookup string garbage), same
    // scheme as glx.createChunkedMesh: (cx+OFFSET)*STRIDE + (cz+OFFSET).
    const _CELL = 6, _GOFF = 2048, _GSTR = 4096;
    const _gkey = (cx, cz) => (cx + _GOFF) * _GSTR + (cz + _GOFF);
    let _grid = null;
    const _buildGrid = () => {
      _grid = new Map(); const pos = _tg.pos, idx = _tg.idx;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const mnx = Math.min(pos[a], pos[b], pos[c]), mxx = Math.max(pos[a], pos[b], pos[c]);
        const mnz = Math.min(pos[a + 2], pos[b + 2], pos[c + 2]), mxz = Math.max(pos[a + 2], pos[b + 2], pos[c + 2]);
        if (mxx - mnx > 30 || mxz - mnz > 30) continue;
        for (let cx = Math.floor(mnx / _CELL); cx <= Math.floor(mxx / _CELL); cx++)
          for (let cz = Math.floor(mnz / _CELL); cz <= Math.floor(mxz / _CELL); cz++) {
            const key = _gkey(cx, cz); let arr = _grid.get(key); if (!arr) { arr = []; _grid.set(key, arr); } arr.push(t);
          }
      }
    };
    const terrainYAt = (x, z) => {
      if (!_tg || !_tg.idx) return null;
      if (!_grid) _buildGrid();
      const arr = _grid.get(_gkey(Math.floor(x / _CELL), Math.floor(z / _CELL)));
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
    const diagnostics = track.modelDiagnostics = {
      emitted: [], suppressed: [], invalid: [], unsafe: [],
    };
    const finiteVec = (v, len, positive) =>
      Array.isArray(v) && v.length === len && v.every((x) => Number.isFinite(x) && (!positive || x > 0));
    const grid = nodeGrid(track);              // shared node grid (built in buildRoad)
    const _hitCand = new Array(n), _trkCand = new Array(n);   // reusable query scratch
    // True if a footprint covers the tarmac at any node it rises above. A
    // circular footprint is given by rad>0 at (cx,cz); otherwise an oriented
    // rectangle with unit XZ axes (arx,arz)/(afx,afz) and half-extents hx,hz.
    const onRoadHit = (cx, cz, topY, rad, arx, arz, afx, afz, hx, hz) => {
      // Only nodes within the footprint's max reach (evaluated at maxHw) can be
      // covered — query the shared grid instead of scanning all n nodes. This is
      // the O(prims·n) hot path (one call per emitted city pane). OR semantics,
      // so candidate order is irrelevant; the per-node test below is unchanged.
      const mh = grid.maxHw;
      const R = (rad > 0 ? rad + mh : Math.hypot(hx + mh, hz + mh)) + 2;
      const _cn = grid.query(cx, cz, R, _hitCand, false);
      for (let _ci = 0; _ci < _cn; _ci++) {
        const k = _hitCand[_ci];
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
    const badPrimitive = (kind, c, size) => {
      diagnostics.invalid.push({ id: kind, reason: "non-finite primitive dimensions", center: c, size });
      return false;
    };
    const addBox = (o, c, sz, col, basis) => {
      if (!finiteVec(c, 3, false) || !finiteVec(sz, 3, true)) return badPrimitive("box", c, sz);
      if (rejBox(c, sz, basis)) { _culled++; return false; } RAW.addBox(o, c, sz, col, basis); return true;
    };
    const addCyl = (o, c, rad, h, col, seg, basis) => {
      if (!finiteVec(c, 3, false) || !Number.isFinite(rad) || rad <= 0 || !Number.isFinite(h) || h <= 0) return badPrimitive("cylinder", c, [rad, h]);
      if (rejRad(c, rad, h, basis)) { _culled++; return false; } RAW.addCyl(o, c, rad, h, col, seg, basis); return true;
    };
    const addCone = (o, c, rad, h, col, seg, basis) => {
      if (!finiteVec(c, 3, false) || !Number.isFinite(rad) || rad <= 0 || !Number.isFinite(h) || h <= 0) return badPrimitive("cone", c, [rad, h]);
      if (rejRad(c, rad, h, basis)) { _culled++; return false; } RAW.addCone(o, c, rad, h, col, seg, basis); return true;
    };
    const addFrustum = (o, c, rB, rT, h, col, seg, basis) => {
      if (!finiteVec(c, 3, false) || !Number.isFinite(rB) || rB <= 0 || !Number.isFinite(rT) || rT <= 0 || !Number.isFinite(h) || h <= 0) return badPrimitive("frustum", c, [rB, rT, h]);
      if (rejRad(c, Math.max(rB, rT), h, basis)) { _culled++; return false; } RAW.addFrustum(o, c, rB, rT, h, col, seg, basis); return true;
    };
    const addPrism = (o, c, sz, col, basis) => {
      if (!finiteVec(c, 3, false) || !finiteVec(sz, 3, true)) return badPrimitive("prism", c, sz);
      if (rejBox(c, sz, basis)) { _culled++; return false; } RAW.addPrism(o, c, sz, col, basis); return true;
    };
    const addPyramid = (o, c, sz, col, basis) => {
      if (!finiteVec(c, 3, false) || !finiteVec(sz, 3, true)) return badPrimitive("pyramid", c, sz);
      if (rejBox(c, sz, basis)) { _culled++; return false; } RAW.addPyramid(o, c, sz, col, basis); return true;
    };
    const addMountain = (o, c, baseR, h, opts) => {
      if (!finiteVec(c, 3, false) || !Number.isFinite(baseR) || baseR <= 0 || !Number.isFinite(h) || h <= 0) return badPrimitive("mountain", c, [baseR, h]);
      if (onRoadHit(c[0], c[2], c[1] + h, baseR, 0, 0, 0, 0, 0, 0)) { _culled++; return false; } RAW.addMountain(o, c, baseR, h, opts); return true;
    };
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
    const surface = track.surface || TrackSurface.profile(track.def, track);
    const groundYAt = (k, dist) => {
      return surface.heightAt(k, dist);
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
      // A segment can only pass if one of its endpoints is within maxHw+margin+
      // segLen (a chord ≤ ds) of (x,z); query that neighbourhood of the shared
      // grid and test each candidate's forward segment. OR semantics — order
      // irrelevant; the per-segment test is unchanged.
      const R = grid.maxHw + margin + ds + 1;
      const _cn = grid.query(x, z, R, _trkCand, false);
      for (let _ci = 0; _ci < _cn; _ci++) {
        const i = _trkCand[_ci];
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
    const frameAt = (frac) => {
      const k = Math.round(TrackSpace.wrap01(frac) * n) % n;
      return {
        k, c: [px[k], py[k], pz[k]],
        r: [track.rx[k], track.ry[k], track.rz[k]],
        u: upOf(track, k),
        t: [track.tx[k], track.ty[k], track.tz[k]],
        hw: hw[k],
      };
    };
    const models = TrackModels.create({
      out, water: waterBuf, diagnostics,
      preflight: (bounds) => !rejBox(bounds.center, bounds.size, bounds.basis),
      emitBox: (buf, c, size, col, basis) => RAW.addBox(buf, c, size, col, basis),
      frameAt,
      supportClear: (frame, spec) => {
        if (spec.supports === false) return true;
        const gap = spec.supportGap != null ? spec.supportGap : 1.5;
        const width = spec.supportWidth != null ? spec.supportWidth : 0.8;
        const height = Math.max(1, spec.clearance || 5);
        for (const side of [-1, 1]) {
          const o = side * (frame.hw + gap + width / 2);
          const c = [
            frame.c[0] + frame.r[0] * o + frame.u[0] * height / 2,
            frame.c[1] + frame.r[1] * o + frame.u[1] * height / 2,
            frame.c[2] + frame.r[2] * o + frame.u[2] * height / 2,
          ];
          if (rejBox(c, [width, height, spec.depth || 1.4], [frame.r, frame.u, frame.t])) return false;
        }
        return true;
      },
      groundHeight: groundYAt,
      groundPoint: (k, side, dist, y) => {
        const i = ((Math.round(k) % n) + n) % n;
        const r = [track.rx[i], track.ry[i], track.rz[i]];
        const o = side * (hw[i] + dist);
        return [px[i] + r[0] * o, y, pz[i] + r[2] * o];
      },
    });
    let sceneryTheme = null, landmarkKit = null, circuitKit = null;
    try {
      if (typeof SceneryThemes !== "undefined" && SceneryThemes &&
          typeof SceneryThemes.resolve === "function") {
        const themeName = def.sceneryTheme ||
          (def.street ? "street" : def.theme === "desert" ? "desert" : "permanent");
        sceneryTheme = SceneryThemes.resolve(
          themeName,
          def.sceneryThemeOverrides,
          { night: NIGHT, weather: track._weather || "dry" },
        );
      }
      if (sceneryTheme && typeof LandmarkKit !== "undefined" && LandmarkKit &&
          typeof LandmarkKit.create === "function") {
        landmarkKit = LandmarkKit.create({
          box: (stage, c, size, color, basis) => addBox(stage, c, size, color, basis),
          prism: (stage, c, size, color, basis) => addPrism(stage, c, size, color, basis),
          cylinder: (stage, c, radius, height, color, seg, basis) =>
            addCyl(stage, c, radius, height, color, seg, basis),
        });
      }
      if (sceneryTheme && landmarkKit && typeof CircuitKit !== "undefined" && CircuitKit &&
          typeof CircuitKit.create === "function") {
        circuitKit = CircuitKit.create({
          models, landmarks: landmarkKit, theme: sceneryTheme,
          frameAt, groundHeight: groundYAt, hash,
        });
      }
    } catch (_) {
      sceneryTheme = landmarkKit = circuitKit = null;
    }
    const modelGroup = (id, bounds, emit, opts) => models.modelGroup(id, bounds, emit, opts);

    // ── Vertical placement helpers (docs/SCENERY-GROUNDING.md) ──────────────
    // Every guard in this file is HORIZONTAL (onTrack/rejBox/blockAt keep props
    // off the racing line); nothing asserted that a prop meets the ground, and
    // every floating-scenery defect found by tools/float-audit.cjs was vertical.
    // These three close that gap by expressing intent instead of arithmetic.
    const UPV = [0, 1, 0];

    // seat.*: emit a primitive standing ON `foot` — the point it rests on.
    // addBox/addPyramid centre their `c` while addPrism/addCyl/addCone/
    // addFrustum anchor at the BASE, and callers treating them alike produced
    // seven separate floating-roof defects. Going through seat.* makes that
    // mistake unexpressible: one convention, every primitive.
    const seat = {
      box:     (o, foot, sz, col, b) => addBox(o, vadd(foot, (b ? b[1] : UPV), sz[1] / 2), sz, col, b),
      prism:   (o, foot, sz, col, b) => addPrism(o, foot, sz, col, b),
      cyl:     (o, foot, rad, h, col, seg, b) => addCyl(o, foot, rad, h, col, seg, b),
      cone:    (o, foot, rad, h, col, seg, b) => addCone(o, foot, rad, h, col, seg, b),
      frustum: (o, foot, r0, r1, h, col, seg, b) => addFrustum(o, foot, r0, r1, h, col, seg, b),
    };

    // foundation(): fill from `top` down to the LOWEST ground under the
    // footprint. Samples corners AND centre, because a single groundYAt() reuse
    // across a wide model assumes flat ground (Imola's village stood 47 m clear
    // of its hillside that way). Sinks below grade so the seam never shows and
    // inherits addBox's on-track rejection.
    const foundation = (o, spec) => {
      spec = spec || {};
      const c = spec.center, size = spec.size, top = spec.top;
      if (!c || !size || !Number.isFinite(top)) return false;
      const b = spec.basis || [[1, 0, 0], UPV, [0, 0, 1]];
      const r = b[0], f = b[2];
      let lo = Infinity;
      for (const sx of [-0.5, 0, 0.5]) for (const sf of [-0.5, 0, 0.5]) {
        const x = c[0] + r[0] * sx * size[0] + f[0] * sf * size[1];
        const z = c[2] + r[2] * sx * size[0] + f[2] * sf * size[1];
        const y = terrainYAt(x, z);
        if (y != null && y < lo) lo = y;
      }
      if (!Number.isFinite(lo)) lo = Number.isFinite(spec.ground) ? spec.ground : NaN;
      if (!Number.isFinite(lo)) return false;
      const embed = spec.embed != null ? spec.embed : 0.6;
      const h = (top - lo) + embed;
      if (h <= 0.05) return false;
      return addBox(o, [c[0], lo - embed + h / 2, c[2]],
                    [size[0], h, size[1]], spec.col || [0.42, 0.43, 0.47], b);
    };

    // cantilever(): a head offset from a mast MUST carry a visible member.
    // Hungaroring's lamps omitted the arm and 168 heads hovered beside bare
    // poles — the exact signature float-audit reports.
    const cantilever = (o, top, outM, side, headSz, headCol, armCol, b) => {
      const rr = b ? b[0] : [1, 0, 0];
      const reach = Math.abs(outM);
      if (reach > 0.35)
        // Overrun both ends by 0.25 m so the member genuinely meets the mast at
        // one end and the head at the other — an arm that merely touches can
        // still read (and audit) as a gap.
        addBox(o, vadd(top, rr, side * outM / 2), [reach + 0.5, 0.18, 0.22],
               armCol || [0.30, 0.30, 0.34], b);
      addBox(o, vadd(top, rr, side * outM), headSz, headCol, b);
    };
    const overheadSpan = (spec) => models.overheadSpan(spec);
    const waterSurface = (k, side, gap, sz, col, opts) => {
      opts = opts || {};
      if (!finiteVec(sz, 3, true)) {
        diagnostics.invalid.push({ id: opts.id || "water", reason: "invalid water dimensions", size: sz });
        return false;
      }
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const o = side * (hw[k] + gap + sz[0] / 2);
      const center = [px[k] + r[0] * o, pyMin - 0.8 - sz[1] / 2, pz[k] + r[2] * o];
      if (onTrack(center[0], center[2], sz[0] / 2 + 4)) {
        diagnostics.suppressed.push({ id: opts.id || "water", required: !!opts.required, reason: "footprint rejected" });
        return false;
      }
      return models.waterSurface({ id: opts.id || `water-${k}`, center, size: sz, color: col, required: opts.required });
    };
    // A continuous sheet of water rasterised from FINE cells, instead of a
    // handful of big slabs. waterSurface() places one box per call and rejects
    // the WHOLE box if any part of it is near the road, with a sz/2+4 margin —
    // so a 46 m panel needs 27 m of clearance and a basin built from them ends
    // up as scattered rectangles separated by wide bare bands wherever the lap
    // folds back through the water. Same region here, but stepped in `cell`
    // metre squares: rejection is per-cell, so the sheet closes right up to the
    // road edge and the holes shrink to the road corridor itself.
    //
    // Cells follow the track's own frame (each along-step re-reads that node's
    // right vector), so the basin curves with the shoreline instead of being an
    // axis-aligned rectangle. Colour is ONE sea tone with a small per-cell
    // drift — the old code alternated two tones on a checkerboard, which is
    // most of what made the water read as tiles rather than as a surface.
    // The region is described in TRACK space (a window along the lap, a span
    // outward) but rasterised onto a fixed WORLD-XZ grid. Both halves matter.
    // Stepping in track space and emitting world-axis-aligned boxes does not
    // tile: the outward rays fan apart as the radius grows, so the basin breaks
    // into separated squares a hundred metres out even though every step was
    // uniform at the centreline. Splatting the track-space samples onto a world
    // grid and emitting one box per occupied cell makes neighbours abut exactly
    // by construction, at any curvature. Occupied cells are then merged into
    // flat quad runs, so the output is a sheet rather than a field of tiles.
    const waterField = (k, side, gap0, gap1, halfLen, cell, col, opts) => {
      opts = opts || {};
      const c = Math.max(4, cell || 12);
      const half = Math.max(1, Math.round(halfLen / ds));
      const step = c / 2;                       // sample finer than the grid
      const cells = new Map();
      for (let a = -half; a <= half; a++) {
        const k0 = (((k + a) % n) + n) % n, k1 = (((k + a + 1) % n) + n) % n;
        for (let d = gap0; d <= gap1; d += step) {
          const o0 = side * (hw[k0] + d), o1 = side * (hw[k1] + d);
          const x0 = px[k0] + track.rx[k0] * o0, z0 = pz[k0] + track.rz[k0] * o0;
          const x1 = px[k1] + track.rx[k1] * o1, z1 = pz[k1] + track.rz[k1] * o1;
          // Walk the gap to the NEXT node's ray. On a corner that gap is many
          // times the centreline node spacing; subdividing it is what stops the
          // fan from opening holes in the outer basin.
          const sub = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
          for (let i = 0; i < sub; i++) {
            const t = i / sub;
            const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
            cells.set(Math.floor(x / c) + "|" + Math.floor(z / c), 1);
          }
        }
      }
      // Keep only the cells that clear the road. Margin is the cell's own
      // half-width plus a small lip, NOT a fixed constant — that is what lets a
      // fine grid close right up to the kerb where a 46 m slab needed 27 m of
      // clearance and dropped out entirely.
      const rows = new Map();                   // iz -> sorted list of ix
      for (const key of cells.keys()) {
        const p = key.indexOf("|");
        const ix = +key.slice(0, p), iz = +key.slice(p + 1);
        if (onTrack((ix + 0.5) * c, (iz + 0.5) * c, c / 2 + 1.5)) continue;
        let a = rows.get(iz); if (!a) rows.set(iz, a = []);
        a.push(ix);
      }
      // Emit ONE merged sheet, not one box per cell. Per-cell boxes are what
      // made this read as a grid: each carried its own side walls and its own
      // shade, so every cell boundary was a visible edge. Runs of adjacent
      // cells in a row collapse into a single flat quad at a single colour, so
      // within a run there is no interior geometry at all and nothing to see
      // but water. Coplanar neighbouring runs leave no seam either.
      const y = pyMin - 0.8;
      let placed = 0;
      for (const [iz, list] of rows) {
        list.sort((a, b) => a - b);
        for (let i = 0; i < list.length; ) {
          let j = i;
          while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
          const x0 = list[i] * c, x1 = (list[j] + 1) * c;
          const z0 = iz * c, z1 = (iz + 1) * c;
          emit(waterBuf, [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]],
               col, [(x0 + x1) / 2, y - 10, (z0 + z1) / 2]);
          placed++;
          i = j + 1;
        }
      }
      if (!placed && opts.required)
        diagnostics.suppressed.push({ id: opts.id || "waterfield", required: true, reason: "no cell placed" });
      return placed;
    };
    const groundPatch = (k, side, gap, sz, col, opts) => {
      opts = opts || {};
      if (!finiteVec(sz, 3, true)) {
        diagnostics.invalid.push({ id: opts.id || "ground-patch", reason: "invalid ground-patch dimensions", size: sz });
        return false;
      }
      const r = [track.rx[k], track.ry[k], track.rz[k]], u = upOf(track, k);
      const t = [track.tx[k], track.ty[k], track.tz[k]], pieces = Math.max(2, Math.round(opts.samples || 4));
      const midDist = gap + sz[0] / 2;
      const mid = [px[k] + r[0] * side * (hw[k] + midDist), groundYAt(k, midDist), pz[k] + r[2] * side * (hw[k] + midDist)];
      const emitted = modelGroup(opts.id || `ground-patch-${k}`, {
        center: mid, size: sz, basis: [r, u, t],
      }, (stage) => {
        const partW = sz[0] / pieces;
        for (let i = 0; i < pieces; i++) {
          const dist = gap + partW * (i + 0.5);
          const c = [
            px[k] + r[0] * side * (hw[k] + dist),
            groundYAt(k, dist) - sz[1] / 2,
            pz[k] + r[2] * side * (hw[k] + dist),
          ];
          RAW.addBox(stage, c, [partW, sz[1], sz[2]], col, [r, u, t]);
        }
      }, opts);
      if (emitted && opts.collision) {
        const halfFrac = (sz[2] / 2) / track.total;
        recordBarrier(k / n - halfFrac, k / n + halfFrac, side, gap);
      }
      return emitted;
    };
    const groundedSegments = (spec) => models.groundedSegments(spec);
    // Flat [x0,z0,x1,z1,…] run of every barrier face segment recorded this
    // build, in world XZ. Consumed by the spatial index defined below
    // recordBarrier(), which is the only writer.
    const barSegs = [];
    // Tighten the driving boundary along a solid barrier placed from lap-fraction
    // s0→s1 on `side` at clearance `gap` beyond the road edge. Skips nodes where
    // the barrier geometry would be suppressed (a parallel stretch of track), so
    // we never raise a phantom wall the player can't see.
    // `tighten` separates the two things this used to conflate. Feeding the
    // spatial index is about where SOLID GEOMETRY stands; tightening barL/barR
    // is about where the CAR is allowed to go. They are not the same question,
    // and a catch fence is the case that proves it: it is solid enough that a
    // tree must not grow through it, but it sits back beyond the runoff, so
    // moving the driving limit out to meet it would change how the circuit
    // drives. indexBarrier() registers the geometry without touching physics.
    const scanBarrier = (s0, s1, side, gap, tighten) => {
      const k0 = Math.round(s0 * n) % n, k1 = Math.round(s1 * n) % n;
      // 0→1 denotes a complete lap. Modulo node conversion maps both endpoints
      // to zero, so preserve the authored full-range intent before wrapping.
      const span = Math.abs(s1 - s0) >= 1 - 1e-9 ? n - 1 : ((k1 - k0) + n) % n;
      const arr = side > 0 ? track.barR : track.barL;
      let prev = null;                  // previous recorded face point, for segments
      for (let i = 0; i <= span; i++) {
        const k = (k0 + i) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const o = side * (hw[k] + gap);
        const fx = px[k] + r[0] * o, fz2 = pz[k] + r[2] * o;
        if (onTrack(fx, fz2, 0.3)) { prev = null; continue; }
        if (tighten) {
          const lim = Math.max(hw[k] - 1.2, hw[k] + gap - WALL_CLEAR);
          if (lim < arr[k]) arr[k] = lim;
        }
        // Feed the spatial index below. `prev` resets on a suppressed node so we
        // never bridge a segment across a gap where no barrier is actually built.
        if (prev) { barSegs.push(prev[0], prev[1], fx, fz2); barGrid = null; }
        prev = [fx, fz2];
      }
    };
    const recordBarrier = (s0, s1, side, gap) => scanBarrier(s0, s1, side, gap, true);
    const indexBarrier = (s0, s1, side, gap) => scanBarrier(s0, s1, side, gap, false);
    // ── Spatial barrier index (world XZ) ──────────────────────────────────
    // Every existing guard in this engine is horizontal-vs-ROAD (onTrack,
    // rejBox, blockAt) or vertical (the support/grounding tests). None is
    // horizontal-vs-BARRIER — which is why tree crowns still grow through
    // catch fences. barL/barR cannot close that gap: they hold the DRIVING
    // limit, a per-node LATERAL number, so (a) a close fence records a SMALL
    // clearance and clamping against it can only ever push a prop out to the
    // 9 m runoff default, never past the fence, and (b) a barrier belonging to
    // a DIFFERENT part of the lap — Suzuka's pit straight running alongside
    // the Esses verge, Spa's Raidillon wrapping back onto Kemmel — is not
    // expressible in a per-node lateral table at all. Both cases are the same
    // question asked in the wrong space. Here the barrier's actual face is
    // stored as world-space SEGMENTS, so the query is a plain point-to-segment
    // distance that neither knows nor cares which node a wall came from.
    const BAR_CELL = 24;                // grid cell (m) — comfortably > any canopy
    // Built lazily and INVALIDATED on every new segment. forestEdge() queries
    // mid-scenery, while barriers are still being registered around it, so a
    // grid cached once would go stale and silently under-report for everything
    // planted afterwards.
    let barGrid = null;
    const barCellKey = (cx, cz) => cx * 100003 + cz;
    const buildBarGrid = () => {
      barGrid = new Map();
      for (let i = 0; i < barSegs.length; i += 4) {
        const x0 = barSegs[i], z0 = barSegs[i + 1], x1 = barSegs[i + 2], z1 = barSegs[i + 3];
        const cx0 = Math.floor(Math.min(x0, x1) / BAR_CELL), cx1 = Math.floor(Math.max(x0, x1) / BAR_CELL);
        const cz0 = Math.floor(Math.min(z0, z1) / BAR_CELL), cz1 = Math.floor(Math.max(z0, z1) / BAR_CELL);
        for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
          const key = barCellKey(cx, cz);
          let b = barGrid.get(key); if (!b) barGrid.set(key, b = []);
          b.push(i);
        }
      }
    };
    // Distance² from (x,z) to segment i of barSegs.
    const segDist2 = (i, x, z) => {
      const x0 = barSegs[i], z0 = barSegs[i + 1];
      const dx = barSegs[i + 2] - x0, dz = barSegs[i + 3] - z0;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 1e-9 ? ((x - x0) * dx + (z - z0) * dz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - (x0 + dx * t), ez = z - (z0 + dz * t);
      return ex * ex + ez * ez;
    };
    // True when NO recorded barrier face lies within `r` metres of (x,z).
    const barrierClear = (x, z, r) => {
      if (!barGrid) buildBarGrid();
      if (!barGrid.size) return true;
      const r2 = r * r;
      const cx0 = Math.floor((x - r) / BAR_CELL), cx1 = Math.floor((x + r) / BAR_CELL);
      const cz0 = Math.floor((z - r) / BAR_CELL), cz1 = Math.floor((z + r) / BAR_CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const b = barGrid.get(barCellKey(cx, cz)); if (!b) continue;
        for (let j = 0; j < b.length; j++) if (segDist2(b[j], x, z) < r2) return false;
      }
      return true;
    };
    // Walk a candidate tree OUTWARD (never inward — inward is the road) until
    // its crown clears every recorded barrier face. Returns the adjusted trunk
    // distance, or null when nothing within reach is clear, in which case the
    // caller drops the tree: a missing tree in a gap with no room for one reads
    // as correct, a tree growing through a catch fence never does.
    const clearTreeDist = (k, side, dist, crown) => {
      const kk = ((k % n) + n) % n;
      const rx = track.rx[kk], rz = track.rz[kk];
      const at = (dd) => {
        const o = side * (hw[kk] + dd);
        return [px[kk] + rx * o, pz[kk] + rz * o];
      };
      let p = at(dist);
      if (barrierClear(p[0], p[1], crown)) return dist;
      for (let extra = 1.5; extra <= 12; extra += 1.5) {
        p = at(dist + extra);
        if (barrierClear(p[0], p[1], crown)) return dist + extra;
      }
      return null;
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
    const dressingExcluded = (kind, k, side) => {
      const rules = def.dressingExclusions;
      if (!rules || !rules.length) return false;
      const frac = (((k % n) + n) % n) / n;
      for (const rule of rules) {
        const kinds = rule.kinds || (rule.kind ? [rule.kind] : ["all"]);
        if (!kinds.includes("all") && !kinds.includes(kind)) continue;
        if (rule.side != null && side != null && Number(rule.side) !== Number(side)) continue;
        const s0 = TrackSpace.wrap01(rule.s0 == null ? 0 : rule.s0);
        const s1 = TrackSpace.wrap01(rule.s1 == null ? 1 : rule.s1);
        const full = rule.s0 == null || rule.s1 == null || Math.abs(Number(rule.s1) - Number(rule.s0)) >= 1 - 1e-9;
        const inside = full || (s1 < s0 ? frac >= s0 || frac <= s1 : frac >= s0 && frac <= s1);
        if (inside) return true;
      }
      return false;
    };

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
    const groundPlane = (k, side, gap, sz, col, water) => {
      return water
        ? waterSurface(k, side, gap, sz, col, { id: `ground-plane-water-${k}` })
        : groundPatch(k, side, gap, sz, col, { id: `ground-plane-${k}`, samples: 4 });
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
        out._mat = MAT.FOLIAGE;
        addFrustum(out, [cx, foot, cz], R, R * 0.5, H * 0.5, c1, 7);  // rounded base
        addCone(out,    [cx, foot + H * 0.5, cz], R * 0.5, H * 0.5, c3, 7);  // dome cap
        out._mat = 0;
        return;
      }
      const isBld = sz[1] > 26 && sz[1] > sz[2];
      // Night skyline walls get a small glow floor so they aren't black planes.
      const bcol = (isBld && NIGHT)
        ? [Math.max(col[0], 0.20), Math.max(col[1], 0.19), Math.max(col[2], 0.24)] : col;
      // Warm/tan, non-building, non-green masses read as desert dunes/mesas.
      const sandy = !isBld && col[0] > 0.45 && col[0] > col[2] + 0.04 && col[1] > col[2];
      out._mat = isBld ? MAT.CONCRETE : sandy ? MAT.SAND : 0;
      addBox(out, [cx, cy0, cz], sz, bcol, [t, u, r]);
      out._mat = 0;
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
        out._mat = MAT.GLASS;
        for (let i = 1; i < floors; i++) {
          const wc = (lit && hash(k * 7.7 + i * 3.3 + dist * 0.1) < 0.34) ? darkWin : win;
          // band on the camera-facing (u × sz2) face; thin in up, proud in sz2
          addBox(out, [cx, base + (i + 0.5) * fh, cz], [sz[0] * 0.98, fh * 0.5, sz[2] * 1.03], wc, [t, u, r]);
        }
        // parapet cap so the roofline isn't a bare slab edge
        out._mat = MAT.METAL;
        addBox(out, [cx, base + sz[1] + 0.6, cz], [sz[0] * 1.02, 1.2, sz[2] * 1.04], col, [t, u, r]);
        out._mat = 0;
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
      // The returned point is sunk 0.3 m below the sample: it's a SINGLE-point
      // reading, so on any slope a flat-based model placed exactly at it floats
      // on the downhill side. Every anchored model (engine helpers AND raw
      // per-track props) inherits the embed; tops drop by the same 0.3, which
      // is visually negligible on multi-metre props.
      const ty = terrainYAt(cx, cz);
      return { c: [cx, (ty == null ? groundYAt(k, dist) : ty) - 0.3, cz], r, u, t };
    };
    // Conifer/pine: tapered trunk + stacked cones. col = needle green. Three
    // silhouette variants selected per-instance so a treeline doesn't read as
    // identical clones stretched to different sizes: FULL (dense 4-tier), LEAN
    // (windswept — each tier offset sideways, increasing with height), SPARSE
    // (thinner 3-tier, gappy — storm-thinned or younger tree).
    const pine = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 3)) {
        console.warn(`[scenery] pine SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      // per-instance size jitter so a treeline doesn't read as identical clones
      const j = 0.85 + hash(k * 3.7 + side * 1.3 + dist) * 0.3;
      const c2 = [col[0] * 0.86, col[1] * 0.86, col[2] * 0.82];   // shaded lower needles
      out._mat = MAT.WOOD;
      // Trunk starts 0.5 m BELOW the anchor: anchor() samples the terrain at one
      // point, so on a slope a flat-based trunk floats on the downhill side.
      addCyl(out, vadd(a.c, a.u, -0.5), 0.35 + h * 0.02, h * 0.4 + 0.5, [0.30, 0.22, 0.13], 6, b);
      const vr = hash(k * 6.1 + side * 4.4 + dist + 9.3);
      const sparse = vr > 0.82;                          // ~18% thinner 3-tier trees
      const lean = !sparse && vr > 0.55 ? (vr - 0.55) * 2.2 : 0;   // ~27% windswept lean
      const tiers = sparse ? 3 : 4;
      let y = h * 0.3;
      out._mat = MAT.FOLIAGE;
      for (let i = 0; i < tiers; i++) {
        const w = (sparse ? 2.3 : 2.7) * j * (1 - i * (sparse ? 0.24 : 0.21));
        let c = vadd(a.c, a.u, y);
        if (lean) c = vadd(c, a.r, lean * (y / h) * 1.6 * side);   // tilt away from the road
        addCone(out, c, w, h * 0.32, i === 0 ? c2 : col, 7, b);
        y += h * (sparse ? 0.24 : 0.18) * j;
      }
      out._mat = 0;
    };
    // Broadleaf tree: short trunk + a rounded canopy (squat wide cone + cap cone).
    // ~9% of instances are a bare DEAD/STORM tree (trunk + thin branch cylinders,
    // no canopy) — breaks up monoculture stands and reads as a real weathered
    // treeline rather than a cloned forest. Living trees get a per-instance
    // ASYMMETRIC lean on the upper canopy (~35%) so not every crown is a perfect
    // dome.
    const tree = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 4)) {
        console.warn(`[scenery] tree SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      const vr = hash(k * 8.3 + side * 5.1 + dist + 4.7);
      if (vr > 0.91) {   // dead/storm tree: bare trunk + a few angled branch stubs.
        // addCyl extends along basis[1] ("up"), so each branch needs its OWN
        // tilted up-vector (mostly vertical, blended with an outward lean) —
        // not the tree's vertical `a.u`, or the branches would draw straight up.
        const th = h * 0.7;
        out._mat = MAT.WOOD;
        addCyl(out, vadd(a.c, a.u, -0.5), 0.32, th + 0.5, [0.28, 0.22, 0.16], 6, b);   // sunk base — no slope float
        const top = vadd(a.c, a.u, th);
        for (let i = 0; i < 3; i++) {
          const bh = hash(k * 11 + i * 3.1 + dist);
          const ang = (i / 3 + bh * 0.4) * 6.2832;
          const out2 = vadd(vadd([0, 0, 0], a.r, Math.cos(ang)), a.t, Math.sin(ang));
          const bu = [a.u[0] * 0.7 + out2[0] * 0.7, a.u[1] * 0.7, a.u[2] * 0.7 + out2[2] * 0.7];
          addCyl(out, vadd(top, a.u, i * 0.25), 0.09, 1.6 + bh * 1.4, [0.30, 0.24, 0.17], 4, [a.r, bu, a.t]);
        }
        out._mat = 0;
        return;
      }
      // per-instance jitter so adjacent broadleaves vary in size/shape
      const j = 0.85 + hash(k * 2.9 + side * 1.7 + dist) * 0.3;
      const c2 = [col[0] * 0.88, col[1] * 0.9, col[2] * 0.84];   // sunlit upper foliage
      const lean = vr > 0.55 ? (vr - 0.55) * 1.4 : 0;   // asymmetric crown, ~35% of instances
      out._mat = MAT.WOOD;
      // Trunk reaches well into the crown (0.55h): the skirt cone is nearly flat,
      // so from road level its top surface backface-culls and the crown would
      // otherwise appear to start at the SECOND cone — a floating canopy with a
      // see-through band above a too-short trunk (Albert Park eucalyptus rows).
      addCyl(out, vadd(a.c, a.u, -0.5), 0.4, h * 0.55 + 0.5, [0.32, 0.23, 0.13], 6, b);   // sunk base — no slope float
      out._mat = MAT.FOLIAGE;
      // Close the crown's UNDERSIDE: a shallow inverted skirt from the widest
      // ring down to the trunk, faces oriented downward (ref sits above), so
      // low/flat viewpoints see a shaded canopy bottom instead of a culled hole.
      {
        const usR = (3.5 + h * 0.135) * j;
        const ringY = h * 0.34, apexY = h * 0.20;
        const usCol = [col[0] * 0.5, col[1] * 0.52, col[2] * 0.5];
        const uref = vadd(a.c, a.u, h * 0.7);
        const apex = vadd(a.c, a.u, apexY);
        for (let i = 0; i < 9; i++) {
          const a0 = i / 9 * 6.2832, a1 = (i + 1) / 9 * 6.2832;
          const ring = (ang) => vadd(vadd(vadd(a.c, a.u, ringY), a.r, Math.cos(ang) * usR), a.t, Math.sin(ang) * usR);
          emit(out, [ring(a0), ring(a1), apex], usCol, uref);
        }
      }
      // ROUNDED broadleaf canopy: bulges widest in the middle and is capped by a
      // squat dome — a full, billowing crown that reads clearly as a deciduous
      // tree rather than the narrow pointed cone-stack of conifer() (the two used
      // to look near-identical). Top two layers are inverted/short cones so the
      // crown rounds off instead of tapering to a spike, and lean into `a.r`
      // increasingly with height on asymmetric instances.
      addCone(out, vadd(a.c, a.u, h * 0.28), (3.3 + h * 0.13) * j, h * 0.30, col, 9, b);   // wide skirt
      addCone(out, vadd(a.c, a.u, h * 0.46), (3.7 + h * 0.14) * j, h * 0.26, col, 9, b);   // widest bulge
      addCone(out, vadd(vadd(a.c, a.u, h * 0.66), a.r, lean), (2.9 + h * 0.10) * j, h * 0.26, c2, 8, b);    // shoulder
      addCone(out, vadd(vadd(a.c, a.u, h * 0.82), a.r, lean * 1.6), (1.7 + h * 0.06) * j, h * 0.22, c2, 7, b);    // rounded cap
      out._mat = 0;
    };
    // Palm: tall thin trunk + a crown of drooping frond prisms.
    const palm = (k, side, dist, h, frond) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 4)) {
        console.warn(`[scenery] palm SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      // Gently curved trunk: three tapering segments each leaning a touch further
      // (palms arc toward the light) instead of one dead-straight pole.
      const lean = (hash(k * 3.3 + side * 2.1 + dist) - 0.5) * 0.5;
      const seg = h / 3;
      out._mat = MAT.WOOD;
      // buried root stub: keeps the slim trunk grounded on sloped/uneven terrain
      addCyl(out, vadd(a.c, a.u, -0.6), 0.38, 0.75, [0.42, 0.34, 0.21], 6, b);
      // Curved trunk as a CONNECTED chain: each segment runs joint-to-joint with
      // its own tilted up-vector (like the dead-tree branches). The old form
      // stacked vertical cylinders at per-segment lateral offsets — with any
      // lean the top segment detached sideways and floated as a bare stick.
      const joint = (t) => vadd(vadd(a.c, a.u, t * seg), a.r, lean * t * t * 0.4 * side);
      for (let t = 0; t < 3; t++) {
        const p0 = joint(t), p1 = joint(t + 1);
        const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || seg;
        addCyl(out, p0, 0.34 - t * 0.06, L, [0.45 - t * 0.03, 0.36, 0.22], 6,
               [a.r, [d[0] / L, d[1] / L, d[2] / L], a.t]);
      }
      const base = joint(3);
      out._mat = MAT.FOLIAGE;
      // Crown sits AT the trunk top (was seg/2 ≈ h/6 below it — a bare pole
      // stuck up through the fronds, reading as a floating stick from distance).
      // `base` (= joint(3)) already carries the full lean offset.
      const top = vadd(base, a.u, -0.35);
      const frCol = frond || [0.18, 0.40, 0.16];
      const frDark = [frCol[0] * 0.8, frCol[1] * 0.82, frCol[2] * 0.78];
      // Solid crown core: thin fronds alias away at range, so keep a visible
      // green mass at the hub — without it a distant palm is just a brown pole.
      addBox(out, top, [1.7, 1.2, 1.7], frDark, b);
      // 9 drooping fronds: each arcs outward then down (own tilted up-vector),
      // with per-frond length/droop jitter so the crown reads full, not a star.
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9 + hash(k + i * 1.7) * 0.06) * 6.2832, dir = [Math.cos(ang), 0, Math.sin(ang)];
        const fr = [dir[0] * a.r[0] + dir[2] * a.t[0], 0, dir[0] * a.r[2] + dir[2] * a.t[2]];
        const droop = 0.45 + hash(k * 2.1 + i) * 0.5;            // how far the frond bends down
        const fu = [fr[0] * droop + a.u[0] * (1 - droop), a.u[1] * (1 - droop * 0.7), fr[2] * droop + a.u[2] * (1 - droop)];
        const len = 5.0 + hash(k + i * 3.3) * 2.0;
        const fc = vadd(vadd(top, fr, 2.4), a.u, 0.15);
        addPrism(out, fc, [1.9, 0.5, len], i % 2 ? frCol : frDark, [fr, fu, [-fr[2], 0, fr[0]]]);
      }
      // Coconut cluster tucked under the crown.
      out._mat = MAT.WOOD;
      for (let i = 0; i < 3; i++) {
        const ang = i / 3 * 6.2832;
        addBox(out, vadd(vadd(top, a.r, Math.cos(ang) * 0.5), a.t, Math.sin(ang) * 0.5),
               [0.34, 0.34, 0.34], [0.32, 0.24, 0.14], b);
      }
      out._mat = 0;
    };
    // Conifer / fir: a tall narrow stack of cones — alpine & northern forest
    // circuits (Spa, Red Bull Ring, Zandvoort dunes, Montreal).
    const conifer = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 3)) return;
      const c2 = [col[0] * 0.86, col[1] * 0.92, col[2] * 0.82];
      out._mat = MAT.WOOD;
      addCyl(out, vadd(a.c, a.u, -0.5), 0.3, h * 0.20 + 0.5, [0.34, 0.24, 0.15], 5, b);   // trunk, sunk base
      out._mat = MAT.FOLIAGE;
      addCone(out, vadd(a.c, a.u, h * 0.14), 2.1 + h * 0.06, h * 0.44, col, 7, b);
      addCone(out, vadd(a.c, a.u, h * 0.42), 1.6 + h * 0.05, h * 0.38, col, 6, b);
      addCone(out, vadd(a.c, a.u, h * 0.70), 1.0 + h * 0.04, h * 0.34, c2, 6, b);
      out._mat = 0;
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
      out._mat = MAT.ROCK;
      addPyramid(out, [x, baseY, z], [w, h, w], col, null);
      addPyramid(out, [x, baseY - 2, z], [w * 1.5, h * 0.45, w * 1.5], [col[0] * 0.9, col[1] * 0.92, col[2] * 0.9], null);
      out._mat = 0;
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
    // Populate a raked seating bank with speckled spectators. Front row sits at
    // clearance `gap` beyond the road edge and the bank rises `rise` m over
    // `depth` m of recede, split into blocks by aisles. Empty seats + a dark
    // riser behind each row read as shadow, not sky, through the gaps. At night
    // most bodies go dark with a sparse scatter of phone-lights / camera flashes.
    // Emitted with RAW.addBox (spectators always sit safely behind the shell, so
    // the per-box on-road test is skipped for speed).
    const crowdBank = (k, side, gap, len, rise, depth, riserCol) => {
      const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
      const rows = Math.max(3, Math.round(rise / 1.4));
      const perRow = Math.max(6, Math.round(len / 1.15));
      const riser = riserCol || (NIGHT ? [0.10, 0.10, 0.13] : [0.28, 0.26, 0.27]);
      for (let r = 0; r < rows; r++) {
        const f = (r + 0.5) / rows, up = f * rise, back = f * depth;
        // dark step riser behind each seating row (blocks sky/ground show-through).
        // Guarded (unlike the tiny spectator boxes): the riser is a wide flat slab,
        // so a mis-placed bank whose front row creeps toward the tarmac would
        // otherwise overhang the road here — the exact bypass this RAW path used to
        // leave open. rejBox drops only a riser actually over the road; a bank
        // safely behind the shell never trips it, so intended crowds are unchanged.
        out._mat = MAT.CONCRETE;
        const riserC = vadd(vadd(a.c, a.u, up), a.r, side * back);
        // If the riser is rejected, this row has no seating — so skip its
        // spectators too. The bodies below go out through RAW (unguarded), so
        // without this they stayed behind as a row of people sitting on thin
        // air where the stand had been dropped.
        if (rejBox(riserC, [1.3, 1.5, len], b)) continue;
        RAW.addBox(out, riserC, [1.3, 1.5, len], riser, b);
        out._mat = MAT.FABRIC;
        for (let s2 = 0; s2 < perRow; s2++) {
          if (s2 % 10 === 9) continue;                       // aisle / vomitory gap
          const h1 = hash(k * 2.7 + r * 5.3 + s2 * 1.9 + side * 3.1);
          const h2 = hash(k * 1.3 + r * 8.1 + s2 * 4.7 + side * 2.2);
          if (h2 > 0.86) continue;                            // ~14% empty seats
          const along = ((s2 + 0.5) / perRow - 0.5) * len + (h1 - 0.5) * 0.45;
          const c = vadd(vadd(vadd(a.c, a.t, along), a.u, up + 0.55), a.r, side * back);
          let col;
          if (NIGHT) {
            col = h1 > 0.955 ? [2.6, 2.4, 2.0]                // phone light / flash (HDR → blooms)
                : h1 > 0.55  ? [0.09, 0.10, 0.13]            // dark bodies
                             : [0.16, 0.16, 0.21];
          } else {
            col = CROWD_DAY[Math.floor(h1 * CROWD_DAY.length) % CROWD_DAY.length];
          }
          RAW.addBox(out, c, [0.55, 0.72 + h2 * 0.2, 0.5], col, b);   // torso + head lump
        }
      }
      out._mat = 0;
    };
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
      // Raked crowd: speckled spectators rising from the front toward the shell.
      // (`crowd` colour, kept for call-site compatibility, tints the dark risers.)
      crowdBank(k, side, gap + 1.5, len - 2, 7, 4.2,
                crowd ? [crowd[0] * 0.4, crowd[1] * 0.4, crowd[2] * 0.4] : null);
      // Roof slab cantilevered over the crowd, lifted on the up axis
      const a = anchor(k, side, gap + 5);
      const roofC = vadd(a.c, a.u, 13);
      addBox(out, roofC, [12, 0.8, len + 2], [0.86, 0.88, 0.92], [a.r, a.u, a.t]);
      // Rear fascia — closes the gap between the back shell's top and the roof
      // underside. Without it the roof is a slab hanging in air on EVERY
      // grandstand on every circuit: the shell tops out at ground+11.2 while the
      // roof's underside sits at ground+12.3. The two are also sampled at
      // different lateral distances (gap+7.5 via groundYAt vs gap+5 via the
      // anchor's terrain raycast), so the shortfall varies with the verge slope
      // rather than being a fixed 1.1 m — hence solving it from the two pieces'
      // ACTUAL world-space tops instead of a constant. Placed at the roof's
      // outer edge (over the shell, behind the crowd) so it never occludes the
      // under-roof night strip, and is itself hidden by the roof from trackside.
      {
        const shellTop = cShell[1] + 6, roofUnder = roofC[1] - 0.4;
        if (roofUnder > shellTop - 0.1) {
          const oF = side * (hw[k] + gap + 9);
          addBox(out, [px[k] + r[0] * oF, (shellTop + roofUnder) / 2, pz[k] + r[2] * oF],
                 [4, roofUnder - shellTop + 0.2, len], shell || [0.40, 0.41, 0.46], [r, u, t]);
        }
      }
      // Under-roof lighting: a warm emissive strip beneath the roof slab so a
      // night grandstand reads as a lit, occupied stand instead of a dark hulk.
      if (NIGHT) addBox(out, vadd(a.c, a.u, 12.35), [8.5, 0.28, len - 1], [1.30, 1.12, 0.74], [a.r, a.u, a.t]);
    };

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
      // Geometry-only registration: a catch fence is solid to scenery but must
      // not move the driving limit (it stands behind the runoff by design).
      // Until this existed, fences were the ONLY barrier class no guard could
      // see — and they are the obstacle in most surviving canopy intersections.
      indexBarrier(s0, s1, side, gap);
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
    // Low clipped hedge / continuous treeline.
    const hedge = (s0, s1, side, gap, h, col) => {
      along(s0, s1, 4, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 1.2)) {
          console.warn(`[scenery] hedge SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addBox(out, vadd(p.c, p.u, (h - 0.4) / 2), [2.4, h + 0.4, spacing], col || [0.18, 0.36, 0.16], [p.r, p.u, p.t]);   // base sunk 0.4
      });
    };
    // forestEdge(): a DENSE treeline (mix of pine/tree) from s0→s1 on `side`,
    // GUARANTEED not to clip barriers. Foliage is placed so the canopy's INNER
    // edge stays at least `gap` beyond the road edge — i.e. the per-tree `dist`
    // accounts for the canopy radius (which grows with tree height), so a tree
    // called at small gap can never poke its canopy through a wall/hedge/fence.
    //   opts: { density, hMin, hMax, col, col2, pineFrac }
    // Canopy outer radius for a species at height h — the SINGLE source of truth
    // for "how far does this tree's foliage actually reach sideways". Both
    // forestEdge() and the FURN roadside scatter derive placement from it.
    // Keeping two hand-copied estimates is what let forestEdge's drift stale:
    // it still described tree()'s old (2.9 + h*0.12) skirt after the broadleaf
    // crown was widened to (3.7 + h*0.14), leaving the "GUARANTEED not to clip
    // barriers" contract ~0.9 m optimistic at h=16.
    const canopyR = (kind, h) => {
      const jMax = 1.15;                                  // per-instance jitter ceiling
      if (kind === "pine") return 2.7 * jMax + 0.4;       // pine(): widest lower tier
      if (kind === "fir")  return 2.1 + h * 0.06 + 0.4;   // conifer(): no jitter applied
      if (kind === "palm") return 5.2;                    // frond hub 2.4 + blade spread
      return (3.7 + h * 0.14) * jMax + 0.4;               // tree(): widest bulge cone
    };
    // Queued, then flushed after def.scenery() returns. A track file is written
    // in whatever order reads well — imola plants its treelines at the top and
    // builds its catch fences 280 lines later — so a forestEdge() that consults
    // the barrier index the moment it is called is usually consulting an empty
    // one. Deferring every treeline to the end of the scenery pass makes the
    // guard order-independent: authors keep writing scenery in any order they
    // like, and the foliage always sees the finished barrier set.
    const deferredFoliage = [];
    const forestEdge = (...a) => { deferredFoliage.push(a); };
    const forestEdgeNow = (s0, s1, side, gap, opts) => {
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
        const canopy = canopyR(isPine ? "pine" : "broad", h);
        // dist so the canopy's inner edge sits `gap` beyond the road edge
        const dist = gap + canopy;
        // stagger a back row slightly for depth on the densest treelines
        const back = (dens > 0.6 && hash(k * 8.9 + side) < 0.4) ? canopy * 1.4 : 0;
        // Same world-space guard the roadside scatter uses. The canopy sizing
        // above only guarantees clearance from the ROAD EDGE; a treeline run
        // alongside a stretch that also carries a catch fence still grows
        // straight through it, which is every surviving hit on imola.
        const d = clearTreeDist(k, side, dist + back, canopy);
        if (d == null) return;
        if (isPine) pine(k, side, d, h, pineCol);
        else        tree(k, side, d, h, treeCol);
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
      const rows = lod(Math.max(4, Math.min(10, Math.round(sh / 4.4))), 3);   // perf: coarser window grid (was 15 / 3.4); mobile LOD via lod()
      const fh = sh / rows, frameT = 0.30, railH = Math.max(0.4, fh * 0.24), winH = Math.max(0.5, fh - railH);
      // Draw the inset curtain wall on ONE vertical face. nAxis = outward axis idx
      // (0=r,2=t), nSign = its sign, nHalf = half-extent along it; wAxis = the
      // in-plane horizontal axis idx, faceW = that face's width. Box dims are built
      // per-axis so the same code does the track-facing face AND the two sides.
      const drawFace = (nAxis, nSign, nHalf, wAxis, faceW, sOff, simple) => {
        const nVec = bb[nAxis], wVec = bb[wAxis];
        // SIMPLE sides = a coarse pane grid only (no rails / mullions / neon edges)
        // so the sides are cheap and the city can stay dense.
        // perf: fewer panes per face (was simple 4/4.2, full 8/2.6; rowN 9/5.0)
        const cols = simple ? Math.max(2, Math.min(3, Math.round(faceW / 5.4))) : lod(Math.max(2, Math.min(6, Math.round(faceW / 3.3))), 2);
        const rowN = simple ? lod(Math.max(2, Math.min(6, Math.round(sh / 6.4))), 2) : rows;
        const fhh = sh / rowN, winHH = Math.max(0.5, fhh - railH);
        const fBase = vadd(mid, nVec, nSign * (nHalf + 0.34));
        const gBase = vadd(mid, nVec, nSign * (nHalf + 0.04));
        const dim = (thin, hgt, wid) => { const a = [0, 0, 0]; a[nAxis] = thin; a[1] = hgt; a[wAxis] = wid; return a; };
        out._mat = MAT.METAL;
        if (!simple) for (let i = 0; i <= rowN; i += 2) addBox(out, vadd(fBase, u, (i / rowN - 0.5) * sh), dim(frameT, railH, faceW * 1.005), frameCol, bb);   // perf: every other rail
        for (let c = 0; c < cols; c++) {
          const cx = (-0.5 + (c + 0.5) / cols) * faceW;
          for (let ri = 0; ri < rowN; ri++) {
            const ry = (-0.5 + (ri + 0.5) / rowN) * sh;
            let col = dark, lit = false;
            if (hash(seed + sOff + c * 12.9 + ri * 7.3) < litShare) {
              lit = true;
              const tw = 0.65 + hash(seed + sOff + c * 5.5 + ri * 2.2) * 0.5;
              col = hash(seed + sOff + c * 3.1 + ri * 1.7) < neonShare
                ? [nc[0] * tw, nc[1] * tw, nc[2] * tw] : [warm[0] * tw, warm[1] * tw, warm[2] * tw];
            }
            // Lit panes glow on the emissive props mesh. UNLIT panes on the main
            // track-facing facade become REFLECTIVE dark glass (routed to glassBuf)
            // so night windows mirror the floodlights/neon city as live glints —
            // net-zero geometry (same boxes, redistributed). Simple side faces keep
            // their panes on props so the unchunked glass draw stays bounded.
            const toGlass = !lit && !simple;
            if (toGlass) glassBuf._mat = MAT.GLASS; else out._mat = 0;   // lit panes stay untextured (pure emissive read)
            addBox(toGlass ? glassBuf : out, vadd(vadd(gBase, wVec, cx), u, ry), dim(0.08, winHH, (faceW / cols) * 0.82), col, bb);
            if (toGlass) glassBuf._mat = 0;
          }
        }
        out._mat = MAT.METAL;
        if (simple) { out._mat = 0; return; }
        const nm = Math.max(1, Math.min(3, cols - 1));   // perf: fewer mullions (was 5)
        for (let c = 1; c <= nm; c++) addBox(out, vadd(fBase, wVec, (-0.5 + c / (nm + 1)) * faceW), dim(frameT, sh, 0.4), frameCol, bb);
        if (neonAmt > 0.3) {
          const ST = Math.min(0.4, faceW * 0.04);
          for (const dr of [-1, 1]) addBox(out, vadd(fBase, wVec, dr * faceW * 0.5), dim(frameT * 1.05, sh * 0.96, ST), nc, bb);
          addBox(out, vadd(vadd(mid, nVec, nSign * (nHalf + 0.36)), u, sh * 0.48), dim(frameT * 1.1, Math.min(0.5, sh * 0.018), faceW), nc, bb);
        }
        out._mat = 0;
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
      // Keep the whole footprint clear of the track — not just the inner-face
      // centre point. A w×d building at a curve (esp. a long cityFront row) sweeps
      // its body over a NEARBY doubling-back stretch of tarmac even when the single
      // inner-face point clears; that single-point test was the dominant residual
      // "building over the racing line" bug (Baku/Montreal/Zandvoort). rejBox runs
      // the full oriented-footprint Minkowski test over every node within reach.
      // clearMargin pads the street-circuit barrier allowance into the box.
      const clearMargin = def.street ? 3.0 : 1.2;
      if (rejBox(p.c, [w + clearMargin * 2, h, d + clearMargin * 2], b)) {
        console.warn(`[scenery] building SUPPRESSED at k=${k} side=${side}: gap=${gap} w=${w} (footprint over track)`);
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
      const HDR = 1.55;
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
        // Wall material: warm/light facades read as BRICK, cooler/grey as CONCRETE;
        // reflective window bands carry the GLASS mullion-grid material.
        const wmat = (dayWall[0] > 0.5 && dayWall[0] > dayWall[2] + 0.03) ? MAT.BRICK : MAT.CONCRETE;
        out._mat = wmat; glassBuf._mat = MAT.GLASS;
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
            out._mat = MAT.GLASS;
            addBox(out, vadd(gBase, p.u, yBase + (r + 0.5) * fh), [glassT, winH, sd * 0.94], [dayWall[0] * 0.34, dayWall[1] * 0.30, dayWall[2] * 0.26], b);
            out._mat = wmat;
          } else {
            const t01 = 0.42 + ry01 * 0.16;
            // Darker glass base → the reflected sky/sun has real contrast to read
            // against (a bright window albedo washes the reflection flat).
            addBox(glassBuf, vadd(gBase, p.u, yBase + (r + 0.5) * fh), [glassT, winH, sd * 0.94], [t01 * 0.40, t01 * 0.47, t01 * 0.62], b);
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
        out._mat = 0; glassBuf._mat = 0;
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
        if (h > 38) {
          // Beacon sits 2.4 m over the roof, so it needs the mast a real
          // aviation light stands on — without it the red cube hung in clear
          // air above every tall tower on every city circuit.
          addCyl(out, vadd(p.c, p.u, topY), 0.14, 2.4, [0.30, 0.30, 0.34], 4, b);          // beacon mast
          addBox(out, vadd(p.c, p.u, topY + 2.4), [1.1, 1.1, 1.1], [3.2, 0.4, 0.3], b);    // red beacon
        }
      }
      blockAt(k, side, gap, d / 2);   // solid: stop the car before the façade
    };
    // neonTower(): the INNER-ring filler model — a dark detailed tower sharing the
    // neonFacade() treatment with the building() landmarks. `kind` varies the
    // silhouette (setback / tiered ziggurat / podium-and-tower) so the street wall
    // isn't a row of identical boxes.
    const neonTower = (k, side, dist, w, h, d, neon, kind, tone, neonAmt) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const reach = Math.max(w, d);   // used below for cylinder/dome/drum radii
      // Footprint guard: test the tower's FULL oriented w×d footprint against the
      // tarmac, not just its inner-face centre point. The old single-point test
      // missed a tower that, on a CURVING street where the track doubles back,
      // sweeps its body over a NEARBY stretch of road the point never sampled —
      // the dominant "building over the racing line" bug on Baku/Miami/Jeddah/etc.
      // rejBox runs the same Minkowski (footprint ⊕ road half-width) test the
      // guarded addBox wrapper uses, over every node within reach, so it catches
      // the doubling-back case exactly. Some kinds widen the base (podium ×1.35,
      // tiered), so pad the tested extents to the widest section.
      const gw = reach * 1.4;
      if (rejBox(a.c, [gw, h, gw], b)) return;
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
        const rows = lod(Math.max(4, Math.min(10, Math.round(sh / 4.4))), 3);   // perf: cap + coarser (was uncapped / 3.4); mobile LOD via lod()
        // Draw the window grid on one vertical face (track-facing or a side). Same
        // per-axis box-dim trick as neonFacade so the sides are glazed too.
        const dface = (nAxis, nSign, nHalf, wAxis, faceW, simple) => {
          // perf: fewer panes per face (was simple 4/4.0, full 7/2.4; rowN 9/5.0)
          const cols = simple ? Math.max(2, Math.min(3, Math.round(faceW / 5.2))) : lod(Math.max(2, Math.min(6, Math.round(faceW / 3.1))), 2);
          const rowN = simple ? lod(Math.max(2, Math.min(6, Math.round(sh / 6.4))), 2) : rows;
          const gB = vadd(cen, b[nAxis], nSign * (nHalf + 0.03));
          const dim = (thin, hgt, wid) => { const a = [0, 0, 0]; a[nAxis] = thin; a[1] = hgt; a[wAxis] = wid; return a; };
          for (let c = 0; c < cols; c++) {
            const cx = (-0.5 + (c + 0.5) / cols) * faceW;
            for (let r = 0; r < rowN; r++) {
              const ry01 = (r + 0.5) / rowN, ctr = vadd(vadd(gB, b[wAxis], cx), b[1], (-0.5 + ry01) * sh);
              // NOTE: out._mat / glassBuf._mat are separate registers — addBox reads
              // whichever buffer object is actually passed as its first argument.
              if (med) { out._mat = MAT.GLASS; addBox(out, ctr, dim(0.06, (sh / rowN) * 0.42, (faceW / cols) * 0.42), medWin, b); out._mat = 0; }
              else { const t01 = 0.42 + ry01 * 0.16; glassBuf._mat = MAT.GLASS; addBox(glassBuf, ctr, dim(0.08, (sh / rowN) * 0.62, (faceW / cols) * 0.6), [t01 * 0.40, t01 * 0.47, t01 * 0.62], b); glassBuf._mat = 0; }
            }
          }
        };
        dface(0, -side, sw / 2, 2, sd, false);   // track-facing: full
        dface(2, 1, sd / 2, 0, sw, true);        // +t side: simple
        dface(2, -1, sd / 2, 0, sw, true);       // -t side: simple
      };
      // Body material: night masses read as CONCRETE (grey structural mass under
      // the neon skin); day facades split BRICK (warm masonry) / CONCRETE (cool)
      // by tone, same rule as building().
      const bmat = NIGHT ? MAT.CONCRETE
        : (bodyCol[0] > 0.5 && bodyCol[0] > bodyCol[2] + 0.03) ? MAT.BRICK : MAT.CONCRETE;
      // One stacked section centred at up=yb+sh/2, optionally offset along tangent.
      // Restores the CALLER's material (not a hard 0) so a MAT.METAL default set
      // around the whole kind-dispatch below survives between/after sec() calls —
      // that's what tags every cap/antenna/trim box without touching each one.
      const sec = (yb, sw, sh, sd, seed, to) => {
        const cen = vadd(vadd(a.c, a.u, yb + sh / 2), b[2], to || 0);
        const prevMat = out._mat;
        out._mat = bmat;
        addBox(out, cen, [sw, sh, sd], bodyCol, b);
        out._mat = prevMat;
        if (NIGHT) neonFacade(cen, b, side, sw, sh, sd, neon, seed, na);
        else dayGridAt(cen, sw, sh, sd);
      };
      // Caps / antennas / trim below default to METAL (roofline plant, masts,
      // beacons) unless a branch overrides it locally.
      out._mat = MAT.METAL;
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
        if (sec(0, w, h, d, k * 3.7 + side * 1.9) === false) return;   // body rejected -> drop its dependents // clean tall slab
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
        if (sec(0, w, h, d, k * 3.7 + side * 1.9) === false) return;   // body rejected -> drop its dependents
        const sc = neonOn ? [neon[0] * 1.25, neon[1] * 1.25, neon[2] * 1.25] : (NIGHT ? [warm[0] * 0.9, warm[1] * 0.9, warm[2] * 0.9] : [0.30, 0.33, 0.40]);
        addBox(out, vadd(vadd(a.c, a.u, h * 0.56), b[0], -side * (w / 2 + 0.25)), [0.3, h * 0.66, d * 0.82], sc, b);
        if (neonOn) addBox(out, vadd(vadd(a.c, a.u, h * 0.56), b[0], -side * (w / 2 + 0.28)), [0.1, h * 0.6, d * 0.74], [neon[0] * 0.4, neon[1] * 0.4, neon[2] * 0.4], b);
      } else if (kind === "clad") {                               // neon-banded tower (BRIGHT)
        if (sec(0, w, h, d, k * 3.7 + side * 1.9) === false) return;   // body rejected -> drop its dependents
        if (neonOn) { const bands = Math.max(4, Math.round(h / 5)); for (let i = 1; i < bands; i++) addBox(out, vadd(a.c, a.u, i * (h / bands)), [w * 1.04, (h / bands) * 0.22, d * 1.04], neon, b); }
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.6, 1.0, d * 0.6], cap, b);
      } else if (kind === "dome") {                              // body + drum + dome cap (civic landmark)
        const bh = h * 0.78, R = reach * 0.34;
        if (sec(0, w, bh, d, k * 3.7 + side * 1.9) === false) return;   // body rejected -> drop its dependents
        addCyl(out, vadd(a.c, a.u, bh), R, h * 0.10, cap, 14, b);                                            // drum
        addCone(out, vadd(a.c, a.u, bh + h * 0.10), R * 1.1, h * 0.16, neonOn ? neon : (NIGHT ? warm : cap), 14, b);  // dome
        if (NIGHT) addBox(out, vadd(a.c, a.u, h + 0.6), [0.7, 0.7, 0.7], neonOn ? [3.0, 2.0, 0.8] : [3.0, 0.6, 0.4], b);
      } else if (kind === "chevron") {                           // pitched / gabled roof block
        const bh = h * 0.82;
        if (sec(0, w, bh, d, k * 3.7 + side * 1.9) === false) return;   // body rejected -> drop its dependents // addPrism takes its `c` as the BASE, not the centre (unlike addBox), so
        // adding half the roof height here lifted the gable clear of the tower —
        // h*0.09 of open sky under every chevron roof (9 m on a 100 m tower).
        seat.prism(out, vadd(a.c, a.u, bh), [w, h * 0.18, d], cap, b);                                       // gable roof, seated on the body
        if (neonOn) addBox(out, vadd(a.c, a.u, bh + h * 0.18), [w * 1.02, 0.5, d * 1.02], neon, b);          // eave neon
      } else if (kind === "notch") {                             // twin slabs split by a vertical slot
        const podH = h * 0.22, off = w * 0.30;
        if (sec(0, w, podH, d, k * 3.1 + side) === false) return;   // body rejected -> drop its dependents // shared podium base
        for (const o2 of [-off, off]) sec(podH, w * 0.42, h - podH, d, k * 4.3 + side + o2, o2);             // two towers
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.92, 1.0, d * 0.9], cap, b);
      } else if (kind === "fin") {                               // slab with proud vertical fins on the face
        if (sec(0, w, h, d, k * 3.7 + side * 1.9) === false) return;   // body rejected -> drop its dependents
        const fins = Math.max(3, Math.round(w / 4));
        for (let i = 0; i < fins; i++) {
          const fx = (-0.5 + (i + 0.5) / fins) * w, lit = neonOn && hash(k + i * 5.1 + side) < 0.5;
          addBox(out, vadd(vadd(vadd(a.c, a.u, h * 0.5), b[2], fx), b[0], -side * (d / 2 + 0.2)), [0.5, h * 0.94, 0.5], lit ? neon : cap, b);
        }
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.92, 1.0, d * 0.92], cap, b);
      } else if (kind === "antenna") {                           // flat-top tower + mast cluster + beacons
        if (sec(0, w, h, d, k * 3.7 + side * 1.9) === false) return;   // body rejected -> drop its dependents
        addBox(out, vadd(a.c, a.u, h + 0.4), [w * 0.9, 0.8, d * 0.9], cap, b);
        const masts = 3;
        for (let i = 0; i < masts; i++) {
          const mx = (-0.5 + (i + 0.5) / masts) * w * 0.6, mh = h * (0.14 + hash(k + i * 7.3) * 0.16);
          addCyl(out, vadd(vadd(a.c, a.u, h), b[2], mx), 0.22, mh, [0.4, 0.4, 0.45], 4, b);
          if (NIGHT) addBox(out, vadd(vadd(a.c, a.u, h + mh), b[2], mx), [0.5, 0.5, 0.5], [3.0, 0.5, 0.35], b);  // beacon
        }
      } else if (kind === "cross") {                             // two perpendicular slabs (+ footprint)
        if (sec(0, w, h, d * 0.5, k * 3.7 + side * 1.9) === false) return;   // body rejected -> drop its dependents // arm along tangent
        const cen2 = vadd(a.c, a.u, h * 0.5);
        addBox(out, cen2, [w * 0.5, h, d], bodyCol, b);                                                       // arm along width
        if (NIGHT) neonFacade(cen2, b, side, w * 0.5, h, d, neon, k * 6.1 + side, na);
        else dayGridAt(cen2, w * 0.5, h, d);
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.6, 1.0, d * 0.6], cap, b);
      } else if (kind === "arch") {                              // portal / gateway — two legs + spanning lintel
        const legW = w * 0.26, gp = w * 0.46, legH = h * 0.78, off = gp / 2 + legW / 2;
        for (const o3 of [-off, off]) sec(0, legW, legH, d, k * 3.3 + side + o3 * 7, o3);   // legs
        sec(legH, w, h - legH, d, k * 5.9 + side);                                          // lintel
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.96, 1.0, d * 0.9], cap, b);
      } else if (kind === "ziggurat") {                          // stepped terrace (many small steps)
        const steps = 6; let yb = 0, tw = w, td = d;
        for (let i = 0; i < steps; i++) { const th = h / steps; sec(yb, tw, th, td, k * 2.9 + side + i * 8); yb += th; tw *= 0.82; td *= 0.82; }
        addBox(out, vadd(a.c, a.u, h + 0.4), [tw, 0.8, td], cap, b);
      } else if (kind === "drum") {                              // squat arena / stadium drum
        const R = reach * 0.6, dh = h * 0.5;
        addCyl(out, a.c, R, dh, bodyCol, 18, b);
        const ring = NIGHT ? (neonOn ? neon : warm) : [0.30, 0.34, 0.42];
        addCyl(out, vadd(a.c, a.u, dh * 0.5), R * 1.02, dh * 0.16, ring, 18, b);            // mid neon ring
        addCyl(out, vadd(a.c, a.u, dh), R * 0.96, 1.2, cap, 18, b);                         // roof rim
        addCyl(out, vadd(a.c, a.u, dh + 1.0), R * 0.7, 0.8, cap, 18, b);                    // shallow dome hint
      } else if (kind === "hall") {                              // low wide gabled hall (market / depot)
        const hh = h * 0.5;
        if (sec(0, w, hh * 0.7, d, k * 3.3 + side) === false) return;   // body rejected -> drop its dependents // low body
        seat.prism(out, vadd(a.c, a.u, hh * 0.7), [w, hh * 0.3, d], cap, b);               // gable roof, seated on the body
        if (neonOn) addBox(out, vadd(a.c, a.u, hh * 0.7), [w * 1.02, 0.4, d * 1.02], neon, b);  // eave neon
      } else { // setback
        const setH = h * 0.84;
        if (sec(0, w, setH, d, k * 3.7 + side * 1.9) === false) return;   // body rejected -> drop its dependents
        out._mat = bmat;
        addBox(out, vadd(a.c, a.u, setH + (h - setH) / 2), [w * 0.72, h - setH, d * 0.72], bodyCol, b);
        out._mat = MAT.METAL;
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 0.5, 1.0, d * 0.5], cap, b);
      }
      out._mat = 0;
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
    // streetLamp(): a roadside lamp post with a cantilever arm reaching toward the
    // track. The lamp head glows HDR at night (per-track tint) and reads as a
    // painted housing by day. `style` varies the silhouette: "arm" (highway
    // cantilever), "globe" (heritage twin globes), "post" (simple modern column).
    const streetLamp = (k, side, dist, head, h, lstyle) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 2)) return;
      const pole = [0.13, 0.13, 0.15];
      // Night head albedo trimmed 1.9x -> 1.4x: the emissive path pushes bright
      // albedo a further ~2.3x past 1.0 for bloom, so 1.9 stacked to ~5x HDR and
      // the mast heads stayed glaring even after the point-light energy was
      // dimmed (the head geometry glow is independent of the light scale).
      const lit = NIGHT ? [head[0] * 1.4, head[1] * 1.4, head[2] * 1.4]
                        : [head[0] * 0.72, head[1] * 0.72, head[2] * 0.70];
      addCyl(out, vadd(a.c, a.u, -0.4), 0.18, h + 0.4, pole, 6, b);                          // column, sunk base
      if (lstyle === "globe") {                                                              // heritage twin-globe
        const top = vadd(a.c, a.u, h);
        for (const e of [-1, 1]) {
          const gp = vadd(vadd(top, b[2], e * 1.1), a.u, -0.1);
          addBox(out, vadd(top, b[2], e * 0.55), [0.16, 0.16, 1.1], pole, b);                // bracket
          addBox(out, gp, [0.7, 0.8, 0.7], lit, b);                                          // glowing globe
        }
      } else if (lstyle === "post") {                                                        // simple modern cap
        addBox(out, vadd(a.c, a.u, h), [0.5, 0.5, 0.5], lit, b);
      } else {                                                                               // cantilever arm
        const top = vadd(a.c, a.u, h);
        // arm + head as one cantilever: the member is never optional
        cantilever(out, vadd(top, a.u, -0.2), 1.7, -side, [0.85, 0.35, 0.55], lit, pole, b);
      }
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
    const house = (k, side, gap, w, h, d, opts) => {
      opts = opts || {};
      const dist = gap + w / 2;
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      const ifx = p.c[0] - p.r[0] * side * w / 2, ifz = p.c[2] - p.r[2] * side * w / 2;
      if (onTrack(ifx, ifz, 2)) {
        console.warn(`[scenery] house SUPPRESSED at k=${k} side=${side}: gap=${gap} w=${w}`);
        return;
      }
      const hh = hash(k * 6.7 + side * 3.9 + gap);
      const wall = opts.wall || HOUSE_WALLS[Math.floor(hh * HOUSE_WALLS.length) % HOUSE_WALLS.length];
      const roofCol = opts.roof || HOUSE_ROOFS[Math.floor(hash(k * 9.1 + side) * HOUSE_ROOFS.length) % HOUSE_ROOFS.length];
      const roofType = opts.roofType || (hh > 0.5 ? "hip" : "gable");
      const nightLit = NIGHT && opts.lit !== false;
      // Main box mass.
      addBox(out, vadd(p.c, p.u, h / 2), [w, h, d], wall, b);
      // Roof — gable (ridge along the frontage) or hip (single apex), a slight
      // eave overhang so it reads distinct from the wall below.
      const roofH = h * (0.42 + hash(k * 13.3 + side) * 0.20);
      const roofSz = [w * 1.10, roofH, d * 1.10];
      if (roofType === "hip") addPyramid(out, vadd(p.c, p.u, h), roofSz, roofCol, b);
      else addPrism(out, vadd(p.c, p.u, h), roofSz, roofCol, b);
      // Chimney on most houses (skip on some for variety).
      if (hash(k * 17 + side) > 0.3) {
        const cc = vadd(vadd(vadd(p.c, p.r, w * 0.22 * side), p.t, d * 0.12), p.u, h * 0.65);
        addCyl(out, cc, 0.32, roofH * 0.95, [0.40, 0.36, 0.34], 4, b);
      }
      // Door + two windows on the road-facing wall. Warm HDR glow at night (a lit
      // cottage window), a plain pale pane by day.
      const faceOff = -side * (w / 2 + 0.02);
      const winCol = opts.window || (nightLit ? [1.55, 1.10, 0.55] : [0.72, 0.80, 0.84]);
      addBox(out, vadd(vadd(p.c, p.r, faceOff), p.u, 1.0), [0.06, 2.0, 1.1], [0.26, 0.18, 0.13], b);
      for (const wx of [-d * 0.26, d * 0.26]) {
        addBox(out, vadd(vadd(vadd(p.c, p.r, faceOff), p.t, wx), p.u, h * 0.58), [0.06, 1.1, 1.0], winCol, b);
      }
    };
    const motorhome = (k, side, gap, w, h, d, opts) => {
      opts = opts || {};
      const dist = gap + w / 2;
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      const ifx = p.c[0] - p.r[0] * side * w / 2, ifz = p.c[2] - p.r[2] * side * w / 2;
      if (onTrack(ifx, ifz, 2)) {
        console.warn(`[scenery] motorhome SUPPRESSED at k=${k} side=${side}: gap=${gap} w=${w}`);
        return;
      }
      const hh = hash(k * 7.3 + side * 4.1 + gap);
      const body = opts.wall || MOTORHOME_BODY[Math.floor(hh * MOTORHOME_BODY.length) % MOTORHOME_BODY.length];
      const accent = opts.accent || [0.75, 0.10, 0.10];
      const nightLit = NIGHT && opts.lit !== false;
      const winCol = opts.window || (nightLit ? [1.5, 1.3, 0.85] : [0.30, 0.36, 0.42]);
      // Lower deck (full footprint) + a slightly set-back upper deck — the real
      // two-tier hospitality-unit silhouette, not a flat single box.
      const loH = h * 0.56;
      addBox(out, vadd(p.c, p.u, loH / 2), [w, loH, d], body, b);
      addBox(out, vadd(p.c, p.u, loH + (h - loH) / 2), [w * 0.86, h - loH, d * 0.90], body, b);
      // Window ribbon along the lower deck's road-facing wall.
      const faceOff = -side * (w / 2 + 0.02);
      addBox(out, vadd(vadd(p.c, p.r, faceOff), p.u, loH * 0.62), [0.05, loH * 0.30, d * 0.82], winCol, b);
      // Livery accent stripe along the base.
      addBox(out, vadd(vadd(p.c, p.r, faceOff * 1.001), p.u, loH * 0.12), [0.06, loH * 0.14, d * 0.94], accent, b);
      // Slide-out awning canopy on two support posts, reaching toward the paddock
      // walkway (away from the unit, same outward direction as the road-facing
      // wall) — the classic team-hospitality shade structure.
      const awnDist = w * 0.42;
      const awnC = vadd(vadd(p.c, p.r, faceOff - side * awnDist), p.u, loH * 0.92);
      addBox(out, awnC, [0.05, 0.10, d * 0.9], opts.awning || [0.20, 0.22, 0.26], b);
      for (const e of [-1, 1]) {
        // Posts stand on the GROUND and rise to the awning. addCyl is
        // BASE-anchored, so offsetting down from the awning by less than the
        // post's own length (−loH*0.44 for a loH*0.82 post) left each foot
        // loH*0.48 in the air — 2.3 m on a tall unit — while overshooting the
        // canopy it holds up by loH*0.38.
        const postC = vadd(vadd(vadd(p.c, p.r, faceOff - side * awnDist), p.t, e * d * 0.42), p.u, -0.2);
        addCyl(out, postC, 0.05, loH * 0.92 + 0.25, [0.35, 0.35, 0.38], 4, b);
      }
      // Roof AC / satellite unit.
      if (hh > 0.25) addBox(out, vadd(p.c, p.u, h + 0.3), [w * 0.28, 0.5, d * 0.20], [0.55, 0.56, 0.58], b);
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
      addFrustum(out, vadd(p.c, p.u, -0.6), baseW * 0.5, baseW * 0.335, h + 0.6, opts.col || [0.70, 0.72, 0.75], opts.seg || 8, b);   // base sunk 0.6
      if (opts.cap) addBox(out, vadd(p.c, p.u, h), [baseW * 0.7, baseW * 0.18, baseW * 0.7], opts.capCol || [0.2, 0.2, 0.24], b);
      // Mast stands on the CAP's top face. The cap box is centred at h with
      // height baseW*0.18, so its top is h + baseW*0.09 — using the full 0.18
      // left the mast hanging half a cap-height above it.
      if (opts.mast) addCyl(out, vadd(p.c, p.u, h + (opts.cap ? baseW * 0.09 : 0)), 0.18, opts.mast, [0.3, 0.3, 0.32], 4, b);
      blockAt(k, side, dist - baseW * 0.5, baseW * 0.5);   // solid base
    };
    // Advertising hoarding / billboard: a panel on two slim posts.
    const billboard = (k, side, gap, w, h, col) => {
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], w / 2 + 1)) {
        console.warn(`[scenery] billboard SUPPRESSED at k=${k} side=${side}: gap=${gap} w=${w} (need gap>${(w/2+1).toFixed(1)})`);
        return;
      }
      for (const o of [-w * 0.4, w * 0.4]) addCyl(out, vadd(vadd(p.c, p.t, o), p.u, -0.4), 0.12, h + 0.4, [0.2, 0.2, 0.22], 4, b);   // posts, base sunk
      // Backlit at night: trackside advertising is illuminated at real races —
      // the lifted albedo rides the emissive path so panels glow softly.
      let face = col || [0.9, 0.85, 0.2];
      if (NIGHT) face = [Math.min(1.45, face[0] * 1.30 + 0.10),
                         Math.min(1.45, face[1] * 1.30 + 0.10),
                         Math.min(1.45, face[2] * 1.30 + 0.10)];
      addBox(out, vadd(p.c, p.u, h + 1.6), [0.3, 3.2, w], face, b);
      blockAt(k, side, gap, w * 0.4);   // posts + panel face → stop before it
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
      // Mast height is SOLVED to the beam, not assumed. The masts stand on the
      // verge (anchor(), which sits on the terrain and sinks 0.3) while
      // overheadSpan measures its clearance from the ROAD datum. Where the verge
      // runs below the road — shanghai −1.5 m, zandvoort −1.7 m — a flat `h`
      // leaves each mast over a metre short of the beam it is meant to carry.
      // Solved per leg, since the two verges need not be at the same height.
      const uy = Math.max(0.5, u[1]);
      const legH = (aC) => (h - 0.45) + (py[k] - aC[1]) / uy + 0.3;   // +0.3 into the beam
      addCyl(out, aL.c, 0.3, legH(aL.c), c, 6, b);
      addCyl(out, aR.c, 0.3, legH(aR.c), c, 6, [aR.r, u, aR.t]);
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
    // Bush / shrub clump: 2-3 jittered cones offset around a centre so it reads
    // as an irregular clump of foliage rather than one uniform cone (every bush
    // on every track used to be geometrically identical).
    const bush = (k, side, dist, col) => {
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 2)) {
        console.warn(`[scenery] bush SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      const bc = col || [0.20, 0.38, 0.18];
      const c2 = [bc[0] * 0.90, bc[1] * 0.94, bc[2] * 0.88];
      const jh = hash(k * 4.3 + side * 2.1 + dist);
      const lobes = jh < 0.4 ? 2 : 3;   // most clumps 2-3 lobes, some just 1 big lump
      for (let i = 0; i < lobes; i++) {
        const lh = hash(k * 5.9 + side * 3.3 + dist + i * 1.7);
        const ang = (i / lobes + lh * 0.3) * 6.2832;
        const off = lobes > 1 ? 0.6 + lh * 0.5 : 0;
        const lx = Math.cos(ang) * off, lz = Math.sin(ang) * off;
        const lc = vadd(vadd(p.c, p.r, lx), p.t, lz);
        const rad = (1.1 + lh * 0.9) * (lobes > 1 ? 0.82 : 1.15);
        // lobe base sits BELOW grade (was +0.25..0.45 → visibly hovering); the
        // buried part is occluded, the crown height barely changes.
        addCone(out, vadd(lc, p.u, -0.3 + lh * 0.1), rad, 2.2 + lh * 1.0, i === 0 ? bc : c2, 6, b);
      }
    };

    const bt = BARRIER[def.id] || { a: [0.92, 0.92, 0.94], b: [0.85, 0.18, 0.16], c: [0.55, 0.57, 0.62], night: [0.18, 0.18, 0.22], tyre: [0.24, 0.22, 0.20] };
    const btSeq = [bt.a, bt.b, bt.c];

    // continuous barrier wall hugging both edges on street circuits — going off
    // means hitting a wall, not open grass. Day circuits get the track's armco
    // livery; dark sessions get its tinted night rail.
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
          const col = NIGHT ? bt.night : btSeq[Math.floor(k / (STEP * 3)) % 3];
          addBox(out, [cx, cy + WH / 2, cz], [WT, WH, len], col, [rr, [0, 1, 0], f]);
        }
      }
      // Record the boundary for EVERY node (the geometry loop steps by 2, which
      // would leave gaps), both sides, at the barrier offset.
      const off = def.barrierGap != null ? def.barrierGap : (def.id === "monaco" ? 2.0 : 0.35);
      for (let k = 0; k < n; k++) { markBarrier(k, -1, off); markBarrier(k, 1, off); }
    }
    // floodlights for night tracks: generic mast ring (~22 m) covers these —
    // the old every-70 poles duplicated geometry on Bahrain/Singapore/etc.
    // (kept marker so night tracks still opt into buildTrackLights via def.night)
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
          // Themed conveyor-belt cap: a bright coloured stripe along the top of
          // the tyre stack, giving the city's corner barriers its identity.
          if (BARRIER[def.id]) addBox(out, [px[k] + r[0] * o, py[k] + 0.94, pz[k] + r[2] * o],
                 [1.06, 0.18, slen], bt.tyre, [r, u, t]);
          // record the tyre barrier along its span so the car stops just short of it
          for (let d = 0; d < step; d++) markBarrier((k + d) % n, outside, 2.2);
        }
        // markBarrier only moves the DRIVING limit; it does not tell the scenery
        // engine that a metre-wide stack of tyres physically stands here. These
        // corner barriers were the second-largest obstacle class in the
        // surviving canopy hits, so register the geometry too.
        indexBarrier((((c.k - lo) % n + n) % n) / n, (((c.k + hi) % n + n) % n) / n, outside, 2.2);
      }
    }

    // ── Trackside SIGNAGE: corner-number boards + braking markers + pit speed.
    // Prefer curated FIA turn apexes (def.turns from CircuitMarkings; all 24
    // shipped circuits have a table). Fall back to curvature-peak detection
    // only if a def somehow lacks turns.
    {
      // NOTE: signBoard's `gap` forwards straight to anchor(k,side,gap), which
      // already adds hw[k] internally (dist = "beyond the edge") — passing
      // hw[k]+N here would double-count it and place every board ~2x too far
      // out. Pass the clearance alone, matching every other gap-based call in
      // this file (building/grandstand/marshalPost/…).
      let laneCorners;
      if (def.turns && def.turns.length) {
        laneCorners = def.turns.map((frac) => {
          const k = Math.round((((frac % 1) + 1) % 1) * n) % n;
          const sign = Math.sign(curvature(track, k * ds)) || 1;
          return { k, sign, lo: 14 };
        });
      } else {
        laneCorners = findCorners(track, 0.007).slice().sort((a, b) => a.k - b.k);
      }
      laneCorners.forEach((c, idx) => {
        const outside = c.sign > 0 ? -1 : 1;
        signBoard(c.k, outside, 3.5, "corner", idx + 1);
        // Braking trio (3->2->1 stripes counting down to the apex) on roughly
        // half the corners, spaced back along the approach — avoids clutter on
        // every single bend while still reading as a real trackside kit.
        if (hash(c.k * 3.1 + 7) > 0.5) {
          const lo = Math.max(6, c.lo || 14);
          const offs = [Math.round(lo * 0.85), Math.round(lo * 0.5), Math.round(lo * 0.18)];
          [3, 2, 1].forEach((stripes, si) => {
            const kk = ((c.k - offs[si]) % n + n) % n;
            signBoard(kk, outside, 3.0, "braking", stripes);
          });
        }
      });
      // One pit-entry speed-limit disc near the end of the lap — real
      // speed-limit signage is mostly a pit-lane feature, not scattered
      // trackside, so a single instance per circuit is the honest amount.
      const spk = Math.round(n * 0.965) % n;
      signBoard(spk, -1, 4, "speed", def.street ? 60 : 80);
    }

    const fz = FURN[def.id] || FURN_DEF[theme] || FURN_DEF.green;
    const furnHarbour = (side, k) => def.id === "monaco" && side === 1 && k < n * 0.14;  // open water — no props
    // Per-tree foliage variation: a real forest is never one flat green. Each
    // tree gets a jittered brightness + a warm/cool hue drift, and a small
    // fraction of broadleaf trees turn autumnal gold/rust — so a stand of trees
    // reads as mixed natural foliage rather than identical clones.
    const folVary = (base, seed) => {
      const lift = 0.68 + hash(seed * 3.1) * 0.62;        // WIDE brightness spread (deep shade → bright young)
      const warm = (hash(seed * 7.7) - 0.45) * 0.24;      // stronger yellow-green ↔ blue-green drift
      return [Math.max(0, Math.min(1, base[0] * lift + warm)),
              Math.max(0, Math.min(1, base[1] * lift + warm * 0.3)),
              Math.max(0, Math.min(1, base[2] * lift - warm * 0.7))];
    };
    const plantTree = (k, side, dist, h) => {
      const seed = k * 1.7 + side * 0.9 + dist;
      let col = folVary(fz.fol, seed);
      // Autumn / flowering accent — a gold-rust or amber tree dotted through
      // broadleaf stands (≈22%) so a treeline shows seasonal colour, not one green.
      if (fz.tree === "broad" && hash(seed * 5.5) < 0.22)
        col = [0.60 + hash(seed) * 0.28, 0.34 + hash(seed * 2.1) * 0.22, 0.10 + hash(seed * 3.3) * 0.10];
      // `dist` is the clearance wanted for the canopy's INNER EDGE, matching
      // forestEdge()'s contract — push the TRUNK out by the crown's reach. The
      // scatter used to pass dist straight through as a trunk distance with no
      // canopy allowance, so any tree it dropped within (barrier gap + crown
      // radius) of a catch fence grew straight through it. Suzuka was worst hit:
      // fences cover ~32% of its lap.
      const kind = fz.tree === "palm" ? "palm" : fz.tree === "fir" ? "fir" : "broad";
      const crown = canopyR(kind, h);
      // Spatial barrier guard — the canopy allowance above only clears the
      // barrier belonging to THIS node, and the hits that survived it were with
      // walls belonging to other parts of the lap.
      const d = clearTreeDist(k, side, dist + crown, crown);
      if (d == null) return;
      if (fz.tree === "palm") palm(k, side, d, h, col);
      else if (fz.tree === "fir") conifer(k, side, d, h, col);
      else tree(k, side, d, h, col);
    };
    // Lamp posts — streets / modern / desert. Alternate sides, set behind the
    // barrier line; the head glows HDR at night via streetLamp(). ~12% of posts
    // roll a DIFFERENT head style than the track's base lamp — real circuits mix
    // eras/replacements rather than one uniform style down the whole lap (was
    // every single post on a track using the exact same style).
    const LAMP_STYLES = ["arm", "globe", "post"];
    if (fz.lamp && fz.lamp !== "none") every(26, (k) => {
      for (const side of [-1, 1]) {
        if (furnHarbour(side, k) || dressingExcluded("lamps", k, side)) continue;
        const roll = hash(k * 19 + side * 5.5);
        const style = roll > 0.88
          ? LAMP_STYLES[Math.floor(hash(k * 23 + side) * LAMP_STYLES.length) % LAMP_STYLES.length]
          : fz.lamp;
        streetLamp(k, side, (def.street ? 3.2 : 6) + hash(k * 7 + side) * 0.8, fz.lc || [1, 0.9, 0.7], def.street ? 7 : 8, style);
      }
    });
    // Roadside trees — every circuit, per-track species/tint, set back behind the
    // edge. Forest/green circuits get a denser stand (a cluster of a few trees at
    // staggered depths, each with its own varied colour) so the treeline reads as
    // real mixed woodland; street circuits keep a sparser line.
    // DEFERRED to after def.scenery() — see the call site. plantTree()'s barrier
    // guard queries the world-XZ index, and almost every barrier on a circuit is
    // recorded by the track's own scenery() callback, which has not run yet at
    // this point in the build. Scattering here would query an index holding only
    // the handful of barriers the generic passes registered, and re-introduce
    // exactly the crowns-through-fences the guard exists to prevent.
    const plantRoadsideTrees = () => {
    if (fz.tree && fz.tree !== "none") {
      const step = fz.sparse ? 30 : (def.street ? 24 : 18);   // street denser than before; sparse = coastal scrub
      every(step, (k) => {
        const side = hash(k * 41) < 0.5 ? -1 : 1;
        if (furnHarbour(side, k) || dressingExcluded("foliage", k, side)) return;
        const baseH = fz.tree === "palm" ? 8 : 6;
        const cluster = fz.sparse ? 1
          : def.street ? (hash(k * 13) < 0.5 ? 1 : 2)              // streets: 1–2 per stand
          : 2 + Math.floor(hash(k * 13) * 2);                      // green: 2–3 per stand
        for (let i = 0; i < cluster; i++) {
          const dist = (def.street ? 6 : 8) + hash(k * 3 + side + i * 4.4) * (def.street ? 4 : 14);
          plantTree(k + (i % 2) - (i > 1 ? 1 : 0), side, dist, baseH + hash(k * 5 + i * 2.7) * 6);
        }
      });
    }
    };

    // marshal post + signal board every 270 m on alternating sides (skip street circuits with continuous barriers)
    if (!def.street) {
      every(270, (k) => {
        const side = hash(k * 7) < 0.5 ? -1 : 1;
        place(k, side, 25, [0.55, 1.3, 0.55], [0.95, 0.55, 0.08]);
        place(k, side, 25, [1.2, 0.75, 0.08], [0.95, 0.95, 0.97]);
      });
    }

    if (theme === "green") {
      // FURN already plants real trees; legacy box trunk/canopy forest removed.
      // occasional grandstand
      every(140, (k) => place(k, hash(k) < 0.5 ? -1 : 1, 14, [4, 6, 22], [0.5, 0.5, 0.55]));
    } else if (theme === "desert") {
      every(34, (k) => { for (const side of [-1, 1]) if (hash(k + side) > 0.6) place(k, side, 8 + hash(k) * 10, [2 + hash(k) * 3, 1.5, 2], [0.62, 0.5, 0.34]); });
    } else if (theme === "street_day" || theme === "street_night" || theme === "modern") {
      const style = STYLES[def.id] || THEME_DEF[theme] || THEME_DEF.modern;
      const cn = (k, s) => style.neon[Math.floor(hash(k * 3 + s) * style.neon.length) % style.neon.length];
      // Per-building tone: keeps the track's single dark NIGHT tone, but picks a
      // VARIED daytime facade colour from the style's dayPal so the city in
      // daylight is a mix of stone/cream/terracotta/glass instead of flat grey.
      const dpal = style.dayPal;
      const toneFor = (k, s) => {
        if (!(dpal && dpal.length)) return { n: style.tone && style.tone.n, d: style.tone && style.tone.d };
        // Cluster adjacent buildings into short colour RUNS (floor(k/…)) and bias
        // the pick toward the palette's leading entries (cl²) so each track reads
        // as a cohesive place with a signature material plus a few accents,
        // rather than every building a different random colour.
        const cl = hash(Math.floor(k / 2.4) * 2.3 + s * 4.2);
        const idx = Math.floor(cl * cl * dpal.length) % dpal.length;
        return { n: style.tone && style.tone.n, d: dpal[idx] };
      };
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
          if (hash(k * 17 + side * 4) < 0.12 || harbourSkip(side, k) || dressingExcluded("city", k, side)) continue;
          const s = hash(k * 5 + side), na = naFor(k, side);
          const h = style.fh[0] + s * style.fh[1], w = 8 + s * 10, d = 8 + hash(k * 9 + side) * 9;
          neonTower(k, side, 13 + s * 12, w, h, d, cn(k, side), pickKind(k, side, na), toneFor(k, side), na);
        }
      });
      // Back row — taller, set further back, staggered, for skyline depth.
      every(26, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 23 + side * 7) < 0.34 || harbourSkip(side, k) || dressingExcluded("city", k, side)) continue;
          const s = hash(k * 11 + side * 2), na = naFor(k * 1.3, side);
          const h = style.bh[0] + s * style.bh[1], w = 11 + s * 12, d = 11 + s * 10;
          neonTower(k, side, 40 + s * 30, w, h, d, cn(k * 1.7, side), pickKind(k * 1.9, side, na), toneFor(k * 1.7, side), na);
        }
      });
      // Sign blades + low retail boxes dressing the gaps.
      every(34, (k) => {
        const side = hash(k * 13) < 0.5 ? -1 : 1;
        if (harbourSkip(side, k) || dressingExcluded("city", k, side)) return;
        const lc = cn(k * 3.3, side);
        if (NIGHT && style.bias > 0.3 && hash(k * 19) < 0.5) neonSign(k, side, 8 + hash(k) * 4, 10 + hash(k * 2) * 10, lc);
        else { const rc = toneFor(k * 2.7, side).d || [0.5, 0.5, 0.54]; place(k, side, 9, [9, 4 + hash(k) * 3, 7], NIGHT ? [0.13, 0.13, 0.16] : rc); place(k, side, 9, [9.3, 1.0, 7.3], NIGHT ? lc : [lc[0] * 0.4 + 0.3, lc[1] * 0.4 + 0.3, lc[2] * 0.4 + 0.3]); }
      });
      // Occasional illuminated billboard accent (more on high-neon circuits).
      if (style.bias > 0.25) every(80, (k) => {
        const side = hash(k * 31) < 0.5 ? -1 : 1;
        if (harbourSkip(side, k) || dressingExcluded("city", k, side)) return;
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
      crowdBank(k, -1, 8, 16, 7, 4.2,                        // speckled tiered crowd
                [crowd[0] * 0.4, crowd[1] * 0.4, crowd[2] * 0.4]);
      place(k, 1, 12, [7, 5.5, 16], [0.83, 0.83, 0.86]);    // pit building
      // Pit complex window bands: two glowing glass strips on the track-facing
      // face after dark — garages work through the night at a race meeting.
      if (NIGHT) {
        const pa = anchor(k, 1, 8.35), pb = [pa.r, pa.u, pa.t];
        addBox(out, vadd(pa.c, pa.u, 2.0), [0.14, 1.3, 13], [1.34, 1.24, 0.96], pb);
        addBox(out, vadd(pa.c, pa.u, 3.9), [0.14, 0.9, 13], [1.10, 1.14, 1.22], pb);
      }
    }

    // ── Shared scenery toolkit (identity pass) ──────────────────────────────
    // Cross-track composite helpers. Footprints that must stay OFF the racing
    // line use rejBox / full-box tests. Overhead decks that cars intentionally
    // pass under (gantry beam, underpass slab, sail/gridshell spanning the
    // track) emit via RAW.addBox so the guarded wrappers do not cull them.

    // Dark overhead portal: slab spanning the track + support piers off-edge.
    // opts: { h, thick, col, pierGap, pierW, depth }
    const underpassPortal = (s, opts) => {
      opts = opts || {};
      const k = Math.round(s * n) % n;
      const clearH = opts.h != null ? opts.h : 5.5;
      const thick = opts.thick != null ? opts.thick : 1.4;
      const col = opts.col || [0.10, 0.10, 0.12];
      const pierGap = opts.pierGap != null ? opts.pierGap : 1.4;
      const pierW = opts.pierW != null ? opts.pierW : 1.6;
      const depth = opts.depth != null ? opts.depth : 14;
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const b = [r, u, t];
      // Piers sit beyond the road edge — full-footprint guard (not single-point).
      for (const side of [-1, 1]) {
        const a = anchor(k, side, pierGap + pierW / 2);
        const pierSz = [pierW, clearH + thick * 0.5, depth * 0.55];
        if (rejBox(a.c, pierSz, [a.r, a.u, a.t])) {
          console.warn(`[scenery] underpassPortal pier SUPPRESSED at s=${s} side=${side}`);
          continue;
        }
        addBox(out, vadd(a.c, a.u, pierSz[1] / 2), pierSz, col, [a.r, a.u, a.t]);
        blockAt(k, side, pierGap, depth * 0.25);
      }
      // Overhead slab intentionally spans tarmac (cars pass under) → RAW.
      const span = hw[k] * 2 + (pierGap + pierW) * 2 + 1.5;
      const slabC = [px[k] + u[0] * (clearH + thick / 2),
                     py[k] + u[1] * (clearH + thick / 2),
                     pz[k] + u[2] * (clearH + thick / 2)];
      overheadSpan({
        id: `underpass-${k}`, frac: s, clearance: clearH,
        thickness: thick, depth, span, color: col,
      });
      // Underside soffit — slightly lighter so the portal mouth reads.
      const soff = [Math.min(1, col[0] * 1.35 + 0.04), Math.min(1, col[1] * 1.35 + 0.04), Math.min(1, col[2] * 1.4 + 0.05)];
      RAW.addBox(out, [px[k] + u[0] * (clearH + 0.12), py[k] + u[1] * (clearH + 0.12), pz[k] + u[2] * (clearH + 0.12)],
                 [span * 0.96, 0.18, depth * 0.92], soff, b);
    };

    // Tall dual-arm cool-white flood mast + optional ground pool.
    // dist = metres beyond road edge (mast centre). opts: { h, cool, pool, arms }
    const floodMast = (k, side, dist, opts) => {
      opts = opts || {};
      const h = opts.h != null ? opts.h : 36;
      const cool = opts.cool !== false;
      const pool = opts.pool !== false;
      const arms = opts.arms != null ? opts.arms : 2;
      const poleCol = [0.14, 0.14, 0.17];
      const lens = cool
        ? (NIGHT ? [1.22, 1.28, 1.40] : [0.96, 1.00, 1.06])
        : (NIGHT ? [1.30, 1.18, 0.88] : [1.02, 0.96, 0.82]);
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const foot = [2.8, h, 2.8];
      if (rejBox(a.c, foot, b)) {
        console.warn(`[scenery] floodMast SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      addCyl(out, a.c, 0.45, h, poleCol, 6, b);
      const top = vadd(a.c, a.u, h);
      // Dual (or multi) arms reaching toward the track (−side along r).
      for (let i = 0; i < arms; i++) {
        const along = (i - (arms - 1) / 2) * 1.8;
        const arm = vadd(vadd(top, a.t, along), a.r, -side * 1.6);
        addBox(out, arm, [3.4, 0.35, 0.55], poleCol, b);
        addBox(out, vadd(arm, a.r, -side * 1.3), [1.6, 0.55, 1.1], lens, b);
      }
      // Crossbar / bank housing
      addBox(out, top, [1.2, 0.9, arms * 1.9 + 0.6], [0.22, 0.22, 0.26], b);
      if (pool) {
        const poolCol = cool ? [0.72, 0.78, 0.88] : [0.82, 0.78, 0.62];
        addBox(out, vadd(a.c, a.u, 0.10), [7.5, 0.18, 7.5], poolCol, b);
      }
      blockAt(k, side, dist - 0.6, 2);
    };

    // Ring of flood masts both sides every ~stepM metres. opts forwarded to floodMast;
    // opts.dist defaults to 14 (beyond edge).
    const floodMastRing = (stepM, opts) => {
      opts = opts || {};
      const dist = opts.dist != null ? opts.dist : 14;
      every(stepM || 55, (k) => {
        floodMast(k, -1, dist, opts);
        floodMast(k, 1, dist, opts);
      });
    };

    // Stacked emissive colour bands on a vertical shaft (Flame Towers / Sphere).
    // c = world centre of base, h = total height. opts: { r, bands, cols, seg, basis }
    const ledFacadeBands = (c, h, opts) => {
      opts = opts || {};
      const r0 = opts.r != null ? opts.r : 8;
      const bands = opts.bands != null ? opts.bands : 10;
      const cols = opts.cols || [[1.4, 0.35, 0.08], [1.5, 0.55, 0.12], [1.2, 0.18, 0.05], [1.6, 0.85, 0.20]];
      const seg = opts.seg != null ? opts.seg : 8;
      const basis = opts.basis || null;
      const bh = h / bands;
      // Guard widest frustum footprint once — if base covers track, skip all bands.
      if (rejRad(c, r0, h, basis)) {
        console.warn(`[scenery] ledFacadeBands SUPPRESSED at [${c[0]|0},${c[2]|0}]`);
        return;
      }
      for (let i = 0; i < bands; i++) {
        const t = i / Math.max(1, bands - 1);
        const rB = r0 * (1 - t * 0.55);
        const rT = r0 * (1 - (t + 1 / bands) * 0.55);
        const col = cols[i % cols.length];
        const mid = [c[0], c[1] + (i + 0.5) * bh, c[2]];
        addFrustum(out, mid, rB, Math.max(0.4, rT), bh * 0.92, col, seg, basis);
      }
    };

    // Pale grey Jersey / canyon wall with optional accent stripe boxes.
    // opts: { h, thick, col, stripeCol, stripeH, stripeEvery }
    const concreteCanyon = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const h = opts.h != null ? opts.h : 2.4;
      const thick = opts.thick != null ? opts.thick : 0.55;
      const col = opts.col || [0.72, 0.73, 0.76];
      const stripeCol = opts.stripeCol || null;
      const stripeH = opts.stripeH != null ? opts.stripeH : 0.35;
      const stripeEvery = opts.stripeEvery != null ? opts.stripeEvery : 2;
      recordBarrier(s0, s1, side, gap);
      let stripeI = 0;
      along(s0, s1, 5.5, (k, spacing) => {
        const p = anchor(k, side, gap);
        const sz = [thick, h, spacing];
        if (rejBox(p.c, sz, [p.r, p.u, p.t])) {
          console.warn(`[scenery] concreteCanyon SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addBox(out, vadd(p.c, p.u, h / 2), sz, col, [p.r, p.u, p.t]);
        if (stripeCol && (stripeI++ % stripeEvery === 0)) {
          addBox(out, vadd(p.c, p.u, h * 0.55), [thick + 0.08, stripeH, spacing * 0.55], stripeCol, [p.r, p.u, p.t]);
        }
      });
    };

    // Disc / ellipse sail canopy at world centre c with basis [r,u,t].
    // opts: { rad, h, col, ribs, thick } — ribs are radial struts under a thin disc.
    const sailCanopy = (c, basis, opts) => {
      opts = opts || {};
      const rad = opts.rad != null ? opts.rad : 18;
      const lift = opts.h != null ? opts.h : 14;
      const col = opts.col || [0.92, 0.90, 0.84];
      const ribs = opts.ribs != null ? opts.ribs : 8;
      const thick = opts.thick != null ? opts.thick : 0.55;
      const b = basis || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const u = b[1], r = b[0], f = b[2];
      // Mast / hub under sail — guard footprint so the support never sits on tarmac.
      const hub = [c[0], c[1], c[2]];
      if (rejBox(hub, [3.5, lift, 3.5], b)) {
        console.warn(`[scenery] sailCanopy SUPPRESSED at [${c[0]|0},${c[2]|0}]`);
        return;
      }
      addCyl(out, hub, 0.55, lift, [0.28, 0.28, 0.32], 6, b);
      const crown = vadd(hub, u, lift);
      // Sail disc as a flat wide box (ellipse approximated by axis sizes).
      const rx = opts.rx != null ? opts.rx : rad;
      const rz = opts.rz != null ? opts.rz : rad * 0.72;
      // If the sail itself covers tarmac, still draw it via RAW (overhead veil).
      const sailC = vadd(crown, u, thick / 2);
      if (rejBox(sailC, [rx * 2, thick, rz * 2], b)) {
        RAW.addBox(out, sailC, [rx * 2, thick, rz * 2], col, b);
      } else {
        addBox(out, sailC, [rx * 2, thick, rz * 2], col, b);
      }
      for (let i = 0; i < ribs; i++) {
        const a = (i / ribs) * Math.PI * 2;
        const ox = Math.cos(a) * rx * 0.85, oz = Math.sin(a) * rz * 0.85;
        const tip = vadd(vadd(crown, r, ox), f, oz);
        const mid = [(crown[0] + tip[0]) / 2, (crown[1] + tip[1]) / 2 - 0.4, (crown[2] + tip[2]) / 2];
        addBox(out, mid, [0.22, 0.22, Math.hypot(ox, oz) || 1], [0.35, 0.35, 0.40], b);
      }
    };

    // LED lattice veil / gridshell canopy — arched node lattice over a span.
    // opts: { w, depth, h, cols, rows, ledCols, strutCol }
    const gridshellCanopy = (c, basis, opts) => {
      opts = opts || {};
      const w = opts.w != null ? opts.w : 40;
      const depth = opts.depth != null ? opts.depth : 28;
      const peakH = opts.h != null ? opts.h : 22;
      const cols = opts.cols != null ? opts.cols : 7;
      const rows = opts.rows != null ? opts.rows : 5;
      const ledCols = opts.ledCols || [[0.2, 1.1, 1.2], [1.2, 0.25, 0.7], [1.1, 0.85, 0.25]];
      const strutCol = opts.strutCol || [0.08, 0.09, 0.12];
      const b = basis || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const r = b[0], u = b[1], f = b[2];
      // Support feet at the four corners — full-box guard.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const foot = vadd(vadd(c, r, sx * w * 0.42), f, sz * depth * 0.42);
        if (rejBox(foot, [2.2, peakH * 0.4, 2.2], b)) {
          console.warn(`[scenery] gridshellCanopy foot SUPPRESSED`);
          return;
        }
        addCyl(out, foot, 0.5, peakH * 0.45, strutCol, 5, b);
      }
      for (let j = 0; j <= rows; j++) {
        const zt = j / rows - 0.5;
        let prev = null;
        for (let i = 0; i <= cols; i++) {
          const xt = i / cols - 0.5;
          const arch = Math.cos(xt * Math.PI) * 0.55 + 0.45;   // peak at centre
          const lift = peakH * arch * (0.75 + 0.25 * Math.cos(zt * Math.PI));
          const node = vadd(vadd(vadd(c, u, lift), r, xt * w), f, zt * depth);
          const col = ledCols[(i + j) % ledCols.length];
          // Lattice nodes may overhang the track — RAW when footprint hits tarmac.
          if (rejBox(node, [2.2, 1.2, 2.0], b)) RAW.addBox(out, node, [2.2, 1.2, 2.0], col, b);
          else addBox(out, node, [2.2, 1.2, 2.0], col, b);
          if (prev) {
            const mid = [(prev[0] + node[0]) / 2, (prev[1] + node[1]) / 2, (prev[2] + node[2]) / 2];
            const span = Math.hypot(node[0] - prev[0], node[1] - prev[1], node[2] - prev[2]) || 1;
            if (rejBox(mid, [0.35, 0.35, span], b)) RAW.addBox(out, mid, [0.35, 0.35, span], strutCol, b);
            else addBox(out, mid, [0.35, 0.35, span], strutCol, b);
          }
          prev = node;
        }
      }
    };

    // Wide low asphalt/gravel apron beyond the verge.
    // sz = [depth, thick, length] or number depth with default length.
    const runoffApron = (k, side, gap, sz, col) => {
      let depth, thick, len;
      if (Array.isArray(sz)) { depth = sz[0]; thick = sz[1] != null ? sz[1] : 0.35; len = sz[2] != null ? sz[2] : 24; }
      else { depth = sz || 18; thick = 0.35; len = 24; }
      const dist = gap + depth / 2;
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const box = [depth, thick, len];
      if (rejBox(a.c, box, b)) {
        console.warn(`[scenery] runoffApron SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
        return;
      }
      addBox(out, vadd(a.c, a.u, thick / 2), box, col || [0.42, 0.40, 0.38], b);
    };

    // Tilted red/white kerb ribbon + optional SAFER-style outer rail (Zandvoort bowls).
    // Track basis already banks with the road, so boxes read the bank tilt.
    // opts: { saferGap, safer, step, saferStep, kerbRed, kerbWht, saferCol }
    const bankedKerbStrip = (s0, s1, side, opts) => {
      opts = opts || {};
      const kerbRed = opts.kerbRed || [0.86, 0.12, 0.14];
      const kerbWht = opts.kerbWht || [0.94, 0.94, 0.92];
      const saferCol = opts.saferCol || [0.76, 0.78, 0.80];
      const saferGap = opts.saferGap != null ? opts.saferGap : 7.0;
      const doSafer = opts.safer !== false;
      let stripe = 0;
      along(s0, s1, opts.step || 3.2, (k, spacing) => {
        const col = (stripe++ & 1) ? kerbWht : kerbRed;
        const a = anchor(k, side, 1.35);
        if (onTrack(a.c[0], a.c[2], 1.1)) return;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.16), [1.05, 0.26, spacing * 0.90], col, b);
        addBox(out, vadd(vadd(a.c, a.r, side * 0.38), a.u, 0.30),
               [0.32, 0.42, spacing * 0.90], col, b);
      });
      if (!doSafer) return;
      along(s0, s1, opts.saferStep || 4.0, (k, spacing) => {
        const a = anchor(k, side, saferGap);
        if (onTrack(a.c[0], a.c[2], 1.4)) return;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.55), [0.58, 1.10, spacing * 0.94], saferCol, b);
        addBox(out, vadd(a.c, a.u, 1.14), [0.62, 0.12, spacing * 0.94], kerbRed, b);
        addCyl(out, vadd(a.c, a.r, side * 0.42), 0.10, 1.25,
               [0.34, 0.34, 0.37], 5, b);
      });
    };

    // Continuous eye-height seat/crowd wall (Foro Sol / baseball-bowl enclosure).
    // opts: { h, thick, shell, step, crowdCols }
    const bowlSeatWall = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const h = opts.h != null ? opts.h : 5.8;
      const thick = opts.thick != null ? opts.thick : 3.4;
      const shell = opts.shell || [0.55, 0.54, 0.56];
      const crowdCols = opts.crowdCols || [
        [0.92, 0.28, 0.55], [0.95, 0.45, 0.12], [0.18, 0.72, 0.42],
        [0.98, 0.82, 0.10], [0.94, 0.94, 0.92], [0.22, 0.42, 0.78], [0.90, 0.30, 0.24],
      ];
      along(s0, s1, opts.step || 7, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], thick / 2 + 2)) return;
        const bv = [p.r, p.u, p.t];
        addBox(out, vadd(p.c, p.u, h * 0.48), [thick, h * 0.95, spacing * 0.94], shell, bv);
        addBox(out, vadd(vadd(p.c, p.u, h * 0.55), p.r, -side * (thick * 0.38)),
               [0.55, h * 0.72, spacing * 0.88],
               crowdCols[Math.floor(hash(k * 11 + side) * crowdCols.length) % crowdCols.length], bv);
      });
    };

    // Sparse cream/ochre Med apartment boxes (Monaco canyon).
    // opts: { palette, minH, maxH, depth, step, lit, windowCol, window, floor }
    const pastelStreetRow = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const pal = opts.palette || [[0.92, 0.86, 0.72], [0.86, 0.72, 0.48]];
      const minH = opts.minH != null ? opts.minH : 12;
      const maxH = opts.maxH != null ? opts.maxH : 22;
      const depth = opts.depth != null ? opts.depth : 10;
      const step = opts.step != null ? opts.step : 40;
      const win = opts.window || [0.35, 0.42, 0.52];
      along(s0, s1, step, (k) => {
        const hv = hash(k * 5.3 + side * 0.9);
        const w = 10 + hv * 8;
        const h = minH + hash(k * 9.1 + side) * (maxH - minH);
        const g = gap + hash(k * 2.7) * 1.5;
        building(k, side, g, w, h, depth,
          { wall: pal[Math.floor(hash(k * 3.1) * pal.length) % pal.length],
            window: win, floor: opts.floor != null ? opts.floor : (3.5 + hv),
            lit: opts.lit !== false, windowCol: opts.windowCol || [0.95, 0.88, 0.55] });
      });
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
    
    

    // Per-circuit bespoke scenery lives in js/tracks/<id>.js (def.scenery).
    if (def.scenery) {
      let sceneryApi = {
        out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin,
        // Session darkness (chosen time of day) — lets bespoke scenery render a lit
        // night version vs a daytime version of the same structure.
        night: NIGHT,
        // Procedural surface-material ids (js/glx.js applyMaterial/applyMaterialNormal).
        // Tag a block of geometry by setting out._mat = MAT.<NAME> before the add*()
        // calls that should carry it, then out._mat = 0 (MAT.FLAT) to stop. Applies to
        // BOTH the day/night colour tint AND a real light-catching bump — no images,
        // no UVs. See docs/SCENERY-API.md.
        MAT,
        // Named atmosphere / colour packs (js/track-scenery-data.js)
        ATM, COL,
        place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack,
        modelGroup, overheadSpan, waterSurface, waterField, groundPatch, groundedSegments,
        seat, foundation, cantilever,
        // Resolved data and opt-in architectural/facility helpers. Merely binding
        // these does not emit geometry; each circuit remains responsible for calls.
        sceneryTheme, landmarkKit, circuitKit,
        modelDiagnostics: diagnostics,
        ferrisWheel, hash, upOf, cross, norm, lerp, vadd,
        // richer primitives (world coords): non-cube shapes
        addPrism, addPyramid, addCone, addCyl, addFrustum, addMountain, anchor, along,
        // landscape + vegetation
        pine, tree, palm, bush, hedge, peak, mountain, ridge, forestEdge, conifer,
        // structures
        building, house, motorhome, tower, grandstand, billboard, gantry, marshalPost, cityFront,
        // shared identity-pass toolkit
        underpassPortal, floodMast, floodMastRing, ledFacadeBands,
        concreteCanyon, sailCanopy, gridshellCanopy, runoffApron,
        bankedKerbStrip, bowlSeatWall, pastelStreetRow,
        // signage
        signBoard,
        // barriers / track furniture
        wall, fence, guardrail, tyreWall, recordBarrier,
      };
      // Reversed lap: flip the s-fraction (s → 1-s), node index (k → n-k) and
      // side (±1 → ∓1) of every placement helper so bespoke scenery authored for
      // the original direction lands at the correct physical spot and side. This
      // keeps barriers (recordBarrier fills barR/barL) aligned with the road.
      // Direct px[k]/upOf(k) reads inside scenery (a handful, cosmetic only) are
      // not remapped — they stay internally consistent on the reversed centreline.
      if (def.reverse || def.sceneryCoordinates === "source")
        sceneryApi = transformSceneryApi(sceneryApi, def, n);
      def.scenery(sceneryApi);
    }

    // Foliage runs LAST, once every barrier on the circuit is registered, so the
    // world-XZ guard in clearTreeDist() sees the finished set: the per-track
    // treelines queued by forestEdge() during scenery, then the generic roadside
    // scatter deferred out of the FURN pass above.
    for (const a of deferredFoliage) forestEdgeNow.apply(null, a);
    plantRoadsideTrees();

    // Generic floodlight masts — EVERY circuit gets them (visible day and night).
    // Co-located with the point lights (game.js buildTrackLights uses the same
    // 22 m stride, hw+6 offset and side parity) so each light pool reads as cast
    // by a real mast. Street/modern circuits get slim lamp posts with an arm over
    // the track; open circuits get tall floodlight banks. The lens uses a bright
    // albedo so the prop-emissive (ramped up as the sun drops) makes it glow at
    // night. Theme tints the lens warm (desert) / cool (street/modern) / neutral.
    {
      const stTheme = theme === "street_night" || theme === "street_day" || theme === "modern";
      const mastH = stTheme ? 9 : 13;
      const poleCol = [0.16, 0.16, 0.19];
      const mstride = Math.max(1, Math.round(22 / ds));   // matches buildTrackLights stride in lighting.js
      let mi = 0;
      // ── LAMP KIND — decided HERE, once, per post (single source of truth) ──
      // The visible lens albedo and the point light buildTrackLights emits (colour, cone,
      // energy, volumetric weight, glare) all key off this kind, so the fixture
      // you see always matches the light it casts. Authentic CCT spread:
      // sodium 2100K / halogen 3000K / metal-halide 4300K / LED 5000K /
      // heritage globe 2700K / broadcast flood bank 5700K / orange work lamp.
      // Night lens albedos are HDR-ish (>1) so brighter kinds bloom bigger via
      // the emissive path; day albedos stay ≤~1.05 so sun doesn't blow them out.
      const LENS_NIGHT = {
        flood_bank: [1.30, 1.33, 1.40], halide: [1.10, 1.20, 1.18],
        sodium:     [1.32, 0.86, 0.42], halogen: [1.26, 1.06, 0.62],
        led:        [1.16, 1.24, 1.36], globe:   [1.28, 1.00, 0.58],
        work:       [1.12, 0.78, 0.40], fluor:   [1.06, 1.22, 1.02],
      };
      const LENS_DAY = {
        flood_bank: [1.00, 1.01, 1.04], halide: [0.94, 0.99, 0.98],
        sodium:     [1.04, 0.88, 0.62], halogen: [1.02, 0.94, 0.72],
        led:        [0.96, 1.00, 1.05], globe:   [1.04, 0.94, 0.70],
        work:       [0.98, 0.82, 0.58], fluor:   [0.92, 1.00, 0.90],
      };
      // Heritage-globe streets (Monaco, Baku) run globes; other cities mix
      // sodium/LED/halogen; open circuits mix metal-halide/halogen/sodium with
      // the odd work lamp; the pit straight is always broadcast flood banks.
      const globeStreet = fz.lamp === "globe";
      const pickKind = (k, roll) => {
        const frac = k / n;
        if (frac < 0.045 || frac > 0.985) return "flood_bank";
        if (stTheme) {
          if (globeStreet && roll < 0.55) return "globe";
          // Modern venues mix in cool-greenish fluorescent service lighting.
          if (theme === "modern" && roll >= 0.70 && roll < 0.88) return "fluor";
          return roll < 0.42 ? "sodium" : roll < 0.72 ? "led" : "halogen";
        }
        if (roll < 0.07) return "work";
        return roll < 0.50 ? "halide" : roll < 0.78 ? "halogen" : "sodium";
      };
      // Export the EXACT world position + kind of every visible lens so game.js
      // buildTrackLights emits its point light from the real fixture — glare
      // halo, specular streak and volumetric beam all anchor to geometry.
      // onTrack-suppressed masts are simply absent, so no light without a mast.
      track.lampPosts = [];
      for (let k = 0; k < n; k += mstride, mi++) {
        const side = (mi % 2 === 0) ? 1 : -1;
        if (dressingExcluded("floodlights", k, side)) continue;
        const a = anchor(k, side, 6);
        if (onTrack(a.c[0], a.c[2], 1.2)) continue;
        const kind = pickKind(k, hash(mi * 13.7 + 3.1));
        const lensCol = (NIGHT ? LENS_NIGHT : LENS_DAY)[kind];
        const b = [a.r, a.u, a.t];
        // Radius bumped 0.17->0.26: at the shadow map's default texel density
        // (~0.03-0.09m/texel across the 32-96m SHADOW DISTANCE range) a 0.34m
        // pole was only ~3.6-11 texels wide — thin enough that its shadow
        // silhouette pops in/out as it crosses texel boundaries while driving
        // past, and masts repeat every ~22m (buildTrackLights' stride), so the
        // aliasing reads as a regular "picket fence" of stripes sweeping toward
        // the camera. Widening the footprint (~1.5x) reduces how often a
        // texel-boundary crossing flips the whole silhouette; the visible pole
        // is only modestly thicker (barely perceptible at driving distance).
        // Does not fully eliminate thin-caster aliasing — a proper fix would
        // need a separate, shadow-only fatter proxy mesh.
        addCyl(out, a.c, 0.26, mastH, poleCol, 6, b);
        const top = vadd(a.c, a.u, mastH);
        let lens;
        if (kind === "globe") {
          // Heritage twin-globe head: two glowing spheres on a short crossbar.
          addBox(out, top, [1.6, 0.16, 0.3], poleCol, b);
          for (const e of [-1, 1])
            addBox(out, vadd(vadd(top, a.r, -side * 0.2 + e * 0.55), a.u, 0.28), [0.55, 0.6, 0.55], lensCol, b);
          lens = vadd(vadd(top, a.r, -side * 0.2), a.u, 0.28);
        } else if (stTheme) {
          const arm = vadd(top, a.r, -side * 1.0);
          addBox(out, arm, [2.0, 0.26, 0.45], poleCol, b);
          lens = vadd(arm, a.r, -side * 0.85);
          addBox(out, lens, [0.9, 0.42, 0.66], lensCol, b);
        } else {
          addBox(out, top, [2.6, 1.0, 1.2], [0.70, 0.70, 0.74], b);
          lens = vadd(top, a.r, -side * 0.7);
          addBox(out, lens, [2.2, 0.8, 0.4], lensCol, b);
        }
        track.lampPosts.push({ k, side, x: lens[0], y: lens[1], z: lens[2], kind });
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
    return { out, glass: glassBuf, water: waterBuf };
  }

  function buildGate(track) {
    const out = { pos: [], nrm: [], col: [], idx: [] };
    // Always-on red-leg start/finish arch (drawn every circuit). Per-track
    // gantry() calls are separate scenery — both can coexist at the line.
    // Sit the gate ~15 m BEFORE the start/finish along the lap centreline —
    // NOT along node-0's tangent chord. On a curved pit straight the chord
    // drifts off the racing line (COTA/Shanghai/Jeddah were 4–8 m sideways,
    // planting one red leg on the asphalt).
    const backDist = 15;
    const tmp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
    sample(track, track.total - backDist, tmp);
    const r = norm(tmp.r), t = norm(tmp.t), u = norm(cross(r, t));
    const w = tmp.hw;
    const gateX = tmp.p[0], gateY = tmp.p[1], gateZ = tmp.p[2];
    const basis = [r, u, t];
    for (const side of [-1, 1]) {
      const o = side * (w + 1.5);
      // Legs sit on the road plane (u-up from the sampled centreline).
      addBox(out,
        [gateX + r[0] * o + u[0] * 3, gateY + r[1] * o + u[1] * 3, gateZ + r[2] * o + u[2] * 3],
        [1, 6, 1], [0.85, 0.1, 0.1], basis);
    }
    addBox(out,
      [gateX + u[0] * 6.2, gateY + u[1] * 6.2, gateZ + u[2] * 6.2],
      [w * 2 + 4, 0.8, 1.2], [0.1, 0.1, 0.12], basis);
    addBox(out,
      [gateX + u[0] * 6.8, gateY + u[1] * 6.8, gateZ + u[2] * 6.8],
      [w * 1.4, 0.6, 0.6], [0.95, 0.95, 0.97], basis);
    return out;
  }

  // Chequered start/finish line: a grid of black/white squares laid as a thin
  // decal across the road at s=0, sitting a hair above the asphalt and following
  // the local road basis (so it banks/slopes with the surface).
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
    // Tracks historically authored fogColor; runtime reads fog.
    if (o && o.fogColor && o.fog == null) p.fog = o.fogColor;
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
    if (o && o.fogColor && o.fog == null) p.fog = o.fogColor;
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

  // Overlay half-width zones onto control points (CircuitPaths traces ignore segs
  // `w:` — this is how Castle Section / hairpin squeezes land on real layouts).
  // zones: [{ s0, s1, hw, ease? }] — s0→s1 may wrap (s1 < s0). Soft edges via ease
  // (lap fraction, default 0.025). Multiple zones: lowest hw wins at each node.
  function applyHwZones(pts, zones, baseHW) {
    if (!zones || !zones.length || !pts || !pts.length) return;
    const N = pts.length;
    const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const weightAt = (s, s0, s1, ease) => {
      // Normalise into [0,1) coverage along the zone, with eased shoulders.
      const wrap = s1 < s0;
      const inside = wrap ? (s >= s0 || s <= s1) : (s >= s0 && s <= s1);
      if (inside) return 1;
      // distance to nearest zone edge (shortest arc)
      const dEdge = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
      const d0 = dEdge(s, s0), d1 = dEdge(s, s1);
      const d = Math.min(d0, d1);
      if (d >= ease) return 0;
      return smooth(1 - d / ease);
    };
    for (let i = 0; i < N; i++) {
      const s = i / N;
      let hw = pts[i][3];
      let best = hw;
      for (let z = 0; z < zones.length; z++) {
        const zn = zones[z];
        if (zn.hw == null || zn.s0 == null || zn.s1 == null) continue;
        const ease = zn.ease != null ? zn.ease : 0.025;
        const w = weightAt(s, zn.s0, zn.s1, ease);
        if (w <= 0) continue;
        const blended = baseHW + (zn.hw - baseHW) * w;
        if (blended < best) best = blended;
      }
      pts[i][3] = best;
    }
  }

  const LIST = DEFS.map((d) => {
    const def = {
      id: d.id, name: d.name, gp: d.gp, country: d.country, laps: 3,
      night: d.night, theme: d.theme, lengthKm: d.lengthKm,
      palette: (d.night ? nightPal : dayPal)(d.pal || {}),
      street: !!d.street, banked: !!d.banked, bankZones: d.bankZones || null, bridges: d.bridges || null,
      barrierGap: d.barrierGap || null,
      terrainOuter: d.terrainOuter,
      flatTerrain: !!d.flatTerrain,
      sceneryCoordinates: d.sceneryCoordinates || "legacy",
      dressingExclusions: d.dressingExclusions || null,
      // bespoke per-circuit scenery (js/tracks/<id>.js); run by buildProps
      scenery: d.scenery || null,
      // surveyed elevation (if js/circuit-elevations.js is loaded) is baked into
      // the points below and supersedes the authored cosine bumps.
      elevations: hasRealElevation(d.id) ? null : (d.elevations || null),
      // Half-width overlays for CircuitPaths traces (segs `w:` is ignored there).
      hwZones: d.hwZones || null,
      reverse: !!d.reverse,
      startFrac: d.startFrac || 0,
      // Curated FIA-aligned sector splits + turn apexes (js/circuit-markings.js).
      // Authored in RACING-LAP space (post startFrac/reverse) — do not fmap.
      sectors: (typeof CircuitMarkings !== "undefined" && CircuitMarkings[d.id] && CircuitMarkings[d.id].sectors) || null,
      turns:   (typeof CircuitMarkings !== "undefined" && CircuitMarkings[d.id] && CircuitMarkings[d.id].turns)   || null,
    };
    def.points = realPoints(d.id, d.baseHW) || centerline(d.segs, d.baseHW);
    // Lap-direction + start-line transform.
    //  • `reverse`   flips the traversal so the loop is driven the other way.
    //  • `startFrac` rotates the start/finish line to a chosen fraction of the
    //    ORIGINAL trace (0 = the trace's own first point).
    // The centreline control points and the elevation/bridge s-anchors are
    // remapped here; the matching scenery/barrier s-remap happens when the
    // bespoke scenery() runs (buildProps), driven by def._startFrac/_reverse.
    const phi = TrackSpace.wrap01(def.startFrac || 0);
    if (def.reverse || phi) {
      const P = def.points, N = P.length, out = new Array(N);
      for (let i = 0; i < N; i++) out[i] = P[TrackSpace.racingNodeToSource(def, i, N)];
      def.points = out;
      def._startFrac = phi;
      const fmap = (s) => TrackSpace.toRacingFrac(def, s);
      if (def.elevations) def.elevations = def.elevations.map((e) => Object.assign({}, e, { s: fmap(e.s) }));
      if (def.bridges)    def.bridges    = def.bridges.map((b) => Object.assign({}, b, { s: fmap(b.s) }));
      if (def.hwZones) {
        // Reverse flips endpoint order — swap so [s0,s1] stays a short forward arc
        // (otherwise s1 < s0 wraps and the zone covers most of the lap).
        def.hwZones = def.hwZones.map((z) => {
          return Object.assign({}, z, TrackSpace.range(def, z.s0, z.s1, "source"));
        });
      }
    }
    // Apply after startFrac remap so authored s0/s1 stay in racing-lap space.
    if (def.hwZones) applyHwZones(def.points, def.hwZones, d.baseHW);
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

  function setKeepGeometry(value) {
    keepGeometry = !!value;
    return keepGeometry;
  }

  return { LIST, build, buildCenterline, sample, curvature, onKerb, banking, bankAngle, project, wallAt, terrainY, setKeepGeometry };
})();
