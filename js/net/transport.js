/* NetTransport — the wire under multiplayer, and the seam that keeps the netcode testable. TWO CHANNELS, because the two kinds of traffic want opposite things: "s… */
"use strict";

const NetTransport = (function () {
  const STATE = "state";                 // unreliable / unordered
  const EVENT = "event";                 // reliable / ordered
  const CHANNELS = [STATE, EVENT];

  // Both implementations expose the same surface, so NetSession/NetPlay never
  // learn which one they are on.
  function makeEndpoint(name) {
    const handlers = { message: [], open: [], close: [] };
    return {
      name,
      _handlers: handlers,
      status: "connecting",
      onMessage(fn) { handlers.message.push(fn); return this; },
      onOpen(fn) { handlers.open.push(fn); return this; },
      onClose(fn) { handlers.close.push(fn); return this; },
      // How long a transient "disconnected" may last before the wire closes.
      // Only rtc has one; loopback never disconnects.
      setDisconnectGrace(ms) { return ms; },
      _emit(kind, a, b, c) {
        // A throwing handler must not take down the transport or stop the
        // remaining handlers — a rendering bug upstream would otherwise read
        // as a dropped connection. (Third slot: rtc's message arrival stamp.)
        for (const fn of handlers[kind]) { try { fn(a, b, c); } catch (e) { /* handler's problem */ } }
      },
    };
  }

  // A REPRODUCIBLE `rnd` for loopback's loss/jitter. Math.random makes a lossy
  // link a coin flip the caller cannot re-run — measured at 50% loss, one
  // second of pumping syncs the clock on 473 of 500 seeded links, so a spec
  // built on the unseeded default fails a few runs in a hundred for reasons
  // that have nothing to do with what it asserts. Same LCG the net unit suite
  // already uses, published so the BROWSER hook can reach it too.
  function seededRnd(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0x100000000; };
  }

  function loopback(opts) {
    opts = opts || {};
    const latency = opts.latencyMs != null ? opts.latencyMs : 50;
    const jitter  = opts.jitterMs  != null ? opts.jitterMs  : 0;
    const loss    = opts.loss      || 0;
    const rnd     = opts.rnd       || Math.random;

    const a = makeEndpoint("a"), b = makeEndpoint("b");
    let queue = [];          // { at, to, channel, data, seq } — `at` is WIRE time
    let seq = 0;
    let dropped = 0, delivered = 0;

    // Each endpoint pumps with ITS OWN clock, because that is the situation
    // being modelled: two browsers share no clock, and the session layer exists
    // precisely to reconcile them. So the transport cannot assume one shared
    // `now`. Each endpoint's first pump establishes its epoch, and everything
    // on the queue is scheduled in the neutral wire time that follows from it —
    // otherwise a peer whose clock reads ten seconds ahead would yank a shared
    // clock forward and deliver the whole queue instantly.
    //
    // This means BOTH endpoints must start pumping at the same real moment for
    // wire time to line up — pump each one before sending anything. A live
    // session does this naturally (both sides pump every frame from the moment
    // they connect); a test has to do it explicitly.
    function wireNow(ep, localNow) {
      if (ep._epoch == null) ep._epoch = localNow;
      ep._wire = localNow - ep._epoch;
      return ep._wire;
    }

    function enqueue(from, to, channel, data) {
      if (channel === STATE) {
        if (loss > 0 && rnd() < loss) { dropped++; return; }
      }
      let at = (from._wire || 0) + latency + (jitter ? (rnd() * 2 - 1) * jitter : 0);
      // The EVENT channel is reliable AND ordered on the real wire (SCTP
      // ordered): jitter must not reorder it here, or a test passes or fails
      // on an order production never produces.
      if (channel === EVENT) { at = Math.max(at, to._lastEventAt || 0); to._lastEventAt = at; }
      queue.push({ at, to, channel, data, seq: seq++ });
    }

    function deliverTo(self, localNow) {
      const t = wireNow(self, localNow);
      if (!queue.length) return 0;
      queue.sort((p, q) => (p.at - q.at) || (p.seq - q.seq));
      const held = [];
      let n = 0;
      for (const m of queue) {
        // A handler may close this endpoint mid-walk (EV.BYE → stop): what is
        // left for a closed endpoint is dropped, as the real wire drops it.
        if (m.to.status === "closed") continue;
        if (m.to === self && m.at <= t) { m.to._emit("message", m.channel, m.data); delivered++; n++; }
        else held.push(m);
      }
      queue = held;
      // A peer that closed with reliable messages still in flight closes
      // here, once the last one of them has been handed over (see close()).
      if (self._closing && !queue.some((m) => m.to === self)) {
        self._closing = false; self.status = "closed";
        self._emit("close", "peer");
      }
      return n;
    }

    function wire(self, peer) {
      self.send = function (channel, data) {
        if (self.status !== "open") return false;
        enqueue(self, peer, channel, data);
        return true;
      };
      self.pump = (localNow) => deliverTo(self, localNow);
      self.close = function () {
        if (self.status === "closed") return;
        self.status = "closed";
        // The reliable channel delivers what was sent before a close (a
        // RESULT then BYE in the same tick, #2199): the peer receives those
        // and only then its close. Unreliable state and anything for us go.
        queue = queue.filter((m) => m.to === peer && m.channel === EVENT && peer.status !== "closed");
        self._emit("close", "local");
        if (peer.status === "closed") return;
        if (queue.length) { peer._closing = true; return; }
        peer.status = "closed"; peer._emit("close", "peer");
      };
      self.stats = () => ({ dropped, delivered, queued: queue.length, wire: self._wire || 0 });
    }
    wire(a, b); wire(b, a);

    a.status = b.status = "open";
    a._emit("open"); b._emit("open");
    Log.info("net", "loopback create");
    return [a, b];
  }

  // The DataChannel configs are the whole point of having two of them:
  //   state: {ordered:false, maxRetransmits:0}  — fire and forget
  //   event: default                            — reliable, ordered
  //
  // Received messages land in a queue and are only handed to the game by
  // pump(), matching loopback exactly. Without that, RTC delivery would
  // interleave with the fixed-step loop at arbitrary points and the two
  // transports would not be substitutable.
  // The server list is NetIce. create() is per evaluation so a reload of
  // this file — the unit harness drops a memoised TURN fetch that way —
  // does not share the previous cache. Callers still use the names below.
  const { STUN, prefetchIce, iceServers, hasRelay, relayOnly, turnFromStore, dropFetched } = NetIce.create();


  function rtc(opts) {
    opts = opts || {};
    const PC = (typeof RTCPeerConnection !== "undefined") ? RTCPeerConnection : null;
    if (!PC) return null;                      // caller falls back / reports

    const ep = makeEndpoint(opts.name || "rtc");
    // iceServers are fixed at construction — see lobby.js readyIce(). stats().turn
    // must describe THIS PeerConnection, not whatever hasRelay() says later when
    // a credentials fetch lands (or expires) after the PC was built.
    let usedIce = null;
    const build = (stunOnly) => {
      usedIce = iceServers(opts, stunOnly);
      const cfg = { iceServers: usedIce };
      const policy = opts.iceTransportPolicy || (relayOnly() ? "relay" : null);
      if (policy) cfg.iceTransportPolicy = policy;
      return new PC(cfg);
    };
    let pc;
    try {
      pc = build(false);
    } catch (e) {
      // A MALFORMED ICE ENTRY IS NOT "NO WEBRTC". The credentials endpoint is
      // third-party, and prefetchIce() only checks that each entry HAS a
      // `urls` — one reading `urls: "garbage"` makes the constructor throw.
      // Returning null here made the lobby say "This browser cannot do
      // WebRTC", and fetchedIce stayed cached for 55 minutes, so every retry
      // said it again. So: forget the fetched list (the next prefetch gets a
      // fresh answer) and try once more with STUN alone — which is exactly
      // what the connection would have had before the relay existed.
      Log.warn("net", "rtc create fail (" + ((e && e.message) || e) + ") — dropping fetched ICE, retrying STUN-only");
      dropFetched();
      try {
        pc = build(true);
      } catch (e2) {
        Log.warn("net", "rtc create fail");
        return null;
      }
    }
    const hadTurn = (usedIce || []).some((e) => {
      const urls = Array.isArray(e.urls) ? e.urls : [e.urls];
      return urls.some((u) => /^turns?:/i.test(String(u || "")));
    });
    Log.info("net", "rtc create");
    const chans = {};
    const STATE_INBOX_CAP = 64;
    const STATE_BUFFER_CAP = 16384;   // outbound SCTP queue bytes before STATE sends drop
    // EVENT is reliable/ordered: its outbound cap sits ABOVE STATE so a burst of
    // strategy/LAP/retire spam is shed before the SCTP queue grows without bound,
    // while GO/START/RESULT/BYE (and other race-flow criticals) still deliver.
    const EVENT_BUFFER_CAP = 65536;
    const EVENT_INBOX_CAP = 256;
    const INBOX_BYTE_CAP = 1024 * 1024;
    // Types whose loss breaks race flow — queue in order when the buffer is full
    // rather than drop. Non-critical (STRATEGY/QLIVE — re-sent every second or a
    // live preview) may be dropped. QUALI is the whole grid ("a wrong grid for the
    // whole race" when lost), LAP carries fin/retired, SETTINGS/HELLO/READY are
    // sent once per change and never repeated. All are a handful per session, so
    // the queue stays small.
    const EVENT_CRITICAL = {
      go: 1, qgo: 1, start: 1, result: 1, bye: 1,
      armed: 1, left: 1, caution: 1, model: 1,
      quali: 1, qabort: 1, lap: 1, settings: 1, hello: 1, ready: 1,
    };
    let inbox = [];
    let queuedState = 0;
    let queuedEvents = 0;
    let queuedBytes = 0;
    let openCount = 0;
    const opened = {};   // kind -> its channel has opened
    // Bound the critical backlog: under sustained pressure (a peer whose SCTP
    // buffer never drains) an unbounded push retained every GO/LAP/BYE forever.
    // Cap matches the inbound EVENT inbox; terminal race-flow types may displace
    // the oldest queued critical so a late BYE/GO still leaves.
    const EVENT_OUT_CAP = 256;
    const EVENT_TERMINAL = { bye: 1, go: 1, qgo: 1, start: 1, result: 1 };
    let eventOut = [];   // critical EVENT payloads waiting for bufferedAmount to drain

    function messageBytes(data) {
      if (typeof data === "string") return data.length * 2; // conservative JS heap cost
      if (data instanceof ArrayBuffer) return data.byteLength;
      if (ArrayBuffer.isView(data)) return data.byteLength;
      if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
      return INBOX_BYTE_CAP + 1;             // unknown payload shape: fail closed
    }

    let discTimer = null;   // the disconnect grace window below; shutdown reclaims it
    let terminalReason = null;
    function shutdown(reason) {
      if (ep.status === "closed" || (ep.status === "closing" && reason !== "local")) return;
      const drain = reason !== "local" && reason !== "overflow" && inbox.length > 0;
      terminalReason = drain ? reason : null;
      ep.status = drain ? "closing" : "closed";
      if (discTimer) { clearTimeout(discTimer); discTimer = null; }
      endEpisode();
      if (!drain) inbox.length = 0;
      eventOut.length = 0;
      if (!drain) queuedState = queuedEvents = queuedBytes = 0;
      for (const k of CHANNELS) { try { chans[k] && chans[k].close(); } catch (e) { /* already closing */ } }
      try { pc.close(); } catch (e) { /* already closing */ }
      if (!drain) ep._emit("close", reason);
    }

    function peekEventType(data) {
      if (typeof data !== "string") return "";
      try {
        const o = JSON.parse(data);
        return (o && typeof o.t === "string") ? o.t : "";
      } catch (e) { return ""; }
    }

    function flushEventOut() {
      const ch = chans[EVENT];
      if (!ch || ch.readyState !== "open") return;
      while (eventOut.length && ch.bufferedAmount <= EVENT_BUFFER_CAP) {
        const data = eventOut.shift();
        try { ch.send(data); } catch (e) { eventOut.unshift(data); break; }
      }
    }

    // WHAT KIND of candidates we found, which is the difference between two
    // completely different failures that otherwise look identical to a player:
    //   no srflx  -> STUN never answered; we never learnt our public address
    //   srflx but no connection -> we know both addresses and the path is
    //                              still blocked, i.e. symmetric NAT, which
    //                              only a TURN relay fixes
    // Without this the UI can only say "it didn't work", and the player cannot
    // tell whether trying again on another network would help.
    const found = { host: 0, srflx: 0, relay: 0, mdns: 0 };
    pc.onicecandidate = (e) => {
      const line = e.candidate && e.candidate.candidate;
      if (!line) return;                       // null candidate = end of gathering
      const m = /\btyp (\w+)/.exec(line);
      const t = m ? m[1] : null;
      if (t && found[t] != null) found[t]++;
      if (t === "host" && /\.local\b/i.test(line)) found.mdns++;
    };

    function adopt(ch, kind) {
      chans[kind] = ch;
      ch.binaryType = "arraybuffer";
      if (kind === EVENT) {
        // Drain queued critical EVENTs once the SCTP send buffer falls.
        try { ch.bufferedAmountLowThreshold = EVENT_BUFFER_CAP >> 1; } catch (e) { /* optional */ }
        ch.onbufferedamountlow = () => { flushEventOut(); };
      }
      ch.onopen = () => {
        if (ep.status === "closed" || ep.status === "closing") return;
        if (opened[kind]) return;   // counted by DISTINCT kind, never by number of opens
        opened[kind] = true;
        if (++openCount === CHANNELS.length) {
          ep.status = "open";
          Log.info("net", "rtc open");
          ep._emit("open");
          if (pc.connectionState === "connected") listenRestart();
        }
      };
      ch.onclose = () => {
        // Route through shutdown(): flipping ep.status here would make
        // shutdown() — the ONLY caller of pc.close() — a permanent no-op, so
        // every peer-initiated disconnect would leak a live RTCPeerConnection,
        // its ICE agent, and up to INBOX_BYTE_CAP of buffered messages.
        shutdown("peer");
      };
      ch.onmessage = (e) => {
        if (ep.status === "closed" || ep.status === "closing") return;
        const bytes = messageBytes(e.data);
        if (queuedBytes + bytes > INBOX_BYTE_CAP ||
            (kind === EVENT && queuedEvents + 1 > EVENT_INBOX_CAP)) {
          Log.warn("net", "rtc inbox overflow");
          shutdown("overflow");
          return;
        }
        // `at` stamps ARRIVAL, not pump time: the clock-sync PONG math reads
        // it, and a pump-time stamp put up to a frame of local scheduling
        // into every RTT sample (the C-12 skew).
        inbox.push({ channel: kind, data: e.data, bytes, at: performance.now() });
        queuedBytes += bytes;
        if (kind === STATE) queuedState++;
        else queuedEvents++;
        while (queuedState > STATE_INBOX_CAP) {
          const i = inbox.findIndex((m) => m.channel === STATE);
          if (i < 0) break; // defensive: queuedState and inbox should agree
          const removed = inbox.splice(i, 1)[0];
          queuedBytes -= removed.bytes;
          queuedState--;
        }
      };
    }

    if (opts.role === "host") {
      // The host creates both channels; the guest adopts them as they arrive.
      adopt(pc.createDataChannel(STATE, { ordered: false, maxRetransmits: 0 }), STATE);
      adopt(pc.createDataChannel(EVENT, { ordered: true }), EVENT);
    } else {
      pc.ondatachannel = (e) => {
        // Only the two labels the host creates, each once: an unknown or duplicate
        // channel used to be adopted as EVENT (or replace the real one), so a
        // second `state` made the guest report open with chans[EVENT] missing.
        const label = e.channel.label;
        if ((label !== STATE && label !== EVENT) || chans[label]) {
          Log.warn("net", "ignoring data channel " + String(label).slice(0, 32));
          try { e.channel.close(); } catch (err) { /* already closing */ }
          return;
        }
        adopt(e.channel, label);
      };
    }

    // "disconnected" is TRANSIENT in Chrome (a Wi-Fi roam, a NAT rebinding, a
    // phone that slept for two seconds) and usually returns to "connected" on
    // its own; only "failed"/"closed" are final. Closing on the blip ended the
    // race for that peer. Give it a grace window instead — the session's own
    // heartbeat timeout still catches a real loss that never recovers.
    // The lobby keeps 5 s; NetSession.setTimeoutMs forwards a race's longer
    // grace here, or a 6–25 s outage the race promises to ride out closed the
    // wire at 5 s and the rival never came back (#2195).
    // Raising the grace MUST re-arm a live timer: lobby→race calls
    // setTimeoutMs(RACE_GRACE_MS) while a Wi-Fi blip may already have armed the
    // 5 s lobby timer, and leaving that handle in place closed the wire at 5 s
    // even though the race had asked for 25 s.
    let disconnectGraceMs = 5000;
    function armDisconnectGrace() {
      if (discTimer) { clearTimeout(discTimer); discTimer = null; }
      discTimer = setTimeout(() => {
        discTimer = null;
        const s = pc.connectionState;
        if (ep.status !== "closed" && s !== "connected") {
          Log.info("net", "connection closed (" + s + " " + disconnectGraceMs + " ms)");
          shutdown(s);
        }
      }, disconnectGraceMs);
    }
    ep.setDisconnectGrace = function (ms) {
      if (Number.isFinite(ms) && ms > 0) disconnectGraceMs = ms;
      if (discTimer) armDisconnectGrace();
      if (episode && episode.expiry) armRestartExpiry(episode);
      return disconnectGraceMs;
    };
    // ICE RESTART (#3556). A Wi-Fi→cellular switch, a NAT rebinding or a
    // router reboot kills the selected candidate pair for good: the old path
    // never comes back, so ICE goes disconnected → failed and only a restart —
    // fresh credentials, a fresh gather, one more offer/answer — finds the new
    // one. W3C webrtc-pc: "Performing an ICE restart is recommended when
    // iceConnectionState transitions to failed"; MDN restartIce(): the next
    // createOffer() carries new credentials and the data channels ride on.
    // A "failed" once connected therefore gets the same grace as
    // "disconnected" (closing at once pre-empted the race's 25 s), and inside
    // that window the ORIGINAL offerer restarts; only it ever offers, so there
    // is no glare. The offer and answer cannot ride our own data channel (it
    // is the thing that died), so they cross through restartCourier — public
    // Nostr by default — sealed under a code derived from the ice-pwd pair of
    // the last completed negotiation, which only the two peers ever held
    // (both values crossed inside the sealed/QR invite). A pc that never
    // connected keeps the old instant close, so a lobby attempt still fails fast.
    const RESTART_DELAY_MS = 3000;    // a disconnect shorter than this usually heals itself
    const RESTART_RETRY_MS = 8000;    // answer applied, still not connected: offer again
    const RESTART_GATHER_MS = 4000;   // non-trickle like the invite: a partial gather beats none
    const courier = opts.restartCourier !== undefined ? opts.restartCourier : nostrCourier();
    let everConnected = false;
    let restartTimer = null;
    let episode = null;               // { code, attempt, token } while an outage lasts
    let listener = null;              // answerer-only, last completed credentials
    let iceRestarts = 0;
    function cancelRestart(ctx) {
      if (!ctx) return;
      ctx.token.cancelled = true;
      if (ctx.expiry) { clearTimeout(ctx.expiry); ctx.expiry = null; }
    }
    function armRestartExpiry(ctx) {
      if (ctx.expiry) clearTimeout(ctx.expiry);
      ctx.expiry = setTimeout(() => {
        cancelRestart(ctx);
        if (episode === ctx) episode = null;
      }, disconnectGraceMs);
    }
    function endEpisode() {
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      const pending = episode;
      cancelRestart(episode); cancelRestart(listener);
      episode = listener = null;
      // A blip that healed before the answer came leaves our restart offer
      // pending; roll it back so the next episode starts from stable.
      if (pending && pc.signalingState === "have-local-offer" && ep.status === "open") {
        Promise.resolve().then(() => {
          if (ep.status === "open" && !episode && pc.signalingState === "have-local-offer") return pc.setLocalDescription({ type: "rollback" });
        })
          .catch((e) => { Log.warn("net", "ice restart rollback failed:", e && e.message); });
      }
    }
    async function restartCode() {
      const local = pc.currentLocalDescription || pc.localDescription;
      const remote = pc.currentRemoteDescription || pc.remoteDescription;
      if (!local || !remote || typeof crypto === "undefined" || !crypto.subtle) return null;
      const pwd = (d) => { const m = /a=ice-pwd:(\S+)/.exec(d.sdp || ""); return m ? m[1] : ""; };
      const offer = local.type === "offer" ? local : remote;
      const answer = local.type === "offer" ? remote : local;
      if (!pwd(offer) || !pwd(answer)) return null;
      const digest = await crypto.subtle.digest("SHA-256",
        new TextEncoder().encode("apex26-ice-restart|" + pwd(offer) + "|" + pwd(answer)));
      return { code: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""),
        offerer: local.type === "offer" };
    }
    function gathered() {
      if (pc.iceGatheringState === "complete") return Promise.resolve();
      return new Promise((resolve) => {
        const t = setTimeout(done, RESTART_GATHER_MS);
        function done() { clearTimeout(t); pc.removeEventListener("icegatheringstatechange", check); resolve(); }
        function check() { if (pc.iceGatheringState === "complete") done(); }
        pc.addEventListener("icegatheringstatechange", check);
      });
    }
    const live = (ctx) => (episode === ctx || listener === ctx) && !ctx.token.cancelled && ep.status === "open";
    async function offerRestart(ctx) {
      while (live(ctx) && ctx.attempt < 3) {
        if (pc.signalingState !== "stable") await pc.setLocalDescription({ type: "rollback" });
        if (!live(ctx)) return;
        if (typeof pc.restartIce === "function") pc.restartIce();
        const offer = await pc.createOffer({ iceRestart: true });
        if (!live(ctx)) return;
        await pc.setLocalDescription(offer);
        await gathered();
        if (!live(ctx)) return;
        iceRestarts++;
        Log.info("net", "ice restart offer " + ctx.attempt);
        const r = await courier.offer(ctx.code + "R" + ctx.attempt, pc.localDescription.sdp, ctx.token);
        if (!live(ctx) || !r || !r.ok || pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription({ type: "answer", sdp: r.payload });
        if (!live(ctx)) return;
        ctx.attempt++;
        await new Promise((resolve) => { restartTimer = setTimeout(resolve, RESTART_RETRY_MS); });
        restartTimer = null;
      }
    }
    async function answerRestart(ctx) {
      const reply = async (sdp) => {
        if (!live(ctx)) return null;
        if (listener === ctx) {
          // Knowledge of the newly completed secret supersedes an older
          // retry chain. Keep at most this active chain and one fresh listener.
          cancelRestart(episode);
          episode = ctx; listener = null;
        }
        if (!ctx.expiry) armRestartExpiry(ctx);
        await pc.setRemoteDescription({ type: "offer", sdp });
        if (!live(ctx)) return null;
        const answer = await pc.createAnswer();
        if (!live(ctx)) return null;
        await pc.setLocalDescription(answer);
        await gathered();
        if (!live(ctx)) return null;
        iceRestarts++;
        Log.info("net", "ice restart answer " + ctx.attempt);
        // A one-sided outage can leave our aggregate state connected. Listen
        // on the completed secret before the courier's answer repost window
        // ends; the older retry chain remains bounded by its own grace.
        if (pc.connectionState === "connected") listenRestart(true);
        return live(ctx) ? pc.localDescription.sdp : null;
      };
      while (live(ctx)) {
        // Only the healthy listener holds a long window; an outage episode re-dials every JOIN window.
        const r = await courier.answer(ctx.code + "R" + ctx.attempt, reply, ctx.token, listener === ctx);
        if (!live(ctx)) return;
        if (r && r.ok) {
          ctx.attempt++;
        }
        else if (!r || r.error !== "expired") return;   // only a quiet relay is worth another listen
      }
    }
    function beginRestart() {
      restartTimer = null;
      if (episode || !courier || ep.status !== "open") return;
      // The healthy listener's sockets may be minutes old and silently dead (a NAT
      // rebind or network switch closes nothing on an idle reader). An outage
      // re-dials: a fresh episode on the same code and attempt, short windows.
      if (listener) {
        const old = listener; listener = null;
        cancelRestart(old);
        if (old.code) {
          const ctx = episode = { code: old.code, attempt: old.attempt, token: { cancelled: false } };
          answerRestart(ctx).catch((e) => { Log.warn("net", "ice restart failed:", e && e.message); });
          return;
        }
      }
      const ctx = episode = { code: null, attempt: 0, token: { cancelled: false } };
      restartCode().then((k) => {
        if (!k || !live(ctx)) return null;
        ctx.code = k.code;
        return k.offerer ? offerRestart(ctx) : answerRestart(ctx);
      }).catch((e) => { Log.warn("net", "ice restart failed:", e && e.message); });
    }
    function listenRestart(rotate = false) {
      // Only the original answerer listens while healthy. This is the same
      // authenticated, bounded courier exchange used during an outage; the
      // original offerer remains the only side allowed to create offers.
      const local = pc.currentLocalDescription || pc.localDescription;
      if (!courier || ep.status !== "open" || !local || local.type !== "answer") return;
      if (rotate) { cancelRestart(listener); listener = null; }
      if (listener) return;
      const ctx = listener = { code: null, attempt: 0, token: { cancelled: false } };
      restartCode().then((k) => {
        if (!k || k.offerer || !live(ctx)) return;
        ctx.code = k.code;
        if (episode && episode !== ctx && episode.code === ctx.code) return;
        return answerRestart(ctx);
      }).catch((e) => { Log.warn("net", "ice restart listener failed:", e && e.message); })
        .finally(() => { cancelRestart(ctx); if (listener === ctx) listener = null; if (episode === ctx) episode = null; });
    }
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (Log.enabled("net", Log.DEBUG)) Log.debug("net", "pc state -> " + s);
      if (ep.status === "closed" || ep.status === "closing") return;
      const down = s === "disconnected" || (s === "failed" && everConnected);
      if (s === "connected") {
        if (discTimer) { clearTimeout(discTimer); discTimer = null; }
        if (episode) Log.info("net", "ice restart recovered");
        everConnected = true;
        endEpisode();
        listenRestart();
      }
      if (s === "closed" || (s === "failed" && !everConnected)) {
        Log.info("net", "connection closed (" + s + ")");
        shutdown(s);   // releases the pc — see ch.onclose
      } else if (down) {
        if (!discTimer) armDisconnectGrace();
        if (!episode && courier) {
          if (restartTimer) clearTimeout(restartTimer);
          restartTimer = setTimeout(beginRestart, s === "failed" ? 0 : RESTART_DELAY_MS);
        }
      }
    };

    ep.pc = pc;
    ep.send = function (channel, data) {
      if (ep.status === "closed" || ep.status === "closing") return false;
      const ch = chans[channel];
      if (!ch || ch.readyState !== "open") return false;
      // maxRetransmits:0 drops on the NETWORK — the local SCTP queue still
      // buffers every send, so on a congested link the state channel stops
      // dropping and starts queueing: stale snapshots arrive seconds late
      // instead of lost, inverting the design. Refusing the send drops THIS
      // frame's snapshot so the next fresh one goes out into a drained queue.
      if (channel === STATE && ch.bufferedAmount > STATE_BUFFER_CAP) return false;
      if (channel === EVENT) {
        // Prefer draining any queued criticals before accepting a fresh send so
        // order on the reliable channel stays FIFO across the backpressure seam.
        if (eventOut.length && ch.bufferedAmount <= EVENT_BUFFER_CAP) flushEventOut();
        const backed = eventOut.length > 0 || ch.bufferedAmount > EVENT_BUFFER_CAP;
        if (backed) {
          const t = peekEventType(data);
          if (!EVENT_CRITICAL[t]) return false;   // drop non-critical under pressure
          if (eventOut.length >= EVENT_OUT_CAP) {
            if (!EVENT_TERMINAL[t]) return false; // backlog full: shed non-terminal criticals
            eventOut.shift();                    // terminal: displace the oldest queued critical
          }
          eventOut.push(data);                    // critical: keep order, deliver on drain
          return true;
        }
      }
      try { ch.send(data); return true; } catch (e) { return false; }
    };
    ep.pump = function () {
      const count = inbox.length;
      if (!count) return 0;
      // DETACH, THEN EMIT. _emit runs handlers synchronously, and one of them
      // empties this very array mid-walk: EV.BYE → stop() → shutdown() →
      // `inbox.length = 0`. An index walk would then read inbox[i] as undefined
      // and throw on `.channel` — out of pump(), out of the game loop, on the
      // one frame a peer says goodbye. Clearing BEFORE the loop also means a
      // handler that queues a fresh message keeps it for the next pump instead
      // of having it wiped by a trailing reset.
      const batch = inbox.slice(0);
      inbox.length = 0;
      queuedState = queuedEvents = queuedBytes = 0;
      for (let i = 0; i < batch.length; i++) {
        const m = batch[i];
        // A handler shut us down (EV.BYE → stop → shutdown): the rest of the
        // batch is a closed connection's mail — a trailing MODEL mismatch
        // announced "GAME VERSIONS DIFFER" for a peer that had already left.
        if (ep.status === "closed") break;
        // m.at is the arrival stamp taken at inbox push — session.js does the
        // PONG clock math on it rather than on handler-run time.
        ep._emit("message", m.channel, m.data, m.at);
      }
      if (terminalReason && ep.status === "closing") {
        const reason = terminalReason;
        terminalReason = null;
        ep.status = "closed";
        ep._emit("close", reason);
      }
      return count;
    };
    ep.close = function () { shutdown("local"); };
    ep.stats = () => ({
      queued: inbox.length,
      queuedBytes,
      connection: pc.connectionState,
      ice: pc.iceConnectionState,
      gathering: pc.iceGatheringState,
      candidates: Object.assign({}, found),
      turn: hadTurn,
      ownTurn: !!turnFromStore(),
      iceRestarts,
    });
    return ep;
  }

  // The default ICE-restart courier (see rtc()): the room service's Nostr bus,
  // hosting the restart offer / replying to it under a per-connection code.
  // Null where there is no bus, which leaves the grace window as the only cure.
  function nostrCourier() {
    if (typeof NetNostr === "undefined" || !NetNostr.available()) return null;
    return {
      offer: (code, sdp, token) => NetNostr.directExchange({ code, send: sdp, token }),
      answer: (code, reply, token, listen) => NetNostr.directExchange({ code, reply, token, listen: !!listen }),
    };
  }

  function supported() {
    return typeof RTCPeerConnection !== "undefined";
  }

  return {
    STATE, EVENT, loopback, rtc, supported, seededRnd,
    STUN, prefetchIce, iceServers, hasRelay,
  };
})();
