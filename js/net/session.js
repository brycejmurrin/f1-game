"use strict";

const NetSession = (function () {
  const PING = 3, PONG = 4;
  const PING_BYTES = 13;
  const PONG_MIN_BYTES = 21;
  const PONG_BYTES = 29;

  const DEFAULTS = {
    pingEveryMs: 500,
    syncPingEveryMs: 100,
    timeoutMs: 6000,
    stallForgiveMs: 400,
    clockSamples: 40,
    clockMaxAgeMs: 10000,
    clockStepRun: 3,
  };

  function encodePing(id, t0) {
    const dv = new DataView(new ArrayBuffer(PING_BYTES));
    dv.setUint8(0, PING); dv.setUint32(1, id >>> 0); dv.setFloat64(5, t0);
    return new Uint8Array(dv.buffer);
  }
  function encodePong(id, t0, t1, t2) {
    const dv = new DataView(new ArrayBuffer(PONG_BYTES));
    dv.setUint8(0, PONG); dv.setUint32(1, id >>> 0);
    dv.setFloat64(5, t0); dv.setFloat64(13, t1); dv.setFloat64(21, Number.isFinite(t2) ? t2 : t1);
    return new Uint8Array(dv.buffer);
  }
  function create(opts) {
    opts = opts || {};
    const transport = opts.transport;
    if (!transport) throw new Error("NetSession needs a transport");
    Log.info("net", "session create");
    const cfg = Object.assign({}, DEFAULTS, opts);
    const CH_STATE = NetTransport.STATE;
    const CH_EVENT = NetTransport.EVENT;

    const eventHandlers = new Map();
    const stateHandlers = [];
    const snapshotHandlers = [];
    const closeHandlers = [];

    let pingId = 0;
    let lastPingAt = -Infinity;
    const SENT_PINGS_MAX = 64;
    const sentPings = [];
    function takePing(id, t0) {
      for (let i = 0; i < sentPings.length; i++) {
        const p = sentPings[i];
        if (p.id === id && p.t0 === t0) { sentPings.splice(i, 1); return true; }
      }
      return false;
    }
    let lastHeardAt = null;
    let firstPumpAt = null;
    let best = null;
    let samples = [];
    let alive = true;
    let lastNow = 0;
    let heldState = null;

    const MAX_PLAUSIBLE_RTT_MS = 4000;
    let stepRun = [];
    function addSample(rtt, offset, now) {
      if (!(rtt >= 0) || rtt > MAX_PLAUSIBLE_RTT_MS) return;
      if (!Number.isFinite(offset)) return;
      const sample = { rtt, offset, at: now };
      if (best && Math.abs(offset - best.offset) > rtt + best.rtt + 50) {
        if (stepRun.length && Math.abs(offset - stepRun[0].offset) > rtt + stepRun[0].rtt + 50) stepRun = [];
        stepRun.push(sample);
        if (stepRun.length >= cfg.clockStepRun) {
          samples = [];
          stepRun.forEach((x) => samples.push(x));
          stepRun = [];
        }
      } else {
        stepRun = [];
        if (!samples.includes(sample)) samples.push(sample);
      }
      if (samples.length > cfg.clockSamples) samples.shift();
      if (Number.isFinite(now)) samples = samples.filter((x) => !(now - x.at > cfg.clockMaxAgeMs));
      best = samples.reduce((a, b) => (a && a.rtt <= b.rtt ? a : b), null);
    }
    const offset = () => (best ? best.offset : 0);
    const rtt = () => (best ? best.rtt : 0);
    const synced = () => best != null;
    const peerToLocal = (tPeer) => tPeer - offset();
    const localToPeer = (tLocal) => tLocal + offset();

    function onStateBytes(data, now) {
      const dv = NetSnapshot.toView(data);
      if (!dv || !dv.byteLength) return false;
      const type = dv.getUint8(0);

      if (type === PING) {
        if (dv.byteLength >= PING_BYTES) {
          transport.send(CH_STATE, encodePong(dv.getUint32(1), dv.getFloat64(5), now, lastNow));
          return true;
        }
        return false;
      }
      if (type === PONG) {
        if (dv.byteLength < PONG_MIN_BYTES) return false;
        const id = dv.getUint32(1), t0 = dv.getFloat64(5), t1 = dv.getFloat64(13);
        const t2raw = dv.byteLength >= PONG_BYTES ? dv.getFloat64(21) : t1;
        if (!takePing(id, t0)) return false;
        const hold = Number.isFinite(t2raw) && t2raw >= t1 ? Math.min(t2raw - t1, MAX_PLAUSIBLE_RTT_MS) : 0;
        const t2 = t1 + hold;
        const roundTrip = now - t0 - hold;
        addSample(roundTrip, ((t1 - t0) + (t2 - now)) / 2, now);
        if (synced() && heldState) {
          const held = heldState;
          heldState = null;
          deliverState(held.data, held.now, held.snapshot);
        }
        return true;
      }
      const snapshot = NetSnapshot.decodeSnapshot(dv);
      const valid = !!snapshot;
      if (!synced()) {
        if (valid) heldState = { data: data, now: now, snapshot };
        return valid;
      }
      deliverState(data, now, snapshot);
      return valid;
    }

    function deliverState(data, now, snapshot) {
      for (const fn of stateHandlers) {
        try { fn(data, now); } catch (e) {  }
      }
      if (snapshot) for (const fn of snapshotHandlers) {
        try { fn(snapshot, now); } catch (e) {  }
      }
    }

    function onEventJson(data) {
      let msg;
      try { msg = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(NetSnapshot.toView(data))); }
      catch (e) { return false; }
      if (!msg || typeof msg.t !== "string") return false;
      const list = eventHandlers.get(msg.t);
      if (!list) return false;
      for (const fn of list) {
        try { fn(msg.d, msg.t); } catch (e) {  }
      }
      return true;
    }

    if (transport._handlers && Array.isArray(transport._handlers.message)) {
      const list = transport._handlers.message;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] && list[i]._netSessionMsg) list.splice(i, 1);
      }
    }
    const onSessionMessage = (channel, data, at) => {
      const t = at != null ? at : lastNow;
      const valid = channel === CH_STATE ? onStateBytes(data, t)
        : channel === CH_EVENT ? onEventJson(data) : false;
      if (valid) lastHeardAt = t;
    };
    onSessionMessage._netSessionMsg = true;
    transport.onMessage(onSessionMessage);
    let released = false;
    function release() {
      if (released) return;
      released = true;
      try { transport.close(); } catch (e) {  }
    }
    transport.onClose(() => {
      released = true;
      if (alive) {
        alive = false;
        Log.info("net", "session close transport");
        fire(closeHandlers, "transport");
      }
    });

    function fire(list, arg) {
      for (const fn of list) { try { fn(arg); } catch (e) {  } }
    }

    function pump(now) {
      const gap = lastNow ? now - lastNow : 0;
      const hidden = typeof document !== "undefined" && !!document.hidden;
      if (!hidden && gap > cfg.stallForgiveMs && lastHeardAt != null) lastHeardAt += gap;
      if (!hidden && gap > cfg.stallForgiveMs && firstPumpAt != null) firstPumpAt += gap;
      if (gap < 0) {
        lastPingAt = -Infinity;
        if (lastHeardAt != null) lastHeardAt += gap;
        if (firstPumpAt != null) firstPumpAt += gap;
      }
      lastNow = now;
      if (firstPumpAt == null && transport.status !== "connecting") firstPumpAt = now;
      if (transport.pump) transport.pump(now);

      const pingGap = synced() ? cfg.pingEveryMs : cfg.syncPingEveryMs;
      if (alive && now - lastPingAt >= pingGap) {
        lastPingAt = now;
        const id = (++pingId) >>> 0;
        sentPings.push({ id, t0: now });
        while (sentPings.length > SENT_PINGS_MAX ||
               (sentPings.length > 1 && now - sentPings[0].t0 > MAX_PLAUSIBLE_RTT_MS)) sentPings.shift();
        transport.send(CH_STATE, encodePing(id, now));
      }
      const heardOrOpen = lastHeardAt == null ? firstPumpAt : lastHeardAt;
      if (alive && heardOrOpen != null && now - heardOrOpen > cfg.timeoutMs) {
        alive = false;
        release();
        Log.info("net", "session close timeout");
        fire(closeHandlers, "timeout");
      }
      return alive;
    }

    return {
      pump,
      sendState: (bytes) => transport.send(CH_STATE, bytes),
      sendEvent(type, data, dataJson) {
        if (typeof dataJson === "string") return transport.send(CH_EVENT, '{"t":' + JSON.stringify(type) + ',"d":' + dataJson + "}");
        return transport.send(CH_EVENT, JSON.stringify({ t: type, d: data === undefined ? null : data }));
      },
      onState(fn) { stateHandlers.push(fn); return this; },
      onSnapshot(fn) { snapshotHandlers.push(fn); return this; },
      onEvent(type, fn) {
        if (!eventHandlers.has(type)) eventHandlers.set(type, []);
        eventHandlers.get(type).push(fn);
        return this;
      },
      onClose(fn) { closeHandlers.push(fn); return this; },
      clearHandlers() {
        stateHandlers.length = 0;
        snapshotHandlers.length = 0;
        closeHandlers.length = 0;
        eventHandlers.clear();
        return this;
      },
      rtt, offset, peerToLocal, localToPeer,
      lagMs: () => rtt() / 2,
      synced,
      alive: () => alive,
      setTimeoutMs(ms) {
        if (Number.isFinite(ms) && ms > 0) {
          cfg.timeoutMs = ms;
          if (typeof transport.setDisconnectGrace === "function") transport.setDisconnectGrace(ms);
        }
        return cfg.timeoutMs;
      },
      lastHeard: () => lastHeardAt,
      close() {
        const was = alive;
        alive = false;
        release();
        if (!was) return;
        Log.info("net", "session close");
        fire(closeHandlers, "local");
      },
      stats: () => ({
        rtt: rtt(), offset: offset(), synced: synced(),
        samples: samples.length, alive, lastHeard: lastHeardAt,
      }),
    };
  }

  function autoPong(transport) {
    if (!transport || !transport.onMessage || !transport.send) return false;
    let lastNow = 0;
    const pump = transport.pump;
    if (pump) transport.pump = function (now) { lastNow = now; return pump.call(transport, now); };
    transport.onMessage((channel, data, at) => {
      if (channel !== NetTransport.STATE) return;
      const dv = NetSnapshot.toView(data);
      if (!dv || dv.byteLength < PING_BYTES || dv.getUint8(0) !== PING) return;
      transport.send(NetTransport.STATE,
        encodePong(dv.getUint32(1), dv.getFloat64(5), at != null ? at : lastNow));
    });
    return true;
  }

  return { create, autoPong, PING, PONG };
})();
Object.freeze(NetSession);
