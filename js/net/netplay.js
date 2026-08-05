/*
 * NetPlay — the game side of multiplayer. Created with the G ctx façade, like
 * every other js/game module.
 *
 * THE AUTHORITY MODEL, because everything here follows from it:
 *
 *   Each peer fully owns its own car. The host additionally owns the AI and
 *   race control.
 *
 * That is not the usual choice — most networked games make one peer
 * authoritative over everything — and with two players it is the better one.
 * Owning your own car outright means it is NEVER corrected: no rollback, no
 * reconciliation, no rubber-banding of the car you are actually steering, and
 * no advantage to whoever happens to be hosting. The cost is that under heavy
 * contact the two screens can disagree by roughly a metre. For two friends
 * racing, that is a far better trade than making one of them drive through a
 * correction filter.
 *
 * So a rival car is NOT simulated here. It is posed directly from replicated
 * state, which is why updateCar() early-outs on owns(c) — exactly the way it
 * already does for a car the incident sim has taken over. Running the driving
 * model on a car we then overwrite would burn CPU to fight ourselves.
 *
 * WHAT IS AND ISN'T SENT. Driving is replicated as STATE, not inputs, because
 * the physics is not bit-reproducible across browsers (see NetSnapshot's
 * header — Math.exp/sin/pow/atan2 are all implementation-defined and the
 * driving model uses all four per tick). Discrete facts that state would
 * smear — lap and sector times, race settings, the start tick, results — go
 * over the reliable channel as events instead. Nothing sends inputs at all:
 * under distributed authority nobody ever simulates anybody else's car, so
 * nobody needs anybody else's inputs. The in-memory seam (c.netInput, fed by
 * __apex.carInput) stays, because that is what a host-authoritative mode would
 * build on if one is ever wanted.
 */
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
    // A lap IN PROGRESS: {driverId, t, frac}. Sent a couple of times a second
    // while somebody is on their qualifying run, so the others watch a clock
    // tick instead of a disabled button that says "waiting". Superseded by
    // QUALI the moment the lap completes; purely for the screen, and nothing
    // in the classification ever reads it.
    QLIVE: "qlive",
    LAP: "lap",                           // completed lap / sector
    RESULT: "result",                     // final classification
    CAUTION: "caution",                   // host -> guest race control (flags)
    BYE: "bye",                           // clean leave
  };

  function create(G) {
    // peerId -> NetSession. The host holds one per guest; a guest holds exactly
    // one, to the host. `session` is the first entry, kept because most callers
    // mean "the connection we talk over" and on a guest that is the only one
    // there will ever be.
    const sessions = new Map();
    const sessionList = () => [...sessions.values()];
    const PEER_ONE = "peer";
    let session = null;
    // Say something to EVERY peer. On a guest that is the host; on the host it
    // is every guest, which is what turns lap times, results and flags from a
    // conversation into an announcement.
    function broadcast(type, data) {
      let ok = false;
      for (const s of sessionList()) { try { ok = s.sendEvent(type, data) || ok; } catch (e) {} }
      return ok;
    }
    // Which rival belongs to a given connection, so one peer dropping hands
    // back one car. Null until a peer's slot is claimed.
    const peerCar = new Map();            // peerId -> wireId
    const remoteFor = (id) => (peerCar.has(id) ? peerCar.get(id) : null);
    let role = null;                      // "host" | "guest"
    let active = false;
    let localCar = null;
    // wireId -> { car, interp, profile }. ONE entry today, because there is one
    // transport — but every read below goes through the map, so growing the
    // room becomes a transport change rather than a rewrite of this file. The
    // key is G.wireId(): both peers compute the same number for the same
    // driver, which is only true because no two humans can share a seat.
    const remotes = new Map();
    const remoteList = () => [...remotes.values()];
    let lastPublish = -Infinity;
    let peerProfile = null;
    let lastReason = null;
    // Which arm of pickRemoteSlot's fallback chain last fired: null when the
    // rival got the seat they actually asked for, "team" or "any" when they
    // did not. The seat-exclusivity rule in js/net/lobby.js is supposed to make
    // the fallbacks unreachable — recording it is how a test can tell that it
    // DID, rather than that the collision merely happened not to occur.
    let lastSlotFallback = null;
    // Lap/sector times rivals reported. A DEBUG CHANNEL, not gameplay: the only
    // reader is __apex.netPeerLaps(). Entries carry whatever reportLap's caller
    // passed — today `{lap, time, best, code}` from js/game.js, so `code` and
    // not `driverId` is what tells two reporters apart. Give this a driverId
    // before anything gameplay-facing starts reading it.
    let peerLaps = [];
    let peerResult = null;                // the host's classification, if sent
    const eventLog = [];                  // recent inbound events, for status()

    const _smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 8 };

    // ---- car slots --------------------------------------------------------
    // Which grid car becomes a rival. The seat they actually picked, first and
    // by preference — with seat exclusivity in the lobby that is now the only
    // arm that should ever fire, and lastSlotFallback records it when one of
    // the others does.
    //
    // The fallbacks are kept rather than deleted because they are the
    // behaviour for a peer that did NOT do exclusivity: an older build, or one
    // that failed the handshake's build check and was let through anyway. A
    // car already claimed by another rival is excluded, so three peers cannot
    // be handed the same slot.
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

    // ---- N humans, N grid boxes -------------------------------------------
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

      // Walk BACKWARDS off the end rather than no-oping. The old code took
      // localCar.gridPos + 1 unconditionally; on a grid where the local player
      // holds the last box that slot does not exist, at() returned undefined,
      // move() did nothing and the two humans stayed stacked — silently, which
      // is the worst way for this to fail.
      let first = localCar.gridPos;
      const last = cars.length;                  // gridPos is 1-based
      if (first + humans.length - 1 > last) first = Math.max(1, last - humans.length + 1);
      humans.forEach((c, i) => move(c, first + i));
    }

    // ---- posing a rival ---------------------------------------------------
    // The rival is authoritative in ROAD coordinates, so (s, x) is copied
    // straight in and the world pose is derived from it. That is the opposite
    // of the local car, where the world position is the authority and (s, x)
    // is read back off it — and it is correct for exactly the same reason: in
    // both cases the authority is whoever is actually integrating the physics.
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

      // Race position comes from prog, which the rest of the game treats as
      // cumulative arc length. lap + s reconstructs it exactly.
      const total = (G.track && G.track.total) || 0;
      c.prog = c.lap * total + c.s;

      // Nose angle relative to the road, the same read updateCar does for a
      // human car — we skipped updateCar for this car, so it has to happen here
      // or the rival renders pointing down the track no matter how sideways it
      // actually is.
      if (G.track) {
        Tracks.sample(G.track, c.s, _smp);
        let psi = Math.atan2(_smp.t[0], _smp.t[2]) - c.head;
        while (psi > Math.PI) psi -= Math.PI * 2;
        while (psi < -Math.PI) psi += Math.PI * 2;
        c.yawVis = psi;
      }

      // The render loop lerps between the previous physics step and this one.
      // The interpolation buffer has ALREADY smoothed this car, so pin the
      // anchors together and let renderPosOf return the posed point exactly —
      // interpolating an interpolation just adds lag.
      c.rPrevPx = c.px; c.rPrevPz = c.pz;
      c.rPrevS = c.s; c.rPrevX = c.x;
      c.rPrevHead = c.head; c.rPrevYawVis = c.yawVis;
      c._prevS = c.s;
    }

    // ---- inbound state ----------------------------------------------------
    function onState(bytes, from) {
      if (!active || !remotes.size) return;
      const pkt = NetSnapshot.decodeSnapshot(bytes);
      if (!pkt || !pkt.cars.length) return;
      // The packet is stamped with the SENDER's clock; place it on ours or it
      // lands at an arbitrary point in the buffer's timeline.
      //
      // Converted through the session it ARRIVED ON, not "the" session. Clock
      // sync is per-connection — each NetSession keeps its own offset from its
      // own lowest-RTT ping — so with several guests the first session's
      // estimate is simply the wrong one for everybody else's packets.
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
      for (const entry of pkt.cars) {
        const r = remotes.get(entry.id);
        if (r) r.interp.push(t, entry);
      }
    }

    // Wire one session's handlers. Split out of start() because there is now
    // more than one of them, and because a peer joining mid-lobby would bind
    // exactly the same way.
    //
    // `from` is stamped from the session's OWN id rather than trusted off the
    // payload: a peer saying which peer it is would be a peer that can claim to
    // be another one, and the connection already knows.
    function bindSession(id, s) {
      s.onState((bytes) => onState(bytes, s));
      // One peer dropping is not the session ending. Hand THAT rival back to
      // the AI and race on; only the last connection going away stops us — and
      // for a guest, losing the host always does, because the host owns race
      // control and every other guest is behind it.
      s.onClose((why) => {
        lastReason = why;
        sessions.delete(id);
        const carFor = remoteFor(id);
        armedPeers.delete(id);
        if (carFor != null && sessions.size && role === "host") {
          handBackToAI(why, carFor);
          // The peer we were still holding the gantry for may be the one that
          // just left. allArmed() is otherwise consulted only when an ARMED
          // arrives, so without this a host waits out the whole ARM_WAIT for a
          // player it has already stopped racing — three players or more, since
          // losing the only guest ends the session outright.
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
          if (name === EV.BYE) { lastReason = "bye"; stop("bye"); }
          if (name === EV.START && d && d.at != null) armStart(d.at, d.hold);
          // The guest's circuit is up. If the host was already holding for it
          // (hostStart ran first, which is the normal order), name the moment
          // now — this is the earliest instant every side can act on one.
          if (name === EV.ARMED && role === "host") {
            armedPeers.add(id);
            if (armDeadline && allArmed()) nameTheMoment();
          }
          // A rival's qualifying lap. Handed to the game rather than kept here:
          // the classification is the game's, and it has to be recomputed with
          // every real time in it the moment another one lands.
          if (name === EV.QUALI && d && d.t > 0 && G.onPeerQuali) G.onPeerQuali(d);
          if (name === EV.QLIVE && d && G.onPeerQualiLive) G.onPeerQualiLive(d);
          if (name === EV.LAP && d) peerLaps.push(d);
          if (name === EV.RESULT && d) peerResult = d;
          if (name === EV.CAUTION && d && G.applyCaution) G.applyCaution(d);
        });
      }
    }

    // ---- lifecycle --------------------------------------------------------
    // Hand ONE rival back, or all of them when no id is named (the whole
    // session went away). Per-entry so that losing one player out of four
    // leaves the other two being driven by the people driving them, rather
    // than dropping the entire field to the AI because one phone slept.
    function handBackToAI(reason, id) {
      const gone = id == null ? remoteList() : [remotes.get(id)].filter(Boolean);
      for (const r of gone) {
        // The AI path already exists and needs nothing but the flags cleared:
        // an abandoned car rejoins the race rather than standing on the
        // circuit as an obstacle nobody is driving.
        G.setCarRole(r.car, false, false);
        r.car.netInput = null;
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
        return { ok: false, error: "no_transport", message: "No connection to race over." };
      }
      if (!G.track) return { ok: false, error: "no_track", message: "Load a track before starting a session." };

      role = opts.role === "host" ? "host" : "guest";
      peerProfile = opts.peerProfile || null;
      // The lobby has to talk to the peer BEFORE a track exists — it is how the
      // guest learns which race to load — so it opens the session itself and
      // hands it over here. Adopting it keeps one clock estimate and one set of
      // handlers rather than two sessions competing on the same transport.
      // ONE SESSION PER PEER. A star room means the host holds one connection
      // per guest while each guest holds exactly one, to the host — so this is
      // a map, and `session` is kept as the first entry for the many callers
      // that mean "the connection we talk over".
      //
      // opts.session (singular) stays a FIRST-CLASS input, not a fallback: it
      // is what __apex.netLoopback and every existing spec pass, and the two
      // regressions in this file so far were both a path that used to always
      // run being quietly gated behind a newer one.
      sessions.clear();
      const incoming = opts.sessions
        || (opts.session ? [{ id: PEER_ONE, session: opts.session }] : null)
        || [{ id: PEER_ONE, session: NetSession.create({ transport: opts.transport }) }];
      for (const entry of incoming) {
        const id = entry.id != null ? entry.id : PEER_ONE;
        const s = entry.session || entry;
        sessions.set(id, s);
        bindSession(id, s);
      }
      session = sessionList()[0] || null;

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
        // Remember WHICH connection this rival arrived on, so losing one peer
        // hands back one car rather than emptying the grid of humans.
        peerCar.set(j.id != null ? j.id : PEER_ONE, G.wireId(car));
        // The rival is human — so it gets the human collision mass and is
        // excluded from the AI's rubber-band — but it is not local, and its
        // driving comes off the wire rather than out of updateCar.
        G.setCarRole(car, true, false);
        car.mods = j.mods || car.mods || null;
        remotes.set(G.wireId(car), {
          car,
          profile: j.profile || null,
          // One buffer per rival. createInterp holds no car identity, which is
          // exactly what makes this a matter of instantiating several.
          interp: NetSnapshot.createInterp({
            total: G.track.total,
            delayMs: opts.interpDelayMs != null ? opts.interpDelayMs : INTERP_DELAY_MS,
          }),
        });
      }
      if (!localCar || !remotes.size) {
        session = null;
        return { ok: false, error: "no_slot", message: "Could not find a grid slot for both drivers." };
      }
      separateGrid();

      lastPublish = -Infinity;
      lastReason = null;
      armedPeers.clear();
      armDeadline = 0;
      // Armed on the first tick, not here, so it lands on the SAME clock the
      // hold is compared against. G.netNow is nulled because it belongs to a
      // session rather than to the page: left over from the last race it would
      // date every deadline computed before the first tick of this one to a
      // moment minutes in the past, and fire them all immediately.
      holdUntil = 0;
      G.netNow = null;
      active = true;
      // start() is called straight after startRace(), so reaching this line IS
      // "my circuit is built and my loop is about to run again". That is the
      // fact the host needs before it can name lights-out.
      if (role === "guest") { try { broadcast(EV.ARMED, {}); } catch (e) {} }
      // remoteId stays singular for the callers and tests that read it — it is
      // the FIRST rival, which is the only one there is until Phase C. remoteIds
      // is the shape to read from now on.
      const ids = remoteList().map((r) => G.cars.indexOf(r.car));
      return { ok: true, role, localId: G.cars.indexOf(localCar), remoteId: ids[0], remoteIds: ids };
    }

    // ---- synchronised lights-out -----------------------------------------
    // The host names a moment on ITS clock; both sides convert it onto their
    // own and drive the countdown to that instant.
    //
    // The moment is one FULL COUNTDOWN out (see nameTheMoment) plus this — a
    // margin, not a lead. It covers the one-way trip, so the receiving peer's
    // countT starts at ~0 rather than already a little past it, and buys a
    // device that has just finished building a circuit a beat of settled
    // rendering before the first lamp. It is not what makes the countdown fit;
    // the sequence length does that.
    const SETTLE_MS = 600;
    // ONE clock for the whole countdown. G.netNow is the rAF timestamp tick()
    // publishes, so this is identical to performance.now() in production — but
    // naming the moment off one clock while game.js counts down against another
    // puts the deadline on wall time, where no test can reach it. That is why
    // the ARM_WAIT backstop has never had one.
    const nowMs = () => (G.netNow != null ? G.netNow : performance.now());
    // How long the host will wait for the guest to say its circuit is built
    // before starting anyway. Long, because it is a ceiling on a pathological
    // case, not a normal wait: a phone building a street circuit is the slow
    // end of legitimate, and starting without them is strictly worse than
    // making the host wait a few more seconds.
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
    // WHO has reported their circuit built, not merely whether anyone has. With
    // one guest this is the boolean it replaces; with three it stops the lights
    // going out while two of them are still building the track. The sender id
    // is a placeholder until events carry one (Phase C) — a single guest is
    // still exactly one entry either way.
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
      // The hold is the host's to roll: two independent draws would release
      // one driver before the other, which is the whole thing being fixed.
      // Rolled BEFORE the instant, because the instant depends on it.
      const hold = 0.2 + Math.random() * 1.8;
      // A WHOLE COUNTDOWN AWAY, not a lead. Both sides derive countT from this
      // instant by subtracting the time left, so an instant nearer than the
      // sequence is long puts every peer part-way through it by construction —
      // the 2500 ms this used to be left a guest joining at countT ≈ 2.7-4.5,
      // watching two to four lamps snap on at once and then a second or so of
      // countdown, on a device still finishing its first frames after a build.
      const at = nowMs() + (G.COUNTDOWN_S + hold) * 1000 + SETTLE_MS;
      // Each guest gets the moment converted onto ITS OWN clock — localToPeer
      // is per-session, so this cannot be hoisted out of the loop.
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
      if (!session || !(t > 0)) return false;
      return broadcast(EV.QUALI, { driverId, t: +t.toFixed(3) });
    }

    // ---- race events ------------------------------------------------------
    // Lap and sector times are authored by whoever OWNS the car — nobody else
    // is in a position to time it — and sent reliably, because a dropped lap
    // time is a wrong result rather than a momentary glitch.
    function reportLap(data) {
      return sessions.size ? broadcast(EV.LAP, data) : false;
    }
    // Race control is the HOST's. Debris is generated locally from each car's
    // own behaviour and is NOT replicated, so two peers genuinely see different
    // hazards — left to compute flags independently they would fly different
    // ones for the same race, which is worse than a slightly stale flag.
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

    // ---- the per-frame hook ----------------------------------------------
    // Called from the game loop with the frame clock. Deliberately NOT on a
    // timer of its own: the whole netcode is driven by pump(now) so that its
    // timing is reproducible under test rather than at the mercy of whatever
    // else the browser felt like doing.
    function tick(now) {
      if (!active || !sessions.size) return;
      // Publish the clock the countdown reads, so game.js and the session
      // agree on "now" rather than each calling performance.now() separately.
      G.netNow = now;
      if (!holdUntil) holdUntil = now + HOLD_MAX_MS;
      // pump() can deliver the close that ends a session — onClose removes it
      // from the map and may call stop() — so iterate a SNAPSHOT (sessionList
      // copies) and re-check afterwards rather than dereferencing again. Found
      // by the first real two-peer connection: a loopback session never closes
      // mid-pump, so nothing here could have caught it.
      for (const s of sessionList()) s.pump(now);
      if (!active || !sessions.size) return;      // onClose already handled it
      session = sessionList()[0];

      // Host waiting on the guest's circuit (see hostStart). Checked AFTER the
      // pump, so an ARMED that arrived on this very tick has already been
      // handled — and BEFORE the liveness gate below, because a guest that has
      // gone quiet is the exact case this deadline exists for. Behind the gate
      // it could only fire while somebody was still answering, which is the one
      // situation it is not needed, and the host would hold an unlit gantry for
      // ever in the situation it is.
      if (armDeadline && now >= armDeadline) nameTheMoment();

      // Every connection dead is the session over; ONE of several dead is a
      // player who left, and the others are still racing.
      if (!sessionList().some((s) => s.alive())) return;

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
      if (localCar && now - lastPublish >= PUBLISH_MS) {
        lastPublish = now;
        // G.wireId, not cars.indexOf — the receiver has to be able to say WHICH
        // car this is, and its grid is not indexed the same as ours.
        const entries = [{ id: G.wireId(localCar), car: localCar }];
        if (role === "host") {
          for (const r of remotes.values()) entries.push({ id: G.wireId(r.car), car: r.car });
        }
        // encodeSnapshot has always taken a list with a count byte and a
        // per-entry id (js/net/snapshot.js). This is the first caller to send
        // more than one, which is what that shape was reserved for.
        // To every peer. One identical packet serves all of them: a guest
        // receiving its own car back drops it for free, because localCar is by
        // construction not in `remotes` (see onState).
        const bytes = NetSnapshot.encodeSnapshot(Math.round(now), entries);
        for (const s of sessionList()) { try { s.sendState(bytes); } catch (e) {} }
      }

      // Draw each rival where it was INTERP_DELAY_MS ago, blended between the
      // two packets bracketing that moment.
      for (const r of remotes.values()) {
        const st = r.interp.sample(now);
        if (st) poseRemote(r.car, st);
      }
    }

    // ---- who decides what ------------------------------------------------
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
      // Is this side still waiting to be TOLD when the lights go out? Without
      // this the countdown falls through to accumulating dt locally — its own
      // clock, its own random hold — and the grids are released seconds apart,
      // which is the one thing netStart exists to prevent.
      //
      // BOTH roles wait, not just the guest. The host names the moment itself,
      // but not until every guest reports its circuit built, and a host that
      // counted down in the meantime would be lamps deep in the sequence when
      // the shared instant arrived — see nameTheMoment, which now names an
      // instant a whole countdown away rather than a 2.5 s lead.
      //
      // Bounded, because this is a wait on somebody else (see HOLD_MAX_MS).
      awaitingStart: () =>
        active && !G.netStart && (role === "guest" || armDeadline > 0) &&
        (!holdUntil || nowMs() < holdUntil),
      peerLaps: () => peerLaps.slice(),
      peerResult: () => peerResult,
      // updateCar() consults this: a car posed from the network must not also
      // be simulated locally, or the two fight every frame. A membership test
      // now rather than an identity one, the same shape incidentSim.owns has.
      owns: (c) => active && c != null && remotes.has(G.wireId(c)) && remotes.get(G.wireId(c)).car === c,
      // Who we are holding slots for. qualiNetWaiting() reads this so the grid
      // waits for every rival's lap rather than the first to arrive.
      rivalDriverIds: () => remoteList().map((r) => r.car.driverId).filter((x) => x != null),
      active: () => active,
      role: () => role,
      // Where the rival actually IS, not where it is drawn — Phase 3's contact
      // resolution needs this, because hitting a rival at their delayed drawn
      // pose means hitting them where they were 100 ms ago.
      // Takes the car now: with several rivals a bare predict(now) cannot say
      // WHICH one it describes, and contact resolution has to know. No caller
      // existed yet, so the signature was free to fix.
      predict: (c, now) => {
        if (!active) return null;
        const r = c == null ? remoteList()[0] : remotes.get(G.wireId(c));
        return r ? r.interp.predict(now == null ? c : now) : null;
      },
      sendEvent: (type, data) => (sessions.size ? broadcast(type, data) : false),
      onEvent: (type, fn) => (session ? session.onEvent(type, fn) : false),
      status: () => ({
        active, role, reason: lastReason,
        localId: localCar ? G.cars.indexOf(localCar) : -1,
        // remoteId/buffered describe the FIRST rival and are kept because the
        // hooks doc and the specs read them. remotes[] is the whole picture.
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
