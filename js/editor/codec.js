const TrackCodec = (function () {
  "use strict";
  const MAGIC = "APXT1", VERSION = 1, VERSION_PROPS = 2;
  const MAX_CODE = 4096, MAX_BYTES = 16384, MAX_N = 200, MIN_N = 8, UNIT = 4 , COORD_MAX = 10000 * UNIT;
  const FLAG = { hwZones: 1, bankZones: 2, elevations: 4, bridges: 8, name: 16, look: 32, country: 64, heights: 128 };
  const FLAG_ALL = 0xff;
  const KERB_STYLES = ["flat", "sausage", "rumble"];
  function surfaceByte(it) {
    let k = KERB_STYLES.indexOf(it && it.kerbStyle);
    if (k < 0) k = 0;
    const noBerm = it && it.berms === false ? 4 : 0;
    return (k & 3) | noBerm;
  }
  function applySurfaceByte(design, b) {
    if (!Number.isFinite(b) || (b & ~7) || (b & 3) > 2) return false;
    const k = b & 3;
    if (k) design.kerbStyle = KERB_STYLES[k];
    if (b & 4) design.berms = false;
    return true;
  }
  const ZONE_CAPS = { hwZones: 24, bankZones: 24, elevations: 24, bridges: 24 };
  const NO_EASE = 255;

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
  const u16frac = (f) => { if (!Number.isFinite(f)) return 0; if (f < 0 || f > 1) f = ((f % 1) + 1) % 1; return Math.min(65535, Math.round(f * 65535)); };
  const fracU16 = (v) => (v === 65535 ? (65535 - 0.25) / 65535 : v / 65535);

  function encodeBytes(it, withName = true) {
    for (const k of Object.keys(ZONE_CAPS)) if (Array.isArray(it[k]) && it[k].length > ZONE_CAPS[k]) throw new RangeError("zones");
    const w = writer();
    const themeIdx = Math.max(0, TrackThemes.ORDER.indexOf(it.theme));
    const zones = { hwZones: it.hwZones || [], bankZones: it.bankZones || [], elevations: it.elevations || [], bridges: it.bridges || [] };
    let flags = 0;
    for (const k of Object.keys(ZONE_CAPS)) if (zones[k].length) flags |= FLAG[k];
    const name = withName && it.name ? new TextEncoder().encode(String(it.name).slice(0, 48)) : null;
    if (name && name.length) flags |= FLAG.name;
    const country = withName && it.country ? new TextEncoder().encode(String(it.country).slice(0, 32)) : null;
    if (country && country.length) flags |= FLAG.country;
    const look = TrackThemes.sanitizeLook(it.look);
    if (look) flags |= FLAG.look;
    const hs = Array.isArray(it.heights) ? it.heights : null;
    let hasH = false;
    if (hs && hs.length === it.pts.length) for (let i = 0; i < hs.length; i++) if (hs[i]) { hasH = true; break; }
    if (hasH) flags |= FLAG.heights;
    const props = (typeof TrackDesignerProps !== "undefined" && TrackDesignerProps.sanitize)
      ? TrackDesignerProps.sanitize(it.props) : null;
    const ver = props && props.length ? VERSION_PROPS : VERSION;
    w.u8(ver).u8(flags).u8(themeIdx).u8(Math.round(it.baseHW * 10)).varint(it.seed >>> 0).varint(it.pts.length);
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
    if (flags & FLAG.country) { w.u8(country.length).bytes(country); }
    if (flags & FLAG.heights) {
      let py = q(hs[0] || 0), dy = 0;
      w.zz(py);
      for (let i = 1; i < hs.length; i++) {
        const y = q(hs[i] || 0), ndy = y - py;
        if (i === 1) w.zz(ndy); else w.zz(ndy - dy);
        dy = ndy; py = y;
      }
    }
    if (ver === VERSION_PROPS) {
      const kinds = TrackDesignerProps.KINDS;
      w.varint(props.length);
      for (const p of props) {
        w.u8(kinds.indexOf(p.kind));
        w.u16(u16frac(p.s));
        w.u8(p.side < 0 ? 0 : 1);
        w.u8(Math.min(255, Math.max(0, p.gap | 0)));
      }
    }
    const surf = surfaceByte(it);
    if (surf) w.u8(surf);
    const body = w.out();
    const all = new Uint8Array(body.length + 2);
    all.set(body); const c = fnv16(body, body.length); all[body.length] = c & 0xff; all[body.length + 1] = c >> 8;
    return all;
  }
  function decodeBytes(bytes) {
    try {
      if (!bytes || bytes.length < 12 || bytes.length > MAX_BYTES) return { ok: false, reason: "bounds" };
      const bodyLen = bytes.length - 2;
      if (fnv16(bytes, bodyLen) !== (bytes[bodyLen] | (bytes[bodyLen + 1] << 8))) return { ok: false, reason: "check" };
      const r = reader(bytes.subarray(0, bodyLen));
      const ver = r.u8(); if (ver !== VERSION && ver !== VERSION_PROPS) return { ok: false, reason: "version" };
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
      if (flags & FLAG.country) { const n = r.u8(); if (n > 96) return { ok: false, reason: "bounds" }; design.country = new TextDecoder().decode(r.bytes(n)); }
      if (flags & FLAG.heights) {
        const heights = [];
        let y = r.zz(), dy = 0;
        const pushH = () => { if (Math.abs(y) > COORD_MAX) throw new RangeError("bounds"); heights.push(y / UNIT); };
        pushH();
        for (let i = 1; i < N; i++) {
          if (i === 1) dy = r.zz(); else dy += r.zz();
          y += dy; pushH();
        }
        design.heights = heights;
      }
      if (ver === VERSION_PROPS) {
        if (typeof TrackDesignerProps === "undefined" || !TrackDesignerProps.KINDS) return { ok: false, reason: "corrupt" };
        const n = r.varint(), kinds = TrackDesignerProps.KINDS, max = TrackDesignerProps.TOTAL || 16;
        if (n > max) return { ok: false, reason: "bounds" };
        const props = [];
        for (let i = 0; i < n; i++) {
          const ki = r.u8(); if (ki >= kinds.length) return { ok: false, reason: "bounds" };
          const s = fracU16(r.u16()), side = r.u8() ? 1 : -1, gap = r.u8();
          props.push({ kind: kinds[ki], s, side, gap });
        }
        design.props = props;
      }
      if (r.left === 1) {
        if (!applySurfaceByte(design, r.u8())) return { ok: false, reason: "bounds" };
      } else if (r.left !== 0) {
        return { ok: false, reason: "corrupt" };
      }
      return { ok: true, design };
    } catch (e) {
      return { ok: false, reason: e instanceof RangeError && e.message === "bounds" ? "bounds" : "corrupt" };
    }
  }

  async function deflate(bytes) {
    if (typeof CompressionStream === "undefined") return null;
    try {
      const cs = new CompressionStream("deflate-raw");
      const wr = cs.writable.getWriter();
      const fed = Promise.all([wr.write(bytes), wr.close()]).catch(() => null);
      const out = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      await fed;
      return out;
    } catch (_) { return null; }
  }
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
  async function encode(design) {
    const it = CustomTracks.sanitize(design);
    if (!it) return null;
    let bytes;
    try { bytes = encodeBytes(it, true); } catch (e) { if (typeof Log !== "undefined") Log.warn("track", "share code refused: " + (e && e.message || e)); return null; }
    const magic = "APXT" + bytes[0];
    const plain = magic + ".p." + b64url(bytes);
    const z = await deflate(bytes);
    if (z && z.length < bytes.length - 8) { const zc = magic + ".z." + b64url(z); if (zc.length < plain.length) return zc; }
    return plain;
  }
  async function decode(code) {
    try {
      const s = String(code || "").trim();
      if (s.length > MAX_CODE) return { ok: false, reason: "bounds" };
      const m = /^APXT(\d+)\.([pz])\.([A-Za-z0-9_-]+)$/.exec(s);
      if (!m) return { ok: false, reason: "magic" };
      const outer = +m[1];
      if (outer !== VERSION && outer !== VERSION_PROPS) return { ok: false, reason: "version" };
      let bytes = unb64url(m[3]);
      if (!bytes) return { ok: false, reason: "corrupt" };
      if (m[2] === "z") { const z = await inflate(bytes); if (!z.ok) return z; bytes = z.bytes; }
      if (bytes[0] !== outer) return { ok: false, reason: "version" };
      const d = decodeBytes(bytes);
      if (!d.ok) return d;
      const it = CustomTracks.sanitize(d.design);
      if (!it) return { ok: false, reason: "geometry" };
      return { ok: true, design: it, id: it.id };
    } catch (_) { return { ok: false, reason: "corrupt" }; }
  }

  const HASH_KEY = "track";
  function shareUrl(code, base) {
    const native = typeof Native !== "undefined" && Native.isNative();
    const b = base || (native ? "https://brycejmurrin.github.io/f1-game/" : (typeof location !== "undefined" ? location.origin + location.pathname : ""));
    return b + "#" + HASH_KEY + "=" + code;
  }
  function fromHash(hash) {
    const m = /(?:^#|&)track=([^&]+)/.exec(String(hash || ""));
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (_) { return null; }
  }
  function withoutTrack(hash) {
    const rest = String(hash || "").replace(/^#/, "").split("&").filter((p) => p && !p.startsWith(HASH_KEY + "="));
    return rest.length ? "#" + rest.join("&") : "";
  }
  const FILE_FORMAT = "apex26.track";
  function fileEnvelope(design, code) {
    return { format: FILE_FORMAT, v: 1, build: (typeof window !== "undefined" && window.__APEX_BUILD) || null, exportedAt: new Date().toISOString(), code: code || null, design };
  }
  function fromFile(obj) {
    if (!obj || typeof obj !== "object" || obj.format !== FILE_FORMAT) return null;
    if (typeof obj.code === "string") return { code: obj.code };
    if (obj.design && typeof obj.design === "object") return { design: obj.design };
    return null;
  }

  return { MAGIC, FLAG, ZONE_CAPS, surfaceByte, encodeBytes, decodeBytes, encode, decode, inflate, b64url, fnv16, shareUrl, fromHash, withoutTrack, fileEnvelope, fromFile, FILE_FORMAT };
})();
Object.freeze(TrackCodec);
