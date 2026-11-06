/* Apex 26 — ApexNet: the netplay and VS FRIEND lobby hooks of the window.__apex API (net, netLoopback, netPeer*, netTick, lobby*).
   Pure move out of apex.js (#1660). hooks(G, { resetStartLights }) returns the hook methods, which apex.js spreads into the same
   API object; the loopback far-end state (_netPeer, _lobbyPeer, the pump timer) lives here, since only these hooks touch it. */
const ApexNet = (function () {
  "use strict";

  function hooks(G, deps) {
    const { resetStartLights } = deps;
    let _netPeer = null;
    let _lobbyPeerTimer = null;   // keeps the fake lobby peer pumping (see lobbyFake)
    // The far end of a faked lobby connection — see lobbyFake().
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
          // `seed` makes loss and jitter REPRODUCIBLE. Without it a lossy spec is
          // a coin flip that re-runs differently, which is indistinguishable from
          // the defect it is meant to catch.
          rnd: o.seed != null ? NetTransport.seededRnd(o.seed) : undefined,
        });
        _netPeer = pair[1];
        // THE FAR END MUST ANSWER PINGS. A bare transport endpoint is not a peer:
        // in a real connection the other browser runs NetSession too, so the near
        // end reaches synced() inside one round trip and starts handing snapshots
        // to the game. Without a responder synced() is false for ever, every
        // packet lands in heldState, and net().buffered stays 0 while the session
        // reports itself alive — which is precisely what the multiplayer-session
        // specs were failing on (14 reds, six of them this).
        NetSession.autoPong(_netPeer);
        // Both endpoints must be pumped from the same moment for the loopback's
        // wire clock to line up (see js/net/transport.js). A test passes its own
        // t0 so the whole session runs on a virtual clock it controls.
        const t0 = o.nowMs != null ? o.nowMs : performance.now();
        pair[0].pump(t0); _netPeer.pump(t0);
        const res = G.netPlay.start({
          transport: pair[0],
          role: o.role === "guest" ? "guest" : "host",
          peerProfile: o.peer || null,
          interpDelayMs: o.interpDelayMs,
        });
        if (!res.ok) { _netPeer = null; return res; }
        // ...and the near end must PING at t0, not on the caller's first netTick.
        // start() does not pump, so without this the first PING and the first
        // snapshot ride the same pump: the snapshot arrives while synced() is
        // still false and is held, so the very first assertion after one packet
        // sees 0. A live session pumps every frame from the moment it connects
        // (transport.js says so in as many words); this is that first frame.
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
        // The WIRE id, not the cars[] index. A real peer stamps its packets with
        // G.wireId — the same number on every screen, which an index is not — so
        // the fake peer must too, or onState has no slot to route it to.
        const wire = wireId != null ? wireId
          : (status.remotes && status.remotes.length && status.remotes[0].wire != null
            ? status.remotes[0].wire : null);
        if (wire == null) return { ok: false, error: "no_wire" };
        const ok = _netPeer.send("state", NetSnapshot.encodeSnapshot(Math.round(now), [
          { id: wire, car },
        ]));
        return ok ? { sent: car, at: Math.round(now) } : false;
      },

      // netPeerClose() — the rival's connection drops. The game must hand their
      // car back to the AI rather than leave a driverless obstacle on track.
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

      // lobbyFake(on) — make the lobby build LOOPBACK endpoints instead of real
      // RTCPeerConnections. Necessary, not merely convenient: an RTCPeerConnection
      // whose ICE never completes (a sandboxed CI browser, a locked-down network)
      // spins indefinitely, so a test that builds one does not fail — it HANGS,
      // which is far worse. The far endpoint is kept here so the connection can be
      // completed on demand by lobbyWatch(), which drives it to onConnected().
      lobbyFake(on) {
        if (!G.netLobby) return false;
        if (!on) {
          if (_lobbyPeerTimer != null) { clearInterval(_lobbyPeerTimer); _lobbyPeerTimer = null; }
          _lobbyPeer = null; G.netLobby.setTransportFactory(null); return false;
        }
        G.netLobby.setTransportFactory((o) => {
          const pair = NetTransport.loopback({ latencyMs: 0 });
          _lobbyPeer = pair[1];
          // THE FAKE PEER HAS TO STAY ALIVE. A bare endpoint answers no PINGs and
          // sends none, so the lobby's session hears nothing after the last thing
          // the test pushed and closes on its own 6 s timeout — the room then loses
          // the peer with no user action at all. Measured with a probe that only
          // watched: peerReady held true through t+5.5 s and went false at t+6.0 s.
          // Every room/seat spec that takes more than six seconds to reach its
          // assertion failed on that, which is why they fail on a slow box and pass
          // on a fast one. autoPong answers the lobby's own 500 ms pings, and the
          // 25 ms pump is what lets the far end SEE them — lobbyPeerEvent only
          // pumps when the test happens to send something, and a real peer is
          // running its own loop the whole time.
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
      lobbyReady(v) {
        if (!G.netLobby) return false;
        G.netLobby.setReady(v !== false);
        return true;
      },
      lobbyStart() {
        if (!G.netLobby) return false;
        return G.netLobby.startFromRoom();
      },

      // lobbyMods(profile) — resolve a peer profile to multipliers, locally.
      lobbyMods(profile) {
        return G.netLobby ? G.netLobby.modsFromProfile(profile) : null;
      },

      // lobbyFailure(wireStats, secs) — the message a failed connection produces,
      // from a given wire state. Exposed because the real thing needs two devices
      // on two hostile networks, which no CI can arrange — but WHICH diagnosis we
      // draw from a given set of candidates is pure logic and must not regress.
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

      // netTick(nowMs?) — pump the session by hand. The game loop already calls
      // this every frame, but a test must not depend on rAF actually running at a
      // useful rate: driving it explicitly is what makes latency, loss and
      // interpolation reproducible here, the same way step() does for physics.
      netTick(nowMs) {
        if (!G.netPlay) return false;
        const now = nowMs != null ? nowMs : performance.now();
        // PUMP THE FAKE PEER TOO. transport.js is explicit that both endpoints must
        // pump every frame or the wire clock does not line up, and a live peer does
        // (it is running its own loop). Only netPeerSend/netPeerEvent pumped it, so
        // a test that merely ticks — a clock warm-up, an idle stretch — delivered
        // nothing to the far end, its autoPong never saw a PING, and the session
        // could not sync. The peer goes first so anything it answers is on the wire
        // before the session's own pump collects.
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
