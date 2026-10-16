"use strict";
/* RivalAudio — the field around you, reduced to the player's TRACK frame for
 * js/audio/engine.js, which owns the sound and deliberately does no track maths.
 *
 * Track frame on purpose: `c.x` is already lateral metres (+right) and `c.s`
 * arc metres, so "alongside on your left" needs no heading convention to get
 * backwards. Fixed slots filled by bounded insertion: this runs beside
 * setEngine every frame, and map().sort().slice() would hand the GC 21 objects
 * a frame to keep the four that survive.
 *
 * VOICES STAY WITH THEIR CAR. Each row carries `slot`, the index of the
 * engine.js voice that plays it, and that index is bound to the CAR for as long
 * as the car stays in the voiced set. It was the distance rank: two rivals
 * swapping places behind you swapped voices, so their pans glided across each
 * other and each note jumped by the slot detune delta (up to 46 cents) exactly
 * when they were side by side. Now a voice is reassigned only when a car
 * leaves the nearest SLOTS and another takes its place.
 *
 * PASS-BY POOL. engine.js owns the rival ENGINE note (forbidden here). This
 * module owns the whoosh of a car going past: a fixed SLOTS loop of noise →
 * lowpass → gain → stereo panner, built once in attach() and aimed every
 * collect() with setTargetAtTime. No node is created on the hot path. Steal
 * by distance — the same slot binding as the collector.
 */
var RivalAudio = (() => {
  const SLOTS = 4;
  // Never TIGHTER than engine.js's RIVAL_RANGE, or a car winks off at the
  // collector's edge instead of fading out. Kept equal to it.
  const RANGE = 150;             // metres; past this a rival is inaudible anyway
  const REF = 6;                 // metres inside which a pass-by is at full level
  const SPEED_OF_SOUND = 343;
  const PAN_MAX = 0.85;
  const GAIN_PEAK = 0.22;
  const BEHIND = 0.78;
  const ROLLOFF = 1.15;

  function passByGain(dist, arc) {
    const d = +dist || 0;
    if (!(d < RANGE) || d < 0) return 0;
    const near = REF / (REF + ROLLOFF * Math.max(0, d - REF));
    return GAIN_PEAK * near * (arc < 0 ? BEHIND : 1);
  }
  function passByDoppler(approach) {
    const closing = Math.max(-90, Math.min(90, +approach || 0));
    return Math.max(0.80, Math.min(1.25, SPEED_OF_SOUND / (SPEED_OF_SOUND - closing)));
  }
  function passByPan(lat, arc) {
    return PAN_MAX * Math.max(-1, Math.min(1, (+lat || 0) / Math.max(3, Math.abs(+arc || 0) + 3)));
  }
  function aimParam(param, target, t, tau) {
    if (!param || typeof param.setTargetAtTime !== "function") return;
    const prev = param._apexPassTgt;
    if (prev === target || (prev !== undefined && Math.abs(prev - target) < 1e-4)) return;
    param.setTargetAtTime(target, t, tau);
    param._apexPassTgt = target;
  }
  function noiseBuffer(ctx) {
    const sr = ctx.sampleRate || 44100;
    const n = Math.max(1, sr | 0);
    const buf = ctx.createBuffer(1, n, sr);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    return buf;
  }
  const slots = Array.from({ length: SLOTS },
    () => ({ lat: 0, arc: 0, wx: null, wz: null, rev: 0, approach: 0, dist: 0, voice: "", slot: 0, car: null }));
  const _wScratch = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
  function worldXZ(track, s, x) {
    if (!track || s == null || typeof Tracks === "undefined" || !Tracks.sample) return null;
    Tracks.sample(track, s, _wScratch);
    return [_wScratch.p[0] + _wScratch.r[0] * (x || 0), _wScratch.p[2] + _wScratch.r[2] * (x || 0)];
  }
  const out = [];

  // Shared pass-by graph: GameAudio.init() calls RivalAudio.attach(ctx, dest)
  // and every create() instance aims the same four voices. Per-instance voices
  // left the pool silent — collect() ran on game.js's instance, attach on another.
  // Lazy first-bind: engine.js may init() before this file evaluates (LAZY_AUDIO
  // order) and stash dest on the stub as _pendingAttach; we consume it below.
  const pending = (typeof RivalAudio !== "undefined" && RivalAudio._pendingAttach) || null;
  const voiced = new Array(SLOTS).fill(false);
  let actx = null, voices = null;

  function attach(ctx, bus) {
    if (!ctx) return;
    if (voices && actx === ctx) return;
    if (voices) detach();
    actx = ctx;
    const dest = bus || ctx.destination;
    const noise = noiseBuffer(ctx);
    voices = [];
    for (let i = 0; i < SLOTS; i++) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      if (filt.frequency) filt.frequency.value = 4000;
      const g = ctx.createGain();
      if (g.gain) g.gain.value = 0;
      const p = ctx.createStereoPanner();
      if (p.pan) p.pan.value = 0;
      src.connect(filt);
      filt.connect(g);
      g.connect(p);
      if (dest) p.connect(dest);
      try { src.start(0); } catch (e) { /* already started */ }
      voices.push({ src, filt, gain: g, pan: p, dist: 0, key: -1 });
    }
  }

  function applyPassBy(rows) {
    if (!voices || !actx) return;
    const t = actx.currentTime || 0;
    for (let i = 0; i < SLOTS; i++) voiced[i] = false;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const sl = Number.isInteger(r.slot) && r.slot >= 0 && r.slot < SLOTS ? r.slot : i;
      if (voiced[sl] || sl >= voices.length) continue;
      voiced[sl] = true;
      const v = voices[sl];
      const dist = r.dist != null ? +r.dist : Math.hypot(+r.lat || 0, +r.arc || 0);
      aimParam(v.gain.gain, passByGain(dist, r.arc), t, 0.10);
      aimParam(v.src.playbackRate, passByDoppler(r.approach), t, 0.08);
      aimParam(v.pan.pan, passByPan(r.lat, r.arc), t, 0.06);
      const cut = Math.max(700, Math.min(12000,
        12000 * Math.pow(REF / Math.max(dist, REF), 0.35)));
      aimParam(v.filt.frequency, cut, t, 0.12);
      v.dist = dist;
      v.key = r.key;
    }
    for (let i = 0; i < voices.length; i++) {
      if (voiced[i]) continue;
      aimParam(voices[i].gain.gain, 0, t, 0.12);
      voices[i].dist = 0;
      voices[i].key = -1;
    }
  }

  // Stop-engine silence (#2187): collect() only runs from the race step, so
  // pause / finish / quit / scrub exit must zero the pool or the last gain
  // keeps hissing under the menus. Same as applyPassBy([]), at time t.
  function silence(t) {
    if (!voices) return;
    const at = t != null ? t : (actx && actx.currentTime) || 0;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      aimParam(v.gain.gain, 0, at, 0.06);
      v.dist = 0;
      v.key = -1;
    }
  }

  function detach() {
    if (!voices) return;
    const t = actx ? actx.currentTime || 0 : 0;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      try { if (v.gain.gain) v.gain.gain.setTargetAtTime(0, t, 0.06); } catch (e) { /* gone */ }
      try { v.src.stop(t + 0.3); } catch (e) { /* already stopped */ }
    }
    voices = null;
    actx = null;
  }

  function passByState() {
    if (!voices) return [];
    return voices.map((v, i) => ({
      slot: i,
      gain: +(v.gain.gain && v.gain.gain.value) || 0,
      rate: +(v.src.playbackRate && v.src.playbackRate.value) || 0,
      pan: +(v.pan.pan && v.pan.pan.value) || 0,
      dist: v.dist,
      key: v.key,
    }));
  }

  function passByVoices() { return voices || []; }

  function create(G) {
    const { clamp } = M4;
    const { IDLE_RPM, MAX_RPM } = PhysicsConsts;
    const revSpan = Math.max(1, MAX_RPM - IDLE_RPM);
    // bound[v] = the car voice v is playing (null = free). Per instance, so a
    // second create() (a new race) starts with every voice free.
    const bound = new Array(SLOTS).fill(null);
    const taken = new Array(SLOTS).fill(false);

    /** The nearest rivals to `player`, nearest first. The returned array and the
     *  objects in it are REUSED between calls — read them before the next one.
     *  Each row's `slot` is a stable 0..SLOTS-1 index (see the header). */
    function collect(player) {
      out.length = 0;
      const track = G.track, cars = G.cars;
      if (!player || !track || !cars || player.s == null) { applyPassBy(out); return out; }
      const lapLen = track.total, half = lapLen * 0.5;
      let n = 0;
      for (const c of cars) {
        const retired = typeof ReplayBuf !== "undefined" && ReplayBuf.audioRetired ? ReplayBuf.audioRetired(c) : c.retired;
        if (c === player || retired || c.s == null) continue;
        let arc = c.s - player.s;
        if (arc > half) arc -= lapLen; else if (arc < -half) arc += lapLen;
        if (arc > RANGE || arc < -RANGE) continue;
        const lat = (c.x || 0) - (player.x || 0);
        const dist = Math.hypot(lat, arc);
        if (dist > RANGE) continue;
        if (n === SLOTS && dist >= slots[n - 1].dist) continue;
        let at = n < SLOTS ? n++ : SLOTS - 1;
        while (at > 0 && slots[at - 1].dist > dist) {
          const prev = slots[at - 1], cur = slots[at];
          cur.lat = prev.lat; cur.arc = prev.arc; cur.wx = prev.wx; cur.wz = prev.wz; cur.rev = prev.rev;
          cur.approach = prev.approach; cur.dist = prev.dist; cur.voice = prev.voice; cur.car = prev.car;
          cur.net = prev.net; cur.key = prev.key;
          at--;
        }
        const slot = slots[at];
        slot.lat = lat; slot.arc = arc; slot.dist = dist; slot.car = c;
        if (c.px != null && c.pz != null) { slot.wx = c.px; slot.wz = c.pz; }
        else {
          const w = worldXZ(track, c.s, c.x);
          slot.wx = w ? w[0] : null; slot.wz = w ? w[1] : null;
        }
        // Their power unit's voice (engine.js ENGINE_VOICES key): a Ferrari
        // passing you should not sound like your own Mercedes.
        slot.voice = (c.team && c.team.engine) || "";
        slot.rev = clamp(((c.rpm || IDLE_RPM) - IDLE_RPM) / revSpan, 0, 1);
        // DOPPLER wants the LINE-OF-SIGHT closing speed, not the along-track one.
        // d(gap)/dt along the track is (their speed - yours); projected on the
        // line between you that is (arc/dist) of it, so a car level with you
        // (arc 0) is neither closing nor opening. The full Δv with a sign flip at
        // arc 0 stepped the pitch by ~300 cents across 0.2 m of arc as a car
        // came past. Lateral speed is not tracked (track-frame x is a position).
        slot.approach = -(arc / Math.max(dist, 1e-3)) * ((c.speed || 0) - (player.speed || 0));
        // Net-owned rivals get heavier pitch smoothing in engine.js; solo AI stays snappy.
        const np = G.netPlay;
        slot.net = !!(np && np.active && np.active() && np.owns && np.owns(c));
        // Index in G.cars — read-only. Do not call G.wireId here: it caches c._wireId and
        // episode-transients.test.mjs expects that field absent after reset().
        slot.key = G.cars.indexOf(c);
      }
      // Bind voices. A car already bound keeps its voice; a voice whose car left
      // the set is freed; a newcomer takes the lowest free voice.
      for (let v = 0; v < SLOTS; v++) taken[v] = false;
      for (let i = 0; i < n; i++) {
        const v = bound.indexOf(slots[i].car);
        slots[i].slot = v;
        if (v >= 0) taken[v] = true;
      }
      for (let v = 0; v < SLOTS; v++) if (!taken[v]) bound[v] = null;
      for (let i = 0; i < n; i++) {
        const row = slots[i];
        if (row.slot < 0) {
          const v = bound.indexOf(null);
          bound[v] = row.car; row.slot = v;
        }
        row.car = null;   // the row is a frame-local view; the binding lives in `bound`
        out.push(row);
      }
      applyPassBy(out);
      return out;
    }

    /** Short tyre squeal for AI / rival lock-up & slide. Positional via
     *  GameAudio.fieldContact; per-car cooldown and the 3-voice cap live there.
     *  Skips the player (CarSfx owns that path). Safe every frame. */
    function emitFieldSfx(player) {
      if (!player || typeof GameAudio === "undefined" || !GameAudio.fieldContact) return;
      const track = G.track, cars = G.cars;
      if (!track || !cars) return;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c || c === player || c.isPlayer || c.retired) continue;
        const lock = +c.wheelLock || 0;
        const skid = +c.skidIntensity || 0;
        const inten = Math.max(lock, skid > 0.45 ? skid : 0);
        // Pace-safe crawl gate: fraction of vTop, not a raw m/s literal (vstd-lint).
        const top = (G.vTop && G.vTop()) || 1;
        if (!(inten > 0.35) || Math.abs(+c.speed || 0) / top < 0.08) continue;
        let wx = c.px, wz = c.pz;
        if (wx == null || wz == null) {
          const w = worldXZ(track, c.s, c.x);
          if (!w) continue;
          wx = w[0]; wz = w[1];
        }
        GameAudio.fieldContact("squeal", inten, wx, wz, i);
      }
    }

    return { collect, emitFieldSfx, attach, tick: collect, detach, silence, passByState, passByVoices };
  }

  /** Wet-spray wake: nearest rival ahead within 40 m → 0..1 (1 = on your gearbox).
   *  Pure geometry over collect() rows; engine.js multiplies this into the spray
   *  bed only when the road is wet. Behind / alongside / past 40 m → 0. */
  function sprayAhead(rows) {
    if (!rows || !rows.length) return 0;
    let best = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const arc = +r.arc || 0;
      if (!(arc > 0)) continue;
      const dist = r.dist != null ? +r.dist : Math.hypot(+r.lat || 0, arc);
      if (!(dist > 0) || dist > 40) continue;
      const a = 1 - dist / 40;
      if (a > best) best = a;
    }
    return best;
  }

  if (pending && pending.ctx) {
    try { attach(pending.ctx, pending.dest); } catch (e) { /* stub dest already gone */ }
  }

  return { create, attach, detach, silence, sprayAhead, passByGain, passByDoppler, passByPan, passByVoices, SLOTS };
})();
