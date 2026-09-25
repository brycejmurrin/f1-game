/* Apex 26 — CustomLiveries: persist / resolve / live-draft paint jobs out of
   js/game.js. Catalog entries stay in Liveries (js/car/liveries.js); this module
   owns the player-created list, the chosen id, resolveLivery's store.rev cache,
   the creator's unsaved draft override, and wingColorOf. One
   CustomLiveries.create({ store }) at boot — deps seam, not a widened G. */
"use strict";

const CustomLiveries = (function () {
  function create(deps) {
    const { store } = deps;

    function getLiveryId(teamId) { return store.get("livery." + teamId, "default"); }
    function saveLiveryId(teamId, id) { store.set("livery." + teamId, id); }
    // Player-created liveries, stored per team as [{id,name,c1,c2,stripe?}].
    function getCustomLiveries(teamId) { return store.get("livery.custom." + teamId, []); }
    function setCustomLiveries(teamId, arr) { store.set("livery.custom." + teamId, arr); }
    // Full paint-job list for a team: catalog (default + specials + universal) + the
    // player's own creations.
    function getLiveries(team) { return Liveries.forTeam(team).concat(getCustomLiveries(team.id)); }
    // Resolve a team's chosen paint job -> { c1, c2, stripe } bodywork colours (its
    // own team colours for "default"). Everything that builds a car mesh paints with
    // these.
    // Transient un-saved paint job previewed live in the creator: { teamId, liv }.
    // Overrides the resolved livery for that one team while the creator is open.
    let livDraftOverride = null;
    // Memoized per team.id, invalidated by store.rev — during a race this resolves to
    // a cached object with zero localStorage access and zero per-frame allocation.
    const _livResolveCache = new Map();
    function resolveLivery(team) {
      // The live creator draft wins while it is open — through the same field list
      // as a saved livery, so no editor row can stop short of the atlas or mesh.
      // migratePaint folds the retired keys (ridge, airbox) and drops the retired
      // inks on the way in, so ONE list is still the only thing the atlas reads.
      if (livDraftOverride && livDraftOverride.teamId === team.id) return pickLivery(migrateLivery(livDraftOverride.liv));
      const c = _livResolveCache.get(team.id);
      if (c && c.rev === store.rev) return c.val;
      // A STORED ID THAT NO LONGER RESOLVES FALLS BACK TO THE TEAM'S OWN PAINT JOB.
      // list[0] is Liveries.forTeam's "default", carrying the team's whole livery
      // block; the bare `{ c1, c2 }` else-branch below dropped finShape/spineHeight/
      // spineSide, so a dangling id grew a shark fin instead of the car the team
      // races. Reachable via an imported garage file (js/ui/settings-export.js).
      const list = getLiveries(team);
      const liv = list.find((l) => l.id === getLiveryId(team.id)) || list[0];
      const val = liv ? pickLivery(migrateLivery(liv)) : { id: "default", c1: team.color, c2: team.color2, stripe: null, accent: null };
      _livResolveCache.set(team.id, { val, rev: store.rev });
      return val;
    }
    // The resolved paint-job shape, from a catalog entry or the creator's draft.
    // Optional detail colours are additive. Every live LIV_DRAFT_COLORS tint must be
    // listed. Dead keys (crestInk / plateInk / ridgeTint / airboxTint) are stripped
    // by Liveries.migratePaint before this runs — do not put them back.
    // A COPY of `Liveries.FIELDS` that had drifted by one row: `bodySplit`
    // (Cadillac's L/R body) was published and painted but missing here, so every
    // resolveLivery came back single-colour. team-livery.test.mjs now asserts the
    // two lists are the same set — the only thing that keeps a copy honest.
    const LIVERY_FIELDS = ["stripe", "accent", "nose", "pod", "wing", "halo", "fin", "finArt", "logo", "logo2",
      "logo3", "noseStripe", "finish", "numFont", "sponsors", "finStyle", "finBadge", "spineLogo", "finShape",
      "tcam", "coverVents", "spineHeight", "spineSide", "rearWing", "wingCarbon", "cover", "spineTint", "sideTint",
      "sunTint", "bandTint2", "plateTint",
      "saddleTint", "coverBind", "finHandoff", "bodySplit"];
    // A stored garage file may still carry the four RETIRED keys, so every read
    // path folds them once, here, and the list above never mentions them again:
    // RIDGE was the crown's centreline only and is now the BAND it always fell
    // back to; CREST INK and PLATE INK are auto-inked (see Liveries.migratePaint).
    // AIRBOX is DROPPED rather than folded onto `cover`: it painted the roll hoop
    // and intake lips ALONE, while `cover` paints the whole loft AND is the surface
    // the atlas inks the crest and every spine design against — promoting it would
    // repaint the cover and flip the crown ink on any file that set it.
    function migrateLivery(l) {
      return (typeof Liveries !== "undefined" && Liveries.migratePaint)
        ? Liveries.migratePaint(Object.assign({}, l)) : l;
    }
    function pickLivery(l) {
      const v = { id: l.id || null, c1: l.c1, c2: l.c2 };
      for (let i = 0; i < LIVERY_FIELDS.length; i++) { const k = LIVERY_FIELDS[i]; v[k] = l[k] || null; }
      return v;
    }

    // The colour a team's WING FLAP elements are painted — the same fallback chain
    // Car3D uses for `wingC` when it builds the baked front/rear wing planes, so the
    // moveable active-aero flap drawn over the crown matches the wing it belongs to
    // instead of being a differently-coloured bolt-on.
    function wingColorOf(team) {
      const liv = resolveLivery(team);
      // The moveable elements ARE the wing's own top flaps, so they take the wing's
      // own colour — Car3D paints the baked cascade with exactly this fallback
      // chain (`wingC`). Tinting them to stand out (an earlier attempt, back when
      // they were extra parts laid over the wing) would now make the car two-tone
      // at rest, which is a regression against a wing that used to be one colour.
      return liv.wing || liv.c2 || team.color2;
    }

    return {
      getLiveryId, saveLiveryId, getCustomLiveries, setCustomLiveries,
      getLiveries, resolveLivery, wingColorOf, pickLivery, migrateLivery,
      get livDraftOverride() { return livDraftOverride; },
      set livDraftOverride(v) { livDraftOverride = v; },
    };
  }

  return { create };
})();
Object.freeze(CustomLiveries);
