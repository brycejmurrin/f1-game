const TrackLights = (function () {
  "use strict";
  const { LT } = LightKnobs;

function floodColor(theme, id) {
  let base;
  switch (theme) {
    case "street_night": base = { tint: [0.92, 0.96, 1.08], intensity: 20.0, radius: 30, street: true }; break;
    case "modern":       base = { tint: [1.00, 0.98, 0.92], intensity: 19.0, radius: 30, street: true }; break;
    case "street_day":   base = { tint: [1.10, 1.00, 0.80], intensity: 16.0, radius: 28, street: true }; break;
    case "desert":       base = { tint: [1.28, 1.00, 0.60], intensity: 18.0, radius: 34, street: false }; break;
    default:             base = { tint: [1.14, 1.06, 0.84], intensity: 19.0, radius: 36, street: false }; break;
  }
  const WARM = { singapore: [1.06, 0.99, 0.88], jeddah: [1.16, 1.02, 0.78],
                 interlagos: [1.10, 1.01, 0.84], montreal: [1.05, 1.00, 0.90],
                 baku: [1.08, 1.00, 0.86] };
  const COOL = { vegas: [0.90, 0.95, 1.10], miami: [0.95, 0.99, 1.10] };
  if (id && WARM[id]) base.tint = WARM[id];
  else if (id && COOL[id]) base.tint = COOL[id];
  return base;
}
const LAMP_KINDS = {
  flood_bank: { col: [1.02, 1.06, 1.18], eMul: 1.00, cIn: 0.80, cOut: 0.50, blB: 0.08, blV: 0.06, volW: 1.0,  glareW: 1.2, tintMix: 0.12 },
  halide:     { col: [0.96, 1.03, 1.05], eMul: 1.05, cIn: 0.80, cOut: 0.46, blB: 0.06, blV: 0.06, volW: 0.8,  glareW: 1.0, tintMix: 0.30 },
  sodium:     { col: [1.42, 0.72, 0.24], eMul: 0.85, cIn: 0.82, cOut: 0.44, blB: 0.10, blV: 0.08, volW: 0.5,  glareW: 0.9, tintMix: 0.25 },
  halogen:    { col: [1.22, 0.98, 0.55], eMul: 0.95, cIn: 0.80, cOut: 0.44, blB: 0.10, blV: 0.08, volW: 0.55, glareW: 1.0, tintMix: 0.30 },
  led:        { col: [0.92, 1.00, 1.15], eMul: 1.05, cIn: 0.84, cOut: 0.48, blB: 0.10, blV: 0.08, volW: 0.45, glareW: 0.7, tintMix: 0.30 },
  globe:      { col: [1.30, 0.92, 0.52], eMul: 0.60, cIn: 0.30, cOut: 0.02, blB: 0.16, blV: 0.10, volW: 0.30, glareW: 1.6, tintMix: 0.25 },
  work:       { col: [1.38, 0.74, 0.30], eMul: 0.55, cIn: 0.70, cOut: 0.44, blB: 0.08, blV: 0.06, volW: 0.4,  glareW: 0.8, tintMix: 0.20 },
  fluor:      { col: [1.00, 1.10, 0.94], eMul: 0.92, cIn: 0.80, cOut: 0.46, blB: 0.10, blV: 0.08, volW: 0.5,  glareW: 0.85, tintMix: 0.28 },
  signal:     { col: [1.50, 0.20, 0.16], eMul: 0.40, cIn: 0.92, cOut: 0.72, blB: 0.04, blV: 0.04, volW: 0.35, glareW: 0.9,  tintMix: 0.04 },
};
function lampRadius(post, themeRadius) {
  if (!post || post.radius == null) return themeRadius;
  return post.mast ? Math.max(themeRadius, post.radius) : post.radius;
}
const _postNodeMemo = new WeakMap();
function resolvePostNodes(track, posts) {
  const n = track.n, px = track.px, pz = track.pz;
  if (!n || !px || !pz) return posts;
  const hit = _postNodeMemo.get(track);
  if (hit && hit.src === posts) return hit.out;
  let out = null;
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    if (!p || !Number.isFinite(p.x)) continue;
    let best = Infinity, bk = 0;
    for (let k = 0; k < n; k += 8) {
      const dx = p.x - px[k], dz = p.z - pz[k];
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bk = k; }
    }
    for (let j = bk - 8; j <= bk + 8; j++) {
      const k = ((j % n) + n) % n;
      const dx = p.x - px[k], dz = p.z - pz[k];
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bk = k; }
    }
    if (bk === p.k) continue;
    if (!out) out = posts.slice();
    out[i] = { ...p, k: bk };
  }
  const res = out || posts;
  _postNodeMemo.set(track, { src: posts, out: res });
  return res;
}
function lampDensityFactor() {
  const d = LT.lampDensity;
  return (typeof d === "number" && isFinite(d) && d > 0) ? d : 1;
}
function lampStrideM() { return 22 / lampDensityFactor(); }
function lampStrideNodes(ds) {
  return Math.max(1, Math.round(lampStrideM() / ds));
}
function applyLampDensity(posts, track, height, onlyAlways) {
  if (!posts || !posts.length || onlyAlways) return posts;
  const dens = lampDensityFactor();
  if (Math.abs(dens - 1) < 0.01) return posts;
  const n = track.n, ds = track.total / n;
  const targetGap = lampStrideNodes(ds);
  const sorted = posts.slice().sort((a, b) => a.k - b.k);
  if (dens < 1) {
    const out = [];
    let lastK = null;
    for (const p of sorted) {
      if (lastK == null) { out.push(p); lastK = p.k; continue; }
      const span = (p.k - lastK + n) % n;
      if (span >= targetGap) { out.push(p); lastK = p.k; }
    }
    return out.length ? out : posts;
  }
  const fill = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i], bN = sorted[(i + 1) % sorted.length];
    const span = (i === sorted.length - 1) ? (bN.k + n - a.k) : (bN.k - a.k);
    if (span <= targetGap) continue;
    const nFill = Math.floor((span - 1) / targetGap);
    for (let j = 1; j <= nFill; j++) {
      const k = (a.k + j * targetGap) % n;
      const side = (j % 2 === 0) ? a.side : -a.side;
      const hwk = track.hw[k] || 7;
      fill.push({
        k, side, synth: true, densified: true,
        kind: (a.kind === "signal" || a.aimAt) ? null : (a.kind || null),
        x: track.px[k] + track.rx[k] * (hwk + 6) * side,
        y: track.py[k] + height,
        z: track.pz[k] + track.rz[k] * (hwk + 6) * side,
      });
    }
  }
  if (!fill.length) return posts;
  const cap = 800;
  return sorted.concat(fill.slice(0, Math.max(0, cap - sorted.length)));
}
function buildTrackLights(track, onlyAlways) {
  const lights = [];
  const n = track.n, total = track.total;
  if (!n || !total || !track.px || !track.rx) return lights;
  if (Log.enabled("game", Log.DEBUG))
    Log.debug("game", "LightTune.buildTrackLights track=" + ((track.def && track.def.id) || "?"));
  const ds = total / n;
  const stride = lampStrideNodes(ds);
  const { tint, intensity, radius, street } = floodColor(track.def.theme, track.def.id);
  const height = street ? 9 : 13;
  const lh = (j) => { const x = Math.sin((j + 1) * 127.13) * 43758.5453; return x - Math.floor(x); };
  const NEON_SPILL = [[1.35, 0.75, 1.1], [0.75, 1.15, 1.3], [0.9, 1.25, 0.85], [1.3, 0.85, 0.65]];
  let posts = (track.lampPosts && track.lampPosts.length) ? track.lampPosts : null;
  if (posts) posts = resolvePostNodes(track, posts);
  if (onlyAlways) {
    posts = posts ? posts.filter((p) => p && p.always) : null;
    if (!posts || !posts.length) return lights;
  }
  posts = applyLampDensity(posts, track, height, onlyAlways);
  if (posts && LT.lampGapFill > 0 && !onlyAlways) {
    const sorted = posts.slice().sort((a, b) => a.k - b.k);
    const maxGap = Math.max(stride * 2, Math.round(LT.lampGapFill / ds));
    const fill = [];
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i], bN = sorted[(i + 1) % sorted.length];
      const span = (i === sorted.length - 1) ? (bN.k + n - a.k) : (bN.k - a.k);
      if (span <= maxGap) continue;
      const steps = Math.floor(span / stride);
      for (let j = 1; j < steps; j++) {
        const k = (a.k + j * stride) % n;
        const side = (j % 2 === 0) ? 1 : -1;
        const hwk = track.hw[k] || 7;
        fill.push({
          k, side, synth: true, kind: null,
          x: track.px[k] + track.rx[k] * (hwk + 6) * side,
          y: track.py[k] + height,
          z: track.pz[k] + track.rz[k] * (hwk + 6) * side,
        });
      }
    }
    if (fill.length) posts = sorted.concat(fill);
  }
  const nPosts = posts ? posts.length : Math.ceil(n / stride);
  for (let i = 0; i < nPosts; i++) {
    const post = posts ? posts[i] : null;
    const k = posts ? posts[i].k : Math.min(n - 1, i * stride);
    const side = posts ? posts[i].side : ((i % 2 === 0) ? 1 : -1);
    const bri  = 0.70 + lh(i + 97) * 0.62;
    const hard = lh(i + 53);
    const frac = k / n;
    const pitStraight = frac < 0.045 || frac > 0.985;
    const kindRoll = lh(i + 71);
    if (street && kindRoll < 0.10 && !pitStraight && !(post && post.custom)) {
      const nc = NEON_SPILL[Math.floor(lh(i + 5) * NEON_SPILL.length) % NEON_SPILL.length];
      const wx0 = track.px[k] + track.rx[k] * (track.hw[k] + 2.5) * side;
      const wy0 = track.py[k] + 4.5;
      const wz0 = track.pz[k] + track.rz[k] * (track.hw[k] + 2.5) * side;
      let wdx = track.rx[k] * side * 0.55, wdy = -0.83, wdz = track.rz[k] * side * 0.55;
      const wdl = Math.hypot(wdx, wdy, wdz) || 1; wdx /= wdl; wdy /= wdl; wdz /= wdl;
      const we = intensity * 0.30 * (4.5 * 4.5) * LT.poolEnergy;
      lights.push(wx0, wy0, wz0,
        Math.max(0, nc[0]) * we, Math.max(0, nc[1]) * we, Math.max(0, nc[2]) * we,
        16 * LT.lampRadiusMul, wdx, wdy, wdz,
        0.55, 0.55 - 0.50 * (LT.beamCone || 1), Math.min(0.9, 0.10 * LT.bleedMul), 0.35, 0);
    }
    let eMul = 1.0, coneIn, coneOut, pr, pg, pb, tintMix = 0.38;
    let volW = 0.55, glareW = 1.0, bleed;
    const KP = posts && posts[i].kind ? LAMP_KINDS[posts[i].kind] : null;
    if (KP) {
      pr = KP.col[0]; pg = KP.col[1]; pb = KP.col[2];
      eMul = KP.eMul; coneIn = KP.cIn; coneOut = KP.cOut;
      tintMix = KP.tintMix; volW = KP.volW; glareW = KP.glareW;
      bleed = KP.blB + lh(i + 31) * KP.blV;
    } else if (pitStraight) {
      eMul = 1.3; volW = 1.0;
      pr = 1.02; pg = 1.06; pb = 1.18; tintMix = 0.12;
      coneIn = 0.78; coneOut = 0.58;
    } else if (!street && kindRoll < 0.08) {
      eMul = 0.55; volW = 0.4;
      pr = 1.38; pg = 0.74; pb = 0.30; tintMix = 0.2;
      coneIn = 0.70; coneOut = 0.48;
    } else {
      const ct = lh(i + 17);
      if (ct < 0.34)      { pr = 1.34; pg = 0.70; pb = 0.32; }
      else if (ct < 0.68) { pr = 1.16; pg = 1.00; pb = 0.55; }
      else                { pr = 0.93; pg = 0.99; pb = 1.15; }
      coneIn  = 0.66 + hard * 0.10;
      coneOut = coneIn - 0.26;
    }
    if (posts && posts[i].synth) { glareW = 0; volW = Math.min(volW, 0.3); }
    const core = LT.beamCore || 1;
    if (core !== 1) { const sk = coneIn - coneOut; coneIn = Math.cos(Math.min(1.55, Math.acos(Math.min(1, coneIn)) * core)); coneOut = coneIn - sk; }
    coneOut = coneIn - (coneIn - coneOut) * (LT.beamCone || 1);
    const mr = tint[0] * tintMix + pr * (1 - tintMix);
    const mg = tint[1] * tintMix + pg * (1 - tintMix);
    const mb = tint[2] * tintMix + pb * (1 - tintMix);
    if (bleed == null) {
      const bleedBase = street ? 0.30 : 0.14;
      const bleedVar  = street ? 0.18 : 0.12;
      bleed = bleedBase + lh(i + 31) * bleedVar;
    }
    const lx = posts ? posts[i].x : track.px[k] + track.rx[k] * (track.hw[k] + 6) * side;
    const ly = posts ? posts[i].y : track.py[k] + height;
    const lz = posts ? posts[i].z : track.pz[k] + track.rz[k] * (track.hw[k] + 6) * side;
    const nlOff = track.hw[k] * 0.5 * side;
    let ax = track.px[k] + track.rx[k] * nlOff - lx;
    let ay = track.py[k] - ly;
    let az = track.pz[k] + track.rz[k] * nlOff - lz;
    const aimAt = post && post.aimAt;
    if (aimAt) { ax = aimAt[0] - lx; ay = aimAt[1] - ly; az = aimAt[2] - lz; }
    const al = Math.hypot(ax, ay, az) || 1;
    if (post && post.aim) { ax = post.aim[0]; ay = post.aim[1]; az = post.aim[2]; }
    const anorm = Math.hypot(ax, ay, az) || 1;
    ax /= anorm; ay /= anorm; az /= anorm;
    const hAim = Math.max(ly - (aimAt ? aimAt[1] : track.py[k]), 1);
    const ePhys = intensity * bri * eMul * (al * al) * LT.poolEnergy / Math.max(hAim / al, 0.35)
                * (post && post.energy != null ? post.energy : 1);
    lights.push(
      lx, ly, lz,
      Math.max(0, mr) * ePhys,
      Math.max(0, mg) * ePhys,
      Math.max(0, mb) * ePhys,
      lampRadius(post, radius) * LT.lampRadiusMul,
      ax, ay, az, coneIn, coneOut, Math.min(0.9, bleed * LT.bleedMul), volW, glareW,
    );
  }
  if (!onlyAlways) {
    const hwk = track.hw[0] || 7;
    const ge = intensity * 0.55 * (8 * 8) * LT.poolEnergy;
    for (const lat of [-hwk * 0.55, 0, hwk * 0.55]) {
      lights.push(
        track.px[0] + track.rx[0] * lat, track.py[0] + 8, track.pz[0] + track.rz[0] * lat,
        1.02 * ge, 1.05 * ge, 1.12 * ge,
        26 * LT.lampRadiusMul, 0, -1, 0,
        0.92, 0.92 - 0.14 * (LT.beamCone || 1), Math.min(0.9, 0.06 * LT.bleedMul), 0, 0);
    }
  }
  return lights;
}

  return { buildTrackLights, lampStrideNodes };
})();
Object.freeze(TrackLights);
