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
  async function exchange(opts) {
    const { code, send, reply, token, onTick } = opts;
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
      let done = false;
      const finish = (r) => { if (done) return; done = true; clearInterval(tick); leave(); resolve(r); };

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
          room = mod.joinRoom({ appId: APP_ID, password: code }, id);
          // Trystero 0.25 returns an OBJECT from makeAction, not the [send,
          // receive] tuple older versions did, and its onMessage is a setter
          // like onPeerJoin. Both mistakes throw into the catch below and come
          // back as "could not reach the room service" — a bug wearing a
          // network failure's clothes. tests/net-trystero-api.test.mjs pins
          // both shapes against the vendored source.
          const swap = room.makeAction("swap");
          const post = (data) => swap.send(data);
          let handling = false;

          swap.onMessage = (async (data) => {
            if (done || handling) return;
            if (typeof data !== "string" || !data) return;
            if (!reply) { finish({ ok: true, payload: data }); return; }
            // Answering takes seconds (setRemoteDescription plus a full ICE
            // gather), and the room stays open across it — leaving early would
            // throw away the channel the answer has to go back down.
            handling = true;
            let out;
            try { out = await reply(data); }
            catch (e) { out = null; }
            if (done) return;
            if (!out) {
              finish({ ok: false, error: "reply_failed",
                       message: "Could not answer that invite." });
              return;
            }
            try { post(out); } catch (e) {}
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
          if (send) {
            room.onPeerJoin = () => { try { post(send); } catch (e) {} };
            try { post(send); } catch (e) {}
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
