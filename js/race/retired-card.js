/* Solo post-finish shortcut. Use the pause menu’s handler for settlement. */
var RetiredCard = (function () {
  "use strict";
  const STALE_MS = 400;   // no tick for this long: not in a running race any more
  let shown = false, lastTick = 0, watch = 0;

  // The pure rule. A solo Grand Prix (not a room, not WATCH, not a lone lap)
  // whose player can leave the remaining field to the classification rules.
  function wanted(v) {
    if (!v || v.state !== "race" || v.session !== "race" || v.net || v.watch || v.timeTrial) return false;
    const p = v.player;
    return !!(p && (p.finished || p.retired) && !v.pending);
  }

  // Built on first show, not shipped in index.html: the shell-node ratchet
  // (tests/data/ratchets.json shellNodes) is shrink-only without the owner's label.
  function els() {
    if (typeof document === "undefined") return null;
    let card = document.getElementById("retired-card");
    if (card || !document.body) return card;
    card = document.createElement("div");
    card.id = "retired-card"; card.hidden = true;
    card.setAttribute("role", "status"); card.setAttribute("aria-live", "polite");
    const title = document.createElement("b"); title.textContent = "RETIRED";
    const sub = document.createElement("span"); sub.textContent = "The race runs on to the flag.";
    const btn = document.createElement("button"); btn.id = "retired-skip"; btn.type = "button"; btn.textContent = "SKIP TO RESULTS";
    btn.addEventListener("click", () => {
      const skip = document.getElementById("pm-skip-results");
      if (skip) skip.click();   // the pause menu's handler: one path to the results
    });
    card.append(title, sub, btn);
    document.body.appendChild(card);
    return card;
  }

  function show(on, finished) {
    if (on === shown) return;
    const card = els();
    if (!card) return;
    if (on) card.firstElementChild.textContent = finished ? "FINISHED" : "RETIRED";
    shown = on;
    card.hidden = !on;
    document.body.toggleAttribute("data-retired-wait", on);
    Log.info("ui", "RetiredCard " + (on ? "shown" : "hidden"));
    if (on) arm();
  }

  function arm() {
    if (watch || typeof requestAnimationFrame !== "function") return;
    const check = () => {
      watch = 0;
      if (!shown) return;
      if (performance.now() - lastTick > STALE_MS) { show(false); return; }
      watch = requestAnimationFrame(check);
    };
    watch = requestAnimationFrame(check);
  }

  function tick(v) {
    lastTick = typeof performance !== "undefined" ? performance.now() : Date.now();
    show(wanted(v), v.player?.finished);
  }

  // RaceControl's adapter: the view off the façade, one reused object per frame.
  const view = { state: "", session: "", timeTrial: false, net: false, watch: false, player: null };
  function tickG(G) {
    view.state = G.state; view.session = G.session; view.timeTrial = !!G.timeTrial;
    view.net = !!(G.netPlay && G.netPlay.active()); view.watch = !!(G.realRace && G.realRace.isWatch()); view.player = G.player;
    view.pending = !!(G.player && (G.player.finished || G.player.retired) && G.cars && RaceControl.finishPending(G.cars, G.raceT, G.lapsTarget, G.realRace.raceT0()));
    tick(view);
  }

  return { wanted, tick, tickG, hide: () => show(false), get shown() { return shown; } };
})();
Object.freeze(RetiredCard);
