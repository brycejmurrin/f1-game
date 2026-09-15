/* Measured stint/energy advice, unscored drills and ordered race explanations. */
"use strict";
const RaceInsights = (function () {
  const DRILLS = Object.freeze({ free: "Free practice", sector: "Finish this sector cleanly",
    braking: "Brake to a controlled stop", trail: "Release the brake into a turn", slalom: "Six clean direction changes" });
  // A drill judges what the CAR did, never the stick. Lateral acceleration says
  // the car changed direction: a pad deflection of 0.35 reads 0.11 after the
  // steer expo, so the old stick thresholds silently failed every analog driver
  // (measured on monza: 7.2 m/s² of lateral accel at 0.11 of command). A stop
  // counts only when the brake did the slowing: a tap followed by a 10 s coast
  // used to pass as a controlled stop and bank mastery.
  const TURN_ACCEL = 3;        // m/s² (~0.3 g): the car is cornering, not twitching
  const FIRM_BRAKE = 0.5;      // pedal travel that counts as firm braking
  const HELD_FRACTION = 0.8;   // share of the slowing samples that must carry a firm brake
  const boundedPush = (a, v, n) => { a.push(v); if (a.length > n) a.shift(); };
  function create(G) {
    let previous = null, events = [], sequence = 0, laps = [], sector = null, energy = [[], [], []];
    let tyreStart = null, drill = null, lastDrill = null, distance = 0, lapClean = false, weather = null;
    function event(kind, text) {
      boundedPush(events, { seq: ++sequence, time: G.raceT || 0, lap: G.player ? G.player.lap : 0, kind, text }, 128);
    }
    function reset() { previous = sector = tyreStart = drill = lastDrill = null; events = []; sequence = distance = 0; lapClean = false; weather = null; laps = []; energy = [[], [], []]; }
    function startDrill(mode) {
      if (!Object.hasOwn(DRILLS, mode)) mode = "free";
      const c = G.player;
      if (!c) return false;
      if (["braking", "trail"].includes(mode) && Math.abs(c.speed) < G.vTop() * .3) {
        G.announce("BUILD SPEED BEFORE SETTING THIS DRILL", 2, "info"); return false;
      }
      previous = sector = tyreStart = null; laps = []; energy = [[], [], []]; lapClean = false;
      drill = { mode, time: G.raceT, sector: G.sectorIdx, startProg: c.prog, speed: Math.abs(c.speed),
        changes: 0, side: 0, brakeSeen: false, brakeProg: c.prog, slowing: 0, held: 0, turnSeen: false, clean: true, reason: "", done: false };
      event("practice", DRILLS[mode] + " — unscored");
      return true;
    }
    // The first failure is the one the driver needs to hear; later ones follow from it.
    function failDrill(reason) { if (drill && !drill.done && drill.clean) { drill.clean = false; drill.reason = reason; } }
    function finishDrill(current) {
      drill.done = true;
      const seconds = Math.max(0, G.raceT - drill.time), stop = Math.max(0, current.prog - drill.brakeProg);
      // Braking is scored by stopping distance from the first firm brake (from a
      // restored checkpoint the entry speed repeats, so it compares); the rest by time.
      const score = drill.mode === "braking" ? stop : seconds;
      const text = drill.mode === "braking" ? "stopped " + stop.toFixed(0) + " m after braking"
        : drill.mode === "slalom" ? seconds.toFixed(1) + "s · " + drill.changes + " direction changes" : seconds.toFixed(1) + "s";
      lastDrill = { mode: drill.mode, seconds, clean: drill.clean, changes: drill.changes, reason: drill.reason, score, text };
      let improved = false;
      if (drill.clean && drill.mode !== "free") {
        // Mastery is separate from lap records and never awards career currency.
        const raw = G.store.get("circuitMastery", null);
        const entries = raw && raw.version === 1 && Array.isArray(raw.entries) ? raw.entries.filter(e => e && typeof e.key === "string").slice(-63) : [];
        const key = G.records.key() + ":" + drill.mode + ":" + (drill.mode === "sector" ? drill.sector : "all");
        const found = entries.find(e => e.key === key);
        improved = !!(found && Number.isFinite(found.best) && score < found.best);
        const best = found && Number.isFinite(found.best) ? Math.min(found.best, score) : score;
        G.store.set("circuitMastery", { version: 1, entries: entries.filter(e => e.key !== key).concat({ key, best, completed: Math.min(9999, (found && Number.isFinite(found.completed) ? Math.max(0, Math.floor(found.completed)) : 0) + 1) }) });
      }
      event("practice", (drill.clean ? "Completed: " : "Retry suggested: ") + DRILLS[drill.mode] + " · " + (drill.clean ? text : drill.reason));
      // The verdict goes on screen where the drive happened, not only in the pause menu.
      G.announce(drill.clean ? "PRACTICE DONE — " + text.toUpperCase() + (improved ? " · NEW BEST" : "")
        : "PRACTICE — TRY AGAIN: " + drill.reason.toUpperCase(), 3, "info");
    }
    function observeDrill(c, current) {
      if (!drill || drill.done) return;
      if (current.contact) failDrill("car contact");
      if (current.off) failDrill("left the track");
      if (current.retired) failDrill("car retired");
      const v = Math.abs(c.speed), brake = c.brakeDemand || 0, lat = c.lateralAccel || 0;
      const turning = Math.abs(lat) > TURN_ACCEL, moving = v > G.vTop() * .15;
      if (brake > FIRM_BRAKE && v > 1 && !drill.brakeSeen) { drill.brakeSeen = true; drill.brakeProg = current.prog; }
      if (drill.brakeSeen && v > 1) { drill.slowing++; if (brake > FIRM_BRAKE) drill.held++; }
      if (drill.brakeSeen && brake > .05 && turning) drill.turnSeen = true;
      if (turning && moving) { const side = Math.sign(lat); if (drill.side && side !== drill.side) drill.changes++; drill.side = side; }
      if (drill.mode === "sector") {
        if (current.sector !== drill.sector && current.prog - drill.startProg > 10) finishDrill(current);
      } else if (drill.mode === "braking") {
        if (v < 1) {
          if (!drill.brakeSeen) failDrill("stopped without firm braking");
          else if (drill.held < HELD_FRACTION * drill.slowing) failDrill("brake released before the stop");
          finishDrill(current);
        }
      } else if (drill.mode === "trail") {
        if (drill.turnSeen && brake < .05 && turning && moving) finishDrill(current);
        else if (v < 1) { failDrill("stopped before releasing the brake"); finishDrill(current); }
      } else if (drill.mode === "slalom" && drill.changes >= 6) finishDrill(current);
    }
    function update(c) {
      if (!c || !G.track || G.state !== "race") return;
      const now = G.raceT, current = { time: now, prog: c.prog, lap: c.lap, sector: G.sectorIdx,
        energy: c.energy, wear: c.tyreWear || 0, stint: c.tyreStints || 0, tyre: c.tyre && c.tyre.id,
        penalty: c.penalty || 0, warnings: c.cutWarn || 0, invalid: !!c.incidentInvalidLap,
        pit: !c.pitState || c.pitState === "none" ? "track" : c.pitState, contact: (c.contactT || 0) > 0, off: !!c.offroad, retired: !!c.retired };
      if (previous && (now < previous.time || current.prog < previous.prog - 10)) { previous = null; sector = tyreStart = null; laps = []; energy = [[], [], []]; lapClean = false; failDrill("position jumped"); }
      if (!previous) {
        previous = current; tyreStart = current; sector = { ...current, valid: false };
        // The first sample cannot measure a sector, but its inputs and contact
        // still belong to the attempt; discarding it could award dirty mastery.
        observeDrill(c, current); return;
      }
      const wet = G.roadWetness ? G.roadWetness() : 0;
      if (weather != null && Math.abs(wet - weather) > .05) { laps = []; energy = [[], [], []]; sector.valid = false; weather = wet; }
      if (weather == null) weather = wet;
      const dt = now - previous.time, ds = current.prog - previous.prog;
      if (dt <= 0) return;
      if (ds >= 0 && ds <= Math.max(20, Math.abs(c.speed) * dt * 2)) distance += ds;
      else { sector.valid = false; lapClean = false; tyreStart = current; failDrill("position jumped"); }
      if (current.penalty > previous.penalty) event("penalty", "+" + (current.penalty - previous.penalty) + "s time penalty");
      if (current.warnings > previous.warnings) event("limits", "Track-limits warning " + current.warnings);
      if (current.invalid && !previous.invalid) event("invalid", "Lap invalidated by an incident or practice reset");
      if (current.contact && !previous.contact) event("contact", "Car contact");
      if (current.off && !previous.off) event("surface", "Left the track");
      if (current.retired && !previous.retired) event("retirement", "Car retired");
      if (current.pit !== previous.pit) event("pit", "Pit phase: " + current.pit);
      if (current.tyre !== previous.tyre || current.stint !== previous.stint || current.wear < previous.wear) {
        tyreStart = current; laps = []; event("tyres", "New stint: " + (current.tyre || "unknown compound"));
      }
      if (current.contact || current.off || current.invalid || current.pit !== "track") { sector.valid = false; lapClean = false; }
      if (current.sector !== previous.sector) {
        if (current.sector === (previous.sector + 1) % 3 && sector.valid && ds > 0 && now - sector.time > 1 && Number.isFinite(current.energy) && Number.isFinite(sector.energy))
          boundedPush(energy[previous.sector], { seconds: now - sector.time, used: sector.energy - current.energy }, 6);
        sector = { ...current, valid: !current.invalid && !current.off && !current.contact && current.pit === "track" };
      }
      if (current.lap > previous.lap) {
        if (lapClean && c.lastLap > 0) boundedPush(laps, { seconds: c.lastLap, wear: current.wear, stint: current.stint }, 12);
        lapClean = !current.invalid && !current.off && current.pit === "track";
      }
      observeDrill(c, current);
      previous = current;
    }
    function forecast() {
      const c = G.player, total = G.track && G.track.total;
      if (!c || !(total > 0)) return null;
      const observed = tyreStart ? (c.prog - tyreStart.prog) / total : 0;
      const wearOn = G.tyres && G.tyres.on();
      const wearRate = wearOn && observed >= .5 ? ((c.tyreWear || 0) - tyreStart.wear) / observed : null;
      const lapsLeft = Math.max(0, G.lapsTarget - (c.prog / total));
      const remaining = wearRate > 0 ? Math.max(0, (1 - (c.tyreWear || 0)) / wearRate) : null;
      const estimate = G.pits && G.pits.estimate(c);
      // Fit degradation from completed laps of this stint, never from a guessed compound offset.
      const same = laps.filter(l => l.stint === (c.tyreStints || 0)), first = same[0], last = same[same.length - 1];
      const degradation = wearOn && same.length >= 3 && last.wear - first.wear > .01
        ? Math.max(0, (last.seconds - first.seconds) / (last.wear - first.wear)) : null;
      const saving = degradation == null ? null : degradation * (c.tyreWear || 0);
      const sectorForecast = energy.map(a => a.length ? { samples: a.length, used: a.reduce((s,v)=>s+v.used,0)/a.length,
        spread: Math.max(...a.map(v=>v.used))-Math.min(...a.map(v=>v.used)) } : null);
      const lapUse = sectorForecast.every(Boolean) ? sectorForecast.reduce((s,v)=>s+v.used,0) : null;
      return { observedLaps: Math.max(0, observed), remainingLaps: remaining, lapsLeft,
        reachesFinish: remaining == null ? null : remaining >= lapsLeft,
        pitLossS: estimate ? estimate.lossS : null, freshTyreGainS: saving,
        paybackLaps: saving > .05 && estimate ? estimate.lossS / saving : null,
        sectors: sectorForecast, energyPerLap: lapUse,
        energyLaps: lapUse > .001 ? Math.max(0, c.energy / lapUse) : null,
        confidence: same.length >= 5 && observed >= 2 ? "moderate" : "low" };
    }
    function network() {
      const n = G.netPlay && G.netPlay.status ? G.netPlay.status() : null;
      if (!n) return null;
      if (!n.active) return n.reason ? { text: "Disconnected — return to the lobby to reconnect", connected: false } : null;
      const timing = (n.remotes || []).map(r=>r.timing).filter(Boolean);
      const delay = timing.length ? Math.max(...timing.map(t=>t.delayMs || 0)) : null;
      const rtt = n.net && n.net.rtt;
      return { connected: !!(n.net && n.net.alive), rttMs: rtt, delayMs: delay,
        text: n.net && !n.net.alive ? "Connection lost — return to the lobby" : "Online" + (Number.isFinite(rtt) ? " · RTT " + Math.round(rtt) + "ms" : "") + (delay == null ? "" : " · buffer " + Math.round(delay) + "ms") };
    }
    function summary() { return { distance, drill: drill ? { mode: drill.mode, done: drill.done, clean: drill.clean, changes: drill.changes, reason: drill.reason } : null, lastDrill: lastDrill ? { ...lastDrill } : null }; }
    return { update, reset, event, startDrill, forecast, network, summary, journal: () => events.map(e=>({...e})) };
  }
  return Object.freeze({ create, DRILLS });
})();
Object.freeze(RaceInsights);
