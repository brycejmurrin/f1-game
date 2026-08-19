/* Apex 26 — SceneryCity: the city/building band of the buildProps composite-model toolkit — the shared neonFacade curtain wall, the building()/neonTower() massing… */
const SceneryCity = (function () {
  "use strict";

  const UNIT_BOX = "unit-box";
  const unitBox = (rec) => rec.box([0, 0, 0], [1, 1, 1], TrackGraph.NODE_COLOR);

  function create(ctx) {
    const { out, glassBuf, def, theme, NIGHT, MAT, lod,
            seat,
            addBox, addCyl, addCone, addFrustum, addPrism, addPyramid,
            rejBox, blockAt, onTrack, hash, vadd, kitOf,
            anchor, along, massBlocked, massAdd } = ctx;
    Log.info("scenery", "scenery-city dress " + (def && def.id));
    const { WINTINTS, HOUSE_WALLS, HOUSE_ROOFS, MOTORHOME_BODY } = TrackSceneryData;

    const facadeMat = (rgb) => {
      const r = rgb[0], g = rgb[1], b = rgb[2];
      const luma = (r + g + b) / 3;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const warm = r - b;
      if (r > g + 0.16 && warm > 0.12 && chroma > 0.14 && luma < 0.70) return MAT.BRICK;
      if (luma > 0.55 && chroma < 0.28 && warm > -0.04) return MAT.STONE;
      return MAT.CONCRETE;
    };

    const neonFacade = (mid, bb, side, sw, sh, sd, neon, seed, neonAmt) => {
      const u = bb[1];
      const frameCol = [0.12, 0.12, 0.15];                       // dark structural frame
      const dark = [0.035, 0.035, 0.055];                        // unlit glass pane
      const warm = [1.0, 0.80, 0.46];
      const nc = [neon[0] * 0.95, neon[1] * 0.95, neon[2] * 0.95];
      const litShare = 0.20 + neonAmt * 0.08, neonShare = neonAmt * 0.7;
      const rows = lod(Math.max(4, Math.min(10, Math.round(sh / 4.4))), 3);   // perf: coarser window grid (was 15 / 3.4); mobile LOD via lod()
      const fh = sh / rows, frameT = 0.30, railH = Math.max(0.4, fh * 0.24), winH = Math.max(0.5, fh - railH);
      const drawFace = (nAxis, nSign, nHalf, wAxis, faceW, sOff, simple) => {
        const nVec = bb[nAxis], wVec = bb[wAxis];
        const cols = simple ? Math.max(2, Math.min(3, Math.round(faceW / 5.4))) : lod(Math.max(2, Math.min(6, Math.round(faceW / 3.3))), 2);
        const rowN = simple ? lod(Math.max(2, Math.min(6, Math.round(sh / 6.4))), 2) : rows;
        const fhh = sh / rowN, winHH = Math.max(0.5, fhh - railH);
        const fBase = vadd(mid, nVec, nSign * (nHalf + 0.34));
        const mBase = vadd(mid, nVec, nSign * (nHalf + 0.29));
        const nBase = vadd(mid, nVec, nSign * (nHalf + 0.40));
        const gBase = vadd(mid, nVec, nSign * (nHalf + 0.05 + 0.04));
        const dim = (thin, hgt, wid) => { const a = [0, 0, 0]; a[nAxis] = thin; a[1] = hgt; a[wAxis] = wid; return a; };
        out._mat = MAT.METAL;
        // perf: every other rail
        if (!simple) for (let i = 0; i <= rowN; i += 2)
          ctx.instance(UNIT_BOX,
            { o: vadd(fBase, u, (i / rowN - 0.5) * sh), r: bb[0], u: bb[1], t: bb[2],
              s: dim(frameT, railH, faceW * 1.005), col: frameCol },
            unitBox, { kind: "facadeRail" });
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
            const toGlass = !lit && !simple;
            if (toGlass) glassBuf._mat = MAT.GLASS; else out._mat = 0;   // lit panes stay untextured (pure emissive read)
            ctx.instance(UNIT_BOX,
              { o: vadd(vadd(gBase, wVec, cx), u, ry),
                r: bb[0], u: bb[1], t: bb[2],
                s: dim(0.08, winHH, (faceW / cols) * 0.82),
                col },
              unitBox,
              { kind: "windowPane" },
              { buf: toGlass ? glassBuf : out });
            if (toGlass) glassBuf._mat = 0;
          }
        }
        out._mat = MAT.METAL;
        if (simple) { out._mat = 0; return; }
        const nm = Math.max(1, Math.min(3, cols - 1));   // perf: fewer mullions (was 5)
        for (let c = 1; c <= nm; c++)
          ctx.instance(UNIT_BOX,
            { o: vadd(mBase, wVec, (-0.5 + c / (nm + 1)) * faceW), r: bb[0], u: bb[1], t: bb[2],
              s: dim(frameT, sh, 0.4), col: frameCol },
            unitBox, { kind: "facadeMullion" });
        if (neonAmt > 0.3) {
          const ST = Math.min(0.4, faceW * 0.04);
          for (const dr of [-1, 1])
            ctx.instance(UNIT_BOX,
              { o: vadd(nBase, wVec, dr * faceW * 0.5), r: bb[0], u: bb[1], t: bb[2],
                s: dim(frameT * 1.05, sh * 0.96, ST), col: nc },
              unitBox, { kind: "facadeNeon" });
          ctx.instance(UNIT_BOX,
            { o: vadd(nBase, u, sh * 0.48), r: bb[0], u: bb[1], t: bb[2],
              s: dim(frameT * 1.1, Math.min(0.5, sh * 0.018), faceW), col: nc },
            unitBox, { kind: "facadeNeon" });
        }
        out._mat = 0;
      };
      drawFace(0, -side, sw / 2, 2, sd, 0, false);   // track-facing facade: full detail
      drawFace(2, 1, sd / 2, 0, sw, 137, true);      // +t side: simple
      drawFace(2, -1, sd / 2, 0, sw, 311, true);     // -t side: simple
    };
    const building = (k, side, gap, w, h, d, opts) => {
      opts = opts || {};
      if (w > d * 2.5)
        Log.warn("scenery", `building: w=${w} >> d=${d} at k=${k} — dimensions likely swapped`);
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
      // Yield to a building mass that is already standing here. The 0.82 shrink
      // is the tolerance for "touching is fine, interpenetrating is not": a
      // terrace of abutting facades is what a street SHOULD look like, so only
      // a footprint well inside its neighbour counts as blocked.
      //
      // Dropping the GEOMETRY must not drop the DRIVING BOUNDARY. The ground is
      // occupied either way — by the mass that got here first — so the car must
      // still be stopped before it. Skipping blockAt() here loosened the limit
      // on every street circuit and broke the walled-tight guarantee.
      if (massBlocked(p.c, w, d, b, 0.82)) { blockAt(k, side, gap, d / 2); return; }
      if (rejBox(p.c, [w + clearMargin * 2, h, d + clearMargin * 2], b)) {
        ctx.noteSuppressed("building", `building SUPPRESSED at k=${k} side=${side}: gap=${gap} w=${w} (footprint over track)`);
        return;
      }
      ctx.note("building", [p.c[0], p.c[1] + h / 2, p.c[2]], [w, h, d], { k, side });
      if (opts.kind) {
        const wl = opts.wall ? (opts.wall[0] + opts.wall[1] + opts.wall[2]) / 3 : 1;
        const tone = {
          n: opts.wall || [0.14, 0.14, 0.17],
          d: (opts.wall && wl > 0.45) ? opts.wall : [0.46, 0.46, 0.45],
        };
        neonTower(k, side, dist, w, h, d,
                  opts.windowCol || opts.window || [1.0, 0.88, 0.55],
                  opts.kind, tone,
                  opts.neon != null ? opts.neon
                                    : (theme === "street_night" ? 0.85 : 0.32));
        return;
      }
      const nightLit = NIGHT && opts.lit !== false;
      let body = opts.wall || [0.62, 0.64, 0.68];
      if (nightLit) body = [Math.max(body[0], 0.26), Math.max(body[1], 0.24), Math.max(body[2], 0.30)];
      const winBase = opts.windowCol || opts.window || [1.0, 0.88, 0.55];
      const HDR = 1.55;
      const litGlass = [winBase[0] * HDR, winBase[1] * HDR, winBase[2] * HDR];
      const dayGlass = opts.window
        ? [Math.min(0.9, opts.window[0] * 0.25 + 0.30), Math.min(0.9, opts.window[1] * 0.25 + 0.33), Math.min(0.9, opts.window[2] * 0.25 + 0.38)]
        : [0.34, 0.40, 0.50];
      const glass = nightLit ? litGlass : dayGlass;
      const floorH = opts.floor || 4.0;
      const section = (yBase, sw, sh, sd) => {
        if (nightLit) {
          // NIGHT = a dark neutral-grey concrete mass (NOT tinted by the neon, so
          // the floodlights render it grey, never a glowing colour) with shared
          // thin-pinstripe detailing on top. Mostly dark; the neon is a few lines.
          const lum = (body[0] + body[1] + body[2]) / 3;
          const bv = lum > 0.4 ? 0.22 : 0.15;
          const bodyTint = [bv, bv, bv * 1.12];
          const ok = ctx.instance(UNIT_BOX,
            { o: vadd(p.c, p.u, yBase + sh / 2), r: p.r, u: p.u, t: p.t, s: [sw, sh, sd], col: bodyTint },
            unitBox, { kind: "buildingMass", k, side }) > 0;
          if (ok === false) return false;
          neonFacade(vadd(p.c, p.u, yBase + sh / 2), b, side, sw, sh, sd, winBase, k * 7.1 + side * 3.3, theme === "street_night" ? 0.85 : 0.32);
          return ok;
        }
        const wallLuma = (body[0] + body[1] + body[2]) / 3;
        const cv = hash(k * 1.7 + side * 2.9);
        const dayWall = wallLuma > 0.45
          ? [body[0] * 0.78, body[1] * 0.78, body[2] * 0.78]
          : [0.42 + cv * 0.12, 0.42 + cv * 0.11, 0.41 + cv * 0.10];
        const wmat = facadeMat(dayWall);
        out._mat = wmat; glassBuf._mat = MAT.GLASS;
        const ok = ctx.instance(UNIT_BOX,                                                   // solid wall mass
          { o: vadd(p.c, p.u, yBase + sh / 2), r: p.r, u: p.u, t: p.t, s: [sw, sh, sd], col: dayWall },
          unitBox, { kind: "buildingMass", k, side }) > 0;
        const rows = Math.max(2, Math.min(8, Math.round(sh / floorH)));
        const fh = sh / rows;
        const dayMull = [dayWall[0] * 0.82, dayWall[1] * 0.82, dayWall[2] * 0.82];
        const frameOut = 0.38;
        const glassOut = 0.05;
        const frameT   = 0.30;
        const glassT   = 0.08;
        const fR = -side * (sw / 2 + frameOut);
        const gR = -side * (sw / 2 + glassOut);
        const fBase = vadd(p.c, p.r, fR);
        const mBase = vadd(p.c, p.r, -side * (sw / 2 + frameOut - 0.05));
        const gBase = vadd(p.c, p.r, gR);
        const railH = Math.max(0.45, fh * 0.28);
        for (let r = 0; r <= rows; r++) {
          ctx.instance(UNIT_BOX,
            { o: vadd(fBase, p.u, yBase + r * fh), r: p.r, u: p.u, t: p.t, s: [frameT, railH, sd], col: dayMull },
            unitBox, { kind: "facadeRail", k, side });
        }
        const winH = Math.max(0.6, fh - railH);
        const dMed = dayWall[0] > 0.6 && dayWall[0] > dayWall[2] + 0.08;
        for (let r = 0; r < rows; r++) {
          const ry01 = (r + 0.5) / rows;
          if (dMed) {
            out._mat = MAT.GLASS;
            ctx.instance(UNIT_BOX,
              { o: vadd(gBase, p.u, yBase + (r + 0.5) * fh), r: p.r, u: p.u, t: p.t,
                s: [glassT, winH, sd * 0.94],
                col: [dayWall[0] * 0.34, dayWall[1] * 0.30, dayWall[2] * 0.26] },
              unitBox, { kind: "windowPane", k, side });
            out._mat = wmat;
          } else {
            const t01 = 0.42 + ry01 * 0.16;
            ctx.instance(UNIT_BOX,
              { o: vadd(gBase, p.u, yBase + (r + 0.5) * fh), r: p.r, u: p.u, t: p.t,
                s: [glassT, winH, sd * 0.94], col: [t01 * 0.40, t01 * 0.47, t01 * 0.62] },
              unitBox, { kind: "windowPane", k, side }, { buf: glassBuf });
          }
        }
        const nm = Math.max(2, Math.min(6, Math.round(sd / 5)));
        for (let c = 1; c <= nm; c++) {
          const off = -sd / 2 + (c / (nm + 1)) * sd;
          ctx.instance(UNIT_BOX,
            { o: vadd(vadd(mBase, p.u, yBase + sh / 2), p.t, off), r: p.r, u: p.u, t: p.t,
              s: [frameT, sh, 0.5], col: dayMull },
            unitBox, { kind: "facadeMullion", k, side });
        }
        const nmR = sw > 14 ? (sw > 22 ? 3 : 2) : 1;
        for (let c = 1; c <= nmR; c++) {
          const off = -sw / 2 + (c / (nmR + 1)) * sw;
          ctx.instance(UNIT_BOX,
            { o: vadd(vadd(p.c, p.u, yBase + sh / 2), p.r, off), r: p.r, u: p.u, t: p.t,
              s: [0.5, sh, sd * 1.02], col: dayMull },
            unitBox, { kind: "facadeMullion", k, side });
        }
        out._mat = 0; glassBuf._mat = 0;
        return ok;
      };
      // Ground-floor plinth, grounded but never near-black (day) / glows (night).
      const plH = Math.min(3.2, h * 0.14);
      const plinth = nightLit ? [body[0] * 0.8, body[1] * 0.8, body[2] * 0.9]
                              : [Math.max(body[0] * 1.2, 0.40), Math.max(body[1] * 1.2, 0.40), Math.max(body[2] * 1.2, 0.44)];
      // The plinth's overhang was a flat 1 % of the building, which on a ~13 m
      // block lands exactly on the facade panes' outer plane — a coincidence tie
      // that any FIXED pane standoff can walk into, since one offset is
      // proportional and the other is not. Floor it at a clearance the panes can
      // never reach (their outer face is 0.13 m proud) while leaving wide
      // buildings, where 1 % is already larger, looking exactly as before.
      const plOut = Math.max(0.22, w * 0.01), pdOut = Math.max(0.22, d * 0.01);
      addBox(out, vadd(p.c, p.u, plH / 2), [w + 2 * plOut, plH, d + 2 * pdOut], plinth, b);
      // Ground-floor entrance on the trackside face — a recessed door + short
      // canopy so a blank plinth reads as a building people enter, not a crate.
      // Skipped at night (neon facade owns the read) and for very narrow units.
      if (!nightLit && d >= 6 && w >= 5) {
        const doorCol = [plinth[0] * 0.45, plinth[1] * 0.42, plinth[2] * 0.48];
        const doorH = Math.min(2.6, plH * 0.92 + 1.4);
        const doorW = Math.min(1.8, d * 0.22);
        const faceR = -side * (w / 2 + 0.06);
        const doorC = vadd(vadd(p.c, p.r, faceR), p.u, doorH / 2);
        addBox(out, doorC, [0.18, doorH, doorW], doorCol, b);
        // Awning / canopy proud of the facade above the door.
        const awnCol = [plinth[0] * 0.72, plinth[1] * 0.72, plinth[2] * 0.74];
        addBox(out,
          vadd(vadd(p.c, p.r, -side * (w / 2 + 0.55)), p.u, doorH + 0.15),
          [1.1, 0.14, doorW + 1.2], awnCol, b);
      }
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
        const h1 = h * 0.55, collar = h * 0.05;
        if (section(0, w, h1, d) === false) return;
        addFrustum(out, vadd(p.c, p.u, h1), diag * 0.5, diag * 0.40, collar, crownCol, 8, b);
        section(h1 + collar, w * 0.72, h - h1 - collar, d * 0.72);
        topW = w * 0.72; topD = d * 0.72;
      } else if (arch === "taper") {
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
      {
        const capR = Math.max(topW, topD) * 0.5, capH = Math.min(3.5, h * 0.07 + 1);
        addFrustum(out, vadd(p.c, p.u, topY), capR, capR * 0.45, capH, crownCol, 6, b);
        topY += capH;
        // Low parapet lip around flat/short crowns — from above (orbit shots)
        // a bare cut-off roof is the #1 "crate" tell; a 0.45 m rim fixes it.
        if (!nightLit && arch === "flat" && h < 28) {
          const rim = [crownCol[0] * 0.88, crownCol[1] * 0.88, crownCol[2] * 0.90];
          addBox(out, vadd(p.c, p.u, topY - capH + 0.2),
                 [topW * 1.02, 0.45, topD * 1.02], rim, b);
        }
        const rt = hash(k * 3.3 + side * 1.9);
        if (h > 30 && rt < 0.58) {
          // slim spire/mast — taller on taller towers; lit tip beacon at night
          const spH = 4 + hash(k * 5.1 + side) * Math.min(20, h * 0.26);
          addCyl(out, vadd(p.c, p.u, topY), 0.22, spH, [0.5, 0.5, 0.56], 4, b);
          if (nightLit) addBox(out, vadd(p.c, p.u, topY + spH), [0.9, 0.9, 0.9], [3.2, 0.4, 0.3], b);
        } else if (rt < 0.82) {
          addBox(out, vadd(p.c, p.u, topY + 1.3), [topW * 0.32, 2.6, topD * 0.32], [0.30, 0.30, 0.34], b);  // plant housing
          // Twin HVAC / duct boxes next to plant housing on mid paddock blocks.
          if (!nightLit && h >= 10 && h < 40 && rt > 0.55) {
            const hx = (hash(k * 7.1 + side) - 0.5) * topW * 0.35;
            const hz = (hash(k * 9.3 + side) - 0.5) * topD * 0.35;
            addBox(out,
              vadd(vadd(vadd(p.c, p.u, topY + 0.7), p.r, hx), p.t, hz),
              [topW * 0.18, 1.4, topD * 0.22], [0.38, 0.38, 0.40], b);
          }
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
          addCyl(out, vadd(p.c, p.u, topY), 0.14, 2.4, [0.30, 0.30, 0.34], 4, b);          // beacon mast
          addBox(out, vadd(p.c, p.u, topY + 2.4), [1.1, 1.1, 1.1], [3.2, 0.4, 0.3], b);    // red beacon
        }
      }
      blockAt(k, side, gap, d / 2);   // solid: stop the car before the façade
      massAdd(p.c, w, d, b);          // claim the ground so later masses yield
    };
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
      // Yield to a mass already standing here — the front/back tower rows and
      // cityFront's row are independent producers stepping by arc length, so on
      // a corner they place units on top of one another. Dropping the geometry
      // must not drop the driving boundary (see building()): the ground is
      // occupied by whichever mass got here first, so still stop the car.
      if (massBlocked(a.c, w, d, b, 0.82)) { blockAt(k, side, dist - reach / 2, reach / 2); return; }
      massAdd(a.c, w, d, b);
      const bodyCol = NIGHT ? (tone && tone.n || [0.14, 0.14, 0.17]) : (tone && tone.d || [0.40, 0.41, 0.44]);
      const cap = NIGHT ? [0.09, 0.09, 0.12] : [0.31, 0.32, 0.35];
      const na = neonAmt == null ? (theme === "street_night" ? 1 : 0) : neonAmt;  // 0=general … 1=neon
      const neonOn = NIGHT && na > 0.3;                                           // bright neon trim?
      const warm = [1.0, 0.80, 0.46];                                            // general office light
      const med = bodyCol[0] > 0.6 && bodyCol[0] > bodyCol[2] + 0.08;   // warm light wall
      const medWin = [bodyCol[0] * 0.34, bodyCol[1] * 0.30, bodyCol[2] * 0.26];   // dark window reveal
      const dayGridAt = (cen, sw, sh, sd) => {
        const rows = lod(Math.max(4, Math.min(10, Math.round(sh / 4.4))), 3);   // perf: cap + coarser (was uncapped / 3.4); mobile LOD via lod()
        const dface = (nAxis, nSign, nHalf, wAxis, faceW, simple) => {
          // perf: fewer panes per face (was simple 4/4.0, full 7/2.4; rowN 9/5.0)
          const cols = simple ? Math.max(2, Math.min(3, Math.round(faceW / 5.2))) : lod(Math.max(2, Math.min(6, Math.round(faceW / 3.1))), 2);
          const rowN = simple ? lod(Math.max(2, Math.min(6, Math.round(sh / 6.4))), 2) : rows;
          const PANE_STANDOFF = 0.05;
          const gBase = (thick) => vadd(cen, b[nAxis], nSign * (nHalf + PANE_STANDOFF + thick / 2));
          const dim = (thin, hgt, wid) => { const a = [0, 0, 0]; a[nAxis] = thin; a[1] = hgt; a[wAxis] = wid; return a; };
          for (let c = 0; c < cols; c++) {
            const cx = (-0.5 + (c + 0.5) / cols) * faceW;
            for (let r = 0; r < rowN; r++) {
              const ry01 = (r + 0.5) / rowN;
              const at = (thick) => vadd(vadd(gBase(thick), b[wAxis], cx), b[1], (-0.5 + ry01) * sh);
              if (med) { out._mat = MAT.GLASS; addBox(out, at(0.06), dim(0.06, (sh / rowN) * 0.42, (faceW / cols) * 0.42), medWin, b); out._mat = 0; }
              else { const t01 = 0.42 + ry01 * 0.16; glassBuf._mat = MAT.GLASS; addBox(glassBuf, at(0.08), dim(0.08, (sh / rowN) * 0.62, (faceW / cols) * 0.6), [t01 * 0.40, t01 * 0.47, t01 * 0.62], b); glassBuf._mat = 0; }
            }
          }
        };
        dface(0, -side, sw / 2, 2, sd, false);   // track-facing: full
        dface(2, 1, sd / 2, 0, sw, true);        // +t side: simple
        dface(2, -1, sd / 2, 0, sw, true);       // -t side: simple
      };
      const bmat = NIGHT ? MAT.CONCRETE : facadeMat(bodyCol);
      const sec = (yb, sw, sh, sd, seed, to, ro) => {
        const cen = vadd(vadd(vadd(a.c, a.u, yb + sh / 2), b[2], to || 0), b[0], ro || 0);
        const prevMat = out._mat;
        out._mat = bmat;
        const okB = addBox(out, cen, [sw, sh, sd], bodyCol, b);
        out._mat = prevMat;
        if (okB === false) return false;
        if (NIGHT) neonFacade(cen, b, side, sw, sh, sd, neon, seed, na);
        else dayGridAt(cen, sw, sh, sd);
        return okB;
      };
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
        seat.prism(out, vadd(a.c, a.u, bh), [w, h * 0.18, d], cap, b);                                       // gable roof, seated on the body
        if (neonOn) addBox(out, vadd(a.c, a.u, bh + h * 0.18), [w * 1.02, 0.5, d * 1.02], neon, b);          // eave neon
      } else if (kind === "notch") {                             // twin slabs split by a vertical slot
        const podH = h * 0.22, off = w * 0.30;
        if (sec(0, w, podH, d, k * 3.1 + side) === false) return;   // body rejected -> drop its dependents // shared podium base
        for (const o2 of [-off, off]) sec(podH, w * 0.42, h - podH, d, k * 4.3 + side + o2, o2, o2 > 0 ? side * 0.07 : 0);             // two towers
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
        for (const o3 of [-off, off]) sec(0, legW, legH, d, k * 3.3 + side + o3 * 7, o3, o3 > 0 ? side * 0.07 : 0);   // legs
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
    const neonSign = (k, side, dist, h, neon) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 2)) return;
      addBox(out, vadd(a.c, a.u, h * 0.5), [0.6, h, 0.6], [0.10, 0.10, 0.12], b);          // mast
      const col = NIGHT ? neon : [neon[0] * 0.4 + 0.3, neon[1] * 0.4 + 0.3, neon[2] * 0.4 + 0.3];
      addBox(out, vadd(a.c, a.u, h * 0.62), [0.9, h * 0.6, 0.35], col, b);                  // vertical blade
      blockAt(k, side, dist - 0.6, 0.6);
    };
    const streetLamp = (k, side, dist, head, h, lstyle) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 2)) return;
      const pole = [0.13, 0.13, 0.15];
      const lit = NIGHT ? [head[0] * 1.4, head[1] * 1.4, head[2] * 1.4]
                        : [head[0] * 0.72, head[1] * 0.72, head[2] * 0.70];
      ctx.instance(
        `lamp|${lstyle || "arm"}|${h}|${side}|${lit.join(",")}`,
        { o: a.c, r: a.r, u: a.u, t: a.t },
        (rec) => {
          rec.cyl([0, -0.4, 0], 0.18, h + 0.4, pole, 6);                              // column, sunk base
          if (lstyle === "globe") {                                                   // heritage twin-globe
            for (const e of [-1, 1]) {
              rec.box([0, h, e * 0.55], [0.16, 0.16, 1.1], pole);                     // bracket
              rec.box([0, h - 0.1, e * 1.1], [0.7, 0.8, 0.7], lit);                   // glowing globe
            }
          } else if (lstyle === "post") {                                             // simple modern cap
            rec.box([0, h, 0], [0.5, 0.5, 0.5], lit);
          } else {                                                                    // cantilever arm
            // arm + head as one cantilever: the member is never optional
            rec.box([-side * 1.7 / 2, h - 0.2, 0], [1.7 + 0.5, 0.18, 0.22], pole);    // arm
            rec.box([-side * 1.7, h - 0.2, 0], [0.85, 0.35, 0.55], lit);              // head
          }
        },
        { kind: "streetLamp", k, side });
    };
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
        const hLocal = hash(k * 9.1 + side * 1.7);
        const hCluster = hash(Math.floor(k / 3) * 2.7 + side * 1.3);
        let h = minH + (0.6 * hLocal + 0.4 * hCluster) * (maxH - minH);
        if (hash(k * 1.7 + side * 3.1) < 0.10) h = Math.min(maxH * 1.5, h * 1.5);  // landmark tower
        const col = palette[((idx % palette.length) + palette.length) % palette.length];
        const wcol = lit ? WINTINTS[Math.floor(hash(k * 2.1 + side) * WINTINTS.length) % WINTINTS.length] : undefined;
        building(k, side, gap, w, h, depth + (s - 0.5) * depth * 0.3, {
          wall: col, floor: opts.floor || (4 + s * 3),
          lit: lit, windowCol: opts.windowCol || wcol,
          // NO `setback:` KEY HERE. This used to pass `setback: <bool>`, which
          // building() has never read — its massing knob is `arch` ("setback"
          // among others), so the option was inert for the life of the file and
          // every city circuit was tuned and shipped with the hash-picked
          // archetypes you see now. Wiring it up (arch: "setback" for the tall
          // third) is a real CHANGE OF LOOK on every street circuit, not a
          // cleanup: measured, it also drives one more severe interpenetration
          // on Baku (clip-audit 31 -> 32) where a stepped mass meets a
          // neighbour. Five circuit call sites (suzuka, monaco x3, bahrain)
          // still pass the same dead `setback: true`, so honouring it here
          // alone would also be inconsistent. If the setback look is wanted,
          // do it deliberately across all six sites with the clip baselines
          // re-measured — see docs/archive/research/CAMPAIGN-2026-08.md.
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
        ctx.noteSuppressed("house", `house SUPPRESSED at k=${k} side=${side}: gap=${gap} w=${w}`);
        return;
      }
      ctx.note("house", [p.c[0], p.c[1] + h / 2, p.c[2]], [w, h, d], { k, side });
      const hh = hash(k * 6.7 + side * 3.9 + gap);
      const wall = opts.wall || HOUSE_WALLS[Math.floor(hh * HOUSE_WALLS.length) % HOUSE_WALLS.length];
      const roofCol = opts.roof || HOUSE_ROOFS[Math.floor(hash(k * 9.1 + side) * HOUSE_ROOFS.length) % HOUSE_ROOFS.length];
      const roofType = opts.roofType || (hh > 0.5 ? "hip" : "gable");
      const nightLit = NIGHT && opts.lit !== false;
      // Main box mass.
      addBox(out, vadd(p.c, p.u, h / 2), [w, h, d], wall, b);
      const roofH = h * (0.42 + hash(k * 13.3 + side) * 0.20);
      const roofSz = [w * 1.10, roofH, d * 1.10];
      if (roofType === "hip") addPyramid(out, vadd(p.c, p.u, h), roofSz, roofCol, b);
      else addPrism(out, vadd(p.c, p.u, h), roofSz, roofCol, b);
      // Chimney on most houses (skip on some for variety).
      if (hash(k * 17 + side) > 0.3) {
        const cc = vadd(vadd(vadd(p.c, p.r, w * 0.22 * side), p.t, d * 0.12), p.u, h * 0.65);
        addCyl(out, cc, 0.32, roofH * 0.95, [0.40, 0.36, 0.34], 4, b);
      }
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
        ctx.noteSuppressed("motorhome", `motorhome SUPPRESSED at k=${k} side=${side}: gap=${gap} w=${w}`);
        return;
      }
      ctx.note("motorhome", [p.c[0], p.c[1] + h / 2, p.c[2]], [w, h, d], { k, side });
      const hh = hash(k * 7.3 + side * 4.1 + gap);
      const body = opts.wall || MOTORHOME_BODY[Math.floor(hh * MOTORHOME_BODY.length) % MOTORHOME_BODY.length];
      const accent = opts.accent || [0.75, 0.10, 0.10];
      const nightLit = NIGHT && opts.lit !== false;
      const winCol = opts.window || (nightLit ? [1.5, 1.3, 0.85] : [0.30, 0.36, 0.42]);
      const loH = h * 0.56;
      addBox(out, vadd(p.c, p.u, loH / 2), [w, loH, d], body, b);
      addBox(out, vadd(p.c, p.u, loH + (h - loH) / 2), [w * 0.86, h - loH, d * 0.90], body, b);
      // Window ribbon along the lower deck's road-facing wall.
      const faceOff = -side * (w / 2 + 0.02);
      addBox(out, vadd(vadd(p.c, p.r, faceOff), p.u, loH * 0.62), [0.05, loH * 0.30, d * 0.82], winCol, b);
      // Livery accent stripe along the base.
      addBox(out, vadd(vadd(p.c, p.r, faceOff * 1.001), p.u, loH * 0.12), [0.06, loH * 0.14, d * 0.94], accent, b);
      const awnDist = w * 0.42;
      const awnC = vadd(vadd(p.c, p.r, faceOff - side * awnDist), p.u, loH * 0.92);
      addBox(out, awnC, [0.05, 0.10, d * 0.9], opts.awning || [0.20, 0.22, 0.26], b);
      for (const e of [-1, 1]) {
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
        ctx.noteSuppressed("tower", `tower SUPPRESSED at k=${k} side=${side}: dist=${dist} baseW=${baseW}`);
        return;
      }
      ctx.note("tower", [p.c[0], p.c[1] + h / 2, p.c[2]], [baseW, h, baseW], { k, side });
      addFrustum(out, vadd(p.c, p.u, -0.6), baseW * 0.5, baseW * 0.335, h + 0.6, opts.col || [0.70, 0.72, 0.75], opts.seg || 8, b);   // base sunk 0.6
      const glass = opts.glassCol || [0.40, 0.52, 0.64];
      const rAt = (f) => baseW * (0.5 - 0.165 * f) * 1.03;
      addCyl(out, vadd(p.c, p.u, h * 0.40), rAt(0.40), h * 0.05, glass, opts.seg || 8, b);
      addCyl(out, vadd(p.c, p.u, h * 0.66), rAt(0.66), h * 0.05, glass, opts.seg || 8, b);
      addBox(out, vadd(p.c, p.u, h * 0.84), [baseW * 0.62, baseW * 0.05, baseW * 0.62], opts.deckCol || [0.26, 0.28, 0.32], b);   // observation deck
      if (opts.cap) addBox(out, vadd(p.c, p.u, h), [baseW * 0.7, baseW * 0.18, baseW * 0.7], opts.capCol || [0.2, 0.2, 0.24], b);
      const mastH = opts.mast === true ? Math.max(4, h * 0.12) : opts.mast;
      if (mastH) addCyl(out, vadd(p.c, p.u, h + (opts.cap ? baseW * 0.09 : 0)), 0.18, mastH, [0.3, 0.3, 0.32], 4, b);
      blockAt(k, side, dist - baseW * 0.5, baseW * 0.5);   // solid base
    };
    const billboard = (k, side, gap, w, h, col, opts) => {
      const st = (opts && opts.style) || kitOf("board", "panel");
      const p = anchor(k, side, gap), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], w / 2 + 1)) {
        ctx.noteSuppressed("billboard", `billboard SUPPRESSED at k=${k} side=${side}: gap=${gap} w=${w} (need gap>${(w/2+1).toFixed(1)})`);
        return;
      }
      ctx.note("billboard", vadd(p.c, p.u, h + 1.6), [0.3, 3.2, w], { k, side });
      const place = { o: p.c, r: p.r, u: p.u, t: p.t };
      const postCol = (opts && opts.postCol) || [0.2, 0.2, 0.22];
      const posts = st === "fascia" ? []
        : st === "monopole" || st === "tower" ? [0]
        : [-w * 0.4, w * 0.4];
      for (const o of posts)
        ctx.instance(`billboard-post|${h}|${st}|${postCol.join(",")}`,
          { o: vadd(p.c, p.t, o), r: p.r, u: p.u, t: p.t },
          (rec) => {
            if (st === "monopole" || st === "tower") {
              rec.cyl([0, -0.4, 0], 0.42, h + 0.4, postCol, 8);                 // one fat column
              rec.box([0, h + 0.1, 0], [0.9, 0.5, 1.6], postCol);               // panel bracket
            } else if (st === "banner") {
              rec.cyl([0, -0.4, 0], 0.09, h + 3.6, postCol, 5);                 // slim mast
            } else if (st === "led") {
              rec.cyl([0, -0.4, 0], 0.16, h + 0.4, postCol, 5);
              rec.box([0, h + 3.4, 0], [0.5, 0.3, 0.5], postCol);               // service walkway
            } else {
              rec.cyl([0, -0.4, 0], 0.12, h + 0.4, postCol, 4);                 // posts, base sunk
            }
          },
          { kind: "billboard", k, side });
      let face = col || [0.9, 0.85, 0.2];
      if (NIGHT) face = [Math.min(1.45, face[0] * 1.30 + 0.10),
                         Math.min(1.45, face[1] * 1.30 + 0.10),
                         Math.min(1.45, face[2] * 1.30 + 0.10)];
      ctx.instance(`billboard-face|${h}|${st}`,
        Object.assign({ s: [1, 1, w], col: face }, place),
        (rec) => {
          const NC = TrackGraph.NODE_COLOR;
          if (st === "trivision") {
            for (let i = 0; i < 3; i++)
              rec.box([(i - 1) * 0.16, h + 0.6 + i * 1.05, 0], [0.42, 0.95, 1], NC);
          } else if (st === "arched") {
            rec.box([0, h + 1.6, 0], [0.3, 3.2, 1], NC);
            rec.prism([0, h + 3.5, 0], [0.3, 0.9, 1], NC);
          } else if (st === "led") {
            rec.box([0, h + 2.0, 0], [0.22, 3.9, 1], NC);                       // thin screen
            rec.box([0, h + 0.0, 0], [0.42, 0.30, 1], postCol);                 // bezel
            rec.box([0, h + 4.0, 0], [0.42, 0.26, 1], postCol);
          } else if (st === "fascia") {
            rec.box([0, 1.35, 0], [0.24, 1.5, 1], NC);                          // low, on the barrier
          } else if (st === "banner") {
            rec.mat(MAT.FABRIC);
            rec.box([0, h + 2.2, 0], [0.10, 4.4, 1], NC);
            rec.mat(0);
          } else if (st === "monopole" || st === "tower") {
            rec.box([0, h + 2.1, 0], [0.32, 4.2, 1], NC);
            rec.box([0, h - 0.2, 0], [0.5, 0.34, 1], postCol);                  // return wing
          } else {                                                             // panel (default): framed hoarding
            rec.box([0, h + 1.6, 0], [0.30, 3.2, 1], NC);                       // advert face
            rec.box([0, h + 3.3, 0], [0.36, 0.22, 1], postCol);                 // top frame rail
            rec.box([0, h - 0.1, 0], [0.36, 0.22, 1], postCol);                 // bottom frame rail
            rec.box([side * 0.5, h + 1.6, 0], [0.6, 0.4, 0.5], postCol);        // rear support strut
          }
        },
        { kind: "billboard", k, side });
      blockAt(k, side, gap, w * 0.4);   // posts + panel face → stop before it
    };

    return { neonFacade, building, neonTower, neonSign, streetLamp,
             cityFront, house, motorhome, tower, billboard };
  }

  return { create };
})();
