/* NetRendezvous — a short room code instead of a pasted invite. WHAT THIS IS NOT. It is not an account, a username, or a directory. A room code is a throwaway mee… */
"use strict";

const NetRendezvous = (function () {
  // No 0/O, no 1/I/L — the characters people mishear and mistype.
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const CODE_LEN = 6;
  const PRIVATE_CODE_LEN = 32;   // 32 unbiased base-31 draws: >158 bits, shared out of band
  const PRIVATE_PROTOCOL = "3";

  const DEFAULT_URL = "";
  const STORE_KEY = "apex26.rendezvous";
  let sessionUrl;   // QR pairing can select a relay for this document, never another tab/device

  const POLL_MS = 1200;             // how often to ask if the other side arrived
  // Guest join of a fake/missing code must fail in the lobby in ~8–15 s (same
  // product target as NetNostr.JOIN_TIMEOUT_MS). Not a worker mapping TTL.
  const POLL_TIMEOUT_MS = 12000;
  // The HOST of a private-relay room is waiting for a friend who has to be sent
  // the code first (public Nostr hosts get 2 min too): 12 s is a guest's window.
  const HOST_POLL_TIMEOUT_MS = 120000;
  const FETCH_TIMEOUT_MS = 8000;

  function baseUrl() {
    if (sessionUrl !== undefined) return sessionUrl;
    let raw = DEFAULT_URL;
    try { raw = (localStorage.getItem(STORE_KEY) || "").trim() || DEFAULT_URL; } catch (e) { /* storage blocked (private mode): use the default */ }
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

  // The controller receives its host's relay URL in the QR fragment. Keep it
  // local to this page and allow only secure endpoints (loopback HTTP for dev).
  // null selects public signalling; undefined restores the saved preference.
  function setSessionUrl(url) {
    if (url == null) { sessionUrl = url === undefined ? undefined : null; return true; }
    try {
      const u = new URL(url);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
      if (u.username || u.password || u.search || u.hash ||
          !(u.protocol === "https:" || (u.protocol === "http:" && loopback))) return false;
      sessionUrl = u.href.replace(/\/+$/, "");
      return true;
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

  // ALPHABET has no 0/O/1/I/L at all, so no typed confusable can ever be
  // valid — the collapse below just gives each confusable family ONE
  // representative so valid() answers consistently.
  function normalise(code) {
    return String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
      .replace(/O/g, "0").replace(/[IL]/g, "1");
  }

  const validLength = (code, length) => {
    const c = normalise(code);
    return c.length === length && [...c].every((ch) => ALPHABET.indexOf(ch) >= 0);
  };
  const valid = (code) => validLength(code, usingPrivateRelay() ? PRIVATE_CODE_LEN : CODE_LEN);
  const privateCodeError = () => ERR("bad_code", "Private rooms need a new 32-character token. Ask the host to share a new token, or use the invite link.");
  const protocolError = () => ERR("relay_version", "Update the private room Worker and reload both players, or use the invite link. This relay uses an incompatible protocol.");

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
      const protocol = res.headers && res.headers.get("x-apex-rendezvous");
      if (res.status === 426 || (res.status === 404 && protocol !== PRIVATE_PROTOCOL)) return protocolError();
      if (res.status === 404) return ERR("not_found", "Nobody is waiting on that code.");
      if (res.status === 409) return ERR("taken", "That code is already in use — make a new one.");
      if (res.status === 429) return ERR("rate_limited", "The room service is busy. Wait a minute or use the invite link.");
      if (!res.ok) return ERR("relay", "The room service is not answering. Use the invite link instead.");
      const text = await res.text();
      let body = null;
      // A captive portal or proxy answers 200 with HTML: that is not "offline"
      // (which spends the poll's retries on it) — this network is intercepting.
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
      return crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey", "deriveBits"]);
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

  // THE PUBLIC TOPIC comes from the STRETCHED key, never from the code. The
  // Nostr `x` tag is plaintext on every relay (NIP-01): as a bare SHA-256 of
  // the code (one guess = one hash over ~30 bits) a reader of public traffic
  // could recover a live code in minutes and open its envelopes. A guess now
  // pays the 120 000-round PBKDF2 in keyFor() — BUT the salt is a constant, so
  // that cost is paid ONCE for the whole 31^6 code space (~1e14 iterations: a
  // GPU-day, then a lookup table for every future room), not once per room.
  // Stretching slows a casual reader; it does not stop a determined one from
  // opening an offer or posting an answer first. What does stop the attack
  // that matters — someone sitting between the two players — is verifyCode()
  // below, shown on both screens once connected.
  // PROTOCOL rides in the info string: a build on another protocol meets on a
  // different topic and never half-talks to this one (the handshake's build
  // check is the loud refusal once a link is up).
  const PROTOCOL = 3;
  const TOPIC_BYTES = 10;
  async function topic(code, slot) {
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0),
        info: enc().encode("apex26-rendezvous-v" + PROTOCOL + "/topic|" + String(slot || "")) },
      await keyFor(code), TOPIC_BYTES * 8);
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Routing and encryption share only a high-entropy secret held by the peers.
  // Sending that secret in /r/<code> handed the old Worker the AES key material.
  // A six-character secret would still permit offline guessing of an opaque id.
  async function privateRoomId(code) {
    if (!validLength(code, PRIVATE_CODE_LEN)) throw new Error("private token required");
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0),
        info: enc().encode("apex26-rendezvous-private-v3/room") }, await keyFor(code), 256);
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const aad = (slot) => enc().encode(String(slot || ""));

  // THE VERIFICATION CODE: 4 letters from the room-code alphabet, derived from
  // BOTH ends' DTLS fingerprints (sorted, so both screens compute the same
  // string). The fingerprints are what DTLS actually authenticates, so a peer
  // in the middle — one who opened the sealed offer with a precomputed code
  // table and answered it himself — holds a different certificate on each leg,
  // and the two screens show different codes. The room code is the rendezvous;
  // this is the check that the person who arrived is the one you invited. The
  // host compares it aloud and removes a guest whose code differs.
  // 31^4 ≈ 9.2e5 values: a middleman must grind that many certificates INSIDE
  // the connect window to collide, which is the bound the docs state.
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
      if (d[i] < RAND_LIMIT) out += ALPHABET[d[i] % ALPHABET.length];   // unbiased, as makeCode()
    }
    return out.length === VERIFY_LEN ? out : null;
  }
  // From a CONNECTED RTCPeerConnection: our certificate and the one we saw.
  // Never rejects; null for a loopback/fake transport with no descriptions.
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

  // v2 only: accepting unversioned plaintext from the Worker would let a relay
  // operator (or anyone who could answer for one) substitute an SDP of their
  // choosing.
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
    const got = await waitFor(code, want, token, onTick, HOST_POLL_TIMEOUT_MS);
    return rvLog("swap", got.ok ? { ok: true, payload: got.payload } : got);
  }

  // Errors a poll may see for a moment without the room being gone: a 429,
  // a 5xx, a timed-out or offline request. Aborting the poll wait takes
  // WAIT_TRANSIENT_MAX of these in a row, not one.
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
        // Lobby codeJoin already say(why.message) on !done.ok — keep this useful.
        // waitFor is the private-relay path (32-char tokens); do not claim "six".
        return ERR("expired",
          "Nobody answered that code. Double-check it, or ask your friend for a fresh one.");
      }
      if (onTick) { try { onTick(Math.round((Date.now() - started) / 1000)); } catch (e) { /* a caller bug must not stop the poll */ } }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  return {
    ALPHABET, CODE_LEN, PRIVATE_CODE_LEN, POLL_TIMEOUT_MS, HOST_POLL_TIMEOUT_MS, PROTOCOL, topic, privateRoomId, STORE_KEY, DEFAULT_URL, ENVELOPE_TAG,
    configured, usingPrivateRelay, setUrl, setSessionUrl, baseUrl, swap, hostRoom,
    seal, open, sealPrivate, openPrivate, verifyCode, verifyFor, VERIFY_LEN,
    makeCode, normalise, valid,
    put, get: httpGet, waitFor,
  };
})();
Object.freeze(NetRendezvous);
