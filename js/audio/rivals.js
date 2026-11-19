"use strict";
var RivalAudio = (() => {
  const SLOTS = 4;
  function engineVoiceCap() {
    try {
      if (typeof GameAudio !== "undefined" && GameAudio && typeof GameAudio.rivalVoiceCount === "function") {
        const n = GameAudio.rivalVoiceCount() | 0;
        if (n > 0) return Math.min(SLOTS, n);
      }
    } catch (e) {  }
    try {
      if (typeof GLX !== "undefined" && GLX && (GLX.isMobile || GLX.mobileTier)) return 2;
    } catch (e) {  }
    return SLOTS;
  }
  const RANGE = 150;
  const REF = 6;
  const SPEED_OF_SOUND = 343;
  const PAN_MAX = 0.85;
  const GAIN_PEAK = 0.07;
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
  function labOn(name) {
    try {
      if (typeof location === "undefined" || !location) return false;
      const v = new URLSearchParams(location.search).get("lab");
      return !!v && v.split(",").some((s) => s.trim() === name);
    } catch (e) { return false; }
  }
  const EPS_ON = labOn("rivalEps");
  const EPS_GAIN = { abs: 5e-4, rel: 0.03 };
  const EPS_RATE = { abs: 0, rel: 0.005 };
  const EPS_PAN = { abs: 0.01, rel: 0 };
  const EPS_CUT = { abs: 0, rel: 0.01 };
  function aimParam(param, target, t, tau, eps) {
    if (!param || typeof param.setTargetAtTime !== "function") return;
    const prev = param._apexPassTgt;
    if (prev === target || (prev !== undefined && Math.abs(prev - target) < 1e-4)) return;
    if (eps && prev !== undefined && target !== 0 &&
        Math.abs(prev - target) < Math.max(eps.abs, eps.rel * Math.abs(target))) return;
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
    () => ({ lat: 0, arc: 0, wx: null, wz: null, rev: 0, approach: 0, relativeSpeed: 0, dist: 0, voice: "", slot: 0, car: null }));
  const _wScratch = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
  function worldXZ(track, s, x) {
    if (!track || s == null || typeof Tracks === "undefined" || !Tracks.sample) return null;
    Tracks.sample(track, s, _wScratch);
    return [_wScratch.p[0] + _wScratch.r[0] * (x || 0), _wScratch.p[2] + _wScratch.r[2] * (x || 0)];
  }
  const out = [];

  const pending = (typeof RivalAudio !== "undefined" && RivalAudio._pendingAttach) || null;
  const voiced = new Array(SLOTS).fill(false);
  let actx = null, voices = null, mix = 1, outDest = null, idled = false;

  function attach(ctx, bus) {
    if (!ctx) return;
    if (voices && actx === ctx) return;
    if (voices) detach();
    actx = ctx;
    const dest = bus || ctx.destination;
    outDest = dest;
    idled = false;
    const noise = noiseBuffer(ctx);
    voices = [];
    for (let i = 0; i < SLOTS; i++) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      if (filt.frequency) filt.frequency.value = 2400;
      if (filt.Q) filt.Q.value = 0.5;
      const g = ctx.createGain();
      if (g.gain) g.gain.value = 0;
      const p = ctx.createStereoPanner();
      if (p.pan) p.pan.value = 0;
      src.connect(filt);
      filt.connect(g);
      g.connect(p);
      if (dest) p.connect(dest);
      try { src.start(0); } catch (e) {  }
      voices.push({ src, filt, gain: g, pan: p, dist: 0, key: -1, level: 0 });
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
      const motion = 0.12 + 0.88 * Math.min(1, r.relativeSpeed / 45);
      v.level = passByGain(dist, r.arc) * motion;
      aimParam(v.gain.gain, v.level * mix, t, 0.10, EPS_ON ? EPS_GAIN : undefined);
      aimParam(v.src.playbackRate, passByDoppler(r.approach), t, 0.08, EPS_ON ? EPS_RATE : undefined);
      aimParam(v.pan.pan, passByPan(r.lat, r.arc), t, 0.06, EPS_ON ? EPS_PAN : undefined);
      const cut = Math.max(700, Math.min(2400,
        2400 * Math.pow(REF / Math.max(dist, REF), 0.35)));
      aimParam(v.filt.frequency, cut, t, 0.12, EPS_ON ? EPS_CUT : undefined);
      v.dist = dist;
      v.key = r.key;
    }
    for (let i = 0; i < voices.length; i++) {
      if (voiced[i]) continue;
      aimParam(voices[i].gain.gain, 0, t, 0.12);
      voices[i].level = 0;
      voices[i].dist = 0;
      voices[i].key = -1;
    }
  }

  function silence(t) {
    if (!voices) return;
    const at = t != null ? t : (actx && actx.currentTime) || 0;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      aimParam(v.gain.gain, 0, at, 0.06);
      v.level = 0;
      v.dist = 0;
      v.key = -1;
    }
  }

  function setMix(value) {
    mix = Math.max(0, Math.min(4, +value || 0));
    if (!voices || !actx) return;
    for (const v of voices) aimParam(v.gain.gain, v.level * mix, actx.currentTime || 0, 0.04);
  }

  function detach() {
    if (!voices) return;
    const t = actx ? actx.currentTime || 0 : 0;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      try { if (v.gain.gain) v.gain.gain.setTargetAtTime(0, t, 0.06); } catch (e) {  }
      try { v.src.stop(t + 0.3); } catch (e) {  }
    }
    voices = null;
    actx = null;
    outDest = null;
    idled = false;
  }

  function idle(on) {
    if (!voices || !outDest || !!on === idled) return;
    for (let i = 0; i < voices.length; i++) {
      const p = voices[i].pan;
      try { if (on) p.disconnect(); else p.connect(outDest); } catch (e) {  }
    }
    idled = !!on;
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
    const bound = new Array(SLOTS).fill(null);
    const taken = new Array(SLOTS).fill(false);

    function collect(player) {
      out.length = 0;
      const track = G.track, cars = G.cars;
      if (!player || !track || !cars || player.s == null) { applyPassBy(out); return out; }
      const lapLen = track.total, half = lapLen * 0.5;
      let n = 0;
      const np = G.netPlay, npLive = !!(np && np.active && np.active() && np.owns);
      for (let ci = 0; ci < cars.length; ci++) {
        const c = cars[ci];
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
          cur.relativeSpeed = prev.relativeSpeed; cur.approach = prev.approach; cur.dist = prev.dist; cur.voice = prev.voice; cur.car = prev.car;
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
        slot.voice = (c.team && c.team.engine) || "";
        slot.rev = clamp(((c.rpm || IDLE_RPM) - IDLE_RPM) / revSpan, 0, 1);
        slot.relativeSpeed = Math.abs((c.speed || 0) - (player.speed || 0));
        slot.approach = -(arc / Math.max(dist, 1e-3)) * ((c.speed || 0) - (player.speed || 0));
        slot.net = npLive && !!np.owns(c);
        slot.key = ci;
      }
      const cap = engineVoiceCap();
      for (let v = 0; v < cap; v++) taken[v] = false;
      for (let i = 0; i < n && i < cap; i++) {
        let v = -1;
        for (let b = 0; b < cap; b++) if (bound[b] === slots[i].car) { v = b; break; }
        slots[i].slot = v;
        if (v >= 0) taken[v] = true;
      }
      for (let v = 0; v < cap; v++) if (!taken[v]) bound[v] = null;
      for (let v = cap; v < SLOTS; v++) bound[v] = null;
      for (let i = 0; i < n && i < cap; i++) {
        const row = slots[i];
        if (row.slot < 0) {
          let v = 0;
          while (v < cap && bound[v] != null) v++;
          if (v < cap) { bound[v] = row.car; row.slot = v; }
          else row.slot = i;
        }
        row.car = null;
        out.push(row);
      }
      for (let i = cap; i < n; i++) {
        const row = slots[i];
        row.slot = i;
        row.car = null;
        out.push(row);
      }
      applyPassBy(out);
      return out;
    }

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

    return { collect, emitFieldSfx, attach, detach, silence, passByState, passByVoices };
  }

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
    try { if (pending.mix != null) setMix(pending.mix); attach(pending.ctx, pending.dest); } catch (e) {  }
  }

  return { create, attach, detach, silence, setMix, sprayAhead, passByVoices, idle };
})();
