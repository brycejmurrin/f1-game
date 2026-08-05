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
  // More than one STUN server, because a single one is a single point of
  // failure for the ONE thing that decides whether two people can connect:
  // learning your own public address. If it is blocked, rate-limited, or slow
  // on the day, you gather only LAN candidates and the connection fails with
  // no explanation. Different operators, so they do not fail together.
  const STUN = [
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
    "stun:stun.cloudflare.com:3478",
  ];

  // A TURN relay is the only thing that connects two symmetric NATs, and STUN
  // alone leaves roughly 10-25% of pairs unable to connect at all — which is
  // exactly the "both sides found an address but the link was blocked" failure
  // seen on real devices.
  //
  // It turns out this does NOT have to be paid for. Open Relay publishes STATIC
  // credentials intended to be embedded in client-side JavaScript, ~20 GB a
  // month free, on ports 80 and 443 so corporate firewalls pass it. Our traffic
  // is ~2 KB/s per player and only relays when a direct path fails, so that
  // allowance is effectively unbounded here.
  //
  // THE STATIC FREE RELAY IS DEAD. Open Relay's embeddable credentials
  // (openrelayproject/openrelayproject) were retired — Metered now requires a
  // per-account API key and a credentials endpoint that RETURNS the iceServers
  // array. Measured from a real device: the old config gathered zero relay
  // candidates while STUN worked, which is worse than shipping nothing,
  // because it looks like a relay exists and diagnosis chases the wrong thing.
  //
  // RE-MEASURED from a clean browser since, because the vendor's own docs still
  // publish staticauth.openrelay.metered.ca (for Nextcloud/Matrix) and reading
  // them would suggest the host is alive. It is not: a Trickle-ICE gather
  // against it yields ONE host candidate and two `code=701 host lookup received
  // error` lines — the name does not resolve. The docs are stale; the host is
  // dead. Do not put it back on the strength of that page.
  //
  // So: no static TURN is shipped. A relay comes from ONE of
  //   apex26.turnApi — a credentials URL, fetched by prefetchIce() when the
  //     lobby opens and merged here once it arrives. Metered's shape is
  //     https://<app>.metered.live/api/v1/turn/credentials?apiKey=<KEY>, and it
  //     responds with a BARE ARRAY — hence the Array.isArray branch below;
  //     {iceServers:[…]} / {ice_servers:[…]} are accepted too so a
  //     self-hosted endpoint can use the more obvious shape. Free tier is
  //     20 GB/month (the vendor says so twice on the Open Relay page) on an
  //     account the game's OWNER controls — the model the operator actually
  //     offers, rather than freeloading on credentials they retired.
  //   apex26.turn — a single static server you run yourself.
  let fetchedIce = null;
  let fetchingIce = null;
  function prefetchIce() {
    let url = null;
    try { url = localStorage.getItem("apex26.turnApi"); } catch (e) {}
    if (!url || fetchedIce || fetchingIce) return fetchingIce;
    fetchingIce = fetch(url).then((r) => r.json()).then((body) => {
      const list = Array.isArray(body) ? body : (body && (body.iceServers || body.ice_servers)) || null;
      if (Array.isArray(list) && list.length) fetchedIce = list;
      return fetchedIce;
    }).catch(() => null).finally(() => { fetchingIce = null; });
    return fetchingIce;
  }

  // RELAY ONLY, for testing the path that NAT'd and mobile players actually
  // depend on. On one machine — and on most home networks — a direct host pair
  // forms instantly and TURN is never touched, so the relay leg is exactly the
  // one a developer never exercises and a player on carrier-grade NAT always
  // does. Forcing it is the only way to find out it is broken before somebody's
  // phone does.
  //
  // localStorage apex26.iceRelayOnly = "true". Read HERE rather than passed
  // down from the lobby, for the same reason turnFromStore() is: the real
  // transport and any harness then behave identically.
  function relayOnly() {
    try { return localStorage.getItem("apex26.iceRelayOnly") === "true"; }
    catch (e) { return false; }
  }

  // Your own relay still wins when you have one: localStorage apex26.turn =
  // {"urls":"turn:host:3478","username":"u","credential":"p"}. Read here rather
  // than in the lobby so the real transport and any harness behave identically.
  function turnFromStore() {
    try {
      const raw = localStorage.getItem("apex26.turn");
      if (!raw) return null;
      const cfg = JSON.parse(raw);
      return cfg && cfg.urls ? cfg : null;
    } catch (e) { return null; }
  }

  // Does this ICE list actually contain a RELAY, as opposed to only STUN?
  // relayOnly() is meaningless without one, and worse than meaningless — see
  // the guard in rtc().
  function hasTurn(list) {
    return (list || []).some((s) => {
      const u = s && s.urls;
      const urls = Array.isArray(u) ? u : (u ? [u] : []);
      return urls.some((x) => /^turns?:/i.test(String(x)));
    });
  }

  function iceServers(opts) {
    if (opts.iceServers) return opts.iceServers;
    const list = [{ urls: STUN }];
    const mine = turnFromStore();
    // A relay you configured yourself goes first; credential-fetched servers
    // follow. ICE prefers whichever actually yields a working pair, so listing
    // both costs nothing but a couple of extra candidates.
    if (mine) list.push(mine);
    if (fetchedIce) list.push(...fetchedIce);
    return list;
  }

  function rtc(opts) {
    opts = opts || {};
    const PC = (typeof RTCPeerConnection !== "undefined") ? RTCPeerConnection : null;
    if (!PC) return null;                      // caller falls back / reports

    const ep = makeEndpoint(opts.name || "rtc");
    // Construction can throw on a locked-down or policy-restricted browser.
    // Report that as "unavailable" like a missing API rather than letting it
    // escape into a click handler, where it would kill the UI silently.
    let pc;
    let iceList = null;
    try {
      const list = iceServers(opts);
      iceList = list;
      const cfg = { iceServers: list };
      // "relay" makes ICE discard host and srflx candidates, so the ONLY way a
      // pair can form is through TURN. If the relay path is broken, it fails
      // here rather than on a stranger's phone.
      //
      // BUT NEVER WITH AN EMPTY RELAY LIST. "relay" throws away host and srflx
      // and then has nothing left to gather: zero candidates, so EVERY pairing
      // fails — invite link and room code alike — and the failure looks exactly
      // like a network problem. That state became reachable the moment the dead
      // static TURN was removed and nothing replaced it: the flag PERSISTS in
      // localStorage, so a machine that set it to test the relay leg silently
      // became unable to connect at all. It is not a valid configuration, it is
      // a broken one, so we refuse to build it and say so loudly rather than
      // handing back a connection that provably cannot succeed.
      const wantRelay = relayOnly();
      const canRelay = hasTurn(list);
      if (wantRelay && !canRelay) {
        Log.warn("net", "apex26.iceRelayOnly is set but NO TURN server is configured —"
          + " relay-only would gather zero candidates, so it is being IGNORED."
          + " Run localStorage.removeItem('apex26.iceRelayOnly') to silence this,"
          + " or set apex26.turnApi / apex26.turn to actually test the relay leg.");
      }
      const policy = opts.iceTransportPolicy || (wantRelay && canRelay ? "relay" : null);
      if (policy) cfg.iceTransportPolicy = policy;
      pc = new PC(cfg);
    } catch (e) { return null; }
    const chans = {};
    let inbox = [];
    let openCount = 0;

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
      gathering: pc.iceGatheringState,
      candidates: Object.assign({}, found),
      // Whether a relay is IN THE LIST WE ACTUALLY BUILT — not merely whether a
      // static one is stored. A credentials URL that resolved in time puts a
      // relay in the list without ever touching apex26.turn, and reading the
      // store alone reported "no relay" while relay candidates were arriving,
      // which is precisely backwards for the message the lobby prints on
      // failure.
      turn: hasTurn(iceList),
      relayOnly: relayOnly(),
    });
    return ep;
  }

  function supported() {
    return typeof RTCPeerConnection !== "undefined";
  }

  return {
    STATE, EVENT, loopback, rtc, supported,
    // Exported so the ICE configuration is testable: whether a relay is
    // reachable decides whether the hardest ~10-25% of networks can play at
    // all, and that is not something to discover from a user's screenshot.
    STUN, prefetchIce, iceServers,
    // Whether a relay is actually available RIGHT NOW — static, fetched, or
    // neither. The lobby needs this to tell "relay-only is biting" apart from
    // "relay-only is set and being ignored", which read identically otherwise.
    hasRelay: () => hasTurn(iceServers({})),
  };
})();
