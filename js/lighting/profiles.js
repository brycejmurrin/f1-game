/* Apex 26 — LIGHTING PROFILE STORE (LightStore.create(G)): the resolution and
   persistence half of the lighting tuner. js/lighting/knobs.js owns the
   registry (TUNE_DEFS + the live LT object); this file layers shipped
   LightPresets (global, shared condition, then per-track), a quality-gated
   conditional layer, and the player's own overrides (global then
   per-condition) over each knob's default into LT, and persists only the
   deltas from default to localStorage (apex26.lightTune).
   js/lighting/tuner-panel.js and __apex.lightTune / lightCopy are the only
   callers of set() / copyToTracks() / restore(). */
"use strict";
const LightStore = (() => {
  function create(G) {
    Log.info("game", "LightStore.create");
    const { TUNE_DEFS, LT } = LightTune;
    const { store, clamp } = G;

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
        else {
          // Only plain objects of finite numbers: an imported settings file
          // passes typeof checks, and a string profile made the next knob
          // move throw (`id in "x"` inside put()).
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
      return track.def.id + "|" + tod + "|" + G.raceWeather;
    }

    // WEATHER DOES NOT MOVE THE SUN. The sun's direction is keyed by track x
    // time of day only: every weather resolves sunElev/sunAzim from the
    // "<track>|<tod>|dry" profile (shipped and player alike), and the tuner
    // writes them there whatever the weather on screen. Until 2026-10-04 each
    // weather carried its own offsets (paul_ricard dawn swung 144.5 degrees
    // dry->wet), so a weather-arc stage flip swung the shadows mid-race; the
    // weather's look is its tint (sunTemp, keyMul, weatherSunMute), which the
    // arc cross-fades (js/lighting/atmosphere.js).
    const TOD_KEYED = new Set(["sunElev", "sunAzim"]);
    function keyFor(id, k) {
      return k && TOD_KEYED.has(id) ? k.slice(0, k.lastIndexOf("|")) + "|dry" : k;
    }

    // A save from before that change still holds sun edits under the weather's
    // own key ("monza|dawn|wet"), where the resolver no longer looks: dead, yet
    // counted by tuned() and re-exported by persist(). Move each to its "|dry"
    // slot when that is unambiguous (the slot lacks the id and every weather of
    // that track x time agrees on the value); otherwise drop it. Persist once.
    {
      const moved = new Map();   // "<dry key>\u0000<id>" -> value, or NaN on disagreement
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

    // Conditional shipped layer: LightPresets["*|<tod>"] (e.g. "*|night"),
    // resolved only when gfx.hasPerChunkLights (three.js cannot bind per-chunk
    // sets). Resolution order for most knobs: global "*", shared "*|<tod>|<wx>",
    // per-track "<id>|<tod>|<wx>", then this cond layer, then player "*", then
    // player per-condition. perChunkLights alone breaks step four when the
    // per-track profile pins it: condLayer may raise the value but never lower
    // a track-authored pin (Math.max(trackPin, condValue)); unpinned tracks
    // still take condLayer as today. Player layers still come last and win.
    // Lazy typeof reads — GfxQuality may be absent in a node harness.
    function condLayer(F) {
      if (!F) return null;
      const track = G.track;
      if (!track || !track.def) return null;
      let tod = G.raceTimeOfDay;
      if (tod === "default") tod = track.def.night ? "night" : "day";
      const c = F["*|" + tod];
      if (!c) return null;
      const gfx = G.gfx;
      // CAPABILITY only, no preset-id or isMobile POLICY:
      //   - "ultra only" misses HIGH, the same PerfGov tier 0 and the desktop
      //     DEFAULT preset; nothing measured separates the two.
      //   - "not mobile" was never measured (docs/LIGHTING-TUNER-SLIDERS.md
      //     says so) and zeroes the feature on a phone at every preset and hour.
      // What actually bounds the cost lives where the cost is: the resolved
      // gate in game.js sheds on the GOVERNOR's measured tier and the crash
      // floor, so a device that cannot afford it loses it by evidence rather
      // than by device class. hasPerChunkLights stays — three.js genuinely
      // cannot bind per-chunk sets without minting a program per chunk.
      if (!gfx || !gfx.hasPerChunkLights) return null;
      return c;
    }

    // Shared condition stamp: LightPresets["*|<tod>|<wx>"] (e.g. "*|dawn|dry").
    // Sits between the global "*" baseline and the per-track key so one fleet
    // look can land without 52 identical pins — a track profile still wins.
    function sharedCond(F, k) {
      if (!F || !k) return null;
      const i = k.indexOf("|");
      if (i < 0) return null;
      return F["*" + k.slice(i)] || null;
    }

    function layers(k) {
      const F = window.LightPresets || null;
      return [F && F["*"], sharedCond(F, k), F && k && F[k], condLayer(F), profiles["*"], k && profiles[k]];
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

    function base(k, d) {
      k = keyFor(d.id, k);
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
      if (profiles["*"] && typeof profiles["*"][d.id] === "number") v = profiles["*"][d.id];
      return clamp(v, d.min, d.max);
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
      if (reapply && !fromApplyRace && track && G.state !== "menu" && G.state !== "select")
        G.applyRaceSettings();
      if (reinit && G.isWetRoad()) G.initRainDrops();
    }

    // opts.holdRebuild (the weather arc's blended re-apply, js/lighting/atmosphere.js):
    // leave the `rebuild` knobs (lampDensity, poolEnergy, lampRadiusMul, bleedMul,
    // beamCone, beamCore, lampGapFill) and the bake inputs at their live values, so a mid-race weather flip never
    // nulls track._lights and re-bakes the lamp pools. They stay as the session
    // resolved them (track x time of day x the weather it started in) until the next
    // un-blended apply: a chip, a slider, a track load.
    // The lamp-bake inputs are held with them: LampBake.forTrack keys its bake on
    // (lights, LT.lampNearClamp, budget), and lampBake / tailLightEmit gate it.
    const BAKE_IDS = new Set(["lampNearClamp", "lampBake", "tailLightEmit"]);
    const held = (d) => !!d.rebuild || BAKE_IDS.has(d.id);
    function apply(fromApplyRace, opts) {
      if (Log.enabled("game", Log.DEBUG)) Log.debug("game", "LightStore.apply");
      const k = key();
      const L = layers(k), Ld = layers(keyFor("sunElev", k));
      const hold = !!(opts && opts.holdRebuild);
      let rebuilt = false, reapply = false, reinit = false;
      for (const d of TUNE_DEFS) {
        if (hold && held(d)) continue;
        let v = d.def;
        const Luse = TOD_KEYED.has(d.id) ? Ld : L;
        if (d.id === "perChunkLights") {
          const F = window.LightPresets || null;
          if (F && F["*"] && typeof F["*"].perChunkLights === "number") v = F["*"].perChunkLights;
          const shared = sharedCond(F, k);
          if (shared && typeof shared.perChunkLights === "number") v = shared.perChunkLights;
          v = mergePerChunkShipped(k, v, F);
          if (profiles["*"] && typeof profiles["*"].perChunkLights === "number") v = profiles["*"].perChunkLights;
          if (k && profiles[k] && typeof profiles[k].perChunkLights === "number") v = profiles[k].perChunkLights;
        } else for (const l of Luse) if (l && typeof l[d.id] === "number") v = l[d.id];
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
    //             presets in js/lighting/presets.js by design; that is the only thing
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
        const v = mode === "look" ? LT[d.id] : (profiles[keyFor(d.id, src)] || {})[d.id];
        if (typeof v === "number" && isFinite(v)) from.push([d, v]);
      }
      if (!from.length) return { ok: false, error: "no-edits", mode, key: src, tod, weather, tracks: 0, changed: 0 };
      const out = { ok: true, mode, key: src, tod, weather, knobs: from.length, tracks: 0, changed: 0, undo: {} };
      const list = (typeof Tracks !== "undefined" && Tracks.LIST) || [];
      for (const t of list) {
        if (!t || !t.id || t.id === srcId) continue;
        const k = t.id + "|" + tod + "|" + weather;
        // A sun knob lands on the target's "|dry" profile (keyFor), which may be
        // a second key — snapshot each key once, before the first write.
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

    // RESET and the "(N tuned)" label must see the SAME slots set() writes: the
    // condition's own key, plus the "|dry" slot that holds the TOD_KEYED sun knobs
    // whatever the weather. Only those ids leave the dry slot on a wet RESET —
    // a dry-weather edit of any other knob is a different condition's edit.
    function sunSlot(k) { const s = keyFor("sunElev", k); return s !== k ? s : null; }
    function tuned() {
      const k = key();
      if (!k) return 0;
      const s = sunSlot(k), p = s && profiles[s];
      // In the wet, a TOD_KEYED id under the weather's own key is never resolved.
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
      key, apply, set, persist, copyToTracks, restore, tuned, reset,
      get profiles() { return profiles; },
      set profiles(v) { profiles = v || {}; },
    };
    _live = api;   // game.js creates exactly one store; reapply() targets it
    return api;
  }
  // The conditional shipped layer resolves through GfxQuality, so a preset
  // flip must re-run apply() for it to engage live. GfxQuality.set() calls
  // this lazily (typeof-guarded) — a soft hook, not an eval-time edge.
  let _live = null;
  function reapply() { if (_live) _live.apply(); }
  // The tuner panel reaches the live store through these (no G member for them).
  function reset() { if (_live) _live.reset(); }
  function tuned() { return _live ? _live.tuned() : 0; }
  return { create, reapply, reset, tuned };
})();
