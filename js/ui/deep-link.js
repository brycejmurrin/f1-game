/* Apex 26 — DeepLink: the installed-icon shortcuts (manifest.json `shortcuts`) land on `./?go=<door>`. Each door is a title button the
   player could have tapped; this clicks it once the title is live, then drops the param so a reload does not replay it. */
const DeepLink = (function () {
"use strict";
const DOORS = Object.freeze({ race: "mb-race", daily: "mb-daily", nextgp: "mb-data", garage: "mb-garage" });
const RETRY_MS = 250, MAX_TRIES = 40;   // boot / loading plate / first-run layers can sit over the title for a few seconds
function parse(search) {
  let go = null;
  try { go = new URLSearchParams(search || "").get("go"); } catch (_) { return null; }
  return go && Object.prototype.hasOwnProperty.call(DOORS, go) ? go : null;
}
function create(G) {
  const { $, els } = G;
  const go = parse(location.search);
  if (!go) return { go: null };
  try {
    const q = new URLSearchParams(location.search); q.delete("go");
    const rest = q.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  } catch (_) { /* file:/opaque origin: the param just stays */ }
  // Only the bare title takes a shortcut: a layer over it (consent, career hub, a picker) or a race keeps the player where they are.
  function titleLive() {
    if (UiLayers.inRace() || els.overlay.hidden) return false;
    const top = UiLayers.top();
    return !top || top.id === "overlay";
  }
  function afterHubOpens(tries) {
    const tab = $("dh-tab-schedule");
    if (tab) { tab.click(); return; }   // the hub remembers its last tab; NEXT GP always means the schedule
    if (tries < MAX_TRIES) setTimeout(() => afterHubOpens(tries + 1), RETRY_MS);
  }
  function fire(tries) {
    if (!titleLive()) {
      if (tries < MAX_TRIES) setTimeout(() => fire(tries + 1), RETRY_MS);
      else Log.info("game", "deep link dropped: title never became live (" + go + ")");
      return;
    }
    const btn = go === "race" ? $("mb-race") : go === "daily" ? $("mb-daily") : go === "nextgp" ? $("mb-data") : $("mb-garage");   // literal ids: the dynamic-id ratchet is shrink-only
    if (!btn || btn.hidden || btn.disabled) { Log.info("game", "deep link dropped: door unavailable (" + go + ")"); return; }
    btn.click();
    if (go === "nextgp") afterHubOpens(0);
  }
  fire(0);
  return { go };
}
return { create, parse, DOORS };
})();
Object.freeze(DeepLink);
