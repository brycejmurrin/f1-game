/*
 * NetRendezvous — a short room code instead of a pasted invite.
 *
 * WHAT THIS IS NOT. It is not an account, a username, or a directory. A room
 * code is a throwaway meeting point that exists for about two minutes and then
 * evaporates: nothing is stored, nothing is claimed, nothing can be squatted,
 * and no personal data is retained. That is the entire reason to prefer it over
 * "invite by username" — a username is an identity, and an identity drags in
 * recovery, impersonation, moderation and GDPR. A code drags in none of that
 * because there is nothing behind it to own.
 *
 * WHAT IT DOES. Exactly the exchange the two players already do by hand, with a
 * tiny server holding the two strings instead of a human carrying them:
 *
 *   HOST                        rendezvous                       GUEST
 *   POST offer  ─────────────▶  [held, TTL]
 *                               ◀──────── GET offer ──────────   types the code
 *                               ◀──────── POST answer ────────
 *   GET answer  ◀─────────────
 *   ...direct P2P from here; the server never sees another byte...
 *
 * Gameplay traffic never touches it. It holds two ~240-byte strings for a
 * couple of minutes, which is why this fits inside a free tier at any traffic a
 * fan game will ever see.
 *
 * NOTHING TO DEPLOY, NOTHING TO CONFIGURE. The meeting place is the public
 * NOSTR relay network, reached through Trystero (js/net/nostr.js). Accepting
 * arbitrary events from anonymous clients is what a relay is FOR, which is why
 * this is Nostr and not one of the free public MQTT brokers an earlier version
 * used: those are TEST brokers, and HiveMQ's and EMQX's terms both say plainly
 * that they must not be used by real applications.
 *
 * Our own Cloudflare Worker (worker/rendezvous.js) still takes precedence when
 * its URL is set, because a relay you control beats a stranger's — but it is
 * an upgrade, never a requirement.
 *
 * THE RELAYS ARE PUBLIC, SO NOTHING READABLE CROSSES THEM. Trystero encrypts
 * the signalling payload under the room code, the room id is a hash of the code
 * rather than the code, and the private-relay path seals its payload the same
 * way. The code is the secret — the same trust model as the invite code this
 * replaces.
 *
 * IT IS A BACKUP OPTION, NOT A REPLACEMENT. The link and QR paths stay primary
 * because they depend on nothing at all, while this leans on servers somebody
 * else runs and may stop running. So every function here resolves to a typed
 * error instead of throwing, and none sits on a path the other flows touch.
 *
 * WHY THE CODE LOOKS LIKE IT DOES. Six characters from an alphabet with no
 * 0/O and no 1/I/L, because the whole point is that it can be read aloud or
 * typed without a second attempt. That is ~10^9 combinations: unguessable
 * enough that nobody brute-forces their way into your lobby during the two
 * minutes it exists, which four digits (10,000 of them) would not be.
 */
"use strict";

const NetRendezvous = (function () {
  // No 0/O, no 1/I/L — the characters people mishear and mistype.
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const CODE_LEN = 6;

  // An OPTIONAL private relay. Empty by default and that is the supported
  // state: with nothing here the public-broker backend is used and room codes
  // work out of the box. Set it (or localStorage apex26.rendezvous) only to
  // point at your own worker/rendezvous.js deployment.
  const DEFAULT_URL = "";
  const STORE_KEY = "apex26.rendezvous";

  // Topics live under one prefix so a broker operator can see the shape of the
  // traffic without being able to read any of it.
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

  // Room codes are ALWAYS available: with no private relay set, the public
  // broker backend is used, which needs no account and nothing deployed.
  const configured = () => true;
  const usingPrivateRelay = () => !!baseUrl();

  function setUrl(url) {
    try {
      if (url) localStorage.setItem(STORE_KEY, String(url));
      else localStorage.removeItem(STORE_KEY);
      return configured();
    } catch (e) { return false; }
  }

  // crypto.getRandomValues, not Math.random: a predictable code is a code
  // someone else can be sitting on when you generate it.
  function makeCode() {
    const n = new Uint8Array(CODE_LEN);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(n);
    else for (let i = 0; i < CODE_LEN; i++) n[i] = Math.floor(Math.random() * 256);
    let out = "";
    // Modulo bias across 256 -> 31 is real but tiny, and irrelevant against a
    // two-minute TTL; rejection sampling here would be ceremony.
    for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[n[i] % ALPHABET.length];
    return out;
  }

  // Accept what a human actually types: lower case, spaces, a dash in the
  // middle, and the letters they were always going to substitute.
  function normalise(code) {
    const s = String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
      .replace(/O/g, "0").replace(/[IL]/g, "1");
    // ...then map those back onto the alphabet we actually emit, so O->0->? is
    // not a dead end: 0 and 1 are not in the alphabet, so a typo of O or I is
    // simply wrong rather than silently a different room.
    return s.replace(/0/g, "O").replace(/1/g, "I");
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

  // ---- encryption -----------------------------------------------------------
  // The public broker is PUBLIC: anyone may subscribe to any topic. So what
  // crosses it is ciphertext under a key derived from the room code, and the
  // topic is a HASH of the code rather than the code itself — otherwise
  // watching the topic namespace would hand out the codes.
  //
  // This is not defence against a determined attacker with the code; it is what
  // makes the room code the secret, exactly as the invite code is today. Nobody
  // sweeping the broker learns anything, and the operator relays bytes it
  // cannot read.
  const SALT = enc().encode("apex26-rendezvous-v1");

  async function keyFor(code) {
    const base = await crypto.subtle.importKey(
      "raw", enc().encode(normalise(code)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      // 120k iterations: ~100 ms on a phone, once per handshake. Cheap here,
      // expensive for anyone grinding the 10^9 code space.
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
      // A wrong key fails the GCM tag, which is indistinguishable from garbage
      // — and both mean the same thing here: this is not our message.
      return null;
    }
  }

  // ---- the two halves -------------------------------------------------------
  // Deliberately the same shape as NetHandshake's: publish a blob, then wait for
  // the other one to appear. What travels is exactly the invite/answer code the
  // manual flow uses, so the rendezvous is a courier and not a participant — it
  // never needs to understand an SDP, and swapping the backend changes nothing
  // downstream.
  //
  // TWO BACKENDS, ONE INTERFACE. A private worker when its URL is set (a broker
  // you control beats a stranger's), the public MQTT broker otherwise — which
  // is the default, and the reason room codes need nothing deployed.
  const httpPut = (code, slot, payload) => call(`/r/${normalise(code)}/${slot}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload }),
  });

  const httpGet = (code, slot) => call(`/r/${normalise(code)}/${slot}`, { method: "GET" });

  // ---- the public-relay backend ---------------------------------------------
  // A Nostr room is LIVE, not a mailbox: unlike a retained MQTT message there
  // is nothing sitting there for later, so both peers meet in the room and swap
  // strings. That is why this is one exchange() rather than a put and a get —
  // and it is a better fit anyway, since the host is already sitting on a
  // "waiting for them to join" screen while it happens.
  function nostrExchange(o) {
    return NetNostr.exchange({
      code: o.code, send: o.mine, reply: o.reply, token: o.token, onTick: o.onTick,
    });
  }

  // HOST A ROOM several people can walk into, rather than trade one string with
  // one person. Resolves as soon as it is listening, with a stop() — the room
  // stays open and onJoiner fires per arrival.
  //
  // PUBLIC RELAY ONLY. The private mailbox is genuinely a mailbox: two fixed
  // slots with a single-writer rule on `offer` that exists to stop a second
  // host stealing somebody's guest, and per-joiner slots there are a different
  // change with its own failure modes. A configured private relay therefore
  // still hosts ONE guest, and says so rather than silently taking one player.
  function hostRoom(o) {
    if (usingPrivateRelay()) {
      return Promise.resolve({ ok: false, error: "not_supported",
        message: "Room codes on a private relay take one guest. Use the invite link for the others." });
    }
    return NetNostr.exchange({
      code: o.code, mintOffer: o.mintOffer, onJoiner: o.onJoiner,
      token: o.token, onTick: o.onTick,
      // A room that resolves early can still fail LATER — dead relays, the
      // code expiring — and after the promise is answered this callback is the
      // only way to say so.
      onFail: o.onFail,
    });
  }

  // The private relay keeps the put/get shape (it really is a mailbox); the
  // public one is a live swap. swap() is the interface the lobby uses, and it
  // hides which of the two is underneath.
  const put = (code, slot, payload) => httpPut(code, slot, payload);
  const get = (code, slot) => httpGet(code, slot);

  // Give `mine` to the other side and get theirs back, whichever backend is in
  // play. `slot`/`want` only mean anything to the mailbox backend.
  async function swap(o) {
    const { code, mine, reply, slot, want, token, onTick } = o;
    if (!usingPrivateRelay()) return nostrExchange(o);
    // The mailbox backend does the same trade in two steps. A replier waits
    // for the other side FIRST, then posts what it produced.
    if (reply) {
      const got = await waitFor(code, want, token, onTick);
      if (!got.ok) return got;
      let out = null;
      try { out = await reply(got.payload); } catch (e) { out = null; }
      if (!out) return ERR("reply_failed", "Could not answer that invite.");
      const posted = await httpPut(code, slot, out);
      return posted.ok ? { ok: true, payload: got.payload } : posted;
    }
    const posted = await httpPut(code, slot, mine);
    if (!posted.ok) return posted;
    const got = await waitFor(code, want, token, onTick);
    return got.ok ? { ok: true, payload: got.payload } : got;
  }

  // Poll until the other side posts, the caller cancels, or we give up. The
  // cancel token is an object with .cancelled — a plain flag rather than an
  // AbortController, because the thing being cancelled is a LOOP, and leaving a
  // poll running after someone has closed the lobby is how a dead screen keeps
  // hitting a server.
  async function waitFor(code, slot, token, onTick) {
    const started = Date.now();
    for (;;) {
      if (token && token.cancelled) return ERR("cancelled", "");
      // The window is the MQTT listen time per round; the HTTP backend ignores
      // it. Long enough that a retained message always lands, short enough that
      // cancelling feels immediate.
      const res = await get(code, slot, 2500);
      if (res.ok && res.body && res.body.payload) return { ok: true, payload: res.body.payload };
      // not_found simply means "not yet" — everything else is fatal and should
      // surface immediately rather than being retried for two minutes.
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
    // Exported for the tests: the crypto is what makes a public broker safe to
    // use, and "it encrypted something" is not the same claim as "the wrong
    // code cannot read it".
    seal, open, topicFor,
    makeCode, normalise, valid,
    put, get, waitFor,
  };
})();
