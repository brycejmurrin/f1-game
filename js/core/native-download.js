/* Apex 26 — blob:<a download> → Capacitor Filesystem + Share (no bundler). */
const NativeDownload = (function () {
  "use strict";

  const CACHE_DIR = "CACHE";

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

  function safeName(name) {
    const raw = String(name || "apex26-download.bin").replace(/[/\\?%*:|"<>]/g, "_");
    return raw.slice(0, 180) || "apex26-download.bin";
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
    const data = await blobToBase64(blob);
    await plugs.Filesystem.writeFile({
      path: name,
      data: data,
      directory: CACHE_DIR,
    });
    let uri = name;
    if (typeof plugs.Filesystem.getUri === "function") {
      const got = await plugs.Filesystem.getUri({ path: name, directory: CACHE_DIR });
      if (got && got.uri) uri = got.uri;
    }
    await plugs.Share.share({
      title: name,
      url: uri,
      files: [uri],
      dialogTitle: "Save " + name,
    });
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
    fetch(href).then(function (res) { return res.blob(); }).then(function (blob) {
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

  return { viable, saveBlob, install, safeName };
})();
Object.freeze(NativeDownload);
