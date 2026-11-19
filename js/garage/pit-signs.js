const PitSigns = (function () {
  "use strict";

  function supported() {
    return typeof document !== "undefined" && typeof document.createElement === "function" &&
           typeof LiveryTex !== "undefined" && typeof LiveryTex.paintTeamMark === "function";
  }

  const to255 = (c) => Math.max(0, Math.min(255, Math.round(c * 255)));
  const css = (c) => "rgb(" + to255(c[0]) + "," + to255(c[1]) + "," + to255(c[2]) + ")";

  const NO_COL = [0.6, 0.6, 0.65], NO_COL2 = [0.9, 0.9, 0.9];
  function clipCell(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  }
  function crest(ctx, box, x, y, size) {
    const col = box.col || NO_COL, col2 = box.col2 || NO_COL2;
    try {
      LiveryTex.paintTeamMark(ctx, box.team, { c1: col, c2: col2, logo3: box.logo3 || null },
                              { x, y, w: size, h: size }, col, { fullLockup: true });
    } catch (e) {  }
  }

  function paintAtlas(boxes, opts) {
    const S = TrackPit.SIGN, div = opts && opts.mobile ? 2 : 1;
    const cv = document.createElement("canvas");
    cv.width = S.w / div; cv.height = S.h / div;
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.clearRect(0, 0, cv.width, cv.height);
    paintFascias(ctx, S, boxes, div);
    if (S.boards) paintBoards(ctx, S, opts, div);
    if (S.crests) paintCrests(ctx, S, boxes, div);
    if (S.signals) paintSignals(ctx, S, div);
    return cv;
  }
  function paintFascias(ctx, S, boxes, div) {
    const cw = S.cellW / div, ch = S.cellH / div;
    for (let i = 0; i < boxes.length && i < S.cells; i++) {
      const box = boxes[i], cell = cellRect(i), x = cell.x / div, y = cell.y / div;
      const ink = LiveryTex.inkOn([box.col || NO_COL]);
      clipCell(ctx, x, y, cw, ch);
      const pad = Math.round(ch * 0.08), crestW = ch - pad * 2;
      crest(ctx, box, x + pad, y + pad, crestW);
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
  }
  function paintBoards(ctx, S, opts, div) {
    const cw = S.cellW / div, ch = S.cellH / div;
    const side = opts && opts.side != null ? opts.side : 1;
    const lim = Math.round((opts && opts.limitKph) || 80);
    const texts = [(side < 0 ? "◀ " : "") + "PIT ENTRY" + (side > 0 ? " ▶" : ""), "PIT LANE " + lim + " km/h"];
    for (let b = 0; b < S.boards && b < texts.length; b++) {
      const cell = cellRect(S.cells + b), x = cell.x / div, y = cell.y / div;
      clipCell(ctx, x, y, cw, ch);
      ctx.fillStyle = "rgb(18,38,92)"; ctx.fillRect(x, y, cw, ch);
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "800 " + Math.round(ch * 0.66) + "px system-ui, sans-serif";
      ctx.fillText(texts[b], x + cw / 2, y + ch / 2 + 1, cw - 16 / div);
      ctx.restore();
    }
  }
  function paintCrests(ctx, S, boxes, div) {
    const cp = S.crestPx / div;
    for (let i = 0; i < boxes.length && i < S.crests; i++) {
      const box = boxes[i], cell = crestRect(i), x = cell.x / div, y = cell.y / div;
      clipCell(ctx, x, y, cp, cp);
      ctx.fillStyle = css(box.col || NO_COL); ctx.fillRect(x, y, cp, cp);
      const pad = Math.round(cp * 0.12);
      crest(ctx, box, x + pad, y + pad, cp - pad * 2);
      ctx.restore();
    }
  }
  function paintSignals(ctx, S, div) {
    const sp = S.signalPx / div, cols = [[0.10, 0.95, 0.30], [1.0, 0.12, 0.08]];
    for (let i = 0; i < S.signals; i++) {
      const x = (S.signalPx * 1.25 * i) / div, y = S.signalY / div;
      clipCell(ctx, x, y, sp, sp);
      ctx.fillStyle = "rgb(12,12,16)"; ctx.fillRect(x, y, sp, sp);
      ctx.fillStyle = css(cols[i] || cols[0]);
      if (typeof ctx.arc === "function") { ctx.beginPath(); ctx.arc(x + sp / 2, y + sp / 2, sp * 0.42, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(x + sp * 0.1, y + sp * 0.1, sp * 0.8, sp * 0.8);
      ctx.restore();
    }
  }

  function cellRect(i) {
    const S = TrackPit.SIGN;
    return { x: (i % S.cols) * S.cellW, y: Math.floor(i / S.cols) * S.cellH, w: S.cellW, h: S.cellH };
  }
  function crestRect(i) {
    const S = TrackPit.SIGN;
    return { x: (i % S.crestCols) * S.crestPx, y: S.crestY + Math.floor(i / S.crestCols) * S.crestPx, w: S.crestPx, h: S.crestPx };
  }

  let _drawn = 0, _calls = 0;
  const _opts = { glow: 0 };

  function upload(G, track) {
    const q = track && track.pitSigns;
    if (!q || !q.idx || !q.idx.length || !G || typeof G.createTexMesh !== "function" ||
        typeof G.createTexture !== "function" || !supported()) return false;
    try {
      const canvas = paintAtlas(track.pit.row.boxes, { mobile: !!(G.isMobile || G.mobileTier), side: track.pit.side, limitKph: track.pit.limitKph });
      track.meshes.pitSignTex = G.createTexture(canvas);
      track.meshes.pitSigns = G.createTexMesh({ pos: q.pos, nrm: q.nrm, uv: q.uv, idx: q.idx });
      const r = track.pitSignal;
      track.meshes.pitSignal = r && r.idx && r.idx.length
        ? G.createTexMesh({ pos: r.pos, nrm: r.nrm, uv: r.uv, idx: r.idx }) : null;
      return true;
    } catch (e) {
      free(G, track);
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

  const _near = (eye, a) => { const dx = eye[0] - a[0], dz = eye[2] - a[2]; return dx * dx + dz * dz <= 350 * 350; };
  function draw(gfx, track, model, eye, night, hidden, called) {
    const m = track && track.meshes, q = track && track.pitSigns;
    _calls++;
    if (hidden || !m || !m.pitSigns || !m.pitSignTex || !q || typeof gfx.drawDecal !== "function") return false;
    if (eye) {
      let ok = q.centre ? _near(eye, q.centre) : !q.anchors || !q.anchors.length;
      if (!ok && q.anchors) for (let i = 0; i < q.anchors.length && !ok; i++) ok = _near(eye, q.anchors[i]);
      if (!ok) return false;
    }
    _opts.glow = night ? 0.5 : 0;
    gfx.drawDecal(m.pitSigns, model, m.pitSignTex, _opts);
    if (called && m.pitSignal) gfx.drawDecal(m.pitSignal, model, m.pitSignTex, _opts);
    _drawn++;
    return true;
  }

  const stats = () => ({ drawn: _drawn, calls: _calls });

  return { supported, upload, free, draw, stats };
})();
Object.freeze(PitSigns);
