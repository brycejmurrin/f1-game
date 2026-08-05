/*
 * NetSnapshot — what actually goes on the wire, and how a rival is drawn
 * smoothly from packets that arrive late, out of order, or not at all.
 *
 * WHY STATE AND NOT INPUTS. The obvious design for a racing game is lockstep:
 * send inputs, replay them, get identical results. It does not work here.
 * ECMAScript does not pin the results of Math.exp/sin/pow/atan2, and the
 * driving model uses all four every tick (damp() is exp-based, STEER_EXPO is a
 * pow, banking is a sin, slip angles are atan2). Two browsers — even two
 * versions of the same browser — will diverge, and at 90 m/s a one-ULP
 * disagreement becomes a car length within seconds. So we replicate STATE,
 * which does not care about any of that.
 *
 * THE PACKET. 13 bytes per car, which is not an optimisation so much as a
 * consequence of the coordinate system: a car is a position along the road
 * plus an offset across it, so there is very little to send.
 *
 *   id     u8    index into cars[]
 *   s      u32   arc position, centimetres  (a 7 km circuit is 700,000 cm)
 *   x      i16   lateral offset, centimetres (±327 m — the road is ~8 m)
 *   head   u16   world heading, full turn mapped across the range
 *   speed  i16   centimetres/second, SIGNED so the reverse crawl survives
 *   gearF  u8    gear in the low nibble, deploy/offroad/kerb/brake flags above
 *   lap    u8    lap counter; with s this reconstructs prog
 *
 * At 20 Hz that is ~1.9 KB/s for two humans and ~5.3 KB/s if a host ever
 * broadcasts a full 22-car grid. Bandwidth is not, and will not be, the
 * constraint here — latency and authority are.
 *
 * There is deliberately NO input packet. Under distributed authority nobody
 * ever simulates anybody else's car, so nobody needs anybody else's inputs;
 * a wire format for them would be dead weight defended by a plausible-sounding
 * comment. The in-memory seam (c.netInput, fed by __apex.carInput) stays,
 * because that is what a future host-authoritative mode would build on.
 *
 * THE INTERPOLATION BUFFER. Remote cars are drawn ~100 ms in the past, between
 * the two packets that bracket that moment, which is what turns 20 Hz of
 * arriving data into a smoothly moving car. When a packet is late we
 * EXTRAPOLATE instead — and this is where the (s, x) representation earns its
 * keep. Extrapolating a car in free 3D drifts it off the road and into
 * barriers; extrapolating along s is `s += speed·dt`, which follows the
 * centreline, the elevation and the banking for free and CANNOT leave the
 * track. Guessing wrong here costs a small position error rather than a car
 * embedded in a wall.
 *
 * Both interpolations are wrap-aware: s wraps at the start/finish line and
 * head wraps at a full turn, so both take the short way round. Getting that
 * wrong makes a car sprint backwards down the lap once per lap.
 */
"use strict";

const NetSnapshot = (function () {
  const TYPE_SNAPSHOT = 1;

  const CAR_BYTES = 13;
  const SNAP_HEADER = 6;             // type u8 + tick u32 + count u8

  const TAU = Math.PI * 2;
  const U16 = 65536;

  // Flags packed above the gear nibble.
  const F_DEPLOY = 0x10, F_OFFROAD = 0x20, F_KERB = 0x40, F_BRAKE = 0x80;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const i32 = (v) => (v | 0);

  // Quantisers. Every one is lossy by a known, stated amount — 1 cm of
  // position, ~0.005 degrees of heading, 1 cm/s of speed — all far below
  // anything a player can see at racing speed.
  const encS = (s) => clamp(Math.round(s * 100), 0, 4294967295) >>> 0;
  const decS = (v) => v / 100;
  const encX = (x) => clamp(Math.round(x * 100), -32768, 32767) | 0;
  const decX = (v) => v / 100;
  const encV = (v) => clamp(Math.round(v * 100), -32768, 32767) | 0;
  const decV = (v) => v / 100;
  const encH = (h) => (Math.round((((h % TAU) + TAU) % TAU) / TAU * U16) % U16) & 0xffff;
  const decH = (v) => (v / U16) * TAU;

  // ---- car state <-> bytes --------------------------------------------------
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

  // ---- snapshot ------------------------------------------------------------
  // entries: [{id, car}] — an explicit id rather than the array index, so a
  // peer can send a subset (its own car) without the receiver having to guess.
  function encodeSnapshot(tick, entries) {
    const n = Math.min(entries.length, 255);
    const buf = new ArrayBuffer(SNAP_HEADER + n * CAR_BYTES);
    const dv = new DataView(buf);
    dv.setUint8(0, TYPE_SNAPSHOT);
    dv.setUint32(1, tick >>> 0);
    dv.setUint8(5, n);
    let off = SNAP_HEADER;
    for (let i = 0; i < n; i++) off = writeCar(dv, off, entries[i].id, entries[i].car);
    return new Uint8Array(buf);
  }

  function decodeSnapshot(bytes) {
    const dv = toView(bytes);
    if (!dv || dv.byteLength < SNAP_HEADER) return null;
    if (dv.getUint8(0) !== TYPE_SNAPSHOT) return null;
    const n = dv.getUint8(5);
    // A truncated packet is a corrupt packet — decode nothing rather than
    // hand the game a half-read car at a garbage position.
    if (dv.byteLength < SNAP_HEADER + n * CAR_BYTES) return null;
    const cars = [];
    let off = SNAP_HEADER;
    for (let i = 0; i < n; i++) { cars.push(readCar(dv, off)); off += CAR_BYTES; }
    return { type: TYPE_SNAPSHOT, tick: dv.getUint32(1), cars };
  }

  function packetType(bytes) {
    const dv = toView(bytes);
    return (dv && dv.byteLength) ? dv.getUint8(0) : 0;
  }

  function toView(bytes) {
    if (!bytes) return null;
    if (bytes instanceof DataView) return bytes;
    if (bytes instanceof ArrayBuffer) return new DataView(bytes);
    if (ArrayBuffer.isView(bytes)) return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return null;
  }

  // ---- wrap-aware interpolation --------------------------------------------
  // Both of these take the SHORT way round. Without that, a car crossing the
  // start/finish line appears to sprint backwards down the whole lap, and one
  // rotating through the heading wrap spins the wrong way — once per lap,
  // every lap, which reads as a physics bug rather than a netcode one.
  function lerpWrapped(a, b, u, period) {
    let d = b - a;
    const half = period / 2;
    if (d > half) d -= period; else if (d < -half) d += period;
    const v = a + d * u;
    return ((v % period) + period) % period;
  }

  // ---- the interpolation buffer -------------------------------------------
  // One per remote car. Packets may arrive late, out of order, or twice — the
  // unreliable channel promises none of those things — so push() inserts by
  // tick and ignores duplicates rather than assuming arrival order.
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
      // shift(), not slice(): once the buffer is full this runs on EVERY
      // inbound packet, and slice() rebuilt a 32-element array each time for
      // something that is only ever one over.
      while (samples.length > keep) samples.shift();
      return true;
    }

    // s AND lap ARE ONE QUANTITY. netplay reconstructs cumulative progress as
    // `c.prog = c.lap * total + c.s` (js/net/netplay.js), and the whole race
    // order — plus the AI's read of who is leading — is sorted on prog. So the
    // two have to cross the start/finish line TOGETHER. They used not to: s was
    // wrapped here while lap was copied from whichever sample happened to be
    // nearer in time (blend) or left untouched entirely (advance), so either
    // side of the line the pair disagreed and the rival's prog was out by a
    // whole lap for up to a packet interval. The +1 case is the bad one — it
    // briefly ranks the rival as leader, and js/game.js's `_leadHuman` then
    // rubber-bands the entire AI field off a car that is actually last.
    //
    // splitS() takes a raw arc position that may sit outside [0, total) and
    // returns the in-range s together with the number of lines it crossed to get
    // there. Both movers below go through it, so they cannot drift apart on the
    // wrap — the same reason session.js shares this file's toView().
    function splitS(raw) {
      const laps = Math.floor(raw / total);
      return { s: raw - laps * total, laps };
    }

    // Advance a state along the ROAD. This is the whole reason (s, x) is worth
    // having on the wire: it cannot dead-reckon a car off the circuit.
    function advance(st, dtMs) {
      const dt = dtMs / 1000;
      const w = splitS(st.s + st.speed * dt);
      // Spread the source rather than re-listing its fields: a packet that
      // grows a field would otherwise silently lose it HERE ONLY, i.e. only
      // while extrapolating — invisible to any test that never stalls the
      // buffer. Only s moves; x is deliberately not extrapolated.
      return Object.assign({}, st, {
        s: w.s,
        lap: Number.isFinite(st.lap) ? st.lap + w.laps : st.lap,
        extrapolated: true,
      });
    }

    function blend(a, b, u) {
      // Discrete fields (gear, the flags) step rather than blend — half a gear
      // is not a thing — so start from whichever sample is nearer and overwrite
      // only what genuinely interpolates. Same reason as advance(): a new packet
      // field is carried automatically.
      const out = Object.assign({}, u < 0.5 ? a : b, {
        x: a.x + (b.x - a.x) * u,
        head: lerpWrapped(a.head, b.head, u, TAU),
        speed: a.speed + (b.speed - a.speed) * u,
        extrapolated: false,
      });
      // Take the short way round for the DISTANCE moved (as before), then let
      // splitS say whether that landed past the line. Deriving the lap from the
      // same delta that produced s is what keeps the pair consistent; anchoring
      // on `a` rather than blending the two lap counters means a sender whose
      // lap ticks a frame before or after its s wrap cannot drag the rival
      // through a whole phantom lap.
      let d = b.s - a.s;
      const half = total / 2;
      if (d > half) d -= total; else if (d < -half) d += total;
      const w = splitS(a.s + d * u);
      out.s = w.s;
      if (Number.isFinite(a.lap)) out.lap = a.lap + w.laps;
      return out;
    }

    // Where the car should be DRAWN now: delayMs in the past, so there is
    // normally a packet on each side of that moment to blend between.
    function sample(nowMs) {
      if (!samples.length) return null;
      const target = nowMs - delayMs;
      const newest = samples[samples.length - 1];
      if (target >= newest.t) {
        // Ran dry. Coast along the road, but only so far — past a quarter of a
        // second the guess is worse than admitting we don't know, and a car
        // frozen briefly reads better than one confidently in the wrong place.
        return advance(newest, Math.min(target - newest.t, maxExtrapMs));
      }
      const oldest = samples[0];
      if (target <= oldest.t) return Object.assign({}, oldest, { extrapolated: false });
      for (let i = samples.length - 1; i > 0; i--) {
        const a = samples[i - 1], b = samples[i];
        if (target >= a.t && target <= b.t) {
          const span = b.t - a.t;
          return blend(a, b, span > 0 ? (target - a.t) / span : 0);
        }
      }
      return Object.assign({}, newest, { extrapolated: false });
    }

    return {
      push, sample,
      // Where the rival actually IS, as opposed to where it is DRAWN. Contact
      // must be resolved against this: sample() deliberately returns the pose
      // delayMs in the past, and hitting a car where it was 100 ms ago is a
      // phantom collision at one end and a missed one at the other. Same code
      // path, just without the delay — so it extrapolates along the road and is
      // bounded exactly as sample() is.
      predict: (nowMs) => sample(nowMs + delayMs),
      size: () => samples.length,
      newest: () => (samples.length ? samples[samples.length - 1] : null),
      oldest: () => (samples.length ? samples[0] : null),
      clear: () => { samples = []; },
    };
  }

  return {
    TYPE_SNAPSHOT, CAR_BYTES,
    encodeSnapshot, decodeSnapshot, packetType,
    // Shared with session.js, which decodes off the same channel.
    toView,
    createInterp,
  };
})();
