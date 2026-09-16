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

  /** Paint the twelve cells for a row (`TrackPit.build().row.boxes`) onto a
   *  fresh canvas laid out by `TrackPit.SIGN`; `mobile` halves it (the UVs
   *  are fractions, so the layout is size-independent). Each cell sits on a
   *  TRANSPARENT field — the lintel's own colour shows through, as the
   *  garage's door sign does — with the crest at the left and the team's
   *  code beside it in an ink that reads on that colour. */
  function paintAtlas(boxes, opts) {
    const S = TrackPit.SIGN, mobile = !!(opts && opts.mobile), div = mobile ? 2 : 1;
    const cv = document.createElement("canvas");
    cv.width = S.w / div; cv.height = S.h / div;
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.clearRect(0, 0, cv.width, cv.height);
    const cw = S.cellW / div, ch = S.cellH / div;
    for (let i = 0; i < boxes.length && i < S.cells; i++) {
      const box = boxes[i], cell = cellRect(i), x = cell.x / div, y = cell.y / div;
      const col = box.col || [0.6, 0.6, 0.65], col2 = box.col2 || [0.9, 0.9, 0.9];
      const ink = LiveryTex.inkOn([col]);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
      // The crest: a square cell-high box at the left, on the lintel's colour.
      const pad = Math.round(ch * 0.08), crestW = ch - pad * 2;
      try {
        LiveryTex.paintTeamMark(ctx, box.team, { c1: col, c2: col2, logo3: box.logo3 || null },
                                { x: x + pad, y: y + pad, w: crestW, h: crestW }, col, { fullLockup: true });
      } catch (e) { /* an unpaintable crest leaves the code and the name */ }
      // The code, then the name where the fascia has room for it.
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
      ctx.restore();
    }
    // The BOARDS (cells 12 and 13, TrackPit.SIGN.boards): opaque, blue, white
    // lettering — a sign, not a fascia. "PIT ENTRY" carries an arrow at the
    // pit side; the entry-line board names the limit the lane is authored at.
    if (S.boards) {
      const side = opts && opts.side != null ? opts.side : 1;
      const lim = Math.round((opts && opts.limitKph) || 80);
      const texts = [(side < 0 ? "◀ " : "") + "PIT ENTRY" + (side > 0 ? " ▶" : ""), "PIT LANE " + lim + " km/h"];
      for (let b = 0; b < S.boards && b < texts.length; b++) {
        const cell = cellRect(S.cells + b), x = cell.x / div, y = cell.y / div;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
        ctx.fillStyle = "rgb(18,38,92)"; ctx.fillRect(x, y, cw, ch);
        ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "800 " + Math.round(ch * 0.66) + "px system-ui, sans-serif";
        ctx.fillText(texts[b], x + cw / 2, y + ch / 2 + 1, cw - 16 / div);
        ctx.restore();
      }
    }
    return cv;
  }

  /** The atlas rectangle (pixels, full-size layout) of row cell `i`. */
  function cellRect(i) {
    const S = TrackPit.SIGN;
    return { x: (i % S.cols) * S.cellW, y: Math.floor(i / S.cols) * S.cellH, w: S.cellW, h: S.cellH };
  }

  /** UV rect of cell `i`, V flipped as createTexture uploads with FLIP_Y
   *  (the garage's uvOf does the same; U is NOT flipped — these quads are
   *  world-space on the identity, a U flip would mirror every crest). */
  function uvRect(i) {
    const S = TrackPit.SIGN, r = cellRect(i);
    return { uL: r.x / S.w, uR: (r.x + r.w) / S.w, vT: 1 - r.y / S.h, vB: 1 - (r.y + r.h) / S.h };
  }

  // ── Runtime: the mesh, the texture and the draw (game.js calls these) ──
  let _drawn = 0, _calls = 0;           // frames drawn / frames asked (agent probe)
  const _opts = { glow: 0 };

  /** Build the track's sign mesh and texture through the render façade. Runs
   *  in Tracks.build, where `G` is; skipped where either half is missing. */
  function upload(G, track) {
    const q = track && track.pitSigns;
    if (!q || !q.idx || !q.idx.length || !G || typeof G.createTexMesh !== "function" ||
        typeof G.createTexture !== "function" || !supported()) return false;
    try {
      const canvas = paintAtlas(track.pit.row.boxes, { mobile: !!G.mobileTier, side: track.pit.side, limitKph: track.pit.limitKph });
      track.meshes.pitSignTex = G.createTexture(canvas);
      track.meshes.pitSigns = G.createTexMesh({ pos: q.pos, nrm: q.nrm, uv: q.uv, idx: q.idx });
      return true;
    } catch (e) {
      track.meshes.pitSigns = track.meshes.pitSignTex = null;
      Log.warn("track", `${track.def && track.def.id}: pit signs skipped: ${e && e.message}`);
      return false;
    }
  }

  function free(gfx, track) {
    const m = track && track.meshes;
    if (!m) return;
    if (m.pitSigns && gfx.freeMesh) gfx.freeMesh(m.pitSigns);
    if (m.pitSignTex && gfx.freeTexture) gfx.freeTexture(m.pitSignTex);
    m.pitSigns = m.pitSignTex = null;
  }

  /** One decal draw, after the sky (opaque → sky → decal: the decal shader
   *  depth-tests against the opaque world and never writes). Gated to 350 m
   *  from the row's centre: the decal shader has no fog, and a sign that far
   *  off would float unfogged on a misty dusk. `glow` reads as a lit fascia
   *  at night (the garage's door sign draws at 0.62). */
  function draw(gfx, track, model, eye, night, hidden) {
    const m = track && track.meshes, q = track && track.pitSigns;
    _calls++;
    if (hidden || !m || !m.pitSigns || !m.pitSignTex || !q || typeof gfx.drawDecal !== "function") return false;
    if (eye) {
      // Within 350 m of the row's centre OR of any board (the approach boards
      // stand up to 400 m before the row).
      const near = (a) => { const dx = eye[0] - a[0], dz = eye[2] - a[2]; return dx * dx + dz * dz <= 350 * 350; };
      let ok = q.centre ? near(q.centre) : !q.anchors || !q.anchors.length;
      if (!ok && q.anchors) for (let i = 0; i < q.anchors.length && !ok; i++) ok = near(q.anchors[i]);
      if (!ok) return false;
    }
    _opts.glow = night ? 0.5 : 0;
    gfx.drawDecal(m.pitSigns, model, m.pitSignTex, _opts);
    _drawn++;
    return true;
  }

  /** `{drawn, calls}`: frames the signs were drawn, frames the draw was asked. */
  const stats = () => ({ drawn: _drawn, calls: _calls });

  return { supported, paintAtlas, cellRect, uvRect, upload, free, draw, stats };
})();
Object.freeze(PitSigns);
