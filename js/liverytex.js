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

  // Brand-accurate hardcoded hues (0..1 float) for marks needing a specific
  // colour. Original stylised fan-art — not exact trademark reproductions.
  const BRAND = {
    rbRed:    [0.855, 0.043, 0.086],
    rbGold:   [1.0,   0.788, 0.024],
    rbNavy:   [0.043, 0.078, 0.239],
    ferYellow:[1.0,   0.925, 0.0],
    papaya:   [1.0,   0.525, 0.0],
    triBlue:  [0.0,   0.259, 0.639],
    triRed:   [0.937, 0.255, 0.208],
    haasRed:  [0.859, 0.098, 0.145],
    cadGold:  [0.788, 0.643, 0.353],
  };

  // A charging, horned bull silhouette in a local box (x0,y0,w,h) of the fit.
  // dir=+1 → head/horns to the RIGHT; dir=-1 mirrors (head to the LEFT).
  function drawBull(ctx, f, x0, y0, w, h, dir, style) {
    const U = (u) => f.X(x0 + (dir > 0 ? u : 1 - u) * w);
    const V = (v) => f.Y(y0 + v * h);
    ctx.beginPath();
    ctx.moveTo(U(0.02), V(0.34));                              // tail tip (up)
    ctx.quadraticCurveTo(U(0.12), V(0.30), U(0.16), V(0.42));  // tail down to rump
    ctx.quadraticCurveTo(U(0.30), V(0.24), U(0.46), V(0.24));  // back to shoulder hump
    ctx.quadraticCurveTo(U(0.58), V(0.26), U(0.64), V(0.36));  // neck lowered
    ctx.lineTo(U(0.72), V(0.10));                              // horn (sweeps up-fwd)
    ctx.lineTo(U(0.80), V(0.12));
    ctx.lineTo(U(0.78), V(0.34));                              // horn base
    ctx.quadraticCurveTo(U(0.94), V(0.40), U(0.96), V(0.48));  // brow to muzzle
    ctx.quadraticCurveTo(U(0.90), V(0.56), U(0.74), V(0.56));  // jaw to chest
    ctx.lineTo(U(0.74), V(0.92));                              // front leg (lunging)
    ctx.lineTo(U(0.64), V(0.92));
    ctx.lineTo(U(0.62), V(0.60));                              // belly
    ctx.lineTo(U(0.28), V(0.62));
    ctx.lineTo(U(0.28), V(0.92));                              // rear leg
    ctx.lineTo(U(0.18), V(0.92));
    ctx.lineTo(U(0.12), V(0.55));                              // rump underside
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  }

  // Mercedes — three-point star inside a ring.
  function crestMercedes(ctx, R, ink, accent) {
    const f = fit(R, 0.1);
    const cx = f.X(0.5), cy = f.Y(0.5), r = f.S(0.48), rin = f.S(0.4);
    ctx.save();
    ctx.fillStyle = css(ink);
    // solid ring (outer circle minus inner circle, evenodd)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx, cy, rin, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    // three-point star: three tapered spokes meeting at centre, 120° apart.
    const tip = rin * 0.99, baseW = f.S(0.11);
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
      const px = cx + Math.cos(a) * tip, py = cy + Math.sin(a) * tip;
      const bx = -Math.sin(a) * baseW, by = Math.cos(a) * baseW;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(cx + bx, cy + by);
      ctx.lineTo(cx - bx, cy - by);
      ctx.closePath();
      ctx.fill();
    }
    // small centre hub to tidy the star junction
    ctx.beginPath(); ctx.arc(cx, cy, f.S(0.05), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Ferrari — rearing prancing horse, black on a yellow shield hint.
  function crestFerrari(ctx, R, ink, accent) {
    const f = fit(R, 0.06);
    ctx.save();
    // yellow shield
    ctx.fillStyle = css(BRAND.ferYellow);
    ctx.beginPath();
    ctx.moveTo(f.X(0.16), f.Y(0.06));
    ctx.lineTo(f.X(0.84), f.Y(0.06));
    ctx.lineTo(f.X(0.84), f.Y(0.6));
    ctx.quadraticCurveTo(f.X(0.84), f.Y(0.9), f.X(0.5), f.Y(1.0));
    ctx.quadraticCurveTo(f.X(0.16), f.Y(0.9), f.X(0.16), f.Y(0.6));
    ctx.closePath();
    ctx.fill();
    // prancing horse silhouette (rearing on hind legs, facing left, tail up)
    ctx.fillStyle = css([0.05, 0.05, 0.06]);
    ctx.beginPath();
    ctx.moveTo(f.X(0.40), f.Y(0.20));                              // ear
    ctx.lineTo(f.X(0.36), f.Y(0.13));                              // pointed ear tip
    ctx.lineTo(f.X(0.44), f.Y(0.16));
    ctx.quadraticCurveTo(f.X(0.30), f.Y(0.17), f.X(0.26), f.Y(0.28)); // head/muzzle left
    ctx.quadraticCurveTo(f.X(0.24), f.Y(0.34), f.X(0.30), f.Y(0.34)); // jaw
    ctx.quadraticCurveTo(f.X(0.40), f.Y(0.36), f.X(0.44), f.Y(0.44)); // neck front
    ctx.lineTo(f.X(0.34), f.Y(0.40));                              // raised foreleg 1
    ctx.lineTo(f.X(0.40), f.Y(0.50));
    ctx.lineTo(f.X(0.30), f.Y(0.52));                              // raised foreleg 2 (pawing)
    ctx.lineTo(f.X(0.40), f.Y(0.56));
    ctx.quadraticCurveTo(f.X(0.46), f.Y(0.60), f.X(0.50), f.Y(0.74)); // chest to belly
    ctx.lineTo(f.X(0.46), f.Y(0.90));                              // hind leg (planted)
    ctx.lineTo(f.X(0.56), f.Y(0.90));
    ctx.quadraticCurveTo(f.X(0.60), f.Y(0.64), f.X(0.60), f.Y(0.50)); // haunch
    ctx.quadraticCurveTo(f.X(0.62), f.Y(0.40), f.X(0.56), f.Y(0.32)); // back up to withers
    // flowing tail streaming down-right
    ctx.quadraticCurveTo(f.X(0.74), f.Y(0.42), f.X(0.72), f.Y(0.62));
    ctx.quadraticCurveTo(f.X(0.80), f.Y(0.78), f.X(0.68), f.Y(0.86));
    ctx.quadraticCurveTo(f.X(0.76), f.Y(0.72), f.X(0.66), f.Y(0.60));
    ctx.quadraticCurveTo(f.X(0.62), f.Y(0.44), f.X(0.52), f.Y(0.30)); // back down to mane
    ctx.quadraticCurveTo(f.X(0.50), f.Y(0.22), f.X(0.44), f.Y(0.22)); // mane to head
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // McLaren — the papaya speedmark "swoosh" (a curved comet / chevron).
  function crestMclaren(ctx, R, ink, accent) {
    const f = fit(R, 0.08);
    ctx.save();
    // comet swoosh: thick tail on the left, tapering as it sweeps up to the right.
    ctx.fillStyle = css(BRAND.papaya);
    ctx.beginPath();
    ctx.moveTo(f.X(0.06), f.Y(0.70));                              // tail bottom
    ctx.quadraticCurveTo(f.X(0.05), f.Y(0.58), f.X(0.20), f.Y(0.56)); // rounded tail cap
    ctx.quadraticCurveTo(f.X(0.60), f.Y(0.52), f.X(0.96), f.Y(0.14)); // top edge sweeps up-right
    ctx.quadraticCurveTo(f.X(1.0), f.Y(0.08), f.X(0.90), f.Y(0.12));  // pointed nose
    ctx.quadraticCurveTo(f.X(0.58), f.Y(0.40), f.X(0.30), f.Y(0.62)); // inner edge (concave)
    ctx.quadraticCurveTo(f.X(0.20), f.Y(0.72), f.X(0.06), f.Y(0.70)); // back to tail
    ctx.closePath();
    ctx.fill();
    // lower speed streak beneath, echoing the swoosh
    ctx.fillStyle = cssA(BRAND.papaya, 0.75);
    ctx.beginPath();
    ctx.moveTo(f.X(0.10), f.Y(0.82));
    ctx.quadraticCurveTo(f.X(0.50), f.Y(0.72), f.X(0.80), f.Y(0.50));
    ctx.quadraticCurveTo(f.X(0.56), f.Y(0.80), f.X(0.20), f.Y(0.90));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Red Bull — two charging bulls facing off over a gold disc.
  function crestRedbull(ctx, R, ink, accent) {
    const f = fit(R, 0.06);
    const cx = f.X(0.5), cy = f.Y(0.46);
    ctx.save();
    // gold sun disc
    ctx.fillStyle = css(BRAND.rbGold);
    ctx.beginPath(); ctx.arc(cx, cy, f.S(0.3), 0, Math.PI * 2); ctx.fill();
    // two red bulls charging toward each other (horns meeting at centre top)
    const red = css(BRAND.rbRed);
    drawBull(ctx, f, 0.02, 0.16, 0.5, 0.62, +1, red);   // left bull, head to right
    drawBull(ctx, f, 0.48, 0.16, 0.5, 0.62, -1, red);   // right bull, head to left
    ctx.restore();
  }

  // Alpine — bold stylised "A" with a tricolore hint.
  function crestAlpine(ctx, R, ink, accent) {
    const f = fit(R, 0.08);
    ctx.save();
    // the A silhouette (outer triangle with an inner cut leg-gap)
    ctx.fillStyle = css(ink);
    ctx.beginPath();
    ctx.moveTo(f.X(0.5), f.Y(0.06));
    ctx.lineTo(f.X(0.96), f.Y(0.94));
    ctx.lineTo(f.X(0.74), f.Y(0.94));
    ctx.lineTo(f.X(0.5), f.Y(0.44));
    ctx.lineTo(f.X(0.26), f.Y(0.94));
    ctx.lineTo(f.X(0.04), f.Y(0.94));
    ctx.closePath();
    // inner apex triangle cut-out (evenodd) for a cleaner A
    ctx.moveTo(f.X(0.5), f.Y(0.30));
    ctx.lineTo(f.X(0.40), f.Y(0.52));
    ctx.lineTo(f.X(0.60), f.Y(0.52));
    ctx.closePath();
    ctx.fill("evenodd");
    // tricolore slash across the A (blue / white / red diagonal stripes)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(f.X(0.5), f.Y(0.06));
    ctx.lineTo(f.X(0.96), f.Y(0.94));
    ctx.lineTo(f.X(0.74), f.Y(0.94));
    ctx.lineTo(f.X(0.5), f.Y(0.44));
    ctx.lineTo(f.X(0.26), f.Y(0.94));
    ctx.lineTo(f.X(0.04), f.Y(0.94));
    ctx.closePath();
    ctx.clip();
    const stripes = [BRAND.triBlue, [0.97, 0.97, 0.98], BRAND.triRed];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = css(stripes[i]);
      ctx.beginPath();
      const x = 0.30 + i * 0.115;
      ctx.moveTo(f.X(x), f.Y(0.60));
      ctx.lineTo(f.X(x + 0.11), f.Y(0.60));
      ctx.lineTo(f.X(x + 0.11 + 0.06), f.Y(0.74));
      ctx.lineTo(f.X(x + 0.06), f.Y(0.74));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  // Racing Bulls — compact bull head with horns + "RB" energy mark.
  function crestRacingbulls(ctx, R, ink, accent) {
    const f = fit(R, 0.08);
    ctx.save();
    // shield-ish rounded plate
    ctx.fillStyle = cssA(BRAND.rbNavy, 0.9);
    ctx.beginPath();
    ctx.moveTo(f.X(0.1), f.Y(0.12));
    ctx.lineTo(f.X(0.9), f.Y(0.12));
    ctx.lineTo(f.X(0.9), f.Y(0.56));
    ctx.lineTo(f.X(0.5), f.Y(0.94));
    ctx.lineTo(f.X(0.1), f.Y(0.56));
    ctx.closePath();
    ctx.fill();
    // bold front-facing bull head with sweeping horns
    ctx.fillStyle = css(BRAND.rbRed);
    ctx.beginPath();
    ctx.moveTo(f.X(0.16), f.Y(0.22));                              // left horn tip
    ctx.quadraticCurveTo(f.X(0.30), f.Y(0.16), f.X(0.42), f.Y(0.28)); // horn to brow
    ctx.quadraticCurveTo(f.X(0.5), f.Y(0.22), f.X(0.58), f.Y(0.28));  // brow peak
    ctx.quadraticCurveTo(f.X(0.70), f.Y(0.16), f.X(0.84), f.Y(0.22)); // right horn tip
    ctx.quadraticCurveTo(f.X(0.72), f.Y(0.30), f.X(0.68), f.Y(0.42)); // right side of face
    ctx.lineTo(f.X(0.60), f.Y(0.58));                              // cheek to muzzle
    ctx.quadraticCurveTo(f.X(0.5), f.Y(0.66), f.X(0.40), f.Y(0.58)); // muzzle base
    ctx.lineTo(f.X(0.32), f.Y(0.42));                              // left cheek
    ctx.quadraticCurveTo(f.X(0.28), f.Y(0.30), f.X(0.16), f.Y(0.22));
    ctx.closePath();
    ctx.fill();
    // "RB" energy mark beneath the head
    ctx.fillStyle = css([0.97, 0.97, 0.98]);
    ctx.font = "900 " + Math.round(f.S(0.2)) + "px Arial, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("RB", f.X(0.5), f.Y(0.76));
    ctx.restore();
  }

  // Haas — an angular industrial "H": two bold bars + a diagonal.
  function crestHaas(ctx, R, ink, accent) {
    const f = fit(R, 0.1);
    ctx.save();
    // two vertical bars
    ctx.fillStyle = css(ink);
    ctx.fillRect(f.X(0.14), f.Y(0.1), f.S(0.2), f.S(0.8));   // left post
    ctx.fillRect(f.X(0.66), f.Y(0.1), f.S(0.2), f.S(0.8));   // right post
    // bold diagonal cross-member (industrial girder look), in red accent
    ctx.fillStyle = css(BRAND.haasRed);
    ctx.beginPath();
    ctx.moveTo(f.X(0.30), f.Y(0.34));
    ctx.lineTo(f.X(0.70), f.Y(0.54));
    ctx.lineTo(f.X(0.70), f.Y(0.70));
    ctx.lineTo(f.X(0.30), f.Y(0.50));
    ctx.closePath();
    ctx.fill();
    // chamfered corner nicks for a machined feel
    ctx.fillStyle = css(ink);
    ctx.fillRect(f.X(0.30), f.Y(0.44), f.S(0.06), f.S(0.12));
    ctx.fillRect(f.X(0.64), f.Y(0.44), f.S(0.06), f.S(0.12));
    ctx.restore();
  }

  // Williams — the "W" double-chevron racing-stripes mark.
  function crestWilliams(ctx, R, ink, accent) {
    const f = fit(R, 0.08);
    ctx.save();
    // Two overlapping bold chevrons forming a forward-leaning W of racing stripes.
    const draw = (dx, style) => {
      ctx.fillStyle = style;
      ctx.beginPath();
      // left down-stroke
      ctx.moveTo(f.X(0.06 + dx), f.Y(0.2));
      ctx.lineTo(f.X(0.22 + dx), f.Y(0.2));
      ctx.lineTo(f.X(0.40 + dx), f.Y(0.62));
      ctx.lineTo(f.X(0.56 + dx), f.Y(0.2));
      ctx.lineTo(f.X(0.72 + dx), f.Y(0.2));
      ctx.lineTo(f.X(0.44 + dx), f.Y(0.86));   // valley point
      ctx.lineTo(f.X(0.30 + dx), f.Y(0.86));
      ctx.closePath();
      ctx.fill();
    };
    draw(0.02, css(accent));   // rear stripe (offset, accent)
    draw(0.16, css(ink));      // front stripe (ink) → overlap reads as double-chevron W
    ctx.restore();
  }

  // Audi — four interlocking rings.
  function crestAudi(ctx, R, ink, accent) {
    const f = fit(R, 0.05);
    ctx.save();
    ctx.strokeStyle = css(ink);
    ctx.lineWidth = f.S(0.07);
    const r = f.S(0.17);
    const cy = f.Y(0.5);
    const xs = [0.19, 0.39, 0.59, 0.79];   // overlapping spacing (< 2r apart) → interlocked
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(f.X(xs[i]), cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Aston Martin — outstretched eagle wings with a central "AM".
  function crestAstonmartin(ctx, R, ink, accent) {
    const f = fit(R, 0.05);
    ctx.save();
    ctx.fillStyle = css(ink);
    // spread wings: layered feathers sweeping up-and-out from the centre.
    for (let s = -1; s <= 1; s += 2) {
      for (let layer = 0; layer < 4; layer++) {
        const yv = 0.34 + layer * 0.1;                    // each feather row lower
        const reach = 0.46 - layer * 0.06;                // upper feathers reach further
        const tipY = yv - 0.14 + layer * 0.03;            // tips angle upward
        ctx.beginPath();
        ctx.moveTo(f.X(0.5), f.Y(yv));
        ctx.quadraticCurveTo(
          f.X(0.5 + s * reach * 0.6), f.Y(tipY),
          f.X(0.5 + s * reach), f.Y(tipY + 0.02));
        ctx.lineTo(f.X(0.5 + s * reach * 0.9), f.Y(tipY + 0.09));
        ctx.quadraticCurveTo(
          f.X(0.5 + s * reach * 0.4), f.Y(yv + 0.02),
          f.X(0.5), f.Y(yv + 0.08));
        ctx.closePath();
        ctx.fill();
      }
    }
    // central banner/shield carrying the letters
    ctx.fillStyle = css(accent);
    ctx.beginPath();
    ctx.moveTo(f.X(0.40), f.Y(0.30));
    ctx.lineTo(f.X(0.60), f.Y(0.30));
    ctx.lineTo(f.X(0.58), f.Y(0.66));
    ctx.quadraticCurveTo(f.X(0.5), f.Y(0.80), f.X(0.42), f.Y(0.66));
    ctx.closePath();
    ctx.fill();
    // "AM" monogram
    ctx.fillStyle = css(ink);
    ctx.font = "900 " + Math.round(f.S(0.18)) + "px Arial, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("AM", f.X(0.5), f.Y(0.5));
    ctx.restore();
  }

  // Cadillac — a crest/shield with a laurel wreath + geometric quarters.
  function crestCadillac(ctx, R, ink, accent) {
    const f = fit(R, 0.08);
    const shield = () => {
      ctx.beginPath();
      ctx.moveTo(f.X(0.26), f.Y(0.16));
      ctx.lineTo(f.X(0.74), f.Y(0.16));
      ctx.lineTo(f.X(0.74), f.Y(0.56));
      ctx.quadraticCurveTo(f.X(0.74), f.Y(0.84), f.X(0.5), f.Y(0.94));
      ctx.quadraticCurveTo(f.X(0.26), f.Y(0.84), f.X(0.26), f.Y(0.56));
      ctx.closePath();
    };
    ctx.save();
    // laurel wreath — two arcs of leaves either side of the shield
    ctx.fillStyle = css(BRAND.cadGold);
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const ang = (-0.9 + t * 1.5);                     // sweep along the arc
        const bx = 0.5 + s * (0.30 + 0.06 * Math.sin(t * Math.PI));
        const by = 0.30 + t * 0.5;
        ctx.save();
        ctx.translate(f.X(bx), f.Y(by));
        ctx.rotate(s * (0.7 - ang));
        ctx.beginPath();
        ctx.ellipse(0, 0, f.S(0.055), f.S(0.022), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // gold shield frame
    ctx.fillStyle = css(BRAND.cadGold);
    shield();
    ctx.fill();
    // inner shield, quartered
    ctx.save();
    shield();
    ctx.clip();
    // background (ink)
    ctx.fillStyle = css(ink);
    ctx.fillRect(f.X(0.26), f.Y(0.16), f.S(0.48), f.S(0.8));
    // accent quarters (top-left + bottom-right) → checkered heraldic look
    ctx.fillStyle = css(accent);
    ctx.fillRect(f.X(0.26), f.Y(0.16), f.S(0.24), f.S(0.39));
    ctx.fillRect(f.X(0.5), f.Y(0.55), f.S(0.24), f.S(0.41));
    // crown bars across the top band
    ctx.fillStyle = css(BRAND.cadGold);
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(f.X(0.31 + i * 0.11), f.Y(0.19), f.S(0.05), f.S(0.1));
    }
    ctx.restore();
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
