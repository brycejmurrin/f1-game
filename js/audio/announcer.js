"use strict";
var Announcer = (function () {
  const CHANNEL = "announcer";

  const GB = (v) => /^en[-_]?GB/i.test(v.lang || "");
  const PREFERRED = Object.freeze([
    (v) => /^daniel\b/i.test(v.name) && /\((enhanced|premium)\)/i.test(v.name),
    (v) => /\b(ryan|thomas)\b/i.test(v.name) && /\(natural\)/i.test(v.name) && GB(v),
    (v) => /\(natural\)/i.test(v.name) && GB(v) && !/\b(sonia|libby|maisie)\b/i.test(v.name),
    (v) => /^google uk english male/i.test(v.name),
    (v) => /^daniel\b/i.test(v.name) && GB(v),
    (v) => /^daniel\b/i.test(v.name),
    (v) => /^(arthur|oliver|george|malcolm)\b/i.test(v.name),
    (v) => GB(v) && !/female/i.test(v.name),
    (v) => GB(v),
    (v) => /^en/i.test(v.lang || ""),
  ]);

  function pickVoice(list, chosenName) {
    const all = Array.isArray(list) ? list.filter(Boolean) : [];
    if (chosenName) {
      const exact = all.find((v) => v.name === chosenName);
      if (exact) return exact;
    }
    for (const want of PREFERRED) {
      const hit = all.find(want);
      if (hit) return hit;
    }
    return null;
  }


  const ORDINAL_COUNTRY = /^(netherlands|united states|usa|uk|united kingdom|emirates|philippines)$/i;

  function broadcast(s) {
    let out = String(s == null ? "" : s).trim();
    if (/^[A-Z0-9'\u2019\-. ]+$/.test(out) && /[A-Z]{2}/.test(out)) {
      out = out.replace(/[A-Z]+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
    }
    return out.replace(/\bGP\b/g, "Grand Prix");
  }

  function inCountry(country) {
    if (!country) return "";
    return ORDINAL_COUNTRY.test(country) ? "in the " + country : "in " + country;
  }

  function character(km, turns, relief) {
    const density = km > 0 && turns > 0 ? turns / km : 0;
    const bits = [];
    if (density >= 4.0) bits.push("a tight, technical lap");
    else if (density >= 2.5) bits.push("a lap that mixes rhythm with hard braking");
    else if (density > 0) bits.push("a fast, flowing lap");
    if (relief >= 40) bits.push("and it climbs and falls more than " + Math.round(relief / 10) * 10 + " metres on the way round");
    else if (relief >= 15) bits.push("over noticeably rolling ground");
    return bits.join(" ");
  }

  function loreFor(id) {
    try {
      if (typeof CircuitLore !== "undefined" && CircuitLore && CircuitLore.forId) return CircuitLore.forId(id) || {};
    } catch (_) {  }
    return {};
  }

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
    const real = info.real;
    if (real && real.watch) return real.reel ? "The highlights. Sit back and watch it unfold." : "Sit back and watch it, exactly as it ran.";
    if (real && real.startLap > 1) return "A rolling start. The car is yours in a few seconds.";
    if (info.sprint) return (laps > 0 ? "The sprint. " + laps + " laps, " : "The sprint, ") + "flat out from the start. Let's go racing.";
    if (laps > 0) return laps + " laps. Let's go racing.";
    return "Let's go racing.";
  }

  function conditionsLine(weather, night, lore) {
    const wx = String(weather || "dry");
    if (wx === "rain" || wx === "storm") return lore.wet || "Heavy rain, and it is going to decide this one.";
    if (wx === "wet") return lore.wet || "A wet track, and the racing line is the only dry part of it.";
    if (wx === "fog") return "Fog across the circuit — you will not see the corner until you are in it.";
    if (wx === "overcast") return "Grey overhead, cool track, and the tyres will take their time.";
    if (night) return lore.night || "And we race under the lights.";
    return "";
  }

  function rows(info) {
    if (!info || typeof info !== "object") info = {};
    const t = info.track || {};
    const name = broadcast(t.name);
    const gp = broadcast(info.gp || t.gp);
    const km = +t.lengthKm || 0;
    const turns = +(info && info.turns) || 0;
    const laps = +(info && info.laps) || 0;
    const relief = +(info && info.relief) || 0;
    const tod = info.tod || "default";
    const night = tod === "night" || (tod === "default" && !!t.night);
    const lore = loreFor(t.id);
    const out = [];
    const add = (text, prio) => { if (text) out.push({ text: text, prio: prio }); };

    add("Welcome to Apex 26.", 0);

    const V = (+info.variant | 0) % 3;
    if (name && gp) add(V === 1 ? "This is the " + gp + ", at " + name + "."
      : V === 2 ? "This is " + name + ", and the " + gp + "." : "This is " + name + ", home of the " + gp + ".", 0);
    else if (name) add("This is " + name + (t.country ? ", " + inCountry(t.country) : "") + ".", 0);
    else if (gp) add("This is the " + gp + ".", 0);

    const g = info.real ? (info.real.startLap > 1 || info.real.watch ? 3 : 2) : 0;
    add(lore.line, 1 + g);
    add(t.classic ? "A circuit from the archive, back on the calendar for this one." : "", 4 + g);

    const facts = [];
    if (km > 0) facts.push(km.toFixed(3) + " kilometres");
    if (turns > 0) facts.push(turns + " corners");
    if (facts.length) add(facts.join(", ") + ".", 3 + g);

    add(lore.corner, 2 + g);

    const ch = character(km, turns, relief);
    if (ch) add(ch.charAt(0).toUpperCase() + ch.slice(1) + ".", 3 + g);

    add(conditionsLine(info.weather, night, lore), 1);
    for (const r of storyRows(info.story, info)) add(r.text, r.prio);
    add(sessionLine(info, laps), 0);
    return out;
  }

  const WET_TO = { rain: "Rain", wet: "Rain" };
  function surnameOf(n) { const s = String(n || "").trim().split(/\s+/).pop(); return s || ""; }
  function ordinal(n) {
    const v = n % 100;
    return n + (v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"));
  }
  const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth",
    "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth", "twenty-first", "twenty-second"];
  const ordWord = (n) => ORD[n] || ordinal(n);
  const NUMW = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const numWord = (n) => NUMW[n] || String(n);
  const plural = (n, one, many) => (n === 1 ? one : many);
  const TYRES = { soft: "softs", medium: "mediums", hard: "hards", intermediate: "intermediates", "full wet": "full wets" };
  function gapText(g) {
    if (!g) return "";
    if (g.lapsDown > 0) return g.lapsDown === 1 ? "a lap down" : g.lapsDown + " laps down";
    return secs(g.s) + " " + plural(+secs(g.s), "second", "seconds");
  }
  function listNames(names) {
    if (names.length <= 1) return names[0] || "";
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }
  function realRows(r) {
    const out = [];
    const add = (text, prio) => { if (text) out.push({ text, prio }); };
    const S = r.story, watch = !!r.watch;
    const y = S && S.you;
    const name = (y && y.name) || r.driver || "";
    const sur = (y && y.surname) || surnameOf(name);
    const you = watch ? sur : "you", You = watch ? sur : "You";
    const isYou = (d) => !!(d && y && d.code === y.code);
    const nameFor = (d) => (isYou(d) ? you : d.surname);
    if (!S) {
      add(watch ? "Your camera follows " + name + "." : r.startLap > 1 ? "You take over " + name + "'s car on lap " + r.startLap + (r.realLaps > 0 ? " of " + r.realLaps : "") + "."
        : "You start from " + name + "'s grid slot.", 1);
      return out;
    }
    if (S.grid) {
      const pole = S.pole, front = S.front;
      if (y && y.pos === 1) add((watch ? "Your camera follows " + name + ", on pole" : "You start from pole, in " + name + "'s car") + (front ? ", with " + front.surname + " alongside." : "."), 1);
      else {
        if (pole) add(pole.surname + " is on pole" + (front ? ", with " + nameFor(front) + " alongside." : "."), 1.1);
        if (y && y.pos > 1) add((watch ? "Your camera follows " + name + ", " + ordWord(y.pos) + " on the grid" : "You start " + name + "'s car from " + ordWord(y.pos) + " on the grid") + (y.tyre ? ", on " + (y.tyre.age > 0 ? "a used set of " : "") + (TYRES[y.tyre.compound] || y.tyre.compound) + "." : "."), 1);
      }
      if (y && y.pos === 1 && y.tyre) add(You + " start" + (watch ? "s" : "") + " on " + (y.tyre.age > 0 ? "a used set of " : "") + (TYRES[y.tyre.compound] || y.tyre.compound) + ".", 1.5);
      if (y && y.pos > 2 && (y.ahead || y.behind)) add((y.ahead ? y.ahead.surname + " starts just ahead" + (watch ? "" : " of you") : "") + (y.ahead && y.behind ? ", and " : "") + (y.behind ? y.behind.surname + " just behind" : "") + ".", 2);
      if (S.starters > 0) add(S.starters + " cars take the start" + (S.dns && S.dns.length ? "; " + listNames(S.dns.map((d) => d.surname)) + " " + plural(S.dns.length, "does", "do") + " not." : "."), 3);
      if (!watch) add("Everyone else races it exactly as it really ran.", 3.2);
      return out;
    }
    add("Lap " + S.lap + " of " + S.realLaps + (watch ? ", " + S.toGo + " to go." : S.condensed ? ". At this distance, that leaves " + S.toGo + " " + plural(S.toGo, "lap", "laps") + " for you."
      : ", and " + S.toGo + " " + plural(S.toGo, "lap", "laps") + " to go."), 1.05);
    const flag = (S.cautions || []).find((c) => c.now);
    const top = S.top || [];
    if (top[0] && !isYou(top[0])) {
      add(top[0].surname + " leads" + (flag ? " under the " + flag.kind : "")
        + (top[1] ? (flag ? ", from " + nameFor(top[1]) : ", " + gapText(top[1].gap) + " clear of " + nameFor(top[1]))
          + (top[2] && !isYou(top[2]) ? ", with " + top[2].surname + " third." : ".") : "."), 1.2);
    }
    if (y && y.running) {
      const who = watch ? "Your camera follows " + name + ", " : "You take over " + name + " ";
      const where = y.pos === 1 ? (watch ? "leading" : "in the lead") + (top[1] ? ", " + gapText(top[1].gap) + " clear" : "")
        : (watch ? ordWord(y.pos) : "in " + ordWord(y.pos)) + ", " + gapText(y.gap) + (y.gap && y.gap.lapsDown ? "" : " off the lead");
      const d = y.gridPos > 0 ? y.gridPos - y.pos : 0;
      const grid = y.gridPos > 0 ? (d > 0 ? ", up " + numWord(d) + " " + plural(d, "place", "places") + " from " + ordWord(y.gridPos) + " on the grid"
        : d < 0 ? ", down " + numWord(-d) + " " + plural(-d, "place", "places") + " from " + ordWord(y.gridPos) + " on the grid" : ", right where the car started") : "";
      add(who + where + grid + ".", 1);
      const ah = y.ahead, be = y.behind;
      if (ah || be) add((ah ? ah.surname + " is " + gapText({ s: ah.gap, lapsDown: 0 }) + " ahead" + (watch ? "" : " of you") : "")
        + (ah && be ? ", and " : "") + (be ? be.surname + " " + gapText({ s: be.gap, lapsDown: 0 }) + " behind" : "") + ".", 1.3);
      if (y.tyre) {
        const tyres = TYRES[y.tyre.compound] || y.tyre.compound;
        const stops = y.stops || [];
        add(You + (watch ? " is" : " are") + " on " + (stops.length ? tyres : "the " + tyres + " the car started on") + ", " + y.tyre.age + " " + plural(y.tyre.age, "lap", "laps") + " old"
          + (stops.length ? ", after " + (stops.length === 1 ? "a stop on lap " + stops[0] : numWord(stops.length) + " stops, on laps " + listNames(stops.map(String))) : ", with no stop yet") + ".", 2);
      }
      const pens = (y.penalties || []).filter((p) => p.seconds > 0 || p.driveThrough || p.stopGo);
      if (pens.length) {
        const sec = pens.reduce((n, p) => n + (p.seconds | 0), 0);
        add(You + (watch ? " carries " : " carry ") + (sec > 0 ? "a " + sec + "-second time penalty" : pens[0].stopGo ? "a stop-go penalty" : "a drive-through penalty") + ", handed out on lap " + pens[pens.length - 1].lap + ".", 1.9);
      }
    } else if (y) add(name + "'s car is already out of this race.", 1);
    if (flag) add("We are under the " + flag.kind + ", out since lap " + flag.from + ".", 1.1);
    const past = (S.cautions || []).filter((c) => !c.now);
    if (past.length) {
      const span = (c) => (c.to > c.from ? "laps " + c.from + " to " + c.to : "lap " + c.from);
      const reds = past.filter((c) => c.kind === "red flag");
      if (reds.length) add("The race was red-flagged on lap " + reds[0].from + ".", 2.1);
      const rest = past.filter((c) => c.kind !== "red flag");
      if (rest.length === 1) add("The " + rest[0].kind + " came out on " + span(rest[0]) + ".", 2.2);
      else if (rest.length > 1) {
        const kinds = {};
        for (const c of rest) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
        const said = Object.keys(kinds).map((k) => numWord(kinds[k]) + " " + k + (kinds[k] > 1 ? "s" : "")).join(" and ");
        add(said.charAt(0).toUpperCase() + said.slice(1) + " so far: " + listNames(rest.slice(0, 3).map(span)) + ".", 2.2);
      }
    }
    const gone = S.out || [];
    if (gone.length === 1) add(gone[0].surname + " is already out, on lap " + gone[0].lap + ".", 2.3);
    else if (gone.length > 1 && gone.length <= 4) add(listNames(gone.map((d) => d.surname)) + " are already out.", 2.3);
    else if (gone.length > 4) add(numWord(gone.length).charAt(0).toUpperCase() + numWord(gone.length).slice(1) + " cars are already out, " + listNames(gone.slice(-2).map((d) => d.surname)) + " the latest.", 2.3);
    const L = S.lead || {};
    if (L.allTheWay && L.from) add(nameFor(L.from) === "you" ? "This car has led every lap." : L.from.surname + " has led every lap.", 3);
    else if (L.changes && L.changes.length) {
      const c = L.changes[L.changes.length - 1];
      add(c.to.surname + " took the lead from " + c.from.surname + " on lap " + c.lap + (L.changes.length > 1 ? ", and it has changed hands " + numWord(L.changes.length) + " times." : "."), 3);
    }
    const rain = S.rain;
    if (rain && rain.now && rain.since) add("It has been raining since lap " + rain.since + ".", 2.05);
    else if (rain && rain.now) add("And the rain is just arriving.", 2.05);
    else if (rain && rain.since) add("It rained from lap " + rain.since + " to " + rain.last + ", and the track is drying.", 3.1);
    const f = S.fastest;
    if (f) add(isYou(f) ? (watch ? sur + " holds" : "This car holds") + " the fastest lap so far, a " + lapTime(f.time) + "." : "Fastest lap so far: " + f.surname + ", a " + lapTime(f.time) + ", on lap " + f.lap + ".", 3.2);
    if (y && y.running && (y.passesMade || y.passesLost)) {
      add((watch ? sur + " has" : "This car has") + " made " + numWord(y.passesMade) + " " + plural(y.passesMade, "pass", "passes") + " so far" + (y.passesLost ? ", and been passed " + numWord(y.passesLost) + " " + plural(y.passesLost, "time", "times") : "") + ".", 4);
    }
    if (S.passes > 0) add(S.passes + " " + plural(S.passes, "pass", "passes") + " on track in this race so far.", 4.2);
    return out;
  }

  function storyRows(st, info) {
    const out = [];
    if (!st || typeof st !== "object") return out;
    const add = (text, prio) => { if (text) out.push({ text, prio }); };
    if (st.driver && st.team) {
      add(st.mate ? st.driver + " for " + st.team + ", with " + surnameOf(st.mate) + " in the sister car."
        : st.driver + " at the wheel for " + st.team + ".", 3);
    }
    const r = st.real;
    if (r) for (const row of realRows(r)) add(row.text, row.prio);
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
    if (st.goal) add("The target this season: " + String(st.goal).charAt(0).toLowerCase() + String(st.goal).slice(1) + ".", 3);
    const f = st.forecast;
    if (f && f.to && f.to !== info.weather) {
      const mins = Math.max(1, Math.round((+f.inS || 0) / 60));
      const what = WET_TO[f.to] ? "Rain is on the way" : f.to === "dry" ? "The track should dry out"
        : f.to === "overcast" ? "Cloud is rolling in" : f.to === "fog" ? "Fog is forecast" : "";
      if (what) add(what + ", in about " + mins + (mins === 1 ? " minute." : " minutes."), 1);
    }
    if (st.best) add("Your best here is a " + st.best + ". Beat it.", 2);
    return out;
  }

  function secs(s) {
    const r = s < 10 ? Math.max(0.1, s).toFixed(1) : String(Math.round(s));
    return r === "10.0" ? "10" : r;
  }
  function lapTime(s) {
    if (!(s > 0) || !Number.isFinite(s)) return "";
    const q = Math.round(s * 10) / 10;
    const m = Math.floor(q / 60), r = q - m * 60;
    return m > 0 ? m + " " + (r < 10 ? "oh " : "") + r.toFixed(1) : r.toFixed(1);
  }
  function wrapRows(sum) {
    const out = [];
    if (!sum || !sum.winner) return out;
    const add = (t) => { if (t) out.push(t); };
    const event = broadcast(sum.event) || "the race";
    const w = sum.winner, you = sum.you;
    if (you && !you.dsq && you.pos === 1) {
      add("And you win " + event + (sum.margin > 0 ? ", " + secs(sum.margin) + " seconds clear." : "!"));
    } else {
      add(w.name + " wins " + event + (sum.margin > 0 && sum.second ? ", " + secs(sum.margin) + " seconds ahead of " + surnameOf(sum.second) + "." : "."));
    }
    if (you && you.dsq) {
      add("You have been disqualified.");
    } else if (you && you.pos > 1) {
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

  const WORDS_PER_S = 2.4;
  function seconds(text, rate) {
    return (text ? String(text).split(/\s+/).filter(Boolean).length : 0) / WORDS_PER_S / Math.max(0.1, rate || 1);
  }

  const GAP_S = 0.25, LAND_S = 0.6;
  function fit(list, budgetMs, rate) {
    const kept = list.slice();
    const budget = budgetMs > 0 ? budgetMs / 1000 - LAND_S : Infinity;
    const total = () => kept.reduce((n, r) => n + seconds(r.text, rate) + GAP_S, 0);
    while (total() > budget) {
      let worst = -1, worstAt = -1;
      for (let i = 0; i < kept.length; i++) if (kept[i].prio > worst) { worst = kept[i].prio; worstAt = i; }
      if (worst <= 0) break;
      kept.splice(worstAt, 1);
    }
    return kept;
  }

  function script(info, budgetMs, rate) {
    let r = rate;
    if (r == null) {
      try { r = (typeof RadioVoice !== "undefined" && RadioVoice.TONE && RadioVoice.TONE[CHANNEL].rate) || 1; }
      catch (_) { r = 1; }
    }
    return fit(rows(info), budgetMs, r).map((x) => x.text);
  }

  function inert() {
    return Object.freeze({
      play: () => false, stop: () => {}, preview: () => false, sample: () => false, wrapUp: () => false,
      scriptFor: () => [], enabled: () => false, setEnabled: () => {}, available: () => false, speaking: () => false,
    });
  }

  function create(G) {
    const synth = typeof window !== "undefined" && window.speechSynthesis;
    const Utter = typeof window !== "undefined" && window.SpeechSynthesisUtterance;
    const recorded = typeof RecordedAnnouncer !== "undefined" ? RecordedAnnouncer.create(G) : null;
    const recordedOn = () => G.radio && (G.radio.announcerPackOn ? G.radio.announcerPackOn() : G.radio.packOn && G.radio.packOn());
    if (!(synth && typeof Utter === "function") && !(recorded && G.radio && G.radio.pack)) {
      Log.info("audio", "Announcer: no speechSynthesis — the loading card stays written");
      return inert();
    }
    let speaking = null;
    let generation = 0;
    let on = true;
    try { on = G.store.get("announcer", true) !== false; } catch (_) { on = true; }

    function volume() {
      try { return Math.max(0, Math.min(1, +G.store.get("volRadio", 0.8))); } catch (_) { return 0.8; }
    }

    function stop() {
      if (recorded) recorded.stop();
      wrapGen++;
      generation++;
      const owned = !!speaking; speaking = null;
      if (owned) try { synth.cancel(); } catch (e) {  }
      if (typeof Captions !== "undefined" && Captions.announcerDone) Captions.announcerDone();
    }
    if (typeof document !== "undefined") {
      const pause = document.getElementById("pausemenu");
      const garage = document.getElementById("carsetup");
      const observe = (el, on) => {
        if (el && typeof MutationObserver === "function") new MutationObserver(on).observe(el, { attributes: true, attributeFilter: ["hidden"] });
      };
      observe(pause, () => { if (G.paused || !pause.hidden) stop(); });
      observe(garage, () => { if (!garage.hidden) stop(); });
      if (document.addEventListener) {
        document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
      }
    }

    function factsFor(info) {
      const t = (info && info.track) || {};
      let turns = 0, relief = 0;
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

    function storyFor(info) {
      const extra = { variant: +G.raceRound || 0 };
      const p = G.player, cars = G.cars || [];
      const race = !info.duel && info.session !== "tt" && info.session !== "quali" && !info.practice && !info.real;
      const st = {};
      if (info.real) st.real = info.real;
      if (p && p.team && race) {
        st.driver = p.name || "";
        st.team = p.team.name || "";
        const mate = cars.find((c) => c !== p && c.team === p.team);
        if (mate) st.mate = mate.name || "";
      }
      const season = G.seasonMode && G.season;
      if (season && race && typeof SeasonCal !== "undefined") {
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
        const cls = G.records && G.records.current ? G.records.current() : undefined;
        const b = cls ? GameStore.ttBoard(info.track.id, cls) : null;
        if (b && b[0] && b[0].t > 0) st.best = lapTime(b[0].t);
      }
      extra.story = st;
      return extra;
    }

    let wrapGen = 0;
    function wrapUp(order, info) {
      if (!on || !Array.isArray(order) || !order.length) return false;
      const t = (info && info.track) || {};
      const w = order[0], s2 = order[1];
      const you = order.find((c) => c.isPlayer);
      let fast = null;
      for (const c of order) if (!c.retired && !c.dsq && c.best > 0 && Number.isFinite(c.best) && (!fast || c.best < fast.best)) fast = c;
      const sum = {
        event: info && info.sprint ? "the sprint" : ((info && info.gp) || t.gp) ? "the " + ((info && info.gp) || t.gp) : "", n: order.length,
        winner: { name: w.name || w.code || "" },
        second: s2 && !s2.retired && !s2.dsq ? s2.name : "",
        margin: s2 && !s2.retired && !s2.dsq && s2.finishT > 0 && w.finishT > 0 && (s2.lap | 0) >= (w.lap | 0)
          ? (s2.finishT + (s2.penalty || 0)) - (w.finishT + (w.penalty || 0)) : 0,
        you: you ? { pos: you.retired || you.dsq ? 0 : (you.finPos || order.indexOf(you) + 1), grid: you.gridPos || 0, dnf: !!you.retired, dsq: !!you.dsq } : null,
        fastest: fast ? { name: fast.name || "", time: fast.best, you: !!fast.isPlayer } : null,
      };
      const lines = wrapRows(sum);
      if (!lines.length) return false;
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

    function scriptFor(info, budgetMs) {
      const tune = (G.radio && G.radio.tuneFor && G.radio.tuneFor(CHANNEL)) || null;
      return script(factsFor(info), budgetMs, (tune && tune.rate) || undefined);
    }

    const LAND_MS = 600;
    function speak(lines, budgetMs, landLast, options) {
      if (!G.soundOn) return false;
      if (typeof document !== "undefined" && document.hidden) return false;
      const parts = (Array.isArray(lines) ? lines : [lines])
        .map((l) => { const t = String(l == null ? "" : l); return RadioVoice.speakable ? RadioVoice.speakable(t) : t; })
        .filter(Boolean);
      if (!parts.length) return false;
      if (recorded && recordedOn()) {
        if (G.radio.stop) G.radio.stop();
        stop();
        return recorded.play(parts, budgetMs, landLast, options);
      }
      if (!synth || typeof Utter !== "function") return false;
      if (G.radio && G.radio.stop) G.radio.stop();
      const owned = !!speaking; stop();
      if (!owned) try { synth.cancel(); } catch (e) {  }
      const tune = (G.radio && G.radio.tuneFor && G.radio.tuneFor(CHANNEL)) || { pitch: 1, rate: 1, name: "" };
      const list = (G.radio && G.radio.voiceList && G.radio.voiceList(CHANNEL)) || [];
      const want = pickVoice(list, tune.name);
      let voice = null;
      if (want) {
        try { voice = (synth.getVoices() || []).find((v) => v.name === want.name) || null; } catch (_) {  }
      }
      const gen = ++generation;
      const t0 = Date.now();
      const landAt = landLast && budgetMs > 0 && parts.length > 1
        ? t0 + budgetMs - seconds(parts[parts.length - 1], tune.rate) * 1000 - LAND_MS : 0;
      let i = 0, held = false;
      const next = () => {
        if (gen !== generation || held) return;
        if (i >= parts.length) { speaking = null; return; }
        const wait = i === parts.length - 1 && landAt ? landAt - Date.now() : 0;
        if (wait > 0) { held = true; setTimeout(() => { held = false; if (gen === generation) say(); }, wait); return; }
        say();
      };
      const say = () => {
        const vol = volume();
        if (!(vol > 0)) { stop(); return; }
        const u = new Utter(parts[i++]);
        u.voice = voice; u.pitch = tune.pitch; u.rate = tune.rate; u.volume = vol;
        let settled = false;
        u.onend = () => { if (gen === generation && !settled) { settled = true; next(); } };
        u.onerror = (e) => {
          if (gen !== generation || settled) return;
          settled = true;
          const why = e && e.error;
          if (why === "interrupted" || why === "canceled") { speaking = null; generation++; return; }
          next();
        };
        speaking = u;
        if (typeof Captions !== "undefined" && Captions.onAnnouncerLine) Captions.onAnnouncerLine(parts[i - 1]);
        try { synth.speak(u); } catch (e) { Log.info("audio", "Announcer speak failed"); speaking = null; return; }
        try { synth.resume(); } catch (e) {  }
      };
      next();
      if (budgetMs > 0) setTimeout(() => { if (gen === generation) stop(); }, budgetMs);
      return true;
    }

    return {
      play(info, budgetMs) {
        if (!on || (budgetMs != null && budgetMs < 0)) return false;
        return speak(scriptFor(info, recordedOn() ? 0 : budgetMs), budgetMs, true);
      },
      preview(info) { return speak(scriptFor(info), 0, false, { allowPaused: true }); },
      sample() { return speak([(RadioVoice.SAMPLE && RadioVoice.SAMPLE[CHANNEL]) || "Welcome to Apex 26."], 0, false, { allowPaused: true }); },
      scriptFor,
      readMs(info) {
        if (!on || !G.soundOn) return 0;
        try {
          const tune = (G.radio && G.radio.tuneFor && G.radio.tuneFor(CHANNEL)) || { rate: 1 };
          const lines = script(factsFor(info), 0, tune.rate || 1);
          if (recorded && recordedOn()) {
            return recorded.readMs(lines.map((l) => RadioVoice.speakable(l)));
          }
          return Math.round(lines.reduce((n, l) => n + (seconds(l, tune.rate || 1) + GAP_S) * 1000, 0) + LAND_MS);
        } catch (e) { Log.info("audio", "Announcer: no read length", e); return 0; }
      },
      wrapUp,
      stop,
      enabled: () => on,
      speaking: () => !!speaking || !!(recorded && recorded.speaking()),
      setEnabled(b) { on = !!b; try { G.store.set("announcer", on); } catch (_) {  } if (!on) stop(); },
      available: () => true,
    };
  }

  return { create, inert, script, rows, seconds, pickVoice, storyRows, wrapRows, CHANNEL };
})();
Object.freeze(Announcer);
