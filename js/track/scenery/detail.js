/* Apex 26 — TrackDetail: the desktop DETAIL level a track build runs at (0 = today, HIGH and every phone; 1 = ULTRA;
   2 = EXTREME) and the build-time geometry its EXTREME features add: seated crowd figures (crowd3d), the far-terrain
   heightfield ring (farTerrain). treesHi / kerbProfile / density read the flags here and live with their emitters
   (nature.js, core/mesh.js, build-props.js). docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md.

   The level is decided on the PAGE (GfxQuality.detail / feature, boot-time) and reaches a Worker build through the
   build config (build-client.js `detail` + `detailFeatures`, recorded on the worker gfx as `trackDetail`), because
   GfxQuality does not exist inside the worker. Every reader treats a missing or throwing TrackDetail as level 0, so
   detail 0 builds today's world byte for byte. Nothing here touches the centreline, the road surface, kerb flags,
   walls, floorY or terrainY: all of it is visual geometry. */
const TrackDetail = (function () {
  "use strict";

  // The flags a track build reads. propsHi is the props worker's (structures / city / facade).
  const NAMES = Object.freeze(["crowd3d", "treesHi", "kerbProfile", "farTerrain", "density", "propsHi"]);
  const NONE = Object.freeze({ level: 0, features: Object.freeze(NAMES.reduce((o, n) => { o[n] = false; return o; }, {})) });

  // level 0 → every flag false, whatever `feats` says (a phone or HIGH never builds an extra);
  // feats absent → every flag on from level 2 (EXTREME), the FEATURES table's level for all of them.
  function normalize(level, feats) {
    const lv = Math.max(0, Math.min(3, Math.floor(Number(level) || 0)));
    if (lv < 1) return NONE;
    const features = {};
    for (const n of NAMES) features[n] = feats && typeof feats === "object" ? feats[n] === true : lv >= 2;
    return { level: lv, features };
  }

  // The page's answer (GfxQuality is boot-time, so a page build and a worker build agree).
  function page() {
    try {
      if (typeof GfxQuality === "undefined" || !GfxQuality || typeof GfxQuality.detail !== "function") return NONE;
      const lv = GfxQuality.detail();
      const feats = {};
      for (const n of NAMES) feats[n] = typeof GfxQuality.feature === "function" && GfxQuality.feature(n) === true;
      return normalize(lv || (NAMES.some(n => feats[n]) ? 2 : 0), feats);
    } catch (_) { return NONE; }
  }

  // Build options win (tests, tools), then the worker recorder's config, then the page.
  function resolve(opts, G) {
    try {
      if (opts && opts.detail != null) return normalize(opts.detail, opts.detailFeatures);
      const td = G && G.trackDetail;
      if (td && typeof td === "object") return normalize(td.detail, td.detailFeatures);
      return page();
    } catch (e) {
      if (typeof Log !== "undefined") Log.warn("track", "TrackDetail.resolve failed, detail 0: " + ((e && e.message) || e));
      return NONE;
    }
  }

  // treesHi stamps the pack's tree LOD0s (nature.js bakedTree): a model wait that reads a scenery closure's source
  // for the ids it names (Assets.modelsReady(ms, src)) is handed these too, so the models are resident in time.
  const TREE_MODELS = Object.freeze(["pine_lod0", "tree_lod0", "palm_lod0"]);
  const modelHint = (features) => (features && features.treesHi ? TREE_MODELS.map((id) => ` "${id}"`).join("") : "");

  // ---- crowd3d: a seated spectator in the crowd-body envelope ---------------------------------------------------
  // Canonical space as nature.js crowdBank's box ([0.55, 1, 0.5] about the origin): x = r (across, `face` = the
  // direction of the track), y = u, z = t (along the row). The instance scale and colour are crowdBank's own, so
  // the shirt (NODE_COLOR) carries the seat's colour and the height jitter applies unchanged. 5 boxes + a 6-sided
  // head = 78 triangles. Three poses: hands on lap, arms raised, leaning on the knees.
  const SKIN = [[0.83, 0.62, 0.44], [0.57, 0.35, 0.22], [0.94, 0.77, 0.60]];
  const LEGS = [[0.16, 0.18, 0.24], [0.30, 0.27, 0.22], [0.12, 0.12, 0.13]];
  const POSES = 3;
  // CROWD LIFE: the figure's part and facing ride the material id's fraction (FOLIAGE's sway weight is the
  // precedent: every backend's fragment rounds the id, so the surface is FABRIC's everywhere). part 0 = legs,
  // 1 = torso / head, 2 = arms; +0.2 when the figure faces canonical -x. TLX's crowd vertex stage decodes it
  // (js/render/three/tsl-lit.js crowdMotionNode); GLX / WGX draw the same figures still.
  const crowdMat = (mat, part, f) => mat + 0.02 + 0.06 * part + (f < 0 ? 0.2 : 0);
  function crowdFigure(rec, mat, pose, skin, face, night, shirt) {
    const f = face < 0 ? -1 : 1;
    const dim = night ? 0.3 : 1;
    const sk = SKIN[skin % SKIN.length].map((v) => v * dim);
    const lg = LEGS[pose % LEGS.length].map((v) => v * dim);
    const lean = pose === 2 ? 0.04 : 0;
    rec.mat(crowdMat(mat, 0, f));
    rec.box([f * 0.10, -0.16, 0], [0.36, 0.16, 0.36], lg);               // thighs / lap
    rec.box([f * 0.26, -0.36, 0], [0.13, 0.28, 0.30], lg);               // shins
    rec.mat(crowdMat(mat, 1, f));
    rec.box([f * (lean - 0.04), 0.10, 0], [0.22, 0.40, 0.38], shirt);    // torso
    rec.cyl([f * (lean - 0.03), 0.31, 0], 0.10, 0.19, sk, 6);            // head
    rec.mat(crowdMat(mat, 2, f));
    for (const z of [-0.21, 0.21]) {
      if (pose === 1) rec.box([-f * 0.02, 0.36, z], [0.08, 0.30, 0.08], shirt);         // arms raised
      else if (pose === 2) rec.box([f * 0.16, -0.02, z], [0.24, 0.08, 0.09], shirt);    // forearms on knees
      else rec.box([f * 0.04, 0.02, z], [0.10, 0.34, 0.09], shirt);                     // arms down
    }
  }
  // Seats past this lateral reach (metres beyond the road edge) keep today's box.
  const CROWD_NEAR_M = 45;

  // ---- farTerrain: a heightfield ring in place of the flat floor slab --------------------------------------------
  // The floor (TrackMesh.buildFloor) is a flat quad at surface.floorY; the terrain ribbon's outer rail lands on
  // floorY exactly (surface.js heightAt: dist >= outerW → floorY). This grid covers the same rectangle, sits ON
  // floorY within D0 of the centreline (so the seam with the ribbon is the same line it is today) and rises into
  // low hills beyond, flattened wherever props or water stand (they were placed on the flat floor). floorY itself,
  // terrainY and every physics reader are untouched: this geometry replaces only the floor's DRAWN mesh.
  const vhash = (x, z, seed) => {
    const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  function vnoise(x, z, seed) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = vhash(xi, zi, seed), b = vhash(xi + 1, zi, seed), c = vhash(xi, zi + 1, seed), d = vhash(xi + 1, zi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  function seedOf(id) {
    let h = 7;
    const s = String(id || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return h / 9973;
  }
  const FAR = Object.freeze({ N: 96, D0_EXTRA: 160, RAMP: 800, A_MIN: 14, A_MAX: 120, STRIDE: 4 });

  // floor: buildFloor's geo; sources: { xz } world [x, z] pairs (sampleXZ of props / glass / water, batchXZ of
  // the instanced placements); a null entry is skipped. Returns a geo, or null to keep the flat floor.
  function farTerrain(track, floor, sources) {
    const def = track && track.def;
    if (!def || def.street || !floor || !floor.pos || floor.pos.length < 12) return null;
    const p = floor.pos, y0 = p[1];
    const x0 = Math.min(p[0], p[6]), x1 = Math.max(p[0], p[6]), z0 = Math.min(p[2], p[8]), z1 = Math.max(p[2], p[8]);
    if (!(x1 > x0 && z1 > z0) || !Number.isFinite(y0)) return null;
    const N = FAR.N, V = N + 1, dx = (x1 - x0) / N, dz = (z1 - z0) / N;
    const outerW = track.surface && track.surface.outerW > 0 ? track.surface.outerW : 120;
    const D0 = outerW + FAR.D0_EXTRA;
    // Distance from each grid vertex to the nearest centreline node (every 2nd node: 8 m, far below a 50 m cell).
    const n = track.n, px = track.px, pz = track.pz;
    const dist = new Float64Array(V * V);
    for (let j = 0; j < V; j++) {
      const z = z0 + j * dz;
      for (let i = 0; i < V; i++) {
        const x = x0 + i * dx;
        let best = Infinity;
        for (let k = 0; k < n; k += 2) {
          const ex = px[k] - x, ez = pz[k] - z, d2 = ex * ex + ez * ez;
          if (d2 < best) best = d2;
        }
        dist[j * V + i] = Math.sqrt(best);
      }
    }
    // Occupied cells: anything placed out there stood on the flat floor, so the ground under it stays flat.
    const occ = new Uint8Array(N * N);
    const markXZ = (x, z) => {
      const ci = Math.floor((x - x0) / dx), cj = Math.floor((z - z0) / dz);
      if (ci >= 0 && ci < N && cj >= 0 && cj < N) occ[cj * N + ci] = 1;
    };
    for (const s of sources || []) {
      if (!s) continue;
      if (s.xz) for (let i = 0; i + 1 < s.xz.length; i += 2) markXZ(s.xz[i], s.xz[i + 1]);
    }
    const flatV = new Uint8Array(V * V);   // every corner of an occupied cell and of its 8 neighbours
    for (let cj = 0; cj < N; cj++) for (let ci = 0; ci < N; ci++) {
      if (!occ[cj * N + ci]) continue;
      for (let j = Math.max(0, cj - 1); j <= Math.min(V - 1, cj + 2); j++)
        for (let i = Math.max(0, ci - 1); i <= Math.min(V - 1, ci + 2); i++) flatV[j * V + i] = 1;
    }
    const seed = seedOf(def.id);
    const hgt = new Float64Array(V * V);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const at = j * V + i;
      const edge = i === 0 || j === 0 || i === N || j === N;
      if (flatV[at] || edge) { hgt[at] = y0; continue; }   // the rim stays on floorY: no wall at the world's edge
      const t = smooth((dist[at] - D0) / FAR.RAMP);
      if (t <= 0) { hgt[at] = y0; continue; }
      const x = x0 + i * dx, z = z0 + j * dz;
      const f = 0.65 * vnoise(x / 1400, z / 1400, seed) + 0.35 * vnoise(x / 520, z / 520, seed + 3.1);
      hgt[at] = y0 + t * (FAR.A_MIN + (FAR.A_MAX - FAR.A_MIN) * f * f);
    }
    const c0 = floor.col ? [floor.col[0], floor.col[1], floor.col[2]] : [0.26, 0.30, 0.19];
    const mat0 = floor.mat ? floor.mat[0] : 0;
    const pos = new Array(V * V * 3), nrm = new Array(V * V * 3), col = new Array(V * V * 3), mat = new Array(V * V);
    let top = 1;
    for (let k = 0; k < V * V; k++) top = Math.max(top, hgt[k] - y0);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const at = j * V + i, o = at * 3;
      pos[o] = x0 + i * dx; pos[o + 1] = hgt[at]; pos[o + 2] = z0 + j * dz;
      const hl = hgt[j * V + Math.max(0, i - 1)], hr = hgt[j * V + Math.min(N, i + 1)];
      const hd = hgt[Math.max(0, j - 1) * V + i], hu = hgt[Math.min(N, j + 1) * V + i];
      const gx = (hr - hl) / (2 * dx), gz = (hu - hd) / (2 * dz), L = Math.hypot(gx, 1, gz);
      nrm[o] = -gx / L; nrm[o + 1] = 1 / L; nrm[o + 2] = -gz / L;
      const shade = 1 - 0.22 * ((hgt[at] - y0) / top);   // hill tops a touch darker (drier, farther)
      col[o] = c0[0] * shade; col[o + 1] = c0[1] * shade; col[o + 2] = c0[2] * shade;
      mat[at] = mat0;
    }
    // Both windings, as buildFloor: the up face is never culled whatever the backend's convention.
    const idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      idx.push(a, b, d, a, d, c, a, d, b, a, c, d);
    }
    for (let k = 0; k < pos.length; k++) if (!Number.isFinite(pos[k])) return null;
    return { pos, nrm, col, mat, idx };
  }

  // ---- kerbProfile: a 4-rail kerb cross-section for the DRAWN road only ------------------------------------------
  // TrackMesh.buildKerbs calls this once per flat strip it lays, with its own constants (KW width, KH0 height,
  // style, stripe colours). Rails sit at latT 0 / 0.3 / 0.7 / 1 from the road edge: a low road-edge lip, the crown,
  // and a drop to the outer lip. Every height is ≤ KH0, the flat ribbon's (and today's sausage outer rail is KH0
  // too), so the visual peak never rises above today's. "rumble" kerbs get a sawtooth along the lap: each 0.8 m
  // tooth ramps 45 % → 100 % and drops at its end (a ring pair at every tooth edge plus the riser between them).
  // The collision side is untouched: kerbL/kerbR, track.roadGeo and the debris trimesh never see these vertices.
  const KERB_LAT = [0, 0.3, 0.7, 1];
  const KERB_H = { crown: [0.50, 1.0, 0.90, 0.40], sausage: [0.60, 0.90, 1.0, 0.75] };
  function kerbRibbon(track, k0, k1, side, out, c) {
    const { n, px, py, pz, hw } = track;
    const prof = c.style === "sausage" ? KERB_H.sausage : KERB_H.crown;
    const saw = c.style === "rumble";
    const TOOTH = 0.8, R = KERB_LAT.length;
    // Rails in ascending lateral offset (the flat ribbon's winding); lt = latT from the road edge.
    const rails = [];
    for (let l = 0; l < R; l++) {
      const lt = side > 0 ? KERB_LAT[l] : 1 - KERB_LAT[l];
      rails.push({ lt, h: c.KH0 * prof[side > 0 ? l : R - 1 - l] });
    }
    const offs = (w) => rails.map((rl) => side > 0 ? w + 0.05 + rl.lt * c.KW : -(w + 0.05 + rl.lt * c.KW));
    const node = (k) => {
      const u = c.upOf(track, k), r = [track.rx[k], track.ry[k], track.rz[k]], o = offs(hw[k]);
      const base = o.map((oo) => {
        const b = c.bankOffsetAt(track, k, oo);
        return [px[k] + r[0] * oo + u[0] * b, py[k] + r[1] * oo + u[1] * b + 0.03, pz[k] + r[2] * oo + u[2] * b];
      });
      // cross-section normals from the rail heights (dh/do along r)
      const nr = rails.map((_, l) => {
        const a = Math.max(0, l - 1), b = Math.min(R - 1, l + 1);
        const g = (rails[b].h - rails[a].h) / ((o[b] - o[a]) || 1);
        const v = [u[0] - r[0] * g, u[1] - r[1] * g, u[2] - r[2] * g], L = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / L, v[1] / L, v[2] / L];
      });
      return { u, o, base, nr };
    };
    const tooth = (a, end) => {
      if (!saw) return 1;
      let f = a / TOOTH - Math.floor(a / TOOTH + 1e-6);
      if (f < 1e-6) f = end ? 1 : 0;
      return 0.45 + 0.55 * f;
    };
    const par = (m) => ((m % 2) + 2) % 2;
    const rings = [];   // { at: vertex index, dup }
    let prev = null, prevArc = 0;
    const emit = (P, C, t, a, parity, end, dup) => {
      const at = out.pos.length / 3, u = C.u;
      for (let l = 0; l < R; l++) {
        const A = P ? P.base[l] : C.base[l], B = C.base[l];
        const h = rails[l].h * tooth(a, end);
        out.pos.push(A[0] + (B[0] - A[0]) * t + u[0] * h, A[1] + (B[1] - A[1]) * t + u[1] * h, A[2] + (B[2] - A[2]) * t + u[2] * h);
        const N = C.nr[l];
        out.nrm.push(N[0], N[1], N[2]);
        const col = parity === 0 ? c.ka : c.kb;
        out.col.push(col[0], col[1], col[2]);
        out.mat.push(c.MAT.FLAT);
        out.trk.push(a, C.o[l], 0);
      }
      rings.push({ at, dup });
    };
    for (let i = 0; i <= k1 - k0; i++) {
      const k = (k0 + i + n) % n, C = node(k), arc = k0 * c.ds + i * c.ds;
      if (i === 0) emit(null, C, 1, arc, par(Math.floor(arc / c.STRIPE_M + 1e-6)), false, false);
      else {
        const span = arc - prevArc, P = saw ? TOOTH : c.STRIPE_M;
        let nodeDone = false;
        for (let m = Math.floor(prevArc / P + 1e-6) + 1; m * P <= arc + 1e-6; m++) {
          const a = m * P, t = Math.min(1, (a - prevArc) / span);
          const sp = Math.floor(a / c.STRIPE_M + 1e-6);   // the stripe starting here
          const stripeEdge = Math.abs(a / c.STRIPE_M - Math.round(a / c.STRIPE_M)) < 1e-6;
          emit(prev, C, t, a, stripeEdge ? par(sp - 1) : par(sp), true, false);
          emit(prev, C, t, a, par(sp), false, true);
          if (t >= 1) nodeDone = true;
        }
        if (!nodeDone) emit(prev, C, 1, arc, par(Math.floor(arc / c.STRIPE_M + 1e-6)), false, false);
      }
      prev = C; prevArc = arc;
    }
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i].at, b = rings[i + 1].at;
      // a coincident pair is zero-area unless the sawtooth steps there (the riser face)
      if (rings[i + 1].dup && !saw) continue;
      for (let l = 0; l < R - 1; l++) out.idx.push(a + l, a + l + 1, b + l, a + l + 1, b + l + 1, b + l);
    }
  }
  // The drawn road: `geo` minus its flat kerb triangles [i0, i1), plus the profiled kerbs (vertices appended).
  function withKerbs(geo, i0, i1, kp) {
    const base = geo.pos.length / 3;
    const idx = geo.idx.slice(0, i0).concat(geo.idx.slice(i1));
    for (let i = 0; i < kp.idx.length; i++) idx.push(kp.idx[i] + base);
    return { pos: geo.pos.concat(kp.pos), nrm: geo.nrm.concat(kp.nrm), col: geo.col.concat(kp.col),
             mat: geo.mat.concat(kp.mat), trk: geo.trk.concat(kp.trk), idx };
  }

  // Every STRIDE-th vertex's world XZ of a position array (null-safe): the mask input, taken before upload.
  function sampleXZ(pos) {
    if (!pos || !(pos.length >= 3)) return null;
    const xz = [];
    for (let i = 0; i + 2 < pos.length; i += 3 * FAR.STRIDE) xz.push(pos[i], pos[i + 2]);
    return { xz };
  }
  // Instanced placements' world XZ (batch matrices, column-major 4×4): their triangles never reach propsGeo.
  function batchXZ(batches) {
    const xz = [];
    for (const b of batches || []) {
      const m = b && b.matrices;
      if (!m) continue;
      for (let i = 0; i + 15 < m.length; i += 16) xz.push(m[i + 12], m[i + 14]);
    }
    return { xz };
  }

  // ---- the build's hooks -----------------------------------------------------------------------------------------
  // The eager engine (tracks.js, core/mesh.js, build-client.js) carries only guarded one-line hooks into this lazy
  // file, so the tiers above ULTRA add nothing to the boot wall. Each hook absent (TrackDetail not loaded) or null
  // (detail 0) is today's build exactly.

  // The page's level as the worker build config carries it (build-client.js: the request key and the message).
  function config() {
    const d = page();
    return d.level ? { detail: d.level, detailFeatures: Object.assign({}, d.features) } : { detail: 0, detailFeatures: {} };
  }

  // tracks.js buildSteps: resolves the level onto track._detail / _detailFeatures (every flag reader's input) and
  // returns the per-build hooks, null at detail 0. kerbProfile hands core/mesh.js buildKerbs a strip hook through
  // track._kerbProfile; farTerrain defers the floor upload and collects the flat-under-props mask as the build
  // uploads (positions sampled BEFORE each upload, which may drop or transfer them).
  function attach(track, opts) {
    const G = track._gfx, d = resolve(opts, G);
    track._detail = d.level;
    track._detailFeatures = d.features;
    if (!d.level) return null;
    const f = d.features, far = !!f.farTerrain && !track.def.street, mask = [];
    // A road drawn unchunked may be re-chunked later (game.js quality recovery): it chunks track.roadDrawGeo.
    const chunkRibbons = !!(opts && opts.chunkRibbons && G.createChunkedMesh);
    let kerb = null;   // { idx: the road's index array, i0, i1: its flat-kerb triangle range, prof: the profiled buffer }
    if (f.kerbProfile) track._kerb = (out) => {
      // core/mesh.js buildKerbs' constants, mirrored (it keeps them local; the identity tests pin the result).
      const style = track.def && track.def.kerbStyle, pal = track.def.palette;
      const c = { KW: style === "sausage" ? 1.05 : 0.9, KH0: style === "sausage" ? 0.09 : style === "rumble" ? 0.07 : 0.06,
        style, ka: pal.kerbA, kb: pal.kerbB, ds: track.total / track.n, STRIPE_M: 1.6,
        upOf: TrackMesh.upOf, bankOffsetAt: TrackMesh.bankOffsetAt, MAT: TrackGeom.MAT };
      const k = kerb = { idx: out.idx, i0: out.idx.length, i1: out.idx.length, prof: { pos: [], nrm: [], col: [], mat: [], trk: [], idx: [] } };
      // Called after each flat strip lands: the same strip, profiled, into the drawn-only buffer.
      return (k0, k1, side) => {
        k.i1 = out.idx.length;
        if (k.prof.failed) return;
        try { kerbRibbon(track, k0, k1, side, k.prof, c); }
        catch (e) { k.prof.failed = true; Log.warn("track", "kerbProfile failed, flat kerbs: " + ((e && e.message) || e)); }
      };
    };
    return {
      far,
      // The DRAWN road: the profiled kerbs in place of the flat ones; track.roadGeo (debris collider, agent, shadow
      // caster, re-chunk fallback) stays the flat-kerb geometry every level shares. Returns the geo to draw.
      road(geo) {
        const k = kerb;
        kerb = null;
        delete track._kerb;   // a later TrackMesh.buildRoad (garage exterior) lays flat kerbs only
        if (!k || !geo || geo.idx !== k.idx || k.prof.failed || !k.prof.idx.length) return geo;
        const vis = withKerbs(geo, k.i0, k.i1, k.prof);
        if (!TrackModels.validateGeometry(vis).ok) return geo;
        // Dropped with the ribbon CPU copies (Tracks.dropRibbonCpuIfReady).
        if (!chunkRibbons) track.roadDrawGeo = vis;
        return vis;
      },
      // farTerrain's mask: the props' positions, and the glass / water's (props = buildProps' result) as the build
      // will upload them: an invalid one ships empty (tracks.js safe), so it masks nothing.
      xz(propsGeo, props) {
        if (!far) return;
        mask.push(sampleXZ(propsGeo && propsGeo.pos));
        for (const g of [props && props.glass, props && props.water])
          if (g && TrackModels.validateGeometry(g).ok) mask.push(sampleXZ(g.pos));
      },
      // An instanced batch's options (crowd: the seated figures draw with TLX's CROWD LIFE vertex stage; other
      // backends ignore it); its placements join the mask (their triangles never reach propsGeo).
      inst(b) {
        if (far) mask.push(batchXZ([b]));
        return String(b.model).startsWith("crowd-fig|") ? { cellSize: 72, crowd: true } : { cellSize: 72 };
      },
      // The deferred floor upload: the heightfield ring, or the flat floor when it fails or validates false.
      floor(floorGeo) {
        if (!far) return;
        let g = null;
        try { g = farTerrain(track, floorGeo, mask); }
        catch (e) { Log.warn("track", track.def.id + " farTerrain failed, flat floor: " + ((e && e.message) || e)); }
        if (g && !TrackModels.validateGeometry(g).ok) g = null;
        track.meshes.floor = G.createMesh(g || floorGeo);
      },
    };
  }

  return { NAMES, NONE, normalize, page, resolve, config, attach, crowdFigure, crowdMat, TREE_MODELS, modelHint, CROWD_NEAR_M, POSES, SKIN,
           farTerrain, sampleXZ, batchXZ, FAR, kerbRibbon, withKerbs, KERB_LAT, KERB_H };
})();
Object.freeze(TrackDetail);
