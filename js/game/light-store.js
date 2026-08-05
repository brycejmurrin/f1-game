/* Apex 26 — LIGHTING PROFILE STORE (LightStore.create(G))

   The resolution and persistence half of the lighting tuner. js/game/lighting.js
   owns the REGISTRY (TUNE_DEFS) and the live values (LT); js/game/light-presets.js
   is the shipped baseline; js/game/tuner.js is the panel. This is the piece in
   between: which of those layers wins, for the conditions on screen right now.

   It lived in game.js because it reads live track / time-of-day / weather state,
   and the header of tuner.js said so in as many words. That reason has not held
   since the G façade existed — every one of those reads is already a G accessor,
   and the whole surface (ltKey, setLightTune, applyLightTune, persistLightTune,
   _ltStore) was ALREADY published on G for tuner.js, photomode.js, atmosphere.js
   and apex.js. Five files were reaching through the façade for a block that was
   still spelled out inside game.js. Moving it costs no new G member; it only
   stops game.js being the sixth consumer of its own private state.

   PROFILES ARE PER (track, time-of-day, weather). Store shape:
     { "monza|night|wet": { lampLevel: 0.4, … }, "*": { …legacy flat format } }

   Resolution, LOWEST precedence first:
     TUNE_DEFS.def → LightPresets["*"] → LightPresets[key]
                   → localStorage "*"  → localStorage[key]
   so a committed light-presets.js is the shipped baseline and a player's own
   edits always win over it. A missing layer is skipped, never defaulted through.
*/
"use strict";
const LightStore = (() => {
  function create(G) {
    const { TUNE_DEFS, LT } = LightTune;
    const { store, clamp } = G;

    // Knobs whose effect is BAKED INTO frame.*/frameSky.* by applyRaceSettings()
    // rather than read per-frame in render(). Changing one re-runs that function
    // so the change is live — safe because it re-derives from the branch values.
    const APPLY_RACE_IDS = new Set(["sunTemp", "sunElev", "sunAzim", "cloudCover",
      "moonBright", "cityGlowMul", "cityGlowTint", "ambTemp", "ambBalance",
      "skyColorSat", "fogColorSat"]);

    let profiles = {};
    {
      const saved = store.get("lightTune", null);
      if (saved && typeof saved === "object") {
        const vals = Object.values(saved);
        // Legacy flat format was {id:number}. Current format nests {key:{id:number}}.
        if (vals.length && vals.every((v) => typeof v === "number")) profiles = { "*": saved };
        else profiles = saved;
      }
    }

    // The profile key for the CURRENT session conditions. A "default" TOD resolves
    // to the track's actual day/night look, so it shares one profile with an
    // explicit pick of the same look rather than splitting the player's edits in two.
    function key() {
      const track = G.track;
      if (!track || !track.def) return null;
      let tod = G.raceTimeOfDay;
      if (tod === "default") tod = track.def.night ? "night" : "day";
      return track.def.id + "|" + tod + "|" + G.raceWeather;
    }

    function layers() {
      const F = window.LightPresets || null;
      const k = key();
      return [F && F["*"], F && k && F[k], profiles["*"], k && profiles[k]];
    }

    // What a knob would resolve to WITHOUT the current condition's local profile —
    // i.e. the value RESET falls back to. `set` stores only when the edit differs
    // from this, so a profile never fills up with values it was going to get anyway.
    function fallback(id) {
      const d = TUNE_DEFS.find((t) => t.id === id);
      let v = d.def;
      const F = window.LightPresets || null, k = key();
      if (F && F["*"] && typeof F["*"][id] === "number") v = F["*"][id];
      if (F && k && F[k] && typeof F[k][id] === "number") v = F[k][id];
      if (profiles["*"] && typeof profiles["*"][id] === "number") v = profiles["*"][id];
      return clamp(v, d.min, d.max);
    }

    // A rebuild/reapply/reinit is only worth doing once per call, however many
    // knobs moved — hence the three flags rather than acting inside the loop.
    function liveEffects(rebuilt, reapply, reinit, fromApplyRace) {
      const track = G.track;
      if (rebuilt && track) { track._lights = null; track._alwaysLights = null; }
      // Skip the reapply when applyRaceSettings itself invoked us: it derives from
      // the fresh LT values the moment this returns, and re-entering ran the whole
      // sky/ambient/fog derivation twice per track/time/weather transition.
      if (reapply && !fromApplyRace && track && G.state !== "menu" && G.state !== "select")
        G.applyRaceSettings();
      if (reinit && G.isWetRoad()) G.initRainDrops();
    }

    // Rebuild LT for the current conditions — called whenever track/time/weather
    // changes (via applyRaceSettings), so the right profile is live for both the
    // tuner panel and actual racing.
    function apply(fromApplyRace) {
      const L = layers();
      let rebuilt = false, reapply = false, reinit = false;
      for (const d of TUNE_DEFS) {
        let v = d.def;
        for (const l of L) if (l && typeof l[d.id] === "number") v = l[d.id];
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
      const k = key();
      if (k) {
        const prof = profiles[k] || (profiles[k] = {});
        // Store only when the value differs from what it would resolve to anyway.
        // Storing an explicit value IS required when it matches the DEFAULT but a
        // file/global layer would otherwise win — that is how a local edit pulls a
        // shipped value back down.
        if (v === fallback(id)) delete prof[id]; else prof[id] = v;
        if (!Object.keys(prof).length) delete profiles[k];
      }
      liveEffects(!!d.rebuild, APPLY_RACE_IDS.has(id), !!d.reinitRain, false);
      return true;
    }

    function persist() { store.set("lightTune", profiles); }

    return {
      key, layers, fallback, apply, set, persist,
      // The live object, not a copy: js/game/photomode.js deletes a key out of it
      // to implement the tuner's RESET, and merges it for COPY VALUES.
      get profiles() { return profiles; },
      set profiles(v) { profiles = v || {}; },
    };
  }
  return { create };
})();
