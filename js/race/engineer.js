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
const RaceEngineer = (function () {
  "use strict";

  const clamp = M4.clamp;

  // Wear thresholds, as a fraction of the set's life. 0.5 is information, 0.75
  // is the pit window opening (js/ui/hud.js turns the bar amber at 0.70 for the
  // same reason), 0.9 is the last useful warning and 1.0 is the cliff.
  const WEAR_STEPS = [0.5, 0.75, 0.9, 1.0];
  // How far apart the axles must be before it is worth naming an end of the
  // car. Below this the split is noise and "fronts going" would be a lie.
  const AXLE_SPLIT = 0.18;
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
  // …and no single line repeats inside this many, so a car sitting exactly on a
  // threshold does not get the same sentence every ten seconds.
  const REPEAT_S = 45;
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
  const BOX_CALLS = ["plan0", "plan1", "tread"];

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
      if (!b) b = c._eng = { t: 0, said: {}, step: -1, set: c.tyreStints || 0 };
      if (b.set !== (c.tyreStints || 0)) {
        b.set = c.tyreStints || 0; b.step = -1; b.said = {};
      }
      return b;
    }

    /** Clear a car's engineer state. Called from gridUp with the rest. */
    function reset(c) { if (c) c._eng = null; }

    // What the WEATHER wants on the car right now, and what is on it.
    const WET = ["wet", "rain"];

    // The line to say right now, or "" — pure, so the whole ladder is testable
    // without a banner, a car or a session. Ordered by what a driver needs to
    // hear first: a stop beats a complaint, and a complaint you can act on
    // beats one you cannot.
    function callFor(s) {
      if (!s) return "";
      // ADVICE, never a decision. The AI has a plan and PitLane.think executes
      // it; the player has an engineer and decides for themselves, which is the
      // §11 "live, not pre-planned" call made good. So nothing below arms a
      // stop — every one of these is a sentence.
      if (s.wrongTread) return [s.wet ? "RAIN — BOX FOR WETS" : "TRACK IS DRY — BOX FOR SLICKS", "tread"];
      // THE PLAN-AWARE LINES (the player's reference plan, PitLane.planFor),
      // between the tread and the tyre complaints: a caution that fits the plan
      // with margin to spare, a rival's undercut, rain arriving before the
      // planned stop, and the stop lap itself. Every one names a LAP or a
      // compound — a sentence a driver can act on, never a status.
      if (s.freeStop && s.marginS != null && s.marginS > 0) return ["CAUTION — STOP NOW LOSES NOTHING", "caution"];
      if (s.freeStop) return ["CAUTION — CHEAPER STOP" + (s.pitLoss != null ? ", ABOUT " + Math.round(s.pitLoss) + "s LOST" : " — CONSIDER BOXING"), "caution"];
      if (s.rivalBoxed) return [s.rivalBoxed + " HAS BOXED — UNDERCUT ON, BOX NOW OR PUSH 2 LAPS", "undercut"];
      if (s.rainInLaps != null && s.lapsToStop != null && s.rainInLaps <= s.lapsToStop) {
        return ["RAIN BEFORE THE STOP — BOX LAP " + ((s.lap || 0) + s.rainInLaps) + " FOR WETS", "rainplan"];
      }
      if (s.rainInLaps != null) {
        return ["RAIN IN " + s.rainInLaps + (s.rainInLaps === 1 ? " LAP" : " LAPS") + " — BE READY", "rain"];
      }
      if (s.blistering >= BLISTER_CALL) return ["BLISTERS — THAT SET IS DONE", "blister"];
      if (s.wear >= 1 && !s.noStop) return ["TYRES ARE GONE — BOX WHEN YOU CAN", "gone"];
      // THE PIT CALL IS THE REAL ONE. On a Formula 1 radio the word is "box",
      // not "pit": it is short for the German *Boxenstopp*, and one hard
      // syllable carries over engine noise where "pit" does not. It is said
      // two or three times for the same reason — "box, box, box" is one
      // instruction repeated, not three (racefans.net's radio-jargon guide;
      // williamsf1.com's own glossary: "repeated two or three times just makes
      // sure there's no confusion over the radio"). "Box this lap" is the
      // same call in longhand; the repeat is what a driver hears at 300 km/h,
      // so that is what this game says.
      if (s.lapsToStop === 0) return ["BOX BOX BOX" + (s.nextCode ? " — " + s.nextCode : ""), "plan0"];
      if (s.lapsToStop === 1) return ["BOX NEXT LAP" + (s.nextCode ? " — " + s.nextCode : ""), "plan1"];
      if (s.graining >= GRAIN_CALL) return ["GRAINING — EASE OFF AND CLEAN THEM UP", "grain"];
      if (s.outLap && s.belowWindow >= COLD_CALL) return ["TYRES ARE COLD — TAKE A LAP", "cold"];
      // THE AXLE CALL, and the one that would not exist without per-axle wear.
      // Deliberately below the defects: a grained front IS a front problem, and
      // "fronts going" when the real answer is "ease off" sends the driver the
      // wrong way.
      if (s.axle >= AXLE_SPLIT) {
        return s.front ? ["FRONTS ARE GOING — BRAKE EARLIER", "axleF"]
                       : ["REARS ARE GOING — EASE ON THE THROTTLE", "axleR"];
      }
      if (s.step >= 0) {
        return ["TYRES AT " + Math.round((1 - WEAR_STEPS[s.step]) * 100) + "%", "wear" + s.step];
      }
      return "";
    }

    /** Build the pure state `callFor` reads, from one car. */
    function senseOf(c) {
      const tyres = G.tyres;
      if (!tyres || !tyres.on() || !c || !c.tyre || c.retired || c.finished) return null;
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
      const info = tyres.info(c);
      const belowWindow = info && info.tempOpt != null && info.tempS != null
        ? Math.max(0, (info.tempOpt - info.tempWindow) - info.tempS) : 0;
      // The wrong tread in EITHER direction — slicks in the rain and wets on a
      // drying track — read exactly as PitLane.think reads it for an AI car, so
      // the advice the player gets and the call the field makes cannot diverge.
      const wantTread = TyreModel.treadFor(G.raceWeather, G.roadWetness && G.roadWetness());
      const cautionLvl = G.cautionLevel ? G.cautionLevel() : 0;   // per step: the allocation-free read
      const pit = G.pits && G.pits.estimate(c);
      const armed = !!c.pitArmed || (c.pitState && c.pitState !== "none");
      // …nor to one on the LAST lap (a qualifying lap is lapsTarget 1): a stop
      // there costs a place for nothing, and "BOX FOR WETS" with the flag in
      // sight is the one call that must not be obeyed.
      const noStop = armed || (G.lapsTarget > 0 && (c.lap || 0) >= G.lapsTarget);
      // "Rain in N laps" needs a lap estimate and the arc is in SECONDS. The
      // driver's own last lap is the only honest converter: a fixed guess would
      // be wrong at both Monaco and Monza.
      const arc = G.weatherArc;
      const lapS = c.lastLap > 0 ? c.lastLap : 0;
      const left = arc ? Math.max(0, arc.dur - arc.t) : 0;
      // THE PLAN: the next planned stop lap and the compound it fits; and THE
      // UNDERCUT — a rival BEHIND, inside pit loss plus two seconds, whose stop
      // count rose since the last tick (remembered per rival in the bag).
      const plan = c.pitPlan, done = c.pitStops || 0;
      const nextAt = plan ? plan.lapsAt[done] : null;
      const nextCls = plan ? plan.seq[done + 1] : null;
      const nextCode = nextCls && TyreModel.AI_CLASS[nextCls] ? TyreModel.AI_CLASS[nextCls].code : null;
      let rivalBoxed = null;
      if (!b.stops) b.stops = new Map();
      for (const o of (G.cars || [])) {
        if (o === c) continue;
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
      return {
        wear, step,
        lap: c.lap || 0,
        lapsToStop: !noStop && nextAt != null ? nextAt - (c.lap || 0) : null,
        nextCode, rivalBoxed,
        marginS: pit ? pit.marginS : null,
        axle: Math.abs(ax.f - ax.r),
        front: ax.f < ax.r,
        // `graining`/`blistering`, not `grain`/`blister`: a property access
        // named `.grain` is how tools/gen/gen-slider-doc.mjs finds the readers
        // of the FILM GRAIN lighting slider, and this module reads no sliders.
        graining: c.tyreGrain || 0,
        blistering: c.tyreBlister || 0,
        belowWindow,
        outLap: (c.lap || 0) - (c.tyreLap0 || 0) <= OUTLAP_LAPS,
        // Nothing about stopping is worth saying to a driver who has already
        // called one — the banner said BOX THIS LAP when they pressed it.
        wrongTread: !noStop && (c.tyre.tread || 0) !== wantTread,
        // A discounted stop needs something to gain: a part-used set.
        // The estimate includes lane travel and stationary service time.
        pitLoss: pit ? pit.lossS : null,
        freeStop: !noStop && cautionLvl >= 2 && cautionLvl < 4 && wear >= 0.35,
        wet: wantTread > 0,
        noStop,
        rainInLaps: !noStop && arc && WET.indexOf(arc.to) >= 0 && lapS > 0 && left > 0
          ? Math.max(1, Math.round(left / lapS)) : null,
      };
    }

    /** One tick for ONE car — the local player only; nobody else has a banner. */
    function update(c, dt) {
      if (!c || !c.local || !(dt > 0)) return "";
      const s = senseOf(c);
      if (!s) return "";
      const b = bag(c);
      b.t = Math.max(0, b.t - dt);
      for (const k in b.said) b.said[k] = Math.max(0, b.said[k] - dt);
      if (b.undercut && (b.undercut.left -= dt) <= 0) b.undercut = null;
      const call = callFor(s);
      if (!call) return "";
      const cue = G.pits && G.pits.lastCue ? G.pits.lastCue() : null;
      if (cue && DIRECTIONAL.indexOf(cue.phase) >= 0) return "";
      const [msg, key] = call;
      if (b.t > 0 || b.said[key] > 0) return "";
      // "info", so an engineer never talks over a flag, a penalty or the lights
      // (js/game.js ANN_PRI) — EXCEPT the pit call, which is not a report but an
      // instruction with a lap to act on it, and rides "box" (rank 4) with the
      // pit-lane messages it belongs to. At "info" it lost to "PIT ENTRY —
      // LIMITER ON": the confirmation you had pitted outranked the call to pit.
      // announce() reports back whether the line will actually be heard — a
      // cinematic camera drops "info", and a queue slot can be pushed off the
      // end by higher priorities.
      if (!G.announce(msg, 2.2, BOX_CALLS.indexOf(key) >= 0 ? "box" : "info")) return "";
      // A wear step is only CONSUMED when it is actually said, so a threshold
      // crossed while the banner was busy is still waiting on the next tick
      // rather than silently spent.
      if (key.indexOf("wear") === 0) b.step = s.step;
      if (key === "undercut") b.undercut = null;
      b.t = QUIET_S; b.said[key] = REPEAT_S;
      return msg;
    }

    return { update, reset, callFor, senseOf };
  }

  return { create, WEAR_STEPS, AXLE_SPLIT, GRAIN_CALL, BLISTER_CALL, COLD_CALL, QUIET_S, REPEAT_S, DIRECTIONAL, BOX_CALLS };
})();
Object.freeze(RaceEngineer);
