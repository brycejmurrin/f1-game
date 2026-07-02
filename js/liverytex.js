"use strict";
// liverytex.js — per-team LIVERY TEXTURE ATLAS generator.
// Pure canvas-2D. Draws stylised (fan-art) team crests, invented sponsor
// wordmarks and the car number onto a transparent SIZE×SIZE atlas. The 3D car
// maps panel UVs onto the named REGIONS below. Original stylised marks only —
// these are recognisable-in-silhouette homages, NOT exact trademark repros.
const LiveryTex = (function () {
  const SIZE = 1024;

  // Named atlas regions in CANVAS PIXELS (origin top-left, y down). The 3D side
  // maps panel UVs to these rects. Do NOT change these numbers — the geometry
  // depends on them.
  const REGIONS = {
    crest:  { x: 40,  y: 40,  w: 430, h: 430 },  // team crest/logo (sidepods, nose)
    titleA: { x: 500, y: 40,  w: 484, h: 170 },  // primary sponsor wordmark
    titleB: { x: 500, y: 240, w: 484, h: 130 },  // secondary sponsor
    wing:   { x: 40,  y: 520, w: 620, h: 150 },  // rear-wing sponsor band
    num:    { x: 700, y: 420, w: 284, h: 284 },  // large car number
    strip:  { x: 40,  y: 720, w: 944, h: 130 },  // long thin sponsor strip (sidepod lower)
  };

  // Primary driver number per team.
  const NUMBERS = {
    mercedes: 63, ferrari: 16, mclaren: 1, redbull: 33, alpine: 10,
    racingbulls: 40, haas: 31, williams: 55, audi: 27, astonmartin: 14,
    cadillac: 11,
  };

  // Short codes for the generic-monogram fallback crest.
  const SHORT = {
    mercedes: "MER", ferrari: "SF", mclaren: "MCL", redbull: "RB",
    alpine: "ALP", racingbulls: "RB", haas: "HAAS", williams: "WIL",
    audi: "AUDI", astonmartin: "AMR", cadillac: "CAD",
  };

  // Invented, plausible fake sponsor wordmarks per team (titleA, titleB, wing,
  // strip get the first four; strip repeats a couple for a long thin band).
  const SPONSORS = {
    mercedes:    ["VOLTARC", "KRYOTECH", "MERIDIAN", "HELIXBANK", "NOVASTREAM", "QUANTA"],
    ferrari:     ["ROSSFIN", "MARANELLO", "AURELIO", "FERROGRID", "SCUDERA", "VITELLI"],
    mclaren:     ["HYPERGRID", "PAPAYA", "ZENON", "BRITEL", "WOKING", "FLUXCORE"],
    redbull:     ["TAURON", "ADRENALYN", "SKYBOLT", "VELOCITA", "REDLINE", "OBLIVAN"],
    alpine:      ["ALPIQ", "CHAMONIX", "BLUEROC", "GAULOISE", "ESPRIT", "MISTRAL"],
    racingbulls: ["TORINO", "VISIONE", "FALCARO", "TAURINI", "MILANO", "RAPIDO"],
    haas:        ["IRONGATE", "MACHINA", "STELLAR", "GEARWORKS", "APEXFIN", "FORGE"],
    williams:    ["ATLASOL", "GROVE", "DURACELL", "STRATOS", "OXFORD", "IONWORKS"],
    audi:        ["VORSPRUNG", "INGOLTECH", "QUATTRA", "BAVARIS", "AKKUMA", "NEUERON"],
    astonmartin: ["ARAMONT", "VANTAGE", "GAYDONE", "BRITANNA", "WINGCO", "REGALIS"],
    cadillac:    ["CRESTLINE", "DETROX", "LIBERTY", "AMERIGO", "GENERAX", "MOTORCITY"],
  };

  // ── colour helpers ─────────────────────────────────────────────────────────
  function to255(c) { return [
    Math.round(Math.max(0, Math.min(1, c[0])) * 255),
    Math.round(Math.max(0, Math.min(1, c[1])) * 255),
    Math.round(Math.max(0, Math.min(1, c[2])) * 255),
  ]; }
  function css(c) { const r = to255(c); return "rgb(" + r[0] + "," + r[1] + "," + r[2] + ")"; }
  function cssA(c, a) { const r = to255(c); return "rgba(" + r[0] + "," + r[1] + "," + r[2] + "," + a + ")"; }
  // Relative luminance (0..1) from a 0..1 float colour.
  function lum(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  // Pick a high-contrast ink for a given paint colour.
  function inkFor(c) { return lum(c) > 0.5 ? [0.06, 0.06, 0.08] : [0.97, 0.97, 0.98]; }

  // ── text drawing ───────────────────────────────────────────────────────────
  // Draw UPPERCASE text with manual letter-spacing, fit-to-width, centred/left
  // in a region rect. Bold heavy condensed feel via "900" weight Arial.
  function drawWordmark(ctx, text, R, ink, opts) {
    opts = opts || {};
    const pad = opts.pad != null ? opts.pad : 14;
    const spacing = opts.spacing != null ? opts.spacing : 0.06; // of font size
    const align = opts.align || "left";
    const maxW = R.w - pad * 2;
    const maxH = R.h - pad * 2;
    text = String(text).toUpperCase();

    // Find a font size that fits both width (with spacing) and height.
    let size = Math.min(maxH, 160);
    for (; size > 8; size--) {
      ctx.font = "900 " + size + "px Arial, sans-serif";
      let w = 0;
      for (let i = 0; i < text.length; i++) {
        w += ctx.measureText(text[i]).width;
        if (i < text.length - 1) w += size * spacing;
      }
      if (w <= maxW) break;
    }
    ctx.font = "900 " + size + "px Arial, sans-serif";

    // Measure final width for alignment.
    let total = 0;
    const widths = [];
    for (let i = 0; i < text.length; i++) {
      const cw = ctx.measureText(text[i]).width;
      widths.push(cw);
      total += cw;
      if (i < text.length - 1) total += size * spacing;
    }
    let x = R.x + pad;
    if (align === "center") x = R.x + (R.w - total) / 2;
    else if (align === "right") x = R.x + R.w - pad - total;
    const y = R.y + R.h / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = css(ink);
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], x, y);
      x += widths[i] + size * spacing;
    }
    ctx.restore();
  }

  // Big centred number.
  function drawNumber(ctx, n, R, ink, accent) {
    const pad = 12;
    const maxH = R.h - pad * 2;
    const maxW = R.w - pad * 2;
    let size = maxH;
    const text = String(n);
    for (; size > 8; size--) {
      ctx.font = "900 " + size + "px Arial, sans-serif";
      if (ctx.measureText(text).width <= maxW) break;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();
    ctx.font = "900 " + size + "px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    // subtle accent outline behind for depth
    ctx.lineWidth = Math.max(4, size * 0.05);
    ctx.strokeStyle = css(accent);
    ctx.lineJoin = "round";
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = css(ink);
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  // ── crest helpers ──────────────────────────────────────────────────────────
  // Fit a normalized-drawing (0..1 x, 0..1 y) into region R, centred, keeping a
  // margin. Returns a transform helper {X,Y,S}.
  function fit(R, margin) {
    margin = margin != null ? margin : 0.1;
    const s = Math.min(R.w, R.h) * (1 - margin * 2);
    const ox = R.x + (R.w - s) / 2;
    const oy = R.y + (R.h - s) / 2;
    return {
      X: (u) => ox + u * s,
      Y: (v) => oy + v * s,
      S: (d) => d * s,
    };
  }

  // ── per-team crests ────────────────────────────────────────────────────────
  // Each draws a recognisable-in-silhouette stylised mark inside rect R using
  // path primitives filled with `ink` (+ `accent` second colour where it helps).

  // Mercedes — three-point star in a ring.
  function crestMercedes(ctx, R, ink, accent) {
    const f = fit(R, 0.12);
    const cx = f.X(0.5), cy = f.Y(0.5), r = f.S(0.5);
    ctx.save();
    ctx.strokeStyle = css(ink);
    ctx.lineWidth = f.S(0.05);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = css(ink);
    ctx.lineWidth = f.S(0.055);
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Ferrari — prancing-horse silhouette on a shield.
  function crestFerrari(ctx, R, ink, accent) {
    const f = fit(R, 0.08);
    ctx.save();
    // shield
    ctx.fillStyle = cssA(accent, 0.9);
    ctx.beginPath();
    ctx.moveTo(f.X(0.2), f.Y(0.05));
    ctx.lineTo(f.X(0.8), f.Y(0.05));
    ctx.lineTo(f.X(0.85), f.Y(0.6));
    ctx.quadraticCurveTo(f.X(0.5), f.Y(1.05), f.X(0.15), f.Y(0.6));
    ctx.closePath();
    ctx.fill();
    // prancing horse (rearing, front legs up)
    ctx.fillStyle = css(ink);
    ctx.beginPath();
    ctx.moveTo(f.X(0.42), f.Y(0.88));      // rear leg
    ctx.lineTo(f.X(0.46), f.Y(0.62));
    ctx.quadraticCurveTo(f.X(0.4), f.Y(0.5), f.X(0.44), f.Y(0.38)); // body up
    ctx.quadraticCurveTo(f.X(0.5), f.Y(0.22), f.X(0.6), f.Y(0.26)); // neck
    ctx.lineTo(f.X(0.58), f.Y(0.14));      // head/ear
    ctx.quadraticCurveTo(f.X(0.66), f.Y(0.18), f.X(0.64), f.Y(0.3)); // muzzle
    ctx.quadraticCurveTo(f.X(0.72), f.Y(0.34), f.X(0.68), f.Y(0.44)); // front chest
    ctx.lineTo(f.X(0.6), f.Y(0.4));        // raised front leg 1
    ctx.lineTo(f.X(0.62), f.Y(0.52));
    ctx.lineTo(f.X(0.55), f.Y(0.46));      // raised front leg 2
    ctx.quadraticCurveTo(f.X(0.52), f.Y(0.68), f.X(0.56), f.Y(0.86)); // hind
    ctx.lineTo(f.X(0.5), f.Y(0.86));
    ctx.quadraticCurveTo(f.X(0.52), f.Y(0.6), f.X(0.48), f.Y(0.6));
    ctx.lineTo(f.X(0.48), f.Y(0.88));
    ctx.closePath();
    ctx.fill();
    // flowing tail
    ctx.strokeStyle = css(ink);
    ctx.lineWidth = f.S(0.04);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(f.X(0.44), f.Y(0.5));
    ctx.quadraticCurveTo(f.X(0.34), f.Y(0.55), f.X(0.36), f.Y(0.78));
    ctx.stroke();
    ctx.restore();
  }

  // McLaren — speed swoosh / speedmark.
  function crestMclaren(ctx, R, ink, accent) {
    const f = fit(R, 0.12);
    ctx.save();
    ctx.fillStyle = css(ink);
    // rounded rectangle base bar
    ctx.beginPath();
    ctx.moveTo(f.X(0.05), f.Y(0.62));
    ctx.quadraticCurveTo(f.X(0.05), f.Y(0.5), f.X(0.2), f.Y(0.5));
    ctx.lineTo(f.X(0.5), f.Y(0.5));
    ctx.quadraticCurveTo(f.X(0.4), f.Y(0.5), f.X(0.45), f.Y(0.62));
    ctx.closePath();
    ctx.fill();
    // the sweeping swoosh (accent) — a comet arc rising to the right
    ctx.fillStyle = css(accent);
    ctx.beginPath();
    ctx.moveTo(f.X(0.18), f.Y(0.66));
    ctx.quadraticCurveTo(f.X(0.6), f.Y(0.64), f.X(0.95), f.Y(0.28));
    ctx.quadraticCurveTo(f.X(0.98), f.Y(0.2), f.X(0.9), f.Y(0.22));
    ctx.quadraticCurveTo(f.X(0.55), f.Y(0.46), f.X(0.14), f.Y(0.5));
    ctx.quadraticCurveTo(f.X(0.05), f.Y(0.52), f.X(0.18), f.Y(0.66));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Red Bull — two charging bulls silhouette (one facing, simplified) over a disc.
  function crestRedbull(ctx, R, ink, accent) {
    const f = fit(R, 0.1);
    const cx = f.X(0.5), cy = f.Y(0.55);
    ctx.save();
    // sun disc
    ctx.fillStyle = cssA(accent, 0.9);
    ctx.beginPath(); ctx.arc(cx, cy, f.S(0.28), 0, Math.PI * 2); ctx.fill();
    // charging bull silhouette (head down, horns, tail up)
    ctx.fillStyle = css(ink);
    ctx.beginPath();
    ctx.moveTo(f.X(0.16), f.Y(0.42));      // horn tip
    ctx.quadraticCurveTo(f.X(0.24), f.Y(0.34), f.X(0.3), f.Y(0.4)); // horn curve
    ctx.quadraticCurveTo(f.X(0.34), f.Y(0.3), f.X(0.4), f.Y(0.4));  // head top
    ctx.lineTo(f.X(0.34), f.Y(0.52));      // muzzle down (charging)
    ctx.quadraticCurveTo(f.X(0.42), f.Y(0.56), f.X(0.5), f.Y(0.5)); // neck
    ctx.quadraticCurveTo(f.X(0.7), f.Y(0.46), f.X(0.8), f.Y(0.58)); // back
    ctx.lineTo(f.X(0.86), f.Y(0.5));       // tail up
    ctx.quadraticCurveTo(f.X(0.9), f.Y(0.6), f.X(0.82), f.Y(0.66)); // tail flick
    ctx.lineTo(f.X(0.78), f.Y(0.72));      // rear leg
    ctx.lineTo(f.X(0.72), f.Y(0.7));
    ctx.lineTo(f.X(0.72), f.Y(0.62));
    ctx.lineTo(f.X(0.5), f.Y(0.64));       // belly
    ctx.lineTo(f.X(0.5), f.Y(0.74));       // front leg lunging
    ctx.lineTo(f.X(0.42), f.Y(0.72));
    ctx.lineTo(f.X(0.44), f.Y(0.6));
    ctx.quadraticCurveTo(f.X(0.3), f.Y(0.6), f.X(0.24), f.Y(0.5));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Alpine — bold letter A with a mountain notch.
  function crestAlpine(ctx, R, ink, accent) {
    const f = fit(R, 0.1);
    ctx.save();
    ctx.fillStyle = css(ink);
    // A outer triangle
    ctx.beginPath();
    ctx.moveTo(f.X(0.5), f.Y(0.08));
    ctx.lineTo(f.X(0.92), f.Y(0.92));
    ctx.lineTo(f.X(0.72), f.Y(0.92));
    ctx.lineTo(f.X(0.5), f.Y(0.42));
    ctx.lineTo(f.X(0.28), f.Y(0.92));
    ctx.lineTo(f.X(0.08), f.Y(0.92));
    ctx.closePath();
    ctx.fill();
    // crossbar (accent)
    ctx.fillStyle = css(accent);
    ctx.beginPath();
    ctx.moveTo(f.X(0.36), f.Y(0.66));
    ctx.lineTo(f.X(0.64), f.Y(0.66));
    ctx.lineTo(f.X(0.6), f.Y(0.76));
    ctx.lineTo(f.X(0.4), f.Y(0.76));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Racing Bulls — a single leaping bull chevron (distinct from Red Bull), on shield.
  function crestRacingbulls(ctx, R, ink, accent) {
    const f = fit(R, 0.1);
    ctx.save();
    // downward chevron shield
    ctx.fillStyle = cssA(accent, 0.85);
    ctx.beginPath();
    ctx.moveTo(f.X(0.12), f.Y(0.16));
    ctx.lineTo(f.X(0.88), f.Y(0.16));
    ctx.lineTo(f.X(0.88), f.Y(0.5));
    ctx.lineTo(f.X(0.5), f.Y(0.9));
    ctx.lineTo(f.X(0.12), f.Y(0.5));
    ctx.closePath();
    ctx.fill();
    // stylised bull head with horns
    ctx.fillStyle = css(ink);
    ctx.beginPath();
    ctx.moveTo(f.X(0.2), f.Y(0.3));        // left horn
    ctx.quadraticCurveTo(f.X(0.32), f.Y(0.24), f.X(0.4), f.Y(0.34));
    ctx.quadraticCurveTo(f.X(0.5), f.Y(0.28), f.X(0.6), f.Y(0.34)); // brow
    ctx.quadraticCurveTo(f.X(0.68), f.Y(0.24), f.X(0.8), f.Y(0.3)); // right horn
    ctx.quadraticCurveTo(f.X(0.68), f.Y(0.4), f.X(0.66), f.Y(0.5)); // right cheek
    ctx.lineTo(f.X(0.58), f.Y(0.66));      // muzzle
    ctx.quadraticCurveTo(f.X(0.5), f.Y(0.72), f.X(0.42), f.Y(0.66));
    ctx.lineTo(f.X(0.34), f.Y(0.5));       // left cheek
    ctx.quadraticCurveTo(f.X(0.32), f.Y(0.4), f.X(0.2), f.Y(0.3));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Haas — an interlocking gear / cog with a bold H cut-out.
  function crestHaas(ctx, R, ink, accent) {
    const f = fit(R, 0.1);
    const cx = f.X(0.5), cy = f.Y(0.5), r = f.S(0.42), ir = f.S(0.24);
    ctx.save();
    ctx.fillStyle = css(ink);
    const teeth = 10;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rr = (i % 2 === 0) ? r : r * 0.82;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    // hub hole
    ctx.arc(cx, cy, ir, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    // H bar (accent) across the hub
    ctx.fillStyle = css(accent);
    ctx.fillRect(f.X(0.4), f.Y(0.34), f.S(0.06), f.S(0.32));
    ctx.fillRect(f.X(0.54), f.Y(0.34), f.S(0.06), f.S(0.32));
    ctx.fillRect(f.X(0.4), f.Y(0.47), f.S(0.2), f.S(0.06));
    ctx.restore();
  }

  // Williams — three ascending forward-slanted speed stripes with a W.
  function crestWilliams(ctx, R, ink, accent) {
    const f = fit(R, 0.1);
    ctx.save();
    ctx.fillStyle = css(ink);
    for (let i = 0; i < 3; i++) {
      const off = i * 0.16;
      ctx.beginPath();
      ctx.moveTo(f.X(0.1 + off), f.Y(0.72));
      ctx.lineTo(f.X(0.34 + off), f.Y(0.28));
      ctx.lineTo(f.X(0.44 + off), f.Y(0.28));
      ctx.lineTo(f.X(0.2 + off), f.Y(0.72));
      ctx.closePath();
      ctx.fill();
    }
    // small W accent beneath
    ctx.fillStyle = css(accent);
    ctx.strokeStyle = css(accent);
    ctx.lineWidth = f.S(0.05);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(f.X(0.2), f.Y(0.78));
    ctx.lineTo(f.X(0.34), f.Y(0.9));
    ctx.lineTo(f.X(0.5), f.Y(0.8));
    ctx.lineTo(f.X(0.66), f.Y(0.9));
    ctx.lineTo(f.X(0.8), f.Y(0.78));
    ctx.stroke();
    ctx.restore();
  }

  // Audi — four interlocking rings.
  function crestAudi(ctx, R, ink, accent) {
    const f = fit(R, 0.06);
    ctx.save();
    ctx.strokeStyle = css(ink);
    ctx.lineWidth = f.S(0.045);
    const r = f.S(0.15);
    const cy = f.Y(0.5);
    const xs = [0.2, 0.4, 0.6, 0.8];
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(f.X(xs[i]), cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Aston Martin — spread wings with a central shield.
  function crestAstonmartin(ctx, R, ink, accent) {
    const f = fit(R, 0.06);
    ctx.save();
    ctx.fillStyle = css(ink);
    // left wing (feathered layers)
    for (let s = -1; s <= 1; s += 2) {
      for (let layer = 0; layer < 3; layer++) {
        const yv = 0.42 + layer * 0.09;
        ctx.beginPath();
        ctx.moveTo(f.X(0.5), f.Y(yv));
        ctx.lineTo(f.X(0.5 + s * (0.42 - layer * 0.08)), f.Y(yv - 0.02));
        ctx.lineTo(f.X(0.5 + s * (0.42 - layer * 0.08)), f.Y(yv + 0.05));
        ctx.lineTo(f.X(0.5), f.Y(yv + 0.06));
        ctx.closePath();
        ctx.fill();
      }
    }
    // central shield (accent)
    ctx.fillStyle = css(accent);
    ctx.beginPath();
    ctx.moveTo(f.X(0.42), f.Y(0.34));
    ctx.lineTo(f.X(0.58), f.Y(0.34));
    ctx.lineTo(f.X(0.56), f.Y(0.62));
    ctx.quadraticCurveTo(f.X(0.5), f.Y(0.74), f.X(0.44), f.Y(0.62));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Cadillac — a crest shield split into quarters with a wreath feel.
  function crestCadillac(ctx, R, ink, accent) {
    const f = fit(R, 0.1);
    ctx.save();
    // shield outline
    ctx.fillStyle = css(ink);
    ctx.beginPath();
    ctx.moveTo(f.X(0.2), f.Y(0.14));
    ctx.lineTo(f.X(0.8), f.Y(0.14));
    ctx.lineTo(f.X(0.8), f.Y(0.58));
    ctx.quadraticCurveTo(f.X(0.8), f.Y(0.86), f.X(0.5), f.Y(0.94));
    ctx.quadraticCurveTo(f.X(0.2), f.Y(0.86), f.X(0.2), f.Y(0.58));
    ctx.closePath();
    ctx.fill();
    // quartered accents (two diagonal quarters)
    ctx.fillStyle = css(accent);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(f.X(0.2), f.Y(0.14));
    ctx.lineTo(f.X(0.8), f.Y(0.14));
    ctx.lineTo(f.X(0.8), f.Y(0.58));
    ctx.quadraticCurveTo(f.X(0.8), f.Y(0.86), f.X(0.5), f.Y(0.94));
    ctx.quadraticCurveTo(f.X(0.2), f.Y(0.86), f.X(0.2), f.Y(0.58));
    ctx.closePath();
    ctx.clip();
    // top-left quarter
    ctx.fillRect(f.X(0.2), f.Y(0.14), f.S(0.3), f.S(0.4));
    // bottom-right quarter
    ctx.fillRect(f.X(0.5), f.Y(0.54), f.S(0.3), f.S(0.4));
    ctx.restore();
    // crown-ish bars at top
    ctx.fillStyle = css(accent);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(f.X(0.32 + i * 0.13), f.Y(0.2), f.S(0.06), f.S(0.14));
    }
    ctx.restore();
  }

  // Generic fallback — monogram of the team short code on a rounded plate.
  function crestGeneric(ctx, R, ink, accent, teamId) {
    const f = fit(R, 0.08);
    ctx.save();
    ctx.strokeStyle = css(accent);
    ctx.lineWidth = f.S(0.05);
    ctx.strokeRect(f.X(0.06), f.Y(0.2), f.S(0.88), f.S(0.6));
    drawWordmark(ctx, SHORT[teamId] || teamId.slice(0, 3),
      { x: f.X(0.06), y: f.Y(0.2), w: f.S(0.88), h: f.S(0.6) }, ink,
      { align: "center", pad: f.S(0.06) });
    ctx.restore();
  }

  const CRESTS = {
    mercedes: crestMercedes,
    ferrari: crestFerrari,
    mclaren: crestMclaren,
    redbull: crestRedbull,
    alpine: crestAlpine,
    racingbulls: crestRacingbulls,
    haas: crestHaas,
    williams: crestWilliams,
    audi: crestAudi,
    astonmartin: crestAstonmartin,
    cadillac: crestCadillac,
  };

  function drawCrest(ctx, teamId, R, ink, accent) {
    const fn = CRESTS[teamId];
    if (fn) fn(ctx, R, ink, accent);
    else crestGeneric(ctx, R, ink, accent, teamId);
  }

  // ── main ─────────────────────────────────────────────────────────────────
  function buildAtlas(teamId, colors) {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, SIZE, SIZE); // transparent background
    ctx.imageSmoothingEnabled = true;

    colors = colors || {};
    const c1 = colors.c1 || [0.1, 0.1, 0.12];
    const c2 = colors.c2 || [0.9, 0.9, 0.92];
    const stripe = colors.stripe || null;

    // Ink reads on the base paint (c1). Accent is the other livery colour;
    // prefer the stripe accent if present and distinct, else c2.
    const ink = inkFor(c1);
    let accent = c2;
    if (stripe) accent = stripe;
    // Guard: if accent is too close to the ink in luminance, fall back so the
    // second-colour details don't vanish.
    if (Math.abs(lum(accent) - lum(ink)) < 0.15) accent = (lum(ink) > 0.5) ? c1 : c2;

    // Crest.
    drawCrest(ctx, teamId, REGIONS.crest, ink, accent);

    // Sponsor wordmarks.
    const names = SPONSORS[teamId] || ["APEXFIN", "NEXUS", "VOLTARC", "MERIDIAN", "HYPERGRID", "QUANTA"];
    drawWordmark(ctx, names[0], REGIONS.titleA, ink, { align: "center" });
    drawWordmark(ctx, names[1], REGIONS.titleB, ink, { align: "center" });
    drawWordmark(ctx, names[2], REGIONS.wing,   ink, { align: "center", spacing: 0.1 });
    // Long thin strip: chain a couple of names.
    drawWordmark(ctx, names[3] + "   " + names[4] + "   " + names[5],
      REGIONS.strip, ink, { align: "center", spacing: 0.04 });

    // Car number.
    const num = NUMBERS[teamId] != null ? NUMBERS[teamId] : 0;
    drawNumber(ctx, num, REGIONS.num, ink, accent);

    return canvas;
  }

  return { SIZE, REGIONS, buildAtlas, drawCrest };
})();
if (typeof window !== "undefined") window.LiveryTex = LiveryTex;
