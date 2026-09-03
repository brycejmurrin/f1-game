"use strict";
/*
 * MusicLib — bring your own music. The player picks audio files off their
 * device; we keep them in this browser forever and hand them to GameAudio as
 * extra playlist entries, so a personal soundtrack plays over the race exactly
 * like the shipped CC0 tracks. Nothing is uploaded anywhere — there is no
 * server, this game is static files on GitHub Pages.
 *
 * WHY INDEXEDDB AND NOT localStorage. localStorage is a synchronous *string*
 * store with a ~5 MB origin budget shared with every other apex26.* key, and
 * binary put through it has to be base64'd (+33 % and a full main-thread
 * encode). One four-minute MP3 blows the whole quota. IndexedDB stores Blobs
 * natively, asynchronously, with a quota measured in a share of free disk, and
 * hands the bytes back as a Blob we can turn into an object URL that the
 * existing fetch()+decodeAudioData path in js/audio/engine.js already knows how
 * to play. The rest of the game's persistence (js/core/store.js) stays on
 * localStorage — this is the one thing that cannot live there.
 *
 * THE FEATURE MUST NEVER THROW AT THE CALLER. IndexedDB is absent or poisoned
 * in private windows, locked-down browsers and old WebViews, and a write can
 * fail on quota at any moment. Every path here resolves to a result object or
 * a boolean and reports in words through #as-lib-msg; a broken store means the
 * MUSIC & SOUND panel says so and the built-in soundtrack keeps working.
 *
 * Self-initialising like js/ui/scroll-fade.js. Deliberately does NOT call
 * GameAudio.init() — the AudioContext may only start from a user gesture and
 * game.js owns that gesture.
 */
window.MusicLib = (function () {
  const DB_NAME = "apex26.music";
  const STORE = "tracks";
  const DB_VERSION = 1;

  const MAX_BYTES = 25 * 1024 * 1024;   // ~25 MB: a long MP3, not someone's FLAC album
  const NAME_MAX = 48;                  // display only — a 200-char file name wrecks the row
  const OPEN_MS = 12000;
  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus)$/i;

  const NO_TRACKS_MSG = "Add your own audio files — they stay in this browser and join the in-game playlist.";
  const DEAD_MSG = "your browser can't store files here";

  let dbPromise = null;      // memoised open, so init() is safe to call twice
  let readyPromise = null;   // memoised init()
  let usable = (() => { try { return typeof indexedDB !== "undefined" && !!indexedDB; } catch (e) { return false; } })();
  let cache = [];            // [{id, name, size, added}] — mirrors the store, for sync count()
  const urls = new Map();    // db id -> object URL. WE own these; remove() revokes.

  const $ = (id) => document.getElementById(id);

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res) => {
      let r;
      let settled = false;
      let timer = null;
      const finish = (db) => {
        if (settled) {
          // A timed-out/blocked open can still succeed later. Its promise has
          // already degraded to null, so nobody owns this connection; close it
          // rather than leaking an invisible handle that blocks future upgrades.
          if (db) { try { db.close(); } catch (e) { /* already closed: no handle remains to release */ } }
          return;
        }
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (db) db.onversionchange = () => { try { db.close(); } catch (e) { /* another lifecycle path closed it first */ } };
        res(db || null);
      };
      try {
        if (typeof indexedDB === "undefined" || !indexedDB) { finish(null); return; }
        r = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) { finish(null); return; }
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      };
      r.onsuccess = () => finish(r.result);
      r.onerror = () => finish(null);
      // onblocked fires when another tab holds an older version open, and Safari
      // has shipped builds where open() simply never settles. Either way the
      // menu must not wait on it — resolve null and degrade.
      r.onblocked = () => finish(null);
      timer = setTimeout(() => finish(null), OPEN_MS);
    }).then((db) => {
      usable = !!db;
      // NEVER CACHE A FAILURE. The likeliest cause is a slow open, not absent
      // storage, and caching the null meant one unlucky boot disabled uploads
      // until the page was reloaded — with the panel insisting the browser
      // could not store files while it perfectly well could.
      if (!db) dbPromise = null;
      return db;
    });
    return dbPromise;
  }

  // One transaction per call. Resolves on `oncomplete`, not on the request's
  // success: a quota failure surfaces when the transaction tries to commit, and
  // reading the id early would let us report a write that never landed.
  function write(fn) {
    return openDb().then((db) => new Promise((res, rej) => {
      if (!db) { rej(new Error("unavailable")); return; }
      let t;
      try { t = db.transaction(STORE, "readwrite"); } catch (e) { rej(e); return; }
      let out;
      const r = fn(t.objectStore(STORE));
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => rej(t.error || (r && r.error) || new Error("write failed"));
    }));
  }

  function readAll() {
    return openDb().then((db) => new Promise((res) => {
      if (!db) { res([]); return; }
      let r;
      try { r = db.transaction(STORE, "readonly").objectStore(STORE).getAll(); }
      catch (e) { res([]); return; }
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    }));
  }

  // The playlist id namespace is a contract with js/audio/engine.js: user uploads
  // are "user:<db id>", shipped tracks are "builtin:<name>". Never mint or
  // remove an id outside our own prefix.
  const pid = (id) => "user:" + id;

  function audio() { return (typeof GameAudio !== "undefined" && GameAudio) || null; }
  function call(name, arg) {
    const a = audio();
    if (!a || typeof a[name] !== "function") return null;
    try { return a[name](arg); } catch (e) { return null; }
  }

  function entryFor(rec) {
    let url = urls.get(rec.id);
    if (!url) { url = URL.createObjectURL(rec.blob); urls.set(rec.id, url); }
    return { id: pid(rec.id), name: rec.name, url };
  }

  function dropUrl(id) {
    const url = urls.get(id);
    if (!url) return;
    // A session of add/remove cycles leaks the whole blob per orphaned handle.
    try { URL.revokeObjectURL(url); } catch (e) {}
    urls.delete(id);
  }

  function mb(bytes) {
    return bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + " KB"
      : (bytes / 1048576).toFixed(1) + " MB";
  }

  function row(meta, playingId) {
    const el = document.createElement("div");
    el.className = "music-row";
    el.dataset.id = String(meta.id);
    if (playingId && playingId === pid(meta.id)) el.classList.add("playing");

    const name = document.createElement("span");
    name.className = "music-name";
    // textContent, never innerHTML: a file name is user data and can contain
    // anything a file system allows, angle brackets included.
    name.textContent = meta.name;
    name.title = meta.name;

    const size = document.createElement("span");
    size.className = "music-size";
    size.textContent = mb(meta.size);

    const btn = (cls, glyph, label, fn) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = cls; b.textContent = glyph;
      b.setAttribute("aria-label", label + " " + meta.name);
      b.onclick = () => { call("uiTick"); fn(); };
      return b;
    };
    el.append(name, size,
      btn("music-play", "▶", "Play", () => { call("playTrackId", pid(meta.id)); refresh(); }),
      btn("music-del", "✕", "Remove", () => remove(meta.id)));
    return el;
  }

  function render(msg) {
    const box = $("as-tracks");
    const line = $("as-lib-msg");
    if (box) {
      const playingId = call("currentTrackId");
      box.textContent = "";
      for (const m of cache) box.appendChild(row(m, playingId));
    }
    if (line) line.textContent = msg || (!usable ? DEAD_MSG : (cache.length ? cache.length + (cache.length === 1 ? " track" : " tracks") + " in your library." : NO_TRACKS_MSG));
  }

  function refresh() {
    const box = $("as-tracks");
    if (!box) return;
    const playingId = call("currentTrackId");
    box.querySelectorAll(".music-row").forEach((el) => {
      el.classList.toggle("playing", !!playingId && playingId === pid(+el.dataset.id));
    });
  }

  function init() {
    if (readyPromise) return readyPromise;
    Log.info("audio", "MusicLib.init");
    readyPromise = readAll().then((recs) => {
      recs.sort((a, b) => (a.added || 0) - (b.added || 0));
      const entries = [];
      cache = recs.map((rec) => {
        entries.push(entryFor(rec));
        return { id: rec.id, name: rec.name, size: rec.size, added: rec.added };
      });
      if (entries.length) call("addTracks", entries);
      render();
    }).catch((e) => {
      usable = false; cache = []; readyPromise = null; render();
      Log.warn("audio", "MusicLib.init failed: " + ((e && e.message) || e));
    });
    readyPromise = readyPromise.then((v) => { if (!usable) readyPromise = null; return v; });
    return readyPromise;
  }

  function niceName(file) {
    const raw = String(file.name || "").replace(/\.[^.]+$/, "").replace(/[_\s]+/g, " ").trim();
    if (!raw) return "untitled";
    return raw.length > NAME_MAX ? raw.slice(0, NAME_MAX - 1).trim() + "…" : raw;
  }

  function isAudio(file) {
    const t = String(file.type || "");
    if (t) return t.indexOf("audio/") === 0;
    return AUDIO_EXT.test(String(file.name || ""));
  }

  function add(files) {
    const list = files ? Array.prototype.slice.call(files) : [];
    return init().then(() => {
      const out = { added: 0, skipped: 0, errors: [] };
      if (!list.length) return out;
      if (!usable) { out.skipped = list.length; out.errors.push(DEAD_MSG); render(DEAD_MSG); return out; }

      // Sequential, not Promise.all: a parallel burst of 25 MB writes is the
      // fastest way to trip quota, and the messages must name the file that
      // failed.
      let chain = Promise.resolve();
      const accepted = [];
      for (const file of list) {
        chain = chain.then(() => {
          if (!isAudio(file)) { out.skipped++; out.errors.push(file.name + ": not an audio file — skipped"); return; }
          if (file.size > MAX_BYTES) { out.skipped++; out.errors.push(file.name + ": too large (max 25 MB)"); return; }
          const name = niceName(file);
          if (cache.some((m) => m.name === name && m.size === file.size)) { out.skipped++; return; }
          const rec = { name, type: file.type || "", size: file.size, added: Date.now(), blob: file };
          return write((store) => store.add(rec)).then((id) => {
            rec.id = id;
            cache.push({ id, name, size: rec.size, added: rec.added });
            accepted.push(entryFor(rec));
            out.added++;
          }, (err) => {
            out.skipped++;
            const quota = err && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");
            out.errors.push(file.name + (quota ? ": no room left in this browser's storage" : " could not be saved"));
          });
        });
      }
      return chain.then(() => {
        if (accepted.length) call("addTracks", accepted);
        let msg = out.added ? out.added + (out.added === 1 ? " track added" : " tracks added")
          : (out.skipped && !out.errors.length ? "already in your library" : "");
        if (out.errors.length) msg = (msg ? msg + " · " : "") + out.errors.join(" · ");
        render(msg || undefined);
        return out;
      });
    });
  }

  function remove(id) {
    id = +id;
    return init().then(() => {
      if (!usable) return false;
      return write((store) => store.delete(id)).then(() => {
        call("removeTrack", pid(id));   // must precede the revoke: it may be playing
        dropUrl(id);
        cache = cache.filter((m) => m.id !== id);
        render();
        return true;
      }, () => { render("could not remove that track"); return false; });
    }).catch(() => false);
  }

  function clear() {
    return init().then(() => {
      if (!usable) return;
      const ids = cache.map((m) => m.id);
      return write((store) => store.clear()).then(() => {
        for (const id of ids) { call("removeTrack", pid(id)); dropUrl(id); }
        cache = [];
        render();
      }, () => { render("could not clear the library"); });
    }).catch(() => {});
  }

  function list() { return init().then(() => cache.map((m) => ({ id: m.id, name: m.name, size: m.size, added: m.added }))); }

  function wire() {
    // Guard every id: specs and tools load partial DOM, and a missing element
    // must not stop the module from being importable.
    const addBtn = $("as-add"), file = $("as-file");
    if (addBtn && file) {
      addBtn.onclick = () => { call("uiTick"); file.click(); };
      file.onchange = () => {
        const picked = file.files;
        add(picked);
        // Clearing the value is what makes re-picking the SAME file fire change
        // again — otherwise a failed add can never be retried.
        file.value = "";
      };
    }
    init();
  }

  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", wire, { once: true });
  else wire();

  return {
    init, list, add, remove, clear, refresh, render,
    count() { return cache.length; },
    available() { return usable; },
  };
})();
