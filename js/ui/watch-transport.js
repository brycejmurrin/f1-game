/* Visible controls for the real-race replay. Clock and camera ownership stay in RealReplay. */
const WatchTransport = (function () {
  "use strict";
  // A real race runs past the hour: "1:32:14", not "92:14" (Dom.fmtRaceClock).
  function clock(t) {
    const s = Math.max(0, Math.floor(t || 0));
    if (typeof Dom !== "undefined" && Dom.fmtRaceClock) return Dom.fmtRaceClock(s, 0);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  // THE PHONE BAR (UI scaling contract gap 19): below this window band the bar is ONE row —
  // play, prev, next, DRIVER, the seek with its clocks, and a ⋯ MORE chip whose popover holds
  // SPEED, CAMERA, AUTO, FOLLOW LOCK, PHOTO and the event chapters. Everywhere else the DOM is
  // the inline bar it always was. The same query css/watch-transport.css styles the row with.
  const PHONE_BAR = "(max-height: 520px) and (min-width: 600px)";
  function create(G, replay) {
    let root = null, refs = {}, desc = null, tickAt = 0, scrubbing = false;
    let pendingSeek = null, seekFrame = 0;   // the latest scrub value awaiting its frame
    let mq = null, onBand = null, ro = null;   // the phone-band watcher and the bar-height observer
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
      desc = { ...desc, events: Array.isArray(desc.events) ? desc.events : [] };
      root = node("section"); root.className = "watch-transport";
      root.setAttribute("aria-label", "Race replay controls");
      const top = node("div", "controls");
      action(top, "play", "Pause replay", "❚❚", () => { const s = replay.status(); if (s) replay.setPaused(!s.paused); });
      action(top, "prev", "Previous race event", "Ⅰ‹", () => replay.eventStep(-1));
      action(top, "next", "Next race event", "›Ⅰ", () => replay.eventStep(1));
      select(top, "speed", "SPEED", desc.speeds.map((s) => [String(s), s + "×"]), (v) => replay.setSpeed(+v));
      select(top, "driver", "FOLLOWED DRIVER", desc.drivers.map((d) => [d.code, d.code + " · " + d.name]), (v) => { if (replay.follow(v)) replay.setLocked(true); });
      // The ⋯ chip. Hidden until the phone band docks the secondary controls into its box
      // (dock() below); its `open` is the player's, the band only decides where the nodes live.
      const more = node("details", "more");
      const moreTab = node("summary", null, "⋯");
      moreTab.setAttribute("aria-label", "More replay controls: speed, camera, director, photo, event chapters");
      more.appendChild(moreTab);
      more.appendChild(node("div", "more-box"));
      more.hidden = true;
      top.appendChild(more);
      const cameras = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : [];
      select(top, "camera", "CAMERA", cameras.map((c) => [c.id, c.id === "tv" ? "TV AUTO" : c.label || c.id.toUpperCase()]), (id) => {
        if (id === "tv") { replay.setAuto(true); return; }   // WATCH owns its director; the live-race TV rig is inactive here
        const idx = cameras.findIndex((c) => c.id === id);
        if (idx >= 0 && G.setCamMode) { G.setCamMode(idx, { persist: false }); replay.setLocked(true); if (G.snapGameCam) G.snapGameCam(true); }
      });
      action(top, "auto", "AUTO: let the TV director choose the driver and camera", "AUTO", () => replay.setAuto(true));
      action(top, "lock", "FOLLOW LOCK: keep following the selected driver and camera", "FOLLOW LOCK", () => replay.setLocked(true));
      const photo = action(top, "photo", "Open photo mode", "PHOTO", () => { if (G.openWatchPhoto) G.openWatchPhoto(); });
      photo.hidden = typeof G.openWatchPhoto !== "function";
      root.appendChild(top);
      const timeline = node("div", "timeline");
      timeline.appendChild(node("span", "time"));
      const track = node("div", "track"), marks = node("div", "markers");
      marks.setAttribute("aria-hidden", "true");
      const state = replay.status(), duration = state ? state.duration : 0;
      // WATCH and HIGHLIGHTS can open before lights-out (startT < 0): the timeline must reach that footage (#2202).
      const t0 = Math.min(0, desc.startT || 0), span = duration - t0;
      // Markers are visual; named previous/next controls provide full-size targets.
      desc.events.forEach((e) => {
        const m = node("i"); m.dataset.kind = e.kind; m.title = "L" + e.lap + " · " + e.text;
        m.style.left = (span > 0 ? Math.min(100, Math.max(0, (e.t - t0) / span * 100)) : 0) + "%";
        marks.appendChild(m);
      });
      track.appendChild(marks);
      const seek = node("input", "seek"); seek.type = "range"; seek.min = String(t0); seek.max = String(duration); seek.step = "0.1";
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
      const chapters = node("details", "chapters");
      chapters.appendChild(node("summary", null, "EVENT CHAPTERS"));
      const events = desc.events.filter((e) => e && Number.isFinite(e.t));
      chapters.hidden = events.length === 0;
      function seekChapter(v) {
        if (v === "") return;
        const e = events[+v]; if (!e) return;
        // A pending drag must not overwrite this deliberate chapter jump.
        pendingSeek = null; scrubbing = false;
        replay.seekEvent(desc.events.indexOf(e));
      }
      select(chapters, "chapter", "RACE EVENT", [["", "Choose a race event"], ...events.map((e, i) =>
        [String(i), "L" + e.lap + " · " + clock(e.t) + " · " + e.text])], (v) => {
        refs["chapter-jump"].disabled = v === "" || !events[+v];
        seekChapter(v);   // retain the choice so native ArrowDown advances to the next chapter
      });
      action(chapters, "chapter-jump", "Jump to selected race event", "JUMP TO EVENT", () => seekChapter(refs.chapter.value)).disabled = true;
      root.appendChild(chapters);
      const caption = node("div", "caption");
      caption.appendChild(node("span", "name", desc.name));
      caption.appendChild(node("span", "event"));
      // REAL TEAM RADIO is caption-only (docs/DECISIONS.md D-032): the replay never fetches or
      // plays the recording; this link opens the published clip at its source in a new tab.
      const radio = node("a", "radio", "LISTEN AT SOURCE ↗");
      radio.target = "_blank"; radio.rel = "noopener noreferrer"; radio.hidden = true;
      caption.appendChild(radio); caption.appendChild(node("span", "director"));
      root.appendChild(caption); document.body.appendChild(root);
      document.body.classList.add("watch-controls-on");
      watchBand(); paint();
    }
    // ONE ROW ON A PHONE: move the secondary controls into the ⋯ popover and the timeline onto the
    // controls row; undock puts every node back where the desktop bar builds it (the unit tests walk
    // that tree). The browser engines without matchMedia (the mini-dom tests) keep the desktop DOM.
    function dock(phone) {
      if (!root || !refs.more || typeof refs.controls.insertBefore !== "function") return;
      const top = refs.controls, box = refs["more-box"], chapters = refs.chapters;
      if (phone) {
        for (const k of ["speed-field", "camera-field", "auto", "lock", "photo"]) box.appendChild(refs[k]);
        box.appendChild(chapters); chapters.open = true;   // the popover is the disclosure; the chapter row shows inside it
        top.insertBefore(refs.timeline, refs.more);
        refs.more.hidden = false;
      } else {
        refs.more.hidden = true; refs.more.open = false;
        top.insertBefore(refs["speed-field"], refs["driver-field"]);
        for (const k of ["camera-field", "auto", "lock", "photo"]) top.appendChild(refs[k]);
        root.insertBefore(refs.timeline, refs.caption);
        chapters.open = false; root.insertBefore(chapters, refs.caption);
      }
    }
    function watchBand() {
      if (typeof matchMedia === "function") {
        mq = matchMedia(PHONE_BAR);
        onBand = () => dock(mq.matches);
        if (mq.addEventListener) mq.addEventListener("change", onBand);
        dock(mq.matches);
      }
      // --wt-h: the bar's PAINTED height, so #bc-tower's cap (css/watch-transport.css) follows the
      // bar that is actually there instead of a 100/150/180/260 px guess per window band.
      const writeH = () => { if (root && root.getBoundingClientRect) document.body.style.setProperty("--wt-h", root.getBoundingClientRect().height.toFixed(1) + "px"); };
      writeH();   // the first frame already has the right tower cap; the observer keeps it right (its first callback lands a frame later)
      if (typeof ResizeObserver === "function" && root) {
        ro = new ResizeObserver(writeH);
        ro.observe(root);
      }
    }
    // WRITE ONLY ON CHANGE. paint() runs every 0.1 s; rewriting the same text,
    // value and aria-valuetext ten times a second is DOM churn, and on the
    // focused timeline it is a screen reader re-announcing the clock.
    const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
    const setAttr = (el, k, v) => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
    const setVal = (el, v) => { if (el.value !== v) el.value = v; };
    const setDisabled = (el, v) => { if (el.disabled !== v) el.disabled = v; };
    function paint() {
      if (!root) return;
      const s = replay.status(); if (!s) { stop(); return; }
      // PLAY/PAUSE is an action button whose LABEL says what it does — not a
      // toggle: aria-pressed=paused ("Play replay, pressed") said the opposite,
      // and painted the button in the pressed red while paused.
      setText(refs.play, s.paused ? "▶︎" : "❚❚");
      setAttr(refs.play, "aria-label", s.paused ? "Play replay" : "Pause replay");
      if (!scrubbing) setVal(refs.seek, String(Math.round(s.T * 10) / 10));   // the input's step is 0.1: an unrounded T never equals the value it reads back   // the clock text stays clamped at 0:00 before lights-out
      // The timeline's spoken value follows the clock only while a reader is not
      // sitting on it during playback: a focused range whose valuetext changes
      // every second is read every second. Paused, scrubbing or elsewhere: live.
      const focused = typeof document !== "undefined" && document.activeElement === refs.seek;
      if (!(focused && !s.paused && !scrubbing)) setAttr(refs.seek, "aria-valuetext", clock(s.T) + " of " + clock(s.duration));
      setText(refs.time, clock(s.T)); setVal(refs.speed, String(s.speed));
      // These availability getters follow the posed cars, including after a
      // rewind. Never let a refused selection lock the previous subject.
      desc.drivers.forEach((d, i) => {
        const option = refs.driver.children[i], unavailable = d.available === false;
        if (option.disabled !== unavailable) option.disabled = unavailable;
        setText(option, d.code + " · " + d.name + (unavailable ? " · UNAVAILABLE" : ""));
      });
      if (s.follow) setVal(refs.driver, s.follow);
      const cams = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : [];
      const b = s.broadcast;
      const auto = !!(b && b.auto && !b.locked && !b.manual);
      if (cams[G.camMode]) setVal(refs.camera, auto && cams.some((c) => c.id === "tv") ? "tv" : cams[G.camMode].id);
      setAttr(refs.auto, "aria-pressed", String(auto));
      setAttr(refs.lock, "aria-pressed", String(!!(b && b.locked)));
      setText(refs.director, b && b.locked ? "FOLLOW LOCKED" : b && b.manual && b.auto ? "AUTO IN " + Math.ceil(b.manualRemaining) + "s" : b && b.auto ? "TV DIRECTOR" : "MANUAL CAMERA");
      const current = desc.events.find((e) => e.t >= s.T - 5);
      setText(refs.event, current ? (current.t > s.T ? "NEXT · " : "") + "L" + current.lap + " · " + current.text : s.finished ? "CHEQUERED FLAG" : "RACE IN PROGRESS");
      const r = s.radio, radioUrl = r && /^https:\/\//.test(r.url || "") ? r.url : "";
      if (refs.radio.hidden !== !radioUrl) refs.radio.hidden = !radioUrl;
      if (radioUrl) { setAttr(refs.radio, "href", radioUrl); setAttr(refs.radio, "aria-label", "L" + r.lap + " " + r.text.replace(" · ", " ") + ": listen at the source, opens a new tab"); }
      const lead = typeof RealReplay !== "undefined" ? RealReplay.LEAD_S : 8;
      setDisabled(refs.prev, !desc.events.some((e) => Math.max(desc.startT || 0, e.t - lead) < s.T - 1));
      setDisabled(refs.next, !desc.events.some((e) => Math.max(desc.startT || 0, e.t - lead) > s.T + 1));
    }
    function stop() {
      if (root) root.remove(); root = null; refs = {}; desc = null; scrubbing = false; tickAt = 0; pendingSeek = null;
      if (ro) { ro.disconnect(); ro = null; }
      if (mq && onBand && mq.removeEventListener) mq.removeEventListener("change", onBand);
      mq = null; onBand = null;
      if (typeof document !== "undefined" && document.body) {
        document.body.classList.remove("watch-controls-on");
        if (document.body.style && document.body.style.removeProperty) document.body.style.removeProperty("--wt-h");
      }
    }
    function tick(dt) { tickAt -= dt; if (tickAt <= 0) { tickAt = 0.1; paint(); } }
    return { start, stop, paint, tick };
  }
  return { create, clock };
})();
Object.freeze(WatchTransport);
