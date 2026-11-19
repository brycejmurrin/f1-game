"use strict";

const NetBytes = (function () {
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

  const bytesToB64 = (bytes) => btoa(binary(view(bytes)));
  const b64ToBytes = (text) => fromBinary(atob(String(text || "")));

  const bytesToB64url = (bytes) =>
    bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function b64urlToBytes(text) {
    const s = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
    return fromBinary(atob(s + "=".repeat((4 - (s.length % 4)) % 4)));
  }

  function hexToBytes(hex) {
    const clean = String(hex || "").replace(/[^0-9a-fA-F]/g, "");
    if (clean.length % 2) return null;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }
  const bytesToHex = (bytes, sep) =>
    Array.from(view(bytes), (v) => v.toString(16).toUpperCase().padStart(2, "0")).join(sep || "");

  function ascii(bytes, off, len) {
    let s = "";
    const o = off || 0, n = len != null ? len : bytes.length - o;
    for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[o + i]);
    return s;
  }

  return { bytesToB64, b64ToBytes, bytesToB64url, b64urlToBytes, hexToBytes, bytesToHex, ascii };
})();
Object.freeze(NetBytes);
