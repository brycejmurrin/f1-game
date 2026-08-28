"use strict";
const LiveryTex = (function () {
  const SIZE = 1024;
  // Mobile tier: upload atlases at half size — 22 cars × 1024² RGBA + mips was
  // ~117 MB of GPU memory, the biggest consumer on iOS web apps, whose jetsam
  // budget counts GPU allocations. This used to be a hand-copy of glx.js's
  // sniff ("must match glx.js" — a comment is not a mechanism); it now READS
  // glx.js's answer, which is the same "phone AND not GRAPHICS: HIGH" tier this
  // file always meant by IS_MOBILE. glx.js is tagged ahead of this file in both
  // index.html and the CARVIEW subset, so the value exists at eval; the
  // typeof guard is the standalone-harness fallback (full-size atlas), never a
  // path the shipped shell takes.
  const IS_MOBILE = typeof GLX !== "undefined" && !!GLX.mobileTier;

  // Named atlas regions in CANVAS PIXELS (origin top-left, y down). The 3D side
  // maps panel UVs to these rects. Do NOT change these numbers — the geometry
  // depends on them.
  const REGIONS = {
    crest:  { x: 40,  y: 40,  w: 430, h: 430 },  // team crest/logo (engine-cover top; badge copy on the fin via finBadge)
    titleA: { x: 500, y: 40,  w: 484, h: 170 },  // primary sponsor wordmark
    titleB: { x: 500, y: 240, w: 484, h: 130 },  // secondary sponsor
    wing:   { x: 40,  y: 520, w: 620, h: 150 },  // rear-wing sponsor band
    num:    { x: 700, y: 420, w: 284, h: 284 },  // large car number
    strip:  { x: 40,  y: 720, w: 944, h: 130 },  // long thin sponsor strip (sidepod lower)
    fin:    { x: 40,  y: 856, w: 430, h: 160 },  // shark-fin tail: the painted graphic, stretched over the whole swept fin
    finBadge: { x: 500, y: 856, w: 160, h: 160 },
  };

  // Primary driver number per team.
  const NUMBERS = {
    mercedes: 63, ferrari: 16, mclaren: 1, redbull: 33, alpine: 10,
    racingbulls: 40, haas: 31, williams: 55, audi: 27, astonmartin: 14,
    cadillac: 11,
  };

  const teamShort = (id) => {
    const t = (typeof Teams !== "undefined" && Teams.LIST || []).find((x) => x.id === id);
    return (t && t.short) || String(id || "").slice(0, 3).toUpperCase();
  };

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
  const INK_TARGET = 6.5, INK_FLOOR = 3.0;
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
  function haloFor(ink) { return lum(ink) < 0.5 ? INK_LIGHT : INK_DARK; }

  function drawWordmark(ctx, text, R, ink, opts) {
    opts = opts || {};
    const pad = opts.pad != null ? opts.pad : 14;
    const spacing = opts.spacing != null ? opts.spacing : 0.06; // of font size
    const align = opts.align || "left";
    const maxW = R.w - pad * 2;
    const maxH = R.h - pad * 2;
    text = String(text).toUpperCase();

    // Find a font size that fits both width (with spacing) and height.
    // Canvas text advance scales linearly with font px, so ONE reference
    // measurement gives the fitting size in closed form; the +-1 walk absorbs
    // hinting rounding and lands on exactly what the old px-by-px descent
    // chose. (The descent re-measured every character at every candidate size
    // — tens of thousands of measureText calls in the first grid frame.)
    const REF = 100;
    ctx.font = "900 " + REF + "px Arial, sans-serif";
    let refW = 0;
    for (let i = 0; i < text.length; i++) refW += ctx.measureText(text[i]).width;
    const perPx = refW / REF + spacing * Math.max(0, text.length - 1);
    let size = Math.max(8, Math.min(Math.min(maxH, 160), Math.floor(maxW / (perPx || 1))));
    const fitsAt = (px) => {
      ctx.font = "900 " + px + "px Arial, sans-serif";
      let w = 0;
      for (let i = 0; i < text.length; i++) {
        w += ctx.measureText(text[i]).width;
        if (i < text.length - 1) w += px * spacing;
      }
      return w <= maxW;
    };
    while (size > 8 && !fitsAt(size)) size--;
    while (size < Math.min(maxH, 160) && fitsAt(size + 1)) size++;
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
    // Same closed-form + walk as drawWordmark: advance is linear in px.
    ctx.font = font(100);
    const refW = ctx.measureText(text).width / 100;
    let size = Math.max(8, Math.min(maxH, Math.floor(maxW / (refW || 1))));
    while (size > 8 && (ctx.font = font(size), ctx.measureText(text).width > maxW)) size--;
    while (size < maxH && (ctx.font = font(size + 1), ctx.measureText(text).width <= maxW)) size++;
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

  // ── one visual language for every mark ─────────────────────────────────────
  // These four numbers are set by the SMALLEST place a crest is ever drawn, and
  // that is not the shark fin at 160 px. buildAtlas downscales the whole atlas
  // to 512 for the player and 256 for AI cars on the mobile tier, so the fin
  // badge bottoms out at 40 px and the fit box at 34. Every floor below is that
  // 34 px case expressed as a fraction of the box:
  //   engine cover / garage lightbox 361-363 | cover mobile player 181
  //   fin desktop 134 | cover mobile AI 90 | fin mobile player 67 | fin AI 34
  const CREST_MARGIN = 0.08;   // ONE margin for all twelve (was 0.04 .. 0.10)
  const STROKE_MIN = 0.055;    // 1.9 px at 34: below this a limb does not get
                               // thinner, it disappears
  const GAP_MIN = 0.07;        // 2.4 px at 34, survives one mip level. This is
                               // the H-versus-red-blob threshold, literally:
                               // assets/logos/haas.png failed exactly here
  const TEXT_MIN = 0.22;       // 20 px at the mobile-AI cover. Lettering is
                               // banned outright when `bare`, so 34 never
                               // has to carry any

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

  // ── the mark palette ───────────────────────────────────────────────────────
  // A team's OWN mark colours. These apply on ONE livery: the team's own, which
  // Liveries.forTeam synthesizes as { id: "default", c1: team.color, ... }. Pick
  // any other paint job and the mark re-colours from THAT livery instead,
  // because a Petronas-teal star on a Candy Flip car is not a livery, it is a
  // sticker someone forgot to change. `plate` is the backing shield/disc the
  // mark sits on, or null for the marks that have none.
  const MARK_BRAND = {
    mercedes:    { mark: [0.85, 0.86, 0.88],   alt: [0.0, 0.706, 0.671],   plate: null },
    ferrari:     { mark: [0.05, 0.05, 0.06],   alt: [0.05, 0.05, 0.06],    plate: BRAND.ferYellow },
    mclaren:     { mark: BRAND.papaya,         alt: [0.06, 0.06, 0.08],    plate: null },
    redbull:     { mark: BRAND.rbRed,          alt: BRAND.rbNavy,          plate: BRAND.rbGold },
    alpine:      { mark: [0.0, 0.576, 0.8],    alt: [1.0, 0.529, 0.737],   plate: null },
    racingbulls: { mark: [0.97, 0.97, 0.98],   alt: BRAND.rbRed,           plate: [0.086, 0.204, 0.796] },
    haas:        { mark: [0.97, 0.97, 0.98],   alt: BRAND.haasRed,         plate: null },
    williams:    { mark: [0.97, 0.97, 0.98],   alt: [0.059, 0.235, 0.788], plate: null },
    audi:        { mark: [0.93, 0.93, 0.95],   alt: [0.98, 0.28, 0.05],    plate: null },
    astonmartin: { mark: [0.718, 0.882, 0.106], alt: [0.0, 0.349, 0.31],   plate: null },
    cadillac:    { mark: BRAND.cadGold,        alt: [0.05, 0.05, 0.06],    plate: null },
  };
  // The floor every mark clears against whatever it lands on. 4.2 and not
  // INK_FLOOR's 3.0 because it is also the bound parts-livery-contrast.spec.js
  // proves for the sponsor inks, and two legibility guards that disagree drift.
  // It is always reachable: the worst field for inkOn() is luminance 0.182,
  // where black and white tie at 4.25.
  const MARK_FLOOR = 4.2;
  // 25 rungs, not 9. The windows this has to hit are narrow: a teal mark on a
  // near-black field leaves only luminance 0.143..0.199 for a neutral that
  // separates from both, and a coarse ramp steps straight over it.
  const GREYS = [];
  for (let i = 0; i < 25; i++) GREYS.push(0.02 + i * (0.96 / 24));

  // PHASE 1, field-blind: what colour does this team's mark WANT to be on this
  // livery? Exported because the garage lightbox has to choose its field BEFORE
  // it can ask for a palette, and it used to key that choice on the logo PNG's
  // average pixel — which is null the moment a team has no PNG.
  function markBase(teamId, liv) {
    if (liv && liv.logo) return liv.logo.slice();
    const own = !liv || liv.id === "default";
    const b = own && MARK_BRAND[teamId];
    if (b) return b.mark.slice();
    return ((liv && (liv.stripe || liv.accent || liv.c2)) || INK_LIGHT).slice();
  }

  // PHASE 2, field-aware: ONE source of truth for every colour a crest paints.
  //   mark  the dominant shape — what a reader calls "the logo"
  //   alt   counters, the second colour, keylines, lettering. Separates from
  //         BOTH `mark` and whatever is behind it
  //   plate the backing shield/disc/panel, or null. Never a shape that has to
  //         read on its own. Always null when `bare`
  //   halo  a colour to stroke UNDER the mark, or null. Non-null only when the
  //         mark cannot reach INK_TARGET — which is how an authored liv.logo is
  //         honoured instead of being silently overruled
  // ALL FOUR ARE OPAQUE. A crest may not paint with alpha: behind the atlas is
  // drawTailGraphic's gradient, so an alpha fill's effective colour is
  // unprovable and no contrast guarantee survives it.
  function markPalette(teamId, liv, field, bare) {
    const own = !liv || liv.id === "default";
    const B = (own && MARK_BRAND[teamId]) || null;
    // `field` may be ONE paint or a list of them, and the engine cover needs a
    // list: drawTailGraphic washes that region with an ALPHA gradient of
    // stripe||c2, so what the mark actually lands on runs from c1 to a c2 tint
    // across the panel. This is the same pair INKED_FOR declares in
    // parts-livery-contrast.spec.js. Score against the WORST of them.
    const flds = (Array.isArray(field) && Array.isArray(field[0])) ? field.filter(Boolean)
      : [field || INK_DARK];
    const cMin = (c, list) => {
      let m = Infinity;
      for (const f of list) m = Math.min(m, contrast(c, f));
      return m;
    };
    // 1. plate first — when there is one, it is what the mark actually lands on.
    //    WHETHER there is one is a property of the MARK, not of the livery: four
    //    crests are drawn on a shield or a disc and seven are not. Deriving a
    //    plate from the livery for all of them put a lime panel behind the Aston
    //    wings, which then had to flip colour to contrast a plate it never asked
    //    for. A null brand plate means "this mark has no backing", permanently.
    const wantsPlate = !!(MARK_BRAND[teamId] && MARK_BRAND[teamId].plate);
    let plate = null;
    if (!bare && wantsPlate) {
      const cands = [B && B.plate, liv && liv.pod, liv && liv.c1, liv && liv.c2];
      // Against the PRIMARY paint only. A plate is opaque and covers whatever
      // wash is on top of the panel, so asking it to separate from the wash
      // colour too rejects the Red Bull gold disc on a gold-accented livery and
      // leaves the bulls floating with nothing behind them.
      for (const c of cands) if (c && contrast(c, flds[0]) >= 1.6) { plate = c.slice(); break; }
    }
    // An opaque plate REPLACES everything behind it, so it becomes the only
    // surface that matters; without one the mark still faces the whole list.
    const under = plate ? [plate] : flds;
    // 2. mark, floored against `under`.
    let mark = markBase(teamId, liv);
    if (cMin(mark, under) < MARK_FLOOR) {
      const alts = [liv && liv.logo, B && B.mark, liv && liv.stripe,
                    liv && liv.accent, liv && liv.c2, liv && liv.c1];
      mark = null;
      for (const c of alts) if (c && cMin(c, under) >= MARK_FLOOR) { mark = c.slice(); break; }
      if (!mark) mark = inkOn(under).slice();
    }
    // 3. alt, scored against `under` AND `mark` — a second colour that vanishes
    //    into either one is not a second colour. The grey ramp is the fallback
    //    that makes this total: no pair of colours is close to all nine.
    // Scored against the primary surface, which is the one alt is asserted on:
    // optimising for a worst case nobody checks just makes alt duller.
    const score = (c) => Math.min(contrast(c, under[0]), contrast(c, mark));
    let alt = null, best = -1;
    const pool = [B && B.alt, liv && liv.accent, liv && liv.stripe, liv && liv.c2,
                  liv && liv.c1, INK_LIGHT, INK_DARK];
    for (const c of pool) { if (!c) continue; const v = score(c); if (v > best) { best = v; alt = c; } }
    if (best < 2.4) for (const g of GREYS) {
      const c = [g, g, g], v = score(c);
      if (v > best) { best = v; alt = c; }
    }
    return {
      mark: mark.slice(), alt: alt.slice(), plate: plate,
      halo: cMin(mark, under) < INK_TARGET ? haloFor(mark).slice() : null,
    };
  }

  // Narrowest limb any crest may draw. Every stroke goes through this, so the
  // 34 px worst case is enforced by construction rather than by review.
  const swMin = (f, k) => f.S(Math.max(STROKE_MIN, k));

  // One charging bull. `dir` mirrors it; the caller places it in the fit box.
  // Legs are 0.13 of the bull's own width, not the 0.10 they were: at the pair
  // layout that made them 0.05 of the fit box, under STROKE_MIN, so the bull
  // lost its legs before it lost anything else.
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
    ctx.quadraticCurveTo(U(0.90), V(0.56), U(0.775), V(0.56)); // jaw to chest
    ctx.lineTo(U(0.775), V(0.92));                             // front leg (lunging)
    ctx.lineTo(U(0.645), V(0.92));
    ctx.lineTo(U(0.62), V(0.60));                              // belly
    ctx.lineTo(U(0.315), V(0.62));
    ctx.lineTo(U(0.315), V(0.92));                             // rear leg
    ctx.lineTo(U(0.185), V(0.92));
    ctx.lineTo(U(0.12), V(0.55));                              // rump underside
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  }

  // ── the eleven team marks + the custom fallback ────────────────────────────
  // Every one takes the SAME five arguments and paints only from P (see
  // markPalette): P.mark for the dominant shape, P.alt for counters, second
  // colour and lettering, P.plate for a backing shield. No baked colours except
  // the two national bands called out below, no alpha, no destination-out.
  // `bare` is the shark-fin badge: no plates, no lettering, and for three marks
  // a genuinely simpler silhouette, because that badge bottoms out at 34 px.

  // Mercedes — three-point star inside a ring.
  function crestMercedes(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    const cx = f.X(0.5), cy = f.Y(0.5), r = f.S(0.48), rin = f.S(0.39);
    ctx.save();
    ctx.fillStyle = css(P.mark);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx, cy, rin, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    // Star tips stop at 0.34, not at 0.99 of the ring's inner radius. That left
    // a 0.004 counter — right for the real mark at print size, and a filled
    // disc the moment the atlas drops to the AI tier.
    const tip = f.S(0.34), baseW = f.S(0.115);
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
    ctx.beginPath(); ctx.arc(cx, cy, f.S(0.055), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Ferrari — prancing horse, on the yellow shield when there is room for one.
  function crestFerrari(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    const plate = !bare && P.plate;
    ctx.save();
    if (plate) {
      ctx.fillStyle = css(P.plate);
      ctx.beginPath();
      ctx.moveTo(f.X(0.16), f.Y(0.06));
      ctx.lineTo(f.X(0.84), f.Y(0.06));
      ctx.lineTo(f.X(0.84), f.Y(0.6));
      ctx.quadraticCurveTo(f.X(0.84), f.Y(0.9), f.X(0.5), f.Y(1.0));
      ctx.quadraticCurveTo(f.X(0.16), f.Y(0.9), f.X(0.16), f.Y(0.6));
      ctx.closePath();
      ctx.fill();
      // Tricolore band. HARDCODED ON PURPOSE and one of only two exceptions in
      // the file: this is a national flag, not a livery colour, and re-tinting
      // it from the paint job would make it a different flag.
      const bandY = f.Y(0.06), bandH = f.S(0.085), x0 = 0.16, w = (0.84 - 0.16) / 3;
      const tri = [[0.00, 0.55, 0.25], [0.95, 0.95, 0.96], [0.80, 0.10, 0.12]];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = css(tri[i]);
        ctx.fillRect(f.X(x0 + i * w), bandY, f.S(w) + 1, bandH);
      }
    }
    // BARE re-frames the horse instead of drawing it small in an empty square.
    // The path was authored for the shield's inset (x 0.215..0.84, y
    // 0.085..0.94); with no shield to sit in it has the whole box, so map that
    // bbox onto it — uniformly, or the horse gets fat.
    const k = plate ? 1 : 1.06;
    const HX = plate ? f.X : (u) => f.X(0.170 + (u - 0.215) * k);
    const HY = plate ? f.Y : (v) => f.Y(0.035 + (v - 0.085) * k);
    const col = css(P.mark);
    ctx.fillStyle = col; ctx.strokeStyle = col;
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(HX(0.60), HY(0.47));
    ctx.quadraticCurveTo(HX(0.84), HY(0.55), HX(0.80), HY(0.90));   // outer edge
    ctx.quadraticCurveTo(HX(0.74), HY(0.74), HX(0.72), HY(0.58));   // inner edge back
    ctx.quadraticCurveTo(HX(0.68), HY(0.52), HX(0.60), HY(0.52));
    ctx.closePath();
    ctx.fill();
    // HIND legs — planted; these are the only ground contact.
    ctx.lineWidth = swMin(f, 0.078 * k);
    ctx.beginPath();
    ctx.moveTo(HX(0.58), HY(0.62));
    ctx.quadraticCurveTo(HX(0.64), HY(0.78), HX(0.58), HY(0.94));
    ctx.moveTo(HX(0.50), HY(0.66));
    ctx.quadraticCurveTo(HX(0.49), HY(0.80), HX(0.44), HY(0.94));
    ctx.stroke();
    // FORELEGS — lifted clear and pawing forward-left. 0.055 put these at 1.9 px
    // on the AI badge, so the horse lost its front half first.
    ctx.lineWidth = swMin(f, 0.070 * k);
    ctx.beginPath();
    ctx.moveTo(HX(0.41), HY(0.46));
    ctx.quadraticCurveTo(HX(0.30), HY(0.46), HX(0.22), HY(0.38));   // upper, tucked
    ctx.moveTo(HX(0.42), HY(0.54));
    ctx.quadraticCurveTo(HX(0.32), HY(0.61), HX(0.26), HY(0.70));   // lower, reaching
    ctx.stroke();

    // BARREL — an ellipse on the body's own axis (chest high-left, rump low-right).
    ctx.beginPath();
    ctx.ellipse(HX(0.505), HY(0.555), f.S(0.180 * k), f.S(0.122 * k), 0.85, 0, Math.PI * 2);
    ctx.fill();
    // NECK — a column tapering from the withers up to the poll.
    ctx.beginPath();
    ctx.moveTo(HX(0.375), HY(0.475));                                 // chest side, base
    ctx.quadraticCurveTo(HX(0.375), HY(0.30), HX(0.395), HY(0.185));  // throat line
    ctx.lineTo(HX(0.495), HY(0.165));                                 // poll
    ctx.quadraticCurveTo(HX(0.525), HY(0.33), HX(0.575), HY(0.475));  // mane / crest
    ctx.closePath();
    ctx.fill();
    // HEAD — a slim wedge angled down-left off the poll, with a small ear.
    ctx.beginPath();
    ctx.moveTo(HX(0.215), HY(0.325));                                 // muzzle
    ctx.quadraticCurveTo(HX(0.33), HY(0.20), HX(0.435), HY(0.145));   // face
    ctx.lineTo(HX(0.455), HY(0.085));                                 // ear (small — a tall one is a cat's)
    ctx.lineTo(HX(0.510), HY(0.155));
    ctx.quadraticCurveTo(HX(0.44), HY(0.245), HX(0.315), HY(0.305));  // cheek
    ctx.quadraticCurveTo(HX(0.265), HY(0.305), HX(0.215), HY(0.325)); // jaw to muzzle
    ctx.closePath();
    ctx.fill();
    if (!bare) {
      ctx.fillStyle = css(P.alt);
      ctx.font = "700 " + Math.ceil(f.S(TEXT_MIN)) + "px Georgia, serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("S F", f.X(0.5), f.Y(0.90));
    }
    ctx.restore();
  }

  // McLaren — the speedmark. Monochrome by design, so P.alt goes unused.
  function crestMclaren(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    ctx.save();
    ctx.fillStyle = css(P.mark);
    ctx.beginPath();
    ctx.moveTo(f.X(0.07), f.Y(0.50));                                    // top of the thick end
    ctx.quadraticCurveTo(f.X(0.46), f.Y(0.35), f.X(0.94), f.Y(0.24));    // top edge to the tip
    ctx.lineTo(f.X(0.885), f.Y(0.325));                                  // blunt tip: a point here
    ctx.quadraticCurveTo(f.X(0.58), f.Y(0.53), f.X(0.31), f.Y(0.74));    // was 0.02 thick, 0.7 px
    ctx.quadraticCurveTo(f.X(0.17), f.Y(0.84), f.X(0.07), f.Y(0.81));    // on the AI badge
    ctx.quadraticCurveTo(f.X(0.01), f.Y(0.66), f.X(0.07), f.Y(0.50));    // rounded cap
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Red Bull — two charging bulls over a gold disc; ONE bull on the fin badge.
  function crestRedbull(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    ctx.save();
    if (!bare && P.plate) {
      ctx.fillStyle = css(P.plate);
      ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.46), f.S(0.31), 0, Math.PI * 2); ctx.fill();
    }
    const red = css(P.mark);
    if (bare) {
      // Two half-size bulls at 34 px is the worst case in the whole set — the
      // muzzles alone are a couple of pixels. One bull at full size is the same
      // mark and twice the detail budget.
      drawBull(ctx, f, 0.02, 0.08, 0.96, 0.84, +1, red);
    } else {
      // 0.02/0.48 overlapped by 0.04 and both muzzles reach 0.96 of their own
      // box, so the two heads fused into one lump in the middle.
      drawBull(ctx, f, 0.01, 0.16, 0.45, 0.62, +1, red);   // left bull, head to right
      drawBull(ctx, f, 0.54, 0.16, 0.45, 0.62, -1, red);   // right bull, head to left
    }
    ctx.restore();
  }

  // Alpine — bold stylised "A" with a single accent band across the legs.
  function crestAlpine(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    const A = () => {
      ctx.beginPath();
      ctx.moveTo(f.X(0.5), f.Y(0.06));
      ctx.lineTo(f.X(0.96), f.Y(0.94));
      ctx.lineTo(f.X(0.74), f.Y(0.94));
      ctx.lineTo(f.X(0.5), f.Y(0.44));
      ctx.lineTo(f.X(0.26), f.Y(0.94));
      ctx.lineTo(f.X(0.04), f.Y(0.94));
      ctx.closePath();
    };
    ctx.save();
    ctx.fillStyle = css(P.mark);
    A();
    ctx.moveTo(f.X(0.5), f.Y(0.30));      // inner apex cut-out (evenodd)
    ctx.lineTo(f.X(0.40), f.Y(0.52));
    ctx.lineTo(f.X(0.60), f.Y(0.52));
    ctx.closePath();
    ctx.fill("evenodd");
    // ONE band, not the three-stripe tricolore this had. Clipped to the A, each
    // 0.11 stripe became two disconnected slivers across 0.22-wide legs, and the
    // white middle one vanished outright on any light mark.
    if (!bare) {
      ctx.save();
      A();
      ctx.clip();
      ctx.fillStyle = css(P.alt);
      ctx.fillRect(f.X(0.02), f.Y(0.62), f.S(0.96), f.S(0.12));
      ctx.restore();
    }
    ctx.restore();
  }

  // Racing Bulls — front-facing bull head on a plate, "RB" beneath it.
  function crestRacingbulls(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    const plate = !bare && P.plate;
    ctx.save();
    if (plate) {
      // Opaque. This was cssA(navy, 0.9): behind the atlas is the tail
      // gradient, so an alpha plate has no knowable colour and nothing drawn on
      // it can be contrast-checked.
      ctx.fillStyle = css(P.plate);
      ctx.beginPath();
      ctx.moveTo(f.X(0.06), f.Y(0.06));
      ctx.lineTo(f.X(0.94), f.Y(0.06));
      ctx.lineTo(f.X(0.94), f.Y(0.60));
      ctx.lineTo(f.X(0.50), f.Y(0.99));
      ctx.lineTo(f.X(0.06), f.Y(0.60));
      ctx.closePath();
      ctx.fill();
    }
    // Grow the head into whatever space there is, and blunt both horn tips —
    // a quadratic ending in a cusp is the first thing a mip level eats.
    const k = bare ? 1.40 : 1.10, y0 = bare ? 0.08 : 0.10;
    const HX = (u) => f.X(0.5 + (u - 0.5) * k);
    const HY = (v) => f.Y(y0 + (v - 0.16) * k);
    ctx.fillStyle = css(P.mark);
    ctx.beginPath();
    ctx.moveTo(HX(0.135), HY(0.185));                                  // left horn tip, upper
    ctx.quadraticCurveTo(HX(0.26), HY(0.20), HX(0.36), HY(0.31));      // horn upper edge, inward
    ctx.quadraticCurveTo(HX(0.50), HY(0.24), HX(0.64), HY(0.31));      // forehead crown BETWEEN
    ctx.quadraticCurveTo(HX(0.74), HY(0.20), HX(0.865), HY(0.185));    // the horns, so they read
    ctx.lineTo(HX(0.815), HY(0.285));                                  // as two. Without this dip
    ctx.quadraticCurveTo(HX(0.72), HY(0.36), HX(0.70), HY(0.46));      // the outline is one
    ctx.lineTo(HX(0.62), HY(0.64));                                    // unbroken sweep and the
    ctx.quadraticCurveTo(HX(0.50), HY(0.76), HX(0.38), HY(0.64));      // whole mark is a chevron
    ctx.lineTo(HX(0.30), HY(0.46));                                    // left cheek
    ctx.quadraticCurveTo(HX(0.28), HY(0.36), HX(0.185), HY(0.285));    // to left tip, lower
    ctx.closePath();                                                   // blunt chord, left
    ctx.fill();
    if (!bare) {
      // Was f.S(0.2) unconditionally — 7 px on the desktop badge, 2.7 on the
      // mobile-AI cover. Lettering is now floored, and gone entirely when bare.
      ctx.fillStyle = css(P.alt);
      ctx.font = "900 " + Math.ceil(f.S(TEXT_MIN)) + "px Arial, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("RB", f.X(0.5), f.Y(0.80));
    }
    ctx.restore();
  }

  // Haas — slashed H inside a ring. The ring goes on the fin badge.
  function crestHaas(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    ctx.save();
    if (!bare) {
      ctx.strokeStyle = css(P.alt);
      ctx.lineWidth = swMin(f, 0.085);
      ctx.beginPath();
      ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.42), 0, Math.PI * 2);
      ctx.stroke();
    }
    // The H used to CROSS the ring: uprights spanned y 0.20..0.80 with outer
    // edges at 0.24 and 0.76, and at y 0.20 the ring's inner half-width is only
    // 0.229 (x 0.271..0.729). These bounds are the inscribed box instead —
    // corner distance 0.33 against an inner radius of 0.3775.
    const xa = bare ? 0.06 : 0.27, xb = bare ? 0.235 : 0.38;
    const y0 = bare ? 0.06 : 0.26, y1 = bare ? 0.94 : 0.74;
    ctx.fillStyle = css(P.mark);
    ctx.fillRect(f.X(xa), f.Y(y0), f.S(xb - xa), f.S(y1 - y0));            // left upright
    ctx.fillRect(f.X(1 - xb), f.Y(y0), f.S(xb - xa), f.S(y1 - y0));        // right upright
    // Slashed crossbar, anchored ON the uprights' inner edges so it joins them
    // rather than floating between them.
    // A bar this steep runs corner to corner and the letter reads as an N.
    // Keep it in the middle third with a shallow rise: 0.18 over the span, not
    // 0.33, and centred on the uprights' midline.
    const h = y0 + (y1 - y0) * 0.33, d = (y1 - y0) * 0.18, t = (y1 - y0) * 0.24;
    ctx.beginPath();
    ctx.moveTo(f.X(xb), f.Y(h));
    ctx.lineTo(f.X(1 - xb), f.Y(h + d));
    ctx.lineTo(f.X(1 - xb), f.Y(h + d + t));
    ctx.lineTo(f.X(xb), f.Y(h + t));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Williams — the zig-zag W, offset shadow behind it.
  function crestWilliams(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    ctx.save();
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    // 2, not 8. At the 0.24-run/0.70-rise vertices a miter limit of 8 let the
    // peaks grow long spikes instead of bevelling.
    ctx.miterLimit = 2;
    const w = (dx, style, lw) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = swMin(f, lw);
      ctx.beginPath();
      ctx.moveTo(f.X(0.06 + dx), f.Y(0.16));
      ctx.lineTo(f.X(0.27 + dx), f.Y(0.86));
      ctx.lineTo(f.X(0.48 + dx), f.Y(0.16));   // centre peak, full height
      ctx.lineTo(f.X(0.69 + dx), f.Y(0.86));
      ctx.lineTo(f.X(0.90 + dx), f.Y(0.16));
      ctx.stroke();
    };
    // The shadow used to sit 0.03 behind a 0.135 stroke — under half its width,
    // so it read as a fringe — and its right end reached x 1.055, outside the
    // fit box and into the atlas gutter.
    if (!bare) w(0.055, css(P.alt), 0.09);
    w(bare ? 0 : -0.005, css(P.mark), bare ? 0.15 : 0.135);
    ctx.restore();
  }

  // Audi — four interlocking rings. Monochrome by design; P.alt is unused.
  function crestAudi(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    ctx.save();
    ctx.strokeStyle = css(P.mark);
    // r 0.135 is the MAXIMUM four rings fit in a unit box at the real ~1.62 r
    // pitch (6.815r + w <= 1). The old r 0.17 at a 0.20 pitch used 26% of the
    // box and buried the weave. This lockup is inherently ~3.6:1, so it is the
    // one mark that cannot fill a square box vertically — a written exception,
    // not an oversight.
    const r = f.S(0.135), cy = f.Y(0.5), xs = [0.16, 0.3767, 0.5933, 0.81];
    ctx.lineWidth = swMin(f, 0.075);
    const ring = (i) => {
      ctx.beginPath();
      ctx.arc(f.X(xs[i]), cy, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    for (let i = 0; i < 4; i++) ring(i);
    // Weave: re-stroke the OVER ring inside each overlap, alternating which one
    // that is. Four independent arcs lie flat on each other and never interlock.
    if (!bare) for (let i = 0; i < 3; i++) {
      const mid = (xs[i] + xs[i + 1]) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(f.X(mid - 0.055), f.Y(0.30), f.S(0.11), f.S(0.40));
      ctx.clip();
      ring(i % 2 === 0 ? i + 1 : i);
      ctx.restore();
    }
    ctx.restore();
  }

  // Aston Martin — outstretched wings, "AM" beneath them.
  function crestAstonmartin(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    ctx.save();
    ctx.fillStyle = css(P.mark);
    // THREE feather rows, not four. At a 0.10 pitch and 0.09 tall they left
    // ~0.01 of gap, so the four layers touched and rendered as one solid
    // triangle — the traced-PNG failure, reproduced in vector.
    const yv0 = bare ? 0.24 : 0.32, pitch = bare ? 0.20 : 0.145;
    const hh = bare ? 0.105 : 0.075, dip = bare ? 0.22 : 0.16;
    for (let s = -1; s <= 1; s += 2) {
      for (let L = 0; L < 3; L++) {
        const yv = yv0 + L * pitch;
        const reach = 0.46 - L * 0.07;               // upper feathers reach further
        const tipY = yv - dip + L * 0.03;            // tips angle upward
        ctx.beginPath();
        ctx.moveTo(f.X(0.5), f.Y(yv));
        ctx.quadraticCurveTo(
          f.X(0.5 + s * reach * 0.6), f.Y(tipY),
          f.X(0.5 + s * reach), f.Y(tipY + 0.025));
        ctx.lineTo(f.X(0.5 + s * reach * 0.9), f.Y(tipY + hh + 0.02));
        ctx.quadraticCurveTo(
          f.X(0.5 + s * reach * 0.4), f.Y(yv + 0.03),
          f.X(0.5), f.Y(yv + hh));
        ctx.closePath();
        ctx.fill();
      }
    }
    if (!bare) {
      // The banner this used to sit on was a third foreground colour that no
      // palette could guarantee. The letters sit under the wings instead.
      ctx.fillStyle = css(P.alt);
      ctx.font = "900 " + Math.ceil(f.S(TEXT_MIN)) + "px Arial, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("AM", f.X(0.5), f.Y(0.84));
    }
    ctx.restore();
  }

  // Cadillac — crest shield with the grid picked out on it.
  function crestCadillac(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    // Flat top with clipped corners, sides falling to a broad point. Grown from
    // y 0.26..0.78 — half the box — to 0.14..0.92.
    const shield = (i) => {
      ctx.beginPath();
      ctx.moveTo(f.X(0.06 + i), f.Y(0.14 + i * 0.5));
      ctx.lineTo(f.X(0.94 - i), f.Y(0.14 + i * 0.5));
      ctx.lineTo(f.X(0.94 - i), f.Y(0.44));
      ctx.quadraticCurveTo(f.X(0.90 - i), f.Y(0.68), f.X(0.50), f.Y(0.92 - i));
      ctx.quadraticCurveTo(f.X(0.10 + i), f.Y(0.68), f.X(0.06 + i), f.Y(0.44));
      ctx.closePath();
    };
    ctx.save();
    ctx.fillStyle = css(!bare && P.plate ? P.plate : P.mark);
    shield(0);
    ctx.fill();
    ctx.save();
    shield(0.035);
    ctx.clip();
    // POSITIVE fills, not destination-out. A knockout punches to transparent,
    // and what shows through is the tail gradient on the car and the lightbox
    // field in the garage — a colour no palette can reason about.
    ctx.fillStyle = css(P.alt);
    if (bare) {
      ctx.fillRect(f.X(0.20), f.Y(0.39), f.S(0.60), f.S(0.075));
    } else {
      // 3 rows at a 0.15 pitch: bar 0.075 and gap 0.075 both clear GAP_MIN,
      // where 4 rows of 0.045 at 0.08 did not.
      const rows = [0.24, 0.39, 0.54];
      const cuts = [[0.10, 0.26], [0.30, 0.44], [0.48, 0.62], [0.66, 0.86]];
      for (let r = 0; r < rows.length; r++)
        for (let c = 0; c < cuts.length; c++) {
          if ((r + c) % 2) continue;                     // alternating, like the real grid
          ctx.fillRect(f.X(cuts[c][0]), f.Y(rows[r]), f.S(cuts[c][1] - cuts[c][0]), f.S(0.075));
        }
    }
    ctx.restore();
    ctx.restore();
  }

  // Generic fallback — monogram of the team short code. The custom team's mark
  // whenever it has no uploaded emblem.
  function crestGeneric(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    const box = bare
      ? { x: f.X(0.02), y: f.Y(0.20), w: f.S(0.96), h: f.S(0.60) }
      : { x: f.X(0.06), y: f.Y(0.22), w: f.S(0.88), h: f.S(0.56) };
    ctx.save();
    if (!bare) {
      ctx.strokeStyle = css(P.alt);
      ctx.lineWidth = swMin(f, 0.055);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    }
    drawWordmark(ctx, teamShort(teamId), box, P.mark, { align: "center", pad: f.S(0.06) });
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

  // ── the custom team's uploaded emblem ──────────────────────────────────────
  // ONE entry, "custom", set by MY TEAM's file picker (js/game.js) through
  // setTeamLogo. The eleven shipped teams no longer come through here: they used
  // to be prefetched from assets/logos/<id>.png, and those files were traced
  // auto-conversions — haas.png was a solid red disc with the H's counters
  // filled in, audi.png four filled blobs, four more were near-white and one
  // near-black. A mark whose shape is gone cannot be repaired by lighting, a
  // field colour or a halo, so the roster draws the vector crests above, which
  // scale to any size and take the livery's own colours.
  const LOGOS = Object.create(null);
  const _markReady = [];
  // Named for what it now means: the CUSTOM mark changed, drop your cached
  // textures. It was onLogosReady, fired once when eleven prefetched PNGs
  // landed together — a name that would be a lie now that only one mark can
  // ever change, and only when a player picks a file.
  function onMarkChange(cb) { if (typeof cb === "function") _markReady.push(cb); }
  function _markChanged() { for (const cb of _markReady) { try { cb(); } catch (_) {} } }

  function setTeamLogo(id, src) {
    if (!src) { delete LOGOS[id]; _markChanged(); return; }
    if (typeof Image === "undefined") return;
    const img = new Image();
    img.onload = () => {
      img._avg = avgColour(img);
      LOGOS[id] = img;
      _markChanged();
    };
    // A corrupt or oversized data URL used to leave the PREVIOUS emblem in
    // place and notify nobody, so the picker looked like it had done nothing.
    // That was survivable while eleven PNGs also came through here; this is now
    // the only image path in the file, so it is the whole failure mode of the
    // custom-emblem feature. Drop the stale mark and tell the caches.
    img.onerror = () => { delete LOGOS[id]; _markChanged(); };
    img.src = src;
  }

  function avgColour(img) {
    try {
      const n = 32, c = document.createElement("canvas");
      c.width = c.height = n;
      const cx = c.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0, n, n);
      const d = cx.getImageData(0, 0, n, n).data;
      let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        if (a < 0.35) continue;
        r += d[i] * a; g += d[i + 1] * a; b += d[i + 2] * a; w += a;
      }
      return w ? [r / w / 255, g / w / 255, b / w / 255] : null;
    } catch (_) { return null; }
  }
  function drawLogoImage(ctx, img, R, tint, halo) {
    const pad = 0.015, bw = R.w * (1 - pad * 2), bh = R.h * (1 - pad * 2);
    const sc = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
    const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
    const x = R.x + (R.w - w) / 2, y = R.y + (R.h - h) / 2;
    if (!tint) {
      if (halo) {
        ctx.save();
        ctx.shadowColor = css(halo);
        ctx.shadowBlur = Math.max(4, w * 0.085);
        for (let i = 0; i < 5; i++) ctx.drawImage(img, x, y, w, h);
        ctx.restore();
      }
      ctx.drawImage(img, x, y, w, h);
      return;
    }
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.round(w)); off.height = Math.max(1, Math.round(h));
    const oc = off.getContext("2d");
    oc.drawImage(img, 0, 0, off.width, off.height);
    oc.globalCompositeOperation = "source-in";
    oc.fillStyle = css(tint);
    oc.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(off, x, y, w, h);
  }

  // drawCrest(ctx, teamId, R, { liv, field, bare, palette })
  //   liv     the resolved livery — needs its `id`, which is how the brand-vs-
  //           livery decision is made (see markPalette)
  //   field   the paint the mark lands on: c1 on the engine cover, fin||c2 on
  //           the badge, the lightbox field in the garage
  //   bare    shark-fin mode
  //   palette pre-resolved, for the sweep tool
  // This replaces an (ink, accent, bare, logo, bg) quintet that reached the
  // crests through three module-level variables and a try/finally, because
  // several marks painted in a baked BRAND colour that no argument could
  // override. Now every colour a crest can paint comes from P, which is what
  // makes the census in tests/unit/crest-marks.test.mjs possible at all.
  function drawCrest(ctx, teamId, R, opts) {
    const o = opts || {};
    const P = o.palette || markPalette(teamId, o.liv, o.field, !!o.bare);
    const fn = CRESTS[teamId] || crestGeneric;
    // The halo is generic on purpose: the same repeated-draw-under-shadow trick
    // drawLogoImage uses, so a mark that cannot reach INK_TARGET gets separated
    // without every crest having to grow its own outline pass.
    if (P.halo) {
      ctx.save();
      ctx.shadowColor = css(P.halo);
      ctx.shadowBlur = Math.max(3, Math.min(R.w, R.h) * 0.05);
      for (let i = 0; i < 3; i++) fn(ctx, R, P, !!o.bare, teamId);
      ctx.restore();
    }
    fn(ctx, R, P, !!o.bare, teamId);
  }

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
    Log.info("car", "livery " + (teamId || "?"));
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;

    colors = colors || {};
    const c1 = colors.c1 || [0.1, 0.1, 0.12];
    const c2 = colors.c2 || [0.9, 0.9, 0.92];
    const stripe = colors.stripe || null;
    const finPaint = colors.fin || c2;
    const finArt = colors.finArt || null;
    const logo = colors.logo || null;

    const pod = colors.pod || null;
    // The sidepod carries a physical sponsor BOARD — a fixed pale panel the car
    // mesh paints under the wordmark — and the ink logic never knew about it.
    // On any dark livery the ink resolves LIGHT for the paint and then lands on
    // that pale board at 1.4:1, which is the faint sidepod text. It is part of
    // the background set now, so the ink (or its halo) has to clear it too.
    const board = (typeof Car3D !== "undefined" && Car3D.PANEL_COL) || [0.82, 0.82, 0.86];
    const podBg = [board];
    const stripBg = [c2];
    const ink = inkOn([c1, c2]);             // nose / endplate number
    const inkCrest = inkOn([c1, finPaint]);
    const inkFin = inkOn([finPaint]);
    const inkPod = inkOn(podBg);              // sidepod wordmarks
    const inkStrip = inkOn(stripBg);
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
    const markHalo = (img, bg, ink) =>
      (img && img._avg && contrast(img._avg, bg) < 2.6 ? ink : null);
    if (LOGOS[teamId]) {
      drawLogoImage(ctx, LOGOS[teamId], REGIONS.crest, logo,
                    markHalo(LOGOS[teamId], c1, inkCrest));
    } else drawCrest(ctx, teamId, REGIONS.crest, { liv: colors, field: [c1, c2], bare: false });
    const finWash = finArt || [stripe, c1, accent, inkFin].filter(Boolean)
      .find((c) => contrast(c, finPaint) >= 1.8) || inkFin;
    drawTailGraphic(ctx, teamId, REGIONS.fin, c1, finPaint, finWash);
    if (LOGOS[teamId]) {
      drawLogoImage(ctx, LOGOS[teamId], REGIONS.finBadge, logo,
                    markHalo(LOGOS[teamId], finPaint, inkFin));
    } else drawCrest(ctx, teamId, REGIONS.finBadge, { liv: colors, field: finPaint, bare: true });

    // Sponsor wordmarks.
    const names = SPONSORS[teamId] || ["APEXFIN", "NEXUS", "VOLTARC", "MERIDIAN", "HYPERGRID", "QUANTA"];
    drawWordmark(ctx, names[0], REGIONS.titleA, inkPod,
      { align: "center", halo: haloIf(inkPod) });
    drawWordmark(ctx, names[1], REGIONS.titleB, inkPod,
      { align: "center", halo: haloIf(inkPod) });
    const inkWing = inkOn([colors.wing || c2]);
    drawWordmark(ctx, names[2], REGIONS.wing, inkWing,
      { align: "center", spacing: 0.1, halo: haloIf(inkWing) });
    // Long thin strip: chain a couple of names.
    drawWordmark(ctx, names[3] + "   " + names[4] + "   " + names[5],
      REGIONS.strip, inkStrip, { align: "center", spacing: 0.04, halo: haloIf(inkStrip) });

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

  // drawLogoImage is exported for the GARAGE back-wall crest (js/game/garage-scene.js):
  // aspect-fit + tint + halo is exactly the same job there, and reimplementing
  // the fit maths in a second place is how the two drift apart.
  // contrast/inkOn are exported for the GARAGE crest wall (js/game/garage-scene.js),
  // which has to make the same "is this mark legible on this field, and if not
  // what ink separates it" decision buildAtlas makes for the car.
  return { SIZE, REGIONS, buildAtlas, drawCrest, markBase, markPalette, MARK_FLOOR,
           drawLogoImage, contrast, inkOn, onMarkChange, setTeamLogo, LOGOS,
           CRESTS, CREST_MARGIN, STROKE_MIN, GAP_MIN, TEXT_MIN };
})();
if (typeof window !== "undefined") window.LiveryTex = LiveryTex;
