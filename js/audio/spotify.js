"use strict";
window.SpotifyMusic = (function () {
  const K_ID = "apex26.spotify.clientId";
  const K_TOKEN = "apex26.spotify.token";
  const S_VERIFY = "apex26.spotify.verifier";
  const S_STATE = "apex26.spotify.state";
  const K_CTX = "apex26.spotify.context";
  const K_MODE = "apex26.spotify.mode";
  const K_DEV = "apex26.spotify.device";
  const FETCH_TIMEOUT_MS = 15000;
  const responseControllers = new WeakMap();

  function readBody(r, method, ac) {
    ac = ac || (r && responseControllers.get(r)) || null;
    let timer = null;
    const body = Promise.resolve().then(() => r[method]()).catch(() => null);
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        if (ac) { try { ac.abort(); } catch (e) {  } }
        resolve(null);
      }, FETCH_TIMEOUT_MS);
    });
    return Promise.race([body, timeout]).then((value) => {
      if (timer) clearTimeout(timer);
      return value;
    });
  }
  function readJson(r, ac) { return readBody(r, "json", ac); }

  const SCOPES = "streaming user-read-playback-state " +
    "user-modify-playback-state user-read-currently-playing " +
    "playlist-read-private user-library-read";
  const AUTH_URL = "https://accounts.spotify.com/authorize";
  const TOKEN_URL = "https://accounts.spotify.com/api/token";
  const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
  const API = "https://api.spotify.com/v1";

  let state = "off";
  let message = "";
  let deviceId = null;
  let track = null;
  let paused = true;
  let player = null;
  let ready = false;
  let sdkPromise = null;
  let vol = 0.5;
  let explained = false;
  let lastPlayError = null;
  let premiumSeen = null;
  let art = null, progressMs = 0, durationMs = 0;
  let shuffleOn = false, repeatMode = "off";
  let devVol = null, devSupportsVol = true, devName = "";
  let results = [];
  let title = "", artist = "";
  const subs = [];
  let refreshInFlight = null;
  let refreshTokenInFlight = null;
  let sessionGen = 0;
  let searchT = null;
  let searchRevision = 0;
  const commandTimers = new Set();

  function ls(k) { return GameStore.store.raw(k); }
  function lsSet(k, v) { GameStore.store.rawSet(k, v); }
  function lsDel(k) { GameStore.store.rawDel(k); }
  function ss(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {  } }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) {  } }

  function clientId() { return (ls(K_ID) || "").trim(); }
  function mode() { return ls(K_MODE) === "browser" ? "browser" : "remote"; }
  function setMode(m) {
    const v = m === "browser" ? "browser" : "remote";
    if (v === mode()) return v;
    teardown();
    lsSet(K_MODE, v);
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
  let lists = [];
  let devices = [];

  function readToken() {
    try { const t = JSON.parse(ls(K_TOKEN) || "null"); return t && t.access_token ? t : null; }
    catch (e) { return null; }
  }
  function writeToken(t) { lsSet(K_TOKEN, JSON.stringify(t)); }
  function clearToken() { lsDel(K_TOKEN); }

  function status() { return { state, message, deviceId, track }; }
  function setStatus(s, msg) { state = s; message = msg || ""; emit(); }
  function keepOrConfigure(msg) { setStatus(state === "connected" ? "connected" : "configured", msg); }
  function emit() {
    for (const fn of subs) { try { fn(status()); } catch (e) {  } }
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

  function redirectUri() { return location.origin + location.pathname; }
  function onLocalhost() { return location.hostname === "localhost"; }
  function isNativeDesktop() {
    try {
      if (typeof Native !== "undefined" && Native.isNative && Native.isNative()) return true;
      if (typeof window !== "undefined" && window.__APEX_NATIVE__ && window.__APEX_NATIVE__.desktop) return true;
      if (typeof window !== "undefined" && window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform()) return true;
      return false;
    } catch (e) { return false; }
  }

  function validToken(stale) {
    const t = readToken();
    if (!t) return Promise.resolve(null);
    const refused = !!stale && t.access_token === stale;
    if (!refused && t.expires_at && Date.now() < t.expires_at - 60000) return Promise.resolve(t.access_token);
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
        const current = readToken();
        if (refreshError === "invalid_grant" && current && current.refresh_token === refreshToken) {
          clearToken();
          teardown();
          explained = true;
          setStatus("configured",
            "Spotify session expired or the app was revoked. Press CONNECT to sign in again.");
        } else if (current && current.refresh_token === refreshToken) {
          keepOrConfigure("Could not refresh the Spotify session (" + refreshError + "). Try again in a moment.");
        }
        return null;
      }
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
    const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body,
    };
    if (ac) opts.signal = ac.signal;
    return fetch(TOKEN_URL, opts)
      .then((r) => readJson(r, ac).then((j) => {
        if (j !== null) return j;
        Log.debug("audio", "Spotify token response unreadable (HTTP " + r.status + ")");
        return { error: "bad_response" };
      }))
      .catch((e) => {
        Log.debug("audio", "Spotify token request failed:", e && (e.name + ": " + e.message));
        return { error: e && e.name === "AbortError" ? "timeout" : "network" };
      })
      .then((j) => { if (timer) clearTimeout(timer); return j; });
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

  function cleanUrl() {
    try {
      const u = new URL(location.href);
      ["code", "state", "error"].forEach((k) => u.searchParams.delete(k));
      const q = u.searchParams.toString();
      history.replaceState(history.state, "", u.pathname + (q ? "?" + q : "") + u.hash);
    } catch (e) {  }
  }

  function reopenPanel() {
    setTimeout(function () {
      try {
        const settings = document.getElementById("pmsettings");
        if (!settings) return;
        settings.hidden = false;
        if (typeof SettingsNav !== "undefined" && SettingsNav.show) SettingsNav.show("audio", false);
        const wrap = document.getElementById("as-sp-wrap");
        if (wrap) wrap.open = true;
        if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ block: "center" });
      } catch (e) {  }
    }, 0);
  }

  function handleRedirect() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return Promise.resolve(); }
    const code = params.get("code"), st = params.get("state"), err = params.get("error");
    const verifier = ss(S_VERIFY), wantState = ss(S_STATE);
    if (!verifier) return Promise.resolve();
    if (!code && !err) return Promise.resolve();
    ssDel(S_VERIFY);
    ssDel(S_STATE);
    cleanUrl();
    reopenPanel();
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
    const gen = sessionGen;
    setStatus("connecting", "Completing Spotify sign-in…");
    return postToken(new URLSearchParams({
      grant_type: "authorization_code", code: code, redirect_uri: redirectUri(),
      client_id: cid, code_verifier: verifier,
    })).then((j) => {
      if (gen !== sessionGen || cid !== clientId()) return;
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
      if (mode() === "browser" && j.scope && j.scope.indexOf("streaming") < 0) {
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
      let settled = false;
      let handler = null;
      const cleanup = function () {
        if (timer !== null) clearTimeout(timer);
        s.onerror = null;
        if (window.onSpotifyWebPlaybackSDKReady === handler) {
          window.onSpotifyWebPlaybackSDKReady = prev;
        }
      };
      handler = window.onSpotifyWebPlaybackSDKReady = function () {
        if (settled) return;
        settled = true;
        if (typeof prev === "function") { try { prev(); } catch (e) {  } }
        cleanup();
        res();
      };
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.onerror = () => {
        if (settled) return;
        settled = true; cleanup(); rej(new Error("blocked"));
      };
      timer = setTimeout(() => {
        if (settled) return;
        settled = true; cleanup(); rej(new Error("timeout"));
      }, 20000);
      document.head.appendChild(s);
    }).catch((err) => {
      sdkPromise = null;
      throw err;
    });
    return sdkPromise;
  }

  function bootPlayer() {
    if (player) { installBackend(); return Promise.resolve(); }
    const gen = sessionGen;
    explained = false;
    setStatus("connecting", "Loading the Spotify player…");
    return loadSdk().then(() => {
      if (gen !== sessionGen || mode() !== "browser") return;
      if (typeof GameAudio !== "undefined" && GameAudio.volumes) {
        try { vol = GameAudio.volumes().music; } catch (e) {  }
      }
      player = new Spotify.Player({
        name: "Apex 26",
        getOAuthToken: (cb) => {
          validToken().then((t) => {
            if (gen !== sessionGen) return;
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
        if (gen !== sessionGen) return;
        deviceId = device_id;
        ready = true;
        explained = false;
        setStatus("connected", "Connected. Apex 26 is now a Spotify device.");
        transfer(device_id).then(() => { if (gen === sessionGen) installBackend(); },
          () => { if (gen === sessionGen) installBackend(); });
        loadPlaylists();
      });
      player.addListener("not_ready", () => {
        if (gen !== sessionGen) return;
        ready = false;
        setStatus("connecting", "Playback moved to another Spotify device.");
      });
      player.addListener("authentication_error", () => {
        if (gen !== sessionGen) return;
        explained = true;
        teardown();
        setStatus("configured", "Spotify rejected the session — checking why…");
        check({ after: "authentication_error" });
      });
      player.addListener("account_error", () => {
        if (gen !== sessionGen) return;
        explained = true;
        premiumSeen = "no";
        teardown();
        setStatus("error", "This Spotify account cannot play here — full Premium is " +
          "required. Free accounts and the mobile-only plans (Premium Mini / Lite) " +
          "are not supported by Spotify's web player.");
      });
      player.addListener("initialization_error", () => {
        if (gen !== sessionGen) return;
        explained = true;
        teardown();
        setStatus("error", "This browser can't run the Spotify player (no encrypted-" +
          "media support). iOS Safari is the usual case — try desktop Chrome, Edge or Firefox.");
      });
      player.addListener("playback_error", () => {
        if (gen === sessionGen) setStatus("connected", "Spotify could not play that track. Try SKIP TRACK.");
      });
      player.addListener("player_state_changed", (s) => {
        if (gen !== sessionGen) return;
        if (!s) { track = null; paused = true; emit(); return; }
        const t = s.track_window && s.track_window.current_track;
        track = t ? (t.name + " — " + (t.artists || []).map((a) => a.name).join(", ")) : null;
        paused = !!s.paused;
        emit();
      });
      return player.connect();
    }).then((ok) => {
      if (gen !== sessionGen) return;
      if (ok === false) setStatus("error", "The Spotify player refused to connect.");
    }).catch((e) => {
      if (gen !== sessionGen) return;
      sdkPromise = null;
      teardown();
      setStatus("error", e && e.message === "blocked"
        ? "Could not load the Spotify player script — offline, or blocked by an extension."
        : "The Spotify player did not start (timed out). Check your connection and retry.");
    });
  }

  function teardown() {
    sessionGen++;
    stopPolling();
    pollBusy = false;
    if (volTimer !== null) { clearTimeout(volTimer); volTimer = null; }
    volPend.clear();
    if (searchT !== null) { clearTimeout(searchT); searchT = null; }
    for (const timer of commandTimers) clearTimeout(timer);
    commandTimers.clear();
    ready = false;
    deviceId = null;
    track = null;
    if (player) { try { player.disconnect(); } catch (e) {  } }
    player = null;
    removeBackend();
  }

  let apiFailing = false;
  function api(path, opts, requestController) { return apiWith(path, opts, null, requestController); }
  function apiWith(path, opts, refused, requestController) {
    const gen = sessionGen;
    return validToken(refused).then((t) => {
      if (!t || gen !== sessionGen) return null;
      const o = Object.assign({}, opts || {});
      o.headers = Object.assign(
        { Authorization: "Bearer " + t, "Content-Type": "application/json" },
        o.headers || {});
      const ac = requestController || (typeof AbortController !== "undefined" ? new AbortController() : null);
      if (ac) o.signal = ac.signal;
      const timer = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
      return fetch(API + path, o).then((r) => { apiFailing = false; if (r && ac) responseControllers.set(r, ac); return r; }, (e) => {
        if (!apiFailing) { apiFailing = true; Log.warn("audio", "Spotify API " + path.split("?")[0] + " failed:", e && (e.name + ": " + e.message)); }
        return null;
      }).then((r) => {
        if (timer) clearTimeout(timer);
        if (r && r.status === 401 && !refused && gen === sessionGen) return apiWith(path, opts, t, requestController);
        return r;
      });
    });
  }

  function transfer(id) {
    return api("/me/player",
      { method: "PUT", body: JSON.stringify({ device_ids: [id], play: false }) });
  }

  function loadPlaylists() {
    const gen = sessionGen;
    return api("/me/playlists?limit=50").then((r) => {
      if (gen !== sessionGen) return [];
      if (!r) return [];
      if (r.status === 403) {
        setStatus(state, "Your Spotify session predates the playlist permission. " +
          "Press DISCONNECT then CONNECT to grant it.");
        return [];
      }
      if (!r.ok) return [];
      return readJson(r).then((j) => (j && j.items || []).map((p) => ({ name: p.name, uri: p.uri })), () => []);
    }).then((ls_) => {
      if (gen !== sessionGen) return [];
      lists = ls_ || []; render(); return lists;
    });
  }

  function playChosen() {
    const gen = sessionGen;
    const q = mode() === "remote" ? remoteQuery()
      : (deviceId ? "?device_id=" + encodeURIComponent(deviceId) : "");
    const ctx = contextUri();
    let body;
    if (ctx === "liked") {
      return api("/me/tracks?limit=50")
        .then((r) => (r && r.ok ? readJson(r).then((j) => { if (j === null) Log.warn("audio", "Spotify liked-songs response unreadable"); return j; }) : null)).then((j) => {
        if (gen !== sessionGen) return;
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
    const gen = sessionGen;
    return api("/me/player/play" + q, { method: "PUT", body: body }).then((r) => {
      if (gen !== sessionGen) return;
      if (!r) return;
      if (r.ok || r.status === 204) {
        setStatus("connected", "Playing.");
        lastPlayError = null;
        premiumSeen = "yes";
        installBackend();
        return;
      }
      return readBody(r, "text").then((txt) => {
        if (gen !== sessionGen) return;
        let reason = "";
        try { const j = JSON.parse(txt); reason = (j.error && (j.error.reason || j.error.message)) || ""; }
        catch (e) { reason = (txt || "").slice(0, 120); }
        lastPlayError = { status: r.status, reason: reason };
        if (r.status === 403 && /PREMIUM_REQUIRED/i.test(reason)) premiumSeen = "no";
        if (r.status === 404 && !retried && mode() === "remote") {
          setStatus("connected", "Waking your Spotify device…");
          return loadDevices().then((ds) => {
            if (gen !== sessionGen) return;
            const d = deviceId2();
            if (!d || !ds.length) {
              releaseToBuiltIn("No Spotify device is available. Open Spotify on your phone or " +
                "computer and play anything for a second.");
              return;
            }
            return api("/me/player", { method: "PUT", body: JSON.stringify({ device_ids: [d], play: true }) })
              .then(() => { if (gen === sessionGen) return sendPlay(remoteQuery(), body, true); });
          });
        }
        const hint = r.status === 404
            ? " Open Spotify on a device and play something for a second, then press REFRESH DEVICES."
          : r.status === 403 ? " Full Premium is required to play here."
          : r.status === 401 ? " Press CONNECT to sign in again."
          : "";
        releaseToBuiltIn("Spotify refused playback (" + r.status + (reason ? ": " + reason : "") + ")." + hint);
      });
    });
  }

  let pollTimer = null;

  function devicesList() {
    return api("/me/player/devices").then((r) => {
      if (!r) return [];
      if (!r.ok) return [];
      return readJson(r).then((j) => j && j.devices || [], () => []);
    });
  }

  function loadDevices() {
    const gen = sessionGen;
    return devicesList().then((ds) => {
      if (gen !== sessionGen) return [];
      devices = ds;
      const known = deviceId2();
      if (known && !ds.some((d) => d.id === known)) lsDel(K_DEV);
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

  let pollBusy = false;
  let pollHoldUntil = 0;
  function retryAfterMs(r) {
    const h = r && r.headers && typeof r.headers.get === "function" ? r.headers.get("Retry-After") : null;
    let ms = NaN;
    if (h != null && /^\s*\d+(\.\d+)?\s*$/.test(h)) ms = parseFloat(h) * 1000;
    else if (h) { const at = Date.parse(h); if (Number.isFinite(at)) ms = at - Date.now(); }
    if (!Number.isFinite(ms)) ms = 30000;
    return Math.max(1000, Math.min(600000, ms));
  }
  function pollNowPlaying() {
    if (mode() !== "remote" || state !== "connected") return Promise.resolve();
    if (pollBusy || document.hidden) return Promise.resolve();
    if (Date.now() < pollHoldUntil) return Promise.resolve();
    pollBusy = true;
    const gen = sessionGen;
    const done = () => { if (gen === sessionGen) pollBusy = false; };
    const bodyController = typeof AbortController !== "undefined" ? new AbortController() : null;
    return api("/me/player", null, bodyController).then((r) => {
      if (gen !== sessionGen) return;
      if (!r) return;
      if (r.status === 204) { track = null; paused = true; emit(); return; }
      if (r.status === 429) { pollHoldUntil = Date.now() + retryAfterMs(r); return; }
      if (!r.ok) return;
      return readJson(r, bodyController).then((j) => {
        if (j === null || gen !== sessionGen) return;
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
    }).then(done, done);
  }

  function startPolling() {
    stopPolling();
    pollNowPlaying();
    pollTimer = setInterval(pollNowPlaying, 10000);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function connectRemote() {
    const gen = sessionGen;
    setStatus("connecting", "Looking for your Spotify devices…");
    return validToken().then((t) => {
      if (gen !== sessionGen) return;
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

  function afterCommand(gen = sessionGen) {
    if (gen !== sessionGen) return;
    const timer = setTimeout(() => {
      commandTimers.delete(timer);
      if (gen === sessionGen) pollNowPlaying();
    }, 600);
    commandTimers.add(timer);
  }
  function pollAfterCommand(gen) { if (gen === sessionGen) pollNowPlaying(); }

  function prev() {
    if (!BACKEND.active()) return;
    if (mode() === "remote") {
      const gen = sessionGen;
      api("/me/player/previous" + remoteQuery(), { method: "POST" }).then(() => afterCommand(gen));
      return;
    }
    if (player) { try { const p = player.previousTrack(); if (p && p.catch) p.catch(() => {}); } catch (e) {  } }
  }
  function toggle() {
    if (!BACKEND.active()) return;
    if (paused) BACKEND.start(); else BACKEND.stop();
    afterCommand();
  }
  function setShuffle(on) {
    if (!BACKEND.active() || mode() !== "remote") return;
    const gen = sessionGen;
    api("/me/player/shuffle?state=" + (on ? "true" : "false") +
        (deviceId2() ? "&device_id=" + encodeURIComponent(deviceId2()) : ""), { method: "PUT" }).then(() => afterCommand(gen));
  }
  function setRepeat(next) {
    if (!BACKEND.active() || mode() !== "remote") return;
    if (next !== "off" && next !== "context" && next !== "track") return;
    const gen = sessionGen;
    api("/me/player/repeat?state=" + next +
        (deviceId2() ? "&device_id=" + encodeURIComponent(deviceId2()) : ""), { method: "PUT" }).then(() => afterCommand(gen));
  }
  const VOL_PUT_MS = 250;
  let volTimer = null;
  const volPend = new Map();
  function putDeviceVolume(pct) {
    volPend.set(deviceId2(), Math.max(0, Math.min(100, Math.round(pct))));
    if (volTimer !== null) return;
    const gen = sessionGen;
    volTimer = setTimeout(() => {
      volTimer = null;
      const pending = Array.from(volPend); volPend.clear();
      if (gen !== sessionGen) return;
      for (const [targetDevice, v] of pending) {
        api("/me/player/volume?volume_percent=" + v +
            (targetDevice ? "&device_id=" + encodeURIComponent(targetDevice) : ""), { method: "PUT" });
      }
    }, VOL_PUT_MS);
  }
  function setDeviceVolume(pct) {
    if (!BACKEND.active() || mode() !== "remote") return;
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    devVol = v;
    putDeviceVolume(v);
  }
  function searchPlaylists(q, revision) {
    const gen = sessionGen;
    const queryRevision = revision == null ? ++searchRevision : revision;
    const term = (q || "").trim();
    if (!term) { results = []; render(); return Promise.resolve([]); }
    return api("/search?type=playlist&limit=10&q=" + encodeURIComponent(term)).then((r) => {
      if (!r || !r.ok) return [];
      return readJson(r).then((j) => {
        if (!j) return [];
        const items = ((j.playlists && j.playlists.items) || []).filter(Boolean);
        return items.map((p) => ({ name: p.name, uri: p.uri,
          by: (p.owner && p.owner.display_name) || "" }));
      }, () => []);
    }).then((rs) => {
      if (gen !== sessionGen || queryRevision !== searchRevision) return [];
      results = rs || []; render(); return results;
    });
  }
  function playUri(uri) {
    if (!uri) return;
    setContext(uri);
    playChosen();
  }

  function activate() {
    if (player && typeof player.activateElement === "function") {
      try { const p = player.activateElement(); if (p && p.catch) p.catch(() => {}); } catch (e) {  }
    }
  }

  const BACKEND = {
    prev,
    start() {
      if (!BACKEND.active()) return;
      if (!paused) return;
      if (mode() === "remote") {
        if (track) {
          const gen = sessionGen;
          api("/me/player/play" + remoteQuery(), { method: "PUT", body: "{}" })
            .then(() => pollAfterCommand(gen));
          return;
        }
        playChosen();
        return;
      }
      if (track) { try { const p = player.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {  } return; }
      playChosen();
    },
    stop() {
      if (mode() === "remote") {
        if (BACKEND.active()) {
          const gen = sessionGen;
          api("/me/player/pause" + remoteQuery(), { method: "PUT" })
            .then(() => pollAfterCommand(gen));
        }
        return;
      }
      if (player) { try { const p = player.pause(); if (p && p.catch) p.catch(() => {}); } catch (e) {  } }
    },
    skip() {
      if (!BACKEND.active()) return null;
      if (mode() === "remote") {
        const gen = sessionGen;
        api("/me/player/next" + remoteQuery(), { method: "POST" })
          .then(() => afterCommand(gen));
        return track;
      }
      try { const p = player.nextTrack(); if (p && p.catch) p.catch(() => {}); } catch (e) {  }
      return track;
    },
    setVolume(v01) {
      vol = Math.max(0, Math.min(1, typeof v01 === "number" ? v01 : 0.5));
      if (mode() === "remote") {
        if (BACKEND.active()) putDeviceVolume(vol * 100);
        return vol;
      }
      if (player) { try { const p = player.setVolume(vol); if (p && p.catch) p.catch(() => {}); } catch (e) {  } }
      return vol;
    },
    name() { return track; },
    active() {
      return mode() === "remote"
        ? (state === "connected" && !!readToken())
        : (state === "connected" && ready && !!player);
    },
  };

  function setBackend(b) {
    if (typeof GameAudio === "undefined" || !GameAudio.setMusicBackend) return;
    try { GameAudio.setMusicBackend(b); } catch (e) {  }
  }
  function syncSession() {
    if (typeof GameAudio === "undefined" || !GameAudio.setSessionType) return;
    try { GameAudio.setSessionType(mode() === "remote" && GameAudio.musicBackend() ? "ambient" : "playback"); }
    catch (e) {  }
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

  function available() { return !isNativeDesktop() && !!clientId(); }
  function configured() {
    if (isNativeDesktop()) return null;
    const c = clientId();
    return c ? { clientId: c } : null;
  }

  function debug() {
    const t = readToken() || {};
    const cid = clientId();
    return {
      state, message,
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

  function check(opts) {
    const after = opts && opts.after;
    const gen = sessionGen;
    const d = debug();
    if (!available()) { setStatus("off", copyOff()); return Promise.resolve({ ok: false, reason: "no-client-id" }); }
    return validToken().then((t) => {
      if (gen !== sessionGen) return { ok: false, reason: "stale", debug: d };
      if (!t) {
        const retained = !!readToken();
        const msg = retained
          ? "Could not renew the Spotify session. Check your connection and try again."
          : "No Spotify session on this device. Press CONNECT to sign in.";
        if (retained) keepOrConfigure(msg); else setStatus("configured", msg);
        return { ok: false, reason: retained ? "refresh-failed" : "no-token", debug: d };
      }
      const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
      const o = { headers: { Authorization: "Bearer " + t } };
      if (ac) o.signal = ac.signal;
      const timer = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
      const done = () => { if (timer) clearTimeout(timer); };
      return fetch(API + "/me", o)
        .then((r) => { done(); return readJson(r, ac).then((j) => ({ code: r.status, j: j || {} })); })
        .then(({ code, j }) => {
          if (gen !== sessionGen) return { ok: false, reason: "stale", debug: d };
          if (!j || !Object.keys(j).length) {
            setStatus("error", "Could not read Spotify's account response — offline, or blocked.");
            return { ok: false, httpStatus: code, reason: "network", debug: debug() };
          }
          const plan = j.product != null ? (j.product === "premium" ? "yes" : "no") : premiumSeen;
          const out = { ok: false, httpStatus: code, product: j.product || null, premium: plan,
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
          } else if (plan === "no") {
            setStatus("error", "Signed in as " + (out.account || "?") + ", but this account is " +
              (j.product ? "\"" + j.product + "\"" : "not Premium (Spotify refused playback: Premium required)") +
              " — the web player needs full Premium. Free, Mini and Lite cannot play here.");
            out.reason = "not-premium";
          } else if (!out.debug.streamingGranted) {
            setStatus("error", (plan === "yes" ? "Premium account confirmed" : "Signed in") +
              ", but this token has no playback " +
              "permission. Tick \"Web Playback SDK\" in your app's settings, remove the app at " +
              "spotify.com/account/apps, then press CONNECT again.");
            out.reason = "no-streaming-scope";
          } else if (after === "authentication_error") {
            setStatus("error", "Spotify's player rejected the session, though the account and its " +
              "playback permission check out. Usually the app is not enabled for the Web Playback SDK, " +
              "or its owner has no active Premium (Spotify requires it for apps in Development Mode). " +
              "Fix that in the dashboard, then press CONNECT.");
            out.reason = "auth-error";
          } else {
            out.ok = true;
            out.reason = "ok";
            setStatus(state === "connected" ? "connected" : "configured",
              "Account OK: " + (plan === "yes" ? "Premium, playback permission granted"
                : "playback permission granted (Spotify no longer tells apps the plan; Premium is confirmed when a track starts)") +
              (state === "connected" ? " — connected." : ". Press CONNECT."));
          }
          return out;
        })
        .catch((e) => {
          done();
          if (gen !== sessionGen) return { ok: false, reason: "stale", debug: d };
          Log.warn("audio", "Spotify account check failed:", e && (e.name + ": " + e.message));
          setStatus("error", "Could not reach Spotify's API — offline, or blocked.");
          return { ok: false, reason: "network", debug: d };
        });
    });
  }

  function setClientId(s) {
    const v = (s || "").trim();
    if (!v) { lsDel(K_ID); disconnect(); return null; }
    if (v !== clientId()) endSession();
    lsSet(K_ID, v);
    setStatus("configured", "Client ID saved. Press CONNECT to sign in to Spotify.");
    return v;
  }

  function connect() {
    if (!available()) { setStatus("off", copyOff()); return Promise.resolve(); }
    if (state === "connected") return Promise.resolve();
    const gen = sessionGen;
    if (mode() === "remote") {
      return validToken().then((t) => gen !== sessionGen ? undefined : t ? connectRemote()
        : (readToken() ? setStatus("configured",
          "Could not renew the Spotify session. Check your connection and try again.") : beginAuth()));
    }
    return validToken().then((t) => gen !== sessionGen ? undefined : t ? bootPlayer()
      : (readToken() ? setStatus("configured",
        "Could not renew the Spotify session. Check your connection and try again.") : beginAuth()));
  }

  function endSession() {
    const t = readToken();
    if (mode() === "remote" && inUse() && BACKEND.active() && t) {
      const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
      const done = () => { if (timer !== null) clearTimeout(timer); };
      try {
        const opts = { method: "PUT", headers: { Authorization: "Bearer " + t.access_token } };
        if (ac) opts.signal = ac.signal;
        Promise.resolve(fetch(API + "/me/player/pause" + remoteQuery(), opts)).then(done, done);
      } catch (e) { done();  }
    }
    clearToken();
    teardown();
  }

  function disconnect() {
    endSession();
    premiumSeen = null;
    setStatus(available() ? "configured" : "off",
      available() ? "Signed out of Spotify on this device." : copyOff());
  }

  function copyOff() {
    if (isNativeDesktop()) {
      return "off — Spotify login needs a browser redirect URI; use the web build.";
    }
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

  function transportLabel() {
    if (!devName) return "";
    return paused ? "Paused on " + devName : "Playing on " + devName;
  }

  function renderPlayer() {
    if (!el("spotifypanel")) return;
    const live = BACKEND.active();
    const img = el("sp-art");
    if (img) {
      const current = img.dataset.apexArt || "";
      if (current !== (art || "")) {
        const next = art || "";
        img.dataset.apexArt = next;
        img.dataset.apexArtFailed = "";
        img.onerror = next ? () => {
          if (img.dataset.apexArt === next) {
            img.dataset.apexArtFailed = next;
            img.removeAttribute("src");
            img.hidden = false;
          }
        } : null;
        if (next) {
          img.setAttribute("src", next);
          img.hidden = false;
        } else {
          img.removeAttribute("src");
          img.hidden = true;
        }
      } else {
        img.hidden = !art;
      }
    }
    txt("sp-title", title || (live ? "Nothing playing" : "Not connected"));
    txt("sp-artist", artist || "");
    txt("sp-on", transportLabel());
    const fill = el("sp-bar-fill");
    if (fill) fill.style.width = (durationMs ? Math.max(0, Math.min(100, (progressMs / durationMs) * 100)) : 0) + "%";
    const tog = el("sp-toggle");
    if (tog) {
      tog.textContent = paused ? "▶" : "❚❚";
      tog.setAttribute("aria-label", paused ? "Play" : "Pause");
    }
    if (typeof SettingRow !== "undefined") {
      SettingRow.paint(el("sp-shuffle"), shuffleOn ? "on" : "off");
      SettingRow.paint(el("sp-repeat"), repeatMode);
      SettingRow.disable(el("sp-shuffle"), !live);
      SettingRow.disable(el("sp-repeat"), !live);
    }
    const vol = el("sp-vol");
    if (vol && devVol !== null && document.activeElement !== vol) vol.value = String(devVol);
    txt("sp-vol-v", devVol === null ? "—" : String(devVol));
    if (vol) vol.disabled = !live || !devSupportsVol;
    txt("sp-vol-note", !live ? ""
      : devSupportsVol ? "Sets the volume on " + (devName || "the device") + " itself."
      : "This device does not accept remote volume — use its own volume buttons. " +
        "(Spotify reports supports_volume: false, usually a phone.)");
    ["sp-prev", "sp-toggle", "sp-fwd"].forEach((i) => dis(i, !live));
    fillSelect("sp-playlist2", playlistOpts(), contextUri(), !live);
    const remote = mode() === "remote";
    fillSelect("sp-device2", deviceOpts(), deviceId2(), !live || !remote);
    dis("sp-refresh2", !live || !remote);
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
      if (!box.childElementCount) {
        const none = document.createElement("div");
        none.className = "dh-empty";
        none.textContent = "No tracks matched that search.";
        box.appendChild(none);
      }
    }
    const pm = el("as-sp-open");
    if (pm) pm.disabled = !available() || state !== "connected";
  }

  function pauseMenuNowText() {
    if (state !== "connected") return "—";
    if (!track) return "Nothing playing yet.";
    return paused ? "Paused — " + track : track;
  }

  function render() {
    renderPlayer();
    const wrap = el("as-sp-wrap");
    if (!wrap) return;
    wrap.dataset.spState = state;

    const idEl = el("as-sp-id");
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
    txt("as-sp-now", pauseMenuNowText());

    const remote = mode() === "remote";
    const b1 = el("as-sp-mode-remote"), b2 = el("as-sp-mode-browser");
    if (b1) b1.classList.toggle("active", remote);
    if (b2) b2.classList.toggle("active", !remote);
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

    on("sp-prev", "click", prev);
    on("sp-toggle", "click", () => { activate(); toggle(); });
    on("sp-fwd", "click", () => BACKEND.skip());
    if (typeof SettingRow !== "undefined") {
      SettingRow.wire("sp-shuffle", { values: [["off", "OFF"], ["on", "ON"]],
        read: () => (shuffleOn ? "on" : "off"), write: (v) => setShuffle(v === "on") });
      SettingRow.wire("sp-repeat", { values: [["off", "OFF"], ["context", "ALL"], ["track", "ONE"]],
        read: () => repeatMode, write: setRepeat });
    }
    on("sp-vol", "input", (e) => { txt("sp-vol-v", e.target.value); });
    on("sp-vol", "change", (e) => setDeviceVolume(+e.target.value || 0));
    on("sp-playlist2", "change", (e) => { activate(); setContext(e.target.value); if (e.target.value) playChosen(); });
    on("sp-device2", "change", (e) => setDevice(e.target.value));
    on("sp-refresh2", "click", () => loadDevices());
    on("sp-close", "click", () => {
      const p = el("spotifypanel"); if (p) p.hidden = true;
      const settings = el("pmsettings"); if (settings) settings.hidden = false;
      if (typeof SettingsNav !== "undefined" && SettingsNav.show) SettingsNav.show("audio", false);
    });
    on("sp-search", "input", (e) => {
      const q = e.target.value;
      const revision = ++searchRevision;
      if (searchT !== null) { clearTimeout(searchT); searchT = null; }
      if (!q.trim()) { results = []; render(); return; }
      const gen = sessionGen;
      searchT = setTimeout(() => {
        searchT = null;
        if (gen === sessionGen && revision === searchRevision) searchPlaylists(q, revision);
      }, 350);
    });
    on("as-sp-play", "click", () => {
      activate();
      if (!BACKEND.active()) return;
      if (track) BACKEND.start(); else playChosen();
    });
    on("as-sp-pause", "click", () => BACKEND.stop());
    on("as-sp-next", "click", () => BACKEND.skip());
    on("as-sp-disconnect", "click", () => { disconnect(); });
  }

  let initialized = false;
  function init() {
    if (initialized) return;
    initialized = true;
    Log.info("audio", "SpotifyMusic.init");
    state = available() ? "configured" : "off";
    message = available() ? "Press CONNECT to sign in to Spotify." : copyOff();
    bind();
    render();
    try { handleRedirect(); } catch (e) {  }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  return {
    available, configured, setClientId,
    connect, disconnect, status, onChange, debug, check,
    devices() {
      return api("/me/player/devices")
        .then((r) => (r && r.ok ? readJson(r).then((j) => { if (j === null) Log.warn("audio", "Spotify devices response unreadable"); return j; }) : { httpStatus: r && r.status }));
    },
    lastPlayError() { return lastPlayError; },
    play() { return playChosen(); },
    mode, setMode, setDevice, deviceList() { return devices.slice(); },
    openPanel() {
      const settings = el("pmsettings");
      if (settings) settings.hidden = true;
      const p = el("spotifypanel");
      if (p) p.hidden = false;
      Log.info("audio", "SpotifyMusic.openPanel");
      render();
      if (BACKEND.active()) { pollNowPlaying(); loadDevices(); }
    },
    setDeviceVolume, searchPlaylists,
    useAsMusic, inUse,
    redirectUri, handleRedirect,
  };
})();
