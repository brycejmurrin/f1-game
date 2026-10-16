/* Explicit settings gesture: a bounded sample using the existing user buses. */
const RaceMixAudition = (() => {
  "use strict";
  let run = null;
  const listeners = new Set();
  function notify() { for (const fn of listeners) fn(!!run); }
  function stop() {
    const old = run; run = null;
    if (!old) return false;
    for (const timer of old.timers) clearTimeout(timer);
    if (old.engine != null) old.audio.stopEngineIfGeneration(old.engine);
    if (old.music != null) old.audio.stopMusicIfGeneration(old.music);
    if (old.voice != null && old.radio) old.radio.stopPreviewIfGeneration(old.voice);
    notify(); return true;
  }
  function start(options) {
    stop();
    const o = options || {}, audio = o.audio || (typeof GameAudio !== "undefined" ? GameAudio : null);
    const store = o.store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    const soundOn = o.soundOn || (() => !!audio && audio.enabled());
    if (!audio || audio._stub || !audio.enabled() || !soundOn()) return false;
    // Never take ownership of an engine already serving a live race.
    if (audio.debug && audio.debug().engineOn) return false;
    audio.init();
    const get = (key, fallback) => store && store.get ? store.get(key, fallback) : fallback;
    const current = run = { audio, radio: o.radio || null, timers: [], engine: null, music: null, voice: null };
    const valid = () => run === current && soundOn() && audio.enabled();
    const ownsEngine = () => {
      if (current.engine == null) return false;
      if (audio.enginePlaybackGeneration() === current.engine) return true;
      current.engine = null; return false;
    };
    const later = (ms, fn) => current.timers.push(setTimeout(() => { if (!valid()) { if (run === current) stop(); return; } fn(); }, ms));
    try {
      if (get("sfx", true) && audio.enginePlaybackGeneration && audio.stopEngineIfGeneration) {
        audio.startEngine(); current.engine = audio.enginePlaybackGeneration(); audio.setEngine(0.45, 0, false, 0.45, 4);
      }
      if (get("music", true) && !audio.currentTrackId() && !audio.musicBackend() && audio.musicPlaybackGeneration && audio.stopMusicIfGeneration) {
        audio.startMusic(-1); current.music = audio.musicPlaybackGeneration();
      }
      later(1200, () => { if (ownsEngine() && get("sfx", true)) { audio.setEngine(0.85, 0, false, 0.8, 6); audio.setSkid(0.4); } });
      later(2400, () => {
        if (ownsEngine()) audio.setSkid(0);
        if (get("radioVoice", false) && get("volRadio", 0.8) > 0 && current.radio && current.radio.preview && current.radio.previewGeneration && current.radio.stopPreviewIfGeneration) {
          if (current.radio.preview("radio", "Brake early. Car ahead.") !== false) current.voice = current.radio.previewGeneration();
        }
      });
      // Watch mute changes even when no scheduled sample is due.
      for (let ms = 200; ms < 6000; ms += 200) later(ms, () => {
        if (ownsEngine() && !get("sfx", true)) { audio.stopEngineIfGeneration(current.engine); current.engine = null; }
        if (current.music != null && !get("music", true)) { audio.stopMusicIfGeneration(current.music); current.music = null; }
        if (current.voice != null && !get("radioVoice", false)) { current.radio.stopPreviewIfGeneration(current.voice); current.voice = null; }
      });
      later(6000, stop); notify(); return true;
    } catch (_) { stop(); return false; }
  }
  return Object.freeze({ start, stop, active: () => !!run, onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } });
})();
