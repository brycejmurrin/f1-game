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
  const brakeUse = c => Math.min(1, Math.max(0, -(c.axEstSm || 0) / PhysicsConsts.BRAKE));
  const TRAINS = Object.freeze({ trail: "trail", rearBrake: "trail", front: "corner", power: "corner",
    rearCoast: "slalom", limits: "sector", coasting: "braking", tyres: "corner" });
  const APPROACH = Object.freeze({ trail: "RELEASE THE BRAKE AS YOU TURN", rearBrake: "RELEASE THE BRAKE SMOOTHLY",
    power: "BUILD THROTTLE SMOOTHLY ON EXIT", front: "AVOID ADDING STEERING IF THE FRONTS SLIDE",
    rearCoast: "KEEP YOUR INPUTS SMOOTH", xmode: "CLOSE STRAIGHT MODE BEFORE TURNING", limits: "STAY INSIDE THE WHITE LINES" });
  const SUGGEST_AT = 3;
  const TURN_WINDOW_M = 150;
  const MIN_LOSS_S = 0.2;
  const TYRE_SHARE = 0.15, TYRE_FAST_K = 1.1, TYRE_EVERY = 3;
  const GOALS = DrivingCoach.GOALS;
  function create(G) {
    const insights = RaceInsights.create(G);
    let enabled = G.store.get("drivingCoach", false), elapsed = 0, quiet = 0;
    let trace = [], checkpoint = null, practice = false, drillMode = "free";
    const REWIND_HZ = 2, REWIND_S = 10, REWIND_KEEP = (REWIND_S + 2) * REWIND_HZ;
    let rewindBuf = [], rewindAcc = 0;
    let clock = 0, candidate = "", held = 0, latest = null, warnSeen = null, edge = null;
    const lastTip = new Map(), tipCounts = new Map();
    let reminderAt = 0, reminders = 0, pendingReport = null;
    const reminded = new Map();
    let tyreAcc = null;
    const tyreSaid = new Map();
    let log = [];
    let bounds = null, boundKey = "", prevS = null, lastMark = null;
    let segs = [], lapReport = null;
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
    const crossed = (a, b, x) => b >= a ? (x > a && x <= b) : (x > a || x <= b);
    function closeLapReport() {
      const rows = segs; segs = [];
      if (rows.length < 2) return;
      const worst = rows.reduce((m, r) => r.lost > m.lost ? r : m);
      lapReport = { total: rows.reduce((n, r) => n + r.lost, 0), worst: { ...worst },
        segments: rows.slice().sort((a, b) => b.lost - a.lost).map(r => ({ ...r })) };
      if (enabled && worst.lost >= MIN_LOSS_S)
        pendingReport = { text: "TURN " + worst.turn + " COST " + worst.lost.toFixed(2) + "S", expires: clock + 12 };
    }
    function trackLap(c) {
      const bs = cornerBounds();
      if (!bs || !c || !Ghost.timeAt) { prevS = c ? c.s : null; return; }
      const s = c.s, a = prevS, total = G.track.total;
      prevS = s;
      if (a == null || !Number.isFinite(s)) return;
      if ((((s - a) % total) + total) % total > total * 0.5) { lastMark = null; segs = []; return; }
      if (G.cautionLevel() > 0 || (c.pitState && c.pitState !== "none")) { lastMark = null; segs = []; return; }
      for (const b of bs) {
        if (!crossed(a, s, b.s)) continue;
        const g = Ghost.timeAt(b.s), now = { turn: b.turn, t: G.raceT, g };
        if (lastMark && lastMark.g != null && g != null && now.t > lastMark.t) {
          let ref = g - lastMark.g;
          if (ref < 0) ref += Ghost.bestTime ? Ghost.bestTime() : 0;
          if (ref > 0) segs.push({ turn: lastMark.turn, lost: (now.t - lastMark.t) - ref });
        }
        lastMark = now;
        if (b.turn === 1) closeLapReport();
      }
    }
    function turnAt() {
      const t = G.track, turns = t && t.def && t.def.turns, c = G.player;
      if (!turns || !turns.length || !c || !(t.total > 0)) return null;
      const f = (((c.s / t.total) % 1) + 1) % 1;
      let best = null, bestD = Infinity;
      for (let i = 0; i < turns.length; i++) {
        const raw = (((f - turns[i]) % 1) + 1) % 1;
        const d = Math.abs(raw > 0.5 ? raw - 1 : raw) * t.total;
        if (d < bestD) { bestD = d; best = i + 1; }
      }
      return bestD <= TURN_WINDOW_M ? best : null;
    }
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
      const rearSliding = (c.rearUtil || 0) > 0.9 && Math.abs(c.slipRear || 0) > 0.06
        && (c.rearUtil || 0) > (c.frontUtil || 0) + 0.08;
      if (rearSliding) return brake > 0.1 ? "rearBrake" : throttle > 0.1 ? "power" : "rearCoast";
      if (brake > 0.1 && brakeUse(c) > 0.8 && Math.abs(c.steerAngle || 0) > 0.025) return "trail";
      if (!c._coachAssisted && !c.incidentInvalidLap && c.dnf !== "dns" && c.dnfWhy !== "dns"
          && brake <= .02 && throttle > .1 && (c.wake || 0) > .5 && c._dirtyAirMul < .98
          && c._dirtyAirMul > 0 && (c.aeroX || 0) < .1 && (c.frontUtil || 0) > .9
          && Math.abs(c.slipFront || 0) > .06 && Math.abs(c.steerAngle || 0) > .025) return "wake";
      if ((c.frontUtil || 0) > 0.9 && Math.abs(c.slipFront || 0) > 0.06 && Math.abs(c.steerAngle || 0) > 0.025) return "front";
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
    let _s8Done = null;
    function update(dt) {
      const stamp = G._s8Stamp;
      if (stamp != null && stamp === _s8Done) return;
      if (!Number.isFinite(dt) || dt <= 0 || G.paused || puppet()) return;
      if (stamp != null) _s8Done = stamp;
      const step = Math.min(dt, 0.1);
      clock += step; elapsed += step; quiet = Math.max(0, quiet - step);
      if (G.state === "race" && G.player && G.timeTrial) trackLap(G.player); else prevS = null;
      if (canPractice()) {
        rewindAcc += step;
        if (rewindAcc >= 1 / REWIND_HZ) {
          rewindAcc = 0;
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
      const warn = G.player ? (G.player.cutWarn || 0) : 0;
      if (warnSeen == null || warn < warnSeen) warnSeen = warn;
      else if (warn > warnSeen) { warnSeen = warn; if (warn <= 3) edge = { id: "limits", t: 3, life: 12 }; }
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
      if (!G.announce(tip.text, Math.max(2.5, tip.text.split(/\s+/).length * 0.38), "coach")) return;
      latest = { id, text: tip.text, detail: tip.detail, time: G.raceT, turn };
      tipCounts.set(id, (tipCounts.get(id) || 0) + 1); lastTip.set(id, clock);
      log.push({ id, turn, time: G.raceT, lap: G.player.lap }); if (log.length > 200) log.shift();
      quiet = 8; clearCandidate(); edge = null;
    }
    const goal = () => RaceInsights.DRILLS[drillMode].toUpperCase();
    const onTrack = () => G.state === "race" || G.state === "count";
    function canPractice() { return !!(G.practice && !G.daily.isActive() && !G.netPlay.active() && G.player && onTrack()); }
    const PRIM = (v) => v == null || ["number", "boolean", "string"].includes(typeof v);
    const DEEP = ["tyre", "tyreLog", "pitNext", "pitPlan"];
    function jsonClone(v) {
      if (v === null) return null;
      const t = typeof v;
      if (t === "number") return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
      if (t !== "object") return t === "function" || t === "undefined" ? undefined : v;
      if (Array.isArray(v)) {
        const out = new Array(v.length);
        for (let i = 0; i < v.length; i++) {
          const x = jsonClone(v[i]);
          out[i] = x === undefined ? null : x;
        }
        return out;
      }
      if (typeof v.toJSON === "function") return jsonClone(v.toJSON());
      const out = {};
      for (const k of Object.keys(v)) {
        const x = jsonClone(v[k]);
        if (x !== undefined) out[k] = x;
      }
      return out;
    }
    function captureCar(c) {
      const fields = {};
      for (const k of Object.keys(c)) if (PRIM(c[k])) fields[k] = c[k];
      const objects = {};
      for (const k of DEEP) objects[k] = c[k] == null ? c[k] : jsonClone(c[k]);
      return { fields, objects };
    }
    const KEEP_FORWARD = ["penalty", "cuts", "cutWarn", "hits", "wallHits", "hitSev", "human", "local", "isPlayer"];
    function applyCar(c, snap, keepForward) {
      const keep = {};
      if (keepForward) for (const k of KEEP_FORWARD) if (Object.hasOwn(c, k)) keep[k] = c[k];
      for (const k of Object.keys(c)) if (PRIM(c[k]) && !Object.hasOwn(snap.fields, k)) delete c[k];
      Object.assign(c, snap.fields, keep);
      for (const [k, v] of Object.entries(snap.objects)) c[k] = v == null ? v : jsonClone(v);
      c._prevS = c.s;
      c.rPrevPx = c.px; c.rPrevPz = c.pz;
      c.rPrevHead = c.head; c.rPrevS = c.s; c.rPrevX = c.x;
    }
    function captureWorld() {
      const cars = (G.cars || []).map((c) => captureCar(c));
      return { cars, raceT: G.raceT, sectorIdx: G.sectorIdx, sectorStartT: G.sectorStartT,
        sectorBests: Array.isArray(G.sectorBests) ? G.sectorBests.slice() : null,
        sectorLast: Array.isArray(G.sectorLast) ? G.sectorLast.slice() : null };
    }
    function restoreWorld(w) {
      IncidentSim.reset(); DebrisWorld.reset();
      const cars = G.cars || [];
      for (let i = 0; i < cars.length && i < w.cars.length; i++)
        applyCar(cars[i], w.cars[i], cars[i].isPlayer);
      if (Number.isFinite(w.raceT)) G.raceT = w.raceT;
      G.resultT = 0;
      if (Number.isFinite(w.sectorIdx)) G.sectorIdx = w.sectorIdx;
      if (Number.isFinite(w.sectorStartT)) G.sectorStartT = w.sectorStartT;
      if (w.sectorBests) G.sectorBests = w.sectorBests.slice();
      if (w.sectorLast && Array.isArray(G.sectorLast)) {
        G.sectorLast.length = 0;
        for (const v of w.sectorLast) G.sectorLast.push(v);
      }
      if (G.player) G.player.incidentInvalidLap = true;
      G.records.invalidate(); trace = []; quiet = 2; clearCandidate();
    }
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
      insights.startDrill(drillMode);
      G.announce("TRY AGAIN: " + goal(), 2, "practice");
      return true;
    }
    function rewind() {
      if (typeof SetupTrials !== "undefined") SetupTrials.invalidate("Rewind invalidates a measured attempt");
      if (!canPractice() || !rewindBuf.length) return false;
      const e = rewindBuf.shift();
      rewindBuf = [];
      rewindAcc = 0;
      practice = true;
      const n = (G.cars || []).length;
      restoreWorld(e.world);
      insights.startDrill(drillMode);
      G.announce("REWIND " + Math.round(clock - e.t) + "s" + (n > 1 ? " — FULL GRID" : ""), 2, "practice");
      return true;
    }
    function reset() {
      for (const mode of pathwayModes) { const check = $("pm-pathway-check-" + mode); if (check) check.checked = false; }
      if (typeof SetupTrials !== "undefined") SetupTrials.invalidate("Session reset before attempt completed");
      checkpoint = null; practice = false; trace = []; elapsed = 0; quiet = 0; warnSeen = null; edge = null;
      rewindBuf = []; rewindAcc = 0; reminded.clear(); reminderAt = 0; reminders = 0; pendingReport = null; tyreAcc = null; tyreSaid.clear();
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
        : "Last lap: " + (lapReport.total >= 0 ? lapReport.total.toFixed(2) + "s slower than" : Math.abs(lapReport.total).toFixed(2) + "s faster than")
          + " your best, measured corner by corner. "
          + lapReport.segments.slice(0, 2).map(r => "Turn " + r.turn + " " + (r.lost >= 0 ? "+" : "") + r.lost.toFixed(2) + "s").join(", ")
          + ". Each figure covers the corner and the straight after it, because exit speed is paid for at the apex.";
      if (coachSummary) coachSummary.textContent = coaching.total ? coaching.total + " tip" + (coaching.total === 1 ? "" : "s")
        + " recorded this session. " + coaching.counts.map(r => r.label + ": " + r.count).join(" · ") + "."
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
          backmarkers: "Save before slower traffic, then clear three slower cars without contact or leaving the track." };
        const fmt = (mode, s) => mode === "braking" ? s.toFixed(0) + " m" : mode === "lap" ? G.fmtTime(s) : mode === "launch" ? s.toFixed(2) + "s"
          : mode === "start" ? (-s >= 0 ? "+" : "") + (-s) + (Math.abs(s) === 1 ? " place" : " places") : s.toFixed(1) + "s";
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
    function armPractice() {
      if (G.timeTrial || G.daily.isActive() || G.netPlay.active()) return false;
      if (G.flow === "season" || G.flow === "career") return false;
      if (!onTrack() || !G.player) return false;
      if (G.practice) return true;
      G.practice = true; G.records.invalidate();
      G.announce("PRACTICE ARMED — THIS SESSION IS NOT SCORED", 3, "practice");
      return true;
    }
    function canArm() { return !!(!G.timeTrial && !G.daily.isActive() && !G.netPlay.active() && onTrack() && G.player && !G.practice && G.flow !== "season" && G.flow !== "career"); }
    return { update, status, feedback, advice, beginSetupTrial, mark, retry, rewind, reset, toggle, paint, armPractice, canArm,
      practiceGoal: () => drillMode, setPracticeGoal,
      canPractice, rewindReady: () => canPractice() && rewindBuf.length > 0,
      practiceActive: () => practice, isEnabled: () => !!enabled, downloadTrace,
      trace: () => trace.map(row => ({ ...row })), insights };
  }
  return { create };
})();
Object.freeze(DrivingCoachBody);
