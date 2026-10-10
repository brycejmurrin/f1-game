/* Apex 26 — PlatformSession: platform UI, phone controller and session interruptions.
   create(G, deps) exposes staged wiring so entry boot order stays explicit. */
const PlatformSession = (function () {
"use strict";
function create(G, deps) {
const { $, els, store } = G;
const { MAX_RPM, IDLE_RPM } = PhysicsConsts;
const { canvas, raceWakeLock, disarmProbeOnLeave, cancelMirrorPrep, setPaused, ensureNet, settingsBack, closeSettings, showTouchControls, refreshGearsBtn } = deps;
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
/* ADD TO HOME SCREEN IS THE ONLY FULLSCREEN AN iPHONE HAS. Element fullscreen
   has never shipped on iPhone Safari (iPad only, and there the browser draws an
   overlay button you cannot remove), so the row above is hidden on iOS and this
   takes its place. Standalone also gives what a race actually needs: a viewport
   that does not move, because there are no toolbars to collapse mid-corner.
   As of iOS 26 every site added to the Home Screen opens as a web app with no
   manifest metadata required, so this is a one-tap suggestion rather than a
   setup guide. Shown once, ever. */
(function iosInstallNudge() {
  const el = $("ios-install");
  if (!el) return;
  const nav = navigator;
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);   // iPadOS reports as a Mac
  const standalone = !!(nav.standalone || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches));
  if (!ios || standalone || store.get("iosInstallSeen", false)) return;
  const dismiss = () => { el.hidden = true; store.set("iosInstallSeen", true); };
  el.hidden = false;
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
(function installChip() {
  const chip = $("install-chip");
  if (!chip) return;
  let deferred = null;
  const hide = () => { chip.hidden = true; };
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    if (store.get("installChipSeen", false) || UiLayers.inRace()) return;
    chip.hidden = false;
    // SEEN ONCE SHOWN, like the iOS nudge: set only on a tap or an install, it
    // came back for 20 s on every launch until somebody tapped it. The stashed
    // event still serves a tap during this showing.
    store.set("installChipSeen", true);
    setTimeout(hide, 20000);
  });
  chip.addEventListener("click", async () => {
    hide(); store.set("installChipSeen", true);
    const e = deferred; deferred = null;
    if (!e) return;
    try { await e.prompt(); const c = await e.userChoice; Log.info("game", "install prompt " + ((c && c.outcome) || "?")); }
    catch (err) { Log.warn("game", "install prompt failed: " + ((err && err.message) || err)); }
  });
  window.addEventListener("appinstalled", () => { hide(); deferred = null; store.set("installChipSeen", true); });
  const ov = $("overlay");
  if (ov) ov.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".bigbtn")) hide(); });
})();
}

function wirePhone() {
// PHONE AS CONTROLLER (js/input/phone-pad.js, LAZY_NET): the button loads the
// multiplayer stack the pairing rides on, then the module owns the pairing and
// feeds Input.remoteSample(). A second press cancels; a lost phone re-arms it.
let phonePad = null;
let phonePadLoading = false, phonePadGeneration = 0;
// The camera the player was in before a phone linked: a phone in the hand is the wheel, so the
// screen shows VISOR (the cockpit without its steering wheel — js/camera/vantage.js) while
// it drives, and goes back when the phone is gone, unless the player cycled away meanwhile.
let phonePadCam = -1;
const VISOR_CAM = CamModes.CAM_MODES.findIndex((c) => c.id === "visor");
// The dash the paired phone paints: the fields js/ui/hud.js reads, ~15 Hz.
function phonePadDash() {
  const p = G.player;
  const D = PhonePad.DASH;
  // NO PLAYER IS A DASH TOO — the menus before a first race. The phone swaps its wheel for the
  // MENU PAD only on a dash packet (!inRace || paused); a null here sent nothing, so a phone
  // paired from the title stayed on the wheel's placeholder LCD with no arrows/SELECT/BACK.
  if (!p) return { gear: 0, kmh: 0, rpm: 0, lap: 0, laps: 0, pos: 0, cars: 0, ers: 0,
    flags: G.paused ? D.paused : 0, caution: 0, lastLapMs: 0, state: G.state, team: "" };
  const xOpen = (p.aeroX || 0) > 0.05;
  const controls = G.recordControls();
  const flags = (p.boostOn ? D.boost : 0) | (p.otT > 0 ? D.otActive : p.otArmed ? D.otArmed : 0)
    | (xOpen ? D.xOpen : p.xArmed ? D.xArmed : 0) | (p.retired ? D.retired : 0) | (G.timeTrial ? D.timeTrial : 0)
    | (G.session === "quali" ? D.quali : G.practice && !G.timeTrial ? D.practice : 0)
    | (G.paused ? D.paused : 0) | (p.rpm > MAX_RPM * 0.92 ? D.redline : 0)
    // The control modes, so the wheel offers only what the driver operates.
    | (controls.gearsManual ? 0 : D.gearsAuto) | (controls.autoThrottle ? D.throttleAuto : 0)
    | (G.raceAeroMode === "auto" ? D.aeroAuto : 0) | (G.aeroZones.length ? 0 : D.aeroNone);
  return { gear: p.gear, kmh: G.dashKph(p.speed), rpm: (p.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), lap: p.lap, laps: G.lapsTarget,
    pos: p.rank, cars: G.cars.length, ers: p.energy, flags, caution: G.cautionLevel(), lastLapMs: (p.lastLap || 0) * 1000,
    state: G.state, team: PhonePad.teamHex(p.team && p.team.color) };
}
$("pm-phonepad").onclick = () => {
  const box = $("pm-phonepad-box"), status = $("pm-phonepad-status"), btn = $("pm-phonepad");
  if (phonePad || phonePadLoading) {
    phonePadGeneration++; phonePadLoading = false;
    if (phonePad) phonePad.cancel();
    phonePad = null; box.hidden = true; btn.textContent = "STEER THIS GAME WITH A PHONE";
    if (phonePadCam >= 0 && G.camMode === VISOR_CAM) G.setCamMode(phonePadCam);   // what lost() does: cancel() closes the link without calling it
    phonePadCam = -1;
    return;
  }
  box.hidden = false; btn.textContent = "STOP PAIRING"; status.textContent = "Loading…";
  const generation = ++phonePadGeneration;
  phonePadLoading = true;
  ensureNet().then((ok) => {
    if (generation !== phonePadGeneration) return;
    phonePadLoading = false;
    if (!ok) { btn.textContent = "STEER THIS GAME WITH A PHONE"; status.textContent = "Could not load the pairing stack — check the connection."; return; }
    $("pm-phonepad-url").textContent = PhonePad.padUrl("").replace(/#.*$/, "");
    phonePad = PhonePad.host({
      hud: phonePadDash,
      say: (t) => { status.textContent = t; },
      qr: (url, code) => {
        LobbyCodes.paintQr($("pm-phonepad-qr-wrap"), $("pm-phonepad-qr"), url);
        $("pm-phonepad-code").textContent = code || "";
        $("pm-phonepad-code").setAttribute("data-private", String(!!code && code.length > 6));
        $("pm-phonepad-pair").hidden = !code;
        // The code appears below the button: bring it into view on the sheet,
        // or a short screen shows "scan the code" with nothing to scan.
        if (code && box.scrollIntoView) box.scrollIntoView({ block: "nearest" });
      },
      linked: () => {
        btn.textContent = "UNPAIR PHONE"; G.announce("PHONE CONNECTED — TILT TO STEER", 3, "info");
        if (VISOR_CAM >= 0 && G.camMode !== VISOR_CAM) { phonePadCam = G.camMode; G.setCamMode(VISOR_CAM, { persist: false }); }   // the phone's view, not the player's saved one
      },
      lost: () => {
        btn.textContent = "STEER THIS GAME WITH A PHONE"; phonePad = null; G.announce("PHONE DISCONNECTED", 3, "warn");
        if (phonePadCam >= 0 && G.camMode === VISOR_CAM) G.setCamMode(phonePadCam);
        phonePadCam = -1;
      },
    });
  });
};
}

function wireLifecycle() {
// UPDATE READY: re-read version.json when the tab comes back (≤ 1 per 10 min)
// and when a newer worker takes control; the chip shows outside races only and
// reloads once the store and ghosts are flushed.
const updates = UpdateCheck.create({
  inRace: () => UiLayers.inRace(),
  chip: () => $("update-chip"),
  persist: () => { Ghost.flush(); if (typeof InputGhost !== "undefined") InputGhost.flush(); return store.mirrorFlush && store.mirrorFlush(); },
});
const chip = $("update-chip");
if (chip) chip.addEventListener("click", () => { updates.apply(); });
if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("controllerchange", () => updates.newerActive());
document.addEventListener("visibilitychange", () => updates.onVisible());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) disarmProbeOnLeave();
  if (document.hidden && cancelMirrorPrep) cancelMirrorPrep();   // rAF stops; optional warm must not hold entry
  if (document.hidden && (G.state === "race" || G.state === "count")) setPaused(true, "hidden-tab");
  // Sentinel: a hidden tab that never comes back was killed in the BACKGROUND —
  // normal iOS housekeeping, not our crash. Disarm while hidden, re-arm on
  // return to a live session.
  if (document.hidden) PerfGov.sentinelArm(false);
  else if (G.state === "race" || G.state === "count") PerfGov.sentinelResume();
  // The platform releases a wake lock on every hide and does not give it
  // back — re-request it here rather than a fourth listener elsewhere.
  if (!document.hidden && raceWakeLock.wanted()) raceWakeLock.hold();
  // VS FRIEND: netPlay.tick runs only from rAF, which a hidden tab stops, so the
  // rival timed us out after 6 s. Hidden timers still fire ~1 Hz (and WebRTC
  // pages are exempt from intensive throttling): keep pinging while hidden.
  // https://developer.chrome.com/blog/timer-throttling-in-chrome-88
  clearInterval(_netHiddenPump); _netHiddenPump = 0;
  if (document.hidden && G.netPlay.active()) _netHiddenPump = setInterval(() => G.netPlay.tick(performance.now()), 500);
});
let _netHiddenPump = 0;
window.addEventListener("pagehide", () => { PerfGov.sentinelArm(false); disarmProbeOnLeave(); if (cancelMirrorPrep) cancelMirrorPrep(); });
// LOSING FOCUS WHILE STILL VISIBLE pauses too. visibilitychange only fires when
// the page is HIDDEN (MDN, Page Visibility API): an Alt-Tab to a second monitor,
// or an overlay taking focus, left the car coasting off-line while the field
// lapped. Settled for 250 ms (a focus hop inside the page is not a leave), never
// in a friend race (the rival cannot be paused) and never under automation.
window.addEventListener("blur", () => {
  setTimeout(() => {
    if (document.hidden || document.hasFocus() || navigator.webdriver || G.netPlay.active()) return;
    if (G.state === "race" || G.state === "count") setPaused(true, "blur");
  }, 250);
});
// …and the platform taking the AUDIO (an iOS call answered from the compact
// banner keeps the page visible and focused): the race stops with the sound.
if (GameAudio.onInterrupted) GameAudio.onInterrupted(() => {
  if ((G.state === "race" || G.state === "count") && !G.netPlay.active()) setPaused(true, "audio-interrupted");
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
  if (typeof UiLayers !== "undefined") {
    const loadingTop = UiLayers.top();
    if (loadingTop && loadingTop.id === "loading") return;
  }
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
  if (G.paused && typeof UiLayers !== "undefined") {
    const top = UiLayers.top();
    if (top && (top.id === "garrival" || top.id === "photo-studio" || top.id === "spotifypanel")) {
      const door = top.dataset && top.dataset.escClose ? document.getElementById(top.dataset.escClose) : null;
      if (door) { door.click(); return; }
    }
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
} });
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
  $("pm-phonepad-go").hidden = !touch;
  if (G.state === "race" || G.state === "count") showTouchControls(true);
  refreshGearsBtn();   // GEARS is enabled by thumbs being free, i.e. by this
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
// ACTIVATION, NOT FIRST CONTACT: a FINGER's pointerdown is not activation-triggering
// (only a mouse's is; touch activates on pointerup / touchend). Spending the one-shot
// on it ran G.radio.unlock() outside a user activation, so WebKit refused the
// priming speak() and the tap's own click, arriving after the listeners had
// unhooked, never retried: every phone flyby, radio call and race-control line was
// then silent (WebAudio kept working — engine.js resumes on its own touchend).
let gestured = false;
const GESTURE_EVTS = ["pointerdown", "pointerup", "touchend", "keydown", "click"];
function isActivation(e) {
  if (e.type === "keydown") return e.key !== "Escape";
  if (e.type === "pointerdown") return e.pointerType === "mouse";
  if (e.type === "pointerup") return e.pointerType !== "mouse";
  return true;   // touchend, click
}
function onFirstGesture(e) {
  if (gestured || !isActivation(e)) return;
  gestured = true;
  for (const t of GESTURE_EVTS) document.removeEventListener(t, onFirstGesture, true);
  firstGesture();
}
for (const t of GESTURE_EVTS) document.addEventListener(t, onFirstGesture, true);


}

return { wireFirstGesture, paintBuild, wireInstall, wirePhone, wireLifecycle, initInput };
}
  return { create };
})();
Object.freeze(PlatformSession);
