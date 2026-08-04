/* Apex 26 — the GARAGE screen UI for js/game.js (#carsetup): everything about
   WHO you are and WHAT you drive. Stat bars, the tab column (TEAM & DRIVER,
   the 8 parts categories, LIVERY), option rows + credits budget, livery
   swatches and the inline livery creator. The select screen owns WHERE you
   race and links here; race settings own HOW a race runs.
   Pure DOM assembly; live state (sound, budget flag, selected team/driver,
   livery draft override, preview-mesh key) is reached through the ctx façade
   G handed to SetupUI.create(G); persistence helpers (getTeamParts,
   getLiveries, …) and the shared team-picker/customize openers arrive by
   destructure or off G. Consumes globals Parts, Teams, GameAudio, Career — the
   last of those turns the same screen into the career garage (balance + fitted
   cap in the header, R&D-locked rows), and answers "are we in one" via
   G.careerOwned() rather than a second flow check that could drift.
   Must load BEFORE js/game.js (see index.html). */
const SetupUI = (function () {
  "use strict";

function create(G) {
// Stable helpers from the game.js closure.
const { $, els, cssCol, store, arrToHex, hexToArr,
        getTeamParts, saveTeamParts, getLiveryId, saveLiveryId,
        getCustomLiveries, setCustomLiveries, getLiveries, invalidateDecalTextures } = G;

const CS_STATS = [
  { key: "speed",     label: "SPEED" },
  { key: "accel",     label: "ACCEL" },
  { key: "cornering", label: "CORNERING" },
  { key: "braking",   label: "BRAKING" },
];

// Map a raw base×mods rating to the displayed stat. At/below 100 it's the raw
// value; above 100 a soft asymptotic knee (→ ~120) compresses the top. The old
// hard Math.min(110,…) pegged every strong part to the same number — a top
// team's CORNERING read 110 for Diffuser, High-DF, Extreme-DF, Active Aero and
// more alike, so swapping parts appeared to do nothing. This knee is strictly
// increasing, so a stronger part always nudges the number up while an elite car
// still reads "over 100". Display-only — physics uses statMult()×mods (see
// recomputePlayerMods), which this does not touch.
const STAT_KNEE = 100, STAT_CAP = 120, STAT_KNEE_SCALE = 26;
function displayStat(raw) {
  if (raw <= STAT_KNEE) return raw;
  return STAT_KNEE + (STAT_CAP - STAT_KNEE) * (1 - Math.exp(-(raw - STAT_KNEE) / STAT_KNEE_SCALE));
}
// Render the four stat bars (base + part boost overlay) for a team into a
// container. Shared by the select screen (always-on) and the setup panel.
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

let csActiveCat = null;   // id of the tab currently open in the GARAGE
let csLivCreating = false; // livery creator panel open?
let csLivDraft = null;     // { name, c1, c2, stripe } while editing a new paint job
let csLivEditId = null;    // id of the custom livery being edited in-place (null = creating new)

// The tabs that are not parts categories. Both render their own options body
// and return early from buildSetup instead of running the option-row loop.
const PSEUDO_CATS = ["team", "livery"];

// One tab button, whatever kind. The three kinds (parts / TEAM & DRIVER /
// LIVERY) were drifting into three near-identical copies of this block, so the
// activation behaviour now lives in one place. `flagged` paints the "upgraded"
// accent — a fitted non-default part, or a non-default paint job.
function pseudoTab(id, label, sub, flagged) {
  const tab = document.createElement("button");
  tab.className = "cs-tab" + (csActiveCat === id ? " active" : "") + (flagged ? " upgraded" : "");
  tab.dataset.csCat = id;
  const lbl = document.createElement("span"); lbl.className = "cs-tab-lbl"; lbl.textContent = label;
  const cur = document.createElement("span"); cur.className = "cs-tab-cur"; cur.textContent = sub || "";
  tab.append(lbl, cur);
  tab.onclick = () => {
    if (csActiveCat === id) return;
    csActiveCat = id;
    if (G.soundOn) GameAudio.uiTick();
    buildSetup();
    const t = $("cs-options"); if (t) t.scrollTop = 0;
  };
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
  optsEl.appendChild(csLabel("TEAM"));

  // The same sheet the select screen used to open (#teampicker), reached from
  // here instead. It is told who opened it so the right screen gets rebuilt.
  const card = document.createElement("button");
  card.className = "team-card";
  card.id = "cs-team-card";
  card.setAttribute("aria-haspopup", "dialog");
  const body = document.createElement("span"); body.className = "tm-body";
  const name = document.createElement("span"); name.className = "tm-name"; name.textContent = team.name;
  const sub = document.createElement("span"); sub.className = "tm-sub";
  sub.textContent = team.short + " · " + (team.engine || "") + " engine";
  body.append(name, sub);
  const chev = document.createElement("span");
  chev.className = "tm-chev"; chev.textContent = "▾"; chev.setAttribute("aria-hidden", "true");
  card.append(G.teamSwatch(team), body, chev);
  card.onclick = () => { if (G.soundOn) GameAudio.uiSelect(); G.setTeamPicker(true, "garage"); };
  optsEl.appendChild(card);

  optsEl.appendChild(csLabel("DRIVER"));
  const row = document.createElement("div");
  row.className = "chip-row"; row.id = "cs-driver";
  row.setAttribute("role", "group"); row.setAttribute("aria-label", "Driver");
  team.drivers.forEach((d, i) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (i === G.driverIdx ? " active" : "");
    b.setAttribute("aria-pressed", i === G.driverIdx ? "true" : "false");
    b.dataset.csDriver = String(i);
    b.textContent = "#" + d.num + " " + d.name;
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

  // Career's R&D gate, or null in free play. Non-null is also the one test for "this
  // is the career garage" — Career.owned() already answers "career rules apply AND
  // the team on screen is the career team".
  const owned = G.careerOwned();
  // Career measures the fitted build against its own cap (the team's works car,
  // scaled by the budget upgrades bought so far) rather than the flat free-play
  // 600 cr, and it does not offer FREE BUILD at all: an unlimited-budget cheat
  // would hand away the economy the whole mode is built on.
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
      // Two numbers because career runs two budgets: what you can SPEND developing
      // parts (the balance) and what you may FIT on the car at once (the cap).
      budgetEl.textContent = "BALANCE " + Career.data().money.toLocaleString() + " cr · FITTED "
                           + spent.toLocaleString() + " / " + cap.toLocaleString() + " cr";
      budgetEl.className = remaining < 0 ? "over" : remaining < 100 ? "tight" : "";
    } else {
      budgetEl.textContent = "BUDGET: " + remaining + " / " + cap + " cr remaining";
      budgetEl.className = remaining < 0 ? "over" : remaining < 100 ? "tight" : "";
    }
  }
  if (budgetFill) {
    budgetFill.style.transform = unlimited ? "scaleX(0)" : "scaleX(" + Math.max(0, Math.min(1, spent / cap)) + ")";
  }
  if (unlimitedBtn) {
    unlimitedBtn.hidden = !!owned;
    unlimitedBtn.textContent = unlimited ? "∞ FREE BUILD: ON" : "∞ FREE BUILD";
    unlimitedBtn.className = "cs-unlimited-btn" + (unlimited ? " on" : "");
  }

  // Which category tab is open — persisted across rebuilds; default to the first.
  // PSEUDO_CATS are the tabs that are not parts categories: who the car belongs
  // to, and what it is painted.
  if (!csActiveCat || (!PSEUDO_CATS.includes(csActiveCat) && !Parts.CATALOG.some((c) => c.id === csActiveCat))) csActiveCat = Parts.CATALOG[0].id;
  const activeCat = Parts.CATALOG.find((c) => c.id === csActiveCat);

  // Resolve the currently-fitted option for a category (respecting supplier lock).
  const resolveOpt = (cat) => {
    const id = parts[cat.id] || Parts.DEFAULTS[cat.id];
    return cat.options.find((o) => o.id === id && Parts.isOptionAvailable(o, team))
        || cat.options.find((o) => o.id === Parts.DEFAULTS[cat.id]);
  };

  // ---- Category tabs (one row, horizontally scrollable) ----
  const tabs = $("cs-tabs");
  tabs.textContent = "";
  // TEAM leads: it gates which parts are even offered (supplier exclusives, see
  // Parts.isOptionAvailable) and which liveries exist, so it is genuinely
  // upstream of everything below it.
  //
  // The label is one word because the rail is ~90px wide — "SUSPENSION" already
  // nearly fills it and .cs-tab-lbl ellipsises, so "TEAM & DRIVER" rendered as
  // "TEAM & DRI…". The sub-line carries the DRIVER rather than repeating the
  // team, which the header (#cs-team) is already showing in full.
  {
    const d = team.drivers[G.driverIdx] || team.drivers[0];
    tabs.appendChild(pseudoTab("team", "TEAM", d ? d.name.split(" ").pop() : team.short));
  }
  for (const cat of Parts.CATALOG) {
    const cur = resolveOpt(cat);
    tabs.appendChild(pseudoTab(cat.id, cat.label, cur ? cur.label : "",
                               cur && cur.id !== Parts.DEFAULTS[cat.id]));
  }
  // LIVERY pseudo-tab (paint jobs) — appended after the parts categories.
  {
    const curLiv = getLiveries(team).find((l) => l.id === getLiveryId(team.id));
    tabs.appendChild(pseudoTab("livery", "LIVERY", curLiv ? curLiv.name : "Team",
                               getLiveryId(team.id) !== "default"));
  }

  // ---- Options list for the active category ----
  const optsEl = $("cs-options");
  optsEl.textContent = "";
  if (csActiveCat === "team")   { buildTeamOptions(optsEl, team);   renderStatBars($("cs-stats-inner"), team); return; }
  if (csActiveCat === "livery") { buildLiveryOptions(optsEl, team); renderStatBars($("cs-stats-inner"), team); return; }
  const curOpt = resolveOpt(activeCat);
  const curCost = curOpt ? (curOpt.cost || 0) : 0;
  const factorySetup = Parts.getFactorySetup(team);
  for (const opt of activeCat.options) {
    if (!Parts.isOptionAvailable(opt, team)) continue;
    // The R&D gate is a THIRD row state, not a filter: an unresearched part still
    // lists, because "what could this car become" is most of what the garage is for
    // in a career. Only the supplier/team gate above hides a row outright.
    const locked = !Parts.isOptionAvailable(opt, team, owned);
    const active = curOpt && curOpt.id === opt.id;
    const costDelta = (opt.cost || 0) - curCost;
    const wouldExceed = !active && !unlimited && (spent + costDelta > cap);

    const row = document.createElement("button");
    const restricted = opt.supplier || opt.suppliers || opt.team || opt.teams;
    row.className = "cs-opt" + (active ? " active" : "") + (wouldExceed ? " over-budget" : "")
                  + (locked ? " locked" : "") + (restricted ? " exclusive" : "");
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
      tg.textContent = Array.from(new Set(badges)).join(" · ");
      nameRow.appendChild(tg);
    }
    main.appendChild(nameRow);
    const deltas = statDeltaChips(opt);
    if (deltas) main.appendChild(deltas);
    if (active && opt.desc) { const d = document.createElement("div"); d.className = "cs-opt-desc"; d.textContent = opt.desc; main.appendChild(d); }
    row.appendChild(main);

    const cost = document.createElement("span");
    // A locked row is quoting a PRICE, not a spec, so it says what buying it costs
    // rather than what fitting it would charge against the cap.
    cost.className = "cs-opt-cost" + (locked ? " research" : opt.cost > 0 ? "" : " free");
    cost.textContent = locked ? "RESEARCH · " + Career.researchCost(opt).toLocaleString() + " cr"
                     : opt.cost > 0 ? opt.cost + " cr" : "FREE";
    row.appendChild(cost);

    const reject = () => {
      row.classList.add("budget-reject");
      row.addEventListener("animationend", () => row.classList.remove("budget-reject"), { once: true });
      if (G.soundOn) GameAudio.uiTick();
    };

    row.onclick = () => {
      if (active) return;
      // An unowned part is BOUGHT before it can be fitted, and the two draw on
      // different budgets: research spends the balance, fitting spends the cap. So a
      // research can succeed and the fit behind it still be refused — the rebuild in
      // that branch is the feedback, since the money really did leave the account
      // and shaking a row that just cost you 900 cr would read as "nothing happened".
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

// Small ▲/▼ stat-effect chips for an option row — reads the raw physics
// multipliers off the option (absent field = no change). Purely informational.
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

// A livery swatch: two-tone base + an optional centre racing-stripe band so the
// picker previews exactly what renders on the car.
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

// Render the paint-job picker into the options list — each livery as a two-tone
// (optionally striped) swatch + name; clicking repaints the live car preview
// instantly. Player-created liveries get a delete affordance; a CREATE row opens
// the inline creator.
function buildLiveryOptions(container, team) {
  if (csLivCreating) { buildLiveryCreator(container, team); return; }
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
                     noseStripe: "", nose: "", pod: "", wing: "", fin: "", finArt: "", logo: "",
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
    // Every row gets the wrap now: custom rows carry edit+delete, stock rows a
    // duplicate ("start from this") button that prefills the creator.
    const rowWrap = document.createElement("div");
    rowWrap.className = "cs-liv-row";
    rowWrap.appendChild(row);

    const dot = document.createElement("span"); dot.className = "cs-opt-dot"; row.appendChild(dot);
    row.appendChild(livSwatch(liv));

    const main = document.createElement("div"); main.className = "cs-opt-main";
    const nameRow = document.createElement("div"); nameRow.className = "cs-opt-name";
    nameRow.appendChild(document.createTextNode(liv.name));
    if (isCustom) { const tg = document.createElement("span"); tg.className = "cs-opt-tag"; tg.textContent = "MINE"; nameRow.appendChild(tg); }
    // A non-gloss FINISH is invisible in a flat two-tone swatch, so it gets a
    // badge — otherwise a satin scheme is indistinguishable from its gloss twin
    // until you fit it and look at the turntable.
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
        setCustomLiveries(team.id, getCustomLiveries(team.id).filter((l) => l.id !== liv.id));
        if (active) saveLiveryId(team.id, "default");
        if (G.soundOn) GameAudio.uiTick();
        buildSetup();
      };
      rowWrap.appendChild(del);
    } else {
      const tag = document.createElement("span");
      tag.className = "cs-opt-cost free";
      tag.textContent = active ? "FITTED" : "PAINT";
      row.appendChild(tag);
      // Duplicate: open the creator PREFILLED from this stock scheme (including
      // its detail colours), so customising starts from a look the player likes
      // instead of always from bare team colours. Saves as a new custom livery.
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

// Inline paint-job creator: three colour wells (primary / accent / stripe) + a
// name field, previewing live on the car as the player drags. SAVE appends to
// the team's custom list and fits it; CANCEL/back returns to the picker.
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
    livePreviewDraft(team, d);
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
    return r;
  };
  wrap.appendChild(colorRow("PRIMARY", "c1", false));
  wrap.appendChild(colorRow("ACCENT", "c2", false));
  wrap.appendChild(colorRow("BODY STRIPE", "stripe", true));      // full spine: nose → engine cover
  wrap.appendChild(colorRow("NOSE STRIPE", "noseStripe", true));  // nose crown only: tip → bulkhead
  wrap.appendChild(colorRow("DETAIL", "accent", true));   // tertiary paint on flashes/trim/pinstripe
  // Optional detail-part colours (see liveries.js header): nose-tip cap, sidepod
  // panel, wing flap elements, halo hoop tint. NONE = today's default look.
  wrap.appendChild(colorRow("NOSE CAP", "nose", true));
  wrap.appendChild(colorRow("SIDEPOD", "pod", true));
  wrap.appendChild(colorRow("WINGS", "wing", true));
  // The shark-fin plate and the tail GRAPHIC painted on it are two separate
  // picks: the fin is one flat colour, so an art colour equal to it disappears.
  // NONE on FIN ART keeps the automatic choice, which contrasts the fin paint.
  wrap.appendChild(colorRow("TAIL FIN", "fin", true));
  // Three separate things people kept conflating: the fin PLATE, the abstract
  // brush-stroke graphic painted on it, and the team EMBLEM sitting on top.
  wrap.appendChild(colorRow("TAIL GRAPHIC", "finArt", true));
  wrap.appendChild(colorRow("TEAM LOGO", "logo", true));
  wrap.appendChild(colorRow("HALO", "halo", true));
  // FINISH is the paint MATERIAL rather than a colour, so it is a 3-way choice
  // instead of a colour well: gloss (the clearcoat car paint every livery has
  // always had), satin (flat matte wrap) and chrome (tinted mirror). Previews
  // live on the turntable like every colour row does.
  {
    const r = document.createElement("div"); r.className = "cs-liv-ed-row";
    const lb = document.createElement("span"); lb.className = "cs-liv-ed-lbl"; lb.textContent = "FINISH"; r.appendChild(lb);
    const group = document.createElement("span"); group.className = "cs-liv-ed-finish";
    const btns = [];
    for (const f of ["gloss", "satin", "chrome"]) {
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
    const id = csLivEditId || ("custom_" + livIdCounter());
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
    if (d.halo) liv.halo = hexToArr(d.halo);
    if (d.finish && d.finish !== "gloss") liv.finish = d.finish;
    const existing = getCustomLiveries(team.id);
    // Edit-in-place replaces the matching entry (same id); create appends.
    setCustomLiveries(team.id, csLivEditId ? existing.map((l) => (l.id === id ? liv : l)) : existing.concat([liv]));
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

// Monotonic id source for custom liveries (Date.now is fine; avoids collisions
// within a session even if the clock is coarse).
let _livSeq = 0;
function livIdCounter() { _livSeq = (_livSeq + 1) % 1000; return String(Date.now()) + _livSeq; }

// Paint the live 3D preview with an uncommitted draft via the transient
// override (no localStorage writes), then force a mesh rebuild.
// Last draft actually pushed to the preview, so a colour well that fires `input`
// per drag tick without changing value costs nothing. The decal ATLAS is keyed
// by (team, liveryId) — neither of which moves while the creator is open — so it
// has to be dropped explicitly or the painted marks (the fin's tail graphic
// above all, which is FIN ART's whole point) keep showing the previous colours.
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
    noseStripe: d.noseStripe ? hexToArr(d.noseStripe) : null,
    finish: d.finish && d.finish !== "gloss" ? d.finish : null } };
  G._spMeshKey = "";   // bust the setup-preview mesh cache so it repaints
}

// Leave the creator: drop the draft override AND the atlas built from it, so the
// car goes back to (or arrives at) the livery that is actually fitted.
function endLivPreview(team) {
  _livPreviewKey = "";
  G.livDraftOverride = null;
  if (invalidateDecalTextures) invalidateDecalTextures(team.id);
  G._spMeshKey = "";
}

function openSetup() {
  buildSetup();
  // Hide every screen the garage can be opened FROM. They sit under #carsetup
  // and are nearly opaque, so they block the live 3D preview behind the
  // now-transparent, docked setup panel. cs-done restores whichever one the
  // player came from (garageReturn).
  //
  // This list has been wrong twice, each time by one screen. First only #select
  // was hidden, on the assumption that #overlay was gone by the time #select
  // was reached — untrue of the title screen's GARAGE button, which opens setup
  // straight off #overlay and then showed the APEX 26 title through the panel.
  // Then the VS FRIEND waiting room grew its own GARAGE button and #vsfriend
  // stayed up ON TOP, so choosing a car meant closing the lobby — which drops
  // the connection.
  els.select.hidden = true;
  els.overlay.hidden = true;
  $("vsfriend").hidden = true;
  $("carsetup").hidden = false;
  G.setupPreviewOn = true;
}
return { buildSetup, openSetup, renderStatBars };
}

return { create };
})();
