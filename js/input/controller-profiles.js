/* ControllerProfiles — bounded physical-device maps; legacy maps seed only the first device. */
const ControllerProfiles = (function () {
  "use strict";
  const KEY = "padProfiles", MAX = 16;
  const idOf = (pad) => String(pad && pad.id || "").slice(0, 120);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  function clean(raw) {
    const devices = [];
    for (const row of raw && Array.isArray(raw.devices) ? raw.devices : []) {
      if (devices.length >= MAX) break;
      if (!row || typeof row.id !== "string" || !row.id || devices.some((d) => d.id === row.id.slice(0, 120))) continue;
      const axes = {}, buttons = {};
      for (const k of ["steer", "throttle", "brake", "steerInvert", "pedalInvert", "throttleRest", "throttleFar", "brakeRest", "brakeFar"]) {
        const v = row.axes && row.axes[k];
        if (v === null || typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 32) axes[k] = v;
      }
      for (const k of Object.keys(row.buttons || {}).slice(0, 32)) {
        if (!/^[a-zA-Z]{1,24}$/.test(k) || !Array.isArray(row.buttons[k])) continue;
        buttons[k] = row.buttons[k].slice(0, 2).map((v) => Number.isInteger(v) && v >= 0 && v < 32 ? v : null);
      }
      devices.push({ id: row.id.slice(0, 120), axes, buttons });
    }
    return { v: 1, devices, legacyClaimed: !!(raw && raw.legacyClaimed) || !!(raw && raw.legacyClaimed == null && devices.length) };
  }
  function create({ store, snapshot, apply, defaults, changed, legacyMatches = () => true }) {
    const read = () => clean(store.get(KEY, null));
    let legacy = clone(snapshot());
    let current = null, applying = false, legacyClaimed = read().legacyClaimed, saved = true;
    const persist = (map) => { saved = store.set(KEY, clean(map)) !== false; if (changed) changed(); };
    function save() {
      if (applying) return;
      if (!current) { if (!legacyClaimed) legacy = clone(snapshot()); return; }
      const map = read(), row = Object.assign({ id: current }, clone(snapshot()));
      map.devices = [row, ...map.devices.filter((d) => d.id !== current)].slice(0, MAX);
      map.legacyClaimed = map.legacyClaimed || legacyClaimed;
      persist(map);
    }
    function activate(pad) {
      const id = idOf(pad);
      if (!id || id === current) return;
      const map = read(), row = map.devices.find((d) => d.id === id);
      // Preserve a legacy wheel map until a non-standard physical controller
      // uses it; an idle standard pad must neither inherit nor consume it.
      legacyClaimed = legacyClaimed || map.legacyClaimed;
      const adopt = !row && !legacyClaimed && legacyMatches(pad);
      current = id;
      if (adopt) legacyClaimed = true;
      applying = true;
      try { apply(row || (adopt ? legacy : defaults())); } finally { applying = false; }
      save();
    }
    function reload() { const id = current; current = null; if (id) activate({ id }); }
    function replace(raw) { persist(clean(raw)); reload(); return read(); }
    function reset() {
      if (!current) return false;
      applying = true;
      try { apply(defaults()); } finally { applying = false; }
      save(); return true;
    }
    return { activate, save, reset, reload, replace, data: read,
      current: () => current ? { id: current, label: current, saved, count: read().devices.length } : null };
  }
  return { create, clean, KEY, MAX, idOf };
})();
Object.freeze(ControllerProfiles);
