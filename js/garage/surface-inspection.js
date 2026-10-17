/* Brief steady surface inspection. Camera and overlay are transient; no draft writes. */
const GarageSurfaceInspection = (function () {
  "use strict";
  const VIEWS = Object.freeze({
    c1: "side", c2: "side", stripe: "top", noseStripe: "front", accent: "side", nose: "front", pod: "side", lower: "side", upper: "side",
    cover: "hero", spineTint: "top", saddleTint: "hero", sideTint: "side", sunTint: "hero", bandTint2: "top", plateTint: "side",
    patternTint: "hero", patternSecond: "hero",
    wing: "wingFront", rearWing: "wingRear", fin: "rear", finArt: "rear", halo: "front", logo: "hero", logo2: "hero", logo3: "hero",
  });
  const DURATION_MS = 5000;
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) fn(); };
  let live = null;
  function create(camera) {
    let saved = null, field = null, timer = null, outlined = false, epoch = 0;
    const changed = new Set();
    const emit = () => { for (const fn of changed) fn(); };
    const cancel = () => { epoch++; if (timer !== null) (camera.cancel || clearTimeout)(timer); timer = null; };
    const api = {
      inspect(next) {
        if (!VIEWS[next] || (camera.eligible && !camera.eligible())) return false;
        cancel();
        if (camera.highlight) camera.highlight(null);
        if (!saved) saved = camera.capture();
        field = next; camera.show(VIEWS[next]);
        outlined = !!camera.highlight && camera.highlight(next) === true;
        const request = epoch;
        timer = (camera.schedule || setTimeout)(() => { if (request === epoch) api.end(); }, DURATION_MS);
        emit(); return true;
      },
      end() {
        cancel();
        if (!saved) return false;
        const before = saved; saved = null; field = null; outlined = false;
        if (camera.highlight) camera.highlight(null);
        camera.restore(before); emit(); return true;
      },
      field: () => field,
      outlined: () => outlined,
      onChange(fn) { changed.add(fn); return () => changed.delete(fn); },
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
    const onChange = () => {
      paint();
      if (!live || !live.field()) note.textContent = "Inspection complete; previous camera restored.";
    };
    listeners.add(onChange);
    done.onclick = () => { if (live) live.end(); note.textContent = "Previous camera restored."; paint(); };
    return Object.freeze({ dispose() { listeners.delete(onChange); }, row(row, label, key) {
      if (!VIEWS[key]) return;
      const button = document.createElement("button"); button.type = "button"; button.className = "cs-liv-ed-inspect";
      button.textContent = "INSPECT " + label; button.setAttribute("aria-pressed", "false");
      button.onclick = () => {
        if (!live) return;
        if (live.field() === key) { live.end(); note.textContent = "Previous camera restored."; }
        else if (live.inspect(key)) note.textContent = label + (live.outlined() ? " affected paint region outlined for five seconds." : " area framed for five seconds; no outline is available for this surface.") + " Paint stays unchanged. DONE INSPECTING restores your camera.";
        paint();
      };
      buttons.push({ key, label, button }); row.appendChild(button);
    } });
  }
  function bind(camera) { if (live) live.end(); live = create(camera); live.onChange(notify); return live; }
  return Object.freeze({ VIEWS, DURATION_MS, create, controls, bind, inspect: (key) => !!live && live.inspect(key), end: () => !!live && live.end(), field: () => live && live.field() });
})();
Object.freeze(GarageSurfaceInspection);
