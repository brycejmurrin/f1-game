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
  const K_CTX = "apex26.spotify.context";       // chosen playlist uri, or "liked"
  const K_MODE = "apex26.spotify.mode";         // "remote" (Connect) | "browser" (SDK)
  const K_DEV = "apex26.spotify.device";        // remote mode: which device to play on

  // playlist-read-private / user-library-read are what let the panel OFFER
  // something to play. Without a chosen context, "play" on a freshly
  // transferred device resumes nothing: a browser that has never played has no
  // context to resume, so the device connects and stays silent.
  const SCOPES = "streaming user-read-playback-state " +
    "user-modify-playback-state user-read-currently-playing " +
    "playlist-read-private user-library-read";
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
  // Set by any listener that has already named a failure, so the SDK's next
  // token request cannot paper over it with a generic line.
  let explained = false;
  let lastPlayError = null;    // {status, reason} from the last refused play
  // Polled playback detail for the in-game player panel. There is no push
  // channel in remote mode, so everything here arrives on the 10s tick.
  let art = null, progressMs = 0, durationMs = 0;
  let shuffleOn = false, repeatMode = "off";
  let devVol = null, devSupportsVol = true, devName = "";
  let results = [];            // playlist search hits
  let title = "", artist = "";
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
  // TWO WAYS TO PLAY, and remote is the default because it works everywhere.
  //   "browser" — this tab becomes a Spotify device via the Web Playback SDK.
  //               Needs EME/DRM, needs a user gesture to unmute its own <audio>,
  //               and cannot work at all on iOS Safari (no FairPlay in the SDK).
  //   "remote"  — plain Web API: the game drives Spotify running on a phone or
  //               desktop the account already has. No DRM, no SDK, no gesture
  //               rules, works on every browser. The music comes out of that
  //               device instead of the game tab, which is the whole trade.
  function mode() { return ls(K_MODE) === "browser" ? "browser" : "remote"; }
  function setMode(m) {
    const v = m === "browser" ? "browser" : "remote";
    if (v === mode()) return v;
    lsSet(K_MODE, v);
    teardown();                       // the old transport is meaningless now
    setStatus(readToken() ? "configured" : (available() ? "configured" : "off"),
      v === "browser"
        ? "Switched to playing in this browser. Press CONNECT."
        : "Switched to controlling Spotify on another device. Press CONNECT.");
    return v;
  }
  function deviceId2() { return ls(K_DEV) || ""; }
  function setDevice(id) { if (id) lsSet(K_DEV, id); else lsDel(K_DEV); render(); return id || ""; }
  function contextUri() { return ls(K_CTX) || ""; }
  function setContext(v) { if (v) lsSet(K_CTX, v); else lsDel(K_CTX); render(); return v || ""; }
  let lists = [];                                // [{name, uri}] for the picker
  let devices = [];                              // remote mode: the account's devices

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
        explained = true;
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
        // A refresh does not always echo the scope; keep what was granted at
        // sign-in so debug()/check() can still say what this token may do.
        scope: j.scope || (readToken() || {}).scope || "",
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

  // COMING BACK FROM SPOTIFY LANDS ON THE TITLE SCREEN. The PKCE flow is a full
  // page navigation, so the game has restarted by the time we get here: the
  // player pressed CONNECT inside MUSIC & SOUND, went to accounts.spotify.com,
  // and returned to a fresh boot with the panel closed and no sign that
  // anything happened. Re-open the panel they left from so the sign-in ends
  // where it started, showing whether it worked.
  //
  // Deferred a tick: the synchronous error branches below run during
  // DOMContentLoaded, and game.js's own boot may still be settling the screens.
  function reopenPanel() {
    setTimeout(function () {
      try {
        const el = document.getElementById("audioset");
        if (!el) return;
        if (typeof syncAudioPanel === "function") syncAudioPanel();
        el.hidden = false;
        const wrap = document.getElementById("as-sp-wrap");
        if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ block: "center" });
      } catch (e) { /* the sign-in still succeeded — this is only the landing */ }
    }, 0);
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
    reopenPanel();          // every branch below ends in the panel, success or not
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
        scope: j.scope || "",
      });
      // A token WITHOUT the streaming scope reaches the player and comes back as
      // a bare "authentication_error", which reads as a login problem when the
      // login was fine. Spotify returns the scopes it actually granted, so say
      // the real thing instead: the app is not enabled for the Web Playback SDK.
      if (j.scope && j.scope.indexOf("streaming") < 0) {
        setStatus("error", "Signed in, but Spotify did not grant playback " +
          "permission. In your app's settings tick \"Web Playback SDK\", then " +
          "remove the app at spotify.com/account/apps and press CONNECT again.");
        return;
      }
      // The user pressed CONNECT one navigation ago, so finishing the job is
      // what they asked for — the only path that starts playback without a click.
      return mode() === "remote" ? connectRemote() : bootPlayer();
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
    explained = false;
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
        // Never calling cb() leaves the SDK waiting and it eventually reports a
        // generic auth failure, so a dead token has to be said out loud here —
        // but only if nothing has already explained WHY. The SDK asks for a
        // token again right after an error listener has run and cleared things
        // up, and this generic line was overwriting the specific cause.
        getOAuthToken: (cb) => {
          validToken().then((t) => {
            if (t) { cb(t); return; }
            teardown();
            if (!explained) {
              setStatus("configured", "The Spotify session could not be renewed. Press CONNECT to sign in again.");
            }
          });
        },
        volume: vol,
      });
      player.addListener("ready", ({ device_id }) => {
        deviceId = device_id;
        ready = true;
        explained = false;
        setStatus("connected", "Connected. Apex 26 is now a Spotify device.");
        // Install AFTER the transfer settles: GameAudio.setMusicBackend() calls
        // start() synchronously, and a play request aimed at a device Spotify
        // has not made active yet comes back "device not found".
        transfer(device_id).then(installBackend, installBackend);
        loadPlaylists();
      });
      player.addListener("not_ready", () => {
        ready = false;
        setStatus("connecting", "Playback moved to another Spotify device.");
      });
      // The four SDK errors mean completely different things to a user, so each
      // gets its own sentence instead of one raw payload dump. account_error is
      // by far the most common — it is what a non-Premium account looks like.
      // KEEP THE TOKEN. It is what check() needs: the player refusing a token
      // says nothing about why, but that same token still answers GET /v1/me,
      // which names the plan. Clearing it here threw away the only evidence and
      // left the user to guess between "not Premium" and "SDK not enabled" —
      // so instead, tear the player down and go ask.
      player.addListener("authentication_error", () => {
        explained = true;
        teardown();
        setStatus("configured", "Spotify rejected the session — checking why…");
        check();
      });
      player.addListener("account_error", () => {
        explained = true;
        teardown();
        setStatus("error", "This Spotify account cannot play here — full Premium is " +
          "required. Free accounts and the mobile-only plans (Premium Mini / Lite) " +
          "are not supported by Spotify's web player.");
      });
      player.addListener("initialization_error", () => {
        explained = true;
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
    stopPolling();
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

  // The picker's contents. Liked Songs is not a context uri — it is a set of
  // track uris — so it is offered as a sentinel and resolved at play time.
  function loadPlaylists() {
    return api("/me/playlists?limit=50").then((r) => {
      if (!r) return [];
      if (r.status === 403) {
        setStatus(state, "Your Spotify session predates the playlist permission. " +
          "Press DISCONNECT then CONNECT to grant it.");
        return [];
      }
      if (!r.ok) return [];
      return r.json().then((j) => (j.items || []).map((p) => ({ name: p.name, uri: p.uri })), () => []);
    }).then((ls_) => { lists = ls_ || []; render(); return lists; });
  }

  // PUT /me/player/play, aimed at THIS device, with whatever the player chose.
  // Reports the refusals that otherwise look like "connected but silent".
  function playChosen() {
    const q = mode() === "remote" ? remoteQuery()
      : (deviceId ? "?device_id=" + encodeURIComponent(deviceId) : "");
    const ctx = contextUri();
    let body;
    if (ctx === "liked") {
      // .catch on the parse, not just on r.ok: a 204 or an empty body is "ok"
      // and json() then throws, which escapes as an unhandled rejection — the
      // game shows those as a full-screen crash overlay.
      return api("/me/tracks?limit=50")
        .then((r) => (r && r.ok ? r.json().catch(() => null) : null)).then((j) => {
        const uris = j && j.items ? j.items.map((i) => i.track && i.track.uri).filter(Boolean) : [];
        if (!uris.length) { releaseToBuiltIn("No liked songs found to play."); return; }
        return sendPlay(q, JSON.stringify({ uris: uris }));
      });
    }
    body = ctx ? JSON.stringify({ context_uri: ctx }) : "{}";
    return sendPlay(q, body);
  }

  // Handing the music back is better than silence: while a backend is installed
  // GameAudio stays quiet, so a Spotify that cannot play leaves the player with
  // no music at all. On a failure we cannot fix, give the soundtrack back.
  function releaseToBuiltIn(msg) {
    removeBackend();
    setStatus("connected", msg + " The game's own music is playing instead — fix that and press PLAY to retry.");
  }

  function sendPlay(q, body, retried) {
    return api("/me/player/play" + q, { method: "PUT", body: body }).then((r) => {
      if (!r) return;
      if (r.ok || r.status === 204) {
        setStatus("connected", "Playing.");
        lastPlayError = null;
        installBackend();                 // it works — Spotify may own the music
        return;
      }
      // Spotify says WHY in the body ("Device not found", PREMIUM_REQUIRED,
      // "Player command failed: No active device"...). Mapping the status code
      // alone threw that away and left every refusal looking the same.
      return r.text().then((txt) => {
        let reason = "";
        try { const j = JSON.parse(txt); reason = (j.error && (j.error.reason || j.error.message)) || ""; }
        catch (e) { reason = (txt || "").slice(0, 120); }
        lastPlayError = { status: r.status, reason: reason };
        // 404 = "Device not found" / "No active device". Almost always a device
        // that has gone idle or been re-minted, so re-list, TRANSFER to it (the
        // step that actually wakes a sleeping device — a bare play at an
        // inactive device just 404s), and try once more.
        if (r.status === 404 && !retried && mode() === "remote") {
          setStatus("connected", "Waking your Spotify device…");
          return loadDevices().then((ds) => {
            const d = deviceId2();
            if (!d || !ds.length) {
              releaseToBuiltIn("No Spotify device is available. Open Spotify on your phone or " +
                "computer and play anything for a second.");
              return;
            }
            return api("/me/player", { method: "PUT", body: JSON.stringify({ device_ids: [d], play: true }) })
              .then(() => sendPlay(remoteQuery(), body, true));
          });
        }
        const hint = r.status === 404
            ? " Open Spotify on a device and play something for a second, then press REFRESH DEVICES."
          : r.status === 403 ? " Full Premium is required to play here."
          : r.status === 401 ? " Press CONNECT to sign in again."
          : "";
        releaseToBuiltIn("Spotify refused playback (" + r.status + (reason ? ": " + reason : "") + ")." + hint);
      }, () => { lastPlayError = { status: r.status, reason: "" };
        setStatus("connected", "Spotify refused playback (" + r.status + ")."); });
    });
  }

  /* ---------------- remote control (Web API / Spotify Connect) ----------------
     Everything here is plain REST against a device the account already has, so
     it needs no SDK, no DRM and no gesture. The cost is that we cannot be told
     when the track changes — there is no event — so the now-playing line is
     polled. 10 s is a deliberate floor: this runs for the whole session and a
     Development Mode app shares one modest quota across everything it does. */
  let pollTimer = null;

  function devicesList() {
    return api("/me/player/devices").then((r) => {
      if (!r) return [];
      if (!r.ok) return [];
      return r.json().then((j) => j.devices || [], () => []);
    });
  }

  function loadDevices() {
    return devicesList().then((ds) => {
      devices = ds;
      // A DEVICE ID IS NOT STABLE. Spotify mints a new one each time the app
      // restarts, so a stored id from yesterday names a device that no longer
      // exists — and playing at it returns 404 "Device not found". Drop it
      // whenever the live list disagrees.
      const known = deviceId2();
      if (known && !ds.some((d) => d.id === known)) lsDel(K_DEV);
      // Adopt whatever is already active, so the common case needs no choosing.
      if (!deviceId2()) {
        const act = ds.filter((d) => d.is_active)[0] || ds[0];
        if (act) lsSet(K_DEV, act.id);
      }
      if (!ds.length) {
        setStatus("connected", "No Spotify device found. Open Spotify on your phone or " +
          "computer (play anything for a second), then press REFRESH.");
      } else if (/No Spotify device found|Looking for your Spotify devices|Waking your Spotify device/.test(message)) {
        // CLEAR THE STALE COMPLAINT. The no-device line is written the moment
        // the list comes back empty — which it often is for a second before the
        // phone reports in — and nothing ever replaced it, so the panel sat
        // there insisting there was no device directly above a device picker
        // showing an active one, while music played.
        const cur = ds.filter((d) => d.id === deviceId2())[0] || ds[0];
        setStatus("connected", cur
          ? (cur.name + " is ready. Pick a playlist and press PLAY.")
          : "Connected. Pick a device and a playlist, then press PLAY.");
      }
      render();
      return ds;
    });
  }

  function pollNowPlaying() {
    if (mode() !== "remote" || state !== "connected") return Promise.resolve();
    return api("/me/player").then((r) => {
      if (!r) return;
      if (r.status === 204) { track = null; paused = true; emit(); return; }   // nothing playing
      if (!r.ok) return;
      return r.json().then((j) => {
        const it = j && j.item;
        track = it ? (it.name + " — " + (it.artists || []).map((a) => a.name).join(", ")) : null;
        title = it ? it.name : "";
        artist = it ? (it.artists || []).map((a) => a.name).join(", ") : "";
        // Smallest image that is still sharp on a phone row — the 640px master
        // is a needless download every poll.
        const imgs = (it && it.album && it.album.images) || [];
        art = imgs.length ? (imgs[imgs.length - 1] || imgs[0]).url : null;
        progressMs = (j && j.progress_ms) || 0;
        durationMs = (it && it.duration_ms) || 0;
        shuffleOn = !!(j && j.shuffle_state);
        repeatMode = (j && j.repeat_state) || "off";
        paused = !(j && j.is_playing);
        if (j && j.device) {
          devName = j.device.name || "";
          devVol = typeof j.device.volume_percent === "number" ? j.device.volume_percent : null;
          devSupportsVol = j.device.supports_volume !== false;
          if (j.device.id && !deviceId2()) lsSet(K_DEV, j.device.id);
        }
        emit();
      }, () => {});
    });
  }

  function startPolling() {
    stopPolling();
    pollNowPlaying();
    pollTimer = setInterval(pollNowPlaying, 10000);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  // Connect, remote flavour: there is nothing to boot. A valid token plus a
  // device the account owns IS the connection.
  function connectRemote() {
    setStatus("connecting", "Looking for your Spotify devices…");
    return validToken().then((t) => {
      if (!t) { setStatus("configured", "No Spotify session. Press CONNECT to sign in."); return; }
      state = "connected";
      setStatus("connected", "Connected. Pick a device and a playlist, then press PLAY.");
      installBackend();
      startPolling();
      return Promise.all([loadDevices(), loadPlaylists()]);
    });
  }

  function remoteQuery() {
    const d = deviceId2();
    return d ? "?device_id=" + encodeURIComponent(d) : "";
  }

  /* ---------------- player controls (remote) ----------------
     Each one fires and then re-polls shortly after: Spotify applies these
     asynchronously on the target device, so reading back immediately returns
     the previous state and the panel would show the opposite of what happened. */
  function afterCommand() { setTimeout(pollNowPlaying, 600); }

  function prev() {
    if (!BACKEND.active()) return;
    if (mode() === "remote") { api("/me/player/previous" + remoteQuery(), { method: "POST" }).then(afterCommand); return; }
    if (player) { try { player.previousTrack(); } catch (e) {} }
  }
  function toggle() {
    if (!BACKEND.active()) return;
    if (paused) BACKEND.start(); else BACKEND.stop();
    afterCommand();
  }
  function setShuffle(on) {
    if (!BACKEND.active() || mode() !== "remote") return;
    api("/me/player/shuffle?state=" + (on ? "true" : "false") +
        (deviceId2() ? "&device_id=" + encodeURIComponent(deviceId2()) : ""), { method: "PUT" }).then(afterCommand);
  }
  // off -> context -> track -> off. "context" is repeat-the-playlist, which is
  // the one a racing soundtrack actually wants.
  function cycleRepeat() {
    if (!BACKEND.active() || mode() !== "remote") return;
    const next = repeatMode === "off" ? "context" : repeatMode === "context" ? "track" : "off";
    api("/me/player/repeat?state=" + next +
        (deviceId2() ? "&device_id=" + encodeURIComponent(deviceId2()) : ""), { method: "PUT" }).then(afterCommand);
  }
  function setDeviceVolume(pct) {
    if (!BACKEND.active() || mode() !== "remote") return;
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    devVol = v;
    api("/me/player/volume?volume_percent=" + v +
        (deviceId2() ? "&device_id=" + encodeURIComponent(deviceId2()) : ""), { method: "PUT" });
  }
  function searchPlaylists(q) {
    const term = (q || "").trim();
    if (!term) { results = []; render(); return Promise.resolve([]); }
    return api("/search?type=playlist&limit=10&q=" + encodeURIComponent(term)).then((r) => {
      if (!r || !r.ok) return [];
      return r.json().then((j) => {
        // Spotify has been known to return null entries in this array.
        const items = ((j.playlists && j.playlists.items) || []).filter(Boolean);
        return items.map((p) => ({ name: p.name, uri: p.uri,
          by: (p.owner && p.owner.display_name) || "" }));
      }, () => []);
    }).then((rs) => { results = rs || []; render(); return results; });
  }
  function playUri(uri) {
    if (!uri) return;
    setContext(uri);
    playChosen();
  }

  /* ---------------- GameAudio backend ----------------
     GameAudio delegates ALL music here while this is installed. Stopping and
     resuming the built-in MP3 playlist is GameAudio's job, not ours. */
  // MOBILE BROWSERS REQUIRE THIS. Spotify's SDK creates its own <audio>, and on
  // mobile it can only be unmuted from inside a user gesture — activateElement()
  // is that handshake. Without it the device connects, the API accepts the play
  // call, and no sound ever comes out. Harmless on desktop, and safe to call
  // more than once.
  function activate() {
    if (player && typeof player.activateElement === "function") {
      try { const p = player.activateElement(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    }
  }

  const BACKEND = {
    start() {
      if (!BACKEND.active()) return;
      if (!paused) return;                     // already playing: no-op
      if (mode() === "remote") {
        // Resuming beats re-starting the context: it keeps the listener's place
        // in the album/playlist they were already on.
        if (track) { api("/me/player/play" + remoteQuery(), { method: "PUT", body: "{}" }).then(pollNowPlaying); return; }
        playChosen();
        return;
      }
      // Something is already loaded on this device — just un-pause it.
      if (track) { try { player.resume(); } catch (e) {} return; }
      // Otherwise there is nothing to resume, so play what the player picked.
      playChosen();
    },
    stop() {
      if (mode() === "remote") {
        if (BACKEND.active()) api("/me/player/pause" + remoteQuery(), { method: "PUT" }).then(pollNowPlaying);
        return;
      }
      if (player) { try { player.pause(); } catch (e) {} }
    },
    skip() {
      if (!BACKEND.active()) return null;
      if (mode() === "remote") {
        api("/me/player/next" + remoteQuery(), { method: "POST" })
          .then(() => setTimeout(pollNowPlaying, 600));   // Spotify needs a beat to settle
        return track;
      }
      try { player.nextTrack(); } catch (e) {}
      // nextTrack() is async — the real title lands on player_state_changed
      // (which re-renders), so return what is known now.
      return track;
    },
    setVolume(v01) {
      vol = Math.max(0, Math.min(1, typeof v01 === "number" ? v01 : 0.5));
      if (mode() === "remote") {
        // Not every device accepts remote volume (some phones refuse); a failure
        // here is not worth a message — the device's own control still works.
        if (BACKEND.active()) {
          api("/me/player/volume?volume_percent=" + Math.round(vol * 100) +
              (deviceId2() ? "&device_id=" + encodeURIComponent(deviceId2()) : ""), { method: "PUT" });
        }
        return vol;
      }
      if (player) { try { player.setVolume(vol); } catch (e) {} }
      return vol;
    },
    name() { return track; },
    active() {
      return mode() === "remote"
        ? (state === "connected" && !!readToken())
        : (state === "connected" && ready && !!player);
    },
  };

  // Guarded on the global AND the method: this file must survive being loaded
  // next to an older audio.js that has no backend hook at all.
  function setBackend(b) {
    if (typeof GameAudio === "undefined" || !GameAudio.setMusicBackend) return;
    try { GameAudio.setMusicBackend(b); } catch (e) {}
  }
  // While ANOTHER app owns the music, the game's own audio has to mix rather
  // than interrupt — on iOS the default "playback" session is exclusive, so the
  // first engine sound or UI tick paused Spotify the moment you switched to the
  // game. Only remote mode needs this: in browser mode the SDK's audio is ours.
  function syncSession() {
    if (typeof GameAudio === "undefined" || !GameAudio.setSessionType) return;
    try { GameAudio.setSessionType(mode() === "remote" && GameAudio.musicBackend() ? "ambient" : "playback"); }
    catch (e) {}
  }
  function installBackend() { setBackend(BACKEND); syncSession(); }
  function removeBackend() { setBackend(null); syncSession(); }

  /* ---------------- public control ---------------- */

  function available() { return !!clientId(); }
  function configured() { const c = clientId(); return c ? { clientId: c } : null; }

  /* ---------------- diagnostics ----------------
     "Spotify rejected the session" is the SDK refusing a token that auth already
     issued, and from inside the game the two causes look identical: an account
     that is not Premium, and an app not enabled for the Web Playback SDK. Both
     are answerable — the Web API says which — so ask it rather than guess.
     debug() is the console snapshot; check() is the one the panel button runs. */
  function debug() {
    const t = readToken() || {};
    const cid = clientId();
    return {
      state, message,
      // masked: a console snapshot gets pasted into bug reports
      clientId: cid ? cid.slice(0, 6) + "…" + cid.slice(-4) : null,
      redirectUri: redirectUri(),
      onLocalhost: onLocalhost(),
      secureContext: cryptoOk(),
      hasToken: !!t.access_token,
      hasRefresh: !!t.refresh_token,
      expiresInSec: t.expires_at ? Math.round((t.expires_at - Date.now()) / 1000) : null,
      grantedScopes: t.scope || null,
      streamingGranted: !!(t.scope && t.scope.indexOf("streaming") >= 0),
      sdkLoaded: !!(window.Spotify && window.Spotify.Player),
      playerReady: ready,
      deviceId, track,
    };
  }

  // GET /v1/me answers both questions at once: `product` is the plan, and a 401
  // means the token itself is dead. Returns a verdict object AND writes the
  // conclusion to the status line, so it works with or without a console.
  function check() {
    const d = debug();
    if (!available()) { setStatus("off", copyOff()); return Promise.resolve({ ok: false, reason: "no-client-id" }); }
    return validToken().then((t) => {
      if (!t) {
        setStatus("configured", "No Spotify session on this device. Press CONNECT to sign in.");
        return { ok: false, reason: "no-token", debug: d };
      }
      return fetch(API + "/me", { headers: { Authorization: "Bearer " + t } })
        .then((r) => r.json().then((j) => ({ code: r.status, j }), () => ({ code: r.status, j: {} })))
        .then(({ code, j }) => {
          const out = { ok: false, httpStatus: code, product: j.product || null,
            account: j.display_name || j.id || null, debug: debug() };
          if (code === 401) {
            setStatus("configured", "Spotify rejected the token itself (401). Press CONNECT to sign in again.");
            out.reason = "token-rejected";
          } else if (code === 403) {
            setStatus("error", "Spotify returned 403 — your account is probably not on this app's " +
              "user allowlist. Add it in the dashboard under User Management.");
            out.reason = "not-allowlisted";
          } else if (code !== 200) {
            setStatus("error", "Spotify's API answered " + code + ". Try again in a moment.");
            out.reason = "api-" + code;
          } else if (j.product !== "premium") {
            setStatus("error", "Signed in as " + (out.account || "?") + ", but this account is \"" +
              (j.product || "unknown") + "\" — the web player needs full Premium. " +
              "Free, Mini and Lite cannot play here.");
            out.reason = "not-premium";
          } else if (!out.debug.streamingGranted) {
            setStatus("error", "Premium account confirmed, but this token has no playback " +
              "permission. Tick \"Web Playback SDK\" in your app's settings, remove the app at " +
              "spotify.com/account/apps, then press CONNECT again.");
            out.reason = "no-streaming-scope";
          } else {
            out.ok = true;
            out.reason = "ok";
            setStatus(state === "connected" ? "connected" : "configured",
              "Account OK: Premium, playback permission granted" +
              (state === "connected" ? " — connected." : ". Press CONNECT."));
          }
          return out;
        })
        .catch(() => {
          setStatus("error", "Could not reach Spotify's API — offline, or blocked.");
          return { ok: false, reason: "network", debug: d };
        });
    });
  }

  function setClientId(s) {
    const v = (s || "").trim();
    // Clearing the ID must also drop the session: a token minted by an app we
    // no longer know the ID of can never be refreshed.
    if (!v) { lsDel(K_ID); disconnect(); return null; }
    // CHANGING the ID must drop it too. A token belongs to the app that minted
    // it — hand app A's token to app B's player and Spotify rejects the session,
    // and the refresh that would normally recover fails as invalid_client. The
    // stored token outlives its app by an hour, so without this a corrected
    // Client ID (a typo, or the secret pasted by mistake) stays broken until
    // DISCONNECT is pressed, with nothing on screen saying why.
    if (v !== clientId()) { clearToken(); teardown(); }
    lsSet(K_ID, v);
    setStatus("configured", "Client ID saved. Press CONNECT to sign in to Spotify.");
    return v;
  }

  function connect() {
    if (!available()) { setStatus("off", copyOff()); return Promise.resolve(); }
    if (state === "connected") return Promise.resolve();
    if (mode() === "remote") {
      return validToken().then((t) => (t ? connectRemote() : beginAuth()));
    }
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

  // Both panels show the same two lists, so build them through one helper —
  // and only when the contents actually changed, so an open <select> on a phone
  // is not torn out from under a thumb mid-scroll.
  function fillSelect(id, opts, value, disabled) {
    const sel = el(id);
    if (!sel) return;
    const want = JSON.stringify(opts);
    if (sel.dataset.built !== want) {
      sel.dataset.built = want;
      sel.textContent = "";
      for (const o of opts) {
        const e = document.createElement("option");
        e.value = o[1]; e.textContent = o[0]; sel.appendChild(e);
      }
    }
    if (sel.value !== value) sel.value = value;
    sel.disabled = !!disabled;
  }
  function playlistOpts() {
    const o = [[lists.length ? "— pick a playlist —" : "— connect to load playlists —", ""], ["♥ Liked Songs", "liked"]];
    for (const p of lists) o.push([p.name, p.uri]);
    return o;
  }
  function deviceOpts() {
    if (!devices.length) return [["— no devices found —", ""]];
    return devices.map((d) => [d.name + (d.type ? " (" + d.type + ")" : "") +
      (d.is_active ? " • active" : "") + (d.is_restricted ? " • restricted" : ""), d.id]);
  }

  function fmt(ms) {
    if (!ms || ms < 0) return "0:00";
    const t = Math.floor(ms / 1000);
    return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  }

  // The in-game player panel (#spotifypanel). Setup lives in MUSIC & SOUND;
  // this is what you open mid-session.
  function renderPlayer() {
    if (!el("spotifypanel")) return;
    const live = BACKEND.active();
    const img = el("sp-art");
    if (img) {
      if (art && img.getAttribute("src") !== art) img.setAttribute("src", art);
      img.hidden = !art;
    }
    txt("sp-title", title || (live ? "Nothing playing" : "Not connected"));
    txt("sp-artist", artist || "");
    txt("sp-on", devName ? (paused ? "Paused on " + devName : "Playing on " + devName) : "");
    const fill = el("sp-bar-fill");
    if (fill) fill.style.width = (durationMs ? Math.max(0, Math.min(100, (progressMs / durationMs) * 100)) : 0) + "%";
    const tog = el("sp-toggle");
    if (tog) {
      tog.textContent = paused ? "▶" : "❚❚";
      tog.setAttribute("aria-label", paused ? "Play" : "Pause");
    }
    const sh = el("sp-shuffle");
    if (sh) sh.classList.toggle("active", shuffleOn);
    txt("sp-repeat", "REPEAT: " + (repeatMode === "context" ? "ALL" : repeatMode === "track" ? "ONE" : "OFF"));
    const rp = el("sp-repeat");
    if (rp) rp.classList.toggle("active", repeatMode !== "off");
    const vol = el("sp-vol");
    if (vol && devVol !== null && document.activeElement !== vol) vol.value = String(devVol);
    txt("sp-vol-v", devVol === null ? "—" : String(devVol));
    if (vol) vol.disabled = !live || !devSupportsVol;
    ["sp-prev", "sp-toggle", "sp-fwd", "sp-shuffle", "sp-repeat", "sp-refresh2"].forEach((i) => dis(i, !live));
    fillSelect("sp-playlist2", playlistOpts(), contextUri(), !live);
    fillSelect("sp-device2", deviceOpts(), deviceId2(), !live);
    txt("sp-status2", message || (live ? "" : "Not connected — open MUSIC & SOUND to set Spotify up."));

    const box = el("sp-results");
    if (box) {
      box.textContent = "";
      for (const r of results) {
        const row = document.createElement("div");
        row.className = "music-row";
        const n = document.createElement("span");
        n.className = "music-name";
        n.textContent = r.name + (r.by ? "  ·  " + r.by : "");
        const b = document.createElement("button");
        b.type = "button"; b.className = "music-play"; b.textContent = "▶";
        b.setAttribute("aria-label", "Play " + r.name);
        b.onclick = () => playUri(r.uri);
        row.append(n, b);
        box.appendChild(row);
      }
    }
    // The pause-menu entry is only useful once there is something to control.
    const pm = el("pm-spotify");
    if (pm) pm.disabled = !available() || state !== "connected";
  }

  function render() {
    renderPlayer();
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

    fillSelect("as-sp-playlist", playlistOpts(), contextUri(), state !== "connected");
    // MODE + DEVICE. The device row only means anything in remote mode, so it
    // is disabled (never hidden) elsewhere — hiding reflows the sheet.
    const remote = mode() === "remote";
    const b1 = el("as-sp-mode-remote"), b2 = el("as-sp-mode-browser");
    if (b1) b1.classList.toggle("active", remote);
    if (b2) b2.classList.toggle("active", !remote);
    fillSelect("as-sp-device", deviceOpts(), deviceId2(), !remote || state !== "connected");
    dis("as-sp-refresh", !remote || state !== "connected");
    const live = state === "connected" && (remote ? !!readToken() : ready);
    dis("as-sp-play", !live);
    dis("as-sp-pause", !live);
    dis("as-sp-next", !live);
    dis("as-sp-check", !available() || !readToken());
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
    on("as-sp-check", "click", () => { check(); });
    on("as-sp-mode-remote", "click", () => setMode("remote"));
    on("as-sp-mode-browser", "click", () => setMode("browser"));
    on("as-sp-device", "change", (e) => setDevice(e.target.value));
    on("as-sp-refresh", "click", () => loadDevices());

    // ---- the in-game player panel ----
    on("sp-prev", "click", prev);
    on("sp-toggle", "click", () => { activate(); toggle(); });
    on("sp-fwd", "click", () => BACKEND.skip());
    on("sp-shuffle", "click", () => setShuffle(!shuffleOn));
    on("sp-repeat", "click", cycleRepeat);
    on("sp-vol", "input", (e) => { txt("sp-vol-v", e.target.value); });
    // Commit on release, not on every pixel of the drag: each one is an API
    // call, and a dragged slider would spend the whole rate-limit budget.
    on("sp-vol", "change", (e) => setDeviceVolume(+e.target.value || 0));
    on("sp-playlist2", "change", (e) => { activate(); setContext(e.target.value); if (e.target.value) playChosen(); });
    on("sp-device2", "change", (e) => setDevice(e.target.value));
    on("sp-refresh2", "click", () => loadDevices());
    on("sp-close", "click", () => { const p = el("spotifypanel"); if (p) p.hidden = true; });
    let searchT = null;
    on("sp-search", "input", (e) => {
      const q = e.target.value;
      if (searchT) clearTimeout(searchT);
      // Debounced: one request per pause in typing, not per keystroke.
      searchT = setTimeout(() => searchPlaylists(q), 350);
    });
    on("as-sp-playlist", "change", (e) => {
      activate();
      setContext(e.target.value);
      // Picking one is the instruction to play it — otherwise the choice sits
      // there doing nothing until something else happens to call start().
      if (e.target.value && BACKEND.active()) playChosen();
    });
    on("as-sp-play", "click", () => {
      activate();                       // must happen inside the click itself
      if (!BACKEND.active()) return;
      if (track) { try { player.resume(); } catch (e) {} } else playChosen();
    });
    on("as-sp-pause", "click", () => BACKEND.stop());
    on("as-sp-next", "click", () => BACKEND.skip());
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
    connect, disconnect, status, onChange, debug, check,
    playlists() { return lists.slice(); },
    // What Spotify thinks is going on, for the console: the devices it can see,
    // the SDK's own player state, and why the last play call was refused.
    devices() {
      return api("/me/player/devices")
        .then((r) => (r && r.ok ? r.json().catch(() => null) : { httpStatus: r && r.status }));
    },
    sdkState() {
      if (!player || !player.getCurrentState) return Promise.resolve(null);
      return player.getCurrentState().catch(() => null);
    },
    lastPlayError() { return lastPlayError; },
    activate,
    context: contextUri, setContext, play() { return playChosen(); },
    mode, setMode, setDevice, deviceList() { return devices.slice(); },
    // Called by game.js when the panel opens: poll immediately rather than
    // showing whatever the last 10s tick left behind.
    openPanel() {
      const p = el("spotifypanel");
      if (p) p.hidden = false;
      render();
      if (BACKEND.active()) { pollNowPlaying(); loadDevices(); }
    },
    prev, toggle, setShuffle, cycleRepeat, setDeviceVolume, searchPlaylists, playUri,
    nowPlaying() {
      return { title, artist, art, paused, progressMs, durationMs,
        shuffle: shuffleOn, repeat: repeatMode, device: devName,
        volume: devVol, supportsVolume: devSupportsVol };
    },
    refreshDevices() { return loadDevices(); },
    backend() { return BACKEND; },
    redirectUri, handleRedirect,
  };
})();
