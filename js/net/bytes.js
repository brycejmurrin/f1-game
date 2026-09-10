/* NetBytes — the byte<->text codecs every js/net module needs, in ONE place. Four files each carried their own base64url pair or a bare btoa/atob loop (handshake, rendezvous, nostr, transport) and sdp.js its own hex/ascii helpers; one drifted (chunked vs per-char) and none was tested on its own. Loads FIRST in LAZY_NET; every reader binds lazily (NetBytes.x() at call time), so load order past that is not a hard edge. */
"use strict";

const NetBytes = (function () {
  // Chunked so a large buffer never hits the argument-count ceiling of
  // Function.prototype.apply (the per-character loop it replaces was O(n²)
  // on string concatenation for a 250 KB invite).
  function binary(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x4000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x4000));
    }
    return s;
  }
  function fromBinary(bin) {
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const view = (bytes) => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

  // Standard alphabet, padded — what a Nostr `content` and a TURN credential
  // carry.
  const bytesToB64 = (bytes) => btoa(binary(view(bytes)));
  const b64ToBytes = (text) => fromBinary(atob(String(text || "")));

  // URL-safe, unpadded — what an invite code and a worker envelope carry.
  const bytesToB64url = (bytes) =>
    bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function b64urlToBytes(text) {
    const s = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
    return fromBinary(atob(s + "=".repeat((4 - (s.length % 4)) % 4)));
  }

  // Hex with any separator stripped; null on an odd digit count rather than
  // a silently truncated fingerprint.
  function hexToBytes(hex) {
    const clean = String(hex || "").replace(/[^0-9a-fA-F]/g, "");
    if (clean.length % 2) return null;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }
  const bytesToHex = (bytes, sep) =>
    Array.from(view(bytes), (v) => v.toString(16).toUpperCase().padStart(2, "0")).join(sep || "");

  // ASCII slice — ufrag/pwd are ice-char by spec, so charCode IS the byte.
  function ascii(bytes, off, len) {
    let s = "";
    const o = off || 0, n = len != null ? len : bytes.length - o;
    for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[o + i]);
    return s;
  }

  return { bytesToB64, b64ToBytes, bytesToB64url, b64urlToBytes, hexToBytes, bytesToHex, ascii };
})();
Object.freeze(NetBytes);
