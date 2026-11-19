var RetiredCard = (function () {
  "use strict";
  const STALE_MS = 400;
  let shown = false, lastTick = 0, watch = 0;

  function wanted(v) {
    if (!v || v.state !== "race" || v.session !== "race" || v.net || v.watch || v.timeTrial) return false;
    const p = v.player;
    return !!(p && p.retired && !p.finished);
  }

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
      if (skip) skip.click();
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

  const view = { state: "", session: "", timeTrial: false, net: false, watch: false, player: null };
  function tickG(G) {
    const rr = G.realRace && G.realRace.status ? G.realRace.status() : null;
    view.state = G.state; view.session = G.session; view.timeTrial = !!G.timeTrial;
    view.net = !!(G.netPlay && G.netPlay.active()); view.watch = !!(rr && rr.watch); view.player = G.player;
    tick(view);
  }

  return { wanted, tick, tickG, hide: () => show(false), get shown() { return shown; } };
})();
Object.freeze(RetiredCard);
