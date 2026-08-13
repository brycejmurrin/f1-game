/*
 * NetLobby — getting two people into the same race, with no server.
 *
 * This is the piece that makes multiplayer usable by a person rather than by
 * __apex. It owns the #vsfriend screen and drives the whole sequence:
 *
 *   HOST                                  GUEST
 *   createInvite()  ──── code ────────▶   acceptInvite(code)
 *   acceptAnswer(code) ◀─── code ─────    (shows answer)
 *   ...DataChannels open...
 *   send HELLO (profile) ◀──────────▶    send HELLO (profile)
 *   send SETTINGS (track, laps, …) ──▶    applyRaceSettings()
 *   send START (tick)  ──────────────▶    both start together
 *
 * The two code pastes ARE the signalling server. That is the whole reason this
 * design has no backend: WebRTC needs an out-of-band exchange to get started,
 * and two people already have one — chat, SMS, a link. It is clumsier than a
 * room code, and it is free forever with nothing to run or keep up.
 *
 * WHAT THE PROFILE CARRIES, and what it deliberately doesn't. Team, driver,
 * livery and the PARTS SETUP IDS. Ids, never resolved multipliers — since
 * Phase 0 made part upgrades per-car, a peer sending `{cornering: 9}` would
 * simply be faster, so the numbers are always recomputed locally from the ids
 * through the same Parts.getMods() the local car uses. That does not make this
 * cheat-proof (nothing peer-to-peer is), but it means honest clients agree and
 * a tampered one has to work at it.
 *
 * The host owns the race settings for a plain reason: somebody has to, and
 * splitting the choice between two people is a negotiation with no natural
 * winner. The guest's own track/laps/weather selections are simply overridden
 * for the session.
 */
"use strict";

const NetLobby = (function () {
  // 30 s was too tight. A real ICE exchange over mobile data, with a relay
  // candidate in the mix, can legitimately take most of a minute — and this
  // timer starts at the LAST paste, so it is racing a handshake that has
  // already used up its patience elsewhere. A definite `failed` short-circuits
  // it anyway (see waitForOpen), so waiting longer only costs time in the case
  // where there is still hope.
  const CONNECT_TIMEOUT_MS = 60000;

  function create(G) {
    const $ = (id) => document.getElementById(id);
    // CONNECTED transports, one per guest, keyed by the id the host minted for
    // that invite. `transport` below is the one currently being NEGOTIATED —
    // there is at most one at a time, because invites are sequential: you
    // invite, they connect, you invite the next. That is a real simplification
    // and not a limitation of the wire: with several offers outstanding, a
    // pasted answer has to be matched to the offer that produced it, and the
    // one thing a person pasting a code cannot tell you is which invite it
    // answers.
    const transports = new Map();
    let transport = null;                  // the pending one, mid-handshake
    let nextGuestId = 0;
    // The open room-code subscription, if one is running — held so closing the
    // lobby can stop it. A room nobody is watching still holds relay sockets.
    let codeRoom = null;
    // The room code we closed to get out of Trystero's way, and must reopen
    // once our own connection is up. Null when we are not hosting a room.
    let codeReopen = null;
    // A guest has exactly one peer — the host — and calls it PEER_ONE. A host
    // mints an id per guest. Asymmetric on purpose: only the host ever needs to
    // tell several peers apart.
    const mintGuestId = () => "g" + (++nextGuestId);
    let pendingId = null;
    // Four players: a fixed grid, and a phone in landscape. The cap is here
    // rather than in the wire because the wire does not care.
    const MAX_GUESTS = 3;
    let role = null;
    let pollTimer = null;
    let statusText = "";

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
      const e = els().status;
      if (!e) return;
      e.textContent = statusText;
      e.classList.toggle("vs-error", !!isError);
    }

    function show(step) {
      const e = els();
      for (const k of ["pick", "hosting", "joining", "room", "code"]) if (e[k]) e[k].hidden = (k !== step);
    }

    // ---- what we tell the other side about ourselves ----------------------
    function localProfile() {
      const team = Teams.LIST[G.teamIdx] || Teams.LIST[0];
      let setup = null;
      try { setup = G.getTeamParts ? G.getTeamParts(team.id) : null; } catch (e) { setup = null; }
      return {
        team: team.id,
        driver: G.driverIdx || 0,
        // Ids only — see the header. The receiving side recomputes the
        // multipliers itself so a peer cannot simply declare better ones.
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

    // ---- connection -------------------------------------------------------
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
      // Drop only the PENDING attempt, not the connections already made. A
      // previous attempt that timed out leaves a dead RTCPeerConnection behind
      // and reusing it is how the lobby ended up reporting "WebRTC is
      // unavailable" on a device that had just successfully generated an
      // invite — but tearing down everything here would have dropped the
      // guests already in the room the moment the host invited another.
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
        // One guest dropping is not the room ending. Close that peer's session
        // and leave the rest connected; only the LAST connection going away
        // stops the pump, or a 40 Hz timer runs forever holding a peer
        // connection alive. For a guest, losing the host is always the end.
        transports.delete(id);
        const s = sessions.get(id);
        if (s) { try { s.close(); } catch (e) {} }
        sessions.delete(id);
        _peers.delete(id); _ready.delete(id);
        session = [...sessions.values()][0] || null;
        if (!sessions.size) {
          clearInterval(pumpTimer); pumpTimer = null;
          // SAY WHICH loss this was. Everyone connects THROUGH the host — that
          // is what a star is — so the host going away ends the room for
          // everybody, and there is no recovery to offer. A guest leaving is a
          // different event with a different answer, and "Connection closed"
          // for both told a player nothing about which had happened or whether
          // waiting would help.
          say(role === "guest"
            ? "The host left, so the race is over. Everyone connects through them."
            : "Connection closed.", true);
        } else {
          say("A player left. The rest of you are still in.");
        }
        renderRoom();
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

    // No live connection is NOT the same as no WebRTC support, and telling a
    // player the wrong one sends them looking for a browser problem that does
    // not exist.
    function noConnectionMsg() {
      return NetTransport.supported()
        ? "That attempt has ended. Tap HOST A RACE or JOIN A FRIEND to start over."
        : "This browser cannot do WebRTC, so it cannot race a friend.";
    }

    // Everything: every connected guest AND the pending attempt. Leaving the
    // lobby has to close all of them or the peer connections outlive the screen.
    function teardown() {
      clearInterval(pollTimer);
      clearInterval(pumpTimer);
      pumpTimer = null;
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
    //   no srflx candidate  -> STUN never answered. The network is filtering
    //                          it, and a different network genuinely may work.
    //   srflx but no path   -> both sides know both addresses and the packets
    //                          still will not flow: symmetric NAT. Switching
    //                          Wi-Fi will not help; only a relay does, and a
    //                          relay costs someone money to run. Saying "try
    //                          again" here would send them round a loop that
    //                          cannot succeed.
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
      // TWO DIFFERENT PROBLEMS, and they take opposite instructions. With no
      // relay in the config there is nothing to diagnose and the fix is the
      // same network. With one configured, the relay itself is the suspect —
      // and telling that player to change Wi-Fi sends them round a loop that
      // cannot succeed, which is what the old single sentence did.
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

    // Poll for the DataChannels opening. There is no event that means "the
    // whole session is ready" — each channel opens separately — so the
    // transport raises open only once BOTH are up, and this waits for that.
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
          if (!watched) return;                 // still being built; wait
        }
        if (transport !== watched && !transports.has(watchedId)) { clearInterval(pollTimer); return; }
        if (watched.status === "open") {
          clearInterval(pollTimer);
          onConnected(watchedId, watched);
          return;
        }
        // Surface the ICE/connection state while we wait. This is the only
        // window into a handshake that cannot be reproduced in any test here,
        // so when it stalls the player can say WHERE rather than just "it
        // didn't work".
        const st = watched.stats ? watched.stats() : null;
        const secs = Math.round((Date.now() - started) / 1000);
        if (st) say("Connecting… " + secs + "s (" + (st.ice || "?") + "/" + (st.connection || "?") + ")" + relayNote);

        // A definite `failed` is final — ICE has exhausted every pair. Waiting
        // out the rest of the timer after that just makes the player watch a
        // spinner for a verdict already delivered. `disconnected` is NOT final:
        // it can recover on its own, so it keeps waiting.
        const dead = st && (st.ice === "failed" || st.connection === "failed");
        if (dead || Date.now() - started > CONNECT_TIMEOUT_MS) {
          clearInterval(pollTimer);
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

    // The lobby runs BEFORE either side has a track loaded — which is the whole
    // point, since the guest learns which race to load from the host. So the
    // session is opened here and pumped on a short interval of its own; once
    // the race is up, NetPlay adopts the same session and the game loop takes
    // over pumping it at frame rate.
    function onConnected(id, t) {
      id = id != null ? id : PEER_ONE;
      t = t || transport;
      say("Connected.");
      transports.set(id, t);
      if (transport === t) { transport = null; pendingId = null; }
      const made = NetSession.create({ transport: t });
      sessions.set(id, made);
      // This guest is IN, so the offer it used is spent — an SDP offer belongs
      // to one connection. Put a fresh one on the table for whoever is next.
      // Safe here and not earlier: t has moved into `transports` and pendingId
      // is cleared just above, so minting cannot close a live handshake.
      if (codeRoom && codeRoom.rotate) { try { codeRoom.rotate(null); } catch (e) {} }
      // REOPEN the room we closed for this guest's ICE. Closing it is what
      // makes the connection work at all (see onJoiner); reopening is what
      // keeps a room code a way in for three and four players rather than
      // exactly one. Same code, so anybody still reading it off a screen is
      // not stranded, and only while there is space.
      if (codeReopen && transports.size < MAX_GUESTS) {
        const again = codeReopen;
        codeReopen = null;
        setTimeout(() => { codeHost({ code: again, quiet: true }).catch(() => {}); }, 250);
      } else {
        codeReopen = null;
      }
      // The first connection, not the most recent — `session` means "the one
      // most callers mean", and on a guest it is the only one there is.
      session = [...sessions.values()][0];
      clearInterval(pumpTimer);
      // Every session, not "the" session: a host with three guests has three
      // connections and all of them have to be pumped or the quiet ones look
      // like they dropped.
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
        // C is here — and a peer with no slot for C silently drops every packet
        // about it. It also makes their grids disagree, because separateGrid
        // lays out the humans it knows about.
        if (role === "host") {
          const tagged = Object.assign({}, p, { from: id });
          for (const [k, sess] of sessions) {
            if (k === id) continue;                 // not back to the sender
            try { sess.sendEvent(NetPlay.EV.HELLO, tagged); } catch (e) {}
          }
          // ...and the new arrival needs everyone who was already here.
          for (const [k, prof] of _peers) {
            if (k === id || !prof) continue;
            try { made.sendEvent(NetPlay.EV.HELLO, Object.assign({}, prof, { from: k })); } catch (e) {}
          }
        }
        // Learning what they picked is the moment a clash becomes knowable.
        resolveSeatClash();
        renderRoom();
      });
      made.onEvent(NetPlay.EV.SETTINGS, (d) => { if (role === "guest") applySettings(d); });
      made.onEvent(NetPlay.EV.READY, (d) => {
        _ready.set(id, !!(d && d.ready));
        renderRoom();
      });
      // GO is separate from SETTINGS on purpose. Settings now change LIVE while
      // both players sit in the room, so "the host chose a track" and "the host
      // pressed start" have to be different messages — they used to be the same
      // one, which is why arriving settings launched the race immediately.
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
      // Only reaches the game while WE hold the session — once NetPlay owns it,
      // its own handler does this and the lobby is out of the loop.
      made.onEvent(NetPlay.EV.QUALI, (d) => { if (d && d.t > 0 && sendersOwnDriver(d) && G.onPeerQuali) G.onPeerQuali(d); });
      // The lap in progress. Qualifying runs while the LOBBY still holds the
      // connection, so the live clock has to exist on this side too or it only
      // works after the race has already started — which is never.
      made.onEvent(NetPlay.EV.QLIVE, (d) => { if (d && sendersOwnDriver(d) && G.onPeerQualiLive) G.onPeerQualiLive(d); });
      made.sendEvent(NetPlay.EV.HELLO, localProfile());
      if (role === "host") publishSettings();
      openRoom();
    }

    // ---- the waiting room -------------------------------------------------
    // Both players sit here until the host starts. The host owns the race; each
    // player owns their own car. Nothing here reimplements a picker: the
    // buttons open the game's real #select / #race-settings / #carsetup
    // screens, which is how custom teams, liveries and the parts budget come
    // along for free rather than as a second, poorer copy.
    // peerId -> profile, and peerId -> ready. ONE entry today because there is
    // one transport; events do not carry a sender yet, so everything the far
    // side says is filed under PEER_ONE. When Phase C gives each session its own
    // id, only that constant is replaced — every read below is already keyed.
    const PEER_ONE = "peer";
    const _peers = new Map();
    const _ready = new Map();
    // The first (and today only) peer, for the callers and specs that ask about
    // "the other player" in the singular.
    const firstPeer = () => (_peers.size ? [..._peers.values()][0] : null);
    // Everyone we have heard from AT ALL, by either route. Readiness is not
    // conditional on a profile having arrived: READY and HELLO are separate
    // events and either can land first, so keying "who is in the room" off
    // _peers alone left a peer that had said READY but not yet HELLO invisible,
    // and START stayed disabled with both players saying they were done.
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
      // To every guest. The host owns the race, so the settings are one fact
      // that all of them have to receive — a guest that missed it would load a
      // different circuit.
      return broadcast(NetPlay.EV.SETTINGS, {
        track: G.trackIdx,
        laps: G.raceLaps, weather: G.raceWeather, tod: G.raceTimeOfDay,
        quali: !!G.raceQuali,
        difficulty: G.difficulty,
      });
    }

    // Guest: adopt the host's race setup wholesale. Any track/laps/weather the
    // guest had chosen is simply overridden for the session.
    function applySettings(d) {
      if (!d) return;
      if (typeof d.track === "number") G.trackIdx = d.track;
      if (d.laps != null) G.raceLaps = d.laps;
      if (d.quali != null) G.raceQuali = !!d.quali;
      if (d.weather != null) G.raceWeather = d.weather;
      if (d.tod != null) G.raceTimeOfDay = d.tod;
      if (d.difficulty != null) G.difficulty = d.difficulty;
      renderRoom();
    }

    // Called by game.js when a player comes back from the garage or the race
    // settings, so the other side sees the change without anyone pressing
    // anything. A room that only updates on START would let two people spend a
    // minute each choosing a car neither can see.
    function roomChanged(what) {
      if (!session) return false;
      // Resolve BEFORE announcing: a seat can be claimed while you are still in
      // the garage, and what goes on the wire should be the seat you end up in
      // rather than the one you are about to be moved out of. When it fires it
      // sends the hello itself, so this must not send a second.
      if (what === "car") { if (!resolveSeatClash()) broadcast(NetPlay.EV.HELLO, localProfile()); }
      else publishSettings();
      // Changing your mind un-readies you — otherwise READY means "I was happy
      // with something else".
      if (selfReady) setReady(false);
      renderRoom();
      return true;
    }

    function setReady(v) {
      selfReady = !!v;
      if (sessions.size) broadcast(NetPlay.EV.READY, { ready: selfReady });
      renderRoom();
    }

    function peerSeats() {
      const out = [];
      for (const p of _peers.values()) {
        if (p && p.team) out.push({ team: p.team, driver: p.driver || 0 });
      }
      return out;
    }

    // ---- seat exclusivity -------------------------------------------------
    // The garage can only grey out a seat it has ALREADY been told about, so
    // two people picking the same driver in the same instant gets through. The
    // room settles it afterwards, and the rule is a RANK rather than
    // `if (role === "guest")`: you yield to anyone ranked below you. Host is 0
    // and a guest is 1 today; when the room grows past two a guest becomes
    // 1 + join order and host-wins turns into join-order-wins with this line
    // unchanged, which is the whole reason it is written this way.
    function seatRank() { return role === "host" ? 0 : 1; }

    // The same rule applied to SOMEBODY ELSE, so an onlooker can work out which
    // of two players holding one seat is the one about to move. On a guest the
    // host is the only peer and outranks us; on the host every peer is a guest
    // and we outrank all of them. Join order refines this when the room grows,
    // and every screen must reach the same answer — which is why it is derived
    // from the same rank rather than guessed at per screen.
    function peerRank(id) {
      if (role === "guest") return 0;         // our only peer is the host
      return 1 + [...peerIds()].indexOf(id);  // guests, in join order
    }

    // Seats we would have to move OUT of, as opposed to peerSeats(), which is
    // every other player and is what the garage greys out. The two differ on
    // purpose: you may not PICK a seat someone else is in whatever your rank,
    // but you only YIELD one to somebody who outranks you.
    function blockingSeats() {
      return seatRank() === 0 ? [] : peerSeats();
    }

    const heldBy = (list, teamId, seat) =>
      list.some((s) => s.team === teamId && s.driver === seat);

    const seatName = (teamId, seat) => {
      const t = Teams.LIST.find((x) => x.id === teamId);
      const d = t && t.drivers ? t.drivers[seat] : null;
      return { driver: d ? d.name : "that seat", team: t ? t.short : "" };
    };

    // Where a yielding player goes. The team-mate seat first — they chose that
    // team for a reason and exclusivity is per SEAT, so it is nearly always
    // free — then the first free seat anywhere, walking Teams.LIST in order so
    // both screens would reach the same answer. With two players step one
    // always succeeds; step two is what makes three and four work with no
    // second rule.
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
      const blocked = blockingSeats();
      if (!blocked.length) return false;
      const mine = localProfile();
      if (!heldBy(blocked, mine.team, mine.driver)) return false;
      const move = firstFreeSeat(mine.team, blocked);
      // Every seat on the grid spoken for is not reachable with four players
      // and twenty-odd seats, but silently leaving two cars in one is exactly
      // the failure this function exists to end — so leave the clash standing
      // and say so rather than pretending it resolved.
      if (!move) { say("Every seat is taken. Pick another car.", true); return false; }

      const ti = Teams.LIST.findIndex((t) => t.id === move.team);
      if (ti < 0) return false;
      const was = seatName(mine.team, mine.driver);
      const now = seatName(move.team, move.driver);
      G.teamIdx = ti; G.store.set("team", ti);
      G.driverIdx = move.driver; G.store.set("driver", move.driver);

      // Announced, never silent. #vs-status is already role="status"
      // aria-live="polite", so this reaches a screen reader too. A notice, not
      // an error: nothing failed, somebody was simply quicker.
      say(was.driver + " was taken — you're driving " + now.driver
        + (now.team ? " (" + now.team + ")" : "") + ".");
      broadcast(NetPlay.EV.HELLO, localProfile());
      // Your READY was for a car you are no longer in — the same reasoning
      // roomChanged() uses when you change your own mind.
      if (selfReady) setReady(false);
      // The garage REPLACES the room (openSetup hides #vsfriend), so a hello
      // can land while the chips are the screen — repaint them under the
      // player. The say() above is not lost meanwhile: #vs-status keeps its
      // text, so it is there when cs-done brings the room back.
      const garage = $("carsetup");
      if (garage && !garage.hidden && G.buildSetup) G.buildSetup();
      renderRoom();
      return true;
    }

    const TEAM_OF = (p) => (p && p.team && Teams.LIST.find((t) => t.id === p.team)) || null;

    // team.color is an [r,g,b] triple in 0..1 — the renderer's format, not CSS.
    // Handed to a style attribute raw it silently produces nothing.
    function css(rgb) {
      if (!Array.isArray(rgb)) return "#888";
      const b = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))));
      return `rgb(${b[0]},${b[1]},${b[2]})`;
    }

    // A seat two players are BOTH holding, for the moment before it resolves.
    //
    // Clashes are settled after the fact: the lower-ranked player learns what
    // the other picked, moves, and re-announces. That is correct, but it takes
    // a round trip — and for those ~100-200 ms every OTHER screen honestly
    // draws two rows in the same car, which reads as the room glitching rather
    // than as a rule being applied. The mover's own screen never shows it,
    // because it resolves synchronously; only the onlookers see it.
    //
    // So an onlooker does not draw the duplicate at all. The player who will
    // yield — by the same seatRank rule they will use themselves, so every
    // screen picks the same one — is shown as still choosing, which is exactly
    // what they are about to be doing. Nothing is invented: this is the state
    // one round trip early, not a guess about it.
    //
    // How long we will draw a clashing peer as "still choosing" before giving
    // up and showing the clash for real. A yield is one round trip; anything
    // longer means the peer is NOT going to move — an older build with no
    // exclusivity, or one that could find no free seat — and at that point
    // hiding their car stops being early and starts being a lie. Their row
    // would sit blank for ever while they sat in a car we refused to draw.
    const YIELD_GRACE_MS = 2000;
    const clashSince = new Map();          // peer id -> when we first saw it

    function willYield(id) {
      if (outranked(id)) return grace(id);
      clashSince.delete(id);               // no clash, or this peer wins it
      return false;
    }

    // Does somebody of LOWER rank hold this peer's seat? Every other player is
    // checked, ourselves included — when we are host we outrank every guest, so
    // a guest that lands on our car is the one that moves.
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
        clashSince.set(id, now);
        setTimeout(() => { if (clashSince.has(id)) renderRoom(); }, YIELD_GRACE_MS + 50);
      }
      return now - clashSince.get(id) < YIELD_GRACE_MS;
    }

    function driverLine(profile, label, ready) {
      const team = TEAM_OF(profile);
      const seat = profile ? (profile.driver || 0) : 0;
      const d = team && team.drivers ? team.drivers[seat] : null;
      // THREE-LETTER codes for both, the way a timing screen does it. Full
      // names spend the column on "Scuderia Ferrari HP" and then truncate the
      // driver — who is the part that says which of the two cars is theirs.
      // The full text stays as a tooltip rather than being lost.
      const who = team ? `${team.short} · ${d ? (d.code || d.name) : "—"}` : "choosing a car…";
      const full = team ? `${team.name}${d ? " · " + d.name : ""}` : "still choosing";
      const swatch = team ? `<span class="vs-swatch" style="background:${css(team.color)}"></span>` : "";
      return `<span class="vs-who">${label}</span>${swatch}`
        + `<span class="vs-car" title="${full}">${who}</span>`
        + `<span class="vs-ready ${ready ? "on" : ""}">${ready ? "READY" : "choosing"}</span>`;
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
        e.raceSummary.innerHTML =
          `<div><dt>Circuit</dt><dd>${track ? (track.name || track.id) : "—"}</dd></div>`
          + `<div><dt>Laps</dt><dd>${G.raceLaps}</dd></div>`
          + `<div><dt>Qualifying lap</dt><dd>${G.raceQuali ? "On" : "Off"}</dd></div>`
          + `<div><dt>Weather</dt><dd>${wx}</dd></div>`
          + `<div><dt>Time</dt><dd>${tod}</dd></div>`;
      }
      if (e.editRace) e.editRace.hidden = !host;
      if (e.raceNote) {
        // Both facts a guest needs, said before they matter rather than after.
        // Everyone connects through the host, so if the host leaves the room
        // ends — that is inherent to a star and worth stating, not papering
        // over with a generic "connection closed" once it happens.
        e.raceNote.textContent = host ? ""
          : "The host chooses the circuit and conditions — and everyone connects through them, so if they leave, the race ends.";
        e.raceNote.hidden = host;
      }
      if (e.me) e.me.innerHTML = driverLine(localProfile(), "You", selfReady);
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
        const row = (inner) => `<div class="vs-driver">${inner}</div>`;
        // "Them" while there is one other player, because that is what a person
        // says; P2/P3/P4 once there are several, because "them" no longer picks
        // anybody out.
        e.them.innerHTML = ids.length
          ? ids.map((k, i) => row(driverLine(
              // A player who is about to yield this seat is drawn as still
              // choosing rather than as a second copy of somebody else's car.
              // See willYield(): this is the state one round trip early, not a
              // guess, and every screen derives it from the same rank rule.
              willYield(k) ? null : (_peers.get(k) || null),
              ids.length > 1 ? "P" + (i + 2) : "Them", !!_ready.get(k)))).join("")
          : row(driverLine(null, "Them", false));
      }
      if (e.inviteMore) {
        // Only the host invites, and only while there is room. Disabled rather
        // than hidden at the cap so the reason is visible — the same reasoning
        // the garage uses for a taken seat.
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
        // Only the host can start, and only once both have said they are done
        // choosing — a race that begins while someone is still in the garage
        // puts them on the grid in a car they did not pick.
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

    // Start the race, THEN bind the session to it: NetPlay needs a built track
    // to find grid slots for the two drivers.
    // QUALIFYING COMES BEFORE THE HAND-OFF, which is the whole difficulty.
    //
    // beginRace() used to build the race and hand the connection to NetPlay in
    // one breath. A qualifying session happens BEFORE there is a race to hand
    // over, so with GRID: QUALIFYING the lobby keeps the connection through the
    // session — it is what carries the two lap times — and finishStart() runs
    // only when the players leave the sheet for the grid.
    function beginRace() {
      if (G.raceQuali && G.openQualiForNet) {
        say("Qualifying…");
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

    // Our own driven lap, out over the reliable channel. During qualifying the
    // LOBBY still owns the session — NetPlay has not been handed it yet — so
    // this is the route, and game.js asks whichever of the two currently holds
    // the connection.
    function reportQuali(driverId, t) {
      if (!session || !(t > 0)) return false;
      return broadcast(NetPlay.EV.QUALI, { driverId, t: +t.toFixed(3) });
    }

    function reportQualiLive(driverId, t, frac) {
      if (!session || !(t >= 0)) return false;
      return broadcast(NetPlay.EV.QLIVE, { driverId, t: +t.toFixed(2), frac: +(frac || 0).toFixed(3) });
    }

    function finishStart() {
      say("Starting race…");
      // Out of the room: the game screens go back to behaving normally, or the
      // next visit to the garage would try to return to a lobby that has been
      // replaced by a Grand Prix.
      if (G.setNetRoom) G.setNetRoom(false);
      try {
        // A friend race is a one-off Grand Prix, never a championship round
        // or a time trial. flow/session are the authority (js/game.js).
        G.flow = "gp";
        G.session = "race";
        G.startRace();
      } catch (e) {
        say("Could not start the race: " + (e && e.message), true);
        return;
      }
      const started = G.netPlay.start({
        // The whole map, keyed the same way the lobby keyed it, so NetPlay
        // holds one connection per guest exactly as the room did.
        sessions: [...sessions.entries()].map(([id, s]) => ({ id, session: s })),
        session, role,
        peerProfile: firstPeer(),
        peerMods: modsFromProfile(firstPeer()),
        // The list form. NetPlay builds one remote slot per entry, so growing
        // the room is a matter of this array getting longer.
        //
        // WITH THE CONNECTION ID, keyed exactly as `sessions` above. NetPlay
        // files each rival under this id (peerCar) and looks it up on close to
        // decide whether one guest dropped or the room emptied. Sent without
        // one, every joiner collapsed onto the `PEER_ONE` fallback while the
        // sessions stayed keyed "g1"/"g2" — so remoteFor(id) was always null,
        // the close handler fell through to `stop()`, and ONE guest leaving
        // ended the race for everybody still driving. Indistinguishable from
        // correct at two players, which is why it took a third to show up.
        peers: [..._peers.entries()].map(([id, p]) => ({ id, profile: p, mods: modsFromProfile(p) })),
      });
      clearInterval(pumpTimer);          // the game loop pumps it from here on
      pumpTimer = null;
      session = null;                    // owned by NetPlay now
      // ...and so is every entry in the map — FORGET them, not just the
      // singular. The transport.onClose hook armed in newTransport() lives for
      // the whole life of each connection, and it closes whatever
      // `sessions.get(id)` returns. NetSession.close() fires the close
      // handlers with the hardcoded reason "local" — and those handlers are
      // NetPlay's from the moment start() ran (bindSession clearHandlers) —
      // so a mid-race peer drop was reported to NetPlay as a deliberate local
      // stop, which it maps to "say nothing": RIVAL DISCONNECTED only ever
      // appeared when the 6 s heartbeat timeout happened to win the race.
      // With the map empty that hook keeps only its own bookkeeping
      // (transports/_peers/_ready and the status line) and the session's own
      // transport.onClose reaches NetPlay with the truthful "transport".
      // `transports` is deliberately KEPT: the raw connections are still the
      // lobby's to report (status()/sdp()) and to close in teardown().
      sessions.clear();
      if (!started.ok) { say(started.message || "Could not start the session.", true); return; }
      // Host names the instant of lights-out; the guest receives it as an
      // event and both drive their countdown to the same moment. Without this
      // each side counts down on its own clock and the grids are released
      // however far apart the handshake happened to take.
      if (role === "host") G.netPlay.hostStart();
      close();
    }

    // peerId -> NetSession. One entry today, because there is one transport —
    // but the room is a star: when it holds four players the HOST has three
    // sessions and each guest still has one, to the host. Routing every read
    // through the map now means Phase C's transport work adds entries rather
    // than rewriting this file.
    //
    // NetSession itself is untouched and stays one-per-transport: that is the
    // right shape (one clock estimate, one liveness clock, one handler table
    // per connection). There are simply several of them.
    const sessions = new Map();
    // THE session, for the many call sites that mean "the connection we talk
    // over". On a guest that is the only one there will ever be — the host. On
    // the host today it is the single guest.
    let session = null;
    const allSessions = () => [...sessions.values()];
    // Say something to everyone. On a guest that is the host; on the host it is
    // every guest, which is what makes the relay and the lobby events reach a
    // room rather than a pair.
    function broadcast(type, data) {
      let ok = false;
      for (const s of allSessions()) { try { ok = s.sendEvent(type, data) || ok; } catch (e) {} }
      return ok;
    }
    let pumpTimer = null;

    // ---- the four buttons -------------------------------------------------
    // host/join/makeAnswer/acceptAnswer all RETURN their result as well as
    // rendering it. The DOM is the player's view of the handshake, not the
    // only way to reach it — without a return value the sole way to drive this
    // is clicking buttons and scraping textareas, which is exactly the kind of
    // test that fights actionability instead of exercising WebRTC.
    async function host() {
      await readyIce();
      show("hosting");
      if (!newTransport("host")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      say("Preparing invite… (this can take a few seconds)");
      const res = await NetHandshake.createInvite(transport, localProfile());
      if (!res.ok) { say(res.message || "Could not create an invite.", true); return res; }
      const e = els();
      if (e.invite) e.invite.value = res.code;
      const scannable = drawQr(res.code);
      say(scannable
        ? "Send them the link, or have them scan the code."
        : "Send that invite code to your friend.");
      return res;
    }

    // Invite a further player WITHOUT disturbing the ones already here. The
    // room stays up; only the invite step is shown again, and the connections
    // already made keep running because newTransport() no longer tears them
    // down. Sequential by design — see the note on `transports`.
    async function inviteAnother() {
      if (role !== "host") return { ok: false, error: "not_host" };
      if (sessions.size >= MAX_GUESTS) {
        say("That is four players — the grid is full.", true);
        return { ok: false, error: "room_full" };
      }
      // BOTH WAYS IN, for the second guest as much as the first. This used to
      // go straight to host(), which meant a room code could only ever invite
      // ONE player — the rest had to be pasted a link, for no reason other
      // than which button had been wired. So it returns to the choice, with
      // the JOIN options hidden: a host inviting somebody is not also looking
      // for a room to join, and offering it would be a way to destroy the room
      // you already have.
      show("pick");
      if ($("vs-join")) $("vs-join").hidden = true;
      if ($("vs-code-join")) $("vs-code-join").hidden = true;
      say("Invite another player — a link or a room code, whichever suits.");
      return { ok: true, step: "pick" };
    }

    async function join() {
      // Show the step FIRST: if the transport cannot be created, the error has
      // to land somewhere the player can see, and that is this screen.
      show("joining");
      await readyIce();
      if (!newTransport("guest")) return;
      say("Paste the invite code they sent you.");
    }

    async function makeAnswer(codeIn) {
      const e = els();
      const code = codeIn != null ? codeIn : (e.inviteIn ? e.inviteIn.value : "");
      if (codeIn != null && e.inviteIn) e.inviteIn.value = codeIn;
      if (!code.trim()) { say("Paste their invite code first.", true); return { ok: false, error: "empty" }; }
      if (!transport) { say(noConnectionMsg(), true); return { ok: false, error: "no_transport" }; }
      say("Reading invite…");
      const res = await NetHandshake.acceptInvite(transport, code, localProfile());
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
      const e = els();
      const code = codeIn != null ? codeIn : (e.answerIn ? e.answerIn.value : "");
      if (codeIn != null && e.answerIn) e.answerIn.value = codeIn;
      if (!code.trim()) { say("Paste their answer code first.", true); return { ok: false, error: "empty" }; }
      if (!transport) { say(noConnectionMsg(), true); return { ok: false, error: "no_transport" }; }
      say("Reading answer…");
      const res = await NetHandshake.acceptAnswer(transport, code);
      if (!res.ok) { say(res.message || "That answer could not be read.", true); return res; }
      // Under the id of the connection this answer belongs to, NOT a fixed
      // key. As PEER_ONE, accepting a second guest overwrote the first and
      // ALSO left a phantom "peer" entry that no session ever answers for —
      // so peersReady() could never be true and START was unreachable. Found
      // by tools/net/rtc-e2e-3p, which is the only thing that can see it.
      if (res.peer) _peers.set(pendingId || PEER_ONE, res.peer);
      waitForOpen();
      return res;
    }

    // ---- getting a code IN, by any route ----------------------------------
    // Scan, paste button, paste event and invite link all land here, and all
    // four then behave identically: fill the box and RUN. Requiring a separate
    // confirming tap after a scan would be asking the player to agree with what
    // the camera just did.
    //
    // The invite QR carries a full URL, so a scan of it yields a link rather
    // than a code — unwrap it, and accept a bare code just as happily.
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

    function stopScan() {
      if (scanner) { scanner.stop(); scanner = null; }
      const e = els();
      if (e.scan) e.scan.hidden = true;
    }

    // kind: "invite" (guest reading the host's screen) | "answer" (host reading
    // the guest's). Same camera, same decoder, different destination.
    async function scan(kind) {
      const e = els();
      if (!e.scan || !e.scanVideo) return { ok: false, error: "no_ui" };
      if (!NetScan.supported()) {
        say("This browser cannot use the camera — paste the code instead.", true);
        return { ok: false, error: "unsupported" };
      }
      stopScan();
      e.scan.hidden = false;
      say("Point the camera at their code…");
      scanner = NetScan.create();
      const res = await scanner.start(e.scanVideo, (text) => {
        stopScan();
        say("Got it.");
        deliver(kind, text);
      });
      if (!res.ok) { stopScan(); say(res.message || "Could not start the camera.", true); }
      return res;
    }

    // One tap instead of focus-select-paste-submit, which is the whole of the
    // remaining friction when the two players are not in the same room.
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

    // ---- handing the code to a human --------------------------------------
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
          // Closing the share sheet is a decision, not a failure — say nothing
          // and leave the code on screen.
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
    // The answer QR carries the RAW CODE, not a link. There is no "open this to
    // answer" journey — the host scans it from the very page holding their peer
    // connection, and following a URL would throw that connection away.
    function drawAnswerQr(code) {
      const e = els();
      return paintQr(e.answerQrWrap, e.answerQr, code || null);
    }

    function shareInvite() {
      const e = els();
      const code = e.invite ? e.invite.value : "";
      const url = code ? NetHandshake.inviteUrl(code) : null;
      // No location to build a URL from (a file:// page): share the code itself
      // rather than the string "null".
      if (!url) return handOff({ title: "Apex 26", text: code }, code);
      return handOff({ title: "Apex 26", text: "Race me on Apex 26", url }, url);
    }

    function shareAnswer() {
      const code = (els().answer || {}).value || "";
      return handOff({ title: "Apex 26 answer", text: code }, code);
    }

    // ---- room codes (the BACKUP path) -------------------------------------
    // Same handshake, same codes on the wire — a relay carries the two strings
    // instead of a human. It is hidden unless a relay URL is configured, and it
    // never replaces the link/QR flow: everything else in this game is static
    // files that cannot break, and this one depends on a service somebody has
    // to keep alive. When it fails it must fall back, not fail the lobby.
    let codeWait = null;                 // cancel token for the polling loop

    function stopCodeWait() {
      if (codeWait) codeWait.cancelled = true;
      codeWait = null;
      // A subscription keeps the Nostr room — and its relay sockets — open
      // until told otherwise. Cancelling the wait has to close it too, or the
      // lobby leaks a websocket per room the player ever opened.
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
      stopCodeWait();
      await readyIce();
      if (!newTransport("host")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
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

      const invite = await NetHandshake.createInvite(transport, localProfile());
      if (!invite.ok) { say(invite.message || "Could not create an invite.", true); return invite; }

      say("Waiting for them to join…");
      codeWait = { cancelled: false };

      // PUBLIC RELAY: stay in the room and take everyone who arrives, up to the
      // cap. Each joiner gets a connection and an offer of its OWN — one SDP
      // offer belongs to one RTCPeerConnection, so the invite minted above is
      // spent on whoever comes first and the rest are minted on demand.
      if (!NetRendezvous.usingPrivateRelay()) {
        const answersSeen = new Set();
        const sub = await NetRendezvous.hostRoom({
          code, token: codeWait,
          // The offer already prepared above goes out IMMEDIATELY, exactly as
          // the two-party path did. Waiting for a peer-join event before
          // saying anything is what broke this.
          mine: invite.code,
          // The room stays open, so a failure after it opens has nowhere else
          // to go. Without this a host whose relays were all unreachable was
          // told NOTHING and watched a spinner — the console knew, the player
          // did not.
          onFail: (r) => {
            if (!r || r.error === "cancelled" || r.error === "stopped") return;
            // An ADVISORY is a warning about a room that is still running —
            // say it, but do not forget the room, or the next rotate()/stop()
            // has nothing to act on and the code silently stops working.
            if (r.advisory) { say(r.message, true); return; }
            codeRoom = null;
            say(r.message || "The room service went away. Use the invite link or QR instead.", true);
          },
          onTick: () => say(sessions.size
            ? "In the room: " + (sessions.size + 1) + ". Still open (code " + code + ")"
            : "Waiting for them to join… (code " + code + ")"),
          // The first arrival gets the invite already prepared; everyone after
          // gets a fresh transport and a fresh offer.
          // Only called to REPLACE an offer somebody has taken, never per
          // arrival — minting is a whole RTCPeerConnection plus an ICE gather,
          // and doing that on every join is what got us rate-limited.
          mintOffer: async () => {
            if (sessions.size >= MAX_GUESTS) return null;      // room full
            await readyIce();
            if (!newTransport("host")) return null;
            const more = await NetHandshake.createInvite(transport, localProfile());
            return more.ok ? more.code : null;
          },
          onJoiner: async (_who, answer) => {
            // Each answer ONCE, and only while a handshake is waiting for one.
            // A repeat (relay quirk, a guest retrying) or an answer landing
            // after rotation would otherwise be applied to whatever transport
            // is pending NOW — a fresh stable PC, which throws. Seen in a real
            // console as an uncaught InvalidStateError.
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
            const acc = await NetHandshake.acceptAnswer(transport, answer);
            if (!acc.ok) {
              // A rejected answer must not stay blacklisted either: the guest
              // may repost the same string against a transport that is by then
              // ready for it.
              answersSeen.delete(answer);
              if (acc.error !== "already_answered") say(acc.message || "That answer could not be read.", true);
              return;
            }
            if (acc.peer && pendingId) _peers.set(pendingId, acc.peer);
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
            // NOT rotating here. Minting the next offer means newTransport(),
            // which drops the PENDING one — and the pending one is this guest's
            // connection, still gathering ICE. Doing it here killed the
            // handshake a moment after completing it: the answer arrived, was
            // accepted, and then the transport it belonged to was closed.
            // The room rotates once the guest is actually connected, in
            // onConnected() below, by which point this transport has moved into
            // `transports` and pendingId is clear.
          },
        });
        if (!sub.ok) { say(sub.message || "Could not open that room.", true); return sub; }
        codeRoom = sub;
        return { ok: true, code, subscribed: true };
      }

      // PRIVATE RELAY: a mailbox with two slots, so one guest. Unchanged.
      const got = await NetRendezvous.swap({
        code, mine: invite.code, slot: "offer", want: "answer",
        token: codeWait,
        onTick: () => say("Waiting for them to join… (code " + code + ")"),
      });
      if (!got.ok) {
        if (got.error !== "cancelled") say(got.message, true);
        return got;
      }
      const acc = await NetHandshake.acceptAnswer(transport, got.payload);
      if (!acc.ok) { say(acc.message || "That answer could not be read.", true); return acc; }
      if (acc.peer) _peers.set(pendingId || PEER_ONE, acc.peer);
      waitForOpen();
      return { ok: true, code };
    }

    // GUEST: fetch the invite the host published, answer it under the same code.
    async function codeJoin(codeIn) {
      stopCodeWait();
      const e = els();
      const raw = codeIn != null ? codeIn : (e.codeIn ? e.codeIn.value : "");
      const code = NetRendezvous.normalise(raw);
      if (!NetRendezvous.valid(code)) {
        say("That is not a room code — six letters and numbers.", true);
        return { ok: false, error: "bad_code" };
      }
      await readyIce();
      if (!newTransport("guest")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      say("Looking for that room…");
      // The guest cannot answer until it has SEEN the host's invite, so it
      // hands the exchange a reply function instead of a string: whatever the
      // host posted comes in, and the answer this produces goes back out over
      // the same room without it being torn down in between.
      codeWait = { cancelled: false };
      let answered = null;
      const done = await NetRendezvous.swap({
        code, slot: "answer", want: "offer", token: codeWait,
        onTick: () => say("Looking for that room… (code " + code + ")"),
        reply: async (inviteCode) => {
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
          const res = await NetHandshake.acceptInvite(transport, inviteCode, localProfile(),
            { gatherTimeoutMs: 2500 });
          if (!res.ok) { answered = res; return null; }
          if (res.peer) _peers.set(PEER_ONE, res.peer);
          answered = res;
          return res.code;
        },
      });
      if (!done.ok) {
        // A reply that failed has the REAL reason (a stale invite, a build
        // mismatch); the exchange only knows that it did not produce a string.
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

    // ---- open / close -----------------------------------------------------
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
    function holdWake() {
      wakeWanted = true;
      try {
        if (!navigator.wakeLock || wake) return;
        navigator.wakeLock.request("screen").then((l) => {
          wake = l;
          l.addEventListener("release", () => { wake = null; });
        }).catch(() => {});
      } catch (e) {}
    }
    function dropWake() {
      wakeWanted = false;
      try { if (wake) wake.release(); } catch (e) {}
      wake = null;
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && wakeWanted) holdWake();
    });

    function open() {
      holdWake();
      // Start fetching relay credentials NOW if a credentials URL is
      // configured — connecting comes seconds later, and the fetch usually
      // wins that race, so the first connection attempt already carries relay
      // candidates. Fire-and-forget: no relay configured is a normal state.
      try { if (NetTransport.prefetchIce) NetTransport.prefetchIce(); } catch (e) {}
      const e = els();
      if (!e.screen) return false;
      _peers.clear(); _ready.clear();
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
      // Re-fold the raw code: it is the fallback, and an open disclosure from
      // last time makes the sheet open on three lines of base64.
      const raw = document.querySelector("#vs-hosting .vs-raw");
      if (raw) raw.open = false;
      say("");
      e.screen.hidden = false;
      return true;
    }

    function close() {
      clearInterval(pollTimer);
      // Leaving the screen with the camera still running is the failure this
      // module is most careful about — close() is also the SUCCESS path, since
      // the race starts by closing the lobby.
      stopScan();
      // The wake lock is the lobby's, not the game's: in-race the screen is
      // being touched constantly, and holding it past close would silently
      // change every player's battery life for a feature they left.
      dropWake();
      const e = els();
      if (e.screen) e.screen.hidden = true;
    }

    // Abandoning the lobby must tear the half-built connection down, or a
    // stale RTCPeerConnection sits there gathering candidates forever.
    function cancel() {
      stopScan();
      stopCodeWait();
      teardown();
      role = null;
      _peers.clear(); _ready.clear();
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
      // The room opens the game's REAL screens. They return here because
      // openGarage/openRaceSettings already take a return target, and game.js
      // routes it back to this dialog while a session is in the room.
      on("vs-edit-race", () => { if (role === "host" && G.openRaceSetup) G.openRaceSetup(); });
      on("vs-edit-car", () => { if (G.openGarageFrom) G.openGarageFrom("vsfriend"); });
      on("vs-ready", () => setReady(!selfReady));
      on("vs-invite-more", inviteAnother);
      on("vs-code-host", codeHost);
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
      // CLOSE MEANS "BACK", NOT "DESTROY", WHEN THERE IS A ROOM TO GO BACK TO.
      //
      // The invite and code steps are reached FROM the waiting room via INVITE
      // ANOTHER, and closing there used to cancel() — tearing down every
      // connection and dropping the player on the main menu, taking any
      // already-connected guests with them. Losing three players because you
      // changed your mind about inviting a fourth is not a close button, it is
      // a trapdoor.
      on("vs-close", () => {
        const e = els();
        const inRoom = transports.size > 0;
        const onSubStep = !!(e.roomStep && e.roomStep.hidden);
        if (inRoom && onSubStep) {
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
      // No camera, no SCAN button. Unlike the settings grid, this row is built
      // before the screen is ever shown, so nothing reflows under a thumb.
      if (!NetScan.supported()) {
        for (const id of ["vs-scan-invite", "vs-scan-answer"]) {
          const b = $(id);
          if (b) b.hidden = true;
        }
      }
      // Name the button after what it will actually do on THIS device. With no
      // share sheet it copies the link, and a button labelled SHARE that
      // silently copies is a button that has lied. SHARE LINK and COPY CODE
      // stay distinct even then, because they hand over different things.
      const si = $("vs-share-invite");
      if (si && !canShare()) si.textContent = "COPY LINK";
      // The answer is the same string either way, so without a share sheet the
      // two buttons would be one button twice. Decided once here, at boot,
      // before the screen is ever shown — not a reflow under someone's thumb.
      const sa = $("vs-share-answer");
      if (sa && !canShare()) sa.hidden = true;
      // An invite link puts the code in the fragment, so opening one should
      // drop straight into joining rather than making them find the button.
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
      wire, open, close, cancel, host, join, makeAnswer, acceptAnswer,
      shareInvite, shareAnswer, canShare,
      scan, stopScan, pasteInto, deliver,
      codeHost, codeJoin, stopCodeWait,
      // Start watching for the channels to open. Normally called by
      // makeAnswer/acceptAnswer; exported so a test can reach onConnected() —
      // and therefore the waiting room — over a loopback transport, which has
      // no SDP for the handshake to work with but IS open.
      watchForOpen: waitForOpen,
      // The waiting room. roomChanged() is game.js's way back in after a player
      // returns from the garage or the race settings.
      roomChanged, setReady, startFromRoom, renderRoom,
      // Mint a further invite without disturbing the room. Host only, capped.
      inviteAnother,
      // Every seat somebody ELSE is in. Built from the profiles the room
      // already exchanges (EV.HELLO, re-sent on every garage exit), so this
      // adds no wire traffic — it only reads what was always being sent.
      peerSeats,
      // Our own qualifying lap goes out through whichever of the lobby and
      // NetPlay currently holds the connection; during the session that is the
      // lobby, because the hand-off has not happened yet.
      reportQuali, reportQualiLive,
      roomState: () => ({
        open: !!(els().roomStep && !els().roomStep.hidden),
        role, selfReady, peerReady: peersReady(), peer: firstPeer(),
        peers: [..._peers.values()],
      }),
      localProfile, modsFromProfile, setTransportFactory,
      failureMsg,
      // WHAT ACTUALLY CROSSED THE WIRE, which is not the same question as what
      // each side gathered. Both peers can hold four working relay candidates
      // and still fail to pair if the SDP that reached the other end carried
      // none of them — and every counter we have reports the LOCAL gather, so
      // that difference was invisible. The candidate lines are the whole
      // point; the descriptions come back whole so nothing is pre-judged.
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
          // The connection itself, for lobbyPairs()' getStats(). Underscored
          // because it is a live handle and not part of the readable snapshot.
          _pc: pc,
        };
      },
      status: () => ({
        role, statusText,
        // How many are actually IN, not whether a handshake is in flight.
        connected: transports.size > 0,
        guests: transports.size,
        pending: !!transport,
        // The live ICE/connection state and the CANDIDATE TYPES — the only
        // window into a handshake that no in-process test can reproduce, and
        // the difference between "this network blocks STUN" and "these two
        // networks need a relay", which look identical from the outside.
        wire: transport && transport.stats ? transport.stats()
          : ([...transports.values()][0] || {}).stats ? [...transports.values()][0].stats() : null,
      }),
    };
  }

  return { create };
})();
