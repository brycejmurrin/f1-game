/* Apex 26 — photo-mode kit extras: composition grids, depth-of-field hint, and
 * per-circuit camera bookmarks (apex26.freecamMarks). Pure helpers + a thin DOM
 * binder FreeCam.create calls so free-cam.js stays the panel owner. DoF is a
 * CSS soft-focus overlay (no GLX/TLX/WGX optical DoF yet — flyby plan rejected
 * backend DoF); bookmarks are world eye/target/fov (+ optional roll). */
const PhotoKit = (function () {
  "use strict";

  const MARK_KEY = "freecamMarks";
  const GRID_IDS = ["off", "thirds", "golden"];
  const DOF_BLUR_MAX = 6;      // CSS px at full strength
  const MAX_MARKS = 12;        // per track
  const LOOK_PRESETS = Object.freeze([
    { name: "Clean TV", values: { exposureMul: 1.05, contrast: 1.18, saturation: 1.08, gammaR: 1, gammaG: 1, gammaB: 1, vignette: 0.9, bloomMul: 0.85, fogTint: 0 } },
    { name: "Film", values: { exposureMul: 0.96, contrast: 1.3, saturation: 0.88, gammaR: 1.06, gammaG: 1, gammaB: 0.94, vignette: 0.68, bloomMul: 1.1, fogTint: 0.18 } },
    { name: "Noir", values: { exposureMul: 0.88, contrast: 1.58, saturation: 0, gammaR: 1, gammaG: 1, gammaB: 1, vignette: 0.48, bloomMul: 0.55, fogTint: 0 } },
    { name: "Golden", values: { exposureMul: 1.08, contrast: 1.22, saturation: 1.12, gammaR: 1.1, gammaG: 1.02, gammaB: 0.88, vignette: 0.76, bloomMul: 1.25, fogTint: 0.72 } },
    { name: "Neon Night", values: { exposureMul: 0.94, contrast: 1.4, saturation: 1.42, gammaR: 1.08, gammaG: 0.94, gammaB: 1.14, vignette: 0.58, bloomMul: 1.8, fogTint: -0.8 } },
    { name: "70s", values: { exposureMul: 1.02, contrast: 1.16, saturation: 0.82, gammaR: 1.14, gammaG: 1.04, gammaB: 0.82, vignette: 0.55, bloomMul: 0.92, fogTint: 0.45 } },
  ].map((look) => Object.freeze({ name: look.name, values: Object.freeze(look.values) })));
  const LOOK_KEYS = Object.freeze(Object.keys(LOOK_PRESETS[0].values));

  const fin = (v) => typeof v === "number" && isFinite(v);
  const clamp = M4.clamp;   // js/core/mat4.js — the shared one

  function loadAll(store) {
    if (!store || typeof store.get !== "function") return {};
    const raw = store.get(MARK_KEY, null);
    return raw && typeof raw === "object" ? raw : {};
  }

  function marksFor(store, trackId) {
    const all = loadAll(store);
    const list = all[trackId];
    return Array.isArray(list) ? list : [];
  }

  /** Save a bookmark. Returns the new list for that track, or null on failure. */
  function saveMark(store, trackId, mark) {
    if (!store || !trackId || !mark || !mark.eye || !mark.target) return null;
    const all = loadAll(store);
    const list = Array.isArray(all[trackId]) ? all[trackId].slice() : [];
    const entry = {
      name: String(mark.name || ("Mark " + (list.length + 1))).slice(0, 40),
      eye: [+mark.eye[0], +mark.eye[1], +mark.eye[2]],
      target: [+mark.target[0], +mark.target[1], +mark.target[2]],
      fov: clamp(fin(+mark.fov) ? +mark.fov : 60, 20, 110),
      roll: clamp(fin(+mark.roll) ? +mark.roll : 0, -45, 45),
      t: Date.now(),
    };
    list.push(entry);
    while (list.length > MAX_MARKS) list.shift();
    all[trackId] = list;
    store.set(MARK_KEY, all);
    return list;
  }

  function deleteMark(store, trackId, index) {
    if (!store || !trackId) return null;
    const all = loadAll(store);
    const list = Array.isArray(all[trackId]) ? all[trackId].slice() : [];
    if (!(index >= 0) || index >= list.length) return list;
    list.splice(index | 0, 1);
    all[trackId] = list;
    store.set(MARK_KEY, all);
    return list;
  }

  function nextGrid(cur) {
    const i = GRID_IDS.indexOf(cur);
    return GRID_IDS[((i < 0 ? 0 : i) + 1) % GRID_IDS.length];
  }

  /** One transient free-camera visit. set() deliberately never persists. */
  function createLookSession(get, set) {
    let snapshot = null, selected = null;
    function apply(name) {
      const look = LOOK_PRESETS.find((p) => p.name === name);
      if (!look || typeof get !== "function" || typeof set !== "function") return false;
      if (!snapshot) {
        snapshot = {};
        for (const id of LOOK_KEYS) snapshot[id] = get(id);
      }
      for (const id of LOOK_KEYS) set(id, look.values[id]);
      selected = look.name;
      return true;
    }
    function end() {
      if (!snapshot) return false;
      for (const id of LOOK_KEYS) set(id, snapshot[id]);
      snapshot = null; selected = null;
      return true;
    }
    return Object.freeze({ apply, end, active: () => selected });
  }

  function mountLookControls(parent, session, doc) {
    if (!parent || !session || !doc || typeof doc.createElement !== "function") return null;
    const group = doc.createElement("div");
    group.id = "fc-looks";
    group.className = "balanced-row";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Photo look presets");
    const buttons = [];
    for (const look of LOOK_PRESETS) {
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = look.name.toUpperCase();
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        if (!session.apply(look.name)) return;
        for (const other of buttons) other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      buttons.push(button);
      group.appendChild(button);
    }
    parent.appendChild(group);
    return group;
  }

  /** Attach DoF fields onto a dbgCam and drive the CSS overlay variables. */
  function applyDof(cam, focus, blur, overlay) {
    const f = clamp(fin(+focus) ? +focus : 0.35, 0, 1);
    const b = clamp(fin(+blur) ? +blur : 0, 0, 1);
    if (cam) cam.dof = { focus: f, blur: b };
    if (overlay && overlay.style) {
      overlay.style.setProperty("--fc-dof-blur", (b * DOF_BLUR_MAX).toFixed(2) + "px");
      // Clear disc radius: larger focus = larger sharp centre.
      const clear = Math.round(18 + f * 42);
      const soft = Math.round(clear + 22 + b * 18);
      overlay.style.setProperty("--fc-dof-clear", clear + "%");
      overlay.style.setProperty("--fc-dof-soft", soft + "%");
      overlay.hidden = b < 0.02;
      overlay.setAttribute("aria-hidden", overlay.hidden ? "true" : "false");
    }
    return { focus: f, blur: b };
  }

  function setGrid(overlay, id) {
    const g = GRID_IDS.indexOf(id) >= 0 ? id : "off";
    if (overlay) {
      overlay.dataset.grid = g;
      overlay.hidden = g === "off";
      overlay.setAttribute("aria-hidden", overlay.hidden ? "true" : "false");
    }
    return g;
  }

  /**
   * Build the viewport overlays (grid + DoF) once. Returns { grid, dof } nodes
   * appended to `parent` (usually document.body). Id-styled — no new CSS class
   * tokens — so the cssClasses ratchet stays put.
   */
  function mountOverlays(parent, doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!d || !parent) return { grid: null, dof: null };
    let grid = d.getElementById("fc-comp-grid");
    if (!grid) {
      grid = d.createElement("div");
      grid.id = "fc-comp-grid";
      grid.hidden = true;
      grid.setAttribute("aria-hidden", "true");
      grid.dataset.grid = "off";
      parent.appendChild(grid);
    }
    let dof = d.getElementById("fc-dof");
    if (!dof) {
      dof = d.createElement("div");
      dof.id = "fc-dof";
      dof.hidden = true;
      dof.setAttribute("aria-hidden", "true");
      parent.appendChild(dof);
    }
    return { grid: grid, dof: dof };
  }

  function showOverlays(on, grid, dof) {
    if (!on) {
      if (grid) { grid.hidden = true; grid.setAttribute("aria-hidden", "true"); }
      if (dof) { dof.hidden = true; dof.setAttribute("aria-hidden", "true"); }
    }
  }

  return Object.freeze({
    MARK_KEY, GRID_IDS, DOF_BLUR_MAX, MAX_MARKS, LOOK_PRESETS, LOOK_KEYS,
    loadAll, marksFor, saveMark, deleteMark, nextGrid,
    createLookSession, mountLookControls, applyDof, setGrid, mountOverlays, showOverlays, clamp,
  });
})();
