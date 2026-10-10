/* Visible controls for the real-race replay. Clock and camera ownership stay in RealReplay. */
const WatchTransport = (function () {
  "use strict";
  // A real race runs past the hour: "1:32:14", not "92:14" (Dom.fmtRaceClock).
  function clock(t) {
    const s = Math.max(0, Math.floor(t || 0));
    if (typeof Dom !== "undefined" && Dom.fmtRaceClock) return Dom.fmtRaceClock(s, 0);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function create(G, replay) {
    let root = null, refs = {}, desc = null, tickAt = 0, scrubbing = false;
    let pendingSeek = null, seekFrame = 0;   // the latest scrub value awaiting its frame
    function flushSeek() {
      seekFrame = 0;
      if (pendingSeek == null || !root) { pendingSeek = null; return; }
      const v = pendingSeek; pendingSeek = null;
      replay.seek(v);
    }
    function node(tag, key, text) {
      const n = document.createElement(tag);
      if (key) { n.dataset.wt = key; refs[key] = n; }
      if (text) n.textContent = text;
      return n;
    }
    function action(parent, key, label, text, fn) {
      const b = node("button", key, text); b.type = "button";
      b.setAttribute("aria-label", label);
      b.addEventListener("click", () => { fn(); paint(); });
      parent.appendChild(b); return b;
    }
    function select(parent, key, label, choices, change) {
      const field = node("label", key + "-field");
      field.appendChild(node("span", null, label));
      const pick = node("select", key); pick.setAttribute("aria-label", label);
      choices.forEach(([value, text]) => { const o = node("option", null, text); o.value = value; pick.appendChild(o); });
      pick.addEventListener("change", () => { change(pick.value); paint(); });
      field.appendChild(pick); parent.appendChild(field); return pick;
    }
    function start() {
      stop();
      if (typeof document === "undefined" || !document.body) return;
      desc = replay.describe(); if (!desc) return;
      root = node("section"); root.className = "watch-transport";
      root.setAttribute("aria-label", "Race replay controls");
      const top = node("div", "controls");
      action(top, "play", "Pause replay", "Ⅱ", () => { const s = replay.status(); if (s) replay.setPaused(!s.paused); });
      action(top, "prev", "Previous race event", "Ⅰ‹", () => replay.eventStep(-1));
      action(top, "next", "Next race event", "›Ⅰ", () => replay.eventStep(1));
      select(top, "speed", "SPEED", desc.speeds.map((s) => [String(s), s + "×"]), (v) => replay.setSpeed(+v));
      select(top, "driver", "FOLLOWED DRIVER", desc.drivers.map((d) => [d.code, d.code + " · " + d.name]), (v) => { replay.follow(v); replay.setLocked(true); });
      const cameras = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : [];
      select(top, "camera", "CAMERA", cameras.map((c) => [c.id, c.label || c.id.toUpperCase()]), (id) => {
        const idx = cameras.findIndex((c) => c.id === id);
        if (idx >= 0 && G.setCamMode) { G.setCamMode(idx, { persist: false }); replay.setLocked(true); if (G.snapGameCam) G.snapGameCam(true); }
      });
      action(top, "auto", "Let the TV director choose the driver and camera", "AUTO", () => replay.setAuto(true));
      action(top, "lock", "Keep following the selected driver and camera", "FOLLOW LOCK", () => replay.setLocked(true));
      const photo = action(top, "photo", "Open photo mode", "PHOTO", () => { if (G.openWatchPhoto) G.openWatchPhoto(); });
      photo.hidden = typeof G.openWatchPhoto !== "function";
      root.appendChild(top);
      const timeline = node("div", "timeline");
      timeline.appendChild(node("span", "time"));
      const track = node("div", "track"), marks = node("div", "markers");
      marks.setAttribute("aria-hidden", "true");
      const state = replay.status(), duration = state ? state.duration : 0;
      // Markers are visual; named previous/next controls provide full-size targets.
      desc.events.forEach((e) => {
        const m = node("i"); m.dataset.kind = e.kind; m.title = "L" + e.lap + " · " + e.text;
        m.style.left = (duration > 0 ? Math.min(100, Math.max(0, e.t / duration * 100)) : 0) + "%";
        marks.appendChild(m);
      });
      track.appendChild(marks);
      const seek = node("input", "seek"); seek.type = "range"; seek.min = "0"; seek.max = String(duration); seek.step = "0.1";
      seek.setAttribute("aria-label", "Race replay timeline");
      // A drag fires `input` far faster than the screen refreshes, and replay.seek() poses 22 cars and
      // renders synchronously: the clock text follows every event, the seek itself runs once per frame
      // with the latest value (a browser without rAF seeks at once).
      seek.addEventListener("input", () => {
        scrubbing = true; refs.time.textContent = clock(+seek.value);
        pendingSeek = +seek.value;
        if (typeof requestAnimationFrame !== "function") { flushSeek(); return; }
        if (!seekFrame) seekFrame = requestAnimationFrame(flushSeek);
      });
      seek.addEventListener("change", () => { scrubbing = false; pendingSeek = null; replay.seek(+seek.value); paint(); });
      seek.addEventListener("blur", () => { scrubbing = false; paint(); });
      track.appendChild(seek); timeline.appendChild(track); timeline.appendChild(node("span", "duration", clock(duration)));
      root.appendChild(timeline);
      const caption = node("div", "caption");
      caption.appendChild(node("span", "name", desc.name));
      caption.appendChild(node("span", "event")); caption.appendChild(node("span", "director"));
      root.appendChild(caption); document.body.appendChild(root);
      document.body.classList.add("watch-controls-on"); paint();
    }
    // WRITE ONLY ON CHANGE. paint() runs every 0.1 s; rewriting the same text,
    // value and aria-valuetext ten times a second is DOM churn, and on the
    // focused timeline it is a screen reader re-announcing the clock.
    const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
    const setAttr = (el, k, v) => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
    const setVal = (el, v) => { if (el.value !== v) el.value = v; };
    function paint() {
      if (!root) return;
      const s = replay.status(); if (!s) { stop(); return; }
      // PLAY/PAUSE is an action button whose LABEL says what it does — not a
      // toggle: aria-pressed=paused ("Play replay, pressed") said the opposite,
      // and painted the button in the pressed red while paused.
      setText(refs.play, s.paused ? "▶" : "Ⅱ");
      setAttr(refs.play, "aria-label", s.paused ? "Play replay" : "Pause replay");
      if (!scrubbing) setVal(refs.seek, String(Math.max(0, s.T)));
      // The timeline's spoken value follows the clock only while a reader is not
      // sitting on it during playback: a focused range whose valuetext changes
      // every second is read every second. Paused, scrubbing or elsewhere: live.
      const focused = typeof document !== "undefined" && document.activeElement === refs.seek;
      if (!(focused && !s.paused && !scrubbing)) setAttr(refs.seek, "aria-valuetext", clock(s.T) + " of " + clock(s.duration));
      setText(refs.time, clock(s.T)); setVal(refs.speed, String(s.speed));
      if (s.follow) setVal(refs.driver, s.follow);
      const cams = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : [];
      if (cams[G.camMode]) setVal(refs.camera, cams[G.camMode].id);
      const b = s.broadcast;
      setAttr(refs.auto, "aria-pressed", String(!!(b && b.auto && !b.locked && !b.manual)));
      setAttr(refs.lock, "aria-pressed", String(!!(b && b.locked)));
      setText(refs.director, b && b.locked ? "FOLLOW LOCKED" : b && b.manual && b.auto ? "AUTO IN " + Math.ceil(b.manualRemaining) + "s" : b && b.auto ? "TV DIRECTOR" : "MANUAL CAMERA");
      const current = desc.events.find((e) => e.t >= s.T - 5);
      setText(refs.event, current ? (current.t > s.T ? "NEXT · " : "") + "L" + current.lap + " · " + current.text : "CHEQUERED FLAG");
      const lead = typeof RealReplay !== "undefined" ? RealReplay.LEAD_S : 8;
      refs.prev.disabled = !desc.events.some((e) => e.t - lead < s.T - 1);
      refs.next.disabled = !desc.events.some((e) => e.t - lead > s.T + 1);
    }
    function stop() {
      if (root) root.remove(); root = null; refs = {}; desc = null; scrubbing = false; tickAt = 0; pendingSeek = null;
      if (typeof document !== "undefined" && document.body) document.body.classList.remove("watch-controls-on");
    }
    function tick(dt) { tickAt -= dt; if (tickAt <= 0) { tickAt = 0.1; paint(); } }
    return { start, stop, paint, tick };
  }
  return { create, clock };
})();
Object.freeze(WatchTransport);
