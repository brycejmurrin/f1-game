/* NetRendezvous — a short room code instead of a pasted invite. WHAT THIS IS NOT. It is not an account, a username, or a directory. A room code is a throwaway mee… */
"use strict";

const NetRendezvous = (function () {
  // No 0/O, no 1/I/L — the characters people mishear and mistype.
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const CODE_LEN = 6;

  const DEFAULT_URL = "";
  const STORE_KEY = "apex26.rendezvous";

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

  // REJECTION SAMPLING, not `byte % 31`: 256 is not a multiple of 31, so the
  // modulo made the first 8 letters (2..9) 9/8 as likely as the rest — a
  // measurable bias in the only secret a room code has. Bytes at or above the
  // largest multiple of the alphabet size are thrown away and redrawn.
  const RAND_LIMIT = 256 - (256 % ALPHABET.length);   // 248 for 31 letters
  function randomBytes(n) {
    const out = new Uint8Array(n);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(out);
    else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }
  function makeCode() {
    let out = "";
    while (out.length < CODE_LEN) {
      const n = randomBytes(CODE_LEN * 2);
      for (let i = 0; i < n.length && out.length < CODE_LEN; i++) {
        if (n[i] < RAND_LIMIT) out += ALPHABET[n[i] % ALPHABET.length];
      }
    }
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

  // ENVELOPE v2: [salt 16][iv 12][AES-GCM ciphertext+tag], AAD = the slot
  // name ("offer" / "answer"). v1 derived one AES key straight from the code
  // under a CONSTANT salt and bound nothing: a sealed offer could be replayed
  // into the answer slot, and every room ever hosted under one code shared a
  // key. Now PBKDF2 runs ONCE per code (below) to a memoised HKDF base, and
  // each envelope derives its own AES key from a fresh random salt; the slot
  // rides as additional data so an offer opened as an answer fails the tag.
  // open() accepts v2 only — both peers run the same build (the handshake's
  // build check refuses anything else), so there is nobody to stay
  // compatible with.
  const PBKDF2_SALT = enc().encode("apex26-rendezvous-v2");
  const HKDF_INFO = enc().encode("apex26-rendezvous-v2/envelope");
  const SALT_LEN = 16, IV_LEN = 12, MIN_ENVELOPE = SALT_LEN + IV_LEN + 16;

  // One-entry memo: the base depends ONLY on the code, which is fixed for a
  // whole exchange — but seal() and open() both derived it per call, and their
  // callers are hot (publish per 5 s repost AND per relay onopen, heard per
  // inbound frame). That was a 120 000-round PBKDF2 every few seconds for the
  // full join window, on exactly the phone the room-code path exists for. The
  // HKDF CryptoKey is extractable:false, so caching it discloses nothing new;
  // the per-envelope HKDF step it feeds is microseconds.
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
      return crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    })();
    const p = _keyP;
    p.catch(() => { if (_keyP === p) { _keyP = null; _keyCode = null; } });   // a failed derive must not stick
    return p;
  }

  async function envelopeKey(code, salt) {
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt, info: HKDF_INFO },
      await keyFor(code), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  const aad = (slot) => enc().encode(String(slot || ""));

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

  // v2 only. The Worker used to be allowed to hand back unversioned plaintext
  // "during a rolling deployment"; that branch let a relay operator (or anyone
  // who could answer for one) substitute an SDP of their choosing. Gone.
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
      const sealed = await sealPrivate(code, slot, payload);
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
    const payload = got.body && await openPrivate(code, slot, got.body.payload);
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

  // Errors a poll may see for a moment without the room being gone: a 429,
  // a 5xx, a timed-out or offline request. One of these used to abort the
  // whole two-minute wait; now it takes WAIT_TRANSIENT_MAX in a row.
  const TRANSIENT = new Set(["rate_limited", "relay", "timeout", "offline"]);
  const WAIT_TRANSIENT_MAX = 5;
  async function waitFor(code, slot, token, onTick) {
    const started = Date.now();
    let transient = 0;
    for (;;) {
      if (token && token.cancelled) return ERR("cancelled", "");
      const res = await get(code, slot);
      if (res.ok && res.body && res.body.payload) return { ok: true, payload: res.body.payload };
      if (!res.ok && res.error !== "not_found") {
        if (!TRANSIENT.has(res.error) || ++transient >= WAIT_TRANSIENT_MAX) return res;
      } else transient = 0;
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        return ERR("expired", "Nobody joined that code. Codes only last a couple of minutes.");
      }
      if (onTick) { try { onTick(Math.round((Date.now() - started) / 1000)); } catch (e) {} }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  return {
    ALPHABET, CODE_LEN, POLL_TIMEOUT_MS, STORE_KEY, DEFAULT_URL, ENVELOPE_TAG,
    configured, usingPrivateRelay, setUrl, baseUrl, swap, hostRoom,
    seal, open, sealPrivate, openPrivate,
    makeCode, normalise, valid,
    put, get, waitFor,
  };
})();
Object.freeze(NetRendezvous);
