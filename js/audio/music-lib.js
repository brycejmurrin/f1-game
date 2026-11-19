"use strict";
window.MusicLib = (function () {
  const DB_NAME = "apex26.music";
  const STORE = "tracks";
  const DB_VERSION = 1;

  const MAX_BYTES = 25 * 1024 * 1024;
  const NAME_MAX = 48;
  const OPEN_MS = 12000;
  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus)$/i;

  const NO_TRACKS_MSG = "Add your own audio files — they stay in this browser and join the in-game playlist.";
  const DEAD_MSG = "your browser can't store files here";

  let dbPromise = null;
  let dbHandle = null;
  let readyPromise = null;
  let addQueue = Promise.resolve();
  let generation = 0;
  let wired = false;
  let persistAsked = false;
  let usable = (() => { try { return typeof indexedDB !== "undefined" && !!indexedDB; } catch (e) { return false; } })();
  let cache = [];
  const health = new Map();
  const urls = new Map();

  const $ = (id) => document.getElementById(id);

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res) => {
      let r;
      let settled = false;
      let timer = null;
      const finish = (db) => {
        if (settled) {
          if (db) { try { db.close(); } catch (e) {  } }
          return;
        }
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (db) {
          dbHandle = db;
          db.onclose = () => dropDb(db);
          db.onversionchange = () => {
            try { db.close(); } catch (e) {  }
            if (dbHandle === db) dbHandle = null;
            generation++; dbPromise = null; readyPromise = null; usable = false;
            render();
          };
        }
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
      r.onblocked = () => finish(null);
      timer = setTimeout(() => finish(null), OPEN_MS);
    }).then((db) => {
      usable = !!db;
      if (!db) dbPromise = null;
      return db;
    });
    return dbPromise;
  }

  const connectionLost = (e) => !!e && (e.name === "InvalidStateError" || e.name === "UnknownError");
  function dropDb(db) {
    if (dbHandle !== db) return;
    dbHandle = null; dbPromise = null;
    try { db.close(); } catch (e) {  }
  }
  function withDb(run, again) {
    return openDb().then((db) => new Promise((res, rej) => {
      if (!db) { rej(new Error("unavailable")); return; }
      const fail = (e) => {
        if (!connectionLost(e)) { rej(e); return; }
        dropDb(db);
        if (again) rej(e); else res(withDb(run, true));
      };
      try { run(db, res, fail); } catch (e) { fail(e); }
    }));
  }

  function write(fn) {
    return withDb((db, res, fail) => {
      const t = db.transaction(STORE, "readwrite");
      let out;
      const r = fn(t.objectStore(STORE));
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => fail(t.error || (r && r.error) || new Error("write failed"));
    });
  }

  function readAll() {
    return withDb((db, res, fail) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => fail(r.error || new Error("read failed"));
    });
  }

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
    health.delete(pid(id));
    const url = urls.get(id);
    if (!url) return;
    try { URL.revokeObjectURL(url); } catch (e) {  }
    urls.delete(id);
  }

  function mb(bytes) {
    return bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + " KB"
      : (bytes / 1048576).toFixed(1) + " MB";
  }

  function playbackStatus(id, status) {
    if (typeof id !== "string" || !id.startsWith("user:") || !cache.some((m) => pid(m.id) === id)) return false;
    if (status && status.state === "failed") health.set(id, { state: "failed", reason: String(status.reason || "Could not play this file.").slice(0, 180) });
    else health.delete(id);
    render(); return true;
  }
  function retry(id) {
    if (!cache.some((m) => pid(m.id) === id)) return false;
    health.delete(id); const result = call("playTrackId", id); render(); return result;
  }
  function row(meta, playingId) {
    const el = document.createElement("div");
    el.className = "music-row";
    el.dataset.id = String(meta.id);
    if (playingId && playingId === pid(meta.id)) el.classList.add("playing");

    const name = document.createElement("span");
    name.className = "music-name";
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
    const failure = health.get(pid(meta.id));
    if (failure) { size.textContent += " · Skipped: " + failure.reason; }
    el.append(name, size,
      btn("music-play", failure ? "RETRY" : "▶", failure ? "Retry" : "Play", () => { if (failure) retry(pid(meta.id)); else { call("playTrackId", pid(meta.id)); refresh(); } }),
      btn("music-del", "✕", "Remove", () => remove(meta.id)));
    return el;
  }

  function libraryMsg() {
    if (!usable) return DEAD_MSG;
    if (!cache.length) return NO_TRACKS_MSG;
    return cache.length + (cache.length === 1 ? " track" : " tracks") + " in your library." + (health.size ? " " + health.size + " skipped; retry the marked tracks." : "");
  }

  function render(msg) {
    const box = $("as-tracks");
    const line = $("as-lib-msg");
    if (box) {
      const playingId = call("currentTrackId");
      box.textContent = "";
      for (const m of cache) box.appendChild(row(m, playingId));
    }
    if (line) line.textContent = msg || libraryMsg();
  }

  function refresh() {
    const box = $("as-tracks");
    if (!box) return;
    const playingId = call("currentTrackId");
    box.querySelectorAll(".music-row").forEach((el) => {
      el.classList.toggle("playing", !!playingId && playingId === pid(+el.dataset.id));
    });
  }

  function syncPlaylist() {
    const a = audio();
    if (!a || a._stub || typeof a.addTracks !== "function" || typeof a.tracks !== "function") return;
    const have = new Set((a.tracks() || []).map((t) => t && t.id));
    const entries = [];
    for (const m of cache) {
      const id = pid(m.id);
      if (have.has(id)) continue;
      const url = urls.get(m.id);
      if (!url) continue;
      entries.push({ id, name: m.name, url });
    }
    if (entries.length) a.addTracks(entries);
  }

  function init() {
    if (document.readyState !== "loading") wire();
    if (readyPromise) return readyPromise.then(() => { syncPlaylist(); });
    Log.info("audio", "MusicLib.init");
    const started = generation;
    readyPromise = readAll().then((recs) => {
      if (started !== generation) return;
      usable = true;
      recs.sort((a, b) => (a.added || 0) - (b.added || 0));
      const entries = [];
      cache = recs.map((rec) => {
        entries.push(entryFor(rec));
        return { id: rec.id, name: rec.name, size: rec.size, added: rec.added };
      });
      if (entries.length) call("addTracks", entries);
      syncPlaylist();
      render();
    }).catch((e) => {
      if (started !== generation) return;
      usable = false; cache = []; readyPromise = null; render();
      Log.warn("audio", "MusicLib.init failed: " + ((e && e.message) || e));
    });
    readyPromise = readyPromise.then((v) => { if (started === generation && !usable) readyPromise = null; return v; });
    return readyPromise;
  }

  function askPersist() {
    if (persistAsked) return Promise.resolve(null);
    persistAsked = true;
    try {
      const st = typeof navigator !== "undefined" && navigator.storage;
      if (!st || typeof st.persist !== "function") return Promise.resolve(null);
      return Promise.resolve(st.persist()).then((granted) => {
        if (typeof Log !== "undefined") Log.info("audio", "MY TRACKS storage persist " + (granted ? "granted" : "not granted"));
        return !!granted;
      }, () => null);
    } catch (e) { return Promise.resolve(null); }
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
    const added = addQueue.then(() => init()).then(() => { if (!usable && readyPromise) return openDb(); }).then(() => {
      const out = { added: 0, skipped: 0, errors: [] };
      if (!list.length) return out;
      if (!usable) { out.skipped = list.length; out.errors.push(DEAD_MSG); render(DEAD_MSG); return out; }

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
            out.errors.push(file.name + (quota ? ": no room left in this browser's storage"
              : connectionLost(err) || !usable ? " could not be saved: storage was disconnected. Close and reopen the app, then try again" : " could not be saved"));
          });
        });
      }
      return chain.then(() => {
        if (accepted.length) { call("addTracks", accepted); askPersist(); }
        let msg = out.added ? out.added + (out.added === 1 ? " track added" : " tracks added")
          : (out.skipped && !out.errors.length ? "already in your library" : "");
        if (out.errors.length) msg = (msg ? msg + " · " : "") + out.errors.join(" · ");
        render(msg || undefined);
        return out;
      });
    });
    addQueue = added.catch(() => {});
    return added;
  }

  function remove(id) {
    id = +id;
    return init().then(() => {
      if (!usable) return false;
      return write((store) => store.delete(id)).then(() => {
        call("removeTrack", pid(id));
        dropUrl(id);
        cache = cache.filter((m) => m.id !== id);
        render();
        return true;
      }, (e) => { Log.warn("audio", "music library remove failed:", e && e.message); render("could not remove that track"); return false; });
    }).catch((e) => { Log.warn("audio", "music library remove aborted:", e && e.message); return false; });
  }

  function clear() {
    return init().then(() => {
      if (!usable) return;
      const ids = cache.map((m) => m.id);
      return write((store) => store.clear()).then(() => {
        for (const id of ids) { call("removeTrack", pid(id)); dropUrl(id); }
        cache = [];
        render();
      }, (e) => { Log.warn("audio", "music library clear failed:", e && e.message); render("could not clear the library"); });
    }).catch((e) => { Log.warn("audio", "music library clear aborted:", e && e.message); });
  }

  function list() { return init().then(() => cache.map((m) => ({ id: m.id, name: m.name, size: m.size, added: m.added }))); }

  function wire() {
    if (wired) return;
    wired = true;
    const addBtn = $("as-add"), file = $("as-file");
    if (addBtn && file) {
      addBtn.onclick = () => { call("uiTick"); file.click(); };
      file.onchange = () => {
        const picked = file.files;
        add(picked);
        file.value = "";
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { wire(); init(); }, { once: true });
  } else init();

  return {
    init, list, add, remove, clear, refresh, playbackStatus, retry,
    health: (id) => health.has(id) ? Object.assign({}, health.get(id)) : null,
    count() { return cache.length; },
    available() { return usable; },
  };
})();
