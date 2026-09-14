/* NetSnapshot — what actually goes on the wire, and how a rival is drawn smoothly from packets that arrive late, out of order, or not at all. WHY STATE AND NOT IN… */
"use strict";

const NetSnapshot = (function () {
  const TYPE_SNAPSHOT = 1;

  const CAR_BYTES = 13;
  const SNAP_HEADER = 6;             // type u8 + tick u32 + count u8

  const TAU = Math.PI * 2;
  const U16 = 65536;

  // Flags packed above the gear nibble.
  const F_DEPLOY = 0x10, F_OFFROAD = 0x20, F_KERB = 0x40, F_BRAKE = 0x80;

  const clamp = M4.clamp;                     // shared scalar helper (js/core/mat4.js)
  const i32 = (v) => (v | 0);

  const encS = (s) => clamp(Math.round(s * 100), 0, 4294967295) >>> 0;
  const decS = (v) => v / 100;
  const encX = (x) => clamp(Math.round(x * 100), -32768, 32767) | 0;
  const decX = (v) => v / 100;
  const encV = (v) => clamp(Math.round(v * 100), -32768, 32767) | 0;
  const decV = (v) => v / 100;
  const encH = (h) => (Math.round((((h % TAU) + TAU) % TAU) / TAU * U16) % U16) & 0xffff;
  const decH = (v) => (v / U16) * TAU;

  function writeCar(dv, off, id, c) {
    dv.setUint8(off, id & 0xff);
    dv.setUint32(off + 1, encS(c.s || 0));
    dv.setInt16(off + 5, encX(c.x || 0));
    dv.setUint16(off + 7, encH(c.head || 0));
    dv.setInt16(off + 9, encV(c.speed || 0));
    let gf = clamp(i32(c.gear || 1), 0, 15);
    if (c.deploying) gf |= F_DEPLOY;
    if (c.offroad) gf |= F_OFFROAD;
    if (c.onKerb) gf |= F_KERB;
    if (c.braking) gf |= F_BRAKE;
    dv.setUint8(off + 11, gf);
    dv.setUint8(off + 12, clamp(i32(c.lap || 0), 0, 255));
    return off + CAR_BYTES;
  }
  function readCar(dv, off) {
    const gf = dv.getUint8(off + 11);
    return {
      id: dv.getUint8(off),
      s: decS(dv.getUint32(off + 1)),
      x: decX(dv.getInt16(off + 5)),
      head: decH(dv.getUint16(off + 7)),
      speed: decV(dv.getInt16(off + 9)),
      gear: gf & 0x0f,
      deploying: !!(gf & F_DEPLOY),
      offroad: !!(gf & F_OFFROAD),
      onKerb: !!(gf & F_KERB),
      braking: !!(gf & F_BRAKE),
      lap: dv.getUint8(off + 12),
    };
  }

  function encodeSnapshot(tick, entries) {
    const list = [];
    const src = entries || [];
    for (let i = 0; i < src.length && list.length < 255; i++) {
      const e = src[i];
      if (!e || !(e.id >= 0)) continue;
      list.push(e);
    }
    const n = list.length;
    const buf = new ArrayBuffer(SNAP_HEADER + n * CAR_BYTES);
    const dv = new DataView(buf);
    dv.setUint8(0, TYPE_SNAPSHOT);
    dv.setUint32(1, tick >>> 0);
    dv.setUint8(5, n);
    let off = SNAP_HEADER;
    for (let i = 0; i < n; i++) off = writeCar(dv, off, list[i].id, list[i].car);
    return new Uint8Array(buf);
  }

  function decodeSnapshot(bytes) {
    const dv = toView(bytes);
    if (!dv || dv.byteLength < SNAP_HEADER) return null;
    if (dv.getUint8(0) !== TYPE_SNAPSHOT) return null;
    const n = dv.getUint8(5);
    if (dv.byteLength < SNAP_HEADER + n * CAR_BYTES) return null;
    const cars = [];
    let off = SNAP_HEADER;
    for (let i = 0; i < n; i++) { cars.push(readCar(dv, off)); off += CAR_BYTES; }
    return { type: TYPE_SNAPSHOT, tick: dv.getUint32(1), cars };
  }

  function toView(bytes) {
    if (!bytes) return null;
    if (bytes instanceof DataView) return bytes;
    if (bytes instanceof ArrayBuffer) return new DataView(bytes);
    if (ArrayBuffer.isView(bytes)) return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return null;
  }

  // Both of these take the SHORT way round. Without that, a car crossing the
  // start/finish line appears to sprint backwards down the whole lap, and one
  // rotating through the heading wrap spins the wrong way — once per lap,
  // every lap, which reads as a physics bug rather than a netcode one.
  function lerpWrapped(a, b, u, period) {
    const d = M4.wrapDelta(b - a, period);   // shortest way round (js/core/mat4.js)
    const v = a + d * u;
    return ((v % period) + period) % period;
  }

  function createInterp(opts) {
    opts = opts || {};
    const total = opts.total || 1;         // track length, for wrap-aware s
    const delayMs = opts.delayMs != null ? opts.delayMs : 100;
    const maxExtrapMs = opts.maxExtrapMs != null ? opts.maxExtrapMs : 250;
    const keep = opts.keep || 32;
    let samples = [];                      // ascending by t

    function push(t, st) {
      const rec = Object.assign({ t }, st);
      // Fast path: the normal case is strictly newer than everything held.
      if (!samples.length || t > samples[samples.length - 1].t) {
        samples.push(rec);
      } else {
        let i = samples.length - 1;
        while (i >= 0 && samples[i].t > t) i--;
        if (i >= 0 && samples[i].t === t) return false;   // duplicate — ignore
        samples.splice(i + 1, 0, rec);
      }
      while (samples.length > keep) samples.shift();
      return true;
    }

    function splitS(raw) {
      const laps = Math.floor(raw / total);
      return { s: raw - laps * total, laps };
    }

    // Extrapolation cannot exceed this share of the car's speed, however hard
    // the last two packets say it was braking. Two samples a jitter apart can
    // imply an absurd rate; at a real 22 m/s^2 a car at 70 m/s sheds 8 % over a
    // 250 ms window and one at 20 m/s sheds 27 %, so a third is generous for
    // the honest case and still bounds the pathological one.
    const EXTRAP_SLOW_MAX = 0.35;

    // `decelMs2` is the OBSERVED rate from the last two packets (0 when the car
    // is not braking, or when there is only one sample). Observed rather than a
    // constant on purpose: a literal here would be a second copy of BRAKE that
    // has to be kept in step with the physics AND re-derived against PACE,
    // which is exactly the coupling `aStd` exists to prevent. The wire already
    // carries the answer, scaled correctly, for free.
    function advance(st, dtMs, out, decelMs2) {
      const dt = dtMs / 1000;
      // F_BRAKE WAS DECODED AND THROWN AWAY. `braking` rides in every packet
      // and nothing read it: s advanced at a flat st.speed, so a car standing
      // on the brakes was predicted to keep coming. predict() extrapolates by
      // delayMs EVERY frame, not only during a stall, so the follower's
      // predicted contact pose overshot continuously — the documented
      // last-millisecond-brake asymmetry from real P2P racing netcode.
      let v = st.speed, ds;
      const a = decelMs2 > 0 && v > 0 ? decelMs2 : 0;
      if (a > 0) {
        // Never predict past the stop, and never past the cap above.
        const te = Math.min(dt, v / a, (EXTRAP_SLOW_MAX * v) / a);
        ds = v * te - 0.5 * a * te * te + Math.max(0, v - a * te) * (dt - te);
        v = Math.max(0, v - a * te);
      } else {
        ds = v * dt;
      }
      const w = splitS(st.s + ds);
      // Spread the source rather than re-listing its fields: a packet that
      // grows a field would otherwise silently lose it HERE ONLY, i.e. only
      // while extrapolating — invisible to any test that never stalls the
      // buffer. Only s moves; x is deliberately not extrapolated.
      const o = Object.assign(out || {}, st);
      o.s = w.s;
      // Speed follows s, because they are one claim about the same car: the
      // contact solver reads this as _nSpd to decide who is closing on whom,
      // and a pose that slowed with a speed that did not is a pair of
      // predictions that disagree.
      o.speed = v;
      o.lap = Number.isFinite(st.lap) ? st.lap + w.laps : st.lap;
      o.extrapolated = true;
      return o;
    }

    function blend(a, b, u, out) {
      const o = Object.assign(out || {}, u < 0.5 ? a : b);
      o.x = a.x + (b.x - a.x) * u;
      o.head = lerpWrapped(a.head, b.head, u, TAU);
      o.speed = a.speed + (b.speed - a.speed) * u;
      o.extrapolated = false;
      const d = M4.wrapDelta(b.s - a.s, total);   // shortest way round (js/core/mat4.js)
      const w = splitS(a.s + d * u);
      o.s = w.s;
      if (Number.isFinite(a.lap)) o.lap = a.lap + w.laps;
      return o;
    }

    // `out` (optional) is a caller-owned scratch object reused per remote per
    // frame — sample/predict run for every rival every tick, and the fresh
    // copies were the netplay loop's steadiest allocation. Omitted, each call
    // returns a fresh object exactly as before. Assign-over-scratch relies on
    // the packet shape being stable within a session (it is; the protocol is
    // versioned) — fields never vanish mid-session, so no stale-key sweep.
    function sample(nowMs, out) {
      if (!samples.length) return null;
      const target = nowMs - delayMs;
      const newest = samples[samples.length - 1];
      if (target >= newest.t) {
        // Observed deceleration, only while the wire says the brakes are on.
        // Gating on the flag matters: without it a momentary dip between two
        // packets would be extrapolated as if it were sustained.
        let decel = 0;
        if (newest.braking && samples.length > 1) {
          const prev = samples[samples.length - 2];
          const dts = (newest.t - prev.t) / 1000;
          if (dts > 0.001 && Number.isFinite(prev.speed) && Number.isFinite(newest.speed)) {
            const d = (prev.speed - newest.speed) / dts;
            if (d > 0) decel = d;
          }
        }
        return advance(newest, Math.min(target - newest.t, maxExtrapMs), out, decel);
      }
      const oldest = samples[0];
      if (target <= oldest.t) { const o = Object.assign(out || {}, oldest); o.extrapolated = false; return o; }
      for (let i = samples.length - 1; i > 0; i--) {
        const a = samples[i - 1], b = samples[i];
        if (target >= a.t && target <= b.t) {
          const span = b.t - a.t;
          return blend(a, b, span > 0 ? (target - a.t) / span : 0, out);
        }
      }
      const o = Object.assign(out || {}, newest); o.extrapolated = false; return o;
    }

    return {
      push, sample,
      // Where the rival actually IS, as opposed to where it is DRAWN. Contact
      // must be resolved against this: sample() deliberately returns the pose
      // delayMs in the past, and hitting a car where it was 100 ms ago is a
      // phantom collision at one end and a missed one at the other. Same code
      // path, just without the delay — so it extrapolates along the road and is
      // bounded exactly as sample() is.
      predict: (nowMs, out) => sample(nowMs + delayMs, out),
      size: () => samples.length,
      newest: () => (samples.length ? samples[samples.length - 1] : null),
      oldest: () => (samples.length ? samples[0] : null),
      clear: () => { samples = []; },
    };
  }

  return {
    TYPE_SNAPSHOT, CAR_BYTES,
    encodeSnapshot, decodeSnapshot,
    // Shared with session.js, which decodes off the same channel.
    toView,
    createInterp,
  };
})();
Object.freeze(NetSnapshot);
