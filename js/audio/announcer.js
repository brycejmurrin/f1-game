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
  const GB = (v) => /^en[-_]?GB/i.test(v.lang || "");
  const PREFERRED = Object.freeze([
    // APPLE'S DOWNLOADABLE VARIANTS OF THE SAME VOICE. The compact "Daniel" is
    // what ships; Enhanced and Premium are the same character at a quality the
    // compact one cannot reach, and a player who has downloaded one should hear
    // it rather than the version that happens to sort first.
    (v) => /^daniel\b/i.test(v.name) && /\((enhanced|premium)\)/i.test(v.name),
    // MICROSOFT'S NEURAL VOICES — the top quality tier of the curated
    // cross-platform list (readium/speech), and en-GB male is Ryan or Thomas.
    // "Online" is in the NAME, which is exactly why these were unreachable
    // while this channel inherited the radio's localService filter.
    (v) => /\b(ryan|thomas)\b/i.test(v.name) && /\(natural\)/i.test(v.name) && GB(v),
    (v) => /\(natural\)/i.test(v.name) && GB(v) && !/\b(sonia|libby|maisie)\b/i.test(v.name),
    (v) => /^google uk english male/i.test(v.name),   // Chrome's own, also remote
    (v) => /^daniel\b/i.test(v.name) && GB(v),
    (v) => /^daniel\b/i.test(v.name),
    (v) => /^(arthur|oliver|george|malcolm)\b/i.test(v.name),   // other en-GB males across platforms
    (v) => GB(v) && !/female/i.test(v.name),
    (v) => GB(v),
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
  // TWO SOURCES, IN THEIR OWN LANES.
  //
  // DERIVED for anything a measurement gives: length, corners, laps, relief,
  // whether the lights are on. Nothing falls out of step with the def it
  // describes, and a circuit added tomorrow gets those clauses for free.
  //
  // AUTHORED for character (js/data/circuit-lore.js). No measurement yields
  // "Eau Rouge" or "thin air at two thousand metres", and a welcome built from
  // numbers alone says the same shape of thing about fifty-two circuits. The
  // failure this file's first version feared — "written for the six somebody
  // bothered and missing on the rest" — is answered by a test that asserts the
  // lore keys ARE the circuit ids, both ways, rather than by going without.
  //
  // AND THE SESSION. The same paragraph was read before a wet qualifying hour,
  // a duel with a legend and a dry Grand Prix; the only thing that moved was
  // one line about the weather. Every clause below that can change with the
  // session does.

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

  /** The authored row for this circuit, or an empty one. Guarded on the global
   *  because the node suites load this file without js/data/circuit-lore.js. */
  function loreFor(id) {
    try {
      if (typeof CircuitLore !== "undefined" && CircuitLore && CircuitLore.forId) return CircuitLore.forId(id) || {};
    } catch (_) { /* a partial load */ }
    return {};
  }

  /** What the SESSION is, as the last thing said before the lights.
   *
   *  It is the last line on purpose: "Let's go racing" is the cue the player is
   *  waiting for, and a welcome that ends on a fact about tarmac ends on the
   *  wrong beat. Every branch here is a state js/game.js already tracks and
   *  none of it reached this script before — the same paragraph was read for a
   *  qualifying hour, a duel and a Grand Prix. */
  function sessionLine(info, laps) {
    const legend = String(info.duelLegend || "").trim();
    if (info.duel) {
      return legend
        ? "A duel with " + broadcast(legend) + ". Just the two of you, and no one else on the road."
        : "A duel. Just the two of you, and no one else on the road.";
    }
    if (info.session === "tt") return "Time trial. You against the clock, and nothing else counts.";
    if (info.session === "quali") {
      return info.practice
        ? "Qualifying practice. Find the lap, and nothing here goes on the record."
        : "Qualifying. One lap is all you get, and it sets the grid.";
    }
    if (info.practice) return "Practice. Nothing here goes on the record — use it.";
    // A SPRINT runs SeasonCal.lapsFor(raceLaps), not raceLaps: before this the
    // announcer promised the full Grand Prix distance over a sprint grid.
    if (info.sprint) return (laps > 0 ? "The sprint. " + laps + " laps, " : "The sprint, ") + "flat out from the start. Let's go racing.";
    if (laps > 0) return laps + " laps. Let's go racing.";
    return "Let's go racing.";
  }

  /** The conditions clause. `lore.wet` and `lore.night` are what make a wet Spa
   *  and a dry Spa different reads; the generic lines are the floor under a
   *  circuit whose row says nothing about either. */
  function conditionsLine(weather, night, lore) {
    const wx = String(weather || "dry");
    if (wx === "rain") return lore.wet || "Heavy rain, and it is going to decide this one.";
    if (wx === "wet") return lore.wet || "A wet track, and the racing line is the only dry part of it.";
    if (wx === "fog") return "Fog across the circuit — you will not see the corner until you are in it.";
    if (wx === "overcast") return "Grey overhead, cool track, and the tyres will take their time.";
    if (night) return lore.night || "And we race under the lights.";
    return "";
  }

  /** The finished lines, as {text, prio} rows — prio 0 must be spoken, higher
   *  numbers are dropped first when the budget is short (see fit). */
  function rows(info) {
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
    const lore = loreFor(t.id);
    const out = [];
    const add = (text, prio) => { if (text) out.push({ text: text, prio: prio }); };

    add("Welcome to Apex 26.", 0);

    // The venue. `gp` is the event, `name` the circuit — saying both is how a
    // broadcast opens, and either alone is what a placeholder sounds like.
    // THE VENUE, VARIED. The same circuit visited twice read the same opening
    // twice; `info.variant` (the race counter) rotates the phrasing so a return
    // visit sounds like a new broadcast. Every variant still opens "This is",
    // which is the clause a squeezed budget keeps.
    const V = (+info.variant | 0) % 3;
    if (name && gp) add(V === 1 ? "This is the " + gp + ", at " + name + "."
      : V === 2 ? "This is " + name + ", and the " + gp + "." : "This is " + name + ", home of the " + gp + ".", 0);
    else if (name) add("This is " + name + (t.country ? ", " + inCountry(t.country) : "") + ".", 0);
    else if (gp) add("This is the " + gp + ".", 0);

    // The circuit's own line, and the corner it is known for. Ranked ABOVE the
    // derived numbers: a listener who hears one sentence about Spa should hear
    // the one about the Ardennes, not the one about 7.0 kilometres.
    add(lore.line, 1);
    add(t.classic ? "A circuit from the archive, back on the calendar for this one." : "", 4);

    const facts = [];
    if (km > 0) facts.push(km.toFixed(3) + " kilometres");
    if (turns > 0) facts.push(turns + " corners");
    if (facts.length) add(facts.join(", ") + ".", 3);

    add(lore.corner, 2);

    // The derived shape of the lap, unchanged: it is a different fact from the
    // corner above (one is what the lap DOES, the other is a place), and where
    // both are too much for the budget, fit() is what decides — not a rule here
    // that would silently drop a clause on a fast machine too.
    const ch = character(km, turns, relief);
    if (ch) add(ch.charAt(0).toUpperCase() + ch.slice(1) + ".", 3);

    add(conditionsLine(info.weather, night, lore), 1);
    for (const r of storyRows(info.story, info)) add(r.text, r.prio);
    add(sessionLine(info, laps), 0);
    return out;
  }

  // ── THE STORY ────────────────────────────────────────────────────────────
  // What makes THIS race different from the last one here: who you drive for,
  // where the championship stands, what the team wants, what the sky will do.
  // All of it arrives as plain data on `info.story` (create() gathers it from
  // G; the tests hand it in), every field optional, and every row is priority
  // 1-3 — the must-keep set (welcome, venue, session) is untouched, and a short
  // budget drops the story before it drops the circuit's own line.
  const WET_TO = { rain: "Rain", wet: "Rain" };
  function surnameOf(n) { const s = String(n || "").trim().split(/\s+/).pop(); return s || ""; }
  function ordinal(n) {
    const v = n % 100;
    return n + (v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"));
  }
  function storyRows(st, info) {
    const out = [];
    if (!st || typeof st !== "object") return out;
    const add = (text, prio) => { if (text) out.push({ text, prio }); };
    // The seat. "Lando Norris for McLaren, with Oscar Piastri alongside."
    if (st.driver && st.team) {
      add(st.mate ? st.driver + " for " + st.team + ", with " + surnameOf(st.mate) + " in the sister car."
        : st.driver + " at the wheel for " + st.team + ".", 3);
    }
    // The championship, once there is one to talk about (a round scored).
    const c = st.champ;
    if (c && c.rounds > 1 && c.round >= 1 && c.leader) {
      const roundTxt = c.round + 1 >= c.rounds ? "The final round" : "Round " + (c.round + 1) + " of " + c.rounds;
      if (c.youPos === 1) {
        add(roundTxt + ", and you lead the championship" + (c.gap > 0 ? " by " + c.gap + (c.gap === 1 ? " point." : " points.") : "."), 1);
      } else if (c.youPos > 1) {
        add(roundTxt + ". " + surnameOf(c.leader) + " leads the championship; you are " + ordinal(c.youPos)
          + (c.gap > 0 ? ", " + c.gap + (c.gap === 1 ? " point" : " points") + " back." : "."), 1);
      } else {
        add(roundTxt + ", and " + surnameOf(c.leader) + " leads the championship.", 2);
      }
      if (c.round + 1 >= c.rounds && c.youPos > 1 && c.gap > 0 && c.gap <= 25) add("It all comes down to this.", 2);
    }
    // What the team wants this season, in their words.
    if (st.goal) add("The target this season: " + String(st.goal).charAt(0).toLowerCase() + String(st.goal).slice(1) + ".", 3);
    // The sky. Only when the conditions are changeable, and only a real change.
    const f = st.forecast;
    if (f && f.to && f.to !== info.weather) {
      const mins = Math.max(1, Math.round((+f.inS || 0) / 60));
      const what = WET_TO[f.to] ? "Rain is on the way" : f.to === "dry" ? "The track should dry out"
        : f.to === "overcast" ? "Cloud is rolling in" : f.to === "fog" ? "Fog is forecast" : "";
      if (what) add(what + ", in about " + mins + (mins === 1 ? " minute." : " minutes."), 1);
    }
    // A time trial's own benchmark.
    if (st.best) add("Your best here is a " + st.best + ". Beat it.", 2);
    return out;
  }

  // ── THE WRAP-UP ──────────────────────────────────────────────────────────
  // Read over the results screen: the winner, the margin, your race against
  // your grid slot, the fastest lap. Pure over a plain summary, like rows().
  // Never "0.0": a margin under a tenth is a tenth, as on a timing screen.
  function secs(s) { return s < 10 ? Math.max(0.1, s).toFixed(1) : String(Math.round(s)); }
  function lapTime(s) {
    if (!(s > 0) || !Number.isFinite(s)) return "";
    const q = Math.round(s * 10) / 10;   // 119.97 is "2 oh 0.0", not "1 60.0"
    const m = Math.floor(q / 60), r = q - m * 60;
    return m > 0 ? m + " " + (r < 10 ? "oh " : "") + r.toFixed(1) : r.toFixed(1);
  }
  function wrapRows(sum) {
    const out = [];
    if (!sum || !sum.winner) return out;
    const add = (t) => { if (t) out.push(t); };
    const event = broadcast(sum.event) || "the race";
    const w = sum.winner, you = sum.you;
    if (you && you.pos === 1) {
      add("And you win " + event + (sum.margin > 0 ? ", " + secs(sum.margin) + " seconds clear." : "!"));
    } else {
      add(w.name + " wins " + event + (sum.margin > 0 && sum.second ? ", " + secs(sum.margin) + " seconds ahead of " + surnameOf(sum.second) + "." : "."));
    }
    if (you && you.pos > 1) {
      const d = you.grid > 0 ? you.grid - you.pos : 0;
      const tail = d >= 3 ? ", up " + d + " places from " + ordinal(you.grid) + " on the grid."
        : d <= -3 ? ", down from " + ordinal(you.grid) + " on the grid." : ".";
      add((you.pos <= 3 && sum.n > 3 ? "A podium for you, " + ordinal(you.pos) : "You finish " + ordinal(you.pos)) + tail);
    } else if (you && you.dnf) {
      add("A retirement for you today. There is always the next one.");
    }
    if (sum.fastest && sum.fastest.name && sum.fastest.time > 0) {
      add("Fastest lap to " + (sum.fastest.you ? "you" : surnameOf(sum.fastest.name)) + ", a " + lapTime(sum.fastest.time) + ".");
    }
    return out;
  }

  // Words a second at this channel's own rate, measured the way RadioVoice
  // measures every line it budgets (WORDS_PER_S over the channel rate). SLOW on
  // purpose in both places: over-estimating the read is what makes the fit
  // conservative, and a script cut off mid-sentence is the failure here.
  const WORDS_PER_S = 2.4;
  function seconds(text, rate) {
    return (text ? String(text).split(/\s+/).filter(Boolean).length : 0) / WORDS_PER_S / Math.max(0.1, rate || 1);
  }

  /** Drop the least important lines until the read fits `budgetMs`.
   *
   *  THE BUDGET IS THE FLYBY (24 s), and the script now has more to say than
   *  that. Measured at this channel's rate before the fit existed: Silverstone
   *  15.4 s, Monaco 18.1 s, Spa at night 22.2 s, a classic circuit in the rain
   *  26.3 s — already over, and every authored line adds to it. The loading
   *  screen cuts the read where it stands, so without this the last thing a
   *  player hears is a sentence stopping mid-word, and the "Let's go racing"
   *  cue is the line most likely to be lost. Priority 0 is never dropped: the
   *  welcome, the venue and the session survive any budget. */
  function fit(list, budgetMs, rate) {
    const kept = list.slice();
    const budget = budgetMs > 0 ? budgetMs / 1000 : Infinity;
    const total = () => kept.reduce((n, r) => n + seconds(r.text, rate), 0);
    while (total() > budget) {
      let worst = -1, worstAt = -1;
      for (let i = 0; i < kept.length; i++) if (kept[i].prio > worst) { worst = kept[i].prio; worstAt = i; }
      if (worst <= 0) break;            // only the must-keeps are left; speak them and let the screen cut
      kept.splice(worstAt, 1);
    }
    return kept;
  }

  /** The finished lines. Pure: hand it a plain object, get an array of strings.
   *  With a budget in ms, the tail is dropped by priority until the read fits;
   *  without one, every line is returned (the flyby editor prints them all). */
  function script(info, budgetMs, rate) {
    let r = rate;
    if (r == null) {
      // The channel's own rate, which is what the read will actually be spoken
      // at. Guarded like every other RadioVoice read in this file: a node suite
      // may load announcer.js on its own.
      try { r = (typeof RadioVoice !== "undefined" && RadioVoice.TONE && RadioVoice.TONE[CHANNEL].rate) || 1; }
      catch (_) { r = 1; }
    }
    return fit(rows(info), budgetMs, r).map((x) => x.text);
  }

  /** A live instance's shape with every method a no-op — the same inert()
   *  contract RadioVoice uses, so a caller never branches on availability. */
  function inert() {
    return Object.freeze({
      play: () => false, stop: () => {}, preview: () => false, sample: () => false, wrapUp: () => false,
      scriptFor: () => [], enabled: () => false, setEnabled: () => {}, available: () => false, speaking: () => false,
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
    /* THE CHAIN'S IDENTITY. The script is spoken one LINE per utterance (see
     * speak), so a cancelled read has a queued onend that would otherwise wake
     * up and carry on talking over whatever replaced it. Bumped by stop(), and
     * captured by each chain, so exactly one chain is ever live. */
    let generation = 0;
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
      wrapGen++;               // a wrap-up still waiting for the radio is retired too
      generation++;            // before cancel(): a queued onend must already see itself as stale
      speaking = null;
      try { synth.cancel(); } catch (e) { /* nothing queued, or a synth mid-teardown */ }
    }
    // Hidden tab: stop the read ourselves. Speaking into a background tab is
    // what RadioVoice's own notes say bricks the iOS synthesiser until reload.
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
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
      const out = Object.assign({}, info, { turns, relief });
      try { Object.assign(out, storyFor(out)); } catch (e) { Log.info("audio", "Announcer story skipped"); }
      return out;
    }

    /** Everything the story rows read, gathered from G — every read guarded,
     *  because an announcer that throws must not stop a race from starting. */
    function storyFor(info) {
      const extra = { variant: +G.raceRound || 0 };
      const p = G.player, cars = G.cars || [];
      const race = !info.duel && info.session !== "tt" && info.session !== "quali" && !info.practice;
      const st = {};
      if (p && p.team && race) {
        st.driver = p.name || "";
        st.team = p.team.name || "";
        const mate = cars.find((c) => c !== p && c.team === p.team);
        if (mate) st.mate = mate.name || "";
      }
      const season = G.seasonMode && G.season;
      if (season && race && typeof SeasonCal !== "undefined") {
        // THE SPRINT, and its real distance.
        if (SeasonCal.stage && SeasonCal.stage(season) === "sprint") {
          extra.sprint = true;
          if (SeasonCal.lapsFor && info.laps > 0) extra.laps = SeasonCal.lapsFor(info.laps, season);
        }
        const ids = new Set(Object.keys(season.pts || {}));
        for (const c of cars) if (c.driverId) ids.add(c.driverId);
        const order = Array.from(ids).sort((a, b) => SeasonCal.rank(season, a, b));
        const nameOf = (id) => { const c = cars.find((x) => x.driverId === id); return (c && c.name) || (season.driverCodes && season.driverCodes[id]) || ""; };
        const pts = (id) => (SeasonCal.netPts ? SeasonCal.netPts(season, id) : (season.pts[id] || 0));
        const youAt = p && p.driverId ? order.indexOf(p.driverId) : -1;
        const rounds = (typeof Career !== "undefined" && G.flow === "career" && Career.roundsTotal) ? Career.roundsTotal() : SeasonCal.rounds();
        if (order.length) {
          // The gap is to the leader, or — when you ARE the leader — your lead.
          const gap = youAt < 0 ? 0 : youAt === 0 ? (order[1] ? pts(order[0]) - pts(order[1]) : 0)
            : pts(order[0]) - pts(p.driverId);
          st.champ = { round: season.round || 0, rounds, leader: nameOf(order[0]), youPos: youAt >= 0 ? youAt + 1 : 0, gap };
        }
      }
      const car = G.career;
      if (car && car.deal && car.deal.goal && race && typeof Career !== "undefined" && Career.goalLabel) {
        const g = car.deal.goal;
        const rival = g.type === "beatRival" ? cars.find((c) => c.driverId === g.value) : null;
        st.goal = Career.goalLabel(g, rival ? surnameOf(rival.name) : undefined);
      }
      const plan = G.raceChangeable && G.wxArcPlan;
      if (plan && plan.to && race) st.forecast = { to: plan.to, inS: plan.dur };
      if (info.session === "tt" && typeof GameStore !== "undefined" && GameStore.ttBoard && info.track) {
        const b = GameStore.ttBoard(info.track.id);
        if (b && b[0] && b[0].t > 0) st.best = lapTime(b[0].t);
      }
      extra.story = st;
      return extra;
    }

    /** The results screen's read: winner, margin, your race, fastest lap. */
    let wrapGen = 0;   // a newer wrap-up (or a stop) retires a waiting one
    function wrapUp(order, info) {
      if (!on || !Array.isArray(order) || !order.length) return false;
      const t = (info && info.track) || {};
      const w = order[0], s2 = order[1];
      const you = order.find((c) => c.isPlayer);
      let fast = null;
      // Among the cars that took the flag, as endRace and the badges award it:
      // a retired car's quick lap is not the race's fastest lap.
      for (const c of order) if (c.finished && !c.retired && c.best > 0 && Number.isFinite(c.best) && (!fast || c.best < fast.best)) fast = c;
      const sum = {
        event: info && info.sprint ? "the sprint" : t.gp ? "the " + t.gp : "", n: order.length,
        winner: { name: w.name || w.code || "" },
        second: s2 && !s2.retired ? s2.name : "",
        // On the corrected clock, as the results sheet classifies: a +5 s penalty
        // is part of the margin, not seven seconds of daylight.
        margin: s2 && !s2.retired && s2.finishT > 0 && w.finishT > 0 && (s2.lap | 0) >= (w.lap | 0)
          ? (s2.finishT + (s2.penalty || 0)) - (w.finishT + (w.penalty || 0)) : 0,
        you: you ? { pos: you.retired ? 0 : (you.finPos || order.indexOf(you) + 1), grid: you.gridPos || 0, dnf: !!you.retired } : null,
        fastest: fast ? { name: fast.name || "", time: fast.best, you: !!fast.isPlayer } : null,
      };
      const lines = wrapRows(sum);
      if (!lines.length) return false;
      // AFTER THE ENGINEER, NOT OVER HIM. endRace runs 2.2 s after the flag and
      // the engineer's result line ("P3, GREAT JOB") is often still on air:
      // speaking now cut a synthesised line mid-word, or ran over a recorded
      // one (the voice pack is WebAudio, which cancel() never touches). Wait
      // for the radio to be quiet — at most 6 s, then read anyway.
      const radio = G.radio;
      const gen = ++wrapGen;
      let waited = 0;
      const go = () => {
        if (gen !== wrapGen) return;
        let busy = false;
        try { busy = !!(radio && radio.busy && radio.busy()); } catch (_) { busy = false; }
        if (busy && waited < 6000 && typeof setTimeout === "function") { waited += 250; setTimeout(go, 250); return; }
        speak(lines, 16000, false);
      };
      go();
      return true;
    }

    /** The budget is the loading screen's own window, so the read is CUT TO FIT
     *  rather than cut off: see fit(). */
    function scriptFor(info, budgetMs) { return script(factsFor(info), budgetMs); }

    /** Speak `lines` now. `budgetMs` is the loading screen's own window, so the
     *  announcer is cut off by the same skip that ends the flyby rather than
     *  talking over the grid. */
    /* ONE UTTERANCE PER LINE, chained — not one blob for the whole script.
     *
     * TWO REASONS, AND THE FIRST IS A BUG. Chrome Desktop silently fails an
     * utterance past roughly fourteen seconds; it is the long-standing defect
     * every "speech synthesis stops on long text" workaround exists for. MEASURED
     * against the real scripts at this channel's own rate: Silverstone 15.4 s,
     * Monaco 18.1 s, Spa at night 22.2 s, a classic circuit in the rain 26.3 s.
     * Not one of them fits, so on Chrome the welcome was being cut off mid-read.
     *
     * The second is that it simply sounds better. Phrasing — where the pauses
     * fall — is the main thing separating a read from a recital, and script()
     * already returns one SENTENCE per entry (its own comment says the array is
     * so a caller can drop the tail). The old join(" ") threw that structure
     * away and asked the engine to re-derive it from punctuation.
     */
    /* THE CUE LANDS ON THE CUT. "…Let's go racing" is the line the player is
     * waiting for, and read straight through it arrived eight seconds into a
     * 24 s flyby, followed by sixteen seconds of silent cinematic. play() asks
     * for the LAST line to be HELD until it will finish ~LAND_MS before the
     * budget ends, so the cue and the flyby's final shot share the beat. Never
     * earlier than the chain would reach it anyway: the hold only ever inserts
     * a pause, so a script that already fills the budget is read unchanged.
     * preview() (the editor's PLAY) and sample() do not land: an author
     * pressing PLAY wants to hear the read, not sit through the gap. */
    const LAND_MS = 600;
    function speak(lines, budgetMs, landLast) {
      // MASTER SOUND gates this like everything else. speechSynthesis is not in
      // the WebAudio graph, so nothing else silences it — a player who turned
      // sound off and then heard a voice would have found a bug, not a feature.
      if (!G.soundOn) return false;
      const parts = (Array.isArray(lines) ? lines : [lines])
        .map((l) => { const t = String(l == null ? "" : l); return RadioVoice.speakable ? RadioVoice.speakable(t) : t; })
        .filter(Boolean);
      if (!parts.length) return false;
      stop();
      const tune = (G.radio && G.radio.tuneFor && G.radio.tuneFor(CHANNEL)) || { pitch: 1, rate: 1, name: "" };
      // The ANNOUNCER's list, which includes network voices — this channel has no
      // card to miss, and the good voices are all remote (RadioVoice.REMOTE_OK).
      const list = (G.radio && G.radio.voiceList && G.radio.voiceList(CHANNEL)) || [];
      const want = pickVoice(list, tune.name);
      // voiceList() reports {name, lang}; the live SpeechSynthesisVoice has to
      // come from the synth itself, matched by name. Resolved ONCE for the whole
      // script rather than per line.
      let voice = null;
      if (want) {
        try { voice = (synth.getVoices() || []).find((v) => v.name === want.name) || null; } catch (_) { /* mid-teardown */ }
      }
      const vol = volume();
      const gen = ++generation;
      const t0 = Date.now();
      // When the last line must START to finish LAND_MS before the budget ends.
      // Estimated at the rate it will actually be spoken at (seconds() is the
      // same slow words-per-second fit() budgets with, so it errs early).
      const landAt = landLast && budgetMs > 0 && parts.length > 1
        ? t0 + budgetMs - seconds(parts[parts.length - 1], tune.rate) * 1000 - LAND_MS : 0;
      let i = 0, held = false;
      const next = () => {
        if (gen !== generation || held) return;      // a newer read, or stop(), owns the synth now
        if (i >= parts.length) { speaking = null; return; }
        const wait = i === parts.length - 1 && landAt ? landAt - Date.now() : 0;
        // `held` also swallows a second onend/onerror for the line before —
        // one hold, one cue, however noisy the engine's events are.
        if (wait > 0) { held = true; setTimeout(() => { held = false; if (gen === generation) say(); }, wait); return; }
        say();
      };
      const say = () => {
        const u = new Utter(parts[i++]);
        u.voice = voice; u.pitch = tune.pitch; u.rate = tune.rate; u.volume = vol;
        u.onend = () => { if (gen === generation) next(); };
        // A cancel from OUTSIDE (RadioVoice's hide handler shares the one
        // speechSynthesis) arrives as an interrupted/canceled error and does
        // not bump `generation` — advancing on it read the NEXT line into a
        // hidden tab. That ends the chain; any other error skips the line.
        u.onerror = (e) => {
          if (gen !== generation) return;
          const why = e && e.error;
          if (why === "interrupted" || why === "canceled") { speaking = null; generation++; return; }
          next();
        };
        speaking = u;
        try { synth.speak(u); } catch (e) { Log.info("audio", "Announcer speak failed"); speaking = null; return; }
        // Bugzilla 1522074, the same one radio-voice.js documents: a speak()
        // straight after a cancel() is silently dropped, and resume() is the fix.
        try { synth.resume(); } catch (e) { /* nothing was paused */ }
      };
      next();
      // The loading screen's window still cuts the WHOLE read, not just the line
      // in progress — the flyby ending is what ends the announcer.
      if (budgetMs > 0) setTimeout(() => { if (gen === generation) stop(); }, budgetMs);
      return true;
    }

    return {
      /** Called by the loading screen. Returns false when it said nothing, so
       *  the caller can tell "off" from "spoke" without reading storage. */
      play(info, budgetMs) {
        if (!on || (budgetMs != null && budgetMs < 0)) return false;   // a flyby with no room for it
        return speak(scriptFor(info, budgetMs), budgetMs, true);
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
      wrapUp,
      stop,
      enabled: () => on,
      /** Is a read in progress — a line on air, or the hold before the last
       *  one? The loading screen's radio check waits on this: the two share
       *  one speechSynthesis, and RadioVoice's say() cancels it. */
      speaking: () => !!speaking,
      setEnabled(b) { on = !!b; try { G.store.set("announcer", on); } catch (_) { /* storage refused */ } if (!on) stop(); },
      available: () => true,
    };
  }

  return { create, inert, script, rows, fit, seconds, pickVoice, storyRows, wrapRows, CHANNEL, PREFERRED };
})();
Object.freeze(Announcer);
