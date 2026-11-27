/* Read-only driving feedback and explicitly unscored solo practice: the BODY (DrivingCoachBody, LAZY_RACE_SESSION,
   #4748). The eager façade js/race/driving-coach-boot.js owns the DrivingCoach global, the practice-goal list and
   every Settings row and button this panel wires; it creates this body ONCE, the first call after the bundle lands. */
"use strict";
const DrivingCoachBody = (function () {
  const TIPS = Object.freeze({
    recovery: { label: "Off-track recovery", text: "OFF TRACK — SLOW DOWN AND REJOIN GENTLY", detail: "Grip is lower off the track. Use gentle inputs and check for traffic before rejoining.", dwell: 0.8 },
    trail: { label: "Braking into turns", text: "EASE THE BRAKE AS YOU TURN", detail: "Heavy braking is using most of your grip. Release the brake gradually as you steer.", dwell: 0.5 },
    power: { label: "Rear grip on power", text: "REAR SLIDING — EASE THE THROTTLE", detail: "The rear tyres are near their grip limit while you accelerate. Ease the throttle gradually.", dwell: 0.5 },
    rearBrake: { label: "Rear grip under braking", text: "REAR SLIDING — EASE THE BRAKE GENTLY", detail: "The rear tyres are near their grip limit under braking. Release some brake pressure smoothly.", dwell: 0.5 },
    rearCoast: { label: "Rear grip while coasting", text: "REAR SLIDING — KEEP INPUTS SMOOTH", detail: "The rear tyres are near their grip limit. Avoid sudden steering or pedal changes while the car settles.", dwell: 0.5 },
    wake: { label: "Dirty air", text: "WAKE COSTING FRONT GRIP — LEAVE ROOM ON EXIT", detail: "The wake is reducing your grip while the front tyres slide. Leave room for a smooth exit.", dwell: 1 },
    front: { label: "Front grip", text: "FRONTS SLIDING — UNWIND SOME STEERING", detail: "The front tyres are near their grip limit. Ease some steering instead of turning harder.", dwell: 0.6 },
    xmode: { label: "Straight Mode in corners", text: "CLOSE THE WING — STRAIGHT MODE LOSES GRIP IN CORNERS", detail: "The active aero was open while the car was cornering hard. Straight Mode trades downforce for straight-line speed; close it before you turn in.", dwell: 0.5 },
    coasting: { label: "Coasting", text: "COASTING ON THE STRAIGHT — CHECK YOUR THROTTLE", detail: "Neither pedal was used at speed on a clear straight. If you are not deliberately saving fuel or energy, build speed until your braking point.", dwell: 1.2 },
    tyres: { label: "Tyre wear", text: "ONE CORNER IS EATING YOUR TYRES", detail: "One corner took a large share of a lap's tyre wear on a set wearing faster than its plan. Fronts: brake a little earlier and ask less of the steering. Rears: build the throttle more gently on exit.", dwell: 0 },
    limits: { label: "Track limits", text: "TRACK LIMITS — KEEP THE CAR INSIDE THE WHITE LINES", detail: "A track-limits strike was recorded and the lap time deleted. In a race the third strike brings the black-and-white flag and the fourth and every one after it add five seconds; in a Time Trial or qualifying the lap is simply deleted.", dwell: 0 }
  });
  // Braking effort against the brake ceiling, the same scalar the engine's own
  // brakeFade/brakeYawDamp use. NOT c.axFrac: that is the friction-circle share,
  // and full braking in the dry plateaus at BRAKE/LONG_GRIP ≈ 0.64 (measured),
  // so an axFrac > 0.8 gate meant the braking tip could only ever fire in the wet.
  const brakeUse = c => Math.min(1, Math.max(0, -(c.axEstSm || 0) / PhysicsConsts.BRAKE));
  // Which practice goal trains the mistake behind each tip. A tip the driver
  // keeps earning is the one worth rehearsing, and the drill is the only part
  // of this feature that can actually be practised on purpose.
  const TRAINS = Object.freeze({ trail: "trail", rearBrake: "trail", front: "corner", power: "corner",
    rearCoast: "slalom", limits: "sector", coasting: "braking", tyres: "corner" });
  const APPROACH = Object.freeze({ trail: "RELEASE THE BRAKE AS YOU TURN", rearBrake: "RELEASE THE BRAKE SMOOTHLY",
    power: "BUILD THROTTLE SMOOTHLY ON EXIT", front: "AVOID ADDING STEERING IF THE FRONTS SLIDE",
    rearCoast: "KEEP YOUR INPUTS SMOOTH", xmode: "CLOSE STRAIGHT MODE BEFORE TURNING", limits: "STAY INSIDE THE WHITE LINES" });
  const SUGGEST_AT = 3;        // repeats of one tip before the goal is worth naming
  // METRES either side of an apex that still count as that turn — not a lap
  // FRACTION, which is a different distance on every circuit: 5% of a lap is
  // 350 m at Spa and 170 m at Monaco, so the same rule would file a tip from
  // the middle of a straight under a turn on one track and not on another.
  const TURN_WINDOW_M = 150;
  // A corner has to cost this much before the lap report names it. Below it the
  // difference is noise in the reference lap, and naming it is nagging.
  const MIN_LOSS_S = 0.2;
  // WHERE THE TYRES GO: a turn is named when it took TYRE_SHARE of a lap's wear
  // (and at least twice its even share) on a set the plan measured wearing
  // TYRE_FAST_K times faster than planned — below that, the tyres are fine and
  // naming a corner is nagging. Once per TYRE_EVERY laps per turn.
  const TYRE_SHARE = 0.15, TYRE_FAST_K = 1.1, TYRE_EVERY = 3;
  // The practice goals as the picker names them, so the review can point at a
  // goal by the label the driver will actually look for. One list, two readers.
  const GOALS = DrivingCoach.GOALS;   // the eager façade's list: the pm-drill row it wires and the goal names here
  function create(G) {
    const insights = RaceInsights.create(G);
    let enabled = G.store.get("drivingCoach", false), elapsed = 0, quiet = 0;
    let trace = [], checkpoint = null, practice = false, drillMode = "free";
    // REWIND: a rolling window of the same capture a checkpoint takes.
    // 2 Hz, not 60: a rewind lands you on a corner approach, and the half
    // second of granularity that buys is invisible against the 10 s jump —
    // while 60 Hz would deep-clone three objects per car per frame on the
    // physics path. 2 Hz x 12 s is 24 entries, so the buffer stays a plain
    // array the ghost's own recorder shape (js/car/ghost.js) would recognise.
    const REWIND_HZ = 2, REWIND_S = 10, REWIND_KEEP = (REWIND_S + 2) * REWIND_HZ;
    let rewindBuf = [], rewindAcc = 0;
    let clock = 0, candidate = "", held = 0, latest = null, warnSeen = null, edge = null;
    const lastTip = new Map(), tipCounts = new Map();
    let reminderAt = 0, reminders = 0, pendingReport = null;
    const reminded = new Map();
    let tyreAcc = null;
    const tyreSaid = new Map();
    let log = [];   // one row per tip: which tip, which turn, when — the session's map
    // The coach's tips answer "is the car at its limit"; they cannot answer
    // "where am I slow", which is the question that actually moves lap times.
    // This does, by differencing your elapsed time against the ghost's at the
    // same ARC POSITION — the game knows where the car is on the road, so it
    // sidesteps the distance-alignment error that GPS-based tools correct for
    // (a tighter line reads as less distance driven and the deltas stop summing).
    let bounds = null, boundKey = "", prevS = null, lastMark = null;
    let segs = [], lapReport = null;
    // Segment i runs from turn i's apex to the NEXT apex, so it carries the
    // corner AND the straight after it. That is deliberate: exit speed
    // propagates down the following straight, so attributing that straight to
    // the corner that caused it is the only honest split. Naive apex-to-apex
    // windows credit the straight and hide the exit that paid for it.
    function cornerBounds() {
      const t = G.track, turns = t && t.def && t.def.turns;
      if (!turns || turns.length < 2 || !(t.total > 0)) return null;
      const key = (t.def.id || "") + ":" + t.total + ":" + turns.length;
      if (boundKey !== key) {
        boundKey = key;
        bounds = turns.map((f, i) => ({ turn: i + 1, s: ((((f % 1) + 1) % 1)) * t.total }));
      }
      return bounds;
    }
    // Did the car pass `x` going forwards between `a` and `b`? Wrap-safe.
    const crossed = (a, b, x) => b >= a ? (x > a && x <= b) : (x > a || x <= b);
    function closeLapReport() {
      const rows = segs; segs = [];
      if (rows.length < 2) return;
      const worst = rows.reduce((m, r) => r.lost > m.lost ? r : m);
      lapReport = { total: rows.reduce((n, r) => n + r.lost, 0), worst: { ...worst },
        segments: rows.slice().sort((a, b) => b.lost - a.lost).map(r => ({ ...r })) };
      // ONE corner, after the lap, never a live bar: a delta the driver chases
      // mid-corner competes with looking ahead, which is the skill every coach
      // teaches first.
      if (enabled && worst.lost >= MIN_LOSS_S)
        pendingReport = { text: "TURN " + worst.turn + " COST " + worst.lost.toFixed(2) + "S", expires: clock + 12 };
    }
    function trackLap(c) {
      const bs = cornerBounds();
      if (!bs || !c || !Ghost.timeAt) { prevS = c ? c.s : null; return; }
      const s = c.s, a = prevS, total = G.track.total;
      prevS = s;
      if (a == null || !Number.isFinite(s)) return;
      // A practice retry, a rescue or an incident takeover moves the car along
      // the arc without driving it. Forward-of-half-a-lap in one frame is that,
      // not a lap: measuring across it would invent a segment worth minutes.
      if ((((s - a) % total) + total) % total > total * 0.5) { lastMark = null; segs = []; return; }
      // A lap with a caution, a pit stop or a red-flag hold in it is not a
      // lap to coach: its "loss" is the neutralisation, charged to one corner.
      if (G.cautionLevel() > 0 || (c.pitState && c.pitState !== "none")) { lastMark = null; segs = []; return; }
      for (const b of bs) {
        if (!crossed(a, s, b.s)) continue;
        // The reference is always the player's OWN personal-best Ghost, never a loaded
        // rival (GhostShare guest) that the ghost car / DELTA chip may be racing.
        const g = Ghost.timeAt(b.s), now = { turn: b.turn, t: G.raceT, g };
        if (lastMark && lastMark.g != null && g != null && now.t > lastMark.t) {
          // The ghost's clock restarts at the line, so a segment spanning it
          // reads negative until the reference lap is added back.
          let ref = g - lastMark.g;
          if (ref < 0) ref += Ghost.bestTime ? Ghost.bestTime() : 0;
          if (ref > 0) segs.push({ turn: lastMark.turn, lost: (now.t - lastMark.t) - ref });
        }
        lastMark = now;
        // A lap is turn 1 to turn 1, NOT line to line: anchoring on the first
        // apex is what keeps the segment that spans the start line — usually
        // the last corner's exit onto the main straight — in the report.
        if (b.turn === 1) closeLapReport();
      }
    }
    // The curated FIA turn number the car is at, or null. def.turns holds apex
    // positions as RACING-LAP fractions in driving order, the same frame
    // sectorAt() reads def.sectors in, and it is read raw exactly as
    // js/ui/track-maps.js and js/agent/agentview.js read it (the _sceneryShift
    // that dressing tables need is a SCENERY frame, not this one). Authored
    // data, never a curvature read: this says where a tip happened and is read
    // only to write a sentence — no car, assist or force path sees it.
    function turnAt() {
      const t = G.track, turns = t && t.def && t.def.turns, c = G.player;
      if (!turns || !turns.length || !c || !(t.total > 0)) return null;
      const f = (((c.s / t.total) % 1) + 1) % 1;
      let best = null, bestD = Infinity;
      for (let i = 0; i < turns.length; i++) {
        const raw = (((f - turns[i]) % 1) + 1) % 1;           // 0..1 ahead of the apex
        const d = Math.abs(raw > 0.5 ? raw - 1 : raw) * t.total;   // …as a shortest-way distance in metres
        if (d < bestD) { bestD = d; best = i + 1; }
      }
      return bestD <= TURN_WINDOW_M ? best : null;
    }
    // A real-race WATCH follows a replay puppet: its pedals read 0, not the player's driving (#5557).
    const puppet = () => !!(G.realRace && G.realRace.owns && G.realRace.owns(G.player));
    function coachState() {
      if (!enabled) return "off";
      if (!G.player || G.state !== "race") return "ready";
      if (G.player.finished || G.player.retired) return "complete";
      if (puppet()) return "ready";
      if (G.paused) return "paused";
      if (G.player.pitState && G.player.pitState !== "none") return "pit";
      if ((G.raceRadio && G.raceRadio.trafficBusy && G.raceRadio.trafficBusy()) || G.announceBusy || G.cautionLevel() > 0 || G.player.contactT > 0) return "waiting";
      return "watching";
    }
    function feedback() {
      // Most-repeated first: the ranking IS the advice, so the panel does not
      // ask the driver to compare numbers themselves.
      const counts = Array.from(tipCounts, ([id, count]) => ({ id, label: TIPS[id].label, count }))
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
      const spots = new Map();
      for (const row of log) if (row.turn != null) spots.set(row.turn, (spots.get(row.turn) || 0) + 1);
      const repeated = counts.find(r => r.count >= SUGGEST_AT && TRAINS[r.id]);
      return { enabled: !!enabled, state: coachState(), reminders, latest: latest && { ...latest }, counts,
        total: counts.reduce((n, row) => n + row.count, 0),
        turns: Array.from(spots, ([turn, count]) => ({ turn, count })).sort((a, b) => b.count - a.count || a.turn - b.turn),
        suggest: repeated ? { id: repeated.id, label: repeated.label, count: repeated.count, mode: TRAINS[repeated.id],
          goal: RaceInsights.DRILLS[TRAINS[repeated.id]],
          goalLabel: (GOALS.find(g => g[0] === TRAINS[repeated.id]) || [, TRAINS[repeated.id]])[1] } : null };
    }
    function clearCandidate() { candidate = ""; held = 0; }
    // ONE SAMPLE: the per-tick channels only. The trace keeps 600 of these
    // (60 s at 10 Hz); full status() rows (a feedback() ranking, insights
    // summary and deep-copied lap report in every one) would hold ~1 MB per
    // race, promoted to the old GC generation, for a trace only the DRIVING
    // TRACE button ever reads. Those are session totals; the
    // download adds them once.
    function sample(c) {
      const ghostSpeed = Ghost.speedAt ? Ghost.speedAt(c.lapTime) : null;
      return { time: G.raceT, speed: c.speed, steer: c.steerAngle || 0, brake: c.brakeDemand || 0,
        throttle: c.throttleDemand || 0, command: c.steerCommand || 0,
        slipFront: c.slipFront || 0, slipRear: c.slipRear || 0, frontUtil: c.frontUtil || 0, rearUtil: c.rearUtil || 0,
        forceFront: c.forceFront || 0, forceRear: c.forceRear || 0, lateralAccel: c.lateralAccel || 0,
        longitudinalUse: c.axFrac || 0, brakeUse: brakeUse(c), yawRate: c.yawRateCur || 0, energy: c.energy,
        wetness: (G.trackWetness ? G.trackWetness() : 0), practice, enabled,
        wake: c.wake || 0, dirtyAirMul: Number.isFinite(c._dirtyAirMul) ? c._dirtyAirMul : null, assisted: !!c._coachAssisted,
        ghostSpeedDelta: ghostSpeed == null ? null : c.speed - ghostSpeed };
    }
    function status() {
      const c = G.player;
      if (!c) return null;
      return Object.assign(sample(c), { coach: feedback(), insights: insights.summary(),
        lapReport: lapReport && { ...lapReport, worst: { ...lapReport.worst }, segments: lapReport.segments.map(r => ({ ...r })) } });
    }
    function tipFor(c) {
      if (!c || c.finished || c.retired || (c.pitState && c.pitState !== "none") || c.speed <= 0) return "";
      if (c.offroad) return "recovery";
      if (c.speed < G.vTop() * 0.2) return "";
      const brake = c.brakeDemand || 0, throttle = c.throttleDemand || 0;
      // Brake takes priority over throttle in the integrator. Auto-throttle can
      // legitimately leave both demand fields nonzero; that is not pedal overlap.
      const rearSliding = (c.rearUtil || 0) > 0.9 && Math.abs(c.slipRear || 0) > 0.06
        && (c.rearUtil || 0) > (c.frontUtil || 0) + 0.08;
      if (rearSliding) return brake > 0.1 ? "rearBrake" : throttle > 0.1 ? "power" : "rearCoast";
      if (brake > 0.1 && brakeUse(c) > 0.8 && Math.abs(c.steerAngle || 0) > 0.025) return "trail";
      // Explain measured wake loss only; assisted lock cannot establish driver error.
      if (!c._coachAssisted && !c.incidentInvalidLap && c.dnf !== "dns" && c.dnfWhy !== "dns"
          && brake <= .02 && throttle > .1 && (c.wake || 0) > .5 && c._dirtyAirMul < .98
          && c._dirtyAirMul > 0 && (c.aeroX || 0) < .1 && (c.frontUtil || 0) > .9
          && Math.abs(c.slipFront || 0) > .06 && Math.abs(c.steerAngle || 0) > .025) return "wake";
      if ((c.frontUtil || 0) > 0.9 && Math.abs(c.slipFront || 0) > 0.06 && Math.abs(c.steerAngle || 0) > 0.025) return "front";
      // Open flaps cost downforce exactly where the car is leaning on it (game.js
      // aeroGrip); auto aero closes them itself, so this only reaches a manual driver.
      if ((c.aeroX || 0) > 0.5 && Math.abs(c.lateralAccel || 0) > 6 && c.speed > G.vTop() * 0.4) return "xmode";
      if (brake <= 0.02 && throttle <= 0.02 && c.speed > G.vTop() * 0.4 && !loaded(c)
          && Math.abs(c.steerAngle || 0) < 0.025 && !following(c)) return "coasting";
      return "";
    }
    const loaded = c => (c.brakeDemand || 0) > 0.15 || Math.abs(c.lateralAccel || 0) > (G.LAT_MAX || 30) * 0.15;
    function following(c) {
      const total = G.track && G.track.total;
      if (!(total > 0) || !Number.isFinite(c.s)) return false;
      return (G.cars || []).some(other => {
        if (other === c || other.retired || (other.pitState && other.pitState !== "none")) return false;
        const ahead = ((other.s - c.s) % total + total) % total;
        return ahead < Math.max(10, c.speed) && Math.abs((other.x || 0) - (c.x || 0)) < 3;
      });
    }
    // Two observations at the same turn on earlier laps earn one anticipatory
    // reminder per later lap. Reminders are not mistakes and never inflate counts.
    function remind(c) {
      if (clock < reminderAt || !Number.isFinite(c.lap) || !Number.isFinite(c.s) || c.speed < G.vTop() * 0.2 || loaded(c)) return false;
      reminderAt = clock + 0.5;
      const bs = cornerBounds(); if (!bs) return false;
      const total = G.track.total;
      const next = bs.map(b => ({ ...b, d: ((b.s - c.s) % total + total) % total })).sort((a, b) => a.d - b.d)[0];
      const approachS = next.d / c.speed;
      if (approachS < 2 || approachS > 4 || reminded.get(next.turn) === c.lap || following(c)) return false;
      const counts = new Map();
      for (const r of log) if (r.turn === next.turn && r.lap < c.lap && APPROACH[r.id]) counts.set(r.id, (counts.get(r.id) || 0) + 1);
      const focus = Array.from(counts).sort((a, b) => b[1] - a[1])[0];
      if (!focus || focus[1] < 2) return false;
      const id = focus[0], text = "TURN " + next.turn + " — " + APPROACH[id];
      if (!G.announce(text, Math.max(3, text.split(/\s+/).length * 0.38), "coach")) return false;
      latest = { id, text, detail: "A reminder based on repeated tips here on earlier laps. " + TIPS[id].detail,
        time: G.raceT, turn: next.turn, reminder: true };
      reminded.set(next.turn, c.lap); reminders++; quiet = 8; return true;
    }
    function advice(c) { const id = tipFor(c); return id ? TIPS[id].text : ""; }
    // Wear gained is filed under the turn the car is at (turnAt: authored
    // apexes, never a curvature read — this only writes a sentence); at the
    // line the lap is judged and, if one turn is eating the set, it is named.
    function tyreWatch(c) {
      const w = c.tyreWear || 0, f = c.tyreWearF || 0, r = c.tyreWearR || 0, set = c.tyreStints || 0;
      if (!tyreAcc || tyreAcc.set !== set) { tyreAcc = { lap: c.lap, set, w, f, r, turns: new Map(), sum: 0 }; return; }
      const dw = w - tyreAcc.w, df = f - tyreAcc.f, dr = r - tyreAcc.r;
      tyreAcc.w = w; tyreAcc.f = f; tyreAcc.r = r;
      if (dw > 0 && dw < 0.05) {
        tyreAcc.sum += dw;
        const turn = turnAt();
        if (turn != null) {
          const e = tyreAcc.turns.get(turn) || { w: 0, f: 0, r: 0 };
          e.w += dw; e.f += df; e.r += dr; tyreAcc.turns.set(turn, e);
        }
      }
      if (c.lap === tyreAcc.lap) return;
      const line = tyreLine(tyreAcc, c);
      tyreAcc.lap = c.lap; tyreAcc.turns = new Map(); tyreAcc.sum = 0;
      if (!line) return;
      tyreSaid.set(line.turn, c.lap);
      pendingReport = { text: line.text, expires: clock + 20 };
      tipCounts.set("tyres", (tipCounts.get("tyres") || 0) + 1);
      log.push({ id: "tyres", turn: line.turn, time: G.raceT, lap: c.lap }); if (log.length > 200) log.shift();
    }
    function tyreLine(acc, c) {
      const plan = c.pitPlan, turns = G.track && G.track.def && G.track.def.turns;
      if (!plan || !(plan.loadK >= TYRE_FAST_K) || !(acc.sum > 0) || !turns || !turns.length) return null;
      let best = null;
      for (const [turn, e] of acc.turns) if (!best || e.w > best.e.w) best = { turn, e };
      if (!best || best.e.w / acc.sum < Math.max(TYRE_SHARE, 2 / turns.length)) return null;
      const last = tyreSaid.get(best.turn);
      if (last != null && c.lap - last < TYRE_EVERY) return null;
      const end = best.e.f > best.e.r * 1.2 ? "FRONTS" : best.e.r > best.e.f * 1.2 ? "REARS" : "TYRES";
      const how = end === "FRONTS" ? "BRAKE EARLIER, LESS STEERING" : end === "REARS" ? "SMOOTHER ON THE THROTTLE" : "EASE THE SLIDES";
      return { turn: best.turn, text: "TURN " + best.turn + " IS EATING THE " + end + " — " + how };
    }
    // PERF-HUNT-2 S8: game.js flushes once per display frame (G._s8Stamp). A
    // second update with the same stamp is a no-op; tests that omit the stamp
    // keep the per-call behaviour.
    let _s8Done = null;
    function update(dt) {
      const stamp = G._s8Stamp;
      if (stamp != null && stamp === _s8Done) return;
      if (!Number.isFinite(dt) || dt <= 0 || G.paused || puppet()) return;
      if (stamp != null) _s8Done = stamp;
      // A suspended frame is not sustained driving evidence.
      const step = Math.min(dt, 0.1);
      clock += step; elapsed += step; quiet = Math.max(0, quiet - step);
      // Every frame, not every sample: a boundary crossing is an edge, and at
      // racing speed a 0.1 s sample step steps over 7 m of road.
      // The ghost a race happens to have loaded is whatever Time Trial ran
      // last (other weather, tyres, setup), so only a Time Trial is measured.
      if (G.state === "race" && G.player && G.timeTrial) trackLap(G.player); else prevS = null;
      // Sample for rewind only while a rewind is actually possible. A scored
      // session pays nothing for this feature — no capture, no clone, no array.
      if (canPractice()) {
        rewindAcc += step;
        if (rewindAcc >= 1 / REWIND_HZ) {
          rewindAcc = 0;
          // A solo session captures one car; a race captures the world. Same
          // cadence either way — 20 cars x 3 deep clones per sample at 2 Hz is
          // 60 clones every half second, which the physics path does not feel.
          rewindBuf.push({ t: clock, world: captureWorld() });
          if (rewindBuf.length > REWIND_KEEP) rewindBuf.shift();
        }
      } else if (rewindBuf.length) { rewindBuf = []; rewindAcc = 0; }
      if (elapsed >= 0.1) {
        elapsed %= 0.1;
        insights.update(G.player);
        if (typeof SetupTrials !== "undefined" && SetupTrials.active()) {
          SetupTrials.observe(G.setupTrialContext ? G.setupTrialContext() : null);
          const result = insights.summary();
          if (result.drill && result.drill.done && result.lastDrill) SetupTrials.record(result.lastDrill, G.setupTrialContext ? G.setupTrialContext() : null);
        }
        if (enabled && G.state === "race" && G.player && !G.timeTrial && G.tyres && G.tyres.on()) tyreWatch(G.player);
        if (enabled || practice) {
          if (G.player) { trace.push(sample(G.player)); if (trace.length > 600) trace.shift(); }
        }
      }
      // Track limits is an EVENT, not a sustained state: the game only announces
      // the warning ladder in the broadcast HUD, so the coach explains it here.
      // Held for 3 s so a race message can clear first; the first sighting and
      // the reset after a penalty (already announced) are not new warnings.
      const warn = G.player ? (G.player.cutWarn || 0) : 0;
      if (warnSeen == null || warn < warnSeen) warnSeen = warn;
      // 4 and up are +5 s penalties (FIA 2026: the 4th and each additional
      // strike): announced by the game already, not a new warning.
      else if (warn > warnSeen) { warnSeen = warn; if (warn <= 3) edge = { id: "limits", t: 3, life: 12 }; }
      // The game's own TRACK LIMITS card holds the channel for ANN_MIN_S (3 s)
      // from the same step, so the window only runs while the coach could
      // speak; `life` still retires a warning a long caution or pit swallowed.
      if (edge) {
        edge.life -= step;
        if (coachState() === "watching") edge.t -= step;
        if (edge.t <= 0 || edge.life <= 0) edge = null;
      }
      if (coachState() !== "watching" || quiet) { clearCandidate(); return; }
      if (pendingReport) {
        if (clock > pendingReport.expires) pendingReport = null;
        else if (!loaded(G.player) && G.announce(pendingReport.text, 3, "coach")) { pendingReport = null; quiet = 8; clearCandidate(); return; }
      }
      const id = edge ? edge.id : tipFor(G.player);
      if (!id && G.player && remind(G.player)) { clearCandidate(); return; }
      if (!id || clock - (lastTip.get(id) ?? -Infinity) < 30) { clearCandidate(); edge = null; return; }
      if (candidate !== id) { candidate = id; held = 0; }
      held += step;
      if (held + 1e-9 < TIPS[id].dwell) return;
      const tip = TIPS[id], turn = turnAt();
      // Only a line that will be HEARD counts as advice given. The 30 s repeat
      // block, the tip counts and the post-session feedback all claim to
      // describe what the player was told, so none of them may record a tip a
      // cinematic camera silenced (js/game.js announce() returns that verdict).
      // Nothing is cleared on the way out: the candidate stays held so the tip
      // lands on the very next tick the banner is free, rather than starting
      // its dwell over. (An edge tip still ages out on its own staleness rule.)
      if (!G.announce(tip.text, Math.max(2.5, tip.text.split(/\s+/).length * 0.38), "coach")) return;
      latest = { id, text: tip.text, detail: tip.detail, time: G.raceT, turn };
      tipCounts.set(id, (tipCounts.get(id) || 0) + 1); lastTip.set(id, clock);
      log.push({ id, turn, time: G.raceT, lap: G.player.lap }); if (log.length > 200) log.shift();
      quiet = 8; clearCandidate(); edge = null;
    }
    const goal = () => RaceInsights.DRILLS[drillMode].toUpperCase();
    // G.practice, NOT G.timeTrial: a checkpoint is safe in any session the
    // player has declared UNSCORED, and a Time Trial is simply always one
    // (G.practice derives it). The other two clauses are NOT session-type
    // checks and do not move with it — a daily challenge is scored against a
    // shared standard, and a netplay car's laps are already mirrored to peers
    // by netPlay.reportLap(), so neither can be made unscored from this side.
    // "count" too: the START drill's own instructions say to set it on the grid,
    // before the lights, and the pause menu opens during the countdown.
    const onTrack = () => G.state === "race" || G.state === "count";
    function canPractice() { return !!(G.practice && !G.daily.isActive() && !G.netPlay.active() && G.player && onTrack()); }
    // mark() (a checkpoint the player places), rewind() (the rolling buffer)
    // and retry() all move the SAME state, and so will every other consumer:
    // what "the sim state" is lives in ONE registry, js/core/sim-state.js
    // (#6860). The car sweep, the clock, the sim RNG stream, the reset-only
    // side worlds and every module that registers (Damage, #6862 P2) come
    // back together; PENALTIES AND CUTS stay with the player (keepForward,
    // SimState.KEEP_FORWARD says why).
    // A rewind that moved one car through a field that kept running is not a
    // rewind, it is a teleport: you rejoin having lost the ground everyone else
    // covered, the order scrambles, and you can land inside a rival who is now
    // occupying the road you left. So a session with other cars on track
    // rewinds ALL of them, the race clock, and the sector state with them.
    //
    // WHAT CANNOT BE RESTORED, said plainly: the debris field and any live
    // incident — SimState's "incidents" and "debris" parts RESET them, first,
    // so a rewind clears marbles and broken panels instead of putting them
    // back. The alternative is cars rewound into debris that was never there.
    function captureWorld() { return SimState.capture(G); }
    // `exact` (DrillFork, #6559 B2): a what-if branch is a REPLAY that ends where it began, so the player's penalties
    // go back too and what the live lap owns is not spent (the RETRY LAP drop-in, the invalid-lap mark); a practice
    // rewind (the default) keeps penalties forward and spends both. Either way a practice session's records are
    // spoiled (laps were driven that the board must not see) and the coach's trace restarts.
    function restoreWorld(w, o) {
      const exact = !!(o && o.exact);
      if (!SimState.restore(w, G, { keepForward: !exact })) return false;
      if (!exact) {
        if (typeof LapRetry !== "undefined") LapRetry.invalidate();   // the RETRY LAP drop-in is from a world this rewind replaced
        if (G.player) G.player.incidentInvalidLap = true;
      }
      G.records.invalidate(); trace = []; quiet = 2; clearCandidate();
      return true;
    }
    // A CHECKPOINT IS A WORLD TOO. Same reasoning as rewind: saving a starting
    // point in a race and restoring only your own car would put you back on the
    // road with rivals who never went back — the order scrambled and a rival
    // possibly sitting where you just materialised. In a solo session this is
    // a one-car world and behaves exactly as it always did.
    function mark() {
      if (!canPractice()) return false;
      if (typeof SetupTrials !== "undefined") SetupTrials.invalidate("Checkpoint changed during attempt");
      if (!insights.startDrill(drillMode)) return false;
      checkpoint = { world: captureWorld(), mode: drillMode };
      practice = true; G.records.invalidate();
      G.announce("PRACTICE: " + goal() + " — LAPS NOT SAVED", 3, "practice");
      return true;
    }
    function retry() {
      if (typeof SetupTrials !== "undefined") SetupTrials.invalidate("Checkpoint retry invalidates a measured attempt");
      if (!checkpoint || !canPractice()) return false;
      restoreWorld(checkpoint.world);
      drillMode = checkpoint.mode;
      if (!insights.startDrill(drillMode)) return true;
      G.announce("TRY AGAIN: " + goal(), 2, "practice");
      return true;
    }
    // REWIND ~10 s. Takes the OLDEST sample still inside the window rather than
    // hunting the one nearest 10 s: the buffer is bounded at REWIND_KEEP, so
    // the oldest entry is between 10 and 12 s old by construction, and a
    // player who rewinds twice in a row should keep travelling backwards
    // instead of landing on the same spot.
    //
    // THE WHOLE RACE GOES BACK — every car, the clock and the sector state —
    // so gaps, positions and deltas are the ones you actually had 10 s ago.
    // See restoreWorld() for the two things that are RESET rather than
    // restored (the Rapier debris field and any live incident).
    function rewind() {
      if (typeof SetupTrials !== "undefined") SetupTrials.invalidate("Rewind invalidates a measured attempt");
      if (!canPractice() || !rewindBuf.length) return false;
      const e = rewindBuf.shift();
      rewindBuf = [];                 // everything after it is a future that no longer happened
      rewindAcc = 0;
      practice = true;                // rewinding IS practising, whether or not a checkpoint was set
      const n = (G.cars || []).length;
      restoreWorld(e.world);
      // RE-ARM THE DRILL, exactly as retry() does. RaceInsights fails any
      // in-progress attempt when the clock or the arc jumps backwards
      // (js/race/race-insights.js, "position jumped") — which is precisely what
      // a rewind is. Without this the attempt you rewound in order to RETRY is
      // silently marked dirty, with a reason that describes the mechanism
      // rather than anything the driver did. startDrill() resets its `previous`
      // sample so the next tick is not read as a teleport.
      if (!insights.startDrill(drillMode)) return true;
      G.announce("REWIND " + Math.round(clock - e.t) + "s" + (n > 1 ? " — FULL GRID" : ""), 2, "practice");
      return true;
    }
    // World snapshots serve live practice controls. The coaching trace and journal
    // remain available for review from Settings after the driver leaves the track.
    function releasePracticeWorlds() {
      checkpoint = null; rewindBuf.length = 0; rewindAcc = 0;
    }
    function reset() {
      for (const mode of pathwayModes) { const check = $("pm-pathway-check-" + mode); if (check) check.checked = false; }
      if (typeof SetupTrials !== "undefined") SetupTrials.invalidate("Session reset before attempt completed");
      releasePracticeWorlds(); practice = false; trace = []; elapsed = 0; quiet = 0; warnSeen = null; edge = null;
      reminded.clear(); reminderAt = 0; reminders = 0; pendingReport = null; tyreAcc = null; tyreSaid.clear();
      clock = 0; latest = null; log = []; clearCandidate(); lastTip.clear(); tipCounts.clear(); insights.reset();
      prevS = null; lastMark = null; segs = []; lapReport = null;
    }
    let traceExporting = false;
    async function downloadTrace() {
      if (traceExporting) return;
      traceExporting = true;
      try {
        const blob = new Blob([JSON.stringify({ physics: PhysicsConsts.REVISION, configuration: G.records.config(), rows: trace,
          coach: feedback(), lapReport,
          aiDecisions: (G.cars || []).filter(c => !c.human && c.passPlan).map(c => ({ driver: c.code, ...c.passPlan })),
          journal: insights.journal(), forecast: insights.forecast(), practice: insights.summary() }, null, 2)], { type: "application/json" });
        if (typeof NativeDownload !== "undefined" && NativeDownload.viable()) {
          await NativeDownload.saveBlob(blob, "apex26-driving-trace.json");
        } else {
          const url = URL.createObjectURL(blob), a = document.createElement("a");
          a.href = url; a.download = "apex26-driving-trace.json"; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (e) {
        if (G.announce) G.announce(typeof NativeDownload !== "undefined" && NativeDownload.isCancelled(e) ? "TRACE EXPORT CANCELLED" : "TRACE EXPORT FAILED");
      } finally { traceExporting = false; }
    }
    function toggle() { enabled = !enabled; pendingReport = null; clearCandidate(); G.store.set("drivingCoach", enabled); paint(); return enabled; }
    const $ = G.$;
    const pathwayModes = ["braking", "trail", "lap"];
    function paintProgress() {
      for (const mode of pathwayModes) {
        const choice = $("pm-pathway-" + mode);
        if (choice) { choice.disabled = !canPractice(); choice.onclick = () => { if (canPractice()) setPracticeGoal(mode); }; }
      }
    }
    function paint() {
      paintProgress();
      SettingRow.paint($("pm-coach"), enabled ? "on" : "off");
      const coaching = feedback(), coachStatus = $("pm-coach-status"), coachTip = $("pm-coach-tip"), coachSummary = $("pm-coach-summary");
      if (coachStatus) coachStatus.textContent = { off: "Coach off. Turn it on for driving tips.", ready: "Ready for your next drive.",
        paused: "Coach paused with the game.", waiting: "Waiting for flags, traffic incidents and race messages to clear.",
        pit: "Tips resume after you leave the pits.", complete: "Session complete. Your latest tip is below.", watching: "Watching your driving. Tips appear only when needed." }[coaching.state];
      if (coachTip) coachTip.textContent = coaching.latest
        ? (coaching.latest.turn && !coaching.latest.reminder ? "Turn " + coaching.latest.turn + ": " : "") + coaching.latest.text + ". " + coaching.latest.detail
        : "Your next tip will appear here after you drive.";
      const lapLine = $("pm-lap-report");
      if (lapLine) lapLine.textContent = !lapReport
        ? "Drive a lap with a saved best on this circuit to see where the time went."
        // Two corners, never the whole list: changing many things at once is how
        // a driver improves nothing.
        : "Last lap: " + (lapReport.total >= 0 ? lapReport.total.toFixed(2) + "s slower than" : Math.abs(lapReport.total).toFixed(2) + "s faster than")
          + " your best, measured corner by corner. "
          + lapReport.segments.slice(0, 2).map(r => "Turn " + r.turn + " " + (r.lost >= 0 ? "+" : "") + r.lost.toFixed(2) + "s").join(", ")
          + ". Each figure covers the corner and the straight after it, because exit speed is paid for at the apex.";
      if (coachSummary) coachSummary.textContent = coaching.total ? coaching.total + " tip" + (coaching.total === 1 ? "" : "s")
        + " recorded this session. " + coaching.counts.map(r => r.label + ": " + r.count).join(" · ") + "."
        // Where they cluster is the part a count alone cannot tell you: one
        // corner earning half the session's tips is a corner to practise.
        + (coaching.turns.length ? " Most at " + coaching.turns.slice(0, 3).map(r => "Turn " + r.turn + " (" + r.count + ")").join(", ") + "." : "")
        + (coaching.suggest ? " " + coaching.suggest.label + " came up " + coaching.suggest.count
          + " times. The " + coaching.suggest.goalLabel + " practice goal drills it." : "")
        + " These are reminders, not a driving score."
        : "No tips recorded this session. This is a reminder count, not a driving score.";
      const download = $("pm-driving-trace"); if (download) download.disabled = trace.length === 0 && insights.journal().length === 0;
      const markBtn = $("pm-practice-set"), retryBtn = $("pm-practice-retry");
      if (markBtn) markBtn.disabled = !canPractice();
      if (retryBtn) retryBtn.disabled = !canPractice() || !checkpoint;
      const rewindBtn = $("pm-practice-rewind");
      if (rewindBtn) rewindBtn.disabled = !canPractice() || !rewindBuf.length;
      // ARM is the only control that shows OUTSIDE practice, and it hides again
      // the moment the session is armed — it is one-way, so a live button that
      // did nothing would be a lie.
      const armBtn = $("pm-practice-arm");
      if (armBtn) armBtn.hidden = !canArm();
      SettingRow.paint($("pm-drill"), drillMode);
      SettingRow.disable($("pm-drill"), !canPractice());
      const practiceState = $("pm-practice-state");
      if (practiceState) practiceState.textContent = !canPractice()
        ? (canArm()
          ? "This session is scored, so checkpoints and rewind are off. ARM PRACTICE makes it unscored and turns them on — it cannot be undone for this session."
          : "Checkpoints are available in a Time Trial, or in a race or qualifying session you have armed for practice. Daily challenges and multiplayer are scored against others, so they cannot be armed.")
        : practice ? "Practice active: laps and ghosts will not be saved. TRY AGAIN, or the RECOVER key while driving, restores the saved grid, race clock and practice goal. REWIND 10s steps the grid and race clock back without a checkpoint. Restart the session to set records again."
          : "Saving a starting point, or rewinding, makes this session unscored: laps and ghosts will not be saved. Restart the session to set records again.";
      const drillInfo = $("pm-drill-status"), summary = insights.summary();
      if (drillInfo) {
        const guide = { free: "Repeat any section at your own pace.", sector: "Finish the next sector without contact or leaving the track.",
          corner: "Drive through the next corner and out the other side. The result shows your time, minimum speed and exit speed.",
          lap: "Cross the start line to begin timing, then complete one full lap without contact or leaving the track. Practice laps are not saved, so this is how to time one.",
          braking: "Build speed before saving, then brake firmly and keep braking until the car stops. Coasting to a stop does not count.",
          trail: "Build speed before saving. Brake firmly, keep some brake on as the car turns in, then release it while the car is still turning.",
          cooling: "Tyre wear must be enabled. Save, then complete one clean lap from the line on the same set in stable weather. Shows measured grain and grip changes, without a recovery promise.",
          slalom: "Make six direction changes while moving: the car must change direction, not just the stick. Stay on the track and avoid contact.",
          launch: "Stop the car before saving, then launch to racing speed. Timed from your first throttle.",
          start: "Set this on the grid before the lights. The run ends at the first corner and scores the places you gained off the line.",
          slipstream: "Save behind the car ahead, then close the gap in its wake without contact or leaving the track.",
          overtake: "Save behind a similarly paced car, then pass it and hold clear without contact or leaving the track.",
          defend: "Save with a rival close behind, then hold your place under pressure without contact or leaving the track.",
          backmarkers: "Save before slower traffic, then clear three slower cars without contact or leaving the track.",
          apex: "Save on the straight before a turn, then drive it and carry on down the straight. The result shows your time, minimum speed and exit speed." };
        // start / slipstream / defend are stored NEGATED (mastery keeps the MINIMUM): undo the sign here, once, in each drill's own unit.
        const fmt = (mode, s) => mode === "braking" ? s.toFixed(0) + " m from " + insights.brakingRef() : mode === "lap" ? G.fmtTime(s) : mode === "launch" ? s.toFixed(2) + "s"
          : mode === "start" ? (-s >= 0 ? "+" : "") + (-s) + (Math.abs(s) === 1 ? " place" : " places")
          : mode === "slipstream" ? Math.max(0, -s).toFixed(0) + " m closed" : mode === "defend" ? Math.max(0, -s).toFixed(1) + "s held" : s.toFixed(1) + "s";
        const last = summary.lastDrill, tries = insights.attempts(drillMode), clean = tries.filter(a => a.clean), saved = insights.mastery(drillMode);
        drillInfo.textContent = guide[drillMode]
          + (last && last.mode === drillMode ? " Last attempt: " + (last.clean ? "completed · " + last.text : "retry suggested · " + last.reason) + "." : "")
          + (tries.length ? " This session: " + tries.length + " attempt" + (tries.length === 1 ? "" : "s") + ", " + clean.length + " clean"
            + (clean.length && drillMode !== "cooling" ? ", best " + fmt(drillMode, Math.min(...clean.map(a => a.score))) : "") + "." : "")
          + (saved ? " Saved best: " + fmt(drillMode, saved.best) + " over " + saved.completed + " clean run" + (saved.completed === 1 ? "" : "s") + "." : "");
      }
      const f = insights.forecast(), strategy = $("pm-stint-forecast");
      if (strategy) strategy.textContent = !G.tyres.on() ? "Enable tyre wear for stint forecasts." : !f || f.remainingLaps == null ? "Drive at least half a lap on this set for a tyre-life estimate."
        : "Tyre life ≈ " + f.remainingLaps.toFixed(1) + " laps · " + (f.reachesFinish ? "projected to reach the finish" : "another stop may be needed")
          + (f.paybackLaps == null ? "" : " · estimated stop payback " + f.paybackLaps.toFixed(1) + " laps") + " · " + f.confidence + " confidence";
      const energyCard = $("pm-last-lap-energy-text");
      if (energyCard) {
        const receipt = f && f.lastLapEnergy, net = value => Math.abs(value * 100).toFixed(1) + " percentage points " + (value >= 0 ? "used" : "recovered");
        energyCard.textContent = receipt ? "Lap " + receipt.lap + ": " + net(receipt.netUsed) + ". " + receipt.sectors.map((value, i) => "Sector " + (i + 1) + ": " + net(value)).join(" · ") + ". Measured net battery change, including recovery; this does not identify why energy changed."
          : "Complete one full clean lap in stable conditions for a measured sector-by-sector review. Partial laps, pits, incidents, cautions and changed conditions are excluded.";
      }
      const energy = $("pm-energy-forecast");
      if (energy) energy.textContent = !f || f.energyPerLap == null ? "Complete clean sectors to learn your energy use."
        : "Net energy per lap: " + (f.energyPerLap * 100).toFixed(1) + "%" + (f.energyLaps == null ? " · current pattern sustains charge" : " · charge lasts ≈ " + f.energyLaps.toFixed(1) + " laps") + " · estimated from recent sectors";
      const net = insights.network(), connection = $("pm-connection");
      if (connection) { connection.hidden = !net; connection.textContent = net ? net.text : ""; }
      // AN EMPTY LIST SAYS WHY IT IS EMPTY, like every other readout in this
      // function — the tip line, the lap report and the energy forecast all
      // carry a sentence for the no-data case. These two lists were the only
      // ones that rendered a bare <ol>, so a clean session (the common one)
      // opened SESSION REVIEW on a heading and a blank gap that read as
      // half-loaded rather than as "nothing happened".
      const emptyRow = (list, text) => {
        const li = document.createElement("li");
        li.textContent = text;
        list.appendChild(li);
      };
      const journal = $("pm-incident-log");
      if (journal) {
        journal.textContent = "";
        const rows = insights.journal().slice(-20);
        for (const e of rows) { const li = document.createElement("li"); li.textContent = e.time.toFixed(1) + "s · " + e.text; journal.appendChild(li); }
        if (!rows.length) emptyRow(journal, "No incidents yet — penalties, contact, off-track moments and pit phases appear here as they happen.");
      }
      const decisions = $("pm-ai-decisions");
      if (decisions) {
        decisions.textContent = "";
        let planned = 0;
        for (const c of G.cars || []) if (!c.human && c.passPlan) {
          const li = document.createElement("li"), p = c.passPlan;
          li.textContent = c.code + " · " + p.reason + " · left: " + p.left.reason + " · right: " + p.right.reason;
          decisions.appendChild(li); planned++;
        }
        if (!planned) emptyRow(decisions, "No rival is lining up a pass right now.");
      }
      const watching = typeof RealRace !== "undefined" && !!RealRace.status().watch;
      const panel = $("pm-pit-panel");
      const pitHelp = $("pm-pit-help"), note = $("pm-pit-estimate");
      if (panel) panel.hidden = watching;
      if (watching) {
        SettingRow.disable($("pm-pit-choice"), true);
        if (pitHelp) pitHelp.textContent = "Pit strategy is unavailable while watching a replay.";
        if (note) note.textContent = "Pit strategy is unavailable while watching a replay.";
        return;
      }
      const names = new Map(G.pits.ownedTyres().map(o => [o.id, o.label]));
      const compoundName = id => names.get(id) || id.replace(/_/g, " ");
      const selected = G.player && G.player.pitNext;
      // AUTO NAMES ITS PICK: the set pickFor would fit right now (the plan's
      // letter, never one that breaks the two-compound rule), so AUTO is a
      // choice the player can read rather than a surprise in the box.
      const auto = G.player && !selected && G.tyres.on() ? G.pits.pickFor(G.player) : null;
      const autoLabel = auto ? "AUTO · " + auto.code : "AUTO";
      if (pitHelp) pitHelp.textContent = (selected ? "Next stop: " + compoundName(selected.id) + " (" + selected.code + "). "
        : auto ? "AUTO will fit " + compoundName(auto.id) + " (" + auto.code + ") at your next stop. " : "AUTO lets the game choose your next tyres. ")
        + "Drive into the pit entry to stop. Choosing tyres does not call you into the pits. Requires tyre wear to be enabled.";
      SettingRow.paint($("pm-pit-choice"), G.player && G.player.pitNext ? G.player.pitNext.id : "auto",
        [["auto", autoLabel], ...G.pits.choices(G.player).map(r => [r.id, r.code + " · " + compoundName(r.id)])]);
      SettingRow.disable($("pm-pit-choice"), !(G.player && G.tyres.on() && G.state === "race") || G.player.pitState === "box");
      if (note) {
        const e = G.player && G.tyres.on() && G.pits.estimate(G.player);
        note.textContent = e ? "Estimated pit loss: " + e.lossS.toFixed(1) + "s" + (e.gapS == null ? "" : " · gap behind: " + e.gapS.toFixed(1) + "s") : "Pit strategy is available with tyre wear enabled.";
      }
    }
    function beginSetupTrial() {
      if (!G.practice || !canPractice()) return false;
      drillMode = "launch";
      return mark();
    }
    function setPracticeGoal(mode) {
      if (typeof SetupTrials !== "undefined") SetupTrials.invalidate("Practice goal changed");
      if (!Object.hasOwn(RaceInsights.DRILLS, mode)) return false;
      drillMode = mode; paint(); return true;
    }
    // ARM PRACTICE in a session that is not a Time Trial. Declaring the session
    // unscored is the player's call and it is ONE WAY: there is no disarm,
    // because a session that has already been rewound cannot become scored
    // again by flipping a flag back. Refused outright where "unscored" is not
    // ours to declare — a daily challenge is scored against a shared standard,
    // and netplay laps are already mirrored to peers.
    function armPractice() {
      if (G.timeTrial || G.daily.isActive() || G.netPlay.active()) return false;
      if (G.flow === "season" || G.flow === "career") return false;
      if (!onTrack() || !G.player) return false;
      if (G.practice) return true;
      G.practice = true; G.records.invalidate();
      G.announce("PRACTICE ARMED — THIS SESSION IS NOT SCORED", 3, "practice");
      return true;
    }
    // Not in a championship: practice promises "THIS SESSION IS NOT SCORED" and
    // unlocks rewind, but a season or career round is always scored — a rewound
    // P1 took full points and prize money. Practice those in a one-off race.
    function canArm() { return !!(!G.timeTrial && !G.daily.isActive() && !G.netPlay.active() && onTrack() && G.player && !G.practice && G.flow !== "season" && G.flow !== "career"); }
    return { update, status, feedback, advice, beginSetupTrial, mark, retry, rewind, releasePracticeWorlds, reset, toggle, paint, armPractice, canArm,
      practiceGoal: () => drillMode, setPracticeGoal,
      canPractice, rewindReady: () => canPractice() && rewindBuf.length > 0,
      practiceActive: () => practice, isEnabled: () => !!enabled, downloadTrace,
      trace: () => trace.map(row => ({ ...row })), insights, captureWorld, restoreWorld };
  }
  return { create };
})();
Object.freeze(DrivingCoachBody);
