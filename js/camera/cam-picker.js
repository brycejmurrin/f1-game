/* Apex 26 — CAM button picker: hold or right-click opens the view grid (a pad or paired phone: hold CAM, Input.consumeCameraMenu), arrow keys move it, AUTO appears only while a WATCH runs. CamModes.create owns the saved mode index. */
const CamPicker = (function () {
  "use strict";

  const touchHolds = new WeakMap();
  let live = null;   // the attached picker: a pad or paired phone opens and drives it (#6271)

  function attach(host) {
    const G = host.G, $ = host.$, CAM_MODES = host.CAM_MODES, HOLD_MS = host.HOLD_MS;
    const watchReplay = host.watchReplay, pickCam = host.pickCam, toAuto = host.toAuto, cycleCam = host.cycleCam;
    const camTrigger = $("btn-cam");
    let cancelCamHold = () => {}, screenGeneration = 0;
    const camPicker = (() => {
      let el = null, group = "drive", wheelRow = null, wheelTab = null;
      const groups = host.PICKER_GROUPS;
      const focusItems = () => [...el.querySelectorAll('button')].filter(b => !b.hidden && !(b.dataset.wheelValue && wheelRow.hidden));
      const modeGroup = () => {
        const id = CAM_MODES[G.camMode].id;
        return groups.find(g => g.modes.includes(id))?.id || "drive";
      };
      const build = () => {
        el = document.createElement("div");
        el.id = "campicker";
        el.setAttribute("role", "menu");
        el.setAttribute("aria-label", "Camera view");
        el.className = "balanced-row";
        el.hidden = true;
        for (const g of groups) {
          const tab = document.createElement("button");
          tab.textContent = g.label; tab.dataset.category = g.id;
          tab.setAttribute("role", "menuitem"); tab.tabIndex = -1;
          tab.onclick = e => { e.stopPropagation(); group = g.id; sync(); tab.focus(); };
          el.appendChild(tab);
        }
        for (const g of groups) for (const id of g.modes) {
          const i = CAM_MODES.findIndex(m => m.id === id), b = document.createElement("button");
          b.textContent = g.id === "chase" ? ({ chase: "NEAR", far: "FAR", drift: "ACTION", low: "LOW · ADVANCED" })[id] : CAM_MODES[i].label;
          b.dataset.idx = String(i); b.dataset.group = g.id; b.dataset.mode = id;
          b.setAttribute("role", "menuitemradio"); b.tabIndex = -1;
          b.onclick = e => {
            e.stopPropagation(); pickCam(g.id === "drive" && id === "chase" ? host.chaseMode() : i);
            hide(); camTrigger?.focus();
          };
          el.appendChild(b);
        }
        if (typeof CockpitOpts !== "undefined") {
          wheelTab = document.createElement("button"); wheelTab.textContent = "WHEEL";
          wheelTab.dataset.category = "wheel"; wheelTab.setAttribute("role", "menuitem"); wheelTab.tabIndex = -1;
          wheelTab.onclick = e => { e.stopPropagation(); group = "wheel"; sync(); wheelTab.focus(); };
          el.insertBefore(wheelTab, el.children[groups.length]);
          wheelRow = document.createElement("div"); wheelRow.dataset.wheel = "";
          wheelRow.setAttribute("role", "group"); wheelRow.setAttribute("aria-label", "Steering wheel");
          const title = document.createElement("span"); title.textContent = "STEERING WHEEL";
          wheelRow.appendChild(title);
          for (const id of CockpitOpts.WHEELS) {
            const button = document.createElement("button"); button.dataset.wheelValue = id;
            button.textContent = id === "none" ? "HIDDEN" : CockpitOpts.CHOICES.wheel.labels[id];
            button.setAttribute("role", "menuitemradio"); button.tabIndex = -1;
            button.onclick = e => { e.stopPropagation(); CockpitOpts.setWheel(id); sync(); };
            wheelRow.appendChild(button);
          }
          el.appendChild(wheelRow);
        }

        el.addEventListener("keydown", (e) => {
          const items = focusItems();
          const at = items.indexOf(document.activeElement);
          let next = -1;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (at + 1) % items.length;
          else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = items.length - 1;
          else if (e.key === "Escape") {
            e.preventDefault(); e.stopPropagation(); hide(); camTrigger?.focus(); return;
          }
          else return;
          e.preventDefault(); e.stopPropagation(); items[next]?.focus();
        });
        document.body.appendChild(el);
      };
      // AUTO is an item only while a WATCH runs (added here, not in build(): the
      // picker is built once, and outside a WATCH it keeps its shape exactly).
      let autoBtn = null;
      const syncAuto = (r) => {
        if (r && !autoBtn) {
          autoBtn = document.createElement("button");
          autoBtn.textContent = "AUTO · TV DIRECTOR";
          autoBtn.dataset.idx = "auto";
          autoBtn.setAttribute("role", "menuitemradio");
          autoBtn.tabIndex = -1;
          autoBtn.onclick = (e) => { e.stopPropagation(); toAuto(); hide(); camTrigger?.focus(); };
          el.insertBefore(autoBtn, el.children[0] || null);
        } else if (!r && autoBtn) { autoBtn.remove(); autoBtn = null; }
      };
      const sync = () => {
        const r = watchReplay();
        syncAuto(r);
        const auto = !!(r && r.autoOn());
        for (const b of el.children) {
          if (b.dataset.category) {
            b.setAttribute("aria-expanded", String(b.dataset.category === group));
            continue;
          }
          if (b.getAttribute("role") !== "menuitemradio") continue;
          b.hidden = b !== autoBtn && b.dataset.group !== group;
          const family = b.dataset.group === "drive" && b.dataset.mode === "chase";
          const on = b === autoBtn ? auto : !auto && (family ? groups[1].modes.includes(CAM_MODES[G.camMode].id) : +b.dataset.idx === G.camMode);
          b.classList.toggle("active", on && !b.hidden);
          b.setAttribute("aria-checked", on && !b.hidden ? "true" : "false");
        }
        if (wheelRow) {
          wheelTab.hidden = !["cockpit", "helmet"].includes(CAM_MODES[G.camMode].id);
          wheelRow.hidden = wheelTab.hidden || group !== "wheel";
          for (const b of wheelRow.querySelectorAll("button")) {
            const on = b.dataset.wheelValue === CockpitOpts.wheel();
            b.setAttribute("aria-checked", String(on)); b.classList.toggle("active", on);
          }
        }
      };
      const show = () => {
        if (document.hidden || G.paused || (G.state !== "race" && G.state !== "count") ||
            document.body.classList.contains("hud-hidden") || document.body.classList.contains("lt-open")) return false;
        if (!el) build();
        group = modeGroup(); sync();
        el.hidden = false;
        camTrigger?.setAttribute("aria-expanded", "true");
        (focusItems().find(b => b.getAttribute("aria-checked") === "true") || focusItems()[0])?.focus();
        return true;
      };
      const close = () => {
        cancelCamHold();
        if (el) el.hidden = true;
        camTrigger?.setAttribute("aria-expanded", "false");
      };
      const hide = () => { screenGeneration++; close(); };
      const visible = () => !!el && !el.hidden;
      return { show, hide, close, visible };
    })();
    (() => {
      const b = camTrigger;
      if (!b) return;
      b.setAttribute("aria-haspopup", "menu");
      b.setAttribute("aria-expanded", "false");
      let holdT = 0, holdGeneration = 0, downTs = NaN;
      let held = false;
      let released = false;
      let holdMs = HOLD_MS;
      function start(e, delay = HOLD_MS) {
        cancelCamHold();
        holdMs = delay; downTs = e && e.timeStamp;
        const generation = holdGeneration;
        holdT = setTimeout(() => { if (generation !== holdGeneration) return; holdT = 0; held = camPicker.show(); }, holdMs);
      }
      b.addEventListener("pointerdown", e => start(e));
      // The hold is judged by the press's own event times, not by which task
      // ran first: a long frame queues pointerup BEHIND the timer, so an 80 ms
      // tap opened the picker (UI hunt 2026-10-29 row 3). A press shorter than
      // HOLD_MS that the timer already "held" is undone and clicks as a tap.
      function finish(e) {
        clearTimeout(holdT);
        // Undo a speculative open without retiring a valid first tap.
        if (held && e && e.timeStamp - downTs < holdMs) camPicker.close();
        released = true;
      }
      b.addEventListener("pointerup", finish);
      b.addEventListener("pointerleave", () => clearTimeout(holdT));
      // A cancelled touch is not a long press. iOS cancels touches routinely
      // (edge swipe, notification, gesture arbitration) and a touch pointer
      // holds implicit capture, so pointerleave never fires either: the timer
      // opened the picker mid-corner and `held` then ate the next genuine tap.
      const cancelHold = cancelCamHold = () => { holdGeneration++; clearTimeout(holdT); holdT = 0; held = false; released = false; downTs = NaN; };
      // A custom touch gesture owns pointer dispatch. It borrows this same picker
      // timer so pausing or changing screens cancels it just like a default press.
      touchHolds.set(b, {
        get screenGeneration() { return screenGeneration; },
        start(e, mode, timingMs, customized) {
          let delay = HOLD_MS;
          if (mode === "hold" || mode === "long") delay = timingMs + 450;
          else if (mode === "double" || customized) delay = Math.max(HOLD_MS, timingMs + (mode === "quick" ? 1 : 0));
          start(e, delay);
        },
        finish(e) {
          if (!Number.isFinite(downTs)) return true; // the screen retired this press
          const elapsed = e.timeStamp - downTs;
          finish(e);
          if (elapsed < holdMs) return false;
          if (!held) camPicker.show(); // release may arrive before the timer runs
          held = false;
          return true;
        },
        cancel: cancelHold,
      });
      b.addEventListener("pointercancel", cancelHold);
      // Touch implicitly releases capture AFTER pointerup and BEFORE click.
      // Preserve the consumed long press through that normal release.
      b.addEventListener("lostpointercapture", () => { if (!released) cancelHold(); });
      b.addEventListener("contextmenu", (e) => { e.preventDefault(); camPicker.show(); });
      b.onclick = () => {
        if (held) { held = false; return; }
        if (camPicker.visible()) { camPicker.hide(); return; }
        cycleCam();
      };
      if (typeof InputHoldButtons !== "undefined") InputHoldButtons.hudTouchTap(b, {
        cancel: cancelHold,
        activate: e => { if (held && e.timeStamp - downTs < HOLD_MS) held = false; b.click(); },
      });
      // Tap anywhere outside the grid closes it.
      document.addEventListener("pointerdown", (e) => {
        if (camPicker.visible() && e.target !== b && !e.target.closest('#campicker, #screen-arranger[data-editing-screen="campicker"]')) camPicker.hide();
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) camPicker.hide();
      });
      if (window.addEventListener) {
        window.addEventListener("blur", camPicker.hide);
        window.addEventListener("pagehide", camPicker.hide);
      }
      // The grid belongs to its button: when the race ends (endRace / quit
      // hide #btn-cam) an open picker went on painting through the results
      // card (UI hunt 2026-10-29 row 2). css/hud.css has the CSS twin.
      if (typeof MutationObserver === "function") {
        new MutationObserver(() => { if (b.hidden) camPicker.hide(); }).observe(b, { attributes: true, attributeFilter: ["hidden"] });
      }
    })();
    live = camPicker;
    return { hide: camPicker.hide, show: camPicker.show };
  }

  return { attach, touchHold: button => touchHolds.get(button), visible: () => !!live && live.visible() };
})();
Object.freeze(CamPicker);
