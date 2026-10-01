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

  const fin = (v) => typeof v === "number" && isFinite(v);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

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
    MARK_KEY, GRID_IDS, DOF_BLUR_MAX, MAX_MARKS,
    loadAll, marksFor, saveMark, deleteMark, nextGrid,
    applyDof, setGrid, mountOverlays, showOverlays, clamp,
  });
})();
