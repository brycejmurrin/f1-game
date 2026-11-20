/* Region geometry is sparse. An absent property falls back to the owning
   screen's CSS (including its existing per-screen settings and breakpoints).
   Store viewport percentages, never the measured dimensions of this device. */
window.ScreenPlacement = (function () {
  "use strict";

  const KEY = "screenPlacement";
  const SHAPES = ["portrait", "landscape"];
  const limits = { x: [-50, 50], y: [-50, 50], width: [5, 100], height: [5, 100], scale: [0.5, 2] };
  const sheets = new Map();
  let garageRevision = 0, garagePanelMoved = false;
  let editorZoom = new WeakMap();
  const registry = () => typeof ScreenRegions === "undefined" ? {} : ScreenRegions;
  const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(orientation: portrait)") : null;
  const orientation = () => media && media.matches ? "portrait" : "landscape";
  function shape(value) {
    if (!value) return orientation();
    if (value === "wide") return "landscape";
    if (value === "tall") return "portrait";
    return SHAPES.includes(value) ? value : null;
  }
  function fieldValue(key, value, config) {
    const [min, max] = limits[key];
    const ceiling = key === "width" ? config.maxWidth : key === "height" ? config.maxHeight : null;
    return Math.round(1000 * Math.min(ceiling || max, Math.max(min, value))) / 1000;
  }
  function cleanRegions(id, raw) {
    const out = {};
    if (!Object.hasOwn(registry(), id) || !raw || typeof raw !== "object") return out;
    for (const [region, config] of Object.entries(registry()[id].regions)) {
      if (!Object.hasOwn(raw, region) || !raw[region]) continue;
      const fields = {};
      for (const key of Object.keys(limits)) {
        const value = raw[region][key];
        if (!Number.isFinite(value) || config[key] === false) continue;
        if ((key === "x" || key === "y") && !value || key === "scale" && value === 1) continue;
        fields[key] = fieldValue(key, value, config);
      }
      if (Object.keys(fields).length) out[region] = fields;
    }
    return out;
  }
  function normalize(raw) {
    const out = { v: 1, screens: {} };
    if (raw?.v !== 1 || !raw.screens) return out;
    for (const id of Object.keys(registry())) {
      for (const dir of SHAPES) {
        const map = cleanRegions(id, raw.screens[id]?.[dir]);
        if (!Object.keys(map).length) continue;
        (out.screens[id] ||= {})[dir] = map;
      }
    }
    return out;
  }
  function read(id, dir) {
    const raw = GameStore.store.get(KEY, null);
    return cleanRegions(id, raw?.v === 1 ? raw.screens?.[id]?.[shape(dir)] : null);
  }
  function save(id, dir, map) {
    const side = shape(dir);
    if (!side || !Object.hasOwn(registry(), id)) return false;
    const data = normalize(GameStore.store.get(KEY, null));
    (data.screens[id] ||= {})[side] = map;
    const next = normalize(data);
    return GameStore.store.set(KEY, Object.keys(next.screens).length ? next : undefined);
  }

  // One stylesheet per customized screen also covers children rebuilt after
  // entry (career tabs, standings, etc). Removing it restores the live host's
  // styles, even if the host updated them while the editor was open.
  function apply(id, raw) {
    if (typeof document === "undefined" || !Object.hasOwn(registry(), id)) return;
    const map = cleanRegions(id, raw);
    let sheet = sheets.get(id);
    if (!Object.keys(map).length) {
      if (sheet) {
        sheet.remove();
        sheets.delete(id);
        if (id === "carsetup") { garageRevision++; garagePanelMoved = false; }
      }
      return;
    }
    const config = registry()[id];
    const editor = document.getElementById("screen-arranger");
    let zoom;
    if (editor?.open && editor.dataset.editingScreen === id) {
      zoom = editorZoom.get(editor);
      if (!zoom) { zoom = new Map(); editorZoom.set(editor, zoom); }
    }
    const rules = [];
    for (const [region, fields] of Object.entries(map)) {
      const part = config.regions[region].selector;
      const target = ':is(' + config.root + ') :is(' + part + '), :is(' + config.root + '):is(' + part + ')';
      let z = zoom?.get(region);
      if (!z) {
        const node = document.querySelector(target);
        z = node?.currentCSSZoom || 1;
        zoom?.set(region, z);
      }
      const declarations = [];
      if (fields.x || fields.y) declarations.push('translate:' + ((fields.x || 0) / z) + 'vw ' + ((fields.y || 0) / z) + 'vh');
      if (fields.width) {
        const width = fields.width / z + 'vw';
        declarations.push('width:' + width);
        // The adjacent camera controls consume the sheet's own width token.
        if (id === "carsetup" && region === "panel") rules.push('#carsetup{--cs-sheet-w:' + width + ' !important}');
        if (id === "career" && (region === "navigation" || region === "calendar")) {
          // The Career slot picker can be a two-column grid even when its
          // sheet is in stacked mode. Set the track as well as its contents.
          const track = 'clamp(22%, ' + width + ', 72%)';
          const left = track + ' minmax(0, 1fr)', right = 'minmax(0, 1fr) ' + track;
          const nav = region === "navigation";
          const columns = order => '{grid-template-columns:' + order + ' !important}';
          const paired = '#career #cr-inner[data-pair="on"]';
          const slots = '#cr-inner:not([data-pair="on"]):not([data-shape="tall"]):has(#cr-left .cr-slot):has(#cr-right .cr-slot) > #cr-body';
          rules.push(paired + columns(nav ? left : right), slots + columns(nav ? left : right),
            ':root[data-look-career-side="swapped"] ' + paired + columns(nav ? right : left));
          declarations.push('max-width:100%', 'box-sizing:border-box');
        }
      }
      if (fields.height) declarations.push('height:' + fields.height / z + 'vh', 'overflow:auto');
      if (fields.scale) declarations.push('scale:' + fields.scale);
      rules.push(target + '{' + declarations.map(d => d + ' !important').join(';') + '}');
    }
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.dataset.screenPlacement = id;
      document.head.appendChild(sheet);
      sheets.set(id, sheet);
    }
    const css = rules.join('\n');
    if (sheet.textContent !== css) {
      sheet.textContent = css;
      if (id === "carsetup") { garageRevision++; garagePanelMoved = !!map.panel; }
    }
  }
  // These settings belong to one screen across both orientations. Popup
  // preferences are shared, so a reset here must never change that store key.
  const legacy = {
    pausemenu: ["pause", ["w", "gap", "vpos", "music", "build"]],
    datahub: ["datahub", ["w"]],
    select: ["select", ["w", "density", "tile", "rows", "names", "strip"]],
    "race-settings": ["race", ["w", "density", "cols", "presets"]],
    career: ["career", ["w", "density", "layout", "split", "side"]],
    carsetup: ["garage", ["density", "side", "pw", "ph", "stats"]],
    trackdesigner: ["designer", ["size", "split", "profile"]],
  };
  function resetLegacy(id, mode) {
    const owned = legacy[id];
    if (!owned || typeof ScreenLooks === "undefined") return true;
    let durable = ScreenLooks.resetGeometry(...owned, mode);
    if (id === "pausemenu" && typeof PauseOpts !== "undefined") {
      if (mode === "preview") {
        delete document.documentElement.dataset.pauseLayout;
        delete document.documentElement.dataset.pauseSide;
      } else {
        if (mode === "save") {
          const layoutSaved = GameStore.store.set("pauseLayout", undefined);
          const sideSaved = GameStore.store.set("pauseSide", undefined);
          durable = durable && layoutSaved && sideSaved;
        }
        PauseOpts.apply();
      }
    }
    return durable;
  }
  const restore = id => apply(id, read(id));
  function restoreAll() {
    const raw = GameStore.store.get(KEY, null);
    const editor = document.getElementById("screen-arranger");
    for (const id of new Set([...sheets.keys(), ...Object.keys(raw?.screens || {})])) {
      if (!editor?.open || editor.dataset.editingScreen !== id) restore(id);
    }
  }
  if (typeof document !== "undefined") {
    restoreAll();
    // The viewport units follow browser chrome and safe-content changes. On
    // resize a containing sheet can also change its own fit-capped zoom.
    let resizeFrame = 0;
    function resized() {
      editorZoom = new WeakMap();
      if (sheets.size && !resizeFrame) resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        restoreAll();
      });
    }
    window.addEventListener?.("resize", resized);
    media?.addEventListener("change", restoreAll);
    GameStore.store.subscribe(change => {
      if (change.key === KEY || change.key === null) restoreAll();
      else if (change.key === "uiScale") resized();
    });
  }
  return Object.freeze({ read, save, apply, restore, restoreAll, normalize, orientation, resetLegacy, fieldValue,
    get garageRevision() { return garageRevision; }, get garagePanelMoved() { return garagePanelMoved; } });
})();
