/*
 * NetTransport — the wire under multiplayer, and the seam that keeps the
 * netcode testable.
 *
 * TWO CHANNELS, because the two kinds of traffic want opposite things:
 *
 *   "state"  UNRELIABLE, UNORDERED. Car snapshots and input packets. A late
 *            packet is worthless here — by the time a retransmit arrived the
 *            car has already moved on — so never retransmit one, and never let
 *            a lost packet hold up the ones behind it.
 *   "event"  RELIABLE, ORDERED. Lobby, race settings, the start tick, lap and
 *            sector times, results, disconnect. Losing any of these breaks the
 *            session outright; a few ms of head-of-line blocking does not.
 *
 * TWO IMPLEMENTATIONS behind one interface:
 *
 *   loopback(opts) -> [a, b]   Two endpoints wired to each other IN ONE PAGE,
 *                              with injectable latency, jitter, loss and
 *                              reordering. This exists so the whole
 *                              replication layer can be tested headlessly with
 *                              no network, no signalling and no second
 *                              browser — which is the only way netcode stays
 *                              working in a suite this size. It is deliberately
 *                              written BEFORE the real transport.
 *   rtc(opts)                  RTCPeerConnection + the two DataChannels above.
 *
 * DELIVERY IS EXPLICIT. A queued message only moves when pump(nowMs) is
 * called. A live session pumps from the game loop; a test pumps from its own
 * clock. That is what makes latency and loss reproducible instead of
 * wall-clock dependent — a loss test that depends on how busy the CPU was is
 * not a test. The RTC transport pumps its own receive queue the same way, so
 * both implementations deliver on the same schedule relative to the sim.
 *
 * Randomness for jitter/loss comes from an injected rnd() (default
 * Math.random) so a test can seed it and replay an exact loss pattern.
 */
"use strict";

const NetTransport = (function () {
  const STATE = "state";                 // unreliable / unordered
  const EVENT = "event";                 // reliable / ordered
  const CHANNELS = [STATE, EVENT];

  // ---- shared endpoint plumbing -------------------------------------------
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
      _emit(kind, a, b) {
        // A throwing handler must not take down the transport or stop the
        // remaining handlers — a rendering bug upstream would otherwise read
        // as a dropped connection.
        for (const fn of handlers[kind]) { try { fn(a, b); } catch (e) { /* handler's problem */ } }
      },
    };
  }

  // ---- loopback ------------------------------------------------------------
  // opts: { latencyMs, jitterMs, loss (0..1), rnd }
  // Returns [a, b]. Anything a sends arrives at b and vice versa.
  //
  // Loss and reorder apply ONLY to the "state" channel: that is the honest
  // model, because the reliable channel's whole point is that the browser
  // hides those from us. Simulating loss on it would be testing a scenario
  // that cannot happen.
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
      // Jitter alone reorders the unordered channel: two packets sent in
      // order can land out of order once their arrival times cross, which is
      // the real mechanism rather than a separate knob.
      const at = (from._wire || 0) + latency + (jitter ? (rnd() * 2 - 1) * jitter : 0);
      queue.push({ at, to, channel, data, seq: seq++ });
    }

    // Drain only what is addressed to THIS endpoint, matching rtc() where
    // pump() drains that peer's own inbox. A transport whose two
    // implementations deliver to different places is not substitutable.
    function deliverTo(self, localNow) {
      const t = wireNow(self, localNow);
      if (!queue.length) return 0;
      // Sort by arrival, then send order for ties — so the unordered channel
      // only ever reorders because we ASKED it to above, not by an unstable sort.
      queue.sort((p, q) => (p.at - q.at) || (p.seq - q.seq));
      const held = [];
      let n = 0;
      for (const m of queue) {
        if (m.to === self && m.at <= t) { m.to._emit("message", m.channel, m.data); delivered++; n++; }
        else held.push(m);
      }
      queue = held;
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
        self.status = peer.status = "closed";
        queue = [];
        self._emit("close", "local"); peer._emit("close", "peer");
      };
      self.stats = () => ({ dropped, delivered, queued: queue.length, wire: self._wire || 0 });
    }
    wire(a, b); wire(b, a);

    a.status = b.status = "open";
    a._emit("open"); b._emit("open");
    return [a, b];
  }

  // ---- WebRTC --------------------------------------------------------------
  // The DataChannel configs are the whole point of having two of them:
  //   state: {ordered:false, maxRetransmits:0}  — fire and forget
  //   event: default                            — reliable, ordered
  //
  // Received messages land in a queue and are only handed to the game by
  // pump(), matching loopback exactly. Without that, RTC delivery would
  // interleave with the fixed-step loop at arbitrary points and the two
  // transports would not be substitutable.
  function rtc(opts) {
    opts = opts || {};
    const PC = (typeof RTCPeerConnection !== "undefined") ? RTCPeerConnection : null;
    if (!PC) return null;                      // caller falls back / reports

    const ep = makeEndpoint(opts.name || "rtc");
    // Construction can throw on a locked-down or policy-restricted browser.
    // Report that as "unavailable" like a missing API rather than letting it
    // escape into a click handler, where it would kill the UI silently.
    let pc;
    try {
      pc = new PC({ iceServers: opts.iceServers || [{ urls: "stun:stun.l.google.com:19302" }] });
    } catch (e) { return null; }
    const chans = {};
    let inbox = [];
    let openCount = 0;

    function adopt(ch, kind) {
      chans[kind] = ch;
      ch.binaryType = "arraybuffer";
      ch.onopen = () => {
        if (++openCount === CHANNELS.length) { ep.status = "open"; ep._emit("open"); }
      };
      ch.onclose = () => {
        if (ep.status === "closed") return;
        ep.status = "closed"; ep._emit("close", "peer");
      };
      ch.onmessage = (e) => { inbox.push({ channel: kind, data: e.data }); };
    }

    if (opts.role === "host") {
      // The host creates both channels; the guest adopts them as they arrive.
      adopt(pc.createDataChannel(STATE, { ordered: false, maxRetransmits: 0 }), STATE);
      adopt(pc.createDataChannel(EVENT, { ordered: true }), EVENT);
    } else {
      pc.ondatachannel = (e) => {
        const kind = e.channel.label === STATE ? STATE : EVENT;
        adopt(e.channel, kind);
      };
    }

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if ((s === "failed" || s === "disconnected" || s === "closed") && ep.status !== "closed") {
        ep.status = "closed"; ep._emit("close", s);
      }
    };

    ep.pc = pc;
    ep.send = function (channel, data) {
      const ch = chans[channel];
      if (!ch || ch.readyState !== "open") return false;
      try { ch.send(data); return true; } catch (e) { return false; }
    };
    // Drain everything the browser has handed us since the last call. No
    // scheduling here — RTC has already applied the real network's latency.
    ep.pump = function () {
      if (!inbox.length) return 0;
      const batch = inbox; inbox = [];
      for (const m of batch) ep._emit("message", m.channel, m.data);
      return batch.length;
    };
    ep.close = function () {
      if (ep.status === "closed") return;
      ep.status = "closed";
      for (const k of CHANNELS) { try { chans[k] && chans[k].close(); } catch (e) {} }
      try { pc.close(); } catch (e) {}
      ep._emit("close", "local");
    };
    ep.stats = () => ({
      queued: inbox.length,
      connection: pc.connectionState,
      ice: pc.iceConnectionState,
    });
    return ep;
  }

  function supported() {
    return typeof RTCPeerConnection !== "undefined";
  }

  return { STATE, EVENT, loopback, rtc, supported };
})();
