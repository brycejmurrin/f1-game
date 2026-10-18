/* Apex 26 — CvdPalette: the one JS table of semantic colours.
   AppearanceOpts.setCvdMode calls set(). "off" matches the :root tokens so a
   player who never opens COLOUR VISION sees no change. Deuteranopia and
   protanopia share one blue/orange/sand table; tritanopia uses a red/teal
   table. Both were tuned so co-visible states stay apart under the Machado
   2009 simulation (severity 1.0, linear RGB) at CIEDE2000 >= 10 for the
   mode's own type. Display only: it never reads the racing line or the car. */
const CvdPalette = (function () {
  "use strict";

  const MODES = ["off", "deutan", "protan", "tritan"];
  // Machado, Oliveira & Fernandes 2009, severity 1.0, applied to linear RGB.
  // https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
  const MACHADO = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
  };
  // off = today's sources (tokens.css :root, hud.js canvas literals, hub.js compounds,
  // track-maps metals). deutan === protan. Keys are the semantic states.
  const STATE = {
    good:  { off: "#a3e635", deutan: "#4aa3ff", protan: "#4aa3ff", tritan: "#00e0c0" },
    ok:    { off: "#a3e635", deutan: "#4aa3ff", protan: "#4aa3ff", tritan: "#00e0c0" },
    warn:  { off: "#f6d200", deutan: "#ddcc77", protan: "#ddcc77", tritan: "#ffe56a" },
    bad:   { off: "#ff3b30", deutan: "#ee7733", protan: "#ee7733", tritan: "#ff9eb0" },
    best:  { off: "#dfa3ff", deutan: "#c8f4ff", protan: "#c8f4ff", tritan: "#e8fff4" },
    you:   { off: "#aeea00", deutan: "#ff9ec8", protan: "#ff9ec8", tritan: "#ff5c96" },
    info:  { off: "#78c8ff", deutan: "#9ec8ff", protan: "#9ec8ff", tritan: "#ffd0e0" },
    zone:  { off: "#26a5f5", deutan: "#7ec8ff", protan: "#7ec8ff", tritan: "#00e0c0" },
    ghost: { off: "#78dcff", deutan: "#ffffff", protan: "#ffffff", tritan: "#ffffff" },
    sec1:  { off: "#ffd700", deutan: "#4aa3ff", protan: "#4aa3ff", tritan: "#00e0c0" },
    sec2:  { off: "#c0c0c0", deutan: "#ddcc77", protan: "#ddcc77", tritan: "#ffe56a" },
    sec3:  { off: "#cd9b5a", deutan: "#ff9ec8", protan: "#ff9ec8", tritan: "#ff5c96" },
    cmpS:  { off: "#e8002d", deutan: "#ee7733", protan: "#ee7733", tritan: "#ff9eb0" },
    cmpM:  { off: "#f6d200", deutan: "#ddcc77", protan: "#ddcc77", tritan: "#ffe56a" },
    cmpH:  { off: "#f0f0f0", deutan: "#ffffff", protan: "#ffffff", tritan: "#ffffff" },
    cmpI:  { off: "#3fb950", deutan: "#7dffc0", protan: "#7dffc0", tritan: "#00e0c0" },
    cmpW:  { off: "#1e90ff", deutan: "#4aa3ff", protan: "#4aa3ff", tritan: "#ff5c96" },
  };
  // States that can sit in one view. The test requires dE00 >= 10 under the
  // mode's own simulation and >= 6 under the other two.
  const COVISIBLE = {
    deutan: [["good", "warn", "bad", "best", "you"], ["sec1", "sec2", "sec3"], ["cmpS", "cmpM", "cmpH", "cmpI", "cmpW"], ["zone", "ghost", "you"]],
    protan: [["good", "warn", "bad", "best", "you"], ["sec1", "sec2", "sec3"], ["cmpS", "cmpM", "cmpH", "cmpI", "cmpW"], ["zone", "ghost", "you"]],
    tritan: [["good", "warn", "bad", "best", "you"], ["sec1", "sec2", "sec3"], ["cmpS", "cmpM", "cmpH", "cmpI", "cmpW"], ["zone", "ghost", "you"]],
  };
  const CSS_OF = { good: "--faster", warn: "--sec-slow", bad: "--slower", best: "--sec-best", you: "--you", zone: "--zone", ghost: "--ghost" };

  function normalize(v) {
    const s = String(v == null ? "" : v);
    return MODES.indexOf(s) >= 0 ? s : "off";
  }
  let mode = "off";
  try {
    if (typeof GameStore !== "undefined" && GameStore.store) mode = normalize(GameStore.store.get("cvdMode", "off"));
  } catch (_) { /* harness without a store */ }
  const listeners = [];

  function hex(key) {
    const row = STATE[key];
    return row ? row[mode] : "";
  }
  function rgb01(key) {
    const h = hex(key);
    if (!/^#[0-9a-fA-F]{6}$/.test(h)) return [0, 0, 0];
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function css(key) { return hex(key); }

  function paint() {
    const el = typeof document !== "undefined" ? document.documentElement : null;
    if (!el || !el.style || !el.style.setProperty) return;
    const names = ["--faster", "--slower", "--sec-slow", "--sec-best", "--you", "--zone", "--ghost"];
    if (mode === "off") {
      for (let i = 0; i < names.length; i++) el.style.removeProperty(names[i]);
      return;
    }
    el.style.setProperty("--faster", hex("good"));
    el.style.setProperty("--slower", hex("bad"));
    el.style.setProperty("--sec-slow", hex("warn"));
    el.style.setProperty("--sec-best", hex("best"));
    el.style.setProperty("--you", hex("you"));
    el.style.setProperty("--zone", hex("zone"));
    el.style.setProperty("--ghost", hex("ghost"));
  }
  function set(next) {
    mode = normalize(next);
    paint();
    for (let i = 0; i < listeners.length; i++) listeners[i](mode);
    return mode;
  }
  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
  }

  function srgbToLinear(v) {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(v) {
    const c = v < 0 ? 0 : v > 1 ? 1 : v;
    return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }
  function simulateLinear(rgb01in, type) {
    const m = MACHADO[type];
    if (!m || !rgb01in) return [0, 0, 0];
    const lin = [srgbToLinear(rgb01in[0]), srgbToLinear(rgb01in[1]), srgbToLinear(rgb01in[2])];
    return [0, 1, 2].map(function (i) {
      const v = m[i][0] * lin[0] + m[i][1] * lin[1] + m[i][2] * lin[2];
      return v < 0 ? 0 : v > 1 ? 1 : v;
    });
  }
  function simulate(rgb01in, type) {
    return simulateLinear(rgb01in, type).map(linearToSrgb);
  }
  function labFromLinear(rgb) {
    const X = 0.4124564 * rgb[0] + 0.3575761 * rgb[1] + 0.1804375 * rgb[2];
    const Y = 0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.0721750 * rgb[2];
    const Z = 0.0193339 * rgb[0] + 0.1191920 * rgb[1] + 0.9503041 * rgb[2];
    const f = function (t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116; };
    const fy = f(Y / 1);
    return [116 * fy - 16, 500 * (f(X / 0.95047) - fy), 200 * (fy - f(Z / 1.08883))];
  }
  // CIEDE2000 (Sharma, Wu & Dalal 2005). Inputs are CIE L*a*b* triples.
  function dE2000(lab1, lab2) {
    const L1 = lab1[0], a1 = lab1[1], b1 = lab1[2], L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
    const rad = Math.PI / 180;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cb = (C1 + C2) / 2, Cb7 = Math.pow(Cb, 7);
    const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + Math.pow(25, 7))));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const hp = function (ap, b) {
      if (ap === 0 && b === 0) return 0;
      let h = Math.atan2(b, ap) / rad;
      if (h < 0) h += 360;
      return h;
    };
    const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
    let dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp;
    if (C1p * C2p === 0) hbp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
    else hbp = (h1p + h2p - 360) / 2;
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos((2 * hbp) * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const Sc = 1 + 0.045 * Cbp;
    const Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin(2 * dTheta * rad) * Rc;
    const dLp = L2 - L1, dCp = C2p - C1p;
    return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
  }

  paint();

  return {
    MODES: MODES, STATE: STATE, COVISIBLE: COVISIBLE, CSS_OF: CSS_OF, MACHADO: MACHADO,
    mode: function () { return mode; },
    set: set, hex: hex, rgb01: rgb01, css: css, onChange: onChange,
    simulate: simulate, simulateLinear: simulateLinear, labFromLinear: labFromLinear, dE2000: dE2000,
  };
})();
Object.freeze(CvdPalette);
