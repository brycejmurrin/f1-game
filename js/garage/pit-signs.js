/* Apex 26 — PitSigns: each team's identity on the OUTSIDE of its pit garage.
   One canvas atlas of twelve fascia cells (crest, the team's short code, the
   name where it fits), one texMesh of twelve quads a centimetre proud of the
   lintels (SceneryPits lays them out as track.pitSigns from TrackPit.SIGN),
   one drawDecal per frame after the sky. Nothing here touches the props
   buffer, and every GPU or canvas step is feature-detected so the headless
   VM builds see only the pure quad numbers. docs/research/PIT-BAY-LOGOS-PLAN-2026-09.md. */
const PitSigns = (function () {
  "use strict";

  /** True where an atlas can be painted: a DOM canvas and the livery painter. */
  function supported() {
    return typeof document !== "undefined" && typeof document.createElement === "function" &&
           typeof LiveryTex !== "undefined" && typeof LiveryTex.paintTeamMark === "function";
  }

  const to255 = (c) => Math.max(0, Math.min(255, Math.round(c * 255)));
  const css = (c) => "rgb(" + to255(c[0]) + "," + to255(c[1]) + "," + to255(c[2]) + ")";
  const teamCol = (box) => box.col || [0.6, 0.6, 0.65];
  const teamCol2 = (box) => box.col2 || [0.9, 0.9, 0.9];

  /** Save, clip to one atlas cell, paint, restore. */
  function inCell(ctx, x, y, w, h, paint) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    paint();
    ctx.restore();
  }

  /** The team's crest into `rect`; an unpaintable crest leaves the rest of the cell. */
  function paintCrest(ctx, box, rect) {
    const col = teamCol(box);
    try {
      LiveryTex.paintTeamMark(ctx, box.team, { c1: col, c2: teamCol2(box), logo3: box.logo3 || null }, rect, col, { fullLockup: true });
    } catch (e) { /* the cell keeps its other marks */ }
  }

  /** The atlas rectangle (pixels, full-size layout) of row cell `i`. */
  function cellRect(i) {
    const S = TrackPit.SIGN;
    return { x: (i % S.cols) * S.cellW, y: Math.floor(i / S.cols) * S.cellH, w: S.cellW, h: S.cellH };
  }
  /** …and of crest cell `i` (TrackPit.SIGN.crests, the atlas's lower half). */
  function crestRect(i) {
    const S = TrackPit.SIGN;
    return { x: (i % S.crestCols) * S.crestPx, y: S.crestY + Math.floor(i / S.crestCols) * S.crestPx, w: S.crestPx, h: S.crestPx };
  }

  /** The FASCIAS: a TRANSPARENT field (the lintel's own colour shows through,
   *  as the garage's door sign does), the crest at the left and the team's
   *  code beside it in an ink that reads on that colour, then the name. */
  function paintFascias(ctx, boxes, div) {
    const S = TrackPit.SIGN, cw = S.cellW / div, ch = S.cellH / div;
    for (let i = 0; i < boxes.length && i < S.cells; i++) {
      const box = boxes[i], cell = cellRect(i), x = cell.x / div, y = cell.y / div;
      // Lift the ink toward white so night glow:0.5 still reads as a lit fascia
      // (the glow gate needs luma; a mid-grey code looked painted flat on the lintel).
      const ink0 = LiveryTex.inkOn([teamCol(box)]);
      const ink = [0, 1, 2].map((k) => Math.min(1, ink0[k] * 1.08 + 0.06));
      inCell(ctx, x, y, cw, ch, () => {
        const pad = Math.round(ch * 0.08), crestW = ch - pad * 2;
        paintCrest(ctx, box, { x: x + pad, y: y + pad, w: crestW, h: crestW });
        ctx.fillStyle = css(ink); ctx.textBaseline = "middle"; ctx.textAlign = "left";
        const codeH = Math.round(ch * 0.62);
        ctx.font = "700 " + codeH + "px system-ui, sans-serif";
        const code = String(box.short || box.team || "").toUpperCase().slice(0, 4);
        let cx = x + pad * 2 + crestW;
        ctx.fillText(code, cx, y + ch / 2);
        cx += ctx.measureText(code).width + pad * 3;
        const nameH = Math.round(ch * 0.34), room = x + cw - pad * 2 - cx;
        if (room > nameH * 4) {
          ctx.font = "600 " + nameH + "px system-ui, sans-serif";
          const name = String(box.name || "").toUpperCase();
          if (name && name !== code) {
            ctx.globalAlpha = 0.92;
            ctx.fillText(name, cx, y + ch / 2 + 1, room);
          }
        }
      });
    }
  }

  /** The BOARDS (TrackPit.SIGN.boards): opaque, blue, white lettering — a sign,
   *  not a fascia. "PIT ENTRY" carries an arrow at the pit side; the
   *  entry-line board names the limit the lane is authored at. */
  function paintBoards(ctx, div, opts) {
    const S = TrackPit.SIGN, cw = S.cellW / div, ch = S.cellH / div;
    const side = opts && opts.side != null ? opts.side : 1;
    const lim = Math.round((opts && opts.limitKph) || 80);
    const texts = [(side < 0 ? "◀ " : "") + "PIT ENTRY" + (side > 0 ? " ▶" : ""), "PIT LANE " + lim + " km/h"];
    for (let b = 0; b < S.boards && b < texts.length; b++) {
      const cell = cellRect(S.cells + b), x = cell.x / div, y = cell.y / div;
      inCell(ctx, x, y, cw, ch, () => {
        ctx.fillStyle = "rgb(18,38,92)"; ctx.fillRect(x, y, cw, ch);
        ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "800 " + Math.round(ch * 0.66) + "px system-ui, sans-serif";
        ctx.fillText(texts[b], x + cw / 2, y + ch / 2 + 1, cw - 16 / div);
      });
    }
  }

  /** The CRESTS (TrackPit.SIGN.crests): the crest alone, on an OPAQUE field of
   *  the team's colour — a plaque on the door's pier, not a fascia. */
  function paintCrestPlaques(ctx, boxes, div) {
    const S = TrackPit.SIGN, cp = S.crestPx / div;
    for (let i = 0; i < boxes.length && i < S.crests; i++) {
      const box = boxes[i], cell = crestRect(i), x = cell.x / div, y = cell.y / div;
      inCell(ctx, x, y, cp, cp, () => {
        ctx.fillStyle = css(teamCol(box)); ctx.fillRect(x, y, cp, cp);
        const pad = Math.round(cp * 0.12);
        paintCrest(ctx, box, { x: x + pad, y: y + pad, w: cp - pad * 2, h: cp - pad * 2 });
      });
    }
  }

  /** The ENTRANCE LAMPS' aspects (TrackPit.SIGN.signals): GREEN and RED, each an
   *  opaque disc on a dark square. The GREEN one is the decal SceneryPits lays
   *  over the lamps' painted RED face, drawn only while this car is called in. */
  function paintSignals(ctx, div) {
    const S = TrackPit.SIGN, sp = S.signalPx / div, cols = [[0.10, 0.95, 0.30], [1.0, 0.12, 0.08]];
    for (let i = 0; i < S.signals; i++) {
      const x = (S.signalPx * 1.25 * i) / div, y = S.signalY / div;
      inCell(ctx, x, y, sp, sp, () => {
        ctx.fillStyle = "rgb(12,12,16)"; ctx.fillRect(x, y, sp, sp);
        ctx.fillStyle = css(cols[i] || cols[0]);
        if (typeof ctx.arc === "function") { ctx.beginPath(); ctx.arc(x + sp / 2, y + sp / 2, sp * 0.42, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(x + sp * 0.1, y + sp * 0.1, sp * 0.8, sp * 0.8);
      });
    }
  }

  /** Paint the atlas for a row (`TrackPit.build().row.boxes`) onto a fresh
   *  canvas laid out by `TrackPit.SIGN`; `mobile` halves it (the UVs are
   *  fractions, so the layout is size-independent). */
  function paintAtlas(boxes, opts) {
    const S = TrackPit.SIGN, div = opts && opts.mobile ? 2 : 1;
    const cv = document.createElement("canvas");
    cv.width = S.w / div; cv.height = S.h / div;
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.clearRect(0, 0, cv.width, cv.height);
    paintFascias(ctx, boxes, div);
    if (S.boards) paintBoards(ctx, div, opts);
    if (S.crests) paintCrestPlaques(ctx, boxes, div);
    if (S.signals) paintSignals(ctx, div);
    return cv;
  }

  // ── Runtime: the mesh, the texture and the draw ──
  let _drawn = 0, _calls = 0;           // frames drawn / frames asked (agent probe)
  const _opts = { glow: 0 };

  /** Build the track's sign mesh and texture through the render façade. Runs
   *  in Tracks.build, where `G` is; skipped where either half is missing. */
  function upload(G, track) {
    const q = track && track.pitSigns;
    if (!q || !q.idx || !q.idx.length || !G || typeof G.createTexMesh !== "function" ||
        typeof G.createTexture !== "function" || !supported()) return false;
    try {
      const canvas = paintAtlas(track.pit.row.boxes, { mobile: !!(G.isMobile || G.mobileTier), side: track.pit.side, limitKph: track.pit.limitKph });
      track.meshes.pitSignTex = G.createTexture(canvas);
      track.meshes.pitSigns = G.createTexMesh({ pos: q.pos, nrm: q.nrm, uv: q.uv, idx: q.idx });
      // The entrance lamps' GREEN call-in aspects: a second mesh on the same
      // texture, drawn when the player is called in (draw()'s `called`).
      const r = track.pitSignal;
      track.meshes.pitSignal = r && r.idx && r.idx.length
        ? G.createTexMesh({ pos: r.pos, nrm: r.nrm, uv: r.uv, idx: r.idx }) : null;
      return true;
    } catch (e) {
      free(G, track);   // the texture or the first mesh may already be on the GPU
      Log.warn("track", `${track.def && track.def.id}: pit signs skipped: ${e && e.message}`);
      return false;
    }
  }

  function free(gfx, track) {
    const m = track && track.meshes;
    if (!m) return;
    if (m.pitSigns && gfx.freeMesh) gfx.freeMesh(m.pitSigns);
    if (m.pitSignal && gfx.freeMesh) gfx.freeMesh(m.pitSignal);
    if (m.pitSignTex && gfx.freeTexture) gfx.freeTexture(m.pitSignTex);
    m.pitSigns = m.pitSignTex = m.pitSignal = null;
  }

  // The decal shader has no fog: a sign past 350 m would float unfogged on a
  // misty dusk. Hoisted so the per-frame check builds no closure.
  const _near = (eye, a) => { const dx = eye[0] - a[0], dz = eye[2] - a[2]; return dx * dx + dz * dz <= 350 * 350; };
  /** Within 350 m of the row's centre OR of any board (the approach boards
   *  stand up to 400 m before the row). */
  function inRange(eye, q) {
    let ok = q.centre ? _near(eye, q.centre) : !q.anchors || !q.anchors.length;
    if (!ok && q.anchors) for (let i = 0; i < q.anchors.length && !ok; i++) ok = _near(eye, q.anchors[i]);
    return ok;
  }

  /** One decal draw, after the sky (opaque → sky → decal: the decal shader
   *  depth-tests against the opaque world and never writes). `glow` reads as
   *  a lit fascia at night (the garage's door sign draws at 0.62). */
  function draw(gfx, track, model, eye, night, hidden, called) {
    const m = track && track.meshes, q = track && track.pitSigns;
    _calls++;
    if (hidden || !m || !m.pitSigns || !m.pitSignTex || !q || typeof gfx.drawDecal !== "function") return false;
    if (eye && !inRange(eye, q)) return false;
    _opts.glow = night ? 0.5 : 0;
    gfx.drawDecal(m.pitSigns, model, m.pitSignTex, _opts);
    // YOU ARE CALLED IN: the entrance lamps' GREEN aspects over their red.
    if (called && m.pitSignal) gfx.drawDecal(m.pitSignal, model, m.pitSignTex, _opts);
    _drawn++;
    return true;
  }

  /** `{drawn, calls}`: frames the signs were drawn, frames the draw was asked. */
  const stats = () => ({ drawn: _drawn, calls: _calls });

  return { supported, upload, free, draw, stats };
})();
Object.freeze(PitSigns);
