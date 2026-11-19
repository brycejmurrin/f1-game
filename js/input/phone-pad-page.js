"use strict";

const PhonePadPage = (function () {
  const HELD = Object.freeze({ lookBack: 1 });
  const REPEAT_DELAY_MS = 380, REPEAT_RATE_MS = 110;

  const DASH = Object.freeze({ boost: 1, otArmed: 2, otActive: 4, xArmed: 8, xOpen: 16,
    retired: 32, timeTrial: 64, paused: 128, redline: 256,
    gearsAuto: 512, throttleAuto: 1024, aeroAuto: 2048, aeroNone: 4096,
    quali: 8192, practice: 16384 });

  const CAUTION = ["", "YELLOW", "VSC", "SAFETY CAR", "RED FLAG"];
  function paintHud(el, h) {
    if (!el || !h) return;
    const text = (n, v) => { if (el[n] && el[n].textContent !== v) el[n].textContent = v; };
    const inRace = h.state === "race" || h.state === "count";
    text("gear", h.gear === 0 ? "N" : h.gear < 0 ? "R" : String(h.gear));
    text("speed", inRace ? String(h.kmh) : "---");
    text("lap", h.flags & DASH.timeTrial ? "TT" : h.laps ? "LAP " + Math.min(Math.max(h.lap, 1), h.laps) + "/" + h.laps : "");
    text("pos", h.flags & DASH.retired ? "DNF" : h.flags & DASH.timeTrial ? "" : h.flags & DASH.quali ? "Q" : h.flags & DASH.practice ? "PRAC" : h.pos ? "P" + h.pos + "/" + h.cars : "");
    text("last", h.lastLapMs ? "LAST " + PhonePadCodec.fmtLap(h.lastLapMs) : "");
    text("ot", h.flags & DASH.otActive ? "OVERTAKE" : h.flags & DASH.otArmed ? "OT READY" : "OT");
    text("aero", h.flags & DASH.aeroNone ? "NO ZONES" : h.flags & DASH.aeroAuto ? (h.flags & DASH.xOpen ? "AUTO STRAIGHT" : "AERO AUTO")
      : h.flags & DASH.xOpen ? "STRAIGHT MODE" : h.flags & DASH.xArmed ? "AERO ARMED" : "AERO");
    text("flag", h.state === "count" ? "LIGHTS" : h.flags & DASH.paused ? "PAUSED" : !inRace ? "MENU" : CAUTION[h.caution] || "");
    text("mtitle", h.flags & DASH.paused ? "PAUSED" : "MENU");
    if (el.ers && el.ers.style) el.ers.style.width = (h.ers * 100).toFixed(0) + "%";
    if (el.leds && el.leds.children) {
      const n = el.leds.children.length, lit = Math.round(h.rpm * n);
      for (let i = 0; i < n; i++) el.leds.children[i].classList.toggle("on", inRace && i < lit);
    }
    if (el.screen && el.screen.classList) {
      el.screen.classList.toggle("redline", !!(h.flags & DASH.redline));
      el.screen.classList.toggle("boost", !!(h.flags & DASH.boost));
      el.screen.classList.toggle("ot-on", !!(h.flags & DASH.otActive));
      el.screen.classList.toggle("ot-ready", !!(h.flags & DASH.otArmed) && !(h.flags & DASH.otActive));
      el.screen.classList.toggle("x-open", !!(h.flags & DASH.xOpen));
      el.screen.classList.toggle("caution", inRace && h.caution > 0);
      el.screen.classList.toggle("idle", !inRace);
    }
    if (el.team && el.team.style && h.team) el.team.style.setProperty("--team", h.team);
    if (el.body && el.body.classList) {
      el.body.classList.toggle("gears-auto", !!(h.flags & DASH.gearsAuto));
      el.body.classList.toggle("throttle-auto", !!(h.flags & DASH.throttleAuto));
      el.body.classList.toggle("aero-auto", !!(h.flags & DASH.aeroAuto));
      el.body.classList.toggle("aero-none", !!(h.flags & DASH.aeroNone));
      el.body.classList.toggle("menu", !inRace || !!(h.flags & DASH.paused));
    }
  }

  function pad(dom, opts) {
    opts = opts || {};
    const deps = Object.assign({
      rtc: (o) => NetTransport.rtc(o),
      prefetchIce: () => NetTransport.prefetchIce(),
      acceptInvite: (t, c, p, o) => NetHandshake.acceptInvite(t, c, p, o),
      swap: (o) => NetRendezvous.swap(o),
      normalise: (c) => NetRendezvous.normalise(c),
      valid: (c) => NetRendezvous.valid(c),
      privateRelay: () => typeof NetRendezvous !== "undefined" && NetRendezvous.usingPrivateRelay && NetRendezvous.usingPrivateRelay(),
      setSessionUrl: (url) => typeof NetRendezvous !== "undefined" && NetRendezvous.setSessionUrl ? NetRendezvous.setSessionUrl(url) : url === null,
    }, opts.deps || {});
    let pairing = PhonePadCodec.pairingFromUrl(opts.href);
    function paintCodeInput() {
      if (!dom.codeIn) return;
      const privateCode = pairing ? !!pairing.relay : deps.privateRelay();
      dom.codeIn.maxLength = privateCode ? 32 : 12;
      dom.codeIn.placeholder = privateCode ? "PRIVATE ROOM TOKEN" : "ABCD2345";
    }
    paintCodeInput();
    const say = (t, bad) => {
      if (!dom.status) return;
      dom.status.textContent = t;
      dom.status.classList.toggle("bad", !!bad);
    };
    let roll = null, thr = 0, brk = 0, held = 0, steer = 0, steeringMode = "tilt";
    let session = null;
    const peerId = opts.peerId || PhonePadCodec.makePeerId();
    let sensorOn = false;
    let lastHud = null;
    const src = { roll: () => roll, thr: () => thr, brk: () => brk, held: () => held, steer: () => steeringMode === "touch" ? steer : null };

    function paintRoll() {
      if (!dom.rim || !dom.rim.style) return;
      const r = roll == null ? 0 : Math.max(-25, Math.min(25, roll * 0.6));
      dom.rim.style.transform = "rotate(" + r.toFixed(1) + "deg)";
    }
    function onOrient(e) {
      if (steeringMode !== "tilt") return;
      const r = TiltRoll.rollDeg(e.beta, e.gamma, TiltRoll.screenAngle());
      if (r === null) return;
      roll = r;
      sensorOn = true;
      paintRoll();
      if (session) session.sample();
    }
    let sensorAttached = false;
    async function requestSensor() {
      if (typeof DeviceOrientationEvent === "undefined") return false;
      try {
        if (typeof DeviceOrientationEvent.requestPermission === "function") {
          const r = await DeviceOrientationEvent.requestPermission();
          if (r !== "granted") return false;
        }
      } catch (e) { return false; }
      if (!sensorAttached) {
        sensorAttached = true;
        window.addEventListener("deviceorientation", onOrient);
      }
      return true;
    }
    const releases = [], pointerReleases = [];
    const releaseAll = (pointersOnly) => { for (const r of releases) r(pointersOnly === true); };
    function hold(el, on, off, travel) {
      if (!el) return;
      const ids = new Set();
      const anchors = new Map();
      const levels = new Map();
      const level = (v, edge) => { if (el.style && el.style.setProperty) el.style.setProperty("--travel", v.toFixed(2)); on(v, edge); };
      const paintLevel = (edge = true) => { let strongest = 0; for (const v of levels.values()) strongest = Math.max(strongest, v); level(strongest, edge); };
      releases.push((pointersOnly) => {
        if (pointersOnly) { for (const id of Array.from(ids)) if (typeof id !== "string") up({ pointerId: id }); return; }
        if (!ids.size) return;
        ids.clear(); anchors.clear(); levels.clear(); el.classList.remove("on"); if (travel) paintLevel(); else off();
      });
      const down = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        ids.add(e.pointerId);
        try { el.setPointerCapture(e.pointerId); } catch (err) {  }
        el.classList.add("on");
        if (travel) { anchors.set(e.pointerId, e.clientY); levels.set(e.pointerId, 1); paintLevel(); } else on(1);
        e.preventDefault();
      };
      const move = (e) => { if (travel && anchors.has(e.pointerId)) { levels.set(e.pointerId, travelOf(anchors.get(e.pointerId), e.clientY)); paintLevel(false); } };
      const up = (e) => {
        anchors.delete(e.pointerId);
        levels.delete(e.pointerId);
        if (!ids.delete(e.pointerId)) return;
        if (!ids.size) el.classList.remove("on");
        if (travel) paintLevel(); else if (!ids.size) off();
      };
      const keyId = (key) => key === " " || key === "Enter" ? "key:" + key : null;
      el.addEventListener("keydown", (e) => {
        const id = keyId(e.key);
        if (!id || (el === dom.gas && dom.body && dom.body.classList.contains("throttle-auto"))) return;
        e.preventDefault();
        if (ids.has(id)) return;
        ids.add(id); el.classList.add("on");
        if (travel) { levels.set(id, 1); paintLevel(); } else on(1);
      });
      el.addEventListener("keyup", (e) => {
        const id = keyId(e.key);
        if (!id) return;
        e.preventDefault(); up({ pointerId: id });
      });
      el.addEventListener("blur", () => {
        for (const id of Array.from(ids)) if (typeof id === "string") up({ pointerId: id });
      });
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      pointerReleases.push(up);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("lostpointercapture", (e) => { if (!el.isConnected || !el.getClientRects().length) up(e); });
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    if (typeof document !== "undefined") {
      const allUp = (e) => { if (!e.touches || !e.touches.length) releaseAll(true); };
      const releasePointer = (e) => { for (const up of pointerReleases) up(e); };
      document.addEventListener("pointerup", releasePointer, true);
      document.addEventListener("pointercancel", releasePointer, true);
      if (typeof window !== "undefined" && window.addEventListener) { window.addEventListener("pointerup", releasePointer, true); window.addEventListener("pointercancel", releasePointer, true); window.addEventListener("blur", releaseAll); }
      document.addEventListener("touchend", allUp, { capture: true, passive: true });
      document.addEventListener("touchcancel", allUp, { capture: true, passive: true });
      document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
    }
    function travelOf(anchorY, y) { return PedalTravel.ease(anchorY, y); }
    let steerAria = "0";
    const push = (edge = true) => {
      const pct = String(Math.round(steer * 100));
      if (pct !== steerAria && dom.steer && dom.steer.setAttribute) { steerAria = pct; dom.steer.setAttribute("aria-valuenow", pct); }
      if (session) session.sample(edge !== false);
    };
    function setSteeringMode(mode) {
      if (mode !== "tilt" && mode !== "touch") return false;
      if (mode === "touch" && (!session || !session.health().touchSupported)) { say("Touch steering needs an updated game. Reload the game and reconnect.", true); return false; }
      steeringMode = mode; steer = 0; push();
      if (dom.steeringMode) dom.steeringMode.value = mode;
      if (dom.steer) dom.steer.hidden = mode !== "touch";
      return true;
    }
    if (dom.steeringMode) dom.steeringMode.addEventListener("change", () => { if (!setSteeringMode(dom.steeringMode.value)) dom.steeringMode.value = steeringMode; });
    if (dom.steer) {
      let steeringPointer = null, anchorX = 0, stripW = 40;
      const steeringKeys = new Set();
      const release = (e) => { if (e && e.pointerId !== steeringPointer) return; steeringPointer = null; if (!e) steeringKeys.clear(); steer = steeringKeys.size ? (Array.from(steeringKeys).pop() === "ArrowLeft" ? -1 : 1) : 0; push(); };
      releases.push((pointersOnly) => release(pointersOnly ? { pointerId: steeringPointer } : undefined)); pointerReleases.push(release);
      dom.steer.addEventListener("pointerdown", (e) => { if ((e.pointerType === "mouse" && e.button !== 0) || steeringMode !== "touch" || steeringPointer !== null) return; steeringPointer = e.pointerId; anchorX = e.clientX; stripW = Math.max(40, dom.steer.getBoundingClientRect().width * 0.4); steer = 0; try { dom.steer.setPointerCapture(e.pointerId); } catch (_) {  } e.preventDefault(); push(); });
      dom.steer.addEventListener("pointermove", (e) => { if (steeringPointer !== e.pointerId) return; steer = PhonePadCodec.num((e.clientX - anchorX) / stripW, -1, 1); push(false); });
      dom.steer.addEventListener("pointerup", release); dom.steer.addEventListener("pointercancel", release);
      dom.steer.addEventListener("keydown", (e) => { if (steeringMode !== "touch" || !["ArrowLeft", "ArrowRight"].includes(e.key)) return; e.preventDefault(); if (steeringKeys.has(e.key)) return; steeringKeys.add(e.key); steer = e.key === "ArrowLeft" ? -1 : 1; push(); });
      dom.steer.addEventListener("keyup", (e) => {
        if (!steeringKeys.delete(e.key)) return;
        e.preventDefault();
        const last = Array.from(steeringKeys).pop();
        steer = last ? (last === "ArrowLeft" ? -1 : 1) : 0; push();
      });
      dom.steer.addEventListener("blur", () => release());
    }
    hold(dom.gas, (v, edge) => { thr = v; push(edge); }, () => { thr = 0; push(); }, true);
    hold(dom.brake, (v, edge) => { brk = v; push(edge); }, () => { brk = 0; push(); }, true);
    hold(dom.lookBack, () => { held |= HELD.lookBack; push(); }, () => { held &= ~HELD.lookBack; push(); });
    const timers = opts.timers || {
      setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t),
      setInterval: (f, ms) => setInterval(f, ms), clearInterval: (t) => clearInterval(t),
    };
    const buzz = () => {
      try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8); } catch (e) {  }
    };
    function repeater(k) {
      let rep = null;
      const stop = () => { if (rep) { timers.clearTimeout(rep); timers.clearInterval(rep); rep = null; } };
      const start = () => {
        stop();
        rep = timers.setTimeout(() => {
          rep = timers.setInterval(() => { if (session) session.event(k); else stop(); }, REPEAT_RATE_MS);
          if (rep && rep.unref) rep.unref();
        }, REPEAT_DELAY_MS);
        if (rep && rep.unref) rep.unref();
      };
      return { start, stop };
    }
    function edge(el, k, repeat) {
      if (!el) return;
      const r = repeater(k), stop = r.stop;
      const held = new Set();
      const fire = () => { buzz(); if (session) session.event(k); };
      el.addEventListener("click", (e) => { if (!e.detail) { e.preventDefault(); fire(); } });
      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        const first = !held.size;
        held.add(e.pointerId);
        try { el.setPointerCapture(e.pointerId); } catch (err) {  }
        el.classList.add("on");
        if (!first) return;
        fire();
        if (repeat) r.start();
      });
      const up = (e) => {
        if (e && typeof e === "object" && "pointerId" in e) {
          if (!held.delete(e.pointerId)) return;
          if (held.size) return;
        } else {
          held.clear();
        }
        el.classList.remove("on");
        stop();
      };
      releases.push(() => up());
      pointerReleases.push(up);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("lostpointercapture", (e) => { if (!el.isConnected || !el.getClientRects().length) up(e); });
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    for (const k of PhonePadCodec.EVENTS) {
      const b = dom.buttons && dom.buttons[k];
      for (const el of (Array.isArray(b) ? b : [b])) edge(el, k, !!PhonePadCodec.NAV_REPEAT[k]);
    }
    edge(dom.center, "calib");

    function menuStick(base, nub, arrows) {
      if (!base) return;
      let id = null, dir = null, cx = 0, cy = 0, rad = 1;
      const reps = {};
      const lit = (k, on) => { const a = arrows && arrows[k]; if (a && a.classList) a.classList.toggle("on", on); };
      const aim = (k) => {
        if (k === dir) return;
        if (dir) { lit(dir, false); reps[dir].stop(); }
        dir = k;
        if (!k) return;
        lit(k, true);
        buzz();
        if (session) session.event(k);
        (reps[k] ||= repeater(k)).start();
      };
      const place = (e) => {
        const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy);
        const m = d ? Math.min(d, rad * 0.55) / d : 0;
        if (nub && nub.style) nub.style.transform = "translate(" + (dx * m).toFixed(1) + "px," + (dy * m).toFixed(1) + "px)";
        if (d < rad * 0.28) { aim(null); return; }
        const ax = Math.abs(dx), ay = Math.abs(dy);
        const horiz = dir === "navLeft" || dir === "navRight" ? ax * 1.2 >= ay : ax > ay * 1.2;
        aim(horiz ? (dx < 0 ? "navLeft" : "navRight") : (dy < 0 ? "navUp" : "navDown"));
      };
      base.addEventListener("pointerdown", (e) => {
        if ((e.pointerType === "mouse" && e.button !== 0) || id !== null) return;
        id = e.pointerId;
        try { base.setPointerCapture(e.pointerId); } catch (err) {  }
        const b = base.getBoundingClientRect();
        cx = b.left + b.width / 2; cy = b.top + b.height / 2; rad = Math.max(1, b.width / 2);
        base.classList.add("on");
        place(e);
        e.preventDefault();
      });
      base.addEventListener("pointermove", (e) => { if (e.pointerId === id) place(e); });
      const up = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        aim(null);
        base.classList.remove("on");
        if (nub && nub.style) nub.style.transform = "";
      };
      releases.push(() => { if (id !== null) up({ pointerId: id }); });
      pointerReleases.push(up);
      base.addEventListener("pointerup", up);
      base.addEventListener("pointercancel", up);
      base.addEventListener("lostpointercapture", (e) => { if (!base.isConnected || !base.getClientRects().length) up(e); });
      base.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    menuStick(dom.stick, dom.nub, dom.arrows);

    let wake = null, wakeRequest = null, wakeGeneration = 0;
    function releaseWake(lock) {
      if (!lock) return;
      try { const p = lock.release(); if (p && p.catch) p.catch(() => {}); } catch (_) {  }
    }
    function dropWake() {
      wakeGeneration++; wakeRequest = null;
      const lock = wake; wake = null;
      releaseWake(lock);
    }
    async function keepAwake() {
      if ((!connecting && !session) || wake || wakeRequest) return;
      const generation = wakeGeneration, request = {};
      wakeRequest = request;
      try {
        if (typeof navigator !== "undefined" && navigator.wakeLock) {
          const lock = await navigator.wakeLock.request("screen");
          if (generation !== wakeGeneration || (!connecting && !session)) { releaseWake(lock); return; }
          wake = lock;
          lock.addEventListener("release", () => { if (wake === lock) wake = null; });
        }
      } catch (e) {  }
      finally { if (wakeRequest === request) wakeRequest = null; }
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && session) keepAwake(); });
    }

    let connecting = false, attempt = null;
    let redial = null;
    const REDIAL_BACKOFF_MS = [5000, 15000, 30000];
    let redialTries = 0, redialTimer = null, redialing = false;
    const CONNECT_DEADLINE_MS = 15000;
    let connectDeadline = null, liveCode = null;
    function clearConnectDeadline() { if (connectDeadline) { clearTimeout(connectDeadline); connectDeadline = null; } }
    function stopRedial() { redial = null; redialTries = 0; if (redialTimer) { clearTimeout(redialTimer); redialTimer = null; } }
    function redialNow() {
      if (!redial || connecting || session || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      const c = redial; redial = null;
      redialing = true;
      connect(c);
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", redialNow);
    function cancel() {
      stopScan();
      stopRedial();
      clearConnectDeadline();
      const old = attempt; attempt = null;
      if (old) old.cancelled = true;
      connecting = false;
      const active = session;
      steeringMode = "tilt"; if (dom.steeringMode) dom.steeringMode.value = "tilt"; if (dom.steer) dom.steer.hidden = true;
      if (active) { steer = 0; thr = brk = held = 0; active.sample(true); }
      session = null;
      if (active) active.close();
      else if (old && old.transport) { try { old.transport.close(); } catch (_) {  } }
      dropWake(); releaseAll();
      if (dom.body) dom.body.classList.remove("linked");
      if (dom.connect) dom.connect.disabled = false;
    }
    function pageHide() {
      const code = session ? liveCode : null;
      if (session && session.sendSuspend) session.sendSuspend();
      cancel();
      if (code && !deps.privateRelay()) { redial = code; say("Link paused — reconnecting when this page is back…", true); }
    }
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("pagehide", pageHide);
      window.addEventListener("pageshow", () => redialNow());
    }
    async function connect(codeIn) {
      const isRedial = redialing; redialing = false;
      if (connecting || session) return { ok: false, error: "busy" };
      stopScan();
      if (!isRedial) stopRedial();
      const incoming = PhonePadCodec.pairingFromUrl(codeIn);
      if (incoming) { pairing = incoming; codeIn = incoming.code; if (dom.codeIn) dom.codeIn.value = codeIn; paintCodeInput(); }
      if (pairing && (pairing.invalid || !deps.setSessionUrl(pairing.relay))) {
        say("That pairing link has an invalid relay address. Scan a new code from the game.", true);
        return { ok: false, error: "bad_relay" };
      }
      const code = deps.normalise(codeIn);
      if (!deps.valid(code)) { say(deps.privateRelay() ? "That is not a private room token — copy the full 32-character token." : "That is not a room code — eight letters and numbers (six from an older version).", true); return { ok: false, error: "bad_code" }; }
      connecting = true;
      const owner = attempt = { cancelled: false, transport: null };
      if (dom.connect) dom.connect.disabled = true;
      const sensor = sensorOn || await requestSensor();
      if (attempt !== owner) return { ok: false, error: "cancelled" };
      if (!sensor) say("No motion sensor — choose TOUCH STRIP under STEERING after connecting to an updated game.", true);
      else say("Looking for the game…");
      keepAwake();
      try {
        await deps.prefetchIce();
        if (attempt !== owner) return { ok: false, error: "cancelled" };
        let transport = owner.transport = deps.rtc({ role: "guest", name: "pad" });
        if (!transport) { say("WebRTC is unavailable in this browser.", true); return { ok: false, error: "no_transport" }; }
        let answered = null, opened = false;
        const armDeadline = () => {
          clearConnectDeadline();
          connectDeadline = setTimeout(() => {
            connectDeadline = null;
            if (attempt !== owner || opened) return;
            cancel();
            say("The game is not offering that code any more — choose MAKE NEW CODE in its phone-controller settings, then CONNECT.", true);
          }, CONNECT_DEADLINE_MS);
        };
        const listen = { stopped: false, get cancelled() { return owner.cancelled || this.stopped; } };
        let bound = null, bindGen = 0;
        const rebind = (old) => {
          const prev = bound;
          if (prev) { bound = null; session = null; bindGen++; prev.close(); bind(); }
          else { try { old.close(); } catch (_) {  } }
        };
        const done = await deps.swap({
          code, slot: "answer", want: "offer", token: listen,
          reanswer: true,
          onTick: () => { if (attempt === owner && !session) say("Looking for the game… (room code " + code + ")"); },
          reply: async (invite) => {
            if (attempt !== owner) return null;
            if (answered && answered.ok) {
              const st = transport.stats ? transport.stats() : null;
              if (transport.status === "open" || (st && st.connection === "connected")) return null;
              const fresh = deps.rtc({ role: "guest", name: "pad" });
              if (!fresh) return null;
              const res = await deps.acceptInvite(fresh, invite, { pad: PhonePadCodec.PROTO });
              if (attempt !== owner || !res.ok) { try { fresh.close(); } catch (_) {  } return null; }
              const old = transport;
              transport = owner.transport = fresh; answered = res;
              rebind(old);
              armDeadline();
              return res.code;
            }
            say("Found it — connecting…");
            const res = await deps.acceptInvite(transport, invite, { pad: PhonePadCodec.PROTO });
            if (attempt !== owner) return null;
            answered = res;
            if (res.ok) armDeadline();
            return res.ok ? res.code : null;
          },
        });
        if (attempt !== owner) return { ok: false, error: "cancelled" };
        if (!done.ok) {
          const why = (done.error === "reply_failed" && answered && !answered.ok) ? answered : done;
          say(why.error === "build_mismatch" ? "The game and this page are on different versions — reload both and try again."
            : why.error === "expired" ? "The game is not offering that code any more — choose MAKE NEW CODE in its phone-controller settings."
            : why.message || "Could not reach the game. Make a new code there and try again.", true);
          try { transport.close(); } catch (e) {  }
          if (isRedial && why.error !== "build_mismatch") {
            if (redialTries < REDIAL_BACKOFF_MS.length) {
              const wait = REDIAL_BACKOFF_MS[redialTries++];
              say("Link lost — reconnecting… (try " + redialTries + " of " + REDIAL_BACKOFF_MS.length + ")", true);
              redialTimer = setTimeout(() => { redialTimer = null; redial = code; redialNow(); }, wait);
            } else {
              redialTries = 0;
              say("Could not reconnect to the game — press STEER THIS GAME WITH A PHONE there, then CONNECT.", true);
            }
          }
          return why;
        }
        say("Connecting…");
        function bind() {
        const gen = ++bindGen;
        const active = PhonePad.padSession(transport, src, {
          now: opts.now || null,
          peerId,
          onHud: (h) => { lastHud = h; paintHud(dom.hud, h); },
          onOpen: () => {
            if (gen !== bindGen) return;
            listen.stopped = true;
            opened = true; clearConnectDeadline();
            say((sensorOn || sensor ? "Connected — tilt to steer." : "Connected — pedals and buttons only.") + " If the game asks, tap ALLOW on its screen.");
            if (dom.body) dom.body.classList.add("linked");
            if (opts.onOpen) opts.onOpen();
          },
          onHealth: (h) => {
            const text = h.state === "unavailable" ? "INPUT AGE UNAVAILABLE · UPDATE GAME" : h.state === "waiting" ? "WAITING FOR INPUT ACK" : h.state === "reconnecting" ? "INPUT NOT ACKNOWLEDGED" : "INPUT " + h.state.toUpperCase();
            if (dom.health && dom.health.textContent !== text) dom.health.textContent = text;
            if (dom.health && dom.health.dataset && dom.health.dataset.state !== h.state) dom.health.dataset.state = h.state;
            if (dom.healthAge) { const age = h.ageMs == null ? "" : Math.round(h.ageMs / 100) * 100 + " ms since acknowledged sample"; if (dom.healthAge.textContent !== age) dom.healthAge.textContent = age; }
          },
          onClose: (why) => {
            if (attempt !== owner || gen !== bindGen) return;
            bound = null; listen.stopped = true; clearConnectDeadline();
            steer = 0; steeringMode = "tilt"; if (dom.steeringMode) dom.steeringMode.value = "tilt"; if (dom.health) { dom.health.textContent = "INPUT DISCONNECTED"; if (dom.health.dataset) dom.health.dataset.state = "disconnected"; } if (dom.steer) dom.steer.hidden = true;
            attempt = null; owner.cancelled = true; connecting = false;
            session = null;
            dropWake(); releaseAll();
            if (dom.body) dom.body.classList.remove("linked");
            if (dom.connect) dom.connect.disabled = false;
            const wire = !!why && why !== "peer", again = wire && !deps.privateRelay();
            say(!wire ? "Disconnected — the game closed the link. Pair again from its Settings."
              : "Link lost — this phone slept, took a call or lost signal. " + (again ? "Reconnecting…" : "Pair again from the game's Settings."), true);
            if (opts.onClose) opts.onClose();
            if (again) { redial = code; redialNow(); }
          },
        });
        if (attempt !== owner || gen !== bindGen) { active.close(); return null; }
        bound = session = active;
        const tick = () => { if (session !== active) return; active.pump(); requestAnimationFrame(tick); };
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(tick);
        return active;
        }
        if (attempt !== owner || !bind()) return { ok: false, error: "cancelled" };
        redialTries = 0;
        liveCode = code;
        return { ok: true };
      } finally {
        if (attempt === owner) {
          connecting = false;
          if (!session) { attempt = null; owner.cancelled = true; dropWake(); clearConnectDeadline(); }
          if (dom.connect && !session) dom.connect.disabled = false;
        }
      }
    }
    if (dom.connect) dom.connect.addEventListener("click", () => connect(dom.codeIn ? dom.codeIn.value : ""));

    const Scan = deps.scan ? deps.scan() : (typeof NetScan !== "undefined" ? NetScan : null);
    let scanner = null, scanGeneration = 0, scanPending = false;
    const showScan = (on) => {
      if (dom.scanBox) dom.scanBox.hidden = !on;
      if (dom.scan) dom.scan.textContent = on ? "CANCEL SCAN" : "SCAN QR CODE";
    };
    function stopScan() { scanGeneration++; scanPending = false; if (scanner) scanner.stop(); showScan(false); }
    async function scan() {
      if (scanPending || (scanner && scanner.active())) { stopScan(); say("Type the room code the game shows, then CONNECT."); return { ok: false, error: "cancelled" }; }
      if (connecting || session) return { ok: false, error: "busy" };
      const generation = ++scanGeneration;
      scanPending = true;
      const current = () => generation === scanGeneration && !connecting && !session &&
        !(typeof document !== "undefined" && document.hidden);
      await requestSensor();
      if (!current()) { if (generation === scanGeneration) scanPending = false; return { ok: false, error: "cancelled" }; }
      scanner = scanner || Scan.create();
      showScan(true);
      say("Point the camera at the QR code on the game's screen.");
      const r = await scanner.start(dom.video, (text) => {
        if (!current()) return;
        showScan(false);
        pairing = PhonePadCodec.pairingFromUrl(text);
        paintCodeInput();
        const code = pairing ? pairing.code : String(text || "").trim();
        if (dom.codeIn) dom.codeIn.value = code;
        connect(code);
      });
      if (generation !== scanGeneration) return { ok: false, error: "cancelled" };
      scanPending = false;
      if (!r.ok) {
        showScan(false);
        if (r.error !== "cancelled") say(String(r.message || "The camera did not start.").replace(/paste/g, "type"), true);
      }
      return r;
    }
    if (dom.scan) {
      if (!Scan || !Scan.supported()) dom.scan.hidden = true;
      else dom.scan.addEventListener("click", () => { scan(); });
    }
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => { if (document.hidden) stopScan(); });
    }
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("hashchange", () => {
      const next = PhonePadCodec.pairingFromUrl(typeof location !== "undefined" ? location.href : "");
      if (!next || (pairing && next.code === pairing.code && next.relay === pairing.relay)) return;
      const linked = !!session;
      if (!linked) cancel();
      pairing = next;
      if (dom.codeIn) dom.codeIn.value = next.code;
      paintCodeInput();
      say(linked ? "A new pairing link arrived — the current link stays; CONNECT uses the new code after it ends." : "Tap CONNECT to pair with the game.");
    });
    const fromUrl = pairing && pairing.code;
    if (fromUrl && dom.codeIn) dom.codeIn.value = fromUrl;
    say(fromUrl ? "Tap CONNECT to pair with the game." : Scan && Scan.supported() ? "Scan the game's QR code, or type its room code and CONNECT." : "Type the room code the game shows, then CONNECT.");

    return {
      connect,
      cancel,
      scan,
      setSteeringMode,
      paintHud: (h) => { lastHud = h; paintHud(dom.hud, h); },
      armSensor: requestSensor,
      setRoll: (r) => { roll = r; paintRoll(); if (session) session.sample(); },
      pump: () => (session ? session.pump() : 0),
      state: () => ({ linked: !!session, roll, thr, brk, held, steer, steeringMode, sensorOn, hud: lastHud, stats: session ? session.stats() : null }),
    };
  }

  const LAYOUT_KEYS = Object.freeze(["overtake", "boost", "aero", "camera", "radio", "look", "recover", "pause"]);
  const LAYOUT_LABEL = Object.freeze({ overtake: "OT", boost: "BOOST", aero: "AERO", camera: "CAM", radio: "RADIO", look: "LOOK", recover: "RESET", pause: "PAUSE" });
  const LAYOUT_KEY = "apex26.padLayout";
  const zonesWith = (side, keys) => Object.fromEntries(LAYOUT_KEYS.map((k) => [k, keys.includes(k) ? side : "C"]));
  const TRIO = ["overtake", "boost", "aero"];
  const preset = (zone, more) => Object.assign({ zone, swap: false, pedals: "stack", strip: "row", place: {} }, more);
  const ARRANGE_MIN_PX = 44;
  const clampN = (v, lo, hi, d) => (typeof v === "number" && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : d;
  function normalisePlace(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const id of Object.keys(raw).slice(0, 40)) {
      const p = raw[id];
      if (!/^[\w-]{1,24}$/.test(id) || !p || typeof p !== "object") continue;
      const r1 = (v) => Math.round(v * 10) / 10;
      const q = { x: r1(clampN(p.x, -90, 90, 0)), y: r1(clampN(p.y, -90, 90, 0)), s: Math.round(clampN(p.s, 40, 250, 100)) };
      if (q.x || q.y || q.s !== 100) out[id] = q;
    }
    return out;
  }
  const LAYOUT_PRESETS = Object.freeze({
    classic: preset(zonesWith("C", [])),
    right: preset(zonesWith("R", TRIO)),
    left: preset(zonesWith("L", TRIO)),
    mirror: preset(zonesWith("C", []), { swap: true }),
    phone: preset(zonesWith("R", TRIO), { pedals: "side", strip: "column" }),
  });
  function normaliseLayout(raw) {
    const r = raw && typeof raw === "object" ? raw : {}, z = r.zone && typeof r.zone === "object" ? r.zone : {};
    return { zone: Object.fromEntries(LAYOUT_KEYS.map((k) => [k, z[k] === "L" || z[k] === "R" ? z[k] : "C"])), swap: r.swap === true,
      pedals: r.pedals === "side" ? "side" : "stack", strip: r.strip === "column" ? "column" : "row", place: normalisePlace(r.place) };
  }
  function layoutPreset(lay) {
    const n = normaliseLayout(lay);
    return Object.keys(LAYOUT_PRESETS).find((id) => JSON.stringify(LAYOUT_PRESETS[id]) === JSON.stringify(n)) || "custom";
  }
  function applyLayout(dom, lay) {
    const n = normaliseLayout(lay), g = dom.grips || {};
    const box = { C: dom.home, L: n.swap ? g.R : g.L, R: n.swap ? g.L : g.R };
    for (const k of LAYOUT_KEYS) {
      const el = dom.keys && dom.keys[k], to = box[n.zone[k]];
      if (el && to && to.appendChild) to.appendChild(el);
    }
    const b = dom.body && dom.body.dataset;
    if (b) { if (n.swap) b.swap = "1"; else delete b.swap; b.pedals = n.pedals; b.strip = n.strip; }
    for (const [id, el] of Object.entries(dom.arrange || {})) placeEl(el, n.place[id]);
    return n;
  }
  function placeEl(el, p) {
    if (!el || !el.style) return;
    el.style.translate = p ? p.x + "vw " + p.y + "vh" : "";
    el.style.scale = p && p.s !== 100 ? String(p.s / 100) : "";
    if (el.classList) el.classList.toggle("placed", !!p);
  }
  function minScale(w, h, s) {
    const base = Math.min(w, h) / ((s || 100) / 100);
    return base > 0 ? Math.max(40, Math.ceil(ARRANGE_MIN_PX / base * 100)) : 40;
  }
  function layout(dom, opts) {
    const store = (opts && opts.store) || null;
    let cur;
    try { cur = normaliseLayout(store && JSON.parse(store.getItem(LAYOUT_KEY) || "null")); } catch (e) { cur = normaliseLayout(null); }
    const picks = {};
    if (dom.rows && dom.doc) {
      for (const k of LAYOUT_KEYS) {
        const row = dom.doc.createElement("div"); row.className = "lay-row";
        const name = dom.doc.createElement("span"); name.textContent = LAYOUT_LABEL[k]; row.appendChild(name);
        picks[k] = {};
        for (const [z, txt] of [["L", "LEFT"], ["C", "MID"], ["R", "RIGHT"]]) {
          const b = dom.doc.createElement("button"); b.type = "button"; b.textContent = txt;
          b.setAttribute("aria-label", LAYOUT_LABEL[k] + " " + (z === "C" ? "under the dash" : txt.toLowerCase() + " grip"));
          b.addEventListener("click", () => set(Object.assign({}, cur, { zone: Object.assign({}, cur.zone, { [k]: z }) })));
          picks[k][z] = b; row.appendChild(b);
        }
        dom.rows.appendChild(row);
      }
    }
    function paint() {
      const p = layoutPreset(cur);
      for (const el of dom.presets || []) el.setAttribute("aria-pressed", String(el.dataset.preset === p));
      for (const k of LAYOUT_KEYS) for (const z of ["L", "C", "R"]) if (picks[k]) picks[k][z].setAttribute("aria-pressed", String(cur.zone[k] === z));
      if (dom.swapBtn) dom.swapBtn.setAttribute("aria-pressed", String(cur.swap));
      if (dom.pedalsBtn) dom.pedalsBtn.setAttribute("aria-pressed", String(cur.pedals === "side"));
      if (dom.stripBtn) dom.stripBtn.setAttribute("aria-pressed", String(cur.strip === "column"));
    }
    function set(lay) {
      cur = applyLayout(dom, lay);
      try { if (store) store.setItem(LAYOUT_KEY, JSON.stringify(cur)); } catch (e) {  }
      paint();
    }
    for (const el of dom.presets || []) el.addEventListener("click", () => set(LAYOUT_PRESETS[el.dataset.preset] || LAYOUT_PRESETS.classic));
    if (dom.swapBtn) dom.swapBtn.addEventListener("click", () => set(Object.assign({}, cur, { swap: !cur.swap })));
    if (dom.pedalsBtn) dom.pedalsBtn.addEventListener("click", () => set(Object.assign({}, cur, { pedals: cur.pedals === "side" ? "stack" : "side" })));
    if (dom.stripBtn) dom.stripBtn.addEventListener("click", () => set(Object.assign({}, cur, { strip: cur.strip === "column" ? "row" : "column" })));
    const show = (on) => { if (dom.sheet) dom.sheet.hidden = !on; if (on && dom.done && dom.done.focus) dom.done.focus(); else if (!on && dom.open && dom.open.focus) dom.open.focus(); };
    const A = dom.arrange || {}, idOf = new Map(Object.entries(A).map(([id, el]) => [el, id]));
    let picked = null, drag = null;
    const pts = new Map();
    const W = () => (typeof innerWidth === "number" ? innerWidth : 800), H = () => (typeof innerHeight === "number" ? innerHeight : 400);
    const placeOf = (id) => cur.place[id] || { x: 0, y: 0, s: 100 };
    const label = (id) => { const el = A[id]; return el ? (el.getAttribute && el.getAttribute("aria-label")) || el.textContent.trim().split(/\s+/)[0] || id : id; };
    function markClashes() {
      const els = Object.values(A).filter((el) => el && el.getBoundingClientRect && el.classList), rs = els.map((el) => el.getBoundingClientRect());
      const hitBy = els.map(() => false);
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = rs[i], b = rs[j];
        if (!a.width || !b.width) continue;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) hitBy[i] = hitBy[j] = true;
      }
      els.forEach((el, i) => el.classList.toggle("clash", arranging() && hitBy[i]));
    }
    function pick(id) {
      if (picked && A[picked] && A[picked].classList) A[picked].classList.remove("picked");
      picked = id; if (id && A[id] && A[id].classList) A[id].classList.add("picked");
      if (dom.barName) dom.barName.textContent = id ? label(id).toUpperCase() + " · " + Math.round(placeOf(id).s) + "%" : "TAP A CONTROL";
      markClashes();
    }
    function put(id, p, save) {
      const place = Object.assign({}, cur.place, { [id]: p });
      if (save) set(Object.assign({}, cur, { place })); else { cur = Object.assign({}, cur, { place: normalisePlace(place) }); placeEl(A[id], cur.place[id]); }
      pick(id);
    }
    function sizeBy(id, factor, save) {
      const el = A[id], p = placeOf(id), r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 100, height: 100 };
      put(id, { x: p.x, y: p.y, s: Math.max(minScale(r.width, r.height, p.s), Math.min(250, Math.round(p.s * factor))) }, save);
    }
    const arranging = () => !!(dom.body && dom.body.classList && dom.body.classList.contains("arranging"));
    function arrange(on) {
      if (dom.body && dom.body.classList) dom.body.classList.toggle("arranging", on);
      if (dom.bar) dom.bar.hidden = !on;
      if (on) { show(false); pick(null); } else { pts.clear(); drag = null; pick(null); }
    }
    if (dom.stage) {
      const stop = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
      const hit = (t) => { for (let n = t; n && n !== dom.stage; n = n.parentNode) if (idOf.has(n)) return idOf.get(n); return null; };
      dom.stage.addEventListener("pointerdown", (e) => {
        if (!arranging()) return;
        stop(e);
        const id = hit(e.target); if (!id) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 1) { const p = placeOf(id); drag = { id, x0: e.clientX, y0: e.clientY, p }; pick(id); }
        else if (pts.size === 2 && drag) { const [a, b] = [...pts.values()]; drag.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: placeOf(drag.id).s }; }
        try { dom.stage.setPointerCapture && dom.stage.setPointerCapture(e.pointerId); } catch (_) {  }
      }, true);
      dom.stage.addEventListener("pointermove", (e) => {
        if (!arranging() || !drag || !pts.has(e.pointerId)) return;
        stop(e); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (drag.pinch && pts.size >= 2) {
          const [a, b] = [...pts.values()], f = Math.hypot(a.x - b.x, a.y - b.y) / drag.pinch.d0;
          const p = placeOf(drag.id); sizeBy(drag.id, (drag.pinch.s0 * f) / p.s, false);
        } else if (!drag.pinch) {
          put(drag.id, { x: drag.p.x + (e.clientX - drag.x0) / W() * 100, y: drag.p.y + (e.clientY - drag.y0) / H() * 100, s: drag.p.s }, false);
        }
      }, true);
      const end = (e) => {
        if (!arranging()) return;
        stop(e); pts.delete(e.pointerId);
        if (drag && !pts.size) { const id = drag.id; drag = null; set(Object.assign({}, cur)); pick(id); }
      };
      dom.stage.addEventListener("pointerup", end, true); dom.stage.addEventListener("pointercancel", end, true);
      for (const t of ["click", "contextmenu"]) dom.stage.addEventListener(t, (e) => { if (arranging()) stop(e); }, true);
    }
    if (dom.arrangeBtn) dom.arrangeBtn.addEventListener("click", () => arrange(true));
    if (dom.arrangeDone) dom.arrangeDone.addEventListener("click", () => arrange(false));
    if (dom.minus) dom.minus.addEventListener("click", () => { if (picked) sizeBy(picked, 0.9, true); });
    if (dom.plus) dom.plus.addEventListener("click", () => { if (picked) sizeBy(picked, 1.1, true); });
    if (dom.resetOne) dom.resetOne.addEventListener("click", () => { if (!picked) return; const place = Object.assign({}, cur.place); delete place[picked]; const id = picked; set(Object.assign({}, cur, { place })); pick(id); });
    if (dom.resetAll) dom.resetAll.addEventListener("click", () => { set(Object.assign({}, cur, { place: {} })); pick(null); });
    if (dom.open) dom.open.addEventListener("click", () => show(true));
    if (dom.done) dom.done.addEventListener("click", () => show(false));
    cur = applyLayout(dom, cur); paint();
    return { get: () => normaliseLayout(cur), set, show, arrange, sizeBy: (id, f) => sizeBy(id, f, true) };
  }

  return { HELD, DASH, paintHud, pad, LAYOUT_KEYS, LAYOUT_PRESETS, ARRANGE_MIN_PX, minScale, normaliseLayout, layoutPreset, applyLayout, layout };
})();
Object.freeze(PhonePadPage);
