/* Explicit current-device reset; Input owns automatic per-device selection. */
const ControllerProfileControls = (function () {
  "use strict";
  function create(o) {
    const host = o.host;
    if (!host) return null;
    const section = document.createElement("section"); section.setAttribute("aria-label", "Controller profile");
    const label = document.createElement("p"); label.className = "adv-help"; label.setAttribute("role", "status");
    const reset = document.createElement("button"); reset.type = "button"; reset.className = "sel-chip"; reset.id = "pm-pad-profile-reset"; reset.textContent = "RESET THIS CONTROLLER PROFILE";
    const note = document.createElement("p"); note.className = "adv-help"; note.textContent = "Mappings follow the physical controller automatically. Reset affects this device only; other device profiles stay saved.";
    function render() {
      const profile = o.input.controllerProfile();
      reset.disabled = !profile;
      label.textContent = profile ? "Active controller profile: " + String(profile.label || "Controller") + (profile.saved ? " · saved" : " · defaults")
        : "No active physical controller. Press a button on it to connect.";
    }
    reset.onclick = () => { if (!o.input.controllerProfile()) return; o.input.resetControllerProfile(); if (o.afterReset) o.afterReset(); render(); };
    section.append(label, reset, note); host.appendChild(section);
    const change = () => setTimeout(render, 0);
    window.addEventListener("gamepadconnected", change); window.addEventListener("gamepaddisconnected", change); window.addEventListener("apexcontrollerprofilechange", change);
    // Profile switching can occur on pad input without connection events.
    // Call refresh from KeyBinds.render or an Input profile-change hook.
    render();
    return Object.freeze({ refresh: render, dispose() { window.removeEventListener("gamepadconnected", change); window.removeEventListener("gamepaddisconnected", change); window.removeEventListener("apexcontrollerprofilechange", change); section.remove(); } });
  }
  return Object.freeze({ create });
})();
