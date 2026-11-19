const SceneryStructures = (function () {
  "use strict";

  function create(ctx) {
    const { out, track, def, n, ds, hw, px, py, pz, NIGHT, MAT,
            indexBarrier,
            addBox, addCyl, addFrustum, addPrism, RAW, blockAt, post, recordBarrier,
            groundYAt, terrainYAt, onTrack, overheadSpan, hash, cross, norm, vadd,
            anchor, rejBox } = ctx;
    Log.info("scenery", "scenery-structures dress " + (def && def.id));
    const { SIGN_SEG, SIGN_DIGIT, CROWD_DAY } = TrackSceneryData;

    const laid = new Map();
    let reLaidWarned = false;
    const alreadyLaid = (kind, s0, s1, side, gap, style) => {
      const key = `${kind}|${side}|${Math.round(gap * 10)}|${style || ""}`;
      const runs = laid.get(key) || [];
      const a = s0 % 1, full = Math.abs(s1 - s0) >= 0.999;
      let b = s1 > s0 && s1 % 1 === 0 ? 1 : s1 % 1;
      if (!full && b < a) b += 1;
      const within = (ra, rb) => [0, 1, -1].some((o) => a + o >= ra - 1e-6 && b + o <= rb + 1e-6);
      for (const [ra, rb] of runs) {
        const rFull = Math.abs(rb - ra) >= 0.999;
        if (rFull || (!full && within(ra, rb))) {
          if (!reLaidWarned) {
            reLaidWarned = true;
            Log.warn("scenery", `${def && def.id}: ${kind} re-laid over ${ra.toFixed(3)}..${rb.toFixed(3)} ` +
              `at side=${side} gap=${gap} — the second run would be coincident geometry, skipped`);
          }
          return true;
        }
      }
      runs.push([a, full ? a + 1 : b]);
      laid.set(key, runs);
      return false;
    };
    const walked = new Map();
    const along = (s0, s1, stepM, fn, tag) => {
      const k0 = ((Math.round(s0 * n) % n) + n) % n, k1 = ((Math.round(s1 * n) % n) + n) % n;
      const wrapped = ((k1 - k0) + n) % n;
      const span = wrapped === 0 && Math.abs(s1 - s0) > 0.5 ? n - 1 : wrapped;
      const step = Math.max(1, Math.round(stepM / ds));
      let seen = null, i0 = 0;
      if (tag) {
        seen = walked.get(tag);
        if (!seen) walked.set(tag, seen = new Set());
        for (let d = 1; d < step; d++) {
          if (seen.has((k0 - d + n) % n)) { i0 = step - d; break; }
        }
      }
      for (let i = i0; i <= span; i += step) {
        const k = (k0 + i) % n;
        if (seen) {
          if (seen.has(k)) continue;
          seen.add(k);
        }
        fn(k, step * ds);
      }
    };
    const wall = (s0, s1, side, gap, h, col, thick, alt) => {
      const a = thick || 0.5;
      if (alreadyLaid("wall", s0, s1, side, gap, `${a}|${h}|${(col || []).join(",")}`)) return;
      ctx.noteSpan("wall", s0, s1, side, gap, { h });
      recordBarrier(s0, s1, side, gap);
      let n = 0;
      along(s0, s1, 6, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], a / 2)) {
          ctx.noteSuppressed("wall", `wall SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        const wallCol = col || [0.78, 0.78, 0.80];
        const capCol = [wallCol[0] * 0.72, wallCol[1] * 0.72, wallCol[2] * 0.74];
        const t = alt && (n++ & 1) ? a + alt : a;
        ctx.instance(`wall|${t}|${h}|${wallCol.join(",")}`,
          { o: p.c, r: p.r, u: p.u, t: p.t, s: [1, 1, spacing] },
          (rec) => {
            rec.box([0, (h - 0.4) / 2, 0], [t, h + 0.4, 1], wallCol);
            rec.box([0, h, 0], [t * 1.1, 0.16, 1], capCol);
          },
          { kind: "wall", k, side });
      }, `wall|${side}|${gap}|${a}|${h}|${(col || []).join(",")}`);
    };
    const kitOf = ctx.kitOf;

    const fence = (s0, s1, side, gap, h, col, opts) => {
      const st = (opts && opts.style) || kitOf("fence", "mesh");
      if (alreadyLaid("fence", s0, s1, side, gap, `${st}|${h}|${(col || []).join(",")}`)) return;
      ctx.noteSpan("fence", s0, s1, side, gap, { h });
      indexBarrier(s0, s1, side, gap);
      const postCol = (opts && opts.postCol) || [0.28, 0.28, 0.30];
      const meshCol = col || [0.72, 0.74, 0.78];
      const postKey = `fence-post|unit|${st}|${postCol.join(",")}`;
      const meshKey = `fence-mesh|${h}|${st}|${meshCol.join(",")}`
        + (st === "leaning" ? `|${side}` : "");
      along(s0, s1, 5, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 0.5)) {
          ctx.noteSuppressed("fence", `fence SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        const place = { o: p.c, r: p.r, u: p.u, t: p.t };
        const terrain = Tracks.terrainY(track, p.c[0], p.c[2]);
        const ground = Number.isFinite(terrain) ? terrain
          : track.surface && track.surface.floorY;
        const uy = p.u[1];
        const extra = Number.isFinite(ground) && Number.isFinite(uy) && uy > 0.1
          ? Math.max(0, (p.c[1] - ground) / uy - 0.4) : 0;
        const postPlace = { o: vadd(p.c, p.u, -0.4 - extra),
                            r: p.r, u: p.u, t: p.t, s: [1, h + 0.4 + extra, 1] };
        ctx.instance(postKey, postPlace,
          (rec) => {
            rec.cyl([0, 0, 0], 0.13, 1, postCol, 5);
          },
          { kind: "fence", k, side });
        const span = Object.assign({ s: [1, 1, spacing] }, place);
        ctx.instance(meshKey, span,
          (rec) => {
            if (st === "chainlink") {
              rec.box([0, h * 0.95, 0], [0.07, 0.07, 1], meshCol);
            } else if (st === "panelled") {
              for (const f of [0.30, 0.90])
                rec.box([0, h * f, 0], [0.09, 0.14, 1], meshCol);
            } else if (st === "hoarding") {
              rec.box([0, h * 0.52, 0], [0.09, h * 0.95, 1], meshCol);
              rec.box([0, h * 1.00, 0], [0.14, 0.10, 1], postCol);
            } else if (st === "palisade") {
              for (let i = 0; i < 3; i++)
                rec.box([0, h * 0.55, (i - 1) * 0.30], [0.06, h * 0.9, 0.09], meshCol);
              rec.box([0, h * 0.95, 0], [0.08, 0.07, 1], postCol);
            } else if (st === "leaning") {
              rec.box([0, h * 0.50, 0], [0.05, h * 0.80, 1], meshCol);
              rec.box([-side * h * 0.09, h * 0.95, 0], [h * 0.20, 0.05, 1], meshCol);
            } else {
              rec.box([0, h * 0.55, 0], [0.05, h * 0.9, 1], meshCol);
            }
          },
          { kind: "fence", k, side });
      }, `fence|${side}|${gap}|${postKey}|${meshKey}`);
    };
    const guardrail = (s0, s1, side, gap, col, opts) => {
      const st = (opts && opts.style) || kitOf("rail", "armco");
      if (alreadyLaid("guardrail", s0, s1, side, gap, st + "|" + (col || []).join(","))) return;
      ctx.noteSpan("guardrail", s0, s1, side, gap);
      recordBarrier(s0, s1, side, gap);
      const postCol = (opts && opts.postCol) || [0.5, 0.5, 0.52];
      const railCol = col || [0.82, 0.82, 0.85];
      const postKey = `guardrail-post|${st}|${postCol.join(",")}`;
      const railKey = `guardrail-rail|${st}|${railCol.join(",")}`;
      const railMargin = Math.min(0.5, gap * 0.5);
      along(s0, s1, 4, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], railMargin)) {
          ctx.noteSuppressed("guardrail", `guardrail SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        const place = { o: p.c, r: p.r, u: p.u, t: p.t };
        if (st !== "jersey")
          ctx.instance(postKey, place,
            (rec) => rec.cyl([0, -0.35, 0], 0.09, st === "doubleArmco" ? 1.45 : st === "cable" ? 1.35 : 1.05, postCol, 4),
            { kind: "guardrail", k, side });
        ctx.instance(railKey,
          Object.assign({ s: [1, 1, spacing] }, place),
          (rec) => {
            if (st === "doubleArmco") {
              rec.box([0, 0.62, 0], [0.18, 0.38, 1], railCol);
              rec.box([0, 1.16, 0], [0.18, 0.38, 1], railCol);
            } else if (st === "wArmco") {
              rec.box([0, 0.72, 0], [0.20, 0.44, 1], railCol);
              rec.box([-0.07, 0.72, 0], [0.09, 0.16, 1], railCol);
            } else if (st === "jersey") {
              rec.box([0, 0.26, 0], [0.60, 0.52, 1], railCol);
              rec.box([0, 0.72, 0], [0.30, 0.46, 1], railCol);
            } else if (st === "cable") {
              for (const y of [0.58, 0.95])
                rec.box([0, y, 0], [0.07, 0.07, 1], railCol);
            } else if (st === "safer") {
              rec.box([0, 0.70, 0], [0.34, 0.62, 1], railCol);
              rec.box([0, 1.04, 0], [0.38, 0.10, 1], postCol);
            } else {
              rec.box([0, 0.7, 0], [0.18, 0.45, 1], railCol);
            }
          },
          { kind: "guardrail", k, side });
      }, `guardrail|${side}|${gap}|${postKey}|${railKey}`);
    };
    const tyreWall = (s0, s1, side, gap, capCol, opts) => {
      const st = (opts && opts.style) || kitOf("tyre", "stack");
      if (alreadyLaid("tyreWall", s0, s1, side, gap, st + "|" + (capCol || []).join(","))) return;
      ctx.noteSpan("tyreWall", s0, s1, side, gap);
      recordBarrier(s0, s1, side, gap);
      const tyre = (opts && opts.tyreCol) || [0.10, 0.10, 0.11];
      const cap = capCol || [0.9, 0.9, 0.92];
      const slab = st === "tecpro" || st === "airfence";
      const stackKey = `tyre-stack|${st}|${tyre.join(",")}` + (slab ? `|${cap.join(",")}` : "");
      const capKey = `tyre-cap|${st}|${(slab ? tyre : cap).join(",")}`;
      along(s0, s1, 3.4, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 1.0)) {
          ctx.noteSuppressed("tyreWall", `tyreWall SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        const place = { o: p.c, r: p.r, u: p.u, t: p.t };
        ctx.instance(stackKey, place,
          (rec) => {
            if (st === "tecpro") {
              rec.box([0, 0.20, 0], [1.5, 1.2, 1.6], cap);
              rec.box([0, 0.86, 0], [1.5, 0.14, 1.6], tyre);
            } else if (st === "airfence") {
              rec.frustum([0, -0.35, 0], 1.05, 0.72, 1.45, cap, 8);
            } else {
              rec.cyl([0, -0.35, 0], 1.0, 1.25, tyre, 7);
            }
          },
          { kind: "tyreWall", k, side });
        ctx.instance(capKey,
          Object.assign({ s: [1, 1, spacing] }, place),
          (rec) => {
            if (st === "tecpro") rec.box([0, 0.98, 0], [1.7, 0.16, 1], tyre);
            else if (st === "airfence") rec.box([0, 1.14, 0], [1.5, 0.14, 1], tyre);
            else rec.box([0, 0.95, 0], [2.0, 0.3, 1], cap);
          },
          { kind: "tyreWall", k, side });
      }, `tyreWall|${side}|${gap}|${stackKey}|${capKey}`);
    };
    const gantry = (s, h, col, opts) => {
      const st = (opts && opts.style) || kitOf("gantry", "box");
      const k = ((Math.round(s * n) % n) + n) % n, c = col || [0.16, 0.16, 0.19];
      const aL = anchor(k, -1, 1.5), aR = anchor(k, 1, 1.5), u = aL.u;
      const beam = [px[k] + u[0] * h, py[k] + u[1] * h, pz[k] + u[2] * h];
      const housing = vadd(beam, u, -0.62);
      ctx.note("gantry", [(aL.c[0] + aR.c[0]) / 2, aL.c[1] + h / 2,
                          (aL.c[2] + aR.c[2]) / 2],
               [Math.hypot(aR.c[0] - aL.c[0], aR.c[2] - aL.c[2]), h, 1],
               { k, side: 0, lamp: housing, face: 0.30 });
      const b = [aL.r, u, aL.t];
      const uy = Math.max(0.5, u[1]);
      const legH = (aC) => (h - 0.45) + (py[k] - aC[1]) / uy + 0.3;
      const mast = (aC, basis) => {
        const L = legH(aC);
        if (st === "truss") {
          for (const [dr, dt] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
            addCyl(out, vadd(vadd(aC, basis[0], dr * 0.55), basis[2], dt * 0.55),
              0.11, L, c, 4, basis);
          for (let i = 0; i < Math.max(2, Math.floor(L / 3)); i++)
            addBox(out, vadd(aC, basis[1], (i + 0.5) * (L / Math.max(2, Math.floor(L / 3)))),
              [1.3, 0.10, 1.3], c, basis);
        } else if (st === "portal") {
          addBox(out, vadd(aC, basis[1], L / 2), [1.5, L, 1.1], c, basis);
          addBox(out, vadd(aC, basis[1], L - 1.2), [2.2, 1.0, 1.5], c, basis);
        } else if (st === "scaffold") {
          for (const dt of [-0.5, 0.5])
            addCyl(out, vadd(aC, basis[2], dt), 0.09, L, c, 4, basis);
          for (let i = 0; i < Math.max(2, Math.floor(L / 2.2)); i++)
            addBox(out, vadd(aC, basis[1], (i + 0.5) * (L / Math.max(2, Math.floor(L / 2.2)))),
              [0.16, 0.10, 1.3], c, basis);
        } else if (st === "cantilever") {
          addCyl(out, aC, 0.42, L, c, 8, basis);
          addBox(out, vadd(vadd(aC, basis[1], L * 0.72), basis[0], 0),
            [1.0, 0.5, 0.9], c, basis);
        } else {
          addCyl(out, aC, 0.3, L, c, 6, basis);
        }
      };
      mast(aL.c, b);
      if (st !== "cantilever") mast(aR.c, [aR.r, u, aR.t]);
      if (post) {
        const legX = { truss: 0.66, portal: 0.75, scaffold: 0.09, cantilever: 0.42, box: 0.3 }[st] || 0.3;
        const legZ = { truss: 0.66, portal: 0.55, scaffold: 0.65, cantilever: 0.42, box: 0.3 }[st] || 0.3;
        post(k, -1, 1.5, legX, legZ);
        if (st !== "cantilever") post(k, 1, 1.5, legX, legZ);
      }
      overheadSpan({
        id: `gantry-${k}`, frac: s, clearance: h - 0.45,
        thickness: 0.9, depth: 1.4, span: hw[k] * 2 + 5,
        color: c,
        supports: st !== "cantilever",
      });
      const gl = NIGHT ? [0.30, 0.31, 0.34] : [0.16, 0.16, 0.19];
      RAW.addBox(out, housing, [4.9, 0.45, 0.5], gl, b);
    };
    const flagQuad = (c, t, u, w, h, col, still) => {
      const nv = norm(cross(t, u));
      const push = (reverse) => {
        const base = out.pos.length / 3;
        for (const [ft, fu] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          out.pos.push(c[0] + t[0] * ft * w + u[0] * fu * h,
                       c[1] + t[1] * ft * w + u[1] * fu * h,
                       c[2] + t[2] * ft * w + u[2] * fu * h);
          out.nrm.push(nv[0], nv[1], nv[2]);
          out.col.push(col[0], col[1], col[2]);
          out.mat.push(still ? 0 : MAT.FLAG + ft * 0.4);
        }
        if (reverse) out.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        else out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };
      push(false); push(true);
    };
    const MARSHAL_PANEL = [0.06, 0.06, 0.07];
    const marshalPost = (k, side, gap, opts) => {
      const st = (opts && opts.style) || kitOf("marshal", "hut");
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 3)) {
        ctx.noteSuppressed("marshalPost", `marshalPost SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
        return;
      }
      const POLE_LAT = 1.12;
      const polePos = vadd(p.c, p.r, side * POLE_LAT), panelAt = vadd(polePos, p.u, 3.3);
      const panel = vadd(vadd(vadd(panelAt, p.t, 0.525), p.u, 0.31), p.r, -side * 0.12);
      ctx.note("marshalPost", [p.c[0], p.c[1] + 1.2, p.c[2]], [1.2, 2.4, 1.2], { k, side, panel });
      const roof = (opts && opts.roofCol) || [0.95, 0.55, 0.08];
      ctx.instance(`marshalPost|${st}|${side}|${roof.join(",")}`,
        { o: p.c, r: p.r, u: p.u, t: p.t }, (rec) => {
        if (st === "cabin") {
          rec.box([0, 1.0, 0], [2.0, 2.8, 2.6], [0.52, 0.40, 0.28]);
          rec.prism([0, 2.30, 0], [2.2, 1.0, 2.4], roof);
          rec.box([-side * 0.95, 0.55, 0], [0.22, 1.8, 2.6], [0.40, 0.31, 0.22]);
        } else if (st === "container") {
          rec.box([0, 1.0, 0], [2.4, 2.6, 5.4], [0.28, 0.44, 0.40]);
          rec.box([0, 1.0, 0], [2.5, 1.0, 5.5], [0.22, 0.37, 0.34]);
          rec.box([-side * 1.2, 1.0, 1.4], [0.10, 2.0, 1.8], roof);
        } else if (st === "kiosk") {
          for (const [dr, dt] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
            rec.cyl([dr * 0.95, -0.35, dt * 0.95], 0.07, 2.9, [0.55, 0.56, 0.60], 4);
          rec.box([0, 1.5, 0], [1.9, 1.5, 1.9], [0.32, 0.44, 0.52]);
          rec.box([0, 2.20, 0], [2.6, 0.20, 2.6], roof);
        } else if (st === "bunker") {
          rec.box([0, 0.55, 0], [3.0, 1.9, 3.0], [0.70, 0.70, 0.67]);
          rec.box([-side * 1.5, 0.95, 0], [0.14, 0.5, 2.2], [0.12, 0.13, 0.15]);
          rec.box([0, 1.6, 0], [3.4, 0.3, 3.4], roof);
          rec.box([side * 1.9, 0.25, 0], [1.6, 1.0, 3.4], [0.44, 0.40, 0.28]);
        } else if (st === "tent") {
          for (const [dr, dt] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
            rec.cyl([dr * 1.1, -0.35, dt * 1.1], 0.06, 2.7, [0.60, 0.61, 0.64], 4);
          rec.mat(MAT.FABRIC);
          rec.prism([0, 2.25, 0], [2.8, 0.8, 2.8], roof);
          rec.mat(0);
        } else if (st === "tower") {
          for (const [dr, dt] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
            rec.cyl([dr * 1.0, -0.35, dt * 1.0], 0.09, 3.6, [0.46, 0.47, 0.50], 4);
          rec.box([0, 3.3, 0], [2.6, 0.2, 2.6], [0.62, 0.63, 0.66]);
          rec.box([0, 3.35, 0], [2.6, 0.9, 0.10], roof);
          rec.box([side * 1.3, 1.6, 0], [0.10, 3.4, 0.6], [0.46, 0.47, 0.50]);
        } else {
          rec.box([0, 1.1, 0], [2.2, 3.0, 2.2], [0.85, 0.86, 0.88]);
          rec.prism([0, 2.40, 0], [2.6, 1.0, 2.6], roof);
          rec.box([-side * 1.12, 0.55, 0], [0.12, 1.3, 0.9], [0.20, 0.21, 0.24]);
          rec.box([-side * 1.12, 1.8, 0.6], [0.08, 0.6, 0.6], [0.34, 0.46, 0.55]);
        }
        rec.cyl([side * POLE_LAT, -1.0, 0], 0.08, 5.0, [0.4, 0.4, 0.42], 4);
        rec.box([side * (POLE_LAT * 0.5), 1.55, 0], [POLE_LAT, 0.14, 0.14], [0.4, 0.4, 0.42]);
      }, { kind: "marshalPost", k, side });
      flagQuad(panelAt, p.t, p.u, 1.05, 0.62, MARSHAL_PANEL, true);
      if (NIGHT) addBox(out, vadd(polePos, p.u, 4.12), [0.24, 0.24, 0.24], [1.32, 0.72, 0.28], b);
      blockAt(k, side, gap, 1.3);
    };
    const cameraTower = (k, side, gap, opts) => {
      opts = opts || {};
      const h = Math.max(5, Math.min(40, opts.h != null ? opts.h : 14));
      const col = opts.col || [0.40, 0.42, 0.46];
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      const legR = 1.1;
      if (rejBox(vadd(p.c, p.u, h / 2), [legR * 2 + 0.6, h, legR * 2 + 0.6], b)) {
        ctx.noteSuppressed("cameraTower", `cameraTower SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
        return;
      }
      const cst = opts.style || kitOf("camera", "lattice");
      if (cst === "monopole") {
        addFrustum(out, vadd(p.c, p.u, -0.4), 0.46, 0.24, h + 0.8, col, 8, b);
      } else if (cst === "scaffold") {
        for (const sr of [-1, 1]) for (const st of [-1, 1])
          addCyl(out, vadd(vadd(vadd(p.c, p.r, sr * legR * 0.7), p.t, st * legR * 0.7),
            p.u, -0.4), 0.09, h + 0.8, col, 4, b);
        for (let i = 1; i < Math.max(2, Math.round(h / 2.2)); i++)
          addBox(out, vadd(p.c, p.u, (i / Math.max(2, Math.round(h / 2.2))) * h),
            [legR * 1.5, 0.09, legR * 1.5], col, b);
      } else {
        for (const sr of [-1, 1]) for (const st of [-1, 1]) {
          const foot = vadd(vadd(p.c, p.r, sr * legR), p.t, st * legR);
          addCyl(out, vadd(foot, p.u, -0.4), 0.13, h + 0.8, col, 4, b);
        }
        const bays = Math.max(1, Math.round(h / 3));
        for (let i = 1; i < bays; i++) {
          const y = (i / bays) * h;
          for (const sr of [-1, 1])
            addBox(out, vadd(vadd(p.c, p.r, sr * legR), p.u, y), [0.1, 0.12, legR * 2], col, b);
          for (const st of [-1, 1])
            addBox(out, vadd(vadd(p.c, p.t, st * legR), p.u, y), [legR * 2, 0.12, 0.1], col, b);
        }
      }
      addBox(out, vadd(p.c, p.u, h), [3.0, 0.2, 3.0], [0.52, 0.54, 0.58], b);
      addBox(out, vadd(vadd(p.c, p.r, -side * 1.4), p.u, h + 0.55), [0.09, 0.90, 3.0], opts.railCol || [0.70, 0.72, 0.76], b);
      const head = vadd(vadd(p.c, p.u, h + 0.85), p.r, -side * (opts.boom != null ? opts.boom : 1.1));
      addBox(out, head, [0.75, 0.45, 0.5], [0.12, 0.12, 0.14], b);
      addCyl(out, vadd(head, p.r, -side * 0.42), 0.16, 0.3, [0.06, 0.06, 0.08], 6,
             [p.u, p.r, p.t]);
      blockAt(k, side, gap, legR + 0.4);
    };

    const sponsorHoarding = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const h = opts.h != null ? opts.h : 1.15;
      const step = opts.step || 9;
      const postCol = opts.postCol || [0.24, 0.25, 0.28];
      const hst = opts.style || kitOf("hoarding", "panel");
      const pal = (opts.palette && opts.palette.length) ? opts.palette : [
        [0.86, 0.16, 0.14], [0.94, 0.92, 0.90], [0.10, 0.34, 0.72],
        [0.96, 0.76, 0.06], [0.12, 0.52, 0.30], [0.16, 0.17, 0.20],
      ];
      let idx = 0;
      along(s0, s1, step, (k, spacing) => {
        const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
        const panel = spacing * 0.92;
        const c = vadd(p.c, p.u, 0.45 + h / 2);
        if (rejBox(c, [0.16, h, panel], b)) return;
        const col = pal[idx % pal.length];
        if (hst === "banner") {
          out._mat = MAT.FABRIC;
          addBox(out, vadd(c, p.u, 0.35), [0.08, h * 1.15, panel * 0.94], col, b);
          out._mat = 0;
          for (const st of [-1, 1])
            addCyl(out, vadd(vadd(p.c, p.t, st * panel * 0.47), p.u, -0.3), 0.07, h + 2.2, postCol, 4, b);
        } else if (hst === "barrierTop") {
          addBox(out, vadd(c, p.u, 0.35), [0.14, h * 0.9, panel], col, b);
        } else if (hst === "double") {
          addBox(out, c, [0.16, h, panel], col, b);
          addBox(out, vadd(c, p.u, h * 0.92), [0.16, h * 0.8, panel], pal[(idx + 1) % pal.length], b);
          for (const st of [-1, 1])
            addBox(out, vadd(vadd(p.c, p.t, st * panel * 0.36), p.u, 0.22),
                   [0.13, 0.9, 0.14], postCol, b);
        } else if (hst === "led") {
          const lit = NIGHT ? [Math.min(1.4, col[0] * 1.35 + 0.1), Math.min(1.4, col[1] * 1.35 + 0.1),
                               Math.min(1.4, col[2] * 1.35 + 0.1)] : col;
          addBox(out, c, [0.12, h, panel], lit, b);
          addBox(out, vadd(c, p.u, h * 0.56), [0.2, 0.12, panel], postCol, b);
          for (const st of [-1, 1])
            addBox(out, vadd(vadd(p.c, p.t, st * panel * 0.36), p.u, 0.22),
                   [0.07, 0.9, 0.10], postCol, b);
        } else {
          addBox(out, c, [0.16, h, panel], col, b);
          for (const st of [-1, 1])
            addBox(out, vadd(vadd(p.c, p.t, st * panel * 0.36), p.u, 0.22),
                   [0.13, 0.9, 0.14], postCol, b);
        }
        idx++;
      }, `hoarding|${side}|${gap}|${h}|${hst}|${step}`);
    };

    const { bleacher, scaffoldStand, terrace, tieredBowl } = SceneryStands.create(ctx, along);

    const signDigit = (c, r, u, t, w, h, proud, col, digit) => {
      const segs = SIGN_DIGIT[digit] ?? SIGN_DIGIT[0];
      const base = vadd(c, r, proud);
      for (const name of segs) {
        const [x0, x1, y0, y1] = SIGN_SEG[name];
        const cc = vadd(vadd(base, t, (x0 + x1) / 2 * w - w / 2), u, (y0 + y1) / 2 * h - h / 2);
        addBox(out, cc, [0.03, (y1 - y0) * h, (x1 - x0) * w], col, [r, u, t]);
      }
    };
    const signBoard = (k, side, gap, kind, value) => {
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 1.5)) {
        ctx.noteSuppressed("signBoard", `signBoard SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
        return;
      }
      ctx.note("signBoard", [p.c[0], p.c[1] + 1, p.c[2]], [2.5, 2, 0.3], { k, side, board: kind, value });
      const postH = 1.35;
      const proud = -side * 0.05;
      addCyl(out, vadd(p.c, p.u, -0.3), 0.06, postH + 0.3, [0.55, 0.55, 0.58], 4, b);
      if (kind === "speed") {
        const R = 0.52, cc = vadd(p.c, p.u, postH + R);
        const fwd = [-side * p.r[0], -side * p.r[1], -side * p.r[2]];
        const db = [p.u, fwd, p.t];
        if (addCyl(out, cc, R, 0.05, [0.85, 0.16, 0.14], 12, db) === false) return;
        if (addCyl(out, vadd(cc, fwd, 0.02), R * 0.80, 0.05, [0.95, 0.95, 0.93], 12, db) === false) return;
        const digs = String(Math.max(10, Math.min(99, value || 80))).split("").map(Number);
        digs.forEach((d, i) => {
          const dc = vadd(cc, p.t, (i - (digs.length - 1) / 2) * 0.36);
          signDigit(dc, p.r, p.u, p.t, 0.34, 0.62, -side * 0.06, [0.10, 0.10, 0.12], d);
        });
      } else if (kind === "braking") {
        const w2 = 1.3, h2 = 0.9, cc = vadd(p.c, p.u, postH + h2 / 2);
        if (addBox(out, cc, [0.05, h2, w2], [0.92, 0.92, 0.90], b) === false) return;
        const nStripes = Math.max(1, Math.min(3, value || 2));
        const diagU = norm([p.u[0] + p.t[0], p.u[1] + p.t[1], p.u[2] + p.t[2]]);
        for (let i = 0; i < nStripes; i++) {
          const sx = (i - (nStripes - 1) / 2) * (w2 / (nStripes + 0.4));
          const sc = vadd(vadd(cc, p.t, sx), p.r, proud);
          addBox(out, sc, [0.02, h2 * 1.15, 0.16], [0.85, 0.15, 0.13], [p.r, diagU, p.t]);
        }
      } else {
        const w2 = 1.0, h2 = 0.85, cc = vadd(p.c, p.u, postH + h2 / 2);
        if (addBox(out, cc, [0.05, h2, w2], [0.92, 0.92, 0.90], b) === false) return;
        const digs = String(Math.max(1, Math.min(99, value || 1))).split("").map(Number);
        digs.forEach((d, i) => {
          const dc = vadd(cc, p.t, (i - (digs.length - 1) / 2) * 0.38);
          signDigit(dc, p.r, p.u, p.t, 0.36, 0.58, proud, [0.10, 0.10, 0.12], d);
        });
      }
    };
    function ferrisWheel(k, side, dist, radius) {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const tl = Math.hypot(track.tx[k], track.tz[k]) || 1;
      const tn = [track.tx[k] / tl, 0, track.tz[k] / tl];
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      const ty = typeof terrainYAt === "function" ? terrainYAt(cx, cz) : null;
      const gy = ty != null ? ty : groundYAt(k, dist);
      const hubY = gy + radius + 5;
      const hub = [cx, hubY, cz];
      for (const lo of [-3, 3]) {
        addBox(out, [cx + tn[0] * lo, gy + (hubY - gy) / 2 - 0.5, cz + tn[2] * lo],
               [1.6, hubY - gy + 0.4, 1.6], [0.32, 0.33, 0.38]);
      }
      addBox(out, hub, [3, 3, 3], [0.3, 0.3, 0.34]);
      const seg = 16;
      const wheelCol = NIGHT ? [0.30, 0.31, 0.4] : [0.62, 0.63, 0.68];
      const rim = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        rim.push([hub[0] + tn[0] * ca * radius, hub[1] + sa * radius, hub[2] + tn[2] * ca * radius]);
      }
      const strut = (p0, p1, thick, col, ax) => {
        const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || 1;
        const up = [d[0] / L, d[1] / L, d[2] / L];
        let rr = norm(cross(up, tn)); if (!isFinite(rr[0])) rr = [1, 0, 0];
        const ff = norm(cross(up, rr));
        const o = ax || 0;
        addBox(out, [(p0[0] + p1[0]) / 2 + tn[0] * o, (p0[1] + p1[1]) / 2 + tn[1] * o, (p0[2] + p1[2]) / 2 + tn[2] * o],
               [thick, L, thick], col, [rr, up, ff]);
      };
      const HUB_R = 1.7;
      for (let i = 0; i < seg; i++) {
        const d = [rim[i][0] - hub[0], rim[i][1] - hub[1], rim[i][2] - hub[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || 1;
        const root = [hub[0] + d[0] / L * HUB_R, hub[1] + d[1] / L * HUB_R,
                      hub[2] + d[2] / L * HUB_R];
        strut(root, rim[i], 0.28, wheelCol, i % 2 ? 0.06 : -0.06);
        strut(rim[i], rim[(i + 1) % seg], 0.34, wheelCol, i % 2 ? -0.06 : 0.06);
      }
      for (let i = 0; i < seg; i++) {
        const cab = NIGHT
          ? [[0.95, 0.2, 0.5], [0.2, 0.85, 0.95], [0.95, 0.8, 0.2]][i % 3]
          : (i % 2 ? [0.9, 0.25, 0.25] : [0.95, 0.95, 0.98]);
        addBox(out, [rim[i][0], rim[i][1] - 1.5, rim[i][2]], [2.4, 2.2, 2.4], cab);
      }
      blockAt(k, side, dist - 0.8, 4);
    }

    return { along, wall, fence, guardrail, tyreWall, gantry, flagQuad,
             marshalPost, cameraTower, sponsorHoarding, signDigit, signBoard,
             ferrisWheel,
             bleacher, scaffoldStand, terrace, tieredBowl };
  }

  return { create };
})();
Object.freeze(SceneryStructures);
