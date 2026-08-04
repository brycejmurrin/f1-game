/*
 * NetSession — the layer between a transport and the game.
 *
 * It answers three questions that neither the wire nor the game can answer
 * alone:
 *
 * 1. WHAT TIME IS IT OVER THERE? Two browsers have unrelated clocks. Every
 *    snapshot is stamped with the SENDER's time, so before it can be placed in
 *    an interpolation buffer it has to be converted into ours. Done the
 *    NTP way: ping carries t0, the peer echoes it with its own t1, and the
 *    round trip gives both the delay and the offset.
 *
 *    The key detail is that we keep the sample with the LOWEST round-trip, not
 *    the average. A slow reply means the packet queued somewhere, and queuing
 *    is pure error in the offset estimate — averaging folds that error in,
 *    while the fastest exchange we have seen is the one least polluted by it.
 *
 * 2. IS ANYONE STILL THERE? WebRTC will eventually tell us a connection
 *    failed, but "eventually" can be tens of seconds, during which a rival sits
 *    frozen on track. Pings double as a heartbeat: if nothing has arrived for
 *    a couple of seconds we call it, so the game can hand the abandoned car to
 *    the AI and carry on rather than staring at a statue.
 *
 * 3. WHAT KIND OF MESSAGE IS THIS? Traffic is split across two channels with
 *    opposite guarantees, so routing is explicit. Anything on the unreliable
 *    channel is a binary packet identified by its first byte; anything on the
 *    reliable channel is a JSON event with a type. Events are low-volume
 *    (lobby, race settings, lap times, results) so JSON's overhead is
 *    irrelevant there, and its readability while debugging is not.
 *
 * Nothing here schedules itself. pump(now) drives the whole thing from the
 * game loop, for the same reason the transport works that way: a session whose
 * timing depends on setInterval is a session whose tests depend on wall-clock.
 */
"use strict";

const NetSession = (function () {
  const PING = 3, PONG = 4;           // 1 and 2 belong to NetSnapshot
  const PING_BYTES = 13;              // type u8 + id u32 + t0 f64
  const PONG_BYTES = 21;              // + t1 f64

  const DEFAULTS = {
    pingEveryMs: 500,
    timeoutMs: 2500,                  // silence after which we declare the peer gone
    clockSamples: 8,
  };

  function encodePing(id, t0) {
    const dv = new DataView(new ArrayBuffer(PING_BYTES));
    dv.setUint8(0, PING); dv.setUint32(1, id >>> 0); dv.setFloat64(5, t0);
    return new Uint8Array(dv.buffer);
  }
  function encodePong(id, t0, t1) {
    const dv = new DataView(new ArrayBuffer(PONG_BYTES));
    dv.setUint8(0, PONG); dv.setUint32(1, id >>> 0);
    dv.setFloat64(5, t0); dv.setFloat64(13, t1);
    return new Uint8Array(dv.buffer);
  }
  function view(data) {
    if (!data) return null;
    if (data instanceof ArrayBuffer) return new DataView(data);
    if (ArrayBuffer.isView(data)) return new DataView(data.buffer, data.byteOffset, data.byteLength);
    return null;
  }

  function create(opts) {
    opts = opts || {};
    const transport = opts.transport;
    if (!transport) throw new Error("NetSession needs a transport");
    const cfg = Object.assign({}, DEFAULTS, opts);
    const CH_STATE = opts.stateChannel || "state";
    const CH_EVENT = opts.eventChannel || "event";

    const eventHandlers = new Map();   // type -> [fn]
    const stateHandlers = [];          // fn(bytes, fromPeerTimeMs)
    const closeHandlers = [];

    let pingId = 0;
    let lastPingAt = -Infinity;
    let lastHeardAt = null;            // null until the first packet ever
    let best = null;                   // { rtt, offset } — lowest-RTT sample
    let samples = [];
    let alive = true;
    let started = 0;
    // The clock the rest of the session reads. Set at the top of every pump so
    // handlers invoked from transport.pump() stamp arrivals with the same
    // `now` the caller passed in, rather than each reading a slightly
    // different Date.now() and smearing the timeline.
    let lastNow = 0;

    // ---- clock ------------------------------------------------------------
    // offset = theirClock - ourClock. peerToLocal() is what lets a snapshot
    // stamped over there be placed on our timeline.
    function addSample(rtt, offset) {
      samples.push({ rtt, offset });
      if (samples.length > cfg.clockSamples) samples.shift();
      // Lowest RTT wins: it is the exchange least distorted by queuing.
      best = samples.reduce((a, b) => (a && a.rtt <= b.rtt ? a : b), null);
    }
    const offset = () => (best ? best.offset : 0);
    const rtt = () => (best ? best.rtt : 0);
    const peerToLocal = (tPeer) => tPeer - offset();
    const localToPeer = (tLocal) => tLocal + offset();

    // ---- incoming ---------------------------------------------------------
    function onStateBytes(data, now) {
      const dv = view(data);
      if (!dv || !dv.byteLength) return;
      const type = dv.getUint8(0);

      if (type === PING) {
        // Reply immediately with our own clock reading. Cheap enough that
        // there is no reason to batch or delay it — any delay we add here
        // lands in the peer's offset estimate as error.
        if (dv.byteLength >= PING_BYTES) {
          transport.send(CH_STATE, encodePong(dv.getUint32(1), dv.getFloat64(5), now));
        }
        return;
      }
      if (type === PONG) {
        if (dv.byteLength >= PONG_BYTES) {
          const t0 = dv.getFloat64(5), t1 = dv.getFloat64(13);
          const roundTrip = now - t0;
          // Assume a symmetric path: their t1 lines up with our midpoint.
          addSample(roundTrip, t1 - (t0 + roundTrip / 2));
        }
        return;
      }
      // Anything else is the game's: hand over the bytes plus the sender's
      // clock translated onto ours, which is what the interp buffer wants.
      for (const fn of stateHandlers) {
        try { fn(data, now); } catch (e) { /* a consumer bug is not a disconnect */ }
      }
    }

    function onEventJson(data) {
      let msg;
      try { msg = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(view(data))); }
      catch (e) { return; }            // malformed event: drop, never throw
      if (!msg || typeof msg.t !== "string") return;
      const list = eventHandlers.get(msg.t);
      if (!list) return;
      for (const fn of list) {
        try { fn(msg.d, msg.t); } catch (e) { /* as above */ }
      }
    }

    transport.onMessage((channel, data) => {
      lastHeardAt = lastNow;
      if (channel === CH_STATE) onStateBytes(data, lastNow);
      else onEventJson(data);
    });
    transport.onClose(() => { if (alive) { alive = false; fire(closeHandlers, "transport"); } });

    function fire(list, arg) {
      for (const fn of list) { try { fn(arg); } catch (e) {} }
    }

    function pump(now) {
      lastNow = now;
      if (!started) started = now;
      if (transport.pump) transport.pump(now);

      if (alive && now - lastPingAt >= cfg.pingEveryMs) {
        lastPingAt = now;
        transport.send(CH_STATE, encodePing(++pingId, now));
      }
      // Only start the death clock once we have actually heard from them, so
      // a slow connect is never mistaken for a disconnect.
      if (alive && lastHeardAt != null && now - lastHeardAt > cfg.timeoutMs) {
        alive = false;
        fire(closeHandlers, "timeout");
      }
      return alive;
    }

    return {
      pump,
      // -- sending --
      sendState: (bytes) => transport.send(CH_STATE, bytes),
      sendEvent(type, data) {
        return transport.send(CH_EVENT, JSON.stringify({ t: type, d: data === undefined ? null : data }));
      },
      // -- receiving --
      onState(fn) { stateHandlers.push(fn); return this; },
      onEvent(type, fn) {
        if (!eventHandlers.has(type)) eventHandlers.set(type, []);
        eventHandlers.get(type).push(fn);
        return this;
      },
      onClose(fn) { closeHandlers.push(fn); return this; },
      // -- clock --
      rtt, offset, peerToLocal, localToPeer,
      // Half the round trip: how stale a just-arrived snapshot already is.
      lagMs: () => rtt() / 2,
      synced: () => best != null,
      // -- liveness --
      alive: () => alive,
      lastHeard: () => lastHeardAt,
      close() {
        if (!alive) return;
        alive = false;
        try { transport.close(); } catch (e) {}
        fire(closeHandlers, "local");
      },
      stats: () => ({
        rtt: rtt(), offset: offset(), synced: best != null,
        samples: samples.length, alive, lastHeard: lastHeardAt,
      }),
    };
  }

  return { create, PING, PONG };
})();
