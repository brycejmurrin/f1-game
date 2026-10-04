/* GameAudioSoundtrack: playlist, bounded decoded caches, external backends and music ducking. create(host) receives live context/master/enabled/engineRunning/sfxOk plus clamp01/now/resumeRejected; the host calls suspendMusic and resetContext at lifecycle boundaries. */
"use strict";

const GameAudioSoundtrack = (function () {
  function create(host) {
    let musicVol = 0.5;
    const MUSIC_FULL = 0.52;
    // Music: streamed CC0 tracks (assets/music/), lazy-loaded + cached
    let musicOn = false;
    let musicEnabled = true;        // separate from the master sound toggle
    let lastTrackIdx = -1;
    let musicGain = null;
    let musicSrc = null;
    let musicToken = 0;
    const musicBuffers = {};                 // url -> decoded AudioBuffer (per ctx)
    const _musicLoads = {};                  // url -> in-flight fetch+decode (see playIndex)
    const _bufKeys = [];                     // insertion order of cached urls (bound: MUSIC_CACHE)
    // Decoded PCM is ~90 MB per four-minute track at a 48 kHz context. Desktop
    // keeps the 2 most recent so a two-track playlist alternates without a
    // re-decode; a PHONE keeps only the playing track — the second buffer was
    // the largest single item in a phone's heap, and on a rotating playlist it
    // is hit once per full rotation. GLX loads before this file (manifest order);
    // the typeof guard is the standalone harness.
    const MUSIC_CACHE = (typeof GLX !== "undefined" && GLX && GLX.isMobile) ? 1 : 2;
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
    let source = "all";
    let backend = null;
    function ensureMusicGain() {
      if (!musicGain && host.context() && host.master()) {
        musicGain = host.context().createGain();
        musicGain.gain.value = musicVol * MUSIC_FULL;   // music sits under the engine
        musicGain.connect(host.master());
      }
    }

    let musicResumeBuf = null, musicResumeAt = NaN, musicResumeOff = 0;
    // A TRACK THAT CANNOT LOAD MOVES THE LIST ON. Only a source's onended
    // advanced the playlist, and a failed fetch/decode (an upload in a format
    // decodeAudioData refuses, a 404, offline) never made one: silence, with
    // the UI naming the dead track. Skip it; a whole list that fails stops.
    let _musicFails = 0;
    function musicLoadFailed(token) {
      if (!musicOn || token !== musicToken) return;   // superseded: not ours to skip
      // Capped at the ELIGIBLE count: nextTrack only cycles the selected source,
      // so a PLAYLIST.length cap re-fetched one dead upload up to that many times.
      if (++_musicFails >= Math.max(1, eligibleCount())) { _musicFails = 0; stopInternal(); return; }
      nextTrack(1);
    }
    // Replacement preserves the resume position; stopInternal also clears it.
    function replaceMusicSource() {
      try { if (musicSrc) { musicSrc.onended = null; musicSrc.stop(); musicSrc.disconnect(); } } catch (e) { /* stop-before-start is a documented throw; the source is being replaced regardless */ }
    }
    function playMusicBuffer(buf, token) {
      if (!host.context() || !musicOn || token !== musicToken) return;  // superseded
      _musicFails = 0;
      ensureMusicGain();
      replaceMusicSource();
      const src = host.context().createBufferSource();
      src.buffer = buf;
      // A PLAYLIST, so no per-source loop: each track hands over to the next when
      // it ends, and the list wraps. (A single looping source could never reach
      // the second song.)
      src.loop = false;
      src.connect(musicGain);
      src.onended = function () {
        if (src !== musicSrc || token !== musicToken || !musicOn) return;
        nextTrack(1);
      };
      // Resume where the same song left off: a tab-hide stops the source and
      // the return restarted it from 0:00 — every lock or app switch rewound
      // the track. The offset is kept per BUFFER so a different song starts clean.
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

    /* Pick which part of the library plays. Returns the source actually applied —
       a selection with nothing in it (MY TRACKS before anything is uploaded)
       is refused rather than leaving the game silent with no explanation. */
    function setMusicSource(s) {
      const want = (s === "builtin" || s === "user") ? s : "all";
      const prev = source;
      source = want;
      if (!anyEligible()) { source = prev; return prev; }
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

    // Start (or restart) at a given playlist slot, regardless of what is playing.
    function playIndex(i) {
      if (!host.context() || !musicEnabled || backend || !PLAYLIST.length) return;
      musicIndex = ((i % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
      const url = PLAYLIST[musicIndex].url;
      replaceMusicSource();
      musicSrc = null;
      musicOn = true;
      const token = ++musicToken;
      // Never wake a context the hide path suspended: onVisibility's show branch resumes it.
      if (host.context().state !== "running" && !document.hidden) { const p = host.context().resume(); if (p && p.catch) p.catch(host.resumeRejected("music")); }
      if (musicBuffers[url]) { playMusicBuffer(musicBuffers[url], token); return; }
      // ONE DECODE IN FLIGHT PER URL. musicToken suppresses stale PLAYBACK but
      // never cancelled the fetch or the decode, and decodeAudioData allocates the
      // full PCM before it resolves — two taps on NEXT put ~150 MB of decoded
      // audio in the air at once, three ~225 MB, none of it bounded by the
      // MUSIC_CACHE eviction that only runs afterwards.
      if (_musicLoads[url]) { _musicLoads[url].then((b) => { if (b) playMusicBuffer(b, token); else musicLoadFailed(token); }, () => {}); return; }
      const _load = fetch(url)
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status + " for " + url); return r.arrayBuffer(); })
        .then((ab) => new Promise((res, rej) => { host.context().decodeAudioData(ab, res, rej); }))
        .then((buf) => {
          // Every track, builtin or uploaded, is cached under the same bound
          // (MUSIC_CACHE), rather than holding builtins for the life of the
          // context (five decoded songs) and re-fetching and re-decoding an
          // uploaded MP3 on EVERY repeat.
          musicBuffers[url] = buf;
          _bufKeys.push(url);
          while (_bufKeys.length > MUSIC_CACHE) delete musicBuffers[_bufKeys.shift()];
          playMusicBuffer(buf, token);
          return buf;
        })
        .catch((err) => {
          // Music is optional and the game plays on without it. Retained rather
          // than printed: a soundtrack that never starts is otherwise invisible.
          Log.warn("audio", "music load/decode failed for " + url + ": " + ((err && err.message) || err));
          musicLoadFailed(token);
          return null;
        });
      _musicLoads[url] = _load;
      // Dropped on settle either way, so a later tap retries a failed load rather
      // than replaying its null forever.
      _load.then(function () { if (_musicLoads[url] === _load) delete _musicLoads[url]; },
                 function () { if (_musicLoads[url] === _load) delete _musicLoads[url]; });
    }

    function setMusicVolume(v) {
      musicVol = host.clamp01(typeof v === "number" ? v : 0.5);
      if (musicGain) { musicGain.gain.value = musicVol * MUSIC_FULL; musicGain._apexDuckTgt = null; }   // a direct write invalidates the duck cache
      if (backend) { try { backend.setVolume(musicVol); } catch (e) { /* a broken backend must not take the audio down */ } }
      return musicVol;
    }
    function skipTrack() {
      if (!musicEnabled) return null;
      if (backend) { try { return backend.skip(); } catch (e) { return null; } }
      if (!host.context()) return null;
      nextTrack(1);
      return trackName();
    }
    function prevTrack() {
      if (!musicEnabled) return null;
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

    /* ------- playlist management (used by MusicLib for uploaded files) -------
       Uploaded tracks arrive as { id, name, url } with url an object URL owned by
       the caller — WE NEVER REVOKE IT, because the same blob may be re-added and
       the owner needs to decide when it dies. */
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
      const wasPlaying = musicOn && i === musicIndex;
      delete musicBuffers[PLAYLIST[i].url];
      PLAYLIST.splice(i, 1);
      if (i < musicIndex) musicIndex--;
      if (!PLAYLIST.length) { stopInternal(); musicIndex = 0; return true; }
      musicIndex = ((musicIndex % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
      // The next track the SOURCE allows (MY TRACKS stays MY TRACKS); none left: stop.
      if (wasPlaying) { const j = eligible(musicIndex) ? musicIndex : seekEligible(musicIndex, 1); if (j < 0) stopInternal(); else playIndex(j); }
      return true;
    }
    function playTrackId(id) {
      const i = indexOfId(id);
      if (i < 0 || backend || !musicEnabled) return false;
      playIndex(i);
      return musicOn;
    }
    function currentTrackId() {
      if (!musicOn || backend) return null;
      const e = PLAYLIST[musicIndex];
      return e ? e.id : null;
    }

    /* ------- external music backend (Spotify) -------
       Installing one silences the built-in playlist and routes every music call
       to the backend; removing it hands the soundtrack back, resuming where the
       built-in playlist left off rather than restarting from track one. */
    function setMusicBackend(b) {
      if (b === backend) return;
      backend = b || null;
      if (backend) {
        stopInternal();
        try {
          backend.setVolume(musicVol);
          if (musicEnabled && host.enabled()) backend.start();
        } catch (e) { /* a broken backend must not take the audio down */ }
      } else if (musicEnabled && host.enabled() && host.context()) {
        playIndex(musicIndex);
      }
    }
    function musicBackend() { return backend; }

    function setMusicEnabled(b) {
      musicEnabled = !!b;
      if (!musicEnabled) stopMusic();
      else if (host.context() || backend) startMusic(lastTrackIdx);
    }

    function startMusic(trackIdx) {
      const idx = (typeof trackIdx === "number") ? trackIdx : 0;
      lastTrackIdx = idx;
      if (!musicEnabled) return;
      // Delegated: the backend owns play/pause, and needs no AudioContext.
      if (backend) { try { backend.start(); } catch (e) { /* a broken backend must not take the audio down */ } return; }
      if (!host.context()) return;                    // remember the track but stay silent if music is off
      // The menu and the race share one playlist, so a state change must NOT
      // interrupt it — going to the grid must not restart the track from zero.
      // Whatever is playing keeps playing; we only start something if silent.
      if (musicOn && musicSrc) return;
      playIndex(musicIndex);
    }

    function stopInternal() {
      musicOn = false;
      musicToken++;                                // cancel any in-flight load
      // stop() and disconnect() get their OWN try each. Sharing one meant a throw
      // from stop() (stop-before-start is the documented case) skipped the
      // disconnect, stranding a BufferSource that keeps rendering AND pins its
      // 71-83 MB buffer — the same shape as the two stranded GainNodes.
      try { if (musicSrc) { musicSrc.onended = null; musicSrc.stop(); } } catch (e) { /* stop-before-start is the documented case */ }
      try { if (musicSrc) musicSrc.disconnect(); } catch (e) { /* Already detached, or the ctx closed under it: unreachable either way, and musicSrc is nulled below. */ }
      musicSrc = null;
      // THE RESUME BUFFER IS A WHOLE DECODED TRACK — 71-83 MB at a 48 kHz context,
      // measured from the shipped MP3 frame headers. It was never nulled anywhere:
      // not here, not in stopMusic/setMusicEnabled, and not in rebuildCtx, which
      // clears every OTHER ctx-bound cache by name. So MUSIC OFF freed nothing.
      // Dropping the offset with it is correct: music that was stopped resumes
      // from the top, and the offset only means anything while a track is live.
      musicResumeBuf = null; musicResumeAt = NaN; musicResumeOff = 0;
    }

    function stopMusic() {
      stopInternal();
      if (backend) { try { backend.stop(); } catch (e) { /* a broken backend must not take the audio down */ } }
    }

    let radioDuck = 1;
    function setRadioDuck(on) {
      const want = on ? 0.35 : 1;
      if (want === radioDuck) return radioDuck;
      radioDuck = want;
      if (musicGain) musicGain._apexDuckTgt = null;   // invalidate the equality cache so the ramp re-aims
      // setEngine applies the duck, and it is not running with the engine off
      // (the pre-race check, after the flag) or SOUND EFFECTS off.
      if (musicGain && host.context() && (!host.engineRunning() || !host.sfxOk())) musicGain.gain.setTargetAtTime(musicVol * MUSIC_FULL * radioDuck, host.now(), 0.15);
      return radioDuck;
    }

    // Hide preserves the clock position; an explicit stop drops it.
    function suspendMusic() {
      const hidBuf = musicResumeBuf, hidAt = musicResumeAt, hidOff = musicResumeOff;
      if (musicOn) stopMusic();
      musicResumeBuf = hidBuf; musicResumeAt = hidAt; musicResumeOff = hidOff;
    }
    function resetContext() {
      musicGain = null;
      for (const k in musicBuffers) delete musicBuffers[k];
      for (const k in _musicLoads) delete _musicLoads[k];
      _bufKeys.length = 0;
      musicResumeBuf = null; musicResumeAt = NaN; musicResumeOff = 0;
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
      startMusic, stopMusic, setMusicEnabled, skipTrack, prevTrack, trackName, tracks, addTracks, removeTrack, playTrackId, currentTrackId, setMusicBackend, musicBackend, setMusicSource, musicSource, sourceCounts, setMusicVolume, setRadioDuck,
      suspendMusic, resetContext, releaseEngineDuck, duckForEngine,
      isPlaying: () => musicOn, lastTrack: () => lastTrackIdx, volume: () => musicVol,
    };
  }
  return { create };
})();
Object.freeze(GameAudioSoundtrack);
