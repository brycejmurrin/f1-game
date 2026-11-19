"use strict";

const NetIce = (function () {
  function create() {
    const STUN = [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun.cloudflare.com:3478",
    ];

    const TURN_API = "";

    const FETCH_TIMEOUT_MS = 4000;
    const ICE_CRED_TTL_MS = 55 * 60 * 1000;

    let fetchedIce = null;
    let fetchedIceAt = 0;
    let fetchingIce = null;
    let activeTurnApi = null;
    let turnApiVersion = 0;
    function configuredTurnApi() {
      let url = null;
      try { url = localStorage.getItem("apex26.turnApi"); } catch (e) {  }
      return url || TURN_API;
    }
    function syncTurnApi() {
      const url = configuredTurnApi();
      if (url !== activeTurnApi) {
        activeTurnApi = url;
        turnApiVersion++;
        fetchedIce = null;
        fetchedIceAt = 0;
        fetchingIce = null;
      }
      return url;
    }
    function iceCredFresh() {
      return !!(fetchedIce && (Date.now() - fetchedIceAt) < ICE_CRED_TTL_MS);
    }
    function prefetchIce() {
      const jobs = [derivedRelays()];
      const url = syncTurnApi();
      if (url && !iceCredFresh() && !fetchingIce) {
        const version = turnApiVersion;
        const ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
        const bail = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) {  } }, FETCH_TIMEOUT_MS);
        fetchingIce = fetch(url, ctl ? { signal: ctl.signal } : undefined).then((r) => r.json()).then((body) => {
          const raw = Array.isArray(body) ? body : (body && (body.iceServers || body.ice_servers)) || null;
          const list = Array.isArray(raw) ? raw.filter((e) => e && e.urls) : null;
          if (version === turnApiVersion && Array.isArray(list) && list.length) {
            fetchedIce = list;
            fetchedIceAt = Date.now();
          }
          return fetchedIce;
        }).catch((err) => {
          Log.warn("net", "TURN credential fetch failed, gathering STUN-only:", err && err.message);
          return fetchedIce;
        }).finally(() => {
          clearTimeout(bail);
          if (version === turnApiVersion) fetchingIce = null;
        });
      }
      if (fetchingIce) jobs.push(fetchingIce);
      return Promise.all(jobs).then(() => null, () => null);
    }

    const OPEN_RELAY_SECRET = "openrelayprojectsecret";
    const OPEN_RELAY_HOSTS = [
      "turn:staticauth.openrelay.metered.ca:80",
      "turn:staticauth.openrelay.metered.ca:443",
      "turn:staticauth.openrelay.metered.ca:443?transport=tcp",
    ];
    const FREE_TURN = [
      { urls: "turn:freestun.net:3478", username: "free", credential: "free" },
    ];

    function freeTurnOn() {
      try { return localStorage.getItem("apex26.freeTurn") === "true"; }
      catch (e) { return false; }
    }

    const DERIVED_TTL_MS = 23 * 60 * 60 * 1000;
    let derived = null;
    let derivedAt = 0;
    let deriving = null;
    let derivedWarned = false;
    function derivedFresh() {
      return !!(derived && (Date.now() - derivedAt) < DERIVED_TTL_MS);
    }
    function derivedRelays() {
      if (!freeTurnOn()) return Promise.resolve(null);
      if (derivedFresh()) return Promise.resolve(derived);
      if (deriving) return deriving;
      const sub = (typeof crypto !== "undefined" && crypto.subtle) ? crypto.subtle : null;
      if (!sub) return Promise.resolve(null);
      const username = String(Math.floor(Date.now() / 1000) + 86400);
      const enc = (s) => new TextEncoder().encode(s);
      deriving = sub.importKey("raw", enc(OPEN_RELAY_SECRET), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
        .then((key) => sub.sign("HMAC", key, enc(username)))
        .then((sig) => {
          const credential = NetBytes.bytesToB64(new Uint8Array(sig));
          derived = OPEN_RELAY_HOSTS.map((urls) => ({ urls, username, credential }));
          derivedAt = Date.now();
          return derived;
        })
        .catch((e) => {
          if (!derivedWarned) { derivedWarned = true; Log.warn("net", "free-TURN credential derivation failed, relay-less ICE:", e && e.message); }
          return null;
        })
        .then((r) => { deriving = null; return r; });
      return deriving;
    }

    function relayOnly() {
      try { return localStorage.getItem("apex26.iceRelayOnly") === "true"; }
      catch (e) { return false; }
    }

    function turnFromStore() {
      try {
        const raw = localStorage.getItem("apex26.turn");
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        return cfg && cfg.urls ? cfg : null;
      } catch (e) { return null; }
    }

    function iceServers(opts, stunOnly) {
      syncTurnApi();
      if (opts.iceServers) return opts.iceServers;
      const list = [{ urls: STUN }];
      if (stunOnly) return list;
      const mine = turnFromStore();
      if (mine) list.push(mine);
      if (fetchedIce) list.push(...fetchedIce);
      if (freeTurnOn()) {
        if (derivedFresh()) list.push(...derived);
        list.push(...FREE_TURN);
      }
      return list;
    }

    function hasRelay() {
      return iceServers({}).some((e) => {
        const urls = Array.isArray(e.urls) ? e.urls : [e.urls];
        return urls.some((u) => /^turns?:/i.test(u));
      });
    }

    function dropFetched() {
      fetchedIce = null;
      fetchedIceAt = 0;
    }

    return { STUN, prefetchIce, iceServers, hasRelay, relayOnly, turnFromStore, dropFetched };
  }
  return { create };
})();
Object.freeze(NetIce);
