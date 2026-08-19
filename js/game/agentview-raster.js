/* Apex 26 — AgentRaster: the text rasterisers behind the agent view's ONE optional composition aid, render({what}). frame() renders the camera view as a depth-sor… */
const AgentRaster = (function () {
  "use strict";

  function create(ctx) {
    Log.info("game", "AgentRaster.create");
    const { G, fail, resolveCamera, model, corners, nextCorner, carWorld, scr,
            clamp, r1, r2, API_VERSION, CONVENTIONS, wrapS } = ctx;

    const GLYPHS = {
      road: "=", kerb: ":", car: "C", player: "@",
      tree: "t", pine: "t", palm: "t", conifer: "t", bush: ",", hedge: ",",
      building: "B", house: "h", motorhome: "m", tower: "I", structure: "#",
      grandstand: "A", billboard: "b", signBoard: "s", marshalPost: "p",
      gantry: "T", mountain: "^", peak: "^", ridge: "^", prop: "o",
      sky: ".", ground: "_",
    };

    function projPoint(vp, x, y, z) {
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
      const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (!(cw > 1e-6)) return null;
      return { x: cx / cw, y: cy / cw, w: cw };
    }

    // Screen rect of a world AABB. Projecting all eight corners and taking the
    // extent is conservative (it over-covers a rotated box) but never misses
    // geometry, which is the right error for an occlusion raster.
    function boxRect(vp, cx, cy, cz, hw, hh, hd) {
      // The object's CENTRE must be in front of the eye. Without this test a
      // box that merely straddles the near plane still projects a rect — and a
      // 22 m pine standing 20 m to the SIDE of the car straddles it, so it
      // painted the entire grid and reported the frame as 100% tree. Anything
      // whose centre is behind the camera is not in shot, whatever its corners
      // do.
      const mid = projPoint(vp, cx, cy, cz);
      if (!mid) return null;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      let near = Infinity, seen = 0;
      for (let i = 0; i < 8; i++) {
        const p = projPoint(vp, cx + (i & 1 ? hw : -hw), cy + (i & 2 ? hh : -hh),
                            cz + (i & 4 ? hd : -hd));
        if (!p) continue;
        seen++;
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
        if (p.w < near) near = p.w;
      }
      if (!seen) return null;
      return { x0, x1, y0, y1, near: mid.w };
    }

    function containsEye(eye, cx, cy, cz, hw, hh, hd) {
      return Math.abs(eye[0] - cx) <= hw && Math.abs(eye[2] - cz) <= hd
             && Math.abs(eye[1] - cy) <= hh;
    }

    function frame(opts) {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const o = opts || {};
      const cam = resolveCamera(o);
      if (cam.ok === false) return cam;
      const vp = cam.vp;
      const fr = G.frame || {};             // lighting/cullDist still read live
      const cellAspect = clamp(o.cellAspect || 2, 1, 4);
      const viewAspect = (G.gfx && G.gfx.aspect) || 2.16;
      const cols = clamp(o.cols | 0 || 48, 8, 400);
      const autoRows = Math.round(cols / (viewAspect * cellAspect));
      const rows = clamp(o.rows | 0 || autoRows, 4, 150);
      const range = clamp(o.rangeM || 500, 50, 3000);
      const eye = cam.eye;

      // depth buffer + kind buffer, one entry per cell
      const N = cols * rows;
      const depth = new Float64Array(N).fill(Infinity);
      const kind = new Array(N).fill(null);
      const idOf = new Array(N).fill(null);
      const seenKinds = {};

      // NDC -> cell. NDC y is +up, rows run top-down.
      const cellX = (ndc) => Math.floor((ndc + 1) / 2 * cols);
      const cellY = (ndc) => Math.floor((1 - ndc) / 2 * rows);

      function paint(rect, k, id) {
        const cx0 = Math.max(0, cellX(rect.x0)), cx1 = Math.min(cols - 1, cellX(rect.x1));
        const cy0 = Math.max(0, cellY(rect.y1)), cy1 = Math.min(rows - 1, cellY(rect.y0));
        if (cx1 < cx0 || cy1 < cy0) return 0;
        let n = 0;
        for (let y = cy0; y <= cy1; y++) {
          for (let x = cx0; x <= cx1; x++) {
            const i = y * cols + x;
            if (rect.near < depth[i]) { depth[i] = rect.near; kind[i] = k; idOf[i] = id; n++; }
          }
        }
        return n;
      }

      const objects = [];

      const roadPts = clamp(o.roadSamples | 0 || 90, 10, 400);
      const player = G.player;
      const s0 = player && player.s != null ? player.s : 0;
      const BEHIND = 60;
      const edgeAt = (d) => {
        const ss = wrapS(s0 + d);
        Tracks.sample(G.track, ss, scr);
        const rl = Math.hypot(scr.r[0], scr.r[2]) || 1;
        const ex = scr.r[0] / rl, ez = scr.r[2] / rl, y = scr.p[1] + 0.05;
        const L = projPoint(vp, scr.p[0] - ex * scr.hw, y, scr.p[2] - ez * scr.hw);
        const R = projPoint(vp, scr.p[0] + ex * scr.hw, y, scr.p[2] + ez * scr.hw);
        return L && R ? { L, R, w: (L.w + R.w) / 2 } : null;
      };
      let prev = null;
      for (let i = 0; i <= roadPts; i++) {
        const f = i / roadPts;
        const d = -BEHIND + Math.pow(f, 1.8) * (range + BEHIND);
        const cur = edgeAt(d);
        if (prev && cur) {
          const yA = cellY(Math.max(prev.L.y, prev.R.y)), yB = cellY(Math.max(cur.L.y, cur.R.y));
          const yLo = Math.max(0, Math.min(yA, yB)), yHi = Math.min(rows - 1, Math.max(yA, yB));
          for (let y = yLo; y <= yHi; y++) {
            const t = yA === yB ? 0 : (y - yA) / (yB - yA);
            const lx = prev.L.x + (cur.L.x - prev.L.x) * t;
            const rx = prev.R.x + (cur.R.x - prev.R.x) * t;
            const w = prev.w + (cur.w - prev.w) * t;
            let c0 = cellX(Math.min(lx, rx)), c1 = cellX(Math.max(lx, rx));
            if (c1 < 0 || c0 >= cols) continue;
            c0 = Math.max(0, c0); c1 = Math.min(cols - 1, c1);
            for (let x = c0; x <= c1; x++) {
              const idx = y * cols + x;
              if (w < depth[idx]) {
                depth[idx] = w;
                kind[idx] = (x === c0 || x === c1) && c1 > c0 + 1 ? "kerb" : "road";
                idOf[idx] = null;
              }
            }
          }
        }
        prev = cur || prev;
      }

      const reg = G.track.props;
      if (reg) {
        for (const p of reg.list) {
          const dx = p.x - eye[0], dz = p.z - eye[2];
          const dist = Math.hypot(dx, dz);
          if (dist > range) continue;
          if (containsEye(eye, p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2)) continue;
          if (p.fill != null && p.fill < 0.06 && p.w * p.d > 150) continue;
          const rect = boxRect(vp, p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2);
          if (!rect) continue;
          const painted = paint(rect, p.kind, null);
          if (painted) {
            seenKinds[p.kind] = (seenKinds[p.kind] || 0) + 1;
            if (painted >= 2) {
              objects.push({ kind: p.kind, distM: r1(dist), cells: painted,
                             sizeM: [p.w, p.h, p.d] });
            }
          }
        }
      }

      // cars (painted last so they win ties against scenery at equal depth)
      for (const c of G.cars) {
        const [wx, wz] = carWorld(c);
        const dist = Math.hypot(wx - eye[0], wz - eye[2]);
        if (dist > range) continue;
        // ~F1 dimensions; the box is axis-aligned, which over-covers a yawed car
        const rect = boxRect(vp, wx, 0.55, wz, 1.1, 0.55, 2.6);
        if (!rect) continue;
        const k = c.isPlayer ? "player" : "car";
        const painted = paint(rect, k, c.id != null ? c.id : G.cars.indexOf(c));
        if (painted) {
          seenKinds[k] = (seenKinds[k] || 0) + 1;
          objects.push({ kind: k, id: c.id, code: c.code || null,
                         distM: r1(dist), cells: painted });
        }
      }

      const tgt = cam.tgt || G.camTgt;
      const fwdY = (tgt[1] - eye[1]);
      const fwdH = Math.hypot(tgt[0] - eye[0], tgt[2] - eye[2]) || 1;
      const pitch = Math.atan2(fwdY, fwdH);
      const vfovR = (G.camFov || 60) * Math.PI / 180;
      let horizonRow = null;
      for (let y = 0; y < rows; y++) {
        const elev = pitch + (0.5 - (y + 0.5) / rows) * vfovR;
        if (horizonRow === null && elev <= 0) horizonRow = y;
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          if (kind[i] === null) kind[i] = elev > 0 ? "sky" : "ground";
        }
      }

      const edges = o.edges ? new Array(N).fill(null) : null;
      if (edges) {
        const FAR = 1e6;
        const dAt = (x, y) => { const i = y * cols + x;
          return (kind[i] === "sky" || kind[i] === "ground" || !isFinite(depth[i]))
            ? FAR : depth[i]; };
        let dmax = 1;
        for (let i = 0; i < N; i++) if (isFinite(depth[i]) && depth[i] < FAR && depth[i] > dmax) dmax = depth[i];
        for (let y = 1; y < rows - 1; y++) {
          for (let x = 1; x < cols - 1; x++) {
            const i = y * cols + x;
            if (kind[i] === "sky" || kind[i] === "ground") continue;
            const gx = dAt(x + 1, y) - dAt(x - 1, y), gy = dAt(x, y + 1) - dAt(x, y - 1);
            const mag = Math.hypot(gx, gy) / dmax;
            if (mag > (o.edgeThresh || 0.35)) {
              const AX = Math.abs(gx), AY = Math.abs(gy);
              edges[i] = AX > AY * 2.4 ? "|" : AY > AX * 2.4 ? "-" : (gx * gy > 0 ? "\\" : "/");
            }
          }
        }
      }

      const lines = [];
      for (let y = 0; y < rows; y++) {
        let line = "";
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          line += (edges && edges[i]) || GLYPHS[kind[i]] || "?";
        }
        lines.push(line);
      }

      // Optional DEPTH channel. A depth buffer is a real render target — this
      // is measured, not a synthesised shading model, and reading it needs no
      // shape recognition, which is the thing models are documented to be poor
      // at in character art. Digits are near (0) to far (9), logarithmic so the
      // near field where driving decisions live gets the resolution.
      let depthLines, depthScale;
      if (o.depth) {
        const near = 2, far = range;
        depthScale = [];
        for (let d = 0; d <= 9; d++) {
          depthScale.push(r1(near * Math.pow(far / near, d / 9)));
        }
        depthLines = [];
        for (let y = 0; y < rows; y++) {
          let line = "";
          for (let x = 0; x < cols; x++) {
            const w = depth[y * cols + x];
            if (!isFinite(w)) { line += " "; continue; }
            const t = Math.log(Math.max(w, near) / near) / Math.log(far / near);
            line += String(clamp(Math.round(t * 9), 0, 9));
          }
          depthLines.push(line);
        }
      }

      // legend covers only what actually appears, so it stays small
      const used = {};
      for (let i = 0; i < N; i++) used[kind[i]] = (used[kind[i]] || 0) + 1;
      const legend = {};
      for (const k of Object.keys(used)) legend[GLYPHS[k] || "?"] = k;

      objects.sort((a, b) => b.cells - a.cells);
      const cover = {};
      for (const k of Object.keys(used)) cover[k] = r1(used[k] / N * 100);

      return {
        apiVersion: API_VERSION, conventions: CONVENTIONS,
        camera: { eye: eye.map(r1), target: (cam.tgt || G.camTgt).map(r1),
                  fovDeg: r1(cam.fovDeg || G.camFov), pitchDeg: r1(pitch * 180 / Math.PI),
                  mode: cam.mode, synthetic: cam.synthetic, debugCam: !!G.dbgCam },
        // A synthetic camera is computed fresh, so it is never stale; only the
        // live view depends on a rendered frame.
        framePending: !cam.synthetic && !!G.headlessMode,
        warning: (!cam.synthetic && G.headlessMode)
          ? "headless(true) skips render(), so the live camera may be stale — "
            + "name a camera to compute a fresh one" : undefined,
        grid: {
          cols, rows, rangeM: range, horizonRow, lines,
          aspect: {
            viewport: r2(viewAspect), cellAspect,
            renderedAspect: r2(cols / rows / cellAspect),
            corrected: !o.rows,
            note: o.rows
              ? "rows pinned by the caller; if renderedAspect differs from "
                + "viewport the image is stretched"
              : "rows derived from viewport and cell aspect so the image is "
                + "not squashed",
          },
        },
        legend,
        depth: depthLines ? { lines: depthLines, scaleM: depthScale,
                              note: "digit -> metres via scaleM; blank = sky or "
                                    + "ground with no geometry" } : undefined,
        coveragePct: cover,
        objects: objects.slice(0, clamp(o.limit | 0 || 20, 1, 100)),
        lighting: {
          timeOfDay: G.raceTimeOfDay, weather: G.raceWeather,
          exposure: fr.exposure != null ? r2(fr.exposure) : null,
          sunDir: fr.sunDir ? fr.sunDir.map(r2) : null,
          fogDensity: fr.fogDensity != null ? +fr.fogDensity.toFixed(5) : null,
          lights: fr.lights ? fr.lights.length / 15 : 0,
        },
        note: "occlusion is solved per cell by depth, so a nearer object hides "
              + "what is behind it. Boxes are axis-aligned, so a yawed car or a "
              + "rotated building over-covers slightly at cell resolution.",
      };
    }

    // the high-detail rasterizer — edge + shade, from real triangles
    // The Acerola / Kang pipeline (https://www.youtube.com/watch?v=gg40RWiaHRY),
    // geometry-native: instead of a screen-space Difference-of-Gaussians + Sobel
    // on luminance, edges come straight from the DEPTH buffer (silhouettes and
    // creases are exact depth discontinuities), and interiors are Lambert-shaded
    // from the real surface normals into a density ramp. Sharper than the
    // photographic version because it never guesses a shape from shading.
    //
    // Supersampled ss x ss per character cell for anti-aliasing and gradient
    // room; composed down to one glyph: an edge cell gets a directional line
    // (| - / \) from the depth gradient, an interior cell a ramp glyph from its
    // shade, empty stays blank.
    const RAMP = " .:-=+*oO#%@";           // dark -> light
    const LIGHT = (() => { const l = [0.4, 0.75, 0.5]; const m = Math.hypot(l[0], l[1], l[2]);
                           return [l[0] / m, l[1] / m, l[2] / m]; })();

    function rasterTris(pos, idx, nrm, project, cols, rows, ss, edgeThresh) {
      const sw = cols * ss, sh = rows * ss, S = sw * sh;
      const depth = new Float64Array(S).fill(Infinity);
      const shade = new Float32Array(S).fill(-1);
      const nTris = idx && idx.length ? idx.length : pos.length / 3;
      const vi = (t, k) => idx && idx.length ? idx[t + k] : t + k;
      const P = [null, null, null];
      for (let t = 0; t < nTris; t += 3) {
        const ia = vi(t, 0) * 3, ib = vi(t, 1) * 3, ic = vi(t, 2) * 3;
        P[0] = project(pos[ia], pos[ia + 1], pos[ia + 2]);
        P[1] = project(pos[ib], pos[ib + 1], pos[ib + 2]);
        P[2] = project(pos[ic], pos[ic + 1], pos[ic + 2]);
        if (!P[0] || !P[1] || !P[2]) continue;
        // flat shade from the geometric normal (averaged) if present
        let sh2 = 0.6;
        if (nrm) {
          const nx = nrm[ia] + nrm[ib] + nrm[ic], ny = nrm[ia + 1] + nrm[ib + 1] + nrm[ic + 1],
                nz = nrm[ia + 2] + nrm[ib + 2] + nrm[ic + 2];
          const nl = Math.hypot(nx, ny, nz) || 1;
          sh2 = clamp((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl, -1, 1) * 0.45 + 0.5;
        }
        const ax = P[0].x, ay = P[0].y, bx = P[1].x, by = P[1].y, cxx = P[2].x, cyy = P[2].y;
        const d = (bx - ax) * (cyy - ay) - (cxx - ax) * (by - ay);
        if (Math.abs(d) < 1e-9) continue;
        const minx = Math.max(0, Math.floor(Math.min(ax, bx, cxx)));
        const maxx = Math.min(sw - 1, Math.ceil(Math.max(ax, bx, cxx)));
        const miny = Math.max(0, Math.floor(Math.min(ay, by, cyy)));
        const maxy = Math.min(sh - 1, Math.ceil(Math.max(ay, by, cyy)));
        for (let y = miny; y <= maxy; y++) {
          for (let x = minx; x <= maxx; x++) {
            const w1 = ((bx - x) * (cyy - y) - (cxx - x) * (by - y)) / d;
            const w2 = ((cxx - x) * (ay - y) - (ax - x) * (cyy - y)) / d;
            const w3 = 1 - w1 - w2;
            if (w1 < -0.01 || w2 < -0.01 || w3 < -0.01) continue;
            const dz = w1 * P[0].depth + w2 * P[1].depth + w3 * P[2].depth;
            const i = y * sw + x;
            if (dz < depth[i]) { depth[i] = dz; shade[i] = sh2; }
          }
        }
      }
      // Edge magnitude + direction per sub-sample, Sobel on depth (empty = far).
      const far = 1e6;
      const dAt = (x, y) => { const i = y * sw + x; return isFinite(depth[i]) ? depth[i] : far; };
      const lines = [];
      // normalise depth spread so edgeThresh is scale-free
      let dmin = Infinity, dmax = -Infinity;
      for (let i = 0; i < S; i++) if (isFinite(depth[i])) { if (depth[i] < dmin) dmin = depth[i]; if (depth[i] > dmax) dmax = depth[i]; }
      const dspan = (dmax - dmin) || 1;
      for (let cy2 = 0; cy2 < rows; cy2++) {
        let line = "";
        for (let cx2 = 0; cx2 < cols; cx2++) {
          // aggregate the ss x ss block
          let cov = 0, shSum = 0, gx = 0, gy = 0, emax = 0;
          for (let sy = 0; sy < ss; sy++) {
            for (let sx = 0; sx < ss; sx++) {
              const X = cx2 * ss + sx, Y = cy2 * ss + sy, i = Y * sw + X;
              if (isFinite(depth[i])) { cov++; shSum += shade[i]; }
              if (X > 0 && X < sw - 1 && Y > 0 && Y < sh - 1) {
                const gxx = (dAt(X + 1, Y) - dAt(X - 1, Y));
                const gyy = (dAt(X, Y + 1) - dAt(X, Y - 1));
                const mag = Math.hypot(gxx, gyy) / dspan;
                if (mag > emax) { emax = mag; gx = gxx; gy = gyy; }
              }
            }
          }
          if (emax > edgeThresh) {
            const AX = Math.abs(gx), AY = Math.abs(gy);
            line += AX > AY * 2.4 ? "|" : AY > AX * 2.4 ? "-" : (gx * gy > 0 ? "\\" : "/");
          } else if (cov > 0) {
            const sAvg = shSum / cov;
            line += RAMP[clamp(Math.round(sAvg * (RAMP.length - 1)), 1, RAMP.length - 1)];
          } else line += " ";
        }
        lines.push(line.replace(/\s+$/, ""));
      }
      return { lines, cols, rows };
    }

    function orthoCar(pos, idx, nrm, ha, va, hSign, vSign, oa, cols, cellAspect, ss, EDGE_T) {
      let h0 = Infinity, h1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const h = pos[i + ha] * hSign, v = pos[i + va] * vSign;
        if (h < h0) h0 = h; if (h > h1) h1 = h; if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      const wSpan = (h1 - h0) || 1, hSpan = (v1 - v0) || 1;
      const mPerCol = wSpan / cols;
      const rows = clamp(Math.round(hSpan / mPerCol / cellAspect), 4, 100);
      const sw = cols * ss, sh = rows * ss;
      const project = (x, y, z) => {
        const c = [x, y, z];
        const h = c[ha] * hSign, v = c[va] * vSign;
        return { x: (h - h0) / wSpan * (sw - 1), y: (v1 - v) / hSpan * (sh - 1),
                 depth: -c[oa] };            // nearest along the view axis
      };
      const r = rasterTris(pos, idx, nrm, project, cols, rows, ss, EDGE_T);
      return { lines: r.lines, cols, rows, mPerCol: r2(mPerCol) };
    }

    function carRender(mesh, cols, edgeT, ssArg) {
      const pos = mesh.pos, idx = mesh.idx, nrm = mesh.nrm;
      const c = clamp(cols | 0 || 46, 12, 300);
      const ss = clamp(ssArg | 0 || 3, 1, 6), ET = edgeT || 0.45;
      return {
        legend: { "| - / \\": "edges (silhouette + creases)",
                  " .:-=+*oO#%@": "surface, dark -> lit" },
        side: orthoCar(pos, idx, nrm, 2, 1, 1, 1, 0, c, 2, ss, ET),           // z,y  view along x
        top: orthoCar(pos, idx, nrm, 2, 0, 1, 1, 1, c, 2, ss, ET),            // z,x  view along y (top-down)
        front: orthoCar(pos, idx, nrm, 0, 1, -1, 1, 2, Math.round(c * 0.55), 2, ss, ET), // x,y view along z
        note: "orthographic edge+shade from the real mesh; +z forward (nose "
              + "to the right in side/top). Edges are true depth discontinuities; "
              + "the ramp is Lambert shading. mPerCol converts columns to metres. "
              + "ss raises supersampling (1-6) for a sharper render at more cost.",
      };
    }

    const PLAN_GLYPH = {
      road: ".", kerb: ":", car: "o", player: "@",
      tree: "t", pine: "t", palm: "t", conifer: "t", bush: ",", hedge: ",",
      building: "B", house: "h", motorhome: "m", tower: "I", structure: "#",
      grandstand: "A", billboard: "b", signBoard: "s", marshalPost: "p",
      gantry: "=", mountain: "^", peak: "^", ridge: "^", prop: "o",
    };

    function plan(opts) {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const o = opts || {};
      const p = G.player;
      // Default stays coarse; the cap is raised for an on-request detailed map.
      const cols = clamp(o.cols | 0 || 60, 12, 300);
      const cellAspect = clamp(o.cellAspect || 2, 1, 4);
      // World-square cells: a char cell is ~2x taller than wide, so a row must
      // span cellAspect x the metres a column does, or the map is stretched.
      const rows = clamp(Math.round(cols / cellAspect), 6, 150);
      const radius = clamp(o.radiusM || 200, 20, 4000);
      const mPerCol = (2 * radius) / cols;
      const mPerRow = mPerCol * cellAspect;

      let ox, oz, rot, frame;
      const carUp = o.northUp ? false : true;
      if (p && p.px != null) { ox = p.px; oz = p.pz; }
      else {
        Tracks.sample(G.track, 0, scr); ox = scr.p[0]; oz = scr.p[2];
      }
      let bodyUp = false;
      if (carUp && p && p.head != null) {
        rot = p.head; bodyUp = true; frame = "car-up (up = the way the car faces)";
      } else {
        rot = 0; frame = "north-up (up = -z / north, right = +x / east)";
      }
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const toCell = (x, z) => {
        const dx = x - ox, dz = z - oz;
        let rx, rz;
        if (bodyUp) {
          rx = dz * sinR - dx * cosR;          // + = the car's right
          rz = -(dx * sinR + dz * cosR);       // forward = -rz, for any heading
        } else {
          rx = dx; rz = dz;                    // north-up: +x east, -z up
        }
        const cx = Math.round(cols / 2 + rx / mPerCol);
        const cy = Math.round(rows / 2 + rz / mPerRow);   // +rz downward
        return { cx, cy, rx, rz };
      };

      const grid = new Array(cols * rows).fill(null);
      const near = new Float64Array(cols * rows).fill(Infinity);
      const put = (cx, cy, kind, priority) => {
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
        const i = cy * cols + cx;
        if (priority < near[i]) { near[i] = priority; grid[i] = kind; return true; }
        return false;
      };

      const total = G.track.total, step = Math.max(2, mPerCol * 0.5);
      let onScreenNodes = 0;
      for (let s = 0; s < total; s += step) {
        Tracks.sample(G.track, s, scr);
        if (Math.hypot(scr.p[0] - ox, scr.p[2] - oz) > radius * 1.6) continue;
        const rl = Math.hypot(scr.r[0], scr.r[2]) || 1;
        const ex = scr.r[0] / rl, ez = scr.r[2] / rl;
        const half = scr.hw;
        for (let lat = -half; lat <= half; lat += mPerCol * 0.5) {
          const c = toCell(scr.p[0] + ex * lat, scr.p[2] + ez * lat);
          const kind = Math.abs(lat) > half - mPerCol * 0.5 ? "kerb" : "road";
          if (put(c.cx, c.cy, kind, 5)) onScreenNodes++;
        }
      }

      const reg = G.track.props;
      const counts = {};
      if (reg) {
        for (const q of reg.list) {
          if (Math.hypot(q.x - ox, q.z - oz) > radius * 1.5) continue;
          const c = toCell(q.x, q.z);
          if (put(c.cx, c.cy, q.kind, 3)) counts[q.kind] = (counts[q.kind] || 0) + 1;
        }
      }

      const cars = [];
      for (const car of G.cars) {
        const [wx, wz] = carWorld(car);
        if (Math.hypot(wx - ox, wz - oz) > radius * 1.5) continue;
        const c = toCell(wx, wz);
        const isP = car.isPlayer;
        put(c.cx, c.cy, isP ? "player" : "car", isP ? -1 : 1);
        if (!isP) cars.push({ id: car.id, code: car.code || null,
                              aheadM: r1(-c.rz), rightM: r1(c.rx) });
      }
      // Ensure the player is always the centre glyph in car-up.
      if (carUp && p && p.px != null) put(Math.round(cols / 2), Math.round(rows / 2), "player", -2);

      const lines = [];
      for (let y = 0; y < rows; y++) {
        let line = "";
        for (let x = 0; x < cols; x++) {
          const k = grid[y * cols + x];
          line += k ? (PLAN_GLYPH[k] || "?") : " ";
        }
        lines.push(line.replace(/\s+$/, ""));
      }

      const used = {};
      for (const k of grid) if (k) used[k] = 1;
      const legend = {};
      for (const k of Object.keys(used)) legend[PLAN_GLYPH[k] || "?"] = k;

      const cc = Math.round(cols / 2), cr = Math.round(rows / 2);
      const bearing = (rx, rz) => r1(Math.atan2(rx, -rz) * 180 / Math.PI); // 0=ahead,+=right
      const entry = (x, z, extra) => {
        const c = toCell(x, z);
        const o2 = { cell: [c.cx, c.cy], world: [r1(x), r1(z)],
                     aheadM: r1(-c.rz), rightM: r1(c.rx),
                     distM: r1(Math.hypot(c.rx, c.rz)), bearingDeg: bearing(c.rx, c.rz) };
        return Object.assign(o2, extra);
      };

      // Corners visible on the map, numbered — the topological skeleton.
      const cornersOnMap = [];
      for (const co of corners()) {
        Tracks.sample(G.track, co.s, scr);
        if (Math.hypot(scr.p[0] - ox, scr.p[2] - oz) > radius * 1.4) continue;
        cornersOnMap.push(entry(scr.p[0], scr.p[2],
          { turn: co.turn, dir: co.dir, radiusM: co.radiusM, severity: co.severity }));
      }
      cornersOnMap.sort((a, b) => a.distM - b.distM);

      // Individually notable structures (not the repeated tree/bush dressing).
      const NOTABLE = ["grandstand", "building", "tower", "house", "motorhome",
                       "mountain", "gantry", "structure", "billboard"];
      const landmarks = [];
      if (reg) {
        for (const q of reg.list) {
          if (NOTABLE.indexOf(q.kind) < 0) continue;
          if (Math.hypot(q.x - ox, q.z - oz) > radius * 1.4) continue;
          landmarks.push(entry(q.x, q.z, { kind: q.kind, sizeM: [q.w, q.h, q.d] }));
        }
        landmarks.sort((a, b) => a.distM - b.distM);
      }

      // A metric ruler so any glyph converts to metres without arithmetic.
      const tick = (n) => { let s = ""; for (let i = 0; i < cols; i++)
        s += (i === cc ? "|" : i % 10 === cc % 10 ? "'" : " "); return s; };
      const ruler = tick();
      const rulerLabel = (() => {
        const chars = new Array(cols).fill(" ");
        for (let i = 0; i < cols; i += 10) {
          const m = Math.round((i - cc) * mPerCol);
          const lab = (m > 0 ? "+" : "") + m;
          for (let j = 0; j < lab.length && i + j < cols; j++) chars[i + j] = lab[j];
        }
        return chars.join("").replace(/\s+$/, "");
      })();

      const p2 = G.player;
      const ego = p2 && p2.px != null ? {
        headingDeg: r1((p2.head || 0) * 180 / Math.PI),
        speedKph: r1((p2.speed || 0) * 3.6),
        elevationM: (Tracks.sample(G.track, p2.s, scr), r1(scr.p[1])),
        onTrackFrac: +(p2.s / total).toFixed(4),
        lateralM: r2(p2.x || 0),
        nextCorner: nextCorner(p2.s, p2.speed || 0),
      } : null;

      return {
        apiVersion: API_VERSION, conventions: CONVENTIONS,
        frame,
        origin: { x: r1(ox), z: r1(oz),
                  headingDeg: p && p.head != null ? r1(p.head * 180 / Math.PI) : null,
                  onTrackFrac: p && p.s != null ? +(p.s / total).toFixed(4) : null },
        scale: { radiusM: radius, metresPerCol: r2(mPerCol), metresPerRow: r2(mPerRow),
                 cols, rows,
                 note: "cell (col,row) from centre = ((col-" + cc
                       + ")*mPerCol, (row-" + cr + ")*mPerRow) in the "
                       + (carUp ? "car frame: -row = ahead, +col = right"
                                : "world frame: -row = north(-z), +col = east(+x)") },
        grid: { lines, ruler, rulerLabel,
                note: "ruler ' marks every 10 cols, | is centre; rulerLabel gives "
                      + "the metres east/right at those ticks" },
        legend,
        ego,
        corners: cornersOnMap,
        landmarks,
        cars: cars.sort((a, b) => Math.hypot(a.aheadM, a.rightM) - Math.hypot(b.aheadM, b.rightM)),
        sceneryCounts: counts,
        note: "top-down map with a metric index. The raster is the gestalt; "
              + "corners/landmarks/cars carry exact cell + world coords + bearing "
              + "so nothing needs measuring off the characters. {northUp:true} for "
              + "the world frame, {radiusM} to zoom.",
      };
    }

    return { frame, plan, carRender };
  }

  return { create };
})();
