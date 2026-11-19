"use strict";

const NetLobby = (function () {
  const CONNECT_TIMEOUT_MS = 60000;

  function create(G) {
    Log.info("net", "lobby create");
    const $ = (id) => document.getElementById(id);
    const transports = new Map();
    let transport = null;
    let raceHeld = false, tearingDown = false;
    let nextGuestId = 0;
    let codeRoom = null;
    let codeReopen = null;
    let _answersSeen = null;
    let codeReopenTimer = null;
    let codeRoomCode = null;
    let codeParked = null;
    const mintGuestId = () => "g" + (++nextGuestId);
    let pendingId = null;
    const MAX_GUESTS = 3;
    let role = null;
    let backBtn = null;
    const EVICT_GRACE_MS = 1500;
    const hostEvictingIds = new Set();
    let hostRemovedMe = false;
    let pollTimer = null;
    function stopPoll() { clearInterval(pollTimer); pollTimer = null; }
    let failReason = null, failReasonMsg = null;
    let statusText = "";
    let operationGeneration = 0;
    const beginOperation = () => ++operationGeneration;
    const operationCurrent = (gen) => gen === operationGeneration;
    const cancelledResult = () => ({ ok: false, error: "cancelled" });
    const invalidateOperations = () => { operationGeneration++; };

    const els = () => ({
      screen: $("vsfriend"),
      pick: $("vs-pick"), hosting: $("vs-hosting"), joining: $("vs-joining"),
      room: $("vs-room"), roomStep: $("vs-room"),
      code: $("vs-code"),
      codeHead: $("vs-code-head"), codeHint: $("vs-code-hint"),
      codeShow: $("vs-code-show"), codeValue: $("vs-code-value"),
      codeInputWrap: $("vs-code-input"), codeIn: $("vs-code-in"),
      raceSummary: $("vs-race-summary"), raceNote: $("vs-race-note"),
      editRace: $("vs-edit-race"), editCar: $("vs-edit-car"),
      roster: $("vs-roster"), playerCount: $("vs-player-count"),
      ready: $("vs-ready"), start: $("vs-start"), inviteMore: $("vs-invite-more"),
      invite: $("vs-invite"), inviteIn: $("vs-invite-in"),
      answer: $("vs-answer"), answerIn: $("vs-answer-in"),
      answerHint: $("vs-answer-hint"), answerActions: $("vs-answer-actions"),
      answerWait: $("vs-answer-wait"), answerRaw: $("vs-answer-raw"),
      answerQrWrap: $("vs-answer-qr-wrap"), answerQr: $("vs-answer-qr"),
      scan: $("vs-scan"), scanVideo: $("vs-scan-video"),
      status: $("vs-status"),
    });

    let sayGen = 0;
    function say(msg, isError, busy) {
      sayGen++;
      statusText = msg || "";
      const e = document.getElementById("vs-status");
      if (!e) return;
      if (typeof e.setAttribute === "function") {
        if (busy) e.setAttribute("aria-busy", "true");
        else e.removeAttribute("aria-busy");
      }
      if (e.textContent !== statusText) e.textContent = statusText;
      e.classList.toggle("vs-error", !!isError);
    }

    const has = (box, el) => !!(box && el && typeof box.contains === "function" && box.contains(el));
    const focusInto = (host) => {
      const a = document.activeElement;
      const lobby = document.getElementById("vsfriend");
      if (!host || host.hidden || (a && a !== document.body && lobby && !has(lobby, a))) return;
      if (has(host, a)) return;
      const t = typeof TopModal !== "undefined" && TopModal.landing ? TopModal.landing(host) : null;
      if (t) { try { t.focus({ preventScroll: true }); } catch (_) { t.focus(); } }
    };
    function show(step) {
      const e = els();
      for (const k of ["pick", "hosting", "joining", "room", "code"]) if (e[k]) e[k].hidden = (k !== step);
      if (backBtn) backBtn.hidden = step === "room" || (step === "pick" && !transports.size);
      if (e.screen) e.screen.setAttribute("data-esc-close", backBtn && !backBtn.hidden ? "vs-back" : "vs-close");
      focusInto(e[step]);
    }
    const shownStep = (e) => ["pick", "hosting", "joining", "room", "code"].map((k) => e[k]).find((x) => x && !x.hidden);

    function localProfile() {
      const team = Teams.LIST[G.teamIdx] || Teams.LIST[0];
      let setup = null;
      try { setup = G.getTeamParts ? G.getTeamParts(team.id) : null; } catch (e) { setup = null; }
      return {
        team: team.id,
        driver: G.driverIdx || 0,
        parts: setup,
      };
    }
    const helloProfile = () => LobbyRoster.withLivery(localProfile(), G);

    function modsFromProfile(p) {
      if (!p || !p.team) return null;
      const team = Teams.LIST.find((t) => t.id === p.team);
      if (!team) return null;
      try {
        let parts = p.parts || Parts.getFactorySetup(team);
        if (Parts.getCost(parts, team) > Parts.BUDGET) parts = Parts.getFactorySetup(team);
        return G.modsFor(team, parts);
      } catch (e) { return null; }
    }

    let makeTransport = (o) => NetTransport.rtc(o);
    function setTransportFactory(fn) { makeTransport = fn || ((o) => NetTransport.rtc(o)); }

    const ICE_WAIT_MS = 2500;
    function readyIce() {
      let p = null;
      try { p = NetTransport.prefetchIce && NetTransport.prefetchIce(); } catch (e) { p = null; }
      if (!p || typeof p.then !== "function") return Promise.resolve();
      return Promise.race([
        p.catch((e) => { Log.debug("net", "ICE prefetch rejected, joining without relay:", e && e.message); return null; }),
        new Promise((r) => setTimeout(r, ICE_WAIT_MS)),
      ]);
    }

    function tagFailReason(reason, message) {
      if ((failReason === "expired" || failReason === "no_relay") && reason === "ice") return;
      failReason = reason;
      if (message) failReasonMsg = message;
    }
    function clearFailReason() { failReason = null; failReasonMsg = null; }
    function sayConnectFail(st, secs) {
      if (failReason === "expired" || failReason === "no_relay") {
        say(failReasonMsg || (failReason === "expired"
          ? "The room code has expired — INVITE ANOTHER makes a new one."
          : "Could not reach any room service. Use the invite link or QR instead."), true);
        return;
      }
      tagFailReason("ice");
      say(failureMsg(st, secs), true);
    }

    function newTransport(asRole) {
      dropPending();
      clearFailReason();
      role = asRole;
      if (asRole === "guest") { settingsAccepted = false; settingsNeedsReady = true; selfReady = false; }
      pendingId = asRole === "host" ? mintGuestId() : PEER_ONE;
      transport = makeTransport({ role: asRole, name: asRole });
      if (!transport) {
        say("This browser cannot do WebRTC, so it cannot race a friend.", true);
        return null;
      }
      const id = pendingId;
      transport.onClose((why) => {
        const wasIn = transports.has(id) || sessions.has(id);
        const tGone = transports.get(id);
        const wasHostEvict = !!(tGone && tGone._hostEvict) || hostEvictingIds.has(id);
        const wasHostEvictGuest = hostRemovedMe || !!(tGone && tGone._hostRemovedMe);
        if (tGone && tGone._evictTimer) { clearTimeout(tGone._evictTimer); tGone._evictTimer = null; }
        if (tGone) { try { tGone.close(); } catch (e) {  } }
        transports.delete(id);
        const s = sessions.get(id);
        if (s) { try { s.close(); } catch (e) {  } }
        sessions.delete(id);
        _peers.delete(id); _ready.delete(id); _verify.delete(id); _verified.delete(id);
        clashDrop(id);
        if (!wasIn) { Log.info("net", "pending transport closed " + id); return; }
        if (hostEvictingIds.has(id)) hostEvictingIds.delete(id);
        if (tearingDown) return;
        Log.info("net", "peer leave " + id + (why ? " " + why : ""));
        session = [...sessions.values()][0] || null;
        if (!transports.size) {
          clearInterval(pumpTimer); pumpTimer = null;
          const racing = friendQualifying || (typeof UiLayers !== "undefined" && UiLayers && UiLayers.inRace && UiLayers.inRace());
          _peers.clear(); _ready.clear(); selfReady = false; clashClear();
          if (raceHeld && why === "local") { raceHeld = false; return; }
          raceHeld = false;
          if (racing) {
            say(role === "guest" ? "Host left — rivals are now AI. Keep racing." : "Connection closed.", true);
          } else if (wasHostEvict && role === "host") {
            selfReady = false;
            _verify.delete(id); _verified.delete(id);
            if (G.setNetRoom) G.setNetRoom(true);
            const hadCode = !!(codeRoom || codeReopenTimer);
            stopCodeWait();
            dropPending();
            codeReopen = null;
            clearTimeout(codeReopenTimer); codeReopenTimer = null;
            _answersSeen = null;
            say("Player removed — invite someone new when you are ready.");
            show("room");
            if (hadCode) rotateRoomAfterEvict();
            renderRoom();
            if (G.refreshQualiGate) G.refreshQualiGate();
            return;
          } else {
            myRank = Infinity; restoreOwnRules();
            if (G.setNetRoom) G.setNetRoom(false);
            sealRoom(); stopScan();
            show("pick");
            if ($("vs-join")) $("vs-join").hidden = false;
            if ($("vs-code-join")) $("vs-code-join").hidden = false;
            say(role === "guest"
              ? (wasHostEvictGuest ? "The host removed you from the room." : "The host left the room.")
              : "Your friend left the room.", true);
            hostRemovedMe = false;
            if (tGone) tGone._hostRemovedMe = false;
          }
        } else {
          say(wasHostEvict && role === "host"
            ? "Player removed. The rest of you are still in."
            : "A player left. The rest of you are still in.");
          if (role === "host") {
            for (const sess of sessions.values()) {
              try { sess.sendEvent(NetPlay.EV.LEFT, { from: id }); } catch (e) {  }
            }
          }
          if (wasHostEvict && role === "host" && !friendQualifying && !(typeof UiLayers !== "undefined" && UiLayers && UiLayers.inRace && UiLayers.inRace()) && (codeRoom || codeReopenTimer)) rotateRoomAfterEvict();
        }
        renderRoom(); if (G.refreshQualiGate) G.refreshQualiGate();
      });
      return transport;
    }

    function dropPending() {
      if (transport) stopPoll();
      if (transport && !transports.has(pendingId)) {
        try { transport.close(); } catch (e) {  }
      }
      transport = null;
      pendingId = null;
    }

    function noConnectionMsg() {
      return NetTransport.supported()
        ? "That attempt has ended. Tap HOST A RACE or JOIN A FRIEND to start over."
        : "This browser cannot do WebRTC, so it cannot race a friend.";
    }

    function consumeHandledInvite() {
      const now = NetHandshake.inviteFromUrl();
      if (now && now !== urlInvite) return false;
      return NetHandshake.consumeInviteUrl();
    }

    function teardown() {
      tearingDown = true; raceHeld = false;
      consumeHandledInvite(); stopPoll();
      clearInterval(pumpTimer); pumpTimer = null;
      for (const timer of rosterTimers.values()) clearTimeout(timer);
      rosterTimers.clear();
      settingsAccepted = true; settingsNeedsReady = false; settingsRevision = 0; settingsFingerprint = null;
      clearFailReason();
      codeReopen = null;
      clearTimeout(codeReopenTimer); codeReopenTimer = null;
      for (const s of sessions.values()) { try { s.close(); } catch (e) {  } }
      sessions.clear(); session = null;
      for (const t of transports.values()) { try { t.close(); } catch (e) {  } }
      transports.clear(); _verify.clear(); _verified.clear();
      if (transport) { try { transport.close(); } catch (e) {  } }
      transport = null; pendingId = null; nextGuestId = 0; hostRemovedMe = false; tearingDown = false;
    }

    function failureMsg(st, secs) {
      const c = (st && st.candidates) || {};
      const last = st ? " (" + st.ice + "/" + st.connection + ")" : "";
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
          : " This network cannot connect you directly, and there is no relay"
            + " server to go around it. Put both phones on the same Wi-Fi, or"
            + " switch one to mobile data, then start a new invite.");
    }

    function waitForOpen() {
      stopPoll();
      const started = Date.now();
      let relayNote = "";
      try {
        if (localStorage.getItem("apex26.iceRelayOnly") === "true") {
          relayNote = " [RELAY-ONLY TEST MODE is on — run "
            + "localStorage.removeItem('apex26.iceRelayOnly') and reload unless you are testing TURN]";
        }
      } catch (e) {  }
      say("Connecting…" + relayNote);
      let watched = transport;
      let watchedId = pendingId;
      pollTimer = setInterval(() => {
        if (!watched) {
          watched = transport;
          watchedId = pendingId;
          if (!watched) {
            if (Date.now() - started > CONNECT_TIMEOUT_MS) {
              stopPoll();
              sayConnectFail(null, Math.round((Date.now() - started) / 1000));
            }
            return;
          }
        }
        if (transport !== watched && !transports.has(watchedId)) { stopPoll(); return; }
        if (watched.status === "open") {
          stopPoll();
          onConnected(watchedId, watched);
          return;
        }
        const st = watched.stats ? watched.stats() : null;
        const secs = Math.round((Date.now() - started) / 1000);
        if (st) say("Connecting… " + secs + "s (" + (st.ice || "?") + "/" + (st.connection || "?") + ")" + relayNote, false, true);

        const dead = watched.status === "closed" || (st && (st.ice === "failed" || st.connection === "failed"));
        if (dead || Date.now() - started > CONNECT_TIMEOUT_MS) {
          stopPoll();
          Log.warn("net", "connect fail " + secs + "s");
          sayConnectFail(st, secs);
          clearTimeout(codeReopenTimer); codeReopenTimer = null;
          reopenRoom(sessions.size > 0 && sessions.size < MAX_GUESTS);
          dropPending();
          if (sessions.size) { show("room"); renderRoom(); }
          else { teardown(); stopScan(); show("pick"); }
        }
      }, 250);
    }

    function reopenRoom(ok) {
      const again = codeReopen;
      codeReopen = null;
      if (!again || !ok) return;
      const gen = operationGeneration;
      clearTimeout(codeReopenTimer);
      codeRoomCode = again;
      codeReopenTimer = setTimeout(() => {
        codeReopenTimer = null;
        if (!operationCurrent(gen)) return;
        codeHost({ code: again, quiet: true }).catch((e) => { Log.warn("net", "room reopen for the next guest failed:", e && e.message); });
      }, 250);
    }

    function rotateRoomAfterEvict() {
      if (role !== "host" || typeof NetRendezvous === "undefined") return;
      if (NetRendezvous.usingPrivateRelay && NetRendezvous.usingPrivateRelay()) return;
      stopCodeWait();
      dropPending();
      codeReopen = null;
      clearTimeout(codeReopenTimer); codeReopenTimer = null;
      _answersSeen = null;
      const fresh = NetRendezvous.makeCode && NetRendezvous.makeCode();
      if (!fresh) return;
      const quiet = !!(els().roomStep && !els().roomStep.hidden);
      codeHost({ code: fresh, quiet }).then((res) => {
        if (!res || !res.ok) return;
        if (quiet) {
          paintHostCode(res.code);
          say("New room code — removed players need this one to join.");
        }
      }).catch((e) => { Log.warn("net", "room rotate after remove failed:", e && e.message); });
    }

    function onConnected(id, t) {
      id = id != null ? id : PEER_ONE;
      t = t || transport;
      Log.info("net", "peer join " + id);
      say("Connected.");
      transports.set(id, t);
      if (transport === t) { transport = null; pendingId = null; }
      if (role === "guest" && codeWait) { codeWait.cancelled = true; codeWait = null; }
      const made = NetSession.create({ transport: t });
      sessions.set(id, made);
      if (typeof NetRendezvous !== "undefined" && NetRendezvous.verifyFor) NetRendezvous.verifyFor(t.pc).then((v) => {
        if (!v || transports.get(id) !== t) return;
        _verify.set(id, v); _verified.delete(id);
        say("Connected. Check both screens show code " + v + ", then tap CODES MATCH.");
        if (selfReady) setReady(false); else renderRoom();
      }).catch((e) => { Log.warn("net", "verify code failed:", e && e.message); });
      if (codeRoom && codeRoom.rotate) { try { codeRoom.rotate(null); } catch (e) {  } }
      reopenRoom(transports.size < MAX_GUESTS);
      session = [...sessions.values()][0];
      clearInterval(pumpTimer);
      pumpTimer = setInterval(() => {
        const now = performance.now();
        for (const s of allSessions()) s.pump(now);
      }, 25);

      const helloTimes = [], readyTimes = [], qualiTimes = [], settingsTimes = [], qabortTimes = [];
      const rosterWindows = new Map(), pendingRoster = new Map();
      const underRate = (times, limit = HELLO_RATE) => {
        const now = performance.now();
        while (times.length && now - times[0] > EVENT_WINDOW_MS) times.shift();
        if (times.length >= limit) return false;
        times.push(now);
        return true;
      };
      function rosterEvent(type, data, apply, times) {
        if (type === "hello") {
          const team = TEAM_OF(data), driver = data && data.driver != null ? data.driver : 0;
          if (!team || !Number.isInteger(driver) || driver < 0 || !team.drivers || !team.drivers[driver]) return;
        } else if (!data || typeof data.ready !== "boolean") return;
        const who = data && data.from != null ? data.from : id;
        if (role === "host") { if (underRate(times)) apply(data); return; }
        const key = type + ":" + who;
        if (!rosterWindows.has(key)) {
          if (rosterWindows.size >= 2 * (MAX_GUESTS + 1)) return;
          rosterWindows.set(key, []);
        }
        const window = rosterWindows.get(key);
        if (underRate(window)) { pendingRoster.delete(key); apply(data); return; }
        pendingRoster.set(key, data);
        if (rosterTimers.has(key)) return;
        const timer = setTimeout(() => {
          rosterTimers.delete(key);
          if (sessions.get(id) !== made || !pendingRoster.has(key)) return;
          const latest = pendingRoster.get(key); pendingRoster.delete(key);
          window.length = 0; underRate(window); apply(latest);
        }, Math.max(1, EVENT_WINDOW_MS - (performance.now() - window[0]) + 1));
        rosterTimers.set(key, timer);
      }
      made.onEvent(NetPlay.EV.HELLO, (p) => rosterEvent("hello", p, (p) => {
        p = LobbyRoster.cleanHello(p);
        if (!p) { renderRoom(); return; }
        const who = role === "host" ? id : (p.from || id);
        _peers.set(who, p);
        if (role === "host") {
          const tagged = Object.assign({}, p, { from: id, rank: joinRank(id) });
          for (const [k, sess] of sessions) {
            if (k === id) continue;
            try { sess.sendEvent(NetPlay.EV.HELLO, tagged); } catch (e) {  }
          }
          for (const [k, prof] of _peers) {
            if (k === id || !prof) continue;
            try { made.sendEvent(NetPlay.EV.HELLO, Object.assign({}, prof, { from: k, rank: joinRank(k) })); } catch (e) {  }
          }
          catchUpReady(made, id);
        } else if (p.from == null && p.rank != null) myRank = p.rank;
        resolveSeatClash();
        renderRoom();
      }, helloTimes));
      made.onEvent(NetPlay.EV.SETTINGS, (d) => { if (role === "guest" && underRate(settingsTimes)) applySettings(d); });
      made.onEvent(NetPlay.EV.READY, (d) => rosterEvent("ready", d, (d) => {
        const who = role === "host" ? id : ((d && d.from != null) ? d.from : id);
        if (role === "host" && d && d.ready && d.revision == null && settingsRevision > 0) {
          say("This player needs to update or reload Apex 26 before confirming changed race settings.", true);
        }
        _ready.set(who, !!(d && d.ready) && (d.revision === settingsRevision || (settingsRevision === 0 && d.revision == null)));
        if (role === "host") {
          const tagged = { ready: !!_ready.get(who), from: id, revision: settingsRevision };
          for (const [k, sess] of sessions) {
            if (k === id) continue;
            try { sess.sendEvent(NetPlay.EV.READY, tagged); } catch (e) {  }
          }
        }
        renderRoom();
      }, readyTimes));
      made.onEvent(NetPlay.EV.GO, (d) => {
        if (role !== "guest") return;
        if (!settingsAccepted || settingsNeedsReady || (d && d.revision != null && (d.revision !== settingsRevision || !selfReady))) {
          say("Review the host’s race settings and press READY before starting.", true); return;
        }
        beginRace();
      });
      made.onEvent(QGO, () => {
        if (role !== "guest" || !qualiAborted || !settingsAccepted) return;
        qualiAborted = false;
        close();
        finishStart();
      });
      made.onEvent(NetPlay.EV.LEFT, (d) => {
        if (role !== "guest" || !d) return;
        if (d.evicted) {
          hostRemovedMe = true;
          if (t) {
            t._hostRemovedMe = true;
            try { t.close(); } catch (e) {  }
          }
          return;
        }
        if (d.from == null || d.from === id) return;
        for (const type of ["hello", "ready"]) {
          const key = type + ":" + d.from; clearTimeout(rosterTimers.get(key)); rosterTimers.delete(key);
          pendingRoster.delete(key); rosterWindows.delete(key);
        }
        _peers.delete(d.from); _ready.delete(d.from);
        clashDrop(d.from);
        renderRoom(); if (G.refreshQualiGate) G.refreshQualiGate();
      });
      function sendersOwnDriver(d) {
        const me = Teams.LIST[G.teamIdx] || Teams.LIST[0];
        if (me && d.driverId === me.id + ":" + (G.driverIdx || 0)) return false;
        if (!underRate(qualiTimes, role === "host" ? QUALI_RATE : NetPlay.QUALI_GUEST_RATE)) return false;
        if (role !== "host") return [..._peers.values()].some((p) => p && typeof p.team === "string" && d.driverId === p.team + ":" + (p.driver || 0));
        const seat = heldSeat(id);
        return !!(seat && d.driverId != null && d.driverId === seat);
      }
      NetPlay.bindQuali(made, sendersOwnDriver, G, (type, lap) => {
        if (role !== "host") return;
        for (const [other, sess] of sessions) {
          if (other !== id) try { sess.sendEvent(type, lap); } catch (e) {  }
        }
      });
      made.onEvent(QABORT, () => {
        if (role !== "host" || !friendQualifying) return;
        if (!underRate(qabortTimes, QABORT_RATE)) return;
        const seat = heldSeat(id);
        if (!seat) return;
        const q = { driverId: seat, t: Infinity, noTime: true };
        if (G.onPeerQuali) G.onPeerQuali(q);
        for (const [other, sess] of sessions) {
          if (other !== id) try { sess.sendEvent(NetPlay.EV.QUALI, { driverId: q.driverId, t: null, noTime: true }); } catch (e) {  }
        }
        say("A player left qualifying — their time is set to none.");
      });
      made.sendEvent(NetPlay.EV.HELLO, Object.assign(helloProfile(), role === "host" ? { rank: joinRank(id) } : null));
      if (role === "host") {
        publishSettings();
        catchUpReady(made, id);
      }
      openRoom();
    }

    const PEER_ONE = "peer";
    const HELLO_RATE = 5, EVENT_WINDOW_MS = NetPlay.EVENT_WINDOW_MS;
    const QUALI_RATE = NetPlay.QUALI_RATE;
    const QABORT = "qabort";
    const QABORT_RATE = 2;
    const QGO = "qgo";
    let qualiAborted = false;
    const _peers = new Map();
    const _ready = new Map();
    const _verify = new Map();
    const _verified = new Set();
    const unverified = () => [..._verify.keys()].filter((id) => !_verified.has(id));
    const confirmCode = (id) => _verify.has(id) && (_verified.add(id), renderRoom(), true);
    const firstPeer = () => (_peers.size ? [..._peers.values()][0] : null);
    const peerIds = () => new Set([..._peers.keys(), ..._ready.keys()]);
    const peersReady = () => {
      const ids = [...peerIds()];
      return ids.length > 0 && ids.every((k) => _ready.get(k));
    };
    function catchUpReady(sess, exceptId) {
      if (!sess || !sess.sendEvent) return;
      try {
        if (selfReady) sess.sendEvent(NetPlay.EV.READY, { ready: true, revision: settingsRevision });
      } catch (e) {  }
      for (const [k, ready] of _ready) {
        if (!ready || k === exceptId) continue;
        try { sess.sendEvent(NetPlay.EV.READY, { ready: true, from: k, revision: settingsRevision }); } catch (e) {  }
      }
    }
    let selfReady = false;
    let settingsRevision = 0, settingsFingerprint = null, settingsAccepted = true, settingsNeedsReady = false;
    const rosterTimers = new Map();

    function openRoom() {
      if (sessions.size <= 1) { selfReady = false; _ready.clear(); }
      Log.info("net", "lobby room");
      show("room");
      if (G.setNetRoom) G.setNetRoom(true);
      renderRoom();
      say(role === "host"
        ? "Pick the race, then start when you are both ready."
        : "The host is picking the race. Choose your car.");
    }

    const { GRID_LABEL, RULES, own, normaliseSettings, circuitPayload, installCircuit } = LobbySettings;
    const customPicked = () => LobbySettings.customPicked(G);

    function publishSettings() {
      if (!sessions.size || role !== "host") return false;
      let circuit = null;
      if (customPicked()) {
        const def = Tracks.LIST[G.trackIdx];
        const design = (typeof CustomTracks !== "undefined" && CustomTracks.get && def)
          ? CustomTracks.get(def.id) : null;
        circuit = circuitPayload(design);
        if (!circuit) {
          say("This custom circuit cannot be shared online — pick another or a built-in circuit.", true);
          return false;
        }
      }
      const snapshot = {
        track: circuit ? -1 : G.trackIdx,
        circuit,
        laps: G.raceLaps, weather: G.raceWeather, tod: G.raceTimeOfDay,
        quali: !!G.raceQuali, grid: G.raceGrid,
        difficulty: G.difficulty,
        tyres: G.raceTyreWear, reliab: G.raceReliability,
        dirtyAir: G.raceDirtyAir, aiPace: G.aiPace,
        seed: G.seed, round: G.raceRound,
        changeable: !!G.raceChangeable, wxArc: G.raceChangeable ? G.wxArcPlan : null,
      };
      const fingerprint = JSON.stringify(snapshot);
      if (settingsFingerprint !== null && fingerprint !== settingsFingerprint) {
        settingsRevision++; _ready.clear(); if (selfReady) setReady(false);
      }
      settingsFingerprint = fingerprint;
      return broadcast(NetPlay.EV.SETTINGS, Object.assign(snapshot, { revision: settingsRevision }));
    }

    function roomOnly(key, apply) {
      const st = G.store;
      const before = st && st.get ? st.get(key, undefined) : undefined;
      apply();
      if (!st) return;
      if (before === undefined) { if (st.rawDel) st.rawDel(key); }
      else if (st.set) st.set(key, before);
    }

    let ownRules = null;
    function restoreOwnRules() {
      const snap = ownRules;
      if (!snap || (G.netPlay && G.netPlay.active && G.netPlay.active())) return false;
      ownRules = null;
      for (const [, prop, key] of RULES) {
        if (!own(snap, prop) || snap[prop] === undefined) continue;
        if (key) roomOnly(key, () => { G[prop] = snap[prop]; }); else G[prop] = snap[prop];
      }
      G.wxArcPlan = null;
      return true;
    }

    function applySettings(d) {
      const next = normaliseSettings(d);
      if (!next) {
        settingsAccepted = false; settingsNeedsReady = true; if (selfReady) setReady(false);
        say("The host sent invalid race settings. Your current setup was kept.", true);
        return false;
      }
      const required = own(next, "circuit")
        ? ["circuit", "laps", "weather", "tod", "quali", "difficulty"]
        : ["track", "laps", "weather", "tod", "quali", "difficulty"];
      if (!settingsAccepted && !required.every((key) => own(next, key))) { say("Waiting for the host’s complete race settings before READY.", true); return false; }
      if (d.revision != null && (!Number.isSafeInteger(d.revision) || d.revision < 0)) { settingsAccepted = false; settingsNeedsReady = true; if (selfReady) setReady(false); return false; }
      const revision = d.revision == null ? 0 : d.revision;
      const fingerprint = JSON.stringify(next);
      if (settingsAccepted && settingsFingerprint !== null && fingerprint === settingsFingerprint && revision === settingsRevision) return true;
      if (settingsFingerprint === null || fingerprint !== settingsFingerprint || revision !== settingsRevision) {
        settingsNeedsReady = true; _ready.clear(); if (selfReady) setReady(false);
      }
      settingsRevision = revision; settingsFingerprint = fingerprint; settingsAccepted = true;
      if (!ownRules) { ownRules = {}; for (const [, prop] of RULES) ownRules[prop] = G[prop]; }
      if (own(next, "circuit")) {
        const idx = installCircuit(next.circuit);
        if (idx < 0) {
          settingsAccepted = false; settingsNeedsReady = true; if (selfReady) setReady(false);
          say("The host’s custom circuit could not be built. Your current setup was kept.", true);
          return false;
        }
        G.trackIdx = idx;
      } else if (own(next, "track")) {
        G.trackIdx = next.track;
      }
      if (own(next, "laps")) G.raceLaps = next.laps;
      if (own(next, "quali")) G.raceQuali = next.quali;
      if (own(next, "grid")) G.raceGrid = next.grid;
      if (own(next, "changeable")) G.raceChangeable = next.changeable;
      if (own(next, "wxArc")) G.wxArcPlan = next.wxArc;
      if (own(next, "weather")) G.raceWeather = next.weather;
      if (own(next, "tod")) G.raceTimeOfDay = next.tod;
      if (own(next, "difficulty")) G.difficulty = next.difficulty;
      if (own(next, "tyres")) roomOnly("tyreWear", () => { G.raceTyreWear = next.tyres; });
      if (own(next, "reliab")) roomOnly("reliability", () => { G.raceReliability = next.reliab; });
      if (own(next, "dirtyAir")) roomOnly("dirtyAir", () => { G.raceDirtyAir = next.dirtyAir; });
      if (own(next, "aiPace")) roomOnly("aiPace", () => { G.aiPace = next.aiPace; });
      if (own(next, "seed")) G.seed = next.seed;
      if (own(next, "round")) G.raceRound = next.round;
      renderRoom();
      return true;
    }

    function roomChanged(what) {
      if (!session) return false;
      if (what === "car") { if (!resolveSeatClash()) broadcast(NetPlay.EV.HELLO, helloProfile()); }
      else publishSettings();
      if (selfReady) setReady(false);
      renderRoom();
      return true;
    }

    function setReady(v) {
      selfReady = !!v;
      if (role === "guest" && !settingsAccepted) {
        selfReady = false; if (v) say("Waiting for the host’s complete race settings before READY.", true);
      }
      const unticked = selfReady && unverified()[0];
      if (unticked) { selfReady = false; say("Check that both screens show code " + _verify.get(unticked) + ", then tap CODES MATCH before READY.", true); }
      if (selfReady) settingsNeedsReady = false;
      if (sessions.size) broadcast(NetPlay.EV.READY, { ready: selfReady, revision: settingsRevision });
      renderRoom();
    }

    function peerSeats(keep) {
      const out = [];
      if (!sessions.size) return out;
      for (const [k, p] of _peers) {
        if (p && p.team && (!keep || keep(k))) out.push({ team: p.team, driver: p.driver || 0 });
      }
      return out;
    }

    let myRank = Infinity;
    const joinRank = (id) => Number(String(id).slice(1)) || 0;
    function seatRank() { return role === "host" ? 0 : myRank; }

    function peerRank(id) {
      if (role === "host") return joinRank(id);
      const p = _peers.get(id);
      return p && p.from != null ? (p.rank || 0) : 0;
    }

    function heldSeat(id) {
      const me = Teams.LIST[G.teamIdx] || Teams.LIST[0];
      return LobbyRoster.heldSeat(_peers, id, me ? me.id + ":" + (G.driverIdx || 0) : null, joinRank);
    }

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
        if (!Teams.isReal(t) || !t.drivers) continue;
        for (let i = 0; i < t.drivers.length; i++) {
          if (!heldBy(blocked, t.id, i)) return { team: t.id, driver: i };
        }
      }
      return null;
    }

    function resolveSeatClash() {
      if (!session) return false;
      const mine = localProfile();
      const mineTeam = Teams.LIST.find((t) => t.id === mine.team);
      const onCustom = !!mineTeam && !Teams.isReal(mineTeam);
      const blocked = onCustom ? peerSeats() : blockingSeats();
      if (!blocked.length && !onCustom) return false;
      if (!onCustom && !heldBy(blocked, mine.team, mine.driver)) return false;
      const move = firstFreeSeat(onCustom ? null : mine.team, blocked);
      if (!move) { say("Every seat is taken. Pick another car.", true); return false; }

      const ti = Teams.LIST.findIndex((t) => t.id === move.team);
      if (ti < 0) return false;
      const was = seatName(mine.team, mine.driver);
      const now = seatName(move.team, move.driver);
      G.teamIdx = ti;
      G.driverIdx = move.driver;

      const seatTxt = now.driver + (now.team ? " (" + now.team + ")" : "");
      say(onCustom ? (mineTeam.legends ? "LEGENDS" : "MY TEAM") + " cars only exist on your own screen — you're driving " + seatTxt + " for this race."
                   : was.driver + " was taken — you're driving " + seatTxt + ".");
      broadcast(NetPlay.EV.HELLO, helloProfile());
      if (selfReady) setReady(false);
      const garage = $("carsetup");
      if (garage && !garage.hidden && G.buildSetup) G.buildSetup();
      renderRoom();
      return true;
    }

    const { TEAM_OF, css, span, replace, summaryRow, rosterDriverName, rosterTeamShort } = LobbyRoster;
    const rosterSeatRow = (profile, ready, peerId) => LobbyRoster.rosterSeatRow(profile, ready, peerId,
      (li, id) => hostRemoveRow(verifyRow(li, id), id));

    const YIELD_GRACE_MS = 2000;
    const clashSince = new Map();
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
      clashDrop(id);
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

    function grace(id) {
      const now = performance.now();
      if (!clashSince.has(id)) {
        const timer = setTimeout(() => {
          const rec = clashSince.get(id);
          if (rec) { rec.timer = null; renderRoom(); }
        }, YIELD_GRACE_MS + 50);
        clashSince.set(id, { at: now, timer });
      }
      return now - clashSince.get(id).at < YIELD_GRACE_MS;
    }

    const ROOM_SEATS = MAX_GUESTS + 1;

    function renderRoom() {
      const e = els();
      if (!e.roomStep || e.roomStep.hidden) return;
      const host = role === "host";
      const track = (Tracks.LIST && Tracks.LIST[G.trackIdx]) || null;
      const WX_LABEL = { dry: "Dry", wet: "Wet", rain: "Rain", overcast: "Overcast", fog: "Fog", storm: "Storm" };
      const arc = G.raceChangeable && G.wxArcPlan;
      const wx = (WX_LABEL[G.raceWeather] || "Mixed") + (arc && WX_LABEL[arc.to] ? " → " + WX_LABEL[arc.to] : "");
      const tod = G.raceTimeOfDay && G.raceTimeOfDay !== "default"
        ? G.raceTimeOfDay.charAt(0).toUpperCase() + G.raceTimeOfDay.slice(1) : "Default";
      if (e.raceSummary) {
        const frag = document.createDocumentFragment();
        frag.appendChild(summaryRow("Circuit", track ? (track.name || track.id) : "—"));
        frag.appendChild(summaryRow("Laps", G.raceLaps));
        frag.appendChild(summaryRow("Qualifying lap", G.raceQuali ? "On" : "Off"));
        frag.appendChild(summaryRow("Grid", GRID_LABEL[G.raceGrid] || (G.raceQuali ? "Qualifying lap" : "Pace order")));
        frag.appendChild(summaryRow("Weather", wx));
        frag.appendChild(summaryRow("Time", tod));
        replace(e.raceSummary, frag);
      }
      if (e.editRace) e.editRace.hidden = !host;
      if (e.raceNote) {
        e.raceNote.textContent = host ? ""
          : "The host chooses the circuit and conditions. If they leave, their rivals continue as AI.";
        e.raceNote.hidden = host;
      }
      const ids = [...peerIds()];
      const seated = 1 + ids.length;
      if (e.playerCount) e.playerCount.textContent = seated + "/" + ROOM_SEATS;
      if (e.roster) {
        const rows = document.createDocumentFragment();
        rows.appendChild(rosterSeatRow(localProfile(), selfReady, null));
        ids.forEach((k) => rows.appendChild(rosterSeatRow(
          willYield(k) ? null : (_peers.get(k) || null),
          !!_ready.get(k),
          k)));
        replace(e.roster, rows);
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
        e.start.title = "";
      }
    }

    function hostRemoveRow(el, id) {
      if (role !== "host") return el;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "vs-roster-remove";
      b.dataset.rosterRemove = id;
      b.textContent = "Remove";
      const v = _verify.get(id);
      b.setAttribute("aria-label", v
        ? "Remove this player — do it if their screen does not show " + v
        : "Remove this player from the room");
      if (hostEvictingIds.has(id)) b.disabled = true;
      b.addEventListener("click", () => removeGuest(id));
      el.appendChild(b);
      return el;
    }

    function verifyRow(el, id) {
      const v = _verify.get(id);
      if (!v) return el;
      const ok = _verified.has(id), tag = span("", ok ? v + " ✓" : v);
      tag.dataset.verify = v;
      tag.title = "Verification code: it must match the code on their screen";
      el.appendChild(tag);
      if (!ok) el.appendChild(LobbyRoster.verifyButton(id, v, confirmCode));
      return el;
    }
    function removeGuest(id) {
      const t = role === "host" ? transports.get(id) : null;
      if (!t) return false;
      hostEvictingIds.add(id);
      t._hostEvict = true;
      const sess = sessions.get(id);
      if (sess) {
        try { sess.sendEvent(NetPlay.EV.LEFT, { evicted: true }); } catch (e) {  }
      }
      Log.info("net", "host removed " + id);
      if (!sess) { try { t.close(); } catch (e) {  } return true; }
      if (t._evictTimer) return true;
      t._evictTimer = setTimeout(() => {
        t._evictTimer = null;
        try { t.close(); } catch (e) {  }
      }, EVICT_GRACE_MS);
      renderRoom();
      return true;
    }

    function startFromRoom() {
      if (role !== "host" || !session) return false;
      if (!(selfReady && peersReady())) { say("Everyone needs to be ready.", true); return false; }
      if (!publishSettings()) { renderRoom(); return false; }
      if (!(selfReady && peersReady())) { renderRoom(); say("Everyone needs to review the updated race settings.", true); return false; }
      broadcast(NetPlay.EV.GO, { revision: settingsRevision });
      beginRace();
      return true;
    }

    function sealRoom() {
      codeReopen = null; codeParked = null;
      clearTimeout(codeReopenTimer); codeReopenTimer = null;
      stopCodeWait();
      dropPending();
    }

    let friendQualifying = false;
    function beginRace() {
      G.seed = G.seed;
      qualiAborted = false;
      if (G.raceQuali && G.openQualiForNet) {
        friendQualifying = true;
        say("Qualifying…");
        let opened;
        sealRoom();
        if (G.setNetRoom) G.setNetRoom(false);
        try {
          G.flow = "gp";
          opened = G.openQualiForNet(finishStart);
        } catch (e) {
          friendQualifying = false;
          say("Could not start qualifying: " + (e && e.message), true);
          return;
        }
        close();
        Promise.resolve(opened).then(() => {
          const sheet = $("quali");
          if (friendQualifying && sheet && sheet.hidden) cancel();
        }, () => {});
        return;
      }
      finishStart();
    }

    const { reportQuali, reportQualiLive } = NetPlay.qualiReporters(
      (type, data) => broadcast(type, data), () => !!session);

    async function finishStart() {
      if (!session) {
        const wasGuest = role === "guest";
        cancel(); if (G.quitToMenu) G.quitToMenu();
        if (G.announce) G.announce(wasGuest ? "THE HOST LEFT — BACK TO MENU" : "EVERYONE LEFT — BACK TO MENU", 4, "info");
        return;
      }
      const gen = beginOperation(), startingSessions = new Set(sessions.values());
      const current = () => operationCurrent(gen) && (!session || startingSessions.has(session));
      say("Starting race…");
      sealRoom();
      if (G.setNetRoom) G.setNetRoom(false);
      try {
        G.flow = "gp";
        G.session = "race";
        G.duel = false;
        const outcome = await G.startRace();
        if (!current()) return;
        if (outcome === false || (outcome && outcome.kind === "canceled")) { cancel(); return; }
        if (!sessions.size) { friendQualifying = false; clearInterval(pumpTimer); pumpTimer = null; close(); return; }
        if (role === "host") broadcast(QGO, null);
      } catch (e) {
        if (!current()) return;
        say("Could not start the race: " + (e && e.message), true);
        friendQualifying = false;
        const screen = els().screen;
        if (screen && screen.hidden) {
          cancel(); if (G.quitToMenu) G.quitToMenu();
          if (G.announce) G.announce("COULD NOT START THE RACE — BACK TO MENU", 4, "info");
        }
        return;
      }
      const started = G.netPlay.start({
        sessions: [...sessions.entries()].map(([id, s]) => ({ id, session: s })),
        session, role,
        peerProfile: firstPeer(),
        peerMods: modsFromProfile(firstPeer()),
        peers: [..._peers.entries()].map(([id, p]) => ({ id, profile: p, mods: modsFromProfile(p) })),
        onStop: restoreOwnRules,
      });
      friendQualifying = false;
      clearInterval(pumpTimer);
      pumpTimer = null;
      session = null;
      sessions.clear();
      if (!started.ok) {
        raceHeld = false; say(started.message || "Could not start the session.", true);
        cancel();
        if (G.quitToMenu) G.quitToMenu();
        return;
      }
      raceHeld = true; if (role === "host") G.netPlay.hostStart();
      close();
    }

    const sessions = new Map();
    let session = null;
    const allSessions = () => [...sessions.values()];
    function broadcast(type, data) {
      let ok = false;
      for (const s of allSessions()) { try { ok = s.sendEvent(type, data) || ok; } catch (e) {  } }
      return ok;
    }
    let pumpTimer = null;

    async function host() {
      const gen = beginOperation();
      resetSteps();
      show("hosting");
      stopCodeWait(); codeReopen = null;
      clearTimeout(codeReopenTimer); codeReopenTimer = null;
      await readyIce();
      if (!operationCurrent(gen)) return cancelledResult();
      if (!newTransport("host")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      const pending = transport;
      say("Preparing invite… (this can take a few seconds)");
      let res;
      try { res = await NetHandshake.createInvite(pending, localProfile()); }
      catch (err) { res = { ok: false, error: "invite_failed", message: "Could not create an invite (" + ((err && err.message) || err) + "). Tap HOST A RACE to try again." }; }
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
      const live = (codeRoom || codeReopenTimer) ? codeRoomCode : null;
      invalidateOperations();
      stopCodeWait(); dropPending();
      clearTimeout(codeReopenTimer); codeReopenTimer = null;
      if (live) codeParked = live;
      resetSteps();
      show("pick");
      if ($("vs-join")) $("vs-join").hidden = true;
      if ($("vs-code-join")) $("vs-code-join").hidden = true;
      say("Invite another player — a link or a room code, whichever suits.");
      return { ok: true, step: "pick" };
    }

    let joinP = null;
    async function join() {
      const gen = beginOperation();
      resetSteps();
      show("joining");
      const said = sayGen;
      const p = (async () => {
        await readyIce();
        if (!operationCurrent(gen)) return cancelledResult();
        if (!newTransport("guest")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
        if (sayGen === said) say("Paste the invite code they sent you.");
        return { ok: true };
      })();
      joinP = p;
      try { return await p; } finally { if (joinP === p) joinP = null; }
    }

    let answering = null;
    function inviteError(message, result) {
      say(message, true);
      const body = $("vs-body");
      if (body) body.scrollTop = body.scrollHeight;
      return result;
    }
    async function makeAnswer(codeIn) {
      const e = els();
      const readingGen = operationGeneration;
      const resolved = resolveCode(codeIn != null ? codeIn : (e.inviteIn ? e.inviteIn.value : ""));
      const code = typeof resolved === "string" ? resolved : await resolved;
      if (!operationCurrent(readingGen)) return cancelledResult();
      if (e.inviteIn) e.inviteIn.value = code;
      if (!code.trim()) return inviteError("Paste their invite code first.", { ok: false, error: "empty" });
      const peek = NetHandshake.peekCode ? NetHandshake.peekCode(code) : { ok: true };
      if (!peek.ok) return inviteError(peek.message, { ok: false, error: peek.error, message: peek.message });
      if (!transport && joinP) {
        const joiningGen = operationGeneration;
        say("Preparing your answer…", false, true);
        await joinP;
        if (!operationCurrent(joiningGen)) return cancelledResult();
      }
      if (!transport) { say(noConnectionMsg(), true); return { ok: false, error: "no_transport" }; }
      const pending = transport;
      const pc = pending.pc;
      if (answering === pending || (pc && (pc.signalingState !== "stable" || pc.remoteDescription))) {
        say("That invite was already answered — send them the answer code below.", true);
        return { ok: false, error: "already_answered" };
      }
      const gen = beginOperation();
      answering = pending;
      say("Reading invite…");
      let res;
      try {
        res = await NetHandshake.acceptInvite(pending, code, localProfile());
      } catch (err) {
        res = { ok: false, error: "answer_failed",
          message: "Could not build an answer (" + ((err && err.message) || err) + "). Tap JOIN A FRIEND and try again." };
      } finally {
        if (answering === pending) answering = null;
      }
      if (!operationCurrent(gen) || transport !== pending) return cancelledResult();
      if (!res.ok) { say(res.message || "That invite could not be read.", true); return res; }
      NetHandshake.consumeInviteUrl(); if (res.peer) _peers.set(PEER_ONE, LobbyRoster.cleanCodeProfile(res.peer));
      if (e.answer) e.answer.value = res.code;
      if (e.answerHint) e.answerHint.hidden = false;
      if (e.answerActions) e.answerActions.hidden = false;
      if (e.answerRaw) e.answerRaw.hidden = false;
      if (e.answerWait) e.answerWait.hidden = true;
      drawAnswerQr(res.code);
      waitForOpen();
      say("Send that answer code back, then wait for the race to start.");
      return res;
    }

    let taking = null;
    async function acceptAnswer(codeIn) {
      if (taking && taking === transport) { say("That answer is already being read.", true); return { ok: false, error: "already_accepting" }; }
      const e = els();
      const readingGen = operationGeneration;
      const resolved = resolveCode(codeIn != null ? codeIn : (e.answerIn ? e.answerIn.value : ""));
      const code = typeof resolved === "string" ? resolved : await resolved;
      if (!operationCurrent(readingGen)) return cancelledResult();
      if (e.answerIn) e.answerIn.value = code;
      if (!code.trim()) { say("Paste their answer code first.", true); return { ok: false, error: "empty" }; }
      const peek = NetHandshake.peekCode ? NetHandshake.peekCode(code) : { ok: true };
      if (!peek.ok) { say(peek.message, true); return { ok: false, error: peek.error, message: peek.message }; }
      if (!transport) { say(noConnectionMsg(), true); return { ok: false, error: "no_transport" }; }
      const pending = transport;
      const id = pendingId;
      const gen = beginOperation();
      say("Reading answer…");
      taking = pending;
      let res;
      try { res = await NetHandshake.acceptAnswer(pending, code); } finally { if (taking === pending) taking = null; }
      if (!operationCurrent(gen) || transport !== pending || pendingId !== id) return cancelledResult();
      if (!res.ok) { say(res.message || "That answer could not be read.", true); return res; }
      if (res.peer) _peers.set(id || PEER_ONE, LobbyRoster.cleanCodeProfile(res.peer));
      waitForOpen();
      return res;
    }

    const {
      resolveCode, deliver, scan, stopScan, pasteInto, copy, handOff,
      drawQr, drawAnswerQr, shareInvite, shareAnswer, canShare, resetSteps,
    } = LobbyCodes.create({
      els, $, say, makeAnswer, acceptAnswer, cancelledResult,
      getOperation: () => operationGeneration,
      has, focusInto, shownStep,
    });

    let codeWait = null;

    function stopCodeWait() {
      if (codeWait) codeWait.cancelled = true;
      codeWait = null;
      if (codeRoom && codeRoom.stop) { try { codeRoom.stop(); } catch (e) {  } }
      codeRoom = null;
    }

    function showCodeStep(mode, headline, hint) {
      const e = els();
      show("code");
      if (e.codeHead) e.codeHead.textContent = headline;
      if (e.codeHint) e.codeHint.textContent = hint || "";
      if (e.codeShow) e.codeShow.hidden = mode !== "show";
      if (e.codeInputWrap) e.codeInputWrap.hidden = mode !== "input";
      const privateRelay = NetRendezvous.usingPrivateRelay();
      if (e.codeIn) {
        e.codeIn.maxLength = privateRelay ? 64 : 12;
        e.codeIn.placeholder = privateRelay ? "Paste their 32-character token" : "ABCD2345";
        e.codeIn.setAttribute("aria-label", privateRelay ? "Private room token" : "Room code");
      }
      if (e.codeValue) e.codeValue.setAttribute("data-private", String(privateRelay));
    }

    function paintHostCode(code) {
      const e = els();
      if (e.codeValue) e.codeValue.textContent = code || "";
      if (e.codeShow) e.codeShow.hidden = !code;
      for (const id of ["vs-code-share", "vs-code-copy"]) {
        const b = $(id);
        if (b) b.disabled = !code;
      }
    }

    async function codeHost(opts) {
      opts = opts || {};
      const gen = beginOperation();
      resetSteps();
      stopCodeWait();
      await readyIce();
      if (!operationCurrent(gen)) return cancelledResult();
      if (!newTransport("host")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      const initialTransport = transport;
      const code = opts.code || NetRendezvous.makeCode();
      if (!code) { say("This browser cannot create a secure room token. Use the invite link instead.", true); return { ok: false, error: "crypto" }; }
      if (!opts.quiet) {
        const privateRelay = NetRendezvous.usingPrivateRelay();
        showCodeStep("show", privateRelay ? "Your private room token" : "Your room code",
          privateRelay ? "Copy or share this token with your friend, who needs the same private relay configured. Keep it private." : "Read this to your friend.");
        paintHostCode("");
        say("Preparing… (this can take a few seconds)");
      }

      let invite;
      try { invite = await NetHandshake.createInvite(initialTransport, localProfile()); }
      catch (err) { invite = { ok: false, error: "invite_failed", message: "Could not create an invite (" + ((err && err.message) || err) + "). Tap NEW CODE to try again." }; }
      if (!operationCurrent(gen) || transport !== initialTransport) return cancelledResult();
      if (!invite.ok) { say(invite.message || "Could not create an invite.", true); return invite; }

      codeWait = { cancelled: false };

      if (!NetRendezvous.usingPrivateRelay()) {
        if (!opts.quiet || !_answersSeen || _answersSeen.code !== code) _answersSeen = { code, set: new Set() };
        const answersSeen = _answersSeen.set;
        let answerInFlight = false;
        const sub = await NetRendezvous.hostRoom({
          code, token: codeWait,
          mine: invite.code,
          onFail: (r) => {
            if (!operationCurrent(gen)) return;
            if (!r || r.error === "cancelled" || r.error === "stopped") return;
            if (r.advisory) { say(r.message, true); return; }
            codeRoom = null;
            const watcherArmed = !!pollTimer;
            dropPending();
            if (r.error === "expired" && (sessions.size || watcherArmed || opts.quiet)) {
              const msg = "The room code has expired — INVITE ANOTHER makes a new one.";
              tagFailReason("expired", msg);
              say(msg);
              return;
            }
            if (r.error === "expired" && !opts.quiet) {
              const msg = "The room code expired — tap NEW CODE for another.";
              paintHostCode(""); tagFailReason("expired", msg); say(msg, true);
              return;
            }
            if (r.error === "expired" || r.error === "no_relay") {
              tagFailReason(r.error, r.message);
              say(r.message || "The room service went away. Use the invite link or QR instead.", true);
              return;
            }
            say(r.message || "The room service went away. Use the invite link or QR instead.", true);
          },
          onTick: () => {
            if (!operationCurrent(gen)) return;
            say(sessions.size
              ? "In the room: " + (sessions.size + 1) + ". Still open (code " + code + ")"
              : "Waiting for them to join… (code " + code + ")");
          },
          mintOffer: async () => {
            if (!operationCurrent(gen) || sessions.size >= MAX_GUESTS) return null;
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
            if (!transport || !pendingId) return;
            if (answerInFlight) return;
            answerInFlight = true;
            answersSeen.add(answer);
            const pending = transport;
            const id = pendingId;
            const acc = await NetHandshake.acceptAnswer(pending, answer);
            if (!operationCurrent(gen) || transport !== pending || pendingId !== id) {
              answerInFlight = false;
              return;
            }
            if (!acc.ok) {
              answerInFlight = false;
              if (acc.error !== "wrong_offer") answersSeen.delete(answer);
              if (acc.error !== "already_answered" && acc.error !== "wrong_offer") say(acc.message || "That answer could not be read.", true);
              return;
            }
            if (acc.peer) _peers.set(id, LobbyRoster.cleanCodeProfile(acc.peer));
            codeReopen = code;
            stopCodeWait();
            waitForOpen();
          },
        });
        if (!operationCurrent(gen)) {
          if (sub && sub.stop) { try { sub.stop(); } catch (e) {  } }
          return cancelledResult();
        }
        if (!sub.ok) { say(sub.message || "Could not open that room.", true); return sub; }
        codeRoom = sub; codeRoomCode = code;
        if (!opts.quiet) codeParked = null;
        if (!opts.quiet) {
          paintHostCode(code);
          say("Waiting for them to join…");
        }
        return { ok: true, code, subscribed: true };
      }

      if (!opts.quiet) {
        paintHostCode(code);
        say("Waiting for them to join…");
      }
      const got = await NetRendezvous.swap({
        code, mine: invite.code, slot: "offer", want: "answer",
        token: codeWait,
        onTick: () => {
          if (operationCurrent(gen)) say("Waiting for them to join… (code " + code + ")");
        },
      });
      if (!operationCurrent(gen) || transport !== initialTransport) return cancelledResult();
      if (!got.ok) {
        if (!opts.quiet) paintHostCode("");
        if (got.error !== "cancelled") say(got.message, true);
        return got;
      }
      const acc = await NetHandshake.acceptAnswer(initialTransport, got.payload);
      if (!operationCurrent(gen) || transport !== initialTransport) return cancelledResult();
      if (!acc.ok) { say(acc.message || "That answer could not be read.", true); return acc; }
      if (acc.peer) _peers.set(pendingId || PEER_ONE, LobbyRoster.cleanCodeProfile(acc.peer));
      waitForOpen();
      return { ok: true, code };
    }

    async function codeJoin(codeIn) {
      const gen = beginOperation();
      stopCodeWait();
      const e = els();
      const raw = codeIn != null ? codeIn : (e.codeIn ? e.codeIn.value : "");
      const code = NetRendezvous.normalise(raw);
      if (!NetRendezvous.valid(code)) {
        say(NetRendezvous.usingPrivateRelay()
          ? "Private rooms need a new 32-character token. Ask the host to share a new token, or use the invite link."
          : "That is not a room code — eight letters and numbers (six from an older version).", true);
        return { ok: false, error: "bad_code" };
      }
      await readyIce();
      if (!operationCurrent(gen)) return cancelledResult();
      if (!newTransport("guest")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      let pending = transport;
      say("Looking for that room…");
      codeWait = { cancelled: false };
      let answered = null;
      let watching = false;
      const watch = () => { if (!watching) { watching = true; waitForOpen(); } };
      const pid = pendingId;
      let found = false;
      const done = await NetRendezvous.swap({
        code, slot: "answer", want: "offer", token: codeWait,
        reanswer: true,
        onFail: (r) => { if (r && r.advisory && operationCurrent(gen) && !transports.has(pid)) say(r.message, true); },
        onTick: () => {
          if (!operationCurrent(gen) || found || watching || transports.has(pid)) return;
          say("Looking for that room… (code " + code + ")");
        },
        reply: async (inviteCode) => {
          if (!operationCurrent(gen) || transport !== pending) return null;
          if (answered && answered.ok) {
            const st = pending.stats ? pending.stats() : null;
            if (transports.has(pid) || pending.status === "open" || (st && st.connection === "connected")) return null;
            if (!newTransport("guest")) return null;
            pending = transport;
            const res = await NetHandshake.acceptInvite(pending, inviteCode, localProfile());
            if (!operationCurrent(gen) || transport !== pending) return null;
            if (!res.ok) return null;
            if (res.peer) _peers.set(PEER_ONE, LobbyRoster.cleanCodeProfile(res.peer));
            answered = res;
            waitForOpen();
            return res.code;
          }
          found = true;
          say("Found it — answering…");
          const res = await NetHandshake.acceptInvite(pending, inviteCode, localProfile());
          if (!operationCurrent(gen) || transport !== pending) return null;
          if (!res.ok) { answered = res; return null; }
          if (res.peer) _peers.set(PEER_ONE, LobbyRoster.cleanCodeProfile(res.peer));
          answered = res;
          watch();
          return res.code;
        },
      });
      if (!operationCurrent(gen)) return cancelledResult();
      if (transport !== pending && !transports.has(pid)) return cancelledResult();
      if (!done.ok && done.error === "expired" && transports.has(pid)) {
        watch();
        return { ok: true, code };
      }
      if (!done.ok) {
        const why = (done.error === "reply_failed" && answered && !answered.ok) ? answered : done;
        if (why.error === "expired" || why.error === "no_relay") tagFailReason(why.error, why.message);
        if (why.error !== "cancelled") say(why.message || "Could not join that room.", true);
        if (transport === pending) dropPending();
        return why;
      }
      watch();
      if (transport === pending) say("Joining…");
      return { ok: true, code };
    }


    let wake = null;
    let wakeWanted = false;
    let wakeRequest = null;
    let wakeGeneration = 0;
    function releaseWake(lock) {
      try {
        const released = lock && lock.release();
        if (released && typeof released.catch === "function") released.catch((e) => { Log.debug("net", "wake lock release rejected:", e && e.message); });
      } catch (e) {  }
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
            releaseWake(l);
            if (wakeWanted) holdWake();
            return;
          }
          wake = l;
          l.addEventListener("release", () => { if (wake === l) wake = null; });
        }).catch((e) => { if (wakeRequest === pending) wakeRequest = null; Log.debug("net", "screen wake lock refused:", e && e.message); });
        wakeRequest = pending;
      } catch (e) {  }
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

    const BLOCKING_SEL = (
      "#howtoplay,#career,#career-offers,#career-history,#career-guide,#select," +
      "#teampicker,#carsetup,#photo-studio,#season-setup,#track-detail," +
      "#race-settings,#customize,#trackdesigner,#standings,#quali,#spotifypanel," +
      "#lighting,#camtune,#flyby,#freecam,#garrival,#duel-picker,#datahub,#bench"
    );
    function blockingTitleSheet() {
      if (typeof document.querySelectorAll !== "function") return null;
      const nodes = document.querySelectorAll(BLOCKING_SEL);
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i] && !nodes[i].hidden) return nodes[i];
      }
      return null;
    }

    function open() {
      const block = blockingTitleSheet();
      if (block) {
        Log.info("net", "lobby open skipped — #" + (block.id || "?") + " is up");
        return false;
      }
      invalidateOperations();
      holdWake();
      Log.info("net", "lobby open");
      try { if (NetTransport.prefetchIce) NetTransport.prefetchIce(); } catch (e) {  }
      const e = els();
      if (!e.screen) return false;
      _peers.clear(); _ready.clear(); selfReady = false; clashClear(); myRank = Infinity;
      show("pick");
      if ($("vs-join")) $("vs-join").hidden = false;
      if ($("vs-code-join")) $("vs-code-join").hidden = false;
      resetSteps();
      const raw = document.querySelector("#vs-hosting .vs-raw");
      if (raw) raw.open = false;
      say("");
      e.screen.hidden = false;
      return true;
    }

    function abortQuali() {
      friendQualifying = false;
      if (role === "guest") { qualiAborted = true; broadcast(QABORT, null); }
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
      invalidateOperations(); consumeHandledInvite();
      stopPoll();
      Log.info("net", "lobby close");
      stopScan();
      if (!friendQualifying) dropWake();
      const e = els();
      if (e.screen) e.screen.hidden = true;
    }

    function cancel() {
      friendQualifying = false; qualiAborted = false;
      stopScan();
      stopCodeWait();
      codeReopen = null; codeParked = null;
      clearTimeout(codeReopenTimer); codeReopenTimer = null;
      teardown();
      role = null;
      _peers.clear(); _ready.clear(); selfReady = false; clashClear(); myRank = Infinity; restoreOwnRules();
      if (G.setNetRoom) G.setNetRoom(false);
      close();
    }

    function wire() {
      const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
      const tiltToo = (fn) => (...a) => {
        if (G.getSteerMode && G.getSteerMode() === "tilt" && G.enableTilt) G.enableTilt();
        return fn(...a);
      };
      on("vs-host", tiltToo(host));
      on("vs-join", tiltToo(join));
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
      on("vs-edit-car", () => {
        if (!G.openGarageFrom) return;
        if (selfReady) setReady(false);
        G.openGarageFrom("vsfriend");
      });
      on("vs-ready", tiltToo(() => setReady(!selfReady)));
      on("vs-invite-more", inviteAnother);
      on("vs-code-host", tiltToo(() => codeHost()));
      on("vs-code-join", () => {
        invalidateOperations();
        const privateRelay = NetRendezvous.usingPrivateRelay();
        showCodeStep("input", privateRelay ? "Paste their private room token" : "Enter their code",
          privateRelay ? "Paste all 32 characters shared by your friend. Both players need the same private relay configured." : "Eight letters and numbers (six from an older version).");
        const box = $("vs-code-in");
        if (box) { box.value = ""; box.focus(); }
      });
      on("vs-code-go", tiltToo(() => codeJoin()));
      on("vs-code-copy", () => copy(($("vs-code-value") || {}).textContent || ""));
      on("vs-code-share", () => {
        const c = ($("vs-code-value") || {}).textContent || "";
        return handOff({ title: "Apex 26", text: "Race me on Apex 26 — " + (NetRendezvous.usingPrivateRelay() ? "private room token " : "room code ") + c }, c);
      });
      on("vs-start", tiltToo(startFromRoom));
      const backToRoom = () => {
        invalidateOperations(); stopScan(); dropPending(); stopCodeWait();
        if (codeParked) { codeReopen = codeParked; codeParked = null; reopenRoom(transports.size < MAX_GUESTS); }
        show("room"); renderRoom(); say("");
      };
      on("vs-close", () => {
        const e = els();
        if (transports.size > 0 && e.roomStep && e.roomStep.hidden) { backToRoom(); return; }
        cancel();
        const waiting = deferredInvite; deferredInvite = null;
        if (waiting && NetHandshake.inviteFromUrl() === waiting) openFromUrl();
      });
      const close = $("vs-close");
      if (!backBtn && close && close.parentNode) {
        backBtn = document.createElement("button");
        backBtn.type = "button"; backBtn.id = "vs-back"; backBtn.className = "bigbtn alt"; backBtn.textContent = "BACK";
        backBtn.hidden = true;
        close.parentNode.insertBefore(backBtn, close);
      }
      if (backBtn) backBtn.onclick = () => {
        if (transports.size > 0) { backToRoom(); return; }
        invalidateOperations(); stopScan(); stopCodeWait();
        codeReopen = null; codeParked = null;
        teardown(); role = null; resetSteps();
        if (G.setNetRoom) G.setNetRoom(false);
        if ($("vs-join")) $("vs-join").hidden = false;
        if ($("vs-code-join")) $("vs-code-join").hidden = false;
        show("pick"); say("");
      };
      const onPaste = (id, kind) => {
        const box = $(id);
        if (box) box.addEventListener("paste", () => setTimeout(() => deliver(kind, box.value), 0));
      };
      onPaste("vs-invite-in", "invite");
      onPaste("vs-answer-in", "answer");
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
      openFromUrl();
      if (!hashWired && typeof window !== "undefined" && window.addEventListener) {
        hashWired = true;
        window.addEventListener("hashchange", openFromUrl);
      }
      return true;
    }

    let hashWired = false;
    let urlInvite = null;
    let deferredInvite = null;
    function openFromUrl() {
      const code = NetHandshake.inviteFromUrl();
      if (!code) return false;
      const e = els();
      if (code === urlInvite && e.screen && !e.screen.hidden) return false;
      const racing = typeof UiLayers !== "undefined" && UiLayers && UiLayers.inRace && UiLayers.inRace();
      const hosting = role === "host" && (!!transport || !!codeRoom);
      if (racing || session || transports.size > 0 || hosting) {
        Log.info("net", "lobby invite link ignored: " + (racing ? "racing" : "in a room"));
        if (!racing && e.screen && !e.screen.hidden) { deferredInvite = code; say("A friend's invite link arrived — CLOSE this room to join it."); }
        return false;
      }
      urlInvite = code; deferredInvite = null;
      if (!open()) return false;
      join();
      const box = $("vs-invite-in");
      if (box) box.value = code;
      return true;
    }

    return {
      wire, open, cancel, abortQuali, host, join, makeAnswer, acceptAnswer,
      shareInvite, shareAnswer, openFromUrl,
      scan, stopScan,
      codeHost, codeJoin,
      watchForOpen: waitForOpen,
      roomChanged, setReady, startFromRoom, removeGuest,
      verifyCodes: () => Object.fromEntries(_verify),
      confirmCode, unverifiedCodes: () => unverified().length,
      inviteAnother,
      peerSeats,
      reportQuali, reportQualiLive,
      qualifying: () => friendQualifying,
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
Object.freeze(NetLobby);
