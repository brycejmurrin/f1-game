"use strict";

const NetScan = (function () {
  const VENDOR = "vendor/jsqr-1.4.0/jsQR.js";
  const DECODE_EVERY_MS = 120;
  const MAX_EDGE = 640;

  let loading = null;

  async function platformDetector() {
    try {
      if (typeof window === "undefined" || !("BarcodeDetector" in window)) return null;
      const BD = window.BarcodeDetector;
      if (typeof BD.getSupportedFormats !== "function") return null;
      const formats = await BD.getSupportedFormats();
      if (!Array.isArray(formats) || !formats.includes("qr_code")) return null;
      const det = new BD({ formats: ["qr_code"] });
      return typeof det.detect === "function" ? det : null;
    } catch (e) { return null; }
  }

  function supported() {
    return typeof navigator !== "undefined"
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === "function";
  }

  function loadDecoder() {
    if (typeof jsQR !== "undefined") return Promise.resolve(true);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = VENDOR;
      s.async = true;
      if (s.dataset) s.dataset.apexLazy = "1";
      s.onload = () => {
        if (typeof jsQR !== "undefined") { resolve(true); return; }
        loading = null;
        reject(new Error("decoder loaded but did not register"));
      };
      s.onerror = () => { loading = null; reject(new Error("could not load the QR reader")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function create() {
    let stream = null;
    let timer = null;
    let video = null;
    let canvas = null;
    let ctx = null;
    let onCode = null;
    let stopped = true;
    let generation = 0;
    let detector = null;
    let detecting = false;

    function stopTracks(s) {
      if (!s) return;
      try { s.getTracks().forEach((t) => t.stop()); } catch (e) {  }
    }

    function stop() {
      const wasLive = !stopped && !!stream;
      generation++;
      stopped = true;
      detecting = false;
      clearInterval(timer);
      timer = null;
      if (stream) {
        stopTracks(stream);
        stream = null;
      }
      if (video) { try { video.srcObject = null; } catch (e) {  } video = null; }
      onCode = null;
      detector = null;
      if (wasLive) Log.info("net", "scan stop");
    }

    function found(gen, text) {
      if (stopped || gen !== generation || !onCode || !text) return;
      const fn = onCode;
      stop();
      fn(text);
    }

    function tick() {
      if (stopped || !video || !onCode) return;
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return;
      if (detector) {
        if (detecting) return;
        detecting = true;
        const gen = generation, activeDetector = detector, activeVideo = video;
        Promise.resolve().then(() => {
          if (stopped || gen !== generation) return null;
          return activeDetector.detect(activeVideo);
        }).then((codes) => {
          if (stopped || gen !== generation) return;
          detecting = false;
          const hit = Array.isArray(codes) && codes.find((c) => c && c.rawValue);
          if (hit) found(gen, hit.rawValue);
        }, () => { if (gen === generation) detecting = false; });
        return;
      }
      const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      ctx.drawImage(video, 0, 0, cw, ch);
      let img;
      try { img = ctx.getImageData(0, 0, cw, ch); } catch (e) { return; }
      let out = null;
      try { out = jsQR(img.data, cw, ch, { inversionAttempts: "dontInvert" }); }
      catch (e) { return; }
      if (!out || !out.data) return;
      found(generation, out.data);
    }

    async function start(videoEl, cb) {
      stop();
      const attempt = generation;
      const cancelled = () => ({ ok: false, error: "cancelled", message: "Camera scan cancelled." });
      if (!supported()) {
        Log.info("net", "scan unsupported");
        return { ok: false, error: "unsupported",
                 message: "This browser cannot use the camera, so paste the code instead." };
      }
      const platform = await platformDetector();
      if (attempt !== generation) return cancelled();
      if (!platform) {
        try { await loadDecoder(); }
        catch (e) {
          if (attempt !== generation) return cancelled();
          Log.warn("net", "scan fail no_decoder");
          return { ok: false, error: "no_decoder",
                   message: "Could not load the QR reader — paste the code instead." };
        }
        if (attempt !== generation) return cancelled();
      }
      let nextStream = null;
      try {
        nextStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" },
                   width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        if (attempt !== generation) return cancelled();
        const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
        if (denied) Log.info("net", "scan denied");
        else Log.warn("net", "scan fail no_camera");
        return {
          ok: false,
          error: denied ? "denied" : "no_camera",
          message: denied
            ? "Camera access was refused. Allow it, or paste the code instead."
            : "No camera available — paste the code instead.",
        };
      }
      if (attempt !== generation) {
        stopTracks(nextStream);
        return cancelled();
      }
      stream = nextStream;
      stopped = false;
      video = videoEl;
      onCode = cb;
      detector = platform;
      detecting = false;
      if (!platform && !canvas) {
        canvas = document.createElement("canvas");
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      }
      if (!platform && !ctx) {
        stop();
        Log.warn("net", "scan fail no_canvas");
        return { ok: false, error: "no_canvas", message: "Could not start the QR reader — paste the code instead." };
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "");
      video.muted = true;
      try { await video.play(); } catch (e) {  }
      if (attempt !== generation) {
        return cancelled();
      }
      timer = setInterval(tick, DECODE_EVERY_MS);
      Log.info("net", "scan start" + (platform ? " (BarcodeDetector)" : " (jsQR)"));
      return { ok: true };
    }

    return { start, stop, active: () => !stopped, decoder: () => (stopped ? null : (detector ? "barcode" : "jsqr")) };
  }

  return { create, supported, platformDetector };
})();
Object.freeze(NetScan);
