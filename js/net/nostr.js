/*
 * NetNostr — the room-code rendezvous, over public Nostr relays.
 *
 * WHY NOSTR AND NOT A PUBLIC MQTT BROKER. The first version of this used the
 * free public MQTT brokers (EMQX, HiveMQ, Mosquitto). It worked, and it should
 * not have shipped: HiveMQ's terms say the broker "must not be used in
 * Production, Dev, Staging or UAT environments", and EMQX says the same. Those
 * are TEST brokers lent for learning the protocol, and pointing a game at them
 * is taking something that was not offered.
 *
 * Nostr relays are the opposite case. Accepting arbitrary signed events from
 * anonymous clients is what a relay is FOR — it is the protocol's entire
 * premise, not a courtesy being abused. The shipped RELAYS list below opens a
 * handful at once, so no single operator is load-bearing.
 *
 * HOW THE EXCHANGE ACTUALLY RUNS. The default path is directExchange(): our
 * OWN WebSockets straight to the relays, publishing and subscribing the two
 * invite/answer STRINGS and nothing else. The vendored Trystero module is
 * used only for its Nostr event framing and signing helpers (createEvent /
 * subscribe) — no Trystero room is opened. The race then runs over our own
 * RTCPeerConnection with its unreliable state channel, its reliable event
 * channel, and its TURN relay; everything downstream is untouched. The old
 * route — a full Trystero room, whose own WebRTC data channel carried the
 * strings — survives as the opt-in legacy branch in exchange(), behind
 * localStorage apex26.nostrTrystero; directExchange()'s header records why
 * it was replaced.
 *
 * WHAT THE RELAYS SEE. The payload is sealed with AES-GCM under a key derived
 * from the room code (NetRendezvous.seal/open), and the topics are hashes of
 * the code rather than the code itself — so a relay operator carries bytes it
 * cannot read, and someone watching the room namespace learns nothing. The
 * code is the secret: the same trust model as the invite code it replaces.
 * (On the legacy branch, Trystero's `password` option gives the equivalent
 * guarantee.)
 *
 * WHY IT IS LOADED LATE. Trystero is an ES module and ~170 KB with its schnorr
 * dependency. It is imported the first time somebody uses a room code and
 * never during boot, so a player who only ever shares a link pays nothing for
 * it. That also keeps it out of the IIFE load order entirely — it is reached
 * by dynamic import through the same importmap as vendored three.js.
 */
"use strict";

const NetNostr = (function () {
  const APP_ID = "apex26-vs";

  // A room is live, not a mailbox: unlike an MQTT retained message there is
  // nothing held for later, so the host stays in the room until the guest
  // arrives. That is what the lobby's "waiting for them to join" screen IS.
  const JOIN_TIMEOUT_MS = 120000;
  // How long to give the relays to answer at all before deciding the network,
  // rather than the other player, is the problem.
  const RELAY_CHECK_MS = 6000;
  // How often the host says its offer again while waiting. A Nostr room has no
  // memory — Trystero subscribes with `since: now()` and the events are
  // ephemeral — so anything said before a guest subscribed is unreachable to
  // it, for ever. Five seconds is slow enough not to look like spam to a relay
  // and fast enough that nobody notices the wait.
  const REPOST_MS = 5000;

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
    if (!available()) {
      return { ok: false, error: "unsupported",
               message: "This browser cannot reach the room service." };
    }
    let mod;
    try { mod = await load(); }
    catch (e) {
      const why = (e && (e.message || String(e))) || "unknown";
      return { ok: false, error: "no_module", detail: why,
               message: "Could not load the room service (" + why.slice(0, 90) + ")."
                      + " Use the invite link or QR instead." };
    }

    // WHICH SIDE ARE WE? The one that does NOT reply. `reply` is the guest's
    // whole definition (it cannot speak until it has seen the invite), so it is
    // the only reliable discriminator — and the header's two-party host, the one
    // that just passes `send` and waits for the answer, has no mintOffer and no
    // onJoiner. Classified off those two it came out `hosting === false`:
    // it published its invite on the "|answer" topic and listened on "|offer",
    // where the guest was also listening and nobody ever published. Both sides
    // then sat out the full JOIN_TIMEOUT_MS. Latent because the lobby's public
    // path always passes onJoiner and swap-as-host only runs on the private
    // relay — but it is the shape this module's own contract documents.
    const hosting = !reply;
    // The side we PUBLISH on and the side we LISTEN on. Separate, or a peer
    // reads its own publication straight back and answers itself.
    const mineTopic  = await roomId(code + (hosting ? "|offer" : "|answer"));
    const theirTopic = await roomId(code + (hosting ? "|answer" : "|offer"));

    const sockets = [];
    let current = send || null;
    const seen = new Set();

    return new Promise((resolve) => {
      let done = false, settled = false;
      const shut = () => {
        for (const w of sockets) { try { w.close(); } catch (e) {} }
        sockets.length = 0;
      };
      const finish = (r) => {
        if (done) return;
        done = true;
        clearInterval(tick); clearInterval(repost);
        shut();
        if (!settled) { settled = true; resolve(r); return; }
        if (onFail) { try { onFail(r); } catch (e) {} }
      };

      const publish = async (text) => {
        if (!text) return;
        let frame;
        try {
          const sealed = await NetRendezvous.seal(code, text);
          // base64 so it survives JSON, and short enough that a relay will
          // take it: an invite is ~240 chars packed.
          let bin = "";
          for (let i = 0; i < sealed.length; i++) bin += String.fromCharCode(sealed[i]);
          frame = await mod.createEvent(mineTopic, btoa(bin));
        } catch (e) { return; }
        for (const w of sockets) { if (w.readyState === 1) { try { w.send(frame); } catch (e) {} } }
      };

      const heard = async (b64) => {
        if (seen.has(b64)) return;
        seen.add(b64);
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
          // No onJoiner: this is the header's two-party host, which "resolves
          // when the answer arrives". Discarding it here left that caller
          // waiting out the timeout on an answer it had already been handed.
          finish({ ok: true, payload: text });
          return;
        }
        // An offer, and we are the replying side.
        if (seen.has("__answering")) return;
        seen.add("__answering");
        let out = null;
        try { out = await reply(text); } catch (e) { out = null; }
        if (done) return;
        if (!out) {
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
        setTimeout(() => { clearInterval(again); finish({ ok: true, payload: text }); }, 5200);
      };

      const tick = setInterval(() => {
        if (token && token.cancelled) finish({ ok: false, error: "cancelled", message: "" });
        else if (onTick) { try { onTick(); } catch (e) {} }
      }, 1000);

      // Say it again while nobody has taken it. A relay carries live events
      // only, so a peer that subscribes after we published hears nothing until
      // we publish again — this is what makes arriving late survivable.
      const repost = setInterval(() => { if (!done && current) publish(current); }, REPOST_MS);

      setTimeout(() => finish({ ok: false, error: "expired",
        message: "Nobody joined that code. Codes only last a couple of minutes." }),
        JOIN_TIMEOUT_MS);

      let opened = 0;
      for (const url of relayUrls()) {
        let w;
        try { w = new WebSocket(url); } catch (e) { continue; }
        sockets.push(w);
        w.onopen = () => {
          opened++;
          try { w.send(mod.subscribe("s" + Math.floor(Date.now() % 1e6), theirTopic)); } catch (e) {}
          if (current) publish(current);
        };
        w.onmessage = (ev) => {
          let m;
          try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
          // Array.isArray, not a bare index: JSON.parse("null") succeeds INSIDE
          // the try and `null[0]` then threw out of the handler — past the
          // module's "never throws" promise and onto index.html's window error
          // listener, which paints a full-screen error overlay over the lobby.
          // NIP-01 frames are arrays anyway, so this is also the shape check.
          if (!Array.isArray(m)) return;
          if (m[0] === "EVENT" && m[2] && typeof m[2].content === "string") heard(m[2].content);
        };
        w.onerror = () => {};
      }

      // Nothing to publish yet? Mint it now rather than waiting for an arrival.
      if (!current && mintOffer) {
        Promise.resolve(mintOffer(null)).then((o) => {
          if (!done && o) { current = o; publish(o); }
        }).catch(() => {});
      }

      setTimeout(() => {
        if (done) return;
        if (!sockets.some((w) => w.readyState === 1)) {
          finish({ ok: false, error: "no_relay",
            message: "Could not reach any room service — this network may be blocking it."
                   + " Use the invite link or QR instead." });
        }
      }, RELAY_CHECK_MS);

      // A host stays open for further joiners and says so immediately, exactly
      // as the Trystero path did.
      if (onJoiner && !settled) {
        settled = true;
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
    // THE DIRECT PATH IS THE DEFAULT. See directExchange() above for why: the
    // Trystero room used the relays to build a peer connection, and then sent
    // our signalling over THAT — a WebRTC link established in order to
    // establish a WebRTC link, with the first dying as the second starts.
    // localStorage apex26.nostrTrystero = "true" restores the old route for a
    // side-by-side comparison.
    let legacy = false;
    try { legacy = localStorage.getItem("apex26.nostrTrystero") === "true"; } catch (e) {}
    if (!legacy) return directExchange(opts);
    // send/reply are the two-party pair this started as. mintOffer+onJoiner are
    // SUBSCRIPTION mode: a host that stays in the room and answers each arrival
    // with an offer of its own, rather than resolving on the first one.
    const { code, send, reply, token, onTick, mintOffer, onJoiner, onFail } = opts;
    if (!available()) {
      return { ok: false, error: "unsupported",
               message: "This browser cannot reach the room service." };
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
      return { ok: false, error: "no_module", detail: why,
               message: "Could not load the room service (" + why.slice(0, 90) + ")."
                      + " Use the invite link or QR instead." };
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

      const finish = (r) => {
        if (done) return;
        done = true;
        clearInterval(tick);
        clearInterval(rebroadcast);
        restoreWarn();
        leave();
        if (!settled) { settled = true; resolve(r); return; }
        // Already answered, so the only way to report this is the callback the
        // caller gave us.
        if (onFail) { try { onFail(r); } catch (e) {} }
      };

      const tick = setInterval(() => {
        if (token && token.cancelled) finish({ ok: false, error: "cancelled", message: "" });
        else if (onTick) { try { onTick(); } catch (e) {} }
      }, 1000);

      setTimeout(() => finish({ ok: false, error: "expired",
        message: "Nobody joined that code. Codes only last a couple of minutes." }),
        JOIN_TIMEOUT_MS);

      // "No relay would talk to us" and "nobody joined" are different answers
      // and deserve different waits. Without this check, a player with every
      // relay blocked — a captive portal, a corporate proxy, an offline
      // laptop — stares at "waiting for them to join" for two full minutes
      // before being told something that was knowable in five seconds.
      setTimeout(() => {
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
        // password: the ROOM CODE. Trystero encrypts the signalling payload
        // with it, so the relay relays ciphertext.
        roomId(code).then((id) => {
          if (done) return;
          // WHICH RELAYS. Trystero's getRelays() picks its subset
          // DETERMINISTICALLY from a hash of the appId, so every player of this
          // game gets the same handful for ever — a bad draw is permanent, not
          // intermittent. A real console showed ours: two with dead DNS, one
          // timing out, one rate-limiting. Being able to say otherwise is both
          // the fix for that and what makes this path testable at all, against
          // a relay on localhost (tools/net/nostr-local.cjs).
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
          // TARGETED send. Trystero 0.25's signature is
          // send(data, options) with options.target — NOT send(data, id) as
          // the older tuple API suggested. Getting that wrong posts to
          // EVERYONE, which is exactly what makes two joiners collide on the
          // host's single offer. Pinned in tests/unit/net-trystero-api.test.mjs.
          const post = (data, to) => (to ? swap.send(data, { target: to }) : swap.send(data));
          // Per-JOINER, not global. As one boolean this was "somebody is being
          // answered", which with three joiners means two of them are dropped.
          const handling = new Set();

          swap.onMessage = (async (data, ctx) => {
            // Trystero hands the sender as ctx.peerId — the second argument is
            // a metadata OBJECT, not a bare id.
            const from = (ctx && ctx.peerId) || null;
            if (done) return;
            if (typeof data !== "string" || !data) return;
            // SUBSCRIPTION MODE — a host that wants several players. Every
            // joiner's answer is handed straight over and the room STAYS OPEN;
            // only cancel, expiry, a dead relay or an explicit stop() ends it.
            // Promise-caught, not try-caught: onJoiner is async, and a plain
            // try/catch around an async call misses its rejection — which is
            // exactly how an InvalidStateError reached a real console as
            // "Uncaught (in promise)".
            if (onJoiner) { Promise.resolve().then(() => onJoiner(from, data)).catch(() => {}); return; }
            if (handling.has(from)) return;
            if (!reply) { finish({ ok: true, payload: data }); return; }
            // Answering takes seconds (setRemoteDescription plus a full ICE
            // gather), and the room stays open across it — leaving early would
            // throw away the channel the answer has to go back down.
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
            // Long enough for those retries to actually go out. finish() leaves
            // the room, and leaving it is what used to cut the answer off
            // after a single 600 ms attempt.
            setTimeout(() => { clearInterval(resend); finish({ ok: true, payload: data }); }, 6500);
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
            // THE OFFER IS BROADCAST IMMEDIATELY, and again to anyone who
            // turns up. That is what the two-party path did and it is why it
            // worked: posting only on onPeerJoin makes the whole room-code
            // route depend on peer-presence propagating through relays that
            // are frequently half-dead, and when it does not, the host sits
            // there having said nothing at all.
            //
            // `current` is the offer on the table. One SDP offer belongs to one
            // RTCPeerConnection, so once somebody takes it the caller rotates
            // in a fresh one — rotate() below — rather than this minting a new
            // connection on every join, which is what got us rate-limited.
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
              // No opening offer supplied: make one now rather than waiting for
              // an arrival to trigger it.
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
          // Subscription mode has nothing to wait for: hand back the way to
          // stop, and let the lobby decide when the room closes.
          if (onJoiner && !settled) {
            // settled, NOT done: the room is open and the relay probe, the join
            // timeout and the cancellation tick all have to keep running.
            settled = true;
            resolve({
              ok: true, subscribed: true,
              // Called once a guest has taken the current offer: an SDP offer
              // belongs to one connection, so the next arrival needs its own.
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
    // Exported FOR THE TESTS. A bad stored override used to reach
    // `new WebSocket()` and throw out of joinRoom, and asserting that on the
    // source text is the kind of test that passes while the code is broken.
    RELAYS, relayUrls, validRelay };
})();
