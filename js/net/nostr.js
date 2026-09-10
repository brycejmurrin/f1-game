/* NetNostr — the room-code rendezvous, over public Nostr relays. WHY NOSTR AND NOT A PUBLIC MQTT BROKER. The first version of this used the free public MQTT broke… */
"use strict";

const NetNostr = (function () {
  const APP_ID = "apex26-vs";

  const JOIN_TIMEOUT_MS = 120000;
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

  // The room id must not be the code: room ids are visible to relays, and a
  // room id that contained the code would hand the codes out. Hash it, and use
  // a different salt from the topic hash elsewhere so the two cannot be
  // correlated.
  async function roomId(code) {
    const bytes = new TextEncoder().encode("room|" + code);
    const h = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(h).slice(0, 10)]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /*
   * Meet in a room named by the code and trade one string for another.
   *
   * The two sides are NOT symmetric, and pretending they were is what made the
   * first attempt at this wrong: the host can post its invite immediately, but
   * the guest cannot produce an answer until it has seen that invite. So:
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
  // for ever. A bad draw is not intermittent, it is permanent, and ours was
  // bad: measured from a real browser, two of the four had dead DNS
  // (koru.bitcointxoko.org, relay02.lnfi.network), one timed out
  // (communities.nos.social) and the last answered 503 (relay.damus.io). The
  // room-code path could not work for anybody, and no amount of retrying was
  // going to change which relays it asked.
  //
  // These are picked for being long-lived and widely used. They will also rot
  // — that is the nature of free infrastructure — which is why the list is
  // overridable at runtime and why room codes are the BACKUP path: the invite
  // link and QR need no third party at all and must stay the way in.
  // THE CRITERION IS NOT POPULARITY, it is whether a relay accepts events from
  // an UNKNOWN pubkey. Trystero signs with an ephemeral key generated per
  // session, so any relay gating on a web of trust, a paid account or a
  // whitelist rejects us permanently — offchain.pub answers "Policy violated
  // and pubkey is not in our web of trust", and no amount of retrying will
  // ever change that. A well-known relay is worth nothing here if it does not
  // take anonymous traffic, which is increasingly how the good ones survive
  // spam.
  //
  // Everything here was measured from a real browser, not chosen by
  // reputation. Removed after failing: relay.damus.io (503 repeatedly),
  // relay.nostr.band (handshake timeout), offchain.pub (web-of-trust gate),
  // and Trystero's own draw for this appId, two of which had dead DNS.
  //
  // They will all rot eventually — free infrastructure does — which is why the
  // list is overridable at runtime and why room codes are the BACKUP way in.
  // The invite link and QR need no third party and have worked throughout.
  const RELAYS = [
    "wss://nos.lol",
    "wss://relay.primal.net",
    "wss://nostr.mom",
    "wss://relay.snort.social",
    "wss://nostr-pub.wellorder.net",
    "wss://relay.mostr.pub",
  ];

  // localStorage apex26.nostrRelays = ["wss://…", …] overrides the list above,
  // used verbatim — no wss:// is prefixed, so a ws://127.0.0.1 fixture works
  // through here and nowhere else.
  // A STORED OVERRIDE MUST NOT BE ABLE TO BRICK THE FEATURE, and until now it
  // could: the list was used verbatim if it merely PARSED as a non-empty
  // array. `new WebSocket(url)` on a malformed entry throws SyntaxError — "The
  // string did not match the expected pattern" — which the old catch reported
  // as "could not reach the room service". A device could be left permanently
  // unable to use room codes by one bad localStorage write, while the invite
  // link (which touches no relay) kept working and hid it.
  //
  // Not hypothetical: it happened here, from a copy-pasted debugging line whose
  // ellipsis placeholders — "wss://…" — are valid JSON and an invalid URL.
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
    let seenChars = 0, active = 0;
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
      Promise.resolve().then(() => consume(content)).catch(() => {}).finally(() => { active--; });
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
   * salt, slot name as AAD) and the topic is a hash of it. Offers and answers
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
    const mineTopic  = await roomId(code + "|" + mineSlot);
    const theirTopic = await roomId(code + "|" + theirSlot);

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
      };
      // Every deadline goes through later() so finish() can reclaim it — an
      // orphaned 2-min expiry timer otherwise retains this whole closure
      // (sockets, module, payloads) long after the exchange settled.
      const timers = [];
      const later = (fn, ms) => timers.push(setTimeout(fn, ms));
      const finish = (r) => {
        if (done) return;
        done = true;
        clearInterval(tick); clearInterval(repost);
        for (const id of timers) clearTimeout(id);
        timers.length = 0;
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
          if (onJoiner) { Promise.resolve().then(() => onJoiner(null, text)).catch(() => {}); return; }
          finish({ ok: true, payload: text });
          return;
        }
        // An offer, and we are the replying side.
        if (answering) return;
        answering = true;
        let out = null;
        try { out = await reply(text); } catch (e) { out = null; }
        if (done) return;
        if (!out) {
          answering = false;
          finish({ ok: false, error: "reply_failed", message: "Could not answer that invite." });
          return;
        }
        await publish(out);
        // Publish it a few more times before leaving: a relay that dropped the
        // first copy must not cost the whole handshake, and this is cheap.
        let n = 0;
        const again = setInterval(async () => {
          if (done || ++n > 3) { clearInterval(again); return; }
          await publish(out);
        }, 1200);
        later(() => { clearInterval(again); finish({ ok: true, payload: text }); }, 5200);
      };
      let answering = false;
      const inbox = createBoundedInbox(heard);

      const tick = setInterval(() => {
        if (token && token.cancelled) finish({ ok: false, error: "cancelled", message: "" });
        else if (onTick) { try { onTick(); } catch (e) { /* a caller bug must not stop the exchange */ } }
      }, 1000);

      const repost = setInterval(() => { if (!done && current) publish(current); }, REPOST_MS);

      later(() => finish({ ok: false, error: "expired",
        message: "Nobody joined that code. Codes only last a couple of minutes." }),
        JOIN_TIMEOUT_MS);

      let opened = 0;
      for (const url of relayUrls()) {
        let w;
        try { w = new WebSocket(url); } catch (e) { continue; }
        sockets.push(w);
        socketUrl.set(w, url);
        w.onopen = () => {
          opened++;
          if (!subId) subId = "s" + Math.floor(Date.now() % 1e6);
          try { w.send(mod.subscribe(subId, theirTopic)); } catch (e) { /* socket died between open and send */ }
          if (current) publish(current);
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
      }

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
        }).catch(() => {});
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
              }).catch(() => {});
            }
            return publish(current);
          },
          stop: () => finish({ ok: false, error: "stopped", message: "" }),
        });
      }
    });
  }

  // exchange() IS directExchange(). The full Trystero room join (joinRoom /
  // makeAction / onPeerJoin, behind localStorage apex26.nostrTrystero) was
  // deleted 2026-09-10: it carried the answer over Trystero's OWN
  // RTCPeerConnection, which died exactly when ours started (measured, see
  // the directExchange header), and its only diagnostic seam was a
  // console.warn interception. Nothing in the vendored tree beyond
  // createEvent/subscribe is reached any more.
  const exchange = directExchange;

  return { APP_ID, JOIN_TIMEOUT_MS, RELAY_CHECK_MS, available, roomId, exchange, directExchange, load,
    RELAYS, relayUrls, validRelay,
    MAX_CONTENT_CHARS, MAX_FRAME_CHARS, MAX_SEEN, MAX_SEEN_CHARS, MAX_HEARD_ACTIVE,
    readRelayFrame, createBoundedInbox };
})();
Object.freeze(NetNostr);
