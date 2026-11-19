const LookAvail = (function () {
  "use strict";
  const doc = typeof document !== "undefined" ? document : null;
  const root = doc ? doc.documentElement : null;
  const byId = (id) => (doc ? doc.getElementById(id) : null);

  function mk(tag, cls, text) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function standInto(host, nodes) {
    const made = [];
    for (const n of nodes) {
      n.setAttribute("aria-hidden", "true");
      n.setAttribute("data-look-standin", "");
      host.appendChild(n);
      made.push(n);
    }
    return () => { for (const n of made) if (n.parentNode) n.parentNode.removeChild(n); };
  }
  const isEmpty = (el) => !el || !el.children || el.children.length === 0;
  const SAMPLE_ROWS = ["VERSTAPPEN", "NORRIS", "LECLERC", "PIASTRI", "HAMILTON", "RUSSELL", "SAINZ", "ALONSO", "GASLY", "ALBON"];
  function sampleRows(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(mk("div", "res-row", `P${i + 1}  ${SAMPLE_ROWS[i % SAMPLE_ROWS.length]}`));
    return out;
  }

  function datahubStandIn(el) {
    if (!el || el.querySelector(".dh-card")) return null;
    const added = !el.classList.contains("dh-overlay");
    if (added) el.classList.add("dh-overlay");
    const card = mk("div", "dh-card");
    const head = mk("div", "sheet-head");
    head.appendChild(mk("h2", "", "F1 DATA HUB"));
    const tabs = mk("div", "dh-tabs");
    ["SCHEDULE", "STANDINGS", "LAST RACE", "LIVE"].forEach((t, i) => tabs.appendChild(mk("span", "dh-tab" + (i === 1 ? " active" : ""), t)));
    const body = mk("div", "dh-content");
    SAMPLE_ROWS.slice(0, 8).forEach((n, i) => body.appendChild(mk("div", "dh-row", `${i + 1}  ${n}`)));
    card.append(head, tabs, body);
    const undo = standInto(el, [card]);
    return () => { undo(); if (added) el.classList.remove("dh-overlay"); };
  }
  function selectStandIn() {
    const strip = byId("sel-tracks");
    if (!strip || !isEmpty(strip)) return null;
    const list = (typeof Tracks !== "undefined" && Tracks.LIST) || [];
    const tiles = [];
    for (let i = 0; i < Math.max(6, Math.min(list.length, 12)); i++) {
      const t = list[i] || {};
      const tile = mk("span", "track-row");
      tile.appendChild(mk("span", "track-row-meta", String(i + 1)));
      tile.appendChild(mk("span", "track-row-name", String(t.name || t.id || "CIRCUIT").toUpperCase()));
      tiles.push(tile);
    }
    return standInto(strip, tiles);
  }
  function careerStandIn() {
    const l = byId("cr-left"), r = byId("cr-right");
    const undo = [];
    if (l && isEmpty(l)) undo.push(standInto(l, [1, 2, 3].map((n) => mk("div", "cr-slot", `SLOT ${n}`))));
    if (r && isEmpty(r)) undo.push(standInto(r, sampleRows(8)));
    return undo.length ? () => undo.forEach((f) => f()) : null;
  }
  function garageStandIn() {
    const tabs = byId("cs-tabs"), opts = byId("cs-options");
    const undo = [];
    if (tabs && isEmpty(tabs))
      undo.push(standInto(tabs, ["ENGINE", "AERO", "CHASSIS", "BRAKES", "TYRES", "LIVERY"].map((t, i) => mk("span", "cs-tab" + (i ? "" : " active"), t))));
    if (opts && isEmpty(opts))
      undo.push(standInto(opts, ["STANDARD", "UPGRADED", "WORKS"].map((t) => mk("span", "cs-opt", t))));
    return undo.length ? () => undo.forEach((f) => f()) : null;
  }
  function designerStandIn() {
    const dlg = byId("trackdesigner");
    if (!dlg || dlg.querySelector(".td-body")) return null;
    const head = mk("div", "sheet-head"); head.appendChild(mk("h2", "", "TRACK DESIGNER"));
    const stage = mk("div", "td-stage"); stage.appendChild(mk("div", "td-hint", "MAP"));
    const rail = mk("div", "td-rail");
    for (const t of ["1 DRAW", "2 EDIT", "3 ELEVATION", "4 SCENERY", "5 TEST"]) rail.appendChild(mk("span", "sel-chip", t));
    const body = mk("div", "td-body"); body.append(stage, rail);
    return standInto(dlg, [head, body]);
  }
  function popupsStandIn() {
    const body = byId("standings-body");
    return body && isEmpty(body) ? standInto(body, sampleRows(10)) : null;
  }

  const FIT = Object.freeze({
    datahub: Object.freeze({ cap: 760 }),
    select: Object.freeze({ cap: 1020, compactAt: 480 }),
    race: Object.freeze({ cap: 760, compactAt: 480, twoColAt: 500 }),
    career: Object.freeze({ cap: 1020, compactAt: 480, pairAt: 620 }),
    garage: Object.freeze({ compactAt: 480 }),
    popups: Object.freeze({ cap: 760, compactAt: 380 }),
  });
  const GUT = 24;
  function env(vw, vh, scale, finePointer = false) {
    const z = scale > 0 ? scale : 1;
    return { w: (vw - GUT) / z, h: (vh - GUT) / z, shortLandscape: vw > vh && vh <= 500, phone: !finePointer && Math.min(vw, vh) < 600 };
  }
  const PHONE_KEEPS = "A phone-sized window keeps the compact layout.";
  const heldCompact = (id, e) => (id === "career" || id === "race") && e.phone && e.shortLandscape;
  function compactNow(id, look, e) {
    const f = FIT[id];
    if (!f || !f.compactAt) return false;
    if (heldCompact(id, e)) return true;
    if (look.density === "roomy" && !e.phone) return false;
    if (look.density === "tight") return true;
    return e.h < f.compactAt;
  }
  const cardW = (id, look, e) => Math.min(e.w, FIT[id].cap * ((look.w || 100) / 100));
  function careerAutoPairs(look, e) {
    return !compactNow("career", look, e) && cardW("career", look, e) >= FIT.career.pairAt;
  }
  function careerPairs(look, e) {
    if (e.phone) return false;
    return look.layout === "split" || (look.layout !== "stacked" && careerAutoPairs(look, e));
  }
  function why(id, k, v, look, e) {
    const f = FIT[id];
    if (k === "density" && f && f.compactAt) {
      const auto = e.h < f.compactAt || heldCompact(id, e);
      if (v === "tight" && auto) return "Already tight on this screen size.";
      if (v === "roomy" && !auto) return "Already roomy on this screen size.";
      if (v === "roomy" && e.phone) return PHONE_KEEPS;
    }
    if (id === "pause" && (k === "music" || k === "build") && v === "hide" && e.shortLandscape)
      return "Short landscape already hides this line.";
    if (id === "select" && k === "names" && v === "hide" && compactNow("select", look, e))
      return "This short screen already shows flags only.";
    if (id === "race" && k === "cols") {
      const two = cardW("race", look, e) >= f.twoColAt;
      if (v === "two" && two) return "AUTO already shows two columns here.";
      if (v === "one" && !two) return "AUTO already shows one column here.";
    }
    if (id === "career" && k === "layout") {
      const auto = careerAutoPairs(look, e);
      if (v === "stacked" && !auto) return "AUTO already stacks the columns here.";
      if (v === "split" && e.phone) return "A phone-sized window keeps the stacked columns.";
      if (v === "split" && auto) return "AUTO already splits the columns here.";
    }
    if (id === "garage" && k === "glass" && v === "solid") return "SHIPPED is already the solid panel.";
    return "";
  }
  function whyKnob(id, k, look, e) {
    if (id === "career" && (k === "split" || k === "side") && !careerPairs(look, e))
      return { off: true, text: "Applies to the SPLIT layout only (COLUMNS)." };
    if (k === "w" && FIT[id] && FIT[id].cap && FIT[id].cap >= e.w)
      return { off: false, text: id === "popups"
        ? "Above 100% changes little here: most pop-ups already fill the screen width."
        : "Above 100% changes nothing here: the card already fills the screen width." };
    return null;
  }
  function liveEnv() {
    if (typeof window === "undefined") return null;
    const r = typeof document !== "undefined" ? document.documentElement : null;
    const vw = r && r.clientWidth > 0 ? r.clientWidth : window.innerWidth;
    const vh = r && r.clientHeight > 0 ? r.clientHeight : window.innerHeight;
    if (!(vw > 0)) return null;
    let z = 1, fine = false;
    try { z = parseFloat(getComputedStyle(root).getPropertyValue("--ui-scale")) || 1; } catch (_) {  }
    try { fine = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches); } catch (_) {  }
    return env(vw, vh, z, fine);
  }

  const STAND_INS = Object.freeze({
    datahub: datahubStandIn, select: selectStandIn, career: careerStandIn,
    garage: garageStandIn, designer: designerStandIn, popups: popupsStandIn,
  });

  function paintWhy(id, n, row, note, disableRow, look) {
    const e = liveEnv(), lines = [];
    if (n.kind === "cycle") for (const [v, label] of n.values) {
      const w = e ? why(id, n.k, v, look, e) : "";
      SettingRow.optionDisabled(row, v, !!w);
      if (w) lines.push(label + ": " + w);
    }
    const kn = e ? whyKnob(id, n.k, look, e) : null;
    if (kn) lines.unshift(kn.text);
    disableRow(!!(kn && kn.off));
    const text = lines.join(" ");
    if (note.textContent !== text) note.textContent = text;
    note.hidden = !text;
  }

  let wired = false;
  function wire() {
    if (wired || typeof window === "undefined" || typeof window.addEventListener !== "function" || typeof ScreenLooks === "undefined") return;
    wired = true;
    const refresh = () => ScreenLooks.refreshAvail();
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    if (doc && doc.body && typeof MutationObserver !== "undefined")
      new MutationObserver(refresh).observe(doc.body, { attributes: true, attributeFilter: ["data-density", "data-shape", "data-width"] });
    if (root && typeof MutationObserver !== "undefined")
      new MutationObserver(refresh).observe(root, { attributes: true, attributeFilter: ["style"] });
    ScreenLooks.refreshAvail(true);
  }

  return Object.freeze({ FIT, env, why, whyKnob, liveEnv, paintWhy, STAND_INS, wire });
})();
LookAvail.wire();
