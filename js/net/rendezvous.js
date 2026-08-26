/* NetRendezvous — a short room code instead of a pasted invite. WHAT THIS IS NOT. It is not an account, a username, or a directory. A room code is a throwaway mee… */
"use strict";

const NetRendezvous = (function () {
  // No 0/O, no 1/I/L — the characters people mishear and mistype.
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const CODE_LEN = 6;

  const DEFAULT_URL = "";
  const STORE_KEY = "apex26.rendezvous";

  const TOPIC = "apex26/rv";

  const POLL_MS = 1200;             // how often to ask if the other side arrived
  const POLL_TIMEOUT_MS = 120000;   // give up after two minutes — see the TTL
  const FETCH_TIMEOUT_MS = 8000;

  function baseUrl() {
    let raw = DEFAULT_URL;
    try { raw = (localStorage.getItem(STORE_KEY) || "").trim() || DEFAULT_URL; } catch (e) {}
    if (!raw) return null;
    // Trailing slash normalised here so callers never have to think about it.
    return String(raw).replace(/\/+$/, "");
  }

  const configured = () => true;
  const usingPrivateRelay = () => !!baseUrl();

  function setUrl(url) {
    try {
      if (url) localStorage.setItem(STORE_KEY, String(url));
      else localStorage.removeItem(STORE_KEY);
      return configured();
    } catch (e) { return false; }
  }

  function makeCode() {
    const n = new Uint8Array(CODE_LEN);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(n);
    else for (let i = 0; i < CODE_LEN; i++) n[i] = Math.floor(Math.random() * 256);
    let out = "";
    for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[n[i] % ALPHABET.length];
    return out;
  }

  // ALPHABET has no 0/O/1/I/L at all, so no typed confusable can ever be
  // valid — the collapse below just gives each confusable family ONE
  // representative so valid() answers consistently. The old second chain
  // (0→O, 1→I) mapped them back to characters equally outside the alphabet;
  // dead in both directions, deleted.
  function normalise(code) {
    return String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
      .replace(/O/g, "0").replace(/[IL]/g, "1");
  }

  const valid = (code) => {
    const c = normalise(code);
    return c.length === CODE_LEN && [...c].every((ch) => ALPHABET.indexOf(ch) >= 0);
  };

  const ERR = (error, message) => ({ ok: false, error, message });
  const enc = () => new TextEncoder();
  const dec = () => new TextDecoder();
  // Only reachable if a private relay URL was set and then cleared mid-flight.
  const NO_URL = () => ERR("not_configured", "That relay is no longer configured.");

  // Every network call funnels through here so a dead relay reads the same way
  // everywhere: a typed result, never an exception, never an indefinite hang.
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
      if (res.status === 404) return ERR("not_found", "Nobody is waiting on that code.");
      if (res.status === 409) return ERR("taken", "That code is already in use — make a new one.");
      if (res.status === 429) return ERR("rate_limited", "The room service is busy. Wait a minute or use the invite link.");
      if (!res.ok) return ERR("relay", "The room service is not answering. Use the invite link instead.");
      const text = await res.text();
      return { ok: true, body: text ? JSON.parse(text) : null };
    } catch (e) {
      const aborted = e && e.name === "AbortError";
      return ERR(aborted ? "timeout" : "offline",
        aborted ? "The room service timed out." : "Could not reach the room service.");
    } finally {
      clearTimeout(timer);
    }
  }

  const SALT = enc().encode("apex26-rendezvous-v1");

  async function keyFor(code) {
    const base = await crypto.subtle.importKey(
      "raw", enc().encode(normalise(code)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: SALT, iterations: 120000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  // The topic must not reveal the code, so it is a truncated hash of it. 80
  // bits of it: collisions are irrelevant at this scale and the string stays
  // short enough to read in a broker log without wrapping.
  async function topicFor(code, slot) {
    const h = await crypto.subtle.digest("SHA-256", enc().encode("t|" + normalise(code)));
    const hex = [...new Uint8Array(h).slice(0, 10)]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${TOPIC}/${hex}/${slot}`;
  }

  async function seal(code, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, await keyFor(code), enc().encode(text));
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv); out.set(new Uint8Array(ct), 12);
    return out;
  }

  async function open(code, bytes) {
    if (!bytes || bytes.length <= 12) return null;
    try {
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.slice(0, 12) }, await keyFor(code), bytes.slice(12));
      return dec().decode(pt);
    } catch (e) {
      return null;
    }
  }

  function b64url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x4000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x4000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function unb64url(text) {
    const s = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(s + "=".repeat((4 - s.length % 4) % 4));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  async function sealPrivate(code, payload) {
    return "v1." + b64url(await seal(code, payload));
  }

  async function openPrivate(code, payload) {
    if (typeof payload !== "string" || !payload) return null;
    if (!payload.startsWith("v1.")) return payload;
    try { return await open(code, unb64url(payload.slice(3))); }
    catch (e) { return null; }
  }

  function ownerCapability() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return b64url(bytes);
  }

  // Deliberately the same shape as NetHandshake's: publish a blob, then wait for
  // the other one to appear. What travels is exactly the invite/answer code the
  // manual flow uses, so the rendezvous is a courier and not a participant — it
  // never needs to understand an SDP, and swapping the backend changes nothing
  // downstream.
  //
  // TWO BACKENDS, ONE INTERFACE. A private worker when its URL is set (a relay
  // you control beats a stranger's), the public Nostr relay pool otherwise —
  // which is the default, and the reason room codes need nothing deployed.
  async function httpPut(code, slot, payload, owner) {
    try {
      const sealed = await sealPrivate(code, payload);
      return call(`/r/${normalise(code)}/${slot}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: sealed, ...(owner ? { owner } : {}) }),
      });
    } catch (e) {
      return ERR("crypto", "This browser could not protect the room code. Use the invite link instead.");
    }
  }

  async function httpGet(code, slot) {
    const got = await call(`/r/${normalise(code)}/${slot}`, { method: "GET" });
    if (!got.ok) return got;
    const payload = got.body && await openPrivate(code, got.body.payload);
    if (!payload) return ERR("corrupt", "The room service returned an unreadable code. Use the invite link instead.");
    return { ok: true, body: { payload } };
  }

  function nostrExchange(o) {
    return NetNostr.exchange({
      code: o.code, send: o.mine, reply: o.reply, token: o.token, onTick: o.onTick,
    });
  }

  function hostRoom(o) {
    if (usingPrivateRelay()) {
      Log.warn("net", "room host fail not_supported");
      return Promise.resolve({ ok: false, error: "not_supported",
        message: "Room codes on a private relay take one guest. Use the invite link for the others." });
    }
    Log.info("net", "room host");
    return NetNostr.exchange({
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
  const get = (code, slot) => httpGet(code, slot);

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
    // Stable across a repeated host attempt with the same code+offer; never
    // derived from the ciphertext, whose random IV makes repeat seals differ.
    let owner = null;
    try { owner = slot === "offer" ? ownerFor(code, mine) : null; }
    catch (e) { return rvLog("swap", ERR("crypto", "This browser could not protect the room code. Use the invite link instead.")); }
    const posted = await httpPut(code, slot, mine, owner);
    if (!posted.ok) return rvLog("swap", posted);
    const got = await waitFor(code, want, token, onTick);
    return rvLog("swap", got.ok ? { ok: true, payload: got.payload } : got);
  }

  async function waitFor(code, slot, token, onTick) {
    const started = Date.now();
    for (;;) {
      if (token && token.cancelled) return ERR("cancelled", "");
      const res = await get(code, slot);
      if (res.ok && res.body && res.body.payload) return { ok: true, payload: res.body.payload };
      if (!res.ok && res.error !== "not_found") return res;
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        return ERR("expired", "Nobody joined that code. Codes only last a couple of minutes.");
      }
      if (onTick) { try { onTick(Math.round((Date.now() - started) / 1000)); } catch (e) {} }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  return {
    ALPHABET, CODE_LEN, POLL_TIMEOUT_MS, STORE_KEY, DEFAULT_URL, TOPIC,
    configured, usingPrivateRelay, setUrl, baseUrl, swap, hostRoom,
    seal, open, topicFor,
    makeCode, normalise, valid,
    put, get, waitFor,
  };
})();
