/* The radio banner, spoken aloud by the browser's own speech synthesiser. */
"use strict";
// WHY THIS IS NOT PART OF GameAudio. Every line of js/audio/engine.js is a node
// in an AudioContext graph — master → limiter → destination, sfxBus → master,
// the per-frame music duck. speechSynthesis has NO node. It cannot be connected,
// cannot be ducked by the limiter, is not silenced by master.gain = 0, and has a
// completely different unlock and failure surface. Housing it in GameAudio would
// assert a routing that does not exist, and that misconception is the single
// most load-bearing fact about this feature.
const RadioVoice = (function () {
  // The three channels js/game.js radioWho already partitions `kind` into. The
  // VOICE carries the channel, which is why speakable() below drops the WHO
  // line: reading "RACE CONTROL. Plus five second penalty" spends a second of a
  // three-second card on something the card already shows in colour.
  const SPEAKERS = Object.freeze({
    warning: "control", "penalty-warn": "control", "penalty-hit": "control",
    coach: "coach", practice: "coach",
    info: "radio", box: "radio", race: "radio",
  });
  // Prosody per channel: flat and official, calm and explanatory, quick and
  // clipped. On iOS every English voice sounds the same (the platform returns
  // no voice list and picks its own), so prosody is the ONLY differentiator
  // there and has to carry the distinction alone.
  const TONE = Object.freeze({
    control: { pitch: 0.9, rate: 1.05 },
    coach: { pitch: 1.0, rate: 0.95 },
    radio: { pitch: 1.05, rate: 1.15 },
  });
  const RATE_MAX = 1.35;
  // Seconds held back for the engine's lead-in. Remote voices are excluded
  // outright (see voicesFor), so what is left is a local engine's startup —
  // tens of milliseconds — and this covers it with room.
  const LEAD_RESERVE_S = 0.25;
  const WORDS_PER_S = 2.4;   // deliberately SLOW: under-estimating speech is the safe direction
  // Tokens that must keep their capitals. Everything else is lowercased before
  // speaking, because several engines spell a short all-caps token letter by
  // letter — "B-O-X" instead of "box". Invisible on Chrome/Windows and ruinous
  // on some Linux and macOS voices, which is exactly why it is a pure function
  // with a test rather than something a player discovers.
  //
  // AN EXPLICIT LIST, never a length rule. "any three capitals is a driver code"
  // was the obvious shortcut and it is wrong on the most important line in the
  // game: BOX is three capitals, and the rule spelled the pit call out letter by
  // letter. A real initialism is a closed set; a heuristic over ALL-CAPS copy is
  // a guess about every word that will ever be written here.
  const KEEP_CAPS = /^(DRS|ERS|VSC|SC|MGU|PB|P\d{1,2})$/;

  /** The words only, normalised for a speech engine. Pure; tested directly. */
  function speakable(msg) {
    let s = String(msg == null ? "" : msg);
    s = s.replace(/[—–]/g, ", ").replace(/…/g, " ");
    s = s.replace(/\s+,/g, ",");   // the dash above leaves " , " — several engines pause twice on it
    s = s.replace(/\+(\d+)s\b/gi, "plus $1 seconds");
    s = s.replace(/\b(\d+)s\b/gi, "$1 seconds");
    s = s.replace(/(\d)\/(\d)/g, "$1 of $2");
    // The caps pass runs BEFORE the P-number split, not after: splitting first
    // leaves a bare "P" that no longer matches KEEP_CAPS, and the position gets
    // read as the letter "p".
    s = s.replace(/[A-Z][A-Z0-9]*/g, (w) => (KEEP_CAPS.test(w) ? w : w.toLowerCase()));
    s = s.replace(/\bP(\d+)\b/g, "P $1");
    return s.replace(/\s+/g, " ").trim();
  }

  /** Estimated seconds to speak `text` at `rate`. */
  const estimate = (text, rate) => (text ? text.split(" ").length : 0) / WORDS_PER_S / Math.max(0.1, rate);

  /**
   * THE WHOLE POLICY, as a pure function: no DOM, no speechSynthesis, no clock.
   * Every refusal carries a `reason`, which is what the node tests assert on.
   */
  function plan(o) {
    const kind = o.kind || "race";
    const out = { speak: false, reason: "", text: "", speaker: "radio", rate: 1, pitch: 1, volume: o.volume == null ? 1 : o.volume, budgetMs: 0 };
    if (!o.enabled) { out.reason = "off"; return out; }
    if (!o.soundOn) { out.reason = "master-off"; return out; }
    if (!o.api) { out.reason = "no-api"; return out; }
    // The radio is about something happening NOW at 300 km/h. The title
    // screen's "SAVE CONFLICT — reload career" card is not radio and must not
    // be read aloud at somebody browsing menus.
    if (o.state !== "race" && o.state !== "count") { out.reason = "not-racing"; return out; }
    const speaker = SPEAKERS[kind] || "radio";
    const tone = TONE[speaker];
    const text = speakable(o.msg);
    if (!text) { out.reason = "empty"; return out; }
    const budget = (o.life || 0) - LEAD_RESERVE_S;
    let rate = tone.rate;
    if (estimate(text, rate) > budget) rate = RATE_MAX;
    if (estimate(text, rate) > budget) { out.reason = "too-long"; out.text = text; return out; }
    out.speak = true; out.text = text; out.speaker = speaker;
    out.rate = rate; out.pitch = tone.pitch; out.budgetMs = Math.max(0, budget) * 1000;
    return out;
  }

  /** A live instance's shape, with every method a no-op. */
  function inert() {
    return Object.freeze({
      say: () => false, stop: () => {}, unlock: () => {},
      setEnabled: () => {}, setVolume: (v) => v, available: () => false,
      debug: () => ({ available: false, enabled: false, voices: 0, last: null }),
    });
  }

  function create(G) {
    const synth = typeof window !== "undefined" && window.speechSynthesis;
    const Utter = typeof window !== "undefined" && window.SpeechSynthesisUtterance;
    const api = !!(synth && typeof Utter === "function");
    if (!api) { Log.info("audio", "RadioVoice: no speechSynthesis — the radio stays written"); return inert(); }
    let enabled = !!G.store.get("radioVoice", false);
    let volume = G.store.get("volRadio", 0.8);
    let voices = null, deadline = null, last = null;
    // NEVER called from create(): boot must not wait on a voice list, and on
    // Chrome the first read is empty anyway.
    function voicesFor() {
      if (voices) return voices;
      let all = [];
      try { all = synth.getVoices() || []; } catch (e) { all = []; }   // a synth mid-teardown throws
      const lang = (typeof document !== "undefined" && document.documentElement.lang) || "en";
      // localService ONLY. A remote voice is network-synthesised and its lead-in
      // is unbounded — it would routinely land the line after the card has gone,
      // which is the one thing this module exists to prevent. This is not a
      // preference, it is the correctness rule.
      voices = all.filter((v) => v && v.localService && String(v.lang || "").startsWith(lang.slice(0, 2)))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return voices;
    }
    // An EMPTY list is not a refusal. Safari returns nothing from getVoices()
    // and picks a system default itself, so voice = null is the Safari path and
    // it must still speak — prosody alone then carries the channel.
    function voiceFor(speaker) {
      const v = voicesFor();
      if (!v.length) return null;
      const i = { control: 0, coach: 1, radio: 2 }[speaker] || 0;
      return v[i % v.length];
    }
    function clearDeadline() { if (deadline != null) { clearTimeout(deadline); deadline = null; } }
    function stop() {
      clearDeadline();
      try { synth.cancel(); } catch (e) { /* nothing queued, or a synth mid-teardown */ }
      if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(false);
    }
    function say(msg, life, kind) {
      const p = plan({ msg, life, kind, enabled, soundOn: !!G.soundOn, state: G.state, api: true, volume });
      last = { text: p.text, reason: p.reason || "spoke", rate: p.rate, budgetMs: p.budgetMs };
      if (!p.speak) return false;
      stop();
      const u = new Utter(p.text);
      u.voice = voiceFor(p.speaker);
      u.rate = p.rate; u.pitch = p.pitch; u.volume = p.volume;
      u.onend = u.onerror = () => { clearDeadline(); if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(false); };
      try { synth.speak(u); } catch (e) { Log.info("audio", "RadioVoice speak failed"); return false; }
      // Bugzilla 1522074 (open, Firefox AND Chrome): a speak() directly after a
      // cancel() is silently dropped, and resume() is the reporter's fix. We
      // take that rather than the 500 ms delay also suggested there — 500 ms is
      // a sixth of a three-second card, and a deferred utterance IS the
      // "spoken after it left the screen" failure this module prevents. The
      // preempt path is exactly a cancel-then-speak, so without this the line
      // that goes missing is the PENALTY that interrupted, not the wear report.
      try { synth.resume(); } catch (e) { /* nothing was paused; harmless */ }
      if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(true);
      // The hard stop, armed from the card's ACTUAL remaining life rather than a
      // second copy of showAnnounce's expression. A duplicated constant is how
      // "spoken after it left the screen" gets reintroduced by a later edit.
      deadline = setTimeout(stop, p.budgetMs);
      return true;
    }
    // Chrome (M71+) needs sticky activation, which the game's own first-gesture
    // listener already provides; iOS wants a real utterance inside the gesture.
    // An empty string is silent and costs nothing.
    function unlock() {
      try { const u = new Utter(" "); u.volume = 0; synth.speak(u); synth.cancel(); }
      catch (e) { /* a browser that refuses the priming utterance simply does not get primed */ }
    }
    if (typeof document !== "undefined") {
      // The card leaving the screen is the invariant, so observing it beats
      // adding a call site to every place that can hide it — the frame loop's
      // expiry AND quitToMenu's direct reset are both covered, with no further
      // js/game.js edits.
      // LITERAL ids, not a `watch(id)` helper: a dynamic getElementById is a
      // lookup no static check can verify, and tests/unit/shell-ids.test.mjs
      // ratchets how many of those the tree carries.
      const card = document.getElementById("announce");
      const pause = document.getElementById("pausemenu");
      const observe = (el, on) => {
        if (el && typeof MutationObserver === "function") new MutationObserver(on).observe(el, { attributes: true, attributeFilter: ["hidden"] });
      };
      observe(card, () => { if (card.hidden) stop(); });
      // The paused gate in tickBody returns BEFORE announceT is decremented, so
      // a card frozen by a pause never ages out. Without this, Escape mid-line
      // leaves the voice talking over a stopped game.
      observe(pause, () => { if (!pause.hidden) stop(); });
      // iOS bricks the synthesiser until reload if it is backgrounded mid-line.
      document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
      try { synth.onvoiceschanged = () => { voices = null; }; } catch (e) { /* not every engine exposes it */ }
    }
    Log.info("audio", "RadioVoice.create enabled=" + enabled);
    return {
      say, stop, unlock,
      setEnabled(b) { enabled = !!b; if (!enabled) stop(); },
      setVolume(v) { volume = Math.max(0, Math.min(1, +v || 0)); return volume; },
      available: () => true,
      debug: () => ({ available: true, enabled, voices: voicesFor().length, last }),
    };
  }

  return { create, inert, plan, speakable, estimate, SPEAKERS, TONE, RATE_MAX, LEAD_RESERVE_S, WORDS_PER_S };
})();
Object.freeze(RadioVoice);
