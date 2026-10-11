/* NetNostr — the room-code rendezvous, over public Nostr relays. WHY NOSTR AND NOT A PUBLIC MQTT BROKER. The first version of this used the free public MQTT broke… */
"use strict";

const NetNostr = (function () {
  // Guest join of a fake/missing code must fail in the lobby in ~8–15 s, not
  // sit on "Looking for that room…" for two minutes (#1061). The HOST keeps
  // the code advertised longer — a friend typing a six-letter code off another
  // screen takes tens of seconds, and lobby.js / INVITE ANOTHER reopen assume
  // ~120 s (HOST_TIMEOUT_MS). Sharing JOIN_TIMEOUT for both roles made live
  // hosts show "Nobody answered…" at 12 s while a late guest still joined
  // (apex-sha 3faf59d9 / build 14296). Not a relay event TTL.
  const JOIN_TIMEOUT_MS = 12000;
  const HOST_TIMEOUT_MS = 120000;
  const REPLY_TIMEOUT_MS = 20000;   // guest: offer found -> answer published (build + ICE gather)
  const RELAY_CHECK_MS = 6000;
  const REPOST_MS = 5000;
  const MAX_HANDSHAKE_CHARS = 512 * 1024;
  const MAX_CONTENT_CHARS = Math.ceil((MAX_HANDSHAKE_CHARS + 28) / 3) * 4;
  const MAX_FRAME_CHARS = MAX_CONTENT_CHARS + 8192;
  const MAX_SEEN = 64;
  const MAX_SEEN_CHARS = MAX_CONTENT_CHARS * 2;
  const MAX_HEARD_ACTIVE = 4;

  let modPromise = null;

  // One import, shared by every caller, and only ever on demand.
  function load() {
    if (!modPromise) {
      modPromise = import("@trystero-p2p/nostr").catch((e) => {
        modPromise = null;                    // let a later attempt retry
        throw e;
      });
    }
    return modPromise;
  }

  const available = () => typeof WebSocket !== "undefined";

  function nostrLog(r) {
    if (r && r.ok) Log.info("net", "nostr ok");
    else if (r && (r.error === "stopped" || r.error === "cancelled")) Log.info("net", "nostr " + r.error);
    else Log.warn("net", "nostr fail " + ((r && r.error) || "error"));
    return r;
  }

  // The topic must not be the code, NOR anything cheap to test a guessed code
  // against: topics are plaintext `x` tags on public relays, and a bare
  // SHA-256 of a ~30-bit code fell to brute force in minutes. The topic is
  // NetRendezvous.topic() — HKDF over the PBKDF2-stretched room key.

  /*
   * Meet in a room named by the code and trade one string for another.
   *
   * The two sides are NOT symmetric: the host can post its invite
   * immediately, but the guest cannot produce an answer until it has seen that
   * invite. So:
   *
   *   host   send: <invite>              resolves when the answer arrives
   *   guest  reply: offer => <answer>    resolves once its answer is posted,
   *                                      returning the offer it received
   *
   * `reply` may be async, because building an answer means setRemoteDescription
   * and a full ICE gather — seconds, not milliseconds.
   *
   * Returns {ok, payload} or a typed error. Never throws: this is the one part
   * of the game standing on somebody else's servers, and when they are down the
   * lobby has to fall back to the link, not break.
   */
  // OUR OWN RELAY LIST, not Trystero's.
  //
  // Its getRelays() picks a subset of its defaults DETERMINISTICALLY, from a
  // hash of the appId — so every player of this game draws the same handful,
  // for ever, and a bad draw is permanent. Ours was bad: measured from a real
  // browser, two of the four had dead DNS (koru.bitcointxoko.org,
  // relay02.lnfi.network), one timed out (communities.nos.social) and the
  // last answered 503 (relay.damus.io); no amount of retrying changes which
  // relays it asks.
  //
  // THE CRITERION IS NOT POPULARITY, it is whether a relay accepts events from
  // an UNKNOWN pubkey. Trystero signs with an ephemeral key generated per
  // session, so any relay gating on a web of trust, a paid account or a
  // whitelist rejects us permanently — offchain.pub answers "Policy violated
  // and pubkey is not in our web of trust", and no amount of retrying will
  // ever change that. A well-known relay is worth nothing here if it does not
  // take anonymous traffic, which is increasingly how the good ones survive
  // spam.
  //
  // Everything here is measured from a real browser, not chosen by
  // reputation; relay.nostr.band (handshake timeout) and offchain.pub
  // (web-of-trust gate) fail. Re-measured 2026-09-27 with
  // tools/net/nostr-probe.mjs (the only criterion that decides this: does the
  // relay OK an ephemeral kind-22222 event from an unknown pubkey?): nos.lol
  // (502) and relay.mostr.pub (301 on the WebSocket upgrade) fail;
  // relay.damus.io is back after its 503s.
  //
  // They will all rot eventually — free infrastructure does — which is why the
  // list is overridable at runtime and why room codes are the BACKUP way in.
  // The invite link and QR need no third party and must stay the way in.
  const RELAYS = [
    "wss://relay.primal.net",
    "wss://nostr.mom",
    "wss://relay.snort.social",
    "wss://nostr-pub.wellorder.net",
    "wss://relay.damus.io",
    "wss://nostr.bitcoiner.social",
    "wss://nostr.oxtr.dev",
  ];

  // localStorage apex26.nostrRelays = ["wss://…", …] overrides the list above,
  // used verbatim — no wss:// is prefixed, so a ws://127.0.0.1 fixture works
  // through here and nowhere else.
  // A STORED OVERRIDE MUST NOT BE ABLE TO BRICK THE FEATURE. A list that
  // merely PARSES as a non-empty array can still hold a malformed entry, and
  // `new WebSocket(url)` on one throws SyntaxError — "The string did not match
  // the expected pattern" — which reads as "could not reach the room service".
  // One bad localStorage write (a copy-pasted debugging line's "wss://…"
  // placeholder is valid JSON and an invalid URL) would leave a device
  // permanently unable to use room codes, while the invite link (which
  // touches no relay) keeps working and hides it.
  //
  // So each entry is checked, bad ones are dropped rather than poisoning the
  // batch, and an override with nothing usable left falls back to the shipped
  // list instead of leaving the player with no relays at all.
  function validRelay(u) {
    if (typeof u !== "string" || !u) return false;
    try {
      const p = new URL(u).protocol;
      return p === "ws:" || p === "wss:";
    } catch (e) { return false; }
  }

  function relayUrls() {
    try {
      const raw = localStorage.getItem("apex26.nostrRelays");
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const good = list.filter(validRelay);
          if (good.length) return good;
        }
      }
    } catch (e) { /* fall through to the shipped list */ }
    return RELAYS;
  }

  // Parse only bounded text. NIP-01 frames are JSON strings; coercing a Blob or
  // an arbitrary object with String() can allocate before we have measured it.
  function readRelayFrame(data) {
    if (typeof data !== "string" || data.length > MAX_FRAME_CHARS) {
      return { close: true, message: null };
    }
    try { return { close: false, message: JSON.parse(data) }; }
    catch (e) { return { close: false, message: null }; }
  }

  function createBoundedInbox(consume) {
    const seen = new Set();
    let seenChars = 0, active = 0, failed = 0;
    const remember = (content) => {
      seen.add(content);
      seenChars += content.length;
      while (seen.size > MAX_SEEN || seenChars > MAX_SEEN_CHARS) {
        const oldest = seen.values().next().value;
        if (oldest == null) break;
        seen.delete(oldest);
        seenChars -= oldest.length;
      }
    };
    // Verdicts: true = handled (new or duplicate), "busy" = over the decrypt
    // cap — DROP the message but keep the socket (a relay replaying history in
    // a burst must not cost us every connection mid-handshake), false =
    // poison (non-string / empty / oversize) — the caller closes that relay.
    const accept = (content) => {
      if (typeof content !== "string" || !content || content.length > MAX_CONTENT_CHARS) return false;
      if (seen.has(content)) return true;
      if (active >= MAX_HEARD_ACTIVE) return "busy";
      remember(content);
      active++;
      Promise.resolve().then(() => consume(content)).catch((e) => {
        // First failure per inbox only: a relay replaying history can repeat it per message.
        if (failed++ === 0) Log.warn("net", "nostr relay message handler failed:", e && e.message);
      }).finally(() => { active--; });
      return true;
    };
    return { accept, stats: () => ({ seen: seen.size, seenChars, active }) };
  }

  /*
   * DIRECT RELAY EXCHANGE — the relays as a message bus, and nothing else.
   *
   * WHY THIS REPLACED THE TRYSTERO ROOM. Trystero is a peer-to-peer library:
   * joinRoom() uses the relays to bootstrap its OWN RTCPeerConnection, and
   * makeAction().send() then travels over THAT data channel. So our invite and
   * answer were riding a WebRTC connection in order to establish a WebRTC
   * connection — and the first one dies exactly when the second one starts.
   *
   * Measured, on real hardware, repeatedly: the offer reaches the guest (the
   * Trystero link is alive at that moment), the guest builds an answer, and
   * every attempt to send it back — targeted AND untargeted, retried for six
   * seconds — returns "Trystero: no peer with id … found". The room is empty.
   * The host then waits out its full two minutes on "Waiting for them to
   * join…" without ever starting ICE, which is why both peers looked deaf with
   * checks sent and nothing answering: nobody was there to answer.
   *
   * We never needed the peer connection. Two strings have to cross, once each,
   * and a relay is already a perfectly good place to leave a string. So this
   * publishes and subscribes DIRECTLY over our own WebSockets, using
   * Trystero's own framing helpers (createEvent/subscribe) so the events are
   * well-formed Nostr and the vendored signing is reused rather than
   * reimplemented.
   *
   * WHAT THE RELAYS SEE. The payload is sealed with AES-GCM under a key
   * derived from the room code (NetRendezvous.seal/open, v2 envelope: random
   * salt, slot name as AAD) and the topic is HKDF'd from the same stretched key. Offers and answers
   * use SEPARATE topics, so neither side ever reads its own message back.
   */
  async function directExchange(opts) {
    const { code, send, reply, token, onTick, mintOffer, onJoiner, onFail } = opts;
    Log.info("net", "nostr start");
    if (!available()) {
      return nostrLog({ ok: false, error: "unsupported",
               message: "This browser cannot reach the room service." });
    }
    let mod;
    try { mod = await load(); }
    catch (e) {
      const why = (e && (e.message || String(e))) || "unknown";
      return nostrLog({ ok: false, error: "no_module", detail: why,
               message: "Could not load the room service (" + why.slice(0, 90) + ")."
                      + " Use the invite link or QR instead." });
    }

    const hosting = !reply;
    // The slot name is also the envelope's AAD (NetRendezvous.seal), so an
    // offer replayed onto the answer topic fails to open rather than being
    // mistaken for one.
    const mineSlot = hosting ? "offer" : "answer";
    const theirSlot = hosting ? "answer" : "offer";
    let mineTopic, theirTopic;
    try {
      mineTopic  = await NetRendezvous.topic(code, mineSlot);
      theirTopic = await NetRendezvous.topic(code, theirSlot);
    } catch (e) {
      return nostrLog({ ok: false, error: "crypto",
               message: "This browser could not protect the room code. Use the invite link instead." });
    }

    const sockets = [];
    const socketUrl = new Map();
    let current = send || null;
    const rejectedBy = new Set();
    // Every event id WE signed (bounded): each publish() — the 5 s repost, the
    // per-socket re-send on open — signs a NEW id, so tracking only the last
    // one made most OK=false replies invisible and a refusing relay silent.
    const pubIds = new Set();
    let subId = null;          // our REQ id, so a NIP-01 CLOSED for it is recognised
    let advisedRejected = false;

    return new Promise((resolve) => {
      let done = false, settled = false;
      const shut = () => {
        for (const w of sockets) { try { w.close(); } catch (e) { /* already closing */ } }
        sockets.length = 0;
        if (unlisten) { unlisten(); unlisten = null; }
      };
      // Every deadline goes through later() so finish() can reclaim it — an
      // orphaned host-timeout timer otherwise retains this whole closure
      // (sockets, module, payloads) long after the exchange settled.
      const timers = [];
      const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
      let unlisten = null;   // the visibility listener's teardown (set once the sockets exist)
      let again = null;   // the reply's re-publish interval (heard, below)
      let expireTimer = null;
      const clearExpire = () => {
        if (expireTimer == null) return;
        clearTimeout(expireTimer);
        const i = timers.indexOf(expireTimer);
        if (i >= 0) timers.splice(i, 1);
        expireTimer = null;
      };
      const finish = (r) => {
        if (done) return;
        done = true;
        clearInterval(tick); clearInterval(repost); clearInterval(again);
        for (const id of timers) clearTimeout(id);
        timers.length = 0;
        expireTimer = null;
        shut();
        nostrLog(r);
        if (!settled) { settled = true; resolve(r); return; }
        if (onFail) { try { onFail(r); } catch (e) { /* a caller bug must not re-throw into finish() */ } }
      };

      const publish = async (text) => {
        if (!text) return;
        let frame;
        try {
          const sealed = await NetRendezvous.seal(code, text, mineSlot);
          frame = await mod.createEvent(mineTopic, NetBytes.bytesToB64(sealed));
          try {
            const parsed = JSON.parse(frame);
            if (parsed[1] && parsed[1].id) {
              pubIds.add(parsed[1].id);
              if (pubIds.size > 64) pubIds.delete(pubIds.values().next().value);
            }
          } catch (e) { /* non-fatal — OK tracking just won't fire */ }
        } catch (e) { return; }
        for (const w of sockets) { if (w.readyState === 1) { try { w.send(frame); } catch (e) { /* socket died between the readyState check and send */ } } }
      };

      const heard = async (b64) => {
        let text = null;
        try {
          text = await NetRendezvous.open(code, NetBytes.b64ToBytes(b64), theirSlot);
        } catch (e) { text = null; }
        if (!text || done) return;                 // not ours, or too late

        if (hosting) {
          // An answer. Hand it over; the room stays open for more joiners.
          if (onJoiner) {
            Promise.resolve().then(() => onJoiner(null, text))
              .catch((e) => { Log.warn("net", "nostr joiner answer handler failed:", e && e.message); });
            return;
          }
          finish({ ok: true, payload: text });
          return;
        }
        // An offer, and we are the replying side.
        if (answering) return;
        answering = true;
        // The 12 s JOIN window is for FINDING the offer (host re-posts every
        // 5 s). Left running it also covered build-answer + ICE gather (up to
        // 8 s with STUN blocked): a late offer lost the race, finish(expired)
        // ran and this returned without publishing. Found it: reply gets its
        // own deadline.
        clearExpire();
        const replyTimer = later(expire, REPLY_TIMEOUT_MS);
        let out = null;
        try { out = await reply(text); } catch (e) { out = null; }
        if (done) return;
        if (!out) {
          answering = false;
          finish({ ok: false, error: "reply_failed", message: "Could not answer that invite." });
          return;
        }
        await publish(out);
        // Answer is on the wire: do not let any deadline kill the exchange
        // during the 5.2 s re-post window (a late find + answer used to land
        // past 12 s and codeJoin printed "Nobody answered…" while connected).
        clearExpire();
        clearTimeout(replyTimer);
        // Publish it a few more times before leaving: a relay that dropped the
        // first copy must not cost the whole handshake, and this is cheap.
        let n = 0;
        again = setInterval(async () => {
          if (done || ++n > 3) { clearInterval(again); return; }
          await publish(out);
        }, 1200);
        later(() => { clearInterval(again); finish({ ok: true, payload: text }); }, 5200);
      };
      let answering = false;
      const expire = () => finish({ ok: false, error: "expired",
        // Also what a build on another NetRendezvous.PROTOCOL sees: its topics
        // differ, so the two never meet — say what fixes that too. Lobby
        // codeJoin already surfaces why.message; keep this actionable.
        message: "Nobody answered that code. Check the six characters, or ask "
               + "your friend for a fresh one — if it keeps happening, both "
               + "reload the game and try a new code." });
      const inbox = createBoundedInbox(heard);

      // Guest: once answering, stop the looking tick — lobby onTick used to
      // overwrite Connected during the 5.2 s answer re-post (build 14296).
      // Host keeps ticking ("Waiting for them…") for the whole host window.
      const tick = setInterval(() => {
        if (token && token.cancelled) finish({ ok: false, error: "cancelled", message: "" });
        else if (onTick && !answering) {
          try { onTick(); } catch (e) { /* a caller bug must not stop the exchange */ }
        }
      }, 1000);

      const repost = setInterval(() => { if (!done && current) publish(current); }, REPOST_MS);

      expireTimer = later(expire, hosting ? HOST_TIMEOUT_MS : JOIN_TIMEOUT_MS);

      let opened = 0;
      // ONE SOCKET PER RELAY, REOPENED WHEN IT DIES. A phone host switches to
      // a messaging app to send the code; the browser suspends the page and
      // closes its WebSockets; nothing here ever reopened them, so the room
      // was deaf for the rest of its two minutes and the host was told
      // "Nobody joined" — for a socket that died, not a friend who did not
      // come. onclose reopens with backoff (onopen re-subscribes and
      // re-publishes), and a return to the foreground reopens at once.
      const RECONNECT_MS = [1000, 2000, 4000, 8000, 15000];
      const connect = (url, attempt) => {
        if (done) return;
        let w;
        try { w = new WebSocket(url); } catch (e) { return; }
        sockets.push(w);
        socketUrl.set(w, url);
        w.onopen = () => {
          opened++;
          if (!subId) subId = "s" + Math.floor(Date.now() % 1e6);
          try {
            // Trystero stamps the REQ with `since: now()` — THIS device's clock,
            // and a relay applies it to live events too, so a phone a few
            // minutes fast never heard an offer a correct host stamped. The
            // kind is ephemeral: nothing old can arrive, `since` filters
            // nothing but our friend.
            const req = JSON.parse(mod.subscribe(subId, theirTopic));
            if (req[2]) delete req[2].since;
            w.send(JSON.stringify(req));
          } catch (e) { /* socket died between open and send */ }
          if (current) publish(current);
        };
        w.onclose = () => {
          const i = sockets.indexOf(w);
          if (i >= 0) sockets.splice(i, 1);
          socketUrl.delete(w);
          if (done) return;
          const n = Math.min(attempt, RECONNECT_MS.length - 1);
          later(() => { if (!done && !sockets.some((s) => socketUrl.get(s) === url)) connect(url, attempt + 1); }, RECONNECT_MS[n]);
        };
        w.onmessage = (ev) => {
          const frame = readRelayFrame(ev.data);
          if (frame.close) { try { w.close(); } catch (e) { /* already closing */ } return; }
          const m = frame.message;
          // Array.isArray, not a bare index: JSON.parse("null") succeeds INSIDE
          // the try and `null[0]` then threw out of the handler — past the
          // module's "never throws" promise and onto index.html's window error
          // listener, which paints a full-screen error overlay over the lobby.
          // NIP-01 frames are arrays anyway, so this is also the shape check.
          if (!Array.isArray(m)) return;
          if (m[0] === "OK" || m[0] === "CLOSED") {
            const who = socketUrl.get(w) || String(opened);
            // OK=false on one of OUR events is a refusal whatever the wording
            // (only "duplicate:" is benign — it means the relay HAS it), and a
            // CLOSED for our REQ means we will never hear the other side here.
            const refused =
              (m[0] === "OK" && pubIds.has(m[1]) && m[2] === false && !/^duplicate:/i.test(String(m[3] || ""))) ||
              (m[0] === "CLOSED" && subId && m[1] === subId);
            if (refused) { rejectedBy.add(who); maybeAdviseRejected(); }
            return;
          }
          if (m[0] === "EVENT" && m[2] && typeof m[2].content === "string" &&
              inbox.accept(m[2].content) === false) {
            try { w.close(); } catch (e) { /* already closing */ }
          }
        };
        w.onerror = () => {};
      };
      for (const url of relayUrls()) connect(url, 0);
      const onVisible = () => {
        if (done || typeof document === "undefined" || document.hidden) return;
        for (const url of relayUrls()) if (!sockets.some((s) => socketUrl.get(s) === url)) connect(url, 0);
      };
      if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", onVisible);
      unlisten = () => { try { if (typeof document !== "undefined" && document.removeEventListener) document.removeEventListener("visibilitychange", onVisible); } catch (e) { /* no document */ } };

      // "Every live relay refused us" — advisory, once. Evaluated on every
      // refusal AND at RELAY_CHECK_MS: the one-shot check alone ran at 6 s,
      // before a replying guest had published anything, so a guest whose
      // answer every relay blocked was never told.
      const maybeAdviseRejected = () => {
        if (done || advisedRejected || !onFail) return;
        const live = sockets.filter((w) => w.readyState === 1).length;
        if (!live || rejectedBy.size < live) return;
        advisedRejected = true;
        try {
          onFail({ ok: false, error: "all_rejected", advisory: true,
            message: "Every room relay is refusing this code. It may still connect —"
                   + " if it does not, use the invite link or QR, which need no"
                   + " third party." });
        } catch (e) { /* a caller bug must not re-enter this advisory path */ }
      };
      later(maybeAdviseRejected, RELAY_CHECK_MS);

      // Nothing to publish yet? Mint it now rather than waiting for an arrival.
      if (!current && mintOffer) {
        Promise.resolve(mintOffer(null)).then((o) => {
          if (!done && o) { current = o; publish(o); }
        }).catch((e) => { Log.warn("net", "nostr offer mint failed, room has nothing to publish:", e && e.message); });
      }

      later(() => {
        if (done) return;
        if (!sockets.some((w) => w.readyState === 1)) {
          finish({ ok: false, error: "no_relay",
            message: "Could not reach any room service — this network may be blocking it."
                   + " Use the invite link or QR instead." });
        }
      }, RELAY_CHECK_MS);

      if (onJoiner && !settled) {
        settled = true;
        nostrLog({ ok: true, subscribed: true });
        resolve({
          ok: true, subscribed: true,
          rotate: (next) => {
            current = next || null;
            if (!current && mintOffer) {
              return Promise.resolve(mintOffer(null)).then((o) => {
                if (!done && o) { current = o; return publish(o); }
              }).catch((e) => { Log.warn("net", "nostr offer re-mint on rotate failed:", e && e.message); });
            }
            return publish(current);
          },
          stop: () => finish({ ok: false, error: "stopped", message: "" }),
        });
      }
    });
  }

  // exchange() IS directExchange(), not a full Trystero room join (joinRoom /
  // makeAction / onPeerJoin): that carries the answer over Trystero's OWN
  // RTCPeerConnection, which dies exactly when ours starts (measured, see the
  // directExchange header). Nothing in the vendored tree beyond
  // createEvent/subscribe is reached.
  const exchange = directExchange;

  return { JOIN_TIMEOUT_MS, HOST_TIMEOUT_MS, RELAY_CHECK_MS, available, exchange, directExchange, load,
    RELAYS, relayUrls, validRelay,
    MAX_CONTENT_CHARS, MAX_FRAME_CHARS, MAX_SEEN, MAX_SEEN_CHARS, MAX_HEARD_ACTIVE,
    readRelayFrame, createBoundedInbox };
})();
Object.freeze(NetNostr);
