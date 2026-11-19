const OverlayBridge = (function () {
  "use strict";

  const CHANNEL = "apex26-overlay";
  const HELLO_MS = 2000;
  const PEER_TTL_MS = 6000;

  function channel(Ctor) {
    const C = Ctor || (typeof BroadcastChannel === "function" ? BroadcastChannel : null);
    if (!C) return null;
    try { return new C(CHANNEL); } catch (_) { return null; }
  }

  function subscribe(onFrame, opts) {
    opts = opts || {};
    const ch = channel(opts.BroadcastChannel);
    if (!ch) return null;
    const timers = opts.timers || { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (id) => clearInterval(id) };
    const id = opts.id || "ov-" + Math.random().toString(36).slice(2, 10);
    const hello = () => { try { ch.postMessage({ type: "hello", id }); } catch (_) {  } };
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
        try { ch.postMessage({ type: "bye", id }); } catch (_) {  }
        ch.close();
      },
    };
  }

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
