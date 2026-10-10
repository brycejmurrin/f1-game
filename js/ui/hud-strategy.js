/* Apex 26 — the opt-in STRATEGY panel for GameHud.
   SETTINGS › DISPLAY › HUD › STRATEGY (js/ui/hud-elements.js, shipped off), placed by
   MOVE & SIZE (js/ui/hud-layout.js "strat"). Only in a RACE with TYRE WEAR on
   — no wear, no strategy.

   Four lines, all READ from the models that already own them:
     TYRES     the compound and the laps left at this driver's rate
               (G.tyres.lapsLeft / spent — js/physics/tyre-model.js)
     PIT LOSS  the stop's cost in seconds, caution-aware
               (G.pits.estimate(c).lossS, else lossS() — js/race/pit-lane.js)
     NEXT      the plan's next box lap and compound (G.pits.planInfo)
     UNDERCUT  a cue, shown only when the rule below says so

   THE UNDERCUT CUE (undercut(), pure): the car directly AHEAD in race order is
   within one pit loss (gap <= lossS, so a stop now and a faster out-lap is the
   way past), on the same lap, not already stopping, on OLDER tyres (more wear
   by at least UNDERCUT_WEAR of a set's life), and the player still has a stop
   in the plan — the cue never invents a stop the race cannot pay for. The gap
   is the gap chips' own measure (js/ui/hud.js): race distance over
   max(the player's speed, 0.26 x vTop).

   Pure core unit-tested in tests/unit/hud-strategy.test.mjs. tick(G, player)
   is the one js/ui/hud.js call, at the 10 Hz HUD tick; the rows are built at
   runtime inside the static #hud-strat (index.html). Reads only. */
const HudStrategy = (function () {
  "use strict";

  const UNDERCUT_WEAR = 0.05;   // the rival's set must be this much more worn (share of life)

  /** "~12 L" laps left, "GONE" past the set's life, "--" unknown. */
  function fmtLaps(left, spent) {
    if (spent >= 1) return "GONE";
    if (left == null || !Number.isFinite(left)) return "--";
    return "~" + Math.max(0, Math.min(99, Math.round(left))) + " L";
  }
  /** "~21 s" — a stop's cost, whole seconds. */
  function fmtLoss(s) {
    return s != null && Number.isFinite(s) && s > 0 ? "~" + Math.round(s) + " s" : "--";
  }
  /** The NEXT line from PitLane.planInfo's {next, code, stops}. */
  function fmtNext(pl) {
    if (!pl) return "--";
    if (pl.next == null) return pl.stops ? "DONE" : "NO STOP";
    return "L" + pl.next + (pl.code ? " " + pl.code : "");
  }
  /** The undercut rule (see the header). Every input a number or a bool. */
  function undercut(o) {
    if (!o || !o.hasRival || o.rivalInPit || o.rivalLapped) return false;
    if (!o.stopLeft) return false;
    if (!(o.gapS > 0) || !(o.lossS > 0) || o.gapS > o.lossS) return false;
    return (o.rivalWear || 0) - (o.myWear || 0) >= UNDERCUT_WEAR;
  }

  // ---- the DOM ------------------------------------------------------------
  const doc = typeof document !== "undefined" ? document : null;
  let root = null, nodes = null;
  const last = { tyre: "", loss: "", next: "", uc: null, ucWho: null, label: "" };
  const ctx = { hasRival: false, rivalInPit: false, rivalLapped: false, stopLeft: false, gapS: 0, lossS: 0, rivalWear: 0, myWear: 0 };

  function build() {
    root = doc && doc.getElementById("hud-strat");
    if (!root) return false;
    nodes = {};
    const row = (k, head) => {
      const el = doc.createElement("div");
      el.setAttribute("data-k", k);
      const h = doc.createElement("span"); h.textContent = head; el.appendChild(h);
      const v = doc.createElement("b"); el.appendChild(v);
      root.appendChild(el);
      nodes[k] = v; nodes[k + "Row"] = el;
    };
    row("tyre", "TYRES"); row("loss", "PIT LOSS"); row("next", "NEXT"); row("uc", "▲ UNDERCUT");
    nodes.ucRow.hidden = true;
    return true;
  }
  const isOn = () => typeof HudElements === "undefined" || HudElements.isOn("strat");
  function set(k, v) { if (last[k] !== v) { last[k] = v; nodes[k].textContent = v; return true; } return false; }

  /** js/ui/hud.js, once per HUD tick. Reads G; never writes a car. */
  function tick(G, player) {
    if (!doc || !player) return;
    if (!root && !build()) return;
    const tyres = G.tyres, pit = G.pits;
    const race = G.state === "race" && !G.timeTrial && !G.practice && G.session !== "quali";   // PRACTICE is the G.practice flag on a race session, never G.session
    if (!isOn() || !race || !tyres || !tyres.on() || player.retired) { if (!root.hidden) root.hidden = true; return; }
    const b = doc.body;
    if (b && (b.classList.contains("hud-prof-minimal") || b.classList.contains("hud-bcam") || b.classList.contains("bc-on"))) return;
    if (root.hidden) root.hidden = false;
    const spent = tyres.spent(player);
    const left = tyres.lapsLeft ? tyres.lapsLeft(player) : null;
    const code = (player.tyre && player.tyre.code) || "";
    let dirty = set("tyre", (code ? code + " " : "") + fmtLaps(left, spent));
    const est = pit && pit.estimate ? pit.estimate(player) : null;
    const lossS = est && est.lossS > 0 ? est.lossS : pit && pit.lossS ? pit.lossS() : NaN;
    dirty = set("loss", fmtLoss(lossS)) || dirty;
    const pl = pit && pit.planInfo ? pit.planInfo(player) : null;
    dirty = set("next", fmtNext(pl)) || dirty;
    // The car directly ahead in race order (G.ranked, as the gap chips read it).
    const ranked = G.ranked || [];
    let i = (player.rank || 0) - 1;
    if (ranked[i] !== player) i = ranked.indexOf(player);
    const a = i > 0 ? ranked[i - 1] : null;
    ctx.hasRival = !!a && !a.retired;
    if (ctx.hasRival) {
      const vFloor = Math.max(player.speed || 0, (G.vTop ? G.vTop() : 80) * 0.26);
      const total = G.track ? G.track.total : 0;
      const dist = (a.prog || 0) - (player.prog || 0);
      ctx.gapS = dist / vFloor;
      ctx.rivalLapped = total > 0 && dist >= total;   // a lap or more up the road: not a fight for this place
      ctx.rivalInPit = !!(a.pitState && a.pitState !== "none");
      ctx.rivalWear = tyres.spent(a);
    }
    ctx.myWear = spent;
    ctx.lossS = lossS;
    ctx.stopLeft = !pl || pl.next != null;
    const uc = undercut(ctx);
    if (uc !== last.uc || (uc && a !== last.ucWho)) {
      last.uc = uc; last.ucWho = uc ? a : null; dirty = true;
      nodes.ucRow.hidden = !uc;
      nodes.uc.textContent = uc ? (a.code || "") : "";
    }
    if (dirty) {
      root.setAttribute("aria-label", "Strategy: tyres " + last.tyre + ", pit loss " + last.loss + ", next stop " + last.next
        + (uc ? ", undercut on " + (a.code || "the car ahead") : ""));
    }
  }

  return Object.freeze({ UNDERCUT_WEAR, fmtLaps, fmtLoss, fmtNext, undercut, tick });
})();
