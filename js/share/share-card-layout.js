/* Apex 26 — pure card layout: model + spec + text metric -> paint ops. */
"use strict";

const ShareCardLayout = (function () {
  const SPECS = Object.freeze({
    portrait: Object.freeze({ width: 1080, height: 1350 }),
    landscape: Object.freeze({ width: 1200, height: 630 }),
    square: Object.freeze({ width: 1080, height: 1080 }),
  });
  const PALETTE = Object.freeze({
    bg: "#0b0d14", panel: "#151927", text: "#f7f8fb", muted: "#adb5c8",
    accent: "#e10600", gold: "#d9b64c", silver: "#b8c1cc", bronze: "#bd7b48", you: "#2a3048", faster: "#3ccf6e",
  });
  const MEDAL_COLOUR = [PALETTE.gold, PALETTE.silver, PALETTE.bronze];
  const fallbackMeasure = (text, size) => String(text).length * size * 0.56;

  function fitted(value, maxWidth, maxSize, minSize, measure) {
    let text = String(value || ""), size = maxSize;
    while (size > minSize && measure(text, size) > maxWidth) size--;
    if (measure(text, size) <= maxWidth) return { text, size };
    const ellipsis = "…";
    while (text.length && measure(text + ellipsis, size) > maxWidth) text = text.slice(0, -1);
    return { text: text + ellipsis, size };
  }
  function textOp(id, value, x, y, maxWidth, maxSize, minSize, color, align, measure) {
    const fit = fitted(value, maxWidth, maxSize, minSize, measure);
    return { op: "text", id, x, y, text: fit.text, size: fit.size, maxWidth,
      color: color || PALETTE.text, align: align || "left", weight: "700" };
  }

  // Ranked rows (race podium, standings, a career year's stats) inside the panel box.
  function table(ops, rows, box, h, measure) {
    const rh = box.height / Math.max(rows.length, 3), size = Math.max(16, Math.min(Math.round(rh * 0.5), Math.round(h * 0.045)));
    const posW = Math.round(size * 2.2), valueW = Math.round(box.width * 0.34), gap = Math.round(size * 0.5);
    rows.forEach((r, i) => {
      const y = box.y + rh * i, mid = Math.round(y + rh / 2), id = "row-" + i;
      if (r.you) ops.push({ op: "rect", id: id + "-you", x: box.x, y: Math.round(y), width: box.width, height: Math.round(rh), color: PALETTE.you });
      if (r.teamColor) ops.push({ op: "rect", id: id + "-team", x: box.x + gap, y: Math.round(y + rh * 0.2), width: Math.max(6, Math.round(size * 0.25)), height: Math.round(rh * 0.6), color: r.teamColor });
      let x = box.x + gap * 2 + Math.max(6, Math.round(size * 0.25));
      if (r.pos) {
        ops.push(textOp(id + "-pos", "P" + r.pos, x, mid, posW, size, 14, MEDAL_COLOUR[r.pos - 1] || PALETTE.muted, "left", measure));
        x += posW + gap;
      }
      const label = [r.code, r.name].filter(Boolean).join("  ");
      ops.push(textOp(id + "-name", label, x, mid, Math.max(20, box.x + box.width - valueW - gap - x), size, 14, PALETTE.text, "left", measure));
      ops.push(textOp(id + "-value", r.value, box.x + box.width - gap, mid, valueW - gap * 2, size, 14, r.you ? PALETTE.text : PALETTE.muted, "right", measure));
    });
  }

  // A polyline over `box`: xs in 0..1, ys already in card pixels.
  function path(id, xs, ys, box, color, lineWidth) {
    const points = [];
    for (let i = 0; i < xs.length; i++) points.push(Math.round((box.x + xs[i] * box.width) * 10) / 10, Math.round(ys[i] * 10) / 10);
    return { op: "path", id, x: box.x, y: box.y, width: box.width, height: box.height, points, color, lineWidth };
  }
  // Ghost card: the speed traces (yours over the ghost's) and, with a ghost, the
  // running delta under them around a zero line — green when the lap finished ahead.
  function chart(ops, c, box, h, measure) {
    const label = Math.max(14, Math.round(h * 0.022)), speedH = c.d ? Math.round(box.height * 0.62) : box.height;
    const speed = { x: box.x, y: box.y, width: box.width, height: speedH };
    const all = c.a.concat(c.b || []), lo = Math.min.apply(null, all) * 0.95, hi = Math.max.apply(null, all) * 1.02;
    const ys = (vals) => vals.map((v) => speed.y + speed.height * (1 - (v - lo) / Math.max(1e-6, hi - lo)));
    ops.push(textOp("chart-speed", "SPEED", box.x, box.y + label, box.width, label, 12, PALETTE.muted, "left", measure));
    if (c.b) ops.push(path("trace-ghost", c.s, ys(c.b), speed, PALETTE.muted, 3));
    ops.push(path("trace-you", c.s, ys(c.a), speed, PALETTE.accent, 4));
    if (!c.d) return;
    const gap = Math.round(box.height * 0.04);
    const delta = { x: box.x, y: box.y + speedH + gap, width: box.width, height: box.height - speedH - gap };
    const span = Math.max(0.05, Math.max.apply(null, c.d.map(Math.abs))), mid = delta.y + delta.height / 2;
    ops.push({ op: "line", id: "delta-zero", x: delta.x, y: Math.round(mid), x2: delta.x + delta.width, y2: Math.round(mid), color: PALETTE.you, lineWidth: 2 });
    ops.push(textOp("chart-delta", "DELTA", box.x, delta.y + label, box.width, label, 12, PALETTE.muted, "left", measure));
    ops.push(path("trace-delta", c.s, c.d.map((v) => mid + (v / span) * (delta.height / 2)), delta,
      c.d[c.d.length - 1] <= 0 ? PALETTE.faster : PALETTE.accent, 3));
  }

  function layout(model, specName, measure) {
    const spec = typeof specName === "string" ? SPECS[specName] : specName;
    if (!spec || !(spec.width > 0) || !(spec.height > 0)) throw new Error("Unknown share-card spec");
    measure = typeof measure === "function" ? measure : fallbackMeasure;
    const w = spec.width, h = spec.height, pad = Math.round(Math.min(w, h) * 0.065);
    const footerH = Math.max(58, Math.round(h * 0.075));
    const rows = Array.isArray(model.rows) ? model.rows : [];
    const qrSize = Math.min(Math.round(h * 0.16), Math.round(w * 0.18));
    const panelY = Math.round(h * 0.32);
    const panelH = rows.length ? h - footerH - Math.round(pad * 0.5) - panelY : Math.round(h * 0.42);
    const ops = [
      { op: "rect", id: "background", x: 0, y: 0, width: w, height: h, color: PALETTE.bg },
      { op: "rect", id: "accent", x: 0, y: 0, width: Math.max(14, Math.round(w * 0.018)), height: h - footerH, color: PALETTE.accent },
      { op: "rect", id: "panel", x: pad, y: panelY, width: w - pad * 2, height: panelH, color: PALETTE.panel },
      textOp("title", model.title, pad, pad, w - pad * 2, Math.round(h * 0.055), 28, PALETTE.text, "left", measure),
      textOp("subtitle", model.subtitle, pad, pad + Math.round(h * 0.07), w - pad * 2, Math.round(h * 0.028), 18, PALETTE.muted, "left", measure),
      textOp("track", model.trackName, pad, Math.round(h * 0.25), w - pad * 2, Math.round(h * 0.065), 24, PALETTE.text, "left", measure),
    ];
    const plot = model.chart && Array.isArray(model.chart.s) && model.chart.s.length > 1 ? model.chart : null;
    if (plot) {
      // Ghost card: the lap times and delta in a strip, the chart filling the rest.
      const right = model.link ? w - pad - qrSize - Math.round(pad * 0.5) : w - pad, inner = right - pad;
      const stripH = Math.round(panelH * 0.34), gap = Math.round(pad * 0.4);
      table(ops, rows, { x: pad, y: panelY, width: Math.round(inner * 0.62), height: stripH }, h, measure);
      const cx = pad + Math.round(inner * 0.81), cw = Math.round(inner * 0.36);
      if (model.hero) ops.push(
        textOp("hero-label", model.hero.label, cx, panelY + Math.round(stripH * 0.25), cw, Math.round(h * 0.026), 14, PALETTE.muted, "center", measure),
        textOp("hero-value", model.hero.value, cx, panelY + Math.round(stripH * 0.65), cw, Math.round(h * 0.07), 24,
          /^−/.test(model.hero.value) ? PALETTE.faster : PALETTE.text, "center", measure));
      chart(ops, plot, { x: pad + gap, y: panelY + stripH + gap, width: inner - gap * 2, height: panelH - stripH - gap * 2 }, h, measure);
    } else if (rows.length) {
      // A table card: an optional hero line on top of the panel, the rows under it;
      // a QR (when linked) takes the panel's bottom-right corner, so rows stop short of it.
      let top = panelY;
      if (model.hero) {
        const heroH = Math.round(panelH * 0.32);
        ops.push(
          textOp("hero-label", model.hero.label, w / 2, top + Math.round(heroH * 0.28), w - pad * 2, Math.round(h * 0.026), 16, PALETTE.muted, "center", measure),
          textOp("hero-value", model.hero.value, w / 2, top + Math.round(heroH * 0.68), w - pad * 2, Math.round(h * 0.075), 28, PALETTE.text, "center", measure));
        top += heroH;
      }
      const right = model.link ? w - pad - qrSize - Math.round(pad * 0.5) : w - pad;
      table(ops, rows, { x: pad, y: top, width: right - pad, height: panelY + panelH - top }, h, measure);
    } else {
      ops.push(
        textOp("hero-label", model.hero && model.hero.label, w / 2, Math.round(h * 0.42), w - pad * 2, Math.round(h * 0.028), 18, PALETTE.muted, "center", measure),
        textOp("hero-value", model.hero && model.hero.value, w / 2, Math.round(h * 0.56), w - pad * 2, Math.round(h * 0.13), 42, PALETTE.text, "center", measure));
    }
    if (!rows.length && !plot && model.hero && model.hero.medal) {
      const color = PALETTE[String(model.hero.medal).toLowerCase()] || PALETTE.text;
      ops.push(textOp("medal", model.hero.medal, w / 2, Math.round(h * 0.66), w - pad * 2, Math.round(h * 0.045), 22, color, "center", measure));
    }
    if (!rows.length && !plot && model.hero && model.hero.streak) {
      ops.push(textOp("streak", "STREAK " + model.hero.streak, pad, h - footerH - pad * 0.7,
        w - pad * 2, Math.round(h * 0.035), 20, PALETTE.text, "left", measure));
    }
    if (model.link) {
      ops.push({ op: "qr", id: "qr", x: w - pad - qrSize, y: h - footerH - pad * 0.45 - qrSize,
        // Dark modules on a light tile (its 4-module quiet zone included): many
        // Android scanners never try an inverted code (H3-11, jsQR measured).
        width: qrSize, height: qrSize, text: model.link, color: PALETTE.bg, background: PALETTE.text });
    }
    ops.push(
      { op: "rect", id: "footer-band", x: 0, y: h - footerH, width: w, height: footerH, color: "#05060a" },
      textOp("footer", "UNOFFICIAL FAN GAME · APEX 26 · brycejmurrin.github.io/f1-game",
        w / 2, h - footerH / 2, w - pad * 2, Math.round(footerH * 0.3), 14, PALETTE.text, "center", measure),
    );
    return Object.freeze(ops.map(Object.freeze));
  }

  return Object.freeze({ SPECS, PALETTE, layout });
})();
Object.freeze(ShareCardLayout);
