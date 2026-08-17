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
  // That is why no static CREDENTIALS ship — what ships is a credentials URL
  // (THE SHIPPED RELAY, next block). iceServers() MERGES every source it has:
  //   apex26.turnApi — your own credentials URL (Metered-style: returns
  //     {iceServers|iceServers:[…]} or a bare array), fetched by prefetchIce()
  //     when the lobby opens; when set it replaces the shipped URL, so a
  //     player who configured one is never quietly moved onto another quota.
  //   apex26.turn — a single static server you run yourself, listed first.
  //   Since build 972, two free no-account relays, appended LAST so anything
  //   you configured still wins — but OFF unless opted into, and the
  //   free-relays block below says why that is not timidity.
  // THE SHIPPED RELAY. A Metered free-tier credentials URL on the game owner's
  // own account — the model the operator actually offers, rather than the
  // embeddable credentials they retired. It returns a fresh iceServers array
  // with EXPIRING credentials, so what is published here is a fetch URL and
  // not a standing password.
  //
  // WHY THIS IS NEEDED AT ALL, from a real pair of devices ON ONE WI-FI: the
  // only host candidate a browser now offers is mDNS-obfuscated
  // (<uuid>.local), and if the router does client isolation or the OS declines
  // local-network discovery, that name never resolves. The one remaining pair
  // is srflx-to-srflx, which needs the router to hairpin its own public
  // address back at itself, and many will not. Two phones on the same sofa
  // then fail to connect while each holds a perfectly good address — which is
  // exactly what "both sides found an address but the direct link was blocked"
  // was reporting.
  //
  // THE KEY IS VISIBLE, and that is inherent rather than sloppy: any
  // client-side TURN credential is readable in devtools, which is why Metered
  // documents this exact fetch from the browser. The quota is 50 GB/month and
  // the owner can rotate the key. Overridable by apex26.turnApi, so a fork
  // points at its own account by setting one key.
  const TURN_API =
    "https://bmurrin-apex.metered.live/api/v1/turn/credentials"
    + "?apiKey=410aca13505116873c708db45f86cd468871";

  // How long a credentials endpoint gets before we race without it. Short on
  // purpose: a relay improves the odds of connecting, and waiting for one is
  // never worth making the player stare at a lobby that has not opened.
  const FETCH_TIMEOUT_MS = 4000;

  let fetchedIce = null;
  let fetchingIce = null;
  function prefetchIce() {
    const jobs = [derivedRelays()];
    let url = null;
    try { url = localStorage.getItem("apex26.turnApi"); } catch (e) {}
    // Yours first, ours as the default — so a player who configured one is
    // never quietly moved onto somebody else's quota.
    if (!url) url = TURN_API;
    if (url && !fetchedIce && !fetchingIce) {
      // BOUNDED. A credentials endpoint that never answers — captive portal,
      // dead DNS, a firewall that blackholes rather than refuses — must not
      // become an unbounded wait, because the lobby now awaits this before
      // building a connection. Abort rather than merely ignore, or the socket
      // lingers.
      const ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
      const bail = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) {} }, FETCH_TIMEOUT_MS);
      fetchingIce = fetch(url, ctl ? { signal: ctl.signal } : undefined).then((r) => r.json()).then((body) => {
        const list = Array.isArray(body) ? body : (body && (body.iceServers || body.ice_servers)) || null;
        if (Array.isArray(list) && list.length) fetchedIce = list;
        return fetchedIce;
      }).catch((err) => {
        // No relay is a NORMAL state and must not block the lobby (see below),
        // but docs/MULTIPLAYER.md documents prefetchIce() as the thing that has
        // to land before a connection is built — and when it does not, every wire dump
        // reads relay:0 while the relay is demonstrably alive. Retained so that
        // symptom has a cause attached to it.
        Log.warn("net", "TURN credential fetch failed, gathering STUN-only: " + ((err && err.message) || err));
        return null;
      }).finally(() => { clearTimeout(bail); fetchingIce = null; });
    }
    if (fetchingIce) jobs.push(fetchingIce);
    // Failure-silent by design: no relay is a NORMAL state, and a lobby that
    // refused to open because a free third party was down would be worse than
    // one that connects for the ~80% of pairs needing no relay at all.
    return Promise.all(jobs).then(() => null, () => null);
  }

  // THE FREE RELAYS, and the honest state of the evidence.
  //
  // Open Relay publishes the shared secret for its static-auth host
  // (`openrelayprojectsecret`) as the config for Nextcloud Talk and Matrix,
  // which is the standard coturn REST scheme: the CLIENT derives
  //   username   = <unix expiry>
  //   credential = base64(HMAC-SHA1(secret, username))
  // No account, and the credential EXPIRES, which is strictly better than the
  // hardcoded password this game shipped until 971 and which its operator had
  // by then retired.
  //
  // BOTH ARE OFF BY DEFAULT, BECAUSE BOTH WERE MEASURED DEAD.
  //
  // This is not a guess. Trickle-ICE gathers were run from two independent
  // internet vantage points (public IPs 18.145.255.226 and 54.151.122.159),
  // each carrying a CONTROL — Google STUN — alongside both relays. The
  // control produced an srflx candidate both times, so DNS and UDP demonstrably
  // worked; both relays produced ZERO relay candidates both times, with
  // "701 host lookup" against each. A control is what makes that a fact about
  // the relays rather than a fact about the test box, and it is exactly what
  // the first, controlless run lacked. Independently, streamlit-webrtc's docs
  // describe Open Relay as "often down".
  //
  // Build 971 removed a dead relay because it is WORSE than none: it looks
  // like a relay exists and diagnosis chases the wrong thing. Shipping two
  // more measured-dead entries on by default would re-earn that exactly.
  //
  // So the code stays and the switch is the player's:
  //
  //     localStorage.setItem("apex26.freeTurn", "true")
  //     await __apex.turnProbe()
  //
  // — which costs nothing while they are down, and is one line the day either
  // operator comes back. turnProbe() is what answers the question; do not
  // re-argue this list without running it.
  const OPEN_RELAY_SECRET = "openrelayprojectsecret";
  const OPEN_RELAY_HOSTS = [
    "turn:staticauth.openrelay.metered.ca:80",
    "turn:staticauth.openrelay.metered.ca:443",
    "turn:staticauth.openrelay.metered.ca:443?transport=tcp",
  ];
  // freestun needs no derivation, so it is usable synchronously and survives a
  // browser with no WebCrypto.
  const FREE_TURN = [
    { urls: "turn:freestun.net:3478", username: "free", credential: "free" },
  ];

  function freeTurnOn() {
    try { return localStorage.getItem("apex26.freeTurn") === "true"; }
    catch (e) { return false; }
  }

  let derived = null;
  let deriving = null;
  function derivedRelays() {
    if (!freeTurnOn()) return Promise.resolve(null);
    if (derived) return Promise.resolve(derived);
    if (deriving) return deriving;
    const sub = (typeof crypto !== "undefined" && crypto.subtle) ? crypto.subtle : null;
    if (!sub) return Promise.resolve(null);      // no WebCrypto: freestun only
    // A day out. Long enough that a lobby left open over lunch still works,
    // short enough that a code scraped out of the bundle is not a standing
    // grant.
    const username = String(Math.floor(Date.now() / 1000) + 86400);
    const enc = (s) => new TextEncoder().encode(s);
    deriving = sub.importKey("raw", enc(OPEN_RELAY_SECRET), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
      .then((key) => sub.sign("HMAC", key, enc(username)))
      .then((sig) => {
        const bytes = new Uint8Array(sig);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const credential = btoa(bin);
        derived = OPEN_RELAY_HOSTS.map((urls) => ({ urls, username, credential }));
        return derived;
      })
      .catch(() => null)
      .then((r) => { deriving = null; return r; });
    return deriving;
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

  function iceServers(opts) {
    if (opts.iceServers) return opts.iceServers;
    const list = [{ urls: STUN }];
    const mine = turnFromStore();
    // A relay you configured yourself goes first; credential-fetched servers
    // follow. ICE prefers whichever actually yields a working pair, so listing
    // both costs nothing but a couple of extra candidates.
    if (mine) list.push(mine);
    if (fetchedIce) list.push(...fetchedIce);
    // The free relays go LAST when opted in, and only ever add candidates.
    // ICE tries every pair it can form and keeps the best, so ordering by
    // INTENT — yours, then your operator's, then whatever is free — means a
    // free entry can never displace one that works.
    if (freeTurnOn()) {
      if (derived) list.push(...derived);
      list.push(...FREE_TURN);
    }
    return list;
  }

  // Has a relay of any kind made it into the list? The lobby's failure copy
  // needs to say "no relay is configured" or "a relay did not answer", and
  // those are opposite instructions to give a player.
  function hasRelay() {
    return iceServers({}).some((e) => {
      const urls = Array.isArray(e.urls) ? e.urls : [e.urls];
      return urls.some((u) => /^turns?:/i.test(u));
    });
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
    try {
      const cfg = { iceServers: iceServers(opts) };
      // "relay" makes ICE discard host and srflx candidates, so the ONLY way a
      // pair can form is through TURN. If the relay path is broken, it fails
      // here rather than on a stranger's phone.
      const policy = opts.iceTransportPolicy || (relayOnly() ? "relay" : null);
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
      if (Log.enabled("net", Log.DEBUG)) Log.debug("net", "pc state -> " + s);
      if ((s === "failed" || s === "disconnected" || s === "closed") && ep.status !== "closed") {
        // The one line that says WHY a race ended. Without it a dropped peer is
        // indistinguishable from a clean leave anywhere in the logs.
        Log.info("net", "connection closed (" + s + ")");
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
      const count = inbox.length;
      if (!count) return 0;
      for (let i = 0; i < count; i++) {
        const m = inbox[i];
        ep._emit("message", m.channel, m.data);
      }
      inbox.length = 0;
      return count;
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
      // "was a relay even offered to ICE", not "is one of mine configured" —
      // the lobby's failure copy branches on it to choose between two opposite
      // instructions, and a player who opted into the free relays, or whose
      // apex26.turnApi answered, has one without it being theirs.
      turn: hasRelay(),
      ownTurn: !!turnFromStore(),
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
    STUN, prefetchIce, iceServers, hasRelay,
  };
})();
