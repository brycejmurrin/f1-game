/* NetLobby — getting two people into the same race, with no server. This is the piece that makes multiplayer usable by a person rather than by __apex. It owns the… */
"use strict";

const NetLobby = (function () {
  const CONNECT_TIMEOUT_MS = 60000;

  function create(G) {
    Log.info("net", "lobby create");
    const $ = (id) => document.getElementById(id);
    const transports = new Map();
    let transport = null;                  // the pending one, mid-handshake
    let nextGuestId = 0;
    let codeRoom = null;
    // The room code we closed to get out of Trystero's way, and must reopen
    // once our own connection is up. Null when we are not hosting a room.
    let codeReopen = null;
    let codeReopenTimer = null;        // the pending 250 ms reopen — owned, cancellable
    const mintGuestId = () => "g" + (++nextGuestId);
    let pendingId = null;
    const MAX_GUESTS = 3;
    let role = null;
    let pollTimer = null;
    let statusText = "";
    // Every user-started async flow owns one generation. Camera permission,
    // relay discovery and ICE gathering can all resolve after the player has
    // backed out or started a different route; a late continuation must not
    // repaint the new screen or attach itself to its transport.
    let operationGeneration = 0;
    const beginOperation = () => ++operationGeneration;
    const operationCurrent = (gen) => gen === operationGeneration;
    const cancelledResult = () => ({ ok: false, error: "cancelled" });
    const invalidateOperations = () => { operationGeneration++; };

    const els = () => ({
      screen: $("vsfriend"),
      pick: $("vs-pick"), hosting: $("vs-hosting"), joining: $("vs-joining"),
      room: $("vs-room"), roomStep: $("vs-room"),
      code: $("vs-code"), codeEntry: $("vs-code-entry"),
      codeHead: $("vs-code-head"), codeHint: $("vs-code-hint"),
      codeShow: $("vs-code-show"), codeValue: $("vs-code-value"),
      codeInputWrap: $("vs-code-input"), codeIn: $("vs-code-in"),
      raceSummary: $("vs-race-summary"), raceNote: $("vs-race-note"),
      editRace: $("vs-edit-race"), editCar: $("vs-edit-car"),
      me: $("vs-me"), them: $("vs-them"),
      ready: $("vs-ready"), start: $("vs-start"), inviteMore: $("vs-invite-more"),
      invite: $("vs-invite"), inviteIn: $("vs-invite-in"),
      answer: $("vs-answer"), answerIn: $("vs-answer-in"),
      answerHint: $("vs-answer-hint"), answerActions: $("vs-answer-actions"),
      answerWait: $("vs-answer-wait"), answerRaw: $("vs-answer-raw"),
      answerQrWrap: $("vs-answer-qr-wrap"), answerQr: $("vs-answer-qr"),
      scan: $("vs-scan"), scanVideo: $("vs-scan-video"),
      status: $("vs-status"),
    });

    function say(msg, isError) {
      statusText = msg || "";
      // Direct lookup: els() rebuilds a 36-element map per call, and say()
      // fires from 4 Hz polls and 1 Hz relay ticks during every connect.
      const e = document.getElementById("vs-status");
      if (!e) return;
      e.textContent = statusText;
      e.classList.toggle("vs-error", !!isError);
    }

    function show(step) {
      const e = els();
      for (const k of ["pick", "hosting", "joining", "room", "code"]) if (e[k]) e[k].hidden = (k !== step);
    }

    function localProfile() {
      const team = Teams.LIST[G.teamIdx] || Teams.LIST[0];
      let setup = null;
      try { setup = G.getTeamParts ? G.getTeamParts(team.id) : null; } catch (e) { setup = null; }
      return {
        team: team.id,
        driver: G.driverIdx || 0,
        parts: setup,
        livery: (G.getLiveryId ? G.getLiveryId(team.id) : null),
      };
    }

    // Turn a peer's declared ids into multipliers, locally. Falls back to the
    // team's factory numbers if anything about the setup does not resolve —
    // a rival with an odd save must still be raceable.
    function modsFromProfile(p) {
      if (!p || !p.team) return null;
      const team = Teams.LIST.find((t) => t.id === p.team);
      if (!team) return null;
      try { return G.modsFor(team, p.parts || Parts.getFactorySetup(team)); }
      catch (e) { return null; }
    }

    // How a transport gets made is injectable, for the same reason the wire
    // itself is: a test must be able to exercise this screen without building
    // a real RTCPeerConnection. That is not a convenience — a PC whose ICE
    // never completes (a sandboxed CI browser, a locked-down network) spins
    // indefinitely, so a test that constructs one does not fail, it HANGS.
    let makeTransport = (o) => NetTransport.rtc(o);
    function setTransportFactory(fn) { makeTransport = fn || ((o) => NetTransport.rtc(o)); }

    // THE RELAY HAS TO ARRIVE BEFORE THE CONNECTION IS BUILT.
    //
    // An RTCPeerConnection's iceServers are fixed at construction — gathering
    // starts immediately and never revisits the list. prefetchIce() is a
    // FETCH, so open() firing it and codeHost() building the transport
    // microseconds later is a race the fetch always loses: the connection
    // gathers with STUN only and relay:0, while fetchedIce lands ~200 ms later
    // and makes hasRelay() true for everything that asks afterwards.
    //
    // That produced the most misleading message the lobby has ever shown — "a
    // relay was offered and did not carry it" — when the relay had never been
    // in the connection at all. Every wire dump through this whole
    // investigation said relay:0 while a perfectly good Metered credentials
    // endpoint sat there answering in 180 ms.
    //
    // So: await it here, at the one choke point every path goes through, and
    // no call site can forget. It resolves instantly once fetched (memoised),
    // it never rejects, and no relay configured stays a normal state.
    // …BUT NEVER AT THE COST OF THE SCREEN OPENING. A relay improves the odds
    // of connecting; waiting for one must never be why the lobby has not
    // appeared. The first version of this awaited the fetch outright, and on a
    // browser with no route to the credentials host — a captive portal, a
    // blackholing firewall, or a CI browser with no egress — join() simply
    // never returned and #vs-room never opened. The multiplayer gate caught it
    // as fourteen failures; a player would have called it "the button does
    // nothing".
    //
    // So it is a RACE, not an await. Whoever wins, the connection is built:
    // with the relay if it arrived in time, without it if not — which is
    // exactly the behaviour before the relay existed, and connected fine for
    // everyone whose network did not need one.
    const ICE_WAIT_MS = 2500;
    function readyIce() {
      let p = null;
      try { p = NetTransport.prefetchIce && NetTransport.prefetchIce(); } catch (e) { p = null; }
      if (!p || typeof p.then !== "function") return Promise.resolve();
      return Promise.race([
        p.catch(() => null),
        new Promise((r) => setTimeout(r, ICE_WAIT_MS)),
      ]);
    }

    function newTransport(asRole) {
      dropPending();
      role = asRole;
      pendingId = asRole === "host" ? mintGuestId() : PEER_ONE;
      transport = makeTransport({ role: asRole, name: asRole });
      if (!transport) {
        say("This browser cannot do WebRTC, so it cannot race a friend.", true);
        return null;
      }
      const id = pendingId;
      transport.onClose(() => {
        // Belt and braces: the transport that emitted close has already
        // released itself, but close it BEFORE the map delete so a future
        // close-emitter that does not self-release cannot leak past
        // teardown()'s sweep.
        const tGone = transports.get(id);
        if (tGone) { try { tGone.close(); } catch (e) {} }
        transports.delete(id);
        const s = sessions.get(id);
        if (s) { try { s.close(); } catch (e) {} }
        sessions.delete(id);
        _peers.delete(id); _ready.delete(id);
        clashDrop(id);
        Log.info("net", "peer leave " + id);
        session = [...sessions.values()][0] || null;
        if (!sessions.size) {
          clearInterval(pumpTimer); pumpTimer = null;
          say(role === "guest"
            ? "The host left, so the race is over. Everyone connects through them."
            : "Connection closed.", true);
        } else {
          say("A player left. The rest of you are still in.");
        }
        renderRoom(); if (G.refreshQualiGate) G.refreshQualiGate();
      });
      return transport;
    }

    // Throw away an in-flight handshake without touching anybody connected.
    function dropPending() {
      // ONLY cancel a watcher that belonged to the transport being dropped.
      // Unconditional, this cancelled a watcher armed BEFORE the transport
      // existed — which is now the normal order, because host()/join() await
      // the relay credentials first and callers arm the watcher immediately
      // after clicking. The room then never opened: fourteen specs, and a
      // player who would have reported that the button does nothing.
      if (transport) clearInterval(pollTimer);
      if (transport && !transports.has(pendingId)) {
        try { transport.close(); } catch (e) {}
      }
      transport = null;
      pendingId = null;
    }

    function noConnectionMsg() {
      return NetTransport.supported()
        ? "That attempt has ended. Tap HOST A RACE or JOIN A FRIEND to start over."
        : "This browser cannot do WebRTC, so it cannot race a friend.";
    }

    function teardown() {
      clearInterval(pollTimer);
      clearInterval(pumpTimer);
      pumpTimer = null;
      clearTimeout(codeReopenTimer); codeReopenTimer = null;
      for (const s of sessions.values()) { try { s.close(); } catch (e) {} }
      sessions.clear();
      session = null;
      for (const t of transports.values()) { try { t.close(); } catch (e) {} }
      transports.clear();
      if (transport) { try { transport.close(); } catch (e) {} }
      transport = null;
      pendingId = null;
      nextGuestId = 0;
    }

    // "It didn't work" is not an answer a player can act on, and the two ways
    // this fails need OPPOSITE responses. Which one happened is decided by
    // whether we ever learnt our own public address:
    //
    // The stale case is the one worth catching separately, because our own
    // design causes it: the codes are carried by a human, and a NAT's UDP
    // mapping expires in about a minute. Take too long over the paste and the
    // addresses in the code are simply no longer valid.
    function failureMsg(st, secs) {
      const c = (st && st.candidates) || {};
      const last = st ? " (" + st.ice + "/" + st.connection + ")" : "";
      // Kept below CONNECT_TIMEOUT_MS (60 s) or this branch is unreachable:
      // the watcher gives up at ~60, so the old `> 90` could only fire from a
      // suspended tab. Running most of the clock WITHOUT a definite ICE
      // `failed` is the stale signature — expired addresses grind through
      // pair timeouts, while a live-but-blocked path fails outright sooner.
      const slow = secs > 45;
      if (!c.srflx && !c.relay) {
        return "Could not connect after " + secs + "s" + last + "."
          + " This network never revealed a public address, so the other side had"
          + " nothing to reach. Try again on a different network — mobile data"
          + " often works where guest or office Wi-Fi does not.";
      }
      if (slow) {
        return "Could not connect after " + secs + "s" + last + "."
          + " The invite probably went stale — the addresses in a code stop working"
          + " after a minute or so. Start a new invite and paste the answer back"
          + " more quickly.";
      }
      return "Could not connect after " + secs + "s" + last + "."
        + " Both sides found an address but the direct link was blocked, which"
        + " means one of these networks needs a relay to get through."
        + (st && st.turn
          ? " A relay was offered and did not carry it. Run __apex.turnProbe()"
            + " in the console to see which relay answered — if none did, set"
            + " apex26.turnApi to a credentials URL of your own. Racing over"
            + " the same Wi-Fi works meanwhile."
          : " No relay is configured at all. Race over the same Wi-Fi, or set"
            + " apex26.turnApi to a credentials URL.");
    }

    function waitForOpen() {
      clearInterval(pollTimer);
      const started = Date.now();
      // A TEST FLAG MUST ANNOUNCE ITSELF. iceRelayOnly forbids direct
      // connections so the TURN leg can be exercised — but it PERSISTS, and
      // with no reachable TURN server it makes every connection sit at
      // "Connecting…" forever with nothing on screen saying why. It did
      // exactly that to a real person who had set it on an earlier
      // instruction and had no reason to remember it.
      let relayNote = "";
      try {
        if (localStorage.getItem("apex26.iceRelayOnly") === "true") {
          relayNote = " [RELAY-ONLY TEST MODE is on — run "
            + "localStorage.removeItem('apex26.iceRelayOnly') and reload unless you are testing TURN]";
        }
      } catch (e) {}
      say("Connecting…" + relayNote);
      // Capture the transport and id being watched: by the time this fires the
      // host may have moved on to inviting somebody else, and polling "the
      // current pending one" would then connect the wrong session.
      //
      // BUT IT MAY NOT EXIST YET. host()/join() became async when the relay
      // credentials had to be in hand before the connection was built, so a
      // caller that starts hosting and immediately watches — which is what the
      // buttons do, and what every room spec does — gets here with `transport`
      // still null. Capturing that and bailing on the first tick meant the
      // room never opened at all: fourteen specs, and a player who would have
      // said the button does nothing. So adopt the transport when it appears
      // and keep the identity check from then on.
      let watched = transport;
      let watchedId = pendingId;
      pollTimer = setInterval(() => {
        if (!watched) {
          watched = transport;
          watchedId = pendingId;
          if (!watched) {
            // Still being built — but the deadline must apply HERE too: a
            // transport that never materialises (factory failure, host()
            // bailing) used to escape the timeout check below and this poll
            // spun at 4 Hz forever with no message and no failure text.
            if (Date.now() - started > CONNECT_TIMEOUT_MS) {
              clearInterval(pollTimer);
              say(failureMsg(null, Math.round((Date.now() - started) / 1000)), true);
            }
            return;
          }
        }
        if (transport !== watched && !transports.has(watchedId)) { clearInterval(pollTimer); return; }
        if (watched.status === "open") {
          clearInterval(pollTimer);
          onConnected(watchedId, watched);
          return;
        }
        const st = watched.stats ? watched.stats() : null;
        const secs = Math.round((Date.now() - started) / 1000);
        if (st) say("Connecting… " + secs + "s (" + (st.ice || "?") + "/" + (st.connection || "?") + ")" + relayNote);

        const dead = st && (st.ice === "failed" || st.connection === "failed");
        if (dead || Date.now() - started > CONNECT_TIMEOUT_MS) {
          clearInterval(pollTimer);
          Log.warn("net", "connect fail " + secs + "s");
          say(failureMsg(st, secs), true);
          // Only this attempt. A host whose SECOND invite fails still has its
          // first guest sitting in the room, and dropping them for somebody
          // else's bad network would be its own bug.
          dropPending();
          if (sessions.size) { show("room"); renderRoom(); }
          else { teardown(); show("pick"); }   // leave the lobby usable, not dead
        }
      }, 250);
    }

    function onConnected(id, t) {
      id = id != null ? id : PEER_ONE;
      t = t || transport;
      Log.info("net", "peer join " + id);
      say("Connected.");
      transports.set(id, t);
      if (transport === t) { transport = null; pendingId = null; }
      const made = NetSession.create({ transport: t });
      sessions.set(id, made);
      if (codeRoom && codeRoom.rotate) { try { codeRoom.rotate(null); } catch (e) {} }
      if (codeReopen && transports.size < MAX_GUESTS) {
        const again = codeReopen;
        codeReopen = null;
        // OWNED timer + generation guard: the handle used to be discarded, so
        // cancel()/sealRoom() could not stop it — and the late codeHost()
        // begins its OWN generation, so invalidateOperations() could not
        // stale it either. 250 ms after leaving the lobby it minted a fresh
        // RTCPeerConnection and six relay sockets — the exact zombie
        // sealRoom()'s comment says it exists to kill.
        const gen = operationGeneration;
        clearTimeout(codeReopenTimer);
        codeReopenTimer = setTimeout(() => {
          codeReopenTimer = null;
          if (!operationCurrent(gen)) return;
          codeHost({ code: again, quiet: true }).catch(() => {});
        }, 250);
      } else {
        codeReopen = null;
      }
      session = [...sessions.values()][0];
      clearInterval(pumpTimer);
      pumpTimer = setInterval(() => {
        const now = performance.now();
        for (const s of allSessions()) s.pump(now);
      }, 25);

      // The LATEST hello wins, not the first: a profile is re-sent every time
      // someone changes team or livery in the waiting room, and keeping the
      // first would race the rival's car in whatever they happened to be
      // driving when the connection opened.
      // Filed under the id of the CONNECTION it arrived on, never a `from` in
      // the payload. With three guests every profile would otherwise collide
      // into one slot — and a peer that can name itself is a peer that can name
      // somebody else.
      made.onEvent(NetPlay.EV.HELLO, (p) => {
        if (!p) { renderRoom(); return; }
        // WHOSE profile this is. On the host, always the connection it came in
        // on — a guest that could name itself could name somebody else. On a
        // guest, a `from` is a profile the HOST is RELAYING on behalf of
        // another guest, and trusting the host is not a new trust: it already
        // owns the race. Without this a guest files every relayed profile
        // under its one connection and they overwrite each other, so it never
        // learns that the other guests exist at all.
        const who = role === "host" ? id : (p.from || id);
        _peers.set(who, p);
        // THE ROSTER IS RELAYED, not just the state. Guests have no connection
        // to each other, so unless the host passes this on, B never hears that
        // C is here — a peer with no slot for C drops every packet about it,
        // and separateGrid lays out only the humans it knows about. Each relay
        // carries the sender's join `rank`, which is what settles a seat clash.
        if (role === "host") {
          const tagged = Object.assign({}, p, { from: id, rank: joinRank(id) });
          for (const [k, sess] of sessions) {
            if (k === id) continue;                 // not back to the sender
            try { sess.sendEvent(NetPlay.EV.HELLO, tagged); } catch (e) {}
          }
          // ...and the new arrival needs everyone who was already here.
          for (const [k, prof] of _peers) {
            if (k === id || !prof) continue;
            try { made.sendEvent(NetPlay.EV.HELLO, Object.assign({}, prof, { from: k, rank: joinRank(k) })); } catch (e) {}
          }
        } else if (p.from == null && p.rank != null) myRank = p.rank;   // the host told us where we stand
        // Learning what they picked is the moment a clash becomes knowable.
        resolveSeatClash();
        renderRoom();
      });
      made.onEvent(NetPlay.EV.SETTINGS, (d) => { if (role === "guest") applySettings(d); });
      made.onEvent(NetPlay.EV.READY, (d) => {
        _ready.set(id, !!(d && d.ready));
        renderRoom();
      });
      made.onEvent(NetPlay.EV.GO, () => { if (role === "guest") beginRace(); });
      // The sender-binding NetPlay's bindSession applies (sendersOwnDriver
      // there) has to hold HERE too, or it guards the wrong phase: qualifying
      // runs while the LOBBY still holds the connection, and a QUALI is an
      // input to the grid — qualiDriven() overwrites even the host's own
      // driven lap with whatever qualiPeers holds under that driverId. On the
      // host, the driver a connection may speak for is the profile its HELLO
      // filed under this connection's id (never a `from` in the payload — the
      // same reasoning as HELLO above), and seat exclusivity makes team:seat
      // a driver identity; the id format is seasonDriverId's
      // (js/game/store.js): "team:driver". No profile yet means no claim —
      // HELLO is sent at connect, long before anyone can drive a lap. On a
      // guest there is nothing to narrow to: its one connection is the host's,
      // and the host legitimately speaks for the whole field.
      function sendersOwnDriver(d) {
        if (role !== "host") return true;
        const p = _peers.get(id);
        return !!(p && p.team && d.driverId != null
          && d.driverId === p.team + ":" + (p.driver || 0));
      }
      made.onEvent(NetPlay.EV.QUALI, (d) => { if (d && d.t > 0 && sendersOwnDriver(d) && G.onPeerQuali) G.onPeerQuali(d); });
      // The lap in progress. Qualifying runs while the LOBBY still holds the
      // connection, so the live clock has to exist on this side too or it only
      // works after the race has already started — which is never.
      made.onEvent(NetPlay.EV.QLIVE, (d) => { if (d && sendersOwnDriver(d) && G.onPeerQualiLive) G.onPeerQualiLive(d); });
      made.sendEvent(NetPlay.EV.HELLO, Object.assign(localProfile(), role === "host" ? { rank: joinRank(id) } : null));
      if (role === "host") publishSettings();
      openRoom();
    }

    // Both players sit here until the host starts. The host owns the race; each
    // player owns their own car. Nothing here reimplements a picker: the
    // buttons open the game's real #select / #race-settings / #carsetup
    // screens, which is how custom teams, liveries and the parts budget come
    // along for free rather than as a second, poorer copy.
    // peerId -> profile, and peerId -> ready. A guest's one peer is the host,
    // filed under PEER_ONE; a host files each guest under its minted "gN" id.
    const PEER_ONE = "peer";
    const _peers = new Map();
    const _ready = new Map();
    const firstPeer = () => (_peers.size ? [..._peers.values()][0] : null);
    const peerIds = () => new Set([..._peers.keys(), ..._ready.keys()]);
    // Everyone has to be ready, and there has to BE somebody: an empty room
    // where nobody has said anything must not read as unanimous consent.
    const peersReady = () => {
      const ids = [...peerIds()];
      return ids.length > 0 && ids.every((k) => _ready.get(k));
    };
    let selfReady = false;

    function openRoom() {
      selfReady = false;
      _ready.clear();
      Log.info("net", "lobby room");
      show("room");
      // The lobby is a dialog over the menu, and the room is where both players
      // now wait — so it must survive the screens it opens.
      if (G.setNetRoom) G.setNetRoom(true);
      renderRoom();
      say(role === "host"
        ? "Pick the race, then start when you are both ready."
        : "The host is picking the race. Choose your car.");
    }

    function publishSettings() {
      if (!sessions.size || role !== "host") return false;
      return broadcast(NetPlay.EV.SETTINGS, {
        track: G.trackIdx,
        laps: G.raceLaps, weather: G.raceWeather, tod: G.raceTimeOfDay,
        quali: !!G.raceQuali,
        difficulty: G.difficulty,
      });
    }

    const WEATHER = new Set(["dry", "wet", "rain", "overcast", "fog"]);
    const TIME_OF_DAY = new Set(["default", "dawn", "day", "dusk", "night"]);
    const DIFFICULTY = new Set(["easy", "normal", "hard"]);
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

    function normaliseSettings(d) {
      if (!d || typeof d !== "object" || Array.isArray(d)) return null;
      const out = {};
      if (own(d, "track")) {
        if (!Number.isInteger(d.track) || d.track < 0 || !Tracks.LIST || d.track >= Tracks.LIST.length) return null;
        out.track = d.track;
      }
      if (own(d, "laps")) {
        // Friend races normally offer 3..the circuit's GP distance. Keep a
        // little protocol headroom for older/custom builds, but never accept a
        // fraction, infinity, string or session large enough to be abusive.
        if (!Number.isInteger(d.laps) || d.laps < 1 || d.laps > 200) return null;
        out.laps = d.laps;
      }
      if (own(d, "quali")) {
        if (typeof d.quali !== "boolean") return null;
        out.quali = d.quali;
      }
      if (own(d, "weather")) {
        if (typeof d.weather !== "string" || !WEATHER.has(d.weather)) return null;
        out.weather = d.weather;
      }
      if (own(d, "tod")) {
        if (typeof d.tod !== "string" || !TIME_OF_DAY.has(d.tod)) return null;
        out.tod = d.tod;
      }
      if (own(d, "difficulty")) {
        if (typeof d.difficulty !== "string" || !DIFFICULTY.has(d.difficulty)) return null;
        out.difficulty = d.difficulty;
      }
      return out;
    }

    function applySettings(d) {
      const next = normaliseSettings(d);
      if (!next) {
        say("The host sent invalid race settings. Your current setup was kept.", true);
        return false;
      }
      if (own(next, "track")) G.trackIdx = next.track;
      if (own(next, "laps")) G.raceLaps = next.laps;
      if (own(next, "quali")) G.raceQuali = next.quali;
      if (own(next, "weather")) G.raceWeather = next.weather;
      if (own(next, "tod")) G.raceTimeOfDay = next.tod;
      if (own(next, "difficulty")) G.difficulty = next.difficulty;
      renderRoom();
      return true;
    }

    function roomChanged(what) {
      if (!session) return false;
      // Resolve BEFORE announcing: a seat can be claimed while you are still in
      // the garage, and what goes on the wire should be the seat you end up in
      // rather than the one you are about to be moved out of. When it fires it
      // sends the hello itself, so this must not send a second.
      if (what === "car") { if (!resolveSeatClash()) broadcast(NetPlay.EV.HELLO, localProfile()); }
      else publishSettings();
      if (selfReady) setReady(false);
      renderRoom();
      return true;
    }

    function setReady(v) {
      selfReady = !!v;
      if (sessions.size) broadcast(NetPlay.EV.READY, { ready: selfReady });
      renderRoom();
    }

    function peerSeats(keep) {
      const out = [];
      for (const [k, p] of _peers) {
        if (p && p.team && (!keep || keep(k))) out.push({ team: p.team, driver: p.driver || 0 });
      }
      return out;
    }

    // Rank 0 is the host; a guest's rank is its join order, which the host
    // tells it in its HELLO (`rank`). Until told, a guest yields to everyone.
    let myRank = Infinity;
    const joinRank = (id) => Number(String(id).slice(1)) || 0;   // "gN" (mintGuestId) -> N
    function seatRank() { return role === "host" ? 0 : myRank; }

    // The same rule applied to SOMEBODY ELSE, so an onlooker can work out which
    // of two players holding one seat is the one about to move. Every screen
    // must reach the same answer, so it is the host's join order everywhere:
    // read off the minted id on the host, off the relay tag on a guest.
    function peerRank(id) {
      if (role === "host") return joinRank(id);
      const p = _peers.get(id);
      return p && p.from != null ? (p.rank || 0) : 0;   // untagged = the host
    }

    // A guest yields to the host and to guests that joined EARLIER, never to
    // a later one. Yielding to every peer regardless of rank let two guests on
    // one seat both move, both re-announce, and both move again — a HELLO
    // ping-pong that never settled (bug hunt 2026-09-02, scratch/seat-clash).
    function blockingSeats() {
      return seatRank() === 0 ? [] : peerSeats((k) => peerRank(k) < seatRank());
    }

    const heldBy = (list, teamId, seat) =>
      list.some((s) => s.team === teamId && s.driver === seat);

    const seatName = (teamId, seat) => {
      const t = Teams.LIST.find((x) => x.id === teamId);
      const d = t && t.drivers ? t.drivers[seat] : null;
      return { driver: d ? d.name : "that seat", team: t ? t.short : "" };
    };

    function firstFreeSeat(preferTeamId, blocked) {
      const pref = Teams.LIST.find((t) => t.id === preferTeamId);
      if (pref && pref.drivers) {
        for (let i = 0; i < pref.drivers.length; i++) {
          if (!heldBy(blocked, pref.id, i)) return { team: pref.id, driver: i };
        }
      }
      for (const t of Teams.LIST) {
        // Never move somebody INTO a custom team. makeCars() only puts one on
        // the grid for the player who selected it (js/game.js), so the
        // other screens have no such car to pose them in.
        if (t.custom || !t.drivers) continue;
        for (let i = 0; i < t.drivers.length; i++) {
          if (!heldBy(blocked, t.id, i)) return { team: t.id, driver: i };
        }
      }
      return null;
    }

    // Returns true if it MOVED us. Runs on every hello, so the no-clash path
    // has to be cheap and silent.
    function resolveSeatClash() {
      if (!session) return false;
      const mine = localProfile();
      // A CUSTOM (MY TEAM) car exists only on the grid of the player who chose it
      // (makeCars builds it for the local pick alone): no peer can pose us, and our
      // wireId is one their grid does not hold — so it is a seat we cannot keep.
      const mineTeam = Teams.LIST.find((t) => t.id === mine.team);
      const onCustom = !!(mineTeam && mineTeam.custom);
      const blocked = onCustom ? peerSeats() : blockingSeats();
      if (!blocked.length && !onCustom) return false;
      if (!onCustom && !heldBy(blocked, mine.team, mine.driver)) return false;
      const move = firstFreeSeat(onCustom ? null : mine.team, blocked);
      if (!move) { say("Every seat is taken. Pick another car.", true); return false; }

      const ti = Teams.LIST.findIndex((t) => t.id === move.team);
      if (ti < 0) return false;
      const was = seatName(mine.team, mine.driver);
      const now = seatName(move.team, move.driver);
      // IN-MEMORY only, deliberately: the lobby imposes this move, the player
      // did not choose it, so persisting it silently rewrote the saved
      // solo/career team for every session after the friend race. The race
      // itself only needs G.teamIdx/driverIdx; a reload mid-lobby comes back
      // on the saved seat and re-resolves on the next HELLO.
      G.teamIdx = ti;
      G.driverIdx = move.driver;

      // Announced, never silent. #vs-status is already role="status"
      // aria-live="polite", so this reaches a screen reader too. A notice, not
      // an error: nothing failed, somebody was simply quicker.
      const seatTxt = now.driver + (now.team ? " (" + now.team + ")" : "");
      say(onCustom ? "MY TEAM cars only exist on your own screen — you're driving " + seatTxt + " for this race."
                   : was.driver + " was taken — you're driving " + seatTxt + ".");
      broadcast(NetPlay.EV.HELLO, localProfile());
      if (selfReady) setReady(false);
      const garage = $("carsetup");
      if (garage && !garage.hidden && G.buildSetup) G.buildSetup();
      renderRoom();
      return true;
    }

    const TEAM_OF = (p) => (p && p.team && Teams.LIST.find((t) => t.id === p.team)) || null;

    function css(rgb) {
      if (!Array.isArray(rgb)) return "#888";
      const b = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))));
      return `rgb(${b[0]},${b[1]},${b[2]})`;
    }

    // A seat two players are BOTH holding, for the moment before it resolves.
    // Clashes are settled after the fact: the lower-ranked player learns what
    // the other picked, moves, and re-announces — one round trip during which
    // every OTHER screen would honestly draw two rows in the same car (the
    // mover's own screen resolves synchronously). So an onlooker does not draw
    // the duplicate at all: the player who will yield — by the same rank rule
    // they will use themselves, so every screen picks the same one — is shown
    // as still choosing, which is the state one round trip early, not a guess.
    //
    // How long we will draw a clashing peer as "still choosing" before giving
    // up and showing the clash for real. A yield is one round trip; anything
    // longer means the peer is NOT going to move — an older build with no
    // exclusivity, or one that could find no free seat — and at that point
    // hiding their car stops being early and starts being a lie. Their row
    // would sit blank for ever while they sat in a car we refused to draw.
    const YIELD_GRACE_MS = 2000;
    const clashSince = new Map();          // peer id -> { at, timer } (owned re-render timer)
    function clashDrop(id) {
      const rec = clashSince.get(id);
      if (rec && rec.timer) clearTimeout(rec.timer);
      clashSince.delete(id);
    }
    function clashClear() {
      for (const rec of clashSince.values()) if (rec.timer) clearTimeout(rec.timer);
      clashSince.clear();
    }

    function willYield(id) {
      if (outranked(id)) return grace(id);
      clashDrop(id);                       // no clash, or this peer wins it
      return false;
    }

    function outranked(id) {
      const mine = _peers.get(id);
      if (!mine || !mine.team) return false;
      const rank = peerRank(id);
      const same = (p) =>
        p && p.team === mine.team && (p.driver || 0) === (mine.driver || 0);
      for (const other of peerIds()) {
        if (other !== id && same(_peers.get(other)) && peerRank(other) < rank) return true;
      }
      return same(localProfile()) && seatRank() < rank;
    }

    // True only while the yield is still plausibly in flight. Also arms one
    // re-render at the deadline, so a peer that never moves stops being hidden
    // without needing another event to arrive — otherwise the row would stay
    // blank until something unrelated happened to repaint it.
    function grace(id) {
      const now = performance.now();
      if (!clashSince.has(id)) {
        // Owned re-render timer (was the only timer in this file with no
        // owner): clashDrop/clashClear clear the handle on every teardown
        // path, so a lobby closed into a race cannot fire renderRoom later.
        const timer = setTimeout(() => {
          const rec = clashSince.get(id);
          if (rec) { rec.timer = null; renderRoom(); }
        }, YIELD_GRACE_MS + 50);
        clashSince.set(id, { at: now, timer });
      }
      return now - clashSince.get(id).at < YIELD_GRACE_MS;
    }

    function span(className, text) {
      const el = document.createElement("span");
      el.className = className;
      el.textContent = text;
      return el;
    }

    function driverLine(profile, label, ready) {
      const team = TEAM_OF(profile);
      const seat = profile ? (profile.driver || 0) : 0;
      const d = team && team.drivers ? team.drivers[seat] : null;
      const who = team ? `${team.short} · ${d ? (d.code || d.name) : "—"}` : "choosing a car…";
      const full = team ? `${team.name}${d ? " · " + d.name : ""}` : "still choosing";
      const frag = document.createDocumentFragment();
      frag.appendChild(span("vs-who", label));
      if (team) {
        const swatch = span("vs-swatch", "");
        swatch.style.background = css(team.color);
        frag.appendChild(swatch);
      }
      const car = span("vs-car", who);
      car.title = full;
      frag.appendChild(car);
      frag.appendChild(span("vs-ready" + (ready ? " on" : ""), ready ? "READY" : "choosing"));
      return frag;
    }

    function replace(el, node) {
      while (el.firstChild) el.removeChild(el.firstChild);
      if (node) el.appendChild(node);
    }

    function summaryRow(label, value) {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = String(value);
      row.appendChild(dt); row.appendChild(dd);
      return row;
    }

    function renderRoom() {
      const e = els();
      if (!e.roomStep || e.roomStep.hidden) return;
      const host = role === "host";
      const track = (Tracks.LIST && Tracks.LIST[G.trackIdx]) || null;
      const wx = G.raceWeather === "wet" ? "Wet" : G.raceWeather === "dry" ? "Dry" : "Mixed";
      const tod = G.raceTimeOfDay && G.raceTimeOfDay !== "default"
        ? G.raceTimeOfDay.charAt(0).toUpperCase() + G.raceTimeOfDay.slice(1) : "Default";
      if (e.raceSummary) {
        const frag = document.createDocumentFragment();
        frag.appendChild(summaryRow("Circuit", track ? (track.name || track.id) : "—"));
        frag.appendChild(summaryRow("Laps", G.raceLaps));
        frag.appendChild(summaryRow("Qualifying lap", G.raceQuali ? "On" : "Off"));
        frag.appendChild(summaryRow("Weather", wx));
        frag.appendChild(summaryRow("Time", tod));
        replace(e.raceSummary, frag);
      }
      if (e.editRace) e.editRace.hidden = !host;
      if (e.raceNote) {
        e.raceNote.textContent = host ? ""
          : "The host chooses the circuit and conditions — and everyone connects through them, so if they leave, the race ends.";
        e.raceNote.hidden = host;
      }
      if (e.me) replace(e.me, driverLine(localProfile(), "You", selfReady));
      // A row per other player. #vs-them is a LIST now, so this builds one
      // .vs-driver per peer rather than overwriting a single fixed row — with
      // one peer it renders exactly what it always did.
      //
      // Iterated over peerIds(), not _peers: somebody who has said READY but
      // whose profile has not arrived is still in the room, and showing nothing
      // for them is how you get a START that will not enable with no visible
      // reason why. That ordering is not hypothetical — it is the bug the
      // READY specs caught.
      if (e.them) {
        const ids = [...peerIds()];
        const row = (inner) => {
          const el = document.createElement("div");
          el.className = "vs-driver";
          el.appendChild(inner);
          return el;
        };
        const rows = document.createDocumentFragment();
        if (ids.length) ids.forEach((k, i) => rows.appendChild(row(driverLine(
              willYield(k) ? null : (_peers.get(k) || null),
              ids.length > 1 ? "P" + (i + 2) : "Them", !!_ready.get(k)))));
        else rows.appendChild(row(driverLine(null, "Them", false)));
        replace(e.them, rows);
      }
      if (e.inviteMore) {
        e.inviteMore.hidden = !host;
        const full = sessions.size >= MAX_GUESTS;
        e.inviteMore.disabled = full;
        e.inviteMore.textContent = full ? "ROOM FULL (4 PLAYERS)" : "INVITE ANOTHER";
      }
      if (e.ready) {
        e.ready.textContent = selfReady ? "NOT READY" : "READY";
        e.ready.setAttribute("aria-pressed", selfReady ? "true" : "false");
      }
      if (e.start) {
        e.start.hidden = !host;
        e.start.disabled = !(selfReady && peersReady());
      }
    }

    function startFromRoom() {
      if (role !== "host" || !session) return false;
      // "Everyone", not "both" — the sentence has to survive a third player.
      if (!(selfReady && peersReady())) { say("Everyone needs to be ready.", true); return false; }
      publishSettings();
      broadcast(NetPlay.EV.GO, {});
      beginRace();
      return true;
    }

    // SEAL THE ROOM before the race owns the connections. close() only clears the
    // lobby's own timers, so the room-code subscription reopened by onConnected()
    // (codeHost({quiet:true}) — a fresh pending transport plus live relay sockets)
    // survived into the race for the whole 120 s JOIN_TIMEOUT. A second guest
    // arriving on that still-live code drove onJoiner -> onConnected mid-race:
    // the lobby's 25 ms pump restarted alongside NetPlay, a session NetPlay never
    // adopts was built, and openRoom()'s setNetRoom(true) sent later garage /
    // race-settings exits back to the hidden #vsfriend dialog. Nobody can join a
    // race that has already started, so stop advertising one.
    function sealRoom() {
      codeReopen = null;     // no silent reopen on some later, unrelated connect
      clearTimeout(codeReopenTimer); codeReopenTimer = null;   // incl. one already in flight
      stopCodeWait();        // cancel the poll loop AND close the Nostr room
      dropPending();         // and the half-built invite transport it minted
    }

    function beginRace() {
      if (G.raceQuali && G.openQualiForNet) {
        say("Qualifying…");
        sealRoom();
        if (G.setNetRoom) G.setNetRoom(false);
        try {
          G.flow = "gp";
          G.openQualiForNet(finishStart);   // calls back when TO THE GRID is pressed
        } catch (e) {
          say("Could not start qualifying: " + (e && e.message), true);
          return;
        }
        close();         // the sheet is the screen now — but the SESSION stays open
        return;
      }
      finishStart();
    }

    function reportQuali(driverId, t) {
      if (!session || !(t > 0)) return false;
      return broadcast(NetPlay.EV.QUALI, { driverId, t: +t.toFixed(3) });
    }

    function reportQualiLive(driverId, t, frac) {
      if (!session || !(t >= 0)) return false;
      return broadcast(NetPlay.EV.QLIVE, { driverId, t: +t.toFixed(2), frac: +(frac || 0).toFixed(3) });
    }

    async function finishStart() {
      say("Starting race…");
      sealRoom();      // idempotent: the quali branch may already have run it
      if (G.setNetRoom) G.setNetRoom(false);
      try {
        // A friend race is a one-off Grand Prix, never a championship round
        // or a time trial. flow/session are the authority (js/game.js).
        G.flow = "gp";
        G.session = "race";
        // startRace is ASYNC (it awaits ensureScenery) — without the await,
        // netPlay.start() below ran before makeCars()/gridUp(): on a fresh
        // page G.cars was [] (no_slot → cancel → quitToMenu, the friend race
        // never started); after a quali the slots were picked from the OLD
        // car objects that makeCars() then replaced, so owns() never matched
        // and the rival's slot ran as AI while our own pose parked on the
        // old grid.
        await G.startRace();
        if (!sessions.size) { clearInterval(pumpTimer); pumpTimer = null; close(); return; }
      } catch (e) {
        say("Could not start the race: " + (e && e.message), true);
        return;
      }
      const started = G.netPlay.start({
        sessions: [...sessions.entries()].map(([id, s]) => ({ id, session: s })),
        session, role,
        peerProfile: firstPeer(),
        peerMods: modsFromProfile(firstPeer()),
        peers: [..._peers.entries()].map(([id, p]) => ({ id, profile: p, mods: modsFromProfile(p) })),
      });
      clearInterval(pumpTimer);          // the game loop pumps it from here on
      pumpTimer = null;
      session = null;                    // owned by NetPlay now
      sessions.clear();
      if (!started.ok) {
        say(started.message || "Could not start the session.", true);
        // q-go already cleared qualiNetDone, so quitToMenu would not cancel.
        cancel();
        if (G.quitToMenu) G.quitToMenu();
        return;
      }
      if (role === "host") G.netPlay.hostStart();
      close();
    }

    const sessions = new Map();
    let session = null;
    const allSessions = () => [...sessions.values()];
    function broadcast(type, data) {
      let ok = false;
      for (const s of allSessions()) { try { ok = s.sendEvent(type, data) || ok; } catch (e) {} }
      return ok;
    }
    let pumpTimer = null;

    async function host() {
      const gen = beginOperation();
      await readyIce();
      if (!operationCurrent(gen)) return cancelledResult();
      show("hosting");
      if (!newTransport("host")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      const pending = transport;
      say("Preparing invite… (this can take a few seconds)");
      const res = await NetHandshake.createInvite(pending, localProfile());
      if (!operationCurrent(gen) || transport !== pending) return cancelledResult();
      if (!res.ok) { say(res.message || "Could not create an invite.", true); return res; }
      const e = els();
      if (e.invite) e.invite.value = res.code;
      const scannable = drawQr(res.code);
      say(scannable
        ? "Send them the link, or have them scan the code."
        : "Send that invite code to your friend.");
      return res;
    }

    async function inviteAnother() {
      if (role !== "host") return { ok: false, error: "not_host" };
      if (sessions.size >= MAX_GUESTS) {
        say("That is four players — the grid is full.", true);
        return { ok: false, error: "room_full" };
      }
      show("pick");
      if ($("vs-join")) $("vs-join").hidden = true;
      if ($("vs-code-join")) $("vs-code-join").hidden = true;
      say("Invite another player — a link or a room code, whichever suits.");
      return { ok: true, step: "pick" };
    }

    async function join() {
      const gen = beginOperation();
      show("joining");
      await readyIce();
      if (!operationCurrent(gen)) return cancelledResult();
      if (!newTransport("guest")) return;
      say("Paste the invite code they sent you.");
      return { ok: true };
    }

    async function makeAnswer(codeIn) {
      const gen = beginOperation();
      const e = els();
      const code = codeIn != null ? codeIn : (e.inviteIn ? e.inviteIn.value : "");
      if (codeIn != null && e.inviteIn) e.inviteIn.value = codeIn;
      if (!code.trim()) { say("Paste their invite code first.", true); return { ok: false, error: "empty" }; }
      if (!transport) { say(noConnectionMsg(), true); return { ok: false, error: "no_transport" }; }
      const pending = transport;
      say("Reading invite…");
      const res = await NetHandshake.acceptInvite(pending, code, localProfile());
      if (!operationCurrent(gen) || transport !== pending) return cancelledResult();
      if (!res.ok) { say(res.message || "That invite could not be read.", true); return res; }
      if (res.peer) _peers.set(PEER_ONE, res.peer);
      if (e.answer) e.answer.value = res.code;
      if (e.answerHint) e.answerHint.hidden = false;
      if (e.answerActions) e.answerActions.hidden = false;
      if (e.answerRaw) e.answerRaw.hidden = false;
      // Step 2's placeholder prose is replaced by step 2 itself.
      if (e.answerWait) e.answerWait.hidden = true;
      drawAnswerQr(res.code);
      waitForOpen();
      say("Send that answer code back, then wait for the race to start.");
      return res;
    }

    async function acceptAnswer(codeIn) {
      const gen = beginOperation();
      const e = els();
      const code = codeIn != null ? codeIn : (e.answerIn ? e.answerIn.value : "");
      if (codeIn != null && e.answerIn) e.answerIn.value = codeIn;
      if (!code.trim()) { say("Paste their answer code first.", true); return { ok: false, error: "empty" }; }
      if (!transport) { say(noConnectionMsg(), true); return { ok: false, error: "no_transport" }; }
      const pending = transport;
      const id = pendingId;
      say("Reading answer…");
      const res = await NetHandshake.acceptAnswer(pending, code);
      if (!operationCurrent(gen) || transport !== pending || pendingId !== id) return cancelledResult();
      if (!res.ok) { say(res.message || "That answer could not be read.", true); return res; }
      // Under the id of the connection this answer belongs to, NOT a fixed
      // key. As PEER_ONE, accepting a second guest overwrote the first and
      // ALSO left a phantom "peer" entry that no session ever answers for —
      // so peersReady() could never be true and START was unreachable. Found
      // by tools/net/rtc-e2e-3p, which is the only thing that can see it.
      if (res.peer) _peers.set(id || PEER_ONE, res.peer);
      waitForOpen();
      return res;
    }

    function codeFrom(text) {
      const raw = String(text || "").trim();
      if (!raw) return "";
      return NetHandshake.inviteFromUrl(raw) || raw;
    }

    function deliver(kind, text) {
      const code = codeFrom(text);
      if (!code) return false;
      const e = els();
      const box = kind === "invite" ? e.inviteIn : e.answerIn;
      if (box) box.value = code;
      return kind === "invite" ? makeAnswer(code) : acceptAnswer(code);
    }

    let scanner = null;
    let scannerGeneration = 0;

    function stopScan() {
      scannerGeneration++;
      const active = scanner;
      scanner = null;
      if (active) active.stop();
      const e = els();
      if (e.scan) e.scan.hidden = true;
    }

    async function scan(kind) {
      const e = els();
      if (!e.scan || !e.scanVideo) return { ok: false, error: "no_ui" };
      if (!NetScan.supported()) {
        say("This browser cannot use the camera — paste the code instead.", true);
        return { ok: false, error: "unsupported" };
      }
      stopScan();
      const gen = scannerGeneration;
      e.scan.hidden = false;
      say("Point the camera at their code…");
      const attempt = NetScan.create();
      scanner = attempt;
      let delivered = false;
      const res = await attempt.start(e.scanVideo, (text) => {
        // A decoder/camera from an older scan may finish after a second scan has
        // started. It may stop itself, but it must not stop the new scanner,
        // hide its panel, or deliver into the wrong input.
        if (scanner !== attempt || scannerGeneration !== gen) { attempt.stop(); return; }
        delivered = true;
        stopScan();
        say("Got it.");
        deliver(kind, text);
      });
      if (delivered) return res;
      if (scanner !== attempt || scannerGeneration !== gen) {
        attempt.stop();
        return cancelledResult();
      }
      if (!res.ok) { stopScan(); say(res.message || "Could not start the camera.", true); }
      return res;
    }

    async function pasteInto(kind) {
      let text = "";
      try { text = await navigator.clipboard.readText(); }
      catch (err) {
        say("Could not read the clipboard — paste into the box instead.", true);
        return { ok: false, error: "denied" };
      }
      if (!codeFrom(text)) { say("There is no code on the clipboard.", true); return { ok: false, error: "empty" }; }
      return deliver(kind, text);
    }

    async function copy(text) {
      if (!text) { say("There is nothing to copy yet.", true); return false; }
      try { await navigator.clipboard.writeText(text); say("Copied."); return true; }
      catch (e) { say("Could not copy — select the code and copy it manually.", true); return false; }
    }

    // The invite goes out as a LINK, not a code: opening it drops the guest
    // straight into joining with the box already filled (see wire()), which
    // removes the "paste this into the right field" step entirely. The code
    // rides in the fragment, so it never reaches a server — which matters
    // because the entire design is that there ISN'T one.
    //
    // The ANSWER is shared as bare text on purpose. There is no "open this to
    // answer" flow — the host pastes it into a box they already have open — so
    // dressing it as a link would promise a journey that does not exist.
    //
    // navigator.share is a progressive enhancement: where it exists this opens
    // the OS share sheet (Messages, WhatsApp, AirDrop), and where it doesn't we
    // fall back to the clipboard. The button says which it will do rather than
    // disappearing, because a control that vanishes reflows the sheet and the
    // next tap lands on something else.
    const canShare = () => typeof navigator !== "undefined" && !!navigator.share;

    async function handOff(data, fallbackText) {
      if (!fallbackText) { say("There is nothing to share yet.", true); return false; }
      if (canShare()) {
        try { await navigator.share(data); say("Shared."); return true; }
        catch (e) {
          if (e && e.name === "AbortError") return false;
        }
      }
      return copy(fallbackText);
    }

    // The QR carries the invite LINK, not the code, and that distinction is the
    // whole feature: a link scanned by the guest's ordinary camera app opens
    // the game with the joining step showing and the code already filled in. A
    // QR of the bare code would just show them 240 characters to retype.
    //
    // No in-page scanner anywhere. BarcodeDetector is absent on desktop Linux
    // Chrome and on iOS Safari (measured), so scanning ourselves would serve a
    // minority while the OS camera serves nearly everyone.
    // Draw `payload` into `canvas`, revealing `wrap` only if it actually
    // encoded. A code too long for any version, or a page with no location to
    // build a URL from, hides the QR rather than showing an unreadable one —
    // the text code beside it still works.
    function paintQr(wrap, canvas, payload) {
      if (!wrap || !canvas) return false;
      const ok = !!(payload && NetQr.draw(canvas, payload, { px: 320 }));
      wrap.hidden = !ok;
      return ok;
    }

    function drawQr(code) {
      return paintQr($("vs-qr-wrap"), $("vs-qr"),
        code ? NetHandshake.inviteUrl(code) : null);
    }
    function drawAnswerQr(code) {
      const e = els();
      return paintQr(e.answerQrWrap, e.answerQr, code || null);
    }

    function shareInvite() {
      const e = els();
      const code = e.invite ? e.invite.value : "";
      const url = code ? NetHandshake.inviteUrl(code) : null;
      if (!url) return handOff({ title: "Apex 26", text: code }, code);
      return handOff({ title: "Apex 26", text: "Race me on Apex 26", url }, url);
    }

    function shareAnswer() {
      const code = (els().answer || {}).value || "";
      return handOff({ title: "Apex 26 answer", text: code }, code);
    }

    // Same handshake, same codes on the wire — a relay carries the two strings
    // instead of a human. It is hidden unless a relay URL is configured, and it
    // never replaces the link/QR flow: everything else in this game is static
    // files that cannot break, and this one depends on a service somebody has
    // to keep alive. When it fails it must fall back, not fail the lobby.
    let codeWait = null;                 // cancel token for the polling loop

    function stopCodeWait() {
      if (codeWait) codeWait.cancelled = true;
      codeWait = null;
      if (codeRoom && codeRoom.stop) { try { codeRoom.stop(); } catch (e) {} }
      codeRoom = null;
    }

    function showCodeStep(mode, headline, hint) {
      const e = els();
      show("code");
      if (e.codeHead) e.codeHead.textContent = headline;
      if (e.codeHint) e.codeHint.textContent = hint || "";
      if (e.codeShow) e.codeShow.hidden = mode !== "show";
      if (e.codeInputWrap) e.codeInputWrap.hidden = mode !== "input";
    }

    // HOST: make a code, publish the invite under it, wait for the answer.
    // opts.code   reopen the SAME room after a guest connected (see onJoiner)
    // opts.quiet   do not repaint the code step — we are already past it
    async function codeHost(opts) {
      opts = opts || {};
      const gen = beginOperation();
      stopCodeWait();
      await readyIce();
      if (!operationCurrent(gen)) return cancelledResult();
      if (!newTransport("host")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      const initialTransport = transport;
      const code = opts.code || NetRendezvous.makeCode();
      // The room is CLOSED while our own ICE runs and reopened afterwards (see
      // onJoiner), so this path runs twice per guest. The second time we are
      // already in the waiting room and must not drag the player back to the
      // code screen.
      if (!opts.quiet) {
        showCodeStep("show", "Your room code", "Read this to your friend.");
        const e = els();
        if (e.codeValue) e.codeValue.textContent = code;
        say("Preparing… (this can take a few seconds)");
      }

      const invite = await NetHandshake.createInvite(initialTransport, localProfile());
      if (!operationCurrent(gen) || transport !== initialTransport) return cancelledResult();
      if (!invite.ok) { say(invite.message || "Could not create an invite.", true); return invite; }

      say("Waiting for them to join…");
      codeWait = { cancelled: false };

      if (!NetRendezvous.usingPrivateRelay()) {
        const answersSeen = new Set();
        const sub = await NetRendezvous.hostRoom({
          code, token: codeWait,
          mine: invite.code,
          onFail: (r) => {
            if (!operationCurrent(gen)) return;
            if (!r || r.error === "cancelled" || r.error === "stopped") return;
            // An ADVISORY is a warning about a room that is still running —
            // say it, but do not forget the room, or the next rotate()/stop()
            // has nothing to act on and the code silently stops working.
            if (r.advisory) { say(r.message, true); return; }
            codeRoom = null;
            say(r.message || "The room service went away. Use the invite link or QR instead.", true);
          },
          onTick: () => {
            if (!operationCurrent(gen)) return;
            say(sessions.size
              ? "In the room: " + (sessions.size + 1) + ". Still open (code " + code + ")"
              : "Waiting for them to join… (code " + code + ")");
          },
          // The first arrival gets the invite already prepared; everyone after
          // gets a fresh transport and a fresh offer.
          // Only called to REPLACE an offer somebody has taken, never per
          // arrival — minting is a whole RTCPeerConnection plus an ICE gather,
          // and doing that on every join is what got us rate-limited.
          mintOffer: async () => {
            if (!operationCurrent(gen) || sessions.size >= MAX_GUESTS) return null;      // stale/full
            await readyIce();
            if (!operationCurrent(gen)) return null;
            if (!newTransport("host")) return null;
            const pending = transport;
            const more = await NetHandshake.createInvite(pending, localProfile());
            if (!operationCurrent(gen) || transport !== pending) return null;
            return more.ok ? more.code : null;
          },
          onJoiner: async (_who, answer) => {
            if (!operationCurrent(gen)) return;
            if (answersSeen.has(answer)) return;
            // MARK IT SEEN ONLY ONCE IT CAN BE ACTED ON. Recording it before
            // the guard below meant an answer that arrived a moment too early
            // — between transports, or before pendingId was set — was dropped
            // AND blacklisted, so the guest's retries all matched
            // answersSeen and were ignored. The host then waited for an answer
            // it had already thrown away, which on a LAN, where ICE cannot be
            // at fault, presents as a permanent "Connecting…".
            if (!transport || !pendingId) return;   // nothing awaiting an answer
            answersSeen.add(answer);
            const pending = transport;
            const id = pendingId;
            const acc = await NetHandshake.acceptAnswer(pending, answer);
            if (!operationCurrent(gen) || transport !== pending || pendingId !== id) return;
            if (!acc.ok) {
              // A rejected answer must not stay blacklisted either: the guest
              // may repost the same string against a transport that is by then
              // ready for it.
              answersSeen.delete(answer);
              if (acc.error !== "already_answered") say(acc.message || "That answer could not be read.", true);
              return;
            }
            if (acc.peer) _peers.set(id, acc.peer);
            // GET OUT OF TRYSTERO'S WAY BEFORE OUR OWN ICE RUNS.
            //
            // The rendezvous has done its job the moment an answer is
            // accepted: both sides hold each other's SDP and nothing more
            // needs to cross it. But in subscription mode the room stays open
            // for further joiners, which leaves Trystero's OWN
            // RTCPeerConnection and six relay WebSockets live on this device
            // while our connection negotiates.
            //
            // Measured on real hardware, and it is the whole bug: an invite
            // link between the same two devices connects in ~6 s over a plain
            // host<->host LAN pair, while the room-code path leaves all 36
            // pairs — INCLUDING that same host<->host pair — with checks sent
            // and not one response, on either peer. Trystero's own connection
            // succeeds at that exact moment, which is how the answer reached
            // us. One WebRTC connection works on that network and the second
            // one does not, and iOS Safari is where it shows.
            //
            // So the room closes here. A host who wants another player mints a
            // fresh code, which is a button rather than a bug — and infinitely
            // better than a room that stays open and cannot connect anybody.
            codeReopen = code;
            stopCodeWait();
            waitForOpen();
          },
        });
        if (!operationCurrent(gen)) {
          if (sub && sub.stop) { try { sub.stop(); } catch (e) { /* cancellation is already complete locally */ } }
          return cancelledResult();
        }
        if (!sub.ok) { say(sub.message || "Could not open that room.", true); return sub; }
        codeRoom = sub;
        return { ok: true, code, subscribed: true };
      }

      // PRIVATE RELAY: a mailbox with two slots, so one guest. Unchanged.
      const got = await NetRendezvous.swap({
        code, mine: invite.code, slot: "offer", want: "answer",
        token: codeWait,
        onTick: () => {
          if (operationCurrent(gen)) say("Waiting for them to join… (code " + code + ")");
        },
      });
      if (!operationCurrent(gen) || transport !== initialTransport) return cancelledResult();
      if (!got.ok) {
        if (got.error !== "cancelled") say(got.message, true);
        return got;
      }
      const acc = await NetHandshake.acceptAnswer(initialTransport, got.payload);
      if (!operationCurrent(gen) || transport !== initialTransport) return cancelledResult();
      if (!acc.ok) { say(acc.message || "That answer could not be read.", true); return acc; }
      if (acc.peer) _peers.set(pendingId || PEER_ONE, acc.peer);
      waitForOpen();
      return { ok: true, code };
    }

    // GUEST: fetch the invite the host published, answer it under the same code.
    async function codeJoin(codeIn) {
      const gen = beginOperation();
      stopCodeWait();
      const e = els();
      const raw = codeIn != null ? codeIn : (e.codeIn ? e.codeIn.value : "");
      const code = NetRendezvous.normalise(raw);
      if (!NetRendezvous.valid(code)) {
        say("That is not a room code — six letters and numbers.", true);
        return { ok: false, error: "bad_code" };
      }
      await readyIce();
      if (!operationCurrent(gen)) return cancelledResult();
      if (!newTransport("guest")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      const pending = transport;
      say("Looking for that room…");
      codeWait = { cancelled: false };
      let answered = null;
      const done = await NetRendezvous.swap({
        code, slot: "answer", want: "offer", token: codeWait,
        onTick: () => { if (operationCurrent(gen)) say("Looking for that room… (code " + code + ")"); },
        reply: async (inviteCode) => {
          if (!operationCurrent(gen) || transport !== pending) return null;
          say("Found it — answering…");
          // ANSWER FAST, because the channel carrying it is dying.
          //
          // The default gather waits up to GATHER_TIMEOUT_MS (8 s) for
          // stragglers. On the invite path that costs nothing — a human
          // carries the code and will wait. Here the answer goes back over
          // Trystero, and eight seconds is long enough for that peer to
          // disappear: measured on real hardware, every retry came back
          // "Trystero: no peer with id … found", targeted AND untargeted, so
          // by then the room was empty. The host sat on "Waiting for them to
          // join…" for its full two minutes.
          //
          // Relay and srflx candidates land in well under a second; what the
          // extra seven buy is stragglers we do not need, at the price of the
          // only route the answer has. So the room-code path gathers briefly
          // and posts while somebody is still listening.
          const res = await NetHandshake.acceptInvite(pending, inviteCode, localProfile(),
            { gatherTimeoutMs: 2500 });
          if (!operationCurrent(gen) || transport !== pending) return null;
          if (!res.ok) { answered = res; return null; }
          if (res.peer) _peers.set(PEER_ONE, res.peer);
          answered = res;
          return res.code;
        },
      });
      if (!operationCurrent(gen) || transport !== pending) return cancelledResult();
      if (!done.ok) {
        const why = (done.error === "reply_failed" && answered && !answered.ok) ? answered : done;
        if (why.error !== "cancelled") say(why.message || "Could not join that room.", true);
        return why;
      }
      waitForOpen();
      say("Joining…");
      return { ok: true, code };
    }

    // There is no "no relay" state to report. NetRendezvous.configured() is
    // unconditionally true BY DESIGN — with no private Worker URL set, room
    // codes fall back to the public Nostr relay pool, which needs no account
    // and nothing deployed (js/net/rendezvous.js, and pinned by
    // tests/unit/net-rendezvous.test.mjs). Two guards here tested that function and
    // therefore could never fire, and the message they would have shown —
    // "Room codes need a relay deployed" — was the opposite of true. Both are
    // deleted rather than rewritten: an unreachable branch that lies is worse
    // than no branch. Real relay failures surface from exchange() as typed
    // errors (all_rejected, timeout) and are reported where they happen.

    // A PHONE THAT HOSTS FALLS ASLEEP, and that is the whole reason "desktop
    // hosts → phone joins" worked while the reverse did not (reported from a
    // real pair of devices). Hosting means WAITING — you tap NEW CODE, put the
    // phone down, and spend half a minute getting the other machine into the
    // lobby. In that time the screen locks, the mobile browser suspends the
    // page, the relay WebSocket dies, and the friend's answer arrives at a
    // page that is asleep. The guest never has this problem, because joining
    // is the one moment the phone is guaranteed to be in somebody's hand.
    //
    // So the lobby holds a SCREEN WAKE LOCK while it is open. Browsers
    // release the lock on every hide (that is spec), so it is re-acquired on
    // return; close() and cancel() drop it. Where the API is missing (older
    // iOS) this is a silent no-op — the fix degrades to the old behaviour,
    // never to an error.
    let wake = null;
    let wakeWanted = false;
    let wakeRequest = null;
    let wakeGeneration = 0;
    function releaseWake(lock) {
      try {
        const released = lock && lock.release();
        if (released && typeof released.catch === "function") released.catch(() => {});
      } catch (e) { /* missing/released wake locks degrade to the sleeping behavior */ }
    }
    function holdWake() {
      wakeWanted = true;
      try {
        if (!navigator.wakeLock || wake || wakeRequest) return;
        const gen = ++wakeGeneration;
        let pending = null;
        pending = Promise.resolve(navigator.wakeLock.request("screen")).then((l) => {
          if (wakeRequest === pending) wakeRequest = null;
          if (!wakeWanted || gen !== wakeGeneration) {
            // The lobby closed (or closed and reopened) while permission was in
            // flight. A late sentinel belongs to that old request and must never
            // survive into the new screen.
            releaseWake(l);
            if (wakeWanted) holdWake();
            return;
          }
          wake = l;
          l.addEventListener("release", () => { if (wake === l) wake = null; });
        }).catch(() => { if (wakeRequest === pending) wakeRequest = null; });
        wakeRequest = pending;
      } catch (e) {}
    }
    function dropWake() {
      wakeWanted = false;
      wakeGeneration++;
      const held = wake;
      wake = null;
      releaseWake(held);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && wakeWanted) holdWake();
    });

    function open() {
      invalidateOperations();
      holdWake();
      Log.info("net", "lobby open");
      try { if (NetTransport.prefetchIce) NetTransport.prefetchIce(); } catch (e) {}
      const e = els();
      if (!e.screen) return false;
      _peers.clear(); _ready.clear(); clashClear(); myRank = Infinity;
      show("pick");
      // inviteAnother() hides these; a fresh open must always offer all four
      // routes again, or a player who once invited a second guest can never
      // JOIN anybody afterwards.
      if ($("vs-join")) $("vs-join").hidden = false;
      if ($("vs-code-join")) $("vs-code-join").hidden = false;
      for (const f of ["invite", "inviteIn", "answer", "answerIn"]) if (e[f]) e[f].value = "";
      if (e.answerHint) e.answerHint.hidden = true;
      if (e.answerActions) e.answerActions.hidden = true;
      if (e.answerRaw) e.answerRaw.hidden = true;
      if (e.answerWait) e.answerWait.hidden = false;
      // Reopening must not show the PREVIOUS session's QR — it would point a
      // camera at a peer connection that no longer exists.
      if ($("vs-qr-wrap")) $("vs-qr-wrap").hidden = true;
      if (e.answerQrWrap) e.answerQrWrap.hidden = true;
      stopScan();
      const raw = document.querySelector("#vs-hosting .vs-raw");
      if (raw) raw.open = false;
      say("");
      e.screen.hidden = false;
      return true;
    }

    // BACK from the qualifying sheet: the session is still ours (NetPlay has
    // not adopted it) and the peers are still in the room. Do NOT open() —
    // that wipes _peers — and do NOT cancel() — that tears the RTC down.
    // Just put the waiting room back on screen and mark netRoom so garage /
    // race-settings return here instead of starting a solo GP.
    function abortQuali() {
      if (G.setNetRoom) G.setNetRoom(true);
      const e = els();
      if (e.screen) e.screen.hidden = false;
      show("room");
      renderRoom();
      say("Qualifying cancelled.");
      Log.info("net", "lobby abortQuali");
      return true;
    }

    function close() {
      invalidateOperations();
      clearInterval(pollTimer);
      Log.info("net", "lobby close");
      stopScan();
      dropWake();
      const e = els();
      if (e.screen) e.screen.hidden = true;
    }

    // Abandoning the lobby must tear the half-built connection down, or a
    // stale RTCPeerConnection sits there gathering candidates forever.
    function cancel() {
      stopScan();
      stopCodeWait();
      codeReopen = null;
      clearTimeout(codeReopenTimer); codeReopenTimer = null;
      teardown();
      role = null;
      _peers.clear(); _ready.clear(); clashClear(); myRank = Infinity;
      close();
    }

    function wire() {
      const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
      on("vs-host", host);
      on("vs-join", join);
      // Called with NO argument on purpose. Both take an optional code so a
      // test can drive the handshake without scraping textareas — and wiring
      // them as bare handlers passes the CLICK EVENT as that code, which is not
      // null, so the textarea is ignored and code.trim() throws on a MouseEvent.
      // The visible symptom is the opposite of a crash: pasting junk silently
      // does nothing instead of explaining itself.
      on("vs-make-answer", () => makeAnswer());
      on("vs-accept", () => acceptAnswer());
      on("vs-copy-invite", () => copy(($("vs-invite") || {}).value || ""));
      on("vs-copy-answer", () => copy(($("vs-answer") || {}).value || ""));
      on("vs-share-invite", shareInvite);
      on("vs-share-answer", shareAnswer);
      on("vs-scan-invite", () => scan("invite"));
      on("vs-scan-answer", () => scan("answer"));
      on("vs-paste-invite", () => pasteInto("invite"));
      on("vs-paste-answer", () => pasteInto("answer"));
      on("vs-scan-cancel", () => { stopScan(); say(""); });
      on("vs-edit-race", () => { if (role === "host" && G.openRaceSetup) G.openRaceSetup(); });
      on("vs-edit-car", () => { if (G.openGarageFrom) G.openGarageFrom("vsfriend"); });
      on("vs-ready", () => setReady(!selfReady));
      on("vs-invite-more", inviteAnother);
      on("vs-code-host", () => codeHost());   // never the click event as opts
      on("vs-code-join", () => {
        showCodeStep("input", "Enter their code", "Six letters and numbers.");
        const box = $("vs-code-in");
        if (box) { box.value = ""; box.focus(); }
      });
      on("vs-code-go", () => codeJoin());
      on("vs-code-copy", () => copy(($("vs-code-value") || {}).textContent || ""));
      on("vs-code-share", () => {
        const c = ($("vs-code-value") || {}).textContent || "";
        return handOff({ title: "Apex 26", text: "Race me on Apex 26 — room code " + c }, c);
      });
      on("vs-start", startFromRoom);
      on("vs-close", () => {
        const e = els();
        const inRoom = transports.size > 0;
        const onSubStep = !!(e.roomStep && e.roomStep.hidden);
        if (inRoom && onSubStep) {
          invalidateOperations();
          dropPending();      // abandon the half-built invite, keep the room
          stopCodeWait();
          show("room");
          renderRoom();
          say("");
          return;
        }
        cancel();
      });
      // A paste straight into the box runs too, so all four routes in behave
      // the same. Deferred a tick because the value is not in the textarea yet
      // while the paste event is being dispatched.
      const onPaste = (id, kind) => {
        const box = $(id);
        if (box) box.addEventListener("paste", () => setTimeout(() => deliver(kind, box.value), 0));
      };
      onPaste("vs-invite-in", "invite");
      onPaste("vs-answer-in", "answer");
      // A camera must not outlive the tab being backgrounded — on a phone that
      // is someone walking away with the light still on.
      document.addEventListener("visibilitychange", () => { if (document.hidden) stopScan(); });
      if (!NetScan.supported()) {
        for (const id of ["vs-scan-invite", "vs-scan-answer"]) {
          const b = $(id);
          if (b) b.hidden = true;
        }
      }
      const si = $("vs-share-invite");
      if (si && !canShare()) si.textContent = "COPY LINK";
      const sa = $("vs-share-answer");
      if (sa && !canShare()) sa.hidden = true;
      const fromUrl = NetHandshake.inviteFromUrl();
      if (fromUrl) {
        open();
        join();
        const box = $("vs-invite-in");
        if (box) box.value = fromUrl;
      }
      return true;
    }

    return {
      wire, open, close, cancel, abortQuali, host, join, makeAnswer, acceptAnswer,
      shareInvite, shareAnswer, canShare,
      scan, stopScan, pasteInto, deliver,
      codeHost, codeJoin, stopCodeWait,
      watchForOpen: waitForOpen,
      roomChanged, setReady, startFromRoom, renderRoom,
      // Mint a further invite without disturbing the room. Host only, capped.
      inviteAnother,
      peerSeats,
      reportQuali, reportQualiLive,
      roomState: () => ({
        open: !!(els().roomStep && !els().roomStep.hidden),
        role, selfReady, peerReady: peersReady(), peer: firstPeer(),
        peers: [..._peers.values()],
      }),
      localProfile, modsFromProfile, setTransportFactory,
      failureMsg,
      sdp: () => {
        const t = transport || [...transports.values()][0];
        const pc = t && t.pc;
        if (!pc) return null;
        const types = (s) => (String(s || "").match(/^a=candidate:.*$/gmi) || [])
          .map((l) => l.split(" ").slice(4, 8).join(" "));
        const local = pc.localDescription && pc.localDescription.sdp;
        const remote = pc.remoteDescription && pc.remoteDescription.sdp;
        return {
          ice: pc.iceConnectionState, conn: pc.connectionState,
          localTypes: types(local), remoteTypes: types(remote),
          local, remote,
          _pc: pc,
        };
      },
      status: () => ({
        role, statusText,
        // How many are actually IN, not whether a handshake is in flight.
        connected: transports.size > 0,
        guests: transports.size,
        pending: !!transport,
        wire: transport && transport.stats ? transport.stats()
          : ([...transports.values()][0] || {}).stats ? [...transports.values()][0].stats() : null,
      }),
    };
  }

  return { create };
})();
