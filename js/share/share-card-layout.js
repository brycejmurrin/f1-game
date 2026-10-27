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
    accent: "#e10600", gold: "#d9b64c", silver: "#b8c1cc", bronze: "#bd7b48", you: "#2a3048",
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
    if (rows.length) {
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
    if (!rows.length && model.hero && model.hero.medal) {
      const color = PALETTE[String(model.hero.medal).toLowerCase()] || PALETTE.text;
      ops.push(textOp("medal", model.hero.medal, w / 2, Math.round(h * 0.66), w - pad * 2, Math.round(h * 0.045), 22, color, "center", measure));
    }
    if (!rows.length && model.hero && model.hero.streak) {
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

  return Object.freeze({ SPECS, PALETTE, fitted, layout });
})();
Object.freeze(ShareCardLayout);
