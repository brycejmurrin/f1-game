/* Apex 26 — OverlayBridge: the same-browser transport between the game and overlay.html.
   BroadcastChannel needs the same origin AND storage partition, so this half serves a
   second window of the SAME browser (window capture); OBS's own Browser Source is a
   separate profile and needs the net half (plan slice 3). Frames are OverlayFeed v1. */
const OverlayBridge = (function () {
  "use strict";

  const CHANNEL = "apex26-overlay";
  const HELLO_MS = 2000;     // overlay heartbeat
  const PEER_TTL_MS = 6000;  // three missed heartbeats and the game stops publishing

  function channel(Ctor) {
    const C = Ctor || (typeof BroadcastChannel === "function" ? BroadcastChannel : null);
    if (!C) return null;
    try { return new C(CHANNEL); } catch (_) { return null; }   // opaque origins refuse it
  }

  // OVERLAY SIDE: say hello now and every HELLO_MS (a late game tab hears it and
  // starts publishing; a game that answers sends a full frame first), hand each
  // frame to onFrame, say bye on close.
  function subscribe(onFrame, opts) {
    opts = opts || {};
    const ch = channel(opts.BroadcastChannel);
    if (!ch) return null;
    const timers = opts.timers || { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (id) => clearInterval(id) };
    const id = opts.id || "ov-" + Math.random().toString(36).slice(2, 10);
    const hello = () => { try { ch.postMessage({ type: "hello", id }); } catch (_) { /* closed */ } };
    ch.onmessage = (event) => {
      const msg = event && event.data;
      if (msg && msg.type === "frame" && msg.frame && typeof onFrame === "function") onFrame(msg.frame);
    };
    hello();
    const timer = timers.setInterval(hello, HELLO_MS);
    let open = true;
    return {
      id,
      close() {
        if (!open) return;
        open = false;
        timers.clearInterval(timer);
        try { ch.postMessage({ type: "bye", id }); } catch (_) { /* closed */ }
        ch.close();
      },
    };
  }

  // GAME SIDE: count live overlays by their heartbeats. onPeers(n) fires when the
  // count changes (0 → 1 starts the publisher, → 0 stops it); a NEW overlay sets
  // `fresh` so the next send is a full frame for it.
  function host(opts) {
    opts = opts || {};
    const ch = channel(opts.BroadcastChannel);
    if (!ch) return null;
    const now = opts.now || (() => Date.now());
    const peers = new Map();
    let count = 0, fresh = false;
    const report = () => {
      const t = now();
      for (const [id, seen] of peers) if (t - seen > PEER_TTL_MS) peers.delete(id);
      if (peers.size !== count) {
        count = peers.size;
        if (typeof opts.onPeers === "function") opts.onPeers(count);
      }
    };
    ch.onmessage = (event) => {
      const msg = event && event.data;
      if (!msg || typeof msg.id !== "string") return;
      if (msg.type === "hello") {
        if (!peers.has(msg.id)) fresh = true;
        peers.set(msg.id, now());
      } else if (msg.type === "bye") peers.delete(msg.id);
      report();
    };
    return {
      peers: () => { report(); return count; },
      // True once per new overlay: the caller resets its differ so a full frame goes out.
      takeFresh() { const f = fresh; fresh = false; return f; },
      send(frame) {
        if (!frame) return false;
        try { ch.postMessage({ type: "frame", frame }); return true; } catch (_) { return false; }
      },
      close() { ch.close(); },
    };
  }

  return Object.freeze({ CHANNEL, HELLO_MS, PEER_TTL_MS, subscribe, host });
})();
Object.freeze(OverlayBridge);
