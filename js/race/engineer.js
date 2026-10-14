/* Apex 26 — RACE ENGINEER: the voice that makes the tyre model legible.
 *
 * The model can be perfect and still be invisible. A player feels the car go
 * away underneath them and has no idea WHY — cold, grained, blistered, worn, or
 * simply the wrong end of the car — and without the why there is no decision to
 * make, only a car that got worse. §2.11 of the research says an engineer is
 * the most-requested missing thing in the shipped F1 games, and Apex already
 * owns the banner to say it with, so this is a small module and a large return.
 *
 * EVERY LINE NAMES A THING THE DRIVER CAN DO. "Tyres at 40%" is a status bar
 * read aloud; "fronts going — brake earlier" is a lap you can drive differently.
 * That is the whole editorial rule here, and it is why graining and blistering
 * get different lines: one of them heals if you ease off and the other does not,
 * which is the single most useful fact the thermal layer knows.
 *
 * WHY A MODULE: the same argument js/physics/tyre-model.js and
 * js/race/pit-lane.js make — tests/data/ratchets.json ratchets game.js, and
 * this is rules, not physics. It reads the `G` façade and writes nothing but
 * announcements; no car field is assigned outside its own `_eng` bag.
 */
var RaceEngineer = (function () {
  "use strict";

  const clamp = M4.clamp;

  // Wear thresholds, as a fraction of the set's life. 0.5 is information, 0.75
  // is the pit window opening (js/ui/hud.js turns the bar amber at 0.70 for the
  // same reason), 0.9 is the last useful warning and 1.0 is the cliff.
  const WEAR_STEPS = [0.5, 0.75, 0.9, 1.0];
  // How far apart the axles must be before it is worth naming an end of the
  // car. Below this the split is noise and "fronts going" would be a lie.
  // Measured on WEAR, as (wearF - wearR) / wear, once the set is half gone.
  // It was the gap between the axles' GRIP ratios, and grip only falls 5 %
  // across a whole stint before the cliff: the gap peaked at ~0.016 on a
  // normal stint against this 0.18, and past the cliff "GONE" outranks it, so
  // the call the per-axle model exists for never fired. A neutral lap tilts
  // the front 0.06 (TyreModel AXLE_REST), a 0.12 split; 0.30 is a stint that
  // leaned on one end — heavy braking or a lot of wheelspin — for real.
  const AXLE_SPLIT = 0.30;
  const AXLE_MIN_WEAR = 0.5;
  // Defect thresholds. Graining is called EARLY because the advice works — ease
  // off and it cleans up. Blistering is called late because there is nothing to
  // do about it and an early call would just be nagging.
  const GRAIN_CALL = 0.35, BLISTER_CALL = 0.20;
  // A cold set is only news on the out-lap; after that the driver knows.
  const COLD_CALL = 12;          // degrees below the window
  const OUTLAP_LAPS = 1.5;
  // Nothing is said twice inside this many seconds, whatever fires. The banner
  // is shared with flags, penalties and the caution, and an engineer that talks
  // over a red flag is worse than one that says nothing.
  const QUIET_S = 9;
  const EST_S = 0.25;   // how long senseInto reuses pits.estimate()
  // …and no single line is said twice for the SAME STATE (stateOf below): a
  // 45 s per-line timer re-said every steady-state line ("MANAGE THE TYRES",
  // "CHEAPER STOP") about twice a lap for a whole stint or caution. A line
  // whose state moved (the lap, the rival, the count) is news, and may be said
  // as soon as the quiet window allows.
  // ONE VOICE. The pit cue (js/race/pit-lane.js cue) and the engineer write to
  // the same driver; while the cue is giving a DIRECTION — hold the lane, keep
  // left, stop here, merge — the engineer waits, and the line it owes is not
  // spent (the wear step is only consumed when a line is actually said).
  const DIRECTIONAL = ["enter", "keep", "square", "stop", "merge"];
  // THE PIT CALLS — the callFor keys that are an INSTRUCTION with a lap to act
  // on it, rather than a report on the car. Only these ride the "box" priority
  // (js/game.js ANN_PRI); everything else here is "info" and yields. "tread" is
  // in because the wrong tyre for the weather costs whole seconds a lap and the
  // answer is the same one: box, now. "gone" and "undercut" are NOT — they say
  // box when you can and box or push, which is a decision, not a lap.
  // "compound" too: with five laps left and one dry compound run, the stop is
  // what stands between the player and a disqualification (FIA 2026 SR B6.3.6).
  const BOX_CALLS = ["plan0", "plan1", "tread", "compound"];
  // PACE CALLS: "push" wants this many laps of life beyond the stint, and a car
  // within PUSH_GAP_S ahead to push FOR — tyres to spare with nobody to catch
  // is not an instruction. THREAT_REACH: how near our own stop must be before
  // a rival's window is a threat worth covering.
  const PUSH_SPARE = 3, PUSH_GAP_S = 1.5, THREAT_REACH = 3;

  function create(G) {
    Log.info("race", "RaceEngineer.create");

    // Per-car engineer state, lazily. `t` is the shared quiet timer, `said`
    // the per-line ones, `step` the highest wear threshold already announced.
    // `set` is the stint counter it was learned on: a NEW set restarts the
    // ladder, which the engineer works out for itself from c.tyreStints rather
    // than by being told. TyreModel.fit() knows nothing about this module and
    // should not — a hook back would make the wear model depend on the HUD.
    function bag(c) {
      let b = c._eng;
      if (!b) b = c._eng = { t: 0, said: {}, step: -1, set: c.tyreStints || 0, cEp: 0, cLvl: 0 };
      if (b.set !== (c.tyreStints || 0)) {
        b.set = c.tyreStints || 0; b.step = -1; b.said = {};
      }
      return b;
    }

    // WHAT A LINE REPORTS, so "the same advice" means the same state, not the
    // same key. A line names a lap, a rival or a count — when that moves, the
    // line is news again; while it holds, saying it twice is nagging. Lines
    // with no state of their own (a defect, an axle, a wear step, the one-
    // compound warning) are said once per set: the bag resets with the set.
    function stateOf(key, s, b) {
      switch (key) {
        case "tread": return (s.wet ? "w" : "d") + s.lap;      // a box call: once a lap
        case "caution": return "c" + b.cEp;                     // once per caution
        case "undercut": return s.rivalBoxed;
        case "threat": return s.threat;
        // FORECAST lines (js/race/forecast.js) are news at three distances, not every lap: an early call
        // (3+ laps out), a refresh ~2 laps out and ~1 lap out. The count is latched monotone per arc
        // (senseInto), so a stated time that converges on the truth never re-opens a bucket.
        case "rain": case "rainplan": return lapBucket(s.rainInLaps);
        case "heavy": return lapBucket(s.heavyInLaps);
        case "drying": return lapBucket(s.dryInLaps);
        case "easing": return lapBucket(s.easeInLaps);
        case "here": return s.hereAt;
        case "where": return s.rainWhere;                       // news when the shower moves sector
        case "plan0": case "plan1": return s.lap + ":" + s.nextCode;
        case "gone": return s.lap;
        case "manage": return s.stintLeft;
        case "push": return s.ahead;
        case "gust": return s.gust;                              // one call per gusty spell (Wind.gustCall's ~90 s bucket)
        default: return "";
      }
    }

    function lapBucket(n) { return n == null ? "" : n >= 3 ? "far" : String(n); }

    /** Clear a car's engineer state. Called from gridUp with the rest. */
    function reset(c) { if (c) c._eng = null; if (c && c.local && typeof Forecast !== "undefined") Forecast.publish(null); }

    // What the WEATHER wants on the car right now, and what is on it.
    const WET = ["wet", "rain", "storm"];   // "storm": a heavier stage another session is adding to weather-arc.js
    const TREAD_WORD = ["SLICKS", "INTERS", "WETS"];   // TyreModel.treadFor's 0 / 1 / 2
    // How long after the road turns inter-wet "RAIN IS HERE" is still news, and the forecast's re-read clock.
    const HERE_S = 45, FC_S = 0.5;
    const NO_FC = Object.freeze({});
    // The lap estimate before the car has a lap of its own: Monza measured ~130 s on 5793 m in the VM (~45 m/s).
    const FALLBACK_MPS = 45;

    // The ladder, top rung first, offering each applicable line to `take(msg,
    // key)` until it returns true — pure, so the whole ladder is testable
    // without a banner, a car or a session. Ordered by what a driver needs to
    // hear first: a stop beats a complaint, and a complaint you can act on
    // beats one you cannot. A rung whose line has already been said (update's
    // `take`) is passed over, so a condition that stays true — a blister never
    // heals, a rain forecast holds — cannot shadow the rungs below it, BOX BOX
    // BOX among them. Each rung offers ONE line (the variants are ternaries).
    function ladder(s, take) {
      if (!s) return;
      // ADVICE, never a decision. The AI has a plan and PitLane.think executes
      // it; the player has an engineer and decides for themselves, which is the
      // §11 "live, not pre-planned" call made good. So nothing below arms a
      // stop — every one of these is a sentence.
      // The tread the weather wants is TyreModel.treadFor's: inters in the damp, full wets above 0.72 — a sense
      // that carries `wantTread` names it; one without keeps the old "WETS".
      if (s.wrongTread && take(s.wet ? (s.hereAt != null ? "RAIN IS HERE — BOX FOR " : "RAIN — BOX FOR ") + (s.wantTread === 1 ? "INTERS" : "WETS")
        : "TRACK IS DRY — BOX FOR SLICKS", "tread")) return;
      // SAID ONCE per set (update() spends the key for good): a warning, not a nag.
      if (s.oneCompound && take("ONE COMPOUND ONLY — BOX FOR A DIFFERENT TYRE OR BE DISQUALIFIED", "compound")) return;
      // THE PLAN-AWARE LINES (the player's reference plan, PitLane.planFor),
      // between the tread and the tyre complaints: a caution that fits the plan
      // with margin to spare, a rival's undercut, rain arriving before the
      // planned stop, and the stop lap itself. Every one names a LAP or a
      // compound — a sentence a driver can act on, never a status.
      // Caution stop: always name the measured loss when we have it. Never
      // "free" / "loses nothing" — estimate() is a point estimate (gap behind
      // minus lane loss) and the voice pack already covers CHEAPER STOP / ABOUT.
      if (s.cheapStop && take(s.pitLoss != null ? "CAUTION — CHEAPER STOP, ABOUT " + Math.round(s.pitLoss) + "s LOST"
        : "CAUTION — CHEAPER STOP — CONSIDER BOXING", "caution")) return;
      if (s.rivalBoxed && take(s.rivalBoxed + " HAS BOXED — UNDERCUT ON, BOX NOW OR PUSH 2 LAPS", "undercut")) return;
      // …and the THREAT before it happens: the car close behind is due in
      // (its plan's window, PitLane.windowOf) and ours is near. Boxing first
      // is the cover; a driver who knows can choose.
      if (s.threat && take(s.threat + " CAN UNDERCUT — BOX NEXT LAP TO COVER", "threat")) return;
      // A LOCAL SHOWER: where it is, and whether the lap as a whole wants rubber for it (treadFor on the lap mean)
      // — the dilemma a blanket rain never posed.
      if (s.rainWhere && take("RAIN IN SECTOR " + s.rainWhere + (s.wantTread > 0 ? " — " + TREAD_WORD[s.wantTread] + " FOR THE LAP" : " — REST OF THE LAP IS DRY, STAY OUT"), "where")) return;
      if (s.rainInLaps != null) {
        if (s.lapsToStop != null && s.rainInLaps <= s.lapsToStop) {
          // The box lap is the forecast's own (the lap the stated onset falls on — a grid start is lap 0), and
          // the tread is the one treadFor wants at the onset (0.25: inters), not "wets" by default.
          if (take("RAIN BEFORE THE STOP — BOX LAP " + (s.fc && s.fc.rain && s.fc.rain.lap != null ? Math.max(s.fc.rain.lap, (s.lap || 0) + 1) : (s.lap || 0) + s.rainInLaps) + " FOR "
            + (s.fc && s.fc.rain ? TREAD_WORD[s.fc.rain.tread] : "WETS") + fcTail(s, "rain"), "rainplan")) return;
        } else if (take("RAIN IN " + s.rainInLaps + (s.rainInLaps === 1 ? " LAP" : " LAPS") + fcTail(s, "rain") + " — BE READY", "rain")) return;
      }
      // The NEXT tread change, said to a car on the tread it will make wrong: heavy rain to a car on inters,
      // and the way back — a drying arc's full-wet → inter step, then the slick crossover. The box call
      // itself is still the tread rung above, when the road actually gets there.
      if (s.heavyInLaps != null && take("HEAVY RAIN IN ~" + s.heavyInLaps + (s.heavyInLaps === 1 ? " LAP" : " LAPS") + fcTail(s, "heavy") + " — FULL WETS NEXT", "heavy")) return;
      if (s.easeInLaps != null && take("RAIN EASING — INTERS IN ~" + s.easeInLaps + (s.easeInLaps === 1 ? " LAP" : " LAPS") + fcTail(s, "easing"), "easing")) return;
      if (s.dryInLaps != null && take("IT'S DRYING — SLICKS IN ~" + s.dryInLaps + (s.dryInLaps === 1 ? " LAP" : " LAPS") + fcTail(s, "drying"), "drying")) return;
      // The onset itself, to a car already on the right rubber (on the wrong one the tread rung said it).
      if (s.hereAt != null && !s.wrongTread && !s.noStop && take("RAIN IS HERE — " + (s.wantTread > 0 ? TREAD_WORD[s.wantTread] + " ARE RIGHT, " : "") + "KEEP IT ON THE ROAD", "here")) return;
      if (s.blistering >= BLISTER_CALL && take("BLISTERS — THAT SET IS DONE", "blister")) return;
      if (s.wear >= 1 && !s.noStop && take("TYRES ARE GONE — BOX WHEN YOU CAN", "gone")) return;
      // THE PIT CALL IS THE REAL ONE. On a Formula 1 radio the word is "box",
      // not "pit": it is short for the German *Boxenstopp*, and one hard
      // syllable carries over engine noise where "pit" does not. It is said
      // two or three times for the same reason — "box, box, box" is one
      // instruction repeated, not three (racefans.net's radio-jargon guide;
      // williamsf1.com's own glossary: "repeated two or three times just makes
      // sure there's no confusion over the radio"). "Box this lap" is the
      // same call in longhand; the repeat is what a driver hears at 300 km/h,
      // so that is what this game says.
      if (s.lapsToStop === 0 && take("BOX BOX BOX" + (s.nextCode ? " — " + s.nextCode : ""), "plan0")) return;
      // …with WHERE the stop drops the car: behind the first car it will not
      // clear, or into clear air. The lap before, when there is still a lap to
      // push for a better gap; "BOX BOX BOX" stays short.
      if (s.lapsToStop === 1 && take("BOX NEXT LAP" + (s.nextCode ? " — " + s.nextCode : "")
        + (s.rejoin === "" ? " — CLEAR AIR" : s.rejoin ? " — REJOIN BEHIND " + s.rejoin : ""), "plan1")) return;
      if (s.graining >= GRAIN_CALL && take("GRAINING — EASE OFF AND CLEAN THEM UP", "grain")) return;
      // Not on the only lap there is (a qualifying lap, a one-lap race).
      if (s.outLap && !s.finalLap && s.belowWindow >= COLD_CALL && take("TYRES ARE COLD — TAKE A LAP", "cold")) return;
      // THE AXLE CALL, and the one that would not exist without per-axle wear.
      // Deliberately below the defects: a grained front IS a front problem, and
      // "fronts going" when the real answer is "ease off" sends the driver the
      // wrong way.
      if (s.axle >= AXLE_SPLIT && (s.front ? take("FRONTS ARE GOING — BRAKE EARLIER", "axleF")
                                           : take("REARS ARE GOING — EASE ON THE THROTTLE", "axleR"))) return;
      // PACE, from the set's life against the laps it has to do (TyreModel
      // lapsLeft, the measured rate), for a car with a plan (the plan says
      // whether a stop is still coming): short of the flag with no stop left is
      // "manage"; laps to spare with a car close ahead is "push". Each names
      // what to do with the right foot, not a percentage.
      if (s.planned && s.setLaps != null && s.stintLeft != null && s.stintLeft >= 2 && s.setLaps + 0.5 < s.stintLeft && s.lapsToStop == null
        && take("MANAGE THE TYRES — " + s.stintLeft + " LAPS TO THE FLAG ON THAT SET", "manage")) return;
      if (s.planned && s.setLaps != null && s.stintLeft != null && s.setLaps >= s.stintLeft + PUSH_SPARE && s.ahead
        && take("TYRES ARE GOOD — PUSH, " + s.ahead + " IS " + s.aheadGap.toFixed(1) + "s AHEAD", "push")) return;
      // WIND (js/race/wind.js): a strong gust is worth a word, below everything a driver can act on in the pits.
      if (s.gust != null && take("GUSTY OUT THERE — " + s.gustKmh + " KM/H, CAREFUL ON THE BRAKES", "gust")) return;
      if (s.step >= 0) take("TYRES AT " + Math.round((1 - WEAR_STEPS[s.step]) * 100) + "%", "wear" + s.step);
    }

    // The forecast detail a lap-count line carries when js/race/forecast.js stated it: the clock time and the
    // confidence (F1's forecaster speaks in minutes, iRacing's grows less sure with lead), plus — on a rain
    // call 2+ laps out — when it turns heavy. Nothing for a hand-built sense (the pure ladder tests).
    function fcTail(s, kind) {
      const f = s.fc && s.fc[kind];
      if (!f) return "";
      const t = f.in < 90 ? "~" + Math.max(10, Math.round(f.in / 10) * 10) + "s" : "~" + (f.in < 300 ? Math.round(f.in / 30) / 2 : Math.round(f.in / 60)) + " MIN";
      const heavy = kind === "rain" && s.rainInLaps >= 2 && s.fc.heavy && s.fc.heavy.lap != null
        ? ", " + (s.fc.heavy.what === "heavy rain/storm" ? "STORM" : "HEAVY") + " BY LAP " + s.fc.heavy.lap : "";
      return " (" + t + ", " + Math.round(f.confidence * 100) + "%" + heavy + ")";
    }

    // The top line of the ladder, as [msg, key] (or "" when nothing applies) —
    // what a car with no history would be told. update() walks the same ladder
    // with its own `take`, past what it has already said.
    let _first = null;
    function takeFirst(msg, key) { _first = [msg, key]; return true; }
    function callFor(s) {
      _first = null;
      ladder(s, takeFirst);
      const r = _first; _first = null;
      return r || "";
    }

    /** Build the pure state `callFor` reads, from one car (a fresh object). */
    function senseOf(c) { return senseInto(c, {}, 0); }
    // update() reads it every step and lets go before the next: one scratch.
    // NOT throttled onto a clock: callFor's level calls (tread, box, cheap
    // stop) and the per-tick b.stops/b.undercut latches read it per step.
    const _sense = {};
    function anyFlagged(cars) {   // the leader already flagged — a loop, not a .some() closure per step
      for (let i = 0; i < cars.length; i++) { const o = cars[i]; if (o.finished && !o.retired) return true; }
      return false;
    }
    function senseInto(c, out, dt) {
      const tyres = G.tyres;
      if (!tyres || !tyres.on() || !c || !c.tyre || c.retired || c.finished) return null;
      // One façade read each: this runs every physics step and G is a dictionary-mode object (PERF-HUNT-2 S7).
      const cars = G.cars, lapsTarget = G.lapsTarget, pits = G.pits;
      const b = bag(c);
      const wear = tyres.spent(c);
      // Which threshold has been crossed since the last call, if any. Monotonic
      // by construction: `b.step` only rises, so a car sitting on 0.5 announces
      // once — and a stop resets the bag with the set.
      let step = -1;
      for (let i = WEAR_STEPS.length - 1; i >= 0; i--) {
        if (wear >= WEAR_STEPS[i] && i > b.step) { step = i; break; }
      }
      const ax = tyres.axleSplit(c);
      const belowWindow = tyres.belowWindow(c);
      // The wrong tread in EITHER direction — slicks in the rain and wets on a
      // drying track — read exactly as PitLane.think reads it for an AI car, so
      // the advice the player gets and the call the field makes cannot diverge.
      const wantTread = TyreModel.treadFor(G.raceWeather, G.trackWetness ? G.trackWetness() : undefined);
      const cautionLvl = G.cautionLevel ? G.cautionLevel() : 0;   // per step: the allocation-free read
      // The estimate is a fresh object plus a scan of the field: re-read it on a
      // 0.25 s clock, not every physics step (it is advice with a tilde, and a
      // quarter-second old costs nothing). No dt (senseOf) = always fresh.
      let pit;
      if (dt > 0 && b.estT > 0 && "est" in b) { b.estT -= dt; pit = b.est; }
      else { pit = pits && pits.estimate(c); b.est = pit; b.estT = EST_S; }
      const armed = !!c.pitArmed || (c.pitState && c.pitState !== "none");
      // …nor to one on the LAST lap (a qualifying lap is lapsTarget 1): a stop
      // there costs a place for nothing, and "BOX FOR WETS" with the flag in
      // sight is the one call that must not be obeyed.
      // A lapped car's last lap starts when the leader takes the flag, a lap
      // before its own counter says so.
      const finalLap = (lapsTarget > 0 && (c.lap || 0) >= lapsTarget) || (!!cars && anyFlagged(cars));
      const noStop = armed || finalLap;
      if (armed) b.undercut = null;   // our own stop answers the undercut: never "BOX NOW" on the out-lap
      // "Rain in N laps" needs a lap estimate and the arc is in SECONDS. The
      // driver's own last lap is the only honest converter: a fixed guess would
      // be wrong at both Monaco and Monza.
      const arc = G.weatherArc;
      const lapS = c.lastLap > 0 ? c.lastLap : 0;
      // …to the FIRST WET STAGE, not the end of the arc: dry→rain walks
      // [dry, wet, rain] and the road is wet a third of the way in (WeatherArc
      // arcSeq). An arc without a stage list counts to its end. A WeatherArc arc
      // carries `wetIn`: the second its lagged road wetness turns inter-wet,
      // which is also when its sky flips to "wet" — count to that.
      let wetAt = 1;
      if (arc && arc.seq) {
        for (let i = 0; i < arc.seq.length; i++) { if (WET.indexOf(arc.seq[i]) >= 0) { wetAt = i / arc.seq.length; break; } }
      }
      // A local shower (arc.cell) that never wets enough of the lap to want inters has no onset to count to.
      const rainT = arc ? (Number.isFinite(arc.wetIn) ? arc.wetIn : arc.cell ? 0 : arc.dur * wetAt) : 0;
      const left = arc ? Math.max(0, rainT - arc.t) : 0;
      // THE FORECAST (js/race/forecast.js): the same onset, STATED with an error that shrinks as it nears, on
      // a lap estimate that exists from the green (the car's own last lap once it has one). Re-read on a 0.5 s
      // clock; published for UI/tests as Forecast.current().
      const lapF = lapS > 0 ? lapS : (G.track && G.track.total > 0 ? G.track.total / FALLBACK_MPS : 0);
      const fc = forecastFor(c, b, arc, lapF, rainT, dt);
      // THE PLAN: the next planned stop lap and the compound it fits; and THE
      // UNDERCUT — a rival BEHIND, inside pit loss plus two seconds, whose stop
      // count rose since the last tick (remembered per rival in the bag).
      const plan = c.pitPlan, done = c.pitStops || 0;
      const nextAt = plan ? plan.lapsAt[done] : null;
      const nextCls = plan ? plan.seq[done + 1] : null;
      // The letter the crew will FIT (PitLane.nextCode), not the plan's own: the
      // call said "BOX BOX BOX — H" while AUTO bolted on an M.
      // Resolved only when a box call can be made (a lap out or on it): this
      // runs every step, and resolving a set walks the owned tyre rows.
      const calling = nextCls != null && nextAt != null && nextAt - (c.lap || 0) <= 1;
      const nextCode = !calling ? null : pits && pits.nextCode ? pits.nextCode(c) || null
        : TyreModel.AI_CLASS[nextCls] ? TyreModel.AI_CLASS[nextCls].code : null;
      let rivalBoxed = null;
      if (!b.stops) b.stops = new Map();
      // THE CARS AROUND US, in seconds at our pace (the undercut's measure):
      // the nearest ahead inside PUSH_GAP_S, the nearest behind due to stop
      // (the THREAT), and on the lap before our stop the first car we would
      // rejoin behind — every car inside a stop's worth of progress behind us.
      const v = Math.max(1, c.speed || 1), lap = c.lap || 0;
      const lapsToStop = !noStop && nextAt != null ? nextAt - lap : null;
      const lossM = pit && pit.lossS != null ? pit.lossS * (lapS > 0 && G.track ? G.track.total / lapS : v) : 0;
      let ahead = null, aheadGap = Infinity, threat = null, threatGap = Infinity, rejoin = lapsToStop === 1 && lossM > 0 ? "" : null, rejoinProg = Infinity;
      const threatOn = lapsToStop != null && lapsToStop >= 1 && lapsToStop <= THREAT_REACH && wear >= 0.4 && pit && pit.lossS != null;
      for (const o of (cars || [])) {
        if (o === c) continue;
        if (!o.retired && !o.finished && !(o.pitState && o.pitState !== "none")) {
          const gap = ((c.prog || 0) - (o.prog || 0)) / v;
          if (gap < 0 && -gap < PUSH_GAP_S && -gap < aheadGap) { ahead = o.code || "THE CAR"; aheadGap = -gap; }
          if (threatOn && gap > 0 && gap < pit.lossS + 2 && gap < threatGap && pits && pits.windowOf) {
            const w = pits.windowOf(o);
            if (w && w[0] === "P" && +w.slice(1) - (o.lap || 0) <= 1) { threat = o.code || "RIVAL"; threatGap = gap; }
          }
          const back = (c.prog || 0) - (o.prog || 0);
          if (rejoin != null && back > 0 && back < lossM && (o.prog || 0) < rejoinProg) { rejoin = o.code || "TRAFFIC"; rejoinProg = o.prog || 0; }
        }
        const now = o.pitStops || 0, prev = b.stops.has(o) ? b.stops.get(o) : now;
        if (now > prev && pit && pit.lossS != null && !noStop) {
          // DIVIDED BY OUR OWN PACE, not theirs. This fires on the tick a rival's
          // pitStops increments — the tick that car is STOPPED in its box — so
          // `o.speed` is ~0, the clamp made the divisor 1, and the "gap in
          // seconds" was a gap in METRES compared against pit.lossS. The number
          // that matters is how long WE take to cover the gap to them.
          const gap = (c.prog - o.prog) / Math.max(1, c.speed || 1);
          // LATCHED for a lap: the rise is one tick, and a call that lost that
          // tick to the quiet gap or a full card queue was never said at all.
          if (gap > 0 && gap < pit.lossS + 2) b.undercut = { code: o.code || "RIVAL", left: lapS || 90 };
        }
        b.stops.set(o, now);
      }
      if (b.undercut && !noStop) rivalBoxed = b.undercut.code;
      // Every field written, in the literal's old order (callFor reads them all).
      out.wear = wear; out.step = step;
      out.lap = c.lap || 0;
      out.lapsToStop = lapsToStop;
      out.nextCode = nextCode; out.rivalBoxed = rivalBoxed;
      out.threat = rivalBoxed || noStop ? null : threat;
      out.rejoin = rejoin; out.planned = !!plan;
      out.ahead = noStop ? null : ahead; out.aheadGap = ahead ? aheadGap : null;
      out.setLaps = tyres.lapsLeft ? tyres.lapsLeft(c) : null;
      out.stintLeft = noStop ? null : lapsToStop != null ? lapsToStop : Math.max(0, (lapsTarget || 0) - lap + 1);
      out.marginS = pit ? pit.marginS : null;
      out.axle = wear >= AXLE_MIN_WEAR && c.tyreWearF != null ? Math.abs(c.tyreWearF - c.tyreWearR) / wear : 0;
      out.front = c.tyreWearF != null ? c.tyreWearF > c.tyreWearR : ax.f < ax.r;
      // `graining`/`blistering`, not `grain`/`blister`: a property access
      // named `.grain` is how tools/gen/gen-slider-doc.mjs finds the readers
      // of the FILM GRAIN lighting slider, and this module reads no sliders.
      out.graining = c.tyreGrain || 0;
      out.blistering = c.tyreBlister || 0;
      out.belowWindow = belowWindow;
      out.outLap = (c.lap || 0) - (c.tyreLap0 || 0) <= OUTLAP_LAPS;
      // Nothing about stopping is worth saying to a driver who has already
      // called one — the banner said BOX THIS LAP when they pressed it.
      out.wrongTread = !noStop && (c.tyre.tread || 0) !== wantTread;
      out.oneCompound = !noStop && !!(pits && pits.compoundDue && pits.compoundDue(c));
      // A discounted stop needs something to gain: a part-used set.
      // The estimate includes lane travel and stationary service time — it is
      // advice with a tilde, never a promise of a free stop.
      out.pitLoss = pit ? pit.lossS : null;
      // …and a stop still to make: a planned one, or a set that cannot reach
      // the flag. With neither, "box under the caution" is a stop the race
      // does not need, however cheap.
      const stopDue = lapsToStop != null
        || (out.setLaps != null && lapsTarget > 0 && out.setLaps + 0.5 < lapsTarget - lap + 1);
      out.cheapStop = !noStop && stopDue && cautionLvl >= 2 && cautionLvl < 4 && wear >= 0.35;
      out.wet = wantTread > 0;
      out.noStop = noStop; out.finalLap = finalLap;
      const byKind = (fc && b.fcKinds) || NO_FC;   // built once per forecast read (forecastFor), not per step
      out.fc = byKind;
      out.wantTread = wantTread;
      if (b.fcArc !== arc) { b.fcArc = arc; b.fcMin = {}; }
      const tread = c.tyre.tread || 0;
      out.rainInLaps = !noStop && arc && WET.indexOf(arc.to) >= 0 && left > 0
        ? (byKind.rain ? latchLaps(b, "rain", byKind.rain, lapF) : lapS > 0 ? Math.max(1, Math.round(left / lapS)) : null) : null;
      out.heavyInLaps = !noStop && tread === 1 && !byKind.rain && byKind.heavy ? latchLaps(b, "heavy", byKind.heavy, lapF) : null;
      out.easeInLaps = !noStop && tread >= 2 && byKind.easing ? latchLaps(b, "easing", byKind.easing, lapF) : null;
      out.dryInLaps = !noStop && tread >= 1 && !byKind.easing && byKind.drying ? latchLaps(b, "drying", byKind.drying, lapF) : null;
      // "Here" is the road's own verdict (treadFor wants rubber for water now), inside HERE_S of the arc's onset —
      // not `arc.t >= wetIn`, which a bisected wetIn can miss by a hair on the very step it turns.
      out.rainWhere = arc && arc.cell && fc ? b.where || null : null;
      out.gust = typeof Wind !== "undefined" ? Wind.gustCall() : null;
      out.gustKmh = out.gust != null ? Wind.state().kmh : null;
      out.hereAt = arc && wantTread > 0 && Number.isFinite(arc.wetIn) && arc.wetIn > 0 && arc.t - arc.wetIn <= HERE_S
        ? Math.round(arc.wetIn) : null;
      return out;
    }

    // The forecast for the car, re-read on FC_S (dt 0 = senseOf, always fresh) and published from the local car.
    // Seeded from the sim seed solo (a replay hears the same) and 0 in a friend race, where the HOST's plan the
    // arc was armed from is the whole key, so both peers hear the same error.
    function forecastFor(c, b, arc, lapF, rainT, dt) {
      if (typeof Forecast === "undefined" || !Forecast || !arc || !arc.to) {
        if (c.local && b.fc && typeof Forecast !== "undefined") Forecast.publish(null);
        b.fc = null; return null;
      }
      if (dt > 0 && b.fcT > 0 && b.fcFor === arc) { b.fcT -= dt; return b.fc; }
      const net = G.netPlay && G.netPlay.active && G.netPlay.active();
      const seed = net ? 0 : (typeof G.simSeed === "function" ? G.simSeed() : 0);
      const tot = G.track && G.track.total > 0 ? G.track.total : 0;
      const lapPos = tot > 0 && c.prog != null ? (((c.prog % tot) + tot) % tot) / tot : 0;
      // WHERE a local shower is (js/race/rain-cells.js): the sectors under it now — WeatherArc publishes them on the arc.
      const where = arc.cell && Array.isArray(arc.where) ? arc.where.slice() : null;
      b.where = where && where.length ? where.join(" & ") : null;
      b.fc = Forecast.compute({ arc, raceT: G.raceT, lapS: lapF, lap: c.lap || 0, lapPos, seed, rainAt: rainT, where, wetNow: G.trackWetness ? G.trackWetness() : undefined });
      b.fcT = FC_S; b.fcFor = arc;
      const k = b.fcKinds = {};
      if (b.fc) for (let i = 0; i < b.fc.events.length; i++) k[b.fc.events[i].kind] = b.fc.events[i];
      if (c.local) Forecast.publish(b.fc);
      return b.fc;
    }
    // A forecast event's stated lead in laps, LATCHED monotone per arc: a count only ever falls, so a refreshed
    // estimate (or a slower last lap) never re-opens a bucket stateOf already spent.
    function latchLaps(b, k, e, lapF) {
      if (!(lapF > 0)) return null;
      const n = Math.max(1, Math.round(e.in / lapF)), m = b.fcMin[k];
      return (b.fcMin[k] = m != null && m < n ? m : n);
    }
    /** The local car's current forecast (null in a stable-weather race) — the read-only accessor for UI/tests. */
    function forecast() { return typeof Forecast !== "undefined" && Forecast ? Forecast.current() : null; }

    // update()'s `take`: the first rung not yet said at its current state. The
    // quiet timer holds the reports but NOT the pit calls — a BOX with a lap to
    // act on cannot wait nine seconds behind a wear step. One scratch (no
    // closure per tick), like _sense.
    let _ub = null, _us = null, _um = "", _uk = "";
    function takeUnsaid(msg, key) {
      if (_ub.t > 0 && BOX_CALLS.indexOf(key) < 0) return false;
      if (_ub.said[key] === String(stateOf(key, _us, _ub))) return false;
      _um = msg; _uk = key;
      return true;
    }
    // Is the car still on the track side of a stop — no stop armed or under way?
    // The `still` of a line that was true when it was accepted but may wait
    // behind the card on screen (announce() queues inside its 3 s floor).
    function stopOpen(c) {
      return !c.pitArmed && (!c.pitState || c.pitState === "none") && !c.finished && !c.retired;
    }

    /** One tick for ONE car — the local player only; nobody else has a banner. */
    function update(c, dt) {
      if (!c || !c.local || !(dt > 0) || G.paused) return "";   // VS FRIEND ticks under pause: no call on the pause menu (a wear step waits for resume)
      const s = senseInto(c, _sense, dt);
      if (!s) return "";
      const b = bag(c);
      b.t = Math.max(0, b.t - dt);
      // A caution EPISODE: the cheap-stop line is news once per caution.
      const lvl = G.cautionLevel ? G.cautionLevel() : 0;
      if (lvl >= 2 && !(b.cLvl >= 2)) b.cEp++;
      b.cLvl = lvl;
      if (b.undercut && (b.undercut.left -= dt) <= 0) b.undercut = null;
      const cue = G.pits && G.pits.lastCue ? G.pits.lastCue() : null;
      if (cue && DIRECTIONAL.indexOf(cue.phase) >= 0) return "";
      _ub = b; _us = s; _um = ""; _uk = "";
      ladder(s, takeUnsaid);
      _ub = _us = null;
      if (!_uk) return "";
      const msg = _um, key = _uk, sig = String(stateOf(key, s, b));
      // "info", so an engineer never talks over a flag, a penalty or the lights
      // (js/game.js ANN_PRI) — EXCEPT the pit call, which is not a report but an
      // instruction with a lap to act on it, and rides "box" (rank 4) with the
      // pit-lane messages it belongs to. At "info" it lost to "PIT ENTRY —
      // LIMITER ON": the confirmation you had pitted outranked the call to pit.
      // announce() reports back whether the line will actually be heard — a
      // cinematic camera drops "info", and a queue slot can be pushed off the
      // end by higher priorities.
      // A QUEUED line is re-checked when its turn comes: a BOX that waited out a
      // card, after the car has already pitted, is a call to do what is done.
      let still;
      if (BOX_CALLS.indexOf(key) >= 0 || key === "rain" || key === "rainplan" || key === "undercut" || key === "drying" || key === "easing" || key === "heavy") {
        const lap = key === "plan1" ? c.lap : -1;   // "next lap" is wrong a lap later
        still = () => stopOpen(c) && (lap < 0 || c.lap === lap);
      }
      if (!G.announce(msg, 2.2, BOX_CALLS.indexOf(key) >= 0 ? "box" : "info", still)) return "";
      // A wear step is only CONSUMED when it is actually said, so a threshold
      // crossed while the banner was busy is still waiting on the next tick
      // rather than silently spent.
      if (key.indexOf("wear") === 0) b.step = s.step;
      if (key === "undercut") b.undercut = null;
      b.t = QUIET_S; b.said[key] = sig;
      return msg;
    }

    return { update, reset, callFor, senseOf, forecast };
  }

  return { create, WEAR_STEPS, AXLE_SPLIT, GRAIN_CALL, BLISTER_CALL, COLD_CALL, QUIET_S, DIRECTIONAL, BOX_CALLS };
})();
Object.freeze(RaceEngineer);
