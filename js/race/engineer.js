var RaceEngineer = (function () {
  "use strict";

  const clamp = M4.clamp;

  const WEAR_STEPS = [0.5, 0.75, 0.9, 1.0];
  const AXLE_SPLIT = 0.30;
  const AXLE_MIN_WEAR = 0.5;
  const GRAIN_CALL = 0.35, BLISTER_CALL = 0.20;
  const COLD_CALL = 12;
  const OUTLAP_LAPS = 1.5;
  const QUIET_S = 9;
  const EST_S = 0.25;
  const DIRECTIONAL = ["enter", "keep", "square", "stop", "merge"];
  const BOX_CALLS = ["plan0", "plan1", "tread", "compound"];
  const PUSH_SPARE = 3, PUSH_GAP_S = 1.5, THREAT_REACH = 3;

  function create(G) {
    Log.info("race", "RaceEngineer.create");

    function bag(c) {
      let b = c._eng;
      if (!b) b = c._eng = { t: 0, said: {}, step: -1, set: c.tyreStints || 0, cEp: 0, cLvl: 0 };
      if (b.set !== (c.tyreStints || 0)) {
        b.set = c.tyreStints || 0; b.step = -1; b.said = {};
      }
      return b;
    }

    function stateOf(key, s, b) {
      switch (key) {
        case "tread": return (s.wet ? "w" : "d") + s.lap;
        case "caution": return "c" + b.cEp;
        case "undercut": return s.rivalBoxed;
        case "threat": return s.threat;
        case "rain": case "rainplan": return lapBucket(s.rainInLaps);
        case "heavy": return lapBucket(s.heavyInLaps);
        case "drying": return lapBucket(s.dryInLaps);
        case "easing": return lapBucket(s.easeInLaps);
        case "here": return s.hereAt;
        case "where": return s.rainWhere;
        case "plan0": case "plan1": return s.lap + ":" + s.nextCode;
        case "gone": return s.lap;
        case "manage": return s.stintLeft;
        case "push": return s.ahead;
        case "gust": return s.gust;
        default: return "";
      }
    }

    function lapBucket(n) { return n == null ? "" : n >= 3 ? "far" : String(n); }

    function reset(c) { if (c) c._eng = null; if (c && c.local && typeof Forecast !== "undefined") Forecast.publish(null); }

    const WET = ["wet", "rain", "storm"];
    const TREAD_WORD = ["SLICKS", "INTERS", "WETS"];
    const HERE_S = 45, FC_S = 0.5;
    const NO_FC = Object.freeze({});
    const FALLBACK_MPS = 45;

    function ladder(s, take) {
      if (!s) return;
      if (s.wrongTread && take(s.wet ? (s.hereAt != null ? "RAIN IS HERE — BOX FOR " : "RAIN — BOX FOR ") + (s.wantTread === 1 ? "INTERS" : "WETS")
        : "TRACK IS DRY — BOX FOR SLICKS", "tread")) return;
      if (s.oneCompound && take("ONE COMPOUND ONLY — BOX FOR A DIFFERENT TYRE OR BE DISQUALIFIED", "compound")) return;
      if (s.cheapStop && take(s.pitLoss != null ? "CAUTION — CHEAPER STOP, ABOUT " + Math.round(s.pitLoss) + "s LOST"
        : "CAUTION — CHEAPER STOP — CONSIDER BOXING", "caution")) return;
      if (s.rivalBoxed && take(s.rivalBoxed + " HAS BOXED — UNDERCUT ON, BOX NOW OR PUSH 2 LAPS", "undercut")) return;
      if (s.threat && take(s.threat + " CAN UNDERCUT — BOX NEXT LAP TO COVER", "threat")) return;
      if (s.rainWhere && take("RAIN IN SECTOR " + s.rainWhere + (s.wantTread > 0 ? " — " + TREAD_WORD[s.wantTread] + " FOR THE LAP" : " — REST OF THE LAP IS DRY, STAY OUT"), "where")) return;
      if (s.rainInLaps != null) {
        if (s.lapsToStop != null && s.rainInLaps <= s.lapsToStop) {
          if (take("RAIN BEFORE THE STOP — BOX LAP " + (s.fc && s.fc.rain && s.fc.rain.lap != null ? Math.max(s.fc.rain.lap, (s.lap || 0) + 1) : (s.lap || 0) + s.rainInLaps) + " FOR "
            + (s.fc && s.fc.rain ? TREAD_WORD[s.fc.rain.tread] : "WETS") + fcTail(s, "rain"), "rainplan")) return;
        } else if (take("RAIN IN " + s.rainInLaps + (s.rainInLaps === 1 ? " LAP" : " LAPS") + fcTail(s, "rain") + " — BE READY", "rain")) return;
      }
      if (s.heavyInLaps != null && take("HEAVY RAIN IN ~" + s.heavyInLaps + (s.heavyInLaps === 1 ? " LAP" : " LAPS") + fcTail(s, "heavy") + " — FULL WETS NEXT", "heavy")) return;
      if (s.easeInLaps != null && take("RAIN EASING — INTERS IN ~" + s.easeInLaps + (s.easeInLaps === 1 ? " LAP" : " LAPS") + fcTail(s, "easing"), "easing")) return;
      if (s.dryInLaps != null && take("IT'S DRYING — SLICKS IN ~" + s.dryInLaps + (s.dryInLaps === 1 ? " LAP" : " LAPS") + fcTail(s, "drying"), "drying")) return;
      if (s.hereAt != null && !s.wrongTread && !s.noStop && take("RAIN IS HERE — " + (s.wantTread > 0 ? TREAD_WORD[s.wantTread] + " ARE RIGHT, " : "") + "KEEP IT ON THE ROAD", "here")) return;
      if (s.blistering >= BLISTER_CALL && take("BLISTERS — THAT SET IS DONE", "blister")) return;
      if (s.wear >= 1 && !s.noStop && take("TYRES ARE GONE — BOX WHEN YOU CAN", "gone")) return;
      if (s.lapsToStop === 0 && take("BOX BOX BOX" + (s.nextCode ? " — " + s.nextCode : ""), "plan0")) return;
      if (s.lapsToStop === 1 && take("BOX NEXT LAP" + (s.nextCode ? " — " + s.nextCode : "")
        + (s.rejoin === "" ? " — CLEAR AIR" : s.rejoin ? " — REJOIN BEHIND " + s.rejoin : ""), "plan1")) return;
      if (s.graining >= GRAIN_CALL && take("GRAINING — EASE OFF AND CLEAN THEM UP", "grain")) return;
      if (s.outLap && !s.finalLap && s.belowWindow >= COLD_CALL && take("TYRES ARE COLD — TAKE A LAP", "cold")) return;
      if (s.axle >= AXLE_SPLIT && (s.front ? take("FRONTS ARE GOING — BRAKE EARLIER", "axleF")
                                           : take("REARS ARE GOING — EASE ON THE THROTTLE", "axleR"))) return;
      if (s.planned && s.setLaps != null && s.stintLeft != null && s.stintLeft >= 2 && s.setLaps + 0.5 < s.stintLeft && s.lapsToStop == null
        && take("MANAGE THE TYRES — " + s.stintLeft + " LAPS TO THE FLAG ON THAT SET", "manage")) return;
      if (s.planned && s.setLaps != null && s.stintLeft != null && s.setLaps >= s.stintLeft + PUSH_SPARE && s.ahead
        && take("TYRES ARE GOOD — PUSH, " + s.ahead + " IS " + s.aheadGap.toFixed(1) + "s AHEAD", "push")) return;
      if (s.gust != null) {
        const display = typeof AppearanceOpts !== "undefined" && typeof AppearanceOpts.speed === "function" && typeof AppearanceOpts.unitLabel === "function";
        const speed = display ? AppearanceOpts.speed(s.gustKmh) : s.gustKmh;
        const unit = display ? AppearanceOpts.unitLabel() : "KM/H";
        if (take("GUSTY OUT THERE — " + speed + " " + unit + ", CAREFUL ON THE BRAKES", "gust")) return;
      }
      if (s.step >= 0) take("TYRES AT " + Math.round((1 - WEAR_STEPS[s.step]) * 100) + "%", "wear" + s.step);
    }

    function fcTail(s, kind) {
      const f = s.fc && s.fc[kind];
      if (!f) return "";
      const t = f.in < 90 ? "~" + Math.max(10, Math.round(f.in / 10) * 10) + "s" : "~" + (f.in < 300 ? Math.round(f.in / 30) / 2 : Math.round(f.in / 60)) + " MIN";
      const heavy = kind === "rain" && s.rainInLaps >= 2 && s.fc.heavy && s.fc.heavy.lap != null
        ? ", " + (s.fc.heavy.what === "heavy rain/storm" ? "STORM" : "HEAVY") + " BY LAP " + s.fc.heavy.lap : "";
      return " (" + t + ", " + Math.round(f.confidence * 100) + "%" + heavy + ")";
    }

    let _first = null;
    function takeFirst(msg, key) { _first = [msg, key]; return true; }
    function callFor(s) {
      _first = null;
      ladder(s, takeFirst);
      const r = _first; _first = null;
      return r || "";
    }

    function senseOf(c) { return senseInto(c, {}, 0); }
    const _sense = {};
    function anyFlagged(cars) {
      for (let i = 0; i < cars.length; i++) { const o = cars[i]; if (o.finished && !o.retired) return true; }
      return false;
    }
    function senseInto(c, out, dt) {
      const tyres = G.tyres;
      if (!tyres || !tyres.on() || !c || !c.tyre || c.retired || c.finished) return null;
      const cars = G.cars, lapsTarget = G.lapsTarget, pits = G.pits;
      const b = bag(c);
      const wear = tyres.spent(c);
      let step = -1;
      for (let i = WEAR_STEPS.length - 1; i >= 0; i--) {
        if (wear >= WEAR_STEPS[i] && i > b.step) { step = i; break; }
      }
      const ax = tyres.axleSplit(c);
      const belowWindow = tyres.belowWindow(c);
      const wantTread = TyreModel.treadFor(G.raceWeather, G.trackWetness ? G.trackWetness() : undefined);
      const cautionLvl = G.cautionLevel ? G.cautionLevel() : 0;
      let pit;
      if (dt > 0 && b.estT > 0 && "est" in b) { b.estT -= dt; pit = b.est; }
      else { pit = pits && pits.estimate(c); b.est = pit; b.estT = EST_S; }
      const armed = !!c.pitArmed || (c.pitState && c.pitState !== "none");
      const finalLap = (lapsTarget > 0 && (c.lap || 0) >= lapsTarget) || (!!cars && anyFlagged(cars));
      const noStop = armed || finalLap;
      if (armed) b.undercut = null;
      const arc = G.weatherArc;
      const lapS = c.lastLap > 0 ? c.lastLap : 0;
      let wetAt = 1;
      if (arc && arc.seq) {
        for (let i = 0; i < arc.seq.length; i++) { if (WET.indexOf(arc.seq[i]) >= 0) { wetAt = i / arc.seq.length; break; } }
      }
      const rainT = arc ? (Number.isFinite(arc.wetIn) ? arc.wetIn : arc.cell ? 0 : arc.dur * wetAt) : 0;
      const left = arc ? Math.max(0, rainT - arc.t) : 0;
      const lapF = lapS > 0 ? lapS : (G.track && G.track.total > 0 ? G.track.total / FALLBACK_MPS : 0);
      const fc = forecastFor(c, b, arc, lapF, rainT, dt);
      const plan = c.pitPlan, done = c.pitStops || 0;
      const nextAt = plan ? plan.lapsAt[done] : null;
      const nextCls = plan ? plan.seq[done + 1] : null;
      const calling = nextCls != null && nextAt != null && nextAt - (c.lap || 0) <= 1;
      const nextCode = !calling ? null : pits && pits.nextCode ? pits.nextCode(c) || null
        : TyreModel.AI_CLASS[nextCls] ? TyreModel.AI_CLASS[nextCls].code : null;
      let rivalBoxed = null;
      if (!b.stops) b.stops = new Map();
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
          const gap = (c.prog - o.prog) / Math.max(1, c.speed || 1);
          if (gap > 0 && gap < pit.lossS + 2) b.undercut = { code: o.code || "RIVAL", left: lapS || 90 };
        }
        b.stops.set(o, now);
      }
      if (b.undercut && !noStop) rivalBoxed = b.undercut.code;
      out.wear = wear; out.step = step;
      out.lap = c.lap || 0;
      out.lapsToStop = lapsToStop;
      out.nextCode = nextCode; out.rivalBoxed = rivalBoxed;
      out.threat = rivalBoxed || noStop ? null : threat;
      out.rejoin = rejoin; out.planned = !!plan;
      out.ahead = noStop ? null : ahead; out.aheadGap = ahead ? aheadGap : null;
      out.setLaps = tyres.lapsLeft ? tyres.lapsLeft(c) : null;
      out.stintLeft = noStop ? null : lapsToStop != null ? lapsToStop : Math.max(0, (lapsTarget || 0) - Math.max(1, lap) + 1);
      out.marginS = pit ? pit.marginS : null;
      out.axle = wear >= AXLE_MIN_WEAR && c.tyreWearF != null ? Math.abs(c.tyreWearF - c.tyreWearR) / wear : 0;
      out.front = c.tyreWearF != null ? c.tyreWearF > c.tyreWearR : ax.f < ax.r;
      out.graining = c.tyreGrain || 0;
      out.blistering = c.tyreBlister || 0;
      out.belowWindow = belowWindow;
      out.outLap = (c.lap || 0) - (c.tyreLap0 || 0) <= OUTLAP_LAPS;
      out.wrongTread = !noStop && (c.tyre.tread || 0) !== wantTread;
      out.oneCompound = !noStop && !!(pits && pits.compoundDue && pits.compoundDue(c));
      out.pitLoss = pit ? pit.lossS : null;
      const stopDue = lapsToStop != null
        || (out.setLaps != null && lapsTarget > 0 && out.setLaps + 0.5 < lapsTarget - Math.max(1, lap) + 1);
      out.cheapStop = !noStop && stopDue && cautionLvl >= 2 && cautionLvl < 4 && wear >= 0.35;
      out.wet = wantTread > 0;
      out.noStop = noStop; out.finalLap = finalLap;
      const byKind = (fc && b.fcKinds) || NO_FC;
      out.fc = byKind;
      out.wantTread = wantTread;
      if (b.fcArc !== arc) { b.fcArc = arc; b.fcMin = {}; }
      const tread = c.tyre.tread || 0;
      out.rainInLaps = !noStop && arc && WET.indexOf(arc.to) >= 0 && left > 0
        ? (byKind.rain ? latchLaps(b, "rain", byKind.rain, lapF) : lapS > 0 ? Math.max(1, Math.round(left / lapS)) : null) : null;
      out.heavyInLaps = !noStop && tread === 1 && !byKind.rain && byKind.heavy ? latchLaps(b, "heavy", byKind.heavy, lapF) : null;
      out.easeInLaps = !noStop && tread >= 2 && byKind.easing ? latchLaps(b, "easing", byKind.easing, lapF) : null;
      out.dryInLaps = !noStop && tread >= 1 && !byKind.easing && byKind.drying ? latchLaps(b, "drying", byKind.drying, lapF) : null;
      out.rainWhere = arc && arc.cell && fc ? b.where || null : null;
      out.gust = typeof Wind !== "undefined" ? Wind.gustCall() : null;
      out.gustKmh = out.gust != null ? Wind.state().kmh : null;
      out.hereAt = arc && wantTread > 0 && Number.isFinite(arc.wetIn) && arc.wetIn > 0 && arc.t - arc.wetIn <= HERE_S
        ? Math.round(arc.wetIn) : null;
      return out;
    }

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
      const where = arc.cell && Array.isArray(arc.where) ? arc.where.slice() : null;
      b.where = where && where.length ? where.join(" & ") : null;
      b.fc = Forecast.compute({ arc, raceT: G.raceT, lapS: lapF, lap: c.lap || 0, lapPos, seed, rainAt: rainT, where, wetNow: G.trackWetness ? G.trackWetness() : undefined });
      b.fcT = FC_S; b.fcFor = arc;
      const k = b.fcKinds = {};
      if (b.fc) for (let i = 0; i < b.fc.events.length; i++) k[b.fc.events[i].kind] = b.fc.events[i];
      if (c.local) Forecast.publish(b.fc);
      return b.fc;
    }
    function latchLaps(b, k, e, lapF) {
      if (!(lapF > 0)) return null;
      const n = Math.max(1, Math.round(e.in / lapF)), m = b.fcMin[k];
      return (b.fcMin[k] = m != null && m < n ? m : n);
    }
    function forecast() { return typeof Forecast !== "undefined" && Forecast ? Forecast.current() : null; }

    let _ub = null, _us = null, _um = "", _uk = "";
    function takeUnsaid(msg, key) {
      if (_ub.t > 0 && BOX_CALLS.indexOf(key) < 0) return false;
      if (_ub.said[key] === String(stateOf(key, _us, _ub))) return false;
      _um = msg; _uk = key;
      return true;
    }
    function stopOpen(c) {
      return !c.pitArmed && (!c.pitState || c.pitState === "none") && !c.finished && !c.retired;
    }

    function update(c, dt) {
      if (!c || !c.local || !(dt > 0) || G.paused) return "";
      const s = senseInto(c, _sense, dt);
      if (!s) return "";
      const b = bag(c);
      b.t = Math.max(0, b.t - dt);
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
      let still;
      if (BOX_CALLS.indexOf(key) >= 0 || key === "rain" || key === "rainplan" || key === "undercut" || key === "drying" || key === "easing" || key === "heavy") {
        const lap = key === "plan1" ? c.lap : -1;
        still = () => stopOpen(c) && (lap < 0 || c.lap === lap);
      }
      if (!G.announce(msg, 2.2, BOX_CALLS.indexOf(key) >= 0 ? "box" : "info", still)) return "";
      if (key.indexOf("wear") === 0) b.step = s.step;
      if (key === "undercut") b.undercut = null;
      b.t = QUIET_S; b.said[key] = sig;
      return msg;
    }

    return { update, reset, callFor, senseOf, forecast };
  }

  return { create, WEAR_STEPS, AXLE_SPLIT, COLD_CALL, QUIET_S, DIRECTIONAL, BOX_CALLS };
})();
Object.freeze(RaceEngineer);
