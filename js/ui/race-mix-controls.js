/* A short explicit audition, with the same live sound settings as the race. */
const RaceMixControls = (function () {
  "use strict";
  function create(G, host) {
    if (!host || typeof RaceMixAudition === "undefined") return null;
    const box = document.createElement("section"); box.className = "player-tool-panel"; box.setAttribute("aria-label", "Test race sound mix");
    const row = document.createElement("div"); row.className = "player-tool-row";
    const start = document.createElement("button"); start.type = "button"; start.className = "sel-chip"; start.textContent = "TEST RACE MIX";
    const stop = document.createElement("button"); stop.type = "button"; stop.className = "sel-chip"; stop.textContent = "STOP TEST";
    const note = document.createElement("p"); note.className = "adv-help"; note.setAttribute("role", "status");
    const hidden = () => !!host.closest("[hidden]") || !!document.hidden;
    const refresh = () => {
      const playing = RaceMixAudition.active();
      stop.disabled = !playing; start.disabled = !G.soundOn || playing;
      note.textContent = playing ? "Testing the current race mix. STOP ends it immediately." : !G.soundOn ? "Sound is muted. Enable sound to test the mix." : "A short engine, tyre and radio sample at your current levels. Muted voices and effects stay muted.";
    };
    const stopNow = () => { RaceMixAudition.stop(); refresh(); };
    start.onclick = () => {
      if (hidden() || !G.soundOn) return;
      let result;
      try { result = RaceMixAudition.start({ audio: typeof GameAudio !== "undefined" ? GameAudio : null, radio: G.radio, store: G.store, soundOn: () => G.soundOn }); }
      catch (_) { stopNow(); note.textContent = "Could not start the sound test. Check that audio is available."; return; }
      refresh();
      Promise.resolve(result).then((started) => {
        refresh();
        if (started === false) note.textContent = "Sound test unavailable while the race engine is active or audio has not loaded. Your current settings stay unchanged.";
      }, () => { stopNow(); note.textContent = "Could not start the sound test. Check that audio is available."; });
    };
    stop.onclick = stopNow; row.append(start, stop); box.append(row, note); host.appendChild(box);
    const check = () => { if (hidden() || !G.soundOn) stopNow(); else refresh(); };
    let observer = null;
    if (typeof MutationObserver === "function") {
      observer = new MutationObserver(check);
      for (let p = host; p; p = p.parentElement) observer.observe(p, { attributes: true, attributeFilter: ["hidden"] });
    }
    document.addEventListener("visibilitychange", check);
    const unsubscribe = G.store && G.store.subscribe ? G.store.subscribe(check) : null;
    const unlisten = RaceMixAudition.onChange ? RaceMixAudition.onChange(refresh) : null;
    refresh();
    return Object.freeze({ refresh: check, stop: stopNow, dispose() { stopNow(); observer?.disconnect(); unsubscribe?.(); unlisten?.(); document.removeEventListener("visibilitychange", check); box.remove(); } });
  }
  return Object.freeze({ create });
})();
