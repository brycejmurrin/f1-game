/*
 * NetMqtt — just enough MQTT 3.1.1 over WebSocket to use a public broker as a
 * rendezvous, with nothing to deploy and nothing to configure.
 *
 * WHY THIS EXISTS. A room code needs somewhere for two browsers to meet. Our
 * own Cloudflare Worker does that well, but it has to be deployed and its URL
 * pasted into the build — which is a terminal and a code edit, and the whole
 * point of a room code is that a player does neither. Public MQTT brokers are
 * already there, already free, already reachable over WSS from a browser, and
 * REQUIRE NO ACCOUNT. So the app can just use one.
 *
 * WHY MQTT AND NOT SOMETHING ELSE. RETAINED MESSAGES. A retained publish is
 * held by the broker and delivered to whoever subscribes NEXT — which is
 * exactly "host leaves an offer under a code, guest picks it up a minute
 * later". That single feature is the entire rendezvous; without it we would
 * need both peers connected simultaneously and a protocol to notice each
 * other. Nostr needs schnorr signatures (a crypto dependency WebCrypto cannot
 * provide), and WebTorrent trackers speak in raw SDP rather than opaque blobs.
 * MQTT's wire format is small enough to write here, in full, with no library.
 *
 * WHY WE WRITE IT RATHER THAN IMPORT IT. mqtt.js is ~150 KB and pulls a Node
 * shim stack into a browser build with no bundler. The subset we need is
 * CONNECT, SUBSCRIBE, PUBLISH, PINGREQ and DISCONNECT at QoS 0 — a few hundred
 * lines of byte packing, all of it below.
 *
 * WHAT THE BROKER CAN SEE, and why it does not matter. A public broker is
 * public: anyone may subscribe to any topic. So the payload is ENCRYPTED with a
 * key derived from the room code itself (see rendezvous.js) — the broker
 * relays ciphertext it cannot read, and someone who guesses the topic without
 * the code gets nothing. The code is the secret, which is the same trust model
 * as the invite code it replaces.
 *
 * WHAT BREAKS. Public brokers are best-effort: they go down, rate-limit, and
 * occasionally vanish. That is why several operators are RACED rather than
 * tried in turn — serially, three unreachable brokers cost three timeouts back
 * to back (measured: 24 s) — and why the link/QR paths remain primary and need
 * none of this.
 */
"use strict";

const NetMqtt = (function () {
  // Public, no-account, WSS-capable brokers, RACED. More than one operator on
  // purpose: a single broker is a single point of failure for the only feature
  // in this game that depends on somebody else's server.
  const BROKERS = [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://broker.hivemq.com:8884/mqtt",
    "wss://test.mosquitto.org:8081/mqtt",
  ];

  const CONNECT = 1, CONNACK = 2, PUBLISH = 3, SUBSCRIBE = 8, SUBACK = 9;
  const PINGREQ = 12, PINGRESP = 13, DISCONNECT = 14;

  const CONNECT_TIMEOUT_MS = 8000;
  const KEEPALIVE_S = 30;

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // ---- packet building ------------------------------------------------------
  // MQTT's "remaining length" is a variable byte integer: seven bits of payload
  // per byte, high bit as the continuation flag.
  function varInt(n) {
    const out = [];
    do {
      let b = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) b |= 0x80;
      out.push(b);
    } while (n > 0);
    return out;
  }

  // Every MQTT string is a 2-byte big-endian length followed by UTF-8 bytes.
  function str(s) {
    const b = enc.encode(s);
    return [b.length >> 8, b.length & 0xff, ...b];
  }

  function packet(type, flags, body) {
    return new Uint8Array([(type << 4) | flags, ...varInt(body.length), ...body]);
  }

  function connectPacket(clientId) {
    const body = [
      ...str("MQTT"),          // protocol name
      4,                       // protocol level: 3.1.1
      0x02,                    // clean session; no will, no auth
      KEEPALIVE_S >> 8, KEEPALIVE_S & 0xff,
      ...str(clientId),
    ];
    return packet(CONNECT, 0, body);
  }

  function publishPacket(topic, payloadBytes, retain) {
    // QoS 0, so there is no packet identifier and no acknowledgement to wait
    // for. Retain is the flag that makes this a rendezvous rather than a chat.
    const body = [...str(topic), ...payloadBytes];
    return packet(PUBLISH, retain ? 0x01 : 0x00, body);
  }

  function subscribePacket(topic, id) {
    // The 0x02 in the fixed header is mandated by the spec for SUBSCRIBE.
    return packet(SUBSCRIBE, 0x02, [id >> 8, id & 0xff, ...str(topic), 0]);
  }

  // ---- packet parsing -------------------------------------------------------
  // Returns {type, flags, body, size} or null when the buffer holds less than a
  // whole packet — WebSocket frames do not have to align with MQTT packets, so
  // the caller keeps a running buffer and drains what is complete.
  function parse(buf) {
    if (buf.length < 2) return null;
    const type = buf[0] >> 4, flags = buf[0] & 0x0f;
    let len = 0, mult = 1, i = 1;
    for (;;) {
      if (i >= buf.length) return null;              // length field incomplete
      const b = buf[i++];
      len += (b & 0x7f) * mult;
      if ((b & 0x80) === 0) break;
      mult *= 128;
      if (mult > 128 * 128 * 128) return null;       // malformed
    }
    if (buf.length < i + len) return null;           // body incomplete
    return { type, flags, body: buf.subarray(i, i + len), size: i + len };
  }

  function readPublish(body) {
    if (body.length < 2) return null;
    const tlen = (body[0] << 8) | body[1];
    if (body.length < 2 + tlen) return null;
    return {
      topic: dec.decode(body.subarray(2, 2 + tlen)),
      payload: body.subarray(2 + tlen),
    };
  }

  // ---- the client -----------------------------------------------------------
  // One connection, opened for a handshake and closed straight after. Nothing
  // here is long-lived: the game does not stay connected to a broker, because
  // the broker's only job is to introduce two peers.
  function connect(opts) {
    opts = opts || {};
    const urls = opts.urls || BROKERS;
    const onMessage = opts.onMessage || (() => {});

    // RACED, not tried in turn. Serially, three unreachable brokers cost three
    // timeouts in a row — measured at 24 s, which is far past the point a
    // player decides the button is broken. In parallel the worst case is ONE
    // timeout, and the common case is however fast the nearest broker answers.
    // The losers are closed the moment a winner is settled.
    return new Promise((resolve) => {
      let settledAny = false;
      let pending = urls.length;
      const losers = [];

      const finishAll = (result) => {
        if (settledAny) return;
        settledAny = true;
        for (const w of losers) { try { w.close(); } catch (e) {} }
        resolve(result);
      };

      const attempt = (url) => {
        let ws;
        // The "mqtt" subprotocol is not optional — brokers reject a plain
        // WebSocket, and the failure looks like a network error rather than a
        // protocol one.
        try { ws = new WebSocket(url, "mqtt"); }
        catch (e) { give(); return; }
        ws.binaryType = "arraybuffer";
        losers.push(ws);

        let settled = false;
        let buf = new Uint8Array(0);
        let ping = null;
        let subId = 1;

        // This socket is out. Only when every one of them is out do we report
        // failure — a broker that is merely slower than another must not be
        // able to cancel the race.
        const give = () => {
          if (settled) return;
          settled = true;
          clearInterval(ping);
          clearTimeout(timer);
          try { ws.close(); } catch (e) {}
          if (--pending <= 0) {
            finishAll({ ok: false, error: "no_broker",
              message: "Could not reach any room service. Use the invite link instead." });
          }
        };
        const fail = give;
        const timer = setTimeout(fail, CONNECT_TIMEOUT_MS);

        ws.onerror = fail;
        ws.onclose = () => { clearInterval(ping); if (!settled) give(); };

        ws.onopen = () => {
          // A random client id: brokers disconnect the OLDER session when two
          // clients share one, so a fixed id would have two players racing to
          // kick each other off.
          const id = "apex26-" + Math.random().toString(36).slice(2, 12);
          ws.send(connectPacket(id));
        };

        ws.onmessage = (ev) => {
          const chunk = new Uint8Array(ev.data);
          const merged = new Uint8Array(buf.length + chunk.length);
          merged.set(buf); merged.set(chunk, buf.length);
          buf = merged;

          for (;;) {
            const p = parse(buf);
            if (!p) break;
            buf = buf.subarray(p.size);

            if (p.type === CONNACK) {
              clearTimeout(timer);
              // body[1] is the return code; anything non-zero is a refusal
              // (unacceptable protocol version, banned, server unavailable).
              if (p.body.length < 2 || p.body[1] !== 0) { give(); return; }
              if (settled) continue;
              settled = true;
              // Won the race, so keep this socket out of the loser sweep.
              const at = losers.indexOf(ws);
              if (at >= 0) losers.splice(at, 1);
              ping = setInterval(() => {
                try { ws.send(packet(PINGREQ, 0, [])); } catch (e) {}
              }, KEEPALIVE_S * 500);                  // half the keepalive
              finishAll({ ok: true, url, ...api() });
            } else if (p.type === PUBLISH) {
              const m = readPublish(p.body);
              // A retained message with an EMPTY payload is how MQTT says
              // "cleared" — pass it through so callers can tell the difference
              // between nothing-yet and deliberately-withdrawn.
              if (m) { try { onMessage(m.topic, m.payload); } catch (e) {} }
            }
            // SUBACK/PINGRESP need no handling at QoS 0.
          }
        };

        function api() {
          return {
            publish(topic, bytes, retain) {
              try { ws.send(publishPacket(topic, bytes, !!retain)); return true; }
              catch (e) { return false; }
            },
            subscribe(topic) {
              try { ws.send(subscribePacket(topic, subId++)); return true; }
              catch (e) { return false; }
            },
            // Clearing a retained topic is a zero-length retained publish. This
            // is how a finished handshake stops leaving an offer lying around
            // on a public broker for the next person who guesses the code.
            clear(topic) {
              try { ws.send(publishPacket(topic, [], true)); return true; }
              catch (e) { return false; }
            },
            close() {
              clearInterval(ping);
              try { ws.send(packet(DISCONNECT, 0, [])); } catch (e) {}
              try { ws.close(); } catch (e) {}
            },
            get open() { return ws.readyState === 1; },
          };
        }
      };

      if (!urls.length) {
        finishAll({ ok: false, error: "no_broker",
          message: "Could not reach any room service. Use the invite link instead." });
      }
      for (const u of urls) attempt(u);
    });
  }

  return {
    BROKERS, connect,
    // Exported for the codec tests: these are pure byte packing, and a wrong
    // remaining-length or a missing SUBSCRIBE flag produces a silent
    // disconnection rather than an error anyone can read.
    _packet: packet, _varInt: varInt, _str: str, _parse: parse,
    _connectPacket: connectPacket, _publishPacket: publishPacket,
    _subscribePacket: subscribePacket, _readPublish: readPublish,
    types: { CONNECT, CONNACK, PUBLISH, SUBSCRIBE, SUBACK, PINGREQ, PINGRESP, DISCONNECT },
  };
})();
