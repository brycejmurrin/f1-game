"use strict";

const NetRendezvous = (function () {
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const CODE_LEN = 8;
  const LEGACY_CODE_LEN = 6;
  const PRIVATE_CODE_LEN = 32;
  const PRIVATE_PROTOCOL = "3";

  const DEFAULT_URL = "";
  const STORE_KEY = "apex26.rendezvous";
  let sessionUrl;

  function validRelayUrl(raw) {
    try {
      const u = new URL(String(raw));
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
      if (u.username || u.password || u.search || u.hash ||
          !(u.protocol === "https:" || (u.protocol === "http:" && loopback))) return null;
      return u.href.replace(/\/+$/, "");
    } catch (e) { return null; }
  }

  const POLL_MS = 1200;
  const POLL_TIMEOUT_MS = 12000;
  const HOST_POLL_TIMEOUT_MS = 120000;
  const FETCH_TIMEOUT_MS = 8000;

  function baseUrl() {
    if (sessionUrl !== undefined) return sessionUrl;
    let raw = DEFAULT_URL;
    try { raw = (localStorage.getItem(STORE_KEY) || "").trim() || DEFAULT_URL; } catch (e) {  }
    if (!raw) return null;
    return validRelayUrl(raw);
  }

  const configured = () => true;
  const usingPrivateRelay = () => !!baseUrl();

  function setUrl(url) {
    if (url) {
      const normalized = validRelayUrl(url);
      if (!normalized) return false;
      try { localStorage.setItem(STORE_KEY, normalized); return configured(); }
      catch (e) { return false; }
    }
    try {
      localStorage.removeItem(STORE_KEY);
      return configured();
    } catch (e) { return false; }
  }

  function setSessionUrl(url) {
    if (url == null) { sessionUrl = url === undefined ? undefined : null; return true; }
    const normalized = validRelayUrl(url);
    if (!normalized) return false;
    sessionUrl = normalized;
    return true;
  }

  const RAND_LIMIT = 256 - (256 % ALPHABET.length);
  function randomBytes(n) {
    const out = new Uint8Array(n);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(out);
    else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }
  function makeCode() {
    const privateRelay = usingPrivateRelay();
    if (privateRelay && (typeof crypto === "undefined" || !crypto.getRandomValues)) return null;
    const length = privateRelay ? PRIVATE_CODE_LEN : CODE_LEN;
    let out = "";
    while (out.length < length) {
      const n = randomBytes(length * 2);
      for (let i = 0; i < n.length && out.length < length; i++) {
        if (n[i] < RAND_LIMIT) out += ALPHABET[n[i] % ALPHABET.length];
      }
    }
    return out;
  }

  function normalise(code) {
    return String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
      .replace(/O/g, "0").replace(/[IL]/g, "1");
  }

  const validLength = (code, length) => {
    const c = normalise(code);
    return c.length === length && [...c].every((ch) => ALPHABET.indexOf(ch) >= 0);
  };
  const valid = (code) => usingPrivateRelay() ? validLength(code, PRIVATE_CODE_LEN)
    : validLength(code, CODE_LEN) || validLength(code, LEGACY_CODE_LEN);
  const privateCodeError = () => ERR("bad_code", "Private rooms need a new 32-character token. Ask the host to share a new token, or use the invite link.");
  const protocolError = () => ERR("relay_version", "Update the private room Worker and reload both players, or use the invite link. This relay uses an incompatible protocol.");

  const ERR = (error, message) => ({ ok: false, error, message });
  const enc = () => new TextEncoder();
  const dec = () => new TextDecoder();
  const NO_URL = () => ERR("not_configured", "That relay is no longer configured.");

  async function call(path, opts) {
    const base = baseUrl();
    if (!base) return NO_URL();
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(base + path, Object.assign({
        cache: "no-store",
        signal: ctrl ? ctrl.signal : undefined,
      }, opts));
      const protocol = res.headers && res.headers.get("x-apex-rendezvous");
      if (res.status === 426 || (res.status === 404 && protocol !== PRIVATE_PROTOCOL)) return protocolError();
      if (res.status === 404) return ERR("not_found", "Nobody is waiting on that code.");
      if (res.status === 409) return ERR("taken", "That code is already in use — make a new one.");
      if (res.status === 429) return ERR("rate_limited", "The room service is busy. Wait a minute or use the invite link.");
      if (!res.ok) return ERR("relay", "The room service is not answering. Use the invite link instead.");
      const text = await res.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; }
      catch (e) { return ERR("relay", "The room service answered with something unexpected — this network may be intercepting it. Use the invite link instead."); }
      if (protocol !== PRIVATE_PROTOCOL) return protocolError();
      return { ok: true, body };
    } catch (e) {
      const aborted = e && e.name === "AbortError";
      return ERR(aborted ? "timeout" : "offline",
        aborted ? "The room service timed out." : "Could not reach the room service.");
    } finally {
      clearTimeout(timer);
    }
  }

  const PBKDF2_SALT = enc().encode("apex26-rendezvous-v2");
  const HKDF_INFO = enc().encode("apex26-rendezvous-v2/envelope");
  const SALT_LEN = 16, IV_LEN = 12, MIN_ENVELOPE = SALT_LEN + IV_LEN + 16;

  let _keyCode = null, _keyP = null;
  function keyFor(code) {
    const norm = normalise(code);
    if (_keyP && _keyCode === norm) return _keyP;
    _keyCode = norm;
    _keyP = (async () => {
      const base = await crypto.subtle.importKey(
        "raw", enc().encode(norm), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: PBKDF2_SALT, iterations: 120000, hash: "SHA-256" }, base, 256);
      return crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey", "deriveBits"]);
    })();
    const p = _keyP;
    p.catch(() => { if (_keyP === p) { _keyP = null; _keyCode = null; } });
    return p;
  }

  async function envelopeKey(code, salt) {
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt, info: HKDF_INFO },
      await keyFor(code), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  const PROTOCOL = 3;
  const TOPIC_BYTES = 10;
  async function topic(code, slot) {
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0),
        info: enc().encode("apex26-rendezvous-v" + PROTOCOL + "/topic|" + String(slot || "")) },
      await keyFor(code), TOPIC_BYTES * 8);
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function privateRoomId(code) {
    if (!validLength(code, PRIVATE_CODE_LEN)) throw new Error("private token required");
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0),
        info: enc().encode("apex26-rendezvous-private-v3/room") }, await keyFor(code), 256);
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const aad = (slot) => enc().encode(String(slot || ""));

  const VERIFY_LEN = 4;
  async function verifyCode(fpA, fpB) {
    const norm = (f) => String(f || "").replace(/[^0-9a-f]/gi, "").toLowerCase();
    const a = norm(fpA), b = norm(fpB);
    if (!a || !b) return null;
    const pair = a < b ? a + "|" + b : b + "|" + a;
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256",
      enc().encode("apex26-verify-v1|" + pair)));
    let out = "";
    for (let i = 0; i < d.length && out.length < VERIFY_LEN; i++) {
      if (d[i] < RAND_LIMIT) out += ALPHABET[d[i] % ALPHABET.length];
    }
    return out.length === VERIFY_LEN ? out : null;
  }
  async function verifyFor(pc) {
    try {
      const fp = (d) => (d && d.sdp && NetSdp.fingerprint ? NetSdp.fingerprint(d.sdp) : null);
      return await verifyCode(fp(pc && pc.localDescription), fp(pc && pc.remoteDescription));
    } catch (e) { return null; }
  }

  async function seal(code, text, slot) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(slot) },
      await envelopeKey(code, salt), enc().encode(text));
    const out = new Uint8Array(SALT_LEN + IV_LEN + ct.byteLength);
    out.set(salt); out.set(iv, SALT_LEN); out.set(new Uint8Array(ct), SALT_LEN + IV_LEN);
    return out;
  }

  async function open(code, bytes, slot) {
    if (!bytes || bytes.length < MIN_ENVELOPE) return null;
    try {
      const salt = bytes.slice(0, SALT_LEN);
      const iv = bytes.slice(SALT_LEN, SALT_LEN + IV_LEN);
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad(slot) },
        await envelopeKey(code, salt), bytes.slice(SALT_LEN + IV_LEN));
      return dec().decode(pt);
    } catch (e) {
      return null;
    }
  }

  const ENVELOPE_TAG = "v2.";
  async function sealPrivate(code, slot, payload) {
    return ENVELOPE_TAG + NetBytes.bytesToB64url(await seal(code, payload, slot));
  }

  async function openPrivate(code, slot, payload) {
    if (typeof payload !== "string" || !payload.startsWith(ENVELOPE_TAG)) return null;
    try { return await open(code, NetBytes.b64urlToBytes(payload.slice(ENVELOPE_TAG.length)), slot); }
    catch (e) { return null; }
  }

  function ownerCapability() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return NetBytes.bytesToB64url(bytes);
  }

  async function httpPut(code, slot, payload, owner) {
    if (!validLength(code, PRIVATE_CODE_LEN)) return privateCodeError();
    try {
      const sealed = await sealPrivate(code, slot, payload);
      return call(`/v3/r/${await privateRoomId(code)}/${slot}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: sealed, ...(owner ? { owner } : {}) }),
      });
    } catch (e) {
      return ERR("crypto", "This browser could not protect the room code. Use the invite link instead.");
    }
  }

  async function httpGet(code, slot) {
    if (!validLength(code, PRIVATE_CODE_LEN)) return privateCodeError();
    let room;
    try { room = await privateRoomId(code); }
    catch (e) { return ERR("crypto", "This browser could not protect the room token. Use the invite link instead."); }
    const got = await call(`/v3/r/${room}/${slot}`, { method: "GET" });
    if (!got.ok) return got;
    const payload = got.body && await openPrivate(code, slot, got.body.payload);
    if (!payload) return ERR("corrupt", "The room service returned an unreadable code. Use the invite link instead.");
    return { ok: true, body: { payload } };
  }

  function nostrExchange(o) {
    return NetNostr.directExchange({
      code: o.code, send: o.mine, reply: o.reply, token: o.token, onTick: o.onTick,
      reanswer: !!o.reanswer, onFail: o.onFail,
    });
  }

  function hostRoom(o) {
    if (usingPrivateRelay()) {
      Log.warn("net", "room host fail not_supported");
      return Promise.resolve({ ok: false, error: "not_supported",
        message: "Room codes on a private relay take one guest. Use the invite link for the others." });
    }
    Log.info("net", "room host");
    return NetNostr.directExchange({
      code: o.code, send: o.mine, mintOffer: o.mintOffer, onJoiner: o.onJoiner,
      token: o.token, onTick: o.onTick,
      onFail: o.onFail,
    });
  }

  const offerOwners = new Map();
  function ownerFor(code, payload) {
    const key = normalise(code);
    const prior = offerOwners.get(key);
    const owner = prior && prior.payload === payload ? prior.owner : ownerCapability();
    offerOwners.set(key, { payload, owner });
    if (offerOwners.size > 128) offerOwners.delete(offerOwners.keys().next().value);
    return owner;
  }
  const put = async (code, slot, payload) => {
    let owner = null;
    try {
      if (slot === "offer") owner = ownerFor(code, payload);
    } catch (e) {
      return ERR("crypto", "This browser could not protect the room code. Use the invite link instead.");
    }
    return httpPut(code, slot, payload, owner);
  };
  function rvLog(action, res) {
    if (res && res.ok) Log.info("net", action + " ok");
    else if (res && (res.error === "cancelled")) Log.info("net", action + " cancelled");
    else Log.warn("net", action + " fail " + ((res && res.error) || "error"));
    return res;
  }

  async function swap(o) {
    const { code, mine, reply, slot, want, token, onTick } = o;
    if (!usingPrivateRelay()) return nostrExchange(o);
    if (reply) {
      const got = await waitFor(code, want, token, onTick);
      if (!got.ok) return rvLog("swap", got);
      let out = null;
      try { out = await reply(got.payload); } catch (e) { out = null; }
      if (!out) return rvLog("swap", ERR("reply_failed", "Could not answer that invite."));
      const posted = await httpPut(code, slot, out, null);
      return rvLog("swap", posted.ok ? { ok: true, payload: got.payload } : posted);
    }
    let owner = null;
    try { owner = slot === "offer" ? ownerFor(code, mine) : null; }
    catch (e) { return rvLog("swap", ERR("crypto", "This browser could not protect the room code. Use the invite link instead.")); }
    const posted = await httpPut(code, slot, mine, owner);
    if (!posted.ok) return rvLog("swap", posted);
    const got = await waitFor(code, want, token, onTick, HOST_POLL_TIMEOUT_MS);
    return rvLog("swap", got.ok ? { ok: true, payload: got.payload } : got);
  }

  const TRANSIENT = new Set(["rate_limited", "relay", "timeout", "offline"]);
  const WAIT_TRANSIENT_MAX = 5;
  async function waitFor(code, slot, token, onTick, timeoutMs) {
    const limit = timeoutMs > 0 ? timeoutMs : POLL_TIMEOUT_MS;
    const started = Date.now();
    let transient = 0;
    for (;;) {
      if (token && token.cancelled) return ERR("cancelled", "");
      const res = await httpGet(code, slot);
      if (token && token.cancelled) return ERR("cancelled", "");
      if (res.ok && res.body && res.body.payload) return { ok: true, payload: res.body.payload };
      if (!res.ok && res.error !== "not_found") {
        if (!TRANSIENT.has(res.error) || ++transient >= WAIT_TRANSIENT_MAX) return res;
      } else transient = 0;
      if (Date.now() - started > limit) {
        return ERR("expired",
          "Nobody answered that code. Double-check it, or ask your friend for a fresh one.");
      }
      if (onTick) { try { onTick(Math.round((Date.now() - started) / 1000)); } catch (e) {  } }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  return {
    ALPHABET, CODE_LEN, POLL_TIMEOUT_MS, HOST_POLL_TIMEOUT_MS, PROTOCOL, topic, privateRoomId, STORE_KEY,
    configured, usingPrivateRelay, setUrl, setSessionUrl, baseUrl, swap, hostRoom,
    seal, open, sealPrivate, openPrivate, verifyCode, verifyFor, VERIFY_LEN,
    makeCode, normalise, valid,
    put, get: httpGet, waitFor,
  };
})();
Object.freeze(NetRendezvous);
