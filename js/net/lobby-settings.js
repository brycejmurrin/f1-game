/* Apex 26 — LobbySettings: VS FRIEND race-settings normalise + custom-circuit
   wire payload. Peeled from NetLobby so room/transport state stays there and the
   settings schema (including size-bounded designer circuits for #1587) lives
   here. Follows the lobby-codes / lobby-roster peel pattern (#1655). */
"use strict";

const LobbySettings = (function () {

  const WEATHER = new Set(["dry", "wet", "rain", "overcast", "fog", "storm"]);
  const TIME_OF_DAY = new Set(["default", "dawn", "day", "dusk", "night"]);
  const DIFFICULTY = new Set(["easy", "normal", "hard"]);
  const GRID = new Set(["tier", "quali", "rev10", "revchamp", "random"]);   // game.js GRID_RULES
  const GRID_LABEL = Object.freeze({
    tier: "Pace order", quali: "Qualifying lap", rev10: "Reverse top 10",
    revchamp: "Reverse standings", random: "Random",
  });
  // [wire key, G prop, optional store key]. roomOnly rules keep the guest's
  // persisting tyre/reliability/dirtyAir/aiPace choice intact after the room.
  const RULES = Object.freeze([
    ["track", "trackIdx"], ["laps", "raceLaps"], ["quali", "raceQuali"], ["grid", "raceGrid"],
    ["changeable", "raceChangeable"], ["weather", "raceWeather"], ["tod", "raceTimeOfDay"], ["difficulty", "difficulty"],
    ["tyres", "raceTyreWear", "tyreWear"], ["reliab", "raceReliability", "reliability"],
    ["dirtyAir", "raceDirtyAir", "dirtyAir"], ["aiPace", "aiPace", "aiPace"], ["seed", "seed"], ["round", "raceRound"],
  ]);
  // Sanitised design JSON on the SETTINGS event — well under a data-channel
  // frame, and the same order of magnitude as TrackCodec.MAX_BYTES (16 KiB of
  // packed bytes expands when named). Hostile / oversized payloads are refused.
  const MAX_CIRCUIT_JSON = 24576;

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function customPicked(G) {
    return !!(Tracks.LIST && Tracks.LIST[G.trackIdx] && Tracks.LIST[G.trackIdx].custom);
  }

  /** Sanitise a stored design for the wire, or null when it will not travel. */
  function circuitPayload(design) {
    if (typeof CustomTracks === "undefined" || !CustomTracks.sanitize) return null;
    const it = CustomTracks.sanitize(design);
    if (!it) return null;
    let json;
    try { json = JSON.stringify(it); } catch (_) { return null; }
    if (!json || json.length > MAX_CIRCUIT_JSON) return null;
    return it;
  }

  /** Install a wire design into Tracks.LIST (ephemeral — not written to storage). */
  function installCircuit(design) {
    if (typeof CustomTracks === "undefined" || typeof TrackDef === "undefined" || !Tracks.LIST) return -1;
    const it = CustomTracks.sanitize(design);
    if (!it) return -1;
    let def;
    try { def = TrackDef.fromRaw(CustomTracks.toRaw(it)); }
    catch (_) { return -1; }
    let idx = Tracks.LIST.findIndex((t) => t && t.id === it.id);
    if (idx >= 0) Tracks.LIST[idx] = def;
    else { Tracks.LIST.push(def); idx = Tracks.LIST.length - 1; }
    return idx;
  }

  function normaliseSettings(d) {
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    const out = {};
    if (own(d, "circuit") && d.circuit != null) {
      if (typeof d.circuit !== "object" || Array.isArray(d.circuit)) return null;
      let json;
      try { json = JSON.stringify(d.circuit); } catch (_) { return null; }
      if (!json || json.length > MAX_CIRCUIT_JSON) return null;
      if (typeof CustomTracks === "undefined" || !CustomTracks.sanitize) return null;
      const it = CustomTracks.sanitize(d.circuit);
      if (!it) return null;
      out.circuit = it;
    }
    if (own(d, "track")) {
      if (out.circuit) {
        // Host publishes track:-1 with a circuit body; ignore a shipped index.
        if (!Number.isInteger(d.track) || d.track < -1) return null;
      } else {
        if (!Number.isInteger(d.track) || d.track < 0 || !Tracks.LIST || d.track >= Tracks.LIST.length || Tracks.LIST[d.track].custom) return null;
        out.track = d.track;
      }
    }
    if (own(d, "laps")) {
      // Friend races normally offer 3..the circuit's GP distance. Keep a
      // little protocol headroom for older/custom builds, but never accept a
      // fraction, infinity, string or session large enough to be abusive.
      if (!Number.isInteger(d.laps) || d.laps < 1 || d.laps > 200) return null;
      out.laps = d.laps;
    }
    if (own(d, "quali")) {
      if (typeof d.quali !== "boolean") return null;
      out.quali = d.quali;
    }
    if (own(d, "grid")) {
      if (typeof d.grid !== "string" || !GRID.has(d.grid)) return null;
      out.grid = d.grid;
    }
    if (own(d, "changeable")) {
      if (typeof d.changeable !== "boolean") return null;
      out.changeable = d.changeable;
    }
    if (own(d, "wxArc")) {
      const a = d.wxArc;
      if (a !== null) {
        if (!a || typeof a !== "object" || Array.isArray(a)) return null;
        if (typeof a.to !== "string" || !WEATHER.has(a.to)) return null;
        if (!Number.isInteger(a.dur) || a.dur < 30 || a.dur > 3600) return null;
      }
      out.wxArc = a === null ? null : { to: a.to, dur: a.dur };
    }
    if (own(d, "weather")) {
      if (typeof d.weather !== "string" || !WEATHER.has(d.weather)) return null;
      out.weather = d.weather;
    }
    if (own(d, "tod")) {
      if (typeof d.tod !== "string" || !TIME_OF_DAY.has(d.tod)) return null;
      out.tod = d.tod;
    }
    if (own(d, "difficulty")) {
      if (typeof d.difficulty !== "string" || !DIFFICULTY.has(d.difficulty)) return null;
      out.difficulty = d.difficulty;
    }
    if (own(d, "tyres") && d.tyres != null) {   // absent from an older host: keep ours
      if (typeof d.tyres !== "string" || (typeof TyreModel !== "undefined" && !TyreModel.isLevel(d.tyres))) return null;
      out.tyres = d.tyres;
    }
    if (own(d, "reliab") && d.reliab != null) {
      if (typeof d.reliab !== "string" || (typeof Reliability !== "undefined" && !Reliability.isLevel(d.reliab))) return null;
      out.reliab = d.reliab;
    }
    if (own(d, "dirtyAir") && d.dirtyAir != null) {
      if (typeof d.dirtyAir !== "string" || (typeof PhysicsConsts !== "undefined" && !PhysicsConsts.DirtyAir.isLevel(d.dirtyAir))) return null;
      out.dirtyAir = d.dirtyAir;
    }
    if (own(d, "aiPace") && d.aiPace != null) {
      if (typeof d.aiPace !== "string" || (typeof AiBand !== "undefined" && !AiBand.isMode(d.aiPace))) return null;
      out.aiPace = d.aiPace;
    }
    // simSeed() stores a uint32 and treats 0 as "unset" (game.js): accept
    // exactly the values the setter would keep.
    if (own(d, "seed")) {
      if (!Number.isInteger(d.seed) || d.seed < 1 || d.seed > 0xFFFFFFFF) return null;
      out.seed = d.seed;
    }
    if (own(d, "round")) {
      if (!Number.isInteger(d.round) || d.round < 0 || d.round > 1e6) return null;
      out.round = d.round;
    }
    return out;
  }

  return {
    WEATHER, TIME_OF_DAY, DIFFICULTY, GRID, GRID_LABEL, RULES, MAX_CIRCUIT_JSON,
    own, customPicked, circuitPayload, installCircuit, normaliseSettings,
  };
})();
Object.freeze(LobbySettings);
