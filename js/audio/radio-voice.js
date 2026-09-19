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
  /* PLAYER TUNING sits OVER those defaults rather than replacing them, which is
   * what makes "reset" a delete and not a second table to keep in step. A tune
   * is {name, pitch, rate}: `name` picks a system voice, the other two scale
   * nothing — they ARE the pitch and rate, in the same units as TONE.
   *
   * Every field is optional and every field is clamped, because this comes out
   * of localStorage: a hand-edited store, a save from a future build, or a
   * voice that existed on the machine the save was made on and does not exist
   * here. None of those may silence a channel — the written card is the game's
   * floor and the voice is the extra. */
  // One real line per channel for the settings preview — each the shape that
  // channel actually carries, so the sample exercises the same speakable()
  // path (a penalty's "+5s", the coach's plain prose, the pit call's caps).
  const SAMPLE = Object.freeze({
    control: "Car 44, track limits — +5s penalty",
    coach: "Brake a little earlier here and get the car straight",
    radio: "BOX BOX, P3 on the exit",
  });
  const PITCH_MIN = 0.5, PITCH_MAX = 1.6;
  const RATE_MIN = 0.6;
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

  /** The prosody a channel actually speaks with: the shipped default, with any
   *  stored tune laid over it and clamped. Pure — no store, no synth. */
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
    const tone = toneFor(speaker, o.tune);
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
      say: () => false, stop: () => {}, unlock: () => {}, preview: () => false,
      voiceList: () => [], tuneFor: (sp) => Object.assign(toneFor(sp, null), { name: "" }), setTune: () => false,
      setEnabled: () => {}, setVolume: (v) => v, available: () => false,
      debug: () => ({ available: false, enabled: false, voices: 0, last: null, asked: 0, started: 0 }),
    });
  }

  function create(G) {
    const synth = typeof window !== "undefined" && window.speechSynthesis;
    const Utter = typeof window !== "undefined" && window.SpeechSynthesisUtterance;
    const api = !!(synth && typeof Utter === "function");
    if (!api) { Log.info("audio", "RadioVoice: no speechSynthesis — the radio stays written"); return inert(); }
    let enabled = !!G.store.get("radioVoice", false);
    let volume = G.store.get("volRadio", 0.8);
    // ONE store key holding all three channels, not nine flat ones: the repo
    // guards that a key means exactly one type (store-key-types), and a channel
    // is naturally a record. Absent keys and absent channels both mean "the
    // shipped default", so a fresh save and a reset are the same state.
    let tune = readTune();
    // `current` is the utterance THIS instance is speaking, and it exists because
    // every utterance shares one handler over module state (`deadline`, the music
    // duck). speechSynthesis fires a cancelled line's end/error ASYNCHRONOUSLY —
    // after the replacement has already started — so without an identity check
    // the dead line's callback cleared the LIVE line's hard stop and un-ducked
    // the music underneath it. That lands on exactly the lines that preempt:
    // a penalty cutting off the coach is the case this module was built for.
    let voices = null, deadline = null, last = null, current = null;
    /* DID THE ENGINE ACTUALLY START? `asked` counts the speaks we HANDED to the
     * platform; `started` counts the ones it actually began (onstart).
     *
     * They exist because the difference is invisible from anywhere else, and it
     * is the difference between two opposite bugs. asked 0 means WE refused —
     * plan() has a reason and `last` carries it. asked > 0 with started 0 means
     * the PLATFORM refused: every line was accepted without complaint and none
     * was ever voiced, which is what an unprimed iOS engine looks like from in
     * here. A refused speak is not an error, fires no event and logs nothing,
     * so without this counter the two cases are one silent symptom — which is
     * exactly how this defect survived three attempts to fix it from the
     * outside. The audio panel prints the verdict; see js/audio/panel.js. */
    let asked = 0, started = 0;
    function readTune() {
      const t = G.store.get("voiceTune", null);
      return t && typeof t === "object" ? t : {};
    }
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
    /* The player's pick by NAME, else the shipped spread.
     *
     * BY NAME AND NOT BY INDEX, because the index is not stable: the list is
     * the machine's installed voices, so it changes with an OS update, a
     * language pack, or simply opening the save on another computer. A stored
     * index would silently become a different voice; a stored name that is gone
     * falls back here to the default spread, which is the same thing a fresh
     * save gets. A missing voice must never silence the channel. */
    function voiceFor(speaker) {
      const v = voicesFor();
      if (!v.length) return null;                       // Safari: prosody carries it alone
      const want = tune[speaker] && tune[speaker].name;
      if (want) {
        const hit = v.find((x) => x && x.name === want);
        if (hit) return hit;
      }
      const i = { control: 0, coach: 1, radio: 2 }[speaker] || 0;
      return v[i % v.length];
    }
    function clearDeadline() { if (deadline != null) { clearTimeout(deadline); deadline = null; } }
    function stop() {
      clearDeadline();
      // Before cancel(): the callback it triggers must already see itself as
      // stale, whether the engine fires it synchronously or a turn later.
      current = null;
      try { synth.cancel(); } catch (e) { /* nothing queued, or a synth mid-teardown */ }
      if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(false);
    }
    function say(msg, life, kind) {
      const p = plan({ msg, life, kind, enabled, soundOn: !!G.soundOn, state: G.state, api: true, volume, tune });
      last = { text: p.text, reason: p.reason || "spoke", rate: p.rate, budgetMs: p.budgetMs };
      if (!p.speak) return false;
      stop();
      const u = new Utter(p.text);
      u.voice = voiceFor(p.speaker);
      u.rate = p.rate; u.pitch = p.pitch; u.volume = p.volume;
      // Only the LIVE line may release the duck and the deadline — see `current`.
      u.onend = u.onerror = () => {
        if (u !== current) return;
        current = null;
        clearDeadline();
        if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(false);
      };
      // CLAIMED AND DUCKED BEFORE speak(), both for the same reason: an engine
      // may end — or refuse — an utterance synchronously from inside speak().
      // Claiming after it would make the line's own end run as a stranger;
      // ducking after it would overwrite the release that end just performed and
      // leave the music down with nothing speaking until the deadline healed it.
      // Down-then-up is also simply the right order for the ear.
      current = u;
      u.onstart = () => { started++; };
      if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(true);
      try {
        asked++;
        synth.speak(u);
      } catch (e) {
        current = null;
        if (GameAudio && GameAudio.setRadioDuck) GameAudio.setRadioDuck(false);
        Log.info("audio", "RadioVoice speak failed");
        return false;
      }
      // Bugzilla 1522074 (open, Firefox AND Chrome): a speak() directly after a
      // cancel() is silently dropped, and resume() is the reporter's fix. We
      // take that rather than the 500 ms delay also suggested there — 500 ms is
      // a sixth of a three-second card, and a deferred utterance IS the
      // "spoken after it left the screen" failure this module prevents. The
      // preempt path is exactly a cancel-then-speak, so without this the line
      // that goes missing is the PENALTY that interrupted, not the wear report.
      try { synth.resume(); } catch (e) { /* nothing was paused; harmless */ }
      // The hard stop, armed from the card's ACTUAL remaining life rather than a
      // second copy of showAnnounce's expression. A duplicated constant is how
      // "spoken after it left the screen" gets reintroduced by a later edit.
      deadline = setTimeout(stop, p.budgetMs);
      return true;
    }
    /* THE ONE GESTURE iOS GIVES US, AND IT WAS BEING THROWN AWAY.
     *
     * Chrome (M71+) needs sticky activation, which the game's own first-gesture
     * listener already provides. iOS is stricter: WebKit refuses speak() from
     * anywhere but a user gesture until the engine has been primed by a speak()
     * inside one, and this function is the only place that ever happens.
     *
     * It used to read `u.volume = 0; synth.speak(u); synth.cancel();`, which
     * primes nothing on iPhone or iPad. CANCELLING IN THE SAME TURN DISCARDS THE
     * UTTERANCE BEFORE IT IS PROCESSED — the gesture is spent and the engine is
     * no more unlocked than before — and a MUTED utterance is not reliably
     * counted as the audible speak WebKit is looking for. Every later say()
     * happens in the race loop, outside any gesture, so every one was refused:
     * on the platform that needs this most, nothing was EVER spoken, which is
     * exactly how it was reported.
     *
     * A single space carries no phonemes, so it is inaudible whatever its
     * volume; the volume only has to be non-zero to count. Nothing is cancelled
     * — the utterance ends in milliseconds by itself, and say() clears the queue
     * with its own cancel() before it speaks anyway. */
    function unlock() {
      try { const u = new Utter(" "); u.volume = 0.01; synth.speak(u); }
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
    /* SPEAK A SAMPLE, from the settings panel, where no race is running.
     *
     * It cannot go through say(): plan() refuses anything outside "race"/"count"
     * on purpose — the title screen's save-conflict card must not be read at
     * somebody browsing menus — and a preview is exactly that refused case. So
     * this borrows the prosody and the voice and speaks directly, which is also
     * what makes it honest: you hear the channel you are tuning, at the pitch
     * and rate you just set, not an approximation of it.
     *
     * The RATE you hear is the one you chose. In a race a long line is sped up
     * to RATE_MAX to fit its card and dropped if it still will not fit, so the
     * preview is the floor of what you get, never the ceiling. */
    function preview(speaker, text) {
      if (!enabled || !G.soundOn) return false;
      const sp = TONE[speaker] ? speaker : "radio";
      const t = toneFor(sp, tune);
      const words = speakable(text || SAMPLE[sp] || SAMPLE.radio);
      if (!words) return false;
      stop();
      const u = new Utter(words);
      u.voice = voiceFor(sp);
      u.rate = t.rate; u.pitch = t.pitch; u.volume = volume;
      u.onstart = () => { started++; };
      try { asked++; synth.speak(u); synth.resume(); } catch (e) { return false; }
      return true;
    }

    return {
      say, stop, unlock, preview,
      /** The installed voices a channel may be given, as plain rows for a <select>. */
      voiceList: () => voicesFor().map((v) => ({ name: v.name, lang: v.lang })),
      /** The stored tune, or the shipped default for a channel with none. */
      tuneFor: (speaker) => Object.assign(toneFor(speaker, tune), { name: (tune[speaker] && tune[speaker].name) || "" }),
      /** Patch one channel. A null patch RESETS it — see the readTune note. */
      setTune(speaker, patch) {
        if (!TONE[speaker]) return false;
        if (patch == null) delete tune[speaker];
        else tune[speaker] = Object.assign({}, tune[speaker], patch);
        G.store.set("voiceTune", tune);
        return true;
      },
      setEnabled(b) { enabled = !!b; if (!enabled) stop(); },
      setVolume(v) { volume = Math.max(0, Math.min(1, +v || 0)); return volume; },
      available: () => true,
      debug: () => ({ available: true, enabled, voices: voicesFor().length, last, asked, started }),
    };
  }

  return { create, inert, plan, speakable, estimate, toneFor, SPEAKERS, TONE, SAMPLE,
           PITCH_MIN, PITCH_MAX, RATE_MIN, RATE_MAX, LEAD_RESERVE_S, WORDS_PER_S };
})();
Object.freeze(RadioVoice);
