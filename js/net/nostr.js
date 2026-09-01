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
  // used verbatim — Trystero prefixes wss:// only onto ITS defaults, so a
  // ws://127.0.0.1 fixture works through here and nowhere else.
  // A STORED OVERRIDE MUST NOT BE ABLE TO BRICK THE FEATURE, and until now it
  // could: the list was handed to Trystero verbatim if it merely PARSED as a
  // non-empty array. Trystero then does `new WebSocket(url)` on each entry, and
  // a malformed one throws SyntaxError — "The string did not match the
  // expected pattern" — out of joinRoom, which our catch reported as "could
  // not reach the room service". A device could be left permanently unable to
  // use room codes by one bad localStorage write, while the invite link (which
  // touches no relay) kept working and hid it.
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
   * derived from the room code (NetRendezvous.seal/open) and the topic is a
   * hash of it — the same guarantee Trystero's `password` gave us, now applied
   * where we can see it. Offers and answers use SEPARATE topics, so neither
   * side ever reads its own message back.
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
    const mineTopic  = await roomId(code + (hosting ? "|offer" : "|answer"));
    const theirTopic = await roomId(code + (hosting ? "|answer" : "|offer"));

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
        for (const w of sockets) { try { w.close(); } catch (e) {} }
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
        if (onFail) { try { onFail(r); } catch (e) {} }
      };

      const publish = async (text) => {
        if (!text) return;
        let frame;
        try {
          const sealed = await NetRendezvous.seal(code, text);
          let bin = "";
          for (let i = 0; i < sealed.length; i++) bin += String.fromCharCode(sealed[i]);
          frame = await mod.createEvent(mineTopic, btoa(bin));
          try {
            const parsed = JSON.parse(frame);
            if (parsed[1] && parsed[1].id) {
              pubIds.add(parsed[1].id);
              if (pubIds.size > 64) pubIds.delete(pubIds.values().next().value);
            }
          } catch (e) { /* non-fatal — OK tracking just won't fire */ }
        } catch (e) { return; }
        for (const w of sockets) { if (w.readyState === 1) { try { w.send(frame); } catch (e) {} } }
      };

      const heard = async (b64) => {
        let text = null;
        try {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          text = await NetRendezvous.open(code, bytes);
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
        else if (onTick) { try { onTick(); } catch (e) {} }
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
          try { w.send(mod.subscribe(subId, theirTopic)); } catch (e) {}
          if (current) publish(current);
        };
        w.onmessage = (ev) => {
          const frame = readRelayFrame(ev.data);
          if (frame.close) { try { w.close(); } catch (e) {} return; }
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
            try { w.close(); } catch (e) {}
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
        } catch (e) {}
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

  async function exchange(opts) {
    let legacy = false;
    try { legacy = localStorage.getItem("apex26.nostrTrystero") === "true"; } catch (e) {}
    if (!legacy) return directExchange(opts);
    Log.info("net", "nostr start");
    const { code, send, reply, token, onTick, mintOffer, onJoiner, onFail } = opts;
    if (!available()) {
      return nostrLog({ ok: false, error: "unsupported",
               message: "This browser cannot reach the room service." });
    }
    let mod;
    try { mod = await load(); }
    catch (e) {
      // Carry the ACTUAL failure. "Could not load the room service" on its own
      // is unreportable — it cannot distinguish a 404 from a MIME rejection
      // from a blocked network, and those need completely different fixes.
      // Reported from a real device, and the message left nothing to go on:
      // the truth was a plain 404, because the deploy workflow never staged
      // vendor/. Naming the exception would have pointed straight at it.
      const why = (e && (e.message || String(e))) || "unknown";
      return nostrLog({ ok: false, error: "no_module", detail: why,
               message: "Could not load the room service (" + why.slice(0, 90) + ")."
                      + " Use the invite link or QR instead." });
    }

    let room = null;
    const leave = () => { if (room) { try { room.leave(); } catch (e) {} room = null; } };

    return new Promise((resolve) => {
      let rotate = null;       // swap the offer on the table for a fresh one
      let rebroadcast = null;  // the repeating re-post of the offer on the table
      let done = false;        // torn down: room left, nothing more can happen
      let settled = false;     // the promise has been answered
      // SUBSCRIPTION MODE RESOLVES EARLY and the room stays open, so "answered"
      // and "finished" stopped being the same event. Conflating them switched
      // off every failure detector below — the relay-health probe and the join
      // timeout both bail on `done` — so a host whose relays were all dead was
      // told nothing and sat on a spinner forever. Reported from a real
      // console: damus rate-limiting and nos.social timing out, with the page
      // showing no error at all.
      // WHICH RELAYS ARE REFUSING US, which is otherwise unknowable.
      //
      // A Nostr relay that dislikes our traffic answers NIP-01
      // ["OK", id, false, "blocked: spam not permitted"] — and Trystero turns
      // that into a console.warn and nothing else (nostr/index.js): no retry,
      // no backoff, the relay is not dropped, and no callback, event or return
      // value reaches us. Meanwhile getRelaySockets() still reports the socket
      // OPEN, because it is: the WebSocket handshake succeeded, it is the
      // EVENTS that are being thrown away. So the health probe below passes,
      // the host waits the full two minutes, and reports "nobody joined" —
      // when the truth was knowable in five seconds and is something else
      // entirely.
      //
      // That is exactly what happened on a real phone: every relay live,
      // wellorder answering "blocked: spam not permitted", and both players
      // staring at spinners. Trystero announces once per relay every ~5.3 s
      // plus an event per ICE candidate, which is what reads as spam.
      //
      // Intercepting console.warn is not elegant. It is the ONLY seam the
      // vendored library offers, it is scoped to this exchange and restored in
      // finish(), and the alternative is shipping a feature whose failure mode
      // is a silent two-minute wait. Everything is guarded: if the shape of
      // that warning ever changes we simply learn nothing, exactly as today.
      const rejectedBy = new Set();
      const warnRe = /relay failure from (\S+?)\/?\s*-\s*(.*)$/i;
      const realWarn = (typeof console !== "undefined" && console.warn) || null;
      if (realWarn) {
        console.warn = function (...args) {
          try {
            const first = args.length ? String(args[0]) : "";
            const m = first.match(warnRe);
            // "blocked", "rate-limited", "restricted", "not permitted" — a
            // refusal. A transport hiccup is not, and must not be counted, or
            // a flapping relay would be reported as a policy rejection.
            if (m && /block|spam|rate|restrict|not permitted|invalid|reject|pow|proof.of.work/i.test(m[2] || "")) {
              rejectedBy.add(m[1]);
            }
          } catch (e) { /* never let diagnostics break the caller */ }
          return realWarn.apply(console, args);
        };
      }
      const restoreWarn = () => { if (realWarn) console.warn = realWarn; };

      // CARRY THE ACTUAL FAILURE. This file already learned that lesson once,
      // for the dynamic import — "Could not load the room service" on its own
      // could not distinguish a 404 from a MIME rejection from a blocked
      // network, and the truth turned out to be a plain 404 because the deploy
      // workflow never staged vendor/.
      //
      // The very next catch threw its exception away anyway, and it cost
      // hours: on real hardware, hosting a room returned a bare
      // {error:"relay"} while a raw joinRoom() in the same console worked
      // perfectly. "Could not reach the room service" was actively
      // misleading — the relays were reachable, six of them, and something in
      // OUR setup was throwing. Naming it would have pointed straight at it.
      const relayFail = (e) => {
        const why = (e && (e.message || String(e))) || "unknown";
        // The stack too. A message alone said "The string did not match the
        // expected pattern" — Safari's SyntaxError — while every individual
        // step of this setup, run by hand in the same console, succeeded. A
        // message names WHAT; only the stack names WHERE, and without it the
        // only method left is elimination, which took several rounds and did
        // not converge.
        const where = (e && e.stack) ? String(e.stack).split("\n").slice(0, 4).join(" | ") : "";
        return { ok: false, error: "relay", detail: why, stack: where,
                 message: "Could not reach the room service (" + why.slice(0, 90) + ")."
                        + " Use the invite link instead." };
      };

      const timers = [];
      const later = (fn, ms) => timers.push(setTimeout(fn, ms));
      const finish = (r) => {
        if (done) return;
        done = true;
        clearInterval(tick);
        clearInterval(rebroadcast);
        for (const id of timers) clearTimeout(id);
        timers.length = 0;
        restoreWarn();
        leave();
        nostrLog(r);
        if (!settled) { settled = true; resolve(r); return; }
        if (onFail) { try { onFail(r); } catch (e) {} }
      };

      const tick = setInterval(() => {
        if (token && token.cancelled) finish({ ok: false, error: "cancelled", message: "" });
        else if (onTick) { try { onTick(); } catch (e) {} }
      }, 1000);

      later(() => finish({ ok: false, error: "expired",
        message: "Nobody joined that code. Codes only last a couple of minutes." }),
        JOIN_TIMEOUT_MS);

      // "No relay would talk to us" and "nobody joined" are different answers
      // and deserve different waits. Without this check, a player with every
      // relay blocked — a captive portal, a corporate proxy, an offline
      // laptop — stares at "waiting for them to join" for two full minutes
      // before being told something that was knowable in five seconds.
      later(() => {
        if (done || !room) return;
        let live = 0;
        try {
          const sockets = mod.getRelaySockets ? mod.getRelaySockets() : {};
          live = Object.values(sockets).filter((s) => s && s.readyState === 1).length;
        } catch (e) { live = 0; }
        if (!live) {
          finish({ ok: false, error: "no_relay",
            message: "Could not reach any room service — this network may be blocking it."
                   + " Use the invite link or QR instead." });
          return;
        }
        // CONNECTED AND REFUSED is a third state, and the one that actually
        // happens. Reported only when EVERY live relay has rejected us: one
        // fussy relay out of six is survivable and must not scare anybody off
        // a working room.
        if (rejectedBy.size >= live) {
          // TELL, DO NOT TEAR DOWN. finish() leaves the Trystero room, and the
          // room is the only route the guest's answer has home — so reporting
          // a rejection by ending the rendezvous would DESTROY a handshake
          // that was still perfectly capable of completing. Rejections are
          // survivable and demonstrably so: room codes work on hardware where
          // one relay of six answers "blocked: spam not permitted" throughout.
          // This is advisory, and the room keeps running.
          if (onFail) {
            try {
              onFail({ ok: false, error: "all_rejected", advisory: true,
                message: "Every room relay is refusing this code. It may still connect —"
                       + " if it does not, use the invite link or QR, which need no"
                       + " third party." });
            } catch (e) {}
          }
        }
      }, RELAY_CHECK_MS);

      try {
        roomId(code).then((id) => {
          if (done) return;
          room = mod.joinRoom(Object.assign(
            { appId: APP_ID, password: code },
            relayUrls() ? { relayConfig: { urls: relayUrls() } } : null,
          ), id);
          // Trystero 0.25 returns an OBJECT from makeAction, not the [send,
          // receive] tuple older versions did, and its onMessage is a setter
          // like onPeerJoin. Both mistakes throw into the catch below and come
          // back as "could not reach the room service" — a bug wearing a
          // network failure's clothes. tests/unit/net-trystero-api.test.mjs pins
          // both shapes against the vendored source.
          const swap = room.makeAction("swap");
          const post = (data, to) => (to ? swap.send(data, { target: to }) : swap.send(data));
          const handling = new Set();

          swap.onMessage = (async (data, ctx) => {
            const from = (ctx && ctx.peerId) || null;
            if (done) return;
            if (typeof data !== "string" || !data) return;
            if (onJoiner) { Promise.resolve().then(() => onJoiner(from, data)).catch(() => {}); return; }
            if (handling.has(from)) return;
            if (!reply) { finish({ ok: true, payload: data }); return; }
            handling.add(from);
            let out;
            try { out = await reply(data); }
            catch (e) { out = null; }
            if (done) return;
            if (!out) {
              finish({ ok: false, error: "reply_failed",
                       message: "Could not answer that invite." });
              return;
            }
            // THE ANSWER IS THE FRAGILE HALF, and it was being sent once, to a
            // peer id captured up to EIGHT SECONDS EARLIER.
            //
            // reply() is a full ICE gather — GATHER_TIMEOUT_MS is 8000 — so by
            // the time there is an answer to send, the Trystero peer that
            // delivered the offer may be gone: a relay reconnect, a peer
            // re-announce, and the id we are targeting no longer resolves.
            // Trystero's response to that is console.warn("no peer with id …
            // found") and DROPPING THE MESSAGE. Nothing throws, nothing
            // returns false, and the host waits out its full two minutes on
            // "Waiting for them to join…" — which is exactly what a real pair
            // of devices showed: the guest reached "Connecting…" (so the offer
            // arrived) while the host never left "Waiting" (so the answer
            // never did). Every symptom downstream — both peers deaf, no
            // candidate pair ever answered — follows from the host simply
            // never having started.
            //
            // So: targeted AND untargeted, repeatedly, for a few seconds.
            // Untargeted reaches whoever is actually in the room when the id
            // has gone stale; repeating covers a reconnect in flight. The host
            // dedupes on the answer string itself (answersSeen), so extra
            // copies cost one comparison each.
            const shout = () => {
              try { post(out, from); } catch (e) {}
              try { post(out); } catch (e) {}
            };
            shout();
            let tries = 0;
            const resend = setInterval(() => {
              if (done || ++tries > 4) { clearInterval(resend); return; }
              shout();
            }, 1200);
            later(() => { clearInterval(resend); finish({ ok: true, payload: data }); }, 6500);
          });

          // Post on join AND immediately: whoever is already in the room gets
          // it now, whoever arrives later gets it then. Without the join hook
          // the second peer never sees the first one's string.
          //
          // onPeerJoin is a SETTER, not a method — Trystero 0.25 changed it,
          // and calling it threw an exception this file's own catch turned into
          // a generic "could not reach the room service". A wrong API used
          // inside a try/catch does not look like a bug, it looks like the
          // network being down.
          if (mintOffer || onJoiner) {
            let current = send || null;
            // NOTE — DO NOT "refresh a stale offer" HERE. Build 975 tried it:
            // a joiner arriving more than 25 s after the offer was gathered
            // got a freshly minted one, on the theory that a phone's NAT
            // mappings die during the walk to the other machine. It is a real
            // problem and this is the wrong place to fix it, because the
            // lobby's mintOffer calls newTransport(), which REPLACES the
            // pending RTCPeerConnection. The offer was already broadcast to
            // the room the moment it opened, so the guest is by then answering
            // the ORIGINAL — and that answer comes back to a connection that
            // has just been thrown away. The symptom is a permanent
            // "Connecting…" on the same Wi-Fi, where ICE could not possibly be
            // at fault. Refreshing offers needs an offer -> transport map, not
            // a timer.
            const put = (to) => { if (current) { try { post(current, to); } catch (e) {} } };
            if (!current && mintOffer) {
              Promise.resolve(mintOffer(null)).then((o) => { if (!done && o) { current = o; put(); } }).catch(() => {});
            } else {
              put();
            }
            room.onPeerJoin = (id) => { if (!done) put(id); };
            // A cheap safety net for ONE narrow case, and — read this before
            // reasoning about it — NOT a fix for anything at the relay.
            //
            // WHAT THIS ACTUALLY DOES. post() is swap.send(), and a Trystero
            // action sends over the WEBRTC DATA CHANNEL to peers already in
            // peerMap (core/action-wire.js). It publishes no Nostr event
            // whatsoever. With nobody connected it is a silent no-op. So the
            // only thing this interval buys is covering a put() that raced its
            // data channel opening — worth the near-zero cost, worth nothing
            // more.
            //
            // WHAT IT DOES NOT DO, because build 977 shipped claiming it did:
            // it cannot help a guest that has not been discovered yet. Peer
            // discovery is Trystero's own announce, over the relay, and by the
            // time this timer can reach anyone that handshake has already
            // succeeded. A guest the host has never seen is unreachable by
            // definition here, and re-running this faster would only have
            // added load to a path already being refused for spam.
            //
            // The real failure that 977 mistook for this: public relays reject
            // Trystero's announce ("blocked: spam not permitted"), which is
            // console.warn-only inside the vendor and invisible to us. See the
            // rejection tracking above.
            rebroadcast = setInterval(() => { if (!done) put(); }, REPOST_MS);
            rotate = async (next) => {
              current = next || null;
              if (!current && mintOffer) {
                try { current = await mintOffer(null); } catch (e) { current = null; }
              }
              if (!done) put();
            };
          } else if (send) {
            // Post on join AND immediately: whoever is already in the room gets
            // it now, whoever arrives later gets it then. Without the join hook
            // the second peer never sees the first one's string.
            //
            // onPeerJoin is a SETTER, not a method — Trystero 0.25 changed it,
            // and calling it threw an exception this file's own catch turned
            // into a generic "could not reach the room service". A wrong API
            // used inside a try/catch does not look like a bug, it looks like
            // the network being down.
            room.onPeerJoin = () => { try { post(send); } catch (e) {} };
            try { post(send); } catch (e) {}
            // Same reasoning as the subscription branch above: the room has no
            // memory, so the offer must keep being said for as long as nobody
            // has taken it.
            rebroadcast = setInterval(() => {
              if (!done) { try { post(send); } catch (e) {} }
            }, REPOST_MS);
          }
          if (onJoiner && !settled) {
            settled = true;
            nostrLog({ ok: true, subscribed: true });
            resolve({
              ok: true, subscribed: true,
              rotate: (next) => (rotate ? rotate(next) : null),
              stop: () => finish({ ok: false, error: "stopped", message: "" }),
            });
          }
        }).catch((e) => finish(relayFail(e)));
      } catch (e) {
        finish(relayFail(e));
      }
    });
  }

  return { APP_ID, JOIN_TIMEOUT_MS, RELAY_CHECK_MS, available, roomId, exchange, directExchange, load,
    RELAYS, relayUrls, validRelay,
    MAX_CONTENT_CHARS, MAX_FRAME_CHARS, MAX_SEEN, MAX_SEEN_CHARS, MAX_HEARD_ACTIVE,
    readRelayFrame, createBoundedInbox };
})();
