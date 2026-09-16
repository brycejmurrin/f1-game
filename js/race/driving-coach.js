/* Read-only driving feedback and explicitly unscored solo practice. */
"use strict";
const DrivingCoach = (function () {
  const TIPS = Object.freeze({
    recovery: { label: "Off-track recovery", text: "OFF TRACK — SLOW DOWN AND REJOIN GENTLY", detail: "Grip is lower off the track. Use gentle inputs and check for traffic before rejoining.", dwell: 0.8 },
    trail: { label: "Braking into turns", text: "EASE THE BRAKE AS YOU TURN", detail: "Heavy braking is using most of your grip. Release the brake gradually as you steer.", dwell: 0.5 },
    power: { label: "Rear grip on power", text: "REAR SLIDING — EASE THE THROTTLE", detail: "The rear tyres are near their grip limit while you accelerate. Ease the throttle gradually.", dwell: 0.5 },
    rearBrake: { label: "Rear grip under braking", text: "REAR SLIDING — EASE THE BRAKE GENTLY", detail: "The rear tyres are near their grip limit under braking. Release some brake pressure smoothly.", dwell: 0.5 },
    rearCoast: { label: "Rear grip while coasting", text: "REAR SLIDING — KEEP INPUTS SMOOTH", detail: "The rear tyres are near their grip limit. Avoid sudden steering or pedal changes while the car settles.", dwell: 0.5 },
    front: { label: "Front grip", text: "FRONTS SLIDING — UNWIND SOME STEERING", detail: "The front tyres are near their grip limit. Ease some steering instead of turning harder.", dwell: 0.6 },
    xmode: { label: "X-mode in corners", text: "CLOSE THE WING — X-MODE LOSES GRIP IN CORNERS", detail: "The active aero was open while the car was cornering hard. X-mode trades downforce for straight-line speed; close it before you turn in.", dwell: 0.5 },
    coasting: { label: "Coasting", text: "COASTING — BE ON THE BRAKE OR THE THROTTLE", detail: "Neither pedal was used at speed for over a second. A racing car is either braking or accelerating; coasting gives time away.", dwell: 1.2 },
    limits: { label: "Track limits", text: "TRACK LIMITS — KEEP THE CAR INSIDE THE WHITE LINES", detail: "A track-limits warning was recorded. Four warnings in a row add a five-second penalty; the count resets after a penalty.", dwell: 0 }
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
    rearCoast: "slalom", limits: "sector", coasting: "braking" });
  const SUGGEST_AT = 3;        // repeats of one tip before the goal is worth naming
  // METRES either side of an apex that still count as that turn — not a lap
  // FRACTION, which is a different distance on every circuit: 5% of a lap is
  // 350 m at Spa and 170 m at Monaco, so the same rule would file a tip from
  // the middle of a straight under a turn on one track and not on another.
  const TURN_WINDOW_M = 150;
  // A corner has to cost this much before the lap report names it. Below it the
  // difference is noise in the reference lap, and naming it is nagging.
  const MIN_LOSS_S = 0.2;
  // The practice goals as the picker names them, so the review can point at a
  // goal by the label the driver will actually look for. One list, two readers.
  const GOALS = Object.freeze([["free", "FREE PRACTICE"], ["sector", "SECTOR"], ["corner", "CORNER"], ["lap", "FULL LAP"],
    ["braking", "BRAKING"], ["trail", "TRAIL BRAKING"], ["slalom", "SLALOM"], ["launch", "LAUNCH"]]);
  function create(G) {
    const insights = RaceInsights.create(G);
    let enabled = G.store.get("drivingCoach", false), elapsed = 0, quiet = 0;
    let trace = [], checkpoint = null, practice = false, drillMode = "free";
    let clock = 0, candidate = "", held = 0, latest = null, warnSeen = null, edge = null;
    const lastTip = new Map(), tipCounts = new Map();
    let log = [];   // one row per tip: which tip, which turn, when — the session's map
    // --- where the lap went, against your own best lap ---------------------
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
      if (enabled && worst.lost >= MIN_LOSS_S && coachState() !== "off" && !G.paused)
        G.announce("TURN " + worst.turn + " COST " + worst.lost.toFixed(2) + "S", 3, "coach");
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
      for (const b of bs) {
        if (!crossed(a, s, b.s)) continue;
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
    function coachState() {
      if (!enabled) return "off";
      if (!G.player || G.state !== "race") return "ready";
      if (G.player.finished || G.player.retired) return "complete";
      if (G.paused) return "paused";
      if (G.player.pitState && G.player.pitState !== "none") return "pit";
      if (G.announceBusy || G.cautionInfo().level > 0 || G.player.contactT > 0) return "waiting";
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
      return { enabled: !!enabled, state: coachState(), latest: latest && { ...latest }, counts,
        total: counts.reduce((n, row) => n + row.count, 0),
        turns: Array.from(spots, ([turn, count]) => ({ turn, count })).sort((a, b) => b.count - a.count || a.turn - b.turn),
        suggest: repeated ? { id: repeated.id, label: repeated.label, count: repeated.count, mode: TRAINS[repeated.id],
          goal: RaceInsights.DRILLS[TRAINS[repeated.id]],
          goalLabel: (GOALS.find(g => g[0] === TRAINS[repeated.id]) || [, TRAINS[repeated.id]])[1] } : null };
    }
    function clearCandidate() { candidate = ""; held = 0; }
    function status() {
      const c = G.player;
      if (!c) return null;
      const ghostSpeed = Ghost.speedAt ? Ghost.speedAt(c.lapTime) : null;
      return { time: G.raceT, speed: c.speed, steer: c.steerAngle || 0, brake: c.brakeDemand || 0,
        throttle: c.throttleDemand || 0, command: c.steerCommand || 0,
        slipFront: c.slipFront || 0, slipRear: c.slipRear || 0, frontUtil: c.frontUtil || 0, rearUtil: c.rearUtil || 0,
        forceFront: c.forceFront || 0, forceRear: c.forceRear || 0, lateralAccel: c.lateralAccel || 0,
        longitudinalUse: c.axFrac || 0, brakeUse: brakeUse(c), yawRate: c.yawRateCur || 0, energy: c.energy,
        wetness: G.roadWetness(), practice, enabled, coach: feedback(), insights: insights.summary(),
        lapReport: lapReport && { ...lapReport, worst: { ...lapReport.worst }, segments: lapReport.segments.map(r => ({ ...r })) },
        ghostSpeedDelta: ghostSpeed == null ? null : c.speed - ghostSpeed };
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
      if ((c.frontUtil || 0) > 0.9 && Math.abs(c.slipFront || 0) > 0.06 && Math.abs(c.steerAngle || 0) > 0.025) return "front";
      // Open flaps cost downforce exactly where the car is leaning on it (game.js
      // aeroGrip); auto aero closes them itself, so this only reaches a manual driver.
      if ((c.aeroX || 0) > 0.5 && Math.abs(c.lateralAccel || 0) > 6 && c.speed > G.vTop() * 0.4) return "xmode";
      if (brake <= 0.02 && throttle <= 0.02 && c.speed > G.vTop() * 0.4) return "coasting";
      return "";
    }
    function advice(c) { const id = tipFor(c); return id ? TIPS[id].text : ""; }
    function update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      // A suspended frame is not sustained driving evidence.
      const step = Math.min(dt, 0.1);
      clock += step; elapsed += step; quiet = Math.max(0, quiet - step);
      // Every frame, not every sample: a boundary crossing is an edge, and at
      // racing speed a 0.1 s sample step steps over 7 m of road.
      if (G.state === "race" && G.player) trackLap(G.player); else prevS = null;
      if (elapsed >= 0.1) {
        elapsed %= 0.1;
        insights.update(G.player);
        if (enabled || practice) {
          const s = status();
          if (s) { trace.push(s); if (trace.length > 600) trace.shift(); }
        }
      }
      // Track limits is an EVENT, not a sustained state: the game only announces
      // the warning ladder in the broadcast HUD, so the coach explains it here.
      // Held for 3 s so a race message can clear first; the first sighting and
      // the reset after a penalty (already announced) are not new warnings.
      const warn = G.player ? (G.player.cutWarn || 0) : 0;
      if (warnSeen == null || warn < warnSeen) warnSeen = warn;
      else if (warn > warnSeen) { warnSeen = warn; edge = { id: "limits", t: 3 }; }
      if (edge && (edge.t -= step) <= 0) edge = null;
      if (coachState() !== "watching" || quiet) { clearCandidate(); return; }
      const id = edge ? edge.id : tipFor(G.player);
      if (!id || clock - (lastTip.get(id) ?? -Infinity) < 30) { clearCandidate(); edge = null; return; }
      if (candidate !== id) { candidate = id; held = 0; }
      held += step;
      if (held + 1e-9 < TIPS[id].dwell) return;
      const tip = TIPS[id], turn = turnAt();
      latest = { id, text: tip.text, detail: tip.detail, time: G.raceT, turn };
      tipCounts.set(id, (tipCounts.get(id) || 0) + 1); lastTip.set(id, clock);
      log.push({ id, turn, time: G.raceT }); if (log.length > 200) log.shift();
      G.announce(tip.text, 2.5, "coach"); quiet = 8; clearCandidate(); edge = null;
    }
    const goal = () => RaceInsights.DRILLS[drillMode].toUpperCase();
    function canPractice() { return !!(G.timeTrial && !G.daily.isActive() && !G.netPlay.active() && G.player && G.state === "race"); }
    function mark() {
      if (!canPractice()) return false;
      if (!insights.startDrill(drillMode)) return false;
      // Single-car practice checkpoint, not a whole-world rewind. Never restore
      // a career, a remote car, or a queued race settlement.
      const c = G.player, fields = {};
      for (const k of Object.keys(c)) if (c[k] == null || ["number", "boolean", "string"].includes(typeof c[k])) fields[k] = c[k];
      const objects = {};
      for (const k of ["tyre", "tyreLog", "pitNext"]) objects[k] = c[k] == null ? c[k] : JSON.parse(JSON.stringify(c[k]));
      checkpoint = { fields, objects, mode: drillMode };
      practice = true; G.records.invalidate();
      G.announce("PRACTICE: " + goal() + " — LAPS NOT SAVED", 3, "practice");
      return true;
    }
    function retry() {
      if (!checkpoint || !canPractice()) return false;
      IncidentSim.reset(); DebrisWorld.reset();
      for (const k of Object.keys(G.player)) {
        const v = G.player[k];
        if ((v == null || ["number", "boolean", "string"].includes(typeof v)) && !Object.hasOwn(checkpoint.fields, k)) delete G.player[k];
      }
      Object.assign(G.player, checkpoint.fields);
      for (const [k, v] of Object.entries(checkpoint.objects)) G.player[k] = v == null ? v : JSON.parse(JSON.stringify(v));
      G.player.incidentInvalidLap = true; G.player._prevS = G.player.s;
      G.player.rPrevPx = G.player.px; G.player.rPrevPz = G.player.pz;
      G.player.rPrevHead = G.player.head; G.player.rPrevS = G.player.s; G.player.rPrevX = G.player.x;
      G.records.invalidate(); trace = []; quiet = 2; clearCandidate();
      drillMode = checkpoint.mode;
      insights.startDrill(drillMode);
      G.announce("TRY AGAIN: " + goal(), 2, "practice");
      return true;
    }
    function reset() {
      checkpoint = null; practice = false; trace = []; elapsed = 0; quiet = 0; warnSeen = null; edge = null;
      clock = 0; latest = null; log = []; clearCandidate(); lastTip.clear(); tipCounts.clear(); insights.reset();
      prevS = null; lastMark = null; segs = []; lapReport = null;
    }
    function downloadTrace() {
      const blob = new Blob([JSON.stringify({ physics: PhysicsConsts.REVISION, configuration: G.records.config(), rows: trace,
        aiDecisions: (G.cars || []).filter(c => !c.human && c.passPlan).map(c => ({ driver: c.code, ...c.passPlan })),
        journal: insights.journal(), forecast: insights.forecast(), practice: insights.summary() }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = "apex26-driving-trace.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function toggle() { enabled = !enabled; clearCandidate(); G.store.set("drivingCoach", enabled); paint(); return enabled; }
    const $ = G.$;
    function paint() {
      SettingRow.paint($("pm-coach"), enabled ? "on" : "off");
      const coaching = feedback(), coachStatus = $("pm-coach-status"), coachTip = $("pm-coach-tip"), coachSummary = $("pm-coach-summary");
      if (coachStatus) coachStatus.textContent = { off: "Coach off. Turn it on for driving tips.", ready: "Ready for your next drive.",
        paused: "Coach paused with the game.", waiting: "Waiting for flags, traffic incidents and race messages to clear.",
        pit: "Tips resume after you leave the pits.", complete: "Session complete. Your latest tip is below.", watching: "Watching your driving. Tips appear only when needed." }[coaching.state];
      if (coachTip) coachTip.textContent = coaching.latest
        ? (coaching.latest.turn ? "Turn " + coaching.latest.turn + ": " : "") + coaching.latest.text + ". " + coaching.latest.detail
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
      SettingRow.paint($("pm-drill"), drillMode);
      SettingRow.disable($("pm-drill"), !canPractice());
      const practiceState = $("pm-practice-state");
      if (practiceState) practiceState.textContent = !canPractice()
        ? "Checkpoints are available in solo Time Trial. Start one from the main menu; races, daily challenges and multiplayer do not support checkpoints."
        : practice ? "Practice active: laps and ghosts will not be saved. TRY AGAIN, or the RECOVER key while driving, restores your saved car state and practice goal. Restart the session to set records again."
          : "Saving a starting point makes this session unscored: laps and ghosts will not be saved. Restart the session to set records again.";
      const drillInfo = $("pm-drill-status"), summary = insights.summary();
      if (drillInfo) {
        const guide = { free: "Repeat any section at your own pace.", sector: "Finish the next sector without contact or leaving the track.",
          corner: "Drive through the next corner and out the other side. The result shows your time, minimum speed and exit speed.",
          lap: "Cross the start line to begin timing, then complete one full lap without contact or leaving the track. Practice laps are not saved, so this is how to time one.",
          braking: "Build speed before saving, then brake firmly and keep braking until the car stops. Coasting to a stop does not count.",
          trail: "Build speed before saving. Brake firmly, keep some brake on as the car turns in, then release it while the car is still turning.",
          slalom: "Make six direction changes while moving: the car must change direction, not just the stick. Stay on the track and avoid contact.",
          launch: "Stop the car before saving, then launch to racing speed. Timed from your first throttle." };
        const fmt = (mode, s) => mode === "braking" ? s.toFixed(0) + " m" : mode === "lap" ? G.fmtTime(s) : mode === "launch" ? s.toFixed(2) + "s" : s.toFixed(1) + "s";
        const last = summary.lastDrill, tries = insights.attempts(drillMode), clean = tries.filter(a => a.clean), saved = insights.mastery(drillMode);
        drillInfo.textContent = guide[drillMode]
          + (last && last.mode === drillMode ? " Last attempt: " + (last.clean ? "completed · " + last.text : "retry suggested · " + last.reason) + "." : "")
          + (tries.length ? " This session: " + tries.length + " attempt" + (tries.length === 1 ? "" : "s") + ", " + clean.length + " clean"
            + (clean.length ? ", best " + fmt(drillMode, Math.min(...clean.map(a => a.score))) : "") + "." : "")
          + (saved ? " Saved best: " + fmt(drillMode, saved.best) + " over " + saved.completed + " clean run" + (saved.completed === 1 ? "" : "s") + "." : "");
      }
      const f = insights.forecast(), strategy = $("pm-stint-forecast");
      if (strategy) strategy.textContent = !G.tyres.on() ? "Enable tyre wear for stint forecasts." : !f || f.remainingLaps == null ? "Drive at least half a lap on this set for a tyre-life estimate."
        : "Tyre life ≈ " + f.remainingLaps.toFixed(1) + " laps · " + (f.reachesFinish ? "projected to reach the finish" : "another stop may be needed")
          + (f.paybackLaps == null ? "" : " · estimated stop payback " + f.paybackLaps.toFixed(1) + " laps") + " · " + f.confidence + " confidence";
      const energy = $("pm-energy-forecast");
      if (energy) energy.textContent = !f || f.energyPerLap == null ? "Complete clean sectors to learn your energy use."
        : "Net energy per lap: " + (f.energyPerLap * 100).toFixed(1) + "%" + (f.energyLaps == null ? " · current pattern sustains charge" : " · charge lasts ≈ " + f.energyLaps.toFixed(1) + " laps") + " · estimated from recent sectors";
      const net = insights.network(), connection = $("pm-connection");
      if (connection) { connection.hidden = !net; connection.textContent = net ? net.text : ""; }
      const journal = $("pm-incident-log");
      if (journal) {
        journal.textContent = "";
        for (const e of insights.journal().slice(-20)) { const li = document.createElement("li"); li.textContent = e.time.toFixed(1) + "s · " + e.text; journal.appendChild(li); }
      }
      const decisions = $("pm-ai-decisions");
      if (decisions) {
        decisions.textContent = "";
        for (const c of G.cars || []) if (!c.human && c.passPlan) {
          const li = document.createElement("li"), p = c.passPlan;
          li.textContent = c.code + " · " + p.reason + " · left: " + p.left.reason + " · right: " + p.right.reason;
          decisions.appendChild(li);
        }
      }
      const note = $("pm-pit-estimate");
      const names = new Map(G.pits.ownedTyres().map(o => [o.id, o.label]));
      const compoundName = id => names.get(id) || id.replace(/_/g, " ");
      const selected = G.player && G.player.pitNext;
      const pitHelp = $("pm-pit-help");
      if (pitHelp) pitHelp.textContent = (selected ? "Next stop: " + compoundName(selected.id) + " (" + selected.code + "). " : "AUTO lets the game choose your next tyres. ")
        + "Drive into the pit entry to stop. Choosing tyres does not call you into the pits. Requires tyre wear to be enabled.";
      SettingRow.paint($("pm-pit-choice"), G.player && G.player.pitNext ? G.player.pitNext.id : "auto",
        [["auto", "AUTO"], ...G.pits.choices(G.player).map(r => [r.id, r.code + " · " + compoundName(r.id)])]);
      SettingRow.disable($("pm-pit-choice"), !(G.player && G.tyres.on() && G.state === "race") || G.player.pitState === "box");
      if (note) {
        const e = G.player && G.tyres.on() && G.pits.estimate(G.player);
        note.textContent = e ? "Estimated pit loss: " + e.lossS.toFixed(1) + "s" + (e.gapS == null ? "" : " · gap behind: " + e.gapS.toFixed(1) + "s") : "Pit strategy is available with tyre wear enabled.";
      }
    }
    const bind = (id, fn) => { const b = $(id); if (b) b.onclick = () => { fn(); paint(); }; };
    bind("pm-driving-trace", downloadTrace);
    bind("pm-practice-set", mark); bind("pm-practice-retry", retry);
    SettingRow.wire($("pm-coach"), { values: [["off", "OFF"], ["on", "ON"]],
      read: () => enabled ? "on" : "off", write: v => { if ((v === "on") !== !!enabled) toggle(); } });
    SettingRow.wire($("pm-drill"), { values: GOALS.map(g => g.slice()),
      read: () => drillMode, write: v => { if (Object.hasOwn(RaceInsights.DRILLS, v)) drillMode = v; paint(); } });
    SettingRow.wire($("pm-pit-choice"), { read: () => G.player && G.player.pitNext ? G.player.pitNext.id : "auto",
      write: v => { G.pits.selectNext(G.player, v); paint(); } });
    const menu = $("pmsettings"), panel = $("pm-panel-driving");
    if (menu && panel && typeof MutationObserver === "function") {
      const observer = new MutationObserver(() => { if (!menu.hidden && !panel.hidden) paint(); });
      observer.observe(menu, { attributes: true, attributeFilter: ["hidden"] });
      observer.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    }
    return { update, status, feedback, advice, mark, retry, reset, toggle, paint, practiceActive: () => practice,
      trace: () => trace.map(row => ({ ...row })), insights };
  }
  return { create };
})();
Object.freeze(DrivingCoach);
