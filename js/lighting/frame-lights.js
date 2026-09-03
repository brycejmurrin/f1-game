/* Apex 26 — per-frame light state: setFrameLights (the nearest-CAP cull with
   the twilight scale, flicker / warm-up and the per-chunk full-set twin the
   renderer samples every lit frame) and appendCarTailLights (the nearest cars'
   tail-lights as real point lights). Reads the live knob values through
   LightKnobs.LT (eval-time destructure — tools/manifest.cjs HARD_EDGES); the
   baked records it culls come from js/lighting/track-lights.js. */
const FrameLights = (function () {
  "use strict";
  const { LT } = LightKnobs;

// ── Per-frame light assembly (extracted from js/game.js) ─────────────────────
const _clampNum = (v, a, b) => (v < a ? a : v > b ? b : v);

// Car rain lights as REAL light sources after dark: the nearest few cars carry a
// small red point light at the tail, so traffic reads as moving light sources —
// a red glow trailing each car on the road surface.
const _tlSmp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _tlSel = [];
function appendCarTailLights(frame, track, cars, player, mobileTier) {
  const L = frame.lights;
  // PER-CHUNK LAMPS needs to know which records here are the DYNAMIC ones, and
  // it cannot be derived by measuring frame.lights before/after: when the set is
  // already at cap this function TRIMS the farthest static lamps before pushing,
  // so the length is unchanged and a before/after diff reports zero. Record the
  // range authoritatively instead, and zero it on every early return.
  frame.tailStart = L ? (L.length / 15) | 0 : 0;
  frame.tailCount = 0;
  // frame.lights is always the per-frame copy (flicker copies every frame), so
  // appending here never mutates the cached track set.
  if (!L || L === track._lights || !player) return;
  _tlSel.length = 0;
  const tlRange = LT.tailRange != null ? LT.tailRange : 160;   // TAIL-LIGHT RANGE knob
  let _tlN = 0;
  for (const c of cars) {
    const ds = Math.abs(c.s - player.s);
    const d = Math.min(ds, track.total - ds);
    if (d < tlRange) {
      // Reuse pooled {c,d} entries in place (same pattern as _lightCullBuf) —
      // fresh objects here were per-car-per-frame GC churn on night tracks.
      const e = _tlSel[_tlN];
      if (e) { e.c = c; e.d = d; } else _tlSel[_tlN] = { c: c, d: d };
      _tlN++;
    }
  }
  _tlSel.length = _tlN;      // drop stale entries from earlier (busier) frames
  _tlSel.sort(_byDistAsc);   // hoisted comparator, shared with setFrameLights
  const nT = Math.min(_tlSel.length, 5);
  if (nT <= 0) return;
  // Reserve up to nT slots for the nearest cars' tail-lights. On a dense night
  // grid the floodlights alone can fill the frame's light budget, so appending
  // overflowed and the shader dropped the tail-lights. Evict that many of the
  // FARTHEST floods instead (setFrameLights sorts ascending by distance, so the
  // tail end is farthest). Measure against the SAME budget setFrameLights culled
  // to — against the literal 32 this whole reserve was a no-op on the mobile
  // tier, i.e. on exactly the devices it was written to protect.
  // Measure against the TOTAL slot budget, not the LAMP budget. lampCap conflates
  // the two: with traffic it returns lampCull (40) because — in its own words —
  // "~8 of the 48 shader slots stay free for tail-lights". setFrameLights culls
  // lamps to that 40, so room came out 40 - 40 = 0 and this evicted lamps into
  // eight slots that were sitting empty. The eviction is a hard delete with no
  // fade (the cull's distance ramp has already been applied and baked in), so on
  // a desktop night grid three lamps at FULL brightness vanished the moment a
  // third rival came inside tailRange, and which three depended on camera yaw
  // because the set is ordered by the yaw-biased metric.
  // Mobile still evicts, deliberately: there the cap IS 24 lights total, which is
  // the per-fragment budget the tier exists to protect.
  const SLOTS = mobileTier ? 24 : 48;   // js/render/glx/glx.js MAX_LIGHTS
  const room = SLOTS - ((L.length / 15) | 0);
  if (room < nT && L.length >= nT * 15) L.length -= (nT - room) * 15;
  // TAIL-LIGHT FADE: ease the glow out over the last `tailFade` m before the range
  // cutoff so a car doesn't pop in/out abruptly as it drifts past the limit. 0 =
  // hard cutoff (as-shipped), so the fade term is 1 for every selected car.
  const tlFade = LT.tailFade != null ? LT.tailFade : 0;
  for (let j = 0; j < nT; j++) {
    const sel = _tlSel[j], c = sel.c;
    Tracks.sample(track, c.s, _tlSmp);
    const tx = _tlSmp.t[0], tz = _tlSmp.t[2];
    // rear-facing, tilted down: the glow lands on the road behind the car
    let dx = -tx * 0.87, dy = -0.5, dz = -tz * 0.87;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    // BRAKE FLARE: the tail glow surges while the car is braking. brakeHeat is
    // the render-only 0..1 disc-heat ramp every car already tracks (rises under
    // braking, cools after) — read-only here, physics untouched.
    const bAmt = _clampNum(c.brakeHeat || 0, 0, 1) * LT.brakeGlowMul;
    const fadeF = tlFade > 0 ? _clampNum((tlRange - sel.d) / tlFade, 0, 1) : 1;
    const tlm = LT.tailLightMul * (1 + bAmt * 1.6) * fadeF;
    L.push(
      _tlSmp.p[0] + _tlSmp.r[0] * c.x - tx * 2.4,
      _tlSmp.p[1] + 0.55,
      _tlSmp.p[2] + _tlSmp.r[2] * c.x - tz * 2.4,
      4.5 * tlm, 0.14 * tlm, 0.10 * tlm,
      8 * (1 + bAmt * 0.45), dx, dy, dz, 0.5, -0.2, 0.12, 0.25, 0.4);
  }
  // The nT tail-lights are the LAST nT records — after any trim above.
  frame.tailCount = nT;
  frame.tailStart = ((L.length / 15) | 0) - nT;
}

// Cull the track light set to the nearest CAP lamps (shader max 48; traffic uses
// LT.lampCull, def 40, leaving room for car tail lights) and flatten into
// `frame.lights`. Called each frame only when floodlights are lit.
const _lightCullBuf = [];
const _lightScaleBuf = [];
// FULL-SET twin of _lightScaleBuf, for the per-chunk lamp path. Per-chunk
// consumers used to read the RAW baked list, so none of the LAMPS controls
// (LAMP LEVEL / TEMPERATURE / FLICKER / WARM-UP / the twilight ramp) reached a
// chunked mesh — drag LAMP LEVEL to 0 and the cars went dark while the city
// stayed lit. This carries the same per-lamp transform the culled set gets.
// REUSED AND MUTATED IN PLACE, never reallocated: LampChunks.resolve memoises
// its per-chunk tables on this array's IDENTITY, and positions/radii never
// change here, so a fresh array frame would re-bake every table every frame.
// _allLightsGen is the change signal for consumers that cache by identity
// (WGX's trackLightSBO upload) — it moves when the VALUES move.
const _allLightsBuf = [];
let _allLightsGen = 0;
const _lightHeap = [];         // pooled max-heap (≤CAP entries) for nearest-N selection
const _gHeap = [];             // pooled max-heap of GEOMETRIC squared distances (see gCap)
const _byDistAsc = (a, b) => a.d - b.d;   // hoisted sort comparator (no per-frame closure)
// The CAP-th smallest value in `buf[i].g` — the radius an UNBIASED nearest-CAP cull
// would cut at. It depends only on where the camera IS, never on where it POINTS,
// which is the whole reason the fade below is anchored to it. Same partial-selection
// shape as the main heap (max-heap of size CAP, one pass), on plain numbers.
function capRadius2(buf, count, CAP) {
  const h = _gHeap; h.length = 0;
  for (let i = 0; i < count; i++) {
    const g = buf[i].g;
    if (h.length < CAP) {
      let ci = h.length; h.push(g);
      while (ci > 0) { const pi = (ci - 1) >> 1; if (h[pi] < h[ci]) { const t = h[pi]; h[pi] = h[ci]; h[ci] = t; ci = pi; } else break; }
    } else if (g < h[0]) {
      h[0] = g;
      let pi = 0;
      for (;;) { const l = pi * 2 + 1, rr = l + 1; let lg = pi; if (l < CAP && h[l] > h[lg]) lg = l; if (rr < CAP && h[rr] > h[lg]) lg = rr; if (lg === pi) break; const t = h[pi]; h[pi] = h[lg]; h[lg] = t; pi = lg; }
    }
  }
  return h[0] || 1;
}
let _lampWarmT0 = -1e9;        // wall-clock (s) when the floods last switched ON (warmup ramp origin)
let _lampLastT = -1e9;         // last frame we copied lights — a gap means the floods were off
const _flScr = [1, 1, 1];      // per-lamp rgb factor scratch (flicker × breathe × warmup tint)
const _flSteady = [1, 1, 1];   // identity when flicker+warmup would leave intensity unchanged
// Flicker/warmup factors — closed over by hoisted `_flLive` so setFrameLights
// does not allocate a fresh closure every frame on night tracks.
let _flFlick = 0, _flWarmK = 1, _flTNow = 0;
function _flSteadyFn() { return _flSteady; }
function _flLive(o) {
  const flick = _flFlick, tNow = _flTNow, warmK = _flWarmK;
  const x = Math.sin((o + 13) * 91.17) * 43758.5453;
  const hsh = x - Math.floor(x);
  const amp = hsh > 0.90 ? flick : flick * 0.2;
  let f = 1 + amp * Math.sin(tNow * (6 + hsh * 9) + hsh * 40)
            + flick * 0.15 * Math.sin(tNow * (0.35 + hsh * 0.5) + hsh * 20);
  const warmDur = (4 + hsh * 4) * warmK;
  const wu = warmDur > 0 ? Math.min(1, Math.max(0, (tNow - _lampWarmT0) / warmDur)) : 1;
  const dip = LT.lampWarmupDim != null ? LT.lampWarmupDim : 0.30;
  f *= (1 - dip) + dip * wu;
  const cold = (1 - wu) * (LT.lampWarmupWarm != null ? LT.lampWarmupWarm : 1);
  _flScr[0] = f * (1 + cold * 0.22);
  _flScr[1] = f * (1 - cold * 0.10);
  _flScr[2] = f * (1 - cold * 0.38);
  return _flScr;
}
// Ranked-set cache: skip the O(count·log CAP) rebuild when the eye/fwd have not
// moved enough to change membership. Fade still uses geometric g (not yaw).
const _RANK_EYE_EPS2 = 0.25;   // 0.5 m eye motion → rebuild
const _RANK_FWD_EPS2 = 1e-4;   // unnormalized fwd delta (yaw/aim change)
let _rankSrc = null, _rankCap = -1, _rankCount = -1;
let _rankEyeX = NaN, _rankEyeY = NaN, _rankEyeZ = NaN;
let _rankFwdX = NaN, _rankFwdZ = NaN;
let _rankGRef = 1, _rankDEdge = 1, _rankTrunc = false;
let _rankReach = NaN, _rankBias = NaN, _rankFade = NaN;
// How many lights this frame may end up carrying. Named because BOTH movers need
// the same answer — setFrameLights culls down to it, and appendCarTailLights has
// to evict against it to make room. appendCarTailLights used to measure its room
// against the shader's literal 32 instead, so on the mobile tier (CAP 24) it saw
// 8 free slots that did not exist, evicted nothing, and left the phone running 29
// lights through the per-fragment loop the 24 was chosen to protect.
function lampCap(carCount, mobileTier) {
  // With traffic, CAP defaults to lampCull (40) so ~8 of the 48 shader slots stay
  // free for tail-lights; solo runs use the full 48. Mobile tier clamps both
  // paths to 24: the per-fragment lamp loop (GGX + clearcoat per lamp) is the
  // dominant night fill cost on phones, and clamping HERE (not the knob's def)
  // means a per-track preset can't push a phone back up to 48.
  let cap = Math.min(
    carCount > 1 ? Math.round(LT.lampCull != null ? LT.lampCull : 40) : 48,
    mobileTier ? 24 : 48);
  // Shed the nearest-lamp budget under PerfGov load before the fragment loop
  // pays for distant slots (tier 1 drops env probe; tier 2 drops lamp shadow).
  if (typeof PerfGov !== "undefined") {
    const tier = PerfGov.tier();
    if (tier >= 2) cap = Math.min(cap, 24);
    else if (tier >= 1) cap = Math.min(cap, 32);
  }
  return cap;
}
// Scale the WHOLE baked set for the per-chunk path with the same transform the
// culled set receives. Only runs when per-chunk lamps are actually on.
// Which source array the static lanes in _allLightsBuf were copied from. The
// same invalidation LampChunks uses: a rebuild:true tuner knob nulls
// track._lights and the next build mints a NEW array, so identity is the whole
// key. Length is checked too, so a set that grows in place cannot slip through.
let _alSrc = null, _alLen = -1;
// Of the 15 lanes per lamp, TWELVE are baked-static — position, radius, cone
// dir/cos, bleed, volW, glareW. The comment on setFrameLights says so outright:
// positions are copied verbatim and flicker scales rgb only. This function
// nevertheless rewrote all fifteen every frame, for every baked lamp on the
// track, on BOTH backends, whenever per-chunk lamps are on — which after the
// round-6 work is every preset in every condition. Copy the statics once per
// source array; write the three that can actually move.
function _fillAllLights(frame, src, sr, sg, sb, fl) {
  const out = _allLightsBuf;
  const n = src.length;
  const fresh = _alSrc !== src || _alLen !== n;
  let changed = out.length !== n;
  if (fresh) {
    if (out.length !== n) out.length = n;
    for (let i = 0; i < n; i += 15) {
      out[i] = src[i]; out[i+1] = src[i+1]; out[i+2] = src[i+2]; out[i+6] = src[i+6];
      out[i+7] = src[i+7]; out[i+8] = src[i+8]; out[i+9] = src[i+9]; out[i+10] = src[i+10];
      out[i+11] = src[i+11]; out[i+12] = src[i+12]; out[i+13] = src[i+13]; out[i+14] = src[i+14];
    }
    _alSrc = src; _alLen = n;
    changed = true;   // a new set is a change even if every colour matches
  }
  for (let i = 0; i < n; i += 15) {
    const f = fl(i);
    const r = src[i+3] * sr * f[0], g = src[i+4] * sg * f[1], b = src[i+5] * sb * f[2];
    if (!changed && (out[i+3] !== r || out[i+4] !== g || out[i+5] !== b)) changed = true;
    out[i+3] = r; out[i+4] = g; out[i+5] = b;
  }
  if (changed) _allLightsGen++;
  frame.allLights = out;
  frame.allLightsGen = _allLightsGen;
}

function setFrameLights(frame, track, cars, eye, scale, fwd, mobileTier, srcSet) {
  // srcSet overrides the session light set (the daylight always-on subset);
  // absent, the baked full set is used exactly as before.
  const src = srcSet || track._lights;
  // Empty set / not a lit session (caller usually gates, but count===0 is free).
  if (!src || !src.length) { frame.lights = null; _rankSrc = null; return; }
  // Reserve slots for car tail lights: appendCarTailLights fills AFTER this
  // cull, against the same budget (see lampCap).
  const CAP = lampCap(cars.length, mobileTier);
  // scale may be a scalar (uniform dim) or a [r,g,b] vector (time-of-day brightness
  // + warmth: dim & warm at twilight, full & neutral at deep night).
  const sr = Array.isArray(scale) ? scale[0] : (scale == null ? 1 : scale);
  const sg = Array.isArray(scale) ? scale[1] : sr;
  const sb = Array.isArray(scale) ? scale[2] : sr;
  const count = src.length / 15;
  const out = _lightScaleBuf;
  // Per-lamp FLICKER, computed CPU-side each frame (zero shader cost): healthy
  // lamps barely breathe (±2%), the occasional aging tube visibly pulses (±10%).
  // Hash on the lamp's stable source offset so the same lamp always flickers the
  // same way — the night stops being a frozen still.
  const tNow = performance.now() * 0.001;
  // WARMUP: when the floods switch on (race start on a night track, a live
  // day→night flip) discharge lamps don't snap to full — they run slightly dim
  // and sodium-warm and settle to their true colour over a few seconds, each
  // lamp on its own stagger. A >1 s gap since the last copy means the floods
  // were off, so this frame is a fresh switch-on. Per-frame copy only — the
  // baked track records are never touched.
  if (tNow - _lampLastT > 1.0) { _lampWarmT0 = tNow; _rankSrc = null; }
  _lampLastT = tNow;
  // Skip sin/hash work when intensity would be unchanged: flicker knob at 0 and
  // warmup fully settled (or warmup knob 0 = instant). Max warmDur is 8×knob.
  const flick = LT.lampFlicker || 0;
  const warmK = LT.lampWarmup != null ? LT.lampWarmup : 1;
  const warmDone = !(warmK > 0) || (tNow - _lampWarmT0) >= 8 * warmK;
  const skipFl = !(flick > 0) && warmDone;
  _flFlick = flick; _flWarmK = warmK; _flTNow = tNow;
  const fl = skipFl ? _flSteadyFn : _flLive;
  // Cheap unsorted copy ONLY when every lamp fits with the full 5-slot tail-light
  // reserve to spare. It used to run for any count ≤ 32, which broke two promises
  // downstream: appendCarTailLights evicts overflow from the array TAIL on the
  // assumption the set is sorted farthest-last (it wasn't — on a 29-32-lamp track
  // it could snap off the nearest floods instead), and the CAP reservation was
  // silently ignored. 24+-lamp tracks now take the sorted heap path below.
  if (count + 5 <= CAP) {
    _rankSrc = null;   // dense path doesn't use the ranked cache
    // Copy + scale rgb (time-of-day scale × flicker); geometry params pass through.
    out.length = 0;
    for (let i = 0; i < src.length; i += 15) {
      const f = fl(i);
      out.push(src[i], src[i+1], src[i+2],
        src[i+3] * sr * f[0], src[i+4] * sg * f[1], src[i+5] * sb * f[2], src[i+6],
        src[i+7], src[i+8], src[i+9], src[i+10], src[i+11], src[i+12], src[i+13], src[i+14]);
    }
    frame.lights = out;
    if (frame.perChunkLights > 0) _fillAllLights(frame, src, sr, sg, sb, fl);
    return;
  }
  // Distance-rank: select the nearest CAP. Reuse a pooled object array + the
  // output buffer so a dense night grid doesn't allocate fresh garbage every
  // frame (was the main source of Minor-GC jitter on Vegas/Singapore).
  // Lights BEHIND the camera rank farther: a purely radial nearest-N wastes
  // half the budget on lamps you can't see, ending the lit road in a hard dark
  // boundary ahead. The forward bias (LT.lampBehindBias) pushes that boundary
  // further out — past the night fog wall.
  const fx = fwd ? fwd[0] : 0, fz = fwd ? fwd[2] : 0;
  const flen2 = fx * fx + fz * fz || 1;
  // LAMP REACH AHEAD knob: as-shipped this is 1 (no-op). Above 1, lamps roughly
  // ahead of the camera get their ranked distance shrunk (mirror of the
  // BEHIND-CAM BIAS penalty below, applied as a divisor instead of a
  // multiplier), so they win the nearest-CAP budget from farther out and the
  // lit zone reaches further down the road on a dense track.
  const reach = LT.lampReach != null ? LT.lampReach : 1;
  const bias = LT.lampBehindBias != null ? LT.lampBehindBias : 5.25;
  const fade = LT.lampCullFade != null ? LT.lampCullFade : 0.35;   // LAMP CULL FADE knob
  const heap = _lightHeap;
  const edx = eye[0] - _rankEyeX, edy = eye[1] - _rankEyeY, edz = eye[2] - _rankEyeZ;
  const fdx = fx - _rankFwdX, fdz = fz - _rankFwdZ;
  const reuseRank = _rankSrc === src && _rankCap === CAP && _rankCount === count
    && _rankReach === reach && _rankBias === bias && _rankFade === fade
    && heap.length > 0
    && (edx * edx + edy * edy + edz * edz) < _RANK_EYE_EPS2
    && (fdx * fdx + fdz * fdz) < _RANK_FWD_EPS2;
  let gRef, dEdge, truncated;
  if (reuseRank) {
    // Membership + geometric fade terms unchanged — only re-tint with scale/flicker.
    gRef = _rankGRef; dEdge = _rankDEdge; truncated = _rankTrunc;
  } else {
    const buf = _lightCullBuf;
    for (let i = 0; i < count; i++) {
      const o = i * 15, dx = src[o] - eye[0], dy = src[o + 1] - eye[1], dz = src[o + 2] - eye[2];
      let d = dx * dx + dy * dy + dz * dz;
      // Behind-camera penalty RAMPED in over ~14° past the camera plane (was a hard
      // sign test ×6.25: the instant a lamp crossed the plane its rank leapt several
      // places in ONE frame, stepping its pool's brightness — and a fast chase-cam
      // yaw flipped the half-space for many lamps at once, a whole-field shudder).
      const b = dx * fx + dz * fz;
      if (b < 0) {
        const dl2 = dx * dx + dz * dz || 1;
        const ratio2 = (b * b) / (flen2 * dl2 * 0.0625);
        // BEHIND-CAM BIAS knob scales how hard rearward lamps are pushed down the
        // nearest-N rank (def 5.25 = as-shipped forward push).
        d *= 1 + bias * Math.min(1, ratio2);
      } else if (reach > 1) {
        const dl2 = dx * dx + dz * dz || 1;
        const ratio2 = (b * b) / (flen2 * dl2);
        // SQUARED divisor, because `d` here is a SQUARED distance: dividing it by
        // k shortens the ranked LINEAR distance only by sqrt(k), so the plain
        // `d /= 1 + (reach-1)*ratio2` this replaced delivered sqrt(reach) — a
        // slider reading 4 bought 2x reach, not 4x, and measured as a barely
        // visible +44% at Singapore 0.55. Squaring makes the knob mean what its
        // label says: a dead-ahead lamp (ratio2 = 1) ranks as if `reach` times
        // nearer, so REACH 4 really is 4x. Still an exact no-op at the shipped
        // default of 1, and untouched for lamps to the side (ratio2 -> 0).
        const k = 1 + (reach - 1) * ratio2;
        d /= k * k;
      }
      const e = buf[i];
      // g = the TRUE squared distance, kept alongside the biased rank distance d.
      // Ranking wants the bias (that is what buys forward reach); the brightness
      // fade must not have it — see the cullF block after the heap.
      const g = dx * dx + dy * dy + dz * dz;
      if (e) { e.d = d; e.g = g; e.o = o; } else buf[i] = { d: d, g: g, o: o };
    }
    buf.length = count;
    // Partial selection: keep only the nearest CAP in a max-heap instead of sorting
    // all ~count entries every frame (O(count·log CAP) vs O(count·log count)).
    heap.length = 0;
    for (let i = 0; i < count; i++) {
      const e = buf[i];
      if (heap.length < CAP) {
        let ci = heap.length; heap.push(e);
        while (ci > 0) { const pi = (ci - 1) >> 1; if (heap[pi].d < heap[ci].d) { const t = heap[pi]; heap[pi] = heap[ci]; heap[ci] = t; ci = pi; } else break; }
      } else if (e.d < heap[0].d) {
        heap[0] = e;
        let pi = 0;
        for (;;) { const l = pi * 2 + 1, rr = l + 1; let lg = pi; if (l < CAP && heap[l].d > heap[lg].d) lg = l; if (rr < CAP && heap[rr].d > heap[lg].d) lg = rr; if (lg === pi) break; const t = heap[pi]; heap[pi] = heap[lg]; heap[lg] = t; pi = lg; }
      }
    }
    // Sort just those 32 ascending so the tail fade eases the farthest of the set.
    // (Comparator hoisted to module scope — this runs every lit frame.)
    heap.sort(_byDistAsc);
    // DISTANCE-based tail fade (was rank-quantised in 1/6 steps: a lamp entered the
    // set at an instant 16.7% and its brightness stepped by 16.7% every rank churn —
    // visible stepping as the set shifted at speed). Fading by closeness to the set
    // boundary is continuous: 0 exactly at the boundary, full by ~35% inside it, so
    // membership changes are invisible.
    dEdge = heap[heap.length - 1].d || 1;
    // The boundary fade only makes sense when lamps were actually culled — if the
    // whole baked set fit inside CAP (the 24-32-lamp tracks that now take this
    // path for its sorting), there is no set boundary, and fading "the farthest
    // of the set" would black out a real lamp that used to be lit.
    truncated = count > CAP;
    // ── THE FADE MUST NOT KNOW WHICH WAY THE CAMERA POINTS ────────────────────
    // This was `(dEdge - e.d) / (dEdge * 0.35)`, and BOTH terms carry camera yaw:
    // e.d is the behind-biased rank distance, and dEdge is the biased edge of a set
    // whose composition changes as the camera turns. So a lamp that never moved
    // changed brightness when the player merely looked somewhere else. Measured on
    // bahrain/night with the eye pinned and only the aim yawing ±60°
    // (scratch harness, cap forced to 12 so the cull engages): a lamp 81 m ahead
    // swung 2.35× — DIMMEST looking straight down the road, because that is when
    // the most lamps compete and dEdge shrinks — and one at 208 m swung 23.5×.
    // That is the reported "road section in front of me gets darker when I turn".
    //
    // Fade on the lamp's own GEOMETRIC distance g against gRef, a radius built from
    // the CAP-th nearest lamp by TRUE distance. capRadius2 has no camera direction
    // in it at all, so the steady-state brightness of every lamp is now a function
    // of where the camera IS and nothing else. (Temporal smoothing was considered
    // and rejected: a yaw that is held converges to the same wrong value, so it
    // turns the step into a ramp without removing the artifact.)
    //
    // gRef is scaled by the MAXIMUM rank advantage the bias can grant, so the reach
    // the bias buys is still fully lit rather than being faded to black the moment
    // it exceeds the unbiased radius: a behind lamp's d is at most (1+behindBias)·g,
    // and an ahead lamp under REACH ABOVE 1 has d ≥ g/reach², so no member of the
    // set can sit beyond gRef.
    //
    // edgeGuard keeps the one property the old form did have — a lamp must be at
    // zero by the time it is dropped, or membership churn pops. It still measures
    // against the true boundary, but over a NARROWER shell than the old 35%, so the
    // residual yaw dependence is confined to lamps near the set boundary.
    //
    // THIS WIDTH IS THE YAW-COUPLING DIAL — DO NOT WIDEN IT. dEdge is the one term
    // left that moves with the camera, so every lamp inside the shell inherits that
    // movement. Measured on bahrain/night, eye pinned, aim swept ±60°, worst
    // stationary-lamp brightness swing (scratch harness, wrapping setFrameLights):
    //   old 0.35 form  5.01x / 2.99x / 2.86x / 2.77x / 2.55x
    //   0.20           5.01x / 2.67x / 2.52x / 2.39x / 2.13x   <- gives the fix back
    //   0.08           2.07x / 1.07x / 1.01x / 1.00x / 1.00x
    // 0.20 was tried specifically to give appendCarTailLights' eviction more cover
    // (it drops the last nT records by ARRAY POSITION, not by brightness, whenever a
    // rival comes inside tailRange) and it cost almost the whole decoupling. That
    // eviction is worth fixing at its source — the CAP reserve, lampCap() — not by
    // widening a band whose width IS the artifact.
    gRef = truncated
      ? capRadius2(buf, count, CAP) * (1 + bias) * (reach * reach)
      : 1;
    _rankSrc = src; _rankCap = CAP; _rankCount = count;
    _rankEyeX = eye[0]; _rankEyeY = eye[1]; _rankEyeZ = eye[2];
    _rankFwdX = fx; _rankFwdZ = fz;
    _rankGRef = gRef; _rankDEdge = dEdge; _rankTrunc = truncated;
    _rankReach = reach; _rankBias = bias; _rankFade = fade;
  }
  const _cullBand = gRef * fade;
  const _guardBand = dEdge * 0.08;
  out.length = 0;
  for (let i = 0; i < heap.length; i++) {
    const e = heap[i], o = e.o;
    const cullF = truncated
      ? Math.min(Math.max(0, Math.min(1, (gRef - e.g) / _cullBand)),
                 Math.max(0, Math.min(1, (dEdge - e.d) / _guardBand)))
      : 1;
    const f = fl(o);
    out.push(src[o], src[o+1], src[o+2],
      src[o+3] * sr * f[0] * cullF, src[o+4] * sg * f[1] * cullF, src[o+5] * sb * f[2] * cullF,
      src[o+6], src[o+7], src[o+8], src[o+9], src[o+10], src[o+11], src[o+12], src[o+13],
      // glareW fades with the cull too: drawGlow normalises the lamp colour, so a
      // colour-only fade barely dims the halo — it blinked off at ~full brightness
      // when the lamp left the set.
      src[o+14] * cullF);
  }
  frame.lights = out;
  if (frame.perChunkLights > 0) _fillAllLights(frame, src, sr, sg, sb, fl);
}

  return { setFrameLights, appendCarTailLights };
})();
