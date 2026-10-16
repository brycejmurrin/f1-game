"use strict";
/* CrowdAudio — trackside crowd ambience bed.
 *
 * Filtered looping noise + sparse pooled cheers. Gain rises near the pit
 * straight (and grandstand props when a world list is cached). Short swells
 * on a climb into P1–P3 and on the chequered flag. Strictly silent on the
 * countdown, pause (incl. photo / free cam), results / podium, and with SFX
 * off. Respects the mobile tier (quieter bed, fewer cheer voices). Zero
 * nodes allocated on the hot path — attach() builds the graph once.
 *
 * Hookup (OWNED surfaces only): GameAudioSignal.create stashes the host;
 * lazy-bundles bind(G) after ensureAudio; this file wraps GameAudio
 * setEngine / stopEngine / setGridIdle / finish / setSfxEnabled. Never
 * touches engine.js or game.js.
 */
var CrowdAudio = (function () {
  const BED = 0.022;
  const NEAR = 0.048;
  const SWELL_CAP = 0.11;
  const CHEER_PEAK = 0.07;
  const CHEER_POOL_DESKTOP = 4;
  const CHEER_POOL_MOBILE = 2;
  const CHEER_MIN_GAP = 2.4;
  const PIT_WINDOW = 0.10;       // frac of lap either side of s=0 (= pit straight)
  const STAND_RANGE = 90;        // metres; beyond this a stand does not lift the bed
  const STAND_REF = 28;
  const EMPTY = 1e-4;

  function clamp01(x) {
    x = +x;
    if (!(x > 0)) return 0;
    if (x > 1) return 1;
    return x;
  }

  function lowPower() {
    try {
      if (typeof GLX === "undefined" || !GLX) return false;
      return !!(GLX.isMobile || GLX.mobileTier);
    } catch (e) { return false; }
  }

  function aim(param, target, t, tau) {
    if (!param || typeof param.setTargetAtTime !== "function") return;
    const prev = param._apexCrowdTgt;
    if (prev === target || (prev !== undefined && Math.abs(prev - target) < 1e-4)) return;
    param.setTargetAtTime(target, t, tau);
    param._apexCrowdTgt = target;
  }

  function noiseBuffer(ac) {
    const sr = ac.sampleRate || 44100;
    const n = Math.max(1, sr | 0);
    const buf = ac.createBuffer(1, n, sr);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    return buf;
  }

  let host = null;
  let G = null;
  let actx = null, bus = null;
  let bedSrc = null, bedFilt = null, bedGain = null;
  let cheers = null;             // { src, filt, g, freeAt }[]
  let cheerPool = 0;
  let lastCheerT = -1e9;
  let swellUntil = 0, swellAmt = 0;
  let lastPos = 0, sawFinish = false;
  let sfxOn = true;
  let standX = null, standZ = null, standN = 0;   // fixed arrays, filled on track change
  let standTrack = null;
  let wrapped = false;
  let _orig = null;

  function context() {
    if (host && typeof host.context === "function") return host.context();
    if (typeof GameAudio !== "undefined" && GameAudio && GameAudio.context) return GameAudio.context();
    return null;
  }
  function sfxBus() {
    if (host && typeof host.bus === "function") return host.bus();
    if (typeof GameAudio !== "undefined" && GameAudio && GameAudio.sfxBus) return GameAudio.sfxBus();
    return null;
  }
  function sfxOk() {
    if (host && typeof host.sfxOk === "function") return !!host.sfxOk();
    if (typeof GameAudio === "undefined" || !GameAudio) return false;
    if (typeof GameAudio.enabled === "function" && !GameAudio.enabled()) return false;
    return !!sfxOn && !!context();
  }
  function now() {
    if (host && typeof host.now === "function") return host.now();
    const c = context();
    return c ? c.currentTime : 0;
  }

  function detach() {
    if (cheers) {
      for (let i = 0; i < cheers.length; i++) {
        const v = cheers[i];
        try { if (v.src && v.src.stop) v.src.stop(); } catch (e) { /* stopped */ }
        try { if (v.src && v.src.disconnect) v.src.disconnect(); } catch (e) { /* torn */ }
        try { if (v.filt && v.filt.disconnect) v.filt.disconnect(); } catch (e) { /* torn */ }
        try { if (v.g && v.g.disconnect) v.g.disconnect(); } catch (e) { /* torn */ }
      }
    }
    if (bedSrc) {
      try { bedSrc.stop(); } catch (e) { /* stopped */ }
      try { bedSrc.disconnect(); } catch (e) { /* torn */ }
    }
    try { if (bedFilt) bedFilt.disconnect(); } catch (e) { /* torn */ }
    try { if (bedGain) bedGain.disconnect(); } catch (e) { /* torn */ }
    bedSrc = bedFilt = bedGain = null;
    cheers = null;
    cheerPool = 0;
    actx = bus = null;
  }

  function attach(ac, dest) {
    const c = ac || context();
    const d = dest || sfxBus();
    if (!c || !d) return false;
    if (bedSrc && actx === c && bus === d) return true;
    detach();
    actx = c;
    bus = d;
    const noise = noiseBuffer(c);
    bedSrc = c.createBufferSource();
    bedSrc.buffer = noise;
    bedSrc.loop = true;
    bedFilt = c.createBiquadFilter();
    bedFilt.type = "bandpass";
    bedFilt.frequency.value = 900;
    if (bedFilt.Q) bedFilt.Q.value = 0.7;
    bedGain = c.createGain();
    bedGain.gain.value = 0;
    bedSrc.connect(bedFilt);
    bedFilt.connect(bedGain);
    bedGain.connect(d);
    try { bedSrc.start(0); } catch (e) { /* already */ }

    cheerPool = lowPower() ? CHEER_POOL_MOBILE : CHEER_POOL_DESKTOP;
    cheers = [];
    for (let i = 0; i < cheerPool; i++) {
      const src = c.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filt = c.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = 1400;
      if (filt.Q) filt.Q.value = 1.1;
      const g = c.createGain();
      g.gain.value = EMPTY;
      src.connect(filt);
      filt.connect(g);
      g.connect(d);
      try { src.start(0); } catch (e) { /* already */ }
      cheers.push({ src, filt, g, freeAt: 0 });
    }
    return true;
  }

  function silence(t) {
    if (!bedGain) return;
    const at = t != null ? t : now();
    aim(bedGain.gain, 0, at, 0.08);
    if (cheers) {
      for (let i = 0; i < cheers.length; i++) {
        aim(cheers[i].g.gain, 0, at, 0.05);
        cheers[i].freeAt = at;
      }
    }
    swellUntil = 0;
    swellAmt = 0;
  }

  function resultsOpen() {
    try {
      const el = typeof document !== "undefined" && document.getElementById
        ? document.getElementById("results") : null;
      return !!(el && !el.hidden);
    } catch (e) { return false; }
  }

  /** Bed may run only in a live, unpaused race with SFX on. */
  function liveOk() {
    if (!sfxOk()) return false;
    if (!G) return false;
    if (G.state !== "race") return false;
    if (G.paused) return false;
    if (G.photoMode) return false;
    if (resultsOpen()) return false;
    return true;
  }

  function pitStraightBoost(player) {
    if (!player || player.s == null || !G || !G.track) return 0;
    const L = G.track.total || 0;
    if (!(L > 0)) return 0;
    let frac = player.s / L;
    frac = frac - Math.floor(frac);
    if (frac < 0) frac += 1;
    const d = Math.min(frac, 1 - frac);
    if (!(d < PIT_WINDOW)) return 0;
    return 1 - d / PIT_WINDOW;
  }

  function cacheStands() {
    standN = 0;
    standTrack = G && G.track ? G.track : null;
    if (!standTrack || !standTrack.props) return;
    const props = standTrack.props;
    const max = 48;
    if (!standX) { standX = new Float32Array(max); standZ = new Float32Array(max); }
    for (let i = 0; i < props.length && standN < max; i++) {
      const p = props[i];
      if (!p) continue;
      const k = p.kind || (p.meta && p.meta.kind) || "";
      if (k !== "crowd" && k !== "crowdRiser" && k !== "grandstand" && k !== "stand") continue;
      const x = p.x != null ? p.x : (p.p && p.p[0]);
      const z = p.z != null ? p.z : (p.p && p.p[2]);
      if (x == null || z == null || !isFinite(x) || !isFinite(z)) continue;
      standX[standN] = x;
      standZ[standN] = z;
      standN++;
    }
  }

  function grandstandBoost() {
    if (!(standN > 0)) return 0;
    let lx = 0, lz = 0, ok = false;
    if (typeof GameCams !== "undefined" && GameCams && GameCams.getListenerBasis) {
      const b = GameCams.getListenerBasis();
      if (b && b.valid) { lx = b.x; lz = b.z; ok = true; }
    }
    if (!ok && G && G.player && typeof Tracks !== "undefined" && Tracks.sample && G.track) {
      // Constant-bed fallback path uses player arc only (pitStraightBoost);
      // without a listener basis, skip world stands.
      return 0;
    }
    if (!ok) return 0;
    let best = 0;
    for (let i = 0; i < standN; i++) {
      const dx = standX[i] - lx, dz = standZ[i] - lz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (!(d < STAND_RANGE)) continue;
      const near = STAND_REF / (STAND_REF + Math.max(0, d - STAND_REF));
      if (near > best) best = near;
    }
    return best;
  }

  function fireCheer(peak, dur) {
    if (!cheers || !cheers.length || !actx) return false;
    if (!sfxOk() || !liveOk()) return false;
    const t0 = now();
    if (t0 - lastCheerT < CHEER_MIN_GAP * 0.35) return false;
    let v = null;
    for (let i = 0; i < cheers.length; i++) {
      if (cheers[i].freeAt <= t0) { v = cheers[i]; break; }
    }
    if (!v) return false;
    lastCheerT = t0;
    const pk = Math.min(CHEER_PEAK, peak || CHEER_PEAK) * (lowPower() ? 0.7 : 1);
    const d = dur > 0 ? dur : 0.55;
    const g = v.g.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(EMPTY, t0);
    g.linearRampToValueAtTime(pk, t0 + 0.04);
    g.exponentialRampToValueAtTime(EMPTY, t0 + d);
    if (v.filt.frequency) {
      const f0 = 1100 + (t0 * 97) % 900;
      v.filt.frequency.setValueAtTime(f0, t0);
    }
    v.freeAt = t0 + d + 0.05;
    return true;
  }

  function swell(amount, seconds) {
    const t = now();
    const a = Math.min(SWELL_CAP, Math.max(0, +amount || 0));
    const s = Math.max(0.2, +seconds || 1);
    if (a >= swellAmt || t >= swellUntil) {
      swellAmt = a;
      swellUntil = t + s;
    } else {
      swellUntil = Math.max(swellUntil, t + s * 0.5);
    }
    fireCheer(a * 0.9, Math.min(1.2, s * 0.7));
  }

  function checkEvents(player) {
    if (!player) return;
    const pos = player.pos | 0;
    if (lastPos > 0 && pos > 0 && pos < lastPos && pos <= 3) {
      swell(0.055 + 0.015 * (4 - pos), 1.1);
    }
    if (player.finished && !sawFinish) {
      sawFinish = true;
      swell(0.09, 2.2);
      fireCheer(CHEER_PEAK, 0.9);
    }
    if (!player.finished) sawFinish = false;
    if (pos > 0) lastPos = pos;
  }

  function update() {
    if (!bedGain) {
      if (!attach()) return;
    }
    const t = now();
    if (G && G.track !== standTrack) cacheStands();

    let target = 0;
    if (liveOk()) {
      const mul = lowPower() ? 0.55 : 1;
      const pit = pitStraightBoost(G.player);
      const stands = grandstandBoost();
      const prox = pit > stands ? pit : stands;
      target = BED * mul * (1 + prox * ((NEAR / BED) - 1));
      if (t < swellUntil) {
        const rem = swellUntil - t;
        const fade = rem > 0.4 ? 1 : rem / 0.4;
        target = Math.min(SWELL_CAP, target + swellAmt * fade);
      }
      checkEvents(G.player);
      // Sparse ambient cheers — not every frame; gated by wall time.
      if (t - lastCheerT > CHEER_MIN_GAP && prox > 0.35 && (t * 10) % 17 < 1) {
        fireCheer(0.035 + 0.03 * prox, 0.45);
      }
    } else if (bedGain && bedGain.gain && bedGain.gain._apexCrowdTgt !== 0) {
      // fall through to aim 0
    }
    aim(bedGain.gain, target, t, liveOk() ? 0.22 : 0.08);
  }

  function bindHost(h) {
    if (h) host = h;
  }

  function bind(game) {
    if (game) G = game;
    wrapGameAudio();
    if (context() && sfxBus()) attach();
  }

  function wrapGameAudio() {
    if (wrapped || typeof GameAudio === "undefined" || !GameAudio || GameAudio._stub) return;
    if (GameAudio._crowdWrapped) { wrapped = true; return; }
    _orig = {
      setEngine: GameAudio.setEngine,
      stopEngine: GameAudio.stopEngine,
      setGridIdle: GameAudio.setGridIdle,
      setSfxEnabled: GameAudio.setSfxEnabled,
      finish: GameAudio.finish,
      startEngine: GameAudio.startEngine,
    };
    GameAudio.setEngine = function () {
      const r = _orig.setEngine.apply(this, arguments);
      try { update(); } catch (e) { /* bed must not break the engine */ }
      return r;
    };
    GameAudio.stopEngine = function () {
      const r = _orig.stopEngine.apply(this, arguments);
      try { silence(); } catch (e) { /* */ }
      return r;
    };
    GameAudio.setGridIdle = function () {
      const r = _orig.setGridIdle.apply(this, arguments);
      try { silence(); lastPos = 0; sawFinish = false; } catch (e) { /* */ }
      return r;
    };
    GameAudio.setSfxEnabled = function (b) {
      sfxOn = !!b;
      const r = _orig.setSfxEnabled.apply(this, arguments);
      if (!sfxOn) try { silence(); } catch (e) { /* */ }
      return r;
    };
    GameAudio.finish = function () {
      const r = _orig.finish.apply(this, arguments);
      try {
        if (sfxOk() && G && G.state === "race" && !G.paused) swell(0.09, 2.2);
      } catch (e) { /* */ }
      return r;
    };
    GameAudio.startEngine = function () {
      const r = _orig.startEngine.apply(this, arguments);
      try { attach(); } catch (e) { /* */ }
      return r;
    };
    GameAudio._crowdWrapped = true;
    wrapped = true;
  }

  // Host from GameAudioSignal.create (may run before this file evaluates —
  // signal.js stashes lastHost for us).
  if (typeof GameAudioSignal !== "undefined" && GameAudioSignal && GameAudioSignal.lastHost) {
    try { bindHost(GameAudioSignal.lastHost()); } catch (e) { /* */ }
  }
  wrapGameAudio();

  function inspect() {
    return {
      attached: !!bedSrc,
      live: liveOk(),
      bed: bedGain && bedGain.gain ? +(bedGain.gain._apexCrowdTgt ?? bedGain.gain.value) : 0,
      swell: tSwell(),
      cheers: cheerPool,
      stands: standN,
      sfxOn: !!sfxOn,
    };
  }
  function tSwell() {
    const t = now();
    return t < swellUntil ? swellAmt : 0;
  }

  return {
    bindHost, bind, attach, detach, silence, update, swell, fireCheer,
    inspect, liveOk, pitStraightBoost, grandstandBoost,
    // test hooks
    _resetEvents() { lastPos = 0; sawFinish = false; swellUntil = 0; swellAmt = 0; lastCheerT = -1e9; },
    _setPos(p) { lastPos = p | 0; },
    _cheerPool() { return cheers ? cheers.length : 0; },
    _bedGain() { return bedGain; },
  };
})();
Object.freeze(CrowdAudio);
