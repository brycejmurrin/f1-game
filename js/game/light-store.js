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

   copyToTracks() is the one operation that writes profiles the player is NOT
   looking at: it spreads the condition on screen sideways across the grid, to
   every other track at the same time-of-day and weather. See its own comment for
   the two modes and why storing is still sparse.
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
      "skyColorSat", "fogColorSat",
      // These five belong here for the same reason as the eleven above — their
      // ONLY consumer is inside applyRaceSettings() (or _nightAmbientBand(),
      // which only applyRaceSettings calls) — and they were missing, so
      // dragging them did nothing at all. The value stored, the panel updated,
      // the scene never changed, until something else happened to re-run
      // applyRaceSettings: a TIME or WEATHER chip, a track load, or moving one
      // of the eleven. A slider that is dead until you touch a different
      // slider is indistinguishable from a broken one, and this is what the
      // "some lighting sliders don't work" reports were.
      //   nightAmbLift    game.js:_nightAmbientBand
      //   cityGlowWarm    atmosphere.js
      //   weatherSunMute  atmosphere.js
      //   overcastFogMul  atmosphere.js
      //   fogWxMul        atmosphere.js
      // If you add a knob whose consumer lives in applyRaceSettings, add it
      // here too — there is no mechanism that notices for you.
      "nightAmbLift", "cityGlowWarm", "weatherSunMute", "overcastFogMul", "fogWxMul"]);

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

    // What knob `d` resolves to for condition `k` WITHOUT k's own local profile —
    // every layer of the ladder except the top one. A null/absent key just skips
    // the per-condition file layer, which is what an unloaded track should do.
    function base(k, d) {
      let v = d.def;
      const F = window.LightPresets || null;
      if (F && F["*"] && typeof F["*"][d.id] === "number") v = F["*"][d.id];
      if (F && k && F[k] && typeof F[k][d.id] === "number") v = F[k][d.id];
      if (profiles["*"] && typeof profiles["*"][d.id] === "number") v = profiles["*"][d.id];
      return clamp(v, d.min, d.max);
    }

    // Write `v` into profile map `prof` for condition `k` under the rule set()
    // uses: an explicit entry only where it differs from what k would resolve to
    // on its own. Storing a value that equals the DEFAULT is still required when
    // a file/global layer would otherwise win — that is how an edit (or a copy)
    // pulls a shipped value back down. Returns true when the map changed.
    function put(prof, k, d, v) {
      v = clamp(v, d.min, d.max);
      if (v === base(k, d)) {
        if (!(d.id in prof)) return false;
        delete prof[d.id]; return true;
      }
      if (prof[d.id] === v) return false;
      prof[d.id] = v; return true;
    }

    // A rebuild/reapply/reinit is only worth doing once per call, however many
    // knobs moved — hence the three flags rather than acting inside the loop.
    //
    // apply() and set() ran these in DIFFERENT ORDERS before they shared this
    // function (set() reinitialised the rain before reapplying race settings;
    // apply() did the reverse). Unifying them is safe because the two branches
    // are mutually exclusive: the reinitRain knobs are rainCount, rainStreak,
    // rainSpeed, drizzleCount, drizzleLen and drizzleSpeed, and NONE of them is
    // in APPLY_RACE_IDS. Checked, not assumed — if a future knob is ever both,
    // the order becomes load-bearing and this comment is the warning.
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
        put(prof, k, d, v);
        if (!Object.keys(prof).length) delete profiles[k];
      }
      liveEffects(!!d.rebuild, APPLY_RACE_IDS.has(id), !!d.reinitRain, false);
      return true;
    }

    // ── SPREAD ONE CONDITION ACROSS THE GRID ──────────────────────────────────
    // The tuner edits ONE (track, time, weather) profile at a time. That is right
    // for dialling a circuit in and wrong for the other thing people do with it:
    // settle a look for "dusk in the wet" and want it on all 40 circuits. By hand
    // that is 39 more tuning sessions, so it is one action here — in two flavours,
    // because "copy my settings" means two different things:
    //
    //   "edits" — copy only THIS profile's stored overrides (the knobs that
    //             differ from what this condition resolves to on its own),
    //             MERGED over each target's own overrides. Every other track
    //             keeps its shipped character for the knobs you never touched.
    //   "look"  — copy every LIVE value, so each track at that time and weather
    //             resolves identically to this one. It overrides the per-track
    //             presets in light-presets.js by design; that is the only thing
    //             "make them all look like this" can mean.
    //
    // Both write through put(), so a copy stores an entry only where the target
    // would not have resolved there anyway: "look" does not stamp 40 copies of
    // the defaults into localStorage, and a knob sitting at its default is still
    // written explicitly where a file preset would otherwise win.
    //
    // Only OTHER tracks are touched, and only at the source's own time+weather —
    // the live LT values therefore cannot change, which is why nothing here
    // re-applies or invalidates anything. The caller persists (the panel and
    // __apex.lightCopy both do), and hands `undo` back to restore() to revert.
    function copyToTracks(mode) {
      const src = key();
      if (!src) return { ok: false, error: "no-track", tracks: 0, changed: 0 };
      const [srcId, tod, weather] = src.split("|");
      mode = mode === "look" ? "look" : "edits";
      // Driven off TUNE_DEFS in both modes, so a stored id the registry no longer
      // has is left behind rather than copied onto 39 more profiles.
      const from = [];
      for (const d of TUNE_DEFS) {
        const v = mode === "look" ? LT[d.id] : (profiles[src] || {})[d.id];
        if (typeof v === "number" && isFinite(v)) from.push([d, v]);
      }
      if (!from.length) return { ok: false, error: "no-edits", mode, key: src, tod, weather, tracks: 0, changed: 0 };
      const out = { ok: true, mode, key: src, tod, weather, knobs: from.length, tracks: 0, changed: 0, undo: {} };
      const list = (typeof Tracks !== "undefined" && Tracks.LIST) || [];
      for (const t of list) {
        if (!t || !t.id || t.id === srcId) continue;
        const k = t.id + "|" + tod + "|" + weather;
        out.undo[k] = profiles[k] ? Object.assign({}, profiles[k]) : null;
        const prof = profiles[k] || (profiles[k] = {});
        for (const [d, v] of from) if (put(prof, k, d, v)) out.changed++;
        if (!Object.keys(prof).length) delete profiles[k];
        out.tracks++;
      }
      return out;
    }

    // Put back exactly what copyToTracks() found — a null entry means the target
    // had no local profile at all, so the key goes away rather than to {}.
    // Re-applies, because a snapshot is allowed to name the live condition even
    // though the copy that produced it never does.
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

    return {
      key, apply, set, persist, copyToTracks, restore,
      // The live object, not a copy: js/game/photomode.js deletes a key out of it
      // to implement the tuner's RESET, and merges it for COPY VALUES.
      get profiles() { return profiles; },
      set profiles(v) { profiles = v || {}; },
    };
  }
  return { create };
})();
