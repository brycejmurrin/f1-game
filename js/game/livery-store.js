"use strict";
/* Apex 26 — livery store + resolve.
   LiveryStore.create(G). Extracted from game.js: chosen paint-job id, player
   custom list, catalog concat, and resolveLivery (draft override + rev cache).
   G already owned store / livDraftOverride / the five helpers setup-ui reads.
   wingColorOf / drawAeroFlaps stay in game.js (car-draw seam).

   Must load BEFORE js/game.js (see index.html / tools/manifest.cjs). */
const LiveryStore = (() => {
  function create(G) {
    Log.info("ui", "LiveryStore.create");
    const { store } = G;

    function getLiveryId(teamId) { return store.get("livery." + teamId, "default"); }
    function saveLiveryId(teamId, id) { store.set("livery." + teamId, id); }
    // Player-created liveries, stored per team as [{id,name,c1,c2,stripe?}].
    function getCustomLiveries(teamId) { return store.get("livery.custom." + teamId, []); }
    function setCustomLiveries(teamId, arr) { store.set("livery.custom." + teamId, arr); }
    // Full paint-job list for a team: catalog (default + specials + universal) + the
    // player's own creations.
    function getLiveries(team) { return Liveries.forTeam(team).concat(getCustomLiveries(team.id)); }
    // Memoized per team.id, invalidated by store.rev — during a race this resolves to
    // a cached object with zero localStorage access and zero per-frame allocation.
    const _livResolveCache = new Map();
    // Resolve a team's chosen paint job -> { c1, c2, stripe } bodywork colours (its
    // own team colours for "default"). Everything that builds a car mesh paints with
    // these. Transient un-saved creator paint is G.livDraftOverride: { teamId, liv }.
    function resolveLivery(team) {
      const draft = G.livDraftOverride;
      if (draft && draft.teamId === team.id) {
        const l = draft.liv;
        return { c1: l.c1, c2: l.c2, stripe: l.stripe || null, accent: l.accent || null,
                 nose: l.nose || null, pod: l.pod || null, wing: l.wing || null, halo: l.halo || null,
                 fin: l.fin || null, finArt: l.finArt || null, logo: l.logo || null,
                 noseStripe: l.noseStripe || null, finish: l.finish || null };
      }
      const c = _livResolveCache.get(team.id);
      if (c && c.rev === store.rev) return c.val;
      const liv = getLiveries(team).find((l) => l.id === getLiveryId(team.id));
      // Optional livery detail colours (nose cap, sidepod panel, wing flaps, halo tint)
      // — additive, so an unmodified livery still resolves to today's exact object shape.
      const val = liv ? { c1: liv.c1, c2: liv.c2, stripe: liv.stripe || null, accent: liv.accent || null,
                          nose: liv.nose || null, pod: liv.pod || null, wing: liv.wing || null, halo: liv.halo || null,
                          fin: liv.fin || null, finArt: liv.finArt || null, logo: liv.logo || null,
                          noseStripe: liv.noseStripe || null, finish: liv.finish || null }
                      : { c1: team.color, c2: team.color2, stripe: null, accent: null };
      _livResolveCache.set(team.id, { val, rev: store.rev });
      return val;
    }

    return { getLiveryId, saveLiveryId, getCustomLiveries, setCustomLiveries,
             getLiveries, resolveLivery };
  }
  return { create };
})();
