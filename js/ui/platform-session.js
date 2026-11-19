const PlatformSession = (function () {
"use strict";
function create(G, deps) {
const { $, els, store } = G;
const { MAX_RPM, IDLE_RPM } = PhysicsConsts;
const { canvas, raceWakeLock, disarmProbeOnLeave, cancelMirrorPrep, setPaused, ensureNet, settingsBack, closeSettings, showTouchControls, refreshGearsBtn } = deps;
function paintBuild() {
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
  document.addEventListener("fullscreenchange", syncFullscreen);
  document.addEventListener("webkitfullscreenchange", syncFullscreen);
  paintFullscreenRow();
}
(function iosInstallNudge() {
  const el = $("ios-install");
  if (!el) return;
  if (typeof Native !== "undefined" && Native.isNative()) { el.hidden = true; return; }
  const nav = navigator;
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const standalone = !!(nav.standalone || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches));
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
  const dismiss = () => {
    el.hidden = true;
    if (!standalone) store.set("iosInstallSeen", true);
    if (wakeBroken) store.set("iosWakeNoteSeen", true);
  };
  el.hidden = false;
  const x = $("ios-install-x");
  if (x) x.onclick = dismiss;
  const ov = $("overlay");
  if (ov) ov.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".bigbtn")) dismiss(); });
  setTimeout(dismiss, 15000);
})();
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

(function offlineReadiness() {
  if (typeof Native !== "undefined" && Native.isNative()) return;
  const anchor = $("pm-install");
  if (!anchor || !anchor.parentNode || !navigator.serviceWorker || typeof MessageChannel === "undefined") return;
  const note = document.createElement("p"), button = document.createElement("button");
  note.className = "adv-help"; note.setAttribute("role", "status");
  note.textContent = "Offline availability has not been checked.";
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
  navigator.serviceWorker.addEventListener("controllerchange", () => refresh());
  refresh();
})();
}

function wirePhone() {
function phoneLink(url) {
  if (!url || typeof Native === "undefined" || !Native.isNative()) return url;
  return PhonePad.padUrl("", Native.shareBase()).replace(/#.*$/, "") + new URL(url).hash;
}
let phonePad = null;
let phonePadLoading = false, phonePadGeneration = 0;
let recoveryOwner = null;
const recoveryNote = document.createElement("p"), newPhoneCode = document.createElement("button");
newPhoneCode.type = "button"; newPhoneCode.className = "sel-chip"; newPhoneCode.textContent = "MAKE NEW CODE";
recoveryNote.setAttribute("role", "status"); newPhoneCode.hidden = true;
$("pm-phonepad-box").append(recoveryNote, newPhoneCode);
newPhoneCode.onclick = () => {
  if (phonePad || phonePadLoading) $("pm-phonepad").onclick();
  else if (recoveryOwner) recoveryOwner.cancel();
  recoveryOwner = null;
  newPhoneCode.hidden = true; recoveryNote.textContent = "";
  $("pm-phonepad").onclick();
};
let phonePadCam = -1;
const VISOR_CAM = CamModes.CAM_MODES.findIndex((c) => c.id === "visor");
function phonePadDash() {
  const p = G.player;
  const D = PhonePad.DASH;
  if (!p) return { gear: 0, kmh: 0, rpm: 0, lap: 0, laps: 0, pos: 0, cars: 0, ers: 0,
    flags: G.paused ? D.paused : 0, caution: 0, lastLapMs: 0, state: G.state, team: "" };
  const xOpen = (p.aeroX || 0) > 0.05;
  const controls = G.recordControls();
  const flags = (p.boostOn ? D.boost : 0) | (p.otT > 0 ? D.otActive : p.otArmed ? D.otArmed : 0)
    | (xOpen ? D.xOpen : p.xArmed ? D.xArmed : 0) | (p.retired ? D.retired : 0) | (G.timeTrial ? D.timeTrial : 0)
    | (G.session === "quali" ? D.quali : G.practice && !G.timeTrial ? D.practice : 0)
    | (G.paused ? D.paused : 0) | (p.rpm > MAX_RPM * 0.92 ? D.redline : 0)
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
    if (phonePadCam >= 0 && G.camMode === VISOR_CAM) G.setCamMode(phonePadCam);
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
    $("pm-phonepad-url").textContent = phoneLink(PhonePad.padUrl("")).replace(/#.*$/, "");
    phonePad = PhonePad.host({
      hud: phonePadDash,
      say: (t) => { status.textContent = t; },
      qr: (url, code) => {
        url = phoneLink(url);
        LobbyCodes.paintQr($("pm-phonepad-qr-wrap"), $("pm-phonepad-qr"), url);
        $("pm-phonepad-code").textContent = code || "";
        $("pm-phonepad-code").setAttribute("data-private", String(!!code && code.length > 6));
        $("pm-phonepad-pair").hidden = !code;
        if (code && box.scrollIntoView) box.scrollIntoView({ block: "nearest" });
      },
      linked: () => {
        btn.textContent = "UNPAIR PHONE"; G.announce("PHONE CONNECTED — TILT TO STEER", 3, "info");
        if (VISOR_CAM >= 0 && G.camMode !== VISOR_CAM) { phonePadCam = G.camMode; G.setCamMode(VISOR_CAM, { persist: false }); }
      },
      asking: () => { if ((G.state === "race" || G.state === "count") && !G.paused && !G.netPlay.active()) setPaused(true, "phone-confirm"); },
      relinking: () => { G.announce("PHONE LINK LOST — RECONNECTING", 3, "warn"); },
      recovery: (r) => {
        newPhoneCode.hidden = !["waiting", "connecting", "failed", "lost"].includes(r.phase);
        recoveryNote.textContent = r.reconnecting && r.publicRelay
          ? r.deadlineAt === null ? "Reconnecting — opening the same-code window…" :
            "Reconnecting — same code available for up to " + Math.max(0, Math.ceil((r.deadlineAt - Date.now()) / 1000)) + " seconds. Or choose MAKE NEW CODE."
          : "";
      },
      failed: () => { btn.textContent = "STEER THIS GAME WITH A PHONE"; phonePad = null; },
      lost: () => {
        btn.textContent = "STEER THIS GAME WITH A PHONE"; phonePad = null; G.announce("PHONE DISCONNECTED", 3, "warn");
        if (phonePadCam >= 0 && G.camMode === VISOR_CAM) G.setCamMode(phonePadCam);
        phonePadCam = -1;
      },
    });
    recoveryOwner = phonePad;
  });
};
}

function wireLifecycle() {
const updates = UpdateCheck.create({
  inRace: () => UiLayers.inRace(),
  state: () => G.state,
  cover: () => $("loading"),
  chip: () => $("update-chip"),
  persist: () => { Ghost.flush(); if (typeof InputGhost !== "undefined") InputGhost.flush(); return store.mirrorFlush && store.mirrorFlush(); },
});
const chip = $("update-chip");
if (chip) chip.addEventListener("click", () => { updates.apply(); });
if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("controllerchange", () => updates.newerActive());
document.addEventListener("visibilitychange", () => updates.onVisible());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) disarmProbeOnLeave();
  if (document.hidden && cancelMirrorPrep) cancelMirrorPrep();
  if (document.hidden && !G.paused && (G.state === "race" || G.state === "count")) setPaused(true, "hidden-tab");
  if (document.hidden) PerfGov.sentinelArm(false);
  else if (G.state === "race" || G.state === "count") PerfGov.sentinelResume();
  if (!document.hidden && raceWakeLock.wanted()) raceWakeLock.hold();
  clearInterval(_netHiddenPump); _netHiddenPump = 0;
  if (document.hidden && G.netPlay.active()) _netHiddenPump = setInterval(() => G.netPlay.tick(performance.now()), 500);
});
let _netHiddenPump = 0;
window.addEventListener("pagehide", () => {
  clearInterval(_netHiddenPump); _netHiddenPump = 0;
  PerfGov.sentinelArm(false); disarmProbeOnLeave(); if (cancelMirrorPrep) cancelMirrorPrep();
});
window.addEventListener("blur", () => {
  setTimeout(() => {
    if (document.hidden || document.hasFocus() || navigator.webdriver || G.netPlay.active() || G.paused) return;
    if (G.state === "race" || G.state === "count") setPaused(true, "blur");
  }, 250);
});
if (GameAudio.onInterrupted) GameAudio.onInterrupted(() => {
  if ((G.state === "race" || G.state === "count") && !G.netPlay.active() && !G.paused) setPaused(true, "audio-interrupted");
});

}

function initInput({ steerMode, throttleLatchOpt }) {
UiLayers.setRaceGetter(() => G.state === "race" || G.state === "count");
Input.init(canvas, { onPause: () => {
  if (typeof UiLayers !== "undefined") {
    const loadingTop = UiLayers.top();
    if (loadingTop && loadingTop.id === "loading") return;
  }
  if (G.paused && els.howtoplay && !els.howtoplay.hidden) { els.howtoplay.hidden = true; return; }
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
onPadLost: () => {
  if (!UiLayers.inRace() || G.paused) return;
  setPaused(true, "pad-lost");
  G.announce("CONTROLLER DISCONNECTED — RECONNECT OR PRESS RESUME", 4, "coach");
  Log.info("input", "paused: last gamepad disconnected");
} });
function syncPointerKind() {
  const touch = Input.touchControlsNeeded();
  document.body.classList.toggle("desktop", !touch);
  $("mb-phonepad").hidden = !touch;
  $("pm-phonepad-go").hidden = !touch;
  if (G.state === "race" || G.state === "count") showTouchControls(true);
  refreshGearsBtn();
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
  if (G.soundOn) { GameAudio.init(); GameAudio.startMusic(-1); }
  G.radio.unlock();
}
let gestured = false;
const GESTURE_EVTS = ["pointerdown", "pointerup", "touchend", "keydown", "click"];
function isActivation(e) {
  if (e.type === "keydown") return e.key !== "Escape";
  if (e.type === "pointerdown") return e.pointerType === "mouse";
  if (e.type === "pointerup") return e.pointerType !== "mouse";
  return true;
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
