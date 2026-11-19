"use strict";

const NetSnapshot = (function () {
  const TYPE_SNAPSHOT = 1;
  const TYPE_AGED = 2;

  const CAR_BYTES = 13;
  const AGED_BYTES = CAR_BYTES + 2;
  const SNAP_HEADER = 6;
  const MAX_AGE_MS = 65535;

  const TAU = Math.PI * 2;
  const MAX_AHEAD_MS = 3000;
  const MAX_INTERP_GAP_MS = 500;
  const U16 = 65536;

  const F_DEPLOY = 0x10, F_OFFROAD = 0x20, F_KERB = 0x40, F_BRAKE = 0x80;

  const clamp = M4.clamp;
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

  function wireId(id) {
    return Number.isInteger(id) && id >= 0 && id <= 255;
  }

  const validEntry = (e) => !!e && wireId(e.id);
  const validAged = (e) => !!e && wireId(e.id) && Number.isFinite(e.at);
  function encodeSnapshot(tick, entries) {
    const src = entries || [];
    let n = 0;
    for (let i = 0; i < src.length && n < 255; i++) if (validEntry(src[i])) n++;
    const buf = new ArrayBuffer(SNAP_HEADER + n * CAR_BYTES);
    const dv = new DataView(buf);
    dv.setUint8(0, TYPE_SNAPSHOT);
    dv.setUint32(1, tick >>> 0);
    dv.setUint8(5, n);
    let off = SNAP_HEADER;
    for (let i = 0, w = 0; w < n; i++) {
      const e = src[i];
      if (!validEntry(e)) continue;
      off = writeCar(dv, off, e.id, e.car); w++;
    }
    return new Uint8Array(buf);
  }

  function encodeAged(entries) {
    const src = entries || [];
    let tick = -Infinity, n = 0;
    for (let i = 0; i < src.length && n < 255; i++) {
      const e = src[i];
      if (!validAged(e)) continue;
      n++;
      if (e.at > tick) tick = e.at;
    }
    const buf = new ArrayBuffer(SNAP_HEADER + n * AGED_BYTES);
    const dv = new DataView(buf);
    const t = n ? Math.round(tick) : 0;
    dv.setUint8(0, TYPE_AGED);
    dv.setUint32(1, t >>> 0);
    dv.setUint8(5, n);
    let off = SNAP_HEADER;
    for (let i = 0, w = 0; w < n; i++) {
      const e = src[i];
      if (!validAged(e)) continue;
      off = writeCar(dv, off, e.id, e.car);
      dv.setUint16(off, clamp(Math.round(t - e.at), 0, MAX_AGE_MS)); off += 2; w++;
    }
    return new Uint8Array(buf);
  }

  const dropCounts = Object.create(null);
  function dropped(reason) {
    const n = (dropCounts[reason] = (dropCounts[reason] || 0) + 1);
    if (n === 1 || n % 256 === 0) Log.debug("net", "snapshot dropped (" + reason + "), count " + n);
    return null;
  }

  function decodeSnapshot(bytes) {
    const dv = toView(bytes);
    if (!dv || dv.byteLength < SNAP_HEADER) return dropped("short or non-binary");
    const type = dv.getUint8(0);
    if (type !== TYPE_SNAPSHOT && type !== TYPE_AGED) return dropped("type " + type);
    const aged = type === TYPE_AGED;
    const n = dv.getUint8(5);
    const per = aged ? AGED_BYTES : CAR_BYTES;
    if (dv.byteLength < SNAP_HEADER + n * per) return dropped("truncated car list");
    const cars = [];
    let off = SNAP_HEADER;
    for (let i = 0; i < n; i++) {
      const car = readCar(dv, off);
      car.age = aged ? dv.getUint16(off + CAR_BYTES) : 0;
      cars.push(car); off += per;
    }
    return { type, tick: dv.getUint32(1), cars };
  }

  function toView(bytes) {
    if (!bytes) return null;
    if (bytes instanceof DataView) return bytes;
    if (bytes instanceof ArrayBuffer) return new DataView(bytes);
    if (ArrayBuffer.isView(bytes)) return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return null;
  }

  function createInterp(opts) {
    return NetInterp.create(opts, { TAU, MAX_AHEAD_MS, MAX_INTERP_GAP_MS, dropped });
  }

  return {
    TYPE_SNAPSHOT, TYPE_AGED, CAR_BYTES, AGED_BYTES, MAX_AHEAD_MS, MAX_INTERP_GAP_MS, encodeAged,
    encodeSnapshot, decodeSnapshot,
    toView,
    createInterp,
  };
})();
Object.freeze(NetSnapshot);
