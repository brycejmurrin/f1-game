/*
 * NetNostr — the room-code rendezvous, over public Nostr relays via Trystero.
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
 * premise, not a courtesy being abused. Trystero's Nostr strategy connects to
 * five of several hundred at once, so no single operator is load-bearing.
 *
 * WHY TRYSTERO IS SIGNALLING ONLY, AND NOT THE TRANSPORT. Trystero opens its
 * data channel with `pc.createDataChannel("data")` and no options — reliable
 * and ordered. Our snapshot channel must be neither: a lost position update is
 * worthless by the time a retransmit arrives, and ordering it head-of-line
 * blocks every packet behind the one that dropped. So Trystero carries the two
 * invite/answer STRINGS and nothing else; the race then runs over our own
 * RTCPeerConnection with its unreliable state channel, its reliable event
 * channel, and its TURN relay. Everything downstream is untouched.
 *
 * WHAT THE RELAYS SEE. Trystero's `password` option encrypts the signalling
 * payload, and the room id is a hash of the code rather than the code itself.
 * We pass the room code as that password, so a relay operator carries bytes it
 * cannot read and someone watching the room namespace learns nothing. The code
 * is the secret — the same trust model as the invite code it replaces.
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
  // localStorage apex26.nostrRelays = ["wss://…", …] — an explicit relay list,
  // used verbatim (Trystero prefixes wss:// only onto ITS defaults, so a
  // ws://127.0.0.1 fixture works here and nowhere else).
  function relayUrls() {
    try {
      const raw = localStorage.getItem("apex26.nostrRelays");
      if (!raw) return null;
      const list = JSON.parse(raw);
      return Array.isArray(list) && list.length ? list : null;
    } catch (e) { return null; }
  }

  async function exchange(opts) {
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
      let done = false;        // torn down: room left, nothing more can happen
      let settled = false;     // the promise has been answered
      // SUBSCRIPTION MODE RESOLVES EARLY and the room stays open, so "answered"
      // and "finished" stopped being the same event. Conflating them switched
      // off every failure detector below — the relay-health probe and the join
      // timeout both bail on `done` — so a host whose relays were all dead was
      // told nothing and sat on a spinner forever. Reported from a real
      // console: damus rate-limiting and nos.social timing out, with the page
      // showing no error at all.
      const finish = (r) => {
        if (done) return;
        done = true;
        clearInterval(tick);
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
          // a relay on localhost (tools/nostr-local.cjs).
          room = mod.joinRoom(Object.assign(
            { appId: APP_ID, password: code },
            relayUrls() ? { relayConfig: { urls: relayUrls() } } : null,
          ), id);
          // Trystero 0.25 returns an OBJECT from makeAction, not the [send,
          // receive] tuple older versions did, and its onMessage is a setter
          // like onPeerJoin. Both mistakes throw into the catch below and come
          // back as "could not reach the room service" — a bug wearing a
          // network failure's clothes. tests/net-trystero-api.test.mjs pins
          // both shapes against the vendored source.
          const swap = room.makeAction("swap");
          // TARGETED send. Trystero 0.25's signature is
          // send(data, options) with options.target — NOT send(data, id) as
          // the older tuple API suggested. Getting that wrong posts to
          // EVERYONE, which is exactly what makes two joiners collide on the
          // host's single offer. Pinned in tests/net-trystero-api.test.mjs.
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
            if (onJoiner) { try { onJoiner(from, data); } catch (e) {} return; }
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
            try { post(out, from); } catch (e) {}
            // Give the relay a moment to carry it before the room is torn down.
            setTimeout(() => finish({ ok: true, payload: data }), 600);
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
          if (mintOffer) {
            // A FRESH OFFER PER JOINER. One SDP offer belongs to one
            // RTCPeerConnection, so handing the same string to two people has
            // them both answering the same connection and one of them losing.
            // Targeted, so nobody else in the room even sees it.
            //
            // ONCE PER PEER, AND ONE AT A TIME. Both guards are load-bearing
            // and neither was here at first:
            //
            //   onPeerJoin is a SETTER that REPLAYS for peers already in the
            //   room, and a peer re-announces when a relay socket drops and
            //   reconnects — which is the normal state of a public relay, not
            //   an edge case. Minting per fire means a fresh
            //   RTCPeerConnection, a full ICE gather and a post EVERY TIME,
            //   where the old two-party path posted one short string once.
            //   That is how a room ends up being told "you are noting too
            //   much" by the relay, i.e. rate-limited by our own doing.
            //
            //   And minting is async: two fires interleaved would both call
            //   through to the lobby, which swaps the pending transport under
            //   the other one, so an arriving answer gets applied to the wrong
            //   connection.
            const served = new Set();
            let minting = null;
            room.onPeerJoin = async (id) => {
              if (done || served.has(id)) return;
              served.add(id);
              const prev = minting;
              minting = (async () => {
                try { await prev; } catch (e) {}
                if (done) return;
                let offer = null;
                try { offer = await mintOffer(id); } catch (e) { offer = null; }
                // A refusal (room full, no transport) must not be remembered as
                // served, or a later retry by the same peer is ignored forever.
                if (!offer) { served.delete(id); return; }
                if (done) return;
                try { post(offer, id); } catch (e) {}
              })();
              await minting;
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
          }
          // Subscription mode has nothing to wait for: hand back the way to
          // stop, and let the lobby decide when the room closes.
          if (onJoiner && !settled) {
            // settled, NOT done: the room is open and the relay probe, the join
            // timeout and the cancellation tick all have to keep running.
            settled = true;
            resolve({ ok: true, subscribed: true, stop: () => finish({ ok: false, error: "stopped", message: "" }) });
          }
        }).catch(() => finish({ ok: false, error: "relay",
          message: "Could not reach the room service. Use the invite link instead." }));
      } catch (e) {
        finish({ ok: false, error: "relay",
          message: "Could not reach the room service. Use the invite link instead." });
      }
    });
  }

  return { APP_ID, JOIN_TIMEOUT_MS, RELAY_CHECK_MS, available, roomId, exchange, load };
})();
