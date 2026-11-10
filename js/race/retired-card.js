/* Apex 26 — RETIRED CARD (RetiredCard). A retired solo player had no way to the
   results: SKIP TO RESULTS lived only in the pause menu, and the race runs on for
   up to RaceControl's POST_FINISH_CAP s after a retirement with the full touch
   driving HUD still up and no word on screen (audit W34, 2026-11-10). This card
   says RETIRED, hides the driving controls (body[data-retired-wait]) and offers the
   pause menu's own SKIP TO RESULTS button — it clicks #pm-skip-results, so the
   two can never disagree about when skipping is allowed (game.js skipToResults).

   Driven per race frame by RaceControl's update (create(G)'s adapter builds the
   view; update() runs only in a race). It hides itself when those ticks stop —
   a pause, the results, a quit — so no other screen has to know it exists.
   LAZY_RACE_SESSION: the adapter typeof-guards it. */
var RetiredCard = (function () {
  "use strict";
  const STALE_MS = 400;   // no tick for this long: not in a running race any more
  let shown = false, lastTick = 0, watch = 0;

  // The pure rule. A solo Grand Prix (not a room, not WATCH, not a lone lap)
  // whose player car is retired and did not finish.
  function wanted(v) {
    if (!v || v.state !== "race" || v.session !== "race" || v.net || v.watch || v.timeTrial) return false;
    const p = v.player;
    return !!(p && p.retired && !p.finished);
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

  function show(on) {
    const card = els();
    if (!card || on === shown) return;
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
    show(wanted(v));
  }

  // RaceControl's adapter: the view off the façade, one reused object per frame.
  const view = { state: "", session: "", timeTrial: false, net: false, watch: false, player: null };
  function tickG(G) {
    const rr = G.realRace && G.realRace.status ? G.realRace.status() : null;
    view.state = G.state; view.session = G.session; view.timeTrial = !!G.timeTrial;
    view.net = !!(G.netPlay && G.netPlay.active()); view.watch = !!(rr && rr.watch); view.player = G.player;
    tick(view);
  }

  return { wanted, tick, tickG, hide: () => show(false), get shown() { return shown; } };
})();
