"use strict";
const LightStore = (() => {
  function create(G) {
    Log.info("game", "LightStore.create");
    const { TUNE_DEFS, LT } = LightTune;
    const { store, clamp } = G;

    const APPLY_RACE_IDS = new Set(["sunTemp", "sunElev", "sunAzim", "cloudCover",
      "moonBright", "cityGlowMul", "cityGlowTint", "ambTemp", "ambBalance",
      "skyColorSat", "fogColorSat",
      "nightAmbLift", "cityGlowWarm", "weatherSunMute", "overcastFogMul", "fogWxMul"]);

    let profiles = {};
    {
      const saved = store.get("lightTune", null);
      if (saved && typeof saved === "object") {
        const vals = Object.values(saved);
        if (vals.length && vals.every((v) => typeof v === "number")) profiles = { "*": saved };
        else {
          for (const [k, prof] of Object.entries(saved)) {
            if (!prof || typeof prof !== "object" || Array.isArray(prof)) continue;
            const clean = {};
            for (const [id, v] of Object.entries(prof)) if (typeof v === "number" && isFinite(v)) clean[id] = v;
            if (Object.keys(clean).length) profiles[k] = clean;
          }
        }
      }
    }

    function key() {
      const track = G.track;
      if (!track || !track.def) return null;
      let tod = G.raceTimeOfDay;
      if (tod === "default") tod = track.def.night ? "night" : "day";
      return track.def.id + "|" + tod + "|" + (G.raceWeather === "storm" ? "rain" : G.raceWeather);
    }

    const TOD_KEYED = new Set(["sunElev", "sunAzim"]);
    function keyFor(id, k) {
      return k && TOD_KEYED.has(id) ? k.slice(0, k.lastIndexOf("|")) + "|dry" : k;
    }

    {
      const moved = new Map();
      let changed = 0;
      for (const k of Object.keys(profiles)) {
        const parts = k.split("|");
        if (parts.length !== 3 || parts[2] === "dry") continue;
        for (const id of TOD_KEYED) {
          if (!(id in profiles[k])) continue;
          const dk = keyFor(id, k), mk = dk + "\u0000" + id, v = profiles[k][id];
          if (!(profiles[dk] && id in profiles[dk])) moved.set(mk, moved.has(mk) && moved.get(mk) !== v ? NaN : v);
          delete profiles[k][id]; changed++;
        }
        if (!Object.keys(profiles[k]).length) delete profiles[k];
      }
      for (const [mk, v] of moved) {
        if (Number.isNaN(v)) continue;
        const [dk, id] = mk.split("\u0000");
        (profiles[dk] || (profiles[dk] = {}))[id] = v;
      }
      if (changed) {
        Log.info("game", "LightStore: moved " + [...moved.values()].filter((v) => !Number.isNaN(v)).length +
          " of " + changed + " legacy per-weather sun edits to the |dry slot");
        store.set("lightTune", profiles);
      }
    }

    function condLayer(F) {
      if (!F) return null;
      const track = G.track;
      if (!track || !track.def) return null;
      let tod = G.raceTimeOfDay;
      if (tod === "default") tod = track.def.night ? "night" : "day";
      return F["*|" + tod] || null;
    }

    function sharedCond(F, k) {
      if (!F || !k) return null;
      const i = k.indexOf("|");
      if (i < 0) return null;
      return F["*" + k.slice(i)] || null;
    }

    function mergePerChunkShipped(k, v, F) {
      let trackPin = null;
      if (F && k && F[k] && typeof F[k].perChunkLights === "number") {
        trackPin = F[k].perChunkLights;
        v = trackPin;
      }
      const c = condLayer(F);
      if (c && typeof c.perChunkLights === "number") {
        v = trackPin !== null ? Math.max(trackPin, c.perChunkLights) : c.perChunkLights;
      }
      return v;
    }

    function shippedAt(k, d) {
      let v = d.def;
      const F = window.LightPresets || null;
      if (F && F["*"] && typeof F["*"][d.id] === "number") v = F["*"][d.id];
      const shared = sharedCond(F, k);
      if (shared && typeof shared[d.id] === "number") v = shared[d.id];
      if (d.id === "perChunkLights") v = mergePerChunkShipped(k, v, F);
      else {
        if (F && k && F[k] && typeof F[k][d.id] === "number") v = F[k][d.id];
        const c = condLayer(F);
        if (c && typeof c[d.id] === "number") v = c[d.id];
      }
      if (typeof d.shippedMax === "number") v = Math.min(v, d.shippedMax);
      return v;
    }

    function base(k, d) {
      k = keyFor(d.id, k);
      let v = shippedAt(k, d);
      if (profiles["*"] && typeof profiles["*"][d.id] === "number") v = profiles["*"][d.id];
      return clamp(v, d.min, d.max);
    }

    function shipped(id) {
      const d = TUNE_DEFS.find((t) => t.id === id);
      if (!d) return undefined;
      return clamp(shippedAt(keyFor(id, key()), d), d.min, d.max);
    }

    function put(prof, k, d, v) {
      v = clamp(v, d.min, d.max);
      if (v === base(k, d)) {
        if (!(d.id in prof)) return false;
        delete prof[d.id]; return true;
      }
      if (prof[d.id] === v) return false;
      prof[d.id] = v; return true;
    }

    function liveEffects(rebuilt, reapply, reinit, fromApplyRace) {
      const track = G.track;
      if (rebuilt && track) { track._lights = null; track._alwaysLights = null; }
      if (reapply && !fromApplyRace && track && G.state !== "menu" && G.state !== "select")
        G.applyRaceSettings();
      if (reinit && (G.viewRainfall ? G.viewRainfall() > 0.01 : G.isWetRoad())) G.initRainDrops();
    }

    const BAKE_IDS = new Set(["lampNearClamp", "lampBake", "tailLightEmit"]);
    const held = (d) => !!d.rebuild || BAKE_IDS.has(d.id);
    function apply(fromApplyRace, opts) {
      if (Log.enabled("game", Log.DEBUG)) Log.debug("game", "LightStore.apply");
      const k = key();
      const hold = !!(opts && opts.holdRebuild);
      let rebuilt = false, reapply = false, reinit = false;
      for (const d of TUNE_DEFS) {
        if (hold && held(d)) continue;
        const kk = keyFor(d.id, k);
        let v = shippedAt(kk, d);
        if (profiles["*"] && typeof profiles["*"][d.id] === "number") v = profiles["*"][d.id];
        if (kk && profiles[kk] && typeof profiles[kk][d.id] === "number") v = profiles[kk][d.id];
        v = clamp(v, d.min, d.max);
        if (LT[d.id] === v) continue;
        LT[d.id] = v;
        if (d.rebuild) rebuilt = true;
        if (d.reinitRain) reinit = true;
        if (APPLY_RACE_IDS.has(d.id)) reapply = true;
      }
      liveEffects(rebuilt, reapply, reinit, fromApplyRace);
    }

    function set(id, v) {
      const d = TUNE_DEFS.find((t) => t.id === id);
      if (!d || typeof v !== "number" || !isFinite(v)) return false;
      v = clamp(v, d.min, d.max);
      LT[id] = v;
      const k = keyFor(id, key());
      if (k) {
        const prof = profiles[k] || (profiles[k] = {});
        put(prof, k, d, v);
        if (!Object.keys(prof).length) delete profiles[k];
      }
      liveEffects(!!d.rebuild, APPLY_RACE_IDS.has(id), !!d.reinitRain, false);
      return true;
    }

    function copyToTracks(mode) {
      const src = key();
      if (!src) return { ok: false, error: "no-track", tracks: 0, changed: 0 };
      const [srcId, tod, weather] = src.split("|");
      mode = mode === "look" ? "look" : "edits";
      const from = [];
      for (const d of TUNE_DEFS) {
        const v = mode === "look" ? LT[d.id] : (profiles[keyFor(d.id, src)] || {})[d.id];
        if (typeof v === "number" && isFinite(v)) from.push([d, v]);
      }
      if (!from.length) return { ok: false, error: "no-edits", mode, key: src, tod, weather, tracks: 0, changed: 0 };
      const out = { ok: true, mode, key: src, tod, weather, knobs: from.length, tracks: 0, changed: 0, undo: {} };
      const list = (typeof Tracks !== "undefined" && Tracks.LIST) || [];
      for (const t of list) {
        if (!t || !t.id || t.id === srcId) continue;
        const k = t.id + "|" + tod + "|" + weather;
        for (const [d, v] of from) {
          const kk = keyFor(d.id, k);
          if (!(kk in out.undo)) out.undo[kk] = profiles[kk] ? Object.assign({}, profiles[kk]) : null;
          const prof = profiles[kk] || (profiles[kk] = {});
          if (put(prof, k, d, v)) out.changed++;
          if (!Object.keys(prof).length) delete profiles[kk];
        }
        out.tracks++;
      }
      return out;
    }

    function restore(undo) {
      if (!undo || typeof undo !== "object") return false;
      for (const k of Object.keys(undo)) {
        const prev = undo[k];
        if (prev && typeof prev === "object" && Object.keys(prev).length) profiles[k] = Object.assign({}, prev);
        else delete profiles[k];
      }
      apply();
      return true;
    }

    function persist() { store.set("lightTune", profiles); }

    function sunSlot(k) { const s = keyFor("sunElev", k); return s !== k ? s : null; }
    function tuned() {
      const k = key();
      if (!k) return 0;
      const s = sunSlot(k), p = s && profiles[s];
      const own = Object.keys(profiles[k] || {}).filter((id) => !s || !TOD_KEYED.has(id));
      return own.length + (p ? [...TOD_KEYED].filter((id) => id in p).length : 0);
    }
    function reset() {
      const k = key();
      if (k) delete profiles[k];
      const s = k && sunSlot(k);
      if (s && profiles[s]) {
        for (const id of TOD_KEYED) delete profiles[s][id];
        if (!Object.keys(profiles[s]).length) delete profiles[s];
      }
      delete profiles["*"];
    }

    const api = {
      key, apply, set, persist, copyToTracks, restore, tuned, reset, shipped,
      get profiles() { return profiles; },
      set profiles(v) { profiles = v || {}; },
    };
    _live = api;
    return api;
  }
  let _live = null;
  function reapply() { if (_live) _live.apply(); }
  function reset() { if (_live) _live.reset(); }
  function tuned() { return _live ? _live.tuned() : 0; }
  function shipped(id) { return _live ? _live.shipped(id) : undefined; }
  return { create, reapply, reset, tuned, shipped };
})();
