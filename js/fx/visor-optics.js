/* Apex 26 — VisorOptics: the HELMET camera's eye-port and the light on the inside of its shield.
 *
 * Three parts share the same source maps across backends. Direct TLX FXAA samples BEND and dry LIGHT inside the final pass.
 *   PORT    the helmet's eye-port as an SVG image on #hud::before (css/helmet-visor.css): a wide, flat-browed
 *           aperture with rounded lower corners, cheek pads in the periphery and a chin bar below — not a centred
 *           ellipse. Built per viewport aspect (resize only) and per tint setting; nothing per frame.
 *   LIGHT   a <canvas id="fx-visor"> composited with mix-blend-mode: plus-lighter (screen where unsupported), so
 *           reflections are ADDED light and can never grey the scene — on WebGPU. On the WebGL2 path (TLX's WebGL2
 *           backend, GLX) the layer composites as plain "over" instead (blendMode(), #3657). Repainted at ~15 Hz
 *           from the scene lighting game.js publishes on G (bind → sceneFromG; else window.__apex visorScene() / camState() + lightState()):
 *           the sun's glint and its double-reflection ghost, a Fresnel rim sheen on the sun's side, one glint per
 *           flood / street lamp / tail-light in view (projected through the camera, so they slide with heading),
 *           and a chromatic fringe along the rim that scales with VISOR REFRACTION. Every term is proportional to
 *           the light that reaches the shield, so a dark scene adds nothing.
 *   BEND    the feDisplacementMap the refraction filter reads (filter: url(#visor-bend-*) on the world canvas,
 *           css/helmet-visor.css): zero across the centre, strongest at the port's rim, following its shape.
 *
 * The lighting→visor mapping (lightMap) and the port geometry (portPath) are pure functions, unit-tested in
 * tests/unit/visor-optics.test.mjs. Droplets.tick (js/fx/droplets.js, game.js's per-frame onboard-overlay
 * heartbeat) calls tick(); nothing here touches the simulation. One CSS-pixel canvas with a phone budget
 * for repaint cadence and decorative complexity; synchronous paint statistics exclude compositor cost. */
const VisorOptics = (function () {
  "use strict";

  const HZ = 15;                     // repaint rate; the compositor blends the last frame in between
  const HZ_REDUCED = 8;              // prefers-reduced-motion: the glints still follow the heading, more slowly
  const MAX_GLINTS = 8;              // the brightest lamps in view
  const BUDGETS = [
    { name: "full", hz: HZ, glints: MAX_GLINTS, beams: true },
    { name: "reduced", hz: 10, glints: 4, beams: false },
    { name: "minimal", hz: 6, glints: 2, beams: false },
    { name: "off", hz: 0, glints: 0, beams: false },
  ];
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
  const TINT = { neutral: [12, 12, 20], amber: [80, 61, 32], ice: [35, 59, 80], rose: [76, 45, 60], green: [36, 76, 56], violet: [73, 54, 88], copper: [100, 59, 41] };
  const TINT_ALPHA = { trace: 0.06, light: 0.12, medium: 0.18, strong: 0.24, deep: 0.32 };

  const BLEND_RECHECK_MS = 1000;     // the live backend is re-read this often (it settles once after boot or a fallback)

  let _cv = null, _ctx = null, _looked = false;
  let _blend = "", _blendParam, _blendT = -Infinity;
  let _w = 0, _h = 0, _shown = false, _shed = false, _acc = 1, _bendLevelBuilt = "";
  let _settingsDirty = false;
  let _budget = 0, _paintHz = HZ, _lastHaze = null;
  let _portKey = "", _paths = null, _svg = null;
  // The TINTED lens colour, resolved once per port build. tintRGB() reads getComputedStyle(body): with the HUD
  // restyling every frame that is a forced style recalc of the page, and the 15 Hz paint asked for it on every
  // repaint (39 forced reads per 15 s in a rain race here, up to 2.4 ms each on a desktop CPU).
  let _lens = null, _portW = 0, _portH = 0, _portV = "", _portC = "", _portS = "";
  const _stats = { ticks: 0, paints: 0, msLast: 0, msMax: 0, msSum: 0, glints: 0, sun: 0, rim: 0, lamp: 0, msBend: 0, msLookup: 0, msVisibility: 0, visibilityRays: 0, visibilityCandidates: 0, errors: 0 };
  const _tmpSun = [0, 0, 0], _glintBuf = [];
  const _basis = { fwd: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] };
  // CPU halo geometry is retained once when the cockpit mesh is built. Its actual draw matrix is published
  // before Droplets.tick; no depth readback, screen-space pillar guess or duplicate cockpit rig is needed.
  const _cockpitBlocker = { triangles: null, positions: null, indices: null, nodes: null, bounds: null, inverse: new Float32Array(12) };
  let _rayStack = new Int32Array(64);
  const _occluderMatrix = new Float32Array(16);
  let _occluderGeometry = null;
  const _rayOrigin = [0, 0, 0], _rayDirection = [0, 0, 0];
  let _cockpitBlocked = false;

  const clampTo = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lum = (c) => (c ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] : 0);
  const r2 = (v) => Math.round(v * 100) / 100;

  function setCockpitOccluder(geometry, matrix) {
    const was = _cockpitBlocked;
    _cockpitBlocked = false;
    if (!geometry || !(geometry.triangles?.length >= 9 || (geometry.positions?.length >= 9 && geometry.indices?.length >= 3)) || !geometry.bounds || !matrix) {
      if (was) { _settingsDirty = true; _acc = 1; }
      _occluderGeometry = null;
      return;
    }
    // Invert the affine model transform once per draw. Preserve ray parameters even for scaled geometry.
    const a = matrix[0], b = matrix[4], c = matrix[8], d = matrix[1], e = matrix[5], f = matrix[9],
      g = matrix[2], h = matrix[6], i = matrix[10];
    const det = a * (e * i - f * h) + b * (f * g - d * i) + c * (d * h - e * g);
    if (!Number.isFinite(det) || Math.abs(det) < 1e-10) {
      if (was) { _settingsDirty = true; _acc = 1; }
      _occluderGeometry = null;
      return;
    }
    const geometryChanged = !was || geometry !== _occluderGeometry;
    let matrixChanged = false;
    for (let j = 0; j < 16; j++) {
      if (_occluderMatrix[j] !== matrix[j]) matrixChanged = true;
      _occluderMatrix[j] = matrix[j];
    }
    _occluderGeometry = geometry;
    if (geometryChanged) _acc = 1;
    if (geometryChanged || matrixChanged) _settingsDirty = true;
    if (!geometryChanged && !matrixChanged) { _cockpitBlocked = true; return; }
    const inv = _cockpitBlocker.inverse, k = 1 / det;
    inv[0] = (e * i - f * h) * k; inv[1] = (c * h - b * i) * k; inv[2] = (b * f - c * e) * k;
    inv[4] = (f * g - d * i) * k; inv[5] = (a * i - c * g) * k; inv[6] = (c * d - a * f) * k;
    inv[8] = (d * h - e * g) * k; inv[9] = (b * g - a * h) * k; inv[10] = (a * e - b * d) * k;
    for (let row = 0; row < 12; row += 4)
      inv[row + 3] = -(inv[row] * matrix[12] + inv[row + 1] * matrix[13] + inv[row + 2] * matrix[14]);
    _cockpitBlocker.triangles = geometry.triangles; _cockpitBlocker.bounds = geometry.bounds;
    _cockpitBlocker.positions = geometry.positions; _cockpitBlocker.indices = geometry.indices; _cockpitBlocker.nodes = geometry.nodes;
    if (geometry.nodes && geometry.nodes.length / 10 > _rayStack.length) _rayStack = new Int32Array(geometry.nodes.length / 10);
    _cockpitBlocked = true;
  }

  function rayBox(bounds, offset, maxT) {
    let near = 0, far = maxT;
    for (let axis = 0; axis < 3; axis++) {
      const o = _rayOrigin[axis], d = _rayDirection[axis];
      if (Math.abs(d) < 1e-10) {
        if (o < bounds[offset + axis] || o > bounds[offset + axis + 3]) return false;
      } else {
        const t0 = (bounds[offset + axis] - o) / d, t1 = (bounds[offset + axis + 3] - o) / d;
        near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1));
        if (near > far) return false;
      }
    }
    return true;
  }
  function rayTriangle(p, a, b, c, maxT) {
    const o = _rayOrigin, ray = _rayDirection;
    const ex = p[b] - p[a], ey = p[b + 1] - p[a + 1], ez = p[b + 2] - p[a + 2];
    const fx = p[c] - p[a], fy = p[c + 1] - p[a + 1], fz = p[c + 2] - p[a + 2];
    const px = ray[1] * fz - ray[2] * fy, py = ray[2] * fx - ray[0] * fz, pz = ray[0] * fy - ray[1] * fx;
    const det = ex * px + ey * py + ez * pz;
    if (Math.abs(det) < 1e-10) return false;
    const tx = o[0] - p[a], ty = o[1] - p[a + 1], tz = o[2] - p[a + 2];
    const u = (tx * px + ty * py + tz * pz) / det;
    if (u < 0 || u > 1) return false;
    const qx = ty * ez - tz * ey, qy = tz * ex - tx * ez, qz = tx * ey - ty * ex;
    const v = (ray[0] * qx + ray[1] * qy + ray[2] * qz) / det;
    if (v < 0 || u + v > 1) return false;
    const t = (fx * qx + fy * qy + fz * qz) / det;
    return t > 1e-6 && t < maxT - 1e-6;
  }
  function cockpitBlocks(scene, dx, dy, dz, maxT) {
    const blocker = scene.occluder;
    if (!blocker) return false;
    const inv = blocker.inverse, eye = scene.eye;
    for (let axis = 0; axis < 3; axis++) {
      const r = axis * 4;
      _rayOrigin[axis] = inv[r] * eye[0] + inv[r + 1] * eye[1] + inv[r + 2] * eye[2] + inv[r + 3];
      _rayDirection[axis] = inv[r] * dx + inv[r + 1] * dy + inv[r + 2] * dz;
    }
    if (!rayBox(blocker.bounds, 0, maxT)) return false;
    if (blocker.nodes && blocker.positions && blocker.indices) {
      const nodes = blocker.nodes, indices = blocker.indices, positions = blocker.positions;
      let top = 1; _rayStack[0] = 0;
      while (top) {
        const n = _rayStack[--top] * 10;
        if (!rayBox(nodes, n, maxT)) continue;
        const count = nodes[n + 9] | 0;
        if (count) {
          const start = nodes[n + 8] | 0;
          for (let t = start; t < start + count; t++) {
            const j = t * 3;
            if (rayTriangle(positions, indices[j] * 3, indices[j + 1] * 3, indices[j + 2] * 3, maxT)) return true;
          }
        } else { _rayStack[top++] = nodes[n + 6]; _rayStack[top++] = nodes[n + 7]; }
      }
      return false;
    }
    const triangles = blocker.triangles;
    if (triangles) for (let n = 0; n + 8 < triangles.length; n += 9)
      if (rayTriangle(triangles, n, n + 3, n + 6, maxT)) return true;
    return false;
  }
  function sourceBlocked(scene, dx, dy, dz, maxT) {
    _stats.visibilityRays++;
    if (cockpitBlocks(scene, dx, dy, dz, maxT)) return true;
    return !!(scene.track && typeof TrackGeom !== "undefined" && typeof TrackGeom.lightBlocked === "function"
      && TrackGeom.lightBlocked(scene.track, scene.eye, dx, dy, dz, maxT));
  }
  const _expandedBounds = new Float64Array(6);
  function coneBox(bounds, radius, maxT) {
    const distance = Math.hypot((bounds[0] + bounds[3]) * 0.5 - _rayOrigin[0],
      (bounds[1] + bounds[4]) * 0.5 - _rayOrigin[1], (bounds[2] + bounds[5]) * 0.5 - _rayOrigin[2]);
    const extent = Math.hypot(bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]) * 0.5;
    const length = Math.hypot(_rayDirection[0], _rayDirection[1], _rayDirection[2]);
    if (radius >= length) return true;
    const margin = radius * Math.min(maxT, (distance + extent) / Math.max(1e-6, length - radius));
    for (let i = 0; i < 3; i++) { _expandedBounds[i] = bounds[i] - margin; _expandedBounds[i + 3] = bounds[i + 3] + margin; }
    return rayBox(_expandedBounds, 0, maxT);
  }
  function possibleOcclusion(scene, dx, dy, dz, maxT, radius) {
    const b = scene.occluder, eye = scene.eye;
    if (b) {
      const inv = b.inverse;
      let stretch = 0;
      for (let axis = 0; axis < 3; axis++) {
        const r = axis * 4;
        _rayOrigin[axis] = inv[r] * eye[0] + inv[r + 1] * eye[1] + inv[r + 2] * eye[2] + inv[r + 3];
        _rayDirection[axis] = inv[r] * dx + inv[r + 1] * dy + inv[r + 2] * dz;
        stretch += inv[r] * inv[r] + inv[r + 1] * inv[r + 1] + inv[r + 2] * inv[r + 2];
      }
      // Frobenius norm bounds any affine stretch, so this early-out cannot clip a real disk intersection.
      if (coneBox(b.bounds, radius * Math.sqrt(stretch), maxT)) return true;
    }
    const world = scene.track?._lightOccluders;
    if (!world || !world.boxes?.length || !world.bounds) return false;
    _rayOrigin[0] = eye[0]; _rayOrigin[1] = eye[1]; _rayOrigin[2] = eye[2];
    _rayDirection[0] = dx; _rayDirection[1] = dy; _rayDirection[2] = dz;
    return coneBox(world.bounds, radius, maxT);
  }
  // Fixed disk samples: a solar half-angle of 0.266 degrees, and a nominal 0.15m lamp aperture.
  // This is bounded source-coverage sampling, not a full optical simulation. Low keeps one centre ray.
  const DISK = [[0, 0], [-0.85, 0], [0.85, 0], [0, -0.85], [0, 0.85], [-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]];
  function sourceVisibility(scene, dx, dy, dz, maxT, radius, samples) {
    if ((!scene.occluder && !scene.track?._lightOccluders) || !possibleOcclusion(scene, dx, dy, dz, maxT, radius)) return 1;
    const started = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    const count = samples >= 9 ? 9 : samples >= 5 ? 5 : 1;
    const d = Math.hypot(dx, dy, dz) || 1;
    // A perpendicular disk around the source direction, independent of camera roll.
    let rx = -dz, rz = dx;
    const rl = Math.hypot(rx, rz);
    if (rl < 1e-6) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
    const ux = -dy * rz / d, uy = (dz * rx - dx * rz) / d, uz = dy * rx / d;
    let visible = 0;
    for (let i = 0; i < count; i++) {
      const x = DISK[i][0] * radius, y = DISK[i][1] * radius;
      if (!sourceBlocked(scene, dx + rx * x + ux * y, dy + uy * y, dz + rz * x + uz * y, maxT)) visible++;
    }
    if (started) _stats.msVisibility += performance.now() - started;
    return visible / count;
  }
  // Bounded records keyed by source coordinates, never culled-list rank. Fully hidden sources snap to zero
  // immediately; smoothing only softens partially covered samples and cannot trail glare through a blocker.
  const _coverage = Array.from({ length: 9 }, () => ({ x: NaN, y: 0, z: 0, value: 1, age: -1 }));
  let _coverageEpoch = 0;
  function smoothCoverage(raw, x, y, z, dt, smooth) {
    if (!smooth) return raw;
    let slot = null, oldest = _coverage[0];
    for (const rec of _coverage) {
      if (rec.age >= 0 && rec.x === x && rec.y === y && rec.z === z) { slot = rec; break; }
      if (rec.age < oldest.age) oldest = rec;
    }
    if (!slot) { slot = oldest; slot.x = x; slot.y = y; slot.z = z; slot.value = raw; }
    const v = raw <= 0 || raw >= 1 || !(dt > 0) ? raw : slot.value + (raw - slot.value) * (1 - Math.exp(-Math.min(dt, 0.1) * 30));
    slot.value = v; slot.age = _coverageEpoch;
    return v;
  }

  // Shared analytical lighting for water highlights: normalized screen positions and radius/minDim.
  // Slots and RGB arrays are reused; consumers read once per water paint and never read scene pixels.
  const _lightField = { active: false, width: 0, height: 0, count: 0, revision: 0,
    ambient: [0, 0, 0], ambientStrength: 0,
    sources: Array.from({ length: 9 }, () => ({ x: 0, y: 0, r: 0, k: 0, rgb: [0, 0, 0] })) };
  function lightField() { return _lightField; }
  function clearLightField() {
    if (_lightField.active || _lightField.count) _lightField.revision++;
    _lightField.active = false; _lightField.count = 0; _lightField.ambientStrength = 0;
    _lightField.ambient[0] = _lightField.ambient[1] = _lightField.ambient[2] = 0;
  }
  function publishLightField(m, scene) {
    const f = _lightField, base = Math.max(1, Math.min(_w, _h));
    f.active = true; f.width = _w; f.height = _h; f.count = 0; f.revision++;
    const exp = scene.exposure > 0 ? scene.exposure : 1, amb = scene.ambientSky;
    f.ambientStrength = clampTo(lum(amb) * exp, 0, 1);
    for (let i = 0; i < 3; i++) f.ambient[i] = clampTo((amb ? amb[i] : 0) * exp, 0, 1);
    for (let i = -1; i < m.glints.length && f.count < f.sources.length; i++) {
      const source = i < 0 ? m.sun : m.glints[i];
      if (!source || !(source.k > 0)) continue;
      const dst = f.sources[f.count++];
      dst.x = source.x / _w; dst.y = source.y / _h; dst.r = source.r / base; dst.k = source.k;
      for (let c = 0; c < 3; c++) dst.rgb[c] = source.rgb[c] / 255;
    }
  }
  const _cameraSample = new Float64Array(6);
  let _cameraSampled = false, _motionHold = 0;
  function motionCadence(dt) {
    if (!_G || !_G.camEye || !_G.camTgt || !(dt > 0)) return false;
    const eye = _G.camEye, tgt = _G.camTgt;
    const dx = tgt[0] - eye[0], dy = tgt[1] - eye[1], dz = tgt[2] - eye[2], length = Math.hypot(dx, dy, dz) || 1;
    const fx = dx / length, fy = dy / length, fz = dz / length;
    if (_cameraSampled) {
      const shift = Math.hypot(eye[0] - _cameraSample[0], eye[1] - _cameraSample[1], eye[2] - _cameraSample[2]);
      const turn = Math.hypot(fx - _cameraSample[3], fy - _cameraSample[4], fz - _cameraSample[5]);
      // Ignore tiny helmet jitter; a short hold avoids switching the upload cadence at every threshold crossing.
      if (shift > Math.max(0.02, dt * 25) || turn > Math.max(0.003, dt * 0.3)) _motionHold = 0.2;
      else _motionHold = Math.max(0, _motionHold - dt);
    }
    _cameraSample[0] = eye[0]; _cameraSample[1] = eye[1]; _cameraSample[2] = eye[2];
    _cameraSample[3] = fx; _cameraSample[4] = fy; _cameraSample[5] = fz; _cameraSampled = true;
    return _motionHold > 0;
  }

  // ---------- PORT geometry (pure) ----------

  /** The eye-port box for a viewport: a shallow, wide slot — a helmet's proportions on every aspect (a tall phone
   *  gets a slot across the middle, not a tall oval). The brow band above is thicker than the chin band below,
   *  as the visor's top frame and tear-offs are what a driver's-eye camera sees first. Returns px. */
  function portBox(w, h, shape = "standard") {
    const pw = w * 0.975;
    const ph = Math.min(h * 0.80, pw * 0.62) * (shape === "slit" ? 0.76 : shape === "panoramic" ? 1.13 : 1);
    const cx = w / 2, cy = h * 0.52;
    return { x0: cx - pw / 2, y0: cy - ph / 2, x1: cx + pw / 2, y1: cy + ph / 2, pw, ph };
  }

  /** SVG path of the eye-port outline (clockwise from the top-left), `inset` px inside the true edge.
   *  Shape, from the references (Bell HP77 front view, the Driver's Eye POV frames): a letterbox slot — a near-
   *  straight brow with a slight arch (highest over the nose), straight temples, and rounded corners only, the
   *  lower pair larger where the cheek pads sit. Nothing oval. */
  function portPath(w, h, inset = 0, shape = "standard") {
    const b = portBox(w, h, shape);
    const x0 = b.x0 + inset, x1 = b.x1 - inset, y0 = b.y0 + inset, y1 = b.y1 - inset;
    const pw = x1 - x0, ph = y1 - y0;
    const rt = ph * (shape === "slit" ? 0.16 : shape === "square" ? 0.10 : shape === "rounded" ? 0.42 : 0.30);
    const rb = ph * (shape === "square" ? 0.14 : 0.42), arch = ph * (shape === "rounded" ? 0.12 : 0.06);   // top corner radius, bottom corner radius, brow apex rise
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
  function portImage(w, h, { tint = null, tintAlpha = 0, shape = "standard" } = {}) {
    const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
    const b = portBox(W, H, shape);
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
      + '<path fill="' + bezel + '" fill-opacity="0.55" fill-rule="evenodd" filter="url(#w)" d="' + frame + portPath(W, H, soft * 0.9, shape) + '"/>'
      // the bezel with the true edge, blurred just enough to anti-alias into a soft line
      + '<path fill="' + bezel + '" fill-opacity="0.93" fill-rule="evenodd" filter="url(#s)" d="' + frame + portPath(W, H, 0, shape) + '"/>'
      // cheek pads: a hint of the lighter padding fabric in both lower corners of the bezel
      + '<ellipse cx="' + Math.round(b.x0 + b.pw * 0.02) + '" cy="' + padY + '" rx="' + padR + '" ry="' + Math.round(padR * 0.55) + '" fill="#2a2a30" fill-opacity="0.28" filter="url(#p)"/>'
      + '<ellipse cx="' + Math.round(b.x1 - b.pw * 0.02) + '" cy="' + padY + '" rx="' + padR + '" ry="' + Math.round(padR * 0.55) + '" fill="#2a2a30" fill-opacity="0.28" filter="url(#p)"/>'
      + "</svg>";
    // Minimal escaping for a double-quoted CSS url(): the SVG's own quotes become apostrophes, and only the
    // characters a data URI cannot carry raw are percent-encoded (the result stays readable in a stylesheet dump).
    return 'url("data:image/svg+xml,' + svg.replace(/"/g, "'").replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E") + '")';
  }

  // ---------- camera (pure) ----------

  // `roll` (G.camRoll, rad) tilts the basis as game.js's view matrix does (#5018).
  function camBasis(eye, tgt, out, roll) {
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
    const sr = roll ? Math.sin(roll) : 0;
    if (sr && rl > 1e-6) {
      const ux = rx * sr, uz = rz * sr;                                  // u = worldUp + right·sin(roll)
      let sx = fy * uz - fz, sy = fz * ux - fx * uz, sz = fx - fy * ux;   // right' = fwd × u
      const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      o.right[0] = sx; o.right[1] = sy; o.right[2] = sz;
      o.up[0] = sy * fz - sz * fy; o.up[1] = sz * fx - sx * fz; o.up[2] = sx * fy - sy * fx;   // up' = right' × fwd
    }
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
  function lightMap(scene, w, h, { level = 1, fringe = 0, smoke = false, tint = null, bloom = 1, glare = 0.12, beams = 1, glintLimit = MAX_GLINTS, style = "classic", visibilitySamples = 1, smoothVisibility = false, visibilityDt = 0 } = {}) {
    const out = { sun: null, ghost: null, rays: null, rim: null, glints: [], fringe: 0, haze: 0, bloom: clampTo(bloom, 0, 2.5) };
    if (!scene || !scene.eye || !scene.tgt || !(level > 0)) return out;
    // VISOR BEAMS: one scale for every streak — the lamps' beams, the sun's rays, the star flares; 0 keeps the glints alone.
    const bm = Number.isFinite(beams) ? clampTo(beams, 0, 2) : 1;
    if (smoothVisibility) _coverageEpoch++;
    const basis = camBasis(scene.eye, scene.tgt, _basis, scene.roll);
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
    const sunVisible = sd && key > 0.02 && sunUp > 0.01
      ? smoothCoverage(sourceVisibility(scene, sd[0], sd[1], sd[2], Infinity, 0.00465, visibilitySamples), Infinity, 0, 0, visibilityDt, smoothVisibility) : 0;
    if (sunVisible > 0) {
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
          const k = clampTo(2.0 * key * sunUp * gain * fade, 0, 1.4) * sunVisible;
          const x = clampTo(p.x, -0.08 * w, 1.08 * w), y = clampTo(p.y, -0.08 * h, 1.08 * h);
          out.sun = { x, y, k, r: base * 0.12 * (1 + 0.5 * (1 - fade)), rgb };
          // Fade the scratch rays and ghost over six degrees beyond the view instead of popping at its edge.
          // Keep their true projected source: the clamped rim glow must never drag a ray origin onto the frame.
          const edge = clampTo(over / (6 * Math.PI / 180), 0, 1);
          const rayFade = 1 - edge * edge * (3 - 2 * edge);
          if (rayFade > 0) out.ghost = { x: w - p.x, y: h - p.y, k: k * 0.15 * rayFade, r: base * 0.18, rgb };
          // These are visor diffraction spokes, independent of the world's volumetric god-ray pass.
          if (rayFade > 0 && bm > 0) out.rays = { x: p.x, y: p.y, k: k * bm * 0.35 * rayFade, len: Math.hypot(w, h) * 0.35 * (0.7 + 0.3 * bm), rgb };
        }
      }
      // Fresnel rim sheen: the inner rim is seen at grazing angles, where reflectance climbs, and it is lit on
      // the sun's side of the view. Only light coming in through the shield reaches it: the helmet shell shades
      // the visor from a sun behind the eye, so the sheen is full with the sun ahead or level with the eye and
      // fades to nothing once it is ~120° behind (sunFacing). It used to peak with the sun behind (A·W46).
      const side = Math.hypot(p.sx, p.sy);
      const rake = sunFacing(p.z) * (0.35 + 0.3 * side);
      const rk = clampTo(1.0 * key * sunUp * rake * gain, 0, 1) * sunVisible;
      if (rk > 0.004) out.rim = { k: rk, dx: side > 1e-3 ? p.sx / side : 0, dy: side > 1e-3 ? -p.sy / side : -1, rgb };
      sceneLight += key * sunUp * sunVisible;
    }

    // Sky haze on the brow: the sky reflected in the top of the shield; only a daylight sky is bright enough.
    const amb = clampTo(lum(scene.ambientSky) * exp, 0, 2);
    out.haze = clampTo(0.12 * amb * gain, 0, 0.16);
    const lampVis = lampAdapt(key * sunUp + amb);
    sceneLight += amb * 0.5;

    // Lamp glints: each light in this frame's culled list, projected; the brightest MAX_GLINTS kept.
    const L = scene.lights;
    if (L && L.length >= LIGHT_STRIDE) {
      const eye = scene.eye, f = (h / 2) / Math.tan((scene.fov || 62) * Math.PI / 360);
      _glintBuf.length = 0;
      for (let i = 0; i + LIGHT_STRIDE <= L.length; i += LIGHT_STRIDE) {
        // Match the world's fixture halo contract: synthetic road fills have no visible lens to reflect.
        const glareW = L[i + 14];
        if (!(glareW > 0) || !Number.isFinite(glareW)) continue;
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
        const energy = LAMP_GAIN * Math.sqrt(Math.max(0, lum([L[i + 3], L[i + 4], L[i + 5]]) * exp) / d2) * (0.5 + 0.5 * beam) * glareW;
        // Compress fixture energy BEFORE the user's gain, so bright floods retain distinct strength settings.
        // Adaptation and edge fading follow the compression so they can still extinguish a very bright source.
        const fogDistance = dl * Math.max(0, scene.fogDensity || 0) * Math.exp(-Math.max(0, dy) * Math.max(0, scene.fogHeight || 0));
        const transmission = Math.exp(-fogDistance * fogDistance);
        const kl = energy / (1 + energy) * edgeFade * lampVis * transmission;
        if (kl < 0.15) continue;                                // distant fixtures disappear into the same fog as the world
        const m = Math.max(1e-3, L[i + 3], L[i + 4], L[i + 5]);
        // The fixture's aim on screen (its cone): a faint beam leaves each glint that way — the floods' light
        // seen in the haze and on the shield, pointing where the lamp points.
        const bx = L[i + 7] * basis.right[0] + L[i + 8] * basis.right[1] + L[i + 9] * basis.right[2];
        const by = -(L[i + 7] * basis.up[0] + L[i + 8] * basis.up[1] + L[i + 9] * basis.up[2]);
        const bl = Math.hypot(bx, by);
        const vol = Number.isFinite(L[i + 13]) ? clampTo(L[i + 13], 0, 2) : 0;
        _glintBuf.push({ x, y, k: kl, d: dl, source: i, rgb: [L[i + 3] / m * 255, L[i + 4] / m * 255, L[i + 5] / m * 255], bx: bl > 1e-3 ? bx / bl : 0, by: bl > 1e-3 ? by / bl : 1, beam, vol });
      }
      _glintBuf.sort((a, b) => b.k - a.k);
      const n = Math.min(MAX_GLINTS, Math.max(0, glintLimit | 0), _glintBuf.length);
      // Look beyond blocked bright lamps, but cap visibility work even when the whole city is occluded.
      // Full detail examines at most 32 candidates; reduced/minimal examine 16. A dimmer source past the
      // ceiling is omitted rather than inventing visibility or spending unbounded ray queries to find it.
      const candidateLimit = Math.min(_glintBuf.length, Math.max(16, n * 4));
      for (let i = 0; i < candidateLimit && out.glints.length < n; i++) {
        const g = _glintBuf[i];
        _stats.visibilityCandidates++;
        const sx = L[g.source], sy = L[g.source + 1], sz = L[g.source + 2];
        const visible = smoothCoverage(sourceVisibility(scene, sx - eye[0], sy - eye[1], sz - eye[2], 1, 0.15, visibilitySamples), sx, sy, sz, visibilityDt, smoothVisibility);
        if (!(visible > 0)) continue;
        const k = clampTo(g.k * gain * (0.7 + 0.3 * clampTo(glare / 0.12, 0, 2.5)), 0, 1.2) * visible;   // LENS GLARE lifts the cores
        // Nearer fixtures smear wider across the curved shield; far ones stay small.
        const r = base * clampTo(0.035 + 1.5 / Math.max(8, g.d), 0.035, 0.10) * (0.8 + 0.2 * out.bloom);
        out.glints.push({ x: g.x, y: g.y, k, r, rgb: g.rgb,
          // The fixture's beam, seen in the air and on the shield: longer and brighter the harder the lamp hits the eye.
          beam: bm > 0 && k > 0.25 && g.vol > 0 ? { dx: g.bx, dy: g.by, len: base * (0.16 + 0.24 * g.beam) * clampTo(k, 0, 1) * (0.6 + 0.4 * bm), k: k * 0.24 * bm * g.vol } : null,
          // A star flare on the brightest three: the shield's micro-scratches split a hard point source into spokes.
          star: bm > 0 && out.glints.length < 3 && k > 0.45 ? { len: r * 2.8 * (0.7 + 0.3 * bm), k: k * 0.2 * bm } : null });
        sceneLight += g.k * visible * 0.6;
      }
    }

    // Chromatic fringe: a lens property, but ADDED colour, so it needs light in the scene to show.
    out.fringe = clampTo(fringe * clampTo(sceneLight, 0, 1) * 0.22 * level, 0, 0.28);
    if (tint && out.sun) { const t = tint; out.sun.rgb = [(out.sun.rgb[0] * 2 + t[0]) / 3, (out.sun.rgb[1] * 2 + t[1]) / 3, (out.sun.rgb[2] * 2 + t[2]) / 3]; }
    if (style === "compact" || style === "scratches") {
      // Fixed per-source attenuation: a new lamp cannot dim another one. Eight bounded 1.2 cores sum to
      // at most 2.4 after this scale; this is an amplitude limit, not a physical energy-conservation model.
      out.bloom *= 0.5;
      out.ghost = null;
      if (out.sun) { out.sun.k *= 0.8; out.sun.r *= 0.7; }
      if (style === "scratches" && out.rays) {
        out.rays.k *= 0.18;
        out.rays.len = base * 0.22 * (0.7 + 0.3 * bm);
        out.rays.short = true;
      } else out.rays = null;
      for (const g of out.glints) {
        g.k *= 0.25; g.r *= 0.7; g.beam = null;
        // Every selected fixture gets the same response; no top-three rank bonus that jumps between lamps.
        g.star = style === "scratches" && bm > 0
          ? { len: g.r * 1.7 * (0.7 + 0.3 * bm), k: g.k * 0.25 * bm, short: true } : null;
      }
    }
    return out;
  }

  // ---------- scene reader ----------

  // The scene comes from game.js's G façade, handed in by bind(G) at boot — NOT only through window.__apex: the
  // agent surface is LAZY_AGENT, absent on a player's Pages build, and gating on it left the visor glint unpainted
  // for every player. G is a function-scoped const inside game.js's IIFE, so a `typeof G` read from this script is
  // always "undefined" (#5964): it has to be passed in.
  let _G = null;
  function bind(G) { _G = G || null; }
  function readScene() {
    try {
      if (_G && _G.frame) return sceneFromG(_G);
    } catch (_) { /* G mid-boot: try the agent surface */ }
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
  // Read measured/crash pressure, never the user's tier floor: a healthy MEDIUM phone stays full.
  // Reuse the governor's settling/latch policy; resizing this canvas on each step would add allocation hitches.
  function _pressureBudget() {
    if (typeof GLX === "undefined" || !GLX.isMobile || typeof PerfGov === "undefined") return 0;
    if (typeof PerfGov.lookPostShed === "function" && PerfGov.lookPostShed()) return 3;
    const p = typeof PerfGov.autoShed === "function" ? PerfGov.autoShed() : 0;
    return p >= 2 ? 2 : p >= 1 ? 1 : 0;
  }
  function _syncBudget(budget) {
    if (budget === _budget) return false;
    _budget = budget; _shed = budget === 3;
    if (document.body) {
      if (_shed) document.body.setAttribute("data-visor-shed", "1");
      else document.body.removeAttribute("data-visor-shed");
      if (budget) document.body.setAttribute("data-visor-budget", String(budget));
      else document.body.removeAttribute("data-visor-budget");
    }
    _acc = 1;   // a profile change repaints once immediately, including while paused
    return true;
  }

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
    // tick measured the layout before lookup; size a newly acquired canvas for its first paint.
    _sizeLightCanvas(_w, _h);
    // A visor setting change repaints at once; the port image is rebuilt only for the settings it shows (not a beams slider drag).
    if (typeof CockpitOpts !== "undefined" && CockpitOpts.onWheel) CockpitOpts.onWheel((name) => { if (name && name.startsWith("visor")) { if (name === "visorColor") _portKey = ""; _settingsDirty = true; _acc = 1; } });
    Log.info("game", "VisorOptics: helmet visor overlay ready");
    return _cv;
  }

  let _viewport = null, _shape = "standard";
  function _sizeLightCanvas(w, h) {
    const lightW = Math.ceil(w / 2), lightH = Math.ceil(h / 2);
    if (_cv.width !== lightW) _cv.width = lightW;
    if (_cv.height !== lightH) _cv.height = lightH;
    _ctx.setTransform(_cv.width / w, 0, 0, _cv.height / h, 0, 0);
  }
  function _size() {
    if (typeof window === "undefined") return false;
    // The layout viewport (ICB) the fixed 100% layer is laid out in, not inner*: a Home Screen landscape launch can hold
    // the portrait inner* pair with no resize to follow, and a 393x852 store stretched over the 852x393 box bent the
    // port (#5201). No layout (unit harness): inner*.
    const de = document.documentElement;
    if (!_viewport && de && typeof CanvasCssSize !== "undefined") _viewport = CanvasCssSize.create(de, { settleFrames: 3 });
    const boxSize = _viewport && _viewport.read();
    const bw = boxSize ? boxSize.width : de ? de.clientWidth | 0 : 0;
    const bh = boxSize ? boxSize.height : de ? de.clientHeight | 0 : 0;
    const box = bw > 0 && bh > 0;
    const w = Math.max(1, box ? bw : window.innerWidth | 0), h = Math.max(1, box ? bh : window.innerHeight | 0);
    const lightW = Math.ceil(w / 2), lightH = Math.ceil(h / 2);
    const shape = _opt("visorShape", "standard");
    const resized = w !== _w || h !== _h;
    const geometryChanged = shape !== _shape || resized;
    if (shape !== _shape) {
      _shape = shape;
      _portKey = "";
      _bendW = 0;
    }
    if (!geometryChanged && (!_cv || (_cv.width === lightW && _cv.height === lightH))) return false;
    _w = w; _h = h; _lastHaze = null;
    if (_cv && (resized || _cv.width !== lightW || _cv.height !== lightH)) {
      // The broad reflected light is low-frequency. Keep projection, stroke widths
      // and paths in CSS pixels, and leave the bezel and scene at full resolution.
      _sizeLightCanvas(w, h);
    }
    // The sheen and the fringe are stroked INSIDE the port edge (inset paths), where the glass is clear; on the
    // edge itself the bezel's falloff would swallow them.
    if (!geometryChanged && _paths) return true;
    const base = Math.min(w, h);
    _paths = typeof Path2D === "function" ? { edge: new Path2D(portPath(w, h, 0, _shape)), rim: new Path2D(portPath(w, h, base * 0.03, _shape)), out: new Path2D(portPath(w, h, base * 0.006, _shape)), inn: new Path2D(portPath(w, h, base * 0.014, _shape)) } : null;
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
  function _port(visor) {
    if (!document.body.style) return;
    const color = _opt("visorColor", "amber"), strength = _opt("visorIntensity", "medium");
    if (_portKey && _w === _portW && _h === _portH && visor === _portV && color === _portC && strength === _portS) return;   // no per-frame key string
    _portW = _w; _portH = _h; _portV = visor; _portC = color; _portS = strength;
    _portKey = _w + "x" + _h + "|" + visor + "|" + color + "|" + strength;
    // OFF is no visor at all: the eye-port (bezel, cheek pads, oval falloff) goes with it, or the plain helmet
    // view keeps an oval frame the player switched off.
    if (visor === "off") {
      _lens = null;
      document.body.style.removeProperty("--visor-port");
      document.body.removeAttribute("data-visor-port");
      return;
    }
    const tinted = visor === "smoke";
    _lens = tinted ? tintRGB(color) : null;
    document.body.style.setProperty("--visor-port", portImage(_w, _h, { shape: _shape, tint: _lens, tintAlpha: tinted ? TINT_ALPHA[strength] || TINT_ALPHA.light : 0 }));
    document.body.setAttribute("data-visor-port", "1");
  }

  /** The rim-shaped displacement map behind filter: url(#visor-bend-*). The map is a 128² image stretched over the
   *  viewport; its red/green channels move the sample INWARD by an amount that is zero across the centre and
   *  peaks at the port edge, so the bend follows the aperture and never exposes pixels outside the scene.
   *  SVG displacement reads sRGB channels: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap */
  const bendField = { data: null, size: 128, x: 0, y: 0 };
  let _bendActive = false, _lightValid = false, _folded = false, _bendW = 0, _bendH = 0;
  function _bend(level) {
    if (typeof document === "undefined" || !document.createElementNS || !document.createElement) return;

    bendField.x = BEND[level] / _w; bendField.y = BEND[level] / _h;
    if (_w === _bendW && _h === _bendH) return;
    const N = bendField.size, map = document.createElement("canvas"); map.width = map.height = N;
    const g = map.getContext("2d", { willReadFrequently: true });   // a CPU canvas: getImageData/toDataURL without a GPU readback
    if (!g || !g.createImageData || !g.getImageData) return;
    // Rasterise the port at map resolution, then blur it into a soft inside/outside field F.
    g.fillStyle = "#000"; g.fillRect(0, 0, N, N);
    g.save(); g.scale(N / _w, N / _h); g.fillStyle = "#fff";
    if (typeof Path2D === "function") g.fill(new Path2D(portPath(_w, _h, 0, _shape)));
    else { const b = portBox(_w, _h, _shape); g.fillRect(b.x0, b.y0, b.pw, b.ph); }
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
      px.data[i * 4 + 2] = 128; px.data[i * 4 + 3] = 255;
      if (F[i] === 0 || F[i] === 1) {    // fully clear or opaque: the displacement has zero amplitude
        px.data[i * 4] = px.data[i * 4 + 1] = 128;
        continue;
      }
      const gx = (F[y * N + Math.min(N - 1, x + 1)] - F[y * N + Math.max(0, x - 1)]) * 0.5;
      const gy = (F[Math.min(N - 1, y + 1) * N + x] - F[Math.max(0, y - 1) * N + x]) * 0.5;
      const gl = Math.hypot(gx, gy) || 1, edge = 4 * F[i] * (1 - F[i]);      // 0 in the clear centre and deep bezel, 1 at the rim
      const amt = clampTo(edge * 1.35, 0, 1);
      px.data[i * 4] = Math.round(clampTo(128 + (gx / gl) * amt * 110, 0, 255));       // +R = sample toward +x: along the inward gradient
      px.data[i * 4 + 1] = Math.round(clampTo(128 + (gy / gl) * amt * 110, 0, 255));
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
    bendField.data = new Uint8Array(px.data.buffer, px.data.byteOffset, px.data.byteLength);
    _bendW = _w; _bendH = _h; _bendLevelBuilt = level;
  }

  function _show(on) {
    if (!on) clearLightField();
    if (on === _shown) return;
    _shown = on;
    _lastHaze = null;
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
    g.scale(2.0, 0.22); g.globalAlpha = 0.16;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1; g.restore();
  }

  // Fixed ray table: eleven uneven spokes (angle, relative length, relative strength), so the rays read as the
  // scratch pattern of one shield and never spin or shimmer as the sun moves.
  const RAYS = [[0.12, 1.0, 1], [0.71, 0.7, 0.6], [1.33, 0.9, 0.8], [1.9, 0.55, 0.5], [2.47, 0.95, 0.9], [3.05, 0.6, 0.5], [3.6, 1.0, 1], [4.2, 0.65, 0.6], [4.75, 0.85, 0.7], [5.3, 0.5, 0.4], [5.85, 0.9, 0.8]].map(([angle, length, strength]) => ({
    length, strength, dx: Math.cos(angle), dy: Math.sin(angle),
    leftX: Math.cos(angle - 0.035), leftY: Math.sin(angle - 0.035),
    rightX: Math.cos(angle + 0.035), rightY: Math.sin(angle + 0.035),
  }));
  // Two opposed pairs, fixed to the shield; no random rotations or per-paint table construction.
  const SHORT_RAYS = [0.52, 0.52 + Math.PI, 2.62, 2.62 + Math.PI].map((angle) => ({
    length: 1, strength: 1, dx: Math.cos(angle), dy: Math.sin(angle),
    leftX: Math.cos(angle - 0.012), leftY: Math.sin(angle - 0.012),
    rightX: Math.cos(angle + 0.012), rightY: Math.sin(angle + 0.012),
  }));
  function _rays(g, r) {
    const c = Math.round(r.rgb[0]) + "," + Math.round(r.rgb[1]) + "," + Math.round(r.rgb[2]);
    for (const ray of r.short ? SHORT_RAYS : RAYS) {
      const a = Math.min(1, r.k * ray.strength * 0.7);
      if (a < 0.004) continue;
      const len = r.len * ray.length, ex = r.x + ray.dx * len, ey = r.y + ray.dy * len;
      const grad = g.createLinearGradient(r.x, r.y, ex, ey);
      grad.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
      grad.addColorStop(0.3, "rgba(" + c + "," + (a * 0.35).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + c + ",0)");
      g.fillStyle = grad; g.beginPath(); g.moveTo(r.x, r.y);
      g.lineTo(r.x + ray.leftX * len, r.y + ray.leftY * len);
      g.lineTo(r.x + ray.rightX * len, r.y + ray.rightY * len);
      g.closePath(); g.fill();
    }
  }
  // A lamp's beam: a soft wedge leaving the glint along the fixture's aim, fading with length.
  const BEAM_WEDGES = [[0.42, 0.25], [0.24, 0.45], [0.1, 0.6]].map(([angle, alpha]) => ({
    cos: Math.cos(angle), sin: Math.sin(angle), alpha,
  }));
  function _beam(g, s) {
    const b = s.beam, c = Math.round(s.rgb[0]) + "," + Math.round(s.rgb[1]) + "," + Math.round(s.rgb[2]);
    const ex = s.x + b.dx * b.len, ey = s.y + b.dy * b.len;
    const grad = g.createLinearGradient(s.x, s.y, ex, ey);
    grad.addColorStop(0, "rgba(" + c + "," + Math.min(1, b.k).toFixed(3) + ")");
    grad.addColorStop(0.45, "rgba(" + c + "," + (Math.min(1, b.k) * 0.35).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(" + c + ",0)");
    g.fillStyle = grad;
    // Three nested wedges: a wide faint skirt, the body, a narrow bright core — soft across the beam, not a hard cone.
    for (const wedge of BEAM_WEDGES) {
      g.globalAlpha = wedge.alpha;
      g.beginPath(); g.moveTo(s.x, s.y);
      g.lineTo(s.x + (b.dx * wedge.cos + b.dy * wedge.sin) * b.len, s.y + (b.dy * wedge.cos - b.dx * wedge.sin) * b.len);
      g.lineTo(s.x + (b.dx * wedge.cos - b.dy * wedge.sin) * b.len, s.y + (b.dy * wedge.cos + b.dx * wedge.sin) * b.len);
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  }
  // The star flare of a hard point source: six fixed spokes through the glint, the longest horizontal (the
  // shield's curvature stretches that way), fading to nothing at their tips.
  const STAR = [[0, 1], [Math.PI, 1], [0.52, 0.55], [0.52 + Math.PI, 0.55], [2.62, 0.55], [2.62 + Math.PI, 0.55]].map(([angle, length]) => ({
    dx: Math.cos(angle), dy: Math.sin(angle), length,
  }));
  function _star(g, s) {
    const c = Math.round(s.rgb[0]) + "," + Math.round(s.rgb[1]) + "," + Math.round(s.rgb[2]);
    const a = Math.min(1, s.star.k);
    for (const spoke of s.star.short ? SHORT_RAYS : STAR) {
      const len = s.star.len * spoke.length, ex = s.x + spoke.dx * len, ey = s.y + spoke.dy * len;
      const grad = g.createLinearGradient(s.x, s.y, ex, ey);
      grad.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + c + ",0)");
      g.strokeStyle = grad; g.lineWidth = Math.max(1.5, s.r * 0.08);
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(ex, ey); g.stroke();
    }
  }

  function _paint(m, g = _ctx, w = _w, h = _h, paths = _paths, clear = true) {
    if (clear) g.clearRect(0, 0, w, h);
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
    if (m.rim && paths) {
      const R = Math.hypot(w, h) * 0.5, cx = w / 2, cy = h / 2;
      const grad = g.createLinearGradient(cx + m.rim.dx * R, cy + m.rim.dy * R, cx - m.rim.dx * R, cy - m.rim.dy * R);
      const c = Math.round(m.rim.rgb[0]) + "," + Math.round(m.rim.rgb[1]) + "," + Math.round(m.rim.rgb[2]);
      grad.addColorStop(0, "rgba(" + c + "," + Math.min(1, m.rim.k).toFixed(3) + ")");
      grad.addColorStop(0.55, "rgba(" + c + "," + (m.rim.k * 0.25).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + c + "," + (m.rim.k * 0.06).toFixed(3) + ")");
      g.strokeStyle = grad; g.lineWidth = base * 0.07; g.stroke(paths.rim);
    }
    // The sun and its ghost, then the lamps (drawn wider than tall: the shield curves most horizontally).
    if (m.rays) _rays(g, m.rays);
    if (m.sun) _glow(g, m.sun.x, m.sun.y, m.sun.r * (0.8 + 0.2 * m.bloom), m.sun.k, m.sun.rgb, 2.4, m.bloom);
    if (m.ghost) _glow(g, m.ghost.x, m.ghost.y, m.ghost.r, m.ghost.k, m.ghost.rgb, 1.8, 0);
    for (const s of m.glints) { if (s.beam) _beam(g, s); if (s.star) _star(g, s); _glow(g, s.x, s.y, s.r, s.k, s.rgb, 2.0, m.bloom); }
    // Chromatic fringe at the rim: the lens splits the rim's light, magenta outside and cyan inside the edge.
    if (m.fringe > 0.004 && paths) {
      g.lineWidth = Math.max(1.5, base * 0.006);
      g.strokeStyle = "rgba(255,70,150," + (m.fringe * 0.7).toFixed(3) + ")"; g.stroke(paths.out);
      g.strokeStyle = "rgba(70,200,255," + m.fringe.toFixed(3) + ")"; g.stroke(paths.inn);
    }
    g.globalCompositeOperation = "source-over";
  }

  // One authority for both the folded shader and CSS fallback. A cached SVG map
  // must not leave world refraction running after LOW, budget shedding or exit.
  function _syncBend(on) {
    if (on === _bendActive) return;
    _bendActive = on;
    if (!document.body) return;
    if (on) document.body.setAttribute("data-visor-bend-active", "1");
    else document.body.removeAttribute("data-visor-bend-active");
  }

  /** Once per rendered frame (from Droplets.tick). on: an onboard camera, racing, not photo mode. dt 0 = paused
   *  (the last paint stays). vs is unused today (kept for the airflow/heat ideas); reduced: prefers-reduced-motion. */
  function tick(dt, on, vs, reduced) {
    const helmet = _helmet();
    if (!helmet) { _cockpitBlocked = false; _syncBend(false); _syncBudget(0); _show(false); return; }
    const visor = _opt("visor", "off");
    const quality = _opt("visorQuality", "auto");
    const resized = visor !== "off" && _size();
    _port(visor);                                              // OFF clears the aperture without measuring the viewport
    const changed = _syncBudget(visor !== "off" && on ? Math.max(_pressureBudget(), quality === "low" ? 1 : 0) : 0);
    if (visor === "off" || !on || _low() || _shed) { if (visor === "off" || !on) _cockpitBlocked = false; _syncBend(false); _show(false); return; }
    const budget = BUDGETS[_budget];
    // The world filter is independent of the reflection canvas, including on resize.
    const t2 = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    const refraction = _budget < 2 ? _opt("visorRefraction", "off") : "off";
    if (BEND[refraction]) {
      _bend(refraction);
    }
    _syncBend(!!BEND[refraction] && !!bendField.data && _bendW === _w && _bendH === _h);
    if (t2 && _bendActive && !_stats.msBend) _stats.msBend = r2(performance.now() - t2);
    const level = LEVEL[_opt("visorReflections", "light")] || 0;
    if (!(level > 0)) { _show(false); return; }
    const t1 = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    const newSizeOrCanvas = resized || !_looked;
    if (!_lookup()) return;
    if (t1 && !_stats.msLookup) _stats.msLookup = r2(performance.now() - t1);
    _syncBlend(t1 || Date.now());
    const moving = motionCadence(dt);
    const requestedHz = quality === "high" || (quality !== "low" && moving) ? 30 : HZ;
    const hz = _paintHz = Math.min(reduced ? HZ_REDUCED : requestedHz, _budget ? budget.hz : 30);
    _acc += dt > 0 ? dt : 0;
    if (!newSizeOrCanvas && _acc < 1 / hz && !(!(dt > 0) && _settingsDirty)) return;
    if (!(dt > 0) && !newSizeOrCanvas && !changed && !_settingsDirty) return;              // a paused profile change still refreshes once
    _settingsDirty = false;
    const visibilityDt = dt > 0 ? Math.min(0.1, _acc) : 0;
    _acc = newSizeOrCanvas || changed || !_budget ? 0 : _acc % (1 / hz); // preserve reduced cadence without catch-up paints
    const t0 = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    const scene = readScene();
    if (!scene) { _show(false); return; }                       // nothing to light the shield: keep the layer hidden
    const fringe = FRINGE[refraction] || 0;
    const beams = budget.beams ? _beams() : 0;
    const tune = typeof LightTune !== "undefined" ? LightTune.LT : null;
    let m;
    try {
      m = lightMap(scene, _w, _h, { level, fringe, smoke: visor === "smoke", tint: visor === "smoke" ? _lens : null,
        bloom: Number.isFinite(tune?.bloomMul) ? tune.bloomMul : 1, glare: Number.isFinite(tune?.glareStr) ? tune.glareStr : 0.12, beams, glintLimit: budget.glints, style: _opt("visorLightStyle", "classic"),
        visibilitySamples: _budget ? 1 : quality === "high" ? 9 : 5, smoothVisibility: true, visibilityDt });
      publishLightField(m, scene);
      // With the sun behind the driver and no visible lamps, only the sky gradient remains.
      // Its pixels depend on sky brightness and viewport size, even as the helmet moves.
      const hazeOnly = !m.sun && !m.rim && !m.glints.length && m.fringe <= 0.004;
      if (hazeOnly && m.haze <= 0.004) { _show(false); return; }
      _show(true);
      const hazeAlpha = hazeOnly ? m.haze.toFixed(3) : null;
      if (hazeOnly && hazeAlpha === _lastHaze && _lightValid) return;
      _lastHaze = hazeAlpha;
      _paint(m);
      _lightValid = true;
    } catch (e) {
      // Cosmetic layer: a bad frame (a non-finite gradient, a hook mid-rebuild) must never take the render loop
      // down with it. Clear the glass, say so once, and try again next tick.
      _lightValid = false; clearLightField();
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
    return { shown: _shown, shed: _shed, budget: BUDGETS[_budget].name, paintHz: _shown ? _paintHz : 0, w: _w, h: _h, ticks: _stats.ticks, paints: _stats.paints, msLast: r2(_stats.msLast), msMax: r2(_stats.msMax),
             msAvg: _stats.paints ? r2(_stats.msSum / _stats.paints) : 0, glints: _stats.glints, sun: _stats.sun, rim: _stats.rim, lamp: _stats.lamp,
             port: !!_portKey, bend: _bendLevelBuilt, blend: _blend, msBend: _stats.msBend, msLookup: _stats.msLookup, msVisibility: r2(_stats.msVisibility), visibilityRays: _stats.visibilityRays, visibilityCandidates: _stats.visibilityCandidates, errors: _stats.errors };
  }
  // Only a visible race HUD owns the lens. These are also the CSS fallback gates.
  const lensFrame = { bend: null, water: null, light: null, revision: 0, additive: false };
  function frameLens() {
    const water = typeof Droplets !== "undefined" && typeof Droplets.waterLens === "function" ? Droplets.waterLens() : null;
    if ((!_bendActive && !_shown && !water) || !document.body.matches("body[data-helmet-cam]:not(.bc-on,.watch-controls-on,.hud-hidden,.pc-uihidden)")) return null;
    const hud = document.getElementById("hud");
    if (!hud || hud.hidden) return null;
    const drops = document.getElementById("fx-droplets");
    lensFrame.bend = _bendActive ? bendField : null;
    lensFrame.water = water;
    // Draining drops remain between the world and the reflected light.
    lensFrame.light = _shown && _lightValid && (!drops || drops.hidden) ? _cv : null;
    lensFrame.revision = _stats.paints;
    lensFrame.additive = _blend === "add";
    return lensFrame.bend || lensFrame.water || lensFrame.light ? lensFrame : null;
  }
  function folded(on) {
    if (_folded === on) return;
    _folded = on;
    document.body.toggleAttribute("data-visor-folded", !!on);
    document.body.toggleAttribute("data-visor-light-folded", on === 2);
  }
  function clear() { _cameraSampled = false; _motionHold = 0; for (const rec of _coverage) rec.age = -1; _cockpitBlocked = false; _syncBend(false); folded(false); _syncBudget(0); _show(false); }

  /** Live scene snapshot for __apex.visorScene — keeps apex.js a one-line delegate. */
  const _sceneInternals = { occluder: { value: null }, track: { value: null } };
  function sceneFromG(G) {
    const tune = typeof LightTune !== "undefined" ? LightTune.LT : null;
    _sceneInternals.occluder.value = _cockpitBlocked ? _cockpitBlocker : null;
    _sceneInternals.track.value = G.track;
    // Production needs the live spatial structures; diagnostic JSON needs only the bounded scene fields.
    // Descriptors are reused, but each call still returns a fresh snapshot object.
    return Object.defineProperties({
      // The lens the world was drawn with: G.lens.fovY is the fitted FOV, not the raw camFov (#5018).
      eye: G.camEye, tgt: G.camTgt, fov: G.lens && G.lens.fovY > 0 ? G.lens.fovY * 180 / Math.PI : G.camFov, roll: G.camRoll || 0,
      sunDir: G.frame.sunDir, sunColor: G.frame.sunColor, exposure: G.frame.exposure != null ? G.frame.exposure : 1,
      ambientSky: G.frame.ambientSky, lights: G.frame.lights, tailStart: G.frame.tailStart, floodEmit: G._lastFloodEmit,
      // Match the rendered scene's height fog, including a user tuning override of zero.
      fogDensity: (G.frame.fogDensity || 0) * (tune?.fogDensityMul ?? 1),
      fogHeight: tune?.fogHeight ?? G.frame.fogHeight ?? 0,
    }, _sceneInternals);
  }

  // Freeze the rendered camera/light values before asynchronous GPU readback.
  function captureSnapshot(G) {
    const source = sceneFromG(G), tune = typeof LightTune !== "undefined" ? LightTune.LT : null;
    const scene = Object.defineProperty(JSON.parse(JSON.stringify(source)), "track", { value: source.track });
    return { scene, bloom: tune?.bloomMul ?? 1, glare: tune?.glareStr ?? .12 };
  }

  // Photo-only additive light, after scene readback and before cropping. No helmet
  // DOM, saved preferences, animation cadence or cached driving lens is changed.
  function captureLight(canvas, G, opts = {}) {
    const level = LEVEL[opts.level] || 0;
    if (!level) return null;
    const g = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    if (!g || !w || !h) throw new Error("Visor photo lighting is unavailable");
    const snapshot = opts.snapshot || captureSnapshot(G);
    // Free-camera shots retain world occlusion, not a cached cockpit-only blocker.
    const scene = snapshot.scene;
    const m = lightMap(scene, w, h, { level, beams: BEAMS[opts.beams] ?? 1, style: opts.style || "classic",
      bloom: snapshot.bloom, glare: snapshot.glare, visibilitySamples: 9 });
    // The rim sheen and fringe trace the helmet's eye port: a photo from the HELMET seat only
    // (opts.helmet). Any other angle gets the glints and beams with no port outline (#6397).
    const base = Math.min(w, h), shape = opts.shape || _shape;
    const paths = opts.helmet && typeof Path2D === "function" ? { rim: new Path2D(portPath(w, h, base * .03, shape)),
      out: new Path2D(portPath(w, h, base * .006, shape)), inn: new Path2D(portPath(w, h, base * .014, shape)) } : null;
    g.save();
    try { _paint(m, g, w, h, paths, false); } finally { g.restore(); }
    return m;
  }
  // The helmet's eye-port bezel painted into a HELMET photo: the live --visor-port layer is DOM,
  // so a canvas readback never carries it. Same two layers as portImage: a soft inner falloff, then the edge.
  function capturePort(canvas, opts = {}) {
    const g = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    if (!g || !w || !h || typeof Path2D !== "function") return false;
    const shape = opts.shape || _shape, soft = Math.max(4, w * 0.02), sharp = Math.max(1.2, w * 0.004);
    const frame = "M-400,-400H" + (w + 400) + "V" + (h + 400) + "H-400Z";
    g.save();
    try {
      g.fillStyle = "#07070c";
      for (const [inset, alpha, blur] of [[soft * 0.9, 0.55, soft], [0, 0.93, sharp]]) {
        if ("filter" in g) g.filter = "blur(" + r2(blur) + "px)";
        g.globalAlpha = alpha; g.fill(new Path2D(frame + portPath(w, h, inset, shape)), "evenodd");
      }
    } finally { g.restore(); }
    return true;
  }

  // camBasis / projectDir / LEVEL / FRINGE stay module-private: lightMap + tick
  // close over them; no js/ or test reader used the public VisorOptics.* forms.
  return { bind, setCockpitOccluder, tick, clear, captureLight, capturePort, captureSnapshot, lightField, frameLens, folded, stats, blendMode, lightMap, sunFacing, lampAdapt, portPath, portBox, portImage, tintRGB, BEAMS, MAX_GLINTS, sceneFromG };
})();
Object.freeze(VisorOptics);
