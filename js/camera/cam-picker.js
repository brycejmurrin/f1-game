/* Apex 26 — CAM button picker: hold or right-click opens the view grid, arrow keys move it, AUTO appears only while a WATCH runs. CamModes.create owns the saved mode index. */
const CamPicker = (function () {
  "use strict";

  function attach(host) {
    const G = host.G, $ = host.$, CAM_MODES = host.CAM_MODES, HOLD_MS = host.HOLD_MS;
    const watchReplay = host.watchReplay, pickCam = host.pickCam, toAuto = host.toAuto, cycleCam = host.cycleCam;
    const camTrigger = $("btn-cam");
    let cancelCamHold = () => {};
    const camPicker = (() => {
      let el = null;
      const build = () => {
        el = document.createElement("div");
        el.id = "campicker";
        el.setAttribute("role", "menu");
        el.setAttribute("aria-label", "Camera view");
        el.className = "balanced-row";
        el.hidden = true;
        for (let i = 0; i < CAM_MODES.length; i++) {
          const b = document.createElement("button");
          b.textContent = CAM_MODES[i].label;
          b.dataset.idx = i;
          b.setAttribute("role", "menuitemradio");
          b.tabIndex = -1;
          b.onclick = (e) => {
            e.stopPropagation(); pickCam(+b.dataset.idx); hide(); camTrigger?.focus();
          };
          el.appendChild(b);
        }
        el.addEventListener("keydown", (e) => {
          const items = [...el.querySelectorAll('[role="menuitemradio"]')];
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
          const on = b === autoBtn ? auto : !auto && +b.dataset.idx === G.camMode;
          b.classList.toggle("active", on);
          b.setAttribute("aria-checked", on ? "true" : "false");
        }
      };
      const show = () => {
        if (document.hidden || G.paused || (G.state !== "race" && G.state !== "count") ||
            document.body.classList.contains("hud-hidden") || document.body.classList.contains("lt-open")) return false;
        if (!el) build();
        sync();
        el.hidden = false;
        camTrigger?.setAttribute("aria-expanded", "true");
        el.querySelector('[aria-checked="true"]')?.focus();
        return true;
      };
      const hide = () => {
        cancelCamHold();
        if (el) el.hidden = true;
        camTrigger?.setAttribute("aria-expanded", "false");
      };
      const visible = () => !!el && !el.hidden;
      return { show, hide, visible };
    })();
    (() => {
      const b = camTrigger;
      if (!b) return;
      b.setAttribute("aria-haspopup", "menu");
      b.setAttribute("aria-expanded", "false");
      let holdT = 0, holdGeneration = 0, downTs = NaN;
      let held = false;
      let released = false;
      b.addEventListener("pointerdown", (e) => {
        cancelCamHold();
        downTs = e && e.timeStamp;
        const generation = holdGeneration;
        holdT = setTimeout(() => { if (generation !== holdGeneration) return; holdT = 0; held = camPicker.show(); }, HOLD_MS);
      });
      // The hold is judged by the press's own event times, not by which task
      // ran first: a long frame queues pointerup BEHIND the timer, so an 80 ms
      // tap opened the picker (UI hunt 2026-10-29 row 3). A press shorter than
      // HOLD_MS that the timer already "held" is undone and clicks as a tap.
      b.addEventListener("pointerup", (e) => {
        clearTimeout(holdT);
        if (held && e && e.timeStamp - downTs < HOLD_MS) camPicker.hide();
        released = true;
      });
      b.addEventListener("pointerleave", () => clearTimeout(holdT));
      // A cancelled touch is not a long press. iOS cancels touches routinely
      // (edge swipe, notification, gesture arbitration) and a touch pointer
      // holds implicit capture, so pointerleave never fires either: the timer
      // opened the picker mid-corner and `held` then ate the next genuine tap.
      const cancelHold = cancelCamHold = () => { holdGeneration++; clearTimeout(holdT); holdT = 0; held = false; released = false; };
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
      // Tap anywhere outside the grid closes it.
      document.addEventListener("pointerdown", (e) => {
        if (camPicker.visible() && e.target !== b && !e.target.closest("#campicker")) camPicker.hide();
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
    return { hide: camPicker.hide };
  }

  return { attach };
})();
Object.freeze(CamPicker);
