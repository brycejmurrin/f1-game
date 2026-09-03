/* Apex 26 — SceneryStructures: the linear track furniture + race-infrastructure band of the buildProps composite-model toolkit — the along() node walker, the barr… */
const SceneryStructures = (function () {
  "use strict";

  function create(ctx) {
    const { out, track, def, n, ds, hw, px, py, pz, NIGHT, MAT,
            indexBarrier,
            addBox, addCyl, addFrustum, addPrism, RAW, blockAt, recordBarrier,
            groundYAt, onTrack, overheadSpan, hash, cross, norm, vadd,
            anchor, rejBox } = ctx;
    Log.info("scenery", "scenery-structures dress " + (def && def.id));
    const { SIGN_SEG, SIGN_DIGIT, CROWD_DAY } = TrackSceneryData;

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
      const k0 = ((Math.round(s0 * n) % n) + n) % n, k1 = ((Math.round(s1 * n) % n) + n) % n;
      const wrapped = ((k1 - k0) + n) % n;
      // Full lap = endpoints ~a whole lap apart that round to one node. Walk
      // n-1, not n: the old `|| n` walked i===n back onto k0 and emitted a
      // second byte-identical panel there — two coincident boxes, the purest
      // z-fight (see the qatar tyre-pair note in tracks.js). It also promoted
      // a genuinely sub-node authored span to a surprise full lap of geometry;
      // that now stays a single emission at its own node.
      const span = wrapped === 0 && Math.abs(s1 - s0) > 0.5 ? n - 1 : wrapped;
      const step = Math.max(1, Math.round(stepM / ds));
      for (let i = 0; i <= span; i += step) fn((k0 + i) % n, step * ds);
    };
    // Continuous solid wall (concrete / pit wall) at clearance `gap` beyond the edge.
    const wall = (s0, s1, side, gap, h, col, thick) => {
      const a = thick || 0.5;
      ctx.noteSpan("wall", s0, s1, side, gap, { h });
      recordBarrier(s0, s1, side, gap);
      along(s0, s1, 6, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], a / 2)) {
          ctx.noteSuppressed("wall", `wall SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        const wallCol = col || [0.78, 0.78, 0.80];
        const capCol = [wallCol[0] * 0.72, wallCol[1] * 0.72, wallCol[2] * 0.74];
        ctx.instance(`wall|${a}|${h}|${wallCol.join(",")}`,
          { o: p.c, r: p.r, u: p.u, t: p.t, s: [1, 1, spacing] },
          (rec) => {
            rec.box([0, (h - 0.4) / 2, 0], [a, h + 0.4, 1], wallCol);   // slab
            rec.box([0, h, 0], [a * 1.1, 0.16, 1], capCol);            // coping rail on top
          },
          { kind: "wall", k, side });
      });
    };
    const kitOf = ctx.kitOf;

    const fence = (s0, s1, side, gap, h, col, opts) => {
      // Geometry-only registration: a catch fence is solid to scenery but must
      // not move the driving limit (it stands behind the runoff by design).
      // Until this existed, fences were the ONLY barrier class no guard could
      // see — and they are the obstacle in most surviving canopy intersections.
      const st = (opts && opts.style) || kitOf("fence", "mesh");
      ctx.noteSpan("fence", s0, s1, side, gap, { h });
      indexBarrier(s0, s1, side, gap);
      // MODEL KEYS ARE LOOP-INVARIANT — build them once, above the run. Every
      // input (h, st, both tints) is a parameter of this call, so the template
      // literal and its join() rebuilt the SAME string for every post: measured
      // in a title-screen heap snapshot, `fence-post|3.2|panelled|...` and its
      // mesh twin were the two largest duplicate-string families in the JS heap
      // at 569 copies each. The tint arrays hoist for the same reason — the
      // model builder runs once per key, so sharing one array is what the
      // define-once contract already assumes.
      const postCol = (opts && opts.postCol) || [0.28, 0.28, 0.30];
      const meshCol = col || [0.72, 0.74, 0.78];
      const postKey = `fence-post|${h}|${st}|${postCol.join(",")}`;
      // SIDE JOINS THE KEY, BUT ONLY WHERE THE MESH ACTUALLY USES IT. The
      // "leaning" top rail is offset by `-side * h * 0.09`, so its geometry
      // differs per side while the key did not — the first caller's side was
      // baked into the shared instance and the other side's catch-fence leaned
      // AWAY from the track (Monza, Imola, Catalunya). The other styles are
      // side-independent, and the duplicate-string note above is why they keep
      // sharing one key instead of paying for a second family.
      const meshKey = `fence-mesh|${h}|${st}|${meshCol.join(",")}`
        + (st === "leaning" ? `|${side}` : "");
      along(s0, s1, 5, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 0.5)) {
          ctx.noteSuppressed("fence", `fence SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        const place = { o: p.c, r: p.r, u: p.u, t: p.t };
        ctx.instance(postKey, place,                                            // post, base sunk
          (rec) => {
            rec.cyl([0, -0.4, 0], 0.13, h + 0.4, postCol, 5);
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
              // Solid printed sheet — street circuits screen the public road.
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
              rec.box([0, h * 0.55, 0], [0.05, h * 0.9, 1], meshCol);           // mesh (default)
            }
          },
          { kind: "fence", k, side });
      });
    };
    const guardrail = (s0, s1, side, gap, col, opts) => {
      const st = (opts && opts.style) || kitOf("rail", "armco");
      ctx.noteSpan("guardrail", s0, s1, side, gap);
      recordBarrier(s0, s1, side, gap);
      // Keys and tints hoisted for the reason written out over `fence` above.
      const postCol = (opts && opts.postCol) || [0.5, 0.5, 0.52];
      const railCol = col || [0.82, 0.82, 0.85];
      const postKey = `guardrail-post|${st}|${postCol.join(",")}`;
      const railKey = `guardrail-rail|${st}|${railCol.join(",")}`;
      // The on-track margin must stay BELOW the gap: a post anchored at hw+gap
      // sits (hw+gap)·cos(θ/2) from the neighbouring chord, so a fixed 0.5
      // against gap 0.5 failed for ANY curvature and dropped every post of
      // every Monaco armco (220 of them) while recordBarrier still tightened
      // the driving limit to a rail that was not there.
      const railMargin = Math.min(0.5, gap * 0.5);
      along(s0, s1, 4, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], railMargin)) {
          ctx.noteSuppressed("guardrail", `guardrail SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        const place = { o: p.c, r: p.r, u: p.u, t: p.t };
        // A jersey barrier has no posts at all — it is a poured profile.
        if (st !== "jersey")
          ctx.instance(postKey, place,                                          // post, base sunk
            (rec) => rec.cyl([0, -0.35, 0], 0.09, st === "doubleArmco" ? 1.45 : 1.05, postCol, 4),
            { kind: "guardrail", k, side });
        ctx.instance(railKey,
          Object.assign({ s: [1, 1, spacing] }, place),
          (rec) => {
            if (st === "doubleArmco") {                    // old European two-rail
              rec.box([0, 0.62, 0], [0.18, 0.38, 1], railCol);
              rec.box([0, 1.16, 0], [0.18, 0.38, 1], railCol);
            } else if (st === "wArmco") {                  // the W cross-section
              rec.box([0, 0.72, 0], [0.20, 0.44, 1], railCol);
              rec.box([-0.07, 0.72, 0], [0.09, 0.16, 1], railCol);
            } else if (st === "jersey") {                  // poured concrete profile
              rec.box([0, 0.26, 0], [0.60, 0.52, 1], railCol);
              rec.box([0, 0.72, 0], [0.30, 0.46, 1], railCol);
            } else if (st === "cable") {                   // 1970s wire rope
              for (const y of [0.58, 0.95])
                rec.box([0, y, 0], [0.07, 0.07, 1], railCol);
            } else if (st === "safer") {                   // smooth tube over foam
              rec.box([0, 0.70, 0], [0.34, 0.62, 1], railCol);
              rec.box([0, 1.04, 0], [0.38, 0.10, 1], postCol);
            } else {
              rec.box([0, 0.7, 0], [0.18, 0.45, 1], railCol);                   // armco (default)
            }
          },
          { kind: "guardrail", k, side });
      });
    };
    // Stacked-tyre barrier with a coloured conveyor-belt cap.
    //   opts: { style: "stack"(default) | "double" | "pyramid" | "tecpro"
    //                | "airfence", tyreCol }
    // BUDGET NOTE: "double" and "pyramid" are 2x and 3x the tyre count. They
    // belong on circuits with measured headroom, never in KIT_DEF — this
    // emitter runs 142 times across 38 circuits.
    const tyreWall = (s0, s1, side, gap, capCol, opts) => {
      const st = (opts && opts.style) || kitOf("tyre", "stack");
      ctx.noteSpan("tyreWall", s0, s1, side, gap);
      recordBarrier(s0, s1, side, gap);
      // Keys and tints hoisted for the reason written out over `fence` above.
      const tyre = (opts && opts.tyreCol) || [0.10, 0.10, 0.11];
      const cap = capCol || [0.9, 0.9, 0.92];
      const stackKey = `tyre-stack|${st}|${tyre.join(",")}`;
      const capKey = `tyre-cap|${st}|${cap.join(",")}`;
      along(s0, s1, 3.4, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 1.0)) {
          ctx.noteSuppressed("tyreWall", `tyreWall SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        // Same split as guardrail: fixed tyre stack, length-scaled conveyor cap.
        const place = { o: p.c, r: p.r, u: p.u, t: p.t };
        ctx.instance(stackKey, place,                                           // base sunk
          (rec) => {
            if (st === "tecpro") {
              rec.box([0, 0.20, 0], [1.5, 1.2, 1.6], cap);
              rec.box([0, 0.86, 0], [1.5, 0.14, 1.6], tyre);
            } else if (st === "airfence") {
              rec.frustum([0, -0.35, 0], 1.05, 0.72, 1.45, cap, 8);
            } else if (st === "pyramid") {
              rec.cyl([0, -0.35, 0], 1.0, 1.25, tyre, 7);
              rec.cyl([side * 1.75, -0.35, 0], 1.0, 1.25, tyre, 7);
              rec.cyl([side * 0.88, 0.90, 0], 0.95, 1.10, tyre, 7);
            } else if (st === "double") {
              rec.cyl([0, -0.35, 0], 1.0, 1.25, tyre, 7);
              rec.cyl([side * 1.85, -0.35, 0], 1.0, 1.25, tyre, 7);
            } else {
              rec.cyl([0, -0.35, 0], 1.0, 1.25, tyre, 7);                       // stack (default)
            }
          },
          { kind: "tyreWall", k, side });
        ctx.instance(capKey,
          Object.assign({ s: [1, 1, spacing] }, place),
          (rec) => {
            if (st === "tecpro") rec.box([0, 0.98, 0], [1.7, 0.16, 1], tyre);
            else if (st === "airfence") rec.box([0, 1.14, 0], [1.5, 0.14, 1], tyre);
            else if (st === "pyramid") rec.box([side * 0.88, 2.05, 0], [2.0, 0.3, 1], cap);
            else if (st === "double") rec.box([side * 0.92, 0.95, 0], [3.8, 0.3, 1], cap);
            else rec.box([0, 0.95, 0], [2.0, 0.3, 1], cap);                     // stack (default)
          },
          { kind: "tyreWall", k, side });
      });
    };
    const gantry = (s, h, col, opts) => {
      const st = (opts && opts.style) || kitOf("gantry", "box");
      const k = Math.round(s * n) % n, c = col || [0.16, 0.16, 0.19];
      const aL = anchor(k, -1, 1.5), aR = anchor(k, 1, 1.5), u = aL.u;
      ctx.note("gantry", [(aL.c[0] + aR.c[0]) / 2, aL.c[1] + h / 2,
                          (aL.c[2] + aR.c[2]) / 2],
               [Math.hypot(aR.c[0] - aL.c[0], aR.c[2] - aL.c[2]), h, 1],
               { k, side: 0 });          // 0 = straddles the road
      const b = [aL.r, u, aL.t];
      const uy = Math.max(0.5, u[1]);
      const legH = (aC) => (h - 0.45) + (py[k] - aC[1]) / uy + 0.3;   // +0.3 into the beam
      const mast = (aC, basis) => {
        const L = legH(aC);
        if (st === "truss") {
          // Four slim uprights on a square, X-braced — a real lattice mast.
          for (const [dr, dt] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
            addCyl(out, vadd(vadd(aC, basis[0], dr * 0.55), basis[2], dt * 0.55),
              0.11, L, c, 4, basis);
          for (let i = 0; i < Math.max(2, Math.floor(L / 3)); i++)
            addBox(out, vadd(aC, basis[1], (i + 0.5) * (L / Math.max(2, Math.floor(L / 3)))),
              [1.3, 0.10, 1.3], c, basis);
        } else if (st === "portal") {
          addBox(out, vadd(aC, basis[1], L / 2), [1.5, L, 1.1], c, basis);      // solid leg
          addBox(out, vadd(aC, basis[1], L - 1.2), [2.2, 1.0, 1.5], c, basis);  // haunch
        } else if (st === "scaffold") {
          for (const dt of [-0.5, 0.5])
            addCyl(out, vadd(aC, basis[2], dt), 0.09, L, c, 4, basis);
          for (let i = 0; i < Math.max(2, Math.floor(L / 2.2)); i++)
            addBox(out, vadd(aC, basis[1], (i + 0.5) * (L / Math.max(2, Math.floor(L / 2.2)))),
              [0.16, 0.10, 1.3], c, basis);
        } else if (st === "cantilever") {
          addCyl(out, aC, 0.42, L, c, 8, basis);                                 // single fat mast
          addBox(out, vadd(vadd(aC, basis[1], L * 0.72), basis[0], 0),
            [1.0, 0.5, 0.9], c, basis);                                          // boom root
        } else {
          addCyl(out, aC, 0.3, L, c, 6, basis);                                  // box (default)
        }
      };
      // A cantilever gantry hangs from ONE side — that is its whole silhouette.
      mast(aL.c, b);
      if (st !== "cantilever") mast(aR.c, [aR.r, u, aR.t]);
      const beam = [px[k] + u[0] * h, py[k] + u[1] * h, pz[k] + u[2] * h];
      // Span legs: half-width + 1.5 m clearance each side + 1 m past each mast.
      overheadSpan({
        id: `gantry-${k}`, frac: s, clearance: h - 0.45,
        thickness: 0.9, depth: 1.4, span: hw[k] * 2 + 5,
        color: c,
      });
      const gl = NIGHT ? [1.28, 1.30, 1.38] : [0.80, 0.81, 0.85];
      const r0 = [track.rx[k], track.ry[k], track.rz[k]];
      for (const lat of [-hw[k] * 0.55, 0, hw[k] * 0.55]) {
        RAW.addBox(out, [beam[0] + r0[0] * lat - u[0] * 0.62,
                         beam[1] + u[1] * (-0.62),
                         beam[2] + r0[2] * lat - u[2] * 0.62],
                   [1.1, 0.35, 1.0], gl, b);
      }
    };
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
    const marshalPost = (k, side, gap, opts) => {
      const st = (opts && opts.style) || kitOf("marshal", "hut");
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 3)) {
        ctx.noteSuppressed("marshalPost", `marshalPost SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
        return;
      }
      ctx.note("marshalPost", [p.c[0], p.c[1] + 1.2, p.c[2]], [1.2, 2.4, 1.2], { k, side });
      const roof = (opts && opts.roofCol) || [0.95, 0.55, 0.08];
      ctx.instance(`marshalPost|${st}|${side}|${roof.join(",")}`,
        { o: p.c, r: p.r, u: p.u, t: p.t }, (rec) => {
        if (st === "cabin") {                          // timber lean-to, open front
          rec.box([0, 1.0, 0], [2.0, 2.8, 2.6], [0.52, 0.40, 0.28]);
          rec.prism([0, 2.7, 0], [2.6, 1.0, 2.8], roof);
          rec.box([-side * 1.0, 0.9, 0], [0.12, 0.9, 2.6], [0.40, 0.31, 0.22]);
        } else if (st === "container") {               // shipping container
          rec.box([0, 1.0, 0], [2.4, 2.6, 5.4], [0.28, 0.44, 0.40]);
          rec.box([0, 1.0, 0], [2.5, 1.0, 5.5], [0.22, 0.37, 0.34]);   // rib band
          rec.box([-side * 1.2, 1.0, 1.4], [0.10, 2.0, 1.8], roof);
        } else if (st === "kiosk") {                   // glazed booth, thin canopy
          for (const [dr, dt] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
            rec.cyl([dr * 0.95, -0.35, dt * 0.95], 0.07, 2.9, [0.55, 0.56, 0.60], 4);
          rec.box([0, 1.5, 0], [1.9, 1.5, 1.9], [0.32, 0.44, 0.52]);
          rec.box([0, 2.6, 0], [2.6, 0.16, 2.6], roof);
        } else if (st === "bunker") {                  // half-buried concrete cell
          rec.box([0, 0.55, 0], [3.0, 1.9, 3.0], [0.70, 0.70, 0.67]);
          rec.box([-side * 1.5, 0.95, 0], [0.14, 0.5, 2.2], [0.12, 0.13, 0.15]);
          rec.box([0, 1.6, 0], [3.4, 0.3, 3.4], roof);
          rec.box([side * 1.9, 0.25, 0], [1.6, 1.0, 3.4], [0.44, 0.40, 0.28]);
        } else if (st === "tent") {                    // fabric awning on poles
          for (const [dr, dt] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
            rec.cyl([dr * 1.1, -0.35, dt * 1.1], 0.06, 2.7, [0.60, 0.61, 0.64], 4);
          rec.mat(MAT.FABRIC);
          rec.prism([0, 2.6, 0], [2.8, 0.8, 2.8], roof);
          rec.mat(0);
        } else if (st === "tower") {                   // raised platform + ladder
          for (const [dr, dt] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
            rec.cyl([dr * 1.0, -0.35, dt * 1.0], 0.09, 3.6, [0.46, 0.47, 0.50], 4);
          rec.box([0, 3.3, 0], [2.6, 0.2, 2.6], [0.62, 0.63, 0.66]);
          rec.box([0, 3.9, 0], [2.6, 0.9, 0.10], roof);
          rec.box([side * 1.3, 1.6, 0], [0.10, 3.4, 0.6], [0.46, 0.47, 0.50]);
        } else {                                       // hut (default): pitched roof + door + window
          rec.box([0, 1.1, 0], [2.2, 3.0, 2.2], [0.85, 0.86, 0.88]);   // wall block, base sunk 0.4, top at 2.6
          rec.prism([0, 2.55, 0], [2.6, 0.85, 2.6], roof);             // pitched roof seated on the wall top (prism is base-anchored)
          rec.box([-side * 1.12, 0.55, 0], [0.12, 1.3, 0.9], [0.20, 0.21, 0.24]); // trackward doorway, proud of the face
          rec.box([-side * 1.12, 1.8, 0.6], [0.08, 0.6, 0.6], [0.34, 0.46, 0.55]); // window pane
        }
        rec.cyl([side * 1.4, -0.35, 0], 0.08, 4.35, [0.4, 0.4, 0.42], 4);   // base sunk
      }, { kind: "marshalPost", k, side });
      const polePos = vadd(p.c, p.r, side * 1.4);
      flagQuad(vadd(polePos, p.u, 3.3), p.t, p.u,
               1.05, 0.62, hash(k) < 0.72 ? [1.30, 1.02, 0.08] : [0.10, 0.42, 1.25]);
      if (NIGHT) addBox(out, vadd(polePos, p.u, 4.12), [0.24, 0.24, 0.24], [1.32, 0.72, 0.28], b);
      blockAt(k, side, gap, 1.3);   // solid hut
    };
    const cameraTower = (k, side, gap, opts) => {
      opts = opts || {};
      const h = Math.max(5, Math.min(40, opts.h != null ? opts.h : 14));
      const col = opts.col || [0.40, 0.42, 0.46];
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      const legR = 1.1;
      // Full-footprint guard: the tower is a ~2.6 m square mass rising the whole
      // height, so test the box, never a single point.
      if (rejBox(vadd(p.c, p.u, h / 2), [legR * 2 + 0.6, h, legR * 2 + 0.6], b)) {
        ctx.noteSuppressed("cameraTower", `cameraTower SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
        return;
      }
      const cst = opts.style || kitOf("camera", "lattice");
      if (cst === "monopole") {
        // One tapered shaft — the modern broadcast mast. Cheapest form here.
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
          addCyl(out, vadd(foot, p.u, -0.4), 0.13, h + 0.8, col, 4, b);   // base-anchored: -0.4 → h+0.4
        }
        // X-bracing every ~3 m — what makes a lattice read as a lattice.
        const bays = Math.max(1, Math.round(h / 3));
        for (let i = 1; i < bays; i++) {
          const y = (i / bays) * h;
          for (const sr of [-1, 1])
            addBox(out, vadd(vadd(p.c, p.r, sr * legR), p.u, y), [0.1, 0.12, legR * 2], col, b);
          for (const st of [-1, 1])
            addBox(out, vadd(vadd(p.c, p.t, st * legR), p.u, y), [legR * 2, 0.12, 0.1], col, b);
        }
      }
      // Platform + rail
      addBox(out, vadd(p.c, p.u, h), [3.0, 0.2, 3.0], [0.52, 0.54, 0.58], b);
      addBox(out, vadd(p.c, p.u, h + 0.55), [3.1, 0.09, 3.1], opts.railCol || [0.70, 0.72, 0.76], b);
      // Camera head on a short boom, pointing back over the track.
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
        if (hst === "banner") {                       // fabric slung between masts
          out._mat = MAT.FABRIC;
          addBox(out, vadd(c, p.u, 0.35), [0.08, h * 1.15, panel * 0.94], col, b);
          out._mat = 0;
          for (const st of [-1, 1])
            addCyl(out, vadd(vadd(p.c, p.t, st * panel * 0.47), p.u, 0.5), 0.07, h + 1.4, postCol, 4, b);
        } else if (hst === "barrierTop") {            // bolted to the armco, no posts
          addBox(out, vadd(c, p.u, 0.35), [0.14, h * 0.9, panel], col, b);
        } else if (hst === "double") {                // two-tier board
          addBox(out, c, [0.16, h, panel], col, b);
          addBox(out, vadd(c, p.u, h * 0.92), [0.16, h * 0.8, panel], pal[(idx + 1) % pal.length], b);
          for (const st of [-1, 1])
            addBox(out, vadd(vadd(p.c, p.t, st * panel * 0.36), p.u, 0.22),
                   [0.13, 0.9, 0.14], postCol, b);
        } else if (hst === "led") {                   // continuous emissive ribbon
          const lit = NIGHT ? [Math.min(1.4, col[0] * 1.35 + 0.1), Math.min(1.4, col[1] * 1.35 + 0.1),
                               Math.min(1.4, col[2] * 1.35 + 0.1)] : col;
          addBox(out, c, [0.12, h, panel], lit, b);
          addBox(out, vadd(c, p.u, h * 0.56), [0.2, 0.12, panel], postCol, b);
        } else {
          addBox(out, c, [0.16, h, panel], col, b);
          // Two stubby posts holding the board clear of the ground.
          for (const st of [-1, 1])
            addBox(out, vadd(vadd(p.c, p.t, st * panel * 0.36), p.u, 0.22),
                   [0.13, 0.9, 0.14], postCol, b);
        }
        idx++;
      });
    };

    // crowdBand(): the ONE crowd primitive these stands share. A crowd is a
    // continuous banded run plus SPARSE SPECKLE standing proud of it — never one
    // box per spectator. At the ~1 m seat pitch the hand-rolled versions used,
    // a single bleacher emitted ~30 bodies per row per bay; that is how Vegas
    // reached 1.8 M prop verts. At night the individual bodies are invisible
    // anyway — what the eye picks up is the scatter of phone screens on top of
    // an unbroken dark mass, which is exactly what the speckle is for.
    // `len` is the ALONG-TRACK segment this band covers (see along()'s contract).
    // `side` is the stand's side, so the speckle can always be nudged TOWARD the
    // track (which is -side along r) rather than into the seating behind it.
    const CROWD_FALLBACK = [[0.86, 0.30, 0.24], [0.92, 0.90, 0.86],
                            [0.24, 0.36, 0.62], [0.72, 0.63, 0.30]];
    const crowdBand = (c, b, side, thick, h, len, pal, dens, seed) => {
      if (len <= 0.5) return;
      const cols = (pal && pal.length) ? pal : (CROWD_DAY && CROWD_DAY.length ? CROWD_DAY : CROWD_FALLBACK);
      const pick = (t) => NIGHT
        ? (t > 0.945 ? [2.5, 2.3, 1.9] : t > 0.55 ? [0.10, 0.11, 0.14] : [0.15, 0.16, 0.20])
        : cols[Math.floor(t * cols.length) % cols.length];
      const prevMat = out._mat;
      out._mat = MAT.FABRIC;
      const bt = hash(seed * 1.7);
      addBox(out, c, [thick, h, len], pick(NIGHT ? Math.min(0.94, bt) : bt), b);
      // One speckle head per ~6 m, capped — the same budget monza's tieredBowl
      // arrived at by hand. Each stands proud of the band (taller, nudged
      // trackward) so it is never coplanar with it: buried inside it would cost
      // vertices and show nothing.
      const cnt = Math.min(16, Math.floor(len / 6));
      for (let i = 0; i < cnt; i++) {
        const hp = hash(seed + i * 13.7);
        if (hp > dens) continue;
        const off = cnt > 1 ? (i / (cnt - 1) - 0.5) * (len - 2) : 0;
        addBox(out, vadd(vadd(vadd(c, b[2], off), b[1], h * 0.45),
                         b[0], -side * thick * 0.25),
               [thick * 0.9, h * 0.6, Math.min(1.6, len * 0.12)], pick(hp), b);
      }
      out._mat = prevMat;
    };
    // Was the one DIVERGENT copy in the tree — `Math.max(lo, Math.min(hi, v))`
    // against everyone else's comparison ladder. VERDICT: not a bug. The two
    // forms differ only ABOVE an inverted range (lo > hi: the Math form pins to
    // lo, the ladder to hi), on -0, and on a non-number argument (Math coerces,
    // `<`/`>` do not). All eight call sites below pass literal lo < hi and a
    // finite number — every `rows`/`tiers`/`density` in js/circuits/ is a
    // numeric literal — so the swap is output-identical, verified by
    // tools/verify-track.cjs. Migrated rather than left so the divergence
    // cannot be mistaken for intent later.
    const clamp = M4.clamp;

    const bleacher = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const rows = clamp(Math.round(opts.rows || 7), 2, 16);
      const rise = opts.rise != null ? opts.rise : 0.72;      // per-row height gain
      const setback = opts.setback != null ? opts.setback : 0.95;   // per-row recede
      const timber = opts.frame === "timber";
      const frameCol = opts.frameCol || (timber ? [0.42, 0.33, 0.24] : [0.62, 0.63, 0.66]);
      const plankCol = opts.plankCol || (timber ? [0.55, 0.50, 0.43] : [0.60, 0.61, 0.64]);
      const riserCol = opts.riserCol || [plankCol[0] * 0.78, plankCol[1] * 0.78, plankCol[2] * 0.76];
      const dens = opts.density != null ? clamp(opts.density, 0.05, 1) : 0.62;
      const step = opts.step || 6;
      const lift = opts.lift || 0;
      const depth = rows * setback + 1.0;
      const topH = lift + 0.6 + rows * rise;
      ctx.noteSpan("bleacher", s0, s1, side, gap, { h: topH, rows });
      // A stand is a solid mass — index it so treelines and the roadside scatter
      // cannot grow through it (the hand-rolled versions never did this).
      ctx.indexSolid(s0, s1, side, gap, depth);
      along(s0, s1, step, (k, spacing) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        const seg = spacing * 0.98;   // see along(): a padded constant interpenetrates on curves
        if (rejBox(vadd(vadd(a.c, a.u, topH / 2), a.r, side * depth / 2),
                   [depth, topH, seg], b)) return;
        const backLat = side * (rows - 0.5) * setback;
        out._mat = timber ? MAT.WOOD : MAT.METAL;
        addCyl(out, vadd(a.c, a.u, -0.4), 0.14, 1.4, frameCol, 5, b);                    // front stub leg
        addCyl(out, vadd(vadd(a.c, a.r, backLat), a.u, -0.4), 0.17, topH + 0.6, frameCol, 5, b);   // back leg
        // Horizontal ledgers every ~2.2 m — what makes a frame read as a frame.
        for (let y = 1.6; y < topH; y += 2.2)
          addBox(out, vadd(vadd(a.c, a.r, backLat / 2), a.u, y),
                 [Math.abs(backLat) + 0.4, 0.12, 0.12], frameCol, b);
        // Diagonal cross-braces on the side face — bolted bleachers always
        // triangulate; without these the frame reads as a ladder of boxes.
        if (topH > 2.5 && Math.abs(backLat) > 1.2) {
          const braceCol = [frameCol[0] * 0.9, frameCol[1] * 0.9, frameCol[2] * 0.92];
          for (const sgn of [-1, 1]) {
            const mid = vadd(vadd(a.c, a.r, backLat / 2), a.u, topH * 0.45);
            addBox(out, vadd(mid, a.t, sgn * seg * 0.42),
                   [Math.abs(backLat) * 0.95, 0.10, 0.10], braceCol, b);
          }
        }
        for (let r = 0; r < rows; r++) {
          const lat = side * r * setback, y = lift + 0.6 + r * rise;
          const rc = vadd(vadd(a.c, a.r, lat), a.u, y);
          out._mat = timber ? MAT.WOOD : MAT.METAL;
          addBox(out, rc, [setback * 1.05, 0.16, seg], plankCol, b);                     // tread plank
          addBox(out, vadd(vadd(rc, a.r, -side * setback * 0.46), a.u, -rise * 0.42),
                 [0.16, rise, seg], riserCol, b);                                        // foot board
          crowdBand(vadd(rc, a.u, 0.68), b, side, 0.58, 0.78, seg - 0.6,
                    opts.crowd, dens, k * 13.1 + r * 97.3 + side * 5.7);
        }
        if (opts.rail !== false) {
          out._mat = timber ? MAT.WOOD : MAT.METAL;
          addBox(out, vadd(vadd(a.c, a.r, backLat), a.u, topH + 0.55),
                 [0.18, 0.16, seg], frameCol, b);
        }
        out._mat = 0;
      });
    };

    const scaffoldStand = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const rows = clamp(Math.round(opts.rows || 5), 2, 12);
      const rise = opts.rise != null ? opts.rise : 1.15;
      const setback = opts.setback != null ? opts.setback : 1.9;
      const tube = opts.tubeCol || [0.62, 0.63, 0.66];
      const deck = opts.deckCol || [0.70, 0.66, 0.60];
      const bench = (opts.bench && opts.bench.length) ? opts.bench
        : [[0.80, 0.78, 0.74], [0.30, 0.36, 0.52], [0.72, 0.28, 0.24]];
      const dens = opts.density != null ? clamp(opts.density, 0.05, 1) : 0.58;
      const step = opts.step || 6;
      const legEvery = Math.max(1, Math.round(opts.legEvery || 2));
      const depth = rows * setback + 1.2;
      const topH = 1.2 + rows * rise;
      ctx.noteSpan("scaffoldStand", s0, s1, side, gap, { h: topH, rows });
      ctx.indexSolid(s0, s1, side, gap, depth);
      let bay = 0;
      along(s0, s1, step, (k, spacing) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        const seg = spacing * 0.98;
        if (rejBox(vadd(vadd(a.c, a.u, topH / 2), a.r, side * depth / 2),
                   [depth, topH, seg], b)) { bay++; return; }
        for (let r = 0; r < rows; r++) {
          const lat = side * r * setback, y = 1.2 + r * rise;
          const rc = vadd(vadd(a.c, a.r, lat), a.u, y);
          out._mat = MAT.WOOD;
          addBox(out, rc, [setback * 1.02, 0.18, seg], deck, b);                         // deck plank
          addBox(out, vadd(rc, a.u, 0.62), [setback * 0.5, 1.05, seg * 0.94],
                 bench[(bay + r) % bench.length], b);                                    // bench
          crowdBand(vadd(rc, a.u, 1.55), b, side, 0.55, 0.95, seg - 1.0,
                    opts.crowd, dens, k * 17.3 + r * 89.1 + side * 3.3);
          if (bay % legEvery === 0) {
            out._mat = MAT.METAL;
            addCyl(out, vadd(vadd(a.c, a.r, lat), a.u, -0.4), 0.09, y + 0.4, tube, 4, b);
          }
        }
        out._mat = MAT.METAL;
        const backLat = side * (rows - 0.5) * setback;
        addCyl(out, vadd(vadd(a.c, a.r, backLat), a.u, -0.4), 0.13, topH + 1.6, tube, 5, b);  // back standard
        addBox(out, vadd(vadd(a.c, a.r, backLat), a.u, topH + 0.9),
               [0.11, 0.11, seg], tube, b);                                              // handrail
        // One leaning ledger per bay reads as the full X-brace at speed.
        addBox(out, vadd(vadd(a.c, a.r, backLat / 2), a.u, topH * 0.45),
               [Math.abs(backLat) + 0.6, 0.13, 0.13], tube, b);
        if (opts.awning) {
          const aw = (opts.awningCols && opts.awningCols.length) ? opts.awningCols
            : [[0.88, 0.86, 0.82], [0.80, 0.26, 0.22]];
          addCyl(out, vadd(vadd(a.c, a.r, backLat), a.u, topH + 1.4), 0.10, 2.6, tube, 5, b);
          out._mat = MAT.FABRIC;
          addBox(out, vadd(vadd(a.c, a.r, backLat * 0.45), a.u, topH + 3.6),
                 [Math.abs(backLat) + 1.6, 0.22, seg], aw[bay % aw.length], b);
        }
        out._mat = 0;
        bay++;
      });
    };

    const terrace = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const rows = clamp(Math.round(opts.rows || 6), 2, 16);
      const rise = opts.rise != null ? opts.rise : 1.5;
      const dep = opts.depth != null ? opts.depth : 2.6;
      const conc = opts.conc || [0.72, 0.71, 0.67];
      const concAlt = opts.concAlt || [0.64, 0.63, 0.59];
      const dens = opts.density != null ? clamp(opts.density, 0.05, 1) : 0.55;
      const step = opts.step || 7;
      const depth = rows * dep + 2.4;
      const topH = 1.4 + rows * rise;
      ctx.noteSpan("terrace", s0, s1, side, gap, { h: topH, rows });
      ctx.indexSolid(s0, s1, side, gap, depth);
      along(s0, s1, step, (k, spacing) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        const seg = spacing * 0.98;
        if (rejBox(vadd(vadd(a.c, a.u, topH / 2), a.r, side * depth / 2),
                   [depth, topH, seg], b)) return;
        out._mat = MAT.CONCRETE;
        if (opts.retainer !== false)
          addBox(out, vadd(a.c, a.u, 1.0), [0.9, 2.2, seg], concAlt, b);
        for (let r = 0; r < rows; r++) {
          const back = side * (1.0 + r * dep), up = 1.4 + r * rise;
          const tc = vadd(vadd(a.c, a.r, back), a.u, up);
          out._mat = MAT.CONCRETE;
          addBox(out, tc, [dep, rise + 0.3, seg], r & 1 ? conc : concAlt, b);
          crowdBand(vadd(tc, a.u, rise * 0.5 + 0.6), b, side, dep * 0.6, 1.1, seg - 1.6,
                    opts.crowd, dens, k * 31.7 + r * 11.3 + side * 7.1);
        }
        const topBack = side * (1.0 + rows * dep);
        if (opts.backWall !== false) {
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(vadd(a.c, a.r, topBack), a.u, topH * 0.5),
                 [0.7, topH, seg], concAlt, b);                                          // plain back wall
        }
        if (opts.cut) {
          out._mat = 0;
          addPrism(out, vadd(vadd(a.c, a.r, topBack), a.u, topH),
                   [6, 3.4, seg], opts.cutCol || [0.52, 0.32, 0.22], b);
        }
        out._mat = 0;
      });
    };

    const tieredBowl = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const tiers = clamp(Math.round(opts.tiers || 4), 1, 8);
      const tierDepth = opts.tierDepth != null ? opts.tierDepth : 5.6;
      const base = opts.base != null ? opts.base : 3.0;    // first tier's riser height
      const rise = opts.rise != null ? opts.rise : 3.3;    // added per tier
      const shell = (opts.shell && opts.shell.length === 2) ? opts.shell
        : [[0.57, 0.58, 0.60], [0.51, 0.52, 0.55]];
      const fascia = opts.fascia || [0.93, 0.90, 0.80];
      const dens = opts.density != null ? clamp(opts.density, 0.05, 1) : 0.55;
      const step = opts.step || 8;
      const topH = base + (tiers - 1) * rise + 2.0;
      ctx.noteSpan("tieredBowl", s0, s1, side, gap, { h: topH, tiers });
      ctx.indexSolid(s0, s1, side, gap, tiers * tierDepth + 2);
      along(s0, s1, step, (k, spacing) => {
        const seg = spacing * 0.98;
        for (let t = 0; t < tiers; t++) {
          const a = anchor(k, side, gap + t * tierDepth), b = [a.r, a.u, a.t];
          const h = base + t * rise;
          if (rejBox(vadd(a.c, a.u, h / 2), [tierDepth * 0.93, h, seg], b)) continue;
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(a.c, a.u, h * 0.5), [tierDepth * 0.93, h, seg],
                 t % 2 ? shell[0] : shell[1], b);                                        // riser
          crowdBand(vadd(a.c, a.u, h + 0.85), b, side, tierDepth * 0.8, 1.6, seg - 1.0,
                    opts.crowd, dens, k * 3.1 + t * 31.7 + side * 2.3);
          out._mat = 0;
          addBox(out, vadd(a.c, a.u, h + 1.85), [tierDepth * 0.86, 0.32, seg + 0.5],
                 fascia, b);                                                             // fascia lip
        }
        if (opts.roof) {
          const aR = anchor(k, side, gap + (tiers - 0.5) * tierDepth);
          const bR = [aR.r, aR.u, aR.t];
          const ry = base + (tiers - 1) * rise + 2.6;
          if (!rejBox(vadd(aR.c, aR.u, ry), [tierDepth * 1.3, 0.5, seg + 1], bR)) {
            out._mat = MAT.METAL;
            addBox(out, vadd(aR.c, aR.u, ry), [tierDepth * 1.3, 0.5, seg + 1],
                   opts.roofCol || [0.19, 0.19, 0.23], bR);
          }
        }
        out._mat = 0;
      });
    };

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
      const proud = -side * 0.05;   // segment relief toward the viewer
      addCyl(out, vadd(p.c, p.u, -0.3), 0.06, postH + 0.3, [0.55, 0.55, 0.58], 4, b);   // base sunk
      if (kind === "speed") {
        const R = 0.52, cc = vadd(p.c, p.u, postH + R);
        const fwd = [-side * p.r[0], -side * p.r[1], -side * p.r[2]];
        const db = [p.u, fwd, p.t];
        addCyl(out, cc, R, 0.05, [0.85, 0.16, 0.14], 12, db);                             // red rim disc
        addCyl(out, vadd(cc, fwd, 0.02), R * 0.80, 0.05, [0.95, 0.95, 0.93], 12, db);     // white face
        const digs = String(Math.max(10, Math.min(99, value || 80))).split("").map(Number);
        digs.forEach((d, i) => {
          const dc = vadd(cc, p.t, (i - (digs.length - 1) / 2) * 0.36);
          signDigit(dc, p.r, p.u, p.t, 0.34, 0.62, -side * 0.06, [0.10, 0.10, 0.12], d);
        });
      } else if (kind === "braking") {
        const w2 = 1.3, h2 = 0.9, cc = vadd(p.c, p.u, postH + h2 / 2);
        addBox(out, cc, [0.05, h2, w2], [0.92, 0.92, 0.90], b);   // white panel face
        const nStripes = Math.max(1, Math.min(3, value || 2));
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
    function ferrisWheel(k, side, dist, radius) {
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const tl = Math.hypot(track.tx[k], track.tz[k]) || 1;
      const tn = [track.tx[k] / tl, 0, track.tz[k] / tl];   // horizontal tangent
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      const gy = groundYAt(k, dist);
      const hubY = gy + radius + 5;
      const hub = [cx, hubY, cz];
      for (const lo of [-3, 3]) {                            // support legs
        addBox(out, [cx + tn[0] * lo, gy + (hubY - gy) / 2 - 0.5, cz + tn[2] * lo],
               [1.6, hubY - gy + 0.4, 1.6], [0.32, 0.33, 0.38]);
      }
      addBox(out, hub, [3, 3, 3], [0.3, 0.3, 0.34]);         // hub
      const seg = 16;
      // NIGHT, not def.night — the same distinction already written up on
      // buildProps' bankZones note in tracks.js. `def.night` is the circuit's AUTHORED default; NIGHT is
      // this BUILD's value, which game.js overrides from raceTimeOfDay. Reading
      // the def gave abudhabi/baku/singapore/vegas a dark rim with neon cabins
      // in a forced-day session, and suzuka/montreal/zandvoort a bright daytime
      // wheel in a forced-night one. These were the last two def.night reads
      // outside the two sanctioned sites in tracks.js.
      const wheelCol = NIGHT ? [0.30, 0.31, 0.4] : [0.62, 0.63, 0.68];
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
      const HUB_R = 1.7;
      for (let i = 0; i < seg; i++) {
        const d = [rim[i][0] - hub[0], rim[i][1] - hub[1], rim[i][2] - hub[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || 1;
        const root = [hub[0] + d[0] / L * HUB_R, hub[1] + d[1] / L * HUB_R,
                      hub[2] + d[2] / L * HUB_R];
        strut(root, rim[i], 0.28, wheelCol);                 // spoke
        strut(rim[i], rim[(i + 1) % seg], 0.34, wheelCol);   // rim segment
      }
      for (let i = 0; i < seg; i++) {                        // cabins hung off the rim
        const cab = NIGHT
          ? [[0.95, 0.2, 0.5], [0.2, 0.85, 0.95], [0.95, 0.8, 0.2]][i % 3]
          : (i % 2 ? [0.9, 0.25, 0.25] : [0.95, 0.95, 0.98]);
        addBox(out, [rim[i][0], rim[i][1] - 1.5, rim[i][2]], [2.4, 2.2, 2.4], cab);
      }
      // solid base (legs + hub footprint) → stop the car before it on open tracks
      blockAt(k, side, dist - 0.8, 4);
    }

    return { along, wall, fence, guardrail, tyreWall, gantry, flagQuad,
             marshalPost, cameraTower, sponsorHoarding, signDigit, signBoard,
             ferrisWheel,
             bleacher, scaffoldStand, terrace, tieredBowl };
  }

  return { create };
})();
