"use strict";

var GameAudioSoundtrack = (function () {
  function create(host) {
    let musicVol = 0.5;
    const MUSIC_FULL = 0.52;
    let musicOn = false;
    let musicEnabled = true;
    let lastTrackIdx = -1;
    let musicGain = null;
    let musicSrc = null;
    let musicToken = 0;
    let actionGeneration = 0;
    const musicBuffers = {};
    let _decodeTail = Promise.resolve();
    const _musicLoads = {};
    const _musicLoadControllers = {};
    const _bufKeys = [];
    const IS_MOBILE = !!(typeof GLX !== "undefined" && GLX && GLX.isMobile);
    const MUSIC_CACHE = IS_MOBILE ? 1 : 2;
    function streamMusic() {
      let o = null;
      try { o = localStorage.getItem("apex26.musicStream"); } catch (e) {  }
      return o === "1" ? true : o === "0" ? false : IS_MOBILE;
    }
    let musicEl = null, musicElNode = null, musicElUrl = null, musicStreaming = false;
    let streamUnlockPending = null;
    const USER_DECODE_MAX_S = 600;
    const USER_EST_BPS = 128000 / 8;
    function probeDuration(url) {
      return new Promise((res) => {
        if (typeof Audio !== "function") { res(NaN); return; }
        let el = null, done = false, timer = 0;
        const fin = (d) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (el) {
            el.onloadedmetadata = el.onerror = null;
            try { el.removeAttribute("src"); el.load(); } catch (e) {  }
          }
          res(d);
        };
        timer = setTimeout(() => fin(NaN), 5000);
        try {
          el = new Audio(); el.preload = "metadata";
          el.onloadedmetadata = () => fin(+el.duration);
          el.onerror = () => fin(NaN);
          el.src = url;
        } catch (e) { fin(NaN); }
      });
    }
    function userDecodeGate(url, ab) {
      return probeDuration(url).then((d) => {
        const secs = Number.isFinite(d) && d > 0 ? d : ab.byteLength / USER_EST_BPS;
        if (secs > USER_DECODE_MAX_S) {
          throw new Error("upload too long to decode without streaming (" + Math.round(secs / 60) + " min > " + (USER_DECODE_MAX_S / 60) + " min)");
        }
        return ab;
      });
    }
    const MENU_TRACK = "assets/music/menu.mp3";
    const PLAYLIST = [
      { id: "builtin:menu", name: "menu", url: MENU_TRACK, builtin: true },
      { id: "builtin:song2", name: "song2", url: "assets/music/song2.mp3", builtin: true },
      { id: "builtin:song3", name: "song3", url: "assets/music/song3.mp3", builtin: true },
      { id: "builtin:song4", name: "song4", url: "assets/music/song4.mp3", builtin: true },
      { id: "builtin:song5", name: "song5", url: "assets/music/song5.mp3", builtin: true },
      { id: "builtin:song6", name: "song6", url: "assets/music/song6.mp3", builtin: true },
    ];
    let musicIndex = 0;
    let radioDuck = 1;
    let source = "all";
    let backend = null;
    function ensureMusicGain() {
      if (!musicGain && host.context() && host.master()) {
        musicGain = host.context().createGain();
        musicGain.gain.value = musicVol * MUSIC_FULL * radioDuck;
        musicGain.connect(host.master());
      }
    }

    let musicResumeBuf = null, musicResumeAt = NaN, musicResumeOff = 0;
    let _musicFails = 0;
    let listFailed = false;
    function trackHealth(state, reason) {
      const track = PLAYLIST[musicIndex];
      if (track && !track.builtin && typeof MusicLib !== "undefined" && MusicLib.playbackStatus) MusicLib.playbackStatus(track.id, { state, reason: reason || "" });
    }
    function musicLoadFailed(token, reason) {
      if (!musicOn || token !== musicToken) return;
      trackHealth("failed", reason || "Could not load or decode this audio file.");
      if (++_musicFails >= Math.max(1, eligibleCount())) { _musicFails = 0; stopInternal(); listFailed = true; return; }
      nextTrack(1);
    }
    function replaceMusicSource() {
      try { if (musicSrc) { musicSrc.onended = null; musicSrc.stop(); musicSrc.disconnect(); } } catch (e) {  }
      stopStream(false);
    }
    function captureStreamPos() {
      if (musicStreaming && musicEl) { musicResumeBuf = musicElUrl; musicResumeAt = NaN; musicResumeOff = +musicEl.currentTime || 0; }
    }
    function stopStream(release) {
      streamUnlockPending = null;
      if (!musicEl) return;
      captureStreamPos();
      const el = musicEl;
      el.onended = el.onerror = el.onloadedmetadata = el.onplaying = el.onpause = null;
      try { el.pause(); } catch (e) {  }
      if (release) { try { el.removeAttribute("src"); el.load(); } catch (e) {  } }
      musicStreaming = false;
    }
    function streamTrack(url, token) {
      const ctx = host.context();
      ensureMusicGain();
      if (!musicEl) {
        try {
          musicEl = new Audio(); musicEl.preload = "auto";
          musicElNode = ctx.createMediaElementSource(musicEl);
          musicElNode.connect(musicGain);
        } catch (e) {
          Log.warn("audio", "music stream unavailable, decoding instead: " + ((e && e.message) || e));
          musicEl = musicElNode = null;
          return false;
        }
      }
      if (streamMusic()) {
        for (const k in musicBuffers) delete musicBuffers[k];
        _bufKeys.length = 0;
      }
      const el = musicEl;
      const off = (musicResumeBuf === url && Number.isFinite(musicResumeOff)) ? musicResumeOff : 0;
      musicResumeBuf = url; musicResumeAt = NaN; musicResumeOff = off;
      el.onloadedmetadata = () => { if (token === musicToken && off > 0 && off < (el.duration || 0)) try { el.currentTime = off; } catch (e) {  } };
      el.onplaying = () => { if (token === musicToken) { streamUnlockPending = null; musicStreaming = true; _musicFails = 0; listFailed = false; trackHealth("playing"); } };
      el.onpause = () => {
        if (token !== musicToken || el !== musicEl || !musicOn || !musicStreaming || !el.paused || el.ended || document.hidden) return;
        captureStreamPos();
        musicStreaming = false;
        streamUnlockPending = { token, url };
      };
      el.onended = () => { if (token === musicToken && musicOn) nextTrack(1); };
      el.onerror = () => {
        if (token !== musicToken) return;
        Log.warn("audio", "music stream failed for " + url + ": media error " + ((el.error && el.error.code) || "?"));
        musicStreaming = false;
        musicLoadFailed(token, "This audio format could not be played, or the file is unavailable.");
      };
      musicElUrl = url; musicStreaming = true;
      el.src = url;
      playStream(el, url, token);
      return true;
    }
    function playStream(el, url, token) {
      const p = el.play();
      if (p && p.catch) p.catch((err) => {
        if (token !== musicToken || el !== musicEl || !musicOn || !err || err.name !== "NotAllowedError") return;
        Log.warn("audio", "music stream play refused (" + err.name + "); the next gesture retries");
        musicStreaming = false;
        streamUnlockPending = { token, url };
      });
    }
    function retryStreamUnlock() {
      const pending = streamUnlockPending;
      if (!pending || document.hidden || !host.enabled() || !musicEnabled || backend || !musicOn) return;
      if (pending.token !== musicToken || pending.url !== musicElUrl || !musicEl ||
          !PLAYLIST[musicIndex] || PLAYLIST[musicIndex].url !== pending.url) { streamUnlockPending = null; return; }
      streamUnlockPending = null;
      musicStreaming = true;
      playStream(musicEl, pending.url, pending.token);
    }
    function playMusicBuffer(buf, token) {
      if (!host.context() || !musicOn || token !== musicToken) return;
      _musicFails = 0; listFailed = false;
      trackHealth("playing");
      ensureMusicGain();
      replaceMusicSource();
      const src = host.context().createBufferSource();
      src.buffer = buf;
      src.loop = false;
      src.connect(musicGain);
      src.onended = function () {
        if (src !== musicSrc || token !== musicToken || !musicOn) return;
        nextTrack(1);
      };
      let off = 0;
      if (musicResumeBuf === buf && Number.isFinite(musicResumeAt) && buf.duration > 0) {
        off = Math.max(0, (host.context().currentTime - musicResumeAt) + musicResumeOff) % buf.duration;
      }
      src.start(0, off);
      musicResumeBuf = buf; musicResumeAt = host.context().currentTime; musicResumeOff = off;
      musicSrc = src;
    }

    function eligible(i) {
      const e = PLAYLIST[i];
      if (!e) return false;
      return source === "all" || (source === "builtin" ? !!e.builtin : !e.builtin);
    }
    function anyEligible() {
      for (let i = 0; i < PLAYLIST.length; i++) if (eligible(i)) return true;
      return false;
    }
    function eligibleCount() {
      let n = 0;
      for (let i = 0; i < PLAYLIST.length; i++) if (eligible(i)) n++;
      return n;
    }
    function seekEligible(from, step) {
      const n = PLAYLIST.length;
      if (!n) return -1;
      const d = step < 0 ? -1 : 1;
      for (let k = 1; k <= n; k++) {
        const i = ((from + d * k) % n + n) % n;
        if (eligible(i)) return i;
      }
      return eligible(from) ? from : -1;
    }

    function nextTrack(step) {
      if (!PLAYLIST.length) return;
      const i = seekEligible(musicIndex, step || 1);
      if (i < 0) { stopInternal(); return; }
      musicIndex = i;
      playIndex(musicIndex);
    }

    function setMusicSource(s) {
      const want = (s === "builtin" || s === "user") ? s : "all";
      const prev = source;
      source = want;
      if (!anyEligible()) { source = prev; return prev; }
      ++actionGeneration;
      if (backend) return source;
      if (!eligible(musicIndex)) {
        const i = seekEligible(musicIndex, 1);
        if (i >= 0) { musicIndex = i; if (musicOn) playIndex(i); }
      }
      return source;
    }
    function musicSource() { return source; }
    function sourceCounts() {
      let builtin = 0, user = 0;
      for (const e of PLAYLIST) { if (e.builtin) builtin++; else user++; }
      return { builtin, user, total: PLAYLIST.length };
    }

    function playIndex(i) {
      if (!host.context() || !musicEnabled || backend || !PLAYLIST.length) return;
      musicIndex = ((i % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
      const url = PLAYLIST[musicIndex].url;
      replaceMusicSource();
      musicSrc = null;
      musicOn = true;
      const token = ++musicToken;
      if (host.context().state !== "running" && !document.hidden) { const p = host.context().resume(); if (p && p.catch) p.catch(host.resumeRejected("music")); }
      const isUser = !PLAYLIST[musicIndex].builtin;
      if ((isUser || streamMusic()) && typeof Audio === "function" && host.context().createMediaElementSource && streamTrack(url, token)) return;
      if (musicBuffers[url]) { playMusicBuffer(musicBuffers[url], token); return; }
      if (MUSIC_CACHE === 1) {
        for (const k of _bufKeys) delete musicBuffers[k];
        _bufKeys.length = 0;
        musicResumeBuf = null; musicResumeAt = NaN; musicResumeOff = 0;
      }
      if (_musicLoads[url]) { _musicLoads[url].then((b) => { if (b) playMusicBuffer(b, token); else musicLoadFailed(token); }, () => {}); return; }
      const ctx = host.context();
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      if (controller) _musicLoadControllers[url] = controller;
      const _load = fetch(url, controller ? { signal: controller.signal } : undefined)
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status + " for " + url); return r.arrayBuffer(); })
        .then((ab) => (_musicLoads[url] !== _load ? null : isUser ? userDecodeGate(url, ab) : ab))
        .then((ab) => {
          const decode = _decodeTail.then(() => {
            if (_musicLoads[url] !== _load || host.context() !== ctx || !musicOn || !PLAYLIST[musicIndex] || PLAYLIST[musicIndex].url !== url) return null;
            return new Promise((res, rej) => { ctx.decodeAudioData(ab, res, rej); });
          });
          _decodeTail = decode.catch(() => null);
          return decode;
        })
        .then((buf) => {
          if (!buf || _musicLoads[url] !== _load || host.context() !== ctx) return null;
          if (MUSIC_CACHE > 1 || (PLAYLIST[musicIndex] && PLAYLIST[musicIndex].url === url)) {
            musicBuffers[url] = buf;
            if (_bufKeys.indexOf(url) < 0) _bufKeys.push(url);
          }
          while (_bufKeys.length > MUSIC_CACHE) delete musicBuffers[_bufKeys.shift()];
          playMusicBuffer(buf, token);
          return buf;
        })
        .catch((err) => {
          Log.warn("audio", "music load/decode failed for " + url + ": " + ((err && err.message) || err));
          musicLoadFailed(token, "Could not fetch or decode this audio file. Try another format or retry.");
          return null;
        });
      _musicLoads[url] = _load;
      const settled = () => {
        if (_musicLoads[url] === _load) delete _musicLoads[url];
        if (_musicLoadControllers[url] === controller) delete _musicLoadControllers[url];
      };
      _load.then(settled, settled);
    }

    function setMusicVolume(v) {
      musicVol = host.clamp01(typeof v === "number" ? v : 0.5);
      if (musicGain && host.context()) {
        const t = host.now();
        musicGain.gain.cancelScheduledValues(t);
        musicGain.gain.setTargetAtTime(musicVol * MUSIC_FULL * radioDuck, t, 0.02);
        musicGain._apexDuckTgt = null;
      }
      if (backend) { try { backend.setVolume(musicVol); } catch (e) {  } }
      return musicVol;
    }
    function skipTrack() {
      if (!musicEnabled) return null;
      ++actionGeneration;
      if (backend) { try { return backend.skip(); } catch (e) { return null; } }
      if (!host.context()) return null;
      nextTrack(1);
      return trackName();
    }
    function prevTrack() {
      if (!musicEnabled) return null;
      ++actionGeneration;
      if (backend) {
        try { return backend.prev ? backend.prev() : backend.name(); } catch (e) { return null; }
      }
      if (!host.context()) return null;
      nextTrack(-1);
      return trackName();
    }
    function trackName() {
      if (backend) { try { return backend.name(); } catch (e) { return null; } }
      const e = PLAYLIST[musicIndex];
      return e ? e.name : "";
    }

    function tracks() {
      return PLAYLIST.map((e) => ({ id: e.id, name: e.name, builtin: !!e.builtin }));
    }
    function indexOfId(id) {
      for (let i = 0; i < PLAYLIST.length; i++) if (PLAYLIST[i].id === id) return i;
      return -1;
    }
    function addTracks(list) {
      if (!list || !list.length) return 0;
      let n = 0;
      for (const t of list) {
        if (!t || !t.id || !t.url || indexOfId(t.id) >= 0) continue;
        PLAYLIST.push({ id: t.id, name: t.name || "track", url: t.url, builtin: false });
        n++;
      }
      return n;
    }
    function removeTrack(id) {
      const i = indexOfId(id);
      if (i < 0) return false;
      ++actionGeneration;
      const wasPlaying = musicOn && i === musicIndex;
      delete musicBuffers[PLAYLIST[i].url];
      const k = _bufKeys.indexOf(PLAYLIST[i].url);
      if (k >= 0) _bufKeys.splice(k, 1);
      PLAYLIST.splice(i, 1);
      if (i < musicIndex) musicIndex--;
      if (!PLAYLIST.length) { stopInternal(); musicIndex = 0; return true; }
      musicIndex = ((musicIndex % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
      if (wasPlaying) { const j = eligible(musicIndex) ? musicIndex : seekEligible(musicIndex, 1); if (j < 0) stopInternal(); else playIndex(j); }
      return true;
    }
    function playTrackId(id) {
      const i = indexOfId(id);
      if (i < 0 || backend || !musicEnabled) return false;
      ++actionGeneration;
      playIndex(i);
      return musicOn;
    }
    function currentTrackId() {
      if (!musicOn || backend) return null;
      const e = PLAYLIST[musicIndex];
      return e ? e.id : null;
    }

    function setMusicBackend(b) {
      if (b === backend) return;
      ++actionGeneration;
      if (backend) {
        try { const p = backend.stop(); if (p && p.catch) p.catch(() => {}); }
        catch (e) {  }
      }
      backend = b || null;
      if (backend) {
        stopInternal();
        try {
          backend.setVolume(musicVol);
          if (musicEnabled && host.enabled()) backend.start();
        } catch (e) {  }
      } else if (musicEnabled && host.enabled() && host.context()) {
        resumePlaylist();
      }
    }
    function musicBackend() { return backend; }

    function setMusicEnabled(b) {
      ++actionGeneration;
      musicEnabled = !!b; listFailed = false;
      if (!musicEnabled) stopMusic();
      else if (host.context() || backend) startMusic(lastTrackIdx);
    }

    function startMusic(trackIdx) {
      if (musicEnabled) ++actionGeneration;
      resumeMusic(trackIdx);
    }
    function resumeMusic(trackIdx) {
      const idx = (typeof trackIdx === "number") ? trackIdx : 0;
      lastTrackIdx = idx;
      if (!musicEnabled) return;
      if (backend) { try { backend.start(); } catch (e) {  } return; }
      if (!host.context()) return;
      if (musicOn && (musicSrc || musicStreaming)) return;
      resumePlaylist();
    }

    function resumePlaylist() {
      const i = eligible(musicIndex) ? musicIndex : seekEligible(musicIndex, 1);
      if (i < 0) stopInternal(); else playIndex(i);
    }

    function cancelMusicLoads() {
      for (const url in _musicLoadControllers) {
        try { _musicLoadControllers[url].abort(); } catch (e) {  }
        delete _musicLoadControllers[url];
      }
      for (const url in _musicLoads) delete _musicLoads[url];
    }
    function stopInternal() {
      musicOn = false;
      musicToken++;
      cancelMusicLoads();
      try { if (musicSrc) { musicSrc.onended = null; musicSrc.stop(); } } catch (e) {  }
      try { if (musicSrc) musicSrc.disconnect(); } catch (e) {  }
      musicSrc = null;
      stopStream(true);
      musicResumeBuf = null; musicResumeAt = NaN; musicResumeOff = 0;
    }

    function stopMusic() {
      ++actionGeneration;
      stopPlayback();
    }
    function stopPlayback() {
      stopInternal();
      if (backend) { try { backend.stop(); } catch (e) {  } }
    }

    function setRadioDuck(on) {
      const want = on ? 0.35 : 1;
      if (want === radioDuck) return radioDuck;
      radioDuck = want;
      if (musicGain) musicGain._apexDuckTgt = null;
      if (musicGain && host.context() && (!host.engineRunning() || !host.sfxOk())) musicGain.gain.setTargetAtTime(musicVol * MUSIC_FULL * radioDuck, host.now(), 0.15);
      return radioDuck;
    }

    function suspendMusic() {
      captureStreamPos();
      const hidBuf = musicResumeBuf, hidAt = musicResumeAt, hidOff = musicResumeOff;
      if (musicOn) stopPlayback();
      musicResumeBuf = hidBuf; musicResumeAt = hidAt; musicResumeOff = hidOff;
    }
    function resetContext() {
      cancelMusicLoads();
      _decodeTail = Promise.resolve();
      stopStream(true);
      try { if (musicElNode) musicElNode.disconnect(); } catch (e) {  }
      musicEl = musicElNode = musicElUrl = null;
      musicGain = null;
      for (const k in musicBuffers) delete musicBuffers[k];
      _bufKeys.length = 0;
      if (typeof musicResumeBuf !== "string") {
        musicResumeBuf = null; musicResumeAt = NaN; musicResumeOff = 0;
      }
    }
    function releaseEngineDuck(t, useRadio) {
      if (!musicGain) return;
      musicGain.gain.setTargetAtTime(musicVol * MUSIC_FULL * (useRadio ? radioDuck : 1), t, 0.3);
      musicGain._apexDuckTgt = null;
    }
    function duckForEngine(rev, t) {
      const duckTgt = musicVol * MUSIC_FULL * (1 - 0.25 * rev) * radioDuck;
      if (musicGain && !(Math.abs((musicGain._apexDuckTgt ?? -1) - duckTgt) < 0.005)) {
        musicGain.gain.setTargetAtTime(duckTgt, t, 0.25);
        musicGain._apexDuckTgt = duckTgt;
      }
    }
    return {
      musicPlaybackGeneration: () => actionGeneration,
      stopMusicIfGeneration(generation) { if (generation !== actionGeneration) return false; stopMusic(); return true; },
      startMusic, stopMusic, setMusicEnabled, skipTrack, prevTrack, trackName, tracks, addTracks, removeTrack, playTrackId, currentTrackId, setMusicBackend, musicBackend, setMusicSource, musicSource, sourceCounts, setMusicVolume, setRadioDuck,
      suspendMusic, resumeMusic, resetContext, releaseEngineDuck, duckForEngine, retryStreamUnlock,
      isPlaying: () => musicOn, musicStalled: () => listFailed, lastTrack: () => lastTrackIdx, volume: () => musicVol,
    };
  }
  return { create };
})();
Object.freeze(GameAudioSoundtrack);
