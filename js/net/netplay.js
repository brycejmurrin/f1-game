/* NetPlay — the game side of multiplayer. Created with the G ctx façade, like every other js/game module. THE AUTHORITY MODEL, because everything here follows fro… */
"use strict";

const NetPlay = (function () {
  const PUBLISH_HZ = 20;                  // snapshots per second
  const PUBLISH_MS = 1000 / PUBLISH_HZ;
  const INTERP_DELAY_MS = 100;            // how far in the past rivals are drawn

  const EV = {
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
  };

  function create(G) {
    const sessions = new Map();
    const sessionList = () => [...sessions.values()];
    const PEER_ONE = "peer";
    let session = null;
    function broadcast(type, data) {
      let ok = false;
      for (const s of sessionList()) { try { ok = s.sendEvent(type, data) || ok; } catch (e) {} }
      return ok;
    }
    const peerCar = new Map();            // peerId -> wireId
    const remoteFor = (id) => (peerCar.has(id) ? peerCar.get(id) : null);
    let role = null;                      // "host" | "guest"
    let active = false;
    let localCar = null;
    const remotes = new Map();
    const remoteList = () => [...remotes.values()];
    let lastPublish = -Infinity;
    let peerProfile = null;
    let lastReason = null;
    let lastSlotFallback = null;
    // Lap/sector times rivals reported. A DEBUG CHANNEL, not gameplay: the only
    // reader is __apex.netPeerLaps(). Entries carry whatever reportLap's caller
    // passed — today `{lap, time, best, code}` from js/game.js, so `code` and
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

      let first = localCar.gridPos;
      const last = cars.length;                  // gridPos is 1-based
      if (first + humans.length - 1 > last) first = Math.max(1, last - humans.length + 1);
      humans.forEach((c, i) => move(c, first + i));
    }

    function poseRemote(c, st) {
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
      c.prog = c.lap * total + c.s;

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

    function onState(bytes, from, fromId) {
      if (!active || !remotes.size) return;
      const pkt = NetSnapshot.decodeSnapshot(bytes);
      if (!pkt || !pkt.cars.length) return;
      const clock = from || session;
      if (!clock) return;
      const t = clock.peerToLocal(pkt.tick);
      // EVERY entry, routed by the id on the wire. This used to take cars[0]
      // and ignore the id, because the id was the sender's own cars[] index and
      // the two grids do not agree on those. It is G.wireId() now — the same
      // number on every screen — so a packet carrying several cars (which is
      // what a relaying host sends) lands each one on the right rival.
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
      // packet arrived on. Routing on entry.id alone let a guest pose any car
      // on the grid — including another player's — simply by naming its
      // wireId. The host then RELAYED that, so it landed on every screen under
      // the host's own name, which every other guest trusts by construction.
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
      for (const entry of pkt.cars) {
        if (ownOnly != null && entry.id !== ownOnly) continue;
        const r = remotes.get(entry.id);
        if (r) r.interp.push(t, entry);
      }
    }

    function bindSession(id, s) {
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
      s.onState((bytes) => onState(bytes, s, id));
      s.onClose((why) => {
        lastReason = why;
        sessions.delete(id);
        const carFor = remoteFor(id);
        armedPeers.delete(id);
        if (carFor != null && sessions.size && role === "host") {
          handBackToAI(why, carFor);
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
          if (name === EV.BYE) {
            lastReason = "bye";
            // A clean leave is one rival, not the session — same as onClose.
            if (!(role === "host" && sessions.size > 1)) stop("bye");
          }
          if (name === EV.START && d && d.at != null && !ownsRaceControl()) armStart(d.at, d.hold);
          if (name === EV.ARMED && role === "host") {
            armedPeers.add(id);
            if (armDeadline && allArmed()) nameTheMoment();
          }
          if (name === EV.QUALI && d && d.t > 0 && sendersOwnDriver(d) && G.onPeerQuali) G.onPeerQuali(d);
          // QLIVE never reaches the classification, but it is keyed by the
          // same driverId — unbound, the same spoof paints a lap-in-progress
          // over another driver's name on the host's waiting screen.
          if (name === EV.QLIVE && d && sendersOwnDriver(d) && G.onPeerQualiLive) G.onPeerQualiLive(d);
          if (name === EV.LAP && d && sendersOwnDriver(d)) {
            peerLaps.push(d);
            if (peerLaps.length > PEER_LAPS_CAP) peerLaps.splice(0, peerLaps.length - PEER_LAPS_CAP);
          }
          if (name === EV.RESULT && d && !ownsClassification()) peerResult = d;
          if (name === EV.CAUTION && d && !ownsRaceControl() && G.applyCaution) G.applyCaution(d);
        });
      }
    }

    function handBackToAI(reason, id) {
      const gone = id == null ? remoteList() : [remotes.get(id)].filter(Boolean);
      for (const r of gone) {
        G.setCarRole(r.car, false, false);
        r.car.netInput = null;
        r.car._nOk = false;
        remotes.delete(G.wireId(r.car));
      }
      if (reason && gone.length && G.announce) G.announce("RIVAL DISCONNECTED", 2);
    }

    function start(opts) {
      opts = opts || {};
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
      peerProfile = opts.peerProfile || null;
      sessions.clear();
      const incoming = opts.sessions
        || (opts.session ? [{ id: PEER_ONE, session: opts.session }] : null)
        || [{ id: PEER_ONE, session: NetSession.create({ transport: opts.transport }) }];
      localCar = (G.cars || []).find((c) => c.local) || G.player || null;
      remotes.clear();
      // One profile today, an array when the room grows. Written as a list here
      // so that the only thing Phase C has to change is where the list comes
      // from, not what start() does with it.
      // ALWAYS at least one joiner, even with no profile. A session opened
      // without one is normal — the lobby knows who the peer is, but
      // __apex.netLoopback and any caller that just wants a rival do not, and
      // pickRemoteSlot(null) has always answered that with the any-free-car
      // arm. Gating the list on peerProfile made those sessions fail no_slot,
      // which is the whole multiplayer-session suite.
      const joining = opts.peers || [{ profile: peerProfile, mods: opts.peerMods, id: PEER_ONE }];
      peerCar.clear();
      for (const j of joining) {
        const car = pickRemoteSlot(j.profile);
        if (!car) continue;
        peerCar.set(j.id != null ? j.id : PEER_ONE, G.wireId(car));
        G.setCarRole(car, true, false);
        car.mods = j.mods || car.mods || null;
        remotes.set(G.wireId(car), {
          car,
          profile: j.profile || null,
          interp: NetSnapshot.createInterp({
            total: G.track.total,
            delayMs: opts.interpDelayMs != null ? opts.interpDelayMs : INTERP_DELAY_MS,
          }),
        });
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
          try { s.clearHandlers(); } catch (e) {}
          try { s.close(); } catch (e) {}
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
      }
      session = sessionList()[0] || null;
      separateGrid();

      lastPublish = -Infinity;
      lastReason = null;
      armedPeers.clear();
      armDeadline = 0;
      holdUntil = 0;
      G.netNow = null;
      active = true;
      if (role === "guest") { try { broadcast(EV.ARMED, {}); } catch (e) {} }
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
    const ARM_WAIT_MS = 20000;
    // NOBODY WAITS ON THE GRID FOR EVER. Holding the gantry unlit until the
    // moment is named is right, but it is a wait on somebody else, and a peer
    // that has gone silent without its session formally closing would otherwise
    // freeze the countdown outright — a worse failure than starting alone.
    // Comfortably past the host's own ARM_WAIT_MS ceiling, so this only ever
    // fires when that ceiling itself failed to produce a START.
    const HOLD_MAX_MS = ARM_WAIT_MS + 10000;
    let holdUntil = 0;                    // both roles: when we count down alone
    let armDeadline = 0;                  // host: when to stop waiting for ARMED
    const armedPeers = new Set();
    const allArmed = () => armedPeers.size >= Math.max(1, remotes.size);

    function armStart(atPeerMs, hold) {
      const at = session ? session.peerToLocal(atPeerMs) : atPeerMs;
      G.netStart = { at, hold, now: nowMs };
    }

    // The moment cannot be named until BOTH sides can act on it.
    //
    // hostStart() used to fire the instant the host's own race was up, two and
    // a half seconds ahead. But the guest only arms when it PUMPS the event,
    // and pump() runs on the game loop — which on the guest is blocked solid
    // building the circuit. On a phone that build outlasts the lead, so the
    // named instant was already in the past when it finally arrived: countT
    // began past the end of the sequence, the guest skipped the whole
    // countdown, and only the host ever saw the lights. Reported from a real
    // desktop-hosts-iPhone-joins race.
    //
    // So the guest reports when its circuit is built (start() is called after
    // startRace(), which is exactly that moment) and the host names the
    // instant only then. The lead is now measured from a point both sides have
    // reached, instead of from one side's optimism.
    function hostStart() {
      if (role !== "host" || !session) return false;
      if (!allArmed()) { armDeadline = nowMs() + ARM_WAIT_MS; return true; }
      return nameTheMoment();
    }

    function nameTheMoment() {
      if (role !== "host" || !session) return false;
      armDeadline = 0;
      const hold = 0.2 + Math.random() * 1.8;
      const at = nowMs() + (G.COUNTDOWN_S + hold) * 1000 + SETTLE_MS;
      for (const s of sessionList()) {
        try { s.sendEvent(EV.START, { at: s.localToPeer(at), hold }); } catch (e) {}
      }
      G.netStart = { at, hold, now: nowMs };
      return true;
    }

    // Publish OUR driven qualifying lap. Rides the reliable channel: a lost
    // qualifying time is a wrong grid for the whole race, not one stuttered
    // frame, so it cannot go on the snapshot channel with the positions.
    // The lap so far. Unlike reportQuali this is allowed to be wrong, late or
    // lost — it is a clock on somebody else's screen, not an input to the
    // grid — so it is fire-and-forget and never gated on anything.
    function reportQualiLive(driverId, t, frac) {
      if (!sessionList().length || !(t >= 0)) return false;
      return broadcast(EV.QLIVE, { driverId, t: +t.toFixed(2), frac: +(frac || 0).toFixed(3) });
    }

    function reportQuali(driverId, t) {
      if (!sessions.size || !(t > 0)) return false;
      return broadcast(EV.QUALI, { driverId, t: +t.toFixed(3) });
    }

    function reportLap(data) {
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
      if (!active) return false;
      active = false;
      lastReason = reason || "local";
      Log.info("net", "play stop " + lastReason);
      handBackToAI(reason && reason !== "local" ? reason : null);
      // Every connection, not just the first — a host leaving must not strand
      // two guests holding open sockets to a race that has ended.
      for (const s of sessionList()) { try { s.close(); } catch (e) {} }
      sessions.clear();
      peerCar.clear();
      session = null;
      armDeadline = 0;
      holdUntil = 0;
      G.netNow = null;              // a session's clock, not the page's
      return true;
    }

    function tick(now) {
      if (!active || !sessions.size) return;
      G.netNow = now;
      if (!holdUntil) holdUntil = now + HOLD_MAX_MS;
      // pump() can deliver the close that ends a session — onClose removes it
      // from the map and may call stop() — so iterate a SNAPSHOT (sessionList
      // copies) and re-check afterwards rather than dereferencing again. Found
      // by the first real two-peer connection: a loopback session never closes
      // mid-pump, so nothing here could have caught it.
      for (const s of sessionList()) s.pump(now);
      if (!active || !sessions.size) return;      // onClose already handled it
      // Only pump() needs the snapshot above — the reads below don't deliver
      // events, so they iterate the live map (this ran 3 copies per frame).
      session = sessions.values().next().value;

      if (armDeadline && now >= armDeadline) nameTheMoment();

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
      // on what arrived. Guest-to-guest that costs roughly one publish interval
      // of extra age on top of the interpolation delay, which the buffer
      // already absorbs. That is the price of star over mesh, and it buys not
      // opening N² connections through N NATs.
      // Pose remotes FIRST. Host relay encodes r.car; if that write ran after
      // the snapshot, guests received last tick's parked pose (or the grid
      // spawn) while this tick's interp sample sat unused.
      for (const r of remotes.values()) {
        // Per-remote scratch (the ._smp precedent): poseRemote copies fields
        // out and pred is consumed below, so neither object escapes the tick.
        const st = r.interp.sample(now, r._smpSt || (r._smpSt = {}));
        if (st) poseRemote(r.car, st);
        const pred = r.interp.predict(now, r._smpPred || (r._smpPred = {}));
        const c = r.car;
        if (pred) {
          const total = (G.track && G.track.total) || 0;
          const lap = Number.isFinite(pred.lap) ? pred.lap : 0;
          c._nOk = true;
          c._nProg = lap * total + pred.s;
          c._nX = pred.x;
          c._nSpd = pred.speed;
        } else {
          c._nOk = false;
        }
      }

      if (localCar && now - lastPublish >= PUBLISH_MS) {
        lastPublish = now;
        const entries = [{ id: G.wireId(localCar), car: localCar }];
        if (role === "host") {
          for (const r of remotes.values()) {
            const id = G.wireId(r.car);
            if (id < 0) continue;
            entries.push({ id, car: r.car });
          }
        }
        const bytes = NetSnapshot.encodeSnapshot(Math.round(now), entries);
        // Live map is safe here: sendState delivers nothing (Map iterators
        // tolerate a removal, and only pump() can run onClose).
        for (const s of sessions.values()) { try { s.sendState(bytes); } catch (e) {} }
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
      owns: (c) => active && c != null && remotes.has(G.wireId(c)) && remotes.get(G.wireId(c)).car === c,
      rivalDriverIds: () => remoteList().map((r) => r.car.driverId).filter((x) => x != null),
      active: () => active,
      role: () => role,
      predict: (c, now) => {
        if (!active) return null;
        const r = c == null ? remoteList()[0] : remotes.get(G.wireId(c));
        return r ? r.interp.predict(now == null ? nowMs() : now) : null;
      },
      sendEvent: (type, data) => (sessions.size ? broadcast(type, data) : false),
      onEvent: (type, fn) => (session ? session.onEvent(type, fn) : false),
      status: () => ({
        active, role, reason: lastReason,
        localId: localCar ? G.cars.indexOf(localCar) : -1,
        remoteId: remoteList().length ? G.cars.indexOf(remoteList()[0].car) : -1,
        remotes: remoteList().map((r) => ({
          id: G.cars.indexOf(r.car), wire: G.wireId(r.car),
          driverId: r.car.driverId, buffered: r.interp.size(),
        })),
        slotFallback: lastSlotFallback,
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

  return { create, EV, PUBLISH_HZ, INTERP_DELAY_MS };
})();
