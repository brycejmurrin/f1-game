/* Apex 26 — the GARAGE screen UI for js/game.js (#carsetup): everything about WHO you are and WHAT you drive. Stat bars, the tab column (TEAM & DRIVER, the 12 par… */
const SetupUI = (function () {
  "use strict";

function create(G) {
Log.info("ui", "SetupUI.create");
// Stable helpers from the game.js closure.
const { $, els, cssCol, store, arrToHex, hexToArr,
        getTeamParts, saveTeamParts, getLiveryId, saveLiveryId,
        getCustomLiveries, setCustomLiveries, getLiveries, invalidateDecalTextures } = G;

// The stat list and the display curve now live in Parts, because the in-world
// stats board on the garage wall reads the same numbers and a second copy of
// the curve would let the two disagree.
const CS_STATS = Parts.STAT_KEYS;
const displayStat = Parts.displayStat;
function renderStatBars(container, team) {
  const stats = team.stats || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  const mods = Parts.getMods(getTeamParts(team.id), team);
  container.textContent = "";
  for (const { key, label } of CS_STATS) {
    const base = stats[key] || 75;
    const effective = Math.round(displayStat(base * mods[key]));
    const delta = effective - base;

    const row = document.createElement("div");
    row.className = "cs-stat-row";

    const lbl = document.createElement("span");
    lbl.className = "cs-stat-label";
    lbl.textContent = label;

    const barWrap = document.createElement("div");
    barWrap.className = "cs-stat-bar-wrap";

    const baseBar = document.createElement("div");
    baseBar.className = "cs-stat-base";
    baseBar.style.width = Math.min(base, 100) + "%";

    const boostBar = document.createElement("div");
    boostBar.className = "cs-stat-boost" + (delta < 0 ? " penalty" : "");
    if (delta >= 0) {
      const b = Math.min(base, 100);
      boostBar.style.left = b + "%";
      boostBar.style.width = Math.min(delta, 100 - b) + "%";   // fill to the wrap edge; the number carries the exact value
    } else {
      boostBar.style.left = Math.max(0, base + delta) + "%";
      boostBar.style.width = Math.min(-delta, base) + "%";
    }

    barWrap.append(baseBar, boostBar);

    const val = document.createElement("span");
    val.className = "cs-stat-val" + (delta > 0 ? " up" : delta < 0 ? " down" : "");
    val.textContent = effective;

    row.append(lbl, barWrap, val);
    container.appendChild(row);
  }
}

// Persisted like the settings tab and the circuit filter (the other two
// tab-strips), and defaulting to TEAM: the garage used to open on the first
// PARTS category, so a player coming to change their team saw FRONT WING
// options and had to notice the rail's selected tab was not the first one —
// while LIVERY sat 14th behind a horizontal scroll.
let csActiveCat = null;   // id of the tab currently open in the GARAGE
let csLivCreating = false; // livery creator panel open?
let csLivDraft = null;     // { name, c1, c2, stripe } while editing a new paint job
let csLivEditId = null;    // id of the custom livery being edited in-place (null = creating new)

const PSEUDO_CATS = ["team", "livery"];

function csTabId(id) { return "cs-tab-" + String(id).replace(/[^a-z0-9_-]/gi, "-"); }

function activateCsCat(id, focus) {
  if (csActiveCat !== id) {
    csActiveCat = id;
    store.set("garageTab", id);
    if (G.soundOn) GameAudio.uiTick();
    buildSetup();
    const pane = $("cs-options"); if (pane) pane.scrollTop = 0;
  }
  if (focus) {
    const tab = document.getElementById(csTabId(id));
    if (tab) {
      tab.focus();
      tab.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }
}

function csTabKey(id, e) {
  const tabs = Array.from($("cs-tabs").querySelectorAll('[role="tab"]'));
  const at = tabs.findIndex((tab) => tab.dataset.csCat === id);
  let next = null;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (at + 1) % tabs.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (at - 1 + tabs.length) % tabs.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = tabs.length - 1;
  if (next == null || !tabs[next]) return;
  e.preventDefault(); e.stopPropagation();
  activateCsCat(tabs[next].dataset.csCat, true);
}

function pseudoTab(id, label, sub, flagged) {
  const tab = document.createElement("button");
  tab.className = "cs-tab" + (csActiveCat === id ? " active" : "") + (flagged ? " upgraded" : "");
  tab.dataset.csCat = id;
  tab.id = csTabId(id);
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", "cs-options");
  tab.setAttribute("aria-selected", csActiveCat === id ? "true" : "false");
  tab.tabIndex = csActiveCat === id ? 0 : -1;
  const lbl = document.createElement("span"); lbl.className = "cs-tab-lbl"; lbl.textContent = label;
  const cur = document.createElement("span"); cur.className = "cs-tab-cur"; cur.textContent = sub || "";
  tab.append(lbl, cur);
  tab.onclick = () => activateCsCat(id, false);
  tab.onkeydown = (e) => csTabKey(id, e);
  return tab;
}

function csLabel(text) {
  const h = document.createElement("h3");
  h.className = "sel-label";
  h.textContent = text;
  return h;
}

// TEAM & DRIVER — who the car belongs to.
//
// The garage owns this now. It used to exist only on the select screen, so the
// title-screen GARAGE route could fit parts and choose a paint job but never say
// whose car it was, while "who you are" sat buried inside a track picker. Both
// controls write straight to the store on click, exactly as the select screen
// did — picking here IS picking your entry for the next race.
function buildTeamOptions(optsEl, team) {
  const careerLocked = typeof Career !== "undefined" && Career.inCareer && Career.inCareer();
  optsEl.appendChild(csLabel("TEAM"));

  const card = document.createElement("button");
  card.className = "team-card";
  card.id = "cs-team-card";
  card.setAttribute("aria-haspopup", "dialog");
  card.disabled = !!careerLocked;
  if (careerLocked) card.title = "Your team is fixed by your active career contract";
  const body = document.createElement("span"); body.className = "tm-body";
  const name = document.createElement("span"); name.className = "tm-name"; name.textContent = team.name;
  const sub = document.createElement("span"); sub.className = "tm-sub";
  sub.textContent = team.short + " · " + (team.engine || "") + " engine";
  body.append(name, sub);
  const chev = document.createElement("span");
  chev.className = "tm-chev"; chev.textContent = "▾"; chev.setAttribute("aria-hidden", "true");
  card.append(G.teamSwatch(team), body, chev);
  card.onclick = () => { if (G.soundOn) GameAudio.uiSelect(); G.setTeamPicker(true); };
  optsEl.appendChild(card);

  optsEl.appendChild(csLabel("DRIVER"));
  const row = document.createElement("div");
  row.className = "chip-row"; row.id = "cs-driver";
  row.setAttribute("role", "group"); row.setAttribute("aria-label", "Driver");
  team.drivers.forEach((d, i) => {
    const b = document.createElement("button");
    const taken = (G.peerSeats ? G.peerSeats() : [])
      .some((s) => s.team === team.id && s.driver === i);
    b.className = "sel-chip" + (i === G.driverIdx ? " active" : "");
    b.disabled = taken || careerLocked;
    if (taken) b.title = "Taken by the other player";
    else if (careerLocked) b.title = "Your seat is fixed by your active career contract";
    b.setAttribute("aria-pressed", i === G.driverIdx ? "true" : "false");
    b.dataset.csDriver = String(i);
    b.textContent = "#" + d.num + " " + d.name + (taken ? "  · TAKEN" : "");
    b.onclick = () => {
      if (i === G.driverIdx) return;
      G.driverIdx = i; store.set("driver", i);
      if (G.soundOn) GameAudio.uiTick();
      buildSetup();
    };
    row.appendChild(b);
  });
  optsEl.appendChild(row);

  const editRow = document.createElement("div"); editRow.className = "sel-edit-row";
  const edit = document.createElement("button");
  edit.className = "sel-edit"; edit.id = "cs-customize";
  edit.textContent = "✎ EDIT MY TEAM";
  edit.onclick = () => { if (G.soundOn) GameAudio.uiSelect(); G.openCustomize(); };
  editRow.appendChild(edit);
  optsEl.appendChild(editRow);
}

function buildSetup() {
  const team = Teams.LIST[G.teamIdx];
  const parts = getTeamParts(team.id);

  // Drop any saved exclusive option the current team can't use
  let partsChanged = false;
  for (const cat of Parts.CATALOG) {
    const selId = parts[cat.id];
    if (selId) {
      const opt = cat.options.find((o) => o.id === selId);
      if (opt && !Parts.isOptionAvailable(opt, team)) {
        delete parts[cat.id];
        partsChanged = true;
      }
    }
  }
  if (partsChanged) saveTeamParts(team.id, parts);

  const owned = G.careerOwned();
  const cap = owned ? Career.budget() : Parts.BUDGET;
  const unlimited = !owned && G.unlimitedBudget;

  const spent = Parts.getCost(parts, team);
  const remaining = cap - spent;

  $("cs-team").textContent = team.name.toUpperCase();

  const budgetEl = $("cs-budget");
  const budgetFill = $("cs-budget-fill");
  const unlimitedBtn = $("cs-unlimited");
  if (budgetEl) {
    if (unlimited) {
      budgetEl.textContent = "FREE BUILD — no budget limit";
      budgetEl.className = "unlimited";
    } else if (owned) {
      budgetEl.textContent = "BALANCE " + Career.data().money.toLocaleString() + " cr · FITTED "
                           + spent.toLocaleString() + " / " + cap.toLocaleString() + " cr";
      budgetEl.className = remaining < 0 ? "over" : remaining < 100 ? "tight" : "";
    } else {
      budgetEl.textContent = "BUDGET: " + remaining + " / " + cap + " cr remaining";
      budgetEl.className = remaining < 0 ? "over" : remaining < 100 ? "tight" : "";
    }
  }
  if (budgetFill) {
    budgetFill.style.transform = unlimited ? "scaleX(0)" : "scaleX(" + M4.clamp(spent / cap, 0, 1) + ")";
  }
  if (unlimitedBtn) {
    unlimitedBtn.hidden = !!owned;
    unlimitedBtn.textContent = unlimited ? "∞ FREE BUILD: ON" : "∞ FREE BUILD";
    unlimitedBtn.className = "cs-unlimited-btn" + (unlimited ? " on" : "");
  }

  if (!csActiveCat) csActiveCat = store.get("garageTab", "team");
  if (!PSEUDO_CATS.includes(csActiveCat) && !Parts.CATALOG.some((c) => c.id === csActiveCat)) csActiveCat = "team";
  const activeCat = Parts.CATALOG.find((c) => c.id === csActiveCat);

  // Resolve the currently-fitted option for a category (respecting supplier lock).
  const resolveOpt = (cat) => {
    const id = parts[cat.id] || Parts.DEFAULTS[cat.id];
    return cat.options.find((o) => o.id === id && Parts.isOptionAvailable(o, team))
        || cat.options.find((o) => o.id === Parts.DEFAULTS[cat.id]);
  };

  const tabs = $("cs-tabs");
  tabs.textContent = "";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Garage categories");
  {
    const d = team.drivers[G.driverIdx] || team.drivers[0];
    tabs.appendChild(pseudoTab("team", "TEAM", d ? d.name.split(" ").pop() : team.short));
  }
  for (const cat of Parts.CATALOG) {
    const cur = resolveOpt(cat);
    tabs.appendChild(pseudoTab(cat.id, cat.label, cur ? cur.label : "",
                               cur && cur.id !== Parts.DEFAULTS[cat.id]));
  }
  {
    tabs.appendChild(pseudoTab("livery", "LIVERY", "",
                               getLiveryId(team.id) !== "default"));
  }

  const optsEl = $("cs-options");
  optsEl.textContent = "";
  optsEl.setAttribute("role", "tabpanel");
  optsEl.setAttribute("aria-labelledby", csTabId(csActiveCat));
  optsEl.tabIndex = 0;
  // LIVERY adds this grid; TEAM and the part cats must not inherit it.
  // Measured 2026-08-18 Playwright MCP: switching LIVERY → TEAM left
  // `cs-liv-grid` on #cs-options, so #cs-team-card painted 91×64 with
  // `.tm-name` at 14px (`McLaren` / `MCL · Mercedes engine` truncated).
  optsEl.classList.remove("cs-liv-grid");
  if (csActiveCat === "team")   { buildTeamOptions(optsEl, team);   renderStatBars($("cs-stats-inner"), team); return; }
  if (csActiveCat === "livery") { buildLiveryOptions(optsEl, team); renderStatBars($("cs-stats-inner"), team); return; }
  const curOpt = resolveOpt(activeCat);
  const curCost = curOpt ? (curOpt.cost || 0) : 0;
  const factorySetup = Parts.getFactorySetup(team);
  for (const opt of activeCat.options) {
    if (!Parts.isOptionAvailable(opt, team)) continue;
    const locked = !Parts.isOptionAvailable(opt, team, owned);
    const active = curOpt && curOpt.id === opt.id;
    const costDelta = (opt.cost || 0) - curCost;
    const wouldExceed = !active && !unlimited && (spent + costDelta > cap);

    const row = document.createElement("button");
    const restricted = opt.supplier || opt.suppliers || opt.team || opt.teams;
    row.className = "cs-opt" + (active ? " active" : "") + (wouldExceed ? " over-budget" : "")
                  + (locked ? " locked" : "") + (restricted ? " exclusive" : "");
    row.setAttribute("aria-pressed", active ? "true" : "false");
    row.dataset.csOpt = opt.id;
    row.dataset.csCat = activeCat.id;

    const dot = document.createElement("span"); dot.className = "cs-opt-dot"; row.appendChild(dot);

    const main = document.createElement("div"); main.className = "cs-opt-main";
    const nameRow = document.createElement("div"); nameRow.className = "cs-opt-name";
    nameRow.appendChild(document.createTextNode(opt.label));
    const badges = [];
    if (opt.tag) badges.push(opt.tag);
    if (opt.supplier || opt.suppliers) badges.push("SUPPLIER");
    if (opt.team || opt.teams) badges.push("SIGNATURE");
    if (!restricted && !opt.tag) badges.push("UNIVERSAL");
    if (factorySetup[activeCat.id] === opt.id) badges.push("FACTORY SETUP");
    if (badges.length) {
      const tg = document.createElement("span");
      tg.className = "cs-opt-tag";
      tg.textContent = badges.join(" · ");
      nameRow.appendChild(tg);
    }
    main.appendChild(nameRow);
    const deltas = statDeltaChips(opt);
    if (deltas) main.appendChild(deltas);
    if (active && opt.desc) { const d = document.createElement("div"); d.className = "cs-opt-desc"; d.textContent = opt.desc; main.appendChild(d); }
    row.appendChild(main);

    const cost = document.createElement("span");
    cost.className = "cs-opt-cost" + (locked ? " research" : opt.cost > 0 ? "" : " free");
    cost.textContent = locked ? "RESEARCH · " + Career.researchCost(opt).toLocaleString() + " cr"
                     : opt.cost > 0 ? opt.cost + " cr" : "FREE";
    row.appendChild(cost);

    const reject = () => {
      row.classList.add("budget-reject");
      row.addEventListener("animationend", () => row.classList.remove("budget-reject"), { once: true });
      // uiReject, not uiTick: a refused purchase used to play the exact blip
      // a successful fit plays — only the shake distinguished them, and only
      // if you were looking at that row.
      if (G.soundOn) GameAudio.uiReject();
    };

    row.onclick = () => {
      if (active) return;
      if (locked) {
        if (!Career.research(opt)) { reject(); return; }
        if (G.soundOn) GameAudio.uiSelect();
      }
      const p = getTeamParts(team.id);
      const co = activeCat.options.find((o) => o.id === (p[activeCat.id] || Parts.DEFAULTS[activeCat.id]));
      const cc = co ? (co.cost || 0) : 0;
      if (!unlimited && (Parts.getCost(p, team) - cc + (opt.cost || 0)) > cap) {
        if (locked) { buildSetup(); return; }
        reject();
        return;
      }
      p[activeCat.id] = opt.id;
      saveTeamParts(team.id, p);
      if (G.soundOn) GameAudio.uiSelect();
      buildSetup();
    };
    optsEl.appendChild(row);
  }

  renderStatBars($("cs-stats-inner"), team);
}

const CS_DELTA_DEFS = [
  { key: "speed",     label: "TOP" },
  { key: "accel",     label: "ACCEL" },
  { key: "cornering", label: "GRIP" },
  { key: "braking",   label: "BRAKE" },
];
function statDeltaChips(opt) {
  const wrap = document.createElement("div");
  wrap.className = "cs-opt-deltas";
  let any = false;
  for (const d of CS_DELTA_DEFS) {
    const v = opt[d.key];
    if (v == null || v === 1) continue;
    any = true;
    const chip = document.createElement("span");
    chip.className = "cs-delta " + (v > 1 ? "up" : "down");
    chip.textContent = (v > 1 ? "▲" : "▼") + d.label;
    wrap.appendChild(chip);
  }
  return any ? wrap : null;
}

function livSwatch(liv) {
  const sw = document.createElement("span"); sw.className = "cs-liv-swatch";
  sw.style.background = "linear-gradient(120deg, " + cssCol(liv.c1) + " 0 56%, " + cssCol(liv.c2) + " 56% 100%)";
  if (liv.stripe) {
    const st = document.createElement("span"); st.className = "cs-liv-stripe";
    st.style.background = cssCol(liv.stripe);
    sw.appendChild(st);
  }
  return sw;
}

function buildLiveryOptions(container, team) {
  if (csLivCreating) {
    container.classList.remove("cs-liv-grid");
    buildLiveryCreator(container, team);
    return;
  }
  container.classList.add("cs-liv-grid");
  const cur = getLiveryId(team.id);
  const customIds = new Set(getCustomLiveries(team.id).map((l) => l.id));

  // ＋ CREATE row (top so it's always reachable without scrolling the list)
  {
    const row = document.createElement("button");
    row.className = "cs-opt cs-liv cs-liv-create";
    const dot = document.createElement("span"); dot.className = "cs-opt-dot"; row.appendChild(dot);
    const sw = document.createElement("span"); sw.className = "cs-liv-swatch cs-liv-plus"; sw.textContent = "＋"; row.appendChild(sw);
    const main = document.createElement("div"); main.className = "cs-opt-main";
    const nameRow = document.createElement("div"); nameRow.className = "cs-opt-name"; nameRow.textContent = "Create livery";
    main.appendChild(nameRow);
    row.appendChild(main);
    const tag = document.createElement("span"); tag.className = "cs-opt-cost free"; tag.textContent = "NEW"; row.appendChild(tag);
    row.onclick = () => {
      csLivDraft = { name: "", c1: arrToHex(team.color), c2: arrToHex(team.color2), stripe: "", accent: "",
                     noseStripe: "", nose: "", pod: "", wing: "", fin: "", finArt: "", logo: "", logo2: "",
                     halo: "", finish: "gloss" };
      csLivEditId = null;
      csLivCreating = true;
      if (G.soundOn) GameAudio.uiSelect();
      buildSetup();
    };
    container.appendChild(row);
  }

  for (const liv of getLiveries(team)) {
    const active = liv.id === cur;
    const isCustom = customIds.has(liv.id);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "cs-opt cs-liv" + (active ? " active" : "") + (isCustom ? " cs-liv-custom" : "");
    row.setAttribute("aria-label", "Select " + liv.name + " livery");
    row.title = liv.name;
    row.setAttribute("aria-pressed", active ? "true" : "false");
    const rowWrap = document.createElement("div");
    rowWrap.className = "cs-liv-row";
    rowWrap.appendChild(row);

    const dot = document.createElement("span"); dot.className = "cs-opt-dot"; row.appendChild(dot);
    row.appendChild(livSwatch(liv));

    const main = document.createElement("div"); main.className = "cs-opt-main";
    const nameRow = document.createElement("div"); nameRow.className = "cs-opt-name";
    nameRow.appendChild(document.createTextNode(liv.name));
    if (isCustom) { const tg = document.createElement("span"); tg.className = "cs-opt-tag"; tg.textContent = "MINE"; nameRow.appendChild(tg); }
    if (liv.finish && liv.finish !== "gloss") {
      const tg = document.createElement("span");
      tg.className = "cs-opt-tag";
      tg.textContent = liv.finish.toUpperCase();
      nameRow.appendChild(tg);
    }
    main.appendChild(nameRow);
    row.appendChild(main);

    if (isCustom) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "cs-liv-edit"; edit.textContent = "✎";
      edit.title = "Edit this livery";
      edit.setAttribute("aria-label", "Edit " + liv.name + " livery");
      edit.onclick = () => {
        csLivDraft = {
          name: liv.name || "", c1: arrToHex(liv.c1), c2: arrToHex(liv.c2),
          stripe: liv.stripe ? arrToHex(liv.stripe) : "", noseStripe: liv.noseStripe ? arrToHex(liv.noseStripe) : "",
          accent: liv.accent ? arrToHex(liv.accent) : "", nose: liv.nose ? arrToHex(liv.nose) : "",
          pod: liv.pod ? arrToHex(liv.pod) : "", wing: liv.wing ? arrToHex(liv.wing) : "", halo: liv.halo ? arrToHex(liv.halo) : "",
          fin: liv.fin ? arrToHex(liv.fin) : "", finArt: liv.finArt ? arrToHex(liv.finArt) : "",
          logo: liv.logo ? arrToHex(liv.logo) : "",
          logo2: liv.logo2 ? arrToHex(liv.logo2) : "",
          finish: liv.finish || "gloss",
        };
        csLivEditId = liv.id;
        csLivCreating = true;
        if (G.soundOn) GameAudio.uiSelect();
        buildSetup();
      };
      rowWrap.appendChild(edit);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "cs-liv-del"; del.textContent = "✕";
      del.title = "Delete this livery";
      del.setAttribute("aria-label", "Delete " + liv.name + " livery");
      del.onclick = () => {
        // Arm-then-confirm (G.armConfirm, the career DELETE? idiom): this was
        // one tap from destroying a one-of-a-kind paint job with no undo.
        if (G.soundOn) GameAudio.uiTick();
        G.armConfirm(del, "✕?", () => {
          setCustomLiveries(team.id, getCustomLiveries(team.id).filter((l) => l.id !== liv.id));
          if (active) saveLiveryId(team.id, "default");
          buildSetup();
        });
      };
      rowWrap.appendChild(del);
    } else {
      const tag = document.createElement("span");
      tag.className = "cs-opt-cost free";
      tag.textContent = active ? "FITTED" : "PAINT";
      row.appendChild(tag);
      const dup = document.createElement("button");
      dup.type = "button";
      dup.className = "cs-liv-edit"; dup.textContent = "⧉";
      dup.title = "Customize a copy of this livery";
      dup.setAttribute("aria-label", "Customize a copy of " + liv.name);
      dup.onclick = () => {
        csLivDraft = {
          name: (liv.name || "Custom").slice(0, 14) + " MK2",
          c1: arrToHex(liv.c1), c2: arrToHex(liv.c2),
          stripe: liv.stripe ? arrToHex(liv.stripe) : "", noseStripe: liv.noseStripe ? arrToHex(liv.noseStripe) : "",
          accent: liv.accent ? arrToHex(liv.accent) : "", nose: liv.nose ? arrToHex(liv.nose) : "",
          pod: liv.pod ? arrToHex(liv.pod) : "", wing: liv.wing ? arrToHex(liv.wing) : "", halo: liv.halo ? arrToHex(liv.halo) : "",
          fin: liv.fin ? arrToHex(liv.fin) : "", finArt: liv.finArt ? arrToHex(liv.finArt) : "",
          logo: liv.logo ? arrToHex(liv.logo) : "",
          logo2: liv.logo2 ? arrToHex(liv.logo2) : "",
          finish: liv.finish || "gloss",
        };
        csLivEditId = null;   // create-new: never overwrites the stock scheme
        csLivCreating = true;
        if (G.soundOn) GameAudio.uiSelect();
        buildSetup();
      };
      rowWrap.appendChild(dup);
    }

    row.onclick = () => {
      if (active) return;
      saveLiveryId(team.id, liv.id);
      if (G.soundOn) GameAudio.uiSelect();
      buildSetup();
    };
    container.appendChild(rowWrap);
  }
}

function buildLiveryCreator(container, team) {
  const d = csLivDraft;   // colours held as hex strings; "" stripe = none
  const wrap = document.createElement("div");
  wrap.className = "cs-liv-editor";

  const head = document.createElement("div"); head.className = "cs-liv-ed-head"; head.textContent = csLivEditId ? "EDIT PAINT JOB" : "NEW PAINT JOB";
  wrap.appendChild(head);

  // Live swatch preview of the current draft (built from hex strings directly).
  const prev = document.createElement("span"); prev.className = "cs-liv-swatch cs-liv-ed-prev";
  wrap.appendChild(prev);

  const applyPreview = () => {
    prev.style.background = "linear-gradient(120deg, " + d.c1 + " 0 56%, " + d.c2 + " 56% 100%)";
    prev.textContent = "";
    if (d.stripe) { const st = document.createElement("span"); st.className = "cs-liv-stripe"; st.style.background = d.stripe; prev.appendChild(st); }
    refreshPalettes();   // a slot's new colour becomes matchable from every other slot
    livePreviewDraft(team, d);
  };

  // MATCHING PALETTE. Twelve slots paint one car, and most paint jobs reuse the
  // same three or four colours across them — but every slot was a bare OS colour
  // dialog, so "the same red as the nose" meant eyeballing hex by hand and
  // getting it nearly right. These chips are the colours already in play: every
  // distinct value in the draft, then the team's own two stock colours. Click
  // one and the slot takes it EXACTLY.
  const PAL_KEYS = ["c1", "c2", "stripe", "noseStripe", "accent", "nose", "pod",
                    "wing", "fin", "finArt", "logo", "logo2", "halo"];
  const paletteColours = () => {
    const seen = [];
    const add = (v) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(v || "")) return;
      const u = v.toLowerCase();
      if (seen.indexOf(u) < 0) seen.push(u);
    };
    for (let i = 0; i < PAL_KEYS.length; i++) add(d[PAL_KEYS[i]]);
    add(arrToHex(team.color)); add(arrToHex(team.color2));
    return seen;
  };
  const palRows = [];   // rebuilt on every edit: the palette IS the other slots
  const refreshPalettes = () => {
    const cols = paletteColours();
    for (let i = 0; i < palRows.length; i++) {
      const pr = palRows[i];
      pr.el.textContent = "";
      for (let c = 0; c < cols.length; c++) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "cs-liv-ed-none";
        chip.style.background = cols[c];
        chip.title = "Use " + cols[c];
        chip.setAttribute("aria-label", "Use colour " + cols[c] + " for " + pr.label);
        if ((d[pr.key] || "").toLowerCase() === cols[c]) chip.classList.add("active");
        chip.onclick = () => { pr.set(cols[c]); };
        pr.el.appendChild(chip);
      }
    }
  };

  const colorRow = (label, key, allowNone) => {
    const r = document.createElement("label"); r.className = "cs-liv-ed-row";
    const lb = document.createElement("span"); lb.className = "cs-liv-ed-lbl"; lb.textContent = label; r.appendChild(lb);
    const inp = document.createElement("input"); inp.type = "color";
    inp.value = /^#[0-9a-fA-F]{6}$/.test(d[key]) ? d[key] : "#000000";
    if (allowNone && !d[key]) inp.classList.add("cs-liv-off");
    inp.oninput = () => { d[key] = inp.value; inp.classList.remove("cs-liv-off"); applyPreview(); };
    r.appendChild(inp);
    if (allowNone) {
      const off = document.createElement("button"); off.type = "button"; off.className = "cs-liv-ed-none"; off.textContent = "NONE";
      off.onclick = () => { d[key] = ""; inp.classList.add("cs-liv-off"); applyPreview(); };
      r.appendChild(off);
    }
    const pal = document.createElement("span"); pal.className = "cs-liv-pal";
    palRows.push({ el: pal, key, label,
      set: (hex) => { d[key] = hex; inp.value = hex; inp.classList.remove("cs-liv-off"); applyPreview(); } });
    r.appendChild(pal);
    return r;
  };
  wrap.appendChild(colorRow("PRIMARY", "c1", false));
  wrap.appendChild(colorRow("ACCENT", "c2", false));
  wrap.appendChild(colorRow("BODY STRIPE", "stripe", true));      // full spine: nose → engine cover
  wrap.appendChild(colorRow("NOSE STRIPE", "noseStripe", true));  // nose crown only: tip → bulkhead
  wrap.appendChild(colorRow("DETAIL", "accent", true));   // tertiary paint on flashes/trim/pinstripe
  wrap.appendChild(colorRow("NOSE CAP", "nose", true));
  wrap.appendChild(colorRow("SIDEPOD", "pod", true));
  wrap.appendChild(colorRow("WINGS", "wing", true));
  wrap.appendChild(colorRow("TAIL FIN", "fin", true));
  wrap.appendChild(colorRow("TAIL GRAPHIC", "finArt", true));
  // Per-team labels: LiveryTex.markSlots names the shape each picker paints on
  // THIS mark, so a player choosing Racing Bulls sees RB LETTERS and BULL rather
  // than two rows that could mean anything.
  const mSlots = (window.LiveryTex && LiveryTex.markSlots)
    ? LiveryTex.markSlots(team.id)
    : [{ key: "logo", label: "TEAM LOGO" }, { key: "logo2", label: "LOGO DETAIL" }];
  wrap.appendChild(colorRow(mSlots[0].label, "logo", true));
  wrap.appendChild(colorRow(mSlots[1].label, "logo2", true));
  wrap.appendChild(colorRow("HALO", "halo", true));
  {
    const r = document.createElement("div"); r.className = "cs-liv-ed-row";
    const lb = document.createElement("span"); lb.className = "cs-liv-ed-lbl"; lb.textContent = "FINISH"; r.appendChild(lb);
    const group = document.createElement("span"); group.className = "cs-liv-ed-finish";
    const btns = [];
    for (const f of ["gloss", "satin", "chrome", "matte", "carbon", "brushed", "pearl"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cs-liv-ed-none" + ((d.finish || "gloss") === f ? " active" : "");
      b.dataset.csFinish = f;
      b.textContent = f.toUpperCase();
      b.setAttribute("aria-pressed", String((d.finish || "gloss") === f));
      b.onclick = () => {
        d.finish = f;
        for (const other of btns) {
          const on = other.dataset.csFinish === f;
          other.classList.toggle("active", on);
          other.setAttribute("aria-pressed", String(on));
        }
        applyPreview();
      };
      btns.push(b);
      group.appendChild(b);
    }
    r.appendChild(group);
    wrap.appendChild(r);
  }

  const nameRow = document.createElement("label"); nameRow.className = "cs-liv-ed-row";
  const nlb = document.createElement("span"); nlb.className = "cs-liv-ed-lbl"; nlb.textContent = "NAME"; nameRow.appendChild(nlb);
  const name = document.createElement("input"); name.type = "text"; name.className = "cs-liv-ed-name";
  name.maxLength = 18; name.placeholder = "My Livery"; name.value = d.name;
  name.oninput = () => { d.name = name.value; };
  nameRow.appendChild(name);
  wrap.appendChild(nameRow);

  const btns = document.createElement("div"); btns.className = "cs-liv-ed-btns";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "cs-liv-ed-cancel"; cancel.textContent = "CANCEL";
  cancel.onclick = () => { csLivCreating = false; csLivDraft = null; csLivEditId = null; endLivPreview(team); if (G.soundOn) GameAudio.uiTick(); buildSetup(); };
  const save = document.createElement("button"); save.type = "button"; save.className = "cs-liv-ed-save"; save.textContent = "SAVE & FIT";
  save.onclick = () => {
    // ALWAYS a fresh id, edits included: every body-mesh and decal-atlas
    // cache keys on the livery id, so reusing it on edit served the pre-edit
    // meshes with the new atlas — a mismatched car with no error. A new id
    // makes every id-keyed cache miss naturally; bounded caches evict the
    // orphans, and saveLiveryId below re-points the selection.
    const id = "custom_" + livIdCounter();
    const liv = { id, name: (d.name || "").trim() || "Custom", c1: hexToArr(d.c1), c2: hexToArr(d.c2) };
    if (d.stripe) liv.stripe = hexToArr(d.stripe);
    if (d.noseStripe) liv.noseStripe = hexToArr(d.noseStripe);
    if (d.accent) liv.accent = hexToArr(d.accent);
    if (d.nose) liv.nose = hexToArr(d.nose);
    if (d.pod)  liv.pod  = hexToArr(d.pod);
    if (d.wing) liv.wing = hexToArr(d.wing);
    if (d.fin)  liv.fin  = hexToArr(d.fin);
    if (d.finArt) liv.finArt = hexToArr(d.finArt);
    if (d.logo) liv.logo = hexToArr(d.logo);
    if (d.logo2) liv.logo2 = hexToArr(d.logo2);
    if (d.halo) liv.halo = hexToArr(d.halo);
    if (d.finish && d.finish !== "gloss") liv.finish = d.finish;
    const existing = getCustomLiveries(team.id);
    // Edit-in-place replaces the entry that carried the OLD id; create appends.
    setCustomLiveries(team.id, csLivEditId ? existing.map((l) => (l.id === csLivEditId ? liv : l)) : existing.concat([liv]));
    saveLiveryId(team.id, id);
    csLivCreating = false; csLivDraft = null; csLivEditId = null; endLivPreview(team);
    if (G.soundOn) GameAudio.uiSelect();
    buildSetup();
  };
  btns.append(cancel, save);
  wrap.appendChild(btns);

  container.appendChild(wrap);
  applyPreview();
}

let _livSeq = 0;
function livIdCounter() { _livSeq = (_livSeq + 1) % 1000; return String(Date.now()) + _livSeq; }

let _livPreviewKey = "";
function livePreviewDraft(team, d) {
  const key = team.id + "|" + JSON.stringify(d);
  if (key === _livPreviewKey) return;
  _livPreviewKey = key;
  if (invalidateDecalTextures) invalidateDecalTextures(team.id);
  G.livDraftOverride = { teamId: team.id, liv: { c1: hexToArr(d.c1), c2: hexToArr(d.c2), stripe: d.stripe ? hexToArr(d.stripe) : null, accent: d.accent ? hexToArr(d.accent) : null,
    nose: d.nose ? hexToArr(d.nose) : null, pod: d.pod ? hexToArr(d.pod) : null, wing: d.wing ? hexToArr(d.wing) : null, halo: d.halo ? hexToArr(d.halo) : null,
    fin: d.fin ? hexToArr(d.fin) : null, finArt: d.finArt ? hexToArr(d.finArt) : null,
    logo: d.logo ? hexToArr(d.logo) : null,
    logo2: d.logo2 ? hexToArr(d.logo2) : null,
    noseStripe: d.noseStripe ? hexToArr(d.noseStripe) : null,
    finish: d.finish && d.finish !== "gloss" ? d.finish : null } };
  G._spMeshKey = "";   // bust the setup-preview mesh cache so it repaints
}

function endLivPreview(team) {
  _livPreviewKey = "";
  G.livDraftOverride = null;
  if (invalidateDecalTextures) invalidateDecalTextures(team.id);
  G._spMeshKey = "";
}

function openSetup() {
  Log.info("ui", "SetupUI.openSetup");
  buildSetup();
  els.select.hidden = true;
  els.overlay.hidden = true;
  $("vsfriend").hidden = true;
  $("carsetup").hidden = false;
  G.setupPreviewOn = true;
}
return { buildSetup, openSetup };
}

return { create };
})();
