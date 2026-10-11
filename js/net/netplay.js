/* NetPlay — the game side of multiplayer. Created with the G ctx façade, like every other js/game module. THE AUTHORITY MODEL, because everything here follows fro… */
"use strict";

const NetPlay = (function () {
  const PUBLISH_HZ = 20;                  // snapshots per second
  const PUBLISH_MS = 1000 / PUBLISH_HZ;
  const INTERP_DELAY_MS = 100;            // how far in the past rivals are drawn
  // AI REPLICATION (docs/notes/MULTIPLAYER-AI-REPLICATION.md): the host's AI
  // poses ride every AI_EVERY-th publish (10 Hz) in each guest's aged packet.
  const AI_EVERY = 2;
  // RACE SILENCE GRACE: a rival silent this long is driven by the LOCAL AI
  // (never an immovable car parked on the line) until its packets return; the
  // race session itself tolerates RACE_GRACE_MS of silence before the car is
  // the AI's for good. A transport that CLOSES still ends the peer at once.
  const STALE_MS = 2000;
  const RACE_GRACE_MS = 25000;

  const EV = {
    MODEL: "model", STRATEGY: "strategy", // versioned reliable compatibility + tyre/pit state
    HELLO: "hello",                       // profile exchange — re-sent on every change
    SETTINGS: "settings",                 // host -> guest race setup (live, in the room)
    READY: "ready",                       // either way: I am done choosing
    GO: "go",                             // host -> guest: leave the room, build the race
    START: "start",                       // host -> guest lights-out tick
    ARMED: "armed",                       // guest -> host: my circuit is built, name the moment
    QUALI: "quali",                       // a driven qualifying lap: {driverId, t}
    QLIVE: "qlive",
    LAP: "lap",                           // completed lap / sector
    RESULT: "result",                     // final classification
    CAUTION: "caution",                   // host -> guest race control (flags)
    BYE: "bye",                           // clean leave
    LEFT: "left",                         // host -> guests: this wire id went back to AI
  };

  // WIRE CLAMPS AND THE QUALI SEAM — module-level, shared with the lobby.
  //
  // CLAMP BEFORE ANYTHING READS IT. Every field here is peer-supplied, and
  // `s`/`lap` feed c.prog — the one number the whole field order sorts on,
  // which the host then RELAYS onward. An out-of-range s (the wire carries up
  // to 42.9 M m) or a rolled-over uint8 lap ranks a rival first for everyone;
  // the same s also indexes Tracks.sample(). head/x/speed reach two unbounded
  // angle wraps (`while (psi > Math.PI)`) — head: Infinity hung the tab, and
  // head: 1e9 cost ~1.6e8 iterations PER FRAME. ONE helper for the posed
  // sample AND the predicted one: predict() hands its output to the contact
  // solver (c._nProg/_nX/_nSpd), and unclamped there the same packet refused
  // as a pose would be accepted as a collision partner.
  const X_LIMIT = 200, SPEED_LIMIT = 200;
  function clampWire(st, total, lapsTarget, out) {
    out = out || {};
    const _s = Number(st.s), _lap = Number(st.lap);
    const _head = +st.head, _x = +st.x, _sp = +st.speed;
    out.s = Number.isFinite(_s) ? Math.min(Math.max(_s, 0), total || _s) : 0;
    out.lap = Number.isFinite(_lap) ? Math.min(Math.max(Math.floor(_lap), 0), (lapsTarget || 0) + 1) : 0;
    // Wrapped, not clamped: a heading IS periodic, so folding it is lossless
    // for any finite value and the wraps downstream then terminate at once.
    out.head = Number.isFinite(_head) ? Math.atan2(Math.sin(_head), Math.cos(_head)) : 0;
    out.x = Number.isFinite(_x) ? Math.min(Math.max(_x, -X_LIMIT), X_LIMIT) : 0;
    out.speed = Number.isFinite(_sp) ? Math.min(Math.max(_sp, -SPEED_LIMIT), SPEED_LIMIT) : 0;
    // 4 bits on the wire (0-15) but the box has GEARS: gearHi(g) is undefined past
    // it, and a hostile or corrupt packet gave car-mesh a NaN rpm on a live car.
    out.gear = Math.min((typeof PhysicsConsts !== "undefined" && PhysicsConsts.GEARS) || 8, Math.max(1, st.gear | 0));
    out.deploying = !!st.deploying;
    out.offroad = !!st.offroad;
    out.onKerb = !!st.onKerb;
    out.braking = !!st.braking;
    out.extrapolated = !!st.extrapolated;
    return out;
  }

  // A GUEST MUST NOT BE ABLE TO DECLARE ITSELF THE WINNER. clampWire bounds lap
  // to lapsTarget+1, which is exactly "finished": one packet with that lap and
  // the host's poseRemote latched `finished`, and a LAP `fin` of the guest's
  // choosing then set its finishT. On the HOST a remote car's lap now only
  // rises by ONE per line crossing — s wrapping from the end of the lap to its
  // start — and only after the car was seen in the middle of the lap since the
  // last rise (so toggling s across the line does not count laps). The grid
  // (lap 0, s just short of the line) crosses once without the mid-lap sight.
  // A lower wire lap is taken as is: it only ranks the sender lower.
  // AND A LAP TAKES TIME: nothing bounded how far s moved between packets, so
  // a modified guest cycling s 0.5T -> 0.9T -> 0.05T met the crossing rule
  // three packets a lap (5 laps in 1.5 s of wire). A rise also needs a whole
  // lap at the wire's speed ceiling of race clock since the last one.
  const MID_LO = 0.25, MID_HI = 0.75;
  function gateLap(c, st, total, now) {
    const prev = Math.max(0, Math.floor(Number(c.lap) || 0));
    let lap = prev;
    if (!(total > 0)) lap = Math.min(st.lap, prev);
    else if (st.lap === prev) lap = prev;
    // A fall re-arms the next rise, so it nets zero: needed when an
    // extrapolated sample crossed early and the next real packet is short. The rise
    // stamp goes too: kept, it refused the REAL crossing that follows (total / SPEED_LIMIT).
    else if (st.lap < prev) { lap = st.lap; c._nMid = true; c._nRiseT = null; }
    else if (Number.isFinite(c.s) && c.s - st.s > total * 0.5 && (prev === 0 || c._nMid)
             && !(Number.isFinite(now) && Number.isFinite(c._nRiseT) && now - c._nRiseT < total / SPEED_LIMIT)) {
      lap = prev + 1;
      c._nMid = false;
      c._nRiseT = now;   // the grid crossing too: no real lap beats total / SPEED_LIMIT
    }
    if (total > 0 && st.s > total * MID_LO && st.s < total * MID_HI) c._nMid = true;
    return lap;
  }
  // `fin` (the owner's finishT) is accepted only near the receiver's own race
  // clock (raceT is shared through netStart) and only once the POSED lap is
  // past the target; one that arrives before the pose crosses waits in _nFin.
  const FIN_SLACK_S = 5;
  const POSE_AGE_MAX_MS = 100;   // tick(now, poseAt): a pose older than this is not "last frame's"
  // A reported lap time must be drivable: no faster than the whole lap at the
  // wire's own speed ceiling, no slower than the qualifying bound.
  // The lap an owner reports at its finishing crossing, bounded to the race:
  // lapsTarget + 1 for a full-distance finish, lower for a lapped car flagged
  // out. Absent or malformed, the full distance (what older builds assume).
  function finishLap(lap) {
    const n = Number(lap), top = (G_lapsTarget() || 0) + 1;
    return Number.isFinite(n) && n >= 1 ? Math.min(top, Math.floor(n)) : top;
  }
  let G_lapsTarget = () => 0;   // bound to the façade in create()
  function lapTimeOk(t, total) {
    return Number.isFinite(t) && t > (total > 0 ? total / SPEED_LIMIT : 0) && t < QUALI_MAX_S;
  }

  // ONE VALIDATION SITE for a peer's qualifying time. Both receivers — the
  // lobby's (qualifying runs while the LOBBY still holds the connection) and
  // this file's bindSession — share it: a bare `d.t > 0` passes "70" and
  // `true`, and quali-model.js throws on `.toFixed` of the stored value.
  // Coerced here, bounded to a lap a human can drive
  // (20 s .. 1 h), and handed on as a NUMBER.
  const QUALI_MIN_S = 20, QUALI_MAX_S = 3600;
  // NO TIME (every lap deleted for track limits) crosses as {noTime: true}
  // and arrives as t = Infinity — quali-model's own "drove, no valid lap"
  // value — never as the synthetic back-of-grid time the local sheet made.
  function validQuali(d) {
    if (!d || typeof d !== "object" || d.driverId == null) return null;
    if (d.noTime === true) return Object.assign({}, d, { t: Infinity, noTime: true });
    const t = Number(d.t);
    if (!(Number.isFinite(t) && t > QUALI_MIN_S && t < QUALI_MAX_S)) return null;
    return Object.assign({}, d, { t });
  }
  // QLIVE never reaches the classification — it is a clock on somebody
  // else's screen — so it is bounded rather than refused.
  function validQualiLive(d) {
    if (!d || typeof d !== "object" || d.driverId == null) return null;
    const t = Number(d.t), frac = Number(d.frac);
    return Object.assign({}, d, {
      t: Number.isFinite(t) && t >= 0 ? Math.min(t, QUALI_MAX_S) : 0,
      frac: Number.isFinite(frac) ? Math.min(Math.max(frac, 0), 1) : 0,
    });
  }
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
  // QUALI + QLIVE flood cap, shared by the lobby and the in-race relay: per
  // connection, rolling window. A real client sends ~2.5 QLIVE/s plus one QUALI.
  const QUALI_RATE = 12, EVENT_WINDOW_MS = 1000;
  function rateGate(limit, windowMs = EVENT_WINDOW_MS) {
    const times = [];
    return () => {
      const now = performance.now();
      while (times.length && now - times[0] > windowMs) times.shift();
      if (times.length >= limit) return false;
      times.push(now);
      return true;
    };
  }
  // Register the QUALI/QLIVE receivers on a session. `ownsDriver(d)` is the
  // caller's sender binding — the lobby keys it on the HELLO profile filed
  // under the connection, NetPlay on the remote car it seated — because the
  // two phases hold different truths about who a connection speaks for.
  function bindQuali(s, ownsDriver, G, onAccepted) {
    s.onEvent(EV.QUALI, (d) => {
      const q = validQuali(d);
      if (q && ownsDriver(q)) {
        if (G.onPeerQuali) G.onPeerQuali(q);
        if (onAccepted) onAccepted(EV.QUALI, q);
      }
    });
    s.onEvent(EV.QLIVE, (d) => {
      const q = validQualiLive(d);
      if (q && ownsDriver(q)) {
        if (G.onPeerQualiLive) G.onPeerQualiLive(q);
        if (onAccepted) onAccepted(EV.QLIVE, q);
      }
    });
  }
  // The senders, one shape for both phases. A driven lap rides the reliable
  // channel: a lost qualifying time is a wrong grid for the whole race, not
  // one stuttered frame. The lap IN PROGRESS is allowed to be wrong, late or
  // lost, so it is fire-and-forget and never gated on anything.
  function qualiReporters(broadcast, live) {
    return {
      reportQuali(driverId, t) {
        if (!live() || !(t > 0)) return false;
        if (t === Infinity) return broadcast(EV.QUALI, { driverId, t: null, noTime: true });
        return broadcast(EV.QUALI, { driverId, t: +Number(t).toFixed(3) });
      },
      reportQualiLive(driverId, t, frac) {
        if (!live() || !(t >= 0)) return false;
        return broadcast(EV.QLIVE, { driverId, t: +Number(t).toFixed(2), frac: +(Number(frac) || 0).toFixed(3) });
      },
    };
  }

  const STRATEGY_VERSION = 1;
  let epochSerial = 0;
  const modelRevision = () => typeof PhysicsConsts !== "undefined" ? PhysicsConsts.REVISION : "2026-09-coherence-1";
  const STRATEGY_FIELDS = { tyreWear: [0, 3], tyreWearF: [0, 3], tyreWearR: [0, 3], tyreTs: [0, 250], tyreTb: [0, 250],
    tyreGrain: [0, 1], tyreBlister: [0, 1], tyreLap0: [0, 1000], tyreStints: [0, 1000], pitStops: [0, 1000], pitT: [0, 30] };
  function strategyState(c, wire, track) {
    const fields = {};
    for (const k of Object.keys(STRATEGY_FIELDS)) if (Number.isFinite(c[k])) fields[k] = c[k];
    return { version: STRATEGY_VERSION, physics: modelRevision(), wire, track, fields,
      tyre: c.tyre || null, tread: c.tread, pitState: c.pitState || "none", pitArmed: !!c.pitArmed };
  }
  function applyStrategy(c, d) {
    if (!c || !d || d.version !== STRATEGY_VERSION || d.physics !== modelRevision() || !d.fields) return false;
    if (d.tyre && typeof d.tyre.id === "string" && Number.isInteger(d.tyre.tread) && d.tyre.tread >= 0 && d.tyre.tread <= 2
        && Number.isFinite(d.tyre.life) && d.tyre.life >= 0.3 && d.tyre.life <= 1.2) {
      c.tyre = { id: d.tyre.id.slice(0, 64), code: String(d.tyre.code || "?").slice(0, 4), life: d.tyre.life,
        tread: d.tyre.tread, off: Number.isFinite(d.tyre.off) ? Math.max(-0.2, Math.min(0.2, d.tyre.off)) : 0,
        colour: Array.isArray(d.tyre.colour) && d.tyre.colour.length === 3 ? d.tyre.colour.map(v => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5) : [0.5, 0.5, 0.5] };
      c.tread = c.tyre.tread;
    } else if (Number.isInteger(d.tread) && d.tread >= 0 && d.tread <= 2) c.tread = d.tread;
    for (const [k, range] of Object.entries(STRATEGY_FIELDS)) {
      if (Number.isFinite(d.fields[k])) c[k] = Math.max(range[0], Math.min(range[1], d.fields[k]));
    }
    if (["none", "lane", "box", "out"].includes(d.pitState)) c.pitState = d.pitState;
    c.pitArmed = d.pitArmed === true;
    return true;
  }

  function create(G) {
    G_lapsTarget = () => G.lapsTarget;
    const sessions = new Map(), peerEpochs = new Map();
    let epoch = null;
    function broadcastStrategy(data) {
      for (const [id, s] of sessions) {
        const to = peerEpochs.get(id);
        if (to) { try { s.sendEvent(EV.STRATEGY, { ...data, epoch: to }); } catch (e) { /* peer closed */ } }
      }
    }
    const sessionList = () => [...sessions.values()];
    const _pumpBuf = [];               // tick()'s per-frame snapshot, refilled in place
    const PEER_ONE = "peer";
    let session = null;
    function broadcast(type, data) {
      let ok = false;
      for (const s of sessionList()) { try { ok = s.sendEvent(type, data) || ok; } catch (e) { /* a dead session must not stop the rest */ } }
      return ok;
    }
    const peerCar = new Map();            // peerId -> wireId
    const remoteFor = (id) => (peerCar.has(id) ? peerCar.get(id) : null);
    let role = null;                      // "host" | "guest"
    let active = false;
    let localCar = null;
    const remotes = new Map();
    const remoteList = () => [...remotes.values()];
    // GUEST ONLY: wireId -> remote for an AI car the HOST simulates. Kept apart
    // from `remotes` (the human rivals), which seats, arming and status read.
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
    // ONE scrub for every car that returns to the local AI. While net-owned it
    // skipped updateCar, so its lapTime never ran and its first line crossing
    // would time the REMAINDER of a lap as a whole one (a ~19 s "fastest lap"
    // for a rival that left); dnfAt/dnfWhy were planned when it was an AI car and
    // would retire it on the very next frame ("RIVAL DISCONNECTED" + instant DNF).
    function scrubForHandBack(car) {
      car._nOk = false;
      car.dnfAt = null; car.dnfWhy = null;
      car.incidentInvalidLap = true; car.lapTime = 0; car._secT0 = null;
    }
    // A silent rival goes to the local AI; its packets bring it back.
    function goLocal(r) {
      r.stale = true;
      if (!r.hostAi) G.setCarRole(r.car, false, false);
      r.car.netInput = null;
      scrubForHandBack(r.car);
    }
    function goWire(r) {
      r.stale = false;
      if (!r.hostAi) G.setCarRole(r.car, true, false);
    }
    let lastPublish = -Infinity, lastStrategy = -Infinity;
    // The strategy phase, as three compared scalars rather than a joined key.
    let lastPhaseA = null, lastPhaseB = null, lastPhaseC = null;
    let peerProfile = null;
    let lastReason = null;
    // start({onStop}): the lobby's "this race is over" hook (a guest's own race
    // rules come back). LOCAL stops only — quit, race again — never a mid-race
    // drop, which keeps racing; a drop's later local stop finds us inactive.
    let onStop = null;
    function runOnStop(reason) {
      if (reason != null && reason !== "local") return;
      const f = onStop; onStop = null;
      if (f) { try { f(); } catch (e) { Log.warn("net", "play onStop threw: " + (e && e.message)); } }
    }
    let lastSlotFallback = null;
    // Lap/sector times rivals reported. A DEBUG CHANNEL, not gameplay: the only
    // reader is __apex.netPeerLaps(). Entries carry whatever reportLap's caller
    // passed — today `{lap, time, best, code, fin?}` from js/game.js, so `code` and
    // not `driverId` is what tells two reporters apart. Give this a driverId
    // before anything gameplay-facing starts reading it.
    // Cap: a long session must not retain every lap forever.
    const PEER_LAPS_CAP = 64;
    let peerLaps = [];
    let peerResult = null;                // the host's classification, if sent
    const eventLog = [];                  // recent inbound events, for status()

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
        // A named profile that matches nobody must not steal a wrong-team car.
        // pickRemoteSlot(null) keeps the any-free-car arm — load-bearing for
        // __apex.netLoopback / a session whose HELLO has not arrived.
        lastSlotFallback = "profile-miss";
        return null;
      }
      lastSlotFallback = "any";
      return cars.find(free) || null;
    }

    // gridUp() puts THE local player at P12, and it runs identically on every
    // peer — so out of the box each player's own car and every rival's car
    // occupy the same slot, and the rivals are posed directly inside you. Found
    // the moment two real browsers first raced: both peers reported their own
    // car at the same s, to the metre.
    //
    // The rule needs no extra message and no negotiation, which is the point.
    // Every peer sorts the humans by wireId — a number all of them compute the
    // same way — and lays that order into consecutive boxes from P12. Each peer
    // therefore arranges its own grid into the SAME arrangement without anyone
    // being told what it is, because a grid position maps to the same s on both
    // (gridUp's formula reads only the slot index and track.total, and the
    // track is the host's choice, so it is the same track).
    //
    // Sorting by wireId rather than "host first, then join order" is what makes
    // it negotiation-free: join order is knowledge the guests do not all share,
    // and wireId is derivable from the profiles everyone already has.
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

      // A QUALIFYING GRID IS ALREADY RIGHT, AND RE-LAYING IT DESYNCS THE RACE.
      //
      // Everything above rests on `first` being the same number on every peer,
      // and it is — but only on the pace grid, where gridUp() splices THE LOCAL
      // player to P12, so localCar.gridPos is 12 on all of them. A grid built
      // from a pre-order takes no such step: every car holds its qualified slot
      // on every machine, localCar.gridPos is wherever THIS player qualified,
      // and each peer would lay the human block at a different place and swap a
      // different set of AI cars out of the way.
      //
      // Skipping is not a workaround, it is the correct answer: the collision
      // this function exists to fix — every peer's own car posed at the same s —
      // cannot occur when the slots came from qualifying, because qualifying
      // already gave each car a distinct one.
      if (G.gridPreOrdered) return;

      let first = localCar.gridPos;
      const last = cars.length;                  // gridPos is 1-based
      if (first + humans.length - 1 > last) first = Math.max(1, last - humans.length + 1);
      humans.forEach((c, i) => move(c, first + i));
    }

    const _clamped = {};                  // poseRemote's scratch; never escapes
    // A below-target finish is a lapped car taking an ALREADY raised flag,
    // never permission for a guest to raise it. The opening crossing cannot
    // finish anyone (RaceControl.lineTransition uses the same lap > 1 rule).
    function finishAllowed(lap) {
      return lap > 1 && (role !== "host" || lap > G.lapsTarget ||
        G.cars.some((c) => c.finished && !c.retired));
    }
    function poseRemote(c, st) {
      // clampWire (module scope) — the same clamp the predicted sample gets.
      st = clampWire(st, (G.track && G.track.total) || 0, G.lapsTarget, _clamped);
      // HOST: a guest's lap is EARNED, not declared (gateLap, module scope).
      if (role === "host") st.lap = gateLap(c, st, (G.track && G.track.total) || 0, G.raceT);
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

      const w = G.worldFromTrack(c.s, c.x);
      c.px = w.x;
      c.pz = w.z;

      const total = (G.track && G.track.total) || 0;
      // LOCAL convention (gridUp / the lap-line code): lap 0 on the grid with
      // prog ≈ -14, prog ≈ 0 at the first crossing, i.e. prog = (lap-1)*total
      // + s. `lap*total + s` ranked every remote human a whole lap ahead:
      // wrong HUD gaps all race, _leadHuman always the remote, so every AI
      // ran the full rubber-band boost against a phantom lap.
      c.prog = (c.lap - 1) * total + c.s;
      // Nothing local ever marks a remote car finished (the lap-line code
      // early-outs for net-owned cars); without this allHumansDone stays false
      // on both peers and results wait for the 360 s/lap hard cap. The wire
      // lap is clamped to lapsTarget+1, so "past the target" is representable.
      // NEVER from an EXTRAPOLATED sample: after a lost packet advance() wraps
      // s and bumps lap on its own, which would latch `finished` on a car whose
      // next real packet says it is still short of the line. This stamp is
      // the FALLBACK (~100 ms of interp delay late); the owner's own finishT
      // arrives in its LAP event (`fin`, bindSession) and overrides it.
      // The crossing that finishes THIS car: the owner's reported lap when a
      // `fin` is waiting (a lapped car is flagged out short of the target), the
      // target otherwise.
      // A short finish may arrive before the winner's delayed pose. Hold it
      // briefly, but never let an early claim survive until a later real flag.
      if (c._nFinLap <= G.lapsTarget && Number.isFinite(c._nFin) && Math.abs(c._nFin - G.raceT) > FIN_SLACK_S) {
        c._nFin = null; c._nFinLap = null;
      }
      const finLap = Number.isFinite(c._nFin) && c._nFinLap != null ? c._nFinLap : G.lapsTarget + 1;
      if (!c.finished && !c.retired && G.lapsTarget > 0 && c.lap >= finLap && !st.extrapolated && finishAllowed(finLap)) {
        // A `fin` that arrived before this pose crossed (LAP handler) is used now.
        const pf = c._nFin;
        c.finished = true;
        c.finishT = Number.isFinite(pf) && Math.abs(pf - G.raceT) <= FIN_SLACK_S ? pf : G.raceT;
        c._nFin = null; c._nFinLap = null;
        // A held short finish was not relayed before the authoritative flag.
        if (role === "host" && finLap <= G.lapsTarget && Number.isFinite(pf)) {
          broadcast(EV.LAP, { lap: finLap, code: c.code, driverId: c.driverId, fin: c.finishT, invalid: true });
        }
      }

      if (G.track) {
        Tracks.sample(G.track, c.s, _smp);
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

    function onState(bytes, from, fromId, arrivedAt) {
      if (!active || !remotes.size) return;
      const pkt = NetSnapshot.decodeSnapshot(bytes);
      if (!pkt || !pkt.cars.length) return;
      const clock = from || session;
      if (!clock) return;
      const t = clock.peerToLocal(pkt.tick);
      // EVERY entry, routed by the id on the wire: G.wireId(), the same number
      // on every screen (a sender's own cars[] index is not — the two grids
      // disagree), so a packet carrying several cars (which is what a relaying
      // host sends) lands each one on the right rival.
      //
      // An id we have no slot for is dropped, not guessed at: that is a car
      // this peer does not know about, and posing it over somebody else would
      // be worse than not drawing it.
      //
      // That drop is LOAD-BEARING now the host relays. A relayed packet carries
      // every car the host holds, which from a guest's point of view includes
      // ITS OWN — and a peer's own car must never be posed from the wire, or it
      // would be driving against a round-tripped copy of itself. It is dropped
      // here for free, because localCar is by construction not in `remotes`.
      // Do not "helpfully" fall back to cars[] lookup on a miss.
      //
      // AUTHORITY: a peer owns its OWN car and nothing else, so the host checks
      // the id on the wire against the id it filed for the connection the
      // packet arrived on. Routing on entry.id alone would let a guest pose any
      // car on the grid — including another player's — simply by naming its
      // wireId, and the host would RELAY that onto every screen under its own
      // name, which every other guest trusts by construction.
      // A peer we hold no car for speaks for nobody and is dropped outright.
      //
      // Guest side there is nothing to narrow to: packets come from the host,
      // which legitimately speaks for the whole field. Trusting the host is
      // not new trust — it already owns the AI and race control.
      let ownOnly = null;
      if (role === "host" && fromId != null) {
        ownOnly = remoteFor(fromId);
        if (ownOnly == null) return;
      }
      // ARRIVAL, not frame time: the transport stamps each message as it lands
      // (session.js passes it through); G.netNow is the rAF tick that DRAINED
      // the inbox, up to a frame later, which read as a frame of extra lag and
      // jitter in the adaptive delay. A transport with no stamp falls back.
      const arrival = Number.isFinite(arrivedAt) ? arrivedAt : G.netNow;
      for (const entry of pkt.cars) {
        if (ownOnly != null && entry.id !== ownOnly) continue;
        // A guest also takes the host's AI (aiRemotes); a host never has any.
        const r = remotes.get(entry.id) || aiRemotes.get(entry.id);
        if (r && r.interp.push(t - (entry.age || 0), entry, arrival)) {   // an aged (relayed) entry keeps its own stamp
          r.heardAt = Number.isFinite(arrival) ? arrival : (G.netNow != null ? G.netNow : r.heardAt);
          r.everHeard = true;
        }
      }
    }

    function bindSession(id, s) {
      const qualiGate = rateGate(QUALI_RATE);
      function sendersOwnDriver(d) {
        if (role !== "host") return true;
        const wid = remoteFor(id);
        const r = wid != null ? remotes.get(wid) : null;
        return !!(r && r.car && (
          (d.driverId != null && d.driverId === r.car.driverId) ||
          (d.code != null && d.code === r.car.code)
        ));
      }
      s.clearHandlers();
      s.onState((bytes, at) => onState(bytes, s, id, at));
      s.onClose((why) => {
        sessions.delete(id);
        const carFor = remoteFor(id);
        armedPeers.delete(id);
        peerCar.delete(id);
        peerEpochs.delete(id);
        // stop() closes remaining sockets after active=false. Real NetSession
        // close() fires onClose("local") synchronously; without this guard that
        // re-enters stop("local") while inactive, clears lastReason, and fires
        // onStop — so a mid-race BYE restored lobby rules and erased the drop
        // reason. Transport-only drops delete the session before stop() and
        // never hit this path; BYE and local stop() do.
        if (!active) {
          session = sessionList()[0] || null;
          return;
        }
        lastReason = why;
        /* A PEER WITH NO GRID SLOT MUST NOT END THE RACE FOR EVERYONE. With a
           `carFor != null` gate on this whole branch, a session that dropped
           before it was seated — a spectator, a joiner still negotiating, a
           peer that left the lobby — would fall through to the `stop()` below
           and tear the session down for every remaining player.
           Whether we keep running is a question about the HOST still having
           peers; what we do about a car is a separate question inside it. */
        if (sessions.size && role === "host") {
          if (carFor != null) handBackToAI(why, carFor);
          // Star, not mesh: the other guests only ever learned this rival
          // existed through the host's relay, and the relay simply stops
          // naming a dropped wire id. Nothing told them it was gone, so their
          // slot stayed net-owned — updateCar never simulated it and the car
          // sat frozen on the track for the rest of the race. Say so.
          if (carFor != null) { leftWires.set(carFor, why || "peer_closed"); broadcast(EV.LEFT, { wire: carFor, why: why || "peer_closed" }); }
          // Still worth asking: a slotless peer leaving can be the one the
          // arm deadline was waiting on.
          if (armDeadline && allArmed()) nameTheMoment();
        }
        // "peer_closed", never a bare stop(): stop() defaults an absent reason
        // to "local", and the transport does not always give one — so a
        // CONNECTION THAT DROPPED was being reported as a deliberate local
        // stop. That is not cosmetic; it sent this session hunting for a local
        // caller that does not exist while a real drop went unexamined.
        else stop(why || "peer_closed");
        session = sessionList()[0] || null;
      });
      for (const type of Object.keys(EV)) {
        const name = EV[type];
        s.onEvent(name, (d) => {
          eventLog.push({ type: name, data: d, from: id });
          if (eventLog.length > 32) eventLog.shift();
          if (name === EV.MODEL) {
            if (!d || d.physics !== modelRevision() || d.strategy !== STRATEGY_VERSION) {
              // ONE INCOMPATIBLE PEER IS ONE RIVAL, NOT THE SESSION — the rule
              // onClose and BYE below already follow. A bare stop() here ended
              // the whole race for everybody because ONE joiner arrived on an
              // older build, while the host and the other guests agreed on a
              // model and were mid-race on it. Close that peer's session and
              // let onClose hand its car back to the AI, exactly as a drop does.
              if (role === "host" && sessions.size > 1) {
                if (G.announce) G.announce("A RIVAL IS ON A DIFFERENT GAME VERSION — DROPPED", 4, "info");
                try { s.close(); } catch (e) { /* already gone; onClose still runs */ }
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
          // Each receiver names a fresh race epoch. A queued pit event from a
          // previous race on the same circuit cannot change this race's tyres.
          if (name === EV.STRATEGY && d && d.epoch === epoch && G.track && G.track.def && d.track === G.track.def.id) {
            const r = remotes.get(d.wire);
            const authorized = role === "guest" || remoteFor(id) === d.wire;
            if (r && authorized && applyStrategy(r.car, d) && role === "host") broadcastStrategy(strategyState(r.car, d.wire, d.track));
          }
          if (name === EV.BYE) {
            lastReason = "bye";
            // A clean leave is one rival, not the session — same as onClose.
            // Close the leaver's session NOW rather than waiting for the
            // ICE-level close to land: that wait left the departed rival's
            // car a frozen human slot for seconds. onClose owns the
            // hand-back + cleanup, so this stays a single path.
            if (role === "host" && sessions.size > 1) {
              try { s.close(); } catch (e) { /* already gone */ }
              // close() fires onClose("local"); keep the clean-leave reason.
              lastReason = "bye";
            } else stop("bye");
          }
          // CLAMP THE WIRE VALUE. `hold` is peer-supplied and reaches countT
          // as `(COUNTDOWN_S + hold) - …`: a missing or non-numeric hold makes
          // countT NaN, every comparison against it false, and the guest sits
          // on the grid forever with no lamps and no way out. The __apex twin
          // (js/agent/apex.js netStartArm) already defaults it; the wire needs
          // the same, plus a range — a hostile 1e9 hold is the same hang.
          if (name === EV.START && d && d.at != null && !ownsRaceControl()) {
            const h = Number(d.hold);
            armStart(d.at, Number.isFinite(h) ? Math.min(2, Math.max(0, h)) : 0.5);
          }
          if (name === EV.ARMED && role === "host") {
            // Only a peer that actually HOLDS a car may arm the start:
            // armedPeers counts session ids while allArmed() compares against
            // remotes (wireId-keyed), and a joiner that got no grid slot
            // (start()'s `if (!car) continue`) still has a bound session — its
            // ARMED alone would satisfy allArmed() while the seated peer is
            // still building its circuit: the skipped-countdown bug the
            // comment below nameTheMoment() records.
            if (!peerCar.has(id)) return;
            // A guest still building when a rival left never bound a LEFT handler (the lobby's reads
            // `from`, this one `wire`): it seats the leaver as a human nobody will move. ARMED means
            // its handler is bound now, so tell it again.
            if (!armedPeers.has(id)) for (const [wire, why] of leftWires) { try { s.sendEvent(EV.LEFT, { wire, why }); } catch (e) { /* a dead session is its own close */ } }
            armedPeers.add(id);
            if (armDeadline && allArmed()) nameTheMoment();
            // LATE ARMED: a guest still inside `await G.startRace()` when the
            // ARM_WAIT backstop named the moment had its START pumped into the
            // LOBBY session, which has no handler for it — so it sat on the
            // grid until HOLD_MAX_MS and counted down alone. The moment is kept
            // and told again to whoever arms after it was named.
            else if (named) { try { s.sendEvent(EV.START, { at: named.at, hold: named.hold }); } catch (e) { /* a dead session must not stop naming it for the rest */ } }   // host clock; the guest converts (nameTheMoment)
          }
          // QUALI / QLIVE: bindQuali below — the one validation site, shared
          // with the lobby phase. (QLIVE never reaches the classification, but
          // it is keyed by the same driverId — unbound, the same spoof paints a
          // lap-in-progress over another driver's name on the host's screen.)
          if (name === EV.LAP && d && sendersOwnDriver(d)) {
            peerLaps.push(d);
            if (peerLaps.length > PEER_LAPS_CAP) peerLaps.splice(0, peerLaps.length - PEER_LAPS_CAP);
            // The finishing crossing carries the OWNER's finishT (`fin`, stamped
            // at its physics crossing, raceT being shared through netStart).
            // Adopt it: the pose-time stamp in poseRemote is a fallback, one
            // interp delay late, and a close finish is decided by less. Sender-
            // bound above like QUALI; on a guest the sender is the host, whose
            // own car is found by `code` (the only id reportLap carries).
            const fin = Number(d.fin);
            const fr = role === "host" ? remotes.get(remoteFor(id))
              : remoteList().find((x) => x.car.code === d.code) ||
                (d.epoch === epoch && typeof d.driverId === "string" && [...aiRemotes.values()].find((x) => x.car.driverId === d.driverId));
            // The lap time and best too: poseRemote only carries position, so
            // the rival's car kept lastLap 0 and best Infinity all race — the
            // radio handed YOU the fastest lap and never timed their laps.
            // Bounded (lapTimeOk): a 0.001 s "best" took fastest lap for good.
            const total = (G.track && G.track.total) || 0;
            const lt = Number(d.time), best = Number(d.best);
            const ltOk = !d.invalid && lapTimeOk(lt, total), bestOk = lapTimeOk(best, total);
            const finLap = finishLap(d.lap);
            const finOk = finLap > 1 && Number.isFinite(fin) && fin > 0 && Math.abs(fin - (G.raceT || 0)) <= FIN_SLACK_S;
            if (fr && ltOk) fr.car.lastLap = lt;
            if (fr && bestOk && !(fr.car.best <= best)) fr.car.best = best;
            if (fr && finOk && !fr.car.retired) {
              // Only a car whose POSE is past its finishing crossing may
              // finish; earlier (the pose trails the crossing by the interp
              // delay) it waits. The crossing is the LAP the owner reports,
              // NOT lapsTarget + 1: a LAPPED car is flagged out at a lower lap
              // (RaceControl.lineTransition), and gating on the target parks
              // its `fin` in _nFin for good — the other peer then waits out
              // the 360 s/lap hard cap for a rival that has already finished.
              if (fr.car.lap >= finLap && finishAllowed(finLap)) { fr.car.finished = true; fr.car.finishT = fin; fr.car._nFin = null; fr.car._nFinLap = null; }
              else { fr.car._nFin = fin; fr.car._nFinLap = finLap; }
            }
            // A RETIREMENT is the owner's word too. The 13 B snapshot has no
            // flag for it, so without this the retired rival stands parked as
            // "still running" and finishDelay holds the other screen to the
            // hard cap (reliability on). Relayed by the host like the rest; the
            // host's own AI retirements arrive here as well (game.js retireCar).
            const ret = typeof d.retired === "string" && d.retired ? d.retired.slice(0, 32) : null;
            if (fr && ret && !fr.car.finished && !fr.car.retired) {
              // The host's AI is parked and announced here too (retireCar). Retired,
              // it stays parked after a hand-back: updateCar never drives it again.
              if (fr.hostAi && G.retireCar) G.retireCar(fr.car, ret);
              fr.car.retired = true; fr.car.dnf = ret; fr.car.dnfAt = null;
              fr.car._nFin = null; fr.car._nFinLap = null;
            }
            // STAR RELAY: guests only hear the host, so without this guest B
            // never saw guest A's lap times (3+ players). Mirrors
            // broadcastStrategy: the host's checked copy, to everyone but the
            // sender, named by the car the host seated for that connection.
            // The OWNER's lap, not the host's posed one: fr.car.lap trails the
            // crossing by the interp delay, so relaying it with `fin` made
            // guest B finishLap() on a stale number and mark the rival done
            // a lap early (or park fin under the wrong _nFinLap).
            if (role === "host" && fr) {
              const ownerLap = Number(d.lap);
              const lapOut = Number.isFinite(ownerLap) ? Math.floor(ownerLap) : fr.car.lap;
              const out = { lap: lapOut, time: ltOk ? lt : null, best: bestOk ? best : null,
                code: fr.car.code, driverId: fr.car.driverId, fin: finOk && finishAllowed(finLap) ? fin : undefined, invalid: !!d.invalid,
                retired: ret || undefined };
              for (const [sid, os] of sessions) {
                if (sid !== id) { try { os.sendEvent(EV.LAP, out); } catch (e) { /* peer closed */ } }
              }
            }
          }
          if (name === EV.RESULT && !ownsClassification() && validClassification(d, G.cars)) peerResult = d;
          // Only the host speaks for the roster; a guest naming a wire id
          // could otherwise park any rival it liked.
          if (name === EV.LEFT && role === "guest" && d && Number.isFinite(d.wire) && remotes.has(d.wire)) {
            if (aiReplicated) {
              // The HOST's AI drives that car now and publishes it with the
              // rest of the field: pose it from the wire, never re-simulate it.
              const r = remotes.get(d.wire);
              G.setCarRole(r.car, false, false);
              remotes.delete(d.wire);
              r.hostAi = true; r.stale = false;
              aiRemotes.set(d.wire, r);
              if (G.announce) G.announce("RIVAL DISCONNECTED", 2);
            } else handBackToAI(d.why || "peer_closed", d.wire);
          }
          if (name === EV.CAUTION && d && !ownsRaceControl() && G.applyCaution) G.applyCaution(d);
        });
      }
      bindQuali(s, (d) => (role !== "host" || qualiGate()) && sendersOwnDriver(d), G);
    }

    function handBackToAI(reason, id) {
      if (id == null) {
        // Whole session over: the host's AI poses stop coming, the local AI
        // resumes every car from where it was last posed.
        for (const r of aiRemotes.values()) scrubForHandBack(r.car);
        aiRemotes.clear();
      }
      const gone = id == null ? remoteList() : [remotes.get(id)].filter(Boolean);
      for (const r of gone) {
        G.setCarRole(r.car, false, false);
        r.car.netInput = null;
        scrubForHandBack(r.car);   // a returned rival races on: no instant DNF, no bogus lap
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
      // start() ADOPTS the supplied sessions. Calling it again while a race is
      // live cannot silently replace that ownership: a sessions.clear() would
      // orphan the first race's sockets and remotes without closing them or
      // handing their cars back to AI. The caller still owns the new sessions
      // when adoption is refused, exactly as for no_transport / no_track.
      if (active) {
        Log.warn("net", "play start fail already_active");
        return { ok: false, error: "already_active", message: "A network race is already active." };
      }
      peerLaps = [];
      peerResult = null;
      resultWaitFrom = null;
      if (!opts.transport && !opts.session) {
        Log.warn("net", "play start fail no_transport");
        return { ok: false, error: "no_transport", message: "No connection to race over." };
      }
      if (!G.track) {
        Log.warn("net", "play start fail no_track");
        return { ok: false, error: "no_track", message: "Load a track before starting a session." };
      }

      role = opts.role === "host" ? "host" : "guest";
      onStop = typeof opts.onStop === "function" ? opts.onStop : null;
      peerProfile = opts.peerProfile || null;
      sessions.clear(); peerEpochs.clear();
      epoch = Date.now().toString(36) + "-" + (++epochSerial);
      const incoming = opts.sessions
        || (opts.session ? [{ id: PEER_ONE, session: opts.session }] : null)
        || [{ id: PEER_ONE, session: NetSession.create({ transport: opts.transport }) }];
      localCar = (G.cars || []).find((c) => c.local) || G.player || null;
      remotes.clear();
      // One profile today, an array when the room grows; Phase C only changes
      // where the list comes from.
      //
      // `opts.peers` is built from the lobby's _peers map (filled from HELLO),
      // so it starts empty until a HELLO arrives — a guest that walks straight
      // into the garage, or whose HELLO is simply late, has a wide-open session
      // and an empty peers list. `[] || fallback` kept that empty array instead
      // of falling back, so joining was empty, remotes stayed empty, and
      // start() bailed no_slot: measured on the guest-in-the-garage path
      // (bahrain, 22 cars), race built then a full teardown on "Could not find
      // a grid slot for both drivers".
      //
      // A profile only decides WHICH slot, and
      // pickRemoteSlot(null) has always had the any-free-car arm for that — so
      // an empty or profile-less join must still fall through to it rather
      // than being read as "no peers".
      const joining = (opts.peers && opts.peers.length) ? opts.peers
        : (opts.sessions && opts.sessions.length)
          ? opts.sessions.map((e) => ({ profile: null, mods: null, id: e.id != null ? e.id : PEER_ONE }))
          : [{ profile: peerProfile, mods: opts.peerMods, id: PEER_ONE }];
      peerCar.clear();
      for (const j of joining) {
        const car = pickRemoteSlot(j.profile);
        if (!car) continue;
        peerCar.set(j.id != null ? j.id : PEER_ONE, G.wireId(car));
        G.setCarRole(car, true, false);
        car._nFin = null; car._nFinLap = null; car._nMid = false; car._nRiseT = null;   // gateLap / pending-fin state, per race
        car.mods = j.mods || car.mods || null;
        remotes.set(G.wireId(car), makeRemote(car, opts, { profile: j.profile || null }));
      }
      if (!localCar || !remotes.size) {
        // start() adopts the lobby's sessions, but a failed adoption must not
        // leave their handlers/socket alive behind a race that never started.
        // Slot selection has already marked any partial rival as human, so
        // hand it back before discarding the wire.
        handBackToAI(null);
        peerCar.clear();
        const closed = new Set();
        for (const entry of incoming) {
          const s = entry.session || entry;
          if (!s || closed.has(s)) continue;
          closed.add(s);
          try { s.clearHandlers(); } catch (e) { /* a failed adoption must still be discarded */ }
          try { s.close(); } catch (e) { /* already gone */ }
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
        bindSession(id, s);
        // The race's silence grace (STALE_MS hands a silent car to the local
        // AI meanwhile); the lobby's 6 s stays the lobby's.
        if (typeof s.setTimeoutMs === "function") s.setTimeoutMs(RACE_GRACE_MS);
      }
      session = sessionList()[0] || null;
      separateGrid();

      // AI REPLICATION, guest side: every car that is neither ours nor a human
      // rival's is the HOST's to simulate. Seat it as a host-owned remote —
      // owns() is then true, updateCar skips it and poseRemote poses it from
      // the host's packets, exactly as a human rival. Its role stays AI.
      aiRemotes.clear();
      aiReplicated = role === "guest" && opts.hostAi !== false;
      if (aiReplicated) {
        for (const c of G.cars || []) {
          const wid = G.wireId(c);
          if (c === localCar || wid < 0 || remotes.has(wid) || c.human) continue;
          aiRemotes.set(wid, makeRemote(c, opts, { hostAi: true }));
        }
      }
      publishN = 0;

      lastPublish = -Infinity; lastStrategy = -Infinity;
      lastPhaseA = lastPhaseB = lastPhaseC = null;
      lastReason = null;
      armedPeers.clear(); leftWires.clear();
      armDeadline = 0;
      armedSentAt = -Infinity;
      startSeen = false;
      named = null;
      holdUntil = 0;
      G.netNow = null;
      active = true;
      broadcast(EV.MODEL, { physics: modelRevision(), strategy: STRATEGY_VERSION, epoch });
      if (role === "guest") { try { broadcast(EV.ARMED, {}); } catch (e) { /* a dead session must not stop start() */ } }
      Log.info("net", "play start " + role + " n=" + remotes.size);
      const ids = remoteList().map((r) => G.cars.indexOf(r.car));
      return { ok: true, role, localId: G.cars.indexOf(localCar), remoteId: ids[0], remoteIds: ids };
    }

    const SETTLE_MS = 600;
    // ONE clock for the whole countdown. G.netNow is the rAF timestamp tick()
    // publishes, so this is identical to performance.now() in production — but
    // naming the moment off one clock while game.js counts down against another
    // puts the deadline on wall time, where no test can reach it. That is why
    // the ARM_WAIT backstop has never had one.
    const nowMs = () => (G.netNow != null ? G.netNow : performance.now());
    // 45 s, not 20: a guest in ANOTHER APP when START is pressed cannot arm —
    // its build waits on requestAnimationFrame, which a hidden tab never gets
    // (developer.chrome.com/blog/timer-throttling-in-chrome-88) — and at 20 s
    // the host raced a frozen car while the guest, back a minute later, counted
    // down alone: a split start. The host now holds the grid longer and SAYS
    // who it is waiting for; HOLD_MAX_MS (the guest's own backstop) follows.
    const ARM_WAIT_MS = 45000;
    const ARM_SAY_AFTER_MS = 4000, ARM_SAY_EVERY_MS = 6000;
    let armSince = 0, armSaidAt = 0;
    // NOBODY WAITS ON THE GRID FOR EVER. Holding the gantry unlit until the
    // moment is named is right, but it is a wait on somebody else, and a peer
    // that has gone silent without its session formally closing would otherwise
    // freeze the countdown outright — a worse failure than starting alone.
    // Comfortably past the host's own ARM_WAIT_MS ceiling, so this only ever
    // fires when that ceiling itself failed to produce a START.
    const HOLD_MAX_MS = ARM_WAIT_MS + 10000;
    let holdUntil = 0;                    // both roles: when we count down alone
    let armDeadline = 0;                  // host: when to stop waiting for ARMED
    let armedSentAt = -Infinity;          // guest: when ARMED last went out (re-sent until START lands)
    const ARMED_RESEND_MS = 1000;
    // Guest: a START has been ACCEPTED this race. Keying the re-send below on
    // `!G.netStart` alone is not enough: the countdown CONSUMES netStart at
    // lights-out (game.js: "consumed; never carry it into the next race"), so
    // from green onward the guest would say ARMED every second for the whole
    // race, the host would answer each with the named moment (the late-ARMED
    // rule), and the guest would hold a past-dated netStart all race. A
    // red-flag restart then reads that stale instant: countT already past the
    // lamps, the guest's restart begins at once and its raceT re-bases to the
    // ORIGINAL green.
    let startSeen = false;
    let named = null;                     // host: the START already sent ({at, hold}), for late ARMEDs
    const armedPeers = new Set();
    const leftWires = new Map();          // host: wire id -> reason, for every rival that left this race
    const allArmed = () => armedPeers.size >= Math.max(1, remotes.size);

    // CLAMP THE WIRE MOMENT TOO. `atPeerMs` is peer-supplied and reaches
    // game.js as `netStart.at` in `(COUNTDOWN_S + hold) - (at - now())/1000`:
    // a non-numeric `at` makes countT NaN and an absurd one makes it hugely
    // negative, so no lamp ever lights and the end-of-sequence test never
    // passes — the same permanent grid hang the clamped `hold` guards against,
    // and awaitingStart's HOLD_MAX_MS backstop cannot reach it once netStart
    // is set. A moment we cannot count down to is no moment at all: ignore it
    // and let that backstop start us alone.
    function armStart(atPeerMs, hold) {
      const peerAt = Number(atPeerMs);
      if (!Number.isFinite(peerAt)) return;
      const at = session ? session.peerToLocal(peerAt) : peerAt;
      // Generous both ways: the host's own lead is a countdown plus SETTLE_MS,
      // and a late ARMED is told a moment already up to ARM_WAIT_MS past.
      if (!Number.isFinite(at) || Math.abs(at - nowMs()) > HOLD_MAX_MS) return;
      G.netStart = { at, hold, now: nowMs };
      startSeen = true;
    }

    // The moment cannot be named until BOTH sides can act on it.
    //
    // Firing hostStart() the instant the host's own race is up, two and a half
    // seconds ahead, is too early: the guest only arms when it PUMPS the event,
    // and pump() runs on the game loop — which on the guest is blocked solid
    // building the circuit. On a phone that build outlasts the lead, so the
    // named instant is already past when it arrives: countT begins past the
    // end of the sequence, the guest skips the whole countdown, and only the
    // host sees the lights (reported from a real desktop-hosts-iPhone-joins race).
    //
    // So the guest reports when its circuit is built (start() is called after
    // startRace(), which is exactly that moment) and the host names the
    // instant only then. The lead is measured from a point both sides have
    // reached, instead of from one side's optimism.
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
      // `at` goes out in THE HOST'S OWN CLOCK, as every snapshot tick does, and
      // the guest converts ONCE (armStart -> peerToLocal). Converting on BOTH
      // sides (localToPeer out, peerToLocal in) puts the guest's instant off by
      // the whole page-age difference — measured 3.3 s early with a page
      // opened 3.3 s later (rtc-sync-probe, 2026-09-28) — and past HOLD_MAX_MS
      // (a friend opening the link a minute after the host) armStart refuses
      // it and the guest counts down alone. Loopback peers share a clock, so
      // no spec can see it.
      for (const s of sessionList()) {
        try { s.sendEvent(EV.START, { at, hold }); } catch (e) { /* a dead session must not stop naming it for the rest */ }
      }
      named = { at, hold };
      G.netStart = { at, hold, now: nowMs };
      return true;
    }

    // Publish OUR driven qualifying lap / the lap so far — qualiReporters
    // (module scope), the same senders the lobby phase uses.
    const { reportQuali, reportQualiLive } = qualiReporters(broadcast, () => sessions.size > 0);

    function reportLap(data) {
      // The host also owns AI retirements. Bind their reliable state to each
      // receiver's race, so a queued DNF cannot park next race's fresh car.
      if (role === "host" && data && data.retired) {
        let sent = false;
        for (const [id, s] of sessions) {
          const to = peerEpochs.get(id);
          try { sent = s.sendEvent(EV.LAP, { ...data, epoch: to }) || sent; } catch (e) { /* peer closed */ }
        }
        return sent;
      }
      return sessions.size ? broadcast(EV.LAP, data) : false;
    }
    function reportCaution(data) {
      return (sessions.size && role === "host") ? broadcast(EV.CAUTION, data) : false;
    }

    function reportResult(data) {
      return sessions.size ? broadcast(EV.RESULT, data) : false;
    }

    // The GUEST holds the chequered flag briefly, waiting for the host's
    // classification. The host owns the order because it is the only peer that
    // sees every car's finish first-hand — it owns the AI — and a close finish
    // is exactly where two independently-computed orders disagree. Bounded, so
    // a host that never sends one cannot hang the results screen forever: past
    // the deadline the guest publishes its own view rather than nothing.
    const RESULT_WAIT_MS = 3000;
    let resultWaitFrom = null;
    function awaitingResult(now) {
      if (!active || role !== "guest" || peerResult) return false;
      const t = now != null ? now : (G.netNow || 0);
      if (resultWaitFrom == null) resultWaitFrom = t;
      return (t - resultWaitFrom) < RESULT_WAIT_MS;
    }

    function stop(reason) {
      // Inactive: nothing to stop, but a reason left by a mid-race drop must
      // not follow the player into the next SOLO race (the pause menu read
      // "Disconnected — return to the lobby" for every race after).
      if (!active) { lastReason = null; runOnStop(reason); return false; }
      active = false;
      lastReason = reason || "local";
      Log.info("net", "play stop " + lastReason);
      // The BYE handler below has existed since the frozen-slot fix, but
      // nothing ever SENT it: a clean quit relied on the SCTP close reaching
      // the peers, which is the seconds-long freeze the handler was written
      // to remove. A local stop announces itself before the sockets go.
      if (reason == null || reason === "local") broadcast(EV.BYE, {});
      handBackToAI(reason && reason !== "local" ? reason : null);
      // Every connection, not just the first — a host leaving must not strand
      // two guests holding open sockets to a race that has ended.
      for (const s of sessionList()) { try { s.close(); } catch (e) { /* already gone */ } }
      sessions.clear(); peerEpochs.clear();
      peerCar.clear();
      session = null;
      armDeadline = 0;
      named = null;
      holdUntil = 0;
      G.netNow = null;              // a session's clock, not the page's
      // Same argument for the armed start: game.js clears netStart only when
      // a countdown runs to COMPLETION, so a friend race quit mid-lights left
      // a past-dated netStart behind and the NEXT solo race lit all five
      // lamps in one frame and skipped its countdown entirely.
      G.netStart = null;
      armedPeers.clear(); leftWires.clear();
      startSeen = false;
      runOnStop(reason);
      return true;
    }

    const _pubOwn = { id: -1, car: null }, _pubOne = [_pubOwn];   // publish scratch: one entry per packet
    const _relay = [];                                             // host relay scratch: {id, car, at}
    const _poseMaps = [remotes, aiRemotes];
    // `poseAt` (optional): when the local car's pose is, on the same clock as
    // `now` — the game loop publishes last frame's physics, which is older
    // than the frame. Absent (a test pumping by hand), the pose is `now`.
    function tick(now, poseAt) {
      if (!active || !sessions.size) return;
      G.netNow = now;
      if (!holdUntil) holdUntil = now + HOLD_MAX_MS;
      // pump() can deliver the close that ends a session — onClose removes it
      // from the map and may call stop() — so iterate a SNAPSHOT and re-check
      // afterwards rather than dereferencing again. Found by the first real
      // two-peer connection: a loopback session never closes mid-pump, so
      // nothing here could have caught it. The snapshot refills a module
      // scratch instead of spreading a fresh array (this ran at 60 Hz for the
      // whole race — the last per-frame copy of the pass that removed the
      // other two, see the comment below).
      _pumpBuf.length = 0;
      for (const s of sessions.values()) _pumpBuf.push(s);
      for (let i = 0; i < _pumpBuf.length; i++) _pumpBuf[i].pump(now);
      if (!active || !sessions.size) return;      // onClose already handled it
      // Only pump() needs the snapshot above — the reads below don't deliver
      // events, so they iterate the live map (this ran 3 copies per frame).
      session = sessions.values().next().value;

      if (armDeadline && now >= armDeadline) nameTheMoment();
      else if (armDeadline && now - armSince >= ARM_SAY_AFTER_MS && now - armSaidAt >= ARM_SAY_EVERY_MS && G.announce) {
        armSaidAt = now;
        G.announce("WAITING FOR RIVAL — " + Math.ceil((armDeadline - now) / 1000) + " s", 2, "info");
      }
      // A guest whose circuit builds FIRST sends its ARMED while the host is
      // still inside `await G.startRace()`: the host's LOBBY session pumps it,
      // has no ARMED handler, and drops it — a 20 s ARM_WAIT stall, and a
      // split start once the guest's HOLD_MAX_MS runs out. Say it again each
      // second until the moment is named;
      // armedPeers.add is idempotent and a late one just re-sends START.
      if (role === "guest" && !G.netStart && !startSeen && now - armedSentAt >= ARMED_RESEND_MS) {
        armedSentAt = now;
        try { broadcast(EV.ARMED, {}); } catch (e) { /* a dead session must not stop the tick */ }
      }

      let anyAlive = false;
      for (const s of sessions.values()) if (s.alive()) { anyAlive = true; break; }
      if (!anyAlive) return;

      // Publish our own car — and, as host, forward everyone else's.
      //
      // AUTHORITY IS UNCHANGED by this. The host is not asserting where anybody
      // is; it FORWARDS what each guest asserted about itself, unaltered and
      // under that guest's own id. Two guests have no connection to each other
      // (star, not mesh: one RTCPeerConnection per guest, all of them to the
      // host), so without the relay guest B never learns guest C exists at all.
      // Each guest still owns its own car outright and is never corrected.
      //
      // What is relayed is the last POSED state, not a re-simulation — we pass
      // on what arrived. That pose is interp.sample(now), i.e. delayMs OLD, so
      // it is stamped with the time it was posed at (presentedAt), one packet
      // per relayed car: stamped `now` in the host's own packet, a guest's
      // predict() would extrapolate from a pose ~100-180 ms older than its
      // label and put the other guest 8-14 m behind where it is at 80 m/s —
      // exactly the contact error predict() exists to remove.
      // That is the price of star over mesh, and it buys not opening N²
      // connections through N NATs.
      // Pose remotes FIRST. Host relay encodes r.car; if that write runs after
      // the snapshot, guests receive last tick's parked pose (or the grid
      // spawn) while this tick's interp sample sits unused.
      for (const map of _poseMaps) for (const r of map.values()) {
        // SILENCE: past STALE_MS the local AI drives the car (owns() is false
        // for it) instead of it standing on the line; a packet brings it back.
        // A human rival that has never spoken stays posed where it is (it is
        // still building its circuit); a host AI car the host never names (a
        // grid the two screens disagree on) is the local AI's after STALE_MS.
        if (r.heardAt == null) r.heardAt = now;
        // …but not for ever: a human that is gone (its LEFT reached nobody, this guest still building)
        // would hold finishDelay to the 360 s/lap cap. Past the same bound as the start's own backstop
        // it is the local AI's, and a packet still brings it back.
        const quiet = now - r.heardAt > (r.hostAi || r.everHeard ? STALE_MS : HOLD_MAX_MS);
        if (quiet !== r.stale) { if (quiet) goLocal(r); else goWire(r); }
        if (r.stale) continue;
        // Per-remote scratch (the ._smp precedent): poseRemote copies fields
        // out and pred is consumed below, so neither object escapes the tick.
        const st = r.interp.sample(now, r._smpSt || (r._smpSt = {}));
        if (st) poseRemote(r.car, st);
        const raw = r.interp.predict(now, r._smpPred || (r._smpPred = {}));
        const c = r.car;
        if (raw) {
          const total = (G.track && G.track.total) || 0;
          const pred = clampWire(raw, total, G.lapsTarget, r._smpClamp || (r._smpClamp = {}));
          if (role === "host" && pred.lap > (c.lap || 0) + 1) pred.lap = (c.lap || 0) + 1;   // gateLap's bound
          c._nOk = true;
          c._nProg = (pred.lap - 1) * total + pred.s;   // same convention as poseRemote
          c._nX = pred.x;
          c._nSpd = pred.speed;
        } else {
          c._nOk = false;
        }
      }

      // THREE SCALARS, NOT AN ARRAY AND A JOIN. This ran every frame of every
      // multiplayer race to build a string that is thrown away unchanged on all
      // but a handful of them — two allocations a frame for a three-field
      // comparison. The fields compare directly.
      const phaseA = localCar && localCar.tyreStints, phaseB = localCar && localCar.pitState,
            phaseC = localCar && localCar.pitArmed;
      const phaseChanged = phaseA !== lastPhaseA || phaseB !== lastPhaseB || phaseC !== lastPhaseC;
      if (localCar && G.track && G.track.def && (now - lastStrategy >= 1000 || phaseChanged)) {
        // MODEL (a guest supplying its race epoch) and start() reset lastStrategy to -Infinity: only
        // THEN does a terminal state need resending. On the 1 s cadence it cost one reliable event per
        // retired car per guest for the rest of the race, filling a frozen guest's EVENT_INBOX_CAP.
        const peerArrived = lastStrategy === -Infinity;
        lastStrategy = now; lastPhaseA = phaseA; lastPhaseB = phaseB; lastPhaseC = phaseC;
        broadcastStrategy(strategyState(localCar, G.wireId(localCar), G.track.def.id));
        // Resend the host's terminal AI state with the existing reliable sync.
        // A guest may bind its race handlers after the original retirement.
        if (role === "host" && peerArrived) for (const c of G.cars || []) {
          if (!c.local && !c.human && c.retired) reportLap({ lap: c.lap, code: c.code,
            driverId: c.driverId, retired: c.dnf || "mechanical", invalid: true });
        }
      }
      // A HIDDEN TAB PUBLISHES NOTHING. platform-session keeps pumping tick() at
      // 500 ms so pings hold the session open, but physics runs from rAF only:
      // the pose is frozen while its speed is still 70+ m/s, so peers solved
      // contact against a ghost and never saw the silence that hands the car to
      // their local AI. Silent, they do; goWire resumes it when this tab returns.
      const hidden = typeof document !== "undefined" && !!document && document.hidden === true;
      if (localCar && !hidden && now - lastPublish >= PUBLISH_MS) {
        // A FIXED 20 Hz, whatever the frame rate. `lastPublish = now` dropped
        // the phase remainder every time: 50 ms is three 60 Hz frames and a
        // bit, so the rate alternated 15-20 Hz, sat at 15 Hz at 30 fps and
        // ~19 Hz at 144. Advance by the period instead; after a stall longer
        // than two periods, restart the phase rather than burst to catch up.
        lastPublish = now - lastPublish > 2 * PUBLISH_MS ? now : lastPublish + PUBLISH_MS;
        _pubOne[0] = _pubOwn; _pubOwn.id = G.wireId(localCar); _pubOwn.car = localCar;
        // Bounded: a pose from the future, or one older than a stall's worth,
        // is a clock we cannot trust — stamp the frame instead.
        const at = Number.isFinite(poseAt) && poseAt <= now && now - poseAt <= POSE_AGE_MAX_MS ? poseAt : now;
        const bytes = NetSnapshot.encodeSnapshot(Math.round(at), _pubOne);
        // Live map is safe here: sendState delivers nothing (Map iterators
        // tolerate a removal, and only pump() can run onClose).
        for (const s of sessions.values()) { try { s.sendState(bytes); } catch (e) { /* a dead session must not stop the others' publish */ } }
        // THE RELAY: ONE DATAGRAM PER GUEST, every other player's car in it.
        // It was one per car per guest — 3 own + 3 × 2 relays = 9 sends a tick
        // in a four-player room, ~75 % of each SCTP/DTLS/UDP datagram overhead.
        // An aged packet (NetSnapshot.encodeAged) keeps each car's own
        // presentedAt stamp, which is why it was split in the first place.
        // …and, every AI_EVERY-th publish, the host's AI field (plus any human
        // slot the local AI is covering through a silence): guests pose these
        // instead of simulating their own (docs/notes/MULTIPLAYER-AI-REPLICATION.md).
        const withAi = role === "host" && (++publishN % AI_EVERY) === 0;
        if (role === "host" && (sessions.size > 1 || withAi)) {
          _relay.length = 0;
          if (sessions.size > 1) for (const r of remotes.values()) {
            const id = G.wireId(r.car), at = r.interp.presentedAt ? r.interp.presentedAt() : now;
            if (r.stale || id < 0 || !Number.isFinite(at)) continue;   // nothing posed yet: nothing to relay
            _relay.push({ id, car: r.car, at });
          }
          if (withAi) for (const c of G.cars || []) {
            if (c === localCar) continue;
            const id = G.wireId(c), r = id >= 0 ? remotes.get(id) : null;
            if (id < 0 || (r && !r.stale)) continue;   // a live human rival is relayed above
            _relay.push({ id, car: c, at });
          }
          if (_relay.length) {
            for (const [sid, s] of sessions) {
              const own = remoteFor(sid);
              const forGuest = _relay.filter((e) => e.id !== own);   // never back to the car's own driver
              if (!forGuest.length) continue;
              try { s.sendState(NetSnapshot.encodeAged(forGuest)); } catch (e) { /* as above */ }
            }
          }
        }
      }
    }

    // The authority model as PREDICATES rather than role comparisons spelled
    // out at each call site. Both are true when racing solo, which is the
    // property that matters: a game with no session must behave exactly as it
    // always did, and that should be stated rather than falling out of the
    // boolean algebra at three separate sites. A third role later (spectator,
    // dedicated host) changes these two functions instead of every caller.
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
      // updateCar() consults this: a car posed from the network must not also
      // be simulated locally, or the two fight every frame. A membership test
      // now rather than an identity one, the same shape incidentSim.owns has.
      owns: (c) => {
        if (!active || c == null) return false;
        const id = G.wireId(c), r = remotes.get(id) || aiRemotes.get(id);
        return !!r && r.car === c && !r.stale;   // a silent rival is the local AI's until it speaks
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
      sendEvent: (type, data) => (sessions.size ? broadcast(type, data) : false),
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
        hostAi: aiRemotes.size,                    // guest: AI cars posed from the host
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

  return { create, EV, PUBLISH_HZ, INTERP_DELAY_MS, strategyState, applyStrategy, STRATEGY_VERSION,
    clampWire, validQuali, validQualiLive, bindQuali, qualiReporters, QUALI_MIN_S, QUALI_MAX_S,
    QUALI_RATE, EVENT_WINDOW_MS, rateGate };
})();
Object.freeze(NetPlay);
