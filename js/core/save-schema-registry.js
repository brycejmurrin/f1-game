/* Apex 26 — SaveSchemaRegistry: manifest of every apex26.* persistence key.
   Owner module, schema version, lane (json | raw), and a validator id. Settings
   rows are ingested from SettingsExport.SPEC at eval; everything else is listed
   here as EXACT keys or PREFIX patterns. GameStore.write/rawSet consults
   resolve() when present; tests/unit/save-schema-registry.test.mjs fails on any
   write site the manifest does not cover. */
const SaveSchemaRegistry = (function () {
  "use strict";

  function shortKey(k) {
    return typeof k === "string" && k.indexOf("apex26.") === 0 ? k.slice("apex26.".length) : k;
  }

  const validators = {
    json() { return true; },
    rawScalar(v) { return v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"; },
    bool(v) { return v === true || v === false; },
    onOff(v) { return v == null || v === "on" || v === "off"; },
    string(v) { return v == null || typeof v === "string"; },
    careerSlot(v) { return typeof v === "string" && /^(driver|myteam):[0-2]$/.test(v); },
    season(v) { return v == null || (typeof v === "object" && !Array.isArray(v)); },
    ttlb(v) {
      if (v == null) return true;
      if (Array.isArray(v)) return true;
      return typeof v === "object" && (v.v === 2 || Array.isArray(v.laps));
    },
    career(v) {
      if (typeof SaveMigrate !== "undefined" && SaveMigrate.validateCareerSave) return SaveMigrate.validateCareerSave(v);
      return v == null || (typeof v === "object" && !Array.isArray(v));
    },
    disposable() { return true; },
  };

  function entry(owner, lane, v, validate) {
    return { owner, lane, v: v | 0 || 1, validate: validators[validate] || validators.json };
  }

  const PREFIX = [
    { re: /^parts\./, owner: "js/garage/setup-sheet.js", lane: "json", v: 1, validate: validators.json },
    { re: /^livery\./, owner: "js/car/custom-liveries.js", lane: "json", v: 1, validate: validators.json },
    { re: /^setup\./, owner: "js/garage/setup-tune.js", lane: "json", v: 1, validate: validators.json },
    { re: /^ttlb\./, owner: "js/core/store.js", lane: "json", v: 2, validate: validators.ttlb },
    { re: /^career\.(driver|myteam)\.[0-2]$/, owner: "js/career/career.js", lane: "json", v: 1, validate: validators.career },
    { re: /^api\./, owner: "js/data/api-transport.js", lane: "json", v: 1, validate: validators.disposable },
    { re: /^realrace\./, owner: "js/data/real-race-tab.js", lane: "json", v: 1, validate: validators.disposable },
    { re: /^ghost\./, owner: "js/car/ghost.js", lane: "json", v: 1, validate: validators.json },
    { re: /^pitPlan\./, owner: "js/race/pit-lane.js", lane: "json", v: 1, validate: validators.json },
    { re: /^spotify\./, owner: "js/audio/spotify.js", lane: "raw", v: 1, validate: validators.rawScalar },
  ];

  const EXACT = {
    "badges": entry("js/career/badges.js", "json", 1, "json"),
    "bcPip": entry("js/render/shared/mirror-pass.js", "json", 1, "json"),
    "camComfortPref": entry("js/camera/cam-comfort.js (device-derived touch default; not in SettingsExport.SPEC, so no backup)", "raw", 1, "onOff"),
    "breakBarriers": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "c1Pileup": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "carWarmSlice": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "career": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "json", 1, "json"),
    "career.freeMoney": entry("js/career/career.js", "json", 1, "bool"),
    "careerSlot": entry("js/career/career.js", "json", 1, "careerSlot"),
    "circuitMastery": entry("js/race/race-insights.js", "json", 1, "json"),
    "customTeam": entry("js/career/custom-team.js", "json", 1, "json"),
    "daily.v1": entry("js/race/daily-challenge.js", "json", 1, "json"),
    "debrisCap": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "designerCoached": entry("js/editor/designer.js (first-open card seen; device-local tutorial flag, not in SettingsExport.SPEC, so no backup)", "json", 1, "bool"),
    "devApi": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "driver": entry("js/garage/setup-sheet.js", "json", 1, "json"),
    "envProbeOff": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "renderRate": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag, #2652)", "raw", 1, "rawScalar"),
    "thermalDrift": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag, #2652)", "raw", 1, "rawScalar"),
    "incidentLog": entry("js/race/race-insights.js", "json", 1, "json"),
    "fieldLod": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "flySkips": entry("js/ui/loading-screen.js", "json", 1, "json"),
    "forceMobileTier": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "json", 1, "json"),
    "freeTurn": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "garageTab": entry("js/garage/setup-sheet.js", "json", 1, "json"),
    "gfxBackendProbe": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "gfxDebug": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "inspector": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "gpuCapture": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag, #2964 Spector/webgl-lint)", "raw", 1, "rawScalar"),
    "gfxTlxFail": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "gfxWgxFail": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "gfxWgxLevel": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "gfxWgxLite": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "gfxWgxOk": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "glErrDrain": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "json", 1, "json"),
    "glxChunkAlign": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "glxInstPerPass": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "glxPerspScalar": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "grLite": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "homeVisit": entry("js/ui/experience.js", "json", 1, "json"),
    "lang": entry("js/core/i18n.js (active locale; picker/export deferred until shipped languages land)", "json", 1, "string"),
    "iceRelayOnly": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "inputDebug": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "instCellCache": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "installChipSeen": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "iosInstallSeen": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "liveryAsync": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "marbleGrip": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "mirrorInstEvery": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "modelInst": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "moonShadowCadence": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "json", 1, "json"),
    "multiDraw": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "musicStream": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "nostrRelays": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "perChunkOff": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "pitTaught": entry("js/race/pit-lane.js", "json", 1, "json"),
    "propsUnchunked": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "r2Airborne": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "r3Contact": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "records": entry("js/career/career-backup.js", "json", 1, "json"),
    "saveProbe": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "season": entry("js/career/season-cal.js", "json", 1, "season"),
    "spatialUpscaleGather": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "ssrDayGate": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "team": entry("js/garage/setup-sheet.js", "json", 1, "json"),
    "tlxAoFold": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxArrayNearest": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxAttrInst": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxBloom11": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxCasterAttr": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxChunkMerge": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxChunkRelease": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxCoalesce": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxDepthDiscard": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxDrawWarm": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxDynUsage": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxForceBatches": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxForceHw": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxInstPad": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxLampStatic": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxMirFold": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxMirLampCap": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxMirMips": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxMirWarmLazy": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxMirrorSweep": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxMobile": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxPack": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxPad4": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxPartWrap": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxPoolRoot": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxPostFixedMats": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxRoadNormalV2": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxShadowOff": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxSharedTex": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxSharedUniforms": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxSkipBatches": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxSkyCache": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxSkyCache512": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxTagLess": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxViz": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxWarmFx": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "tlxWarmPlus": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "track": entry("js/game.js", "json", 1, "json"),
    "trackFilter": entry("js/ui/select-screen.js", "json", 1, "json"),
    "trackId": entry("js/game.js", "json", 1, "string"),
    "turn": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "turnApi": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "wgxCapture": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "wgxInsetInPass": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "wgxPackAsync": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    "wgxTransient": entry("docs/DEBUG-HOOKS.md (hand-set dev / perf flag)", "raw", 1, "rawScalar"),
    onboarded: entry("js/ui/onboard.js", "json", 1, "json"),
    onboardRaces: entry("js/ui/onboard.js", "json", 1, "json"),
    customTracks: entry("js/editor/custom-tracks.js", "json", 1, "json"),
    customTrackDraft: entry("js/editor/custom-tracks.js", "json", 1, "json"),
    customTrackDraftPrev: entry("js/editor/custom-tracks.js", "json", 1, "json"),
    raceActive: entry("js/perf/governor.js", "raw", 1, "rawScalar"),
    raceTicked: entry("js/perf/governor.js", "raw", 1, "rawScalar"),
    crashStrikes: entry("js/perf/governor.js", "raw", 1, "rawScalar"),
    crashStrikesBuild: entry("js/perf/governor.js", "raw", 1, "rawScalar"),
    crashSeen: entry("js/perf/governor.js", "raw", 1, "rawScalar"),
    crashSeenBuild: entry("js/perf/governor.js", "raw", 1, "rawScalar"),
    customLogo: entry("js/career/custom-team.js", "json", 1, "json"),
    carSmooth: entry("js/car/car-shade.js", "raw", 1, "rawScalar"),
    freecamMarks: entry("js/camera/photo-kit.js", "json", 1, "json"),
    gfxProbeStrikes: entry("js/render/renderer-boot.js", "raw", 1, "rawScalar"),
    "inputGhost.v1": entry("js/car/input-ghost.js", "json", 1, "json"),
    lastSession: entry("js/ui/share-code.js", "json", 1, "json"),
    logLevel: entry("js/core/log.js", "raw", 1, "rawScalar"),
    photoBackground: entry("js/ui/photo-studio.js", "json", 1, "json"),
    rendezvous: entry("js/net/rendezvous.js", "raw", 1, "rawScalar"),
    seasonCfg: entry("js/career/season-cal.js", "json", 1, "season"),
    shareUndo: entry("js/ui/share-code.js", "json", 1, "json"),
    xrEnterPending: entry("js/xr/xr-boot.js", "raw", 1, "rawScalar"),
    xrPrevBackend: entry("js/xr/xr-boot.js", "raw", 1, "rawScalar"),
  };

  let _settings = null;
  let _settingsMap = null;

  function ingestSettingsSpec(spec) {
    _settings = spec;
    _settingsMap = new Map();
    if (!spec) return;
    for (const row of spec) {
      if (!row || !row.k) continue;
      const owner = String(row.src || "js/ui/settings-export.js").split(" ")[0];
      const validate = row.lane === "raw" ? validators.rawScalar : validators.json;
      _settingsMap.set(row.k, { owner, lane: row.lane || "json", v: 1, validate, group: row.group });
    }
  }

  function resolve(k) {
    k = shortKey(k);
    if (_settingsMap && _settingsMap.has(k)) return _settingsMap.get(k);
    if (EXACT[k]) return EXACT[k];
    for (const p of PREFIX) if (p.re.test(k)) return p;
    return null;
  }

  function validateKey(k, value, lane) {
    const e = resolve(k);
    if (!e) return false;
    try { return e.validate(value); } catch (_) { return false; }
  }

  let strict = false;
  function noteWrite(k, lane) {
    const e = resolve(k);
    if (e) return e;
    const msg = "unregistered save key apex26." + shortKey(k);
    if (strict) throw new Error(msg);
    if (typeof Log !== "undefined") Log.warn("game", msg);
    return null;
  }

  return {
    PREFIX, EXACT, validators, resolve, validateKey, noteWrite, ingestSettingsSpec,
    get strict() { return strict; },
    set strict(v) { strict = !!v; },
    get settingsSpec() { return _settings; },
  };
})();
Object.freeze(SaveSchemaRegistry);
