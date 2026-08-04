"use strict";
// liverytex.js — per-team LIVERY TEXTURE ATLAS generator.
// Pure canvas-2D. Draws stylised (fan-art) team crests, invented sponsor
// wordmarks and the car number onto a transparent SIZE×SIZE atlas. The 3D car
// maps panel UVs onto the named REGIONS below. Original stylised marks only —
// these are recognisable-in-silhouette homages, NOT exact trademark repros.
const LiveryTex = (function () {
  const SIZE = 1024;
  // Mobile tier (must match glx.js): upload atlases at half size — 22 cars ×
  // 1024² RGBA + mips was ~117 MB of GPU memory, the biggest consumer on iOS
  // web apps, whose jetsam budget counts GPU allocations.
  let _gfxHigh = false, _forceMobile = false;
  try {
    _gfxHigh = localStorage.getItem("apex26.gfxHigh") === "1";
    _forceMobile = localStorage.getItem("apex26.forceMobileTier") === "1";
  } catch (_) {}
  const IS_MOBILE = (_forceMobile ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) && !_gfxHigh;

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
    fin:    { x: 40,  y: 856, w: 430, h: 160 },  // shark-fin tail: the painted graphic, stretched over the whole swept fin
    // The fin's crest rides on its OWN square region, mapped to an upright square
    // patch on the fin (Car3D.sharkFinBadge). It cannot share the `fin` rect: that
    // one is stretched over the fin's raked, tapering outline, which shears and
    // squashes anything with a recognisable shape. Square region → square patch →
    // undistorted badge, whatever the surface under it is doing.
    finBadge: { x: 500, y: 856, w: 160, h: 160 },
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
    redbull:     ["SKYSTRIKE", "ADRENYX", "VOLTRUSH", "AEROBOLT", "NITROX", "THUNDERA"],
    racingbulls: ["STRADALE", "VELOCE", "URBANO", "SCATTO", "NEONVIA", "RAGAZZO"],
    ferrari:     ["CAVALLO", "MODENESE", "AURELIO", "PRECISO", "SCUDERA", "HERALDO"],
    mclaren:     ["AEROCORE", "PIXLBYTE", "BRITECH", "ORBITAL", "NIMBUS", "QUANTIC"],
    mercedes:    ["VELTRA", "PRAZIS", "AUTOBAHN", "KELVIQ", "STROMTEK", "DIAMYX"],
    alpine:      ["CHAMONIX", "AZURELLE", "ALPIQ", "ESPRIT", "MISTRAL", "BLEUROC"],
    williams:    ["GROVEX", "ALBION", "STRATON", "OXFORD", "IRONOAK", "MERIDEN"],
    haas:        ["IRONGATE", "MILLWORX", "CARBIDE", "FORGECO", "TORQUEX", "RIVETON"],
    audi:        ["VORSPRUN", "ELEKTRA", "PRAZION", "INGOLTEK", "VOLTKERN", "NEURON"],
    astonmartin: ["ARAMONT", "GAYDONA", "AVIONNE", "REGALIS", "WINGCRAFT", "SAVILE"],
    cadillac:    ["DETROX", "CRESTLIN", "LIBERTA", "AMERIGO", "MOTORCTY", "GRANDEUR"],
  };

  // ── colour helpers ─────────────────────────────────────────────────────────
  function to255(c) { return [
    Math.round(Math.max(0, Math.min(1, c[0])) * 255),
    Math.round(Math.max(0, Math.min(1, c[1])) * 255),
    Math.round(Math.max(0, Math.min(1, c[2])) * 255),
  ]; }
  function css(c) { const r = to255(c); return "rgb(" + r[0] + "," + r[1] + "," + r[2] + ")"; }
  function cssA(c, a) { const r = to255(c); return "rgba(" + r[0] + "," + r[1] + "," + r[2] + "," + a + ")"; }
  // Relative luminance, WCAG-style. The channels MUST be linearised first —
  // applying the Rec.709 coefficients straight to gamma-encoded sRGB (which this
  // did) overstates mid-tones badly: 0.5 grey reads as luminance 0.5 when it is
  // really 0.21. Every ink decision below hangs off this number.
  function lin(u) { return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  // WCAG contrast ratio, 1 (identical) .. 21 (black on white).
  function contrast(a, b) {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  const INK_DARK = [0.06, 0.06, 0.08], INK_LIGHT = [0.97, 0.97, 0.98];
  // Text on this car is legible below about 4.5:1; under 3:1 it disappears at
  // racing distance. Marks that cannot reach the target get a halo instead.
  // 4.5 is the WCAG threshold for *body* text on a screen you are staring at.
  // These are bold marks on a car moving past at speed, and a mark that lands
  // just over the line — dark-on-crimson at 4.50 on Audi's titanium livery —
  // reads as legible-but-muddy. 6.5 haloes those too: 17% of marks get an
  // outline rather than 4%, and the rest stay clean.
  const INK_TARGET = 6.5, INK_FLOOR = 3.0;
  // Pick the ink with the best WORST-CASE contrast over every paint the mark can
  // land on. A sidepod wordmark can straddle the base paint AND a livery's pod
  // panel, so inking it against c1 alone is how a mark ends up invisible on the
  // half of the panel nobody checked.
  function inkOn(bgs) {
    const list = bgs.filter(Boolean);
    if (!list.length) return INK_LIGHT;
    const worst = (ink) => Math.min.apply(null, list.map((b) => contrast(ink, b)));
    const d = worst(INK_DARK), l = worst(INK_LIGHT);
    // COPY, never the shared constant: the caller tags the result with its
    // worst-case ratio, and handing back INK_DARK itself would let each region's
    // score overwrite the previous region's.
    const ink = (d >= l ? INK_DARK : INK_LIGHT).slice();
    ink.worst = Math.max(d, l);
    return ink;
  }
  // Pick a high-contrast ink for a given paint colour.
  function inkFor(c) { return inkOn([c]); }
  // The halo a mark needs when no ink clears INK_TARGET on its background: the
  // opposite ink, stroked behind the glyphs, which buys contrast on any paint.
  function haloFor(ink) { return lum(ink) < 0.5 ? INK_LIGHT : INK_DARK; }

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
    // Halo first, under the fill: a stroke in the opposite ink so the wordmark
    // still separates from a paint neither black nor white contrasts well with.
    if (opts.halo) {
      ctx.strokeStyle = css(opts.halo);
      ctx.lineWidth = Math.max(2, size * 0.13);
      ctx.lineJoin = "round";
      let hx = x;
      for (let i = 0; i < text.length; i++) {
        ctx.strokeText(text[i], hx, y);
        hx += widths[i] + size * spacing;
      }
    }
    ctx.fillStyle = css(ink);
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], x, y);
      x += widths[i] + size * spacing;
    }
    ctx.restore();
  }

  // Big centred number — bold italic F1-style numeral with an accent outline and
  // a soft drop shadow for depth. `ink` fills, `accent` haloes, optional `bg`
  // paints a rounded backing patch (so the number reads on any surface colour,
  // e.g. the accent-coloured shark fin it sits on).
  function drawNumber(ctx, n, R, ink, accent, bg) {
    if (bg) {
      // Rounded number-board patch: base-paint fill + thin accent keyline.
      const m = 8, rad = 34;
      const x0 = R.x + m, y0 = R.y + m, w = R.w - m * 2, h = R.h - m * 2;
      ctx.beginPath();
      ctx.moveTo(x0 + rad, y0);
      ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, rad);
      ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, rad);
      ctx.arcTo(x0, y0 + h, x0, y0, rad);
      ctx.arcTo(x0, y0, x0 + w, y0, rad);
      ctx.closePath();
      ctx.fillStyle = css(bg);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = cssA(accent, 0.9);
      ctx.stroke();
    }
    const pad = 10;
    const maxH = R.h - pad * 2;
    const maxW = R.w - pad * 2;
    const text = String(n);
    const font = (px) => "italic 900 " + px + "px 'Arial Narrow', Arial, sans-serif";
    let size = maxH;
    for (; size > 8; size--) {
      ctx.font = font(size);
      if (ctx.measureText(text).width <= maxW) break;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();
    ctx.font = font(size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    // soft drop shadow (offset dark) for a painted-on depth cue
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillText(text, cx + size * 0.03, cy + size * 0.035);
    // bold accent outline behind the fill
    ctx.lineWidth = Math.max(6, size * 0.075);
    ctx.strokeStyle = css(accent);
    ctx.lineJoin = "round";
    ctx.strokeText(text, cx, cy);
    // thin ink keyline hugging the accent for crisp separation
    ctx.lineWidth = Math.max(2, size * 0.02);
    ctx.strokeStyle = cssA(ink, 0.55);
    ctx.strokeText(text, cx, cy);
    // main fill
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
  function crestFerrari(ctx, R, ink, accent, bare) {
    const f = fit(R, 0.06);
    ctx.save();
    // yellow shield (skipped in `bare` mode — e.g. the shark fin wants just the
    // horse painted on the bodywork, not a badge)
    if (!bare) {
      ctx.fillStyle = css(BRAND.ferYellow);
      ctx.beginPath();
      ctx.moveTo(f.X(0.16), f.Y(0.06));
      ctx.lineTo(f.X(0.84), f.Y(0.06));
      ctx.lineTo(f.X(0.84), f.Y(0.6));
      ctx.quadraticCurveTo(f.X(0.84), f.Y(0.9), f.X(0.5), f.Y(1.0));
      ctx.quadraticCurveTo(f.X(0.16), f.Y(0.9), f.X(0.16), f.Y(0.6));
      ctx.closePath();
      ctx.fill();
    }
    // prancing horse silhouette (rearing on hind legs, facing left, tail up).
    // In bare mode paint it in ink so it reads on the team-colour fin. On the
    // shield it is black — through brandMark, so a livery `logo` colour reaches
    // the horse here too and not only on the fin.
    ctx.fillStyle = bare ? css(ink) : css(brandMark([0.05, 0.05, 0.06]));
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
    ctx.fillStyle = css(brandMark(BRAND.papaya));
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
    ctx.fillStyle = cssA(brandMark(BRAND.papaya), 0.75);
    ctx.beginPath();
    ctx.moveTo(f.X(0.10), f.Y(0.82));
    ctx.quadraticCurveTo(f.X(0.50), f.Y(0.72), f.X(0.80), f.Y(0.50));
    ctx.quadraticCurveTo(f.X(0.56), f.Y(0.80), f.X(0.20), f.Y(0.90));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Red Bull — two charging bulls facing off over a gold disc.
  function crestRedbull(ctx, R, ink, accent, bare) {
    const f = fit(R, 0.06);
    const cx = f.X(0.5), cy = f.Y(0.46);
    ctx.save();
    // gold sun disc (skipped in bare/fin mode — just the charging bulls painted on)
    if (!bare) {
      ctx.fillStyle = css(BRAND.rbGold);
      ctx.beginPath(); ctx.arc(cx, cy, f.S(0.3), 0, Math.PI * 2); ctx.fill();
    }
    // two red bulls charging toward each other (horns meeting at centre top).
    // Keep the bulls red on the gold disc. On the BARE fin there is no disc, so
    // the silhouette has to hold against the fin's own paint — and the fin is
    // painted c2, which for Red Bull itself is the gold. Gold-on-gold is why the
    // bulls only showed where the tail wash happened to cross them. `ink` is
    // already chosen for the fin paint, so its polarity picks the brand colour
    // that reads: dark ink = pale fin → red bulls; light ink = dark fin → gold.
    const red = css(brandMark(!bare ? BRAND.rbRed
      : (lum(ink) < 0.5 ? BRAND.rbRed : BRAND.rbGold)));
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
  function crestRacingbulls(ctx, R, ink, accent, bare) {
    const f = fit(R, 0.08);
    ctx.save();
    // shield-ish rounded plate (skipped in bare/fin mode)
    if (!bare) {
      ctx.fillStyle = cssA(BRAND.rbNavy, 0.9);
      ctx.beginPath();
      ctx.moveTo(f.X(0.1), f.Y(0.12));
      ctx.lineTo(f.X(0.9), f.Y(0.12));
      ctx.lineTo(f.X(0.9), f.Y(0.56));
      ctx.lineTo(f.X(0.5), f.Y(0.94));
      ctx.lineTo(f.X(0.1), f.Y(0.56));
      ctx.closePath();
      ctx.fill();
    }
    // bold front-facing bull head with sweeping horns
    ctx.fillStyle = css(brandMark(BRAND.rbRed));
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
    ctx.fillStyle = css(brandMark(BRAND.haasRed));
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
  // `bare` (fin mode): skip the wreath + gold shield plate — a solid heraldic
  // rectangle looks like a stuck-on badge sticker on a painted tail — and just
  // paint the crown + quartered emblem straight onto the fin, echoing the
  // ferrari/redbull/racingbulls fin treatment (motif only, no backing plate).
  function crestCadillac(ctx, R, ink, accent, bare) {
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
    if (bare) {
      // Crown bars, enlarged and centred (no shield/wreath beneath them).
      ctx.fillStyle = css(brandMark(BRAND.cadGold));
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(f.X(0.29 + i * 0.115), f.Y(0.28), f.S(0.055), f.S(0.16));
      }
      // Two accent diamonds echoing the shield's heraldic quarters.
      ctx.fillStyle = css(accent);
      for (let s = -1; s <= 1; s += 2) {
        const cx = f.X(0.5 + s * 0.16), cy = f.Y(0.62);
        ctx.beginPath();
        ctx.moveTo(cx, cy - f.S(0.1));
        ctx.lineTo(cx + f.S(0.08), cy);
        ctx.lineTo(cx, cy + f.S(0.1));
        ctx.lineTo(cx - f.S(0.08), cy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    // laurel wreath — two arcs of leaves either side of the shield
    ctx.fillStyle = css(brandMark(BRAND.cadGold));
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
    ctx.fillStyle = css(brandMark(BRAND.cadGold));
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
    ctx.fillStyle = css(brandMark(BRAND.cadGold));
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

  // A livery's `logo` colour, live only for the duration of one drawCrest call.
  // Most crests paint their mark in `ink`, but several are drawn in a baked
  // BRAND colour (McLaren's papaya swoosh, the bulls, Haas's girder, Cadillac's
  // crest) — an override that only replaced `ink` would recolour half the grid
  // and silently skip the rest. brandMark() is applied at the FOREGROUND mark
  // sites only; backing plates and discs (Ferrari's yellow shield, the Red Bull
  // sun disc, the Racing Bulls plate) keep their own colour so the mark still
  // has something to sit on. Those are skipped in `bare` (shark-fin) mode
  // anyway, which is where a hand-picked logo colour matters most.
  let _logoInk = null;
  function brandMark(c) { return _logoInk || c; }
  function drawCrest(ctx, teamId, R, ink, accent, bare, logo) {
    _logoInk = logo || null;
    const fn = CRESTS[teamId];
    try {
      if (fn) fn(ctx, R, logo || ink, accent, bare);
      else crestGeneric(ctx, R, logo || ink, accent, teamId);
    } finally { _logoInk = null; }
  }

  // Per-team livery GRAPHIC backdrop painted behind the crest — an accent wash +
  // bold flowing streaks (edges faded to transparent) so the engine cover / tail
  // reads as a real designed livery panel (à la the Red Bull tail) rather than a
  // logo floating on flat paint. Style varies per team so each tail is distinct.
  const TAIL_STYLE = {
    redbull:     { kind: "diag",    a: 0.80 },   // charging diagonal slash
    racingbulls: { kind: "diag",    a: 0.70 },   // youthful bold slash
    ferrari:     { kind: "sweep",   a: 0.66 },   // low sweeping curve
    mclaren:     { kind: "chevron", a: 0.74 },   // aero speed chevrons
    mercedes:    { kind: "streak",  a: 0.62 },   // fine parallel streaks
    williams:    { kind: "chevron", a: 0.62 },   // engineering chevrons
    alpine:      { kind: "sweep",   a: 0.64 },   // chic flowing curve
    audi:        { kind: "streak",  a: 0.60 },   // precise fine lines
    astonmartin: { kind: "sweep",   a: 0.62 },   // graceful wing sweep
    haas:        { kind: "diag",    a: 0.68 },   // industrial hard slash
    cadillac:    { kind: "chevron", a: 0.60 },   // bold Detroit chevrons
  };
  function drawTailGraphic(ctx, teamId, R, c1, c2, stripe) {
    const st = TAIL_STYLE[teamId] || { kind: "diag", a: 0.6 };
    const acc = stripe || c2;
    const X = R.x, Y = R.y, W = R.w, H = R.h;
    ctx.save();
    // 1) directional accent wash across the panel — a firmer diagonal band so the
    //    tail carries a clear designed base tint before the motif strokes land.
    const g = ctx.createLinearGradient(X, Y + H, X + W, Y);
    g.addColorStop(0.0, cssA(acc, 0));
    g.addColorStop(0.5, cssA(acc, st.a * 0.85));
    g.addColorStop(1.0, cssA(acc, 0));
    ctx.fillStyle = g;
    ctx.fillRect(X, Y, W, H);
    // 2) bold motif strokes per style — cleaner shapes, crisper falloff.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (st.kind === "chevron") {
      // Nested arrowheads pointing forward — bold at front, fading rearward.
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
      // A few clean stacked curves sweeping low-to-high across the panel.
      ctx.lineWidth = W * 0.115;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = cssA(acc, st.a * (1 - i * 0.26));
        ctx.beginPath();
        ctx.moveTo(X - W * 0.08, Y + H * (0.72 + i * 0.11));
        ctx.quadraticCurveTo(X + W * 0.5, Y + H * (0.04 + i * 0.11), X + W * 1.08, Y + H * (0.46 + i * 0.11));
        ctx.stroke();
      }
    } else if (st.kind === "streak") {
      // Fine, evenly spaced parallel racing lines raked forward.
      ctx.lineWidth = W * 0.032;
      for (let i = 0; i < 8; i++) {
        ctx.strokeStyle = cssA(acc, st.a * (0.45 + 0.55 * (1 - i / 8)));
        const o = X + W * (0.05 + i * 0.115);
        ctx.beginPath();
        ctx.moveTo(o, Y + H);
        ctx.lineTo(o + W * 0.42, Y);
        ctx.stroke();
      }
    } else { // diag slash
      // Bold parallel slashes charging up to the right — hero stroke leads.
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
    // 3) fade the panel edges to transparent so it blends into the bodywork.
    const rg = ctx.createRadialGradient(X + W / 2, Y + H / 2, W * 0.34, X + W / 2, Y + H / 2, W * 0.72);
    rg.addColorStop(0, "rgba(0,0,0,0)");
    rg.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = rg;
    ctx.fillRect(X, Y, W, H);
    ctx.restore();
  }

  // ── main ─────────────────────────────────────────────────────────────────
  function buildAtlas(teamId, colors, numberOverride, isPlayer) {
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
    // The shark fin is its own paintable panel: `fin` is the plate colour and
    // `finArt` the tail graphic on it. Both optional — a livery that sets neither
    // gets exactly today's look (fin = c2, art auto-picked to read on it).
    const finPaint = colors.fin || c2;
    const finArt = colors.finArt || null;
    // The team CREST itself, wherever it is drawn (engine cover + shark fin).
    // Distinct from `finArt`, which is the abstract tail wash behind it — one is
    // the mark, the other is the paint job it sits on. Absent = the automatic
    // ink, which is chosen to contrast whatever paint the crest lands on.
    const logo = colors.logo || null;

    // Each region is inked against the paint IT lands on, not against c1 for all
    // of them. A livery that sets `pod` repaints the lower sidepod, which is
    // exactly where the strip and the bottom of the primary wordmark sit — inking
    // those against the base paint is how a mark ends up unreadable on the panel.
    const pod = colors.pod || null;
    // The sidepod carries a physical sponsor BOARD — a fixed pale panel the car
    // mesh paints under the wordmark — and the ink logic never knew about it.
    // On any dark livery the ink resolves LIGHT for the paint and then lands on
    // that pale board at 1.4:1, which is the faint sidepod text. It is part of
    // the background set now, so the ink (or its halo) has to clear it too.
    const board = (typeof Car3D !== "undefined" && Car3D.PANEL_COL) || [0.82, 0.82, 0.86];
    // The sponsor board now covers the whole titleA/titleB rect (car3d.js sizes
    // the flank span to yFrac 0.24..0.84 to match podDecal), so the wordmark sits
    // on ONE surface and inks for it alone — ~12.6:1 on every livery instead of
    // the compromise between board and paint that forced a halo on 70% of them.
    const podBg = [board];
    // The `strip` decal sits wholly on the c2 accent band (car3d sizes that band
    // to yFrac 0.08..0.30 to match), so it inks for c2 alone.
    const stripBg = [c2];
    // The nose NUMBER sits over the c2 crown stripe (the addLoft accent running
    // z 1.60..2.66) as well as the base paint, so it is inked for both.
    const ink = inkOn([c1, c2]);             // nose / endplate number
    // The engine-cover crest is BISECTED by the shark fin, which is painted c2 —
    // the mark genuinely spans two colours, so it is inked for both and takes a
    // halo when they disagree. (Verified by the mesh probe in
    // tests/parts-livery-contrast.spec.js, which reads what is actually behind
    // each decal rather than trusting this list.)
    const inkCrest = inkOn([c1, finPaint]);
    // The SHARK FIN is painted `fin` (c2 unless the livery picks one — see the
    // sharkFin block in car3d.js), not c1, so inking its motif for the body put a
    // white crest on a white fin at 1.00:1 on any livery whose accent is pale —
    // Ferrari's default among them.
    const inkFin = inkOn([finPaint]);
    const inkPod = inkOn(podBg);              // sidepod wordmarks
    const inkStrip = inkOn(stripBg);
    // A mark that cannot reach INK_TARGET on its background gets a halo rather
    // than being left to vanish; below INK_FLOOR it would be invisible outright.
    const haloIf = (i) => (i.worst < INK_TARGET ? haloFor(i) : null);

    let accent = c2;
    if (stripe) accent = stripe;
    // Guard: the accent has to separate from BOTH the ink it sits beside and the
    // paint behind it. The old check compared raw luminance difference against a
    // flat 0.15, which passes plenty of pairs that are indistinguishable in
    // practice, and its fallback was never re-checked.
    if (contrast(accent, ink) < 2.0 || contrast(accent, c1) < 1.6) {
      const options = [c2, stripe, c1, INK_LIGHT, INK_DARK].filter(Boolean);
      let best = accent, bestScore = -1;
      for (const cand of options) {
        const score = Math.min(contrast(cand, ink), contrast(cand, c1));
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      accent = best;
    }

    // Engine-cover panel: tail graphic + full crest (badge is fine on the flat top).
    drawTailGraphic(ctx, teamId, REGIONS.crest, c1, c2, stripe);
    drawCrest(ctx, teamId, REGIONS.crest, inkCrest, accent, false, logo);
    // Shark-fin panel: the SAME tail graphic + a BARE motif (disc/shield stripped)
    // so the fin reads as a painted tail, not a floating badge.
    // The wash + motif strokes are the accent colour, and the FIN IS ITS OWN
    // PANEL — so handing this the body's accent (`stripe`, else c2) painted Red
    // Bull's yellow slashes onto its yellow fin, and the only yellow you could
    // see was the part that overhung onto the bodywork. A livery can name the
    // colour outright (`finArt`); otherwise take the first candidate that
    // actually separates from the paint it lands on.
    const finWash = finArt || [stripe, c1, accent, inkFin].filter(Boolean)
      .find((c) => contrast(c, finPaint) >= 1.8) || inkFin;
    drawTailGraphic(ctx, teamId, REGIONS.fin, c1, finPaint, finWash);
    // The BARE motif (disc/shield stripped) goes in the square badge region, which
    // the car maps to an upright square on the fin — so it reads as a painted tail
    // rather than a floating badge, without inheriting the fin's rake.
    // Accent has to separate from the FIN's ink here, not the body's.
    const finAccent = contrast(accent, inkFin) >= 2.0 ? accent
      : (contrast(c1, inkFin) >= 2.0 ? c1 : haloFor(inkFin));
    drawCrest(ctx, teamId, REGIONS.finBadge, inkFin, finAccent, true, logo);

    // Sponsor wordmarks.
    const names = SPONSORS[teamId] || ["APEXFIN", "NEXUS", "VOLTARC", "MERIDIAN", "HYPERGRID", "QUANTA"];
    drawWordmark(ctx, names[0], REGIONS.titleA, inkPod,
      { align: "center", halo: haloIf(inkPod) });
    drawWordmark(ctx, names[1], REGIONS.titleB, inkPod,
      { align: "center", halo: haloIf(inkPod) });
    // The rear-wing band is inked for the WING flap colour, which a livery sets
    // independently (it defaults to c2, not c1).
    const inkWing = inkOn([colors.wing || c2]);
    drawWordmark(ctx, names[2], REGIONS.wing, inkWing,
      { align: "center", spacing: 0.1, halo: haloIf(inkWing) });
    // Long thin strip: chain a couple of names.
    drawWordmark(ctx, names[3] + "   " + names[4] + "   " + names[5],
      REGIONS.strip, inkStrip, { align: "center", spacing: 0.04, halo: haloIf(inkStrip) });

    // Car number — driver-specific when the caller passes one, else the team's
    // primary number. Drawn on the base-paint nose flank, so `ink` (chosen to
    // contrast c1) reads cleanly.
    const num = numberOverride != null ? numberOverride
              : (NUMBERS[teamId] != null ? NUMBERS[teamId] : 0);
    drawNumber(ctx, num, REGIONS.num, ink, accent, c1);

    // Mobile tier: upload at 512² instead of 1024². All layout stays authored at
    // SIZE (UVs are FRACTIONS of the atlas — resolution-independent), only the
    // uploaded texture shrinks: 5.3 MB → 1.3 MB per atlas, ×22 cars ≈ −88 MB —
    // the single biggest GPU consumer on iOS web apps (tight jetsam budget).
    // AI cars drop a further step to 256² (−0.98 MB each, ~−20 MB per grid):
    // they're never seen closer than a few car lengths at mobile DPR, only the
    // player's own car (and the setup preview) needs the 512² read.
    if (IS_MOBILE) {
      const small = document.createElement("canvas");
      const div = isPlayer ? 2 : 4;
      small.width = SIZE / div; small.height = SIZE / div;
      small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
      return small;
    }
    return canvas;
  }

  return { SIZE, REGIONS, buildAtlas, drawCrest };
})();
if (typeof window !== "undefined") window.LiveryTex = LiveryTex;
