/* ShareCode: pasteable APX envelopes for setup / livery / daily (+ #share=).
   Ghosts stay on GhostShare (APXG1 / #ghost=). Deep links stage sheets only —
   never startRace / gridUp. A setup/livery code DOES write the team's stored
   sheet / livery pick, so apply() first saves what it replaces (UNDO_KEY) and
   the toast names the door back: paste UNDO in SETTINGS › FILES (6-F2).
   Plan slice 4: docs/plans/2026-09-30-player-a11y.md. */
"use strict";

const ShareCode = (function () {
  const LAST_KEY = "lastSession";
  const UNDO_KEY = "shareUndo";
  // The settings GARAGE FILE door's per-team cap (settings-export.js GARAGE_LIVERIES_MAX).
  // A link never trims the player's own list to fit it: at the cap it refuses (6-F1).
  const LIVERY_CAP = 32;
  const MAX_CODE_CHARS = 32 * 1024;
  const MAX_DECODED_BYTES = 64 * 1024;
  const CORRUPT = Object.freeze({ ok: false, reason: "corrupt" });
  const KINDS = Object.freeze({
    setup: { magic: "APXS1", kind: "setup" },
    livery: { magic: "APXL1", kind: "livery" },
    daily: { magic: "APXD1", kind: "daily" },
  });
  const MAGIC_OF = Object.freeze(Object.fromEntries(
    Object.values(KINDS).map((k) => [k.magic, k.kind]),
  ));

  const enc = () => new TextEncoder();
  const dec = () => new TextDecoder();

  function binary(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 0x4000) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x4000));
    }
    return out;
  }
  function bytesToB64url(bytes) {
    return btoa(binary(bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToBytes(text) {
    const raw = String(text || "");
    if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error("bad base64url");
    const s = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "=".repeat((4 - s.length % 4) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function knownTeam(id) {
    return typeof id === "string" && typeof Teams !== "undefined" && Array.isArray(Teams.LIST) &&
      Teams.LIST.some((t) => t && t.id === id);
  }
  function knownTrack(id) {
    return typeof id === "string" && typeof Tracks !== "undefined" && Array.isArray(Tracks.LIST) &&
      Tracks.LIST.some((t) => t && t.id === id);
  }

  function rgb3(a) {
    return Array.isArray(a) && a.length >= 3 &&
      a.slice(0, 3).every((n) => typeof n === "number" && isFinite(n));
  }
  function clamp01(a) { return a.slice(0, 3).map((n) => Math.min(1, Math.max(0, n))); }
  function cleanLivery(l) {
    if (!l || typeof l !== "object" || Array.isArray(l)) return null;
    if (typeof l.id !== "string" || l.id.length > 64 || !rgb3(l.c1) || !rgb3(l.c2)) return null;
    const out = { id: l.id.slice(0, 64), c1: clamp01(l.c1), c2: clamp01(l.c2) };
    if (typeof l.name === "string") out.name = l.name.slice(0, 64);
    let n = 0;
    for (const k of Object.keys(l)) {
      if (k === "id" || k === "c1" || k === "c2" || k === "name" || k === "__proto__") continue;
      if (n >= 64) break;
      if (rgb3(l[k])) { out[k] = clamp01(l[k]); n++; }
      else if (typeof l[k] === "string" && l[k].length <= 64 && !(l[k] in Object.prototype)) { out[k] = l[k]; n++; }
    }
    return out;
  }
  function cleanSetup(tune) {
    if (!tune || typeof tune !== "object" || Array.isArray(tune)) return null;
    const fields = ["arbF", "arbR", "rideF", "rideR", "brakeBias"];
    const out = {};
    for (const k of fields) {
      const n = typeof tune[k] === "number" ? tune[k]
        : (typeof tune[k] === "string" && tune[k].trim() !== "" ? Number(tune[k]) : NaN);
      if (!Number.isFinite(n)) return null;
      out[k] = n;
    }
    return out;
  }

  function envelope(kind, payload) {
    if (kind === "setup") {
      if (!payload || !knownTeam(payload.team)) return null;
      const tune = cleanSetup(payload.tune);
      if (!tune) return null;
      return { v: 1, kind: "setup", team: payload.team, tune };
    }
    if (kind === "livery") {
      if (!payload || !knownTeam(payload.team)) return null;
      const id = typeof payload.id === "string" ? payload.id.slice(0, 64) : null;
      if (!id) return null;
      const body = { v: 1, kind: "livery", team: payload.team, id };
      if (payload.livery) {
        const liv = cleanLivery(payload.livery);
        if (!liv) return null;
        body.livery = liv;
      }
      return body;
    }
    if (kind === "daily") {
      if (!payload || typeof payload.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.day)) return null;
      if (!knownTrack(payload.track)) return null;
      const body = { v: 1, kind: "daily", day: payload.day, track: payload.track };
      if (typeof payload.trackName === "string") body.trackName = payload.trackName.slice(0, 64);
      if (typeof payload.weather === "string") body.weather = payload.weather.slice(0, 32);
      if (typeof payload.best === "number" && isFinite(payload.best) && payload.best > 0) body.best = +payload.best.toFixed(3);
      if (typeof payload.medal === "string") body.medal = payload.medal.slice(0, 16);
      if (typeof payload.streak === "number" && isFinite(payload.streak) && payload.streak >= 0) body.streak = Math.floor(payload.streak);
      if (typeof payload.class === "string") body.class = payload.class.slice(0, 32);
      return body;
    }
    return null;
  }

  function shareUrl(code) {
    try { return location.origin + location.pathname + "#share=" + code; }
    catch (_) { return null; }
  }

  function encode(kind, payload) {
    const meta = KINDS[kind];
    if (!meta) return { ok: false, reason: "unknown-kind" };
    const body = envelope(kind, payload);
    if (!body) return { ok: false, reason: "invalid" };
    const text = JSON.stringify(body);
    const plain = enc().encode(text);
    if (plain.byteLength > MAX_DECODED_BYTES) return { ok: false, reason: "too-large" };
    const code = meta.magic + ".p." + bytesToB64url(plain);
    if (code.length > MAX_CODE_CHARS) return { ok: false, reason: "too-large" };
    return { ok: true, code, url: shareUrl(code), kind, envelope: body };
  }

  function codeFrom(value) {
    let input = String(value || "").trim();
    if (/^APX[SLD]1\./.test(input)) return input.replace(/\s+/g, "");
    const match = input.match(/(?:^|[#&])share=([^&]+)/);
    if (!match) return null;
    try { input = decodeURIComponent(match[1]); }
    catch (_) { return null; }
    return input.replace(/\s+/g, "");
  }

  function fromBody(body) {
    if (!body || body.v !== 1 || typeof body.kind !== "string") return CORRUPT;
    if (body.kind === "setup") {
      const env = envelope("setup", body);
      if (!env) return knownTeam(body.team) ? CORRUPT : { ok: false, reason: "unknown-team" };
      return { ok: true, kind: "setup", team: env.team, tune: env.tune };
    }
    if (body.kind === "livery") {
      if (!knownTeam(body.team)) return { ok: false, reason: "unknown-team" };
      const env = envelope("livery", body);
      if (!env) return CORRUPT;
      return { ok: true, kind: "livery", team: env.team, id: env.id, livery: env.livery || null };
    }
    if (body.kind === "daily") {
      if (!knownTrack(body.track)) return { ok: false, reason: "unknown-track" };
      const env = envelope("daily", body);
      if (!env) return CORRUPT;
      return Object.assign({ ok: true }, env);
    }
    return CORRUPT;
  }

  function decode(value) {
    const raw = String(value || "").trim();
    if (/^undo$/i.test(raw)) return { ok: true, kind: "undo" };   // SETTINGS › FILES paste only
    if (raw.startsWith("{")) {
      if (raw.length > MAX_DECODED_BYTES) return CORRUPT;
      try { return fromBody(JSON.parse(raw)); } catch (_) { return CORRUPT; }
    }
    const code = codeFrom(value);
    if (!code || code.length > MAX_CODE_CHARS) return CORRUPT;
    const parts = code.split(".");
    if (parts.length !== 3 || !MAGIC_OF[parts[0]] || parts[1] !== "p") return CORRUPT;
    try {
      const packed = b64urlToBytes(parts[2]);
      if (packed.byteLength > MAX_DECODED_BYTES) return CORRUPT;
      const body = JSON.parse(dec().decode(packed));
      if (body && body.kind && body.kind !== MAGIC_OF[parts[0]]) return CORRUPT;
      return fromBody(body);
    } catch (_) { return CORRUPT; }
  }

  function messageFor(result) {
    if (result && result.ok) {
      const undo = " Your previous one is kept: paste UNDO in SETTINGS › FILES to restore it.";
      if (result.kind === "setup") return "Setup loaded — " + result.team.toUpperCase() + "." + undo;
      if (result.kind === "livery") return "Livery loaded — " + result.team.toUpperCase() + "." + undo;
      if (result.kind === "undo") return "Share code undone — your previous setup / livery is back.";
      if (result.kind === "daily") return "Daily challenge — " + (result.trackName || result.track).toUpperCase() + ".";
    }
    if (result && result.reason === "unknown-team") return "That share code names a team this version does not know.";
    if (result && result.reason === "unknown-track") return "That share code names a circuit this version does not know.";
    if (result && result.reason === "livery-full") return "Livery not added — " + String(result.team || "").toUpperCase()
      + " is at the " + LIVERY_CAP + "-livery limit for share codes. Delete one in GARAGE › TEAM first.";
    if (result && result.reason === "nothing-to-undo") return "There is no share code import to undo.";
    return "That share code is incomplete or corrupt.";
  }

  function apply(decoded, hooks) {
    const h = hooks || {};
    const store = h.store;
    if (!decoded || !decoded.ok || !store) return { ok: false, reason: "no-store" };
    // Staging only — callers must never pass startRace here.
    if (typeof h.startRace === "function") { /* intentionally unused */ }
    if (decoded.kind === "undo") return undo(store);
    if (decoded.kind === "setup") {
      saveUndo(store, ["setup." + decoded.team]);
      store.set("setup." + decoded.team, decoded.tune);
      if (typeof h.selectTeam === "function") h.selectTeam(decoded.team);
      if (typeof h.openGarage === "function") h.openGarage("share");
      return { ok: true, kind: "setup", team: decoded.team };
    }
    if (decoded.kind === "livery") {
      const customKey = "livery.custom." + decoded.team;
      let next = null;
      if (decoded.livery) {
        const stored = store.get(customKey, []);
        const arr = Array.isArray(stored) ? stored : [];
        const kept = arr.filter((l) => !l || l.id !== decoded.livery.id);
        // Re-sharing a livery the player already has replaces it in place; a NEW one
        // at the cap is refused before anything is written — never trim their list.
        if (kept.length === arr.length && arr.length >= LIVERY_CAP) {
          return { ok: false, kind: "livery", reason: "livery-full", team: decoded.team };
        }
        next = kept.concat([decoded.livery]);
      }
      saveUndo(store, ["livery." + decoded.team, customKey]);
      if (next) store.set(customKey, next);
      // Select the livery that was actually stored (a crafted code could name another id).
      store.set("livery." + decoded.team, decoded.livery ? decoded.livery.id : decoded.id);
      if (typeof h.selectTeam === "function") h.selectTeam(decoded.team);
      if (typeof h.openGarage === "function") h.openGarage("share");
      return { ok: true, kind: "livery", team: decoded.team };
    }
    if (decoded.kind === "daily") {
      if (typeof h.openDaily === "function") h.openDaily(decoded);
      return { ok: true, kind: "daily", day: decoded.day, track: decoded.track };
    }
    return CORRUPT;
  }

  // One-deep undo for the last setup/livery code: the keys it is about to overwrite,
  // with their previous values (null = absent: undo removes it via store.set(k, undefined)).
  function saveUndo(store, keys) {
    const prev = {};
    for (const k of keys) prev[k] = store.get(k, null);
    store.set(UNDO_KEY, { keys, prev, at: Date.now() });
  }
  function undo(store) {
    const rec = store && store.get(UNDO_KEY, null);
    if (!rec || !Array.isArray(rec.keys) || !rec.prev || typeof rec.prev !== "object") {
      return { ok: false, kind: "undo", reason: "nothing-to-undo" };
    }
    for (const k of rec.keys) {
      if (!/^(setup|livery|livery\.custom)\.[a-z0-9_-]+$/.test(String(k))) continue;
      const v = Object.prototype.hasOwnProperty.call(rec.prev, k) ? rec.prev[k] : null;
      store.set(k, v == null ? undefined : v);
    }
    store.set(UNDO_KEY, undefined);
    return { ok: true, kind: "undo" };
  }

  function hashCode(hash) {
    const match = String(hash || "").match(/(?:^#|&)share=([^&]+)/);
    return match ? match[1] : null;
  }
  function withoutShare(href) {
    try {
      const url = new URL(String(href));
      const kept = String(url.hash || "").replace(/^#/, "").split("&")
        .filter((part) => part && !/^share=/.test(part));
      url.hash = kept.join("&");
      return url.href;
    } catch (_) { return null; }
  }

  let hashGeneration = 0;
  async function consumeHash(opts) {
    const mine = ++hashGeneration;
    const raw = typeof location !== "undefined" ? hashCode(location.hash) : null;
    if (!raw) return null;
    let result = decode(raw);
    if (result.kind === "undo") result = CORRUPT;   // UNDO is a pasted word, never a link
    if (mine !== hashGeneration || hashCode(location.hash) !== raw ||
        (opts && typeof opts.valid === "function" && !opts.valid())) return null;
    let applied = null;
    if (result.ok && opts && typeof opts.apply === "function") applied = opts.apply(result);
    try {
      const next = withoutShare(location.href);
      if (next && typeof history !== "undefined" && history.replaceState) {
        history.replaceState(history.state, "", next);
      }
    } catch (_) { /* guest apply still works */ }
    const notify = opts && opts.notify;
    // A refused apply (livery cap) reports the refusal, not "loaded".
    const shown = applied && applied.ok === false && applied.reason ? applied : result;
    if (typeof notify === "function") notify(messageFor(shown), shown, applied);
    return result;
  }

  // CONTINUE re-opens the FREE circuit picker, so only free play's flow is kept or
  // restored: a season round has SEASON's door and a career round CAREER's (6-F3).
  const FREE_FLOW = "gp";
  function recordSession(store, snap) {
    if (!store || !snap || typeof snap.trackId !== "string" || !snap.trackId) return false;
    const session = snap.session === "tt" ? "tt" : "race";
    const row = {
      trackId: snap.trackId,
      session,
      flow: FREE_FLOW,
      trackName: typeof snap.trackName === "string" ? snap.trackName.slice(0, 64) : null,
      at: typeof snap.at === "number" && isFinite(snap.at) ? snap.at : Date.now(),
    };
    store.set(LAST_KEY, row);
    return true;
  }
  function lastSession(store) {
    if (!store) return null;
    const raw = store.get(LAST_KEY, null);
    if (!raw || typeof raw !== "object" || typeof raw.trackId !== "string") return null;
    if (!knownTrack(raw.trackId)) return null;
    return {
      trackId: raw.trackId,
      session: raw.session === "tt" ? "tt" : "race",
      flow: FREE_FLOW,
      trackName: typeof raw.trackName === "string" ? raw.trackName : null,
      at: typeof raw.at === "number" ? raw.at : 0,
    };
  }

  /** Continue-card priority after career: daily streak / unfinished, else lastSession. */
  function continueHint(G) {
    if (!G) return null;
    if (typeof Career !== "undefined") {
      const c = Career.data ? (Career.data() || (Career.load && Career.load())) : null;
      if (c) {
        const next = typeof Tracks !== "undefined" && Tracks.SEASON
          ? Tracks.SEASON[Math.min(c.season.round, Tracks.SEASON.length - 1)] : null;
        return {
          kind: "career",
          sub: c.year + " · ROUND " + Math.min(c.season.round + 1, Tracks.SEASON.length)
            + (next ? " · " + next.name : ""),
        };
      }
    }
    if (G.daily && typeof DailyChallenge !== "undefined") {
      const day = G.daily.dayKey();
      const y = DailyChallenge.prevDay(day);
      const data = G.daily.data();
      const yDay = data.days && data.days[y];
      const yUnfinished = !!(yDay && (yDay.laps > 0) && yDay.best == null);
      if (yUnfinished) {
        const p = DailyChallenge.plan(y);
        return { kind: "daily", day: y, sub: "YESTERDAY · " + p.trackName.toUpperCase() };
      }
      const streak = G.daily.liveStreak ? G.daily.liveStreak() : 0;
      const today = G.daily.today ? G.daily.today() : null;
      const todayDone = !!(today && today.best != null);
      if (streak > 0 && !todayDone) {
        const p = DailyChallenge.plan(day);
        return { kind: "daily", day, sub: p.trackName.toUpperCase() + " · STREAK " + streak };
      }
    }
    const last = lastSession(G.store);
    if (last) {
      const name = last.trackName || last.trackId;
      const mode = last.session === "tt" ? "TIME TRIAL" : "RACE";
      return { kind: "session", session: last, sub: name.toUpperCase() + " · " + mode };
    }
    return null;
  }

  return {
    KINDS, encode, decode, apply, undo, consumeHash, withoutShare, messageFor,
    recordSession, lastSession, continueHint, LAST_KEY, UNDO_KEY,
  };
})();
Object.freeze(ShareCode);
if (typeof module !== "undefined" && module.exports) module.exports = ShareCode;
