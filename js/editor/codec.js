/* Apex 26 — TrackCodec: the share code for a custom circuit. `APXT1.p.<base64url>`
   is a compact binary record — theme, width, seed, the control loop as
   second-order deltas on the 0.25 m lattice, the zone lists and the name, with
   a 16-bit FNV check — and `APXT1.z.…` the same bytes through deflate-raw
   (CompressionStream, Baseline 2023) when that is shorter. The code rides a URL
   fragment (`#track=`, never sent to the host) and the JSON file envelope.
   Decoding is DEFENSIVE: every field is bounded, nothing public throws (a
   refusal is { ok: false, reason } or null), and the design that comes out is
   re-sanitised by CustomTracks before anyone keeps it. The same lattice and the
   same zone caps as storage (CustomTracks.LIMITS.zones) mean a code's content
   id matches on both ends — tests/unit/track-codec.test.mjs pins it.
   Mirrors js/car/ghost-share.js. LAZY_EDITOR; no eval-time dependencies. */
const TrackCodec = (function () {
  "use strict";
  const MAGIC = "APXT1", VERSION = 1;
  const MAX_CODE = 4096, MAX_BYTES = 16384, MAX_N = 200, MIN_N = 8, UNIT = 4 /* per metre */, COORD_MAX = 10000 * UNIT;
  // look (32): the scenery options (TrackThemes.LOOK) as one byte, written only
  // when one is off its default — so every code made before it is unchanged.
  const FLAG = { hwZones: 1, bankZones: 2, elevations: 4, bridges: 8, name: 16, look: 32 };
  const FLAG_ALL = 0x3f;
  // = CustomTracks.LIMITS.zones for every list: a lower cap here silently
  // dropped what storage keeps (a dropped bridge turned into a RED crossing on
  // the receiver). 24 of each is ~600 bytes, well inside MAX_CODE.
  const ZONE_CAPS = { hwZones: 24, bankZones: 24, elevations: 24, bridges: 24 };
  // A hwZone with no `ease` (older stores) rides as this byte, so the receiver
  // rebuilds the SAME record (and id) instead of gaining the 0.025 default.
  // Stored ease tops out at 0.2 → 200, so 255 is never a real value.
  const NO_EASE = 255;

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
  // Lap fractions on the storage lattice (k / 65535). CustomTracks' frac()
  // rounds 0.9999995 UP to exactly 1.0 and keeps it, but maps an incoming 1.0
  // to 0 — so 1.0 rides as 65535 (not wrapped to 0) and 65535 decodes a
  // quarter-step below 1, which that sanitiser rounds back to the sender's
  // 1.0 (and a wrap-to-0 sanitiser to 0). Either way the round trip is exact.
  const u16frac = (f) => { if (!Number.isFinite(f)) return 0; if (f < 0 || f > 1) f = ((f % 1) + 1) % 1; return Math.min(65535, Math.round(f * 65535)); };
  const fracU16 = (v) => (v === 65535 ? (65535 - 0.25) / 65535 : v / 65535);

  // ── encode ──────────────────────────────────────────────────────────────
  /** The raw bytes for a (sanitised) design; name omitted when withName is false (the content id's canon).
   *  Throws RangeError("zones") for a list over ZONE_CAPS — encode() turns that
   *  into a refusal; a share code never silently drops what storage keeps. */
  function encodeBytes(it, withName = true) {
    for (const k of Object.keys(ZONE_CAPS)) if (Array.isArray(it[k]) && it[k].length > ZONE_CAPS[k]) throw new RangeError("zones");
    const w = writer();
    const themeIdx = Math.max(0, TrackThemes.ORDER.indexOf(it.theme));
    const zones = { hwZones: it.hwZones || [], bankZones: it.bankZones || [], elevations: it.elevations || [], bridges: it.bridges || [] };
    let flags = 0;
    for (const k of Object.keys(ZONE_CAPS)) if (zones[k].length) flags |= FLAG[k];
    const name = withName && it.name ? new TextEncoder().encode(String(it.name).slice(0, 48)) : null;
    if (name && name.length) flags |= FLAG.name;
    const look = TrackThemes.sanitizeLook(it.look);
    if (look) flags |= FLAG.look;
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
    if (flags & FLAG.hwZones) { w.varint(zones.hwZones.length); for (const z of zones.hwZones) w.u16(u16frac(z.s0)).u16(u16frac(z.s1)).u8(Math.round(z.hw * 10)).u8(Number.isFinite(z.ease) ? Math.min(200, Math.max(0, Math.round(z.ease * 1000))) : NO_EASE); }
    if (flags & FLAG.bankZones) { w.varint(zones.bankZones.length); for (const z of zones.bankZones) w.u16(u16frac(z.frac)).zz(Math.round(z.angleDeg * 4)).u16(Math.round(z.widthM)); }
    for (const k of ["elevations", "bridges"]) if (flags & FLAG[k]) { w.varint(zones[k].length); for (const z of zones[k]) w.u16(u16frac(z.s)).u16(Math.round(z.halfM)).zz(Math.round(z.rise * 4)); }
    if (flags & FLAG.name) { w.u8(name.length).bytes(name); }
    if (flags & FLAG.look) { const L = TrackThemes.LOOK; w.u8(L.time.indexOf(look.time) | (L.trees.indexOf(look.trees) << 2) | (L.crowd.indexOf(look.crowd) << 4)); }
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
      const flags = r.u8(); if (flags & ~FLAG_ALL) return { ok: false, reason: "corrupt" };
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
      if (flags & FLAG.hwZones) {
        const n = r.varint(); if (n > ZONE_CAPS.hwZones) return { ok: false, reason: "bounds" };
        design.hwZones = [];
        for (let i = 0; i < n; i++) { const z = { s0: fracU16(r.u16()), s1: fracU16(r.u16()), hw: r.u8() / 10 }, e = r.u8(); if (e !== NO_EASE) z.ease = e / 1000; design.hwZones.push(z); }
      }
      if (flags & FLAG.bankZones) { const n = r.varint(); if (n > ZONE_CAPS.bankZones) return { ok: false, reason: "bounds" }; design.bankZones = []; for (let i = 0; i < n; i++) design.bankZones.push({ frac: fracU16(r.u16()), angleDeg: r.zz() / 4, widthM: r.u16() }); }
      for (const k of ["elevations", "bridges"]) if (flags & FLAG[k]) { const n = r.varint(); if (n > ZONE_CAPS[k]) return { ok: false, reason: "bounds" }; design[k] = []; for (let i = 0; i < n; i++) design[k].push({ s: fracU16(r.u16()), halfM: r.u16(), rise: r.zz() / 4 }); }
      if (flags & FLAG.name) { const n = r.u8(); if (n > 48) return { ok: false, reason: "bounds" }; design.name = new TextDecoder().decode(r.bytes(n)); }
      if (flags & FLAG.look) {
        const b = r.u8(), L = TrackThemes.LOOK, t = b & 3, tr = (b >> 2) & 3, c = (b >> 4) & 3;
        if (b >> 6 || t >= L.time.length || tr >= L.trees.length || c >= L.crowd.length) return { ok: false, reason: "bounds" };
        design.look = { time: L.time[t], trees: L.trees[tr], crowd: L.crowd[c] };
      }
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
  /** deflate-raw bytes → { ok, bytes } | { ok: false, reason }. Read chunk by
   *  chunk under a running MAX_BYTES cap and cancelled past it: a 4 KiB code
   *  can inflate to megabytes, and buffering all of it first was the cost. */
  async function inflate(bytes) {
    if (typeof DecompressionStream === "undefined") return { ok: false, reason: "unsupported" };
    let rd = null;
    try {
      const ds = new DecompressionStream("deflate-raw");
      const wr = ds.writable.getWriter();
      const fed = Promise.all([wr.write(bytes), wr.close()]).catch(() => null);
      rd = ds.readable.getReader();
      const parts = [];
      let total = 0;
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) { rd.cancel().catch(() => null); return { ok: false, reason: "bounds" }; }
        parts.push(value);
      }
      await fed;
      const out = new Uint8Array(total);
      let at = 0;
      for (const p of parts) { out.set(p, at); at += p.byteLength; }
      return { ok: true, bytes: out };
    } catch (_) {
      if (rd) rd.cancel().catch(() => null);
      return { ok: false, reason: "corrupt" };
    }
  }
  /** design → "APXT1.p.…" (or "APXT1.z.…" when deflate is shorter). */
  async function encode(design) {
    const it = CustomTracks.sanitize(design);
    if (!it) return null;
    let bytes;
    try { bytes = encodeBytes(it, true); } catch (e) { if (typeof Log !== "undefined") Log.warn("track", "share code refused: " + (e && e.message || e)); return null; }
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
      if (m[2] === "z") { const z = await inflate(bytes); if (!z.ok) return z; bytes = z.bytes; }
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
  /** The code in a location hash, or null — also for a malformed %-escape
   *  (`#track=%E0%A4%A`), which decodeURIComponent throws on. */
  function fromHash(hash) {
    const m = /(?:^#|&)track=([^&]+)/.exec(String(hash || ""));
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (_) { return null; }
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

  return { MAGIC, VERSION, FLAG, ZONE_CAPS, MAX_CODE, MAX_BYTES, encodeBytes, decodeBytes, encode, decode, inflate, b64url, unb64url, fnv16, shareUrl, fromHash, withoutTrack, fileEnvelope, fromFile, FILE_FORMAT };
})();
Object.freeze(TrackCodec);
