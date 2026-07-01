/* Apex 26 — track spline engine: centreline generation (Catmull-Rom over the
 * authored segs or the real OSM trace), arc-length sampling and curvature.
 * First of the Tracks engine files — creates the shared internal TracksKit
 * namespace that tracks-mesh.js / tracks-scenery.js / tracks.js extend.
 * Load order: tracks/*.js defs -> THIS -> tracks-mesh -> tracks-scenery -> tracks.js */
"use strict";

const TracksKit = {};

(function () {
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
    track.bankP = TracksKit.bankingProfile(track);
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


Object.assign(TracksKit, {
  SCALE, WORLD_UP, cross, norm, lerp,
  centerline, cr, buildCenterline, buildMap, sample, curvature,
});
})();
