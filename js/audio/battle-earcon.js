/* BattleEarcon — finite request-only gap motifs. PCM is built and decoded
 * only on explicit preparation, never in the race's frame or timing loop. */
var BattleEarcon = (function () {
  "use strict";
  const KEYS = Object.freeze(["ahead:closing", "ahead:opening", "behind:closing", "behind:opening"]);
  const RATE = 16000, NOTE = 0.07, GAP = 0.035, DEAD_BAND = 0.1;
  // Only pending preparations and live finite handles belong in this set.
  // Completed idle services never accumulate here across races.
  const owned = new Set();
  let lifecycleBound = false;
  function stopAll() { for (const stop of owned) stop(); }
  function bindLifecycle() {
    if (lifecycleBound || typeof document === "undefined") return;
    lifecycleBound = true;
    const pause = document.getElementById("pausemenu");
    if (pause && typeof MutationObserver === "function") {
      new MutationObserver(() => { if (!pause.hidden) stopAll(); })
        .observe(pause, { attributes: true, attributeFilter: ["hidden"] });
    }
    if (document.addEventListener) document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAll();
    });
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("pagehide", stopAll);
  }

  // RaceFacts supplies checkpoint deltas for the SAME opponent. These are
  // direction only, not seconds-per-second and not a predicted pass time.
  function select(f) {
    if (!f) return "";
    const a = !!f.ahead && !f.ahead.retired && !f.ahead.finished
      && (!f.ahead.pitState || f.ahead.pitState === "none") && Number.isFinite(f.gapA) && f.gapA >= 0
      && Number.isFinite(f.rateA) && Math.abs(f.rateA) >= DEAD_BAND;
    const b = !!f.behind && !f.behind.retired && !f.behind.finished
      && (!f.behind.pitState || f.behind.pitState === "none") && Number.isFinite(f.gapB) && f.gapB >= 0
      && Number.isFinite(f.rateB) && Math.abs(f.rateB) >= DEAD_BAND;
    if (!a && !b) return "";
    const side = a && (!b || f.gapA <= f.gapB) ? "ahead" : "behind";
    const delta = side === "ahead" ? f.rateA : f.rateB;
    return side + (delta < 0 ? ":closing" : ":opening");
  }

  // Ahead: two higher notes; behind: three lower notes. Both rise when
  // closing and fall when opening. Far from brake pulses / corner calls.
  function pcmFor(key) {
    if (KEYS.indexOf(key) < 0) return null;
    const ahead = key.startsWith("ahead:"), rising = key.endsWith(":closing");
    const count = ahead ? 2 : 3, base = ahead ? 1450 : 850;
    const frames = Math.ceil((count * NOTE + (count - 1) * GAP + 0.05) * RATE);
    const ab = new ArrayBuffer(44 + frames * 2), v = new DataView(ab);
    const ascii = (at, s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
    ascii(0, "RIFF"); v.setUint32(4, ab.byteLength - 8, true); ascii(8, "WAVE");
    ascii(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); ascii(36, "data");
    v.setUint32(40, frames * 2, true);
    for (let i = 0; i < frames; i++) {
      const t = i / RATE, n = Math.floor(t / (NOTE + GAP)), local = t - n * (NOTE + GAP);
      if (n >= count || local >= NOTE) continue;
      const hz = base + 140 * (rising ? n : count - 1 - n);
      const wave = 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * hz * local));
      const env = Math.min(1, local / 0.008, (NOTE - local) / 0.012);
      v.setInt16(44 + i * 2, Math.round(wave * env * 0.45 * 32767), true);
    }
    return ab;
  }

  function create(audio) {
    let generation = -1, serial = 0, clips = null, pending = null, active = null;
    const currentGen = () => audio && audio.ctxGen ? audio.ctxGen() : -1;
    function stop() {
      serial++; pending = null; owned.delete(stop);
      let stopped = true;
      if (active) { try { active.stop(); } catch (error) { stopped = false; } }
      active = null;
      return stopped;   // failure still releases this service's ownership
    }
    function ready() { return !!clips && generation === currentGen(); }
    function busy() {
      if (active && audio.now() >= active.end) { active = null; owned.delete(stop); }
      return !!active;
    }
    function prepare() {
      bindLifecycle();
      if (typeof document !== "undefined" && document.hidden) { stop(); return Promise.resolve(false); }
      if (!audio || !audio.decodeClip || !audio.ctxGen) return Promise.resolve(false);
      const gen = currentGen();
      if (generation !== gen) { stop(); clips = null; generation = gen; }
      if (ready()) return Promise.resolve(true);
      if (pending) return pending;
      const token = ++serial; owned.add(stop);
      // A canceled decode may finish, but its result never installs or plays.
      pending = Promise.all(KEYS.map((key) => Promise.resolve().then(() => audio.decodeClip(pcmFor(key)))))
        .then((decoded) => {
          if (token !== serial) return false;
          owned.delete(stop); pending = null;
          if (gen !== currentGen() || decoded.some((clip) => !clip
              || !Number.isFinite(clip.duration) || !(clip.duration > 0))) return false;
          clips = decoded; return true;
        }, () => { if (token === serial) { pending = null; owned.delete(stop); } return false; });
      return pending;
    }
    function play(key, volume) {
      const i = KEYS.indexOf(key);
      if (typeof document !== "undefined" && document.hidden) { stop(); return false; }
      if (i < 0 || !ready() || busy() || !audio.radioVoice || !audio.now
          || !(volume > 0) || (audio.enabled && !audio.enabled())
          || (audio.radioVoicesLive && audio.radioVoicesLive() > 0)) return false;
      // Coach is the existing clean full-band path, with no courtesy sting or
      // squelch. The returned finite source handle owns its own teardown.
      try {
        active = audio.radioVoice([clips[i]], audio.now(), { channel: "coach", volume: Math.min(0.3, volume) });
      } catch (error) {
        stop(); return false;   // a replaced/suspended context fails closed
      }
      if (!active) return false;
      if (!Number.isFinite(active.end) || typeof active.stop !== "function") { stop(); return false; }
      owned.add(stop);
      return true;
    }
    return Object.freeze({ prepare, ready, busy, play, stop });
  }
  return Object.freeze({ create, select, pcmFor, stopAll, KEYS });
})();
Object.freeze(BattleEarcon);
