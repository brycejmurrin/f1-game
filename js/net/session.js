/* NetSession — the layer between a transport and the game. It answers three questions that neither the wire nor the game can answer alone: 1. WHAT TIME IS IT OVER… */
"use strict";

const NetSession = (function () {
  const PING = 3, PONG = 4;           // 1 belongs to NetSnapshot (TYPE_SNAPSHOT)
  const PING_BYTES = 13;              // type u8 + id u32 + t0 f64
  const PONG_BYTES = 21;              // + t1 f64

  const DEFAULTS = {
    pingEveryMs: 500,
    timeoutMs: 6000,
    stallForgiveMs: 400,
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
  const view = (data) => NetSnapshot.toView(data);

  function create(opts) {
    opts = opts || {};
    const transport = opts.transport;
    if (!transport) throw new Error("NetSession needs a transport");
    Log.info("net", "session create");
    const cfg = Object.assign({}, DEFAULTS, opts);
    const CH_STATE = NetTransport.STATE;
    const CH_EVENT = NetTransport.EVENT;

    const eventHandlers = new Map();   // type -> [fn]
    const stateHandlers = [];          // fn(bytes, fromPeerTimeMs)
    const closeHandlers = [];

    let pingId = 0;
    let lastPingAt = -Infinity;
    let lastHeardAt = null;            // null until the first packet ever
    let best = null;                   // { rtt, offset } — lowest-RTT sample
    let samples = [];
    let alive = true;
    let lastNow = 0;
    // Last unreliable game STATE seen before the first PONG. Dropping those
    // bytes left the rival at the default pose until sync, then it warped
    // onto the held timeline in one frame. Replay the newest once offset
    // exists; ping/pong still never reach the game.
    let heldState = null;

    const MAX_PLAUSIBLE_RTT_MS = 4000;
    function addSample(rtt, offset) {
      // Both halves are wire-derived. rtt was guarded from the start; offset
      // was not, and it is the one that converts every peer timestamp into
      // local time — a single NaN-bearing PONG becomes `best.offset` and
      // poisons the conversion for the whole session.
      if (!(rtt >= 0) || rtt > MAX_PLAUSIBLE_RTT_MS) return;
      if (!Number.isFinite(offset)) return;
      samples.push({ rtt, offset });
      if (samples.length > cfg.clockSamples) samples.shift();
      // Lowest RTT wins: it is the exchange least distorted by queuing.
      best = samples.reduce((a, b) => (a && a.rtt <= b.rtt ? a : b), null);
    }
    const offset = () => (best ? best.offset : 0);
    const rtt = () => (best ? best.rtt : 0);
    const synced = () => best != null;
    const peerToLocal = (tPeer) => tPeer - offset();
    const localToPeer = (tLocal) => tLocal + offset();

    function onStateBytes(data, now) {
      const dv = view(data);
      if (!dv || !dv.byteLength) return;
      const type = dv.getUint8(0);

      if (type === PING) {
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
        if (synced() && heldState) {
          const held = heldState;
          heldState = null;
          deliverState(held.data, held.now);
        }
        return;
      }
      if (!synced()) {
        heldState = { data: data, now: now };
        return;
      }
      deliverState(data, now);
    }

    function deliverState(data, now) {
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

    transport.onMessage((channel, data, at) => {
      // Prefer the transport's ARRIVAL stamp (rtc supplies it; loopback does
      // not — its wire time is epoch-relative, a different clock domain).
      // Pump-time stamping put up to a frame of scheduling into every RTT
      // sample and PONG t1 (the C-12 skew).
      const t = at != null ? at : lastNow;
      lastHeardAt = t;
      if (channel === CH_STATE) onStateBytes(data, t);
      else onEventJson(data);
    });
    // `released` latches "the transport is closed" SEPARATELY from `alive`
    // ("this session's bookkeeping is over"). Conflating them was the leak
    // class this file keeps re-finding: any path that flipped `alive` first
    // made close() a no-op and the transport could never be torn down.
    let released = false;
    function release() {
      if (released) return;
      released = true;
      try { transport.close(); } catch (e) { /* already gone */ }
    }
    transport.onClose(() => {
      released = true;                 // it closed itself — nothing to release
      if (alive) {
        alive = false;
        Log.info("net", "session close transport");
        fire(closeHandlers, "transport");
      }
    });

    function fire(list, arg) {
      for (const fn of list) { try { fn(arg); } catch (e) {} }
    }

    function pump(now) {
      const gap = lastNow ? now - lastNow : 0;   // 0 = never pumped, not a stall
      if (gap > cfg.stallForgiveMs && lastHeardAt != null) lastHeardAt += gap;
      lastNow = now;
      if (transport.pump) transport.pump(now);

      if (alive && now - lastPingAt >= cfg.pingEveryMs) {
        lastPingAt = now;
        transport.send(CH_STATE, encodePing(++pingId, now));
      }
      // Only start the death clock once we have actually heard from them, so
      // a slow connect is never mistaken for a disconnect.
      if (alive && lastHeardAt != null && now - lastHeardAt > cfg.timeoutMs) {
        alive = false;
        release();   // idempotent — a transport that throws is already gone,
                     // and this path exists precisely because the peer
                     // stopped answering. Nothing left to report to.
        Log.info("net", "session close timeout");
        fire(closeHandlers, "timeout");
      }
      return alive;
    }

    return {
      pump,
      sendState: (bytes) => transport.send(CH_STATE, bytes),
      sendEvent(type, data) {
        return transport.send(CH_EVENT, JSON.stringify({ t: type, d: data === undefined ? null : data }));
      },
      onState(fn) { stateHandlers.push(fn); return this; },
      onEvent(type, fn) {
        if (!eventHandlers.has(type)) eventHandlers.set(type, []);
        eventHandlers.get(type).push(fn);
        return this;
      },
      onClose(fn) { closeHandlers.push(fn); return this; },
      clearHandlers() {
        stateHandlers.length = 0;
        closeHandlers.length = 0;
        eventHandlers.clear();
        return this;
      },
      // -- clock --
      rtt, offset, peerToLocal, localToPeer,
      // Half the round trip: how stale a just-arrived snapshot already is.
      lagMs: () => rtt() / 2,
      synced,
      // -- liveness --
      alive: () => alive,
      lastHeard: () => lastHeardAt,
      close() {
        // Release BEFORE the alive check: a path that flipped `alive` first
        // (transport-close event, timeout) used to make close() a no-op and
        // netplay.stop() could never reach transport.close().
        release();
        if (!alive) return;
        alive = false;
        Log.info("net", "session close");
        fire(closeHandlers, "local");
      },
      stats: () => ({
        rtt: rtt(), offset: offset(), synced: synced(),
        samples: samples.length, alive, lastHeard: lastHeardAt,
      }),
    };
  }

  return { create, PING, PONG };
})();
