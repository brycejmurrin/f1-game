/* NetScan — reading a QR code with the device camera, in the page. WHY THIS EXISTS AT ALL. The invite already travels as a link and as a QR, so the guest never ty… */
"use strict";

const NetScan = (function () {
  const VENDOR = "vendor/jsqr-1.4.0/jsQR.js";
  const DECODE_EVERY_MS = 120;      // ~8 Hz: fast enough to feel instant, cheap
  const MAX_EDGE = 640;             // decode at 640px; more pixels buys nothing

  let loading = null;               // the in-flight script load, shared by callers

  function supported() {
    return typeof navigator !== "undefined"
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === "function";
  }

  // Inject the decoder once. A second start() while the first load is still in
  // flight must not fetch it twice, hence the shared promise.
  function loadDecoder() {
    if (typeof jsQR !== "undefined") return Promise.resolve(true);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = VENDOR;
      s.async = true;
      // Same marker js/game.js's injector sets: this is a RUNTIME inject, not a
      // shell tag, so index.html's broken-install repair must not sweep every
      // cache and reload the page over it. The rejection path below already
      // reports "could not load the QR reader" — a reload made that dead code.
      s.dataset.apexLazy = "1";
      s.onload = () => {
        if (typeof jsQR !== "undefined") { resolve(true); return; }
        // A syntactically valid response can still fail to register the global
        // (a corrupt cache entry, an HTML error page, or a policy-stripped
        // script). Do not memoise that rejection forever: a later attempt may
        // arrive after the cache/network has recovered.
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

    function stopTracks(s) {
      if (!s) return;
      try { s.getTracks().forEach((t) => t.stop()); } catch (e) { /* a stopped stream has no remaining camera ownership */ }
    }

    function stop() {
      const wasLive = !stopped && !!stream;
      generation++;
      stopped = true;
      clearInterval(timer);
      timer = null;
      if (stream) {
        stopTracks(stream);
        stream = null;
      }
      if (video) { try { video.srcObject = null; } catch (e) {} video = null; }
      onCode = null;
      if (wasLive) Log.info("net", "scan stop");
    }

    function tick() {
      if (stopped || !video || !onCode) return;
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return;                     // first frames arrive with no size
      const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      ctx.drawImage(video, 0, 0, cw, ch);
      let img;
      try { img = ctx.getImageData(0, 0, cw, ch); } catch (e) { return; }   // tainted canvas
      let out = null;
      try { out = jsQR(img.data, cw, ch, { inversionAttempts: "dontInvert" }); }
      catch (e) { return; }                     // a decoder throw is not a scan failure
      if (!out || !out.data) return;
      const fn = onCode;
      stop();
      fn(out.data);
    }

    // videoEl must already be in the DOM and playsinline — see the header.
    // Returns {ok:true} or {ok:false, error, message}: a refused camera is an
    // ordinary outcome (the player said no) and the caller falls back to paste.
    async function start(videoEl, cb) {
      stop();
      const attempt = generation;
      const cancelled = () => ({ ok: false, error: "cancelled", message: "Camera scan cancelled." });
      if (!supported()) {
        Log.info("net", "scan unsupported");
        return { ok: false, error: "unsupported",
                 message: "This browser cannot use the camera, so paste the code instead." };
      }
      try { await loadDecoder(); }
      catch (e) {
        if (attempt !== generation) return cancelled();
        Log.warn("net", "scan fail no_decoder");
        return { ok: false, error: "no_decoder",
                 message: "Could not load the QR reader — paste the code instead." };
      }
      if (attempt !== generation) return cancelled();
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
      if (!canvas) {
        canvas = document.createElement("canvas");
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      }
      if (!ctx) {
        stop();
        Log.warn("net", "scan fail no_canvas");
        return { ok: false, error: "no_canvas", message: "Could not start the QR reader — paste the code instead." };
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "");    // or iOS takes over the whole screen
      video.muted = true;
      try { await video.play(); } catch (e) { /* autoplay policy; frames still arrive */ }
      if (attempt !== generation) {
        return cancelled();
      }
      timer = setInterval(tick, DECODE_EVERY_MS);
      Log.info("net", "scan start");
      return { ok: true };
    }

    return { start, stop, active: () => !stopped };
  }

  return { create, supported, VENDOR };
})();
