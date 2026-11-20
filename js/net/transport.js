"use strict";

const NetTransport = (function () {
  const STATE = "state";
  const EVENT = "event";
  const CHANNELS = [STATE, EVENT];

  function makeEndpoint(name) {
    const handlers = { message: [], open: [], close: [] };
    return {
      name,
      _handlers: handlers,
      status: "connecting",
      onMessage(fn) { handlers.message.push(fn); return this; },
      onOpen(fn) { handlers.open.push(fn); return this; },
      onClose(fn) { handlers.close.push(fn); return this; },
      setDisconnectGrace(ms) { return ms; },
      _emit(kind, a, b, c) {
        for (const fn of handlers[kind]) { try { fn(a, b, c); } catch (e) {  } }
      },
    };
  }

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
    let queue = [];
    let seq = 0;
    let dropped = 0, delivered = 0;

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
        if (m.to.status === "closed") continue;
        if (m.to === self && m.at <= t) { m.to._emit("message", m.channel, m.data); delivered++; n++; }
        else held.push(m);
      }
      queue = held;
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

  const { STUN, prefetchIce, iceServers, hasRelay, relayOnly, turnFromStore, dropFetched } = NetIce.create();


  function rtc(opts) {
    opts = opts || {};
    const PC = (typeof RTCPeerConnection !== "undefined") ? RTCPeerConnection : null;
    if (!PC) return null;

    const ep = makeEndpoint(opts.name || "rtc");
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
    const STATE_BUFFER_CAP = 16384;
    const EVENT_BUFFER_CAP = 65536;
    const EVENT_INBOX_CAP = 256;
    const INBOX_BYTE_CAP = 1024 * 1024;
    const EVENT_CRITICAL = {
      go: 1, qgo: 1, start: 1, result: 1, bye: 1,
      armed: 1, left: 1, caution: 1, model: 1,
      quali: 1, qabort: 1, lap: 1, settings: 1, hello: 1, ready: 1,
    };
    let inbox = [];
    let spare = [];
    let queuedState = 0;
    let queuedEvents = 0;
    let queuedBytes = 0;
    let openCount = 0;
    const opened = {};
    const EVENT_OUT_CAP = 256;
    const CLOSE_LINGER_MS = 500, CLOSE_POLL_MS = 25;
    const EVENT_TERMINAL = { bye: 1, go: 1, qgo: 1, start: 1, result: 1 };
    let eventOut = [];

    function messageBytes(data) {
      if (typeof data === "string") return data.length * 2;
      if (data instanceof ArrayBuffer) return data.byteLength;
      if (ArrayBuffer.isView(data)) return data.byteLength;
      if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
      return INBOX_BYTE_CAP + 1;
    }

    let discTimer = null;
    let terminalReason = null;
    function shutdown(reason) {
      if (ep.status === "closed" || (ep.status === "closing" && reason !== "local")) return;
      const drain = reason !== "local" && reason !== "overflow" && inbox.length > 0;
      terminalReason = drain ? reason : null;
      ep.status = drain ? "closing" : "closed";
      if (discTimer) { clearTimeout(discTimer); discTimer = null; }
      endEpisode();
      if (!drain) inbox.length = 0;
      const queued = eventOut;
      eventOut = [];
      if (!drain) queuedState = queuedEvents = queuedBytes = 0;
      const ev = chans[EVENT];
      const buffered = () => CHANNELS.some((k) => chans[k] && chans[k].readyState === "open" && chans[k].bufferedAmount > 0);
      if (reason === "local" && ev && ev.readyState === "open" && (queued.length || buffered())) {
        for (const data of queued) { try { ev.send(data); } catch (e) { break; } }
        const until = Date.now() + CLOSE_LINGER_MS;
        const check = () => {
          if (buffered() && Date.now() < until) { setTimeout(check, CLOSE_POLL_MS); return; }
          closePc();
        };
        setTimeout(check, CLOSE_POLL_MS);
      } else closePc();
      if (!drain) ep._emit("close", reason);
    }
    function closePc() {
      for (const k of CHANNELS) { try { chans[k] && chans[k].close(); } catch (e) {  } }
      try { pc.close(); } catch (e) {  }
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

    const found = { host: 0, srflx: 0, relay: 0, mdns: 0 };
    pc.onicecandidate = (e) => {
      const line = e.candidate && e.candidate.candidate;
      if (!line) return;
      const m = /\btyp (\w+)/.exec(line);
      const t = m ? m[1] : null;
      if (t && found[t] != null) found[t]++;
      if (t === "host" && /\.local\b/i.test(line)) found.mdns++;
    };

    function adopt(ch, kind) {
      chans[kind] = ch;
      ch.binaryType = "arraybuffer";
      if (kind === EVENT) {
        try { ch.bufferedAmountLowThreshold = EVENT_BUFFER_CAP >> 1; } catch (e) {  }
        ch.onbufferedamountlow = () => { flushEventOut(); };
      }
      ch.onopen = () => {
        if (ep.status === "closed" || ep.status === "closing") return;
        if (opened[kind]) return;
        opened[kind] = true;
        if (++openCount === CHANNELS.length) {
          ep.status = "open";
          Log.info("net", "rtc open");
          ep._emit("open");
          if (pc.connectionState === "connected") listenRestart();
        }
      };
      ch.onclose = () => {
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
        inbox.push({ channel: kind, data: e.data, bytes, at: performance.now() });
        queuedBytes += bytes;
        if (kind === STATE) queuedState++;
        else queuedEvents++;
        while (queuedState > STATE_INBOX_CAP) {
          const i = inbox.findIndex((m) => m.channel === STATE);
          if (i < 0) break;
          const removed = inbox.splice(i, 1)[0];
          queuedBytes -= removed.bytes;
          queuedState--;
        }
      };
    }

    if (opts.role === "host") {
      adopt(pc.createDataChannel(STATE, { ordered: false, maxRetransmits: 0 }), STATE);
      adopt(pc.createDataChannel(EVENT, { ordered: true }), EVENT);
    } else {
      pc.ondatachannel = (e) => {
        const label = e.channel.label;
        if ((label !== STATE && label !== EVENT) || chans[label]) {
          Log.warn("net", "ignoring data channel " + String(label).slice(0, 32));
          try { e.channel.close(); } catch (err) {  }
          return;
        }
        adopt(e.channel, label);
      };
    }

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
    const RESTART_DELAY_MS = 3000;
    const RESTART_RETRY_MS = 8000;
    const RESTART_GATHER_MS = 4000;
    const courier = opts.restartCourier !== undefined ? opts.restartCourier : nostrCourier();
    let everConnected = false;
    let restartTimer = null;
    let episode = null;
    let listener = null;
    let resume = null;
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
      episode = listener = resume = null;
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
        if (pc.connectionState === "connected") listenRestart(true);
        return live(ctx) ? pc.localDescription.sdp : null;
      };
      while (live(ctx)) {
        const r = await courier.answer(ctx.code + "R" + ctx.attempt, reply, ctx.token, listener === ctx);
        if (!live(ctx)) return;
        if (r && r.ok) {
          ctx.attempt++;
        }
        else if (!r || r.error !== "expired") return;
      }
    }
    function settleEpisode(ctx) {
      if (episode !== ctx || ctx.token.cancelled || ep.status !== "open") return;
      cancelRestart(ctx); episode = null;
      const s = pc.connectionState;
      if (!ctx.code || ctx.attempt >= 3 || !(s === "disconnected" || s === "failed")) return;
      resume = { code: ctx.code, attempt: ctx.attempt };
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(beginRestart, RESTART_DELAY_MS);
    }
    function beginRestart() {
      restartTimer = null;
      if (episode || !courier || ep.status !== "open") return;
      if (listener) {
        const old = listener; listener = null;
        cancelRestart(old);
        if (old.code) {
          const ctx = episode = { code: old.code, attempt: old.attempt, token: { cancelled: false } };
          answerRestart(ctx).catch((e) => { Log.warn("net", "ice restart failed:", e && e.message); })
            .finally(() => settleEpisode(ctx));
          return;
        }
      }
      const ctx = episode = { code: null, attempt: 0, token: { cancelled: false } };
      const was = resume; resume = null;
      restartCode().then((k) => {
        if (!k || !live(ctx)) return null;
        ctx.code = k.code;
        if (was && was.code === k.code) ctx.attempt = was.attempt;
        return k.offerer ? offerRestart(ctx) : answerRestart(ctx);
      }).catch((e) => { Log.warn("net", "ice restart failed:", e && e.message); })
        .finally(() => settleEpisode(ctx));
    }
    function listenRestart(rotate = false) {
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
        shutdown(s);
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
      if (channel === STATE && ch.bufferedAmount > STATE_BUFFER_CAP) return false;
      if (channel === EVENT) {
        if (eventOut.length && ch.bufferedAmount <= EVENT_BUFFER_CAP) flushEventOut();
        const backed = eventOut.length > 0 || ch.bufferedAmount > EVENT_BUFFER_CAP;
        if (backed) {
          const t = peekEventType(data);
          if (!EVENT_CRITICAL[t]) return false;
          if (eventOut.length >= EVENT_OUT_CAP) {
            if (!EVENT_TERMINAL[t]) return false;
            eventOut.shift();
          }
          eventOut.push(data);
          return true;
        }
      }
      try { ch.send(data); return true; } catch (e) { return false; }
    };
    ep.pump = function () {
      const count = inbox.length;
      if (!count) return 0;
      const batch = inbox;
      inbox = spare || [];
      spare = null;
      queuedState = queuedEvents = queuedBytes = 0;
      for (let i = 0; i < batch.length; i++) {
        const m = batch[i];
        if (ep.status === "closed") break;
        ep._emit("message", m.channel, m.data, m.at);
      }
      batch.length = 0;
      spare = batch;
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

  function nostrCourier() {
    if (typeof NetNostr === "undefined" || !NetNostr.available()) return null;
    if (typeof NetRendezvous !== "undefined" && NetRendezvous.usingPrivateRelay && NetRendezvous.usingPrivateRelay()) return null;
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
