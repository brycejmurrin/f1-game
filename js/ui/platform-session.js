/* Apex 26 — PlatformSession: platform UI, phone controller and session interruptions.
   create(G, deps) exposes staged wiring so entry boot order stays explicit. */
const PlatformSession = (function () {
"use strict";
// The one activation table.
function isActivation({ type: t, key: k, pointerType: p }) {
  return t === "keydown" ? k !== "Escape" : t === "pointerdown" ? p === "mouse" : t === "pointerup" ? p !== "mouse" : t === "touchend" || t === "click";
}
function create(G, deps) {
const { $, els, store } = G;
const { canvas, raceWakeLock, disarmProbeOnLeave, cancelMirrorPrep, setPaused, ensureNet, settingsBack, closeSettings, showTouchControls, refreshGearsBtn, paintSteer, openSettingsPage } = deps;
function paintBuild() {
// BUILD NUMBER in the pause menu. index.html is the one file with no ?v= of its
// own, so a stale shell (or a service worker serving a cached generation) can run
// old JS with nothing on screen to say so — during one camera-bug hunt a fix was
// deployed three times while the reporter kept testing the previous build, and
// neither side could tell. Read from the stylesheet's ?v=, which is the build
// whose assets ACTUALLY loaded, rather than a constant compiled into the markup:
// a string in the HTML would go stale with the HTML and confirm the wrong thing.
{
  const tag = $("pm-build");
  if (tag) {
    const meta = document.querySelector('meta[name="apex-build"]');
    const build = meta && meta.content;
    tag.textContent = build ? `build ${build}` : "build unknown";
  }
}

}

function wireInstall() {
/* FULLSCREEN, AND THE REASON IT EXISTS HERE IS ESCAPE.
   In fullscreen the browser spends the Escape key on leaving fullscreen, so a
   pause handler never sees it. navigator.keyboard.lock(['Escape']) is the
   sanctioned way to claim the key back — and it is only callable while the
   document is in ELEMENT fullscreen, which this game had no way to enter at
   all, so the fix had nothing to attach to until now.
   Chromium honours the lock (the escape hatch is a 2-second Escape hold, so no
   page can trap anyone); Firefox and Safari ship no Keyboard Lock, and there
   Escape keeps leaving fullscreen — which is the other half of why PAUSE
   became a rebindable key rather than staying welded to P.
   iPhone Safari has no element fullscreen at all, so the row hides itself
   rather than offering a control that cannot work. */
const fsOk = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
function paintFullscreenRow() {
  const row = $("pm-fullscreen");
  if (!row) return;
  row.hidden = !fsOk();
  const note = $("pm-fullscreen-note");
  if (note) note.hidden = !fsOk();
  SettingRow.paint(row, fsElement() ? "on" : "off");
}
function syncFullscreen() {
  if (fsElement()) {
    Input.lockEscape(); if (G.state === "race" || G.state === "count") Input.lockLandscape();
  } else {
    Input.unlockEscape(); Input.unlockLandscape();
  }
  paintFullscreenRow();
}
if ($("pm-fullscreen")) {
  SettingRow.wire("pm-fullscreen", { values: SettingRow.labels(["off", "on"]),
    read: () => (fsElement() ? "on" : "off"),
    write: (v) => {
      if (v === "on") {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        try { if (req) Promise.resolve(req.call(el)).then(syncFullscreen).catch(paintFullscreenRow); }
        catch (_) { paintFullscreenRow(); }
      } else if (fsElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        try { if (exit) Promise.resolve(exit.call(document)).then(syncFullscreen).catch(paintFullscreenRow); }
        catch (_) { paintFullscreenRow(); }
      }
    } });
  // The player can leave fullscreen without us (Esc, F11, the OS), so the row
  // follows the DOCUMENT rather than remembering what it last asked for.
  document.addEventListener("fullscreenchange", syncFullscreen);
  document.addEventListener("webkitfullscreenchange", syncFullscreen);
  paintFullscreenRow();
}
/* ADD TO HOME SCREEN IS THE ONLY FULLSCREEN AN iPHONE HAS (element fullscreen is
   iPad-only), so this replaces the row above on iOS: no toolbars to collapse
   mid-corner. Since iOS 26 any Home Screen site opens as a web app. Shown once. */
(function iosInstallNudge() {
  const el = $("ios-install");
  if (!el) return;
  if (typeof Native !== "undefined" && Native.isNative()) { el.hidden = true; return; }
  const nav = navigator;
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);   // iPadOS reports as a Mac
  const standalone = !!(nav.standalone || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches));
  // No wake lock in Home Screen apps on iOS 16.4-18.3 (WebKit 254545).
  const v = /OS (\d+)_(\d+)|Version\/(\d+)\.(\d+)/.exec(nav.userAgent || "") || [];
  const ver = (v[1] || v[3]) * 100 + +(v[2] || v[4]);
  const wakeBroken = ver >= 1604 && ver < 1804;
  const NOTE = "On iOS 16.4\u201318.3 the screen may dim mid-race in the Home Screen app. Update to iOS 18.4 or later to fix it.";
  const msg = $("ios-install-msg");
  if (!ios) return;
  if (standalone) {
    if (!wakeBroken || !msg || store.get("iosWakeNoteSeen", false)) return;
    msg.textContent = NOTE;
  } else if (store.get("iosInstallSeen", false)) return;
  else if (wakeBroken && msg) msg.append(" " + NOTE);
  // The title pads itself by the banner's height (css/touch-controls.css, clean-room fix 50).
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const measure = () => { if (root && !el.hidden) root.style.setProperty("--ios-install-h", el.offsetHeight + "px"); };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
  const dismiss = () => {
    if (ro) ro.disconnect();
    if (root) root.style.removeProperty("--ios-install-h");
    el.hidden = true;
    if (!standalone) store.set("iosInstallSeen", true);
    if (wakeBroken) store.set("iosWakeNoteSeen", true);
  };
  el.hidden = false;
  measure();
  if (ro) ro.observe(el);
  const x = $("ios-install-x");
  if (x) x.onclick = dismiss;
  // It is a suggestion, not a gate: the first title-menu choice dismisses it,
  // or it sat over the next screen's BACK/DONE and the HUD's speed readout.
  const ov = $("overlay");
  if (ov) ov.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".bigbtn")) dismiss(); });
  setTimeout(dismiss, 15000);
})();
// INSTALL APP where the browser offers it (Android / desktop Chromium): the
// iOS nudge above was the only install door, so those players met at most a
// mini-infobar. https://web.dev/articles/customize-install — preventDefault,
// stash the event, call prompt() from a tap (once: the event is single-use),
// and appinstalled covers every other route in. A suggestion, like the nudge.
// The chip is a 20 s toast on one launch; the stashed event stays a door for
// the whole session through Settings › DISPLAY's INSTALL APP row (#pm-install),
// shown whenever an event is held (R3-PHONE-11). Chromium fires a fresh event
// after a dismissed prompt, so the row comes back with it.
(function installChip() {
  const chip = $("install-chip"), row = $("pm-install");
  if (!chip && !row) return;
  if (typeof Native !== "undefined" && Native.isNative()) {
    if (chip) chip.hidden = true;
    if (row) row.hidden = true;
    return;
  }
  let deferred = null;
  const hide = () => { if (chip) chip.hidden = true; };
  const paintRow = () => { if (row) row.hidden = !deferred; };
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e; paintRow();
    if (!chip || store.get("installChipSeen", false) || UiLayers.inRace()) return;
    chip.hidden = false;
    // SEEN ONCE SHOWN, like the iOS nudge: set only on a tap or an install, it
    // came back for 20 s on every launch until somebody tapped it. The stashed
    // event still serves a tap during this showing.
    store.set("installChipSeen", true);
    setTimeout(hide, 20000);
  });
  const install = async () => {
    hide(); store.set("installChipSeen", true);
    const e = deferred; deferred = null; paintRow();
    if (!e) return;
    try { await e.prompt(); const c = await e.userChoice; Log.info("game", "install prompt " + ((c && c.outcome) || "?")); }
    catch (err) { Log.warn("game", "install prompt failed: " + ((err && err.message) || err)); }
  };
  if (chip) chip.addEventListener("click", install);
  if (row) row.addEventListener("click", install);
  window.addEventListener("appinstalled", () => { hide(); deferred = null; paintRow(); store.set("installChipSeen", true); });
  const ov = $("overlay");
  if (ov) ov.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".bigbtn")) hide(); });
})();

// A settled optional pool can still have misses: give installed web players a
// concrete offline status and an explicit retry beside the install door.
(function offlineReadiness() {
  if (typeof Native !== "undefined" && Native.isNative()) return;
  const anchor = $("pm-install");
  if (!anchor || !anchor.parentNode || !navigator.serviceWorker || typeof MessageChannel === "undefined") return;
  const note = document.createElement("p"), button = document.createElement("button");
  note.className = "adv-help"; note.setAttribute("role", "status");
  note.textContent = "Checking offline availability…";
  button.type = "button"; button.textContent = "CHECK OFFLINE AVAILABILITY";
  anchor.parentNode.insertBefore(note, anchor.nextSibling);
  anchor.parentNode.insertBefore(button, note.nextSibling);
  let busy = false, retry = false, polls = 0;
  async function refresh(download = false) {
    if (busy) return;
    const controller = navigator.serviceWorker.controller;
    if (!controller) { note.textContent = "Offline availability is unknown until this page is controlled by its installer."; return; }
    busy = true; button.disabled = true;
    try {
      const result = await new Promise((resolve) => {
        const channel = new MessageChannel(); let ended = false;
        const finish = (value) => {
          if (ended) return;
          ended = true; clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(value);
        };
        const timer = setTimeout(() => finish(null), 5000);
        channel.port1.onmessage = (event) => finish(event.data);
        try { controller.postMessage({ type: download ? "apex-offline-retry" : "apex-offline-status" }, [channel.port2]); }
        catch (_) { finish(null); }
      });
      if (navigator.serviceWorker.controller !== controller || !result || result.type !== "apex-offline-status" || !result.known) {
        retry = false; note.textContent = "Offline availability is unknown. Try checking again.";
      } else {
        retry = !!(result.coreReady && result.optionalMissing > 0);
        note.textContent = !result.coreReady ? "Core offline files are incomplete. Reconnect and reload to install them."
          : result.optionalMissing > 0 ? "Core game ready offline. " + result.optionalMissing + " of " + result.optionalTotal + " optional files remain unavailable." + (result.retrying ? " Downloading…" : "")
          : "Core game and install downloads ready offline. Optional content used later may still need a connection.";
        if (result.retrying && polls++ < 12) setTimeout(() => refresh(), 5000);
        else polls = 0;
      }
    } finally {
      busy = false; button.disabled = false;
      button.textContent = retry ? "RETRY OPTIONAL DOWNLOADS" : "CHECK OFFLINE AVAILABILITY";
    }
  }
  button.addEventListener("click", () => { polls = 0; refresh(retry); });
  // The status costs one cache lookup per precached file: ask when the note is on screen, not at boot.
  if (typeof IntersectionObserver !== "function") {
    navigator.serviceWorker.addEventListener("controllerchange", () => refresh());
    refresh();
    return;
  }
  let shown = false, stale = true;
  new IntersectionObserver((rows) => {
    shown = rows[rows.length - 1].isIntersecting;
    if (shown && stale) { stale = false; refresh(); }
  }).observe(note);
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (shown) refresh(); else stale = true; });
})();
}

function paintTiltCalibration() {
  const phoneTilt = Input.phoneTiltAvailable();
  const calib = $("pm-calib");
  document.body.toggleAttribute("data-phone-tilt", phoneTilt);
  calib.disabled = !phoneTilt && (!Input.touchDrivingControls() || G.getSteerMode() !== "tilt");
  if (calib.disabled) clearTimeout(calib._t);
}

function wirePhone() {
  const button = $("pm-phonepad"), box = $("pm-phonepad-box"), status = $("pm-phonepad-status");
  const calib = $("pm-calib");
  calib.onclick = () => {
    // Give the player time to take their thumb off the glass and settle.
    clearTimeout(calib._t);
    calib._t = setTimeout(() => {
      const phoneTilt = Input.phoneTiltAvailable();
      if (document.hidden || (!G.paused && !(G.state === "menu" && phoneTilt))) return;
      if (phoneTilt && !Input.remoteActive()) {
        // The phone can stay paired while the touch host's live gyro takes over.
        if (!G.paused || !Input.touchDrivingControls() || G.getSteerMode() !== "tilt" || !Input.tiltActive()) return;
      }
      Input.calibrate();
      if (G.paused) setPaused(false, "recalibrate");
    }, 300);
  };
  let panel = null, loading = false, generation = 0;
  const active = () => loading || !!panel?.active();
  button.onclick = () => {
    const request = ++generation;
    if (active()) {
      loading = false;
      panel?.cancel();
      box.hidden = true; button.textContent = "STEER THIS GAME WITH A PHONE";
      return;
    }
    box.hidden = false; button.textContent = "STOP PAIRING"; status.textContent = "Loading…";
    loading = true;
    ensureNet().then((ok) => {
      if (request !== generation) return;
      loading = false;
      if (!ok) {
        button.textContent = "STEER THIS GAME WITH A PHONE";
        status.textContent = "Could not load the pairing stack — check the connection.";
        return;
      }
      (panel ||= PhonePairingUI.create(G, setPaused, () => loading)).start();
    });
  };
  if (typeof location !== "undefined" && new URLSearchParams(location.search).get("settings") === "appearance") {
    const url = new URL(location.href);
    url.searchParams.delete("settings");
    history.replaceState(history.state, "", url.href);
    queueMicrotask(() => openSettingsPage("appearance"));
  }
  $("mb-steerphone").onclick = () => { openSettingsPage("controls"); if (!active()) button.onclick(); };
}

function wireLifecycle() {
// UPDATE READY: re-read version.json when the app comes back (≤ 1 per 10 min)
// and when a newer worker takes control; the chip shows in the menus only and
// reloads once the store and ghosts are flushed.
const updates = UpdateCheck.create({
  inRace: () => UiLayers.inRace(),
  state: () => G.state,          // "results" (podium, cooldown lap) is not a menu (#5070)
  cover: () => $("loading"),     // the race-entry cover: hide before the lights, not 2 s into them
  chip: () => $("update-chip"),
  persist: () => { Ghost.flush(); if (typeof InputGhost !== "undefined") InputGhost.flush(); return store.mirrorFlush && store.mirrorFlush(); },
});
const chip = $("update-chip");
if (chip) chip.addEventListener("click", () => { updates.apply(); });
if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("controllerchange", () => updates.newerActive());
UpdateCheck.listen(updates, window, document);   // visibilitychange, pageshow (bfcache), focus (#6633 L2)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) disarmProbeOnLeave();
  if (document.hidden && cancelMirrorPrep) cancelMirrorPrep();   // rAF stops; optional warm must not hold entry
  // ALREADY PAUSED: a second pause re-showed the card over the lighting tuner and ended a replay scrub (#5017).
  if (document.hidden && !G.paused && (G.state === "race" || G.state === "count")) setPaused(true, "hidden-tab");
  // Sentinel: a hidden tab that never comes back was killed in the BACKGROUND —
  // normal iOS housekeeping, not our crash. Disarm while hidden, re-arm on
  // return to a live session.
  if (document.hidden) PerfGov.sentinelArm(false);
  else if (G.state === "race" || G.state === "count") PerfGov.sentinelResume();
  // The platform drops a wake lock on every hide: re-request it here.
  if (!document.hidden && raceWakeLock.wanted()) raceWakeLock.hold();
  // VS FRIEND: rAF stops when hidden (the rival timed out at 6 s); hidden timers still fire ~1 Hz, so ping from one.
  // https://developer.chrome.com/blog/timer-throttling-in-chrome-88
  clearInterval(_netHiddenPump); _netHiddenPump = 0;
  if (document.hidden && G.netPlay.active()) _netHiddenPump = setInterval(() => G.netPlay.tick(performance.now()), 500);
});
let _netHiddenPump = 0;
window.addEventListener("pagehide", () => {
  // A bfcache hide can leave the VS FRIEND hidden-tab pump armed; clear it with the rest.
  clearInterval(_netHiddenPump); _netHiddenPump = 0;
  PerfGov.sentinelArm(false); disarmProbeOnLeave(); if (cancelMirrorPrep) cancelMirrorPrep();
});
// LEAVE THE RACE? (#5945): a reload loses the race. Not in TT, menus or automation (a reload would hang).
window.addEventListener("beforeunload", (e) => {
  if (navigator.webdriver || G.timeTrial || !(G.state === "race" || G.state === "count")) return;
  e.preventDefault(); e.returnValue = "";
});
// LOSING FOCUS WHILE VISIBLE pauses too (visibilitychange misses an Alt-Tab): settled 250 ms, not in a friend race or automation.
window.addEventListener("blur", () => {
  setTimeout(() => {
    if (document.hidden || document.hasFocus() || navigator.webdriver || G.netPlay.active() || G.paused) return;
    if (G.state === "race" || G.state === "count") setPaused(true, "blur");
  }, 250);
});
// …and the platform taking the AUDIO (an iOS call answered from the compact
// banner keeps the page visible and focused): the race stops with the sound.
if (GameAudio.onInterrupted) GameAudio.onInterrupted(() => {
  if ((G.state === "race" || G.state === "count") && !G.netPlay.active() && !G.paused) setPaused(true, "audio-interrupted");
});

}

function initInput({ steerMode, throttleLatchOpt }) {
// `state` is closure-local, and js/ui/layers.js is what decides whether
// Escape means PAUSE or BACK — hand it the answer rather than have it guess one
// from the DOM. Same pair setPaused() gates on.
UiLayers.setRaceGetter(() => G.state === "race" || G.state === "count");
// Pause key: when the settings sub-menu is open it presses the same BACK
// path (pop a page, then close); otherwise it toggles pause as usual.
Input.init(canvas, { onPause: () => {
  // Pre-race #loading: Escape is refused via data-esc="none" once the plate is
  // a UiLayers entry (anyOpen() also keeps Escape from pausing). KeyP / pad
  // Start still land here and must not open pause over the card — that left a
  // stuck #pausemenu after the plate cleared.
  const top = typeof UiLayers !== "undefined" ? UiLayers.top() : null;
  if (top?.id === "loading") return;
  // P / gamepad Start cancels an arrangement before touching race state.
  if (top?.id === "screen-arranger") { document.getElementById("screen-arranger-cancel")?.click(); return; }
  if (top?.id === "dock-edit-bar") { document.getElementById("dock-edit-cancel")?.click(); return; }
  // Innermost sheet first: HOW TO PLAY lays OVER the settings menu, so a pause
  // press there has to close the help sheet, not the menu underneath it (which
  // would leave the help sheet floating over the race with no way back). Reached
  // via the pause BUTTON / gamepad Start — a keyboard Esc never gets here while a
  // menu sheet is up (onKey returns early on menuOverlayOpen(), js/input/input.js).
  if (G.paused && els.howtoplay && !els.howtoplay.hidden) { els.howtoplay.hidden = true; return; }
  // A TOOL OPENED FROM PAUSE (the garage arrival tuner, the photo studio, the
  // Spotify panel) hides the pause and settings sheets and puts up its own
  // layer. Unpausing under it left that layer over a running race — driving
  // input gated behind it, the car coasting, #garrival's body.lt-open hiding
  // the pause button — and its close door then reopened SETTINGS over a race
  // that was not paused. Press the layer's own Escape door instead, exactly as
  // Escape does (js/ui/modal.js), so the tool closes back to the pause menu.
  // ONLY those three: the lighting and camera tuners, the flyby and photo mode
  // are closed by setPaused(false) itself, so there the key resumes as before.
  if (G.paused && top && (top.id === "garrival" || top.id === "photo-studio" || top.id === "spotifypanel")) {
    const door = top.dataset && top.dataset.escClose ? document.getElementById(top.dataset.escClose) : null;
    if (door) { door.click(); return; }
  }
  if (G.paused && els.pmsettings && !els.pmsettings.hidden) {
    if (settingsBack()) closeSettings();
    return;
  }
  setPaused(!G.paused, "key");
},
/* A CONTROLLER LEAVING MID-RACE PAUSES THE RACE. Input already zeroes every
   latch when the last pad goes (so a stale axis snapshot cannot leave the
   throttle pinned), but the sim kept running — a flat battery at 300 km/h
   meant watching the car coast into a wall with nothing to press. Pausing is
   the convention for the same reason console certification tests it.
   Only while actually racing: a pad unplugged at the title screen is not an
   interruption, and pausing there would open the pause menu over the menus. */
onPadLost: () => {
  if (!UiLayers.inRace() || G.paused) return;
  setPaused(true, "pad-lost");
  G.announce("CONTROLLER DISCONNECTED — RECONNECT OR PRESS RESUME", 4, "coach");
  Log.info("input", "paused: last gamepad disconnected");
}, onPhoneTiltChange: () => {
  paintTiltCalibration();
  if (typeof SettingDeps !== "undefined") SettingDeps.refresh();
}, onControlDeviceChange: syncControlDevice });
function syncControlDevice() {
  const focused = document.activeElement;
  const nav = window.MenuNav;
  const layer = nav?.activeLayer();
  const previous = focused && layer?.contains(focused) ? nav.items(layer) : [];
  const position = previous.indexOf(focused);
  const cooldown = G.state === "results" && RaceCeremony.get()?.playerDrives();
  if (G.state === "race" || G.state === "count" || cooldown) showTouchControls(true, !!cooldown);
  paintSteer();
  paintTiltCalibration();
  refreshGearsBtn();
  if (typeof SettingDeps !== "undefined") SettingDeps.refresh();
  if (position >= 0 && focused.disabled && nav.activeLayer() === layer) {
    const available = new Set(nav.items(layer));
    const next = previous.slice(position + 1).find((el) => available.has(el)) ||
      previous.slice(0, position).reverse().find((el) => available.has(el));
    next?.focus();
  }
}
/* body.desktop IS A LIVE ANSWER, NOT A BOOT-TIME ONE: `(pointer: coarse)` flips
   whenever an iPad is docked to or undocked from a keyboard, and
   showTouchControls() reads the LIVE query. A stale body.desktop leaves GAS/BRAKE/
   BOOST shown but unpressable — their tap size and `pointer-events: auto` are
   `body:not(.desktop)` rules (css/overlays.css) — with #pm-steer and #pm-calib
   hidden (css/responsive.css). Re-run everything that reads the query, in the
   order boot does. */
function syncPointerKind() {
  const touch = Input.touchControlsNeeded();
  document.body.classList.toggle("desktop", !touch);
  // The phone's own door to the wheel page: a coarse pointer is the device
  // that can BE the controller, so only it gets the buttons (title + CONTROLS).
  $("mb-phonepad").hidden = !touch;
  $("mb-steerphone").hidden = touch;
  $("pm-phonepad-go").hidden = !touch;
  syncControlDevice();
}
syncPointerKind();
Input.onPointerKindChange(syncPointerKind);
Input.setSteerMode(steerMode);
Input.setThrottleLatch(throttleLatchOpt);
}

function wireFirstGesture() {
function firstGesture() {
  GameAudio.setEnabled(G.soundOn);
  GameAudio.setMusicEnabled(G.musicEnabled);
  // Tilt permission is requested at race start (rs-go click), not here — so the
  // gyro prompt and button fallback don't appear on the title screen.
  if (G.soundOn) { GameAudio.init(); GameAudio.startMusic(-1); }
  // Unconditional, not gated on soundOn: unlock() is silent and idempotent, and
  // the alternative means a player who turns the radio on from a KEYBOARD-driven
  // pause menu never gets the priming gesture iOS wants.
  G.radio.unlock();
}
// A keyboard-only player never sends pointerdown: keydown (bar Escape, which is not
// activation-triggering — html.spec.whatwg.org/#activation-triggering-input-event) and
// click unlock audio too. One shared one-shot flag; every listener unhooks together.
// ACTIVATION, NOT FIRST CONTACT: a finger's pointerdown is not one (WebKit then refuses the priming speak()).
let gestured = false;
const GESTURE_EVTS = ["pointerdown", "pointerup", "touchend", "keydown", "click"];
function onFirstGesture(e) {
  if (gestured || !isActivation(e)) return;
  gestured = true;
  for (const t of GESTURE_EVTS) document.removeEventListener(t, onFirstGesture, true);
  firstGesture();
}
for (const t of GESTURE_EVTS) document.addEventListener(t, onFirstGesture, true);


}

return { wireFirstGesture, paintBuild, wireInstall, wirePhone, paintTiltCalibration, wireLifecycle, initInput };
}
  return { create, isActivation };
})();
Object.freeze(PlatformSession);
