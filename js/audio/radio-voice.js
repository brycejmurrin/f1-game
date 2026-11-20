"use strict";
var RadioVoice = (function () {
  const SPEAKERS = Object.freeze({
    warning: "control", warn: "control", "penalty-warn": "control", "penalty-hit": "control",
    coach: "coach", practice: "coach",
    info: "radio", box: "radio", race: "radio",
    comm: "announcer",
  });
  const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|junior|kathy|organ|pipe organ|ralph|superstar|trinoids|whisper|wobble|zarvox|fred|grandma|grandpa)\b/i;
  const VOICE_LADDER = Object.freeze({
    control: [/^daniel\b/i, /^google uk english male/i, /\b(ryan|george)\b/i, /^(arthur|oliver|malcolm)\b/i, /^en[-_]gb/i],
    coach: [/^samantha\b/i, /^google us english/i, /\b(aria|jenny|zira)\b/i, /^(karen|moira|tessa|nicky|ava|allison|susan)\b/i, /^en[-_](us|au)/i],
    radio: [/^(arthur|oliver|gordon|aaron|rishi|tom|evan|nathan)\b/i, /^google uk english/i, /\b(thomas|guy|david|mark)\b/i, /^daniel\b/i, /^en[-_](gb|ie|au|in)/i],
  });
  const LADDER_ORDER = ["control", "coach", "radio"];
  function ladderHit(rung, v) { return rung.test(v.name || "") || (rung.source.startsWith("^en") && rung.test(v.lang || "")); }
  function pickChannelVoice(speaker, list) {
    const all = (Array.isArray(list) ? list : []).filter(Boolean);
    if (!all.length) return null;
    const plain = all.filter((v) => !NOVELTY.test(v.name || ""));
    const pool = plain.length ? plain : all;
    const taken = new Set();
    const order = LADDER_ORDER.indexOf(speaker) >= 0 ? LADDER_ORDER : [speaker];
    for (const sp of order) {
      const ladder = VOICE_LADDER[sp] || [];
      let hit = null;
      for (const rung of ladder) { hit = pool.find((v) => !taken.has(v) && ladderHit(rung, v)); if (hit) break; }
      if (!hit) hit = pool.find((v) => !taken.has(v)) || pool[0];
      if (sp === speaker) return hit;
      taken.add(hit);
    }
    return pool[0];
  }
  const TONE = Object.freeze({
    control: { pitch: 0.9, rate: 1.05 },
    coach: { pitch: 1.0, rate: 0.95 },
    radio: { pitch: 1.05, rate: 1.15 },
    announcer: { pitch: 0.95, rate: 0.92 },
  });
  const SAMPLE = Object.freeze({
    control: "Car 44, track limits — +5s penalty",
    coach: "Brake a little earlier here and get the car straight",
    radio: "P3. Nice move",
    announcer: "Welcome to Apex 26. This is Silverstone, home of the British Grand Prix",
  });
  const REMOTE_OK = Object.freeze({ announcer: true });
  const PACK_VOICE = Object.freeze({ radio: "george", announcer: "fable", control: "emma", coach: "heart" });

  let primed = false;

  const PITCH_MIN = 0.5, PITCH_MAX = 1.6;
  const RATE_MIN = 0.6;
  const RATE_MAX = 1.35;
  const LEAD_RESERVE_S = 0.25;
  const SPOTTER_DECODE_LEAD_S = 0.6;
  const WORDS_PER_S = 2.4;
  const ANN_CARD_PAD_S = 0.5;
  const ANN_CARD_MIN_S = 3;
  const RADIO_LEAD_S = 0.03 + 0.105 + 0.09 + 0.09 + 0.11;
  const CONTROL_LEAD_S = 0.03 + 0.10 + 0.12;
  const PACK_STOP_TAIL_S = 0.4;
  const KEEP_CAPS = /^(DRS|ERS|VSC|SC|MGU|PB|P\d{1,2})$/;

  function toneFor(speaker, tune) {
    const base = TONE[speaker] || TONE.radio;
    const t = tune && tune[speaker];
    if (!t) return { pitch: base.pitch, rate: base.rate };
    const num = (v, lo, hi, fb) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : fb);
    return {
      pitch: num(t.pitch, PITCH_MIN, PITCH_MAX, base.pitch),
      rate: num(t.rate, RATE_MIN, RATE_MAX, base.rate),
    };
  }

  function speakable(msg) {
    let s = String(msg == null ? "" : msg);
    s = s.replace(/[—–]/g, ", ").replace(/…/g, " ");
    s = s.replace(/\s+,/g, ",");
    s = s.replace(/\+(\d+)s\b/gi, "plus $1 seconds");
    s = s.replace(/\b(\d+)s\b/gi, "$1 seconds");
    s = s.replace(/(\d)\/(\d)/g, "$1 of $2");
    s = s.replace(/(\d)\s*%/g, "$1 percent");
    s = s.replace(/[A-Z][A-Z0-9]*/g, (w) => (KEEP_CAPS.test(w) ? w : w.toLowerCase()));
    s = s.replace(/\bP(\d+)\b/g, "P $1");
    return s.replace(/\s+/g, " ").trim();
  }

  const estimate = (text, rate) => (text ? text.split(" ").length : 0) / WORDS_PER_S / Math.max(0.1, rate);

  const RADIO_LO = 300, RADIO_HI = 3400;
  const SQUELCH_MS_MIN = 40, SQUELCH_MS_MAX = 80;
  const SQUELCH_POOL = 2;

  function hashSeed(s) {
    if (typeof s === "number" && Number.isFinite(s)) return (s >>> 0) || 1;
    const str = String(s == null ? "" : s);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0 || 1;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function radioBand(seed) {
    const rnd = mulberry32(hashSeed(seed));
    const lo = RADIO_LO + Math.round((rnd() - 0.5) * 40);
    const hi = RADIO_HI + Math.round((rnd() - 0.5) * 80);
    return { lo, hi, freq: Math.round(Math.sqrt(lo * hi)), q: +(0.32 + rnd() * 0.08).toFixed(3) };
  }
  function squelchMs(seed, lane) {
    const rnd = mulberry32(hashSeed(seed) ^ (lane === "close" ? 0x51ed : 0x0b1e));
    return SQUELCH_MS_MIN + Math.floor(rnd() * (SQUELCH_MS_MAX - SQUELCH_MS_MIN + 1));
  }
  function speakerOf(o) {
    if (o.speaker && TONE[o.speaker]) return o.speaker;
    return SPEAKERS[o.kind] || "radio";
  }
  function squelchPlan(o) {
    const out = { play: false, reason: "", openMs: 0, closeMs: 0, atOpen: 0, atClose: 0, band: null, seed: 0, lite: !!o.mobile };
    if (!o.enabled) { out.reason = "off"; return out; }
    if (!o.soundOn) { out.reason = "master-off"; return out; }
    if (o.volume != null && !(+o.volume > 0)) { out.reason = "silent"; return out; }
    if (o.paused) { out.reason = "paused"; return out; }
    if (o.state !== "race" && o.state !== "count" && !o.preRace) { out.reason = "not-racing"; return out; }
    if (speakerOf(o) !== "radio") { out.reason = "not-radio"; return out; }
    const seed = o.seed == null ? hashSeed(o.text || o.msg || 1) : hashSeed(o.seed);
    const secs = Math.max(0, +o.secs || 0);
    out.play = true; out.reason = ""; out.seed = seed;
    out.band = radioBand(seed);
    out.openMs = squelchMs(seed, "open");
    out.closeMs = squelchMs(seed, "close");
    out.atOpen = 0;
    out.atClose = secs;
    return out;
  }
  function isMobile() {
    try { return !!(typeof GLX !== "undefined" && GLX && (GLX.isMobile || GLX.mobileTier)); }
    catch (e) { return false; }
  }

  function spokenLang(pref, uiLang) {
    const p = String(pref || "auto");
    const base = (l) => String(l || "en").slice(0, 2).toLowerCase();
    return p === "auto" ? base(uiLang) : base(p);
  }
  function hasVoiceFor(all, lang) {
    if (!all || !all.length) return true;
    return all.some((v) => v && String(v.lang || "").toLowerCase().startsWith(lang));
  }

  function plan(o) {
    const kind = o.kind || "race";
    const out = { speak: false, reason: "", text: "", speaker: "radio", rate: 1, pitch: 1, volume: o.volume == null ? 1 : o.volume, budgetMs: 0, leadMs: 0 };
    if (!o.enabled) { out.reason = "off"; return out; }
    if (!o.soundOn) { out.reason = "master-off"; return out; }
    if (!o.api) { out.reason = "no-api"; return out; }
    if (o.noVoice) { out.reason = "no-voice"; return out; }
    if (o.state !== "race" && o.state !== "count" && !o.preRace) { out.reason = "not-racing"; return out; }
    const speaker = SPEAKERS[kind] || "radio";
    const tone = toneFor(speaker, o.tune);
    const text = speakable(o.msg);
    if (!text) { out.reason = "empty"; return out; }
    const lead = Math.max(0, +o.lead || 0);
    out.leadMs = lead * 1000;
    const budget = (o.life || 0) - LEAD_RESERVE_S - lead;
    let rate = tone.rate;
    if (estimate(text, rate) > budget) rate = RATE_MAX;
    if (estimate(text, rate) > budget) { out.reason = "too-long"; out.text = text; return out; }
    out.speak = true; out.text = text; out.speaker = speaker;
    out.rate = rate; out.pitch = tone.pitch; out.budgetMs = Math.max(0, budget) * 1000;
    out.secs = estimate(text, rate);
    return out;
  }

  function cardLifeS(o) {
    const kind = o.kind || "race";
    const lead = Math.max(0, o.lead != null ? +o.lead : (kind === "comm" ? 0 : (SPEAKERS[kind] === "control" ? CONTROL_LEAD_S : RADIO_LEAD_S)));
    const text = speakable(o.msg);
    if (!text) return ANN_CARD_MIN_S;
    const budgetNeed = estimate(text, RATE_MAX);
    return Math.max(ANN_CARD_MIN_S, lead + LEAD_RESERVE_S + budgetNeed);
  }

  function cardDurS(o) {
    return cardLifeS(o) - ANN_CARD_PAD_S;
  }

  function stopBattleEarcons() {
    if (typeof BattleEarcon !== "undefined" && BattleEarcon.stopAll) BattleEarcon.stopAll();
  }
  function inert() {
    return Object.freeze({
      say: () => false, sayPreRace: () => false, stop: stopBattleEarcons, halt: stopBattleEarcons, flushDecoded: () => {}, unlock: () => {}, preview: () => false, pack: null, volume: () => 0,
      setPackOn: () => {}, packOn: () => false, prepare: () => {}, soundOn: () => {}, busy: () => false, yieldToSpotter: () => false,
      voiceList: () => [], tuneFor: (sp) => Object.assign(toneFor(sp, null), { name: "" }), setTune: () => false,
      recordedVoice: (sp) => PACK_VOICE[sp], recordedPack: (sp) => PACK_VOICE[sp], recordedVoices: () => [], setRecordedVoice: () => false,
      announcerPackOn: () => false,
      setEnabled: () => {}, setVolume: (v) => v, available: () => false,
      debug: () => ({ available: false, enabled: false, voices: 0, last: null, asked: 0, started: 0, squelch: null }),
    });
  }

  function create(G) {
    const synth = typeof window !== "undefined" && window.speechSynthesis;
    const Utter = typeof window !== "undefined" && window.SpeechSynthesisUtterance;
    const api = !!(synth && typeof Utter === "function");
    const pack = typeof VoicePack !== "undefined" && typeof GameAudio !== "undefined" ? VoicePack.create(G) : null;
    if (!api && !pack) { Log.info("audio", "RadioVoice: no speechSynthesis — the radio stays written"); return inert(); }
    let enabled = !!G.store.get("radioVoice", false);
    let volume = G.store.get("volRadio", 0.8);
    let tune = readTune();
    let packOn = G.store.get("radioPack", true) !== false;
    let previewGen = 0;
    const recordedVoices = (sp) => typeof VoicePack !== "undefined" && VoicePack.choices ? VoicePack.choices(sp) : [];
    const recordedVoice = (sp) => {
      const chosen = tune[sp] && tune[sp].pack;
      return recordedVoices(sp).some((v) => v.id === chosen) ? chosen : PACK_VOICE[sp];
    };
    const recordedPack = (sp) => {
      const id = recordedVoice(sp);
      return typeof VoicePack !== "undefined" && VoicePack.packFor ? VoicePack.packFor(id, sp) || id : id;
    };
    const announcerPackOn = () => {
      const t = tune.announcer || {};
      const source = ["recorded", "system"].includes(t.source) ? t.source
        : t.name != null || t.pitch != null || t.rate != null ? "system" : "";
      return !!(pack && (source === "recorded" || !source && packOn));
    };
    let voices = null, voicesAny = null, deadline = null, last = null, current = null;
    let pending = null, activeKind = "";
    let asked = 0, started = 0;
    let lastSquelch = null, squelchOpenT = null, squelchCloseT = null;
    let squelchEpoch = 0;
    let noiseBuf = null, poolCtx = null, poolDest = null;
    const squelchPool = [];
    function stopSquelch(cut) {
      if (squelchOpenT != null) { clearTimeout(squelchOpenT); squelchOpenT = null; }
      if (squelchCloseT != null) { clearTimeout(squelchCloseT); squelchCloseT = null; }
      if (lastSquelch && cut) lastSquelch.cut = true;
      const ctx = poolCtx;
      const t = ctx && ctx.currentTime != null ? ctx.currentTime : 0;
      for (const v of squelchPool) {
        try { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(0.0001, t); } catch (e) {  }
        if (v.src) { try { v.src.stop(t); } catch (e) {  } v.src = null; }
        v.busyUntil = t;
      }
    }
    function audioCtx() {
      const w = typeof window !== "undefined" ? window : null;
      if (w && w.RadioSquelchCtx) return w.RadioSquelchCtx;
      if (typeof GameAudio === "undefined" || !GameAudio || typeof GameAudio.context !== "function") return null;
      try { return GameAudio.context() || null; } catch (e) { return null; }
    }
    function squelchDest(ctx) {
      let bus = null;
      try {
        if (GameAudio.context() === ctx && typeof GameAudio.sfxBus === "function") bus = GameAudio.sfxBus();
      } catch (e) {  }
      return bus || ctx.destination || null;
    }
    function ensureSquelchPool(ctx) {
      const dest = squelchDest(ctx);
      if (poolCtx === ctx && poolDest === dest && squelchPool.length) return;
      for (const v of squelchPool) {
        try { v.g.disconnect(); } catch (e) {  }
        try { v.filt.disconnect(); } catch (e) {  }
      }
      squelchPool.length = 0;
      poolCtx = ctx;
      poolDest = dest;
      noiseBuf = null;
      const n = isMobile() ? 1 : SQUELCH_POOL;
      for (let i = 0; i < n; i++) {
        const filt = ctx.createBiquadFilter();
        filt.type = "bandpass";
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        filt.connect(g);
        if (dest) g.connect(dest);
        squelchPool.push({ filt, g, src: null, busyUntil: 0 });
      }
    }
    function playBurst(band, durS) {
      if (!(volume > 0)) return false;
      const ctx = audioCtx();
      if (!ctx || !band || !(durS > 0)) return false;
      if (ctx.state && ctx.state !== "running" && ctx.state !== "suspended") return false;
      try { ensureSquelchPool(ctx); } catch (e) { return false; }
      if (!squelchPool.length) return false;
      const t = ctx.currentTime || 0;
      let v = squelchPool[0];
      for (let i = 1; i < squelchPool.length; i++) {
        if (squelchPool[i].busyUntil <= t) { v = squelchPool[i]; break; }
        if (squelchPool[i].busyUntil < v.busyUntil) v = squelchPool[i];
      }
      try {
        if (!noiseBuf || noiseBuf.sampleRate !== (ctx.sampleRate || noiseBuf.sampleRate)) {
          const sr = ctx.sampleRate || 44100;
          const len = Math.max(1, Math.ceil(sr * 0.12));
          noiseBuf = ctx.createBuffer(1, len, sr);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
        v.filt.frequency.value = band.freq;
        v.filt.Q.value = band.q;
        if (v.src) { try { v.src.stop(); v.src.disconnect(); } catch (e) {  } }
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.connect(v.filt);
        const peak = 0.07 * Math.max(0.15, volume);
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setValueAtTime(0.0001, t);
        v.g.gain.linearRampToValueAtTime(peak, t + 0.004);
        v.g.gain.exponentialRampToValueAtTime(0.0001, t + durS);
        src.start(t);
        src.stop(t + durS + 0.02);
        v.src = src;
        v.busyUntil = t + durS + 0.05;
      } catch (e) { return false; }
      return true;
    }
    function fireSquelch(lane, q) {
      if (!q || q !== lastSquelch || q.cut || !q.play || !(volume > 0)) return;
      q.fired.push(lane);
      playBurst(q.band, (lane === "open" ? q.openMs : q.closeMs) / 1000);
    }
    function armSquelch(p) {
      if (p.squelchEpoch !== squelchEpoch || !(p.volume > 0)) return;
      stopSquelch(false);
      const q = squelchPlan({
        enabled, soundOn: !!G.soundOn, volume, speaker: p.speaker, kind: activeKind,
        state: G.state, preRace: !!p.preRace, paused: !!G.paused, mobile: isMobile(),
        text: p.text, secs: p.secs, seed: hashSeed(p.text),
      });
      q.events = q.play ? ["open", "close"] : [];
      q.fired = [];
      q.cut = false;
      lastSquelch = q;
      if (!q.play) return;
      const leadMs = Math.max(0, +p.leadMs || 0);
      if (leadMs <= 0) fireSquelch("open", q);
      else squelchOpenT = setTimeout(() => {
        if (q !== lastSquelch) return;
        squelchOpenT = null; fireSquelch("open", q);
      }, leadMs);
      squelchCloseT = setTimeout(() => {
        if (q !== lastSquelch) return;
        squelchCloseT = null; fireSquelch("close", q);
      }, leadMs + q.atClose * 1000);
    }
    const ours = new Set();
    let synthStat = { calls: 0, maxMs: 0, slow: 0, lastWarn: -1e9 };
    const clock = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
    function timed(name, fn) {
      const a = clock();
      try { return fn(); } finally {
        const ms = clock() - a;
        synthStat.calls++;
        if (ms > synthStat.maxMs) synthStat.maxMs = ms;
        if (ms > 16) {
          synthStat.slow++;
          if (a - synthStat.lastWarn > 10000) { synthStat.lastWarn = a; Log.warn("audio", "RadioVoice: speechSynthesis." + name + " blocked " + ms.toFixed(1) + " ms"); }
        }
      }
    }
    function cancelOurs() {
      if (!ours.size) return;
      ours.clear();
      timed("cancel", () => { try { synth.cancel(); } catch (e) {  } });
      justCancelled = true;
    }
    let justCancelled = false;
    function readTune() {
      const t = G.store.get("voiceTune", null);
      return t && typeof t === "object" ? t : {};
    }
    let allVoices = [], voicesLang = "";
    function spoken() {
      let pref = "auto";
      try { pref = G.store.get("spokenLang", "auto"); } catch (e) { pref = "auto"; }
      return spokenLang(pref, typeof document !== "undefined" && document.documentElement ? document.documentElement.lang : "en");
    }
    const recordedOk = () => spoken() === "en";
    function noVoice() { voicesFor(false); return !hasVoiceFor(allVoices, spoken()); }
    function voicesFor(remoteOk) {
      if (!api) return [];
      const lang = spoken();
      if (voicesLang !== lang) { voices = voicesAny = null; voicesLang = lang; }
      const cached = remoteOk ? voicesAny : voices;
      if (cached) return cached;
      let all = [];
      try { all = timed("getVoices", () => synth.getVoices()) || []; } catch (e) { all = []; }
      allVoices = all;
      voicesAny = all.filter((v) => v && String(v.lang || "").toLowerCase().startsWith(lang))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      voices = voicesAny.filter((v) => v.localService);
      return remoteOk ? voicesAny : voices;
    }
    function voiceFor(speaker, onCard) {
      const v = voicesFor(!onCard && !!REMOTE_OK[speaker]);
      if (!v.length) return null;
      const want = tune[speaker] && tune[speaker].name;
      if (want) {
        const hit = v.find((x) => x && x.name === want);
        if (hit) return hit;
      }
      if (speaker === "announcer" && typeof Announcer !== "undefined") {
        const pick = Announcer.pickVoice(v, want); if (pick) return v.find(x => x.name === pick.name) || null;
      }
      return pickChannelVoice(speaker, v);
    }
    function clearDeadline() { if (deadline != null) { clearTimeout(deadline); deadline = null; } }
    function clearPending() { if (pending != null) { clearTimeout(pending); pending = null; } }
    function packsInUse() {
      const ann = !!(G.announcer && G.announcer.enabled && G.announcer.enabled());
      const lap1 = [];
      const rest = [];
      for (const sp of Object.keys(PACK_VOICE)) {
        const on = sp === "announcer" ? ann && announcerPackOn() : enabled && packOn;
        if (!on) continue;
        (sp === "radio" ? lap1 : rest).push(recordedPack(sp));
      }
      return [lap1, rest];
    }
    let gatePoll = null;
    function clearRaceLoadGate() {
      if (gatePoll != null) { clearTimeout(gatePoll); gatePoll = null; }
      if (pack && pack.raceLoadGate) pack.raceLoadGate(false);
    }
    function armRaceLoadGate() {
      if (!pack || !pack.raceLoadGate) return;
      pack.raceLoadGate(true);
      if (gatePoll != null) clearTimeout(gatePoll);
      const poll = () => {
        gatePoll = null;
        if (G.state === "race" || G.state === "count") { pack.raceLoadGate(false); return; }
        const ls = G.loadingScreen;
        if (G.state === "menu" && !(ls && ls.phase && ls.phase())) { pack.raceLoadGate(false); return; }
        gatePoll = setTimeout(poll, 400);
      };
      gatePoll = setTimeout(poll, 800);
    }
    function ensureVoices() {
      if (!pack || !G.soundOn) return;
      const [lap1, rest] = packsInUse();
      if (pack.ensureStaged) pack.ensureStaged([lap1, rest]);
      else for (const id of lap1.concat(rest)) pack.ensure(id);
    }
    function releaseUnused() {
      if (pack && pack.releaseExcept) pack.releaseExcept([].concat(...packsInUse()));
    }
    function halt() { stop(); if (pack) pack.stop(); }
    function flushDecoded() { if (pack && pack.flushDecoded) pack.flushDecoded(); }
    function stop() {
      stopBattleEarcons();
      stopVoice();
      if (GameAudio && GameAudio.radioStingStop) GameAudio.radioStingStop();
    }
    function stopVoice() {
      if (current && GameAudio && GameAudio.setVoiceFocusHold) GameAudio.setVoiceFocusHold(false, current);
      previewGen++;
      clearPending();
      clearDeadline();
      stopSquelch(true);
      current = null; activeKind = "";
      if (pack) pack.stop("radio");
      cancelOurs();
      if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(false);
    }
    function say(msg, life, kind, lead, preRace) {
      const on = kind === "comm" ? !!(G.announcer && G.announcer.enabled && G.announcer.enabled()) : enabled;
      const hold = pack ? pack.remaining("spotter") : 0;
      if (hold > 0) lead = Math.max(+lead || 0, Number.isFinite(hold) ? hold + 0.08 : SPOTTER_DECODE_LEAD_S);
      const p = plan({ msg, life, kind, lead, enabled: on, soundOn: !!G.soundOn, state: G.state, preRace: !!preRace, api: true, volume, tune, noVoice: !!api && !recordedOk() && noVoice() });
      last = { text: p.text, reason: p.reason || "spoke", rate: p.rate, budgetMs: p.budgetMs, leadMs: p.leadMs, secs: p.secs || 0 };
      if (!p.speak) { if (!preRace && (current || pending != null)) stopVoice(); return false; }
      p.preRace = !!preRace;
      p.squelchEpoch = squelchEpoch;
      ensureVoices();
      stop();
      activeKind = kind || "race";
      if (recordedOk() && speakPack(p)) return true;
      if (recordedOk() && pack && packOn && PACK_VOICE[p.speaker]) {
        activeKind = "";
        last.reason = pack.ready && !pack.ready(recordedPack(p.speaker)) ? "pack-loading" : "not-recorded";
        return false;
      }
      if (!api) { last.reason = "no-api"; return false; }
      pending = setTimeout(() => { pending = null; speakPlanned(p); }, Math.max(0, p.leadMs));
      return true;
    }
    function speakPack(p, audition) {
      const id = recordedPack(p.speaker);
      if (!pack || (!packOn && !audition) || !id) return false;
      pack.ensure(id);
      const tok = { pack: true };
      const ok = pack.speak(id, p.text, {
        leadS: p.leadMs / 1000, budgetS: p.budgetMs / 1000, channel: "radio", fx: p.speaker, volume,
        onEnd: () => {
          if (tok !== current) return;
          current = null;
          clearDeadline();
          if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(false);
        },
      });
      if (!ok) return false;
      current = tok;
      if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(true);
      if (!audition) armSquelch(p);
      deadline = setTimeout(stop, p.leadMs + p.budgetMs + PACK_STOP_TAIL_S * 1000);
      return true;
    }
    function speakPlanned(p) {
      if (!p.preRace && G.state !== "race" && G.state !== "count") {
        current = null;
        stopSquelch(true);
        return false;
      }
      const u = new Utter(p.text);
      const focusGen = GameAudio && GameAudio.ctxGen ? GameAudio.ctxGen() : null;
      u.voice = voiceFor(p.speaker, true);
      u.rate = p.rate; u.pitch = p.pitch; u.volume = p.volume;
      u.onend = u.onerror = () => {
        ours.delete(u);
        if (GameAudio && GameAudio.setVoiceFocusHold) GameAudio.setVoiceFocusHold(false, u);
        if (u !== current) return;
        current = null;
        clearDeadline();
        if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(false);
      };
      current = u;
      u.onstart = () => {
        started++;
        if (u === current && p.squelchEpoch === squelchEpoch && enabled && G.soundOn && volume > 0 && u.volume > 0
            && (!GameAudio.ctxGen || GameAudio.ctxGen() === focusGen)
            && GameAudio && GameAudio.setVoiceFocusHold) GameAudio.setVoiceFocusHold(true, u);
      };
      if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(true);
      try {
        asked++;
        ours.add(u);
        timed("speak", () => synth.speak(u));
      } catch (e) {
        ours.delete(u);
        if (GameAudio && GameAudio.setVoiceFocusHold) GameAudio.setVoiceFocusHold(false, u);
        current = null;
        if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(false);
        Log.info("audio", "RadioVoice speak failed");
        return false;
      }
      if (justCancelled) { justCancelled = false; timed("resume", () => { try { synth.resume(); } catch (e) {  } }); }
      if (current === u) {
        armSquelch(Object.assign({}, p, { leadMs: 0 }));
        deadline = setTimeout(stop, p.budgetMs);
      }
      return true;
    }
    function unlock() {
      if (!api) return;
      try { const u = new Utter(" "); u.volume = 0.01; synth.speak(u); primed = true; }
      catch (e) {  }
      const ctx = audioCtx();
      if (ctx && ctx.state === "suspended" && ctx.resume) {
        try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {  }
      }
    }
    if (api && !primed && typeof document !== "undefined" && document.addEventListener) {
      const EVTS = ["pointerdown", "pointerup", "touchend", "keydown", "click"];
      const prime = (e) => {
        if (e && (e.type === "keydown" ? e.key === "Escape" : e.type === "pointerdown" ? e.pointerType !== "mouse"
          : e.type === "pointerup" ? e.pointerType === "mouse" : false)) return;
        for (const t of EVTS) document.removeEventListener(t, prime, true);
        if (!primed) unlock();
      };
      for (const t of EVTS) document.addEventListener(t, prime, true);
    }
    if (typeof document !== "undefined") {
      const card = document.getElementById("announce");
      const pause = document.getElementById("pausemenu");
      const observe = (el, on) => {
        if (el && typeof MutationObserver === "function") new MutationObserver(on).observe(el, { attributes: true, attributeFilter: ["hidden"] });
      };
      observe(card, () => {
        if (!card.hidden) return;
        if (current || pending != null) stop();
        else if (GameAudio && GameAudio.radioStingStop) GameAudio.radioStingStop();
      });
      const haltAll = () => halt();
      observe(pause, () => { if (!pause.hidden) haltAll(); });
      document.addEventListener("visibilitychange", () => { if (document.hidden) haltAll(); });
      try { synth.onvoiceschanged = () => { voices = voicesAny = null; }; } catch (e) {  }
    }
    Log.info("audio", "RadioVoice.create enabled=" + enabled);
    function preview(speaker, text) {
      if (!G.soundOn) return false;
      const sp = TONE[speaker] ? speaker : "radio";
      const t = toneFor(sp, tune);
      const words = speakable(text || SAMPLE[sp] || SAMPLE.radio);
      if (!words) return false;
      if (G.announcer && G.announcer.stop) G.announcer.stop();
      stop();
      activeKind = sp === "coach" ? "coach" : sp === "control" ? "warning" : "info";
      if (pack && (sp === "announcer" ? announcerPackOn() : packOn)) {
        const id = recordedPack(sp), gen = previewGen;
        const play = () => gen === previewGen && G.soundOn && speakPack({ speaker: sp, text: words, leadMs: 0, budgetMs: 15000 }, true);
        if (pack.load && !pack.ready(id)) { pack.load(id).then((ready) => { if (ready) play(); }); return true; }
        return !!play();
      }
      if (!api) return false;
      try { synth.cancel(); } catch (e) {  }
      const u = new Utter(words);
      u.voice = voiceFor(sp);
      u.rate = t.rate; u.pitch = t.pitch; u.volume = volume;
      u.onstart = () => { started++; };
      current = u;
      u.onend = u.onerror = () => { ours.delete(u); if (current === u) current = null; };
      try { asked++; ours.add(u); synth.speak(u); synth.resume(); }
      catch (e) { ours.delete(u); if (current === u) current = null; return false; }
      return true;
    }

    return {
      say, stop, halt, flushDecoded, unlock, preview,
      previewGeneration: () => previewGen,
      stopPreviewIfGeneration(generation) { if (generation !== previewGen) return false; stop(); return true; },
      sayPreRace: (msg, life, lead) => (say(msg, life, "race", lead, true) ? last.leadMs / 1000 + last.secs : false),
      voiceList: (speaker) => voicesFor(!!REMOTE_OK[speaker]).map((v) => ({ name: v.name, lang: v.lang })),
      recordedVoice, recordedPack, recordedVoices, announcerPackOn,
      setRecordedVoice(speaker, id) {
        if (!recordedVoices(speaker).some((v) => v.id === id)) return false;
        if (G.announcer && G.announcer.stop) G.announcer.stop();
        stop();
        if (pack) pack.stop("spotter");
        tune[speaker] = Object.assign({}, tune[speaker], { pack: id });
        if (speaker === "announcer") tune[speaker].source = "recorded";
        G.store.set("voiceTune", tune);
        if (speaker !== "announcer") { packOn = true; G.store.set("radioPack", true); }
        if (pack) pack.ensure(recordedPack(speaker));
        releaseUnused();
        return true;
      },
      tuneFor: (speaker) => Object.assign(toneFor(speaker, tune), { name: (tune[speaker] && tune[speaker].name) || "" }),
      setTune(speaker, patch) {
        if (!TONE[speaker]) return false;
        if (patch == null) delete tune[speaker];
        else tune[speaker] = Object.assign({}, tune[speaker], patch, speaker === "announcer" ? { source: "system" } : {});
        G.store.set("voiceTune", tune);
        return true;
      },
      setEnabled(b) { enabled = !!b; if (!enabled) stop(); else ensureVoices(); },
      pack,
      volume: () => volume,
      setPackOn(b) {
        if (packOn !== !!b) {
          if (G.announcer && G.announcer.stop) G.announcer.stop();
          stop();
        }
        packOn = !!b; G.store.set("radioPack", packOn); ensureVoices();
        if (!packOn) releaseUnused();
      },
      prepare() { armRaceLoadGate(); ensureVoices(); },
      soundOn() { const ls = G.loadingScreen; if (G.state === "race" || G.state === "count" || (ls && ls.phase && ls.phase())) ensureVoices(); },
      releaseRaceLoadGate: clearRaceLoadGate,
      packOn: () => !!(pack && packOn),
      busy: () => !!(current || pending != null),
      yieldToSpotter() {
        if (!(current || pending != null)) return true;
        if (!["info", "coach", "comm"].includes(activeKind)) return false;
        stop(); return true;
      },
      setVolume(v) {
        volume = Math.max(0, Math.min(1, +v || 0));
        if (!volume) {
          squelchEpoch++; stopSquelch(true);
          if (current && GameAudio && GameAudio.setVoiceFocusHold) GameAudio.setVoiceFocusHold(false, current);
        }
        return volume;
      },
      available: () => true,
      debug: () => ({ available: true, enabled, voices: voicesFor(false).length, voicesAny: voicesFor(true).length, last, asked, started,
        pack: pack ? Object.assign({ on: packOn }, pack.debug()) : null,
        synth: { calls: synthStat.calls, maxMs: +synthStat.maxMs.toFixed(1), slow: synthStat.slow },
        squelch: lastSquelch && { play: lastSquelch.play, reason: lastSquelch.reason, openMs: lastSquelch.openMs,
          closeMs: lastSquelch.closeMs, atOpen: lastSquelch.atOpen, atClose: lastSquelch.atClose,
          band: lastSquelch.band, seed: lastSquelch.seed, lite: lastSquelch.lite,
          events: lastSquelch.events, fired: lastSquelch.fired, cut: lastSquelch.cut,
          pool: squelchPool.length } }),
    };
  }

  return { create, inert, plan, pickChannelVoice, spokenLang, hasVoiceFor, speakable, cardDurS, cardLifeS, PACK_VOICE, estimate, toneFor, SPEAKERS, TONE, SAMPLE, REMOTE_OK,
           PITCH_MIN, PITCH_MAX, RATE_MIN, RATE_MAX, LEAD_RESERVE_S, WORDS_PER_S,
           ANN_CARD_PAD_S, ANN_CARD_MIN_S, RADIO_LEAD_S, CONTROL_LEAD_S,
           radioBand, squelchPlan, RADIO_LO, RADIO_HI, SQUELCH_MS_MIN, SQUELCH_MS_MAX };
})();
Object.freeze(RadioVoice);
