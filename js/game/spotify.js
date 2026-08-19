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
  let explained = false;
  let lastPlayError = null;    // {status, reason} from the last refused play
  let art = null, progressMs = 0, durationMs = 0;
  let shuffleOn = false, repeatMode = "off";
  let devVol = null, devSupportsVol = true, devName = "";
  let results = [];            // playlist search hits
  let title = "", artist = "";
  const subs = [];
  // A refresh token may rotate on use. Every caller that discovers the same
  // expired access token must share one request, or a slower invalid_grant for
  // the old token can erase the fresh token written by the winning request.
  let refreshInFlight = null;
  let refreshTokenInFlight = null;

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

  function validToken() {
    const t = readToken();
    if (!t) return Promise.resolve(null);
    if (t.expires_at && Date.now() < t.expires_at - 60000) return Promise.resolve(t.access_token);
    if (!t.refresh_token) { clearToken(); return Promise.resolve(null); }
    if (refreshInFlight && refreshTokenInFlight === t.refresh_token) return refreshInFlight;
    const token = t.refresh_token;
    let shared;
    shared = refresh(token).finally(() => {
      if (refreshInFlight === shared) {
        refreshInFlight = null;
        refreshTokenInFlight = null;
      }
    });
    refreshTokenInFlight = token;
    refreshInFlight = shared;
    return shared;
  }

  function refresh(refreshToken) {
    const cid = clientId();
    if (!cid) return Promise.resolve(null);
    return postToken(new URLSearchParams({
      grant_type: "refresh_token", refresh_token: refreshToken, client_id: cid,
    })).then((j) => {
      if (!j) return null;
      const refreshError = j.error || (typeof j.access_token === "string" && j.access_token
        ? null : "bad_response");
      if (refreshError) {
        // invalid_grant = app revoked, or the refresh token was rotated away.
        // Only erase the token that actually failed. An older request resolving
        // after a successful rotation must never delete its replacement.
        const current = readToken();
        if (refreshError === "invalid_grant" && current && current.refresh_token === refreshToken) {
          clearToken();
          teardown();
          explained = true;
          setStatus("configured",
            "Spotify session expired or the app was revoked. Press CONNECT to sign in again.");
        } else if (current && current.refresh_token === refreshToken) {
          setStatus("configured", "Could not refresh the Spotify session (" + refreshError + "). Try again in a moment.");
        }
        return null;
      }
      // The app id or token may have changed while fetch was in flight. Do not
      // resurrect credentials from an obsolete session over the new owner.
      const current = readToken();
      if (!current || current.refresh_token !== refreshToken) return null;
      writeToken({
        access_token: j.access_token,
        refresh_token: j.refresh_token || refreshToken,
        expires_at: Date.now() + (j.expires_in || 3600) * 1000,
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
    }).catch((e) => {
      Log.warn("audio", "Spotify sign-in failed: " + ((e && e.message) || e));
      setStatus("error", "Could not start the Spotify sign-in on this browser.");
    });
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
        el.hidden = false;
        const wrap = document.getElementById("as-sp-wrap");
        if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ block: "center" });
      } catch (e) { /* the sign-in still succeeded — this is only the landing */ }
    }, 0);
  }

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
      if (j.scope && j.scope.indexOf("streaming") < 0) {
        setStatus("error", "Signed in, but Spotify did not grant playback " +
          "permission. In your app's settings tick \"Web Playback SDK\", then " +
          "remove the app at spotify.com/account/apps and press CONNECT again.");
        return;
      }
      return mode() === "remote" ? connectRemote() : bootPlayer();
    });
  }

  function loadSdk() {
    if (window.Spotify && window.Spotify.Player) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((res, rej) => {
      const prev = window.onSpotifyWebPlaybackSDKReady;
      let timer = null;
      const cleanup = function () {
        if (timer !== null) clearTimeout(timer);
        s.onerror = null;
      };
      window.onSpotifyWebPlaybackSDKReady = function () {
        if (typeof prev === "function") { try { prev(); } catch (e) {} }
        cleanup();
        res();
      };
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.onerror = () => { cleanup(); rej(new Error("blocked")); };
      document.head.appendChild(s);
      timer = setTimeout(() => { cleanup(); rej(new Error("timeout")); }, 20000);
    }).catch((err) => {
      sdkPromise = null;
      throw err;
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
        transfer(device_id).then(installBackend, installBackend);
        loadPlaylists();
      });
      player.addListener("not_ready", () => {
        ready = false;
        setStatus("connecting", "Playback moved to another Spotify device.");
      });
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
      return r.text().then((txt) => {
        let reason = "";
        try { const j = JSON.parse(txt); reason = (j.error && (j.error.reason || j.error.message)) || ""; }
        catch (e) { reason = (txt || "").slice(0, 120); }
        lastPlayError = { status: r.status, reason: reason };
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
        const imgs = (it && it.album && it.album.images) || [];
        art = imgs.length ? (imgs[imgs.length - 1] || imgs[0]).url : null;
        progressMs = (j && j.progress_ms) || 0;
        durationMs = (it && it.duration_ms) || 0;
        shuffleOn = !!(j && j.shuffle_state);
        repeatMode = (j && j.repeat_state) || "off";
        paused = !(j && j.is_playing);
        if (j && j.device) {
          devName = j.device.name || "";
          devVol = typeof j.device.volume_percent === "number"
            ? Math.max(0, Math.min(100, j.device.volume_percent)) : null;
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

  function connectRemote() {
    setStatus("connecting", "Looking for your Spotify devices…");
    return validToken().then((t) => {
      if (!t) {
        setStatus("configured", readToken()
          ? "Could not renew the Spotify session. Check your connection and try again."
          : "No Spotify session. Press CONNECT to sign in.");
        return;
      }
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
      return track;
    },
    setVolume(v01) {
      vol = Math.max(0, Math.min(1, typeof v01 === "number" ? v01 : 0.5));
      if (mode() === "remote") {
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
  function useAsMusic(on) {
    if (on) {
      if (!BACKEND.active()) return false;
      installBackend();
      return true;
    }
    removeBackend();
    return false;
  }
  function inUse() {
    return typeof GameAudio !== "undefined" && GameAudio.musicBackend
      ? GameAudio.musicBackend() === BACKEND : false;
  }
  function removeBackend() { setBackend(null); syncSession(); }

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

  function check() {
    const d = debug();
    if (!available()) { setStatus("off", copyOff()); return Promise.resolve({ ok: false, reason: "no-client-id" }); }
    return validToken().then((t) => {
      if (!t) {
        const retained = !!readToken();
        setStatus("configured", retained
          ? "Could not renew the Spotify session. Check your connection and try again."
          : "No Spotify session on this device. Press CONNECT to sign in.");
        return { ok: false, reason: retained ? "refresh-failed" : "no-token", debug: d };
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
      return validToken().then((t) => t ? connectRemote()
        : (readToken() ? setStatus("configured",
          "Could not renew the Spotify session. Check your connection and try again.") : beginAuth()));
    }
    return validToken().then((t) => t ? bootPlayer()
      : (readToken() ? setStatus("configured",
        "Could not renew the Spotify session. Check your connection and try again.") : beginAuth()));
  }

  function disconnect() {
    clearToken();
    teardown();
    setStatus(available() ? "configured" : "off",
      available() ? "Signed out of Spotify on this device." : copyOff());
  }

  function copyOff() {
    return "off — paste a Client ID above to enable it.";
  }

  function el(id) { return document.getElementById(id); }
  function txt(id, s) { const e = el(id); if (e) e.textContent = s; }
  function dis(id, b) { const e = el(id); if (e) e.disabled = !!b; }

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
    txt("sp-vol-note", !live ? ""
      : devSupportsVol ? "Sets the volume on " + (devName || "the device") + " itself."
      : "This device does not accept remote volume — use its own volume buttons. " +
        "(Spotify reports supports_volume: false, usually a phone.)");
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
    const pm = el("as-sp-open");
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

    on("sp-prev", "click", prev);
    on("sp-toggle", "click", () => { activate(); toggle(); });
    on("sp-fwd", "click", () => BACKEND.skip());
    on("sp-shuffle", "click", () => setShuffle(!shuffleOn));
    on("sp-repeat", "click", cycleRepeat);
    on("sp-vol", "input", (e) => { txt("sp-vol-v", e.target.value); });
    on("sp-vol", "change", (e) => setDeviceVolume(+e.target.value || 0));
    on("sp-playlist2", "change", (e) => { activate(); setContext(e.target.value); if (e.target.value) playChosen(); });
    on("sp-device2", "change", (e) => setDevice(e.target.value));
    on("sp-refresh2", "click", () => loadDevices());
    on("sp-close", "click", () => {
      const p = el("spotifypanel"); if (p) p.hidden = true;
      const audio = el("audioset"); if (audio) audio.hidden = false;
    });
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
      if (e.target.value && BACKEND.active()) playChosen();
    });
    on("as-sp-play", "click", () => {
      activate();                       // must happen inside the click itself
      if (!BACKEND.active()) return;
      if (track) BACKEND.start(); else playChosen();
    });
    on("as-sp-pause", "click", () => BACKEND.stop());
    on("as-sp-next", "click", () => BACKEND.skip());
    on("as-sp-disconnect", "click", () => { disconnect(); });
  }

  function init() {
    Log.info("audio", "SpotifyMusic.init");
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

  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  return {
    available, configured, setClientId,
    connect, disconnect, status, onChange, debug, check,
    devices() {
      return api("/me/player/devices")
        .then((r) => (r && r.ok ? r.json().catch(() => null) : { httpStatus: r && r.status }));
    },
    lastPlayError() { return lastPlayError; },
    activate,
    context: contextUri, setContext, play() { return playChosen(); },
    mode, setMode, setDevice, deviceList() { return devices.slice(); },
    openPanel() {
      const audio = el("audioset");
      if (audio) audio.hidden = true;
      const p = el("spotifypanel");
      if (p) p.hidden = false;
      Log.info("audio", "SpotifyMusic.openPanel");
      render();
      if (BACKEND.active()) { pollNowPlaying(); loadDevices(); }
    },
    prev, toggle, setShuffle, cycleRepeat, setDeviceVolume, searchPlaylists, playUri,
    useAsMusic, inUse,
    backend() { return BACKEND; },
    redirectUri, handleRedirect,
  };
})();
