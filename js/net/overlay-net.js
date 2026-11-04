/* Apex 26 — OverlayNet: the NETWORK half of the stream overlay (plan slice 3).
   OverlayBridge reaches a second window of the SAME browser; OBS's Browser Source is
   a separate profile, so the overlay also rides the WebRTC wire VS FRIEND and the phone
   pad use: the game mints a six-letter room (NetRendezvous), overlay.html#ov=CODE joins
   it as a PASSIVE viewer. A viewer never enters NetSession/NetPlay, so it takes no
   netplay seat (MAX_GUESTS is untouched) and sends nothing but a hello.

   WIRE (OverlayFeed v1 frames, JSON text):
     STATE (unreliable)  "F" frames: the differ's patches at 4 Hz and a full frame every
                         2 s. Lossy by design: a dropped patch is healed by the next
                         full frame, and the viewer drops any seq it has already passed.
     EVENT (reliable)    one {t:"hi"} hello each way on open. The viewer's hello is the
                         "new peer" signal: the host resets its differ so the first frame
                         a viewer sees is FULL.
   link()/view() leave signalling out so tests/unit/overlay-net.test.mjs drives both over
   NetTransport.loopback(); host()/join() add the room. */
"use strict";

const OverlayNet = (function () {
  const PROTO = 1;
  const MAX_VIEWERS = 3;            // OBS + a preview or two; each costs a peer connection
  const PUMP_MS = 50;               // the idle drain, beside rAF
  const REDIAL_BACKOFF_MS = [1500, 3000, 6000, 12000];

  const hello = (side) => JSON.stringify({ t: "hi", p: PROTO, side });
  function parseEvent(data) {
    let v; try { v = JSON.parse(data); } catch (_) { return null; }
    return v && v.t === "hi" && v.p === PROTO ? v : null;
  }
  function parseFrame(data) {
    let v; try { v = JSON.parse(data); } catch (_) { return null; }
    return Array.isArray(v) && v[0] === "F" && v[1] && v[1].v === 1 && Number.isFinite(v[1].seq) ? v[1] : null;
  }

  function overlayUrl(code, base) {
    const root = String(base || (typeof location !== "undefined" ? location.href : "https://example.invalid/")).replace(/[#?].*$/, "");
    return root.replace(/[^/]*$/, "") + "overlay.html#ov=" + encodeURIComponent(String(code || ""));
  }
  function codeFromHash(hash) {
    const m = /(?:^|[#&])ov=([^&]+)/.exec(String(hash || ""));
    return m ? decodeURIComponent(m[1]).toUpperCase() : null;
  }

  function clock(opts) {
    return (opts && opts.now) || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  }

  // ── game side: every open spectator link, presented as an OverlayBridge.host ──
  // peers() / takeFresh() / send() are exactly what OverlayPublisher.start() calls.
  function hub(opts) {
    opts = opts || {};
    const T = NetTransport;
    const now = clock(opts);
    const links = new Set();
    let fresh = false, last = 0;
    const count = () => { let n = 0; for (const l of links) if (l.open) n++; return n; };
    const changed = () => { const n = count(); if (n !== last) { last = n; if (opts.onPeers) { try { opts.onPeers(n); } catch (_) { /* ui's problem */ } } } };

    function add(transport) {
      if (!transport || count() >= MAX_VIEWERS) { if (transport) { try { transport.close(); } catch (_) { /* never opened */ } } return null; }
      const link = { transport, open: false, sent: 0 };
      links.add(link);
      transport.onMessage((channel, data) => {
        if (channel !== T.EVENT) return;           // a viewer sends nothing else; ignore the rest
        const ev = parseEvent(data);
        if (ev && ev.side === "view") { fresh = true; link.open = true; changed(); }
      });
      const armed = () => { try { transport.send(T.EVENT, hello("host")); } catch (_) { /* closed */ } };
      if (transport.status === "open") armed(); else transport.onOpen(armed);
      transport.onClose(() => { links.delete(link); link.open = false; changed(); });
      const pump = () => { try { transport.pump(now()); } catch (_) { /* closed */ } };
      if (opts.pump !== false) {
        if (typeof requestAnimationFrame === "function") {
          const tick = () => { if (!links.has(link)) return; pump(); requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        }
        if (typeof setInterval === "function") {
          const iv = setInterval(() => { if (!links.has(link)) { clearInterval(iv); return; } pump(); }, PUMP_MS);
          if (iv && typeof iv.unref === "function") iv.unref();
        }
      }
      link.pump = pump;
      return link;
    }
    return {
      add,
      peers: () => count(),
      pump() { for (const l of links) l.pump(); },
      takeFresh() { const f = fresh; fresh = false; return f; },
      send(frame) {
        if (!frame) return false;
        const text = JSON.stringify(["F", frame]);
        let any = false;
        for (const l of links) if (l.open && l.transport.status === "open" && l.transport.send(T.STATE, text)) { l.sent++; any = true; }
        return any;
      },
      close() { for (const l of [...links]) { try { l.transport.close(); } catch (_) { /* already closed */ } } links.clear(); changed(); },
    };
  }

  // ── viewer side: an open transport → onFrame(frame) ───────────────────────────
  // Drops a frame whose seq is not newer than the last accepted (reordered or
  // duplicated by the unordered channel). A patch whose caption id the viewer has
  // already shown loses that caption, so a duplicate can never re-arm the card.
  function view(transport, onFrame, opts) {
    opts = opts || {};
    const T = NetTransport;
    const now = clock(opts);
    let lastSeq = -1, captionId = null, closed = false, frames = 0, stale = 0, junk = 0;
    transport.onMessage((channel, data) => {
      if (closed || channel !== T.STATE) return;
      const f = parseFrame(data);
      if (!f) { junk++; return; }
      if (f.seq <= lastSeq) { stale++; return; }
      lastSeq = f.seq;
      let out = f;
      if (!f.full && f.caption && f.caption.id === captionId) { out = Object.assign({}, f); delete out.caption; }
      if (f.caption !== undefined) captionId = f.caption ? f.caption.id : null;
      frames++;
      try { onFrame(out); } catch (_) { /* painter's problem */ }
    });
    const armed = () => { if (!closed) { try { transport.send(T.EVENT, hello("view")); } catch (_) { /* closed */ } if (opts.onOpen) opts.onOpen(); } };
    if (transport.status === "open") armed(); else transport.onOpen(armed);
    transport.onClose((why) => { if (closed) return; closed = true; if (opts.onClose) { try { opts.onClose(why); } catch (_) { /* page's problem */ } } });
    const pump = () => transport.pump(now());
    if (opts.pump !== false) {
      if (typeof requestAnimationFrame === "function") { const tick = () => { if (closed) return; pump(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
      if (typeof setInterval === "function") {
        const iv = setInterval(() => { if (closed) { clearInterval(iv); return; } pump(); }, PUMP_MS);
        if (iv && typeof iv.unref === "function") iv.unref();
      }
    }
    return {
      pump,
      close() { try { transport.close(); } catch (_) { /* already closed */ } if (!closed) { closed = true; if (opts.onClose) opts.onClose("local"); } },
      stats: () => ({ frames, stale, junk, lastSeq, open: !closed && transport.status === "open" }),
    };
  }

  // ── game side: mint the room, accept viewers one after another ────────────────
  // ui: { say(text, isError), link(url, code) — null clears, peers(n), failed() }.
  // deps are the NetRendezvous/NetHandshake/NetTransport calls (test seams).
  // Returns { cancel(), state(), hub }.
  function host(ui, deps) {
    ui = ui || {};
    deps = Object.assign({
      rtc: (o) => NetTransport.rtc(o),
      prefetchIce: () => NetTransport.prefetchIce(),
      createInvite: (t, p) => NetHandshake.createInvite(t, p),
      acceptAnswer: (t, c) => NetHandshake.acceptAnswer(t, c),
      hostRoom: (o) => NetRendezvous.hostRoom(o),
      usingPrivateRelay: () => typeof NetRendezvous !== "undefined" && NetRendezvous.usingPrivateRelay(),
      swap: (o) => NetRendezvous.swap(o),
      makeCode: () => NetRendezvous.makeCode(),
    }, deps || {});
    const bridge = hub({ onPeers: (n) => { if (ui.peers) { try { ui.peers(n); } catch (_) { /* ui's problem */ } } }, now: deps.now, pump: deps.pump });
    const say = (t, bad) => { if (ui.say) { try { ui.say(t, !!bad); } catch (_) { /* ui's problem */ } } };
    let phase = "idle", code = null, token = { cancelled: false }, room = null, transport = null;

    function dropRoom() { token.cancelled = true; if (room && room.stop) { try { room.stop(); } catch (_) { /* stopped */ } } room = null; }
    function failed(msg) {
      phase = "failed"; dropRoom();
      if (transport) { try { transport.close(); } catch (_) { /* never opened */ } transport = null; }
      say(msg, true);
      if (ui.link) ui.link(null, null);
      if (ui.failed) { try { ui.failed(); } catch (_) { /* ui's problem */ } }
    }
    function cancel() {
      if (phase === "cancelled") return;
      phase = "cancelled"; dropRoom();
      if (transport) { try { transport.close(); } catch (_) { /* closed */ } transport = null; }
      bridge.close();
      if (ui.link) ui.link(null, null);
    }

    // One open() per viewer: a fresh transport + invite under the SAME code.
    const open = async () => {
      try {
        phase = "preparing"; token = { cancelled: false };
        await deps.prefetchIce();
        if (phase !== "preparing") return;
        transport = deps.rtc({ role: "host", name: "overlay" });
        if (!transport) { failed("WebRTC is unavailable in this browser."); return; }
        const invite = await deps.createInvite(transport, { overlay: PROTO });
        if (phase !== "preparing") return;
        if (!invite.ok) { failed(invite.message || "Could not prepare the overlay link."); return; }
        if (!code) code = deps.makeCode();
        phase = "waiting";
        if (ui.link) ui.link(overlayUrl(code), code);
        say("Waiting for the overlay… paste the link into an OBS Browser Source.");
        let accepted = false;
        const take = async (_who, answer) => {
          if (accepted || phase !== "waiting") return;
          accepted = true; phase = "connecting";
          const acc = await deps.acceptAnswer(transport, answer);
          if (phase !== "connecting") return;
          if (!acc.ok) { accepted = false; phase = "waiting"; say(acc.message || "That answer could not be read.", true); return; }
          const mine = transport; transport = null;
          bridge.add(mine);
          dropRoom();
          say("Overlay connected.");
          Log.info("ui", "stream overlay viewer linked");
          // Keep the same room open for the next viewer (an OBS reload re-dials the code).
          setTimeout(() => { if (phase === "connecting") open(); }, 0);
        };
        const roomOptions = {
          code, mine: invite.code, token,
          onTick: () => { if (phase === "waiting") say("Waiting for the overlay… (room code " + code + ")"); },
          onFail: (r) => {
            if (!r || r.error === "cancelled" || r.error === "stopped" || !["waiting", "connecting"].includes(phase)) return;
            failed(r.error === "expired" ? "The link expired — turn STREAM OVERLAY off and on for a new one." : r.message || "The room service went away — try again.");
          },
          mintOffer: async () => null,
          onJoiner: take,
        };
        if (deps.usingPrivateRelay()) {
          const got = await deps.swap({ code, mine: invite.code, slot: "offer", want: "answer", token, onTick: roomOptions.onTick });
          if (phase !== "waiting") return;
          if (got.ok) await take(null, got.payload); else roomOptions.onFail(got);
          return;
        }
        const sub = await deps.hostRoom(roomOptions);
        if (!["waiting", "connecting"].includes(phase)) { if (sub && sub.stop) { try { sub.stop(); } catch (_) { /* stopped */ } } return; }
        if (!sub || !sub.ok) { if (phase === "waiting") failed((sub && sub.message) || "Could not open a room — check the connection."); return; }
        room = sub;
      } catch (e) {
        Log.warn("ui", "stream overlay host failed: " + ((e && e.message) || e));
        if (phase !== "cancelled") failed("Could not open the overlay link — try again.");
      }
    };
    open();
    return { cancel, hub: bridge, state: () => ({ phase, code, peers: bridge.peers() }) };
  }

  // ── overlay page: dial the room, paint frames, re-dial on a drop ──────────────
  // Returns { close(), state() }. onState("waiting"|"connecting"|"live"|"lost"|"failed").
  function join(code, onFrame, opts, deps) {
    opts = opts || {};
    deps = Object.assign({
      rtc: (o) => NetTransport.rtc(o),
      prefetchIce: () => NetTransport.prefetchIce(),
      acceptInvite: (t, c, p) => NetHandshake.acceptInvite(t, c, p),
      swap: (o) => NetRendezvous.swap(o),
      normalise: (c) => NetRendezvous.normalise(c),
      timers: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) },
    }, deps || {});
    const set = (s) => { state = s; if (opts.onState) { try { opts.onState(s); } catch (_) { /* page's problem */ } } };
    let state = "waiting", owner = null, tries = 0, timer = null, active = null, stopped = false;
    code = deps.normalise(code);

    async function dial() {
      if (stopped) return;
      const me = owner = { cancelled: false };
      set("connecting");
      try {
        await deps.prefetchIce();
        if (owner !== me) return;
        const transport = deps.rtc({ role: "guest", name: "overlay" });
        if (!transport) { set("failed"); return; }
        let answered = null;
        const done = await deps.swap({
          code, slot: "answer", want: "offer", token: me,
          reply: async (invite) => {
            if (owner !== me) return null;
            answered = await deps.acceptInvite(transport, invite, { overlay: PROTO });
            return answered.ok ? answered.code : null;
          },
        });
        if (owner !== me) { try { transport.close(); } catch (_) { /* superseded */ } return; }
        if (!done.ok) { try { transport.close(); } catch (_) { /* never opened */ } retry(); return; }
        active = view(transport, onFrame, {
          now: opts.now,
          onOpen: () => { tries = 0; set("live"); },
          onClose: (why) => { active = null; if (!stopped && why !== "peer") retry(); },
        });
      } catch (e) {
        Log.warn("ui", "overlay join failed: " + ((e && e.message) || e));
        retry();
      }
    }
    function retry() {
      if (stopped) return;
      if (tries >= REDIAL_BACKOFF_MS.length) { set("failed"); return; }
      set("lost");
      timer = deps.timers.setTimeout(dial, REDIAL_BACKOFF_MS[tries++]);
    }
    dial();
    return {
      close() { stopped = true; if (owner) owner.cancelled = true; if (timer) deps.timers.clearTimeout(timer); if (active) active.close(); },
      state: () => state,
    };
  }

  return { PROTO, MAX_VIEWERS, overlayUrl, codeFromHash, hub, view, host, join };
})();
Object.freeze(OverlayNet);
