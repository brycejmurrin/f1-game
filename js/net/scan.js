/*
 * NetScan — reading a QR code with the device camera, in the page.
 *
 * WHY THIS EXISTS AT ALL. The invite already travels as a link and as a QR, so
 * the guest never types anything. The ANSWER is the leg that was still a
 * copy/paste, and it cannot be removed: WebRTC needs each side to learn the
 * other's DTLS fingerprint, which comes from a locally generated certificate
 * that cannot be seeded. Two transfers are mandatory without a rendezvous
 * server, and there deliberately isn't one. So the answer stops being a COPY
 * instead: the guest shows it as a QR and the host points a camera at it.
 *
 * WHY WE CARRY A DECODER. BarcodeDetector would do this natively and is 250 KB
 * lighter, but it does not exist on iOS Safari or on desktop Linux Chrome —
 * measured, not assumed — and iOS-phone-to-desktop is exactly the pairing this
 * is for. A native fast path that covers neither end of the target case is not
 * a fast path, it is a second code path to test. So jsQR runs everywhere.
 *
 * WHY IT IS LAZY. The decoder is 257 KB and most sessions never scan anything.
 * It is injected the first time start() is called and never sits in the boot
 * path. sw.js precaches it as OPTIONAL, the same way vendored three.js is
 * handled, so an install cannot fail over it.
 *
 * THE CAMERA IS THE POINT OF CARE. A live camera that outlives the screen that
 * opened it is a privacy problem before it is a battery problem, so stop() is
 * idempotent, kills every track, and is wired to every exit: a successful
 * decode, cancel, closing the lobby, and the page going away.
 */
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
      s.onload = () => (typeof jsQR !== "undefined"
        ? resolve(true)
        : reject(new Error("decoder loaded but did not register")));
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

    function stop() {
      stopped = true;
      clearInterval(timer);
      timer = null;
      if (stream) {
        // Every track, not just the first: a constraint set can hand back more
        // than one, and a single live track keeps the camera light on.
        try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        stream = null;
      }
      if (video) { try { video.srcObject = null; } catch (e) {} video = null; }
      onCode = null;
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
      // Stop BEFORE handing the result over: the handler navigates the lobby on,
      // and a camera still running behind the next screen is the exact failure
      // this module is careful about.
      stop();
      fn(out.data);
    }

    // videoEl must already be in the DOM and playsinline — see the header.
    // Returns {ok:true} or {ok:false, error, message}: a refused camera is an
    // ordinary outcome (the player said no) and the caller falls back to paste.
    async function start(videoEl, cb) {
      stop();
      if (!supported()) {
        return { ok: false, error: "unsupported",
                 message: "This browser cannot use the camera, so paste the code instead." };
      }
      try { await loadDecoder(); }
      catch (e) {
        return { ok: false, error: "no_decoder",
                 message: "Could not load the QR reader — paste the code instead." };
      }
      try {
        // environment = the rear camera on a phone. `ideal`, not `exact`: a
        // laptop has only one camera and an exact constraint would fail on it
        // rather than quietly using the one it has.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" },
                   width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
        return {
          ok: false,
          error: denied ? "denied" : "no_camera",
          message: denied
            ? "Camera access was refused. Allow it, or paste the code instead."
            : "No camera available — paste the code instead.",
        };
      }
      stopped = false;
      video = videoEl;
      onCode = cb;
      if (!canvas) {
        canvas = document.createElement("canvas");
        // willReadFrequently: every frame is read back with getImageData, which
        // is the pathological case for a GPU-backed canvas.
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "");    // or iOS takes over the whole screen
      video.muted = true;
      try { await video.play(); } catch (e) { /* autoplay policy; frames still arrive */ }
      timer = setInterval(tick, DECODE_EVERY_MS);
      return { ok: true };
    }

    return { start, stop, active: () => !stopped };
  }

  return { create, supported, VENDOR };
})();
