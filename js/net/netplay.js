"use strict";

const NetPlay = (function () {
  const PUBLISH_HZ = 20;
  const PUBLISH_MS = 1000 / PUBLISH_HZ;
  const INTERP_DELAY_MS = 100;
  const AI_EVERY = 2;
  const STALE_MS = 2000;
  const RELAY_FRESH_MS = 500;
  const RACE_GRACE_MS = 25000;
  const SpectatePolicy = typeof NetSpectate !== "undefined" ? NetSpectate : Object.freeze({
    DRIVER: "driver", SPECTATOR: "spectator",
    kind: (peer) => ((typeof peer === "string" ? peer : peer && (peer.kind || peer.role)) === "spectator" ? "spectator" : "driver"),
    isSpectator(peer) { return this.kind(peer) === this.SPECTATOR; },
    canPublish: (role) => role !== "spectator",
  });

  const EV = {
    MODEL: "model", STRATEGY: "strategy",
    HELLO: "hello",
    SETTINGS: "settings",
    READY: "ready",
    GO: "go",
    START: "start",
    ARMED: "armed",
    QUALI: "quali",
    QLIVE: "qlive",
    LAP: "lap",
    RESULT: "result",
    CAUTION: "caution",
    BYE: "bye",
    LEFT: "left",
  };

  const X_LIMIT = 200, SPEED_LIMIT = 200;
  function clampWire(st, total, lapsTarget, out) {
    out = out || {};
    const _s = Number(st.s), _lap = Number(st.lap);
    const _head = +st.head, _x = +st.x, _sp = +st.speed;
    out.s = Number.isFinite(_s) ? Math.min(Math.max(_s, 0), total || _s) : 0;
    out.lap = Number.isFinite(_lap) ? Math.min(Math.max(Math.floor(_lap), 0), (lapsTarget || 0) + 1) : 0;
    out.head = Number.isFinite(_head) ? Math.atan2(Math.sin(_head), Math.cos(_head)) : 0;
    out.x = Number.isFinite(_x) ? Math.min(Math.max(_x, -X_LIMIT), X_LIMIT) : 0;
    out.speed = Number.isFinite(_sp) ? Math.min(Math.max(_sp, -SPEED_LIMIT), SPEED_LIMIT) : 0;
    out.gear = Math.min((typeof PhysicsConsts !== "undefined" && PhysicsConsts.GEARS) || 8, Math.max(1, st.gear | 0));
    out.deploying = !!st.deploying;
    out.offroad = !!st.offroad;
    out.onKerb = !!st.onKerb;
    out.braking = !!st.braking;
    out.extrapolated = !!st.extrapolated;
    return out;
  }

  const MID_LO = 0.25, MID_HI = 0.75;
  function gateLap(c, st, total, now) {
    const prev = Math.max(0, Math.floor(Number(c.lap) || 0));
    let lap = prev;
    if (!(total > 0)) lap = Math.min(st.lap, prev);
    else if (st.lap === prev) lap = prev;
    else if (st.lap < prev) { lap = st.lap; c._nMid = true; c._nRiseT = null; }
    else if (Number.isFinite(c.s) && c.s - st.s > total * 0.5 && (prev === 0 || c._nMid)
             && !(Number.isFinite(now) && Number.isFinite(c._nRiseT) && now - c._nRiseT < total / SPEED_LIMIT)) {
      lap = prev + 1;
      c._nMid = false;
      c._nRiseT = now;
    }
    if (total > 0 && st.s > total * MID_LO && st.s < total * MID_HI) c._nMid = true;
    return lap;
  }
  const FIN_SLACK_S = 5;
  const POSE_AGE_MAX_MS = 100;
  function finishLap(lap) {
    const n = Number(lap), top = (G_lapsTarget() || 0) + 1;
    return Number.isFinite(n) && n >= 1 ? Math.min(top, Math.floor(n)) : top;
  }
  let G_lapsTarget = () => 0;
  const LAP_RATE = 4, STRATEGY_RATE = 8;
  function lapTimeOk(t, total) {
    return Number.isFinite(t) && t > (total > 0 ? total / SPEED_LIMIT : 0) && t < QUALI_MAX_S;
  }

  const {
    validQuali, validQualiLive, rateGate, bindQuali, qualiReporters,
    QUALI_MIN_S, QUALI_MAX_S, QUALI_RATE, QUALI_GUEST_RATE, EVENT_WINDOW_MS,
  } = QualiWire.create(EV);
  function validClassification(rows, cars) {
    if (!Array.isArray(rows) || !Array.isArray(cars) || rows.length !== cars.length) return false;
    const ids = new Set(cars.map((c) => c.driverId));
    if (ids.size !== cars.length) return false;
    const seen = new Set();
    for (const e of rows) {
      if (!e || !ids.has(e.d) || seen.has(e.d) ||
          (e.t != null && (!Number.isFinite(e.t) || e.t < 0)) ||
          (e.p != null && (!Number.isFinite(e.p) || e.p < 0)) ||
          (e.lap != null && (!Number.isInteger(e.lap) || e.lap < 0 || e.lap > 255)) ||
          (e.classified != null && typeof e.classified !== "boolean")) return false;
      seen.add(e.d);
    }
    return true;
  }
  let epochSerial = 0;
  const { strategyState, applyStrategy, STRATEGY_VERSION, modelRevision } = StrategyWire.create();

  function create(G) {
    G_lapsTarget = () => G.lapsTarget;
    const sessions = new Map(), peerEpochs = new Map();
    const sessionKinds = new Map(), peerInfo = new Map();
    const peerKind = (peer) => SpectatePolicy.kind(peer);
    let epoch = null;
    function broadcastStrategy(data) {
      let head = null;
      for (const [id, s] of sessions) {
        const to = peerEpochs.get(id);
        if (!to) continue;
        if (head === null) head = JSON.stringify(data).slice(0, -1) + ',"epoch":';
        try { s.sendEvent(EV.STRATEGY, { ...data, epoch: to }, head + JSON.stringify(to) + "}"); } catch (e) {  }
      }
    }
    const _pumpBuf = [];
    const _sessBuf = [];
    const _remoteBuf = [];
    const sessionList = () => {
      _sessBuf.length = 0;
      for (const s of sessions.values()) _sessBuf.push(s);
      return _sessBuf;
    };
    const remoteList = () => {
      _remoteBuf.length = 0;
      for (const r of remotes.values()) _remoteBuf.push(r);
      return _remoteBuf;
    };
    const PEER_ONE = "peer";
    let session = null;
    function broadcast(type, data) {
      let ok = false, dj;
      try { dj = data === undefined ? "null" : JSON.stringify(data); } catch (e) { dj = undefined; }
      for (const s of sessionList()) { try { ok = s.sendEvent(type, data, dj) || ok; } catch (e) {  } }
      return ok;
    }
    const peerCar = new Map();
    const remoteFor = (id) => (peerCar.has(id) ? peerCar.get(id) : null);
    let role = null;
    let active = false;
    let localCar = null;
    let raceOpts = null;
    const remotes = new Map();
    const aiRemotes = new Map();
    let publishN = 0;
    let aiReplicated = false;
    function makeRemote(car, opts, extra) {
      return Object.assign({
        car, profile: null, heardAt: null, everHeard: false, stale: false, hostAi: false,
        interp: NetSnapshot.createInterp({
          total: G.track.total,
          delayMs: opts.interpDelayMs != null ? opts.interpDelayMs : INTERP_DELAY_MS,
          adaptive: opts.interpDelayMs == null,
        }),
      }, extra || null);
    }
    function scrubForHandBack(car) {
      car._nOk = false;
      car.dnfAt = null; car.dnfWhy = null;
      car.incidentInvalidLap = true; car.lapTime = 0; car._secT0 = null;
    }
    function goLocal(r) {
      r.stale = true;
      if (!r.hostAi) { r.car._nOwnerLap = r.car.lap; r.car._nOwnerS = r.car.s; r.car._nFallback = true; }
      if (!r.hostAi) G.setCarRole(r.car, false, false);
      r.car.netInput = null;
      scrubForHandBack(r.car);
    }
    function goWire(r) {
      r.stale = false;
      if (!r.hostAi) {
        r.car.lap = r.car._nOwnerLap; r.car.s = r.car._nOwnerS;
        r.car._nFallback = false;
      }
      if (!r.hostAi) G.setCarRole(r.car, true, false);
    }
    let lastPublish = -Infinity, lastStrategy = -Infinity;
    const aiStrategyPhases = new Map();
    let lastPhaseA = null, lastPhaseB = null, lastPhaseC = null, lastFitted = null, lastNext = null, lastCompound = null;
    let peerProfile = null;
    let lastReason = null;
    let onStop = null;
    function runOnStop(reason) {
      if (reason != null && reason !== "local") return;
      const f = onStop; onStop = null;
      if (f) { try { f(); } catch (e) { Log.warn("net", "play onStop threw: " + (e && e.message)); } }
    }
    let lastSlotFallback = null;
    const PEER_LAPS_CAP = 64;
    let peerLaps = [];
    let peerResult = null;
    let resultCars = null;
    const eventLog = [];

    const _smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 8 };

    function pickRemoteSlot(profile) {
      const cars = G.cars || [];
      const claimed = new Set(remoteList().map((r) => r.car));
      const free = (c) => c && !c.local && !claimed.has(c);
      lastSlotFallback = null;
      if (profile) {
        const exact = cars.find((c) => free(c) && c.team && c.team.id === profile.team && c.seat === profile.driver);
        if (exact) return exact;
        const sameTeam = cars.find((c) => free(c) && c.team && c.team.id === profile.team);
        if (sameTeam) { lastSlotFallback = "team"; return sameTeam; }
        lastSlotFallback = "profile-miss";
        return null;
      }
      lastSlotFallback = "any";
      return cars.find(free) || null;
    }

    function separateGrid() {
      const cars = G.cars || [];
      const at = (pos) => cars.find((c) => c.gridPos === pos);
      const move = (car, pos) => {
        const held = at(pos);
        if (held && held !== car) G.swapGridSlots(car, held);
      };
      const humans = [localCar, ...remoteList().map((r) => r.car)]
        .filter(Boolean)
        .sort((a, b) => G.wireId(a) - G.wireId(b));
      if (humans.length < 2) return;

      if (G.gridPreOrdered) return;

      let first = localCar.gridPos;
      const last = cars.length;
      if (first + humans.length - 1 > last) first = Math.max(1, last - humans.length + 1);
      humans.forEach((c, i) => move(c, first + i));
    }

    const _clamped = {};
    function finishAllowed(lap) {
      return lap > 1 && (role !== "host" || lap > G.lapsTarget ||
        G.cars.some((c) => c.finished && !c.retired));
    }
    function raceTime() { return Number.isFinite(G.netRaceT) ? G.netRaceT : G.raceT; }
    function poseRemote(c, st) {
      st = clampWire(st, (G.track && G.track.total) || 0, G.lapsTarget, _clamped);
      if (role === "host") st.lap = gateLap(c, st, (G.track && G.track.total) || 0, raceTime());
      c.s = st.s;
      c.x = st.x;
      c.xVis = st.x;
      c.head = st.head;
      c.speed = st.speed;
      c.gear = st.gear || 1;
      c.lap = st.lap || 0;
      c.deploying = !!st.deploying;
      c.offroad = !!st.offroad;
      c.onKerb = !!st.onKerb;
      c.braking = !!st.braking;

      const w = G.worldFromTrack(c.s, c.x, _smp);
      c.px = w.x;
      c.pz = w.z;

      const total = (G.track && G.track.total) || 0;
      c.prog = (c.lap - 1) * total + c.s;
      if (c._nFinLap <= G.lapsTarget && Number.isFinite(c._nFin) && Math.abs(c._nFin - raceTime()) > FIN_SLACK_S) {
        c._nFin = null; c._nFinLap = null;
      }
      const finLap = Number.isFinite(c._nFin) && c._nFinLap != null ? c._nFinLap : G.lapsTarget + 1;
      if (!c.finished && !c.retired && G.lapsTarget > 0 && c.lap >= finLap && !st.extrapolated && finishAllowed(finLap)) {
        const pf = c._nFin;
        c.finished = true;
        c.finishT = Number.isFinite(pf) && Math.abs(pf - raceTime()) <= FIN_SLACK_S ? pf : raceTime();
        c._nFin = null; c._nFinLap = null;
        if (role === "host" && finLap <= G.lapsTarget && Number.isFinite(pf)) {
          broadcast(EV.LAP, { lap: finLap, code: c.code, driverId: c.driverId, fin: c.finishT, invalid: true });
        }
      }

      if (G.track) {
        let psi = Math.atan2(_smp.t[0], _smp.t[2]) - c.head;
        while (psi > Math.PI) psi -= Math.PI * 2;
        while (psi < -Math.PI) psi += Math.PI * 2;
        c.yawVis = psi;
      }

      c.rPrevPx = c.px; c.rPrevPz = c.pz;
      c.rPrevS = c.s; c.rPrevX = c.x;
      c.rPrevHead = c.head; c.rPrevYawVis = c.yawVis;
      c._prevS = c.s;
    }

    function onState(pkt, from, fromId, arrivedAt) {
      if (!active || (!remotes.size && !aiRemotes.size)) return;
      if (!pkt || !pkt.cars.length) return;
      const clock = from || session;
      if (!clock) return;
      const t = clock.peerToLocal(pkt.tick);
      let ownOnly = null;
      if (role === "host" && fromId != null) {
        if (sessionKinds.get(fromId) === SpectatePolicy.SPECTATOR) return;
        ownOnly = remoteFor(fromId);
        if (ownOnly == null) return;
      }
      const arrival = Number.isFinite(arrivedAt) ? arrivedAt : G.netNow;
      for (const entry of pkt.cars) {
        if (ownOnly != null && entry.id !== ownOnly) continue;
        const r = remotes.get(entry.id) || aiRemotes.get(entry.id);
        if (r && r.interp.adopt(t - (entry.age || 0), entry, arrival) && r.interp.newest() === entry) {
          r.heardAt = Number.isFinite(arrival) ? arrival : (G.netNow != null ? G.netNow : r.heardAt);
          r.everHeard = true;
        }
      }
    }

    function bindSession(id, s) {
      const hostGate = rateGate(QUALI_RATE), guestGate = rateGate(QUALI_GUEST_RATE);
      const qualiGate = () => (role === "host" ? hostGate : guestGate)();
      const lapGate = rateGate(LAP_RATE), strategyGate = rateGate(STRATEGY_RATE);
      function sendersOwnDriver(d, legacyLap = false) {
        if (sessionKinds.get(id) === SpectatePolicy.SPECTATOR) return false;
        if (role !== "host") return true;
        const wid = remoteFor(id);
        const r = wid != null ? remotes.get(wid) : null;
        return !!(r && r.car && (
          (d.driverId != null && d.driverId === r.car.driverId) ||
          (legacyLap && d.driverId == null && d.code != null && d.code === r.car.code)
        ));
      }
      s.clearHandlers();
      if (typeof s.onSnapshot === "function") s.onSnapshot((pkt, at) => onState(pkt, s, id, at));
      else s.onState((bytes, at) => onState(NetSnapshot.decodeSnapshot(bytes), s, id, at));
      s.onClose((why) => {
        if (closeWhy.has(id)) { why = closeWhy.get(id); closeWhy.delete(id); }
        sessions.delete(id);
        const carFor = remoteFor(id);
        armedPeers.delete(id);
        peerCar.delete(id);
        peerEpochs.delete(id);
        sessionKinds.delete(id);
        peerInfo.delete(id);
        if (!active) {
          session = sessionList()[0] || null;
          return;
        }
        lastReason = why;
        if (role === "host") {
          if (carFor != null) handBackToAI(why, carFor);
          if (carFor != null) { leftWires.set(carFor, why || "peer_closed"); broadcast(EV.LEFT, { wire: carFor, why: why || "peer_closed" }); }
          if (armDeadline && allArmed()) nameTheMoment();
        }
        else stop(why || "peer_closed");
        session = sessionList()[0] || null;
      });
      for (const type of Object.keys(EV)) {
        const name = EV[type];
        s.onEvent(name, (d) => {
          eventLog.push({ type: name, data: d, from: id });
          if (eventLog.length > 32) eventLog.shift();
          if (role === "host" && sessionKinds.get(id) === SpectatePolicy.SPECTATOR && name !== EV.MODEL) return;
          if (role === "host" && ((name === EV.LAP && !lapGate()) || (name === EV.STRATEGY && !strategyGate()))) return;
          if (name === EV.MODEL) {
            if (!d || d.physics !== modelRevision() || d.strategy !== STRATEGY_VERSION) {
              if (role === "host" && sessions.size > 1) {
                if (G.announce) G.announce("A RIVAL IS ON A DIFFERENT GAME VERSION — DROPPED", 4, "info");
                closeWhy.set(id, "incompatible_physics");
                try { s.close(); } catch (e) {  }
                closeWhy.delete(id);
              } else {
                if (G.announce) G.announce("GAME VERSIONS DIFFER — RELOAD BOTH GAMES", 4, "info");
                stop("incompatible_physics");
              }
              return;
            }
            if (typeof d.epoch === "string" && d.epoch.length <= 64) {
              peerEpochs.set(id, d.epoch); lastStrategy = -Infinity;
              if (!d.ack) s.sendEvent(EV.MODEL, { physics: modelRevision(), strategy: STRATEGY_VERSION, epoch, ack: true });
            }
          }
          if (name === EV.STRATEGY && d && d.epoch === epoch && G.track && G.track.def && d.track === G.track.def.id) {
            const fromHost = (role === "guest" || role === SpectatePolicy.SPECTATOR) && s === session;
            const r = remotes.get(d.wire) || (fromHost ? aiRemotes.get(d.wire) : null);
            const authorized = fromHost || (role === "host" && remoteFor(id) === d.wire);
            if (r && authorized && applyStrategy(r.car, d) && role === "host") {
              r.stratHeard = true;
              broadcastStrategy(strategyState(r.car, d.wire, d.track, d.tyreLog === undefined));
            }
          }
          if (name === EV.BYE) {
            lastReason = "bye";
            if (role === "host" && sessions.size > 1) {
              closeWhy.set(id, "bye");
              try { s.close(); } catch (e) {  }
              closeWhy.delete(id);
              lastReason = "bye";
            } else stop("bye");
          }
          if (name === EV.START && d && d.at != null && !ownsRaceControl() && !(startSeen && !G.netStart)) {
            const h = Number(d.hold);
            armStart(d.at, Number.isFinite(h) ? Math.min(2, Math.max(0, h)) : 0.5);
          }
          if (name === EV.ARMED && role === "host") {
            if (!peerCar.has(id)) return;
            if (!armedPeers.has(id)) for (const [wire, why] of leftWires) { try { s.sendEvent(EV.LEFT, { wire, why }); } catch (e) {  } }
            armedPeers.add(id);
            if (armDeadline && allArmed()) nameTheMoment();
            else if (named) { try { s.sendEvent(EV.START, { at: named.at, hold: named.hold }); } catch (e) {  } }
          }
          if (name === EV.LAP && d && sendersOwnDriver(d, true)) {
            peerLaps.push(d);
            if (peerLaps.length > PEER_LAPS_CAP) peerLaps.splice(0, peerLaps.length - PEER_LAPS_CAP);
            const fin = Number(d.fin);
            const fr = role === "host" ? remotes.get(remoteFor(id))
              : remoteList().find((x) => x.car.code === d.code) ||
                (d.epoch === epoch && typeof d.driverId === "string" && [...aiRemotes.values()].find((x) => x.car.driverId === d.driverId));
            const total = (G.track && G.track.total) || 0;
            const lt = Number(d.time), best = Number(d.best);
            const ltOk = !d.invalid && lapTimeOk(lt, total), bestOk = lapTimeOk(best, total);
            const finLap = finishLap(d.lap);
            const finOk = finLap > 1 && Number.isFinite(fin) && fin > 0 && Math.abs(fin - (raceTime() || 0)) <= FIN_SLACK_S;
            if (fr && ltOk) fr.car.lastLap = lt;
            if (fr && bestOk && !(fr.car.best <= best)) fr.car.best = best;
            if (fr && finOk && !fr.car.retired) {
              if ((fr.car._nFallback ? fr.car._nOwnerLap : fr.car.lap) >= finLap && finishAllowed(finLap)) { fr.car.finished = true; fr.car.finishT = fin; fr.car._nFin = null; fr.car._nFinLap = null; }
              else { fr.car._nFin = fin; fr.car._nFinLap = finLap; }
            }
            const ret = typeof d.retired === "string" && d.retired ? d.retired.slice(0, 32) : null;
            if (fr && ret && !fr.car.finished && !fr.car.retired) {
              if (fr.hostAi && G.retireCar) G.retireCar(fr.car, ret);
              fr.car.retired = true; fr.car.dnf = ret; fr.car.dnfAt = null;
              fr.car._nFin = null; fr.car._nFinLap = null;
            }
            if (role === "host" && fr) {
              const ownerLap = Number(d.lap);
              const lapOut = Number.isFinite(ownerLap) ? Math.floor(ownerLap) : fr.car.lap;
              const out = { lap: lapOut, time: ltOk ? lt : null, best: bestOk ? best : null,
                code: fr.car.code, driverId: fr.car.driverId, fin: finOk && finishAllowed(finLap) ? fin : undefined, invalid: !!d.invalid,
                retired: ret || undefined };
              for (const [sid, os] of sessions) {
                if (sid !== id) { try { os.sendEvent(EV.LAP, out); } catch (e) {  } }
              }
            }
          }
          if (name === EV.RESULT && !ownsClassification() && validClassification(d, G.cars)) peerResult = d;
          if (name === EV.LEFT && role === "guest" && d && Number.isFinite(d.wire) && remotes.has(d.wire)) {
            if (aiReplicated) {
              const r = remotes.get(d.wire);
              G.setCarRole(r.car, false, false);
              r.car._nHuman = false; r.car._nFallback = false;
              remotes.delete(d.wire);
              r.hostAi = true; r.stale = false;
              aiRemotes.set(d.wire, r);
              if (G.announce) G.announce("RIVAL DISCONNECTED", 2);
            } else handBackToAI(d.why || "peer_closed", d.wire);
          }
          if (name === EV.CAUTION && d && !ownsRaceControl() && G.applyCaution) G.applyCaution(d);
        });
      }
      const seated = (d) => role === "host"
        || remoteList().some((r) => r.car && r.car.driverId === d.driverId);
      bindQuali(s, (d) => qualiGate() && sendersOwnDriver(d) && seated(d), G);
    }

    function handBackToAI(reason, id) {
      if (id == null) {
        for (const r of aiRemotes.values()) scrubForHandBack(r.car);
        aiRemotes.clear();
      }
      const gone = id == null ? remoteList() : [remotes.get(id)].filter(Boolean);
      for (const r of gone) {
        r.car._nHuman = false; r.car._nFallback = false;
        G.setCarRole(r.car, false, false);
        r.car.netInput = null;
        scrubForHandBack(r.car);
        remotes.delete(G.wireId(r.car));
      }
      if (reason && gone.length && G.announce) {
        G.announce(role === "guest" && id == null
          ? "HOST LEFT — RIVALS NOW AI"
          : "RIVAL DISCONNECTED", 2);
      }
    }

    function start(opts) {
      opts = opts || {};
      if (active) {
        Log.warn("net", "play start fail already_active");
        return { ok: false, error: "already_active", message: "A network race is already active." };
      }
      peerLaps = [];
      peerResult = null; resultCars = G.cars;
      resultWaitFrom = null;
      if (!opts.transport && !opts.session) {
        Log.warn("net", "play start fail no_transport");
        return { ok: false, error: "no_transport", message: "No connection to race over." };
      }
      if (!G.track) {
        Log.warn("net", "play start fail no_track");
        return { ok: false, error: "no_track", message: "Load a track before starting a session." };
      }

      role = opts.role === "host" ? "host"
        : opts.role === SpectatePolicy.SPECTATOR ? SpectatePolicy.SPECTATOR : "guest";
      raceOpts = opts;
      onStop = typeof opts.onStop === "function" ? opts.onStop : null;
      peerProfile = opts.peerProfile || null;
      sessions.clear(); peerEpochs.clear(); sessionKinds.clear(); peerInfo.clear();
      epoch = Date.now().toString(36) + "-" + (++epochSerial);
      const incoming = opts.sessions
        || (opts.session ? [{ id: PEER_ONE, session: opts.session }] : null)
        || [{ id: PEER_ONE, session: NetSession.create({ transport: opts.transport }) }];
      localCar = role === SpectatePolicy.SPECTATOR ? null
        : (G.cars || []).find((c) => c.local) || G.player || null;
      remotes.clear();
      const joining = ((opts.peers && opts.peers.length) ? opts.peers
        : (opts.sessions && opts.sessions.length)
          ? opts.sessions.map((e) => ({ profile: null, mods: null, kind: peerKind(e), id: e.id != null ? e.id : PEER_ONE }))
          : [{ profile: peerProfile, mods: opts.peerMods, id: PEER_ONE }])
        .filter((peer) => !SpectatePolicy.isSpectator(peer));
      const hasSpectator = incoming.some((entry) => {
        const id = entry.id != null ? entry.id : PEER_ONE;
        return SpectatePolicy.isSpectator((opts.peers || []).find((peer) => peer.id === id) || entry);
      });
      peerCar.clear();
      for (const j of role === SpectatePolicy.SPECTATOR ? [] : joining) {
        const car = pickRemoteSlot(j.profile);
        if (!car) continue;
        peerCar.set(j.id != null ? j.id : PEER_ONE, G.wireId(car));
        G.setCarRole(car, true, false);
        car._nHuman = true; car._nFallback = false;
        car._nFin = null; car._nFinLap = null; car._nMid = false; car._nRiseT = null;
        car.mods = j.mods || car.mods || null;
        remotes.set(G.wireId(car), makeRemote(car, opts, { profile: j.profile || null }));
      }
      if (remotes.size && typeof LobbyRoster !== "undefined") LobbyRoster.paintField(G.cars || [], remoteList());
      if ((role !== SpectatePolicy.SPECTATOR && (!localCar || (!remotes.size && !(role === "host" && hasSpectator))))
          || (role === SpectatePolicy.SPECTATOR && !(G.cars || []).length)) {
        handBackToAI(null);
        peerCar.clear();
        const closed = new Set();
        for (const entry of incoming) {
          const s = entry.session || entry;
          if (!s || closed.has(s)) continue;
          closed.add(s);
          try { s.clearHandlers(); } catch (e) {  }
          try { s.close(); } catch (e) {  }
        }
        localCar = null;
        session = null;
        Log.warn("net", "play start fail no_slot");
        return { ok: false, error: "no_slot", message: "Could not find a grid slot for both drivers." };
      }

      for (const entry of incoming) {
        const id = entry.id != null ? entry.id : PEER_ONE;
        const s = entry.session || entry;
        sessions.set(id, s);
        const info = (opts.peers || []).find((p) => p.id === id) || entry;
        sessionKinds.set(id, peerKind(info));
        peerInfo.set(id, info || {});
        bindSession(id, s);
        if (typeof s.setTimeoutMs === "function") s.setTimeoutMs(RACE_GRACE_MS);
      }
      session = sessionList()[0] || null;
      if (role !== SpectatePolicy.SPECTATOR) separateGrid();

      aiRemotes.clear();
      aiReplicated = (role === "guest" || role === SpectatePolicy.SPECTATOR) && opts.hostAi !== false;
      if (aiReplicated) {
        for (const c of G.cars || []) {
          const wid = G.wireId(c);
          if (c === localCar || wid < 0 || remotes.has(wid) || (role !== SpectatePolicy.SPECTATOR && c.human)) continue;
          aiRemotes.set(wid, makeRemote(c, opts, { hostAi: true }));
        }
      }
      publishN = 0;

      lastPublish = -Infinity; lastStrategy = -Infinity;
      aiStrategyPhases.clear();
      lastPhaseA = lastPhaseB = lastPhaseC = lastFitted = lastNext = lastCompound = null;
      lastReason = null;
      armedPeers.clear(); leftWires.clear();
      armDeadline = 0;
      armedSentAt = -Infinity;
      startSeen = false;
      named = null;
      heldStart = null;
      holdUntil = 0;
      G.netNow = null;
      active = true;
      broadcast(EV.MODEL, { physics: modelRevision(), strategy: STRATEGY_VERSION, epoch });
      if (role === "guest") { try { broadcast(EV.ARMED, {}); } catch (e) {  } }
      Log.info("net", "play start " + role + " n=" + remotes.size);
      const ids = remoteList().map((r) => G.cars.indexOf(r.car));
      return { ok: true, role, localId: G.cars.indexOf(localCar), remoteId: ids[0], remoteIds: ids };
    }

    const SETTLE_MS = 600;
    const nowMs = () => (G.netNow != null ? G.netNow : performance.now());
    const ARM_WAIT_MS = 45000;
    const ARM_SAY_AFTER_MS = 4000, ARM_SAY_EVERY_MS = 6000;
    let armSince = 0, armSaidAt = 0;
    const HOLD_MAX_MS = ARM_WAIT_MS + 10000;
    let holdUntil = 0;
    let armDeadline = 0;
    let armedSentAt = -Infinity;
    const ARMED_RESEND_MS = 1000;
    let startSeen = false;
    let named = null;
    let heldStart = null;
    const armedPeers = new Set();
    const closeWhy = new Map();
    const leftWires = new Map();
    const allArmed = () => armedPeers.size >= remotes.size;

    function armStart(atPeerMs, hold) {
      const peerAt = Number(atPeerMs);
      if (!Number.isFinite(peerAt)) return;
      if (session && !session.synced()) { heldStart = { at: peerAt, hold }; return; }
      heldStart = null;
      const at = session ? session.peerToLocal(peerAt) : peerAt;
      if (!Number.isFinite(at) || Math.abs(at - nowMs()) > HOLD_MAX_MS) return;
      G.netStart = { at, hold, now: nowMs };
      startSeen = true;
    }

    function hostStart() {
      if (role !== "host" || !session) return false;
      if (!allArmed()) { armSince = nowMs(); armSaidAt = 0; armDeadline = armSince + ARM_WAIT_MS; return true; }
      return nameTheMoment();
    }

    function nameTheMoment() {
      if (role !== "host" || !session) return false;
      armDeadline = 0;
      const hold = 0.2 + Math.random() * 1.8;
      const at = nowMs() + (G.COUNTDOWN_S + hold) * 1000 + SETTLE_MS;
      for (const s of sessionList()) {
        try { s.sendEvent(EV.START, { at, hold }); } catch (e) {  }
      }
      named = { at, hold };
      G.netStart = { at, hold, now: nowMs };
      return true;
    }

    const { reportQuali, reportQualiLive } = qualiReporters(broadcast,
      () => sessions.size > 0 && SpectatePolicy.canPublish(role));

    function reportLap(data) {
      if (!SpectatePolicy.canPublish(role)) return false;
      if (role === "host" && data && data.retired) {
        let sent = false;
        for (const [id, s] of sessions) {
          const to = peerEpochs.get(id);
          try { sent = s.sendEvent(EV.LAP, { ...data, epoch: to }) || sent; } catch (e) {  }
        }
        return sent;
      }
      return sessions.size ? broadcast(EV.LAP, data) : false;
    }
    function reportCaution(data) {
      return (sessions.size && role === "host") ? broadcast(EV.CAUTION, data) : false;
    }

    function reportResult(data) {
      return (sessions.size && SpectatePolicy.canPublish(role)) ? broadcast(EV.RESULT, data) : false;
    }

    const RESULT_WAIT_MS = 3000;
    let resultWaitFrom = null;
    function awaitingResult(now) {
      if (!active || role !== "guest" || peerResult) return false;
      const t = now != null ? now : (G.netNow || 0);
      if (resultWaitFrom == null) resultWaitFrom = t;
      return (t - resultWaitFrom) < RESULT_WAIT_MS;
    }

    function stop(reason) {
      if (!active) { lastReason = null; runOnStop(reason); return false; }
      active = false;
      lastReason = reason || "local";
      Log.info("net", "play stop " + lastReason);
      if (reason == null || reason === "local") broadcast(EV.BYE, {});
      handBackToAI(reason && reason !== "local" ? reason : null);
      for (const s of sessionList()) { try { s.close(); } catch (e) {  } }
      sessions.clear(); peerEpochs.clear(); sessionKinds.clear(); peerInfo.clear();
      aiStrategyPhases.clear();
      peerCar.clear();
      session = null;
      armDeadline = 0;
      named = null;
      holdUntil = 0;
      G.netNow = null;
      G.netStart = null;
      armedPeers.clear(); leftWires.clear();
      startSeen = false;
      heldStart = null;
      runOnStop(reason);
      return true;
    }

    const _pubOwn = { id: -1, car: null }, _pubOne = [_pubOwn];
    const _relay = [], _relayPool = [], _forGuest = [];
    const _hostEnt = { id: -1, car: null, at: 0 };
    function relayPush(id, car, at) {
      const e = _relayPool[_relay.length] || (_relayPool[_relay.length] = { id: -1, car: null, at: 0 });
      e.id = id; e.car = car; e.at = at; _relay.push(e);
    }
    const _poseMaps = [remotes, aiRemotes];
    function tick(now, poseAt) {
      if (!active || !sessions.size) return;
      G.netNow = now;
      if (!holdUntil) holdUntil = now + HOLD_MAX_MS;
      _pumpBuf.length = 0;
      for (const s of sessions.values()) _pumpBuf.push(s);
      for (let i = 0; i < _pumpBuf.length; i++) _pumpBuf[i].pump(now);
      if (!active || !sessions.size) return;
      session = sessions.values().next().value;
      if (heldStart && !startSeen && session.synced()) armStart(heldStart.at, heldStart.hold);

      if (armDeadline && now >= armDeadline) nameTheMoment();
      else if (armDeadline && now - armSince >= ARM_SAY_AFTER_MS && now - armSaidAt >= ARM_SAY_EVERY_MS && G.announce) {
        armSaidAt = now;
        G.announce("WAITING FOR RIVAL — " + Math.ceil((armDeadline - now) / 1000) + " s", 2, "info");
      }
      if (role === "guest" && !G.netStart && !startSeen && now - armedSentAt >= ARMED_RESEND_MS) {
        armedSentAt = now;
        try { broadcast(EV.ARMED, {}); } catch (e) {  }
      }

      let anyAlive = false;
      for (const s of sessions.values()) if (s.alive()) { anyAlive = true; break; }
      if (!anyAlive) return;

      for (const map of _poseMaps) for (const r of map.values()) {
        if (r.heardAt == null) r.heardAt = now;
        const quiet = now - r.heardAt > (r.hostAi || r.everHeard ? STALE_MS : HOLD_MAX_MS);
        if (quiet !== r.stale) { if (quiet) goLocal(r); else goWire(r); }
        if (r.stale) continue;
        const st = r.interp.sample(now, r._smpSt || (r._smpSt = {}));
        if (st) poseRemote(r.car, st);
        const raw = r.interp.predict(now, r._smpPred || (r._smpPred = {}));
        const c = r.car;
        if (raw) {
          const total = (G.track && G.track.total) || 0;
          const pred = clampWire(raw, total, G.lapsTarget, r._smpClamp || (r._smpClamp = {}));
          if (role === "host" && pred.lap > (c.lap || 0) + 1) pred.lap = (c.lap || 0) + 1;
          c._nOk = true;
          c._nProg = (pred.lap - 1) * total + pred.s;
          c._nX = pred.x;
          c._nSpd = pred.speed;
        } else {
          c._nOk = false;
        }
      }

      const phaseA = localCar && localCar.tyreStints, phaseB = localCar && localCar.pitState,
            phaseC = localCar && localCar.pitArmed, fitted = localCar && localCar.pitFitted,
            next = localCar && localCar.pitNext && localCar.pitNext.id, compound = localCar && localCar.compoundShortAtFinish;
      const phaseChanged = phaseA !== lastPhaseA || phaseB !== lastPhaseB || phaseC !== lastPhaseC
        || fitted !== lastFitted || next !== lastNext || compound !== lastCompound;
      const peerArrived = lastStrategy === -Infinity;
      if (localCar && G.track && G.track.def && (now - lastStrategy >= 1000 || phaseChanged)) {
        lastStrategy = now; lastPhaseA = phaseA; lastPhaseB = phaseB; lastPhaseC = phaseC;
        lastFitted = fitted; lastNext = next; lastCompound = compound;
        broadcastStrategy(strategyState(localCar, G.wireId(localCar), G.track.def.id, !phaseChanged && !peerArrived));
        if (role === "host" && peerArrived) for (const [wire, r] of remotes) {
          if (r.stratHeard) broadcastStrategy(strategyState(r.car, wire, G.track.def.id));
        }
        if (role === "host" && peerArrived) for (const c of G.cars || []) {
          if (!c.local && !c.human && c.retired) reportLap({ lap: c.lap, code: c.code,
            driverId: c.driverId, retired: c.dnf || "mechanical", invalid: true });
        }
      }
      if (role === "host" && G.track && G.track.def) for (const c of G.cars || []) {
        const wire = G.wireId(c);
        if (c === localCar || wire < 0 || remotes.has(wire)) continue;
        let last = aiStrategyPhases.get(wire);
        const phase = !last || peerArrived || c.tyreStints !== last.stints
            || c.pitState !== last.pit || c.pitArmed !== last.armed || c.pitFitted !== last.fitted
            || (c.pitNext && c.pitNext.id) !== last.next || c.compoundShortAtFinish !== last.compound;
        if (phase || now - last.at >= 1000) {
          broadcastStrategy(strategyState(c, wire, G.track.def.id, !phase));
          if (!last) { last = {}; aiStrategyPhases.set(wire, last); last.at = now + (wire % 24) * (1000 / 24); }
          else last.at = now; last.stints = c.tyreStints; last.pit = c.pitState; last.armed = c.pitArmed;
          last.fitted = c.pitFitted; last.next = c.pitNext && c.pitNext.id; last.compound = c.compoundShortAtFinish;
        }
      }
      const hidden = typeof document !== "undefined" && !!document && document.hidden === true;
      if (localCar && SpectatePolicy.canPublish(role) && !hidden && now - lastPublish >= PUBLISH_MS) {
        lastPublish = now - lastPublish > 2 * PUBLISH_MS ? now : lastPublish + PUBLISH_MS;
        _pubOne[0] = _pubOwn; _pubOwn.id = G.wireId(localCar); _pubOwn.car = localCar;
        const at = Number.isFinite(poseAt) && poseAt <= now && now - poseAt <= POSE_AGE_MAX_MS ? poseAt : now;
        const withAi = role === "host" && (++publishN % AI_EVERY) === 0;
        _relay.length = 0;
        if (role === "host" && (sessions.size > 1 || withAi)) {
          if (sessions.size > 1) for (const r of remotes.values()) {
            const id = G.wireId(r.car), rat = r.interp.presentedAt ? r.interp.presentedAt() : now;
            if (r.stale || id < 0 || !Number.isFinite(rat)) continue;
            if (r.heardAt != null && now - r.heardAt > RELAY_FRESH_MS) continue;
            relayPush(id, r.car, rat);
          }
          if (withAi) for (const c of G.cars || []) {
            if (c === localCar) continue;
            const id = G.wireId(c), r = id >= 0 ? remotes.get(id) : null;
            if (id < 0 || r) continue;
            relayPush(id, c, at);
          }
        }
        let bytes = null;
        for (const [sid, s] of sessions) {
          let pkt = null;
          if (_relay.length) {
            const own = remoteFor(sid);
            _forGuest.length = 0;
            for (let i = 0; i < _relay.length; i++) if (_relay[i].id !== own) _forGuest.push(_relay[i]);
            if (_forGuest.length && _pubOwn.id >= 0) {
              _hostEnt.id = _pubOwn.id; _hostEnt.car = localCar; _hostEnt.at = at; _forGuest.push(_hostEnt);
              pkt = NetSnapshot.encodeAged(_forGuest);
            }
          }
          if (!pkt) pkt = bytes || (bytes = NetSnapshot.encodeSnapshot(Math.round(at), _pubOne));
          try { s.sendState(pkt); } catch (e) {  }
        }
      }
    }

    function ownsRaceControl() { return !active || role === "host"; }
    function ownsClassification() { return !active || role === "host"; }

    return {
      start, stop, tick,
      ownsRaceControl, ownsClassification,
      hostStart, reportLap, reportResult, reportCaution, awaitingResult, reportQuali, reportQualiLive,
      awaitingStart: () =>
        active && !G.netStart && (role === "guest" || armDeadline > 0) &&
        (!holdUntil || nowMs() < holdUntil),
      peerLaps: () => peerLaps.slice(),
      peerResult: () => peerResult,
      lastResult: () => (!active && role === "guest" && lastReason !== "local" && G.cars === resultCars) ? peerResult : null,
      owns: (c) => {
        if (!active || c == null) return false;
        const id = G.wireId(c), r = remotes.get(id) || aiRemotes.get(id);
        return !!r && r.car === c && !r.stale;
      },
      rivalDriverIds: () => remoteList().map((r) => r.car.driverId).filter((x) => x != null),
      active: () => active,
      role: () => role,
      predict: (c, now) => {
        if (!active) return null;
        const r = c == null ? remoteList()[0] : remotes.get(G.wireId(c));
        const raw = r ? r.interp.predict(now == null ? nowMs() : now) : null;
        return raw ? clampWire(raw, (G.track && G.track.total) || 0, G.lapsTarget) : null;
      },
      sendEvent: (type, data) =>
        (sessions.size && SpectatePolicy.canPublish(role) ? broadcast(type, data) : false),
      onEvent: (type, fn) => (session ? session.onEvent(type, fn) : false),
      status: () => ({
        active, role, reason: lastReason,
        localId: localCar ? G.cars.indexOf(localCar) : -1,
        remoteId: remoteList().length ? G.cars.indexOf(remoteList()[0].car) : -1,
        remotes: remoteList().map((r) => ({
          id: G.cars.indexOf(r.car), wire: G.wireId(r.car),
          driverId: r.car.driverId, buffered: r.interp.size(), timing: r.interp.timing ? r.interp.timing() : null,
        })),
        slotFallback: lastSlotFallback,
        hostAi: aiRemotes.size,
        spectators: [...sessionKinds.values()].filter((kind) => kind === SpectatePolicy.SPECTATOR).length,
        stale: [...remotes.values(), ...aiRemotes.values()].filter((r) => r.stale).map((r) => G.wireId(r.car)),
        net: session ? session.stats() : null,
        buffered: remoteList().length ? remoteList()[0].interp.size() : 0,
        events: eventLog.length,
        peerLaps: peerLaps.length,
        peerResult: !!peerResult,
        startPending: !!G.netStart,
      }),
      EV,
    };
  }

  return { create, EV, strategyState, applyStrategy,
    clampWire, validQuali, bindQuali, qualiReporters,
    QUALI_RATE, QUALI_GUEST_RATE, EVENT_WINDOW_MS, LAP_RATE, STRATEGY_RATE };
})();
Object.freeze(NetPlay);
