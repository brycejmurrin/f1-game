/* GhostShare: portable APXG1 ghost envelopes and one in-memory guest rival. */
"use strict";

const GhostShare = (function () {
  const MAGIC = "APXG1";
  const MAX_FRAGMENT_CHARS = 14 * 1024;
  const MAX_CODE_CHARS = 64 * 1024;
  const MAX_DECODED_BYTES = 512 * 1024;
  const MIN_SAMPLES = 8;
  const CORRUPT = Object.freeze({ ok: false, reason: "corrupt" });
  let guestSlot = null;
  const atOut = { s: 0, x: 0, done: false };

  function validGhost(g) {
    if (!g || !(g.time > 0) || !Number.isFinite(g.time)) return false;
    const t = g.t, s = g.s, x = g.x;
    if (!Array.isArray(t) || !Array.isArray(s) || !Array.isArray(x) ||
        s.length < MIN_SAMPLES || t.length !== s.length || x.length !== s.length) return false;
    return t.every((v, i) => Number.isFinite(v) && Number.isFinite(s[i]) && Number.isFinite(x[i]) &&
      v >= 0 && (i === 0 || (v >= t[i - 1] && s[i] >= s[i - 1])));
  }

  function envelope(ghost, opts) {
    if (!validGhost(ghost)) return null;
    const o = opts || {};
    return {
      v: 1,
      kind: "ghost",
      track: typeof o.track === "string" && o.track ? o.track : null,
      context: typeof o.context === "string" && o.context ? o.context : null,
      day: typeof o.day === "string" && o.day ? o.day : null,
      time: ghost.time,
      meta: ghost.meta && typeof ghost.meta === "object" && !Array.isArray(ghost.meta) ? ghost.meta : null,
      t: ghost.t,
      s: ghost.s,
      x: ghost.x,
    };
  }

  const enc = () => new TextEncoder();
  const dec = () => new TextDecoder();
  function binary(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 0x4000) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x4000));
    }
    return out;
  }
  function bytesToB64url(bytes) {
    return btoa(binary(bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToBytes(text) {
    const raw = String(text || "");
    if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error("bad base64url");
    const s = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "=".repeat((4 - s.length % 4) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function canCompress() {
    return typeof CompressionStream === "function" && typeof DecompressionStream === "function" &&
      typeof Blob === "function" && typeof Response === "function";
  }
  async function deflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function inflate(bytes) {
    const reader = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_DECODED_BYTES) {
        await reader.cancel();
        throw new Error("inflate cap exceeded");
      }
      chunks.push(part.value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
    return out;
  }

  function fileExport(ghost, opts) {
    const body = envelope(ghost, opts);
    if (!body) return { ok: false, reason: "invalid" };
    const track = body.track || "ghost";
    const stamp = String(body.time.toFixed(3)).replace(".", "-");
    return {
      ok: true,
      name: "apex26-" + track + "-" + stamp + ".apexghost.json",
      text: JSON.stringify(body),
      envelope: body,
    };
  }

  function shareUrl(code) {
    try { return location.origin + location.pathname + "#ghost=" + code; }
    catch (_) { return null; }
  }

  async function encode(ghost, opts) {
    const file = fileExport(ghost, opts);
    if (!file.ok) return file;
    const plain = enc().encode(file.text);
    let mode = "p", bytes = plain;
    if (canCompress()) {
      try { bytes = await deflate(plain); mode = "z"; }
      catch (_) { bytes = plain; mode = "p"; }
    }
    const body = bytesToB64url(bytes);
    if (body.length > MAX_FRAGMENT_CHARS) return { ok: false, reason: "too-large", file };
    const code = MAGIC + "." + mode + "." + body;
    return { ok: true, code, url: shareUrl(code), bytes: bytes.byteLength, file };
  }

  function codeFrom(value) {
    let input = String(value || "").trim();
    if (input.startsWith(MAGIC + ".")) return input.replace(/\s+/g, "");
    const match = input.match(/(?:^|[#&])ghost=([^&]+)/);
    if (!match) return null;
    try { input = decodeURIComponent(match[1]); }
    catch (_) { return null; }
    return input.replace(/\s+/g, "");
  }

  function knownTrack(id) {
    return typeof id === "string" && typeof Tracks !== "undefined" && Array.isArray(Tracks.LIST) &&
      Tracks.LIST.some((track) => track && track.id === id);
  }

  async function decode(value) {
    const code = codeFrom(value);
    if (!code || code.length > MAX_CODE_CHARS) return CORRUPT;
    const parts = code.split(".");
    if (parts.length !== 3 || parts[0] !== MAGIC || (parts[1] !== "z" && parts[1] !== "p")) return CORRUPT;
    try {
      const packed = b64urlToBytes(parts[2]);
      if (parts[1] === "p" && packed.byteLength > MAX_DECODED_BYTES) return CORRUPT;
      if (parts[1] === "z" && !canCompress()) return CORRUPT;
      const bytes = parts[1] === "z" ? await inflate(packed) : packed;
      const body = JSON.parse(dec().decode(bytes));
      if (!body || body.v !== 1 || body.kind !== "ghost" || !validGhost(body) ||
          typeof body.track !== "string" || !body.track) return CORRUPT;
      if (!knownTrack(body.track)) return { ok: false, reason: "unknown-track" };
      return {
        ok: true,
        ghost: { time: body.time, t: body.t, s: body.s, x: body.x, meta: body.meta || undefined },
        track: body.track,
        context: typeof body.context === "string" ? body.context : null,
        day: typeof body.day === "string" ? body.day : null,
        meta: body.meta && typeof body.meta === "object" ? body.meta : null,
      };
    } catch (_) { return CORRUPT; }
  }

  function installGuest(decoded) {
    if (!decoded || decoded.ok === false || !validGhost(decoded.ghost) ||
        typeof decoded.track !== "string") return false;
    guestSlot = {
      ghost: decoded.ghost,
      track: decoded.track,
      context: typeof decoded.context === "string" ? decoded.context : null,
      day: typeof decoded.day === "string" ? decoded.day : null,
      meta: decoded.meta && typeof decoded.meta === "object" ? decoded.meta : null,
    };
    return true;
  }
  function clearGuest() { guestSlot = null; }
  function guest() { return guestSlot; }
  function hasGuest(trackId) {
    if (!guestSlot) return false;
    let current = trackId;
    if (current == null && typeof Ghost !== "undefined" && typeof Ghost.track === "function") current = Ghost.track();
    return current == null || current === guestSlot.track;
  }

  function findFloorIndex(values, value) {
    let lo = 0, hi = values.length - 1;
    if (value <= values[0]) return 0;
    if (value >= values[hi]) return hi;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (values[mid] <= value) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function activeGhost() { return hasGuest() ? guestSlot.ghost : null; }
  function bestTime() { const g = activeGhost(); return g ? g.time : Infinity; }
  function at(time) {
    const g = activeGhost();
    if (!g) return null;
    const n = g.t.length;
    if (time >= g.t[n - 1]) {
      atOut.s = g.s[n - 1]; atOut.x = g.x[n - 1]; atOut.done = true; return atOut;
    }
    if (time <= g.t[0]) {
      atOut.s = g.s[0]; atOut.x = g.x[0]; atOut.done = false; return atOut;
    }
    const i = findFloorIndex(g.t, time), j = Math.min(i + 1, n - 1);
    const span = g.t[j] - g.t[i];
    const f = span > 1e-6 ? Math.max(0, Math.min(1, (time - g.t[i]) / span)) : 0;
    atOut.s = g.s[i] + (g.s[j] - g.s[i]) * f;
    atOut.x = g.x[i] + (g.x[j] - g.x[i]) * f;
    atOut.done = false;
    return atOut;
  }
  function timeAt(distance) {
    const g = activeGhost();
    if (!g) return null;
    if (distance <= g.s[0]) return g.t[0];
    const n = g.s.length;
    if (distance >= g.s[n - 1]) return g.t[n - 1];
    const i = findFloorIndex(g.s, distance), j = Math.min(i + 1, n - 1);
    const span = g.s[j] - g.s[i];
    const f = span > 0.1 ? Math.max(0, Math.min(1, (distance - g.s[i]) / span)) : 0;
    return g.t[i] + (g.t[j] - g.t[i]) * f;
  }

  function hashCode(hash) {
    const match = String(hash || "").match(/(?:^#|&)ghost=([^&]+)/);
    return match ? match[1] : null;
  }
  function withoutGhost(href) {
    try {
      const url = new URL(String(href));
      const kept = String(url.hash || "").replace(/^#/, "").split("&")
        .filter((part) => part && !/^ghost=/.test(part));
      url.hash = kept.join("&");
      return url.href;
    } catch (_) { return null; }
  }
  function messageFor(result) {
    if (result && result.ok) return "Rival ghost loaded — " + result.track.toUpperCase() + ".";
    if (result && result.reason === "unknown-track") return "That ghost uses a circuit this version does not know.";
    return "That ghost code is incomplete or corrupt.";
  }
  async function consumeHash(opts) {
    const raw = typeof location !== "undefined" ? hashCode(location.hash) : null;
    if (!raw) return null;
    const result = await decode(raw);
    if (result.ok) installGuest(result);
    try {
      const next = withoutGhost(location.href);
      if (next && typeof history !== "undefined" && history.replaceState) {
        history.replaceState(history.state, "", next);
      }
    } catch (_) { /* the guest still works if history is unavailable */ }
    const notify = opts && opts.notify;
    if (typeof notify === "function") notify(messageFor(result), result);
    return result;
  }

  return {
    MAGIC, encode, decode, fileExport, installGuest, clearGuest, guest, hasGuest,
    bestTime, at, timeAt, consumeHash, withoutGhost,
  };
})();
Object.freeze(GhostShare);
if (typeof module !== "undefined" && module.exports) module.exports = GhostShare;
