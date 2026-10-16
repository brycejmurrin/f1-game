/* Apex 26 — blob:<a download> → Capacitor Filesystem + Share (no bundler). */
const NativeDownload = (function () {
  "use strict";

  const CACHE_DIR = "CACHE";
  const cacheSession = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  let cacheSequence = 0;
  const EXPORT_DIR = "apex26-downloads/v2";
  // Provisional seven-day grace for delayed receivers; validate on real devices.
  // Lazy maintenance bounds eligible age, not recent bytes/count or idle cache age.
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  const sessionToken = cacheSession.replace(/[^a-z0-9-]/g, "");
  let cleanupTail = Promise.resolve();

  // API shape: https://capacitorjs.com/docs/apis/filesystem (readdir, FileInfo, RmdirOptions).
  async function pruneExports(fs) {
    if (typeof fs.readdir !== "function" || typeof fs.deleteFile !== "function") return;
    try {
      const listing = await fs.readdir({ path: EXPORT_DIR, directory: CACHE_DIR });
      const now = Date.now();
      for (const entry of (listing && Array.isArray(listing.files) ? listing.files : [])) {
        if (!entry || entry.type !== "directory" || typeof entry.name !== "string") continue;
        const match = /^export-([0-9]+)-([a-z0-9]+-[a-z0-9]+)-([1-9][0-9]*)--([A-Za-z0-9_.!~*'()%\-]+)$/.exec(entry.name);
        if (!match || match[2] === sessionToken) continue;
        const stamp = Number(match[1]);
        if (!Number.isSafeInteger(stamp) || String(stamp) !== match[1] || stamp <= 0 || now - stamp < RETENTION_MS) continue;
        let name;
        try { name = decodeURIComponent(match[4]); } catch (e) { continue; }
        if (safeName(name) !== name || encodeURIComponent(name) !== match[4]) continue;
        const folder = EXPORT_DIR + "/" + entry.name;
        try {
          const children = await fs.readdir({ path: folder, directory: CACHE_DIR });
          if (!children || !Array.isArray(children.files)) continue;
          // The encoded basename in our folder grammar identifies exactly one owned leaf.
          // Unknown children are never deleted; no recursive filesystem operation is used.
          const owned = children.files.filter(function (child) {
            return child && child.type === "file" && child.name === name;
          });
          if (owned.length === 1) await fs.deleteFile({ path: folder + "/" + name, directory: CACHE_DIR });
          if (typeof fs.rmdir === "function") {
            const remaining = await fs.readdir({ path: folder, directory: CACHE_DIR });
            if (remaining && Array.isArray(remaining.files) && remaining.files.length === 0) {
              await fs.rmdir({ path: folder, directory: CACHE_DIR, recursive: false });
            }
          }
        } catch (e) { log("native export cleanup skipped"); }
      }
    } catch (e) { log("native export cleanup skipped"); }
  }

  function scheduleCleanup(fs) {
    cleanupTail = cleanupTail.then(function () { return pruneExports(fs); }).catch(function () { log("native export cleanup skipped"); });
    return cleanupTail;
  }

  function log(msg) {
    try { if (typeof Log !== "undefined") Log.info("ui", msg); } catch (e) { /* Log optional at boot */ }
  }

  function nativeMobile() {
    try {
      if (typeof Native === "undefined" || !Native.isNative) return false;
      const p = Native.platform();
      return p === "android" || p === "ios";
    } catch (e) { return false; }
  }

  function pluginPair() {
    try {
      const plugs = typeof Native !== "undefined" && Native.plugins ? Native.plugins() : null;
      if (!plugs || !plugs.Filesystem || !plugs.Share) return null;
      if (typeof plugs.Filesystem.writeFile !== "function") return null;
      if (typeof plugs.Share.share !== "function") return null;
      return plugs;
    } catch (e) { return null; }
  }

  function viable() {
    return nativeMobile() && !!pluginPair();
  }

  function isCancelled(err) {
    return !!err && (err.name === "AbortError" || /^share cancel(?:ed|led)\.?$/i.test(String(err.message || err)));
  }

  function safeName(name) {
    const raw = String(name || "apex26-download.bin").replace(/[/\\?%*:|"<>]/g, "_");
    return raw === "." || raw === ".." ? "apex26-download.bin" : raw.slice(0, 180) || "apex26-download.bin";
  }

  function blobToBase64(blob) {
    return blob.arrayBuffer().then(function (buf) {
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      let bin = "";
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(bin);
    });
  }

  async function saveBlob(blob, filename) {
    const plugs = pluginPair();
    if (!plugs) throw new Error("native download plugins unavailable");
    const name = safeName(filename);
    const path = EXPORT_DIR + "/export-" + Date.now() + "-" + sessionToken + "-" + (++cacheSequence) + "--" + encodeURIComponent(name) + "/" + name;
    // Best effort only: failure cannot prevent conversion, writing or sharing.
    scheduleCleanup(plugs.Filesystem);
    const data = await blobToBase64(blob);
    const written = await plugs.Filesystem.writeFile({
      path: path,
      data: data,
      directory: CACHE_DIR,
      recursive: true,
    });
    let uri = written && written.uri;
    if (!uri && typeof plugs.Filesystem.getUri === "function") {
      const got = await plugs.Filesystem.getUri({ path: path, directory: CACHE_DIR });
      if (got && got.uri) uri = got.uri;
    }
    if (!uri) throw new Error("native download file URI unavailable");
    await plugs.Share.share({
      title: name,
      url: uri,
      dialogTitle: "Save " + name,
    });
    // Keep the cache file: a receiving app may read it after Share resolves.
    log("native download shared " + name);
    return { ok: true, name: name, uri: uri };
  }

  function clickTarget(ev) {
    const t = ev && ev.target;
    if (!t) return null;
    if (t.tagName === "A") return t;
    return typeof t.closest === "function" ? t.closest("a[download]") : null;
  }

  function onClick(ev) {
    if (!viable()) return;
    const a = clickTarget(ev);
    if (!a) return;
    const href = a.getAttribute("href") || a.href || "";
    if (!/^blob:/i.test(href)) return;
    const name = a.getAttribute("download");
    if (name == null || name === "") return;
    ev.preventDefault();
    ev.stopPropagation();
    fetch(href).then(function (res) {
      if (!res.ok) throw new Error("native download HTTP " + res.status);
      return res.blob();
    }).then(function (blob) {
      return saveBlob(blob, name);
    }).catch(function (err) {
      log("native download failed: " + (err && err.message ? err.message : err));
    });
  }

  let installed = false;
  function install() {
    if (installed) return viable();
    if (typeof document === "undefined" || !document.addEventListener) return false;
    document.addEventListener("click", onClick, true);
    installed = true;
    return viable();
  }

  try { install(); } catch (e) { /* document absent in Node VM tests */ }

  return { viable, saveBlob, install, safeName, isCancelled };
})();
Object.freeze(NativeDownload);
