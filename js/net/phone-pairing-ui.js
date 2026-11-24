/* PhonePairingUI — desktop side of the paired phone wheel. LAZY_NET.
   The eager Settings button owns only bundle loading and cancellation. */
const PhonePairingUI = (function () {
  "use strict";

  function dash(G) {
    const { MAX_RPM, IDLE_RPM } = PhysicsConsts;
    const p = G.player;
    const D = PhonePad.DASH;
    const context = typeof Input !== "undefined" && Input.remoteControlContext?.();
    const surface = context === "camera" ? "camera" : context === "menu" || G.paused ||
      (G.state !== "race" && G.state !== "count") ? "menu" : "drive";
    // NO PLAYER IS A DASH TOO (menus before a first race): the phone shows its MENU PAD only on a
    // dash packet (!inRace || paused), and a null sends nothing, so it stayed on the wheel.
    if (!p) return { gear: 0, kmh: 0, rpm: 0, lap: 0, laps: 0, pos: 0, cars: 0, ers: 0,
      flags: G.paused ? D.paused : 0, caution: 0, lastLapMs: 0, state: G.state, surface, team: "" };
    const xOpen = (p.aeroX || 0) > 0.05;
    const controls = G.recordControls();
    const flags = (p.boostOn ? D.boost : 0) | (p.otT > 0 ? D.otActive : p.otArmed ? D.otArmed : 0) | (p.otOn ? D.otOn : 0)
      | (xOpen ? D.xOpen : p.xArmed ? D.xArmed : 0) | (p.retired ? D.retired : 0) | (G.timeTrial ? D.timeTrial : 0)
      | (G.session === "quali" ? D.quali : G.practice && !G.timeTrial ? D.practice : 0)
      | (G.paused ? D.paused : 0) | (p.rpm > MAX_RPM * 0.92 ? D.redline : 0)
      // The control modes, so the wheel offers only what the driver operates.
      | (controls.gearsManual ? 0 : D.gearsAuto) | (controls.autoThrottle ? D.throttleAuto : 0)
      | (G.raceAeroMode === "auto" ? D.aeroAuto : 0) | (G.aeroZones.length ? 0 : D.aeroNone);
    return { gear: p.gear, kmh: G.dashKph(p.speed), rpm: (p.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), lap: p.lap, laps: G.lapsTarget,
      pos: p.rank, cars: G.cars.length, ers: p.energy, flags, caution: G.cautionLevel(), lastLapMs: (p.lastLap || 0) * 1000,
      state: G.state, surface, team: PhonePad.teamHex(p.team && p.team.color),
      grip: typeof HudReadouts === "undefined" ? "" : HudReadouts.pedalGrip(p, typeof WheelState !== "undefined" && WheelState.enabled()) };
  }

  function phoneLink(url) {
    if (!url || typeof Native === "undefined" || !Native.isNative()) return url;
    return PhonePad.padUrl("", Native.shareBase()).replace(/#.*$/, "") + new URL(url).hash;
  }

  function create(G, setPaused, loading) {
    const $ = G.$, btn = $("pm-phonepad"), box = $("pm-phonepad-box"), status = $("pm-phonepad-status");
    let /** @type {ReturnType<typeof PhonePad.host> | null} */ phonePad = null;
    let recoveryOwner = null;
    const recoveryNote = document.createElement("p"), newPhoneCode = document.createElement("button");
    newPhoneCode.type = "button"; newPhoneCode.className = "sel-chip"; newPhoneCode.textContent = "MAKE NEW CODE";
    recoveryNote.setAttribute("role", "status"); newPhoneCode.hidden = true;
    $("pm-phonepad-box").append(recoveryNote, newPhoneCode);
    newPhoneCode.onclick = () => {
      if (phonePad || loading()) $("pm-phonepad").onclick();
      else if (recoveryOwner) recoveryOwner.cancel();
      recoveryOwner = null;
      newPhoneCode.hidden = true; recoveryNote.textContent = "";
      $("pm-phonepad").onclick();
    };
    const cameraOwner = {};
    const helmetCam = CamModes.CAM_MODES.findIndex(c => c.id === "helmet");
    let ownsCamera = false;

    function restoreCamera() {
      if (!ownsCamera) return;
      ownsCamera = false;
      G.setCamMode(helmetCam, { owner: cameraOwner, release: true, persist: false });
    }
    function cancel() {
      if (phonePad) phonePad.cancel();
      phonePad = null;
      restoreCamera();
    }
    function start() {
      $("pm-phonepad-url").textContent = phoneLink(PhonePad.padUrl("")).replace(/#.*$/, "");
      phonePad = PhonePad.host({
        hud: () => dash(G),
        say: (t) => { status.textContent = t; },
        qr: (url, code) => {
          url = phoneLink(url);
          LobbyCodes.paintQr($("pm-phonepad-qr-wrap"), $("pm-phonepad-qr"), url);
          $("pm-phonepad-code").textContent = code || "";
          $("pm-phonepad-code").setAttribute("data-private", String(!!code && code.length > 6));
          $("pm-phonepad-pair").hidden = !code;
          // Scroll the code (below the button) into view: a short screen said "scan the code" over nothing.
          if (code && box.scrollIntoView) box.scrollIntoView({ block: "nearest" });
        },
        linked: () => {
          btn.textContent = "UNPAIR PHONE"; G.announce("PHONE CONNECTED — TILT TO STEER", 3, "info");
          if (helmetCam >= 0 && !ownsCamera) {
            ownsCamera = true;
            G.setCamMode(helmetCam, { owner: cameraOwner, persist: false });
          }
        },
        // ALLOW / REJECT covers the pedals: pause a running solo race under it (a net race never pauses).
        asking: () => { if ((G.state === "race" || G.state === "count") && !G.paused && !G.netPlay.active()) setPaused(true, "phone-confirm"); },
        // The phone's wire died: PhonePad hosts the same code again and the phone re-dials it (lost() follows only if it gives up).
        relinking: () => { G.announce("PHONE LINK LOST — RECONNECTING", 3, "warn"); },
        recovery: (r) => {
          newPhoneCode.hidden = !["waiting", "connecting", "failed", "lost"].includes(r.phase);
          recoveryNote.textContent = r.reconnecting && r.publicRelay
            ? r.deadlineAt === null ? "Reconnecting — opening the same-code window…" :
              "Reconnecting — same code available for up to " + Math.max(0, Math.ceil((r.deadlineAt - Date.now()) / 1000)) + " seconds. Or choose MAKE NEW CODE."
            : "";
        },
        // A first pairing that failed (expired, no relay): the status stays, the button starts over.
        failed: () => { btn.textContent = "STEER THIS GAME WITH A PHONE"; phonePad = null; },
        lost: () => {
          btn.textContent = "STEER THIS GAME WITH A PHONE"; phonePad = null; G.announce("PHONE DISCONNECTED", 3, "warn");
          restoreCamera();
        },
      });
      recoveryOwner = phonePad;
    }
    return { start, cancel, active: () => !!phonePad };
  }
  return { create, dash };
})();
Object.freeze(PhonePairingUI);
