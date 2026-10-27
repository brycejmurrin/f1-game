/* PhonePad — PHONE AS CONTROLLER: a phone on the sofa steers the game on the
   screen by tilting, over the multiplayer wire, and shows a steering-wheel
   dash fed live from the race.

   WHY NOT BLUETOOTH. A web page can only ever be the CENTRAL end of Web
   Bluetooth (Chrome, desktop): it connects to a peripheral that advertises.
   No phone browser can advertise, act as a GATT peripheral or present itself
   as an HID gamepad — that needs a native app on the phone. So the pairing
   that IS available to a static site is the one VS FRIEND already ships: a
   WebRTC DataChannel, signalled through a six-letter room code on the public
   Nostr relays (js/net/rendezvous.js → js/net/nostr.js). On one Wi-Fi the
   channel goes phone→router→laptop with a few ms of latency; across networks
   it still connects (STUN/TURN, js/net/transport.js). Both ends need internet
   for the ten seconds the handshake takes; the game itself never sees a server.

   THREE FILES, ONE WIRE. PhonePadCodec owns the bytes. This file is the
   desktop session: host() mints the room and link() feeds Input.remoteSample()
   the same tilt pipeline the local sensor uses. PhonePadPage is the phone
   DOM (controller.html). link()/padSession() leave signalling out so
   tests/unit/phone-pad.test.mjs drives both over NetTransport.loopback(). */
"use strict";


const PhonePad = (function () {
  const {
    PROTO, EVENTS, NAV_REPEAT, hudOf,
    encodeSample, decodeSample, encodeHud, decodeHud, encodeEvent, encodeHaptic, encodeHello, decodeEvent,
    teamHex, fmtLap, padUrl, codeFromUrl,
  } = PhonePadCodec;
  const { HELD, DASH, paintHud, pad } = PhonePadPage;
  const HEARTBEAT_MS = 100;        // a sample at least this often, moving or not
  const MIN_SAMPLE_GAP_MS = 15;    // and at most ~66 Hz — the sensor's own rate
  const HUD_MS = 66;               // the dash refreshes ~15 Hz, like the game's own HUD tick

  // ── desktop: the focus ring the phone moves ──────────────────────────────
  // The D-pad reaches MenuNav as SYNTHETIC arrow keys, and whether the browser
  // DRAWS the focus it moves is its own heuristic: Safari shows no
  // :focus-visible for a scripted focus after a touch or a click, and no
  // browser paints :focus while its window is not the focused one — which is
  // exactly the sofa case, the player's hands on the phone and not on the
  // game's screen. Focus moved, SELECT clicked the right thing, and nothing on
  // screen said where it was. So the phone's focus wears a class of its own
  // (.pad-ring, css/responsive.css) from the first phone nav until a real
  // pointer or key on the desktop takes over. A focusout that leaves focus
  // where it was is the WINDOW blurring, not focus moving, and keeps the ring.
  function ringer(doc) {
    if (!doc || typeof doc.addEventListener !== "function") return null;
    let el = null, phone = false;
    const set = (n) => {
      if (el === n) return;
      if (el && el.classList) el.classList.remove("pad-ring");
      el = n && n !== doc.body && n !== doc.documentElement && n.classList ? n : null;
      if (el) el.classList.add("pad-ring");
    };
    const onIn = (e) => { if (phone) set(e.target); };
    const onOut = (e) => {
      if (e.target !== el) return;
      setTimeout(() => { if (el && doc.activeElement !== el) set(null); }, 0);
    };
    const local = (e) => { if (e.isTrusted === false) return; phone = false; set(null); };
    doc.addEventListener("focusin", onIn, true);
    doc.addEventListener("focusout", onOut, true);
    doc.addEventListener("pointerdown", local, true);
    doc.addEventListener("keydown", local, true);
    return {
      arm() { phone = true; },
      sync() { if (phone) set(doc.activeElement); },
      stop() {
        set(null);
        doc.removeEventListener("focusin", onIn, true);
        doc.removeEventListener("focusout", onOut, true);
        doc.removeEventListener("pointerdown", local, true);
        doc.removeEventListener("keydown", local, true);
      },
    };
  }

  // ── desktop: the transport-level half ────────────────────────────────────
  // Wires an OPEN (or opening) transport to Input and streams the dash back.
  // `opts.input`, `opts.now` and `opts.pump: false` are the test seams;
  // `opts.hud` is a sampler returning the dash fields (null = nothing to show).
  function link(transport, opts) {
    opts = opts || {};
    const input = opts.input || (typeof Input !== "undefined" ? Input : null);
    if (!transport || !input) return null;
    const T = NetTransport;
    // A clock on every pump: the rtc transport ignores it, loopback (the test
    // wire) schedules by it, and an undefined `now` there delivers nothing.
    const now = opts.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    let lastSeq = -1, ackAt = -1e9, peerAck = false, helloPending = false;
    let samples = 0, events = 0, stale = 0, junk = 0, huds = 0;
    let closed = false;
    let raf = 0;
    let hudAt = -1e9;
    const ring = ringer(opts.doc !== undefined ? opts.doc : (typeof document !== "undefined" ? document : null));
    input.setRemoteHaptics(null);  // clear the previous peer before any hello can arrive

    transport.onMessage((channel, data) => {
      if (closed) return;
      if (channel === T.STATE) {
        const s = decodeSample(data);
        if (!s) { junk++; return; }
        // Unordered channel: an older sample after a newer one is thrown away,
        // never applied — it would steer the car back where the phone was.
        if (s.seq <= lastSeq && lastSeq - s.seq < 30000) { stale++; return; }
        lastSeq = s.seq;
        samples++;
        const accepted = input.remoteSample(Object.assign({ source: "phone" }, s));
        if (accepted !== false && peerAck && now() - ackAt >= HEARTBEAT_MS) { ackAt = now(); transport.send(T.STATE, JSON.stringify(["A", s.seq])); }
        return;
      }
      const ev = decodeEvent(data);
      if (!ev) { junk++; return; }
      if (ev.t === "hi" && ev.side === "pad" && ev.p === PROTO) {
        peerAck = !!ev.ack;
        helloPending = !transport.send(T.EVENT, encodeHello("host", false, true));
        input.setRemoteHaptics(ev.haptics ? (ms) => transport.send(T.EVENT, encodeHaptic(ms)) : null);
      }
      if (ev.t === "ev") {
        events++;
        const nav = ev.k.startsWith("nav") && ring;
        if (nav) ring.arm();
        input.remoteEvent(ev.k);
        if (nav) ring.sync();
      }
    });
    const onClose = (why) => {
      if (closed) return;
      closed = true;
      if (ring) ring.stop();
      if (raf) { try { cancelAnimationFrame(raf); } catch (e) { /* no rAF here */ } raf = 0; }
      input.remoteLost("phone");
      input.setRemoteHaptics(null);
      if (opts.onClose) { try { opts.onClose(why); } catch (e) { /* caller's problem */ } }
    };
    transport.onClose(onClose);

    const armed = () => {
      if (closed) return;
      helloPending = !transport.send(T.EVENT, encodeHello("host", false, true));
      if (opts.onOpen) { try { opts.onOpen(); } catch (e) { /* caller's problem */ } }
    };
    if (transport.status === "open") armed(); else transport.onOpen(armed);

    // The dash: sampled and sent from the same pump, ~15 Hz, unreliable — a
    // dropped frame is replaced 66 ms later, so nothing is worth a retransmit.
    function sendHud(t) {
      if (!opts.hud || transport.status !== "open" || t - hudAt < HUD_MS) return;
      hudAt = t;
      let h = null;
      try { h = opts.hud(); } catch (e) { h = null; }
      const text = encodeHud(h);
      if (text && transport.send(T.STATE, text)) huds++;
    }
    // Samples land in the transport's inbox and reach Input only on pump(): once
    // a frame, ahead of the game loop's own Input.poll(). The frame loop is not
    // this module's to edit (js/game.js is ratcheted), so an rAF of its own
    // does the pumping; a test pumps by hand with pump: false.
    const pump = () => { const t = now(); const n = transport.pump(t); if (helloPending) helloPending = !transport.send(T.EVENT, encodeHello("host", false, true)); sendHud(t); return n; };
    if (opts.pump !== false && typeof requestAnimationFrame === "function") {
      const tick = () => { if (closed) return; pump(); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }
    return {
      pump,
      close() { try { transport.close(); } catch (e) { /* already closed */ } onClose(); },
      stats: () => ({ samples, events, stale, junk, huds, lastSeq, open: !closed && transport.status === "open" }),
    };
  }

  // ── desktop: the whole pairing flow, with signalling ─────────────────────
  // ui: { say(text, isError), qr(url, code) — null hides it, linked(), lost(),
  //       relinking() — a linked phone dropped and the room is open again for it,
  //       hud() — the dash sampler handed to link() }.
  // Returns the controller: cancel(), state().
  function host(ui, deps) {
    ui = ui || {};
    deps = Object.assign({
      rtc: (o) => NetTransport.rtc(o),
      prefetchIce: () => NetTransport.prefetchIce(),
      createInvite: (t, p) => NetHandshake.createInvite(t, p),
      acceptAnswer: (t, c) => NetHandshake.acceptAnswer(t, c),
      hostRoom: (o) => NetRendezvous.hostRoom(o),
      usingPrivateRelay: () => typeof NetRendezvous !== "undefined" && NetRendezvous.usingPrivateRelay(),
      relayUrl: () => NetRendezvous.baseUrl(),
      swap: (o) => NetRendezvous.swap(o),
      makeCode: () => NetRendezvous.makeCode(),
    }, deps || {});
    const say = (t, bad) => { if (ui.say) { try { ui.say(t, !!bad); } catch (e) { /* ui's problem */ } } };
    const qr = (url, code) => { if (ui.qr) { try { ui.qr(url, code); } catch (e) { /* ui's problem */ } } };
    let phase = "idle";          // idle | preparing | waiting | connecting | linked | lost | cancelled | failed
    let transport = null, room = null, active = null;
    let token = { cancelled: false };
    let code = null;
    // RE-LINK (R3-PHONE-3): a linked phone whose WIRE died (a lock, a call, a dead
    // signal — any close but the phone's own "peer" goodbye) gets the SAME code
    // hosted again for the room's own lifetime (nostr HOST_TIMEOUT_MS), and the
    // phone dials it again by itself. A private relay's one mailbox is not reusable.
    let relink = false, roomTiming = null;
    const recoveryState = () => ({ phase, reconnecting: relink && ["preparing", "waiting", "connecting"].includes(phase), publicRelay: !deps.usingPrivateRelay(),
      startedAt: roomTiming ? roomTiming.startedAt : null, deadlineAt: roomTiming ? roomTiming.deadlineAt : null });
    function recoveryChanged() { if (ui.recovery) { try { ui.recovery(recoveryState()); } catch (e) { /* ui's problem */ } } }
    // A failed pairing takes its dead QR down and releases the pending
    // transport; the page's button stops reading STOP PAIRING (#2198).
    function failed(msg) {
      phase = "failed"; roomTiming = null; recoveryChanged(); say(msg, true);
      dropRoom();
      if (!active && transport) { try { transport.close(); } catch (e) { /* never opened */ } }
      transport = null;
      qr(null, null);
      if (relink) { relink = false; Log.info("input", "phone pad re-link gave up"); if (ui.lost) { try { ui.lost(); } catch (e) { /* ui's problem */ } } }
      else if (ui.failed) { try { ui.failed(); } catch (e) { /* ui's problem */ } }
    }

    function dropRoom() {
      token.cancelled = true;
      if (room && room.stop) { try { room.stop(); } catch (e) { /* already stopped */ } }
      room = null; roomTiming = null; recoveryChanged();
    }
    function cancel() {
      if (phase === "cancelled") return;
      phase = "cancelled";
      dropRoom();
      if (active) { active.close(); active = null; }
      else if (transport) { try { transport.close(); } catch (e) { /* already closed */ } }
      transport = null;
      qr(null, null);
      Log.info("input", "phone pad cancelled");
    }

    const open = async () => {
      try {
        phase = "preparing";
        token = { cancelled: false };
        say(relink ? "Phone link lost — waiting for it to reconnect…" : "Preparing… (this can take a few seconds)");
        await deps.prefetchIce();
        if (phase !== "preparing") return;
        transport = deps.rtc({ role: "host", name: "pad" });
        if (!transport) { failed("WebRTC is unavailable in this browser."); return; }
        const invite = await deps.createInvite(transport, { pad: PROTO });
        if (phase !== "preparing") return;
        if (!invite.ok) { failed(invite.message || "Could not prepare the pairing."); return; }
        if (!relink) code = deps.makeCode();
        const url = padUrl(code, null, deps.usingPrivateRelay() ? deps.relayUrl() : null);
        phase = "waiting";
        qr(url, code);
        say("Scan the code with your phone's camera, or open the link and type the room code.");
        let accepted = false;
        const roomOptions = {
          code, mine: invite.code, token,
          onTick: () => { recoveryChanged(); if (phase === "waiting") say(relink ? "Phone link lost — reconnecting. Use MAKE NEW CODE if needed." : "Waiting for your phone… (room code " + code + ")"); },
          onFail: (r) => {
            if (!r || r.error === "cancelled" || r.error === "stopped" || !["waiting", "connecting"].includes(phase)) return;
            if (r.advisory) { say(r.message, true); return; }
            // nostr's expiry copy is VS FRIEND's ("Check the six characters…").
            failed(r.error === "expired" ? "The code expired — press STEER THIS GAME WITH A PHONE for a new one."
              : r.message || "The room service went away — try again.");
          },
          mintOffer: async () => null,     // one phone; a second scan gets nothing
          onJoiner: async (_who, answer) => {
            if (accepted || phase !== "waiting") return;
            accepted = true;
            phase = "connecting";
            say("Phone found — connecting…");
            const acc = await deps.acceptAnswer(transport, answer);
            if (phase !== "connecting") return;
            if (!acc.ok) {
              const msg = acc.message || "That answer could not be read.";
              if (deps.usingPrivateRelay()) failed(msg);
              else { accepted = false; phase = "waiting"; say(msg, true); }
              return;
            }
            active = link(transport, {
              hud: ui.hud || null,
              onOpen: () => {
                phase = "linked"; relink = false;
                dropRoom();
                qr(null, null);
                say("Phone connected — tilt to steer. RECALIBRATE TILT levels it.");
                Log.info("input", "phone pad linked");
                if (ui.linked) { try { ui.linked(); } catch (e) { /* ui's problem */ } }
              },
              onClose: (why) => {
                if (phase === "cancelled") return;
                const wasLinked = phase === "linked";
                // A link that died before it opened (ICE failed) still holds
                // the room's relay sockets; nothing will use them now.
                dropRoom();
                if (wasLinked && why !== "peer" && !deps.usingPrivateRelay()) {
                  relink = true; active = null; transport = null;
                  Log.info("input", "phone pad dropped (" + why + ") — hosting again");
                  if (ui.relinking) { try { ui.relinking(); } catch (e) { /* ui's problem */ } }
                  open();
                  return;
                }
                phase = "lost";
                say("Phone disconnected — press STEER THIS GAME WITH A PHONE for a new code.", true);
                Log.info("input", "phone pad lost");
                if (ui.lost) { try { ui.lost(); } catch (e) { /* ui's problem */ } }
              },
            });
          },
        };
        // A private relay has one offer/answer mailbox, exactly what one phone
        // needs. hostRoom is the public relay's multi-guest subscription only.
        if (deps.usingPrivateRelay()) {
          const got = await deps.swap({ code, mine: invite.code, slot: "offer", want: "answer", token, onTick: roomOptions.onTick });
          if (phase !== "waiting") return;
          if (got.ok) await roomOptions.onJoiner(null, got.payload);
          if (phase === "waiting") {
            if (!got.ok) roomOptions.onFail(got);
            else failed("Could not connect that phone — try a new code.");
          }
          return;
        }
        const sub = await deps.hostRoom(roomOptions);
        if (!["waiting", "connecting"].includes(phase)) {
          if (sub && sub.stop) { try { sub.stop(); } catch (e) { /* already stopped */ } }
          return;
        }
        if (!sub || !sub.ok) {
          if (phase === "waiting") failed((sub && sub.message) || "Could not open a room — check the connection.");
          return;
        }
        room = sub;
        roomTiming = Number.isFinite(sub.startedAt) && Number.isFinite(sub.deadlineAt) && sub.deadlineAt >= sub.startedAt
          ? { startedAt: sub.startedAt, deadlineAt: sub.deadlineAt } : null;
        recoveryChanged();
      } catch (e) {
        Log.warn("input", "phone pad host failed: " + ((e && e.message) || e));
        if (phase !== "cancelled") {
          dropRoom();
          if (transport) { try { transport.close(); } catch (_) { /* failed startup */ } transport = null; }
          failed("Pairing failed — try again.");
        }
      }
    };
    open();

    return { cancel, state: () => ({ phase, code, recovery: recoveryState(), stats: active ? active.stats() : null }) };
  }

  // ── phone: the transport-level half ──────────────────────────────────────
  // Streams samples and edges over an open transport. `src` is the sensor and
  // button state the page keeps: { roll(), thr(), brk(), held() }. Returns
  // { sample(), event(k), pump(), close(), stats() }; the page calls sample()
  // from deviceorientation and on every pedal change, and pump() each frame.
  // `opts.onHud(h)` receives every dash packet.
  function padSession(transport, src, opts) {
    opts = opts || {};
    const T = NetTransport;
    const now = opts.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    let seq = 0, lastSent = -1e9, sent = 0, haptics = 0, huds = 0, closed = false;
    let beat = 0, helloPending = false, peerSteer = false, peerAck = false, ackAt = -1, openedAt = now();
    let dirty = false;   // a coalesced move awaiting the 15 ms gap
    const pending = [], sentTimes = new Map();
    const EDGE_MAX_AGE_MS = 1200, NAV_MAX_AGE_MS = 250, EDGE_CAP = 24;
    let expired = 0, rejected = 0, healthState = "unavailable";
    const canVibrate = () => typeof opts.vibrate === "function" || (typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && navigator.maxTouchPoints > 0);
    function flush() {
      if (closed || transport.status !== "open") return;
      if (helloPending) helloPending = !transport.send(T.EVENT, encodeHello("pad", canVibrate(), true));
      while (pending.length) {
        const edge = pending[0];
        if (now() - edge.at > (NAV_REPEAT[edge.k] ? NAV_MAX_AGE_MS : EDGE_MAX_AGE_MS)) { pending.shift(); expired++; continue; }
        if (!transport.send(T.EVENT, encodeEvent(edge.k))) break;
        pending.shift();
      }
    }
    // Sender-clock age of a sample the desktop acknowledged accepting. HUD
    // receipt alone says nothing about whether the upstream input arrived.
    function health() {
      const age = ackAt < 0 ? now() - openedAt : now() - ackAt;
      healthState = !peerAck ? "unavailable" : age > 1500 ? "reconnecting" : ackAt < 0 ? "waiting" : age > 400 ? "degraded" : age < 250 ? "good" : healthState === "good" ? "good" : "degraded";
      return { state: healthState, ageMs: ackAt < 0 ? null : Math.max(0, age), touchSupported: peerSteer };
    }
    const vibrate = opts.vibrate || ((ms) => {
      try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* advisory */ }
    });

    function send(force) {
      if (closed || transport.status !== "open") return false;
      const t = now();
      // A rate-limited move is COALESCED, not dropped: the next pump() (each rAF)
      // sends the latest values once the 15 ms gap has passed (audit4 UB4).
      if (!force && t - lastSent < MIN_SAMPLE_GAP_MS) { dirty = true; return false; }
      lastSent = t; dirty = false;
      const ok = transport.send(T.STATE, encodeSample({
        seq: seq++, roll: src.roll(), thr: src.thr(), brk: src.brk(), held: src.held(),
        ...(peerSteer && src.steer && src.steer() != null ? { steer: src.steer() } : {}),
      }));
      if (ok) { sent++; sentTimes.set(seq - 1, t); while (sentTimes.size > 128) sentTimes.delete(sentTimes.keys().next().value); }
      return ok;
    }
    function event(k) {
      if (closed || !EVENTS.includes(k) || transport.status !== "open") return false;
      flush();
      if (NAV_REPEAT[k] && pending.some((e) => e.k === k)) return true;
      if (pending.length >= EDGE_CAP) { rejected++; return false; }
      pending.push({ k, at: now() }); flush();
      return true;
    }
    transport.onMessage((channel, data) => {
      if (closed) return;
      if (channel === T.STATE) {
        let ack; try { ack = JSON.parse(data); } catch (_) { ack = null; }
        if (peerAck && Array.isArray(ack) && ack[0] === "A" && Number.isInteger(ack[1]) && sentTimes.has(ack[1])) { ackAt = sentTimes.get(ack[1]); for (const key of sentTimes.keys()) if (key <= ack[1]) sentTimes.delete(key); }
        const h = hudOf(ack);
        if (h && opts.onHud) { huds++; try { opts.onHud(h); } catch (e) { /* page's problem */ } }
        return;
      }
      const ev = decodeEvent(data);
      if (ev && ev.t === "hi" && ev.side === "host" && ev.p === PROTO) { peerSteer = !!ev.steer; peerAck = !!ev.ack; if (opts.onCapabilities) opts.onCapabilities({ touchSupported: peerSteer }); }
      if (ev && ev.t === "hap" && ev.ms > 0) { haptics++; vibrate(ev.ms); }
    });
    const close = (why) => {
      if (closed) return;
      closed = true; pending.length = 0; sentTimes.clear();
      if (beat) { clearInterval(beat); beat = 0; }
      if (opts.onClose) { try { opts.onClose(why); } catch (e) { /* page's problem */ } }
    };
    transport.onClose(close);
    const armed = () => {
      if (closed) return;
      openedAt = now();
      helloPending = true; flush();
      if (opts.heartbeat !== false) {
        beat = setInterval(() => { flush(); send(true); if (opts.onHealth) opts.onHealth(health()); }, HEARTBEAT_MS);
        if (beat && typeof beat.unref === "function") beat.unref();   // node harness: never the thing keeping the process alive
      }
      if (opts.onOpen) { try { opts.onOpen(); } catch (e) { /* page's problem */ } }
    };
    if (transport.status === "open") armed(); else transport.onOpen(armed);
    return {
      // A press/release EDGE is sent at once (force); the sensor stream and a
      // pedal slide or steer drag keep the 15 ms gap, coalesced into the next pump.
      sample: (force) => send(!!force),
      event,
      // With a heartbeat running, onHealth comes from it at 100 ms, not from every
      // rAF pump as well (audit4 UB5: one allocated object per frame).
      pump: () => {
        const n = transport.pump(now()); flush();
        if (dirty) send(false);
        if (opts.onHealth && !beat) opts.onHealth(health());
        return n;
      },
      health,
      close() { try { transport.close(); } catch (e) { /* already closed */ } close("local"); },
      stats: () => ({ sent, haptics, huds, seq, queued: pending.length, expired, rejected, health: health(), open: !closed && transport.status === "open" }),
    };
  }

  return {
    PROTO, HELD, EVENTS, DASH, HEARTBEAT_MS, HUD_MS,
    encodeSample, decodeSample, encodeHud, decodeHud, encodeEvent, encodeHaptic, encodeHello, decodeEvent,
    teamHex, fmtLap, paintHud,
    padUrl, codeFromUrl,
    link, host, padSession, pad,
  };
})();
Object.freeze(PhonePad);
