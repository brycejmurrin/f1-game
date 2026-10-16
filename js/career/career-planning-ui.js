/* Read-only Career planning cards and explicit local save recovery actions. */
const CareerPlanningUI = (function () {
  "use strict";
  function append({ left, objective, factory, rebuild, el, row }) {
    const p = Career.planning();
    if (!p) return;
    const card = (title) => { const n = el("div", "cr-card"); n.appendChild(el("h3", "sel-label", title)); return n; };
    const note = (n, text) => n.appendChild(el("p", "cr-note", text));
    const button = (n, label, action, disabled) => {
      const b = el("button", "cr-obj-pick", label); b.type = "button"; b.disabled = !!disabled;
      b.onclick = action; n.appendChild(b); return b;
    };
    function download(text, name) {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const protection = p.protection();
    if (protection || Career.conflicted()) {
      const n = card(protection ? "SAVE PRESERVED — CALENDAR UNAVAILABLE" : "COMPARE SAVE CONFLICT");
      const cmp = p.comparison();
      if (protection) note(n, "This save is read-only. Missing or invalid circuits: " + (protection.missing.join(", ") || "unsupported save/calendar") + ". Racing and spending are paused; the original saved JSON remains available.");
      for (const [label, summary] of [["This tab", cmp.localSummary], ["Stored save", cmp.storedSummary]])
        note(n, label + ": " + (summary ? `${summary.year} · ${summary.team} · round ${summary.round + 1} · ${summary.money} cr · ${summary.rep} reputation · ${summary.results} results` : "Unavailable"));
      button(n, protection ? "Download original saved JSON" : "Download this tab's JSON", () => download(cmp.rawLocal, "apex26-career-local.json"));
      if (cmp.rawStored != null) button(n, "Download stored JSON", () => download(cmp.rawStored, "apex26-career-stored.json"));
      button(n, "Reload stored save", () => { Career.load({ persist: false }); rebuild(); });
      if (protection) {
        let armed = false;
        const b = button(n, "Adopt available calendar…", () => {
          if (!armed) { armed = true; b.textContent = "Confirm adoption and removed-round data loss";
            note(n, "Adoption removes unavailable circuits, their round results and per-round points. The active brief is recalculated for its remapped round; its locked stake stays locked. If none remain, season progress resets. Download the original first. A changed stored revision refuses adoption."); return; }
          if (!p.adopt()) note(n, "Adoption refused or could not be stored durably. Original remains protected.");
          else rebuild();
        });
      }
      left.appendChild(n);
      return;
    }
    const t = p.transition();
    if (t) {
      const n = card("NEXT REGULATIONS");
      note(n, `${t.name} in ${t.seasons} seasons. Researched inventory stays yours; default substitutions cost 0 cr.`);
      if (!t.changes.length) note(n, "No currently fitted part is affected.");
      for (const x of t.changes) n.appendChild(row(x.category, `${x.from} → ${x.to} · free to fit`));
      left.appendChild(n);
    }
    const sp = Career.sponsor();
    if (sp) {
      const n = card("SPONSOR OPTIONS");
      note(n, sp.possible ? "Current target remains achievable." : "TARGET LOST — remaining rounds cannot meet this target.");
      const locked = Career.objectiveLocked() || Career.round() !== sp.start;
      for (const offer of p.sponsorOffers()) {
        const b = button(n, `${offer.chosen ? "SELECTED · " : ""}${offer.label} · ${offer.pay} cr`, () => { if (p.chooseSponsor(offer.i)) rebuild(); }, locked);
        b.setAttribute("aria-pressed", String(offer.chosen));
      }
      note(n, locked ? "Sponsor choice is locked for this window." : "Choose before the first weekend; both offers use the same window.");
      left.appendChild(n);
    }
    const last = p.lastSponsor();
    if (last) { const n = card(last.met ? "SPONSOR TARGET MET" : "SPONSOR TARGET MISSED"); note(n, `${last.label} · ${last.done}/${last.need} · ${last.met ? last.pay : 0} cr`); left.appendChild(n); }
    if (objective) {
      const committed = p.stake(Career.round()) > 0;
      note(objective, "Standard: +150 cr when met. Committed: lock 50 game credits at weekend start; success pays 250 cr, failure loses only that 50. Reputation and race prizes follow the usual rules.");
      for (const [value, label] of [[false, "Standard"], [true, "Committed · 50 cr stake"]]) {
        const b = button(objective, label, () => { if (p.chooseStake(value)) rebuild(); }, Career.objectiveLocked());
        b.setAttribute("aria-pressed", String(value === committed));
      }
    }
    const f = p.factory();
    if (factory && f) {
      note(factory, `${f.savings.toLocaleString()} cr estimated savings across ${f.count} legal unowned catalog parts. ${f.count ? "Future regulation inventory excluded." : "No remaining catalog savings."}`);
      appendCash(factory, Career.facilityCost());
    }
    function appendCash(n, price, proposedWages) {
      const cash = p.cash(price, proposedWages);
      if (!cash) return;
      note(n, cash.unlimited ? "Unlimited funds mode — spending does not reduce the balance." :
        `${cash.afterPurchase.toLocaleString()} cr after purchase · ${cash.wages} cr upcoming wages · next-round balance ${cash.low.toLocaleString()}–${cash.high.toLocaleString()} cr before salary/bonus. Sponsor income is not guaranteed. The balance floors at zero; this estimate never blocks a purchase.`);
    }
    const n = card("NEXT-ROUND CASH"); appendCash(n, 0); left.appendChild(n);
  }
  function cashNote(n, price, wages) {
    const p = Career.planning(); if (!p) return;
    const cash = p.cash(price, wages); if (!cash) return;
    n.appendChild(Dom.el("span", "cr-note", cash.unlimited ? "Unlimited funds" :
      `${cash.afterPurchase.toLocaleString()} cr after purchase · ${cash.wages} cr / round wages · conservative next balance ${cash.low.toLocaleString()} cr (before income; floors at zero)`));
  }
  return { append, cashNote };
})();
Object.freeze(CareerPlanningUI);
