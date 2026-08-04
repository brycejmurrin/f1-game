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
 * over the reliable channel as events instead.
 *
 * The input codec in NetSnapshot is deliberately NOT used by this loop. It
 * remains because it is the seam __apex.carInput() drives and the tests cover,
 * and because a future host-authoritative mode would need exactly it. Under
 * distributed authority nobody ever simulates anybody else's car, so nobody
 * needs anybody else's inputs.
 */
"use strict";

const NetPlay = (function () {
  const PUBLISH_HZ = 20;                  // snapshots per second
  const PUBLISH_MS = 1000 / PUBLISH_HZ;
  const INTERP_DELAY_MS = 100;            // how far in the past rivals are drawn

  const EV = {
    HELLO: "hello",                       // profile exchange
    SETTINGS: "settings",                 // host -> guest race setup
    START: "start",                       // host -> guest lights-out tick
    LAP: "lap",                           // completed lap / sector
    RESULT: "result",                     // final classification
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
          if (name === EV.LAP && d) peerLaps.push(d);
          if (name === EV.RESULT && d) peerResult = d;
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

      interp = NetSnapshot.createInterp({
        total: G.track.total,
        delayMs: opts.interpDelayMs != null ? opts.interpDelayMs : INTERP_DELAY_MS,
      });
      lastPublish = -Infinity;
      lastReason = null;
      active = true;
      return { ok: true, role, localId: G.cars.indexOf(localCar), remoteId: G.cars.indexOf(remoteCar) };
    }

    // ---- synchronised lights-out -----------------------------------------
    // The host names a moment on ITS clock; both sides convert it onto their
    // own and drive the countdown to that instant. A LEAD of a couple of
    // seconds means the message has landed and both clocks are agreed well
    // before it matters — arming it at the moment of lights-out instead would
    // release the host first by half a round trip, every single race.
    const START_LEAD_MS = 2500;

    function armStart(atPeerMs, hold) {
      const at = session ? session.peerToLocal(atPeerMs) : atPeerMs;
      G.netStart = { at, hold, now: () => (G.netNow != null ? G.netNow : performance.now()) };
    }

    function hostStart() {
      if (role !== "host" || !session) return false;
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
    function reportResult(data) {
      return session ? session.sendEvent(EV.RESULT, data) : false;
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
      session.pump(now);
      if (!session.alive()) return;             // onClose already handled it

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

    return {
      start, stop, tick,
      hostStart, reportLap, reportResult,
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
