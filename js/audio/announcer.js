/* The pre-race announcer: "Welcome to Apex 26…", read over the loading flyby. */
"use strict";
// WHY THIS IS NOT PART OF RadioVoice, when it borrows its whole voice stack.
// The radio is a REACTION — something happened at 300 km/h and a line lands on
// a card that is already on screen, budgeted against that card's remaining life
// (radio-voice.js plan(), which refuses outright unless G.state is "race" or
// "count"). The announcer is the opposite: one scripted paragraph, composed
// before anything has happened, spoken over a menu screen while the world is
// still loading. It cannot go through plan() without loosening the very gate
// that keeps "SAVE CONFLICT — reload career" from being read aloud at somebody
// browsing menus. So it owns its own gate and its own utterance, and borrows
// only the parts that are genuinely shared: the voice list, the per-channel
// tune, and speakable().
const Announcer = (function () {
  // The channel name is the one RadioVoice.TONE carries for us, so the voice
  // picker in js/audio/panel.js needs no special case — an announcer row is a
  // VOICE_CHANNELS entry like any other.
  const CHANNEL = "announcer";

  // DANIEL, by name, and the chain behind him. The request was "the Daniel
  // voice or the British guy": Daniel is Apple's en-GB male and exists only on
  // macOS/iOS, so on every other platform the name is worthless and the LANGUAGE
  // is what carries the character. Ordered, first match wins, and a player's
  // explicit pick in settings always outranks the whole list.
  const PREFERRED = Object.freeze([
    (v) => /^daniel\b/i.test(v.name) && /^en[-_]?GB/i.test(v.lang || ""),
    (v) => /^daniel\b/i.test(v.name),
    (v) => /^(arthur|oliver|george|malcolm)\b/i.test(v.name),   // other en-GB males across platforms
    (v) => /^en[-_]?GB/i.test(v.lang || "") && !/female/i.test(v.name),
    (v) => /^en[-_]?GB/i.test(v.lang || ""),
    (v) => /^en/i.test(v.lang || ""),
  ]);

  /** The device voice this channel should use when the player has not picked
   *  one. Pure over the list, so the test can hand it any platform's voices. */
  function pickVoice(list, chosenName) {
    const all = Array.isArray(list) ? list.filter(Boolean) : [];
    if (chosenName) {
      const exact = all.find((v) => v.name === chosenName);
      if (exact) return exact;          // the player's pick, honoured even if odd
    }
    for (const want of PREFERRED) {
      const hit = all.find(want);
      if (hit) return hit;
    }
    return null;                        // nothing English: let the platform choose
  }

  // ── THE SCRIPT ───────────────────────────────────────────────────────────
  // DERIVED, never a table of 52 blurbs. Every circuit gets a script the day it
  // is added, nothing falls out of step with the def it describes, and each
  // clause is a fact the build can produce — length, corners, laps, relief,
  // whether the lights are on. A hand-written paragraph per circuit would read
  // better on the six somebody bothered to write and be missing on the rest.

  const ORDINAL_COUNTRY = /^(netherlands|united states|usa|uk|united kingdom|emirates|philippines)$/i;

  /** A def's own string, as a broadcast would say it.
   *
   *  TWO FIXES, AND ONLY ONE IS COSMETIC. Every `gp` in js/circuits/ ends in
   *  "GP" because that is what fits a chip on the picker — and RadioVoice's
   *  speakable() lowercases any token it does not recognise, so "Italian GP"
   *  reached the synth as "italian g p": two letters where the whole point of
   *  the clause is the name of the race. Caught by printing the script live.
   *
   *  Every `name` is ALL CAPS for the same picker. That one is only about the
   *  PRINTED script in the flyby editor — speakable() lowercases it either way,
   *  so the synth never heard the shouting — but an authoring panel that prints
   *  "This is MONZA" reads as a placeholder. Title-cased only when the WHOLE
   *  string is caps, which is what makes "RED BULL RING" work where a
   *  word-length rule would have left it alone. */
  function broadcast(s) {
    let out = String(s == null ? "" : s).trim();
    if (/^[A-Z0-9'\u2019\-. ]+$/.test(out) && /[A-Z]{2}/.test(out)) {
      out = out.replace(/[A-Z]+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
    }
    return out.replace(/\bGP\b/g, "Grand Prix");
  }

  /** "Spain" -> "in Spain"; "Netherlands" -> "in the Netherlands". */
  function inCountry(country) {
    if (!country) return "";
    return ORDINAL_COUNTRY.test(country) ? "in the " + country : "in " + country;
  }

  /** One clause about what the lap IS, from numbers the build already has.
   *  Corners per kilometre separates a stop-start circuit from a fast one far
   *  better than corner count alone, which just tracks length. */
  function character(km, turns, relief) {
    const density = km > 0 && turns > 0 ? turns / km : 0;
    const bits = [];
    // THE THRESHOLDS ARE MEASURED OFF THE CALENDAR, not picked round. Corners
    // per kilometre, from the same count the loading card shows: Monza 1.9,
    // Spa 2.7, Bahrain 2.8, Silverstone 3.1, Suzuka 3.1, Jeddah 4.4, Monaco 5.7.
    // 4.0 puts the street circuits on their own and 2.5 keeps Monza out of the
    // middle band — the two cuts the calendar actually has.
    if (density >= 4.0) bits.push("a tight, technical lap");
    else if (density >= 2.5) bits.push("a lap that mixes rhythm with hard braking");
    else if (density > 0) bits.push("a fast, flowing lap");
    if (relief >= 40) bits.push("and it climbs and falls more than " + Math.round(relief / 10) * 10 + " metres on the way round");
    else if (relief >= 15) bits.push("over noticeably rolling ground");
    return bits.join(" ");
  }

  /** The finished lines. Pure: hand it a plain object, get an array of strings.
   *  Array rather than one blob so a caller can drop the tail when the budget
   *  is short, and so the test can assert on the parts it cares about. */
  function script(info) {
    // A null info is a real call: js/game.js builds one from the picker's state,
    // and the flyby editor asks for the same object with no race set up at all.
    // It must still open with the welcome rather than throw into a boot path.
    if (!info || typeof info !== "object") info = {};
    const t = info.track || {};
    const name = broadcast(t.name);
    const gp = broadcast(t.gp);
    const km = +t.lengthKm || 0;
    const turns = +(info && info.turns) || 0;
    const laps = +(info && info.laps) || 0;
    const relief = +(info && info.relief) || 0;
    const night = !!t.night || info.tod === "night";
    const lines = [];

    lines.push("Welcome to Apex 26.");

    // The venue. `gp` is the event, `name` the circuit — saying both is how a
    // broadcast opens, and either alone is what a placeholder sounds like.
    if (name && gp) lines.push("This is " + name + ", home of the " + gp + ".");
    else if (name) lines.push("This is " + name + (t.country ? ", " + inCountry(t.country) : "") + ".");
    else if (gp) lines.push("This is the " + gp + ".");

    if (t.classic) lines.push("A circuit from the archive, back on the calendar for this one.");

    const facts = [];
    if (km > 0) facts.push(km.toFixed(3) + " kilometres");
    if (turns > 0) facts.push(turns + " corners");
    if (facts.length) lines.push(facts.join(", ") + ".");

    const ch = character(km, turns, relief);
    if (ch) lines.push(ch.charAt(0).toUpperCase() + ch.slice(1) + ".");

    if (night) lines.push("And we race under the lights.");
    else if (info && info.weather && info.weather !== "dry") lines.push("And the weather is against us.");

    if (laps > 0) lines.push(laps + " laps. Let's go racing.");
    else lines.push("Let's go racing.");

    return lines;
  }

  /** A live instance's shape with every method a no-op — the same inert()
   *  contract RadioVoice uses, so a caller never branches on availability. */
  function inert() {
    return Object.freeze({
      play: () => false, stop: () => {}, preview: () => false, sample: () => false,
      scriptFor: () => [], enabled: () => false, setEnabled: () => {}, available: () => false,
    });
  }

  function create(G) {
    const synth = typeof window !== "undefined" && window.speechSynthesis;
    const Utter = typeof window !== "undefined" && window.SpeechSynthesisUtterance;
    if (!(synth && typeof Utter === "function")) {
      Log.info("audio", "Announcer: no speechSynthesis — the loading card stays written");
      return inert();
    }
    let speaking = null;
    // ON by default: this is the feature's whole point, and the player has a
    // row to turn it off. The radio defaults OFF because it interrupts a race;
    // this one talks over a screen whose entire job is to be waited through.
    let on = true;
    try { on = G.store.get("announcer", true) !== false; } catch (_) { on = true; }

    /** Volume is the SAME "VOICE VOLUME" the radio uses, read fresh on every
     *  utterance rather than cached. One slider for everything the game speaks:
     *  a second one would be a control whose only distinction is which of two
     *  identical sliders you last touched. */
    function volume() {
      try { return Math.max(0, Math.min(1, +G.store.get("volRadio", 0.8))); } catch (_) { return 0.8; }
    }

    function stop() {
      speaking = null;
      try { synth.cancel(); } catch (e) { /* nothing queued, or a synth mid-teardown */ }
    }

    /** The facts a script needs that only the BUILT track knows. Guarded hard:
     *  an announcer that throws must not stop a race from starting. */
    function factsFor(info) {
      const t = (info && info.track) || {};
      let turns = 0, relief = 0;
      // TrackMaps is a GLOBAL (js/ui/track-maps.js, its own script tag), not a
      // member of G — the loading card counts its turns the same way. `typeof`
      // first: the node suites load this file with no such global at all.
      try {
        if (typeof TrackMaps !== "undefined" && TrackMaps && typeof TrackMaps.corners === "function") {
          turns = TrackMaps.corners(t).length;
        }
      } catch (_) { turns = 0; }
      try {
        const tr = G.track;
        if (tr && tr.py && tr.py.length && tr.def && tr.def.id === t.id) {
          let lo = Infinity, hi = -Infinity;
          for (let k = 0; k < tr.py.length; k++) { if (tr.py[k] < lo) lo = tr.py[k]; if (tr.py[k] > hi) hi = tr.py[k]; }
          if (Number.isFinite(lo) && Number.isFinite(hi)) relief = hi - lo;
        }
      } catch (_) { relief = 0; }
      return Object.assign({}, info, { turns, relief });
    }

    function scriptFor(info) { return script(factsFor(info)); }

    /** Speak `lines` now. `budgetMs` is the loading screen's own window, so the
     *  announcer is cut off by the same skip that ends the flyby rather than
     *  talking over the grid. */
    function speak(lines, budgetMs) {
      // MASTER SOUND gates this like everything else. speechSynthesis is not in
      // the WebAudio graph, so nothing else silences it — a player who turned
      // sound off and then heard a voice would have found a bug, not a feature.
      if (!G.soundOn) return false;
      const text = Array.isArray(lines) ? lines.join(" ") : String(lines || "");
      const said = RadioVoice.speakable ? RadioVoice.speakable(text) : text;
      if (!said) return false;
      stop();
      const tune = (G.radio && G.radio.tuneFor && G.radio.tuneFor(CHANNEL)) || { pitch: 1, rate: 1, name: "" };
      const list = (G.radio && G.radio.voiceList && G.radio.voiceList()) || [];
      const want = pickVoice(list, tune.name);
      const u = new Utter(said);
      // voiceList() reports {name, lang}; the live SpeechSynthesisVoice has to
      // come from the synth itself, matched by name.
      if (want) {
        try { u.voice = (synth.getVoices() || []).find((v) => v.name === want.name) || null; } catch (_) { /* mid-teardown */ }
      }
      u.pitch = tune.pitch; u.rate = tune.rate; u.volume = volume();
      u.onend = u.onerror = () => { speaking = null; };
      try { synth.speak(u); } catch (e) { Log.info("audio", "Announcer speak failed"); return false; }
      // Bugzilla 1522074, the same one radio-voice.js documents: a speak()
      // straight after a cancel() is silently dropped, and resume() is the fix.
      try { synth.resume(); } catch (e) { /* nothing was paused */ }
      speaking = u;
      if (budgetMs > 0) setTimeout(() => { if (speaking === u) stop(); }, budgetMs);
      return true;
    }

    return {
      /** Called by the loading screen. Returns false when it said nothing, so
       *  the caller can tell "off" from "spoke" without reading storage. */
      play(info, budgetMs) {
        if (!on) return false;
        return speak(scriptFor(info), budgetMs);
      },
      /** The editor's PLAY button: speaks regardless of the player's toggle,
       *  because pressing play in an authoring panel IS the consent. Master
       *  sound still gates it — that switch means silence. */
      preview(info) { return speak(scriptFor(info), 0); },
      /** The settings panel's TEST button, where there is no circuit to
       *  describe: one real line at the tune you just set. It cannot go through
       *  RadioVoice.preview(), which is gated on the TEAM RADIO switch — and
       *  this channel is on when that one is off. */
      sample() { return speak([(RadioVoice.SAMPLE && RadioVoice.SAMPLE[CHANNEL]) || "Welcome to Apex 26."], 0); },
      scriptFor,
      stop,
      enabled: () => on,
      setEnabled(b) { on = !!b; try { G.store.set("announcer", on); } catch (_) { /* storage refused */ } if (!on) stop(); },
      available: () => true,
    };
  }

  return { create, inert, script, pickVoice, CHANNEL, PREFERRED };
})();
Object.freeze(Announcer);
