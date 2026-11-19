const Helmets = (function () {
  "use strict";

  const C = {
    white:  [0.93, 0.94, 0.96], bone:   [0.86, 0.84, 0.78], silver: [0.66, 0.69, 0.74],
    black:  [0.07, 0.07, 0.08], carbon: [0.13, 0.14, 0.16], graphite: [0.24, 0.25, 0.28],
    red:    [0.85, 0.09, 0.11], crimson:[0.62, 0.05, 0.10], coral:  [0.95, 0.35, 0.30],
    orange: [0.98, 0.45, 0.05], papaya: [1.00, 0.50, 0.00], amber:  [0.95, 0.65, 0.10],
    yellow: [0.98, 0.84, 0.10], gold:   [0.83, 0.68, 0.22], lime:   [0.78, 0.92, 0.15],
    green:  [0.10, 0.60, 0.25], forest: [0.05, 0.35, 0.20], mint:   [0.35, 0.85, 0.55],
    teal:   [0.00, 0.71, 0.67], cyan:   [0.20, 0.80, 0.88], sky:    [0.45, 0.75, 0.95],
    blue:   [0.10, 0.35, 0.85], navy:   [0.05, 0.10, 0.32], royal:  [0.15, 0.25, 0.70],
    purple: [0.45, 0.20, 0.70], violet: [0.62, 0.35, 0.85], pink:   [0.95, 0.45, 0.72],
  };

  const dAz = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
  const inAz = (az, a0, a1) => {
    const s = ((a0 % 360) + 360) % 360, e = ((a1 % 360) + 360) % 360, p = ((az % 360) + 360) % 360;
    return s <= e ? (p >= s && p <= e) : (p >= s || p <= e);
  };
  const ZONES = {
    cap: (z, t) => t <= z.t1,
    band: (z, t) => t >= z.t0 && t <= z.t1,
    stripe: (z, t, az) => dAz(az, z.az) <= z.w,
    wedge: (z, t, az) => inAz(az, z.az0, z.az1),
    chevron: (z, t, az) => t >= z.t0 && t <= z.t1 &&
      dAz(az, z.az) <= z.w * (0.15 + 0.85 * (t - z.t0) / Math.max(1e-3, z.t1 - z.t0)),
    spot: (z, t, az) => {
      const lat = Math.max(0.15, Math.sin(t * Math.PI / 2));
      const x = dAz(az, z.az) / 90 * lat, y = t - z.t;
      return x * x + y * y <= z.r * z.r;
    },
    patch: (z, t, az) => t >= z.t0 && t <= z.t1 && dAz(az, z.az) <= z.w,
    flash: (z, t, az) => {
      if (t < z.t0 || t > z.t1) return false;
      const f = (t - z.t0) / Math.max(1e-3, z.t1 - z.t0);
      return dAz(az, z.az + z.sweep * f) <= z.w0 + (z.w1 - z.w0) * f;
    },
    mottle: (z, t, az) => {
      if (t < z.t0 || t > z.t1) return false;
      const th = (((az % 360) + 360) % 360) * Math.PI / 180, u = t * Math.PI, k = z.seed;
      const f = Math.sin(z.sc * th + 3.06 * u + k)
              + Math.sin((z.sc + 2) * th - 1.98 * u + 1.7 * k + 1.1)
              + 0.8 * Math.sin((z.sc - 1) * th + 5.40 * u + 0.7 * k + 4.2)
              + 0.7 * Math.sin((z.sc + 4) * th + 1.26 * u + 1.3 * k + 2.4);
      return Math.abs(f) < z.w;
    },
  };

  const RINGS = 20, SLICES = 28;
  const FIELD_RINGS = 12, FIELD_SLICES = 18;
  const ringT = (i) => Math.pow(i / RINGS, 1.25);
  const RING_TS = Array.from({ length: RINGS + 1 }, (_, i) => ringT(i));
  const snapT = (t) => RING_TS.reduce((a, v) => (Math.abs(v - t) < Math.abs(a - t) ? v : a), RING_TS[0]);
  const snapBand = (t0, t1) => {
    let a = snapT(t0), b = snapT(t1);
    if (b <= a) { const i = RING_TS.indexOf(a); b = RING_TS[Math.min(RING_TS.length - 1, i + 1)]; }
    return [a, b];
  };
  const z = {
    cap: (t1, c) => ({ k: "cap", t1: snapT(t1), c }),
    band: (t0, t1, c) => { const b = snapBand(t0, t1); return { k: "band", t0: b[0], t1: b[1], c }; },
    stripe: (az, w, c) => ({ k: "stripe", az, w, c }),
    wedge: (az0, az1, c) => ({ k: "wedge", az0, az1, c }),
    chevron: (az, w, t0, t1, c) => ({ k: "chevron", az, w, t0, t1, c }),
    spot: (az, t, r, c) => ({ k: "spot", az, t, r, c }),
    patch: (az, w, t0, t1, c) => ({ k: "patch", az, w, t0, t1, c }),
    flash: (az, w0, w1, t0, t1, sweep, c) => ({ k: "flash", az, w0, w1, t0, t1, sweep, c }),
    mottle: (t0, t1, sc, w, seed, c) => ({ k: "mottle", t0, t1, sc, w, seed, c }),
    key: (t, c) => { const b = snapBand(t, t + 0.055); return { k: "band", t0: b[0], t1: b[1], c }; },
    sides: (f) => [f(90), f(270)],
  };
  const centre = (w, c) => [z.stripe(0, w, c), z.stripe(180, w, c)];

  const DESIGNS = {
    63: { name: "RUS", base: C.sky, alt: C.white, visor: C.black, zones: [
      z.band(0.56, 0.955, C.navy), z.key(0.505, C.white), z.patch(180, 34, 0.16, 0.40, C.navy),
      ...z.sides((a) => z.flash(a, 8, 20, 0.10, 0.55, 24, C.white)), ...centre(9, C.white), z.key(0.90, C.sky)] },
    12: { name: "ANT", base: C.royal, alt: C.sky, visor: C.silver, zones: [
      z.cap(0.20, C.white), z.key(0.20, C.carbon), z.flash(0, 10, 46, 0.14, 0.44, 0, C.orange),
      z.flash(0, 5, 24, 0.14, 0.44, 0, C.white), ...z.sides((a) => z.patch(a, 22, 0.26, 0.40, C.white)),
      z.band(0.70, 0.80, C.white), z.key(0.80, C.carbon), z.band(0.88, 0.955, C.orange)] },
    16: { name: "LEC", base: C.white, alt: C.navy, visor: C.black, zones: [
      z.cap(0.42, C.red), z.key(0.420, C.black), ...z.sides((a) => z.flash(a, 6, 16, 0.10, 0.39, 24, C.white)),
      z.band(0.68, 0.76, C.black), z.key(0.76, C.red), ...centre(7, C.black), z.band(0.90, 0.955, C.red)] },
    44: { name: "HAM", base: C.yellow, alt: C.violet, visor: C.black, zones: [
      ...centre(10, C.white), ...z.sides((a) => z.flash(a, 5, 14, 0.08, 0.42, 24, C.black)),
      z.band(0.68, 0.74, C.black), z.key(0.74, C.white), z.band(0.90, 0.955, C.red)] },
     1: { name: "NOR", base: C.lime, alt: C.cyan, visor: C.black, zones: [
      z.mottle(0.06, 0.95, 5, 0.48, 3, C.black), z.cap(0.09, C.black),
      ...z.sides((a) => z.patch(a, 13, 0.20, 0.60, C.black)),
      z.key(0.74, C.papaya), z.band(0.86, 0.92, C.black), z.key(0.92, C.papaya)] },
    81: { name: "PIA", base: C.carbon, alt: C.teal, visor: C.amber, zones: [
      z.cap(0.13, C.papaya), z.key(0.13, C.lime), z.flash(0, 8, 30, 0.14, 0.42, 0, C.papaya),
      ...z.sides((a) => z.flash(a, 6, 16, 0.16, 0.58, 24, C.papaya)),
      z.band(0.78, 0.88, C.lime), z.key(0.745, C.papaya), z.band(0.90, 0.955, C.papaya)] },
     3: { name: "VER", base: C.royal, alt: C.orange, visor: C.black, zones: [
      z.cap(0.22, C.red), z.key(0.22, C.white), z.flash(0, 12, 46, 0.16, 0.44, 0, C.navy),
      ...z.sides((a) => z.flash(a, 9, 24, 0.18, 0.62, 24, C.navy)),
      z.band(0.68, 0.80, C.white), z.key(0.625, C.navy), z.band(0.88, 0.955, C.navy)] },
     6: { name: "HAD", base: C.white, alt: C.royal, visor: C.black, zones: [
      z.cap(0.42, C.carbon), z.key(0.42, C.lime), z.flash(0, 10, 34, 0.16, 0.40, 0, C.lime),
      ...z.sides((a) => z.flash(a, 8, 20, 0.16, 0.40, 24, C.lime)),
      z.band(0.66, 0.86, C.carbon), z.key(0.605, C.lime), z.band(0.88, 0.955, C.navy)] },
    10: { name: "GAS", base: C.sky, alt: C.white, visor: C.silver, zones: [
      z.mottle(0.04, 0.58, 6, 0.40, 7, C.white), z.band(0.60, 0.90, C.navy), z.key(0.545, C.white),
      ...z.sides((a) => z.flash(a, 7, 18, 0.14, 0.57, 24, C.white)), ...centre(8, C.white),
      z.band(0.90, 0.955, C.pink)] },
    43: { name: "COL", base: C.white, alt: C.crimson, visor: C.black, zones: [
      z.band(0.24, 0.40, C.sky), z.key(0.185, C.navy), z.key(0.40, C.navy),
      ...z.sides((a) => z.flash(a, 6, 16, 0.12, 0.39, 24, C.pink)), ...centre(10, C.pink),
      z.band(0.68, 0.82, C.navy), z.key(0.82, C.sky), z.band(0.90, 0.955, C.navy)] },
    30: { name: "LAW", base: C.pink, alt: C.forest, visor: C.silver, zones: [
      z.cap(0.16, C.white), z.key(0.16, C.navy), ...z.sides((a) => z.flash(a, 8, 22, 0.16, 0.60, 24, C.white)),
      z.band(0.66, 0.88, C.white), z.key(0.605, C.navy), ...centre(7, C.navy), z.band(0.88, 0.955, C.navy)] },
    41: { name: "LIN", base: C.sky, alt: C.crimson, visor: C.black, zones: [
      z.cap(0.24, C.navy), z.key(0.24, C.gold), ...z.sides((a) => z.flash(a, 7, 20, 0.16, 0.58, 24, C.navy)),
      ...centre(9, C.gold), z.band(0.70, 0.84, C.white), z.key(0.84, C.navy), z.band(0.90, 0.955, C.navy)] },
    31: { name: "OCO", base: C.red, alt: C.white, visor: C.black, zones: [
      z.cap(0.16, C.carbon), z.key(0.16, C.white), ...z.sides((a) => z.flash(a, 8, 22, 0.18, 0.62, 24, C.carbon)),
      ...centre(10, C.white), z.band(0.72, 0.88, C.carbon), z.key(0.665, C.white), z.band(0.90, 0.955, C.white)] },
    87: { name: "BEA", base: C.royal, alt: C.coral, visor: C.black, zones: [
      z.cap(0.16, C.carbon), z.key(0.16, C.lime), z.flash(0, 9, 32, 0.12, 0.42, 0, C.lime),
      ...z.sides((a) => z.flash(a, 7, 16, 0.16, 0.58, 24, C.lime)),
      z.band(0.66, 0.86, C.white), z.key(0.605, C.carbon), z.band(0.88, 0.955, C.carbon)] },
    55: { name: "SAI", base: C.navy, alt: C.mint, visor: C.black, zones: [
      z.flash(0, 9, 30, 0.14, 0.42, 0, C.yellow), z.flash(0, 4, 13, 0.14, 0.42, 0, C.red),
      ...z.sides((a) => z.flash(a, 7, 16, 0.16, 0.60, 24, C.yellow)),
      z.band(0.66, 0.86, C.white), z.key(0.605, C.royal), z.band(0.88, 0.955, C.navy)] },
    23: { name: "ALB", base: C.white, alt: C.forest, visor: C.gold, zones: [
      z.cap(0.22, C.pink), z.key(0.22, C.navy), z.flash(0, 10, 38, 0.14, 0.44, 0, C.royal),
      ...z.sides((a) => z.flash(a, 8, 20, 0.16, 0.60, 24, C.pink)),
      z.band(0.72, 0.86, C.navy), z.key(0.665, C.pink), z.band(0.90, 0.955, C.white)] },
    27: { name: "HUL", base: C.graphite, alt: C.white, visor: C.black, zones: [
      z.cap(0.10, C.black), z.flash(0, 10, 34, 0.12, 0.44, 0, C.green),
      ...z.sides((a) => z.flash(a, 7, 18, 0.16, 0.60, 24, C.green)),
      z.mottle(0.10, 0.62, 11, 0.12, 11, C.white), z.band(0.84, 0.955, C.green), z.key(0.785, C.white)] },
     5: { name: "BOR", base: C.white, alt: C.crimson, visor: C.black, zones: [
      z.cap(0.17, C.green), z.key(0.17, C.yellow),
      ...z.sides((a) => z.flash(a, 8, 20, 0.16, 0.60, 24, C.carbon)),
      z.band(0.68, 0.86, C.carbon), z.key(0.625, C.yellow), z.band(0.88, 0.955, C.green)] },
    14: { name: "ALO", base: C.cyan, alt: C.crimson, visor: C.gold, zones: [
      z.cap(0.20, C.navy), z.band(0.24, 0.38, C.yellow), z.key(0.185, C.yellow), z.key(0.38, C.navy),
      ...z.sides((a) => z.flash(a, 8, 20, 0.16, 0.60, 24, C.gold)),
      z.band(0.66, 0.84, C.white), z.key(0.605, C.navy), z.band(0.88, 0.955, C.navy)] },
    18: { name: "STR", base: C.carbon, alt: C.coral, visor: C.black, zones: [
      z.cap(0.14, C.forest), z.key(0.14, C.silver), ...centre(11, C.forest),
      ...z.sides((a) => z.flash(a, 7, 18, 0.16, 0.60, 24, C.forest)),
      z.band(0.68, 0.80, C.forest), z.key(0.80, C.silver), z.band(0.90, 0.955, C.silver)] },
    11: { name: "PER", base: C.lime, alt: C.royal, visor: C.black, zones: [
      z.cap(0.22, C.black), z.key(0.22, C.white), z.flash(0, 12, 40, 0.18, 0.46, 0, C.black),
      ...z.sides((a) => z.flash(a, 9, 24, 0.18, 0.62, 24, C.black)),
      z.band(0.70, 0.84, C.black), z.key(0.645, C.navy), z.band(0.88, 0.955, C.navy)] },
    77: { name: "BOT", base: C.royal, alt: C.amber, visor: C.silver, zones: [
      z.cap(0.26, C.black), z.key(0.26, C.sky), z.flash(0, 14, 50, 0.14, 0.46, 0, C.black),
      ...z.sides((a) => z.flash(a, 12, 30, 0.16, 0.64, 24, C.black)),
      z.band(0.66, 0.88, C.black), z.key(0.605, C.sky), z.band(0.88, 0.955, C.sky)] },
  };

  const WHEEL = [C.red, C.blue, C.yellow, C.white, C.green, C.violet, C.orange, C.cyan, C.pink, C.lime, C.teal, C.crimson];
  const pick = (n, off) => WHEEL[(((n * 7 + off * 5) % WHEEL.length) + WHEEL.length) % WHEEL.length];
  function generated(num, name) {
    const n = Math.abs(num | 0);
    const base = pick(n, 0), mark = pick(n + 3, 1), trim = pick(n + 7, 2);
    const zones = [[z.cap(0.24, mark), ...centre(10, trim)],
                   [z.band(0.26, 0.40, mark), z.band(0.72, 0.84, trim)],
                   [z.chevron(0, 40, 0.20, 0.66, mark), z.band(0.70, 0.82, trim)],
                   [z.wedge(200, 340, mark), z.cap(0.18, trim)]][n % 4];
    const alt = WHEEL[(((n * 7) % WHEEL.length) + WHEEL.length + WHEEL.length / 2) % WHEEL.length];
    return { name: name || "#" + n, base, alt, visor: C.black, zones, generated: true };
  }

  function keyNum(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    return (h >>> 1);
  }

  const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.30;
  function designFor(num, teamC, key) {
    const d = (key != null && generated(keyNum(String(key)), String(key))) ||
              (num != null && DESIGNS[num]) || generated(num == null ? 0 : num);
    if (!teamC || !d.alt || !near(d.base, teamC)) return d;
    return { name: d.name, base: d.alt, visor: d.visor, zones: d.zones, generated: d.generated, shifted: true };
  }

  const STYLES = ["team", "solid", "cap", "band", "stripe", "chevron", "flash", "split", "doodle"];
  const okCol = (c) => Array.isArray(c) && c.length >= 3 && c.every((v) => typeof v === "number" && isFinite(v));
  function styled(des, style, base, accent) {
    if (!des || STYLES.indexOf(style) < 1) return des;
    const b = okCol(base) ? base : des.base;
    const zc = des.zones && des.zones.find((q) => q && q.c);
    const a = okCol(accent) ? accent : (des.alt || (zc && zc.c) || C.white);
    const zones = style === "cap" ? [z.cap(0.30, a)]
      : style === "band" ? [z.band(0.16, 0.30, a)]
      : style === "stripe" ? centre(14, a)
      : style === "chevron" ? [z.chevron(0, 40, 0.04, 0.40, a)]
      : style === "flash" ? [...z.sides((q) => z.flash(q === 90 ? 40 : 320, 10, 28, 0.06, 0.78, q === 90 ? 70 : -70, a)), ...centre(8, a)]
      : style === "split" ? [z.wedge(180, 360, a), ...centre(5, b)]
      : style === "doodle" ? [z.mottle(0.04, 0.95, 4, 0.55, 2, a)] : [];
    return { name: des.name, base: b, alt: a, visor: des.visor, zones, generated: des.generated, styled: style };
  }

  function painter(design) {
    const zones = design.zones || [];
    return function (t, az) {
      let c = design.base;
      for (let i = 0; i < zones.length; i++) {
        const zz = zones[i], test = ZONES[zz.k];
        if (test && test(zz, t, az)) c = zz.c;
      }
      return c;
    };
  }

  const TRIM = [0.10, 0.10, 0.11];
  const VISOR_T0 = 0.40, VISOR_T1 = 0.66, VISOR_AZ = 76;
  function visorAt(t, az, grow) {
    const t0 = VISOR_T0 - grow, t1 = VISOR_T1 + grow;
    if (t < t0 || t > t1) return false;
    const f = (t - t0) / (t1 - t0);
    return dAz(az, 0) <= (VISOR_AZ + grow * 110) * Math.min(1, 1.55 * Math.sin(Math.PI * f));
  }
  const isVisorEdge = (t, az) => !visorAt(t, az, 0) && visorAt(t, az, 0.020);
  function isVisor(t, az) {
    if (t < VISOR_T0 || t > VISOR_T1) return false;
    const f = (t - VISOR_T0) / (VISOR_T1 - VISOR_T0);
    return dAz(az, 0) <= VISOR_AZ * Math.min(1, 1.55 * Math.sin(Math.PI * f));
  }

  function shell(design) {
    const paint = painter(design);
    const visor = design.visor || C.black;
    return function (t, az) {
      if (isVisor(t, az)) return { c: visor, glass: true };
      if (isVisorEdge(t, az)) return { c: TRIM, glass: false };
      if (t >= 0.955) return { c: TRIM, glass: false };
      return { c: paint(t, az), glass: false };
    };
  }

  const SHAPE = {
    T: [0.000, 0.012, 0.028, 0.050, 0.080, 0.120, 0.170, 0.230, 0.300, 0.380, 0.460, 0.540, 0.620, 0.700, 0.780, 0.850, 0.910, 0.960, 1.000],
    Y: [0.119, 0.116, 0.112, 0.106, 0.099, 0.089, 0.076, 0.061, 0.043, 0.023, 0.003, -0.017, -0.037, -0.057, -0.078, -0.095, -0.110, -0.123, -0.133],
    W: [0.000, 0.013, 0.031, 0.046, 0.058, 0.070, 0.080, 0.089, 0.097, 0.103, 0.104, 0.104, 0.103, 0.100, 0.096, 0.090, 0.081, 0.067, 0.056],
    F: [0.000, 0.023, 0.037, 0.051, 0.072, 0.090, 0.109, 0.120, 0.126, 0.131, 0.144, 0.152, 0.158, 0.157, 0.151, 0.142, 0.133, 0.121, 0.114],
    B: [0.000, 0.023, 0.038, 0.052, 0.070, 0.075, 0.092, 0.110, 0.127, 0.140, 0.146, 0.149, 0.157, 0.155, 0.148, 0.141, 0.132, 0.123, 0.116],
    N: [2.05, 2.06, 2.08, 2.11, 2.14, 2.17, 2.20, 2.23, 2.25, 2.26, 2.26, 2.25, 2.23, 2.20, 2.16, 2.13, 2.10, 2.07, 2.05],
  };
  function tab(arr, t) {
    const T = SHAPE.T, n = T.length;
    if (t <= T[0]) return arr[0];
    if (t >= T[n - 1]) return arr[n - 1];
    let i = 1;
    while (i < n - 1 && t > T[i]) i++;
    const f = (t - T[i - 1]) / (T[i] - T[i - 1]);
    const p0 = arr[Math.max(0, i - 2)], p1 = arr[i - 1], p2 = arr[i], p3 = arr[Math.min(n - 1, i + 1)];
    const f2 = f * f, f3 = f2 * f;
    return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
  }
  const SCALE = 1.107;
  function pointAt(t, a) {
    const w = Math.max(1e-4, tab(SHAPE.W, t) * SCALE), n = tab(SHAPE.N, t);
    const dx = Math.sin(a), dz = Math.cos(a);
    const d = Math.max(1e-4, (dz >= 0 ? tab(SHAPE.F, t) : tab(SHAPE.B, t)) * SCALE);
    const r = 1 / Math.pow(Math.pow(Math.abs(dx / w), n) + Math.pow(Math.abs(dz / d), n), 1 / n);
    return [r * dx, tab(SHAPE.Y, t) * SCALE, r * dz];
  }

  const MAX_SPLIT = 1;

  function surfAt(t, az) {
    const a = az * Math.PI / 180, e = 0.01, ea = 0.02;
    const p = pointAt(t, a);
    const pu = pointAt(Math.min(1, t + e), a), pd = pointAt(Math.max(0, t - e), a);
    const pr = pointAt(t, a + ea), pl = pointAt(t, a - ea);
    const tu = [pu[0] - pd[0], pu[1] - pd[1], pu[2] - pd[2]], ta = [pr[0] - pl[0], pr[1] - pl[1], pr[2] - pl[2]];
    const n = [ta[1] * tu[2] - ta[2] * tu[1], ta[2] * tu[0] - ta[0] * tu[2], ta[0] * tu[1] - ta[1] * tu[0]];
    const m = Math.hypot(n[0], n[1], n[2]) || 1;
    return { p, n: [n[0] / m, n[1] / m, n[2] / m] };
  }
  const _add = (p, n, k) => [p[0] + n[0] * k, p[1] + n[1] * k, p[2] + n[2] * k];
  function azAtHalfWidth(t, w) {
    let lo = 0, hi = 90;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (pointAt(t, m * Math.PI / 180)[0] < w) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  const AERO_DARK = [0.05, 0.05, 0.06];
  function buildAero(out, cx, cy, cz, design, S, simplePaint) {
    const paint = simplePaint ? () => design.base : painter(design);
    const tri = (a, b, c, col, ref) => {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const m = Math.hypot(n[0], n[1], n[2]);
      if (m < 1e-12) return;
      n = [n[0] / m, n[1] / m, n[2] / m];
      if (n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] < 0) { const s = b; b = c; c = s; n = [-n[0], -n[1], -n[2]]; }
      const i = out.pos.length / 3, cc = [Math.min(col[0], 1), Math.min(col[1], 1), Math.min(col[2], 1)];
      for (const q of [a, b, c]) {
        out.pos.push(cx + q[0], cy + q[1], cz + q[2]); out.nrm.push(n[0], n[1], n[2]);
        out.col.push(cc[0], cc[1], cc[2]); out.mat.push(S.paint);
      }
      out.idx.push(i, i + 1, i + 2);
    };
    const quad = (a, b, c, d, col, ref) => { tri(a, b, c, col, ref); tri(a, c, d, col, ref); };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const UP = [0, 1, 0];

    const TG = 0.30, TU = 0.345, SPAN = 42, NG = 7, H0 = 0.017;
    const gs = [];
    for (let i = 0; i < NG; i++) {
      const f = i / (NG - 1) * 2 - 1, az = 180 + f * SPAN, h = H0 * (0.55 + 0.45 * Math.cos(Math.PI * f * 0.92));
      const top = surfAt(TG, az), low = surfAt(TU, az);
      gs.push({ r: top.p, u: low.p, n: top.n, tip: _add(_add(top.p, top.n, h), UP, h * 0.35), c: paint(TG, az) });
    }
    for (let i = 0; i < NG - 1; i++) {
      const a = gs[i], b = gs[i + 1];
      quad(a.r, b.r, b.tip, a.tip, a.c, _add(a.n, UP, 0.6));
      quad(a.u, b.u, b.tip, a.tip, AERO_DARK, [-a.n[0], -1, -a.n[2]]);
    }
    for (const g of [gs[0], gs[NG - 1]]) {
      const side = [g.r[0], 0, 0];
      tri(g.r, g.tip, g.u, g.c, side);
    }

    const IT = [0.22, 0.17, 0.12, 0.08, 0.05], IH = [0.015, 0.013, 0.009, 0.004, 0], IW = 0.026;
    const st = IT.map((t, i) => {
      const c = surfAt(t, 0), aB = azAtHalfWidth(t, IW), aT = azAtHalfWidth(t, IW * 0.75);
      const sink = (az) => { const s = surfAt(t, az); return _add(s.p, s.n, -0.004); };
      const lift = (az) => _add(surfAt(t, az).p, c.n, IH[i]);
      return { n: c.n, bl: sink(-aB), tl: lift(-aT), tr: lift(aT), br: sink(aB), col: paint(t, 0) };
    });
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i], b = st[i + 1];
      quad(a.bl, b.bl, b.tl, a.tl, a.col, [-1, 0.3, 0]);
      quad(a.tl, b.tl, b.tr, a.tr, a.col, a.n);
      quad(a.tr, b.tr, b.br, a.br, a.col, [1, 0.3, 0]);
    }
    const m0 = st[0];
    quad(m0.bl, m0.tl, m0.tr, m0.br, AERO_DARK, [0, 0, 1]);

    if (simplePaint) return out;
    const grow = 0.020, t0g = VISOR_T0 - grow, t1g = VISOR_T1 + grow, AZW = (VISOR_AZ + grow * 110) * 1.55;
    const vs = [];
    for (let az = -70; az <= 70.001; az += 14) {
      const tTop = t0g + (t1g - t0g) * Math.asin(Math.min(1, Math.abs(az) / AZW)) / Math.PI;
      const lo = surfAt(tTop - 0.004, az), hi = surfAt(tTop - 0.064, az);
      vs.push({ li: _add(lo.p, lo.n, -0.001), lo: _add(lo.p, lo.n, 0.0035), ho: _add(hi.p, hi.n, 0.0035), hi: _add(hi.p, hi.n, -0.001), n: mid(lo.n, hi.n) });
    }
    for (let i = 0; i < vs.length - 1; i++) {
      const a = vs[i], b = vs[i + 1];
      quad(a.lo, b.lo, b.ho, a.ho, AERO_DARK, a.n);
      quad(a.ho, b.ho, b.hi, a.hi, AERO_DARK, [0, 1, 0]);
      quad(a.li, b.li, b.lo, a.lo, AERO_DARK, [0, -1, 0]);
    }
    for (const v of [vs[0], vs[vs.length - 1]]) quad(v.li, v.lo, v.ho, v.hi, AERO_DARK, [v.lo[0], 0, 0]);
    return out;
  }

  const MEMO_MAX = 24, MEMO_BYTES = 8 * 1024 * 1024, _memo = new Map();
  let _memoBytes = 0;
  const ARRS = ["pos", "nrm", "col", "mat"];
  const _cornersFull = new Map(), _cornersField = new Map();
  function build(out, cx, cy, cz, design, S) {
    let key = null;
    try { key = JSON.stringify([cx, cy, cz, design, S || null]); } catch (_) { key = null; }
    const hit = key !== null ? _memo.get(key) : undefined;
    if (hit) {
      _memo.delete(key); _memo.set(key, hit);
      const v0 = out.pos.length / 3;
      for (const a of ARRS) { const src = hit[a], dst = out[a]; for (let i = 0; i < src.length; i++) dst.push(src[i]); }
      const idx = hit.idx, dst = out.idx;
      for (let i = 0; i < idx.length; i++) dst.push(idx[i] + v0);
      return out;
    }
    const v0 = out.pos.length / 3, at = { idx: out.idx.length };
    for (const a of ARRS) at[a] = out[a].length;
    paintLid(out, cx, cy, cz, design, S);
    if (key === null) return out;
    const rec = {}; let bytes = 0;
    for (const a of ARRS) { rec[a] = Float64Array.from(out[a].slice(at[a])); bytes += rec[a].byteLength; }
    rec.idx = Int32Array.from(out.idx.slice(at.idx), (i) => i - v0); bytes += rec.idx.byteLength;
    rec.bytes = bytes;
    _memo.set(key, rec); _memoBytes += bytes;
    while (_memo.size > 1 && (_memo.size > MEMO_MAX || _memoBytes > MEMO_BYTES)) {
      const k = _memo.keys().next().value;
      _memoBytes -= _memo.get(k).bytes; _memo.delete(k);
    }
    return out;
  }

  function paintLid(out, cx, cy, cz, design, S) {
    const simplePaint = !!(S && S.simplePaint);
    const skin = simplePaint ? null : shell(design);
    const rings = simplePaint ? FIELD_RINGS : RINGS;
    const slices = simplePaint ? FIELD_SLICES : SLICES;
    const meshRingT = (i) => Math.pow(i / rings, 1.25);
    const clamp1 = (c) => [Math.min(c[0], 1), Math.min(c[1], 1), Math.min(c[2], 1)];
    const du = 0.5 / rings, da = Math.PI / slices;
    const table = simplePaint ? _cornersField : _cornersFull;
    const corner = (t, az) => {
      let row = table.get(t);
      if (!row) { if (table.size > 512) table.clear(); row = new Map(); table.set(t, row); }
      let v = row.get(az);
      if (!v) { if (row.size > 512) row.clear(); v = cornerAt(t, az); row.set(az, v); }
      return v;
    };
    const cornerAt = (t, az) => {
      const a = (az * Math.PI) / 180;
      const p = pointAt(t, a);
      const pu = pointAt(Math.min(1, t + du), a), pd = pointAt(Math.max(0, t - du), a);
      const pr = pointAt(t, a + da), pl = pointAt(t, a - da);
      const tu = [pu[0] - pd[0], pu[1] - pd[1], pu[2] - pd[2]];
      const ta = [pr[0] - pl[0], pr[1] - pl[1], pr[2] - pl[2]];
      let n = [ta[1] * tu[2] - ta[2] * tu[1], ta[2] * tu[0] - ta[0] * tu[2], ta[0] * tu[1] - ta[1] * tu[0]];
      const m = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / m, n[1] / m, n[2] / m];
      if (t <= 0) n = [0, 1, 0];
      return { p, n, t, az };
    };
    const sample = simplePaint
      ? (t, az) => {
          const glass = isVisor(Math.min(1, t), ((az % 360) + 360) % 360);
          return { c: glass ? design.visor : design.base, glass };
        }
      : (t, az) => skin(Math.min(1, t), ((az % 360) + 360) % 360);
    const key = (t, az) => { const v = sample(t, az);
      return (v.glass ? "g" : "") + v.c.map((x) => Math.round(x * 255)).join(","); };
    const paintTri = (v0, v1, v2) => {
      const v = sample((v0.t + v1.t + v2.t) / 3, (v0.az + v1.az + v2.az) / 3);
      return { c: clamp1(v.c), mat: v.glass ? S.glass : S.paint };
    };
    const emit = (a, b, c) => {
      const paint = paintTri(a, b, c);
      const i = out.pos.length / 3;
      for (const v of [a, b, c]) {
        out.pos.push(cx + v.p[0], cy + v.p[1], cz + v.p[2]);
        out.nrm.push(v.n[0], v.n[1], v.n[2]);
        out.col.push(paint.c[0], paint.c[1], paint.c[2]);
        out.mat.push(paint.mat);
      }
      out.idx.push(i, i + 1, i + 2);
    };
    const splitCap = (S && typeof S.maxSplit === "number") ? S.maxSplit : MAX_SPLIT;
    const patch = (t0, t1, a0, a1, depth) => {
      const tm = (t0 + t1) / 2, am = (a0 + a1) / 2;
      if (depth < splitCap) {
        const k = key(t0, a0);
        if (key(t0, a1) !== k || key(t1, a1) !== k || key(t1, a0) !== k || key(tm, am) !== k) {
          patch(t0, tm, a0, am, depth + 1); patch(t0, tm, am, a1, depth + 1);
          patch(tm, t1, am, a1, depth + 1); patch(tm, t1, a0, am, depth + 1);
          return;
        }
      }
      const a = corner(t0, a0), b = corner(t0, a1), c = corner(t1, a1), d = corner(t1, a0);
      emit(a, b, c); emit(a, c, d);
    };
    for (let r = 0; r < rings; r++)
      for (let sl = 0; sl < slices; sl++)
        patch(meshRingT(r), meshRingT(r + 1), (sl / slices) * 360, ((sl + 1) / slices) * 360, 0);
    if (!(S && S.aero === false)) buildAero(out, cx, cy, cz, design, S, simplePaint);
    return out;
  }

  return { DESIGNS, COLORS: C, designFor, styled, STYLES, painter, shell, isVisor, generated, ZONES, SHAPE, pointAt, build,
           RINGS, SLICES, FIELD_RINGS, FIELD_SLICES, ringT, MAX_SPLIT };
})();
Object.freeze(Helmets);
