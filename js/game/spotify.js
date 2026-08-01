"use strict";
/*
 * SpotifyMusic — OPTIONAL, PERSONAL-USE Spotify Premium soundtrack for Apex 26.
 *
 * WHAT IT IS. Given the owner's own Spotify app Client ID, the game hands its
 * music channel to the Spotify Web Playback SDK: the browser becomes a Spotify
 * Connect device named "Apex 26" and the existing music controls drive it via
 * GameAudio.setMusicBackend(), so every startMusic/stopMusic/skipTrack/
 * setMusicVolume call site in game.js keeps working untouched.
 *
 * WHY THE CLIENT ID IS NOT COMMITTED. Spotify's Developer Policy does not
 * permit shipping Spotify audio as a game soundtrack, and an app in
 * Development Mode only serves a handful of hand-allowlisted Premium accounts.
 * A baked-in ID would therefore ship a feature that is neither licensed for
 * the public nor functional for anyone off the allowlist — a broken button on
 * every visitor's screen. So the ID lives in localStorage
 * ("apex26.spotify.clientId"). With none stored this module does nothing at
 * all: no fetch, no SDK script, no state, no change to the game's audio.
 *
 * WHAT THE OWNER NEEDS. Full Spotify PREMIUM (the mobile-only plans, Premium
 * Mini / Lite, cannot host a web player), their own app in the Spotify
 * developer dashboard with this page's exact URL registered as a Redirect URI,
 * and their account on that app's user allowlist.
 *
 * AUTH is Authorization Code with PKCE, browser-only — a static site has
 * nowhere to hide a client secret, which is exactly the case PKCE exists for.
 * Tokens go to localStorage; the one-shot verifier/state go to sessionStorage
 * because they must not outlive the tab.
 *
 * FAILURE POSTURE. Offline, blocked script, expired or revoked token, free
 * account, unsupported browser — each ends as a readable line in #as-sp-status
 * with the built-in MP3 music still playing. Nothing here may throw into boot.
 */
window.SpotifyMusic = (function () {
  const K_ID = "apex26.spotify.clientId";
  const K_TOKEN = "apex26.spotify.token";
  const S_VERIFY = "apex26.spotify.verifier";   // sessionStorage: one auth round-trip
  const S_STATE = "apex26.spotify.state";

  const SCOPES = "streaming user-read-playback-state " +
    "user-modify-playback-state user-read-currently-playing";
  const AUTH_URL = "https://accounts.spotify.com/authorize";
  const TOKEN_URL = "https://accounts.spotify.com/api/token";
  const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
  const API = "https://api.spotify.com/v1";

  let state = "off";          // off | configured | connecting | connected | error
  let message = "";
  let deviceId = null;
  let track = null;           // "Track — Artist"
  let paused = true;
  let player = null;          // Spotify.Player
  let ready = false;
  let sdkPromise = null;
  let vol = 0.5;
  const subs = [];

  /* ---------------- storage (raw, not GameStore) ----------------
     Deliberately not GameStore.store: this must be queryable before game.js has
     built anything, and its cache would hold a stale ID after a manual
     localStorage edit. Keys keep the apex26. prefix. Every access is
     try/catch'd — Safari private mode throws on read AND write. */
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function ss(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }

  function clientId() { return (ls(K_ID) || "").trim(); }

  function readToken() {
    try { const t = JSON.parse(ls(K_TOKEN) || "null"); return t && t.access_token ? t : null; }
    catch (e) { return null; }
  }
  function writeToken(t) { lsSet(K_TOKEN, JSON.stringify(t)); }
  function clearToken() { lsDel(K_TOKEN); }

  /* ---------------- status ---------------- */

  function status() { return { state, message, deviceId, track }; }
  function setStatus(s, msg) { state = s; message = msg || ""; emit(); }
  function emit() {
    for (const fn of subs) { try { fn(status()); } catch (e) {} }
    render();
  }
  function onChange(fn) {
    if (typeof fn === "function") subs.push(fn);
    return function off() { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
  }

  /* ---------------- PKCE ---------------- */

  function b64url(bytes) {
    const a = new Uint8Array(bytes);
    let s = "";
    for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function randomB64(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
  function challengeFor(v) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)).then(b64url);
  }
  // crypto.subtle only exists in a secure context — file:// and plain-http LAN
  // addresses have neither that nor a redirect URI Spotify would accept anyway.
  function cryptoOk() {
    return typeof crypto !== "undefined" && !!crypto.getRandomValues &&
      !!crypto.subtle && typeof crypto.subtle.digest === "function";
  }

  // THE #1 SETUP FAILURE is a redirect URI that does not match the dashboard
  // byte for byte, so the panel prints exactly this string for copy/paste.
  // Query and hash are stripped: the game boots from this same URL and Spotify
  // compares the registered value literally.
  // Spotify no longer accepts "localhost" — local dev must use the explicit
  // loopback address, e.g. http://127.0.0.1:3456/ (serve from 127.0.0.1, not
  // localhost, and this string comes out right).
  function redirectUri() { return location.origin + location.pathname; }
  function onLocalhost() { return location.hostname === "localhost"; }

  /* ---------------- token lifecycle ---------------- */

  // Returns a usable access token, refreshing when it is inside 60 s of expiry,
  // or null when we are not (or no longer) authorised.
  function validToken() {
    const t = readToken();
    if (!t) return Promise.resolve(null);
    if (t.expires_at && Date.now() < t.expires_at - 60000) return Promise.resolve(t.access_token);
    if (!t.refresh_token) { clearToken(); return Promise.resolve(null); }
    return refresh(t.refresh_token);
  }

  function refresh(refreshToken) {
    const cid = clientId();
    if (!cid) return Promise.resolve(null);
    return postToken(new URLSearchParams({
      grant_type: "refresh_token", refresh_token: refreshToken, client_id: cid,
    })).then((j) => {
      if (!j) return null;
      if (j.error) {
        // invalid_grant = app revoked, or the refresh token was rotated away.
        // Retrying would just spin; drop it and report disconnected.
        clearToken();
        teardown();
        setStatus("configured", j.error === "invalid_grant"
          ? "Spotify session expired or the app was revoked. Press CONNECT to sign in again."
          : "Could not refresh the Spotify session (" + j.error + "). Press CONNECT.");
        return null;
      }
      // Spotify ROTATES refresh tokens: when a new one comes back the old one
      // dies with it, so persist whatever arrived and keep the old as fallback.
      writeToken({
        access_token: j.access_token,
        refresh_token: j.refresh_token || refreshToken,
        expires_at: Date.now() + (j.expires_in || 3600) * 1000,
      });
      return j.access_token;
    });
  }

  function postToken(body) {
    return fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body,
    }).then((r) => r.json().catch(() => ({ error: "bad_response" })))
      .catch(() => ({ error: "network" }));
  }

  /* ---------------- authorise / redirect ---------------- */

  function beginAuth() {
    const cid = clientId();
    if (!cid) { setStatus("off", copyOff()); return Promise.resolve(); }
    if (!cryptoOk()) {
      setStatus("error", "This page is not a secure context, so the sign-in " +
        "cannot be signed. Serve it over https, or from http://127.0.0.1:<port>/ .");
      return Promise.resolve();
    }
    const verifier = randomB64(64), st = randomB64(16);
    ssSet(S_VERIFY, verifier);
    ssSet(S_STATE, st);
    setStatus("connecting", "Redirecting to Spotify to sign in…");
    return challengeFor(verifier).then((challenge) => {
      location.assign(AUTH_URL + "?" + new URLSearchParams({
        client_id: cid, response_type: "code", redirect_uri: redirectUri(),
        code_challenge_method: "S256", code_challenge: challenge,
        state: st, scope: SCOPES,
      }).toString());
    }).catch(() => setStatus("error", "Could not start the Spotify sign-in on this browser."));
  }

  // Strip only OUR params, so any other query the game was launched with
  // survives. Leaving ?code= behind is a real bug here: the game boots from
  // this URL and a refresh would re-submit an already-used code.
  function cleanUrl() {
    try {
      const u = new URL(location.href);
      ["code", "state", "error"].forEach((k) => u.searchParams.delete(k));
      const q = u.searchParams.toString();
      history.replaceState(null, "", u.pathname + (q ? "?" + q : "") + u.hash);
    } catch (e) { /* no history API — harmless */ }
  }

  // Safe to call on EVERY load, including when nothing Spotify-related is
  // configured: with no pending verifier in sessionStorage this returns without
  // touching storage, the network or the URL.
  function handleRedirect() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return Promise.resolve(); }
    const code = params.get("code"), st = params.get("state"), err = params.get("error");
    const verifier = ss(S_VERIFY), wantState = ss(S_STATE);
    if (!verifier) return Promise.resolve();          // not our redirect
    if (!code && !err) return Promise.resolve();
    ssDel(S_VERIFY);
    ssDel(S_STATE);
    cleanUrl();
    if (err) {
      setStatus("error", err === "access_denied"
        ? "Sign-in cancelled."
        : "Spotify refused the sign-in (" + err + "). Check the Client ID, the " +
          "redirect URI, and that your account is on the app's allowlist.");
      return Promise.resolve();
    }
    if (!st || st !== wantState) {
      setStatus("error", "Sign-in state mismatch — ignored for safety. Press CONNECT to retry.");
      return Promise.resolve();
    }
    const cid = clientId();
    if (!cid) return Promise.resolve();
    setStatus("connecting", "Completing Spotify sign-in…");
    return postToken(new URLSearchParams({
      grant_type: "authorization_code", code: code, redirect_uri: redirectUri(),
      client_id: cid, code_verifier: verifier,
    })).then((j) => {
      if (!j || j.error || !j.access_token) {
        setStatus("error", "Token exchange failed" + (j && j.error ? " (" + j.error + ")" : "") +
          ". The redirect URI here must match the dashboard exactly.");
        return;
      }
      writeToken({
        access_token: j.access_token,
        refresh_token: j.refresh_token || null,
        expires_at: Date.now() + (j.expires_in || 3600) * 1000,
      });
      // The user pressed CONNECT one navigation ago, so finishing the job is
      // what they asked for — the only path that boots the SDK without a click.
      return bootPlayer();
    });
  }

  /* ---------------- Web Playback SDK ---------------- */

  function loadSdk() {
    if (window.Spotify && window.Spotify.Player) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((res, rej) => {
      // The SDK calls one global hook. Chain any existing handler rather than
      // stomping it — another script (or a second call here) may own it.
      const prev = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = function () {
        if (typeof prev === "function") { try { prev(); } catch (e) {} }
        res();
      };
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.onerror = () => rej(new Error("blocked"));
      document.head.appendChild(s);
      setTimeout(() => rej(new Error("timeout")), 20000);
    });
    return sdkPromise;
  }

  function bootPlayer() {
    if (player) { installBackend(); return Promise.resolve(); }
    setStatus("connecting", "Loading the Spotify player…");
    return loadSdk().then(() => {
      if (typeof GameAudio !== "undefined" && GameAudio.volumes) {
        try { vol = GameAudio.volumes().music; } catch (e) {}
      }
      player = new Spotify.Player({
        name: "Apex 26",
        // Called by the SDK whenever it needs a token — including after ours
        // expires, which is why it must go through validToken() and not a
        // captured string.
        getOAuthToken: (cb) => { validToken().then((t) => { if (t) cb(t); }); },
        volume: vol,
      });
      player.addListener("ready", ({ device_id }) => {
        deviceId = device_id;
        ready = true;
        setStatus("connected", "Connected. Apex 26 is now a Spotify device.");
        // Install AFTER the transfer settles: GameAudio.setMusicBackend() calls
        // start() synchronously, and a play request aimed at a device Spotify
        // has not made active yet comes back "device not found".
        transfer(device_id).then(installBackend, installBackend);
      });
      player.addListener("not_ready", () => {
        ready = false;
        setStatus("connecting", "Playback moved to another Spotify device.");
      });
      // The four SDK errors mean completely different things to a user, so each
      // gets its own sentence instead of one raw payload dump. account_error is
      // by far the most common — it is what a non-Premium account looks like.
      player.addListener("authentication_error", () => {
        clearToken(); teardown();
        setStatus("configured", "Spotify rejected the session. Press CONNECT to sign in again.");
      });
      player.addListener("account_error", () => {
        teardown();
        setStatus("error", "This Spotify account cannot play here — full Premium is " +
          "required. Free accounts and the mobile-only plans (Premium Mini / Lite) " +
          "are not supported by Spotify's web player.");
      });
      player.addListener("initialization_error", () => {
        teardown();
        setStatus("error", "This browser can't run the Spotify player (no encrypted-" +
          "media support). iOS Safari is the usual case — try desktop Chrome, Edge or Firefox.");
      });
      player.addListener("playback_error", () =>
        setStatus("connected", "Spotify could not play that track. Try SKIP TRACK."));
      player.addListener("player_state_changed", (s) => {
        if (!s) { track = null; paused = true; emit(); return; }
        const t = s.track_window && s.track_window.current_track;
        track = t ? (t.name + " — " + (t.artists || []).map((a) => a.name).join(", ")) : null;
        paused = !!s.paused;
        emit();
      });
      return player.connect();
    }).then((ok) => {
      if (ok === false) setStatus("error", "The Spotify player refused to connect.");
    }).catch((e) => {
      sdkPromise = null;                 // allow a retry after a transient failure
      teardown();
      setStatus("error", e && e.message === "blocked"
        ? "Could not load the Spotify player script — offline, or blocked by an extension."
        : "The Spotify player did not start (timed out). Check your connection and retry.");
    });
  }

  function teardown() {
    ready = false;
    deviceId = null;
    track = null;
    if (player) { try { player.disconnect(); } catch (e) {} }
    player = null;
    removeBackend();
  }

  /* ---------------- Spotify Web API ---------------- */

  function api(path, opts) {
    return validToken().then((t) => {
      if (!t) return null;
      const o = Object.assign({}, opts || {});
      o.headers = Object.assign(
        { Authorization: "Bearer " + t, "Content-Type": "application/json" },
        o.headers || {});
      return fetch(API + path, o).catch(() => null);   // offline is not an error worth shouting about
    });
  }

  // Make this browser the active device. play:false so merely connecting never
  // blasts audio at someone who only opened the settings panel.
  function transfer(id) {
    return api("/me/player",
      { method: "PUT", body: JSON.stringify({ device_ids: [id], play: false }) });
  }

  /* ---------------- GameAudio backend ----------------
     GameAudio delegates ALL music here while this is installed. Stopping and
     resuming the built-in MP3 playlist is GameAudio's job, not ours. */
  const BACKEND = {
    start() {
      if (!BACKEND.active()) return;
      if (!paused) return;                     // already playing: no-op
      // resume() needs a context on this device. A freshly transferred device
      // has none, so ask the Web API to resume whatever the account last played
      // — otherwise CONNECT then PLAY does nothing and looks broken.
      if (track) { try { player.resume(); } catch (e) {} return; }
      api("/me/player/play" + (deviceId ? "?device_id=" + encodeURIComponent(deviceId) : ""),
        { method: "PUT", body: "{}" });
    },
    stop() { if (player) { try { player.pause(); } catch (e) {} } },
    skip() {
      if (!BACKEND.active()) return null;
      try { player.nextTrack(); } catch (e) {}
      // nextTrack() is async — the real title lands on player_state_changed
      // (which re-renders), so return what is known now.
      return track;
    },
    setVolume(v01) {
      vol = Math.max(0, Math.min(1, typeof v01 === "number" ? v01 : 0.5));
      if (player) { try { player.setVolume(vol); } catch (e) {} }
      return vol;
    },
    name() { return track; },
    active() { return state === "connected" && ready && !!player; },
  };

  // Guarded on the global AND the method: this file must survive being loaded
  // next to an older audio.js that has no backend hook at all.
  function setBackend(b) {
    if (typeof GameAudio === "undefined" || !GameAudio.setMusicBackend) return;
    try { GameAudio.setMusicBackend(b); } catch (e) {}
  }
  function installBackend() { setBackend(BACKEND); }
  function removeBackend() { setBackend(null); }

  /* ---------------- public control ---------------- */

  function available() { return !!clientId(); }
  function configured() { const c = clientId(); return c ? { clientId: c } : null; }

  function setClientId(s) {
    const v = (s || "").trim();
    // Clearing the ID must also drop the session: a token minted by an app we
    // no longer know the ID of can never be refreshed.
    if (!v) { lsDel(K_ID); disconnect(); return null; }
    lsSet(K_ID, v);
    setStatus("configured", "Client ID saved. Press CONNECT to sign in to Spotify.");
    return v;
  }

  function connect() {
    if (!available()) { setStatus("off", copyOff()); return Promise.resolve(); }
    if (state === "connected") return Promise.resolve();
    return validToken().then((t) => (t ? bootPlayer() : beginAuth()));
  }

  // Local revoke only — Spotify has no browser-side revoke endpoint, so the
  // honest wording is "signed out on this device". The app itself is removed
  // from the account at spotify.com/account/apps.
  function disconnect() {
    clearToken();
    teardown();
    setStatus(available() ? "configured" : "off",
      available() ? "Signed out of Spotify on this device." : copyOff());
  }

  /* ---------------- panel ---------------- */

  // Short on purpose: the Premium / own-app / allowlist requirements are static
  // and live in the panel's own help paragraph. Repeating them in a live status
  // line just prints the same three sentences twice.
  function copyOff() {
    return "off — paste a Client ID above to enable it.";
  }

  function el(id) { return document.getElementById(id); }
  function txt(id, s) { const e = el(id); if (e) e.textContent = s; }
  function dis(id, b) { const e = el(id); if (e) e.disabled = !!b; }

  function render() {
    const wrap = el("as-sp-wrap");
    if (!wrap) return;
    // The state goes on a DATA ATTRIBUTE, not a class, so CSS can style the
    // setup-vs-connected halves without this touching the author's classList.
    // Controls themselves are only ever DISABLED, never hidden — hiding them
    // reflows the settings grid and the next tap lands on the wrong button.
    wrap.dataset.spState = state;

    const idEl = el("as-sp-id");
    // Never clobber what the user is typing.
    if (idEl && document.activeElement !== idEl && idEl.value !== clientId()) {
      idEl.value = clientId();
    }
    txt("as-sp-uri", redirectUri());
    let msg = message || (available() ? "Ready to connect." : copyOff());
    if (onLocalhost()) {
      msg += " NOTE: Spotify rejects \"localhost\" as a redirect URI — serve the " +
        "game from http://127.0.0.1:<port>/ instead and re-copy the URI above.";
    }
    txt("as-sp-status", msg);
    txt("as-sp-now", state === "connected"
      ? (track ? (paused ? "Paused — " + track : track) : "Nothing playing yet.")
      : "—");

    dis("as-sp-connect", !available() || state === "connecting" || state === "connected");
    dis("as-sp-disconnect", !available() || (state !== "connected" && !readToken()));
  }

  function on(id, ev, fn) { const e = el(id); if (e) e.addEventListener(ev, fn); }

  function bind() {
    const idEl = el("as-sp-id");
    on("as-sp-save", "click", () => setClientId(idEl ? idEl.value : ""));
    on("as-sp-id", "keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); setClientId(idEl.value); }
    });
    on("as-sp-connect", "click", () => { connect(); });
    on("as-sp-disconnect", "click", () => { disconnect(); });
  }

  function init() {
    // Adopt the stored config FIRST, so the redirect handler and the first
    // render agree about whether the feature exists at all. Note we never
    // auto-connect here even with a live token: booting the SDK is exactly the
    // "runs for someone who did not ask for it" case this feature must avoid.
    state = available() ? "configured" : "off";
    message = available() ? "Press CONNECT to sign in to Spotify." : copyOff();
    bind();
    render();
    try { handleRedirect(); } catch (e) { /* silent — MP3 music continues */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  return {
    available, configured, setClientId,
    connect, disconnect, status, onChange,
    backend() { return BACKEND; },
    redirectUri, handleRedirect,
  };
})();
