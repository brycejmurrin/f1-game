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
    LAP: "lap",                           // completed lap / sector
    RESULT: "result",                     // final classification
    CAUTION: "caution",                   // host -> guest race control (flags)
    BYE: "bye",                           // clean leave
  };

  function create(G) {
    let session = null;
    let role = null;                      // "host" | "guest"
    let active = false;
    let localCar = null;
    let remoteCar = null;
    let interp = null;
    let lastPublish = -Infinity;
    let peerProfile = null;
    let lastReason = null;
    let peerLaps = [];                    // lap/sector times the rival reported
    let peerResult = null;                // their final classification, if sent
    const eventLog = [];                  // recent inbound events, for status()

    const _smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 8 };

    // ---- car slots --------------------------------------------------------
    // Which grid car becomes the rival. Prefer the seat they actually picked;
    // fall back through their team, then anyone, because two players choosing
    // the same driver must not deadlock the lobby — makeCars() only ever
    // marks ONE slot as the player.
    function pickRemoteSlot(profile) {
      const cars = G.cars || [];
      const free = (c) => c && !c.local;
      if (profile) {
        const exact = cars.find((c) => free(c) && c.team && c.team.id === profile.team && c.seat === profile.driver);
        if (exact) return exact;
        const sameTeam = cars.find((c) => free(c) && c.team && c.team.id === profile.team);
        if (sameTeam) return sameTeam;
      }
      return cars.find(free) || null;
    }

    // ---- two humans, two grid boxes ---------------------------------------
    // gridUp() puts THE local player at P12, and it runs identically on both
    // peers — so out of the box each player's own car and the rival's car
    // occupy the same slot, and the rival is posed directly inside you. Found
    // the moment two real browsers first raced: both peers reported their own
    // car at the same s, to the metre.
    //
    // The rule needs no extra message and no negotiation, which is the point:
    // the HOST keeps the slot gridUp chose, the GUEST takes the one behind it,
    // and each peer arranges its own grid to that same pair. Both screens then
    // agree, because a grid position maps to the same s on both (gridUp's
    // formula reads only the slot index and track.total, and the track is the
    // host's choice, so it is the same track).
    function separateGrid() {
      const cars = G.cars || [];
      const at = (pos) => cars.find((c) => c.gridPos === pos);
      const move = (car, pos) => {
        const held = at(pos);
        if (held && held !== car) G.swapGridSlots(car, held);
      };
      const hostPos = localCar.gridPos;          // P12 on both peers
      const guestPos = hostPos + 1;
      if (role === "host") {
        move(remoteCar, guestPos);
      } else {
        move(localCar, guestPos);                // ...displacing whoever held it
        move(remoteCar, hostPos);                // ...into the slot we just left
      }
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
    function onState(bytes) {
      if (!active || !interp || !remoteCar) return;
      const pkt = NetSnapshot.decodeSnapshot(bytes);
      if (!pkt || !pkt.cars.length) return;
      // The packet is stamped with the SENDER's clock; place it on ours or it
      // lands at an arbitrary point in the buffer's timeline.
      const t = session.peerToLocal(pkt.tick);
      // A peer only ever publishes cars it owns, so take the first entry
      // rather than trusting an index into our own grid.
      interp.push(t, pkt.cars[0]);
    }

    // ---- lifecycle --------------------------------------------------------
    function handBackToAI(reason) {
      if (remoteCar) {
        // The AI path already exists and needs nothing but the flags cleared:
        // an abandoned car rejoins the race rather than standing on the
        // circuit as an obstacle nobody is driving.
        G.setCarRole(remoteCar, false, false);
        remoteCar.netInput = null;
        remoteCar = null;
      }
      interp = null;
      if (reason && G.announce) G.announce("RIVAL DISCONNECTED", 2);
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
      session = opts.session || NetSession.create({ transport: opts.transport });
      session.onState(onState);
      session.onClose((why) => { lastReason = why; stop(why); });
      for (const type of Object.keys(EV)) {
        const name = EV[type];
        session.onEvent(name, (d) => {
          eventLog.push({ type: name, data: d });
          if (eventLog.length > 32) eventLog.shift();
          if (name === EV.BYE) { lastReason = "bye"; stop("bye"); }
          if (name === EV.START && d && d.at != null) armStart(d.at, d.hold);
          // The guest's circuit is up. If the host was already holding for it
          // (hostStart ran first, which is the normal order), name the moment
          // now — this is the earliest instant both sides can act on one.
          if (name === EV.ARMED && role === "host") {
            peerArmed = true;
            if (armDeadline) nameTheMoment();
          }
          if (name === EV.LAP && d) peerLaps.push(d);
          if (name === EV.RESULT && d) peerResult = d;
          if (name === EV.CAUTION && d && G.applyCaution) G.applyCaution(d);
        });
      }

      localCar = (G.cars || []).find((c) => c.local) || G.player || null;
      remoteCar = pickRemoteSlot(peerProfile);
      if (!localCar || !remoteCar) {
        session = null;
        return { ok: false, error: "no_slot", message: "Could not find a grid slot for both drivers." };
      }

      // The rival is human — so it gets the human collision mass and is
      // excluded from the AI's rubber-band — but it is not local, and its
      // driving comes off the wire rather than out of updateCar.
      G.setCarRole(remoteCar, true, false);
      remoteCar.mods = opts.peerMods || remoteCar.mods || null;
      separateGrid();

      interp = NetSnapshot.createInterp({
        total: G.track.total,
        delayMs: opts.interpDelayMs != null ? opts.interpDelayMs : INTERP_DELAY_MS,
      });
      lastPublish = -Infinity;
      lastReason = null;
      peerArmed = false;
      armDeadline = 0;
      active = true;
      // start() is called straight after startRace(), so reaching this line IS
      // "my circuit is built and my loop is about to run again". That is the
      // fact the host needs before it can name lights-out.
      if (role === "guest") { try { session.sendEvent(EV.ARMED, {}); } catch (e) {} }
      return { ok: true, role, localId: G.cars.indexOf(localCar), remoteId: G.cars.indexOf(remoteCar) };
    }

    // ---- synchronised lights-out -----------------------------------------
    // The host names a moment on ITS clock; both sides convert it onto their
    // own and drive the countdown to that instant. A LEAD of a couple of
    // seconds means the message has landed and both clocks are agreed well
    // before it matters — arming it at the moment of lights-out instead would
    // release the host first by half a round trip, every single race.
    const START_LEAD_MS = 2500;
    // How long the host will wait for the guest to say its circuit is built
    // before starting anyway. Long, because it is a ceiling on a pathological
    // case, not a normal wait: a phone building a street circuit is the slow
    // end of legitimate, and starting without them is strictly worse than
    // making the host wait a few more seconds.
    const ARM_WAIT_MS = 20000;
    let armDeadline = 0;                  // host: when to stop waiting for ARMED
    let peerArmed = false;

    function armStart(atPeerMs, hold) {
      const at = session ? session.peerToLocal(atPeerMs) : atPeerMs;
      G.netStart = { at, hold, now: () => (G.netNow != null ? G.netNow : performance.now()) };
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
      if (!peerArmed) { armDeadline = performance.now() + ARM_WAIT_MS; return true; }
      return nameTheMoment();
    }

    function nameTheMoment() {
      if (role !== "host" || !session) return false;
      armDeadline = 0;
      const at = performance.now() + START_LEAD_MS;
      // The hold is the host's to roll: two independent draws would release
      // one driver before the other, which is the whole thing being fixed.
      const hold = 0.2 + Math.random() * 1.8;
      session.sendEvent(EV.START, { at: session.localToPeer(at), hold });
      G.netStart = { at, hold, now: () => (G.netNow != null ? G.netNow : performance.now()) };
      return true;
    }

    // ---- race events ------------------------------------------------------
    // Lap and sector times are authored by whoever OWNS the car — nobody else
    // is in a position to time it — and sent reliably, because a dropped lap
    // time is a wrong result rather than a momentary glitch.
    function reportLap(data) {
      return session ? session.sendEvent(EV.LAP, data) : false;
    }
    // Race control is the HOST's. Debris is generated locally from each car's
    // own behaviour and is NOT replicated, so two peers genuinely see different
    // hazards — left to compute flags independently they would fly different
    // ones for the same race, which is worse than a slightly stale flag.
    function reportCaution(data) {
      return (session && role === "host") ? session.sendEvent(EV.CAUTION, data) : false;
    }

    function reportResult(data) {
      return session ? session.sendEvent(EV.RESULT, data) : false;
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
      if (session) { try { session.close(); } catch (e) {} }
      session = null;
      return true;
    }

    // ---- the per-frame hook ----------------------------------------------
    // Called from the game loop with the frame clock. Deliberately NOT on a
    // timer of its own: the whole netcode is driven by pump(now) so that its
    // timing is reproducible under test rather than at the mercy of whatever
    // else the browser felt like doing.
    function tick(now) {
      if (!active || !session) return;
      // Publish the clock the countdown reads, so game.js and the session
      // agree on "now" rather than each calling performance.now() separately.
      G.netNow = now;
      // pump() can deliver the close that ends this session — onClose calls
      // stop(), which nulls `session` — so re-check the field rather than
      // dereferencing it again. Found by the first real two-peer connection:
      // a loopback session never closes mid-pump, so nothing here could have
      // caught it.
      session.pump(now);
      if (!session || !session.alive()) return;   // onClose already handled it

      // Host waiting on the guest's circuit (see hostStart). Checked after the
      // pump, so an ARMED that arrived on this very tick has already been
      // handled and this only fires when the guest really has gone quiet.
      if (armDeadline && now >= armDeadline) nameTheMoment();

      // Publish our own car. Only ours — under distributed authority nobody
      // else's position is ours to assert.
      if (localCar && now - lastPublish >= PUBLISH_MS) {
        lastPublish = now;
        session.sendState(NetSnapshot.encodeSnapshot(Math.round(now), [
          { id: G.cars.indexOf(localCar), car: localCar },
        ]));
      }

      // Draw the rival where it was INTERP_DELAY_MS ago, blended between the
      // two packets bracketing that moment.
      if (remoteCar && interp) {
        const st = interp.sample(now);
        if (st) poseRemote(remoteCar, st);
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
      hostStart, reportLap, reportResult, reportCaution, awaitingResult,
      peerLaps: () => peerLaps.slice(),
      peerResult: () => peerResult,
      // updateCar() consults this: a car posed from the network must not also
      // be simulated locally, or the two fight every frame.
      owns: (c) => active && c != null && c === remoteCar,
      active: () => active,
      role: () => role,
      // Where the rival actually IS, not where it is drawn — Phase 3's contact
      // resolution needs this, because hitting a rival at their delayed drawn
      // pose means hitting them where they were 100 ms ago.
      predict: (now) => (active && interp ? interp.predict(now) : null),
      sendEvent: (type, data) => (session ? session.sendEvent(type, data) : false),
      onEvent: (type, fn) => (session ? session.onEvent(type, fn) : false),
      status: () => ({
        active, role, reason: lastReason,
        localId: localCar ? G.cars.indexOf(localCar) : -1,
        remoteId: remoteCar ? G.cars.indexOf(remoteCar) : -1,
        net: session ? session.stats() : null,
        buffered: interp ? interp.size() : 0,
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
