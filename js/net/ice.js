/* NetIce — the STUN/TURN list NetTransport.rtc() gathers with.
   Peeled from NetTransport. create() is one cache: a harness that reloads
   transport.js to drop a memoised credential fetch gets a new one, and the
   public names stay on NetTransport (prefetchIce, iceServers, hasRelay, STUN).
   NetBytes is read at call time, so this file has no eval-time edge on it. */
"use strict";

const NetIce = (function () {
  function create() {
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
    // seen on real devices. Our traffic is ~2 KB/s per player and only relays
    // when a direct path fails.
    //
    // NO STATIC FREE RELAY. Open Relay's embeddable credentials
    // (openrelayproject/openrelayproject) are retired — Metered requires a
    // per-account API key and a credentials endpoint that RETURNS the iceServers
    // array. Measured from a real device, that static config gathers zero relay
    // candidates while STUN works, which is worse than shipping nothing,
    // because it looks like a relay exists and diagnosis chases the wrong thing.
    //
    // That is why no static CREDENTIALS ship — a credentials URL is only used
    // when an operator explicitly configures one. iceServers() merges every source it has:
    //   apex26.turnApi — your own credentials URL (Metered-style: returns
    //     {iceServers|iceServers:[…]} or a bare array), fetched by prefetchIce()
    //     when the lobby opens.
    //   apex26.turn — a single static server you run yourself, listed first.
    //   Two free no-account relays, appended LAST so anything
    //   you configured still wins — but OFF unless opted into, and the
    //   free-relays block below says why that is not timidity.
    // No TURN credential ships in the client. A browser-visible API key is
    // reusable by anyone who downloads the game and can exhaust the relay
    // account's quota. Operators can still provide their own short-lived
    // credentials endpoint through apex26.turnApi; the default is honest
    // STUN-only operation until one is configured.
    const TURN_API = "";

    // How long a credentials endpoint gets before we race without it. Short on
    // purpose: a relay improves the odds of connecting, and waiting for one is
    // never worth making the player stare at a lobby that has not opened.
    const FETCH_TIMEOUT_MS = 4000;
    // Metered (and typical TURN REST) vends expiring credentials — often ~1 h.
    // Refresh before that so a new RTCPeerConnection never gathers with a dead
    // username/credential. 55 min leaves a small skew margin under a 60 min TTL.
    const ICE_CRED_TTL_MS = 55 * 60 * 1000;

    let fetchedIce = null;
    let fetchedIceAt = 0;
    let fetchingIce = null;
    let activeTurnApi = null;
    let turnApiVersion = 0;
    function configuredTurnApi() {
      let url = null;
      try { url = localStorage.getItem("apex26.turnApi"); } catch (e) { /* storage blocked (private mode): stay STUN-only */ }
      return url || TURN_API;
    }
    function syncTurnApi() {
      const url = configuredTurnApi();
      if (url !== activeTurnApi) {
        // Credentials belong to their endpoint. A late answer from the previous
        // endpoint must not revive its relay after the setting changes.
        activeTurnApi = url;
        turnApiVersion++;
        fetchedIce = null;
        fetchedIceAt = 0;
        fetchingIce = null;
      }
      return url;
    }
    function iceCredFresh() {
      return !!(fetchedIce && (Date.now() - fetchedIceAt) < ICE_CRED_TTL_MS);
    }
    function prefetchIce() {
      const jobs = [derivedRelays()];
      const url = syncTurnApi();
      // Re-fetch when the previous answer is past ICE_CRED_TTL_MS (or never
      // landed). iceServers are fixed at RTCPeerConnection construction, so
      // stale credentials only hurt the NEXT gather — refresh before that.
      if (url && !iceCredFresh() && !fetchingIce) {
        const version = turnApiVersion;
        // Keep last-good fetchedIce while the refresh runs. Nulling it here made
        // iceServers() STUN-only mid-refresh, so a PC built in that window lost a
        // still-usable TURN. Replace only when a new list lands (or rtc() drops a
        // malformed cache). A failed refresh keeps the prior credentials.
        // BOUNDED. A credentials endpoint that never answers — captive portal,
        // dead DNS, a firewall that blackholes rather than refuses — must not
        // become an unbounded wait, because the lobby now awaits this before
        // building a connection. Abort rather than merely ignore, or the socket
        // lingers.
        const ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
        const bail = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) { /* already settled */ } }, FETCH_TIMEOUT_MS);
        fetchingIce = fetch(url, ctl ? { signal: ctl.signal } : undefined).then((r) => r.json()).then((body) => {
          const raw = Array.isArray(body) ? body : (body && (body.iceServers || body.ice_servers)) || null;
          // PER-ENTRY validation, not just "is an array". This list is
          // third-party and is spread straight into `new PC(cfg)`: one entry
          // without `urls` throws there, and the throw brick-walls every
          // connection attempt for as long as the fetch stays cached (55 min).
          // The two localStorage-sourced lists already validate per entry.
          const list = Array.isArray(raw) ? raw.filter((e) => e && e.urls) : null;
          if (version === turnApiVersion && Array.isArray(list) && list.length) {
            fetchedIce = list;
            fetchedIceAt = Date.now();
          }
          return fetchedIce;
        }).catch((err) => {
          // No relay is a NORMAL state and must not block the lobby (see below),
          // but docs/MULTIPLAYER.md documents prefetchIce() as the thing that has
          // to land before a connection is built — and when it does not, every wire dump
          // reads relay:0 while the relay is demonstrably alive. Retained so that
          // symptom has a cause attached to it. Last-good stays if we had one.
          Log.warn("net", "TURN credential fetch failed, gathering STUN-only:", err && err.message);
          return fetchedIce;
        }).finally(() => {
          clearTimeout(bail);
          if (version === turnApiVersion) fetchingIce = null;
        });
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
    const FREE_TURN = [
      { urls: "turn:freestun.net:3478", username: "free", credential: "free" },
    ];

    function freeTurnOn() {
      try { return localStorage.getItem("apex26.freeTurn") === "true"; }
      catch (e) { return false; }
    }

    // The derived username encodes its own 24h expiry (below); mirror
    // iceCredFresh()'s pattern so a tab left open past that re-derives instead
    // of racing with a credential coturn will by then reject.
    const DERIVED_TTL_MS = 23 * 60 * 60 * 1000;
    let derived = null;
    let derivedAt = 0;
    let deriving = null;
    let derivedWarned = false;
    function derivedFresh() {
      return !!(derived && (Date.now() - derivedAt) < DERIVED_TTL_MS);
    }
    function derivedRelays() {
      if (!freeTurnOn()) return Promise.resolve(null);
      if (derivedFresh()) return Promise.resolve(derived);
      if (deriving) return deriving;
      const sub = (typeof crypto !== "undefined" && crypto.subtle) ? crypto.subtle : null;
      if (!sub) return Promise.resolve(null);      // no WebCrypto: freestun only
      const username = String(Math.floor(Date.now() / 1000) + 86400);
      const enc = (s) => new TextEncoder().encode(s);
      deriving = sub.importKey("raw", enc(OPEN_RELAY_SECRET), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
        .then((key) => sub.sign("HMAC", key, enc(username)))
        .then((sig) => {
          const credential = NetBytes.bytesToB64(new Uint8Array(sig));
          derived = OPEN_RELAY_HOSTS.map((urls) => ({ urls, username, credential }));
          derivedAt = Date.now();
          return derived;
        })
        .catch((e) => {
          // Once per page: every join retries the derivation, and the cause does not change.
          if (!derivedWarned) { derivedWarned = true; Log.warn("net", "free-TURN credential derivation failed, relay-less ICE:", e && e.message); }
          return null;
        })
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

    // `stunOnly` leaves every fetched/derived relay out — the retry path in
    // NetTransport.rtc(), after a construction that a fetched entry made throw.
    function iceServers(opts, stunOnly) {
      syncTurnApi();
      if (opts.iceServers) return opts.iceServers;
      const list = [{ urls: STUN }];
      if (stunOnly) return list;
      const mine = turnFromStore();
      if (mine) list.push(mine);
      // Use last-good even while a TTL refresh is in flight (or briefly past
      // ICE_CRED_TTL_MS). iceCredFresh() gates the FETCH, not the merge — forcing
      // STUN-only mid-refresh dropped a still-usable TURN on the next PC.
      if (fetchedIce) list.push(...fetchedIce);
      // The free relays go LAST when opted in, and only ever add candidates.
      // ICE tries every pair it can form and keeps the best, so ordering by
      // INTENT — yours, then your operator's, then whatever is free — means a
      // free entry can never displace one that works.
      if (freeTurnOn()) {
        if (derivedFresh()) list.push(...derived);
        list.push(...FREE_TURN);
      }
      return list;
    }

    function hasRelay() {
      return iceServers({}).some((e) => {
        const urls = Array.isArray(e.urls) ? e.urls : [e.urls];
        return urls.some((u) => /^turns?:/i.test(u));
      });
    }

    // rtc() calls this when a fetched entry makes the constructor throw.
    // The next prefetch replaces the list; a retry in the same call is STUN-only.
    function dropFetched() {
      fetchedIce = null;
      fetchedIceAt = 0;
    }

    return { STUN, prefetchIce, iceServers, hasRelay, relayOnly, turnFromStore, dropFetched };
  }
  return { create };
})();
Object.freeze(NetIce);
