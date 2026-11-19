"use strict";
const LiveryTex = (function () {
  const SIZE = 2048;
  const SIZE_H = 2560;
  const IS_MOBILE = typeof GLX !== "undefined" && !!GLX.mobileTier;
  const IS_PHONE = typeof GLX !== "undefined" && !!GLX.isMobile;
  function atlasMobile(isPlayer, tier, phone) { return isPlayer ? !!tier : !!(tier || phone); }

  function atlasDiv(isPlayer, mobile, hiRes) {
    if (mobile) return isPlayer ? 4 : 8;
    if (!isPlayer) return 4;
    return hiRes ? 1 : 2;
  }
  function playerHiResDeferred(mobile) {
    return atlasDiv(true, !!mobile, false) > atlasDiv(true, !!mobile, true);
  }

  const REGIONS = {
    crest:  { x: 80,  y: 80,  w: 860, h: 860 },
    titleA: { x: 1000, y: 80,  w: 968, h: 340 },
    titleB: { x: 1000, y: 480, w: 968, h: 260 },
    wing:   { x: 80,  y: 1040, w: 1240, h: 300 },
    num:    { x: 1400, y: 840, w: 568, h: 568 },
    strip:  { x: 80,  y: 1440, w: 1888, h: 260 },
    fin:    { x: 80,  y: 1712, w: 860, h: 320 },
    finBadge: { x: 1000, y: 1712, w: 320, h: 320 },
    spineSide: { x: 1360, y: 1712, w: 608, h: 320 },
    spineSideL: { x: 80, y: 2080, w: 608, h: 320 },
    fwEnd: { x: 760, y: 2080, w: 680, h: 280 },
    tail: { x: 1000, y: 840, w: 360, h: 160 },
    podTop: { x: 1480, y: 2080, w: 488, h: 160 },
    cockpitSide: { x: 1480, y: 2260, w: 488, h: 130 },
    haloTop: { x: 80, y: 2420, w: 1240, h: 120 },
    noseTip: { x: 1360, y: 2420, w: 608, h: 120 },
  };

  const NUMBERS = {
    mercedes: 63, ferrari: 16, mclaren: 1, redbull: 3, alpine: 10,
    racingbulls: 30, haas: 31, williams: 55, audi: 27, astonmartin: 14,
    cadillac: 11,
  };
  function resolveRaceNumber(numberOverride, teamId) {
    if (numberOverride != null) return numberOverride;
    return NUMBERS[teamId] != null ? NUMBERS[teamId] : 0;
  }

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
    astonmartin: ["VERDANCE", "GAYDONA", "AVIONNE", "REGALIS", "WINGCRAFT", "SAVILE"],
    cadillac:    ["DETROX", "CRESTLIN", "LIBERTA", "AMERIGO", "MOTORCTY", "GRANDEUR"],
  };
  const SPONSOR_PACKS = {
    retro:  ["TURBOLIN", "CORSAVIA", "MOTORELLA", "PISTONIA", "CHEQUERS", "LAPKING"],
    tech:   ["QUBITWARE", "NEURALIX", "CLOUDFORGE", "SYNAPSE", "VECTORA", "LATTICE"],
    energy: ["VOLTSHOT", "FUSIONFUEL", "RAPTORADE", "KINETIQ", "SURGE", "IONBLAST"],
    clean:  [],
    garage: ["TORQSMITH", "BOLTWORKS", "HEXDRIVE", "SPANNERCO", "RATCHETA", "GRIDFORGE"],
    aero:   ["SKYWARDO", "AIRFOILX", "STRATOLUX", "VORTEXA", "JETSTRIDE", "ALTIMERA"],
    coast:  ["SOLMARE", "DUNEWAVE", "PALMERA", "RIVIERO", "SALTLINE", "AZURIO"],
  };
  const SPONSOR_PACK_IDS = ["default", "retro", "tech", "energy", "clean", "garage", "aero", "coast"];
  const NUM_FONTS = {
    default: { font: (px) => "italic 900 " + px + "px 'Arial Narrow', Arial, sans-serif", style: "layered" },
    block:   { font: (px) => "900 " + px + "px 'Arial Black', Impact, Arial, sans-serif", style: "layered" },
    stencil: { font: (px) => "900 " + px + "px 'Arial Black', Impact, Arial, sans-serif", style: "stencil" },
    narrow:  { font: (px) => "800 " + px + "px 'Arial Narrow', 'Liberation Sans Narrow', Arial, sans-serif", style: "layered" },
    rounded: { font: (px) => "900 " + px + "px Verdana, 'DejaVu Sans', Arial, sans-serif", style: "rounded" },
    outline: { font: (px) => "italic 900 " + px + "px 'Arial Narrow', Arial, sans-serif", style: "outline" },
    slab:    { font: (px) => "900 " + px + "px Rockwell, 'Roboto Slab', 'DejaVu Serif', Georgia, serif", style: "layered" },
    mono:    { font: (px) => "700 " + px + "px 'Courier New', 'DejaVu Sans Mono', 'Liberation Mono', monospace", style: "layered" },
    rally:   { font: (px) => "italic 900 " + px + "px 'Arial Black', Impact, Arial, sans-serif", style: "stencil" },
  };
  const NUM_FONT_IDS = Object.keys(NUM_FONTS);

  function to255(c) { return [
    Math.round(Math.max(0, Math.min(1, c[0])) * 255),
    Math.round(Math.max(0, Math.min(1, c[1])) * 255),
    Math.round(Math.max(0, Math.min(1, c[2])) * 255),
  ]; }
  function css(c) { const r = to255(c); return "rgb(" + r[0] + "," + r[1] + "," + r[2] + ")"; }
  function cssA(c, a) { const r = to255(c); return "rgba(" + r[0] + "," + r[1] + "," + r[2] + "," + a + ")"; }
  function lin(u) { return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function contrast(a, b) {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  const INK_DARK = [0.06, 0.06, 0.08], INK_LIGHT = [0.97, 0.97, 0.98];
  const INK_TARGET = 6.5;
  function inkOn(bgs) {
    const list = bgs.filter(Boolean);
    if (!list.length) { const any = INK_LIGHT.slice(); any.worst = Infinity; return any; }
    const worst = (ink) => Math.min.apply(null, list.map((b) => contrast(ink, b)));
    const d = worst(INK_DARK), l = worst(INK_LIGHT);
    const ink = (d >= l ? INK_DARK : INK_LIGHT).slice();
    ink.worst = Math.max(d, l);
    return ink;
  }
  function haloFor(ink) { return lum(ink) < 0.5 ? INK_LIGHT : INK_DARK; }

  function fillRegion(ctx, R, colour) {
    if (!R || !colour) return;
    ctx.fillStyle = css(colour);
    ctx.fillRect(R.x, R.y, R.w, R.h);
  }

  function drawWordmark(ctx, text, R, ink, opts = {}) {
    const pad = opts.pad != null ? opts.pad : 14;
    const spacing = opts.spacing != null ? opts.spacing : 0.06;
    const align = opts.align || "left";
    const maxW = R.w - pad * 2;
    const maxH = R.h - pad * 2;
    text = String(text).toUpperCase();

    const REF = 100;
    ctx.font = "900 " + REF + "px Arial, sans-serif";
    let refW = 0;
    for (let i = 0; i < text.length; i++) refW += ctx.measureText(text[i]).width;
    const perPx = refW / REF + spacing * Math.max(0, text.length - 1);
    const fontCap = Math.min(maxH, Math.round(SIZE * 0.16));
    let size = Math.max(8, Math.min(fontCap, Math.floor(maxW / (perPx || 1))));
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
    while (size < fontCap && fitsAt(size + 1)) size++;
    ctx.font = "900 " + size + "px Arial, sans-serif";

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
    clipToRegion(ctx, R);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    try { ctx.textRendering = "geometricPrecision"; } catch (_) {  }
    if (opts.halo) {
      ctx.strokeStyle = css(opts.halo);
      ctx.lineWidth = Math.max(1.25, size * 0.07);
      ctx.lineJoin = "miter";
      ctx.miterLimit = 2;
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
    if (!opts.halo) {
      ctx.strokeStyle = css(ink);
      ctx.lineWidth = Math.max(0.75, size * 0.035);
      ctx.lineJoin = "miter";
      ctx.miterLimit = 2;
      let sx = R.x + pad;
      if (align === "center") sx = R.x + (R.w - total) / 2;
      else if (align === "right") sx = R.x + R.w - pad - total;
      for (let i = 0; i < text.length; i++) {
        ctx.strokeText(text[i], sx, y);
        sx += widths[i] + size * spacing;
      }
    }
    ctx.restore();
  }

  function numCrestBox(R) {
    R = R || REGIONS.num;
    const s = Math.round(Math.min(R.w, R.h) * 0.32);
    return { x: R.x + Math.round((R.w - s) / 2), y: R.y + Math.round(R.h * 0.08), w: s, h: s };
  }
  const NUM_CREST_HEAD = 0.42;

  function drawNumber(ctx, n, R, ink, accent, bg, fontId, reserveTop, halo) {
    const recipe = NUM_FONTS[fontId] || NUM_FONTS.default;
    if (bg) {
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
    const head = reserveTop ? Math.round(R.h * reserveTop) : 0;
    const box = head ? { x: R.x, y: R.y + head, w: R.w, h: R.h - head } : R;
    const pad = 10;
    const maxH = box.h - pad * 2;
    const maxW = box.w - pad * 2;
    const text = String(n);
    const font = recipe.font;
    ctx.font = font(100);
    const refW = ctx.measureText(text).width / 100;
    let size = Math.max(8, Math.min(maxH, Math.floor(maxW / (refW || 1))));
    while (size > 8 && (ctx.font = font(size), ctx.measureText(text).width > maxW)) size--;
    while (size < maxH && (ctx.font = font(size + 1), ctx.measureText(text).width <= maxW)) size++;
    ctx.save();
    clipToRegion(ctx, box);
    ctx.font = font(size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillText(text, cx + size * 0.03, cy + size * 0.035);
    ctx.lineJoin = "round";
    if (halo) {
      ctx.lineWidth = Math.max(8, size * 0.14);
      ctx.strokeStyle = css(halo);
      ctx.strokeText(text, cx, cy);
    }
    if (recipe.style === "outline") {
      const body = Math.max(8, size * 0.11), rim = Math.max(3, size * 0.03);
      ctx.lineWidth = body + rim * 2;
      ctx.strokeStyle = css(ink);
      ctx.strokeText(text, cx, cy);
      ctx.lineWidth = body;
      ctx.strokeStyle = css(accent);
      ctx.strokeText(text, cx, cy);
      ctx.restore();
      return;
    }
    if (recipe.style === "rounded") {
      ctx.lineWidth = Math.max(8, size * 0.12);
      ctx.strokeStyle = cssA(accent, 0.85);
      ctx.strokeText(text, cx, cy);
    } else {
      ctx.lineWidth = Math.max(6, size * 0.075);
      ctx.strokeStyle = css(accent);
      ctx.strokeText(text, cx, cy);
      ctx.lineWidth = Math.max(2, size * 0.02);
      ctx.strokeStyle = cssA(ink, 0.55);
      ctx.strokeText(text, cx, cy);
    }
    ctx.fillStyle = css(ink);
    ctx.fillText(text, cx, cy);
    if (recipe.style === "stencil") {
      const cut = Math.max(3, size * 0.045);
      let cutC = inkOn([ink]);
      if (bg && contrast(bg, ink) >= 2.0) cutC = bg;
      else if (contrast(accent, ink) >= 2.0) cutC = accent;
      ctx.fillStyle = css(cutC);
      ctx.fillRect(box.x, cy - size * 0.18 - cut / 2, box.w, cut);
      ctx.fillRect(box.x, cy + size * 0.2 - cut / 2, box.w, cut);
    }
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

  function clipToRegion(ctx, R) {
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();
  }

  const CREST_MARGIN = 0.08;
  const FLANK_CREST_FILL = 1 - 0.015 * 2;
  const STROKE_MIN = 0.055;
  const TEXT_MIN = 0.22;

  const BRAND = {
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
  const CREST_DISC = Object.freeze({
    redbull: { cx: 0.494, cy: 0.498, r: 0.190 },
  });
  function crestSpecFor(teamId) {
    return typeof CrestPaths !== "undefined" && CrestPaths[crestKey(teamId)];
  }
  function legendOf(teamId) {
    const id = String(teamId || "");
    if (typeof Legends === "undefined" || !Legends.byId) return null;
    if (id === "legends") {
      const t = (typeof Teams !== "undefined" && Teams.LIST || []).find((x) => x.id === "legends");
      return t && t.legend ? Legends.byId(t.legend) : null;
    }
    return id.indexOf("legend_") === 0 ? Legends.byId(id.slice(7)) : null;
  }
  function crestKey(teamId) {
    const l = legendOf(teamId);
    return l && l.marque ? l.marque : teamId;
  }
  function crestKeepsPlate(teamId) {
    if (CREST_DISC[crestKey(teamId)]) return true;
    const spec = crestSpecFor(teamId);
    return !!(spec && spec.roles && spec.roles.includes("plate"));
  }

  const MARK_FLOOR = 4.2;
  const BAND_ON_COVER = 2.0;
  const PLATE_ON_PAINT = 1.6;
  const GREYS = [];
  for (let i = 0; i < 25; i++) GREYS.push(0.02 + i * (0.96 / 24));

  const SECOND_DRAWN = { haas: "alt", mercedes: "part", audi: "part" };
  function secondSlot(teamId, bare) {
    const spec = crestSpecFor(teamId);
    const roles = spec && spec.roles;
    let slot;
    if (!roles) slot = SECOND_DRAWN[crestKey(teamId)] || "alt";
    else if (roles.includes("alt")) slot = "alt";
    else if (roles.includes("part")) slot = "part";
    else slot = (roles.includes("plate") || CREST_DISC[crestKey(teamId)]) ? "plate" : "outline";
    if (!bare) return slot;
    if (slot === "plate" && !crestKeepsPlate(teamId)) return "outline";
    if (slot === "alt" && !(roles && roles.includes("alt")) &&
        teamId !== "haas" && teamId !== "custom") return "outline";
    return slot;
  }

  const ALT_INSIDE = {};

  function markOnField(teamId, liv) {
    const own = !liv || liv.id === "default";
    const B = (own && MARK_BRAND[crestKey(teamId)]) || null;
    const mark = markBase(teamId, liv);
    if (!B || !B.plate) return [mark];
    return CREST_DISC[crestKey(teamId)] ? [B.plate.slice(), mark] : [B.plate.slice()];
  }

  function markBase(teamId, liv) {
    if (liv && liv.logo) return liv.logo.slice();
    const own = !liv || liv.id === "default";
    const b = own && MARK_BRAND[crestKey(teamId)];
    if (b) return b.mark.slice();
    return ((liv && (liv.c2 || liv.c1)) || INK_LIGHT).slice();
  }

  function markPalette(teamId, liv, field, bare, opts) {
    const own = !liv || liv.id === "default";
    const B = (own && MARK_BRAND[crestKey(teamId)]) || null;
    const isRgb = (c) => Array.isArray(c) && c.length >= 3 && typeof c[0] === "number";
    const flds = (() => {
      if (isRgb(field)) return [field];
      if (Array.isArray(field)) {
        const paints = field.filter(isRgb);
        return paints.length ? paints : [INK_DARK];
      }
      return [INK_DARK];
    })();
    const cMin = (c, list) => {
      let m = Infinity;
      for (const f of list) m = Math.min(m, contrast(c, f));
      return m;
    };
    const wantsPlate = !!(MARK_BRAND[crestKey(teamId)] && MARK_BRAND[crestKey(teamId)].plate);
    const disc = CREST_DISC[crestKey(teamId)] || null;
    const keepPlate = crestKeepsPlate(teamId);
    const slot2 = secondSlot(teamId, bare);
    let plate = null;
    if (wantsPlate && (!bare || keepPlate)) {
      if (slot2 === "plate" && liv && liv.logo2) plate = liv.logo2.slice();
      else if (!(opts && opts.noPlate)) {
        if (keepPlate && B && B.plate) plate = B.plate.slice();
        else {
          const cands = [B && B.plate, liv && liv.c1, liv && liv.c2];
          for (const c of cands) if (c && contrast(c, flds[0]) >= PLATE_ON_PAINT) { plate = c.slice(); break; }
        }
      }
    }
    let under = flds;
    if (plate) under = disc ? [plate].concat(flds) : [plate];
    let mark = markBase(teamId, liv);
    const brandPair = !!(B && plate && B.plate &&
      plate.join() === B.plate.join() && mark.join() === B.mark.join());
    const authoredLogo = !!(liv && liv.logo);
    const brandMark = !!(B && mark.join() === B.mark.join());
    const freeMark = authoredLogo || brandMark;
    if (!brandPair && !freeMark && cMin(mark, under) < MARK_FLOOR) {
      const alts = [B && B.mark, liv && liv.c2, liv && liv.c1];
      mark = null;
      for (const c of alts) if (c && cMin(c, under) >= MARK_FLOOR) { mark = c.slice(); break; }
      if (!mark) mark = inkOn(under).slice();
    }
    const score = (c) => Math.min(contrast(c, under[0]), contrast(c, mark));
    let alt = null, best = -1;
    const pool = [B && B.alt, liv && liv.c2, liv && liv.c1, INK_LIGHT, INK_DARK];
    for (const c of pool) { if (!c) continue; const v = score(c); if (v > best) { best = v; alt = c; } }
    if (best < 2.4) for (const g of GREYS) {
      const c = [g, g, g], v = score(c);
      if (v > best) { best = v; alt = c; }
    }
    if (!alt) alt = haloFor(mark || INK_DARK);
    let part = null;
    if (liv && liv.logo2) {
      if (slot2 === "alt") alt = liv.logo2;
      if (slot2 === "part") part = liv.logo2.slice();
    }
    let outline = null;
    if (liv && liv.logo3) outline = liv.logo3.slice();
    else if (liv && liv.logo2 && slot2 === "outline") outline = liv.logo2.slice();
    return {
      mark: mark.slice(), alt: alt.slice(), plate: plate, part,
      brandPair, brandMark, freeMark,
      under: under.map((c) => c.slice()),
      halo: freeMark || part ? null : (() => {
        if (brandPair || cMin(mark, under) >= INK_TARGET) return null;
        return haloFor(mark).slice();
      })(),
      outline,
    };
  }

  const { CRESTS, crestGeneric, tracePath, EMBLEMS, EMBLEM_IDS, CREST_TONE_IDS, CREST_FRAME_IDS, dressEmblem } = LiveryCrests.create({ css, fit, drawWordmark, teamShort, crestSpecFor, crestKey, legendOf,
    CREST_DISC, CREST_MARGIN, STROKE_MIN, TEXT_MIN });

  const LOGOS = Object.create(null);
  const markReady = [];
  function onMarkChange(cb) { if (typeof cb === "function") markReady.push(cb); }

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
    custom:      ["MONOGRAM", "MONOGRAM BOX"],
  });
  function markSlots(teamId) {
    if (LOGOS[teamId]) return [{ key: "logo", label: "EMBLEM TINT" },
                               { key: "logo3", label: "OUTLINE" }];
    const named = MARK_PARTS[crestKey(teamId)] || [];
    const rows = [{ key: "logo", label: named[0] || "TEAM LOGO" }];
    if (named[1]) rows.push({ key: "logo2", label: named[1] });
    rows.push({ key: "logo3", label: "OUTLINE" });
    return rows;
  }
  function markChanged() { for (const cb of markReady) { try { cb(); } catch {  } } }

  const logoGen = Object.create(null);
  const LOGO_MAX_PX = 1024 * 1024;
  function setTeamLogo(id, src) {
    const gen = logoGen[id] = (logoGen[id] || 0) + 1;
    if (!src) { delete LOGOS[id]; markChanged(); return; }
    if (typeof Image === "undefined") return;
    const img = new Image();
    img.onload = () => {
      if (logoGen[id] !== gen) return;
      if (img.naturalWidth * img.naturalHeight > LOGO_MAX_PX) { img.onerror(); return; }
      img._avg = avgColour(img);
      LOGOS[id] = img;
      markChanged();
    };
    img.onerror = () => { if (logoGen[id] !== gen) return; delete LOGOS[id]; markChanged(); };
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
    } catch { return null; }
  }
  let _tintCache = new WeakMap();
  const TINT_PER_IMAGE_MAX = 24;
  markReady.push(() => { _tintCache = new WeakMap(); });
  function tintedLogo(img, ow, oh, fill) {
    let byImg = _tintCache.get(img);
    if (!byImg) { byImg = new Map(); _tintCache.set(img, byImg); }
    const key = ow + "x" + oh + "|" + fill;
    let off = byImg.get(key);
    if (off) return off;
    off = document.createElement("canvas");
    off.width = ow; off.height = oh;
    const oc = off.getContext("2d");
    oc.drawImage(img, 0, 0, off.width, off.height);
    oc.globalCompositeOperation = "source-in";
    oc.fillStyle = fill;
    oc.fillRect(0, 0, off.width, off.height);
    if (byImg.size >= TINT_PER_IMAGE_MAX) byImg.delete(byImg.keys().next().value);
    byImg.set(key, off);
    return off;
  }
  function drawLogoImage(ctx, img, R, tint, halo, outline) {
    ctx.save();
    clipToRegion(ctx, R);
    const pad = 0.015, bw = R.w * (1 - pad * 2), bh = R.h * (1 - pad * 2);
    const sc = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
    const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
    const x = R.x + (R.w - w) / 2, y = R.y + (R.h - h) / 2;
    let src = img;
    if (tint) src = tintedLogo(img, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), css(tint));
    const pass = (col, blur, n) => {
      ctx.save();
      ctx.shadowColor = css(col);
      ctx.shadowBlur = blur;
      for (let i = 0; i < n; i++) ctx.drawImage(src, x, y, w, h);
      ctx.restore();
    };
    if (halo) pass(halo, Math.max(4, Math.min(w * 0.085, 14)), 5);
    if (outline) pass(outline, Math.max(2, Math.min(w * 0.030, 8)), 3);
    ctx.drawImage(src, x, y, w, h);
    ctx.restore();
  }

  function drawCrest(ctx, teamId, R, opts) {
    const o = opts || {};
    const P = o.palette || markPalette(teamId, o.liv, o.field, !!o.bare);
    const style = o.liv && o.liv.crestStyle;
    const emblem = style && Object.hasOwn(EMBLEMS, style) && dressEmblem(EMBLEMS[style], o.liv.crestTone, o.liv.crestFrame);
    const fn = emblem || CRESTS[crestKey(teamId)] || crestGeneric;
    if (P.halo) {
      ctx.save();
      ctx.shadowColor = css(P.halo);
      ctx.shadowBlur = Math.max(3, Math.min(Math.min(R.w, R.h) * 0.05, 10));
      for (let i = 0; i < 3; i++) fn(ctx, R, P, !!o.bare, teamId);
      ctx.restore();
    }
    if (P.outline) {
      ctx.save();
      ctx.shadowColor = css(P.outline);
      ctx.shadowBlur = Math.max(2, Math.min(R.w, R.h) * 0.022);
      for (let i = 0; i < 3; i++) fn(ctx, R, P, !!o.bare, teamId);
      ctx.restore();
    }
    fn(ctx, R, P, !!o.bare, teamId);
  }

  const TAIL_STYLE_IDS = ["team", "diag", "sweep", "chevron", "streak", "check", "stars", "none"];
  const FIN_BADGE_IDS = ["logo", "number", "code", "none"];
  function driverCode(teamId, num) {
    const t = typeof Teams !== "undefined" && Teams.LIST && Teams.LIST.find((x) => x.id === teamId);
    const d = t && t.drivers && t.drivers.find((x) => x.num == num);
    return (d && d.code) || teamShort(teamId);
  }
  const SPINE_LOGO_IDS = ["logo", "none", "wrap", "bigmark", "saddle", "panel", "stripe", "streaks", "twin", "chevron", "wedge", "rungs", "tricolour", "wordmark", "carbon", "number", "cap", "ridge", "fade",
    ...(typeof LiveryDesign !== "undefined" ? LiveryDesign.PATTERNS : [])];
  function flankBull(ctx, teamId, colour) {
    const b = bullPath(teamId);
    if (!b) return false;
    const { d, x0, y0, x1, y1 } = b, span = wrapMarkSpan(teamId);
    const C = REGIONS.crest;
    if (C) {
      const sH = BULL.h * FLANK.sLen, sTop = FLANK.sTop + BULL.top * FLANK.sLen;
      const sPerPy = sH / (y1 - y0), uPerPx = span.uLen / (x1 - x0);
      const ks = (C.w / 2) / FLANK.sTop, kz = C.h / 0.66, cx = C.x + C.w / 2;
      for (const side of [1, -1]) {
        ctx.save();
        clipToRegion(ctx, C);
        ctx.transform(0, -kz * FLANK.zLen * uPerPx, side * ks * sPerPy, 0,
          cx + side * ks * (sTop - y0 * sPerPy),
          C.y + kz * (FLANK.zF + 1.28 - (span.u0 - x0 * uPerPx) * FLANK.zLen));
        ctx.fillStyle = css(colour);
        tracePath(ctx, { X: (u) => u, Y: (v) => v, S: (q) => q }, d);
        ctx.fill("evenodd");
        ctx.restore();
      }
    }
    eachFlank((F) => {
      const bh = BULL.h * F.R.h, top = F.R.y + F.R.h * BULL.top;
      const xA = F.fx(span.u0), xB = F.fx(span.u0 + span.uLen);
      const f = { X: (u) => xA + (u - x0) / (x1 - x0) * (xB - xA), Y: (v) => top + (v - y0) / (y1 - y0) * bh, S: (s) => s / (x1 - x0) * Math.abs(xB - xA) };
      ctx.save();
      clipToRegion(ctx, F.R);
      ctx.fillStyle = css(colour);
      tracePath(ctx, f, d);
      ctx.fill("evenodd");
      ctx.restore();
    });
    return true;
  }
  const SUN = { r: 0.34, zc: -0.66 };
  function drawSunWrap(ctx, acc) {
    const { r, zc } = SUN;
    const C = REGIONS.crest;
    ctx.save();
    clipToRegion(ctx, C);
    ctx.fillStyle = cssA(acc, 0.97);
    ctx.beginPath();
    ctx.ellipse(C.x + C.w / 2, C.y + (zc + 1.28) / 0.66 * C.h, Math.min(r / 0.19 * (C.w / 2), C.w * 0.55), r / 0.66 * C.h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    eachFlank((F) => {
      const Sf = F.R;
      ctx.save();
      clipToRegion(ctx, Sf);
      ctx.fillStyle = cssA(acc, 0.97);
      ctx.beginPath();
      ctx.ellipse(F.fx((FLANK.zF - zc) / FLANK.zLen), Sf.y - FLANK.sTop / FLANK.sLen * Sf.h,
                  r / FLANK.zLen * Sf.w, r / FLANK.sLen * Sf.h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  function sunColour(teamId, liv) {
    if (liv.sunTint) return liv.sunTint.slice();
    const cover = liv.cover || liv.c1 || INK_DARK;
    const P = markPalette(teamId, liv, [cover, liv.c2].filter(Boolean), false);
    const order = [(P && P.plate), liv.c2, liv.c1, INK_LIGHT, INK_DARK];
    return pickOn(order, cover, SUN_FLOOR).slice();
  }
  const SUN_FLOOR = 2.0;
  const MARK_ON_BODY = 2.0;
  function flankBullColour(teamId, liv, sunC, cover, c1, lockup) {
    const L = lockup || markPalette(teamId, liv, [sunC, cover], false, { noPlate: true });
    if (liv && liv.logo) return L.mark.slice();
    const brand = MARK_BRAND[crestKey(teamId)] && MARK_BRAND[crestKey(teamId)].mark;
    if (brand && contrast(brand, c1) >= MARK_ON_BODY) return brand.slice();
    return (L.mark || inkOn([sunC, c1])).slice();
  }
  function pickOn(cands, bg, floor) {
    let bgs;
    if (Array.isArray(bg) && bg.length && Array.isArray(bg[0])) bgs = bg.filter(Boolean);
    else bgs = bg ? [bg] : [];
    const worst = (c) => bgs.length
      ? bgs.reduce((m, b) => Math.min(m, contrast(c, b)), Infinity)
      : 0;
    const list = cands.filter(Boolean);
    for (const c of list) if (worst(c) >= floor) return c;
    let best = list[0] || INK_LIGHT, score = worst(best);
    for (const c of list) { const v = worst(c); if (v > score) { score = v; best = c; } }
    return best;
  }
  const CROWN_SQUASH = 0.52;
  const FLANK_H = { standard: 0.4537, raised: 0.4964, high: 0.5249, dorsal: 0.5463 };
  const flankSquash = (spineHeight, R) => {
    const H = FLANK_H[spineHeight] || FLANK_H.standard;
    return (R.w / FLANK.zLen) * (H / R.h);
  };
  const FLANK = { zF: -0.66, zLen: 1.24, sTop: 0.21, sLen: 0.47 };
  const FLANK_SEEN = 0.62;
  function sunReach(v) {
    const cv = -FLANK.sTop / FLANK.sLen, rv = SUN.r / FLANK.sLen;
    const t = 1 - ((v - cv) / rv) ** 2;
    return t <= 0 ? 0 : (SUN.r / FLANK.zLen) * Math.sqrt(t);
  }
  const BULL = { h: (0.49) / FLANK.sLen, u0: 0.05, top: -FLANK.sTop / FLANK.sLen };
  const WRAP_BADGE = { h: 0.52, top: 0.30 };
  function bullPath(teamId) {
    const spec = crestSpecFor(teamId);
    if (!spec || spec.d.length !== 2 || spec.roles.some((r) => r !== "mark")) return null;
    const d = spec.d[1];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const m of d.matchAll(/(-?[0-9.]+)[ ,](-?[0-9.]+)/g)) {
      const x = +m[1], y = +m[2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { d, x0, y0, x1, y1 };
  }
  function wrapMarkSpan(teamId) {
    const b = bullPath(teamId);
    const aspect = b ? (b.y1 - b.y0) / (b.x1 - b.x0) : 1;
    return { u0: BULL.u0, uLen: ((b ? BULL.h : WRAP_BADGE.h) * FLANK.sLen / aspect) / FLANK.zLen };
  }
  const FLANKS = [{ region: "spineSide", frontLeft: false }, { region: "spineSideL", frontLeft: true }];
  function flankFrame(side) {
    const R = REGIONS[side.region];
    if (!R) return null;
    const fx = (u) => R.x + (side.frontLeft ? u : 1 - u) * R.w;
    return { R, fx, dir: side.frontLeft ? 1 : -1 };
  }
  const eachFlank = (fn) => { for (const side of FLANKS) { const F = flankFrame(side); if (F) fn(F); } };
  const COVER_BIND_IDS = ["independent", "saddleWrap", "spineOnly"];
  const FIN_HANDOFF_IDS = ["match", "contrast", "hardCut"];
  function coverBindOf(liv) {
    const v = liv && liv.coverBind;
    return COVER_BIND_IDS.includes(v) ? v : "independent";
  }
  function finHandoffOf(liv) {
    const v = liv && liv.finHandoff;
    return FIN_HANDOFF_IDS.includes(v) ? v : "match";
  }
  function saddleFill(liv, bandC, coverPaint) {
    if (liv && liv.saddleTint) return liv.saddleTint;
    const bind = coverBindOf(liv);
    const logo = (liv && liv.spineLogo) || "logo";
    if (logo === "saddle" || bind === "saddleWrap") return bandC;
    return null;
  }
  function ridgeFill(liv, bandC, coverPaint) {
    if (liv && liv.spineTint) return liv.spineTint;
    return pickOn(
      [bandC, INK_LIGHT, INK_DARK].filter(Boolean),
      coverPaint || bandC, SUN_FLOOR);
  }
  const FIN_ON_BLOCK = 2.0;
  function airboxMeshColour(teamId, liv, coverC) {
    const logo = (liv && liv.spineLogo) || "logo";
    if (logo === "wrap") return sunColour(teamId, liv).slice();
    return coverC ? coverC.slice() : [0.1, 0.1, 0.12];
  }
  function finContrastBlock(liv, coverPaint, bandC) {
    const saddle = saddleFill(liv, bandC, coverPaint);
    return saddle || coverPaint;
  }
  function resolveFinPaint(teamId, liv, coverPaint, bandC, c1, c2) {
    if (liv && liv.fin) return liv.fin.slice();
    if (finHandoffOf(liv) === "contrast") {
      const block = finContrastBlock(liv, coverPaint, bandC);
      return pickOn([c2, c1, INK_DARK, INK_LIGHT], block, FIN_ON_BLOCK).slice();
    }
    return c2.slice();
  }
  function saddleFlanks(ctx, acc) {
    eachFlank((F) => {
      const Sf = F.R;
      ctx.save();
      clipToRegion(ctx, Sf);
      ctx.fillStyle = cssA(acc, 0.97);
      ctx.beginPath();
      ctx.moveTo(F.fx(0), Sf.y); ctx.lineTo(F.fx(0.64), Sf.y);
      ctx.lineTo(F.fx(0.38), Sf.y + Sf.h); ctx.lineTo(F.fx(0), Sf.y + Sf.h);
      ctx.closePath(); ctx.fill();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = cssA(acc, 0.55);
      ctx.lineWidth = Math.max(4, Sf.h * 0.045);
      ctx.beginPath();
      ctx.moveTo(F.fx(0.64), Sf.y); ctx.lineTo(F.fx(0.38), Sf.y + Sf.h);
      ctx.stroke();
      ctx.strokeStyle = cssA(acc, 0.97);
      ctx.lineWidth = Math.max(2, Sf.h * 0.02);
      ctx.beginPath();
      ctx.moveTo(F.fx(0.64), Sf.y); ctx.lineTo(F.fx(0.38), Sf.y + Sf.h);
      ctx.stroke();
      ctx.strokeStyle = cssA(INK_DARK, 0.28);
      ctx.lineWidth = Math.max(1.5, Sf.h * 0.014);
      ctx.beginPath();
      ctx.moveTo(F.fx(0.64), Sf.y); ctx.lineTo(F.fx(0.38), Sf.y + Sf.h);
      ctx.stroke();
      ctx.restore();
    });
  }
  const { drawSpineTop, drawTailTop, drawTailGraphic, tailStyleOf } = LiveryGraphics.create({
    cssA, clipToRegion, drawNumber, drawWordmark, CROWN_SQUASH, coverBindOf,
    saddleFill, ridgeFill, pickOn, INK_LIGHT, INK_DARK, SUN_FLOOR, TAIL_STYLE_IDS,
  });

  const SPINE_SIDE_IDS = ["none", "number", "logo", "code", "plate", "wordmark", "duo", "ribbon", "lockup", "title", "emblem", "band", "sash", "slash", "rake", "shoulder", "starfield"];
  const SIDE_FILL = { band: 1, sash: 1, rake: 1, shoulder: 1 };

  const FILL_SURFACES = Object.freeze([
    { key: "patternTint", label: "DESIGN COLOUR", why: "Choose a new spine design", tops: typeof LiveryDesign !== "undefined" ? LiveryDesign.PATTERNS : [] },
    { key: "patternSecond", label: "SECOND DESIGN COLOUR", why: "Choose a two-colour design", tops: typeof LiveryDesign !== "undefined" ? LiveryDesign.SECOND_COLOR : [] },
    { key: "spineTint", label: "BAND",
      why: "Needs a SPINE TOP that paints a band (e.g. stripe, saddle, panel) or COVER BIND SADDLE WRAP",
      tops: ["saddle", "panel", "stripe", "streaks", "twin", "chevron", "wedge",
             "rungs", "tricolour", "carbon", "cap", "ridge", "fade"],
      binds: ["saddleWrap"] },
    { key: "saddleTint", label: "SADDLE",
      why: "Needs SADDLE top, SADDLE WRAP bind, or a shoulder side",
      tops: ["saddle"], sides: ["shoulder"], binds: ["saddleWrap"] },
    { key: "sideTint", label: "FLANK FILL",
      why: "Needs a SPINE SIDE colour fill (band, sash, rake, …)",
      sides: ["band", "sash", "slash", "rake", "shoulder", "starfield", "ribbon"] },
    { key: "sunTint", label: "SUN", why: "Needs SPINE TOP WRAP", tops: ["wrap"] },
    { key: "bandTint2", label: "2ND BAND", why: "Needs SPINE TOP TRICOLOUR", tops: ["tricolour"] },
    { key: "plateTint", label: "PLATE", why: "Needs SPINE SIDE PLATE or TITLE",
      sides: ["plate", "title"] },
  ]);
  function liveFills(design) {
    const d = design || {};
    const top = d.spineLogo || "logo", side = d.spineSide || "none";
    const bind = coverBindOf(d);
    return FILL_SURFACES.filter((f) => (f.tops || []).includes(top)
      || (f.sides || []).includes(side) || (f.binds || []).includes(bind));
  }
  function fillInert(key, design) {
    if (!FILL_SURFACES.some((f) => f.key === key)) return false;
    return !liveFills(design).some((f) => f.key === key);
  }

  const FLANK_MARK = {
    u: 0.19, uOnCrown: 0.38, uOnSaddle: 0.26,
    v: 0.45, vOnSaddle: 0.36,
    halfW: 0.36, halfH: 0.24,
  };
  function flankMarkStation(spineLogo, sideFrom, spineSide) {
    if (sideFrom) return { u: FLANK_MARK.uOnCrown, v: FLANK_MARK.v };
    if (spineLogo === "saddle" && spineSide === "logo") {
      return { u: FLANK_MARK.uOnSaddle, v: FLANK_MARK.vOnSaddle };
    }
    return { u: FLANK_MARK.u, v: FLANK_MARK.v };
  }
  const crestExtentCache = {};
  function crestExtent(teamId) {
    teamId = crestKey(teamId);
    if (crestExtentCache[teamId]) return crestExtentCache[teamId];
    const spec = crestSpecFor(teamId);
    let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
    if (spec) for (const d of spec.d) {
      const nums = d.match(/-?\d*\.?\d+/g) || [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const u = +nums[i], v = +nums[i + 1];
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
    }
    const disc = CREST_DISC[crestKey(teamId)];
    if (disc) {
      u0 = Math.min(u0, disc.cx - disc.r); u1 = Math.max(u1, disc.cx + disc.r);
      v0 = Math.min(v0, disc.cy - disc.r); v1 = Math.max(v1, disc.cy + disc.r);
    }
    if (!(u1 > u0 && v1 > v0)) { u0 = 0; v0 = 0; u1 = 1; v1 = 1; }
    return (crestExtentCache[teamId] = { u0, v0, u1, v1 });
  }
  function flankEmblemBox(R, teamId) {
    const e = crestExtent(teamId);
    const s = Math.min(R.w / (e.u1 - e.u0), R.h / (e.v1 - e.v0)) * FLANK_CREST_FILL;
    const side = s / (1 - CREST_MARGIN * 2);
    const cx = R.x + R.w / 2 - ((e.u0 + e.u1) / 2 - 0.5) * s;
    const cy = R.y + R.h / 2 - ((e.v0 + e.v1) / 2 - 0.5) * s;
    return { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
  }
  let scratchCanvas = null;
  function scratchAtlas() {
    if (!scratchCanvas) scratchCanvas = document.createElement("canvas");
    return scratchCanvas;
  }

  function buildAtlas(teamId, colors = {}, numberOverride, isPlayer, hiRes) {
    Log.info("car", "livery " + (teamId || "?"));
    const mobile = atlasMobile(!!isPlayer, IS_MOBILE, IS_PHONE);
    const div = atlasDiv(!!isPlayer, mobile, !!hiRes);
    const canvas = mobile ? scratchAtlas() : document.createElement("canvas");
    canvas.width = SIZE / div;
    canvas.height = SIZE_H / div;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = "high"; } catch (_) {  }
    if (div !== 1) ctx.setTransform(1 / div, 0, 0, 1 / div, 0, 0);

    colors = Object.assign({}, colors || {});
    if (typeof Liveries !== "undefined" && Liveries.migratePaint) Liveries.migratePaint(colors);
    const c1 = colors.c1 || [0.1, 0.1, 0.12];
    const c2 = colors.c2 || [0.9, 0.9, 0.92];
    const stripe = colors.stripe || null;
    const finArt = colors.finArt || null;
    const logo = colors.logo || null;

    const board = (typeof Car3D !== "undefined" && Car3D.PANEL_COL) || [0.82, 0.82, 0.86];
    const podBg = [board];
    const stripBg = [c2];
    const ink = inkOn([c1, c2]);
    const coverPaint = colors.cover || c1;
    const inkCrest = inkOn([coverPaint]);
    const inkPod = inkOn(podBg);
    const inkNose = inkOn([c1, c2]);
    const inkStrip = inkOn(stripBg);
    const haloIf = (i) => (i.worst < INK_TARGET ? haloFor(i) : null);

    let accent = colors.accent || c2;
    if (!colors.accent && (contrast(accent, ink) < 2.0 || contrast(accent, c1) < 1.6)) {
      const options = [c2, c1, INK_LIGHT, INK_DARK].filter(Boolean);
      let best = accent, bestScore = -1;
      for (const cand of options) {
        const score = Math.min(contrast(cand, ink), contrast(cand, c1));
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      accent = best;
    }
    const tailStyle = colors.finStyle || "team";
    const finBadge = colors.finBadge || "logo";
    const spineLogo = colors.spineLogo || "logo";
    const coverBind = coverBindOf(colors);
    const BAND_ORDER = [c2, c1, INK_LIGHT, INK_DARK];
    const bandC = colors.spineTint || pickOn(BAND_ORDER, coverPaint, BAND_ON_COVER);
    const bandWeak = contrast(bandC, coverPaint) < BAND_ON_COVER;
    const finPaint = resolveFinPaint(teamId, colors, coverPaint, bandC, c1, c2);
    const inkFin = inkOn([finPaint]);
    const spineHeight = colors.spineHeight || "standard";
    const markHalo = (img, bg, ink) =>
      (img && img._avg && contrast(img._avg, bg) < 2.6 ? ink : null);
    const emblemRim = colors.logo3 || null;
    const finReal = (colors.finShape || "standard") !== "none";
    const lockup = markPalette(teamId, colors, finReal ? [coverPaint, finPaint] : [coverPaint], false);
    const pack = colors.sponsors && SPONSOR_PACKS[colors.sponsors];
    const names = pack || SPONSORS[teamId] || ["APEXFIN", "NEXUS", "VOLTARC", "MERIDIAN", "HYPERGRID", "QUANTA"];
    const raceNum = resolveRaceNumber(numberOverride, teamId);
    let paintFlankBull = null;
    const paintDesign = typeof LiveryDesign !== "undefined" && LiveryDesign.PATTERNS.includes(spineLogo)
      ? () => LiveryDesign.drawAtlas(ctx, colors, REGIONS, FLANK, eachFlank) : null;
    const spineSideRaw = colors.spineSide || "none";
    const spineSide = SPINE_SIDE_IDS.includes(spineSideRaw) ? spineSideRaw : "none";
    if (spineLogo === "logo") {
      const Rc = REGIONS.crest, sq = Rc.w * 0.92;
      ctx.save();
      ctx.translate(Rc.x + Rc.w / 2, Rc.y + Rc.h / 2); ctx.rotate(Math.PI); ctx.scale(1, CROWN_SQUASH);
      const Rr = { x: -sq / 2, y: -sq / 2, w: sq, h: sq };
      if (LOGOS[teamId]) {
        drawLogoImage(ctx, LOGOS[teamId], Rr, logo,
                      markHalo(LOGOS[teamId], coverPaint, inkCrest), emblemRim);
      } else drawCrest(ctx, teamId, Rr, { liv: colors, field: [coverPaint], bare: false, palette: lockup });
      ctx.restore();
    } else if (spineLogo === "wrap") {
      const sunC = sunColour(teamId, colors);
      drawSunWrap(ctx, sunC);
      const sunLockup = markPalette(teamId, colors, [sunC, coverPaint], false, { noPlate: true });
      const bullC = flankBullColour(teamId, colors, sunC, coverPaint, c1, sunLockup);
      paintFlankBull = () => {
      if (!flankBull(ctx, teamId, bullC) && spineSide === "none" && !colors._bareWrapFlank) {
        const span = wrapMarkSpan(teamId);
        const badgeLockup = markPalette(teamId, colors, [coverPaint], false, { noPlate: true });
        eachFlank((F) => {
          ctx.save();
          ctx.translate(F.fx(span.u0 + span.uLen / 2), F.R.y + F.R.h * (WRAP_BADGE.top + WRAP_BADGE.h / 2));
          ctx.scale(flankSquash(spineHeight, F.R), 1);
          const s = WRAP_BADGE.h * F.R.h;
          const Rw = { x: -s / 2, y: -s / 2, w: s, h: s };
          if (LOGOS[teamId]) {
            drawLogoImage(ctx, LOGOS[teamId], Rw, logo,
                          markHalo(LOGOS[teamId], coverPaint, inkOn([coverPaint])), emblemRim);
          } else drawCrest(ctx, teamId, Rw, { liv: colors, field: [coverPaint], bare: true, palette: badgeLockup });
          ctx.restore();
        });
      }
      };
    } else if (spineLogo === "bigmark") {
      const Rc = REGIONS.crest, sq = Rc.w / (1 - CREST_MARGIN * 2);
      ctx.save();
      clipToRegion(ctx, Rc);
      ctx.translate(Rc.x + Rc.w / 2, Rc.y + Rc.h / 2); ctx.rotate(Math.PI); ctx.scale(1, CROWN_SQUASH);
      const Rb = { x: -sq / 2, y: -sq / 2, w: sq, h: sq };
      if (LOGOS[teamId]) {
        drawLogoImage(ctx, LOGOS[teamId], Rb, logo, markHalo(LOGOS[teamId], coverPaint, inkCrest), emblemRim);
      } else drawCrest(ctx, teamId, Rb, { liv: colors, field: [coverPaint], bare: true,
                                          palette: markPalette(teamId, colors, [coverPaint], true, { noPlate: true }) });
      ctx.restore();
    } else if (spineLogo !== "none") {
      const bandC2 = colors.bandTint2 || pickOn([inkCrest].concat(BAND_ORDER), [coverPaint, bandC], BAND_ON_COVER);
      drawSpineTop(ctx, spineLogo, REGIONS.crest, coverPaint, bandC, inkCrest, names[0] || "", raceNum, colors.numFont, bandC2, colors, bandWeak);
      if (spineLogo === "saddle" || coverBind === "saddleWrap") {
        saddleFlanks(ctx, saddleFill(colors, bandC, coverPaint) || bandC);
      }
    }
    if (REGIONS.tail && finHandoffOf(colors) !== "hardCut") {
      drawTailTop(ctx, spineLogo, REGIONS.tail, bandC, inkCrest, names[1] || "", colors, coverPaint, bandWeak);
    }
    const finWash = finArt || [c2, c1, inkFin].filter(Boolean)
      .find((c) => contrast(c, finPaint) >= 1.8) || inkFin;
    drawTailGraphic(ctx, teamId, REGIONS.fin, c1, finPaint, finWash, tailStyle);
    if (finBadge === "logo") {
      paintTeamMark(ctx, teamId, colors, REGIONS.finBadge,
        finReal ? [coverPaint, finPaint] : [coverPaint], {
          halo: LOGOS[teamId] ? markHalo(LOGOS[teamId], finPaint, inkFin) : null,
        });
    } else if (finBadge === "number" || finBadge === "code") {
      const finNum = resolveRaceNumber(numberOverride, teamId);
      const text = finBadge === "code" ? driverCode(teamId, finNum) : finNum;
      drawNumber(ctx, text, REGIONS.finBadge, inkFin, finWash, null, colors.numFont, 0);
    }
    const saddleFlankC = saddleFill(colors, bandC, coverPaint);
    let flankBg = coverPaint;
    if (spineLogo === "wrap") flankBg = sunColour(teamId, colors);
    else if (saddleFlankC != null && (spineLogo === "saddle" || coverBind === "saddleWrap")) flankBg = saddleFlankC;
    const flankBgs = spineLogo === "wrap" ? [sunColour(teamId, colors), coverPaint] : [flankBg];
    let markBgs = flankBgs;
    if (spineLogo === "wrap") {
      markBgs = bullPath(teamId)
        ? [flankBullColour(teamId, colors, flankBg, coverPaint, c1), coverPaint]
        : [coverPaint];
    }
    const markBg = markBgs[0];
    const inkFlank = inkOn(spineLogo === "wrap" ? [coverPaint] : flankBgs);
    const inkMark = inkOn(markBgs);
    const designWrap = !!paintDesign && colors.patternPlacement === "wrap";
    const flankHalo = (ink) => spineLogo === "saddle" || designWrap ? haloFor(ink) : haloIf(ink);
    const flankBandC = colors.sideTint || pickOn(BAND_ORDER, flankBgs, BAND_ON_COVER);
    const sideFrom = spineLogo === "wrap" ? Math.round((sunReach(0) + 0.02) * 1000) / 1000 : 0;
    const sideTo = sideFrom ? FLANK_SEEN : 1;
    const su = (F, u) => F.fx(sideFrom + u * (1 - sideFrom));
    const sc = (F, u) => F.fx(sideFrom + u * (sideTo - sideFrom));
    const sbox = (F, u0, u1, v0, v1) => {
      const xa = sc(F, u0), xb = sc(F, u1);
      return { x: Math.min(xa, xb), y: F.R.y + v0 * F.R.h, w: Math.abs(xb - xa), h: (v1 - v0) * F.R.h };
    };
    const flankMark = (paint) => eachFlank((F) => {
      const st = flankMarkStation(spineLogo, sideFrom, spineSide);
      ctx.save();
      ctx.translate(F.fx(st.u), F.R.y + F.R.h * st.v);
      ctx.scale(flankSquash(spineHeight, F.R), 1);
      paint({
        x: -F.R.h * FLANK_MARK.halfW, y: -F.R.h * FLANK_MARK.halfH,
        w: F.R.h * FLANK_MARK.halfW * 2, h: F.R.h * FLANK_MARK.halfH * 2,
      });
      ctx.restore();
    });
    if (paintFlankBull && !SIDE_FILL[spineSide]) { paintFlankBull(); paintFlankBull = null; }
    if (paintDesign && !SIDE_FILL[spineSide]) paintDesign();
    if (spineSide === "logo" || spineSide === "emblem") {
      const paintFlankLogo = (Rm, scaleCrest) => {
        const img = LOGOS[teamId];
        paintTeamMark(ctx, teamId, colors, Rm, markBgs, {
          halo: img ? markHalo(img, markBg, inkMark) : null,
          crestScale: !!scaleCrest,
          noPlate: true,
        });
      };
      if (spineSide === "emblem") {
        eachFlank((F) => {
          ctx.save();
          ctx.translate(sc(F, sideFrom ? 0.45 : 0.22), F.R.y + F.R.h * FLANK_MARK.v);
          ctx.scale(flankSquash(spineHeight, F.R), 1);
          paintFlankLogo({
            x: -F.R.h * 0.52, y: -F.R.h * 0.36,
            w: F.R.h * 1.04, h: F.R.h * 0.72,
          }, false);
          ctx.restore();
        });
      } else {
        flankMark((Rm) => paintFlankLogo(Rm, true));
      }
    } else if (spineSide === "number" || spineSide === "code") {
      flankMark((Rm) => drawNumber(ctx, spineSide === "code" ? driverCode(teamId, raceNum) : raceNum,
                                   Rm, inkMark, accent, null, colors.numFont, 0, flankHalo(inkMark)));
    } else if (spineSide === "plate") {
      let plateC = colors.plateTint || pickOn([c2, c1, INK_DARK, INK_LIGHT], markBg, 1.6);
      if (!colors.plateTint && contrast(plateC, markBg) < 1.6) {
        for (const cand of [c2, c1, INK_DARK, INK_LIGHT].filter(Boolean)) {
          if (contrast(cand, markBg) > contrast(plateC, markBg)) plateC = cand;
        }
      }
      const plateGlyph = inkOn([plateC]);
      flankMark((Rm) => drawNumber(ctx, raceNum, Rm, plateGlyph, inkMark, plateC, colors.numFont, 0,
                                   contrast(plateGlyph, markBg) < 2.0 ? haloFor(plateGlyph) : null));
    } else if (spineSide === "wordmark") {
      eachFlank((F) => {
        let box = sbox(F, 0.06, 0.94, 0.12, 0.48);
        if (sideFrom) box = sbox(F, 0.02, 0.98, 0.03, 0.30);
        else if (spineLogo === "saddle") box = sbox(F, 0.04, 0.50, 0.12, 0.48);
        const ink = sideFrom ? inkMark : inkFlank;
        drawWordmark(ctx, names[0] || "", box, ink, {
          align: "center", pad: (sideFrom || spineLogo === "saddle") ? 6 : 14,
          halo: flankHalo(ink),
        });
      });
    } else if (spineSide === "duo") {
      eachFlank((F) => {
        if (sideFrom) {
          drawWordmark(ctx, names[0] || "", sbox(F, 0.02, 0.98, 0.02, 0.17), inkMark, { align: "center", pad: 4, halo: haloIf(inkMark) });
          drawWordmark(ctx, names[1] || "", sbox(F, 0.12, 0.88, 0.18, 0.33), inkMark, { align: "center", pad: 4, halo: haloIf(inkMark) });
          return;
        }
        if (spineLogo === "saddle") {
          drawWordmark(ctx, names[0] || "", sbox(F, 0.04, 0.50, 0.08, 0.30), inkFlank,
            { align: "center", pad: 4, halo: flankHalo(inkFlank) });
          drawWordmark(ctx, names[1] || "", sbox(F, 0.04, 0.46, 0.32, 0.52), inkFlank,
            { align: "center", pad: 4, halo: flankHalo(inkFlank) });
          return;
        }
        drawWordmark(ctx, names[0] || "", sbox(F, 0.40, 0.96, 0.14, 0.50), inkFlank,
          { align: "center", pad: 8, halo: flankHalo(inkFlank) });
        drawWordmark(ctx, names[1] || "", sbox(F, 0.05, 0.35, 0.16, 0.46), inkFlank,
          { align: "center", pad: 6, halo: flankHalo(inkFlank) });
      });
    } else if (spineSide === "title") {
      let boardC = colors.plateTint || c2 || accent;
      if (!colors.plateTint && contrast(boardC, markBg) < 2.0) {
        for (const cand of [c2, c1, INK_DARK, INK_LIGHT].filter(Boolean)) {
          if (contrast(cand, markBg) > contrast(boardC, markBg)) boardC = cand;
        }
      }
      const boardInk = inkOn([boardC]);
      eachFlank((F) => {
        let box = sbox(F, 0.08, 0.58, 0.14, 0.50);
        if (sideFrom) box = sbox(F, 0.06, 0.94, 0.04, 0.34);
        else if (spineLogo === "saddle") box = sbox(F, 0.04, 0.50, 0.14, 0.50);
        const r = Math.min(box.h * 0.18, box.w * 0.06);
        ctx.save();
        ctx.fillStyle = cssA(boardC, 0.98);
        ctx.beginPath();
        const x = box.x, y = box.y, w = box.w, h = box.h;
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = cssA(INK_DARK, 0.35);
        ctx.lineWidth = Math.max(1.5, box.h * 0.04);
        ctx.stroke();
        ctx.restore();
        drawWordmark(ctx, names[0] || "", box, boardInk, {
          align: "center", pad: 6,
          halo: contrast(boardInk, markBg) < 2.0 ? haloFor(boardInk) : null,
        });
      });
    } else if (spineSide === "ribbon") {
      eachFlank((F) => {
        const Sf = F.R;
        ctx.save(); clipToRegion(ctx, Sf);
        ctx.fillStyle = cssA(flankBandC, 0.97);
        const uEnd = spineLogo === "saddle" ? 0.50 : 0.98;
        const x0 = su(F, 0.02), x1 = su(F, uEnd);
        const y0 = Sf.y + Sf.h * 0.04, rh = Sf.h * 0.32;
        ctx.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), rh);
        ctx.fillStyle = cssA(INK_DARK, 0.4);
        ctx.fillRect(Math.min(x0, x1), y0 + rh - Math.max(2, Sf.h * 0.02), Math.abs(x1 - x0), Math.max(2, Sf.h * 0.02));
        ctx.restore();
        ctx.save();
        let numU = 0.16;
        if (sideFrom) numU = 0.45;
        else if (spineLogo === "saddle") numU = 0.22;
        ctx.translate(sc(F, numU), Sf.y + Sf.h * 0.20);
        ctx.scale(flankSquash(spineHeight, Sf), 1);
        const ribbonInk = inkOn([flankBandC]);
        drawNumber(ctx, raceNum, { x: -Sf.h * 0.30, y: -Sf.h * 0.13, w: Sf.h * 0.60, h: Sf.h * 0.26 },
                   ribbonInk, inkFlank, null, colors.numFont, 0,
                   contrast(ribbonInk, markBg) < 2.0 ? haloFor(ribbonInk) : null);
        ctx.restore();
      });
    } else if (spineSide === "lockup") {
      const k = sideFrom ? 0.70 : 1, vMid = sideFrom ? 0.15 : 0.28;
      eachFlank((F) => {
        ctx.save();
        ctx.translate(sc(F, sideFrom ? 0.22 : 0.12), F.R.y + F.R.h * vMid);
        ctx.scale(flankSquash(spineHeight, F.R), 1);
        drawNumber(ctx, raceNum, { x: -F.R.h * 0.26 * k, y: -F.R.h * 0.20 * k, w: F.R.h * 0.52 * k, h: F.R.h * 0.40 * k },
                   inkMark, accent, null, colors.numFont, 0, flankHalo(inkMark));
        ctx.restore();
        ctx.save();
        ctx.translate(sc(F, sideFrom ? 0.74 : 0.40), F.R.y + F.R.h * vMid);
        ctx.scale(flankSquash(spineHeight, F.R), 1);
        const Rm = { x: -F.R.h * 0.20 * k, y: -F.R.h * 0.16 * k, w: F.R.h * 0.40 * k, h: F.R.h * 0.32 * k };
        const lockupBare = spineLogo === "saddle" || spineLogo === "wrap";
        if (LOGOS[teamId]) {
          drawLogoImage(ctx, LOGOS[teamId], Rm, logo, markHalo(LOGOS[teamId], markBg, inkMark), emblemRim);
        } else {
          drawCrest(ctx, teamId, Rm, {
            liv: colors, field: markBgs, bare: true,
            palette: markPalette(teamId, colors, markBgs, false, lockupBare ? { noPlate: true } : undefined),
          });
        }
        ctx.restore();
      });
    } else if (spineSide === "band") {
      eachFlank((F) => {
        const Sf = F.R;
        ctx.save(); clipToRegion(ctx, Sf);
        ctx.fillStyle = cssA(flankBandC, 0.97);
        const uEnd = sideFrom ? 0.98 : 0.70;
        const y0 = Sf.y + Sf.h * 0.05, y1 = Sf.y + Sf.h * 0.56;
        ctx.beginPath();
        ctx.moveTo(su(F, 0.02), y0);
        ctx.lineTo(su(F, uEnd), y0);
        ctx.lineTo(su(F, uEnd * 0.88), y1);
        ctx.lineTo(su(F, 0.02), y1);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = cssA(INK_DARK, 0.38); ctx.lineWidth = Math.max(2, Sf.h * 0.016);
        ctx.beginPath();
        ctx.moveTo(su(F, 0.02), y1); ctx.lineTo(su(F, uEnd * 0.88), y1);
        ctx.stroke();
        ctx.restore();
      });
    } else if (spineSide === "sash") {
      eachFlank((F) => {
        const Sf = F.R;
        ctx.save(); clipToRegion(ctx, Sf);
        ctx.fillStyle = cssA(flankBandC, 0.97);
        const uEnd = sideFrom ? 0.98 : 0.68;
        const top = Sf.y + Sf.h * 0.04, bot = Sf.y + Sf.h * 0.62;
        ctx.beginPath();
        ctx.moveTo(su(F, 0.02), top);
        ctx.lineTo(su(F, uEnd * 0.92), top);
        ctx.lineTo(su(F, uEnd), bot);
        ctx.lineTo(su(F, 0.14), bot);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = cssA(INK_DARK, 0.4); ctx.lineWidth = Math.max(2, Sf.h * 0.016);
        ctx.beginPath();
        ctx.moveTo(su(F, 0.14), bot); ctx.lineTo(su(F, uEnd), bot);
        ctx.stroke();
        ctx.restore();
      });
    } else if (spineSide === "rake") {
      let rakeC;
      if (colors.sideTint) {
        rakeC = colors.sideTint;
      } else {
        const rakePref = coverBind === "saddleWrap" ? (saddleFlankC || flankBandC) : flankBandC;
        const bgs = (Array.isArray(flankBgs) && Array.isArray(flankBgs[0])) ? flankBgs : [flankBgs];
        const keep = rakePref && bgs.every((b) => b && contrast(rakePref, b) >= BAND_ON_COVER);
        rakeC = keep ? rakePref : pickOn(
          [flankBandC, inkCrest, c1, c2, INK_DARK, INK_LIGHT].filter(Boolean),
          flankBgs, BAND_ON_COVER);
      }
      eachFlank((F) => {
        const Sf = F.R;
        ctx.save(); clipToRegion(ctx, Sf);
        ctx.fillStyle = cssA(rakeC, 0.97);
        const u0 = sideFrom || 0.02;
        const uEnd = sideFrom ? sideTo : FLANK_SEEN;
        const vTop = Sf.y + Sf.h * 0.04, vBot = Sf.y + Sf.h * 0.58;
        ctx.beginPath();
        ctx.moveTo(su(F, u0), vBot);
        ctx.lineTo(su(F, uEnd), vTop);
        ctx.lineTo(su(F, uEnd), vBot);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = cssA(INK_DARK, 0.38); ctx.lineWidth = Math.max(2, Sf.h * 0.016);
        ctx.beginPath();
        ctx.moveTo(su(F, u0), vBot); ctx.lineTo(su(F, uEnd), vTop);
        ctx.stroke();
        ctx.restore();
      });
    } else if (spineSide === "shoulder") {
      const onSaddleFlank = spineLogo !== "wrap" && saddleFlankC != null &&
        (spineLogo === "saddle" || coverBind === "saddleWrap");
      let shoulderC;
      if (colors.sideTint) {
        shoulderC = colors.sideTint;
      } else if (colors.saddleTint && !(onSaddleFlank && contrast(colors.saddleTint, flankBg) < BAND_ON_COVER)) {
        shoulderC = colors.saddleTint;
      } else {
        shoulderC = pickOn(
          [flankBandC, inkCrest, c1, c2, INK_DARK, INK_LIGHT].filter(Boolean),
          flankBgs, BAND_ON_COVER);
      }
      eachFlank((F) => {
        const Sf = F.R;
        ctx.save(); clipToRegion(ctx, Sf);
        ctx.fillStyle = cssA(shoulderC, 0.97);
        const u0 = sideFrom || 0.02;
        const uEnd = sideFrom ? sideTo : FLANK_SEEN;
        const y0 = Sf.y + Sf.h * 0.04, y1 = Sf.y + Sf.h * 0.33;
        ctx.fillRect(Math.min(su(F, u0), su(F, uEnd)), y0, Math.abs(su(F, uEnd) - su(F, u0)), y1 - y0);
        ctx.strokeStyle = cssA(INK_DARK, 0.35); ctx.lineWidth = Math.max(2, Sf.h * 0.014);
        ctx.beginPath();
        ctx.moveTo(su(F, u0), y1); ctx.lineTo(su(F, uEnd), y1);
        ctx.stroke();
        ctx.restore();
      });
    } else if (spineSide === "starfield") {
      const dotInk = colors.sideTint
        || pickOn(BAND_ORDER, flankBgs, BAND_ON_COVER);
      eachFlank((F) => {
        const Sf = F.R;
        ctx.save(); clipToRegion(ctx, Sf);
        const u0 = sideFrom || 0.02;
        const uEnd = sideFrom ? sideTo : FLANK_SEEN;
        const x0 = su(F, u0), x1 = su(F, uEnd);
        const y0 = Sf.y + Sf.h * 0.06, y1 = Sf.y + Sf.h * 0.58;
        const w = Math.abs(x1 - x0), h = y1 - y0;
        const cols = Math.max(8, Math.round(w / Math.max(4, w * 0.032)));
        const rows = Math.max(6, Math.round(h / Math.max(4, w * 0.032)));
        const cellW = w / cols, cellH = h / rows;
        const rMax = Math.min(cellW, cellH) * 0.38;
        const xMin = Math.min(x0, x1);
        const xFront = F.fx(u0), xRear = F.fx(uEnd);
        const span = xRear - xFront;
        ctx.fillStyle = cssA(dotInk, 0.97);
        for (let j = 0; j < rows; j++) {
          const cy = y0 + (j + 0.5) * cellH;
          for (let i = 0; i < cols; i++) {
            const cx = xMin + (i + 0.5) * cellW;
            const along = span !== 0 ? (cx - xFront) / span : 0;
            const t = 1 - Math.max(0, Math.min(1, along));
            const r = rMax * (0.38 + 0.62 * t * t);
            if (r < 0.4) continue;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      });
    } else if (spineSide === "slash") {
      eachFlank((F) => {
        const Sf = F.R;
        const crease = Sf.y + Sf.h * 0.08;
        const skew = Sf.h * 0.28 * F.dir;
        const hh = Sf.h * 0.58;
        const bw = Sf.w * (1 - sideFrom) * 0.14 * F.dir;
        ctx.save(); clipToRegion(ctx, Sf);
        ctx.fillStyle = cssA(flankBandC, 0.97);
        const x0 = su(F, 0.12);
        ctx.beginPath();
        ctx.moveTo(x0 + skew, crease);
        ctx.lineTo(x0 + skew + bw, crease);
        ctx.lineTo(x0 + skew * (1 - hh / Sf.h) + bw, crease + hh);
        ctx.lineTo(x0 + skew * (1 - hh / Sf.h), crease + hh);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      });
    }
    if (paintFlankBull) { paintFlankBull(); paintFlankBull = null; }
    if (paintDesign && SIDE_FILL[spineSide]) paintDesign();

    if (names.length) {
      fillRegion(ctx, REGIONS.titleA, board);
      const epPaint = Array.isArray(colors.endplate) && colors.endplate.length >= 3 ? colors.endplate : c2;
      fillRegion(ctx, REGIONS.fwEnd, epPaint);
      fillRegion(ctx, REGIONS.wing, colors.wing || c2);
      fillRegion(ctx, REGIONS.strip, c2);
      drawWordmark(ctx, names[0], REGIONS.titleA, inkPod,
        { align: "center", halo: haloIf(inkPod) });
      drawWordmark(ctx, names[1], REGIONS.titleB, inkNose,
        { align: "center", halo: haloIf(inkNose) });
      drawWordmark(ctx, names[4] || names[0], REGIONS.fwEnd, inkOn([epPaint]),
        { align: "center", spacing: 0.06, halo: haloIf(inkOn([epPaint])) });
      const inkWing = inkOn([colors.wing || c2]);
      drawWordmark(ctx, names[2], REGIONS.wing, inkWing,
        { align: "center", spacing: 0.1, halo: haloIf(inkWing) });
      drawWordmark(ctx, names[3] + "   " + names[4] + "   " + names[5],
        REGIONS.strip, inkStrip, { align: "center", spacing: 0.04, halo: haloIf(inkStrip) });
    }

    const num = resolveRaceNumber(numberOverride, teamId);
    if (typeof LiveryStations !== "undefined")
      LiveryStations.paint(ctx, REGIONS, { teamId, colors, c1, accent, names, num, fillRegion, drawWordmark, inkOn, haloIf });
    drawNumber(ctx, num, REGIONS.num, ink, accent, c1, colors.numFont, NUM_CREST_HEAD);
    const numBadge = numCrestBox(REGIONS.num);
    if (LOGOS[teamId]) {
      drawLogoImage(ctx, LOGOS[teamId], numBadge, logo,
                    markHalo(LOGOS[teamId], c1, ink), emblemRim);
    } else drawCrest(ctx, teamId, numBadge, { liv: colors, field: [c1, c2], bare: true, palette: lockup });

    return canvas;
  }

  function paintTeamMark(ctx, teamId, liv, R, field, opts) {
    const o = opts || {};
    const logo = liv && liv.logo;
    const outline = (liv && liv.logo3) || null;
    let bgs = [];
    if (field && field.length) bgs = (Array.isArray(field[0]) ? field : [field]).filter(Boolean);
    if (LOGOS[teamId]) {
      let tint = logo || null;
      let halo = o.halo || null;
      if (!tint && bgs.length && bgs.some((b) => lum(b) > 0.55)) {
        tint = pickOn(
          [liv && liv.c1, liv && liv.c2, INK_DARK, INK_LIGHT].filter(Boolean),
          bgs, 2.0);
      }
      drawLogoImage(ctx, LOGOS[teamId], R, tint, halo, outline);
      return;
    }
    const crestR = o.crestScale ? flankEmblemBox(R, teamId) : R;
    drawCrest(ctx, teamId, crestR, {
      liv, field, bare: !o.fullLockup,
      palette: markPalette(teamId, liv, field, false, { noPlate: !!o.noPlate }),
    });
  }

  const _swatchCache = new Map(), SWATCH_CACHE_MAX = 160, _swatchStats = { paints: 0, blits: 0, reused: 0 };
  markReady.push(() => { _swatchCache.clear(); _cardCanvas.clear(); });
  function paintSwatch(ctx, teamId, liv, w, h) {
    const fontsIn = typeof document !== "undefined" && (!document.fonts || document.fonts.status === "loaded");
    if (!fontsIn || typeof document.createElement !== "function") return paintSwatchNow(ctx, teamId, liv, w, h);
    const key = teamId + "|" + w + "x" + h + "|" + JSON.stringify(liv || null);
    let c = _swatchCache.get(key);
    if (!c) {
      c = document.createElement("canvas"); c.width = w; c.height = h;
      const cx = c.getContext && c.getContext("2d");
      if (!cx) return paintSwatchNow(ctx, teamId, liv, w, h);
      paintSwatchNow(cx, teamId, liv, w, h); _swatchStats.paints++;
      if (_swatchCache.size >= SWATCH_CACHE_MAX) _swatchCache.delete(_swatchCache.keys().next().value);
      _swatchCache.set(key, c);
    }
    ctx.drawImage(c, 0, 0); _swatchStats.blits++;
  }
  const _cardCanvas = new Map();
  function swatchCanvas(teamId, liv, w, h, build) {
    const fontsIn = typeof document !== "undefined" && (!document.fonts || document.fonts.status === "loaded");
    const key = teamId + "|" + w + "x" + h + "|" + JSON.stringify(liv || null);
    let c = fontsIn ? _cardCanvas.get(key) : null;
    if (c && c.__swatchBuild !== build) {
      c.__swatchBuild = build; _swatchStats.reused++;
      _cardCanvas.delete(key); _cardCanvas.set(key, c);
      return c;
    }
    c = document.createElement("canvas"); c.width = w; c.height = h;
    const cx = c.getContext && c.getContext("2d");
    if (cx) paintSwatch(cx, teamId, liv, w, h);
    c.__swatchBuild = build;
    if (fontsIn && cx && !_cardCanvas.has(key)) {
      if (_cardCanvas.size >= SWATCH_CACHE_MAX) _cardCanvas.delete(_cardCanvas.keys().next().value);
      _cardCanvas.set(key, c);
    }
    return c;
  }
  function swatchStats() { return { paints: _swatchStats.paints, blits: _swatchStats.blits, reused: _swatchStats.reused, cached: _swatchCache.size, cards: _cardCanvas.size }; }
  function paintSwatchNow(ctx, teamId, liv, w, h) {
    const c1 = (liv && liv.c1) || [0.20, 0.20, 0.22];
    const c2 = (liv && liv.c2) || c1;
    ctx.fillStyle = css(c1);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css(c2);
    ctx.fillRect(Math.round(w * 0.56), 0, w, h);
    if (liv && liv.stripe) {
      const sw = Math.max(4, Math.round(w * 0.08));
      ctx.fillStyle = css(liv.stripe);
      ctx.fillRect(Math.round(w * 0.5 - sw / 2), 0, sw, h);
    }
    const pad = Math.round(Math.min(w, h) * 0.08);
    const R = { x: pad, y: pad, w: w - pad * 2, h: Math.round(h * 0.78) };
    paintTeamMark(ctx, teamId, liv, R, [c1, c2], {});
  }

  return { SIZE, SIZE_H, atlasDiv, playerHiResDeferred, IS_MOBILE, IS_PHONE, atlasMobile, REGIONS, SPONSORS, SPONSOR_PACKS, buildAtlas, drawCrest, markBase, markPalette,
           MARK_FLOOR, numCrestBox, paintTeamMark, paintSwatch, swatchCanvas, swatchStats,
           drawLogoImage, contrast, inkOn, onMarkChange, markSlots, setTeamLogo, LOGOS,
           markOnField, ALT_INSIDE, sunColour, FLANK, FLANK_H, FLANK_MARK, flankMarkStation, FLANK_SEEN,
           CRESTS, crestKeepsPlate, CREST_MARGIN, STROKE_MIN, TEXT_MIN,
           NUM_FONT_IDS, SPONSOR_PACK_IDS, TAIL_STYLE_IDS, tailStyleOf, CREST_STYLE_IDS: EMBLEM_IDS, CREST_TONE_IDS, CREST_FRAME_IDS, FIN_BADGE_IDS, SPINE_LOGO_IDS, SPINE_SIDE_IDS,
           FILL_SURFACES, fillInert,
           airboxMeshColour, resolveFinPaint, driverCode,
           hasFlankBull: (teamId) => !!bullPath(teamId) };
})();
if (typeof window !== "undefined") window.LiveryTex = LiveryTex;
