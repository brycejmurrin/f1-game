/* Apex 26 — small designer review tools. All writes use the caller's existing
   commit pipeline; previews and memory cards never change the design. */
const DesignerFollowup = (function () {
  "use strict";
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const key = (v) => JSON.stringify(v);
  function tab(b, id, tabs, select) {
    b.id = "td-tab-" + id; b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "td-panel-" + id);
    b.addEventListener("keydown", (ev) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(ev.key)) return;
      const list = tabs(), at = list.indexOf(b);
      const next = ev.key === "Home" ? 0 : ev.key === "End" ? list.length - 1 : (at + (ev.key === "ArrowRight" ? 1 : -1) + list.length) % list.length;
      ev.preventDefault(); select(["design", "library", "howto"][next]); list[next].focus();
    });
  }
  /** Construct a complete proposal or refuse it without changing any list. */
  function recipe(state, id) {
    const P = TrackDesignerProps, d = state && state.design;
    if (!d || !Number.isInteger(state.sel) || state.sel < 0 || state.sel >= d.pts.length) return { ok: false, reason: "Select a destination point first." };
    const start = P.pointFrac(d.pts, state.sel);
    let candidates;
    if (id === "corner") candidates = ["marshal", "camera"].map((kind, i) => ({ kind, s: start, side: i ? -1 : 1, gap: P.DEFAULT_GAP[kind] }));
    else if (id === "hedge") {
      if (!Number.isInteger(state.span) || state.span < 0 || state.span >= d.pts.length || state.span === state.sel) return { ok: false, reason: "Select an end point for the hedge section." };
      const end = P.pointFrac(d.pts, state.span), distance = ((end - start) % 1 + 1) % 1;
      if (distance < 1e-6) return { ok: false, reason: "Choose a section with a nonzero length." };
      candidates = [0, 0.5, 1].map((t) => ({ kind: "hedge", s: start + distance * t, side: 1, gap: P.DEFAULT_GAP.hedge }));
    } else return { ok: false, reason: "Unknown recipe." };
    const c = P.counts(d.props);
    if (c.total + candidates.length > P.TOTAL) return { ok: false, reason: "Recipe exceeds the total object limit." };
    for (const p of candidates) { if (++c[p.kind] > P.CAPS[p.kind]) return { ok: false, reason: "Recipe exceeds the " + P.LABELS[p.kind] + " limit." }; }
    const added = P.sanitize(candidates), props = (d.props || []).concat(added);
    return { ok: true, added, props, base: key([d, state.sel, state.span]) };
  }
  function recipePanel({ el, btn, getState, onApply }) {
    const root = el("div", "td-group"); root.dataset.role = "scenery-recipes";
    const text = el("div", "td-hint"), rows = el("ul", "td-issues"), controls = el("div", "td-chips");
    let pending = null;
    const cancel = () => { pending = null; rows.textContent = ""; apply.disabled = true; text.textContent = "Preview a recipe before placing its objects."; };
    const show = (id) => {
      pending = recipe(getState(), id); rows.textContent = ""; apply.disabled = !pending.ok;
      text.textContent = pending.ok ? pending.added.length + " objects · " + pending.props.length + "/" + TrackDesignerProps.TOTAL + " after placement" : pending.reason;
      for (const p of pending.added || []) rows.appendChild(el("li", "td-issue", TrackDesignerProps.LABELS[p.kind] + " · lap " + (p.s * 100).toFixed(4) + "% · " + (p.side < 0 ? "LEFT" : "RIGHT") + " · " + TrackDesignerProps.effectiveGap(p.kind, p.gap) + " m"));
      pending.id = id;
    };
    const apply = btn("APPLY RECIPE", "sel-edit", () => {
      if (!pending || !pending.ok) return false;
      const current = recipe(getState(), pending.id);
      if (!current.ok || current.base !== pending.base) { show(pending.id); text.textContent = "Selection or design changed. Review the updated preview."; return false; }
      if (onApply && onApply(clone(current.props))) { cancel(); return true; }
      return false;
    });
    controls.append(btn("PREVIEW MARSHAL + CAMERA", "sel-chip", () => show("corner")), btn("PREVIEW HEDGE SECTION", "sel-chip", () => show("hedge")), apply, btn("CANCEL RECIPE", "sel-chip", cancel));
    root.append(el("div", "td-label", "SECTION RECIPES"), controls, text, rows); cancel();
    return { root, refresh() { if (pending && pending.ok) { const s = getState(); if (key([s.design, s.sel, s.span]) !== pending.base) cancel(); } } };
  }
  function summary(v) {
    const issues = v && v.issues || [], length = v && v.tr && v.tr.total;
    return (v && v.ok ? "PASS" : "BLOCKED") + " · " + issues.filter((i) => i.level === "red").length + " red · " + issues.filter((i) => i.level === "amber").length + " amber · " + (Number.isFinite(length) ? Math.round(length) + " m" : "no built lap");
  }
  function repairPanel({ el, btn, getDesign, check, onApply }) {
    const root = el("div", "td-group"); root.dataset.role = "repair-preview"; root.hidden = true;
    const before = el("div", "td-hint"), after = el("div", "td-hint"), list = el("ul", "td-issues"), status = el("div", "td-hint"); status.setAttribute("role", "status");
    let pending = null;
    const cancel = () => { pending = null; root.hidden = true; };
    const apply = btn("APPLY REPAIR", "sel-edit", () => {
      if (!pending) return false;
      if (key(getDesign()) !== pending.base) { pending = null; apply.disabled = true; status.textContent = "Design changed. Cancel and preview the repair again."; return false; }
      const p = pending; cancel(); onApply(clone(p.design), p.codes, p.message); return true;
    });
    root.append(el("div", "td-label", "REPAIR PREVIEW"), before, after, list, status, apply, btn("CANCEL REPAIR", "sel-chip", cancel));
    return { root, cancel, preview(next, codes, message) {
      const current = getDesign(), proposal = clone(next); let a, b;
      try { a = check(clone(current)); b = check(proposal); } catch (_) { cancel(); return false; }
      pending = { base: key(current), design: proposal, codes: codes.slice(), message };
      before.textContent = "CURRENT · " + summary(a); after.textContent = "PROPOSED · " + summary(b); list.textContent = "";
      for (const [label, v] of [["Current", a], ["Proposed", b]]) for (const it of v.issues || []) list.appendChild(el("li", "td-issue", label + " · " + it.level + " · " + it.code + " · " + it.msg));
      status.textContent = "Review both verdicts. Applying may leave issues to resolve; UNDO restores the current design.";
      root.hidden = false; apply.disabled = false; apply.focus(); return true;
    } };
  }
  function learningPanel({ el, btn }) {
    const root = el("div", "td-group"); root.dataset.role = "corner-memory";
    const content = el("div", "td-chips"), hint = el("div", "td-hint", "Read-only Spa pilot: three curated apexes. Hide the labels and recall each turn's number and direction.");
    const open = btn("SPA CORNER MEMORY", "sel-chip", () => {
      if (content.children.length) { content.hidden = !content.hidden; open.setAttribute("aria-expanded", String(!content.hidden)); return; }
      try {
        const def = Tracks.LIST.find((d) => d.id === "spa"), tr = Tracks.buildCenterline(def, { line: false });
        for (const card of TrackInsight.memoryCards(tr, def.turns)) {
          const row = el("div", "td-card"), map = el("canvas"), label = el("div", "td-hint"); map.width = 240; map.height = 160;
          const answer = "T" + card.n + " · " + (card.dir < 0 ? "RIGHT" : card.dir > 0 ? "LEFT" : "DIRECTION UNAVAILABLE"); let revealed = true;
          map.setAttribute("role", "img"); map.setAttribute("aria-label", "Spa map with one highlighted apex");
          const toggle = btn("HIDE LABEL", "sel-chip", () => { revealed = !revealed; label.textContent = revealed ? answer : "Recall this turn"; toggle.textContent = revealed ? "HIDE LABEL" : "REVEAL LABEL"; toggle.setAttribute("aria-expanded", String(revealed)); });
          label.textContent = answer; toggle.setAttribute("aria-expanded", "true"); row.append(map, label, toggle); content.appendChild(row);
          DesignerCanvas.thumb(map, tr, { apex: card.sApex });
        }
        open.setAttribute("aria-expanded", "true");
      } catch (_) { hint.textContent = "Spa memory cards are unavailable. Your design is unchanged."; }
    });
    open.setAttribute("aria-expanded", "false"); root.append(open, hint, content); return { root };
  }
  return { tab, recipe, recipePanel, repairPanel, learningPanel };
})();
Object.freeze(DesignerFollowup);
