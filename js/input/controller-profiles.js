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
    let current = null, currentMapping, applying = false, legacyClaimed = read().legacyClaimed, saved = true;
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
      current = id; currentMapping = pad.mapping;
      if (adopt) legacyClaimed = true;
      applying = true;
      try { apply(row || (adopt ? legacy : defaults())); } finally { applying = false; }
      save();
    }
    function reload() { const id = current; current = null; if (id) activate({ id, mapping: currentMapping }); }
    function replace(raw) { persist(clean(raw)); reload(); return read(); }
    function reset() {
      if (!current) return false;
      applying = true;
      try { apply(defaults()); } finally { applying = false; }
      save(); return true;
    }
    return { activate, save, reset, reload, replace, data: read, legacyClaimed: () => legacyClaimed,
      current: () => current ? { id: current, label: current, saved, count: read().devices.length } : null };
  }
  const BUTTON_PRESETS = "controlButtonPresets";
  const MODES = ["touch", "phone", "pad", "keyboard"];
  const PRESET_LIMIT = 12;
  const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
  const label = v => typeof v === "string" ? v.trim().slice(0, 40) : "";

  function cleanPresetValues(mode, values) {
    if (mode === "touch" || mode === "phone") return PedalTravel.normalizeProfiles(values);
    if (!object(values)) return undefined;
    const map = {};
    for (const action of Object.keys(values).slice(0, 32)) {
      const slots = values[action];
      if (!/^[a-zA-Z]{1,24}$/.test(action) || !Array.isArray(slots)) continue;
      map[action] = slots.slice(0, 2).map(v => mode === "pad"
        ? (Number.isInteger(v) && v >= 0 && v < 32 ? v : null)
        : (typeof v === "string" && /^[a-zA-Z0-9]{1,32}$/.test(v) ? v : null));
    }
    return map;
  }

  function normalizeButtonPresets(raw) {
    if (!object(raw) || raw.v !== 1 || !object(raw.modes)) return undefined;
    const modes = {};
    for (const mode of MODES) {
      const rows = raw.modes[mode];
      if (!Array.isArray(rows)) continue;
      const used = new Set();
      modes[mode] = rows.slice(0, PRESET_LIMIT).flatMap(row => {
        if (!object(row) || typeof row.id !== "string" || !/^profile-\d{1,2}$/.test(row.id) || used.has(row.id)) return [];
        const name = label(row.name);
        const values = cleanPresetValues(mode, row.values);
        if (!name || values === undefined) return [];
        used.add(row.id);
        return [{ id: row.id, name, values }];
      });
    }
    return { v: 1, modes };
  }

  function buttonPresets(store) {
    const read = () => normalizeButtonPresets(store.get(BUTTON_PRESETS, null)) || { v: 1, modes: {} };
    function update(mode, edit) {
      if (!MODES.includes(mode)) return null;
      const data = read(), rows = data.modes[mode] || [];
      const result = edit(rows);
      if (!result) return null;
      if (rows.length) data.modes[mode] = rows;
      else delete data.modes[mode];
      const value = Object.keys(data.modes).length ? data : undefined;
      const write = store.write ? store.write(BUTTON_PRESETS, value) : { ok: true, durable: store.set(BUTTON_PRESETS, value) !== false };
      return write.ok === false ? null : { id: result, durable: write.durable };
    }
    function save(mode, name, values, id) {
      name = label(name);
      if (!name) return null;
      return update(mode, rows => {
        const cleanValues = cleanPresetValues(mode, values);
        const at = id ? rows.findIndex(row => row.id === id) : -1;
        if (cleanValues === undefined || (id ? at < 0 : rows.length >= PRESET_LIMIT) ||
            rows.some(row => row.id !== id && row.name.toLowerCase() === name.toLowerCase())) return null;
        if (!id) {
          let number = 1;
          while (rows.some(row => row.id === "profile-" + number)) number++;
          id = "profile-" + number;
        }
        const row = { id, name, values: cleanValues };
        if (at < 0) rows.push(row);
        else rows[at] = row;
        return id;
      });
    }
    function remove(mode, id) {
      return update(mode, rows => {
        const at = rows.findIndex(row => row.id === id);
        if (at < 0) return null;
        rows.splice(at, 1);
        return id;
      });
    }
    return { list: mode => MODES.includes(mode) ? read().modes[mode] || [] : [], save, remove };
  }

  return { create, clean, KEY, MAX, buttonPresets, normalizeButtonPresets, PRESET_LIMIT };
})();
Object.freeze(ControllerProfiles);
