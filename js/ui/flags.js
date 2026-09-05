/* Apex 26 — national flags as inline SVG, for the circuit picker's flag strip
   and the hero caption beside a circuit's name. Drawn from a recipe table, not
   shipped as images: twenty-nine 3:2 flags reduce to stripes, a canton, a disc,
   a crescent and a star or two, which is a few hundred bytes of geometry each
   and paints crisp at every UI SIZE and pixel ratio. Emoji flags were the
   obvious alternative and were rejected — Windows renders them as two letters.
   Every flag is a SIMPLIFIED rendering (no coat of arms, no shahada text, a
   dot for a small star) — legible at 40 px, which is the size that matters.
   Pure functions, no DOM state. Consumers: js/ui/select-screen.js. */
const Flags = (function () {
  "use strict";

  // country as written in js/circuits/<id>.js -> ISO 3166-1 alpha-2
  const CODES = {
    "UAE": "ae", "United Arab Emirates": "ae",
    "Australia": "au", "Bahrain": "bh", "Azerbaijan": "az", "Argentina": "ar",
    "Spain": "es", "USA": "us", "United States": "us", "Portugal": "pt",
    "Germany": "de", "Hungary": "hu", "Italy": "it", "Brazil": "br",
    "Turkey": "tr", "Türkiye": "tr", "Saudi Arabia": "sa", "South Africa": "za",
    "France": "fr", "Mexico": "mx", "Monaco": "mc", "Canada": "ca", "Japan": "jp",
    "Malaysia": "my", "China": "cn", "UK": "gb", "United Kingdom": "gb", "Great Britain": "gb",
    "Singapore": "sg", "Russia": "ru", "Belgium": "be", "Qatar": "qa",
    "Austria": "at", "Netherlands": "nl", "Holland": "nl",
  };

  // ---- geometry helpers (viewBox 0 0 60 40) --------------------------------
  const W = 60, H = 40;
  const n2 = (v) => Math.round(v * 100) / 100;
  const rect = (x, y, w, h, c, rx) =>
    '<rect x="' + n2(x) + '" y="' + n2(y) + '" width="' + n2(w) + '" height="' + n2(h) + '" fill="' + c + '"' + (rx ? ' rx="' + rx + '"' : "") + "/>";
  const circle = (cx, cy, r, c) => '<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(r) + '" fill="' + c + '"/>';
  const poly = (pts, c) => '<polygon points="' + pts.map((p) => n2(p[0]) + "," + n2(p[1])).join(" ") + '" fill="' + c + '"/>';
  const line = (x1, y1, x2, y2, c, w) =>
    '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + c + '" stroke-width="' + w + '"/>';
  // Equal horizontal / vertical bands; `weights` for the 1:2:1 tricolours.
  const bands = (cols, horizontal, weights) => {
    const ws = weights || cols.map(() => 1);
    const total = ws.reduce((a, b) => a + b, 0);
    let at = 0, out = "";
    cols.forEach((c, i) => {
      const span = (horizontal ? H : W) * ws[i] / total;
      out += horizontal ? rect(0, at, W, span, c) : rect(at, 0, span, H, c);
      at += span;
    });
    return out;
  };
  const hbands = (cols, weights) => bands(cols, true, weights);
  const vbands = (cols, weights) => bands(cols, false, weights);
  // A five-point star (the outer radius is r; inner radius is the golden 0.382).
  const star = (cx, cy, r, c, points) => {
    const n = points || 5, pts = [];
    for (let i = 0; i < n * 2; i++) {
      const rad = i % 2 ? r * 0.382 : r;
      const a = -Math.PI / 2 + i * Math.PI / n;
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
    return poly(pts, c);
  };
  // A crescent: the disc, then the background disc cut back in.
  const crescent = (cx, cy, r, c, bg, dir) =>
    circle(cx, cy, r, c) + circle(cx + (dir || 1) * r * 0.3, cy, r * 0.82, bg);
  // The serrated hoist band of Bahrain and Qatar: `teeth` white triangles.
  const serrated = (w, depth, teeth, c) => {
    const pts = [[0, 0], [w, 0]];
    const step = H / teeth;
    for (let i = 0; i < teeth; i++) pts.push([w + depth, step * (i + 0.5)], [w, step * (i + 1)]);
    pts.push([0, H]);
    return poly(pts, c);
  };
  // The Union Flag, drawn into a box (the UK itself and Australia's canton).
  const union = (w, h) => {
    const s = w / W;
    return rect(0, 0, w, h, "#012169")
      + line(0, 0, w, h, "#fff", 6 * s) + line(w, 0, 0, h, "#fff", 6 * s)
      + line(0, 0, w, h, "#c8102e", 2 * s) + line(w, 0, 0, h, "#c8102e", 2 * s)
      + rect(w / 2 - 5 * s, 0, 10 * s, h, "#fff") + rect(0, h / 2 - 5 * s, w, 10 * s, "#fff")
      + rect(w / 2 - 3 * s, 0, 6 * s, h, "#c8102e") + rect(0, h / 2 - 3 * s, w, 6 * s, "#c8102e");
  };
  const stripes = (n, a, b) => {
    let out = "";
    for (let i = 0; i < n; i++) out += rect(0, H * i / n, W, H / n + 0.05, i % 2 ? b : a);
    return out;
  };

  // ---- the recipes ----------------------------------------------------------
  const RECIPES = {
    ae: () => hbands(["#00732f", "#fff", "#000"]) + rect(0, 0, 15, H, "#ff0000"),
    au: () => rect(0, 0, W, H, "#00008b") + union(30, 20)
      + star(15, 30, 4.2, "#fff", 7)
      + star(45, 8, 1.6, "#fff") + star(51.5, 15, 1.7, "#fff") + star(40.5, 17.5, 1.6, "#fff")
      + star(52, 23, 1.6, "#fff") + star(47, 29, 2, "#fff"),
    bh: () => rect(0, 0, W, H, "#ce1126") + serrated(15, 5, 5, "#fff"),
    az: () => hbands(["#0092bc", "#e4002b", "#00ae65"]) + crescent(29, 20, 5, "#fff", "#e4002b") + star(35, 20, 2.2, "#fff", 8),
    ar: () => hbands(["#74acdf", "#fff", "#74acdf"]) + circle(30, 20, 3.4, "#f6b40e"),
    es: () => hbands(["#aa151b", "#f1bf00", "#aa151b"], [1, 2, 1]),
    us: () => stripes(13, "#b22234", "#fff") + rect(0, 0, 24, 21.55, "#3c3b6e")
      + [4, 12, 20].map((x) => [4, 11, 18].map((y) => circle(x, y, 1.1, "#fff")).join("")).join("")
      + [8, 16].map((x) => [7.5, 14.5].map((y) => circle(x, y, 1.1, "#fff")).join("")).join(""),
    pt: () => rect(0, 0, 24, H, "#006600") + rect(24, 0, 36, H, "#ff0000") + circle(24, 20, 6.5, "#ffe000") + circle(24, 20, 3.6, "#ff0000") + circle(24, 20, 2.2, "#fff"),
    de: () => hbands(["#000", "#dd0000", "#ffce00"]),
    hu: () => hbands(["#ce2939", "#fff", "#477050"]),
    it: () => vbands(["#009246", "#fff", "#ce2b37"]),
    br: () => rect(0, 0, W, H, "#009c3b") + poly([[30, 3.5], [55.5, 20], [30, 36.5], [4.5, 20]], "#ffdf00")
      + circle(30, 20, 8.6, "#002776") + '<path d="M22.2 21.4 Q30 16.8 37.9 19.2" stroke="#fff" stroke-width="1.6" fill="none"/>',
    tr: () => rect(0, 0, W, H, "#e30a17") + crescent(24, 20, 9, "#fff", "#e30a17") + star(36.5, 20, 4, "#fff"),
    sa: () => rect(0, 0, W, H, "#006c35") + rect(15, 12.5, 30, 5.5, "#fff", 1.5) + rect(15, 25.5, 30, 2.4, "#fff", 1.2) + rect(43, 24, 3.5, 5.4, "#fff", 1),
    za: () => rect(0, 0, W, H, "#e03c31") + rect(0, 20, W, 20, "#001489")
      + poly([[0, 0], [8, 0], [31, 14], [60, 14], [60, 26], [31, 26], [8, 40], [0, 40], [0, 33], [21, 20], [0, 7]], "#fff")
      + poly([[0, 4], [7, 4], [32, 17], [60, 17], [60, 23], [32, 23], [7, 36], [0, 36], [0, 30], [17, 20], [0, 10]], "#007a4d")
      + poly([[0, 6], [21.5, 20], [0, 34]], "#ffb81c") + poly([[0, 10], [15.5, 20], [0, 30]], "#000"),
    fr: () => vbands(["#0055a4", "#fff", "#ef4135"]),
    mx: () => vbands(["#006847", "#fff", "#ce1126"]) + circle(30, 20, 3.8, "#8a6d3b") + circle(30, 21, 1.6, "#006847"),
    mc: () => hbands(["#ce1126", "#fff"]),
    ca: () => vbands(["#ff0000", "#fff", "#ff0000"], [1, 2, 1])
      + poly([[30, 8], [32, 14], [36.5, 12.5], [34.5, 19], [40.5, 22], [33, 24], [34, 30.5], [30, 27], [26, 30.5], [27, 24], [19.5, 22], [25.5, 19], [23.5, 12.5], [28, 14]], "#ff0000"),
    jp: () => rect(0, 0, W, H, "#fff") + circle(30, 20, 12, "#bc002d"),
    my: () => stripes(14, "#cc0001", "#fff") + rect(0, 0, 30, 22.9, "#010066") + crescent(12, 11.5, 6.5, "#ffcc00", "#010066") + star(21.5, 11.5, 3.6, "#ffcc00", 14),
    cn: () => rect(0, 0, W, H, "#de2910") + star(10, 10, 6, "#ffde00")
      + star(20, 4, 1.9, "#ffde00") + star(24, 8, 1.9, "#ffde00") + star(24, 13.5, 1.9, "#ffde00") + star(20, 17.5, 1.9, "#ffde00"),
    gb: () => union(W, H),
    sg: () => hbands(["#ef3340", "#fff"]) + crescent(11.5, 10, 6, "#fff", "#ef3340")
      + [[18, 5.5], [21.5, 8.2], [20.2, 12.5], [15.8, 12.5], [14.5, 8.2]].map((p) => circle(p[0], p[1], 0.95, "#fff")).join(""),
    ru: () => hbands(["#fff", "#0039a6", "#d52b1e"]),
    be: () => vbands(["#000", "#fdda24", "#ef3340"]),
    qa: () => rect(0, 0, W, H, "#8a1538") + serrated(17, 5, 9, "#fff"),
    at: () => hbands(["#ed2939", "#fff", "#ed2939"]),
    nl: () => hbands(["#ae1c28", "#fff", "#21468b"]),
    // The unknown-country fallback: a chequered flag, so a new circuit whose
    // country is not in CODES still gets a tile that reads as "a circuit".
    xx: () => rect(0, 0, W, H, "#fff") + [0, 1, 2, 3, 4, 5].map((i) => [0, 1, 2, 3].map((j) =>
      (i + j) % 2 ? rect(i * 10, j * 10, 10, 10, "#111") : "").join("")).join(""),
  };

  const cache = {};
  function code(country) {
    return CODES[String(country || "").trim()] || null;
  }
  // Inline SVG markup for a country CODE ("gb") or a country NAME ("UK").
  // Decorative by default (aria-hidden): the circuit's name sits beside it as
  // text. Pass `{label}` for a labelled, role=img rendering.
  function svg(codeOrCountry, opts) {
    const c = RECIPES[codeOrCountry] ? codeOrCountry : (code(codeOrCountry) || "xx");
    const inner = cache[c] || (cache[c] = RECIPES[c]());
    const a11y = opts && opts.label
      ? ' role="img" aria-label="' + String(opts.label).replace(/"/g, "&quot;") + '"'
      : ' aria-hidden="true"';
    return '<svg data-flag="' + c + '" viewBox="0 0 60 40" preserveAspectRatio="none" focusable="false"' + a11y + ">" + inner + "</svg>";
  }
  function codes() { return Object.keys(RECIPES).filter((c) => c !== "xx"); }
  function countries() { return Object.keys(CODES); }

  return { code, svg, codes, countries };
})();
