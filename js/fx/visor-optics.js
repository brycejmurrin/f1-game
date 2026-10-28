/* Apex 26 — VisorOptics: the HELMET camera's eye-port and the light on the inside of its shield.
 *
 * Three parts, all renderer-agnostic 2D overlays (GLX, TLX and WGX get the same visor and no backend pays a pass):
 *   PORT    the helmet's eye-port as an SVG image on #hud::before (css/helmet-visor.css): a wide, flat-browed
 *           aperture with rounded lower corners, cheek pads in the periphery and a chin bar below — not a centred
 *           ellipse. Built per viewport aspect (resize only) and per tint setting; nothing per frame.
 *   LIGHT   a <canvas id="fx-visor"> composited with mix-blend-mode: plus-lighter (screen where unsupported), so
 *           reflections are ADDED light and can never grey the scene — on WebGPU. On the WebGL2 path (TLX's WebGL2
 *           backend, GLX) the layer composites as plain "over" instead (blendMode(), #3657). Repainted at ~15 Hz
 *           from the scene lighting the game already publishes through window.__apex (visorScene(), else camState() + lightState()):
 *           the sun's glint and its double-reflection ghost, a Fresnel rim sheen on the sun's side, one glint per
 *           flood / street lamp / tail-light in view (projected through the camera, so they slide with heading),
 *           and a chromatic fringe along the rim that scales with VISOR REFRACTION. Every term is proportional to
 *           the light that reaches the shield, so a dark scene adds nothing.
 *   BEND    the feDisplacementMap the refraction filter reads (filter: url(#visor-bend-*) on the world canvas,
 *           css/helmet-visor.css): zero across the centre, strongest at the port's rim, following its shape.
 *
 * The lighting→visor mapping (lightMap) and the port geometry (portPath) are pure functions, unit-tested in
 * tests/unit/visor-optics.test.mjs. Droplets.tick (js/fx/droplets.js, game.js's per-frame onboard-overlay
 * heartbeat) calls tick(); nothing here touches the simulation. Phone-cheap by construction: one 2D canvas at
 * 1 css px per device px, ≤ 14 gradients per repaint, no layout reads in the loop. */
const VisorOptics = (function () {
  "use strict";

  const HZ = 15;                     // repaint rate; the compositor blends the last frame in between
  const HZ_REDUCED = 8;              // prefers-reduced-motion: the glints still follow the heading, more slowly
  const MAX_GLINTS = 8;              // the brightest lamps in view
  const LAMP_GAIN = 1.5;             // glint = GAIN·√(energy/d²)·beam: a Bahrain flood (12 000) at 50 m saturates, a Monaco soffit (40) at 10 m ≈ 0.9
  // An eye adapted to daylight sees a lamp's reflection against the light already in the scene, not against black:
  // glints scale by 1/(1 + ADAPT·max(0, daylight − DARK)). Night (moon key + sky ≈ 0.14) keeps every glint; a dusk
  // sky (≈ 0.95) keeps ≈ 0.3 — eight pit-lane lamps at full night strength washed the dusk view amber (A·W46).
  const LAMP_ADAPT = 3, LAMP_DARK = 0.2;
  const LIGHT_STRIDE = 15;           // gfx.js §frame: [x,y,z, r,g,b, rad, dirX,dirY,dirZ, cosInner,cosOuter, bleed, volW, glareW]
  const LEVEL = { off: 0, light: 0.6, medium: 1, strong: 1.6 };       // VISOR REFLECTIONS
  const BEAMS = { off: 0, light: 0.6, medium: 1, strong: 1.6 };       // VISOR BEAMS: lamp beams, god rays, star flares
  const FRINGE = { off: 0, light: 0.35, medium: 0.6, strong: 1 };    // VISOR REFRACTION → chromatic fringe
  const BEND = { light: 14, medium: 32, strong: 56 };                // feDisplacementMap scale per level (rim only)
  // Lens colours: css/tokens.css --visor-{neutral,amber,ice,rose}, selected into --visor-lens by css/helmet-visor.css from
  // body[data-helmet-visor-color] and read here at port-build time; this table is the fallback for a stub DOM.
  const TINT = { neutral: [12, 12, 20], amber: [80, 61, 32], ice: [35, 59, 80], rose: [76, 45, 60] };
  const TINT_ALPHA = { light: 0.12, medium: 0.18, strong: 0.24 };

  const BLEND_RECHECK_MS = 1000;     // the live backend is re-read this often (it settles once after boot or a fallback)

  let _cv = null, _ctx = null, _looked = false;
  let _blend = "", _blendParam, _blendT = -Infinity;
  let _w = 0, _h = 0, _shown = false, _acc = 1, _bendLevelBuilt = "";
  let _portKey = "", _bendKey = "", _paths = null, _svg = null;
  const _stats = { ticks: 0, paints: 0, msLast: 0, msMax: 0, msSum: 0, glints: 0, sun: 0, rim: 0, lamp: 0, msBend: 0, msLookup: 0, errors: 0 };
  const _tmpSun = [0, 0, 0], _glintBuf = [];
  const _basis = { fwd: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] };

  const clampTo = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lum = (c) => (c ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] : 0);
  const r2 = (v) => Math.round(v * 100) / 100;

  // ---------- PORT geometry (pure) ----------

  /** The eye-port box for a viewport: a shallow, wide slot — a helmet's proportions on every aspect (a tall phone
   *  gets a slot across the middle, not a tall oval). The brow band above is thicker than the chin band below,
   *  as the visor's top frame and tear-offs are what a driver's-eye camera sees first. Returns px. */
  function portBox(w, h) {
    const pw = w * 0.975;
    const ph = Math.min(h * 0.80, pw * 0.62);
    const cx = w / 2, cy = h * 0.52;
    return { x0: cx - pw / 2, y0: cy - ph / 2, x1: cx + pw / 2, y1: cy + ph / 2, pw, ph };
  }

  /** SVG path of the eye-port outline (clockwise from the top-left), `inset` px inside the true edge.
   *  Shape, from the references (Bell HP77 front view, the Driver's Eye POV frames): a letterbox slot — a near-
   *  straight brow with a slight arch (highest over the nose), straight temples, and rounded corners only, the
   *  lower pair larger where the cheek pads sit. Nothing oval. */
  function portPath(w, h, inset = 0) {
    const b = portBox(w, h);
    const x0 = b.x0 + inset, x1 = b.x1 - inset, y0 = b.y0 + inset, y1 = b.y1 - inset;
    const pw = x1 - x0, ph = y1 - y0;
    const rt = ph * 0.30, rb = ph * 0.42, arch = ph * 0.06;   // top corner radius, bottom corner radius, brow apex rise
    const K = 0.55;                                            // Bézier circle constant
    const P = (x, y) => r2(x) + "," + r2(y);
    return "M" + P(x0 + rt, y0 + arch)
      + "C" + P(x0 + pw * 0.30, y0 - arch * 0.3) + " " + P(x1 - pw * 0.30, y0 - arch * 0.3) + " " + P(x1 - rt, y0 + arch)   // brow
      + "C" + P(x1 - rt * (1 - K), y0 + arch) + " " + P(x1, y0 + arch + rt * (1 - K)) + " " + P(x1, y0 + arch + rt)         // top-right corner
      + "L" + P(x1, y1 - rb)                                                                                                // right temple
      + "C" + P(x1, y1 - rb * (1 - K)) + " " + P(x1 - rb * (1 - K), y1) + " " + P(x1 - rb, y1)                               // right cheek
      + "L" + P(x0 + rb, y1)                                                                                                // chin bar
      + "C" + P(x0 + rb * (1 - K), y1) + " " + P(x0, y1 - rb * (1 - K)) + " " + P(x0, y1 - rb)                               // left cheek
      + "L" + P(x0, y0 + arch + rt)                                                                                         // left temple
      + "C" + P(x0, y0 + arch + rt * (1 - K)) + " " + P(x0 + rt * (1 - K), y0 + arch) + " " + P(x0 + rt, y0 + arch)         // top-left corner
      + "Z";
  }

  /** The port as a CSS background image: the bezel (near-black, slightly translucent) with the port cut out, a
   *  sharp-ish edge that falls off softly inside the rim, lighter cheek pads in the lower periphery, and the
   *  TINTED visor's colour laid over the clear area. Returns a `url("data:image/svg+xml,…")` string. */
  function portImage(w, h, { tint = null, tintAlpha = 0 } = {}) {
    const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
    const b = portBox(W, H);
    const sharp = Math.max(1.2, W * 0.004), soft = Math.max(4, W * 0.02);
    const frame = "M-400,-400H" + (W + 400) + "V" + (H + 400) + "H-400Z";
    const bezel = "#07070c";
    const padR = Math.round(b.pw * 0.14), padY = Math.round(b.y1 - b.ph * 0.02);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">'
      + "<defs>"
      + '<filter id="s" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="' + r2(sharp) + '"/></filter>'
      + '<filter id="w" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="' + r2(soft) + '"/></filter>'
      + '<filter id="p" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="' + r2(b.pw * 0.05) + '"/></filter>'
      + "</defs>"
      + (tint && tintAlpha > 0 ? '<rect width="100%" height="100%" fill="rgb(' + tint.join(",") + ')" fill-opacity="' + r2(tintAlpha) + '"/>' : "")
      // the soft inner falloff: a slightly smaller port, blurred wide, at half strength
      + '<path fill="' + bezel + '" fill-opacity="0.55" fill-rule="evenodd" filter="url(#w)" d="' + frame + portPath(W, H, soft * 0.9) + '"/>'
      // the bezel with the true edge, blurred just enough to anti-alias into a soft line
      + '<path fill="' + bezel + '" fill-opacity="0.93" fill-rule="evenodd" filter="url(#s)" d="' + frame + portPath(W, H, 0) + '"/>'
      // cheek pads: a hint of the lighter padding fabric in both lower corners of the bezel
      + '<ellipse cx="' + Math.round(b.x0 + b.pw * 0.02) + '" cy="' + padY + '" rx="' + padR + '" ry="' + Math.round(padR * 0.55) + '" fill="#2a2a30" fill-opacity="0.28" filter="url(#p)"/>'
      + '<ellipse cx="' + Math.round(b.x1 - b.pw * 0.02) + '" cy="' + padY + '" rx="' + padR + '" ry="' + Math.round(padR * 0.55) + '" fill="#2a2a30" fill-opacity="0.28" filter="url(#p)"/>'
      + "</svg>";
    // Minimal escaping for a double-quoted CSS url(): the SVG's own quotes become apostrophes, and only the
    // characters a data URI cannot carry raw are percent-encoded (the result stays readable in a stylesheet dump).
    return 'url("data:image/svg+xml,' + svg.replace(/"/g, "'").replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E") + '")';
  }

  // ---------- camera (pure) ----------

  function camBasis(eye, tgt, out) {
    const o = out || { fwd: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] };
    let fx = tgt[0] - eye[0], fy = tgt[1] - eye[1], fz = tgt[2] - eye[2];
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    // right = fwd × worldUp; up = right × fwd  (+Y up; a straight-down look keeps the last right)
    let rx = -fz, rz = fx;
    const rl = Math.hypot(rx, rz);
    if (rl > 1e-6) { rx /= rl; rz /= rl; } else { rx = o.right[0]; rz = o.right[2]; }
    o.fwd[0] = fx; o.fwd[1] = fy; o.fwd[2] = fz;
    o.right[0] = rx; o.right[1] = 0; o.right[2] = rz;
    o.up[0] = -rz * fy; o.up[1] = rz * fx - rx * fz; o.up[2] = rx * fy;
    return o;
  }

  /** A world DIRECTION (unit) into screen px through a vertical-FOV pinhole. z is the forward component; a point
   *  behind the eye (z <= 0) keeps x/y at the frame centre and the caller reads z. */
  function projectDir(d, basis, fovDeg, w, h, out) {
    const o = out || { x: 0, y: 0, z: 0 };
    const f = (h / 2) / Math.tan((fovDeg || 62) * Math.PI / 360);
    const x = d[0] * basis.right[0] + d[1] * basis.right[1] + d[2] * basis.right[2];
    const y = d[0] * basis.up[0] + d[1] * basis.up[1] + d[2] * basis.up[2];
    const z = d[0] * basis.fwd[0] + d[1] * basis.fwd[1] + d[2] * basis.fwd[2];
    o.x = w / 2 + (z > 1e-3 ? f * x / z : 0);
    o.y = h / 2 - (z > 1e-3 ? f * y / z : 0);
    o.z = z; o.sx = x; o.sy = y;
    return o;
  }

  /** How much of a key light reaches the shield from its direction, by z = the sun direction's forward component
   *  (1 ahead, 0 level with the eye, −1 behind): 1 for z ≥ 0.2, falling to 0 at z = −0.5 (~120° off the nose). */
  function sunFacing(z) { return clampTo((z + 0.5) / 0.7, 0, 1); }
  /** A lamp glint's visibility against the daylight the eye is adapted to (key·sunUp + sky, exposed units). */
  function lampAdapt(daylight) { return 1 / (1 + LAMP_ADAPT * Math.max(0, (daylight || 0) - LAMP_DARK)); }

  // ---------- lighting → visor (pure) ----------

  /** What the shield shows for one scene. `scene` is __apex.visorScene()'s shape: eye, tgt, fov, sunDir,
   *  sunColor, exposure, ambientSky, lights (stride-15 or null), tailStart, floodEmit. `level` scales everything
   *  (VISOR REFLECTIONS); `fringe` is the chromatic rim amount (VISOR REFRACTION); `smoke` marks the tinted lens
   *  (its inner reflections read stronger against the darker transmitted scene). Every intensity is 0..~1.5 and
   *  proportional to light actually reaching the shield: a dark scene returns zeros. */
  function lightMap(scene, w, h, { level = 1, fringe = 0, smoke = false, tint = null, bloom = 1, glare = 0.12, beams = 1 } = {}) {
    const out = { sun: null, ghost: null, rays: null, rim: null, glints: [], fringe: 0, haze: 0, bloom: clampTo(bloom, 0, 2.5) };
    if (!scene || !scene.eye || !scene.tgt || !(level > 0)) return out;
    // VISOR BEAMS: one scale for every streak — the lamps' beams, the sun's rays, the star flares; 0 keeps the glints alone.
    const bm = Number.isFinite(beams) ? clampTo(beams, 0, 2) : 1;
    const basis = camBasis(scene.eye, scene.tgt, _basis);
    const exp = scene.exposure > 0 ? scene.exposure : 1;
    const gain = level * (smoke ? 1.25 : 1);
    const base = Math.max(1, Math.min(w, h));

    // The key light: the sun (or the night's moon key — tiny). Brightness in exposed units.
    const key = clampTo(lum(scene.sunColor) * exp, 0, 4);
    const sd = scene.sunDir;
    // Horizon fade, not elevation: a sun just above the horizon is the one that blinds a driver, so full strength
    // from ~3° up; only the set sun (below −1°) adds nothing.
    const sunUp = sd ? clampTo((sd[1] + 0.02) / 0.08, 0, 1) : 0;
    let sceneLight = 0;
    if (sd && key > 0.02 && sunUp > 0.01) {
      const p = projectDir(sd, basis, scene.fov, w, h, _tmpSun);
      const warm = scene.sunColor;
      const rgb = [clampTo(warm[0] / Math.max(1e-3, Math.max(warm[0], warm[1], warm[2])), 0, 1) * 255,
                   clampTo(warm[1] / Math.max(1e-3, Math.max(warm[0], warm[1], warm[2])), 0, 1) * 255,
                   clampTo(warm[2] / Math.max(1e-3, Math.max(warm[0], warm[1], warm[2])), 0, 1) * 255];
      // The glint: the sun's own reflection, seen near its direction. The shield wraps past the frame, so a sun
      // just outside the view (the usual high sun) still lights the rim nearest it: the glint clamps to that
      // edge and spreads into a broad glow, fading out once the sun is ~45° past the frame.
      if (p.z > 0.02) {
        const halfY = (scene.fov || 62) * Math.PI / 360, halfX = Math.atan(Math.tan(halfY) * w / h);
        const over = Math.max(Math.abs(Math.atan2(p.sx, p.z)) - halfX, Math.abs(Math.atan2(p.sy, p.z)) - halfY, 0);
        const fade = 1 - clampTo(over / (45 * Math.PI / 180), 0, 1);
        if (fade > 0.01) {
          const k = clampTo(2.0 * key * sunUp * gain * fade, 0, 1.4);
          const x = clampTo(p.x, -0.08 * w, 1.08 * w), y = clampTo(p.y, -0.08 * h, 1.08 * h);
          out.sun = { x, y, k, r: base * 0.22 * (1 + 0.9 * (1 - fade)), rgb };
          // The double-reflection ghost: mirrored through the centre, larger and fainter (lens-flare geometry).
          if (over === 0) out.ghost = { x: w - x, y: h - y, k: k * 0.4, r: base * 0.3, rgb };
          // God rays: a sun in the frame streaks across the shield's micro-scratches and the tear-off film —
          // radial, longest when the sun sits low in the frame (a low sun ahead is what blinds a driver).
          if (over === 0 && bm > 0) out.rays = { x, y, k: k * bm, len: Math.hypot(w, h) * 0.75 * (0.7 + 0.3 * bm), rgb };
        }
      }
      // Fresnel rim sheen: the inner rim is seen at grazing angles, where reflectance climbs, and it is lit on
      // the sun's side of the view. Only light coming in through the shield reaches it: the helmet shell shades
      // the visor from a sun behind the eye, so the sheen is full with the sun ahead or level with the eye and
      // fades to nothing once it is ~120° behind (sunFacing). It used to peak with the sun behind (A·W46).
      const side = Math.hypot(p.sx, p.sy);
      const rake = sunFacing(p.z) * (0.35 + 0.3 * side);
      const rk = clampTo(1.0 * key * sunUp * rake * gain, 0, 1);
      if (rk > 0.004) out.rim = { k: rk, dx: side > 1e-3 ? p.sx / side : 0, dy: side > 1e-3 ? -p.sy / side : -1, rgb };
      sceneLight += key * sunUp;
    }

    // Sky haze on the brow: the sky reflected in the top of the shield; only a daylight sky is bright enough.
    const amb = clampTo(lum(scene.ambientSky) * exp, 0, 2);
    out.haze = clampTo(0.3 * amb * gain, 0, 0.32);
    const lampVis = lampAdapt(key * sunUp + amb);
    sceneLight += amb * 0.5;

    // Lamp glints: each light in this frame's culled list, projected; the brightest MAX_GLINTS kept.
    const L = scene.lights;
    if (L && L.length >= LIGHT_STRIDE) {
      const eye = scene.eye, f = (h / 2) / Math.tan((scene.fov || 62) * Math.PI / 360);
      _glintBuf.length = 0;
      for (let i = 0; i + LIGHT_STRIDE <= L.length; i += LIGHT_STRIDE) {
        const dx = L[i] - eye[0], dy = L[i + 1] - eye[1], dz = L[i + 2] - eye[2];
        const z = dx * basis.fwd[0] + dy * basis.fwd[1] + dz * basis.fwd[2];
        if (z < 1) continue;                                  // behind, or at the eye
        let x = w / 2 + f * (dx * basis.right[0] + dy * basis.right[1] + dz * basis.right[2]) / z;
        let y = h / 2 - f * (dx * basis.up[0] + dy * basis.up[1] + dz * basis.up[2]) / z;
        // A fixture just past the frame (the soffit lamp overhead, the mast beside you) still smears into the
        // nearest rim: clamp it there and fade it out over the next third of a frame.
        const over = Math.max(-x / w, (x - w) / w, -y / h, (y - h) / h, 0);
        if (over > 0.35) continue;
        const edgeFade = 1 - over / 0.35;
        x = clampTo(x, -0.08 * w, 1.08 * w); y = clampTo(y, -0.08 * h, 1.08 * h);
        const d2 = Math.max(100, dx * dx + dy * dy + dz * dz);
        // A cone's lens is bright inside its beam and still glows outside it (the fixture itself). The record's
        // colour is the fixture's ENERGY (track-lights.js ePhys: a flood mast in the thousands, a tunnel soffit
        // in the tens, each sized so its pool on the road reads right), so what reaches the eye is energy / d²,
        // the law the road obeys; the square root compresses a 100× energy range into glints of one family.
        const dl = Math.sqrt(d2), cosT = -(dx * L[i + 7] + dy * L[i + 8] + dz * L[i + 9]) / dl;
        const beam = clampTo((cosT - L[i + 11]) / Math.max(1e-3, L[i + 10] - L[i + 11]), 0, 1);
        const kl = LAMP_GAIN * Math.sqrt(Math.max(0, lum([L[i + 3], L[i + 4], L[i + 5]]) * exp) / d2) * (0.5 + 0.5 * beam) * edgeFade * lampVis;
        if (kl < 0.15) continue;                                // below this a glint would not read; the road gets little from it either
        const m = Math.max(1e-3, L[i + 3], L[i + 4], L[i + 5]);
        // The fixture's aim on screen (its cone): a faint beam leaves each glint that way — the floods' light
        // seen in the haze and on the shield, pointing where the lamp points.
        const bx = L[i + 7] * basis.right[0] + L[i + 8] * basis.right[1] + L[i + 9] * basis.right[2];
        const by = -(L[i + 7] * basis.up[0] + L[i + 8] * basis.up[1] + L[i + 9] * basis.up[2]);
        const bl = Math.hypot(bx, by);
        _glintBuf.push({ x, y, k: kl, d: dl, rgb: [L[i + 3] / m * 255, L[i + 4] / m * 255, L[i + 5] / m * 255], bx: bl > 1e-3 ? bx / bl : 0, by: bl > 1e-3 ? by / bl : 1, beam });
      }
      _glintBuf.sort((a, b) => b.k - a.k);
      const n = Math.min(MAX_GLINTS, _glintBuf.length);
      for (let i = 0; i < n; i++) {
        const g = _glintBuf[i];
        const k = clampTo(g.k * gain * (0.7 + 0.3 * clampTo(glare / 0.12, 0, 2.5)), 0, 1.2);   // LENS GLARE lifts the cores
        // Nearer fixtures smear wider across the curved shield; far ones stay small.
        const r = base * clampTo(0.14 + 8 / Math.max(8, g.d), 0.14, 0.36) * (0.8 + 0.2 * out.bloom);
        out.glints.push({ x: g.x, y: g.y, k, r, rgb: g.rgb,
          // The fixture's beam, seen in the air and on the shield: longer and brighter the harder the lamp hits the eye.
          beam: bm > 0 && k > 0.25 ? { dx: g.bx, dy: g.by, len: base * (0.45 + 0.55 * g.beam) * clampTo(k, 0, 1) * (0.6 + 0.4 * bm), k: k * 0.5 * bm } : null,
          // A star flare on the brightest three: the shield's micro-scratches split a hard point source into spokes.
          star: bm > 0 && i < 3 && k > 0.45 ? { len: r * 2.8 * (0.7 + 0.3 * bm), k: k * 0.4 * bm } : null });
        sceneLight += g.k * 0.6;
      }
    }

    // Chromatic fringe: a lens property, but ADDED colour, so it needs light in the scene to show.
    out.fringe = clampTo(fringe * clampTo(sceneLight, 0, 1) * 0.55 * level, 0, 0.6);
    if (tint && out.sun) { const t = tint; out.sun.rgb = [(out.sun.rgb[0] * 2 + t[0]) / 3, (out.sun.rgb[1] * 2 + t[1]) / 3, (out.sun.rgb[2] * 2 + t[2]) / 3]; }
    return out;
  }

  // ---------- scene reader (window.__apex, read-only) ----------

  let _knobs = { bloom: 1, glare: 0.12 }, _knobsAt = -1e9;
  function readKnobs(now) {
    if (now - _knobsAt < 2000) return _knobs;
    _knobsAt = now;
    try {
      const A = typeof window !== "undefined" ? window.__apex : null;
      const t = A && typeof A.lightTune === "function" ? A.lightTune() : null;
      const b = t ? +t.bloomMul : NaN, gl = t ? +t.glareStr : NaN;
      _knobs = { bloom: Number.isFinite(b) ? b : 1, glare: Number.isFinite(gl) ? gl : 0.12 };
    } catch (_) { /* no tuner: shipped defaults */ }
    return _knobs;
  }

  function readScene() {
    const A = typeof window !== "undefined" ? window.__apex : null;
    if (!A) return null;
    try {
      if (typeof A.visorScene === "function") return A.visorScene();
      if (typeof A.camState !== "function" || typeof A.lightState !== "function") return null;
      const c = A.camState(), l = A.lightState();
      if (!c || !l) return null;
      return { eye: c.eye, tgt: c.tgt, fov: c.fov, sunDir: l.skySunDir, sunColor: l.sunColor, exposure: l.exposure,
               ambientSky: l.ambientSky, lights: null, tailStart: 0, floodEmit: l.floodEmit };
    } catch (_) { return null; }   // a hook that throws mid-build: paint nothing this tick
  }

  // ---------- BLEND gate (#3657) ----------

  /** How #fx-visor composites over the world: "add" (mix-blend-mode: plus-lighter) or "over" (plain alpha).
   *  plus-lighter costs nothing on WebGPU, but on a real iPhone 14 on WebGL2 it tripped the perf governor
   *  (Bahrain night, HELMET cam: autoTier 0 with the visor off, 4 with it on and refraction off; JS paint 0.2 ms —
   *  ledger row 18 of docs/notes/DEVICE-FARM-LEDGER-2026-10-23.md). So WebGPU keeps "add" and everything else
   *  takes "over". The canvas is painted with near-white and lamp-coloured light only, so over a darker scene
   *  "over" still brightens; it differs from "add" only where the scene under a glint is already brighter than
   *  the glint. `?visorblend=add|over` forces either arm for a device A/B. */
  function blendMode(api, param) {
    if (param === "add" || param === "over") return param;
    return api === "webgpu" ? "add" : "over";
  }
  function _api() {
    if (typeof RendererPicker === "undefined") return null;
    try {
      const three = RendererPicker.liveThreeApi && RendererPicker.liveThreeApi();
      if (three) return three;
      return RendererPicker.liveBackend && RendererPicker.liveBackend() === "webgpu" ? "webgpu" : "webgl2";
    } catch (_) { return null; }
  }
  function _param() {
    if (_blendParam !== undefined) return _blendParam;
    _blendParam = null;
    try { _blendParam = new URLSearchParams(window.location.search).get("visorblend"); } catch (_) { /* no URL here */ }
    return _blendParam;
  }
  /** Sets body[data-visor-blend] (css/helmet-visor.css reads it) when the mode changes; re-reads at most once a second. */
  function _syncBlend(now) {
    if (now - _blendT < BLEND_RECHECK_MS) return;
    _blendT = now;
    const mode = blendMode(_api(), _param());
    if (mode === _blend) return;
    _blend = mode;
    if (typeof document !== "undefined" && document.body) document.body.setAttribute("data-visor-blend", mode);
  }

  // ---------- DOM: canvas, port image, displacement map ----------

  function _helmet() { return typeof document !== "undefined" && !!document.body && document.body.hasAttribute("data-helmet-cam"); }
  function _opt(name, dflt) { return typeof CockpitOpts !== "undefined" && typeof CockpitOpts[name] === "function" ? CockpitOpts[name]() : dflt; }
  // VISOR BEAMS: CockpitOpts.visorBeams() is the 0..2 slider factor; a level word (a stub, an old URL) maps through BEAMS.
  function _beams() {
    const v = _opt("visorBeams", 1);
    const n = typeof v === "string" && BEAMS[v] != null ? BEAMS[v] : +v;
    return Number.isFinite(n) ? clampTo(n, 0, 2) : 1;
  }
  function _low() { return typeof GfxQuality !== "undefined" && GfxQuality.current && GfxQuality.current() === "low"; }

  function _lookup() {
    if (_looked) return _cv;
    _looked = true;
    if (typeof document === "undefined" || !document.getElementById) return null;
    _cv = document.getElementById("fx-visor");
    if (!_cv && document.createElement) {
      // Not static shell DOM: built beside #fx-droplets / #game, the js/fx/droplets.js pattern; css/helmet-visor.css places it.
      const after = document.getElementById("fx-droplets") || document.getElementById("game");
      if (after && after.parentNode) {
        _cv = document.createElement("canvas");
        _cv.id = "fx-visor";
        _cv.setAttribute("aria-hidden", "true");
        _cv.hidden = true;
        after.parentNode.insertBefore(_cv, after.nextSibling);
      }
    }
    _ctx = _cv && _cv.getContext ? _cv.getContext("2d") : null;
    if (!_ctx) { _cv = null; return null; }
    // A visor setting change repaints at once; the port image is rebuilt only for the settings it shows (not a beams slider drag).
    if (typeof CockpitOpts !== "undefined" && CockpitOpts.onWheel) CockpitOpts.onWheel((name) => { if (name && name.startsWith("visor")) { if (name !== "visorBeams") _portKey = ""; _acc = 1; } });
    Log.info("game", "VisorOptics: helmet visor overlay ready");
    return _cv;
  }

  function _size() {
    if (typeof window === "undefined") return false;
    const w = Math.max(1, window.innerWidth | 0), h = Math.max(1, window.innerHeight | 0);
    if (w === _w && h === _h && (!_cv || _cv.width === w)) return false;
    _w = w; _h = h;
    if (_cv) { _cv.width = w; _cv.height = h; }   // 1 css px per device px: the layer is soft light, never detail
    // The sheen and the fringe are stroked INSIDE the port edge (inset paths), where the glass is clear; on the
    // edge itself the bezel's falloff would swallow them.
    const base = Math.min(w, h);
    _paths = typeof Path2D === "function" ? { edge: new Path2D(portPath(w, h, 0)), rim: new Path2D(portPath(w, h, base * 0.03)), out: new Path2D(portPath(w, h, base * 0.006)), inn: new Path2D(portPath(w, h, base * 0.014)) } : null;
    return true;
  }

  /** The TINT colour for a lens choice: body's computed --visor-lens (`#rrggbb` or `rgb(…)`, var() resolved), else the table. */
  function tintRGB(color) {
    const fallback = TINT[color] || TINT.neutral;
    try {
      if (typeof getComputedStyle !== "function" || typeof document === "undefined" || !document.body) return fallback;
      const raw = String(getComputedStyle(document.body).getPropertyValue("--visor-lens") || "").trim();
      let m = /^#([0-9a-f]{6})$/i.exec(raw);
      if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
      m = /^#([0-9a-f]{3})$/i.exec(raw);
      if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
      m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(raw);
      if (m) return [+m[1], +m[2], +m[3]];
    } catch (_) { /* no computed style here */ }
    return fallback;
  }

  /** The port image on body (--visor-port) for the current size and tint; rebuilt only when either changes. */
  function _port() {
    if (!_helmet() || typeof document === "undefined" || !document.body || !document.body.style) return;
    const visor = _opt("visor", "off"), color = _opt("visorColor", "neutral"), strength = _opt("visorIntensity", "light");
    const key = _w + "x" + _h + "|" + visor + "|" + color + "|" + strength;
    if (key === _portKey) return;
    _portKey = key;
    // OFF is no visor at all: the eye-port (bezel, cheek pads, oval falloff) goes with it, or the plain helmet
    // view keeps an oval frame the player switched off.
    if (visor === "off") {
      document.body.style.removeProperty("--visor-port");
      document.body.removeAttribute("data-visor-port");
      return;
    }
    const tinted = visor === "smoke";
    document.body.style.setProperty("--visor-port", portImage(_w, _h, { tint: tinted ? tintRGB(color) : null, tintAlpha: tinted ? TINT_ALPHA[strength] || TINT_ALPHA.light : 0 }));
    document.body.setAttribute("data-visor-port", "1");
  }

  /** The rim-shaped displacement map behind filter: url(#visor-bend-*). The map is a 128² image stretched over the
   *  viewport; its red/green channels move the sample INWARD by an amount that is zero across the centre and
   *  peaks at the port edge, so the bend follows the aperture and never exposes pixels outside the scene.
   *  SVG displacement reads sRGB channels: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap */
  function _bend() {
    if (typeof document === "undefined" || !document.createElementNS || !document.createElement) return;
    const level = _opt("visorRefraction", "off");
    if (level === "off") return;
    const key = _w + "x" + _h;
    if (key === _bendKey) return;
    const N = 128, map = document.createElement("canvas"); map.width = map.height = N;
    const g = map.getContext("2d", { willReadFrequently: true });   // a CPU canvas: getImageData/toDataURL without a GPU readback
    if (!g || !g.createImageData || !g.getImageData) return;
    // Rasterise the port at map resolution, then blur it into a soft inside/outside field F.
    g.fillStyle = "#000"; g.fillRect(0, 0, N, N);
    g.save(); g.scale(N / _w, N / _h); g.fillStyle = "#fff";
    if (typeof Path2D === "function") g.fill(new Path2D(portPath(_w, _h, 0)));
    else g.fillRect(_w * 0.03, _h * 0.08, _w * 0.94, _h * 0.84);
    g.restore();
    const src = g.getImageData(0, 0, N, N).data, F = new Float32Array(N * N), T = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) F[i] = src[i * 4] / 255;
    const R = 9;   // blur radius in texels: the width of the bend band (≈7 % of the frame)
    const blur = (src, dst, stepIn, stepOut) => {   // one box pass along an axis with a running window (edge-clamped)
      for (let line = 0; line < N; line++) {
        const base = line * stepOut;
        let s = 0;
        for (let k = -R; k <= R; k++) s += src[base + clampTo(k, 0, N - 1) * stepIn];
        for (let x = 0; x < N; x++) {
          dst[base + x * stepIn] = s / (2 * R + 1);
          s += src[base + clampTo(x + R + 1, 0, N - 1) * stepIn] - src[base + clampTo(x - R, 0, N - 1) * stepIn];
        }
      }
    };
    for (let pass = 0; pass < 2; pass++) { blur(F, T, 1, N); blur(T, F, N, 1); }
    const px = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const gx = (F[y * N + Math.min(N - 1, x + 1)] - F[y * N + Math.max(0, x - 1)]) * 0.5;
      const gy = (F[Math.min(N - 1, y + 1) * N + x] - F[Math.max(0, y - 1) * N + x]) * 0.5;
      const gl = Math.hypot(gx, gy) || 1, edge = 4 * F[i] * (1 - F[i]);      // 0 in the clear centre and deep bezel, 1 at the rim
      const amt = clampTo(edge * 1.35, 0, 1);
      px.data[i * 4] = Math.round(clampTo(128 + (gx / gl) * amt * 110, 0, 255));       // +R = sample toward +x: along the inward gradient
      px.data[i * 4 + 1] = Math.round(clampTo(128 + (gy / gl) * amt * 110, 0, 255));
      px.data[i * 4 + 2] = 128; px.data[i * 4 + 3] = 255;
    }
    g.putImageData(px, 0, 0);
    const uri = map.toDataURL(), ns = "http://www.w3.org/2000/svg";
    if (!_svg) {
      _svg = document.createElementNS(ns, "svg");
      _svg.setAttribute("width", "0"); _svg.setAttribute("height", "0");
      _svg.setAttribute("aria-hidden", "true"); _svg.style.position = "absolute";
      for (const [lvl, scale] of Object.entries(BEND)) {
        const filter = document.createElementNS(ns, "filter");
        filter.id = "visor-bend-" + lvl;
        for (const [k, v] of Object.entries({ x: 0, y: 0, width: 1, height: 1, "color-interpolation-filters": "sRGB" })) filter.setAttribute(k, v);
        const image = document.createElementNS(ns, "feImage");
        image.setAttribute("width", "100%"); image.setAttribute("height", "100%");
        image.setAttribute("preserveAspectRatio", "none"); image.setAttribute("result", "lens");
        const bend = document.createElementNS(ns, "feDisplacementMap");
        for (const [k, v] of Object.entries({ in: "SourceGraphic", in2: "lens", scale, xChannelSelector: "R", yChannelSelector: "G" })) bend.setAttribute(k, v);
        filter.appendChild(image); filter.appendChild(bend); _svg.appendChild(filter);
      }
      document.body.appendChild(_svg);
    }
    for (const img of _svg.querySelectorAll("feImage")) img.setAttribute("href", uri);
    _bendKey = key; _bendLevelBuilt = level;
  }

  function _show(on) {
    if (on === _shown) return;
    _shown = on;
    if (_cv) _cv.hidden = !on;
    if (!on && _ctx && _w) _ctx.clearRect(0, 0, _w, _h);
  }

  function _glow(g, x, y, r, k, rgb, sx, bloom = 1) {
    if (!(k > 0.004)) return;
    const a = Math.min(1, k);
    // BLOOM: a wide, faint halo under everything else — the post pass's glow around a bright source, carried
    // onto the shield; BLOOM AMOUNT scales both its reach and its weight.
    if (bloom > 0.05) {
      const br = r * (1.8 + 1.2 * bloom), ba = a * 0.16 * Math.min(2, bloom);
      const bg = g.createRadialGradient(x, y, 0, x, y, br);
      const cb = Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," + Math.round(rgb[2]);
      bg.addColorStop(0, "rgba(" + cb + "," + ba.toFixed(3) + ")");
      bg.addColorStop(0.5, "rgba(" + cb + "," + (ba * 0.4).toFixed(3) + ")");
      bg.addColorStop(1, "rgba(" + cb + ",0)");
      g.fillStyle = bg; g.beginPath(); g.arc(x, y, br, 0, Math.PI * 2); g.fill();
    }
    // A bright core with a wide, faint skirt: the specular image of the source plus its diffuse spread across the shield.
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    const c = Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," + Math.round(rgb[2]);
    grad.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
    grad.addColorStop(0.18, "rgba(" + c + "," + (a * 0.55).toFixed(3) + ")");
    grad.addColorStop(0.5, "rgba(" + c + "," + (a * 0.18).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(" + c + ",0)");
    g.save(); g.translate(x, y); g.scale(sx, 1); g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    // The smear: the shield's horizontal curvature drags every bright source into a faint streak across it.
    g.scale(3.2, 0.32); g.globalAlpha = 0.35;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1; g.restore();
  }

  // Fixed ray table: eleven uneven spokes (angle, relative length, relative strength), so the rays read as the
  // scratch pattern of one shield and never spin or shimmer as the sun moves.
  const RAYS = [[0.12, 1.0, 1], [0.71, 0.7, 0.6], [1.33, 0.9, 0.8], [1.9, 0.55, 0.5], [2.47, 0.95, 0.9], [3.05, 0.6, 0.5], [3.6, 1.0, 1], [4.2, 0.65, 0.6], [4.75, 0.85, 0.7], [5.3, 0.5, 0.4], [5.85, 0.9, 0.8]];
  function _rays(g, r) {
    const c = Math.round(r.rgb[0]) + "," + Math.round(r.rgb[1]) + "," + Math.round(r.rgb[2]);
    for (const [ang, lenF, kF] of RAYS) {
      const a = Math.min(1, r.k * kF * 0.7);
      if (a < 0.004) continue;
      const len = r.len * lenF, ex = r.x + Math.cos(ang) * len, ey = r.y + Math.sin(ang) * len;
      const grad = g.createLinearGradient(r.x, r.y, ex, ey);
      grad.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
      grad.addColorStop(0.3, "rgba(" + c + "," + (a * 0.35).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + c + ",0)");
      const hw = 0.035;   // half-angle of each spoke (radians)
      g.fillStyle = grad; g.beginPath(); g.moveTo(r.x, r.y);
      g.lineTo(r.x + Math.cos(ang - hw) * len, r.y + Math.sin(ang - hw) * len);
      g.lineTo(r.x + Math.cos(ang + hw) * len, r.y + Math.sin(ang + hw) * len);
      g.closePath(); g.fill();
    }
  }
  // A lamp's beam: a soft wedge leaving the glint along the fixture's aim, fading with length.
  function _beam(g, s) {
    const b = s.beam, c = Math.round(s.rgb[0]) + "," + Math.round(s.rgb[1]) + "," + Math.round(s.rgb[2]);
    const ex = s.x + b.dx * b.len, ey = s.y + b.dy * b.len;
    const ang = Math.atan2(b.dy, b.dx);
    const grad = g.createLinearGradient(s.x, s.y, ex, ey);
    grad.addColorStop(0, "rgba(" + c + "," + Math.min(1, b.k).toFixed(3) + ")");
    grad.addColorStop(0.45, "rgba(" + c + "," + (Math.min(1, b.k) * 0.35).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(" + c + ",0)");
    g.fillStyle = grad;
    // Three nested wedges: a wide faint skirt, the body, a narrow bright core — soft across the beam, not a hard cone.
    for (const [hw, al] of [[0.42, 0.25], [0.24, 0.45], [0.1, 0.6]]) {
      g.globalAlpha = al;
      g.beginPath(); g.moveTo(s.x, s.y);
      g.lineTo(s.x + Math.cos(ang - hw) * b.len, s.y + Math.sin(ang - hw) * b.len);
      g.lineTo(s.x + Math.cos(ang + hw) * b.len, s.y + Math.sin(ang + hw) * b.len);
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  }
  // The star flare of a hard point source: six fixed spokes through the glint, the longest horizontal (the
  // shield's curvature stretches that way), fading to nothing at their tips.
  const STAR = [[0, 1], [Math.PI, 1], [0.52, 0.55], [0.52 + Math.PI, 0.55], [2.62, 0.55], [2.62 + Math.PI, 0.55]];
  function _star(g, s) {
    const c = Math.round(s.rgb[0]) + "," + Math.round(s.rgb[1]) + "," + Math.round(s.rgb[2]);
    const a = Math.min(1, s.star.k);
    for (const [ang, lf] of STAR) {
      const len = s.star.len * lf, ex = s.x + Math.cos(ang) * len, ey = s.y + Math.sin(ang) * len;
      const grad = g.createLinearGradient(s.x, s.y, ex, ey);
      grad.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + c + ",0)");
      g.strokeStyle = grad; g.lineWidth = Math.max(1.5, s.r * 0.08);
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(ex, ey); g.stroke();
    }
  }

  function _paint(m) {
    const g = _ctx, w = _w, h = _h;
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    const base = Math.min(w, h);
    // Sky haze along the brow (daylight only): the top of the shield mirrors the sky.
    if (m.haze > 0.004) {
      const grad = g.createLinearGradient(0, 0, 0, h * 0.45);
      grad.addColorStop(0, "rgba(200,215,235," + m.haze.toFixed(3) + ")");
      grad.addColorStop(1, "rgba(200,215,235,0)");
      g.fillStyle = grad; g.fillRect(0, 0, w, h * 0.45);
    }
    // Fresnel rim sheen: a band along the port edge, brightest on the sun's side, fading across to the far side.
    if (m.rim && _paths) {
      const R = Math.hypot(w, h) * 0.5, cx = w / 2, cy = h / 2;
      const grad = g.createLinearGradient(cx + m.rim.dx * R, cy + m.rim.dy * R, cx - m.rim.dx * R, cy - m.rim.dy * R);
      const c = Math.round(m.rim.rgb[0]) + "," + Math.round(m.rim.rgb[1]) + "," + Math.round(m.rim.rgb[2]);
      grad.addColorStop(0, "rgba(" + c + "," + Math.min(1, m.rim.k).toFixed(3) + ")");
      grad.addColorStop(0.55, "rgba(" + c + "," + (m.rim.k * 0.25).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + c + "," + (m.rim.k * 0.06).toFixed(3) + ")");
      g.strokeStyle = grad; g.lineWidth = base * 0.07; g.stroke(_paths.rim);
    }
    // The sun and its ghost, then the lamps (drawn wider than tall: the shield curves most horizontally).
    if (m.rays) _rays(g, m.rays);
    if (m.sun) _glow(g, m.sun.x, m.sun.y, m.sun.r * (0.8 + 0.2 * m.bloom), m.sun.k, m.sun.rgb, 2.4, m.bloom);
    if (m.ghost) _glow(g, m.ghost.x, m.ghost.y, m.ghost.r, m.ghost.k, m.ghost.rgb, 1.8, 0);
    for (const s of m.glints) { if (s.beam) _beam(g, s); if (s.star) _star(g, s); _glow(g, s.x, s.y, s.r, s.k, s.rgb, 2.0, m.bloom); }
    // Chromatic fringe at the rim: the lens splits the rim's light, magenta outside and cyan inside the edge.
    if (m.fringe > 0.004 && _paths) {
      g.lineWidth = Math.max(1.5, base * 0.006);
      g.strokeStyle = "rgba(255,70,150," + (m.fringe * 0.7).toFixed(3) + ")"; g.stroke(_paths.out);
      g.strokeStyle = "rgba(70,200,255," + m.fringe.toFixed(3) + ")"; g.stroke(_paths.inn);
    }
    g.globalCompositeOperation = "source-over";
  }

  /** Once per rendered frame (from Droplets.tick). on: an onboard camera, racing, not photo mode. dt 0 = paused
   *  (the last paint stays). vs is unused today (kept for the airflow/heat ideas); reduced: prefers-reduced-motion. */
  function tick(dt, on, vs, reduced) {
    const helmet = _helmet();
    if (!helmet) { _show(false); return; }
    let resized = _size();
    _port();                                                   // the aperture: CLEAR / TINTED build it, OFF clears it
    const visor = _opt("visor", "off");
    const level = LEVEL[_opt("visorReflections", "light")] || 0;
    if (visor === "off" || !on || _low()) { _show(false); return; }
    // The world filter is independent of the reflection canvas, including on resize.
    const t2 = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    _bend();
    if (t2 && _bendKey && !_stats.msBend) _stats.msBend = r2(performance.now() - t2);
    if (!(level > 0)) { _show(false); return; }
    const t1 = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    if (!_lookup()) return;
    if (_size()) resized = true;                               // idempotent: sizes a canvas _lookup just made (visor first turned on mid-helmet)
    if (t1 && !_stats.msLookup) _stats.msLookup = r2(performance.now() - t1);
    _syncBlend(t1 || Date.now());
    _show(true);
    const hz = reduced ? HZ_REDUCED : HZ;
    _acc += dt > 0 ? dt : 0;
    if (!resized && _acc < 1 / hz) return;
    if (!(dt > 0) && !resized) return;                         // paused: keep the last paint
    _acc = 0;
    const t0 = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    const scene = readScene();
    if (!scene) return;
    const fringe = FRINGE[_opt("visorRefraction", "off")] || 0;
    const beams = _beams();
    const kn = readKnobs(t0 || 0);
    let m;
    try {
      m = lightMap(scene, _w, _h, { level, fringe, smoke: visor === "smoke", tint: visor === "smoke" ? tintRGB(_opt("visorColor", "neutral")) : null, bloom: kn.bloom, glare: kn.glare, beams });
      _paint(m);
    } catch (e) {
      // Cosmetic layer: a bad frame (a non-finite gradient, a hook mid-rebuild) must never take the render loop
      // down with it. Clear the glass, say so once, and try again next tick.
      if (!_stats.errors++) Log.warn("game", "VisorOptics: paint skipped — " + (e && e.message ? e.message : e));
      if (_ctx) _ctx.clearRect(0, 0, _w, _h);
      return;
    }
    _stats.ticks++; _stats.paints++;
    _stats.glints = m.glints.length; _stats.sun = m.sun ? r2(m.sun.k) : 0; _stats.rim = m.rim ? r2(m.rim.k) : 0;
    _stats.lamp = m.glints.length ? r2(m.glints[0].k) : 0;
    if (t0) { const ms = performance.now() - t0; _stats.msLast = ms; _stats.msSum += ms; if (ms > _stats.msMax) _stats.msMax = ms; }
  }

  /** Probe / test surface: paint counts, CPU ms per paint and the last map's headline intensities. */
  function stats() {
    return { shown: _shown, w: _w, h: _h, ticks: _stats.ticks, paints: _stats.paints, msLast: r2(_stats.msLast), msMax: r2(_stats.msMax),
             msAvg: _stats.paints ? r2(_stats.msSum / _stats.paints) : 0, glints: _stats.glints, sun: _stats.sun, rim: _stats.rim, lamp: _stats.lamp,
             port: !!_portKey, bend: _bendLevelBuilt, blend: _blend, msBend: _stats.msBend, msLookup: _stats.msLookup, errors: _stats.errors };
  }
  function clear() { _show(false); }

  /** Live scene snapshot for __apex.visorScene — keeps apex.js a one-line delegate. */
  function sceneFromG(G) {
    return {
      eye: G.camEye, tgt: G.camTgt, fov: G.camFov,
      sunDir: G.frame.sunDir, sunColor: G.frame.sunColor, exposure: G.frame.exposure != null ? G.frame.exposure : 1,
      ambientSky: G.frame.ambientSky, lights: G.frame.lights, tailStart: G.frame.tailStart, floodEmit: G._lastFloodEmit,
    };
  }

  return { tick, clear, stats, blendMode, lightMap, sunFacing, lampAdapt, portPath, portBox, portImage, camBasis, projectDir, tintRGB, LEVEL, BEAMS, FRINGE, MAX_GLINTS, sceneFromG };
})();
Object.freeze(VisorOptics);
