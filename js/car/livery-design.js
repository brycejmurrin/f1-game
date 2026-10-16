/* Optional, bounded cover artwork. Coordinates are shared by crown, tail and both flanks. */
"use strict";
const LiveryDesign = (function () {
  const PATTERNS = Object.freeze(["ribbon", "brokenChevron", "contours", "honeycomb", "segments", "gradient", "twoTone", "checker", "diamonds", "slashes", "pinstripes", "dots", "lightning"]);
  const RANGES = Object.freeze({
    patternWidth: [20, 100, 70], patternRepeat: [2, 12, 6], patternOffset: [-40, 40, 0],
    patternTaper: [0, 80, 20], patternOpacity: [10, 100, 100],
  });
  const PALETTES = Object.freeze([
    { name: "Midnight electric", colors: ["#101728", "#27e6bd", "#f6f4e9"] },
    { name: "Heritage cream", colors: ["#731b27", "#f2dfb0", "#182623"] },
    { name: "Glacier", colors: ["#e8f2f7", "#2078cf", "#202735"] },
    { name: "Solar", colors: ["#251d35", "#ff742b", "#ffe65b"] },
    { name: "Orchid", colors: ["#271b42", "#df68ed", "#83e5f1"] },
    { name: "Gulf coast", colors: ["#14384c", "#fa8636", "#9ae3f2"] },
    { name: "Acid carbon", colors: ["#15191b", "#c9fa36", "#f0f2e7"] },
    { name: "Cherry blossom", colors: ["#441b38", "#ffb9d0", "#fff0d8"] },
    { name: "Copper storm", colors: ["#182b37", "#cc854d", "#aec9ce"] },
  ]);
  function value(liv, key) {
    const r = RANGES[key], raw = liv && liv[key];
    const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    return Number.isFinite(n) ? Math.max(r[0], Math.min(r[1], n)) : r[2];
  }
  function color(v, fallback) {
    return Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
      ? "rgb(" + v.map((n) => Math.round(Math.max(0, Math.min(1, n)) * 255)).join(",") + ")" : fallback;
  }
  // No textures, timers or random state: identical inputs produce identical art at every atlas tier.
  function paint(ctx, liv) {
    const kind = liv.spineLogo;
    const width = value(liv, "patternWidth") / 100 * 0.8;
    const offset = value(liv, "patternOffset") / 100;
    const taper = value(liv, "patternTaper") / 100;
    const step = 1.5 / Math.round(value(liv, "patternRepeat"));
    const primary = color(liv.patternTint, color(liv.c2, "#ffffff"));
    const secondary = color(liv.patternSecond, color(liv.c1, "#161b25"));
    const half = (z) => width * (1 - taper * Math.max(0, Math.min(1, (z - 0.5) / 1.5)));
    ctx.save(); ctx.globalAlpha *= value(liv, "patternOpacity") / 100;
    ctx.beginPath(); ctx.moveTo(offset - half(0.5), 0.5); ctx.lineTo(offset + half(0.5), 0.5);
    ctx.lineTo(offset + half(2), 2); ctx.lineTo(offset - half(2), 2); ctx.closePath(); ctx.clip();
    ctx.fillStyle = primary; ctx.strokeStyle = primary; ctx.lineWidth = 0.018;
    if (kind === "ribbon") ctx.fillRect(offset - width, 0.5, width * 2, 1.5);
    else if (kind === "gradient") {
      const fill = ctx.createLinearGradient(0, 0.5, 0, 2);
      fill.addColorStop(0, primary); fill.addColorStop(1, secondary);
      ctx.fillStyle = fill; ctx.fillRect(-1.2, 0.5, 2.4, 1.5);
    } else if (kind === "twoTone") {
      ctx.fillRect(-1.2, 0.5, 2.4, 1.5);
      ctx.fillStyle = secondary; ctx.beginPath(); ctx.moveTo(offset - 0.18, 0.5);
      ctx.lineTo(offset + 0.18, 2); ctx.lineTo(1.2, 2); ctx.lineTo(1.2, 0.5); ctx.closePath(); ctx.fill();
    } else if (kind === "brokenChevron") {
      for (let z = 0.3; z < 2.3; z += step) {
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(offset + side * 0.035, z);
          ctx.lineTo(offset + side * width, z + step * 0.65);
          ctx.lineTo(offset + side * width, z + step * 0.9);
          ctx.lineTo(offset + side * 0.035, z + step * 0.25); ctx.closePath(); ctx.fill();
        }
      }
    } else if (kind === "contours") {
      for (let z = 0.25; z < 2.5; z += step) {
        ctx.beginPath();
        for (let j = 0; j <= 48; j++) {
          const x = -1.2 + j * 0.05, y = z + Math.sin((x - offset) * 5) * step * 0.55;
          if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    } else if (kind === "segments") {
      for (let z = 0.5; z < 2; z += step) for (const side of [-1, 1]) {
        ctx.fillStyle = side < 0 ? primary : secondary;
        ctx.fillRect(offset + (side < 0 ? -width : 0.025), z, width - 0.025, step * 0.68);
      }
    } else if (kind === "pinstripes") {
      for (let col = -12; col <= 12; col++) ctx.fillRect(offset + col * step - step * 0.09, 0.5, step * 0.18, 1.5);
    } else if (kind === "slashes" || kind === "lightning") {
      for (let z = -1; z < 3; z += step) {
        ctx.beginPath(); ctx.moveTo(-1.2, z);
        if (kind === "lightning") { ctx.lineTo(offset + 0.1, z + 0.3); ctx.lineTo(offset - 0.1, z + 0.48); }
        ctx.lineTo(1.2, z + 0.8); ctx.lineTo(1.2, z + 0.8 + step * 0.3);
        if (kind === "lightning") { ctx.lineTo(offset - 0.2, z + 0.48 + step * 0.3); ctx.lineTo(offset, z + 0.3 + step * 0.3); }
        ctx.lineTo(-1.2, z + step * 0.3); ctx.closePath(); ctx.fill();
      }
    } else if (["checker", "diamonds", "dots"].includes(kind)) {
      for (let col = -12; col <= 12; col++) for (let row = 0; row <= 12; row++) {
        const x = offset + col * step, z = 0.5 + row * step;
        if (x < offset - width - step || x > offset + width + step || z > 2 + step) continue;
        ctx.fillStyle = (col + row) % 2 ? primary : secondary;
        if (kind === "checker") ctx.fillRect(x, z, step, step);
        else {
          ctx.beginPath();
          const points = kind === "dots" ? 16 : 4, radius = step * (kind === "dots" ? 0.22 : 0.44);
          for (let i = 0; i < points; i++) {
            const angle = i * Math.PI * 2 / points, px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
            if (i) ctx.lineTo(px, pz); else ctx.moveTo(px, pz);
          }
          ctx.closePath(); ctx.fill();
        }
      }
    } else if (kind === "honeycomb") {
      const radius = step * 0.44, dz = Math.sqrt(3) * radius;
      for (let col = -12; col <= 12; col++) for (let row = -1; row < 18; row++) {
        const x = offset + col * radius * 1.5, z = 0.5 + (row + (Math.abs(col) % 2) / 2) * dz;
        if (x < -1.2 || x > 1.2 || z > 2.2) continue;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3, xx = x + Math.cos(angle) * radius, yy = z + Math.sin(angle) * radius;
          if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
        }
        ctx.closePath(); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawAtlas(ctx, liv, regions, flank, eachFlank) {
    if (!liv || !PATTERNS.includes(liv.spineLogo)) return false;
    const region = (r, transform) => {
      if (!r) return;
      ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.transform(...transform); paint(ctx, liv); ctx.restore();
    };
    const c = regions.crest, t = regions.tail;
    if (c) region(c, [c.w / (2 * flank.sTop), 0, 0, -c.h / 0.66, c.x + c.w / 2, c.y + c.h * 1.28 / 0.66]);
    if (t && liv.finHandoff !== "hardCut") region(t, [t.w / (2 * flank.sTop), 0, 0, -t.h / 0.64, t.x + t.w / 2, t.y + t.h * 1.92 / 0.64]);
    if (liv.patternPlacement === "wrap") eachFlank((f) => {
      const left = f.R === regions.spineSideL;
      if (liv.patternSide === "left" && !left || liv.patternSide === "right" && left) return;
      const sign = left ? -1 : 1, dx = (f.fx(1) - f.fx(0)) / flank.zLen;
      region(f.R, [0, sign * f.R.h / flank.sLen, dx, 0, f.fx(0) + flank.zF * dx, f.R.y - flank.sTop * f.R.h / flank.sLen]);
    });
    return true;
  }
  function history(initial, limit = 50) {
    const clone = (d) => JSON.parse(JSON.stringify(d));
    const original = clone(initial), entries = [clone(initial)]; let at = 0, dragging = false;
    return {
      record(d, drag = false) {
        if (JSON.stringify(entries[at]) === JSON.stringify(d)) { if (!drag) dragging = false; return; }
        entries.splice(at + 1);
        if (dragging) entries[at] = clone(d); else { entries.push(clone(d)); at++; }
        if (entries.length > limit + 1) { entries.shift(); at--; }
        dragging = drag;
      },
      undo() { dragging = false; return at > 0 ? clone(entries[--at]) : null; },
      redo() { dragging = false; return at < entries.length - 1 ? clone(entries[++at]) : null; },
      canUndo: () => at > 0, canRedo: () => at < entries.length - 1,
      original: () => clone(original),
    };
  }
  return Object.freeze({ PATTERNS, RANGES, PALETTES, value, drawAtlas, history });
})();
