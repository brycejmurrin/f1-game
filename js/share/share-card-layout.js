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
    accent: "#e10600", gold: "#d9b64c", silver: "#b8c1cc", bronze: "#bd7b48",
  });
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

  function layout(model, specName, measure) {
    const spec = typeof specName === "string" ? SPECS[specName] : specName;
    if (!spec || !(spec.width > 0) || !(spec.height > 0)) throw new Error("Unknown share-card spec");
    measure = typeof measure === "function" ? measure : fallbackMeasure;
    const w = spec.width, h = spec.height, pad = Math.round(Math.min(w, h) * 0.065);
    const footerH = Math.max(58, Math.round(h * 0.075));
    const ops = [
      { op: "rect", id: "background", x: 0, y: 0, width: w, height: h, color: PALETTE.bg },
      { op: "rect", id: "accent", x: 0, y: 0, width: Math.max(14, Math.round(w * 0.018)), height: h - footerH, color: PALETTE.accent },
      { op: "rect", id: "panel", x: pad, y: Math.round(h * 0.32), width: w - pad * 2, height: Math.round(h * 0.42), color: PALETTE.panel },
      textOp("title", model.title, pad, pad, w - pad * 2, Math.round(h * 0.055), 28, PALETTE.text, "left", measure),
      textOp("subtitle", model.subtitle, pad, pad + Math.round(h * 0.07), w - pad * 2, Math.round(h * 0.028), 18, PALETTE.muted, "left", measure),
      textOp("track", model.trackName, pad, Math.round(h * 0.25), w - pad * 2, Math.round(h * 0.065), 24, PALETTE.text, "left", measure),
      textOp("hero-label", model.hero && model.hero.label, w / 2, Math.round(h * 0.42), w - pad * 2, Math.round(h * 0.028), 18, PALETTE.muted, "center", measure),
      textOp("hero-value", model.hero && model.hero.value, w / 2, Math.round(h * 0.56), w - pad * 2, Math.round(h * 0.13), 42, PALETTE.text, "center", measure),
    ];
    if (model.hero && model.hero.medal) {
      const color = PALETTE[String(model.hero.medal).toLowerCase()] || PALETTE.text;
      ops.push(textOp("medal", model.hero.medal, w / 2, Math.round(h * 0.66), w - pad * 2, Math.round(h * 0.045), 22, color, "center", measure));
    }
    if (model.hero && model.hero.streak) {
      ops.push(textOp("streak", "STREAK " + model.hero.streak, pad, h - footerH - pad * 0.7,
        w - pad * 2, Math.round(h * 0.035), 20, PALETTE.text, "left", measure));
    }
    if (model.link) {
      const qrSize = Math.min(Math.round(h * 0.16), Math.round(w * 0.18));
      ops.push({ op: "qr", id: "qr", x: w - pad - qrSize, y: h - footerH - pad * 0.45 - qrSize,
        width: qrSize, height: qrSize, text: model.link, color: PALETTE.text, background: PALETTE.bg });
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
