"use strict";

const CustomLiveries = (function () {
  function normalizeImported(teamId, rows, selectedId) {
    const team = typeof Teams !== "undefined" && Teams.LIST
      ? Teams.LIST.find((t) => t && t.id === teamId) : null;
    const catalog = team && typeof Liveries !== "undefined" && Liveries.forTeam
      ? Liveries.forTeam(team) : [];
    const catalogIds = new Set(catalog.map((l) => l && l.id).filter((id) => typeof id === "string"));
    const used = new Set(catalogIds);
    for (const liv of Array.isArray(rows) ? rows : []) {
      if (liv && typeof liv.id === "string" && !catalogIds.has(liv.id)) used.add(liv.id);
    }
    const claimed = new Set();
    const nextSuffix = new Map();
    const remap = new Map();
    let repaired = 0;
    const liveries = (Array.isArray(rows) ? rows : []).filter((liv) => liv && typeof liv === "object").map((liv) => {
      const original = liv.id;
      if (!catalogIds.has(original) && !claimed.has(original)) { claimed.add(original); return liv; }
      const stem = ((original || "custom") + "_imported").slice(0, 64);
      let id = stem, n = nextSuffix.get(stem) || 2;
      while (used.has(id)) {
        const suffix = "_" + n++;
        id = stem.slice(0, 64 - suffix.length) + suffix;
      }
      nextSuffix.set(stem, n);
      used.add(id);
      if (!remap.has(original)) remap.set(original, id);
      repaired++;
      return Object.assign({}, liv, { id });
    });
    return {
      liveries,
      selectedId: liveries.some((liv) => liv.id === selectedId)
        ? selectedId : (remap.has(selectedId) ? remap.get(selectedId) : selectedId),
      repaired,
      catalogAvailable: !!team && typeof Liveries !== "undefined" && !!Liveries.forTeam,
    };
  }

  function coherentImportedSelection(teamId, rows, selectedId) {
    const team = typeof Teams !== "undefined" && Teams.LIST
      ? Teams.LIST.find((t) => t && t.id === teamId) : null;
    if (!team || typeof Liveries === "undefined" || !Liveries.forTeam) return selectedId;
    const catalog = Liveries.forTeam(team);
    const ids = new Set(catalog.map((l) => l && l.id).filter((id) => typeof id === "string"));
    for (const liv of Array.isArray(rows) ? rows : []) if (liv && typeof liv.id === "string") ids.add(liv.id);
    if (ids.has(selectedId)) return selectedId;
    return catalog[0] && typeof catalog[0].id === "string" ? catalog[0].id : selectedId;
  }

  function create(deps) {
    const { store } = deps;

    function identityOwner(teamId) {
      if (teamId !== "custom" || typeof Career === "undefined" || !Career.inCareer || !Career.inCareer()) return null;
      return Career.data && Career.data() && Career.data().flavour === "myteam" ? Career : null;
    }
    function identityValue(teamId, key, fallback) {
      const owner = identityOwner(teamId);
      return owner ? owner.identityValue(key, fallback) : store.get(key, fallback);
    }
    function setIdentityValue(teamId, key, value) {
      const owner = identityOwner(teamId);
      return owner ? owner.setIdentityValue(key, value) : store.set(key, value);
    }
    function getLiveryId(teamId) { return identityValue(teamId, "livery." + teamId, "default"); }
    function saveLiveryId(teamId, id) { return setIdentityValue(teamId, "livery." + teamId, id); }
    function getCustomLiveries(teamId) {
      const v = identityValue(teamId, "livery.custom." + teamId, []);
      return Array.isArray(v) ? v.filter((l) => l && typeof l === "object") : [];
    }
    function setCustomLiveries(teamId, arr) { return setIdentityValue(teamId, "livery.custom." + teamId, arr); }
    function getLiveries(team) { return Liveries.forTeam(team).concat(getCustomLiveries(team.id)); }
    let livDraftOverride = null;
    const _livResolveCache = new Map();
    let _draftResolved = { src: null, val: null };
    function resolveLivery(team) {
      if (livDraftOverride && livDraftOverride.teamId === team.id) {
        if (_draftResolved.src !== livDraftOverride) _draftResolved = { src: livDraftOverride, val: pickLivery(migrateLivery(livDraftOverride.liv)) };
        return _draftResolved.val;
      }
      const owner = identityOwner(team.id), identityRev = owner ? owner.identityRevision() : 0;
      const c = _livResolveCache.get(team.id);
      if (c && c.rev === store.rev && c.identityRev === identityRev) return c.val;
      const list = getLiveries(team);
      const liv = list.find((l) => l.id === getLiveryId(team.id)) || list[0];
      const val = liv ? pickLivery(migrateLivery(liv)) : { id: "default", c1: team.color, c2: team.color2, stripe: null, accent: null };
      _livResolveCache.set(team.id, { val, rev: store.rev, identityRev });
      return val;
    }
    const LIVERY_FIELDS = ["stripe", "accent", "nose", "pod", "wing", "halo", "fin", "finArt", "logo", "logo2",
      "logo3", "noseStripe", "finish", "numFont", "sponsors", "finStyle", "finBadge", "spineLogo", "finShape",
      "tcam", "coverVents", "spineHeight", "spineSide", "rearWing", "wingCarbon", "cover", "spineTint", "sideTint",
      "sunTint", "bandTint2", "plateTint",
      "saddleTint", "coverBind", "finHandoff", "bodySplit", "lower", "upper",
    "patternTint", "patternSecond", "patternPlacement", "patternSide", "patternWidth", "patternRepeat",
    "patternOffset", "patternTaper", "patternOpacity", "patternRotation", "patternStretch", "patternWeight", "patternKey", "decalNoseTip", "decalCockpit", "decalPodTop", "decalHalo", "coverFinish", "wingFinish", "haloFinish",
    "mirrorTint", "rimTint", "caliperTint", "sidewallInk", "helmetBase", "helmetAccent",
    "podFinish", "finFinish", "mirrorFinish", "helmetStyle", "endplate", "crestStyle",
    "floorTint", "floorFinish", "suspTint", "suspFinish", "ductTint", "rimFinish", "deflectorTint",
    "cockpitTint", "gripTint", "noseFinish", "boardTint", "exhaustTint", "crestTone", "crestFrame",
    "ductFinish", "deflectorFinish", "cockpitFinish", "boardFinish", "aeroShape", "floorShape",
    "engineShape", "suspensionShape", "brakesShape", "tyresShape", "ersShape", "gearboxShape", "fuelShape", "exhaustShape", "cockpitShape", "wheelsShape", "bodyStyle"];
    function migrateLivery(l) {
      return (typeof Liveries !== "undefined" && Liveries.migratePaint)
        ? Liveries.migratePaint(Object.assign({}, l)) : l;
    }
    function pickLivery(l) {
      const v = { id: l.id || null, c1: l.c1, c2: l.c2 };
      for (let i = 0; i < LIVERY_FIELDS.length; i++) { const k = LIVERY_FIELDS[i]; v[k] = l[k] || null; }
      return v;
    }

    function wingColorOf(team) { return wingColorOfLivery(resolveLivery(team), team); }
    function wingColorOfLivery(liv, team) {
      return liv.wingCarbon === "carbon" ? CarMaterials.CARBON : (liv.wing || liv.c2 || team.color2);
    }

    const _factoryCache = new Map();
    function factoryLivery(team) {
      const c = _factoryCache.get(team.id);
      if (c && c.rev === store.rev && c.team === team) return c.val;
      const liv = Liveries.forTeam(team)[0];
      const val = liv ? pickLivery(migrateLivery(liv)) : { id: "default", c1: team.color, c2: team.color2, stripe: null, accent: null };
      _factoryCache.set(team.id, { val, rev: store.rev, team });
      return val;
    }

    return {
      getLiveryId, saveLiveryId, getCustomLiveries, setCustomLiveries,
      getLiveries, resolveLivery, factoryLivery, wingColorOf, wingColorOfLivery, pickLivery,
      get livDraftOverride() { return livDraftOverride; },
      set livDraftOverride(v) { livDraftOverride = v; },
    };
  }

  return { create, normalizeImported, coherentImportedSelection };
})();
Object.freeze(CustomLiveries);
