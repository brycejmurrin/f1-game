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
    // 0.855 -> 0.727 value, same hue. The re-trace gave Red Bull its real gold
    // SUN DISC as a `plate`, and a mark that sits on a plate is scored against
    // the plate — so the pair became red-on-yellow, which is 3.37:1 against the
    // 4.2 legibility floor every other team mark clears. Solved from the floor
    // rather than nudged: the gold's luminance is 0.6302, so 4.2 needs the mark
    // under 0.1119 and this is 0.1060, landing at 4.36. Checked across all 1514
    // team x livery palettes (0 fail), racingbulls included — it borrows this
    // red as its `alt` and is the only other consumer.
    rbRed:    [0.727, 0.037, 0.073],
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
    racingbulls: { mark: [0.086, 0.204, 0.796], alt: BRAND.rbRed,          plate: null },
    haas:        { mark: [0.97, 0.97, 0.98],   alt: BRAND.haasRed,         plate: null },
    williams:    { mark: [0.97, 0.97, 0.98],   alt: [0.059, 0.235, 0.788], plate: null },
    audi:        { mark: [0.93, 0.93, 0.95],   alt: [0.98, 0.28, 0.05],    plate: null },
    astonmartin: { mark: [0.718, 0.882, 0.106], alt: [0.0, 0.349, 0.31],   plate: null },
    cadillac:    { mark: BRAND.cadGold,        alt: [0.05, 0.05, 0.06],    plate: null },
  };
  // Authored crest geometry the TRACE could not carry, keyed by team. A traced
  // layer's mask is the whole silhouette in one ink, so Red Bull's gold cluster
  // came back as the UNION of the sun and both bulls — a dilated outline, not a
  // disc. Painting that with the SUN DISC colour rimmed the bulls in gold and
  // drew no sun, which is exactly what it looked like. The sun IS a circle, and
  // the trace says so to three decimals: layer 0 spanned y 0.308..0.688 at
  // x 0.5 (centre 0.498, r 0.190) and was 0.106 half-wide at dy 0.158, where a
  // circle of r 0.190 is 0.105. So it is drawn as one.
  //
  // A disc is also the one backing that SURVIVES the fin badge. Plates are
  // dropped there because a shield behind a mark at 34 px is a panel, not a
  // mark — but a circle the bulls straddle reads at any size, and dropping it
  // was what turned SUN DISC into an outline on that surface.
  const CREST_DISC = Object.freeze({
    redbull: { cx: 0.494, cy: 0.498, r: 0.190 },
  });

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
  // WHERE does a mark's second colour live? Every mark has a dominant shape and
  // at most one other coloured element, but that element is a different thing
  // per mark, so one editor row has to resolve to four different slots:
  //   plate    redbull's sun disc, ferrari's yellow shield — a backing
  //   alt      cadillac's second traced layer, haas's ring, the monogram box
  //   part     a same-ink shape: racing bulls' bull, the Mercedes ring, Audi's
  //            second and fourth rings. Unset it IS the mark, so the crest
  //            ships pixel-identical and the slot is pure opt-in
  //   outline  the four single-loop silhouettes (mclaren, williams, alpine,
  //            astonmartin), which have nowhere for a second colour to GO.
  //            Those marks offer no DETAIL row at all now — see markSlots — so
  //            this is reached only by a livery saved before the outline had a
  //            row of its own, and by the surfaces below
  // Derived from the traced role data where there is any, so re-running
  // tools/trace-logo.mjs cannot leave this table lying. The three hand-drawn
  // marks have no trace to derive from and are named here instead.
  const SECOND_DRAWN = { haas: "alt", mercedes: "part", audi: "part" };
  function secondSlot(teamId, bare) {
    const spec = typeof CrestPaths !== "undefined" && CrestPaths[teamId];
    const roles = spec && spec.roles;
    let slot;
    // `part` ranks above `plate` and below `alt`: a mark that has a real
    // same-ink island to paint should spend the DETAIL row on that island
    // rather than on a shadow rim, which is all `outline` ever was.
    // CREST_DISC counts as a plate and the TRACE cannot know it: Red Bull's
    // backing is authored precisely because the traced one was not a sun, and
    // reading roles alone here sent SUN DISC straight back to the outline.
    if (roles) slot = roles.includes("alt") ? "alt"
                    : roles.includes("part") ? "part"
                    : (roles.includes("plate") || CREST_DISC[teamId]) ? "plate" : "outline";
    else slot = SECOND_DRAWN[teamId] || "alt";   // the monogram's box is `alt`
    if (!bare) return slot;
    // The fin badge is a different CONSTRUCTION, not a smaller copy: crestHaas's
    // ring and crestGeneric's box are both gated on !bare, and crestTraced skips
    // a traced backing plate there. A slot nothing paints is a dead colour
    // picker, so those fall through to the outline — measured, not assumed:
    // haas/badge came back MISSING from the paint census until this line
    // existed. An authored DISC is the exception and the reason this branch is
    // no longer blanket: it is drawn at every size, so SUN DISC keeps meaning
    // the sun on the badge instead of quietly becoming a rim.
    if (slot === "plate" && !CREST_DISC[teamId]) return "outline";
    if (slot === "alt" && !(roles && roles.includes("alt"))) return "outline";
    return slot;
  }

  // Which marks paint their `alt` INSIDE the mark rather than beside it.
  // Cadillac's eight detail layers land 99.4% of their area on its crest
  // (measured over a 900x900 sample of the traced paths), so the field is a
  // surface that alt never touches — and scoring it against the field is how a
  // gold crest on the garage's dark lightbox came back with GREY inner detail:
  // brand near-black failed the field test, nothing else in the pool cleared
  // 2.4, and the grey ramp answered. Haas's ring and the generic monogram's box
  // DO stand on the field beside their letters, so they stay scored against it.
  const ALT_INSIDE = { cadillac: true };

  // What actually LANDS on the surface behind a crest. A backlit sign picks its
  // field for contrast, and the honest question is not "what colour is the
  // mark" but "what touches the wall": Ferrari's horse stands on a yellow
  // shield, so asking about the HORSE chose a white lightbox, and a white field
  // then rejected the shield itself (1.07, under the 1.6 plate floor) and
  // painted it red. A DISC answers with the pair — Red Bull's bulls hang off
  // the sun, so both land on the field.
  // Only meaningful on a team's OWN livery, where the backing is brand data;
  // any other paint job derives its plate INSIDE markPalette, scored against
  // the very field this would be choosing.
  function markOnField(teamId, liv) {
    const own = !liv || liv.id === "default";
    const B = (own && MARK_BRAND[teamId]) || null;
    const mark = markBase(teamId, liv);
    if (!B || !B.plate) return [mark];
    return CREST_DISC[teamId] ? [B.plate.slice(), mark] : [B.plate.slice()];
  }

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
    const disc = CREST_DISC[teamId] || null;
    const slot2 = secondSlot(teamId, bare);
    let plate = null;
    if (wantsPlate && (!bare || disc)) {
      // An authored LOGO DETAIL colour IS the plate for the two marks that have
      // one, and it wins OUTRIGHT rather than being layered over a resolved
      // candidate. Gating it on a candidate having resolved first left the
      // colour homeless on the `pastel` livery, where nothing clears 1.6
      // against the paint and `plate` stays null — measured, both plate marks.
      // Taken as given, like the paint rows: the mark is still floored against
      // whatever the player chose (`under`, below), so the lockup cannot go
      // unreadable — only the player's own disc can go quiet.
      if (slot2 === "plate" && liv && liv.logo2) plate = liv.logo2.slice();
      // A brand DISC wins outright, contrast unscored. The 1.6 floor below asks
      // a backing to separate from the paint, which is the right question for a
      // PANEL the mark sits on and the wrong one for a sun: Red Bull's fin
      // field is the team's own yellow, gold scores 1.10 against it, and the
      // floor answered by swapping in a navy disc and bleaching the bulls white
      // to read on it. The disc is identity; legibility is the MARK's floor,
      // and `under` now holds both the disc and the paint so it is really
      // asked. Only reachable on the team's own livery — B is null on any other.
      else if (disc && B && B.plate) plate = B.plate.slice();
      else {
        const cands = [B && B.plate, liv && liv.pod, liv && liv.c1, liv && liv.c2];
        // Against the PRIMARY paint only. A plate is opaque and covers whatever
        // wash is on top of the panel, so asking it to separate from the wash
        // colour too rejects the Red Bull gold disc on a gold-accented livery
        // and leaves the bulls floating with nothing behind them.
        for (const c of cands) if (c && contrast(c, flds[0]) >= 1.6) { plate = c.slice(); break; }
      }
    }
    // An opaque plate REPLACES everything behind it, so it becomes the only
    // surface that matters; without one the mark still faces the whole list.
    // A DISC is the case where both are true at once: Red Bull's bulls straddle
    // the sun, so their heads and tails land on the car paint no matter what
    // colour the disc is. Scoring them against the disc alone was survivable
    // only while the trace also painted a gold silhouette under every limb —
    // that layer is gone (it was never a sun), so the overhang is now real and
    // the field has to stay in the list.
    const under = plate ? (disc ? [plate].concat(flds) : [plate]) : flds;
    // 2. mark, floored against `under` — EXCEPT on a team's own brand pairing.
    //    Red Bull's red bulls on their gold disc score 3.25, so the floor threw
    //    the red away and painted the bulls navy: a legibility rule that had
    //    destroyed the one thing it was protecting. A brand mark on its own
    //    brand plate is a pairing someone designed, and the plate exists to
    //    carry it; the floor is there to defend against ARBITRARY livery paint,
    //    which is still every other case below. The plate itself must still
    //    clear the field, so the lockup can never vanish as a whole.
    let mark = markBase(teamId, liv);
    const brandPair = !!(B && plate && B.plate &&
      plate.join() === B.plate.join() && mark.join() === B.mark.join());
    // An AUTHORED logo colour is a decision the player made in the editor's
    // TEAM LOGO row, and the substitution below used to overrule it in silence:
    // 9015 of 12112 team x livery x pick x surface combinations came back
    // painted in something OTHER than the colour that was picked (measured
    // 2026-08-29, tools/logo-authored-sweep.mjs). Audi is the reported case —
    // its fin is [0.96,0.02,0.22], which only near-white and near-black clear
    // 4.2, so every mid-tone in the picker collapsed to the same fallback and
    // TEAM LOGO looked dead on the tail. Outline the colour instead of
    // replacing it: mark+halo is the same bargain crest-marks.test.mjs scores,
    // so legibility is unchanged and the player's choice survives.
    let authoredHalo = null;
    if (!brandPair && cMin(mark, under) < MARK_FLOOR) {
      if (liv && liv.logo) {
        // PER BACKGROUND, which is the guarantee crest-marks.test.mjs actually
        // scores: wherever the mark itself fails, the halo has to carry — and
        // where the mark already clears, the halo owes nothing. Demanding ONE
        // halo clear every background at once is a stricter rule than the one
        // being proved, and it is unsatisfiable exactly where it matters most:
        // Red Bull's bulls face a gold sun AND the car paint, and no single ink
        // is 4.2 from both a near-white disc colour and a near-black livery.
        // Under the old whole-list test that cost 65 points of authored-colour
        // survival on that mark alone (91.1% -> 26.4%, measured on the
        // team x livery x pick x surface grid).
        // The halo must still separate from the MARK, because an outline the
        // mark sinks into is not an outline.
        const worst = (h) => {
          let m = Infinity;
          for (const f of under) m = Math.min(m, Math.max(contrast(mark, f), contrast(h, f)));
          return m;
        };
        let best = null, bestField = -1;
        for (const h of [INK_LIGHT, INK_DARK]) {
          if (contrast(h, mark) < INK_FLOOR) continue;
          const f = worst(h);
          if (f < MARK_FLOOR) continue;
          if (f > bestField) { bestField = f; best = h; }
        }
        if (best) authoredHalo = best.slice();
      }
      // No halo can carry it: substitute, as before. `liv.logo` is NOT in this
      // list — when it is set it IS `mark`, and it just failed this same test.
      if (!authoredHalo) {
        const alts = [B && B.mark, liv && liv.stripe,
                      liv && liv.accent, liv && liv.c2, liv && liv.c1];
        mark = null;
        for (const c of alts) if (c && cMin(c, under) >= MARK_FLOOR) { mark = c.slice(); break; }
        if (!mark) mark = inkOn(under).slice();
      }
    }
    // 3. alt, scored against `under` AND `mark` — a second colour that vanishes
    //    into either one is not a second colour. The grey ramp is the fallback
    //    that makes this total: no pair of colours is close to all nine.
    // Scored against the primary surface, which is the one alt is asserted on:
    // optimising for a worst case nobody checks just makes alt duller.
    // An alt drawn INSIDE the mark answers to the mark alone — see ALT_INSIDE.
    const score = ALT_INSIDE[teamId]
      ? (c) => contrast(c, mark)
      : (c) => Math.min(contrast(c, under[0]), contrast(c, mark));
    let alt = null, best = -1;
    const pool = [B && B.alt, liv && liv.accent, liv && liv.stripe, liv && liv.c2,
                  liv && liv.c1, INK_LIGHT, INK_DARK];
    for (const c of pool) { if (!c) continue; const v = score(c); if (v > best) { best = v; alt = c; } }
    if (best < 2.4) for (const g of GREYS) {
      const c = [g, g, g], v = score(c);
      if (v > best) { best = v; alt = c; }
    }
    // An authored LOGO DETAIL colour, landed in whichever slot this mark's
    // second colour actually occupies. `alt` is taken as given for the same
    // reason `plate` is — it is a colour the player chose, and the shapes it
    // paints (counters, a ring, a keyline) are secondary by construction.
    let part = null;
    if (liv && liv.logo2) {
      if (slot2 === "alt") alt = liv.logo2;
      // A same-ink island. Null unless authored, and crestTraced falls back to
      // the mark for it, so an unset LOGO DETAIL leaves the crest exactly as it
      // ships — the same opt-in bargain `outline` makes below.
      if (slot2 === "part") part = liv.logo2.slice();
      // slot2 === "plate" was handled where the plate is resolved.
    }
    return {
      mark: mark.slice(), alt: alt.slice(), plate: plate, part,
      brandPair,
      // What the mark ACTUALLY sits on, after the plate has been resolved: the
      // one list every legibility question here is asked against. Exported
      // because the tests used to re-derive it as `plate ? [plate] : fields`,
      // and that stopped being the rule the day a backing could be a DISC the
      // mark hangs off the edges of.
      under: under.map((c) => c.slice()),
      // The halo answers for the PART as well as the mark. An authored colour
      // is taken as given — that is the bargain for every authored slot — so
      // the only thing standing between a player's pick and an invisible bull
      // is this: if either ink is short of target against the field, the crest
      // gets an outline, and it is built from whichever of the two is worse.
      // Measured need: a same-ink island picked dark grey scores 1.00 on a dark
      // field, and nothing else in the pipeline would have caught it.
      halo: authoredHalo || (() => {
        const mNeed = !brandPair && cMin(mark, under) < INK_TARGET;
        const pNeed = !!part && cMin(part, under) < INK_TARGET;
        if (!mNeed && !pNeed) return null;
        // When an authored PART needs the outline, pick the halo against the
        // FIELDS rather than against an ink. One halo serves the whole crest,
        // and haloFor(mark) optimises it for the mark's worst background — on
        // Racing Bulls that came out white, which is nothing behind an orange
        // bull on a white car (measured 1.17). inkOn() already chooses by
        // worst-case over the backgrounds, which is the question actually being
        // asked. The mark keeps its own ink-or-halo test either way.
        if (pNeed) return inkOn(under).slice();
        return haloFor(mark).slice();
      })(),
      // The OUTLINE row (liv.logo3), and it is now offered on EVERY mark rather
      // than only on the ones with nowhere else to put a second colour. A rim
      // is a detail in its own right: a gold-rimmed horse on a red shield is a
      // thing a player asks for, and before this row the only way to get one
      // was to own a mark that had no second shape to spend the colour on.
      // Null keeps every shipped mark pixel-identical, which is why it is opt-in.
      //
      // `logo2` still lands here for the four single-loop silhouettes and on
      // the badges whose construction drops their second shape — ferrari's
      // shield, haas's ring, the monogram's box (see secondSlot):
      // liveries saved before OUTLINE had a key of its own carry the colour in
      // logo2, and dropping that on read would blank a paint job someone saved.
      outline: (liv && liv.logo3) ? liv.logo3.slice()
             : (liv && liv.logo2 && slot2 === "outline") ? liv.logo2.slice() : null,
    };
  }

  // Narrowest limb any crest may draw. Every stroke goes through this, so the
  // 34 px worst case is enforced by construction rather than by review.
  const swMin = (f, k) => f.S(Math.max(STROKE_MIN, k));

  // ── traced marks ───────────────────────────────────────────────────────────
  // Eight of the eleven marks are path data in js/car/crest-paths.js, traced
  // from the bitmaps that used to ship in assets/logos (tools/trace-logo.mjs).
  // Hand-drawing them from memory as chained canvas calls did not work: Red
  // Bull's two charging bulls came out as a pair of pigs and Aston's spread
  // wings as three chevrons. A silhouette is data, and the bitmaps had it even
  // though they were useless as art.
  //
  // Only M, L and Z — the tracer emits polylines, because a contour walked at
  // 384 px and simplified to a few tenths of a percent is already smoother than
  // a curve anyone would fit to it, and a straight-line path needs no curve
  // support here or in the offline rasteriser that measures these.
  function tracePath(ctx, f, d) {
    let i = 0, cmd = "";
    const num = () => {
      while (i < d.length && (d[i] === " " || d[i] === ",")) i++;
      const st = i;
      while (i < d.length && "-+.0123456789eE".indexOf(d[i]) >= 0) i++;
      return parseFloat(d.slice(st, i));
    };
    ctx.beginPath();
    while (i < d.length) {
      const c = d[i];
      if (c === " " || c === ",") { i++; continue; }
      if (c >= "A" && c <= "Z") { cmd = c; i++; }
      if (cmd === "Z") { ctx.closePath(); continue; }
      const x = num(), y = num();
      if (cmd === "M") { ctx.moveTo(f.X(x), f.Y(y)); cmd = "L"; }
      else ctx.lineTo(f.X(x), f.Y(y));
    }
  }

  // One crest function for every traced mark. Layers paint back to front and
  // each takes the palette colour its role names; "plate" layers are dropped on
  // the fin badge, which is why bare mode needs no special case — drop
  // Ferrari's yellow shield and its horse is left standing on its own.
  function crestTraced(ctx, R, P, bare, teamId) {
    const spec = typeof CrestPaths !== "undefined" && CrestPaths[teamId];
    if (!spec) { crestGeneric(ctx, R, P, bare, teamId); return; }
    const f = fit(R, CREST_MARGIN);
    ctx.save();
    // The authored backing, behind every traced layer. Red Bull's sun is the
    // only one: the trace could give a union silhouette or nothing, and a
    // silhouette painted gold is a rim, not a sun (see CREST_DISC).
    const disc = CREST_DISC[teamId];
    if (disc && P.plate) {
      ctx.fillStyle = css(P.plate);
      ctx.beginPath();
      ctx.arc(f.X(disc.cx), f.Y(disc.cy), f.S(disc.r), 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < spec.d.length; i++) {
      const role = spec.roles[i] || "mark";
      // P.plate is already null on the badge for a mark whose backing is a
      // traced panel, so this drops Ferrari's shield there without a `bare`
      // test of its own — and keeps the disc, which markPalette resolves.
      if (role === "plate" && !P.plate) continue;
      // `part` is a SAME-INK island — a shape the trace found to share no pixel
      // with the rest of its layer, like Racing Bulls' bull beside its letters.
      // Unset it IS the mark, so the crest ships pixel-identical; authored, it
      // is the one place a single-ink mark can take a second colour.
      ctx.fillStyle = css(role === "plate" ? P.plate
                        : role === "alt" ? P.alt
                        : role === "part" ? (P.part || P.mark) : P.mark);
      tracePath(ctx, f, spec.d[i]);
      // evenodd, so a counter walked as its own loop punches a HOLE rather than
      // filling solid — the whole reason the bitmaps had to go.
      ctx.fill("evenodd");
    }
    ctx.restore();
  }

  // ── the eleven team marks + the custom fallback ────────────────────────────
  // Every one takes the SAME five arguments and paints only from P (see
  // markPalette): P.mark for the dominant shape, P.alt for counters, second
  // colour and lettering, P.plate for a backing shield. No baked colours except
  // the two national bands called out below, no alpha, no destination-out.
  // `bare` is the shark-fin badge: no plates, no lettering, and for three marks
  // a genuinely simpler silhouette, because that badge bottoms out at 34 px.

  // Mercedes — three-point star inside a ring. Two shapes, and the RING is the
  // one this mark can hand to the DETAIL row: `P.part` is same-ink-unless-
  // authored, so an unset row leaves the star and its ring in one colour, which
  // is the real mark. Drawn at every size, badge included.
  function crestMercedes(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    const cx = f.X(0.5), cy = f.Y(0.5), r = f.S(0.48), rin = f.S(0.39);
    ctx.save();
    ctx.fillStyle = css(P.part || P.mark);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx, cy, rin, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.fillStyle = css(P.mark);
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

  // Audi — four interlocking rings. P.alt is unused: the auto-scored second
  // colour would repaint every shipped car. The DETAIL row lands on `P.part`
  // instead — the SECOND and FOURTH rings — which is same-ink until the player
  // authors it, so an unset row still draws the four-ring mark it always did.
  function crestAudi(ctx, R, P, bare, teamId) {
    const f = fit(R, CREST_MARGIN);
    ctx.save();
    const inkFor = (i) => css(i % 2 ? (P.part || P.mark) : P.mark);
    // r 0.135 is the MAXIMUM four rings fit in a unit box at the real ~1.62 r
    // pitch (6.815r + w <= 1). The old r 0.17 at a 0.20 pitch used 26% of the
    // box and buried the weave. This lockup is inherently ~3.6:1, so it is the
    // one mark that cannot fill a square box vertically — a written exception,
    // not an oversight.
    const r = f.S(0.135), cy = f.Y(0.5), xs = [0.16, 0.3767, 0.5933, 0.81];
    ctx.lineWidth = swMin(f, 0.075);
    const ring = (i) => {
      ctx.strokeStyle = inkFor(i);
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

  // The eleven marks. Eight are traced path data (js/car/crest-paths.js); the
  // other three are drawn, because for those three a construction beats a trace:
  // Mercedes is a ring and a three-point star, Audi four interlocking rings, and
  // Haas an H inside a ring. Those are exact as maths, and their source bitmaps
  // were the WORST of the set — haas.png traces to a plain red disc and audi.png
  // to four filled blobs, because both had their counters filled in.
  const CRESTS = {
    mercedes: crestMercedes,
    ferrari: crestTraced,
    mclaren: crestTraced,
    redbull: crestTraced,
    alpine: crestTraced,
    racingbulls: crestTraced,
    haas: crestHaas,
    williams: crestTraced,
    audi: crestAudi,
    astonmartin: crestTraced,
    cadillac: crestTraced,
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

  // What each logo picker actually PAINTS on this team's mark, so the editor can
  // say so. "LOGO DETAIL" is true but useless: on Racing Bulls it paints the
  // bull, on Red Bull the sun disc between the bulls, on Ferrari the shield.
  // A label that names the shape is the difference between a colour picker and
  // a guess — and a label that names a shape the mark does not HAVE is worse
  // than either, which is what "SUN DISC" was while the trace's union
  // silhouette stood in for the sun.
  //
  // [dominant, second] — a null second means this mark is one closed loop and
  // genuinely has no other element (mclaren's speedmark, williams' W, alpine's
  // A, aston's wings are each a single traced contour, measured). Those marks
  // offer the OUTLINE row and nothing in between, rather than a DETAIL picker
  // that can only ever produce a rim.
  const MARK_PARTS = Object.freeze({
    redbull:     ["BULLS", "SUN DISC"],
    ferrari:     ["HORSE", "SHIELD"],
    racingbulls: ["RB LETTERS", "BULL"],
    cadillac:    ["CREST", "INNER DETAIL"],
    haas:        ["MONOGRAM", "RING"],
    mercedes:    ["STAR", "RING"],
    audi:        ["RINGS", "2ND & 4TH RING"],
    mclaren:     ["SPEEDMARK", null],
    williams:    ["W MARK", null],
    alpine:      ["A MARK", null],
    astonmartin: ["WINGS", null],
    // The custom team's mark is the generic monogram, whose second colour is
    // the box stroke around the letters. An UPLOADED emblem is arbitrary art
    // with no second element at all — its DETAIL row paints nothing and its
    // OUTLINE row rims it, which is the same bargain a single-loop crest makes.
    custom:      ["MONOGRAM", "MONOGRAM BOX"],
  });
  // The editor's mark rows, in order, for THIS team. Two or three of them: the
  // dominant shape, the second shape when the mark has one, and the outline,
  // which every mark can take. Callers must not assume a length — that
  // assumption is what kept the outline sharing a row with the sun disc.
  function markSlots(teamId) {
    // An UPLOADED emblem replaces the mark entirely — buildAtlas takes the
    // drawLogoImage branch and the monogram is never drawn — and that function
    // has no parameter for a second shape: (ctx, img, R, tint, halo, outline).
    // So the second row is a picker that cannot paint, which is the whole
    // failure this table exists to prevent. It also renames the first: with an
    // emblem on the car, `logo` TINTS arbitrary art rather than colouring a
    // monogram. Keyed on LOGOS, so it follows an upload or a CLEAR — MY TEAM
    // re-asks on onMarkChange (the emblem decodes asynchronously, so the file
    // picker's own handler is too early), and the GARAGE editor re-asks
    // whenever buildSetup runs, which it does on entering that screen.
    if (LOGOS[teamId]) return [{ key: "logo", label: "EMBLEM TINT" },
                               { key: "logo3", label: "OUTLINE" }];
    const named = MARK_PARTS[teamId] || [];
    const rows = [{ key: "logo", label: named[0] || "TEAM LOGO" }];
    if (named[1]) rows.push({ key: "logo2", label: named[1] });
    rows.push({ key: "logo3", label: "OUTLINE" });
    return rows;
  }
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
  // An UPLOADED emblem is the one mark that never goes through markPalette —
  // it is arbitrary art, so there is no second element to recolour. It takes
  // the OUTLINE row (liv.logo3) as a rim, the same meaning a single-loop crest
  // gives it, and falls back to liv.logo2 for liveries saved before that row
  // had a key of its own.
  //
  // Resolving the painted source FIRST also closes a hole this function had:
  // the tinted path used to `return` from its own branch before any halo pass
  // existed, so a tinted emblem got no legibility halo at all — the halo
  // argument was silently ignored for exactly the uploads most likely to need
  // it. One source, one set of passes, both cases.
  function drawLogoImage(ctx, img, R, tint, halo, outline) {
    const pad = 0.015, bw = R.w * (1 - pad * 2), bh = R.h * (1 - pad * 2);
    const sc = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
    const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
    const x = R.x + (R.w - w) / 2, y = R.y + (R.h - h) / 2;
    let src = img;
    if (tint) {
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.round(w)); off.height = Math.max(1, Math.round(h));
      const oc = off.getContext("2d");
      oc.drawImage(img, 0, 0, off.width, off.height);
      oc.globalCompositeOperation = "source-in";
      oc.fillStyle = css(tint);
      oc.fillRect(0, 0, off.width, off.height);
      src = off;
    }
    // Halo outside, outline inside — the same order and the same reason as
    // drawCrest, so an emblem needing both reads the way a crest does.
    const pass = (col, blur, n) => {
      ctx.save();
      ctx.shadowColor = css(col);
      ctx.shadowBlur = blur;
      for (let i = 0; i < n; i++) ctx.drawImage(src, x, y, w, h);
      ctx.restore();
    };
    // Same cap, same reason — more sharply, because this one is 8.5% over FIVE
    // passes: an uploaded emblem 400 px wide was wearing a 34 px halo.
    if (halo) pass(halo, Math.max(4, Math.min(w * 0.085, 14)), 5);
    if (outline) pass(outline, Math.max(2, Math.min(w * 0.030, 8)), 3);
    ctx.drawImage(src, x, y, w, h);
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
      // CAPPED, and the cap is what makes this an outline instead of weather.
      // A flat 5% of the box is 8 px on the 160 px fin badge — a rim — but
      // 21.5 px on the 430 px engine cover, and three accumulated shadow
      // passes at that radius spread into a soft cloud: Williams' dark W sat
      // in a white haze covering a third of the cover (rendered, not guessed —
      // scratch/renders/cars/williams/top.png). McLaren never showed it only
      // because its halo resolves DARK against dark paint. 10 px leaves every
      // surface at or below the badge's 8 px untouched and halves the cover,
      // and the halo's job is unaffected: legibility here is a COLOUR
      // guarantee (mark-or-halo per background, crest-marks.test.mjs), not a
      // radius one.
      ctx.shadowBlur = Math.max(3, Math.min(Math.min(R.w, R.h) * 0.05, 10));
      for (let i = 0; i < 3; i++) fn(ctx, R, P, !!o.bare, teamId);
      ctx.restore();
    }
    // The outline sits INSIDE the halo: tighter blur, drawn second, so a mark
    // that needs both shows a legibility halo with the player's rim on top of
    // it rather than one swallowing the other. Same repeated-draw trick — a
    // crest paints fills, not strokes, and does not hand its path back, so
    // there is nothing here to stroke directly.
    if (P.outline) {
      ctx.save();
      ctx.shadowColor = css(P.outline);
      ctx.shadowBlur = Math.max(2, Math.min(R.w, R.h) * 0.022);
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
    const emblemRim = colors.logo3 || colors.logo2 || null;
    if (LOGOS[teamId]) {
      drawLogoImage(ctx, LOGOS[teamId], REGIONS.crest, logo,
                    markHalo(LOGOS[teamId], c1, inkCrest), emblemRim);
    } else drawCrest(ctx, teamId, REGIONS.crest, { liv: colors, field: [c1, c2], bare: false });
    const finWash = finArt || [stripe, c1, accent, inkFin].filter(Boolean)
      .find((c) => contrast(c, finPaint) >= 1.8) || inkFin;
    drawTailGraphic(ctx, teamId, REGIONS.fin, c1, finPaint, finWash);
    if (LOGOS[teamId]) {
      drawLogoImage(ctx, LOGOS[teamId], REGIONS.finBadge, logo,
                    markHalo(LOGOS[teamId], finPaint, inkFin), emblemRim);
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

  // drawLogoImage is exported for the GARAGE back-wall crest (js/garage/scene.js):
  // aspect-fit + tint + halo is exactly the same job there, and reimplementing
  // the fit maths in a second place is how the two drift apart.
  // contrast/inkOn are exported for the GARAGE crest wall (js/garage/scene.js),
  // which has to make the same "is this mark legible on this field, and if not
  // what ink separates it" decision buildAtlas makes for the car.
  return { SIZE, REGIONS, buildAtlas, drawCrest, markBase, markPalette,
           MARK_FLOOR, INK_FLOOR,
           drawLogoImage, contrast, inkOn, onMarkChange, markSlots, setTeamLogo, LOGOS,
           markOnField, ALT_INSIDE,
           CRESTS, CREST_DISC, CREST_MARGIN, STROKE_MIN, GAP_MIN, TEXT_MIN };
})();
if (typeof window !== "undefined") window.LiveryTex = LiveryTex;
