"use strict";

const LiveryGraphics = (function () {
  function create(context) {
    const { cssA, clipToRegion, drawNumber, drawWordmark, CROWN_SQUASH,
      coverBindOf, saddleFill, ridgeFill, pickOn, INK_LIGHT, INK_DARK,
      SUN_FLOOR, TAIL_STYLE_IDS } = context;

    const TRIM_KEY = 0.03;
    const TRIM_STROKE = 0.02;
    function bandTrim(weak) {
      return {
        a: (a) => (weak ? 0.9 : a),
        w: (w) => (weak ? Math.max(w, TRIM_KEY) : w),
        lw: (px, W) => (weak ? Math.max(px, W * TRIM_STROKE) : px),
      };
    }
    function drawCoverBand(ctx, id, R, acc, ink, colors, coverPaint, T) {
      const X = R.x, Y = R.y, W = R.w, H = R.h;
      if (id === "stripe") {
        ctx.fillStyle = cssA(acc, 0.96); ctx.fillRect(X + W * 0.41, Y, W * 0.18, H);
        const kw = W * T.w(0.014);
        ctx.fillStyle = cssA(ink, T.a(0.62));
        ctx.fillRect(X + W * 0.41, Y, kw, H); ctx.fillRect(X + W * (0.59 - T.w(0.014)), Y, kw, H);
      } else if (id === "ridge") {
        const ridgeC = ridgeFill(colors || {}, acc, coverPaint);
        const rw = W * 0.07;
        ctx.fillStyle = cssA(ridgeC, 0.96);
        ctx.fillRect(X + W * 0.5 - rw / 2, Y, rw, H);
        ctx.fillStyle = cssA(ink, 0.55);
        ctx.fillRect(X + W * 0.5 - rw / 2, Y, W * 0.008, H);
        ctx.fillRect(X + W * 0.5 + rw / 2 - W * 0.008, Y, W * 0.008, H);
      } else if (id === "twin") {
        ctx.fillStyle = cssA(acc, 0.96);
        ctx.fillRect(X + W * 0.035, Y, W * 0.052, H); ctx.fillRect(X + W * 0.913, Y, W * 0.052, H);
        const kw = W * T.w(0.010);
        ctx.fillStyle = cssA(ink, T.a(0.55));
        ctx.fillRect(X + W * (0.088 - T.w(0.010)), Y, kw, H); ctx.fillRect(X + W * 0.912, Y, kw, H);
      }
    }

    function drawSpineTop(ctx, id, R, c1, acc, ink, name, num, numFont, acc2, colors, weak) {
      const X = R.x, Y = R.y, W = R.w, H = R.h;
      const T = bandTrim(weak);
      ctx.save();
      clipToRegion(ctx, R);
      if (id === "bigmark") {
      } else if (id === "saddle") {
        ctx.fillStyle = cssA(acc, 0.97); ctx.fillRect(X, Y, W, H);
        const kw = W * T.w(0.012);
        ctx.fillStyle = cssA(ink, T.a(0.28));
        ctx.fillRect(X, Y, kw, H); ctx.fillRect(X + W * (1 - T.w(0.012)), Y, kw, H);
      } else if (id === "panel") {
        ctx.fillStyle = cssA(acc, 0.97);
        ctx.beginPath();
        ctx.moveTo(X + W * 0.30, Y);
        ctx.lineTo(X + W * 0.70, Y);
        ctx.lineTo(X + W * 0.70, Y + H * 0.78);
        ctx.lineTo(X + W * 0.30, Y + H * 0.94);
        ctx.closePath(); ctx.fill();
        const kw = W * T.w(0.012);
        ctx.fillStyle = cssA(ink, T.a(0.65));
        ctx.fillRect(X + W * 0.30, Y, kw, H * 0.94); ctx.fillRect(X + W * (0.70 - T.w(0.012)), Y, kw, H * 0.78);
        ctx.fillStyle = cssA(ink, 0.22);
        ctx.fillRect(X + W * 0.312, Y, W * 0.008, H * 0.92); ctx.fillRect(X + W * 0.680, Y, W * 0.008, H * 0.76);
      } else if (id === "stripe") {
        drawCoverBand(ctx, id, R, acc, ink, colors, c1, T);
      } else if (id === "streaks") {
        for (let i = 0; i < 4; i++) {
          const t = (i + 0.85) / 5;
          const x0 = X + W * (t - 0.028), x1 = X + W * (t + 0.028);
          ctx.fillStyle = cssA(acc, 0.96);
          ctx.beginPath();
          ctx.moveTo(x0 + W * 0.012, Y);
          ctx.lineTo(x1 + W * 0.012, Y);
          ctx.lineTo(x1 - W * 0.012, Y + H);
          ctx.lineTo(x0 - W * 0.012, Y + H);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = cssA(ink, T.a(0.45)); ctx.lineWidth = T.lw(Math.max(1.2, W * 0.008), W); ctx.stroke();
        }
      } else if (id === "twin") {
        drawCoverBand(ctx, id, R, acc, ink, colors, c1, T);
      } else if (id === "carbon") {
        const px = X + W * 0.28, pw = W * 0.44;
        ctx.fillStyle = "rgb(22,23,26)"; ctx.fillRect(px, Y, pw, H);
        ctx.strokeStyle = "rgba(255,255,255,0.11)"; ctx.lineWidth = 3;
        for (let d = -H; d < pw + H; d += 12) {
          ctx.beginPath(); ctx.moveTo(px + d, Y); ctx.lineTo(px + d + H, Y + H); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px + d + H, Y); ctx.lineTo(px + d, Y + H); ctx.stroke();
        }
        const kw = W * 0.035;
        ctx.fillStyle = cssA(acc, 0.9);
        ctx.fillRect(px - kw, Y, kw, H); ctx.fillRect(px + pw, Y, kw, H);
      } else if (id === "chevron") {
        ctx.fillStyle = cssA(acc, 0.96);
        for (let i = 0; i < 3; i++) {
          const y0 = Y + H * (0.08 + i * 0.29), tip = y0 + H * 0.12, th = H * 0.088;
          ctx.beginPath();
          ctx.moveTo(X, y0); ctx.lineTo(X + W / 2, tip); ctx.lineTo(X + W, y0);
          ctx.lineTo(X + W, y0 + th); ctx.lineTo(X + W / 2, tip + th); ctx.lineTo(X, y0 + th);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = cssA(ink, T.a(0.45)); ctx.lineWidth = T.lw(Math.max(1.5, H * 0.012), W);
          ctx.stroke();
        }
      } else if (id === "tricolour") {
        const bandH = H * 0.095, top = Y + H * 0.60, gap = H * 0.018;
        ctx.fillStyle = cssA(acc, 0.97); ctx.fillRect(X, top, W, bandH);
        ctx.fillStyle = cssA(acc2 || ink, 0.97); ctx.fillRect(X, top + bandH + gap * 2, W, bandH);
        ctx.fillStyle = cssA(ink, T.a(0.35));
        ctx.fillRect(X, top + bandH, W, gap); ctx.fillRect(X, top + bandH + gap, W, gap);
      } else if (id === "wedge") {
        ctx.fillStyle = cssA(acc, 0.97);
        ctx.beginPath();
        ctx.moveTo(X + W * 0.5 - W * 0.06, Y);
        ctx.lineTo(X + W * 0.5 + W * 0.06, Y);
        ctx.lineTo(X + W * 0.88, Y + H);
        ctx.lineTo(X + W * 0.12, Y + H);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = cssA(ink, T.a(0.5)); ctx.lineWidth = T.lw(Math.max(2, W * 0.012), W); ctx.stroke();
      } else if (id === "rungs") {
        ctx.fillStyle = cssA(acc, 0.96);
        for (let i = 0; i < 5; i++) {
          const inset = W * (0.05 + i * 0.038);
          const y = Y + H * (0.07 + i * 0.185), h = H * 0.072;
          ctx.fillRect(X + inset, y, W - inset * 2, h);
          ctx.fillStyle = cssA(ink, T.a(0.4));
          ctx.fillRect(X + inset, y, W - inset * 2, weak ? W * TRIM_KEY : Math.max(1.5, h * 0.14));
          ctx.fillStyle = cssA(acc, 0.96);
        }
      } else if (id === "wordmark") {
        for (const s2 of [-1, 1]) {
          ctx.save();
          ctx.translate(X + W / 2 + s2 * W * 0.25, Y + H / 2); ctx.rotate(s2 * Math.PI / 2);
          drawWordmark(ctx, name, { x: -H / 2, y: -W * 0.15, w: H, h: W * 0.30 }, ink, { align: "center" });
          ctx.restore();
        }
      } else if (id === "number") {
        ctx.translate(X + W / 2, Y + H / 2); ctx.rotate(Math.PI); ctx.scale(1, CROWN_SQUASH);
        drawNumber(ctx, num, { x: -W * 0.34, y: -W * 0.34, w: W * 0.68, h: W * 0.68 }, ink, acc, null, numFont, 0);
      } else if (id === "cap") {
        const liv = colors || {};
        const bind = coverBindOf(liv);
        const fill = bind === "saddleWrap" ? (saddleFill(liv, acc, c1) || acc) : acc;
        const cutY = Y + H * 0.38;
        const bh = Y + H - cutY;
        const feather = Math.max(2, H * 0.03);
        const paintCap = (px, pw) => {
          const solidY = cutY + feather;
          const solidH = Math.max(0, Y + H - solidY);
          if (solidH > 0) {
            ctx.fillStyle = cssA(fill, 0.97);
            ctx.fillRect(px, solidY, pw, solidH);
          }
          const g = ctx.createLinearGradient(0, cutY, 0, solidY);
          g.addColorStop(0, cssA(fill, 0));
          g.addColorStop(1, cssA(fill, 0.97));
          ctx.fillStyle = g;
          ctx.fillRect(px, cutY, pw, feather);
          ctx.fillStyle = cssA(ink, 0.28);
          ctx.fillRect(px, cutY + feather * 0.55, pw, Math.max(1.5, H * 0.008));
        };
        if (bind === "spineOnly") {
          paintCap(X + W * 0.28, W * 0.44);
        } else {
          paintCap(X, W);
          if (bind === "independent") {
            ctx.fillStyle = cssA(ink, 0.35);
            ctx.fillRect(X, cutY + feather, W * 0.012, Math.max(0, bh - feather));
            ctx.fillRect(X + W * 0.988, cutY + feather, W * 0.012, Math.max(0, bh - feather));
          }
        }
        if (liv.spineTint) {
          const ridgeC = ridgeFill(liv, acc, c1), rw = W * 0.018;
          ctx.fillStyle = cssA(ridgeC, 0.9);
          ctx.fillRect(X + W * 0.5 - rw / 2, cutY + feather * 0.5, rw, Math.max(0, bh - feather * 0.5));
        }
      } else if (id === "ridge") {
        drawCoverBand(ctx, id, R, acc, ink, colors, c1, T);
      } else if (id === "fade") {
        const dotInk = (colors && colors.spineTint)
          || pickOn([acc, ink, INK_LIGHT, INK_DARK].filter(Boolean), c1, SUN_FLOOR);
        const cols = Math.max(12, Math.round(W / Math.max(4, W * 0.028)));
        const rows = Math.max(16, Math.round(H / Math.max(4, W * 0.028)));
        const cellW = W / cols, cellH = H / rows;
        const rMax = Math.min(cellW, cellH) * 0.46;
        ctx.fillStyle = cssA(dotInk, 0.97);
        for (let j = 0; j < rows; j++) {
          const t = (j + 0.5) / rows;
          const amp = t * t;
          const r = rMax * amp;
          if (r < 0.4) continue;
          const cy = Y + (j + 0.5) * cellH;
          for (let i = 0; i < cols; i++) {
            const cx = X + (i + 0.5) * cellW;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
    function drawTailTop(ctx, id, R, acc, ink, name2, colors, coverPaint, weak) {
      const X = R.x, Y = R.y, W = R.w, H = R.h;
      const T = bandTrim(weak);
      ctx.save();
      clipToRegion(ctx, R);
      if (id === "saddle") { ctx.fillStyle = cssA(acc, 0.97); ctx.fillRect(X, Y, W, H); }
      else if (id === "panel") {
        ctx.fillStyle = cssA(acc, 0.97); ctx.fillRect(X + W * 0.30, Y, W * 0.40, H);
        const kw = W * T.w(0.012);
        ctx.fillStyle = cssA(ink, T.a(0.55));
        ctx.fillRect(X + W * 0.30, Y, kw, H); ctx.fillRect(X + W * (0.70 - T.w(0.012)), Y, kw, H);
      }
      else if (id === "stripe") {
        drawCoverBand(ctx, id, R, acc, ink, colors, coverPaint, T);
      } else if (id === "ridge") {
        drawCoverBand(ctx, id, R, acc, ink, colors, coverPaint, T);
      } else if (id === "streaks") {
        for (let i = 0; i < 4; i++) {
          const tt = (i + 0.85) / 5;
          const x0 = X + W * (tt - 0.028), x1 = X + W * (tt + 0.028);
          ctx.fillStyle = cssA(acc, 0.96);
          ctx.beginPath();
          ctx.moveTo(x0 + W * 0.008, Y); ctx.lineTo(x1 + W * 0.008, Y);
          ctx.lineTo(x1 - W * 0.008, Y + H); ctx.lineTo(x0 - W * 0.008, Y + H);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = cssA(ink, T.a(0.45)); ctx.lineWidth = T.lw(Math.max(1.2, W * 0.008), W); ctx.stroke();
        }

      } else if (id === "twin") {
        drawCoverBand(ctx, id, R, acc, ink, colors, coverPaint, T);
      } else if (id === "wedge") {
        ctx.fillStyle = cssA(acc, 0.97);
        ctx.beginPath();
        ctx.moveTo(X + W * 0.5 - W * 0.014, Y); ctx.lineTo(X + W * 0.5 + W * 0.014, Y);
        ctx.lineTo(X + W * 0.5 + W * 0.06, Y + H); ctx.lineTo(X + W * 0.5 - W * 0.06, Y + H);
        ctx.closePath(); ctx.fill();
      } else if (id === "rungs") {
        ctx.fillStyle = cssA(acc, 0.96);
        ctx.fillRect(X + W * 0.24, Y + H * 0.28, W * 0.52, H * 0.34);
      } else if (id === "carbon") {
        const px = X + W * 0.28, pw = W * 0.44;
        const kw = W * 0.035;
        ctx.fillStyle = "rgb(22,23,26)"; ctx.fillRect(px, Y, pw, H);
        ctx.fillStyle = cssA(acc, 0.9); ctx.fillRect(px - kw, Y, kw, H); ctx.fillRect(px + pw, Y, kw, H);
      } else if (id === "wordmark" && name2) {
        ctx.translate(X + W / 2, Y + H / 2); ctx.rotate(Math.PI);
        drawWordmark(ctx, name2, { x: -W / 2, y: -H / 2, w: W, h: H }, ink, { align: "center", pad: 6 });
      }
      ctx.restore();
    }
    const TAIL_STYLE = {
      redbull:     { kind: "diag",    a: 0.80 },
      racingbulls: { kind: "diag",    a: 0.70 },
      ferrari:     { kind: "sweep",   a: 0.66 },
      mclaren:     { kind: "chevron", a: 0.74 },
      mercedes:    { kind: "streak",  a: 0.62 },
      williams:    { kind: "chevron", a: 0.62 },
      alpine:      { kind: "sweep",   a: 0.64 },
      audi:        { kind: "streak",  a: 0.60 },
      astonmartin: { kind: "sweep",   a: 0.62 },
      haas:        { kind: "diag",    a: 0.68 },
      cadillac:    { kind: "chevron", a: 0.60 },
    };
    function drawTailGraphic(ctx, teamId, R, c1, c2, stripe, styleId) {
      if (styleId === "none") return;
      const team = TAIL_STYLE[teamId] || { kind: "diag", a: 0.6 };
      const st = (styleId && styleId !== "team" && TAIL_STYLE_IDS.includes(styleId))
        ? { kind: styleId, a: team.a } : team;
      const acc = stripe || c2;
      const X = R.x, Y = R.y, W = R.w, H = R.h;
      ctx.save();
      clipToRegion(ctx, R);
      const g = ctx.createLinearGradient(X, Y + H, X + W, Y);
      g.addColorStop(0.0, cssA(acc, 0));
      g.addColorStop(0.5, cssA(acc, st.a * 0.85));
      g.addColorStop(1.0, cssA(acc, 0));
      ctx.fillStyle = g;
      ctx.fillRect(X, Y, W, H);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (st.kind === "chevron") {
        ctx.lineWidth = W * 0.085;
        for (let i = 0; i < 4; i++) {
          const o = X + W * (0.16 + i * 0.20), a2 = st.a * (1 - i * 0.20);
          ctx.strokeStyle = cssA(acc, a2);
          ctx.beginPath();
          ctx.moveTo(o - W * 0.16, Y + H * 0.10);
          ctx.lineTo(o, Y + H * 0.5);
          ctx.lineTo(o - W * 0.16, Y + H * 0.90);
          ctx.stroke();
        }
      } else if (st.kind === "sweep") {
        ctx.lineWidth = W * 0.115;
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = cssA(acc, st.a * (1 - i * 0.26));
          ctx.beginPath();
          ctx.moveTo(X - W * 0.08, Y + H * (0.72 + i * 0.11));
          ctx.quadraticCurveTo(X + W * 0.5, Y + H * (0.04 + i * 0.11), X + W * 1.08, Y + H * (0.46 + i * 0.11));
          ctx.stroke();
        }
      } else if (st.kind === "streak") {
        ctx.lineWidth = W * 0.032;
        for (let i = 0; i < 8; i++) {
          ctx.strokeStyle = cssA(acc, st.a * (0.45 + 0.55 * (1 - i / 8)));
          const o = X + W * (0.05 + i * 0.115);
          ctx.beginPath();
          ctx.moveTo(o, Y + H);
          ctx.lineTo(o + W * 0.42, Y);
          ctx.stroke();
        }
      } else if (st.kind === "stars") {
        const pts = [[0.08, 0.30, 1.0], [0.22, 0.72, 0.75], [0.30, 0.22, 0.55], [0.44, 0.58, 0.85],
                     [0.55, 0.18, 0.45], [0.62, 0.80, 0.60], [0.74, 0.40, 0.70], [0.86, 0.66, 0.40], [0.93, 0.20, 0.50]];
        for (let i = 0; i < pts.length; i++) {
          const cx = X + W * pts[i][0], cy = Y + H * pts[i][1], r = H * 0.26 * pts[i][2], q = r * 0.22;
          ctx.fillStyle = cssA(acc, st.a * (1.05 - 0.6 * pts[i][0]));
          ctx.beginPath();
          ctx.moveTo(cx, cy - r); ctx.lineTo(cx + q, cy - q); ctx.lineTo(cx + r, cy); ctx.lineTo(cx + q, cy + q);
          ctx.lineTo(cx, cy + r); ctx.lineTo(cx - q, cy + q); ctx.lineTo(cx - r, cy); ctx.lineTo(cx - q, cy - q);
          ctx.closePath(); ctx.fill();
        }
      } else if (st.kind === "check") {
        const n = 8, cw = W / n, ch = H / 2, skew = W * 0.06;
        for (let r = 0; r < 2; r++) {
          for (let i = 0; i < n; i++) {
            if ((i + r) % 2) continue;
            const a2 = st.a * (1.10 - 0.7 * i / n);
            ctx.fillStyle = cssA(acc, Math.max(0.22, a2));
            const x0 = X + i * cw + skew * (1 - r), y0 = Y + r * ch;
            ctx.beginPath();
            ctx.moveTo(x0, y0 + ch); ctx.lineTo(x0 + cw, y0 + ch);
            ctx.lineTo(x0 + cw - skew, y0); ctx.lineTo(x0 - skew, y0);
            ctx.closePath(); ctx.fill();
          }
        }
      } else {
        ctx.lineWidth = W * 0.15;
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = cssA(acc, st.a * (1 - i * 0.32));
          const o = X + W * (0.08 + i * 0.30);
          ctx.beginPath();
          ctx.moveTo(o, Y + H * 1.08);
          ctx.lineTo(o + W * 0.58, Y - H * 0.08);
          ctx.stroke();
        }
      }
      const rg = ctx.createRadialGradient(X + W / 2, Y + H / 2, W * 0.34, X + W / 2, Y + H / 2, W * 0.72);
      rg.addColorStop(0, "rgba(0,0,0,0)");
      rg.addColorStop(1, "rgba(0,0,0,1)");
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = rg;
      ctx.fillRect(X, Y, W, H);
      ctx.restore();
    }

    const tailStyleOf = (teamId) => (TAIL_STYLE[teamId] || { kind: "diag" }).kind;
    return { drawSpineTop, drawTailTop, drawTailGraphic, tailStyleOf };
  }

  return { create };
})();
Object.freeze(LiveryGraphics);
