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
 * IT IS A BACKUP OPTION, NOT A REPLACEMENT. The code-paste and QR paths stay
 * and remain the primary route, because unlike the rest of the game — static
 * files that cannot break — this depends on a service somebody has to keep
 * alive. So when it is gone or unreachable the lobby must FALL BACK rather than
 * fail: every function here resolves to a typed error instead of throwing, and
 * none of them sits on a path the other two flows touch. The option is shown
 * either way; hiding a feature because a URL is unset only guarantees that the
 * one person who could fix it never learns it exists.
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

  // Where the relay lives. THE ONE PLACE TO SET IT after deploying
  // worker/rendezvous.js — paste the workers.dev URL here and room codes work
  // for everyone, with no per-device setup.
  //
  // Empty means "not deployed yet", which is NOT the same as "hidden": the
  // option stays on screen and says what is missing, because a button that
  // silently does nothing is worse than one that explains itself. localStorage
  // apex26.rendezvous overrides this, for pointing a dev build at a staging
  // worker without editing the file.
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

  // Whether a relay is actually reachable-in-principle. The UI does NOT hide
  // itself on false — it explains. Hiding a feature because a URL is unset
  // means the person who could fix it never finds out it exists.
  const configured = () => !!baseUrl();

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
  const NO_URL = () => ERR("not_configured",
    "Room codes are not set up in this build — use the invite link instead.");

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

  // ---- the two halves -------------------------------------------------------
  // Deliberately the same shape as NetHandshake's: publish a blob, then wait for
  // the other one to appear. What travels is exactly the invite/answer code the
  // manual flow uses, so the relay is a courier and not a participant — it never
  // needs to understand an SDP, and swapping it out changes nothing downstream.
  const put = (code, slot, payload) => call(`/r/${normalise(code)}/${slot}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload }),
  });

  const get = (code, slot) => call(`/r/${normalise(code)}/${slot}`, { method: "GET" });

  // Poll until the other side posts, the caller cancels, or we give up. The
  // cancel token is an object with .cancelled — a plain flag rather than an
  // AbortController, because the thing being cancelled is a LOOP, and leaving a
  // poll running after someone has closed the lobby is how a dead screen keeps
  // hitting a server.
  async function waitFor(code, slot, token, onTick) {
    const started = Date.now();
    for (;;) {
      if (token && token.cancelled) return ERR("cancelled", "");
      const res = await get(code, slot);
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
    ALPHABET, CODE_LEN, POLL_TIMEOUT_MS, STORE_KEY, DEFAULT_URL,
    configured, setUrl, baseUrl,
    makeCode, normalise, valid,
    put, get, waitFor,
  };
})();
