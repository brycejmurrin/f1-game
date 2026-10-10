/* Apex 26 — RACE CONTROL (RaceControl.create(G)) The flag state: green / local yellow / VSC / safety car, and the one rule that reads off it (whether OVERTAKE is … */
const RaceControl = (function () {
  "use strict";

  // Result countdown policy. A winner crossing the line is not permission to
  // remove a human who is still racing: single-player AI can finish first, and
  // multiplayer humans can be separated by much more than 3.5 seconds. The
  // hard cap remains the bounded escape hatch for an unfinished/stale human.
  // AI-only harnesses retain the old "shortly after the winner" behaviour.
  // `raceT0`: where the clock started — a Data Hub JUMP IN seeds it to the real
  // race's time at the lap you join, which alone could pass the cap at once.
  function finishDelay(cars, raceT, lapsTarget, raceT0) {
    const ran = raceT - (raceT0 > 0 ? raceT0 : 0);
    let anyHuman = false, allHumansDone = true, anyFinished = false, running = false, pend = 0;
    for (const c of cars || []) {
      if (!c) continue;
      if (c.finished) { anyFinished = true; if (!c.retired) pend = Math.max(pend, (c.finishT || 0) + (c.penalty || 0)); }
      else if (!c.retired) running = true;
      if (!c.human) continue;
      anyHuman = true;
      if (!c.finished && !c.retired) allHumansDone = false;
    }
    // A time penalty is served on the CLOCK (classification sorts finishers by
    // finishT + penalty, game.js endRace), so a finisher carrying one is not
    // settled until every car still on track has had that long to cross.
    // Without this the 2.2 s countdown ran from the player's crossing, and a
    // rival 3 s back with a +5 s penalty against it was filed as "still
    // running" — behind, on a result it had won. Bounded by the penalty
    // itself; the hard cap below still wins.
    if (running && raceT < pend && ran <= 360 * lapsTarget) return 0;
    if (anyHuman && allHumansDone) return 2.2;
    if (!anyHuman && anyFinished) return 3.5;
    if (ran > 360 * lapsTarget) return 0.1;
    return 0;
  }

  // THE CHEQUERED FLAG IS OUT once any classified car has taken it: every
  // other car finishes at its NEXT line crossing (a lapped car does not drive
  // the leader's distance), and classification is laps completed, then time.
  function flagOut(cars, at = Infinity) {
    for (const c of cars || []) if (c && c.finished && !c.retired && (c.finishT || 0) <= at) return true;
    return false;
  }

  // Motion owners integrate independently, but the flag follows the CLOCK,
  // never roster order. Keep lap clocks immediate; settle finishes and their
  // presentation after every owner has reported its crossings for this step.
  let lineCars = null;
  const lineEntries = [];
  function beginLineStep(cars) { lineCars = cars; lineEntries.length = 0; }
  function settleLine(e) {
    const { c, cross, time, target, cars } = e;
    cross.flagged = target > 0 && (c.lap > target || (c.lap > 1 && flagOut(cars, time)));
    if (cross.flagged) { c.finished = true; c.finishT = time; }
  }
  function deferLine(c, cross, newS, callback) {
    if (!lineCars || !cross || cross.direction < 0) return false;
    const e = lineEntries.find((e) => e.cross === cross);
    if (!e) return false;
    e.callback = callback; e.newS = newS;
    return true;
  }
  // At an exact tie the full-distance crossing raises the flag first. Module scope:
  // settleLineStep runs twice per physics step, almost always with no entries, and
  // an inline arrow allocated a closure each time.
  const byCrossing = (a, b) => (a.time - b.time) || ((b.c.lap > b.target) - (a.c.lap > a.target));
  function settleLineStep() {
    if (lineEntries.length > 1) lineEntries.sort(byCrossing);
    for (const e of lineEntries) settleLine(e);
  }
  function endLineStep() {
    lineCars = null;
    settleLineStep();
    for (const e of lineEntries) if (e.callback) e.callback(e.c, e.cross, e.newS);
    lineEntries.length = 0;
  }

  // One line-crossing transition for every motion owner. updateCar normally
  // advances a car, but IncidentSim temporarily owns the same (s, lap, clock,
  // finish) state; keeping a smaller copy there lost the chequered-flag rule and
  // the backward undo. Presentation/timing side effects stay with each caller.
  //
  // `dt` (optional) is the step the caller ALREADY added to c.lapTime / raceT
  // before this call (updateCar does). The line falls part-way through that
  // step, at frac = (total - oldS) / ds of it, so the lap and the finish are
  // timed to the crossing and the remainder dt·(1-frac) opens the next lap —
  // up to 16.7 ms per lap otherwise, on the leaderboard and between two cars
  // crossing in the same step. A caller that did not advance the clock this
  // step (IncidentSim's takeover) omits it and gets the step-quantised time.
  function lineTransition(c, oldS, newS, ds, total, lapsTarget, cars, raceT, dt) {
    if (!c || c.finished || !(total > 0)) return null;
    if (ds > 0 && oldS > total * 0.5 && newS < total * 0.5) {
      let over = 0;
      if (dt > 0 && Number.isFinite(dt)) {
        const frac = (total - oldS) / ds;
        if (Number.isFinite(frac)) over = dt * (1 - Math.min(1, Math.max(0, frac)));
      }
      const lapDone = Math.max(0, (c.lapTime || 0) - over);
      // A crossing that follows a backward undo re-crosses a line the lap was
      // ALREADY timed at: the caller must not record it a second time (a Time
      // Trial reverse-and-recross put a lap nobody drove on the leaderboard).
      const recross = !!c._recross;
      c._recross = false;
      c.lap = (c.lap || 0) + 1;
      // A red-flag restart rewinds the classification lap but burns another
      // physical lap. Backward line crossings do not refund fuel either.
      c.fuelLap = Math.max(c.fuelLap || 0, c.lap + (c.fuelRestartLaps || 0));
      c._lapTimeAtLine = lapDone;
      c.lapTime = (c.lapTime || 0) - lapDone;   // the post-line remainder (0 without dt)
      const cross = { direction: 1, changed: true, lapDone, flagged: false, recross };
      const e = { c, cross, target: Number(lapsTarget), cars,
        time: Number.isFinite(raceT) ? Math.max(0, raceT - over) : 0 };
      if (lineCars === cars) lineEntries.push(e);
      else settleLine(e);
      return cross;
    }
    if (ds < 0 && oldS < total * 0.5 && newS > total * 0.5) {
      if (!(c.lap > 0)) return { direction: -1, changed: false, lapDone: null, flagged: false };
      c.lap--;
      c.lapTime = c._lapTimeAtLine != null ? c._lapTimeAtLine : c.lapTime;
      c._recross = true;
      return { direction: -1, changed: true, lapDone: null, flagged: false };
    }
    return null;
  }
  // Classification comparator for finishers: more laps first, then the clock
  // (finishT + penalty). `lap` counts crossings, so it is the same metric for
  // the winner (lapsTarget + 1) and a car flagged a lap down. Non-finite
  // finishT (null / NaN) ranks LAST — raw `null + 0 === 0` put a missing clock
  // first among same-lap finishers; undefined penalty → NaN broke the sort.
  function finishOrder(a, b) {
    const clock = (c) => {
      const t = c && c.finishT;
      return Number.isFinite(t) ? t + (c.penalty || 0) : Infinity;
    };
    return ((b.lap || 0) - (a.lap || 0)) || (clock(a) - clock(b));
  }

  // Classification comparator for cars STILL RUNNING at the flag: progress,
  // with a time penalty served on the road — its seconds at `vRef` (the
  // race's average speed, m/s) come off the car's metres. Without it a
  // running car's +5 s was shown on the sheet and never applied.
  function runOrder(vRef) {
    return (a, b) => (b.prog - (b.penalty || 0) * vRef) - (a.prog - (a.penalty || 0) * vRef);
  }

  // THE CLASSIFICATION ORDER from endRace's three piles: `fin` (flagged, clock
  // order), `run` (running, runOrder), `out` (retired, furthest first).
  // LAPS FIRST (FIA 2026 SR B2.5.5(a)): a car still running when the race ends
  // takes the flag on its next crossing, so it counts one more lap — a lapped
  // car that crossed is not put ahead of a lead-lap car on its last lap. Stable
  // sort: within a lap count, finishers keep the clock order, runners progress.
  // 90 % OF THE WINNER'S LAPS IS CLASSIFIED (B2.5.5(b)), RETIRED OR NOT: a last-lap
  // failure scores where it stopped, and a car still RUNNING below the line
  // (stuck, rescued) is not classified either — it was paid P2 at half
  // distance. c.lap is the lap a car is ON, so a retirement completed lap - 1
  // and a runner completes lap at its flag. With no finisher (the only human
  // retired) the leader on the road is the reference. Sets c.classified for
  // every car (SeasonCal.award, career settlement, the sheet's NC); the
  // unclassified — runners and retirements alike — follow by distance.
  function classify(cars, fin, run, out) {
    const lapsAt = (c) => (c.lap || 0) + (c.finished ? 0 : 1);
    const done = (c) => (c.retired ? (c.lap || 0) - 1 : lapsAt(c) - 1);
    const ref = fin.length ? fin : run;
    const winDone = ref.length ? Math.max(...ref.map((c) => c.lap || 0)) - 1 : 0;
    const cut = Math.floor(0.9 * winDone);
    for (const c of cars) c.classified = !c.dsq && (winDone > 0 ? done(c) >= cut : !c.retired);
    const all = fin.concat(run, out);
    return all.filter((c) => c.classified).sort((a, b) => lapsAt(b) - lapsAt(a))
      .concat(run.concat(out).filter((c) => !c.classified && !c.dsq).sort((a, b) => (b.prog || 0) - (a.prog || 0)));
  }

  // A RACE THAT NEVER SAW THE FLAG (the only human retired, or the time cap):
  // `{ laps, of }` — laps the leader completed of the scheduled distance — for
  // the shortened-race points scale (SeasonCal.payTable); null once any car
  // took the chequered flag, which is a completed race whatever came after.
  function shortRun(cars, lapsTarget) {
    if (!(lapsTarget > 0) || !cars || cars.some((c) => c.finished && !c.retired)) return null;
    const live = cars.filter((c) => !c.retired);
    return { laps: live.length ? Math.max(0, Math.max(...live.map((c) => c.lap || 0)) - 1) : 0, of: lapsTarget };
  }

  const LABEL = ["GREEN", "YELLOW", "VSC", "SAFETY CAR", "RED FLAG"];
  const YELLOW_MIN = 3;    // settled hazards in ONE sector -> local yellow
  const VSC_MIN = 6;       // total settled hazards on the surface -> VSC
  const SC_MIN = 10;       // a big pile -> full safety car
  // RED FLAG: a pile the marshals cannot clear under a safety car. The
  // procedure runs on its own clock — STOPPING (the field halts), HELD, then
  // one restart request game.js consumes (redFlagRestart: surface cleared,
  // field re-gridded in race order, standing restart — the 2026 procedure
  // once the track is clear). Exempt from the SC cap; solo only in v1.
  const RED_MIN = 16;
  const RED_STOP = 8;      // s for the field to come to a halt once red is shown
  const RED_HOLD = 6;      // s the flag holds before the restart is called
  const MIN_HOLD = 6;      // s a caution holds once raised (anti-flicker)
  const YELLOW_MAX = 30;   // s hard cap on a local yellow
  const SC_MAX = 90;       // s hard cap on VSC/SC — bounded, ~a lap or two
  const CAP_REARM_HOLD = 45;  // s of green after a cap-forced drop before the
                              // same stale hazard picture may re-raise a flag
  const QUERY_EVERY = 0.25;   // s — hazards() at ~4 Hz, not per frame

  function blank() {
    return { level: 0, sector: -1, frac: 0, total: 0, sectors: [0, 0, 0], sinceT: 0, cause: "", phase: "" };
  }

  function logFlag(prev, next) {
    if (prev === next) return;
    Log.info("game", "RaceControl flag " + LABEL[prev] + " -> " + LABEL[next]);
  }

  function create(G) {
    Log.info("game", "RaceControl.create");
    const { store } = G;
    let caution = blank();
    let queryT = 0;
    let capHoldT = 0;       // remaining re-arm suppression after a cap-forced drop
    let capHoldLevel = 0;   // the level that capped; escalations ABOVE it still fly
    let restartWanted = false;   // one-shot: the red procedure has run its course
    // OVERTAKE after a neutralisation (Art. B7.2.2c): disabled while the Safety
    // Car is out, re-enabled only once the field has crossed the Line after it
    // comes in — approximated by the LEADER's next crossing. The leader's lap
    // at the hand-back; null = no hold. A red flag rewinds every lap by one at
    // the standing restart (redFlagRestart), so its hold is one lap lower and
    // the first crossing after the resumption re-enables it (B7.2.2b).
    let otHoldLap = null;
    let lowGripNoted = false;   // the "LOW GRIP — OVERTAKE OFF" banner has run this race
    // A SCRIPTED flag (js/race/real-race.js replays a real race's safety-car
    // windows): while `held` is above GREEN the flag flies at least that high
    // regardless of the hazard picture, exempt from the SC cap and the MIN_HOLD
    // drop. Escalations above it (a real pile-up going RED) still fly; releasing
    // it (hold(0)) hands the flag back to the hazard loop, which lowers it at
    // its next query. Never the red flag: that runs its own procedure.
    let held = 0, heldCause = "";
    // Last state broadcast to a guest, so only CHANGES are sent.
    let sent = "";
    const savedCaution = store.get("caution", false);
    let enabled = !(savedCaution === false || savedCaution === 0 || savedCaution === "0");

    function reset() {
      caution = blank();
      held = 0; heldCause = "";
      queryT = 0;
      capHoldT = 0; capHoldLevel = 0;
      restartWanted = false;
      otHoldLap = null;
      lowGripNoted = false;   // update() only runs in a race, so its not-in-race clear never fired: RACE AGAIN in the wet lost the note
      // Clear the change-detector too, or the next race's first flag looks like
      // a repeat of the last one's and is never sent.
      sent = "";
    }

    // Every level change inside the machine goes through here: the log line,
    // and the Overtake hold when a Safety Car (3) or red flag (4) ends.
    function flag(prev, next) {
      logFlag(prev, next);
      if (prev >= 3 && next < 3) {
        const leader = G.ranked && G.ranked[0];
        otHoldLap = leader ? (leader.lap | 0) - (prev === 4 ? 1 : 0) : null;
      }
    }

    // Turning it OFF must also DROP a flag already flying — otherwise the HUD
    // keeps showing a safety car that nothing is maintaining any more.
    function setEnabled(on) {
      enabled = !!on;
      store.set("caution", enabled);
      if (!enabled) reset();
      return enabled;
    }

    function publish() {
      const netPlay = G.netPlay;
      if (!netPlay.active() || !netPlay.ownsRaceControl()) return;
      // total/sectors ride in the payload, so they must be in the change key —
      // an evolving hazard picture at a constant level went un-republished and
      // froze the guest's counts.
      const key = caution.level + "|" + caution.sector + "|" + caution.cause + "|" + caution.phase +
        "|" + caution.total + "|" + (caution.sectors ? caution.sectors.join(",") : "");
      if (key === sent) return;
      sent = key;
      netPlay.reportCaution({
        level: caution.level, sector: caution.sector, frac: caution.frac,
        cause: caution.cause, total: caution.total, sectors: caution.sectors,
        sinceT: caution.sinceT, phase: caution.phase,
      });
    }

    // Reset the live caution fields to GREEN in place (never `caution = blank()`,
    // which would also wipe `total`/`sectors` that callers still need to read).
    function dropToGreen() {
      const prev = caution.level;
      caution.level = 0; caution.sector = -1; caution.frac = 0;
      caution.cause = ""; caution.sinceT = 0; caution.phase = "";
      flag(prev, 0);
    }

    // The hard-cap drop, shared by the live-query path and the debris-inactive
    // freeze path. Returns true when the flag just dropped to GREEN.
    function capDropIfExpired() {
      if (caution.level === 0 || caution.level === 4) return false;   // red runs its own procedure
      const cap = caution.level >= 2 ? SC_MAX : YELLOW_MAX;
      if (caution.sinceT < cap) return false;
      capHoldLevel = caution.level;   // what capped — see the re-raise gate below
      dropToGreen();
      capHoldT = CAP_REARM_HOLD;
      publish();
      return true;
    }

    function update(dt) {
      // State reset BEFORE the ownership gate: a guest's caution mirror comes
      // from host apply(), and returning early here would leave the last flag
      // flown on its HUD after the race ended (reset() is local-only, safe for all).
      // A lone lap has no field to protect: in Time Trial and qualifying the
      // player's OWN cones and shards (hz.total >= 6) raised a VSC whose
      // cautionV held them to 0.6 of vTop, and the CAUTIONS row is hidden there
      // so it could not be switched off. Same reset path as "not racing".
      if (G.state !== "race" || G.timeTrial || G.session === "quali") {
        if (caution.level !== 0 || capHoldT) reset();
        lowGripNoted = false;
        return;
      }
      // The LOW GRIP note, once a race, on every peer (it is read off the
      // shared weather, not the flag): the one place the player is told why the
      // Overtake button went dead in the wet. Retried until the banner takes it.
      if (!lowGripNoted && lowGrip() && typeof G.announce === "function") {
        lowGripNoted = G.announce("LOW GRIP — OVERTAKE OFF", 3, "warning") !== false;
        if (lowGripNoted) Log.info("race", "Overtake disabled why=low-grip raceT=" + (+G.raceT || 0).toFixed(1));
      }
      if (!G.netPlay.ownsRaceControl()) return;
      // A held flag flies whether or not the hazard loop is switched on: the
      // player's CAUTIONS setting governs debris, not a race replayed by script.
      if (held > caution.level && caution.level !== 4) {
        const prev = caution.level;
        caution.level = held; caution.sector = -1; caution.frac = 0;
        caution.cause = heldCause; caution.sinceT = 0; caution.phase = "";
        flag(prev, held);
        publish();
      }
      if (caution.level !== 0) caution.sinceT += dt;
      // A RED FLAG RUNS ITS PROCEDURE WHATEVER THE SWITCH SAYS. The hazard loop
      // can only raise one while enabled, but apply() (a scripted red, a host's)
      // can land one with CAUTIONS off — and a red that never ages never asks
      // for its restart, which held the whole field at 2 % of top speed until
      // the player quit. The switch gates the hazard loop below, not this.
      if (caution.level === 4) {
        // The red procedure: no hazard query, no cap — it ends in exactly ONE
        // restart request. The re-arm hold then keeps the same (not yet
        // cleared) picture from raising a second flag before game.js clears
        // the surface on the restart.
        caution.phase = caution.sinceT < RED_STOP ? "stopping" : "held";
        if (caution.sinceT >= RED_STOP + RED_HOLD) {
          restartWanted = true;
          capHoldLevel = 4; capHoldT = CAP_REARM_HOLD;
          dropToGreen();
        }
        publish();
        return;
      }
      // CAUTIONS off: no hazard loop, but a flag already flying (a host's,
      // applied before the guest took race control back on a disconnect) must
      // still age out at the hard cap, or its safety car stays out forever.
      if (!enabled) {
        if (!(held && caution.level <= held)) capDropIfExpired();
        return;
      }
      if (!DebrisWorld.active()) {
        // Debris inactive mid-flag: the LEVEL freezes (test-asserted — see
        // "debris going inactive mid-race freezes a flying flag") but it keeps
        // AGEING, so the hard cap still fires. Before this, a trapped Rapier
        // world (debrisworld sets _active=false permanently) pinned a safety
        // car — and disabled OVERTAKE — for the rest of the race.
        if (!(held && caution.level <= held)) capDropIfExpired();
        return;
      }
      queryT += dt;
      if (queryT < QUERY_EVERY) return;
      // Subtract, don't zero: resetting to 0 made the real cadence
      // ceil(0.25/dt)·dt and the capHold debit ~6% short at 60/30 fps.
      queryT -= QUERY_EVERY;

      const hz = DebrisWorld.hazards();
      // DebrisWorld proves a RED-worthy picture has at least two source cars.
      // `total` deliberately remains the lower-caution/HUD count: one scraping
      // car can still need a safety car, but cannot cause a standing restart.
      const redTotal = hz.redTotal == null ? hz.total : hz.redTotal;
      let desired = 0, dsector = -1, dfrac = 0, dcause = "";
      if (redTotal >= RED_MIN) { desired = 4; dcause = "RED FLAG"; }
      else if (hz.total >= SC_MIN) { desired = 3; dcause = "SAFETY CAR"; }
      else if (hz.total >= VSC_MIN) { desired = 2; dcause = "VSC"; }
      else if (hz.worst.count >= YELLOW_MIN) {
        desired = 1; dsector = hz.worst.sector; dfrac = hz.worst.frac; dcause = "YELLOW";
      }
      caution.total = hz.total;
      caution.sectors = hz.sectors.slice();
      // v1: a networked race never goes red — the standing restart needs the
      // host to name the moment (netplay hostStart) — it holds a SAFETY CAR.
      if (desired === 4 && G.netPlay.active()) { desired = 3; dcause = "SAFETY CAR"; }

      // The HARD CAP the constants always promised ("a stuck hazard cannot
      // neutralise the race forever"): a flag flown for its full cap drops to
      // GREEN even while the hazard picture persists — marshals have had their
      // window; racing resumes. Without this the cap clause below was dead code
      // (MIN_HOLD < cap made the disjunct unreachable, and lowering only ever
      // ran when the picture had ALREADY cleared), so one never-despawning
      // piece of debris held a safety car for the rest of the race.
      // capHold suppresses an instant re-raise from the SAME stale picture;
      // genuinely new hazards re-arm after it expires.
      if (held && desired < held) { desired = held; dsector = -1; dfrac = 0; dcause = heldCause; }
      if (!(held && caution.level <= held) && capDropIfExpired()) return;
      if (capHoldT > 0) {
        capHoldT = Math.max(0, capHoldT - QUERY_EVERY);
        if (capHoldT === 0) capHoldLevel = 0;
      }

      if (desired > caution.level) {
        // The hold suppresses a re-raise from the SAME stale picture, but must
        // never mask an ESCALATION: debris growing from a local yellow into a
        // safety-car pile has to fly, or the race runs green through a real
        // SC-worthy event for the length of the hold.
        if (capHoldT > 0 && desired <= capHoldLevel && desired !== held) { publish(); return; }
        const prev = caution.level;
        caution.level = desired; caution.sector = dsector; caution.frac = dfrac;
        caution.cause = dcause; caution.sinceT = 0;
        caution.phase = desired === 4 ? "stopping" : "";
        flag(prev, desired);
      } else if (desired < caution.level) {
        if (caution.sinceT >= MIN_HOLD) {
          const prev = caution.level;
          caution.level = desired;
          if (desired !== 1) caution.sector = -1;
          else if (dsector >= 0) caution.sector = dsector;
          else if (hz.worst && hz.worst.sector >= 0) caution.sector = hz.worst.sector;
          else caution.sector = 0;
          caution.frac = dfrac; caution.cause = dcause; caution.sinceT = 0;
          flag(prev, desired);
        }
      } else if (desired === 1 && dsector >= 0) {
        caution.sector = dsector; caution.frac = dfrac;   // track the worst sector
      }
      publish();
    }

    // The host's word, off the wire: every field is coerced, because info()
    // runs sinceT.toFixed() for the HUD every frame and a single CAUTION with
    // `sinceT: "x"` would throw there until LoopHealth killed the loop.
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    function apply(d) {
      if (!d || typeof d !== "object") return false;
      const prev = caution.level;
      caution.level = Math.max(0, Math.min(4, d.level | 0));
      caution.sector = Number.isInteger(d.sector) && d.sector >= -1 ? d.sector : -1;
      caution.frac = num(d.frac);
      caution.cause = typeof d.cause === "string" ? d.cause.slice(0, 64) : "";
      caution.total = Math.max(0, num(d.total));
      if (Array.isArray(d.sectors)) caution.sectors = d.sectors.slice(0, 3).map(num);
      caution.sinceT = Math.max(0, num(d.sinceT));
      caution.phase = typeof d.phase === "string" ? d.phase.slice(0, 16) : "";
      flag(prev, caution.level);
      return true;
    }

    // Fly a flag by script (level 1-3; 0 releases). Returns the held level.
    // Lowering or releasing takes effect NOW: the script's windows are laps,
    // not hazard flicker, so a flag the hold itself raised (level <= the old
    // hold) steps straight down to the new level rather than waiting on the
    // hazard loop — which with debris off, or the switch off, never lowers it.
    function hold(level, cause) {
      const prevHeld = held;
      held = Math.max(0, Math.min(3, level | 0));
      heldCause = held ? (typeof cause === "string" && cause ? cause.slice(0, 64) : LABEL[held]) : "";
      if (held) Log.info("game", "RaceControl hold " + LABEL[held] + " (" + heldCause + ")");
      if (held < caution.level && caution.level <= prevHeld && caution.level < 4) {
        if (held === 0) dropToGreen();
        else {
          const prev = caution.level;
          caution.level = held; caution.sector = -1; caution.frac = 0;
          caution.cause = heldCause; caution.sinceT = 0; caution.phase = "";
          flag(prev, held);
        }
        publish();
      }
      return held;
    }

    // The one-shot restart request at the end of a red-flag procedure.
    function takeRestart() { const r = restartWanted; restartWanted = false; return r; }

    // The re-arm hold exists for the SAME uncleared hazard picture. game.js
    // clears the surface on the very tick it consumes the restart (both the
    // re-grid and the declined path), so it drops the hold there: otherwise
    // capHoldLevel 4 masked every lower level too, and — the countdown never
    // ticking update() — all 45 s of it landed on the green running after the
    // restart, where a lap-1 pile-up got no yellow, VSC or SC.
    function clearHold() { capHoldT = 0; capHoldLevel = 0; }

    // OVERTAKE (Art. B7.2.2): enabled once the leader has crossed the Line after
    // the start (b), disabled only by the SAFETY CAR or a red flag (c) — a local
    // yellow or a VSC does not take it away — and held off after either until
    // the leader's next crossing (otHoldLap, set in flag()).
    // LOW GRIP (B7.1.2(b) / B7.2.2(d)): the conditions call for treaded tyres.
    // Overtake is off and active aero only partial (game.js aeroWetK). Read
    // live, so a weather arc that dries the track hands both back.
    function lowGrip() {
      if (typeof TyreModel === "undefined" || G.raceWeather == null) return false;
      return TyreModel.treadFor(G.raceWeather, typeof G.trackWetness === "function" ? G.trackWetness() : undefined) > 0;
    }
    // May a car EARN Overtake at the Detection Line now? Not under the Safety
    // Car or red flag (a bunched queue would all earn it for the restart lap),
    // nor in low grip. The lap-1 / after-SC line hold is otEnabled's, at use.
    function otDetectOpen() { return caution.level < 3 && !lowGrip(); }
    function otEnabled() {
      if (caution.level >= 3 || lowGrip()) return false;
      const leader = G.ranked[0];
      if (!leader || !(leader.lap > 1)) return false;
      // Never cleared here: a red flag's regrid rewinds the lap AFTER the drop,
      // so a read in between must not spend the hold. Laps only rise otherwise.
      return otHoldLap == null || leader.lap > otHoldLap;
    }

    function info() {
      return {
        level: caution.level, label: LABEL[caution.level] || "GREEN",
        sector: caution.sector, frac: caution.frac, total: caution.total,
        sectors: caution.sectors, sinceT: +caution.sinceT.toFixed(2),
        cause: caution.cause, phase: caution.phase, enabled, lowGrip: lowGrip(),
      };
    }

    return {
      update, apply, reset, setEnabled, otEnabled, otDetectOpen, lowGrip, info, hold,
      get level() { return caution.level; },
      takeRestart, clearHold,
      get enabled() { return enabled; },
    };
  }
  // SAFETY CAR QUEUE (B5.13: every car queues up behind the Safety Car, no
  // more than ten car lengths apart). One flat 0.45 × vTop cap for all would
  // FREEZE the gaps, so a stop under the SC would save nothing. The LEADER runs
  // the SC pace, and a car more than SC_QUEUE_GAP s (measured
  // at that pace) behind the car ahead ON THE ROAD may run up to SC_CATCH until
  // it has closed, blended over the next second so the cap never chatters.
  // Returns a FRACTION of vTop() — the caller multiplies, so it rides PACE.
  const SC_PACE = 0.45, SC_CATCH = 0.6, SC_QUEUE_GAP = 1.0;
  // Other cars' pose from the per-tick traffic snapshot game.js stamps on every car
  // before any updateCar runs (as ai-corridor.js does), so a rival already moved this
  // tick does not shift the verdict with its place in cars[]. Live when unstamped.
  const snapProg = (o) => (Number.isFinite(o._snapProg) ? o._snapProg : o.prog);
  const snapSpeed = (o) => (Number.isFinite(o._snapSpeed) ? o._snapSpeed : o.speed);
  function scQueueFrac(c, cars, total, leader, vTop, skip) {
    const out = (o) => o.finished || o.retired || (skip && skip(o));
    // A leader in the pit lane (or out) is not the front of the queue: the
    // first car still on track by cumulative prog is. Otherwise that car's
    // forward gap search wrapped to the tail of the field a lap away and it
    // ran SC_CATCH while it should be setting the SC pace.
    if (leader && out(leader)) {
      leader = null;
      for (const o of cars) if (!out(o) && (!leader || snapProg(o) > snapProg(leader))) leader = o;
    }
    if (!c || c === leader || !(total > 0)) return SC_PACE;
    let gap = Infinity;
    for (const o of cars) {
      if (o === c || out(o)) continue;
      const d = ((snapProg(o) - c.prog) % total + total) % total;   // forward, on the road
      if (d > 0 && d < gap) gap = d;
    }
    if (!Number.isFinite(gap)) return SC_PACE;
    const gapS = gap / Math.max(1, SC_PACE * vTop);   // seconds at the SC pace
    const t = Math.min(1, Math.max(0, gapS - SC_QUEUE_GAP));
    return SC_PACE + (SC_CATCH - SC_PACE) * t;
  }

  // NO PASSING UNDER A CAUTION — FOR THE AI TOO. The VSC/SC cap is a TOP speed,
  // not an order: cars on different lines through a corner simply drive past
  // each other (monza, measured in the Node VM: ~12 clean passes a
  // minute under VSC, up to 12 under the SC, the pass latch never engaged). So
  // the car ahead IN THE RUNNING ORDER — `ranked` is by cumulative prog, so a
  // lapped car is never "ahead" — is a speed ceiling once it is within HOLD_M:
  // never faster than it, easing off inside half that. A car the regs let you
  // pass (`fair`: finished, retired, pitting, stricken) is looked past to the
  // next one. Infinity = no car to hold behind.
  const HOLD_M = 12;
  function holdCap(c, ranked, fair) {
    const i = ranked ? ranked.indexOf(c) : -1;
    for (let j = i - 1; j >= 0; j--) {
      const o = ranked[j];
      if (o.finished || o.retired || (fair && fair(o))) continue;
      const gap = snapProg(o) - c.prog;
      if (!(gap < HOLD_M)) return Infinity;
      return Math.max(0, (snapSpeed(o) || 0) * (gap < HOLD_M / 2 ? 0.9 : 1));
    }
    return Infinity;
  }

  return { create, finishDelay, flagOut, beginLineStep, deferLine, settleLineStep, endLineStep, lineTransition, finishOrder, runOrder, classify, shortRun, scQueueFrac, holdCap, HOLD_M, SC_PACE, SC_CATCH, SC_QUEUE_GAP };
})();
Object.freeze(RaceControl);
