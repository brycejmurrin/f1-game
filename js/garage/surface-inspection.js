/* Camera-only livery inspection. No material edits, flashing or draft writes. */
const GarageSurfaceInspection = (function () {
  "use strict";
  const VIEWS = Object.freeze({
    c1: "side", c2: "side", stripe: "top", noseStripe: "front", accent: "side", nose: "front", pod: "side", lower: "side", upper: "side",
    cover: "hero", spineTint: "top", saddleTint: "hero", sideTint: "side", sunTint: "hero", bandTint2: "top", plateTint: "side",
    wing: "wingFront", rearWing: "wingRear", fin: "rear", finArt: "rear", halo: "front", logo: "hero", logo2: "hero", logo3: "hero",
  });
  let live = null;
  function create(camera) {
    let saved = null, field = null;
    const api = {
      inspect(next) {
        if (!VIEWS[next] || (camera.eligible && !camera.eligible())) return false;
        if (!saved) saved = camera.capture();
        field = next; camera.show(VIEWS[next]); return true;
      },
      end() { if (!saved) return false; const before = saved; saved = null; field = null; camera.restore(before); return true; },
      field: () => field,
    };
    return Object.freeze(api);
  }
  function controls(host) {
    const buttons = [], note = document.createElement("p"); note.className = "adv-help"; note.setAttribute("role", "status"); host.appendChild(note);
    const done = document.createElement("button"); done.type = "button"; done.className = "sel-chip"; done.textContent = "RESTORE INSPECTION CAMERA"; done.disabled = true; host.appendChild(done);
    const paint = () => {
      const field = live && live.field();
      done.disabled = !field;
      for (const entry of buttons) { entry.button.setAttribute("aria-pressed", String(field === entry.key)); entry.button.textContent = field === entry.key ? "DONE INSPECTING" : "INSPECT " + entry.label; }
    };
    done.onclick = () => { if (live) live.end(); note.textContent = "Previous camera restored."; paint(); };
    return Object.freeze({ row(row, label, key) {
      if (!VIEWS[key]) return;
      const button = document.createElement("button"); button.type = "button"; button.className = "cs-liv-ed-inspect";
      button.textContent = "INSPECT " + label; button.setAttribute("aria-pressed", "false");
      button.onclick = () => {
        if (!live) return;
        if (live.field() === key) { live.end(); note.textContent = "Previous camera restored."; }
        else if (live.inspect(key)) note.textContent = label + " area framed. This is a camera view; paint stays unchanged. DONE INSPECTING restores your camera.";
        paint();
      };
      buttons.push({ key, label, button }); row.appendChild(button);
    } });
  }
  function bind(camera) { if (live) live.end(); live = create(camera); return live; }
  return Object.freeze({ VIEWS, create, controls, bind, inspect: (key) => !!live && live.inspect(key), end: () => !!live && live.end(), field: () => live && live.field() });
})();
Object.freeze(GarageSurfaceInspection);
