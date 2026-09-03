/* Apex 26 — per-track lamp baking: floodColor / LAMP_KINDS (per-theme and
   per-fixture light character), the LAMP DENSITY / DARK-GAP FILL walks and
   buildTrackLights(track) — bakes the flat 15-float light records the renderer
   uploads. Built ONCE per track; re-run only when a `rebuild: true` knob nulls
   track._lights (js/game/light-store.js). Reads the live knob values through
   LightKnobs.LT (eval-time destructure — tools/manifest.cjs HARD_EDGES); the
   per-frame cull of these records is js/game/frame-lights.js. */
const TrackLights = (function () {
  "use strict";
  const { LT } = LightKnobs;

// Lamp set for ANY track (street posts and flood banks share this list; the
// caller only feeds them to the shader when the scene is dark — night/dusk/dawn).
// A light roughly every ~22 m (alternating sides) at mast height, capped to the
// 48 shader slots (minus a small tail-light reservation in traffic) by the
// per-frame cull. Flat 15-float records [x,y,z, r,g,b, rad, aim, cone, bleed,
// vol, glare]. Colour, brightness, pool size and mast style all vary by circuit
// character (see floodColor). HDR (>1) so the pools bloom.
function floodColor(theme, id) {
  // tint (relative RGB), HDR intensity, pool radius (m), and `street` = slim
  // lamp-post masts (vs tall flood banks). Per-theme so each circuit reads right.
  let base;
  switch (theme) {
    // Radii sized for the raking throw from the verge mast: the pool's far
    // corner sits 21-25 m from the lens, and the (1-(d/r)^4)^2 window must not
    // eat it (smaller radii lost up to 31% there).
    case "street_night": base = { tint: [0.92, 0.96, 1.08], intensity: 20.0, radius: 30, street: true }; break;  // cool LED white, city
    case "modern":       base = { tint: [1.00, 0.98, 0.92], intensity: 19.0, radius: 30, street: true }; break;  // warm-white LED
    case "street_day":   base = { tint: [1.10, 1.00, 0.80], intensity: 16.0, radius: 28, street: true }; break;  // warm street lamps (Monaco/Madrid)
    case "desert":       base = { tint: [1.28, 1.00, 0.60], intensity: 18.0, radius: 34, street: false }; break; // warm sodium flood banks
    default:             base = { tint: [1.14, 1.06, 0.84], intensity: 19.0, radius: 36, street: false }; break; // green/classic warm-white
  }
  // Per-LOCALE character so night circuits don't all share one tint: humid/warm
  // cities glow amber (sodium + sea-haze scatter), crisp desert/LED cities stay
  // cool. Only the tint shifts; intensity/radius/mast style keep the theme tuning.
  const WARM = { singapore: [1.06, 0.99, 0.88], jeddah: [1.16, 1.02, 0.78],
                 interlagos: [1.10, 1.01, 0.84], montreal: [1.05, 1.00, 0.90],
                 baku: [1.08, 1.00, 0.86] };
  const COOL = { vegas: [0.90, 0.95, 1.10], miami: [0.95, 0.99, 1.10] };
  if (id && WARM[id]) base.tint = WARM[id];
  else if (id && COOL[id]) base.tint = COOL[id];
  return base;
}
// Per-KIND light parameters. The kind itself is decided ONCE in tracks.js
// (buildProps mast block) and carried on track.lampPosts, so the painted lens
// albedo always matches the light emitted here. CCT-authentic palette (HPS
// sodium 2100K → broadcast flood 5700K). Cones are a tight HOT CORE (the bright
// pool under the fixture) + a wide soft skirt reaching the far edge; bleed is
// LOW so the valleys between lamps stay visibly darker than the pools — that
// pool/valley contrast is what makes the light read as CAST by the fixture
// instead of an ambient wash.
const LAMP_KINDS = {
  flood_bank: { col: [1.02, 1.06, 1.18], eMul: 1.00, cIn: 0.80, cOut: 0.50, blB: 0.08, blV: 0.06, volW: 1.0,  glareW: 1.2, tintMix: 0.12 }, // 5700K broadcast bank (eMul 1.35 stacked too hot on the pit straight)
  halide:     { col: [0.96, 1.03, 1.05], eMul: 1.05, cIn: 0.80, cOut: 0.46, blB: 0.06, blV: 0.06, volW: 0.8,  glareW: 1.0, tintMix: 0.30 }, // 4300K metal halide
  sodium:     { col: [1.42, 0.72, 0.24], eMul: 0.85, cIn: 0.82, cOut: 0.44, blB: 0.10, blV: 0.08, volW: 0.5,  glareW: 0.9, tintMix: 0.25 }, // 2100K HPS deep amber
  halogen:    { col: [1.22, 0.98, 0.55], eMul: 0.95, cIn: 0.80, cOut: 0.44, blB: 0.10, blV: 0.08, volW: 0.55, glareW: 1.0, tintMix: 0.30 }, // 3000K warm white
  led:        { col: [0.92, 1.00, 1.15], eMul: 1.05, cIn: 0.84, cOut: 0.48, blB: 0.10, blV: 0.08, volW: 0.45, glareW: 0.7, tintMix: 0.30 }, // 5000K crisp LED
  globe:      { col: [1.30, 0.92, 0.52], eMul: 0.60, cIn: 0.30, cOut: 0.02, blB: 0.16, blV: 0.10, volW: 0.30, glareW: 1.6, tintMix: 0.25 }, // 2700K heritage globe (near-omni)
  work:       { col: [1.38, 0.74, 0.30], eMul: 0.55, cIn: 0.70, cOut: 0.44, blB: 0.08, blV: 0.06, volW: 0.4,  glareW: 0.8, tintMix: 0.20 }, // orange work lamp
  fluor:      { col: [1.00, 1.10, 0.94], eMul: 0.92, cIn: 0.80, cOut: 0.46, blB: 0.10, blV: 0.08, volW: 0.5,  glareW: 0.85, tintMix: 0.28 }, // 4000K greenish fluorescent
};
// Pool radius for one fixture. `themeRadius` (floodColor) is sized for a verge
// lamp — "the pool's far corner sits 21-25 m from the lens" — and a tall flood
// bank throws far beyond that: Sakhir's ring stands 39 m up and 34 m out, so its
// lens sits ~52 m from the road it aims at, past a 34 m radius, where the
// (1-(d/r)^4)^2 window is exactly 0. Every mast lit nothing (measured: bahrain
// covered 2 of 135 centreline samples, and the 2 were the start line, lit by the
// fixture-less gantry bar below). floodMast now registers its real throw, and a
// MAST record's radius is read as a FLOOR over the theme value rather than as an
// override — so a short mast keeps the tuned theme radius, and the hand-placed
// luminaires that deliberately want a SMALL one (Monaco's tunnel soffits at
// 21-27 m) are unaffected because lampPost writes those without `mast`.
// Energy needs no retune: ePhys already scales by the true lens->road distance
// squared, so opening the window restores the pool the mast was always emitting.
function lampRadius(post, themeRadius) {
  if (!post || post.radius == null) return themeRadius;
  return post.mast ? Math.max(themeRadius, post.radius) : post.radius;
}
// Re-seat each fixture's node index on the node it actually stands next to.
//
// `k` on a lampPosts record is meant to say "which bit of road this fixture is
// beside", and TWO things here depend on it: the gap-fill/density spacing walk
// (which sorts by k and measures spans in nodes), and the beam aim + throw
// energy (which read px/py/pz/hw at k). The world position is authoritative —
// it is what the shader lights from — but the k travelled by a different route
// and can disagree.
//
// It disagrees on circuits with a `_sceneryShift`. The scenery api remaps node
// arguments into racing space for the emitters listed in tracks.js (`anchor`,
// `floodMast`, …), but `lampPost` takes a node index and is in none of those
// lists, so a circuit that hand-places lamps stores the k it was handed while
// its position came back through the remap. Measured: imola 74/74 fixtures with
// k up to 2030 m from their own lamp, hungaroring 96/96 up to 431 m. The
// visible cost is the spacing walk filling where the lamps are NOT — imola ran
// a 716 m stretch of unlit road at frac 0.46 with zero lights within 200 m.
//
// Resolving from the position instead of trusting the caller's frame makes the
// disagreement unexpressible, and needs no shift lookup here. Coarse scan then
// a local refine — this runs once per bake over at most ~600 fixtures.
const _postNodeMemo = new WeakMap();   // track -> { src, out } (LT-independent)
function resolvePostNodes(track, posts) {
  const n = track.n, px = track.px, pz = track.pz;
  if (!n || !px || !pz) return posts;
  // Pure function of (track geometry, posts) — a lamp-density knob drag
  // rebuilds lights every tick and was re-running this ~124k-iteration scan
  // each time. Keyed on both identities; a track rebuild replaces both.
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
// Shared mast/light spacing in metres. Density 1 = shipped ~22 m; higher denser.
function lampStrideM() { return 22 / lampDensityFactor(); }
function lampStrideNodes(ds) {
  return Math.max(1, Math.round(lampStrideM() / ds));
}
// Thin or densify the fixture list so live LAMP DENSITY matches without a full
// track rebuild. dens<1 drops posts below the target spacing; dens>1 inserts
// synthetic roadside lights (no lens halo) between fixtures — poles catch up
// on the next Tracks.build (which reads the same LT.lampDensity).
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
    // Insert count: floor((span-1)/targetGap), NOT floor(span/targetGap)-0 via
    // `j < steps` with steps=floor(span/targetGap). That old form needs
    // span >= 2*targetGap before the first insert — so a gap of 3 nodes with
    // dens=2 target 2 was a silent no-op (MCP: monza dens 1→2 both baked 292).
    const nFill = Math.floor((span - 1) / targetGap);
    for (let j = 1; j <= nFill; j++) {
      const k = (a.k + j * targetGap) % n;
      const side = (j % 2 === 0) ? a.side : -a.side;
      const hwk = track.hw[k] || 7;
      fill.push({
        k, side, synth: true, densified: true, kind: a.kind || null,
        x: track.px[k] + track.rx[k] * (hwk + 6) * side,
        y: track.py[k] + height,
        z: track.pz[k] + track.rz[k] * (hwk + 6) * side,
      });
    }
  }
  if (!fill.length) return posts;
  // Cap growth so a maxed density slider cannot explode the baked set.
  const cap = 800;
  return sorted.concat(fill.slice(0, Math.max(0, cap - sorted.length)));
}
// `onlyAlways` builds ONLY the fixtures a circuit marked always-on (see
// lampPost() in js/track/tracks.js) — the set game.js uploads in a BRIGHT
// session, where the ordinary lamps stay off.
function buildTrackLights(track, onlyAlways) {
  const lights = [];
  const n = track.n, total = track.total;
  // Guard against a not-yet-complete track (centreline arrays missing): return
  // empty so the caller's rebuild-if-empty retries next frame rather than caching
  // a bad empty result.
  if (!n || !total || !track.px || !track.rx) return lights;
  // Debug-gated: a lamp-density knob drag rebuilds every frame and this line
  // alone was flooding the ring buffer.
  if (Log.enabled("game", Log.DEBUG))
    Log.debug("game", "LightTune.buildTrackLights track=" + ((track.def && track.def.id) || "?"));
  const ds = total / n;
  const stride = lampStrideNodes(ds);   // matches buildProps mast stride (+ LAMP DENSITY)
  const { tint, intensity, radius, street } = floodColor(track.def.theme, track.def.id);
  const height = street ? 9 : 13;   // at the mast-top lens (buildProps masts)
  // Deterministic per-lamp hash in [0,1) so a circuit's lamp pattern is stable.
  const lh = (j) => { const x = Math.sin((j + 1) * 127.13) * 43758.5453; return x - Math.floor(x); };
  // Saturated accent palette for "neon spill" lamps on city circuits — coloured
  // light washing off signage onto the street (magenta/cyan/lime/red-orange).
  // Kept PASTEL and dim — real signage spill is a subtle tint on the street, not
  // a saturated paint-bucket pool.
  const NEON_SPILL = [[1.35, 0.75, 1.1], [0.75, 1.15, 1.3], [0.9, 1.25, 0.85], [1.3, 0.85, 0.65]];
  // Every point light is emitted FROM a visible fixture: buildProps exports the
  // exact world position of each mast lens (track.lampPosts — same density-aware
  // stride, side parity and onTrack suppression as the drawn masts), so glare
  // halos, specular streaks, volumetric beams and reflections all anchor to
  // geometry. Fallback: synthetic stride walk when lampPosts is absent.
  let posts = (track.lampPosts && track.lampPosts.length) ? track.lampPosts : null;
  // BEFORE the always-filter, density and gap fill: they all walk `k`, so they
  // need it to mean the place the fixture actually stands — and resolving the
  // stable track.lampPosts array (not a fresh filter copy) lets the memo hit.
  if (posts) posts = resolvePostNodes(track, posts);
  if (onlyAlways) {
    posts = posts ? posts.filter((p) => p && p.always) : null;
    if (!posts || !posts.length) return lights;
  }
  posts = applyLampDensity(posts, track, height, onlyAlways);
  // ── DARK-GAP FILL ─────────────────────────────────────────────────────────
  // Circuits suppress the generic mast pass over a stretch (dressingExclusions
  // kind "lamps" / "floodlights" / "lighting") so bespoke fixtures own that ground.
  // Suppressing the mast also deleted the light — gap-fill restores pools without geometry.
  // Shared floodMast()/floodMastRing() register into track.lampPosts (unless
  // opts.light:false). Fill lights get no lens halo (glareW 0). Never runs for
  // the always-on subset (tunnel soffits etc.).
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
    const bri  = 0.70 + lh(i + 97) * 0.62;      // 0.70 … 1.32 brightness (wide)
    const hard = lh(i + 53);                    // 0 = soft wide rim, 1 = hard crisp rim
    // ── LAMP TYPOLOGY ─────────────────────────────────────────────────────────
    // Not one kind of lamp: the pit straight runs dense cool-white broadcast
    // flood banks; city circuits mix sodium street posts with saturated NEON
    // SPILL (signage light washing the street in colour); permanent circuits are
    // flood masts with the odd warm "work lamp" (aging bulb). Each kind has its
    // own colour, cone and energy.
    const frac = k / n;
    const pitStraight = frac < 0.045 || frac > 0.985;   // start/finish zone
    const kindRoll = lh(i + 71);
    // Custom fixtures are exempt: a circuit-placed luminaire is a specific,
    // modelled thing, and hanging a random magenta signage washer off it would
    // invent a light source that has no fixture.
    if (street && kindRoll < 0.10 && !pitStraight && !(post && post.custom)) {
      // EDGE WASHER: coloured signage light belongs on WALLS and verges, never on
      // the racing line. A low pastel lamp at the track edge aimed OUTWARD washes
      // the barrier/building side in colour while the road stays neutral. It is
      // ADDITIONAL to the mast light below — the mast lens above it still glows,
      // and a glowing lens with no pool reads as broken.
      const nc = NEON_SPILL[Math.floor(lh(i + 5) * NEON_SPILL.length) % NEON_SPILL.length];
      const wx0 = track.px[k] + track.rx[k] * (track.hw[k] + 2.5) * side;
      const wy0 = track.py[k] + 4.5;
      const wz0 = track.pz[k] + track.rz[k] * (track.hw[k] + 2.5) * side;
      let wdx = track.rx[k] * side * 0.55, wdy = -0.83, wdz = track.rz[k] * side * 0.55;
      const wdl = Math.hypot(wdx, wdy, wdz) || 1; wdx /= wdl; wdy /= wdl; wdz /= wdl;
      const we = intensity * 0.30 * (4.5 * 4.5) * LT.poolEnergy;
      // POOL ENERGY / POOL RADIUS / BEAM CONE / VALLEY BLEED tuner knobs apply
      // to these washer lights too (their help text promises "each/every lamp")
      // — same maths as the mast lamps below. (The energy factor was a 0.55
      // literal — poolEnergy's default — so the shipped look is identical.)
      lights.push(wx0, wy0, wz0,
        Math.max(0, nc[0]) * we, Math.max(0, nc[1]) * we, Math.max(0, nc[2]) * we,
        16 * LT.lampRadiusMul, wdx, wdy, wdz,
        0.55, 0.55 - 0.50 * (LT.beamCone || 1), Math.min(0.9, 0.10 * LT.bleedMul), 0.35, 0);
    }
    let eMul = 1.0, coneIn, coneOut, pr, pg, pb, tintMix = 0.38;
    // Per-type VOLUMETRIC weight (record field 13): how strongly this lamp's
    // beam shows in the air. Per-type GLARE weight (field 14): lens-halo size/
    // strength in drawGlow (0 = fixture-less light, no halo).
    let volW = 0.55, glareW = 1.0, bleed;
    const KP = posts && posts[i].kind ? LAMP_KINDS[posts[i].kind] : null;
    if (KP) {
      // KIND path: parameters from the table; the visible lens in tracks.js was
      // painted with this kind's albedo, so fixture and light always agree.
      pr = KP.col[0]; pg = KP.col[1]; pb = KP.col[2];
      eMul = KP.eMul; coneIn = KP.cIn; coneOut = KP.cOut;
      tintMix = KP.tintMix; volW = KP.volW; glareW = KP.glareW;
      bleed = KP.blB + lh(i + 31) * KP.blV;
    } else if (pitStraight) {
      // Legacy fallback (no lampPosts / unknown kind string): broadcast bank.
      eMul = 1.3; volW = 1.0;
      pr = 1.02; pg = 1.06; pb = 1.18; tintMix = 0.12;
      coneIn = 0.78; coneOut = 0.58;
    } else if (!street && kindRoll < 0.08) {
      // Work lamp: a dimmer, orange aging bulb among the floods.
      eMul = 0.55; volW = 0.4;
      pr = 1.38; pg = 0.74; pb = 0.30; tintMix = 0.2;
      coneIn = 0.70; coneOut = 0.48;
    } else {
      // Standard street post / flood mast: sodium-orange ↔ warm-yellow ↔ cool-white
      // temperature mix so a row of lamps reads like real aged street lighting.
      const ct = lh(i + 17);
      if (ct < 0.34)      { pr = 1.34; pg = 0.70; pb = 0.32; }   // orange sodium
      else if (ct < 0.68) { pr = 1.16; pg = 1.00; pb = 0.55; }   // warm yellow
      else                { pr = 0.93; pg = 0.99; pb = 1.15; }   // cool white
      coneIn  = 0.66 + hard * 0.10;   // 48.7° → 40.5° inner half-angle
      coneOut = coneIn - 0.26;        // soft outer skirt
    }
    // A fill light has no fixture, so it must not draw a lens halo hanging in
    // mid-air; damp its volumetric beam for the same reason.
    if (posts && posts[i].synth) { glareW = 0; volW = Math.min(volW, 0.3); }
    // BEAM CONE WIDTH knob: scale the soft-skirt angular width (coneIn−coneOut).
    // >1 widens the illuminated cone (lower outer cos), <1 tightens the hotspot.
    coneOut = coneIn - (coneIn - coneOut) * (LT.beamCone || 1);
    const mr = tint[0] * tintMix + pr * (1 - tintMix);
    const mg = tint[1] * tintMix + pg * (1 - tintMix);
    const mb = tint[2] * tintMix + pb * (1 - tintMix);
    if (bleed == null) {
      // Legacy bleed: street/city circuits bleed more between pools.
      const bleedBase = street ? 0.30 : 0.14;
      const bleedVar  = street ? 0.18 : 0.12;
      bleed = bleedBase + lh(i + 31) * bleedVar;
    }
    // Beam aim: from the mast lens at the CENTRE OF THE NEAR LANE (side·hw/2) —
    // the pool spans centreline→near edge and sits under/near the fixture, so
    // the lamp visibly throws its light DOWN onto the road it stands over.
    const lx = posts ? posts[i].x : track.px[k] + track.rx[k] * (track.hw[k] + 6) * side;
    const ly = posts ? posts[i].y : track.py[k] + height;
    const lz = posts ? posts[i].z : track.pz[k] + track.rz[k] * (track.hw[k] + 6) * side;
    const nlOff = track.hw[k] * 0.5 * side;
    let ax = track.px[k] + track.rx[k] * nlOff - lx;
    let ay = track.py[k] - ly;
    let az = track.pz[k] + track.rz[k] * nlOff - lz;
    // THROW DISTANCE (lens → the road it lights) drives the inverse-square energy
    // below and must be measured from this geometric vector, never from the beam
    // direction: a registered fixture may name its own aim, and those vectors are
    // unit-length, which would collapse the al² term to 1 and leave the lamp ~30×
    // too dim.
    const al = Math.hypot(ax, ay, az) || 1;
    // A registered fixture may name its own beam direction. The near-lane aim
    // above is right for a lamp standing BESIDE the road; a soffit luminaire is
    // already over it and must throw straight down, not rake sideways at a wall.
    if (post && post.aim) { ax = post.aim[0]; ay = post.aim[1]; az = post.aim[2]; }
    const anorm = Math.hypot(ax, ay, az) || 1;
    ax /= anorm; ay /= anorm; az /= anorm;
    // Physically-based punctual light: intensity is in inverse-square units (the
    // shader divides by d²), so scale by the lens→road distance² AND the surface
    // incidence at the aim point (NoL = h/al for an up-facing road) — a raking
    // beam needs more flux than a top-down one to land the same pool luminance.
    // The incidence divisor is CLAMPED so a mast beside banked/elevated road
    // (lens barely above the aim point) can't blow the energy up.
    const hAim = Math.max(ly - track.py[k], 1);
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
  // START-GANTRY DOWNLIGHTS: a crisp white bar of light straight down over the
  // start/finish at node 0 (typical gantry height) — marks the line the way
  // broadcast lighting does. Placement is independent of the scenery gantry mesh.
  // Skipped in the always-on subset: that set is "fixtures that burn in daylight",
  // and broadcast lighting over the grid is not one of them.
  if (!onlyAlways) {
    const hwk = track.hw[0] || 7;
    // Halved (1.15 -> 0.55 weight): three of these stack right over the grid, on
    // top of the flood_bank pit-straight lamps — the start line was the hottest
    // spot on every night circuit, blowing the road out exactly where every race
    // (and the player's first impression of the night lighting) begins.
    const ge = intensity * 0.55 * (8 * 8) * LT.poolEnergy;
    // POOL ENERGY / POOL RADIUS / BEAM CONE / VALLEY BLEED tuner knobs apply
    // here too — the gantry bar previously ignored them ("every floodlight" per
    // help text; the energy factor was a 0.55 literal = poolEnergy's default).
    // volW 0 / glareW 0: this bar is NOT parented to the scenery gantry (see the
    // note in js/track/scenery-structures.js), so there is no fixture at its
    // position — and drawGlow paints a lens halo for any record with glareW > 0.
    // Shipped at glareW 0.3 it put three glowing orbs 8 m over the start line
    // with nothing holding them up, each with a volumetric shaft under it; on
    // Bahrain the nearest real fixture is 42 m away. Same rule the synth fill
    // lights follow above ("A fill light has no fixture, so it must not draw a
    // lens halo hanging in mid-air"). The downward pool on the grid is unchanged.
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
