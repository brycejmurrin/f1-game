/* Apex 26 — DrillCard: a LEARN drill's result card and its one medal store (#6559 §1b, step 2; #7039).
   medalOf(r, tiers) is pure. tiers = {bronze, silver, gold, goldClean} in the result's own unit, better = "high"
   (metres closed). goldClean: gold also needs a clean run. Tiers come from VM rollouts
   (tests/data/learn-drill-refs.json) and are re-tuned from Bryce's phone runs (#6559 decision 5).
   record(store, key, r) keeps {best, medal, n} per "<drill>|<variant>" under apex26.learnMedals.v1. It is LEARN-only:
   no career currency, and it never writes circuitMastery.
   show(r, {retry, back, next?}) builds the card over the race. It is one column with at most 6 metric rows, and its
   buttons are RETRY (focused), next.label (the drill's next variant: "RE-RUN IN CFD AIR", #6559 A6) and BACK TO LESSON (min-height var(--tap), 44 px or more on a phone: css/overlays.css
   #drill-card). Like the thumb drill's lap card it is not a modal layer: the race and its pause menu stay as they were.
   R retries, Esc or Enter on BACK goes back. LAZY_LEARN, with registry.js. */
const DrillCard = (function () {
  "use strict";

  const KEY = "learnMedals.v1";
  const RANK = { gold: 3, silver: 2, bronze: 1 };
  const LABEL = { gold: "GOLD", silver: "SILVER", bronze: "BRONZE" };

  /** The medal a run earns: "gold" | "silver" | "bronze" | null. */
  function medalOf(r, tiers) {
    const v = r && Number.isFinite(r.value) ? r.value : -Infinity;
    if (!tiers || (tiers.cleanRequired && !(r && r.clean))) return null;   // cleanRequired: an unclean run earns nothing (charge.js)
    if (v >= tiers.gold && (!tiers.goldClean || r.clean)) return "gold";
    if (v >= tiers.silver) return "silver";
    if (v >= tiers.bronze) return "bronze";
    return null;
  }

  function read(store) {
    const all = store && store.get(KEY, null);
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  }

  /** Persist one run. Returns the saved row and whether it beat the old best. */
  function record(store, key, r) {
    const all = read(store), old = all[key];
    const hadBest = !!(old && Number.isFinite(old.best));
    const best = hadBest ? Math.max(old.best, r.value) : r.value;
    const oldMedal = old && RANK[old.medal] ? old.medal : null;
    const medal = (RANK[r.medal] || 0) > (RANK[oldMedal] || 0) ? r.medal : oldMedal;
    const row = { best: +best.toFixed(2), medal, n: Math.min(9999, ((old && old.n) | 0) + 1) };
    store.set(KEY, { ...all, [key]: row });
    return { row, improved: hadBest && r.value > old.best };
  }

  /** The best medal saved for any variant of these drills (the LEARN index). */
  function bestMedal(store, drillIds) {
    let top = null;
    for (const [key, row] of Object.entries(read(store))) {
      if (!drillIds.includes(key.split("|")[0]) || !RANK[row && row.medal]) continue;
      if (!top || RANK[row.medal] > RANK[top]) top = row.medal;
    }
    return top;
  }

  let card = null;
  let onKey = null;

  function hide() {
    if (onKey) document.removeEventListener("keydown", onKey, true);
    onKey = null;
    if (card) card.remove();
    card = null;
  }

  /** r: {title, value, unit, clean, reason, medal, metrics: [[label, value, unit]], verdict, improved, best}. */
  function show(r, actions) {
    hide();
    card = document.createElement("div");
    card.id = "drill-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-labelledby", "drill-card-title");
    card.setAttribute("data-esc-close", "drill-card-back");
    const title = document.createElement("strong");
    title.id = "drill-card-title";
    title.textContent = (r.title || "Drill").toUpperCase();
    const medal = document.createElement("p");
    medal.id = "drill-card-medal";
    medal.setAttribute("role", "status");
    medal.dataset.medal = r.medal || "none";
    medal.textContent = (r.medal ? LABEL[r.medal] : "NO MEDAL") + " · " + r.value.toFixed(1) + " " + r.unit
      + (r.improved ? " · NEW BEST" : Number.isFinite(r.best) ? " · best " + r.best.toFixed(1) + " " + r.unit : "");
    const rows = document.createElement("dl");
    rows.id = "drill-card-metrics";
    for (const [label, value, unit] of (r.metrics || []).slice(0, 6)) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value + (unit ? " " + unit : "");
      rows.append(dt, dd);
    }
    const verdict = document.createElement("p");
    verdict.id = "drill-card-verdict";
    verdict.textContent = r.verdict || "";
    const buttons = document.createElement("div");
    buttons.id = "drill-card-actions";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.id = "drill-card-retry";
    retry.textContent = "RETRY";
    const back = document.createElement("button");
    back.type = "button";
    back.id = "drill-card-back";
    back.textContent = "BACK TO LESSON";
    retry.addEventListener("click", () => { hide(); actions.retry(); });
    back.addEventListener("click", () => { hide(); actions.back(); });
    buttons.append(retry);
    if (actions.next) {
      const next = document.createElement("button");
      next.type = "button";
      next.id = "drill-card-next";
      next.textContent = actions.next.label;
      next.addEventListener("click", () => { hide(); actions.next.run(); });
      buttons.append(next);
    }
    buttons.append(back);
    card.append(title, medal, rows, verdict, buttons);
    document.body.append(card);
    // Desktop keys (#6559 §1e rule 5): R retries, Esc goes back to the lesson. Capture phase, before the race's
    // Escape-to-pause, only while the card is up.
    onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); back.click(); }
      else if ((e.key === "r" || e.key === "R") && !e.repeat) { e.preventDefault(); e.stopPropagation(); retry.click(); }
    };
    document.addEventListener("keydown", onKey, true);
    retry.focus();
    return card;
  }

  return { KEY, medalOf, read, record, bestMedal, show, hide, open: () => !!card };
})();
Object.freeze(DrillCard);
