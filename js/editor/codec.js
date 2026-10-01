/* Apex 26 — TrackCodec: the share code for a custom circuit. `APXT1.p.<base64url>`
   is a compact binary record — theme, width, seed, the control loop as
   second-order deltas on the 0.25 m lattice, the zone lists and the name, with
   a 16-bit FNV check — and `APXT1.z.…` the same bytes through deflate-raw
   (CompressionStream, Baseline 2023) when that is shorter. The code rides a URL
   fragment (`#track=`, never sent to the host) and the JSON file envelope.
   Decoding is DEFENSIVE: every field is bounded, nothing throws, and the design
   that comes out is re-sanitised by CustomTracks before anyone keeps it. The
   same lattice as storage means a code's content id matches on both ends.
   Mirrors js/car/ghost-share.js. LAZY_EDITOR; no eval-time dependencies. */
const TrackCodec = (function () {
  "use strict";
  const MAGIC = "APXT1", VERSION = 1;
  const MAX_CODE = 4096, MAX_BYTES = 16384, MAX_N = 200, MIN_N = 8, UNIT = 4 /* per metre */, COORD_MAX = 10000 * UNIT;
  const FLAG = { hwZones: 1, bankZones: 2, elevations: 4, bridges: 8, name: 16 };
  const ZONE_CAPS = { hwZones: 16, bankZones: 24, elevations: 12, bridges: 4 };

  // ── byte writer / reader ────────────────────────────────────────────────
  function writer() {
    const buf = [];
    const w = {
      u8: (v) => { buf.push(v & 0xff); return w; },
      u16: (v) => { buf.push(v & 0xff, (v >>> 8) & 0xff); return w; },
      varint: (v) => { v = Math.max(0, Math.floor(v)); do { let b = v & 0x7f; v = Math.floor(v / 128); if (v) b |= 0x80; buf.push(b); } while (v); return w; },
      zz: (v) => w.varint(v >= 0 ? v * 2 : -v * 2 - 1),
      bytes: (arr) => { for (const b of arr) buf.push(b & 0xff); return w; },
      out: () => Uint8Array.from(buf),
    };
    return w;
  }
  function reader(bytes) {
    let i = 0;
    const fail = () => { throw new RangeError("corrupt"); };
    const r = {
      get pos() { return i; }, get left() { return bytes.length - i; },
      u8: () => (i < bytes.length ? bytes[i++] : fail()),
      u16: () => { const a = r.u8(), b = r.u8(); return a | (b << 8); },
      varint: () => { let v = 0, m = 1, k = 0; for (;;) { const b = r.u8(); v += (b & 0x7f) * m; if (!(b & 0x80)) return v; m *= 128; if (++k > 7) fail(); } },
      zz: () => { const u = r.varint(); return u % 2 ? -(u + 1) / 2 : u / 2; },
      bytes: (n) => { if (i + n > bytes.length) fail(); const s = bytes.subarray(i, i + n); i += n; return s; },
    };
    return r;
  }
  function fnv16(bytes, end) {
    let h = 0x811c9dc5;
    for (let i = 0; i < end; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0) & 0xffff;
  }
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function b64url(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      s += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
      if (i + 1 < bytes.length) s += B64[((b & 15) << 2) | (c >> 6)];
      if (i + 2 < bytes.length) s += B64[c & 63];
    }
    return s;
  }
  function unb64url(s) {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
    const out = [];
    let bits = 0, acc = 0;
    for (const ch of s) { acc = (acc << 6) | B64.indexOf(ch); bits += 6; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); } }
    return Uint8Array.from(out);
  }
  const u16frac = (f) => Math.round((((f % 1) + 1) % 1) * 65535);

  // ── encode ──────────────────────────────────────────────────────────────
  /** The raw bytes for a (sanitised) design; name omitted when withName is false (the content id's canon). */
  function encodeBytes(it, withName = true) {
    const w = writer();
    const themeIdx = Math.max(0, TrackThemes.ORDER.indexOf(it.theme));
    const zones = { hwZones: it.hwZones || [], bankZones: it.bankZones || [], elevations: it.elevations || [], bridges: it.bridges || [] };
    let flags = 0;
    for (const k of Object.keys(ZONE_CAPS)) if (zones[k].length) flags |= FLAG[k];
    const name = withName && it.name ? new TextEncoder().encode(String(it.name).slice(0, 48)) : null;
    if (name && name.length) flags |= FLAG.name;
    w.u8(VERSION).u8(flags).u8(themeIdx).u8(Math.round(it.baseHW * 10)).varint(it.seed >>> 0).varint(it.pts.length);
    const q = (v) => Math.round(v * UNIT);
    let px = q(it.pts[0][0]), pz = q(it.pts[0][1]);
    w.zz(px).zz(pz);
    let dx = 0, dz = 0;
    for (let i = 1; i < it.pts.length; i++) {
      const x = q(it.pts[i][0]), z = q(it.pts[i][1]);
      const ndx = x - px, ndz = z - pz;
      if (i === 1) w.zz(ndx).zz(ndz); else w.zz(ndx - dx).zz(ndz - dz);
      dx = ndx; dz = ndz; px = x; pz = z;
    }
    if (flags & FLAG.hwZones) { w.varint(Math.min(ZONE_CAPS.hwZones, zones.hwZones.length)); for (const z of zones.hwZones.slice(0, ZONE_CAPS.hwZones)) w.u16(u16frac(z.s0)).u16(u16frac(z.s1)).u8(Math.round(z.hw * 10)).u8(Math.round((z.ease != null ? z.ease : 0.025) * 1000)); }
    if (flags & FLAG.bankZones) { w.varint(Math.min(ZONE_CAPS.bankZones, zones.bankZones.length)); for (const z of zones.bankZones.slice(0, ZONE_CAPS.bankZones)) w.u16(u16frac(z.frac)).zz(Math.round(z.angleDeg * 4)).u16(Math.round(z.widthM)); }
    for (const k of ["elevations", "bridges"]) if (flags & FLAG[k]) { w.varint(Math.min(ZONE_CAPS[k], zones[k].length)); for (const z of zones[k].slice(0, ZONE_CAPS[k])) w.u16(u16frac(z.s)).u16(Math.round(z.halfM)).zz(Math.round(z.rise * 4)); }
    if (flags & FLAG.name) { w.u8(name.length).bytes(name); }
    const body = w.out();
    const all = new Uint8Array(body.length + 2);
    all.set(body); const c = fnv16(body, body.length); all[body.length] = c & 0xff; all[body.length + 1] = c >> 8;
    return all;
  }
  /** Bytes → design (plain object for CustomTracks.sanitize) or { ok: false, reason }. Never throws. */
  function decodeBytes(bytes) {
    try {
      if (!bytes || bytes.length < 12 || bytes.length > MAX_BYTES) return { ok: false, reason: "bounds" };
      const bodyLen = bytes.length - 2;
      if (fnv16(bytes, bodyLen) !== (bytes[bodyLen] | (bytes[bodyLen + 1] << 8))) return { ok: false, reason: "check" };
      const r = reader(bytes.subarray(0, bodyLen));
      const ver = r.u8(); if (ver !== VERSION) return { ok: false, reason: "version" };
      const flags = r.u8(); if (flags & ~0x1f) return { ok: false, reason: "corrupt" };
      const themeIdx = r.u8(); if (themeIdx >= TrackThemes.ORDER.length) return { ok: false, reason: "theme" };
      const baseHW = r.u8() / 10; if (baseHW < 5 || baseHW > 8) return { ok: false, reason: "bounds" };
      const seed = r.varint(); if (seed > 0xffffffff) return { ok: false, reason: "bounds" };
      const N = r.varint(); if (N < MIN_N || N > MAX_N) return { ok: false, reason: "bounds" };
      const pts = [];
      let x = r.zz(), z = r.zz(), dx = 0, dz = 0;
      const push = () => { if (Math.abs(x) > COORD_MAX || Math.abs(z) > COORD_MAX) throw new RangeError("bounds"); pts.push([x / UNIT, z / UNIT]); };
      push();
      for (let i = 1; i < N; i++) {
        if (i === 1) { dx = r.zz(); dz = r.zz(); } else { dx += r.zz(); dz += r.zz(); }
        x += dx; z += dz; push();
      }
      const design = { theme: TrackThemes.ORDER[themeIdx], baseHW, seed, pts };
      if (flags & FLAG.hwZones) { const n = r.varint(); if (n > ZONE_CAPS.hwZones) return { ok: false, reason: "bounds" }; design.hwZones = []; for (let i = 0; i < n; i++) design.hwZones.push({ s0: r.u16() / 65535, s1: r.u16() / 65535, hw: r.u8() / 10, ease: r.u8() / 1000 }); }
      if (flags & FLAG.bankZones) { const n = r.varint(); if (n > ZONE_CAPS.bankZones) return { ok: false, reason: "bounds" }; design.bankZones = []; for (let i = 0; i < n; i++) design.bankZones.push({ frac: r.u16() / 65535, angleDeg: r.zz() / 4, widthM: r.u16() }); }
      for (const k of ["elevations", "bridges"]) if (flags & FLAG[k]) { const n = r.varint(); if (n > ZONE_CAPS[k]) return { ok: false, reason: "bounds" }; design[k] = []; for (let i = 0; i < n; i++) design[k].push({ s: r.u16() / 65535, halfM: r.u16(), rise: r.zz() / 4 }); }
      if (flags & FLAG.name) { const n = r.u8(); if (n > 48) return { ok: false, reason: "bounds" }; design.name = new TextDecoder().decode(r.bytes(n)); }
      if (r.left !== 0) return { ok: false, reason: "corrupt" };
      return { ok: true, design };
    } catch (e) {
      return { ok: false, reason: e instanceof RangeError && e.message === "bounds" ? "bounds" : "corrupt" };
    }
  }

  // ── the code string ─────────────────────────────────────────────────────
  async function deflate(bytes) {
    if (typeof CompressionStream === "undefined") return null;
    try {
      const cs = new CompressionStream("deflate-raw");
      const wr = cs.writable.getWriter();
      // Settle the writer's own promises too: an unhandled rejection after the
      // caller moved on is a crash report nobody asked for.
      const fed = Promise.all([wr.write(bytes), wr.close()]).catch(() => null);
      const out = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      await fed;
      return out;
    } catch (_) { return null; }
  }
  async function inflate(bytes) {
    if (typeof DecompressionStream === "undefined") return null;
    try {
      const ds = new DecompressionStream("deflate-raw");
      const wr = ds.writable.getWriter();
      const fed = Promise.all([wr.write(bytes), wr.close()]).catch(() => null);
      let buf = null;
      try { buf = await new Response(ds.readable).arrayBuffer(); } catch (_) { buf = null; }
      await fed;
      return !buf || buf.byteLength > MAX_BYTES ? null : new Uint8Array(buf);
    } catch (_) { return null; }
  }
  /** design → "APXT1.p.…" (or "APXT1.z.…" when deflate is shorter). */
  async function encode(design) {
    const it = CustomTracks.sanitize(design);
    if (!it) return null;
    const bytes = encodeBytes(it, true);
    const plain = MAGIC + ".p." + b64url(bytes);
    const z = await deflate(bytes);
    if (z && z.length < bytes.length - 8) { const zc = MAGIC + ".z." + b64url(z); if (zc.length < plain.length) return zc; }
    return plain;
  }
  /** "APXT1.…" → { ok, design (sanitised), id } or { ok: false, reason }. Never throws. */
  async function decode(code) {
    try {
      const s = String(code || "").trim();
      if (s.length > MAX_CODE) return { ok: false, reason: "bounds" };
      const m = /^APXT(\d+)\.([pz])\.([A-Za-z0-9_-]+)$/.exec(s);
      if (!m) return { ok: false, reason: "magic" };
      if (m[1] !== String(VERSION)) return { ok: false, reason: "version" };
      let bytes = unb64url(m[3]);
      if (!bytes) return { ok: false, reason: "corrupt" };
      if (m[2] === "z") { bytes = await inflate(bytes); if (!bytes) return { ok: false, reason: "corrupt" }; }
      const d = decodeBytes(bytes);
      if (!d.ok) return d;
      const it = CustomTracks.sanitize(d.design);
      if (!it) return { ok: false, reason: "geometry" };
      return { ok: true, design: it, id: it.id };
    } catch (_) { return { ok: false, reason: "corrupt" }; }
  }

  // ── URL + file envelopes ────────────────────────────────────────────────
  const HASH_KEY = "track";
  function shareUrl(code, base) {
    const b = base || (typeof location !== "undefined" ? location.origin + location.pathname : "");
    return b + "#" + HASH_KEY + "=" + code;
  }
  /** The code in a location hash, or null. */
  function fromHash(hash) {
    const m = /(?:^#|&)track=([^&]+)/.exec(String(hash || ""));
    return m ? decodeURIComponent(m[1]) : null;
  }
  /** The hash with only #track= removed (other fragments kept). */
  function withoutTrack(hash) {
    const rest = String(hash || "").replace(/^#/, "").split("&").filter((p) => p && !p.startsWith(HASH_KEY + "="));
    return rest.length ? "#" + rest.join("&") : "";
  }
  const FILE_FORMAT = "apex26.track";
  function fileEnvelope(design, code) {
    return { format: FILE_FORMAT, v: 1, build: (typeof window !== "undefined" && window.__APEX_BUILD) || null, exportedAt: new Date().toISOString(), code: code || null, design };
  }
  /** A parsed file → the code or the design it carries ({ code } | { design } | null). */
  function fromFile(obj) {
    if (!obj || typeof obj !== "object" || obj.format !== FILE_FORMAT) return null;
    if (typeof obj.code === "string") return { code: obj.code };
    if (obj.design && typeof obj.design === "object") return { design: obj.design };
    return null;
  }

  return { MAGIC, VERSION, FLAG, ZONE_CAPS, MAX_CODE, encodeBytes, decodeBytes, encode, decode, b64url, unb64url, fnv16, shareUrl, fromHash, withoutTrack, fileEnvelope, fromFile, FILE_FORMAT };
})();
Object.freeze(TrackCodec);
