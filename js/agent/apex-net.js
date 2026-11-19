const ApexNet = (function () {
  "use strict";

  function hooks(G, deps) {
    const { resetStartLights } = deps;
    let _netPeer = null;
    let _lobbyPeerTimer = null;
    let _lobbyPeer = null;

    return {
      net() {
        return G.netPlay ? G.netPlay.status() : { active: false };
      },

      netLoopback(o) {
        o = o || {};
        if (!G.netPlay) return { ok: false, error: "no_netplay", message: "NetPlay is not available." };
        const pair = NetTransport.loopback({
          latencyMs: o.latencyMs != null ? o.latencyMs : 0,
          jitterMs: o.jitterMs || 0,
          loss: o.loss || 0,
          rnd: o.seed != null ? NetTransport.seededRnd(o.seed) : undefined,
        });
        _netPeer = pair[1];
        NetSession.autoPong(_netPeer);
        const t0 = o.nowMs != null ? o.nowMs : performance.now();
        pair[0].pump(t0); _netPeer.pump(t0);
        const res = G.netPlay.start({
          transport: pair[0],
          role: o.role === "guest" ? "guest" : "host",
          peerProfile: o.peer || null,
          interpDelayMs: o.interpDelayMs,
        });
        if (!res.ok) { _netPeer = null; return res; }
        G.netPlay.tick(t0);
        return res;
      },

      netPeerSend(st, atMs, wireId) {
        if (!_netPeer || !G.netPlay) return false;
        const status = G.netPlay.status();
        const cur = G.cars[status.remoteId] || {};
        const car = Object.assign({
          s: cur.s || 0, x: cur.x || 0, head: cur.head || 0, speed: cur.speed || 0,
          gear: cur.gear || 1, lap: cur.lap || 0,
          deploying: false, offroad: false, onKerb: false, braking: false,
        }, st || {});
        const now = atMs != null ? atMs : performance.now();
        _netPeer.pump(now);
        const wire = wireId != null ? wireId
          : (status.remotes && status.remotes.length && status.remotes[0].wire != null
            ? status.remotes[0].wire : null);
        if (wire == null) return { ok: false, error: "no_wire" };
        const ok = _netPeer.send("state", NetSnapshot.encodeSnapshot(Math.round(now), [
          { id: wire, car },
        ]));
        return ok ? { sent: car, at: Math.round(now) } : false;
      },

      netPeerClose() {
        if (!_netPeer) return false;
        try { _netPeer.close(); } catch (e) {}
        _netPeer = null;
        return true;
      },

      lobby(o) {
        if (!G.netLobby) return { available: false };
        if (o && o.open) G.netLobby.open();
        if (o && o.cancel) G.netLobby.cancel();
        return Object.assign({ available: true }, G.netLobby.status(), {
          profile: G.netLobby.localProfile(),
          shown: !!(document.getElementById("vsfriend") && !document.getElementById("vsfriend").hidden),
        });
      },

      lobbyFake(on) {
        if (!G.netLobby) return false;
        if (!on) {
          if (_lobbyPeerTimer != null) { clearInterval(_lobbyPeerTimer); _lobbyPeerTimer = null; }
          _lobbyPeer = null; G.netLobby.setTransportFactory(null); return false;
        }
        G.netLobby.setTransportFactory((o) => {
          const pair = NetTransport.loopback({ latencyMs: 0 });
          _lobbyPeer = pair[1];
          NetSession.autoPong(_lobbyPeer);
          if (_lobbyPeerTimer != null) clearInterval(_lobbyPeerTimer);
          _lobbyPeerTimer = setInterval(() => {
            if (!_lobbyPeer) return;
            try { _lobbyPeer.pump(performance.now()); } catch (e) {}
          }, 25);
          return Object.assign(pair[0], { role: o && o.role });
        });
        return true;
      },

      lobbyWatch() {
        if (!G.netLobby) return false;
        G.netLobby.watchForOpen();
        return true;
      },

      lobbyPeerEvent(type, data) {
        if (!_lobbyPeer) return false;
        const now = performance.now();
        _lobbyPeer.pump(now);
        const ok = _lobbyPeer.send("event", JSON.stringify({ t: type, d: data }));
        _lobbyPeer.pump(now);
        return ok;
      },

      lobbyRoom() {
        return G.netLobby ? G.netLobby.roomState() : null;
      },

      lobbyHost() {
        if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
        G.netLobby.open();
        return G.netLobby.host();
      },
      lobbyJoin(inviteCode) {
        if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
        G.netLobby.open();
        G.netLobby.join();
        return G.netLobby.makeAnswer(inviteCode);
      },
      lobbyAccept(answerCode) {
        if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
        return G.netLobby.acceptAnswer(answerCode);
      },

      lobbySdp() {
        if (!G.netLobby || !G.netLobby.sdp) return { ok: false, error: "no_lobby" };
        const s = G.netLobby.sdp();
        return s || { ok: false, error: "no_connection" };
      },

      async lobbyPairs() {
        if (!G.netLobby || !G.netLobby.sdp) return { ok: false, error: "no_lobby" };
        const s = G.netLobby.sdp();
        const pc = s && s._pc;
        if (!pc || !pc.getStats) return { ok: false, error: "no_connection" };
        const stats = await pc.getStats();
        const local = new Map(), remote = new Map(), pairs = [];
        stats.forEach((r) => {
          if (r.type === "local-candidate") local.set(r.id, r);
          else if (r.type === "remote-candidate") remote.set(r.id, r);
          else if (r.type === "candidate-pair") pairs.push(r);
        });
        const name = (c) => (c ? (c.candidateType || "?") + " " + (c.address || c.ip || "?")
                                 + ":" + (c.port || "?") + "/" + (c.protocol || "?") : "?");
        return {
          ice: s.ice, conn: s.conn,
          pairs: pairs.map((p) => ({
            state: p.state, nominated: !!p.nominated,
            sent: p.requestsSent, recv: p.responsesReceived,
            bytes: p.bytesSent,
            local: name(local.get(p.localCandidateId)),
            remote: name(remote.get(p.remoteCandidateId)),
          })),
        };
      },

      lobbyCodeHost() {
        if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
        G.netLobby.open();
        return G.netLobby.codeHost();
      },
      lobbyCodeJoin(code) {
        if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
        G.netLobby.open();
        return G.netLobby.codeJoin(code);
      },

      lobbyInviteAnother() {
        if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
        return G.netLobby.inviteAnother();
      },
      lobbyReady(v, codesMatch) {
        if (!G.netLobby) return false;
        if (codesMatch === true) for (const id of Object.keys(G.netLobby.verifyCodes())) G.netLobby.confirmCode(id);
        G.netLobby.setReady(v !== false);
        return true;
      },
      lobbyStart() {
        if (!G.netLobby) return false;
        return G.netLobby.startFromRoom();
      },

      lobbyMods(profile) {
        return G.netLobby ? G.netLobby.modsFromProfile(profile) : null;
      },

      lobbyFailure(st, secs) {
        return G.netLobby ? G.netLobby.failureMsg(st, secs || 30) : null;
      },

      lobbyShare(which) {
        if (!G.netLobby) return false;
        return which === "answer" ? G.netLobby.shareAnswer() : G.netLobby.shareInvite();
      },

      netStartArm(nowMs, atMs, hold) {
        if (!G.netPlay || !G.netPlay.active()) return { ok: false, error: "no_session" };
        G.netNow = nowMs;
        G.netStart = atMs == null
          ? null
          : { at: atMs, hold: hold != null ? hold : 0.5, now: () => G.netNow };
        G.state = "count";
        G.countT = 0;
        G.lightsLit = 0;
        resetStartLights(false);
        return {
          ok: true,
          at: atMs != null ? atMs : null,
          hold: G.netStart ? G.netStart.hold : null,
          awaiting: G.netPlay.awaitingStart(),
        };
      },

      netHostStart() {
        if (!G.netPlay || !G.netPlay.active()) return { ok: false, error: "no_session" };
        return { ok: !!G.netPlay.hostStart(), startPending: !!G.netStart };
      },

      netPeerEvent(type, data, atMs) {
        if (!_netPeer) return false;
        const now = atMs != null ? atMs : performance.now();
        _netPeer.pump(now);
        return _netPeer.send("event", JSON.stringify({ t: type, d: data }));
      },

      netPeerLaps() { return G.netPlay ? G.netPlay.peerLaps() : []; },

      netTick(nowMs) {
        if (!G.netPlay) return false;
        const now = nowMs != null ? nowMs : performance.now();
        if (_netPeer && _netPeer.pump) { try { _netPeer.pump(now); } catch (e) {} }
        G.netPlay.tick(now);
        return G.netPlay.status();
      },

      netStop() {
        _netPeer = null;
        return G.netPlay ? G.netPlay.stop("local") : false;
      },
    };
  }

  return { hooks };
})();
Object.freeze(ApexNet);
