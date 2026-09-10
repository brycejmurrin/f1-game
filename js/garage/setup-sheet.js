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
  const tune = typeof SetupTune !== "undefined" ? SetupTune.mods(team.id) : null;
  const mods = Parts.getMods(getTeamParts(team.id), team, tune);   // the bars move with the SETUP sheet too
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

const PSEUDO_CATS = ["team", "tune", "livery"];

// ONE DRAFT SHAPE, THREE DOORS INTO THE EDITOR. New, edit-in-place and
// "customize a copy" each used to spell the whole field list out by hand, and
// the copies had drifted: the DUPLICATE list was missing all eight structural
// fields (finStyle, finBadge, spineLogo, finShape, tcam, coverVents,
// spineHeight, spineSide). Nothing failed — pillRow falls back to `dflt` when a
// key is absent, so the editor showed STANDARD/NONE, and the save writes a
// field only when it differs from that default. Copying a team's own paint job
// therefore handed back a car with a shark fin and a flat spine (every team
// sets finShape "none" + spineHeight "dorsal" in js/data/teams.js), with the
// editor agreeing. A copy is now a copy because there is only one list.
// The save's own `if (d.x && d.x !== <default>)` chain and Liveries.forTeam's
// copy list are the other two spellings of these keys; team-livery.test.mjs
// holds all three together.
const LIV_DRAFT_COLORS = ["stripe", "noseStripe", "accent", "nose", "pod", "wing", "halo",
                          "rearWing", "cover", "spineTint", "sideTint", "sunTint",
                          "crestInk", "bandTint2", "plateTint", "plateInk",
                          "fin", "finArt", "logo", "logo2", "logo3"];
const LIV_DRAFT_PILLS = { wingCarbon: "paint", finish: "gloss", numFont: "default",
                          sponsors: "default", finStyle: "team", finBadge: "logo",
                          spineLogo: "logo", finShape: "standard", tcam: "team",
                          coverVents: "none", spineHeight: "standard", spineSide: "none", bodySplit: "off" };
// WHAT EACH ROW ACTUALLY PAINTS. Every label named a colour and none of them
// named a SURFACE, so the sheet could not answer its own first question: what
// does this change? Worse, two rows read as a pair and are not one — ACCENT is
// the second BASE colour (`c2`) that a dozen other rows fall back to, while
// DETAIL is a THIRD colour (`accent`) that overrides c2 on six small trim
// pieces. The labels invert the field names, so even the source misleads.
//
// A row that only INHERITS says so, because "already coloured" and "set" look
// identical on the car: leave WINGS alone and it is c2, and the player has no
// way to tell that from having chosen it. Surfaces are read from car3d.js —
// keep them true to the code, not to the label.
const LIV_ROW_HINT = {
  c1: "PRIMARY — the bodywork itself: monocoque, nose, sidepods, engine cover.",
  c2: "ACCENT — the second BASE colour. Unset optional rows fall back to this or PRIMARY — not to each other.",
  accent: "DETAIL — trim only (pinstripe, sidepod flash, nose flank spans, floor-edge lip, fin strip). Unset = ACCENT. Does not recolour stripe, saddle, sun, plate, or marks.",
  stripe: "BODY STRIPE — full spine, nose tip to engine cover. This row only.",
  noseStripe: "NOSE STRIPE — the nose crown only, tip to bulkhead. Layers on top of BODY STRIPE.",
  nose: "NOSE CAP — a painted nose cone. Unset = the bodywork colour.",
  pod: "SIDEPOD — the sidepod panel, both sides. Unset = the bodywork colour.",
  cover: "ENGINE COVER — airbox, roll structure, cover loft and snorkel. Unset = the bodywork colour.",
  spineTint: "SPINE TINT — the SPINE TOP band on the cover crown, and the saddle's flank half, ALONE. BODY STRIPE above runs the whole spine including the nose, so it cannot paint a dark band on a light nose. Unset = SECONDARY, else PRIMARY, checked against ENGINE COVER — never BODY STRIPE or DETAIL.",
  sideTint: "SIDE TINT — the SPINE SIDE colour graphics (BAND, SASH) on the cover flank, ALONE. A separate zone from SPINE TINT: with SPINE TOP on SADDLE the tint paints the flank these sit on, so one colour cannot serve both. Unset = derived from the livery and checked against the flank.",
  sunTint: "SUN — the WRAP design's sun disc, over the crown, both cover flanks and the airbox. Its own row because SPINE TINT used to paint this too: one field meant a band on most SPINE TOP designs and the sun on WRAP, so choosing WRAP repurposed a colour picked for a band. Unset = the mark's plate / SECONDARY against ENGINE COVER (never BODY STRIPE, never SPINE TINT).",
  crestInk: "CREST INK — lettering ink for the crown AND the cover-flank marks (number, code, logo, wordmark, duo). It is one ink for every surface those marks stand on: under SADDLE that includes the saddle panel; under WRAP the cover (the sun is a separate disc). Unset = picked to contrast with ENGINE COVER (or the flank the crown left).",
  bandTint2: "2ND BAND — the TRICOLOUR design's second band. Only one of its two bands was ever choosable and the other was derived, which is how a tricolour could come out one colour repeated. Unset = derived against both the cover and the first band.",
  plateTint: "PLATE PANEL — the board SPINE SIDE's PLATE / TITLE designs paint on. Unset = SECONDARY or DETAIL, re-picked to separate from the flank — never BODY STRIPE.",
  plateInk: "PLATE INK — the number on PLATE, and the sponsor text on TITLE. Unset = PRIMARY where it reads on the board, else the automatic ink.",
  wing: "WINGS — the front and rear FLAPS. Unset = ACCENT.",
  rearWing: "REAR WING — the rear mainplane block. Unset = ACCENT.",
  fin: "TAIL FIN — the shark-fin plate. Unset = ACCENT. Needs a FIN SHAPE other than NONE.",
  finArt: "TAIL GRAPHIC — fin motif / badge ink. Unset = first base colour that clears the fin plate.",
  halo: "HALO — the cockpit halo loop.",
  logo: "The dominant shape of the team mark, wherever it is drawn: fin badge, cover crown, garage wall.",
  logo2: "The mark's SECOND shape — a backing plate, a traced layer or an inner island, named per team. Marks built from one loop have no such row.",
  logo3: "OUTLINE — a rim around the mark. Offered on every mark, off by default.",
  finish: "FINISH — the paint surface: gloss, satin or chrome.",
  wingCarbon: "WING FLAPS — paint, or exposed carbon on every flap front and rear. Carbon overrides the WINGS and REAR WING colours.",
  numFont: "NUMBER FONT — the race number's typeface, on the nose and wherever a badge carries it.",
  sponsors: "SPONSORS — which set of names the car carries. CLEAN paints none, which also greys every spine design that writes a sponsor name (TOP wordmark, SIDE wordmark/duo/title).",
  finShape: "FIN SHAPE — the shark-fin blade. NONE removes it, and with it the fin's paint, graphic, style and badge. Every 2026 team car runs NONE.",
  finStyle: "TAIL STYLE — the motif painted on the fin.",
  finBadge: "FIN BADGE — what the fin carries: the mark, the race number, the driver code, or nothing.",
  spineLogo: "SPINE TOP — what the engine-cover CROWN carries, painted on bare body colour.",
  tcam: "T-CAM — the camera housing colour. AUTO is the real rule: car 1 black, car 2 yellow.",
  coverVents: "COVER VENTS — cooling slits cut into the engine cover. Geometry, not paint.",
  spineHeight: "SPINE HEIGHT — how tall the cover crown runs behind the roll hoop. DORSAL is the fin-less 2026 look every team uses.",
  spineSide: "SPINE SIDE — what the cover FLANK carries, both sides: number, mark, code, wordmark, title board, emblem, ribbon, lockup, band, sash, or slash.",
  bodySplit: "BODY SPLIT — paint the body LEFT (primary) / RIGHT (secondary). Cadillac's black/white launch car.",
};
// `liv` is a saved livery for edit/copy, or a bare {c1,c2} for a new one: an
// absent colour becomes "" (no paint) and an absent pill its own default.
function livDraftFrom(liv, name) {
  const d = { name, c1: arrToHex(liv.c1), c2: arrToHex(liv.c2) };
  for (const k of LIV_DRAFT_COLORS) d[k] = liv[k] ? arrToHex(liv[k]) : "";
  for (const k in LIV_DRAFT_PILLS) d[k] = liv[k] || LIV_DRAFT_PILLS[k];
  return d;
}

// THE REVERSE, and the ONLY one. Two more hand-written copies of the same field
// list used to live downstream — the SAVE's `if (d.x && d.x !== <default>)`
// chain and livePreviewDraft's object literal — so the car you were LOOKING at
// while dragging a colour and the livery you got when you pressed SAVE & FIT
// were assembled by different code. They agreed only by hand.
//
// One rule, two callers. A colour is written when it is set; a pill when it
// differs from its own default — which is what keeps a saved livery sparse
// (and the garage file small). `keepNull` is the only difference: the live
// preview needs every key PRESENT so resolveLivery's draft branch can read a
// null and paint the fallback, while the stored livery omits them.
function livDraftTo(d, keepNull) {
  const out = {};
  for (const k of LIV_DRAFT_COLORS) {
    const v = d[k] ? hexToArr(d[k]) : null;
    if (v || keepNull) out[k] = v;
  }
  for (const k in LIV_DRAFT_PILLS) {
    const v = d[k] && d[k] !== LIV_DRAFT_PILLS[k] ? d[k] : null;
    if (v || keepNull) out[k] = v;
  }
  return out;
}

function csTabId(id) { return "cs-tab-" + String(id).replace(/[^a-z0-9_-]/gi, "-"); }

// SHOW THE PART YOU JUST FITTED. Every catalog category changes the mesh
// (js/car/parts.js: each option carries a `visual` recipe), but the turntable
// kept whatever angle it was on, so an airbox swapped on a car facing away and
// a caliper changed behind a sidepod read as "nothing happened" — the owner's
// ask, in their words: "I want them to show the new part". One preset per
// category, chosen for where its parts live on the car; the existing camera
// bar presets, so a pick lands on exactly what SIDE or REAR would. Same idiom
// as the LIVERY tab framing FRONT: the preset stops the turntable, and SPIN or
// RESET hands it back. TEAM, SETUP and LIVERY are not parts and have no entry.
const CAT_VIEW = {
  engine: "hero",        // airbox, sidepods, engine cover: rear three-quarter
  aero: "wingRear",      // the flap and DRS, orbiting the rear wing
  suspension: "front",   // arms, pushrods and wishbones read head-on
  brakes: "side",        // calipers, ducts, rotors
  tyres: "side",
  wheels: "side",
  ers: "hero",           // LEDs, pack blister and conduit on the cover
  gearbox: "rear",       // casing strakes, fin, louvres
  fuel: "hero",          // filler, breather and hatch on the spine
  exhaust: "rear",
  floor: "side",         // fences, plank, edge lip
  cockpit: "front",      // halo, screen, mirrors
};
function framePreset(name) {
  const b = document.querySelector('#cs-stack [data-cs-view="' + name + '"]');
  if (b) b.click();   // a display:none stack (narrow landscape) still runs the handler
}
function activateCsCat(id, focus) {
  if (csActiveCat !== id) {
    csActiveCat = id;
    store.set("garageTab", id);
    if (G.soundOn) GameAudio.uiTick();
    buildSetup();
    const pane = $("cs-options"); if (pane) pane.scrollTop = 0;
    // LIVERY is about the wall crest as much as the paint chips: frame FRONT
    // on the category change only, never again while the tab stays open.
    if (id === "livery") framePreset("front");
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

  // THE GARAGE FILE — parts, liveries, setup sheets and an invented team, for
  // every team, saved out and read back in. It lives HERE rather than beside
  // the settings file in SETTINGS because this is where a player manages the
  // things it carries. The row is built fresh on every rebuild of this tab
  // (js/ui/settings-export.js garageRow), which is why nothing is cached.
  if (typeof SettingsExport !== "undefined" && SettingsExport.garageRow) {
    const row = SettingsExport.garageRow();
    if (row) { optsEl.appendChild(csLabel("GARAGE FILE")); optsEl.appendChild(row); }
  }
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
  tabs.appendChild(pseudoTab("tune", "SETUP", SetupTune.isDefault(team.id) ? "WORKS" : "TUNED",
                             !SetupTune.isDefault(team.id)));
  {
    tabs.appendChild(pseudoTab("livery", "LIVERY", "",
                               getLiveryId(team.id) !== "default"));
  }
  // THE GRID GETS ITS COLUMN COUNT FROM THE ROSTER, NOT FROM A LITERAL.
  // On the short-wide play shape css/carsetup.css lays this strip out as a
  // fixed TWO-ROW grid with `overflow: hidden` — the right trade there, since a
  // sideways pan hides half the catalogue. But the column count was written as
  // `repeat(7, ...)`, i.e. exactly 14 slots for the 14 tabs that existed when
  // it was measured. The roster has since grown to 15 (TEAM + 12 catalogue
  // categories + SETUP + LIVERY), so the LAST tab appended — LIVERY — landed on
  // an implicit third row that the max-height clips away: measured 2026-09-04 at
  // 852x393, `#cs-tab-livery` 53x6 px with 0 % of it visible and no scrollable
  // ancestor to reach it. A whole screen of the game, unreachable in landscape.
  // Ceiling of half the count keeps it two rows for any roster, so adding a
  // category can never silently push one off the sheet again.
  tabs.style.setProperty("--cs-tab-cols", String(Math.ceil(tabs.childElementCount / 2)));

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
  if (csActiveCat === "tune")   { buildTuneOptions(optsEl, team);   renderStatBars($("cs-stats-inner"), team); return; }
  const curOpt = resolveOpt(activeCat);
  const curCost = curOpt ? (curOpt.cost || 0) : 0;
  const factorySetup = Parts.getFactorySetup(team);
  // Cheapest first, so a category reads as the ladder it now is. The CATALOG
  // is in authoring order — McLaren's aero tab ran 0, 80, 40, 60, 0, 50 … 110,
  // 95, 185, and its own signature wing was row 18 of 18. Stable within a
  // price: `slice()` first, and ties keep authoring order.
  const shownOpts = activeCat.options.slice()
    .sort((a, b) => (a.cost || 0) - (b.cost || 0));
  for (const opt of shownOpts) {
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
    // Leads the row: on a wet compound it is the only badge that explains why
    // all four stat chips are pointing down.
    if (opt.wetTread) badges.push(opt.wetTread > 1 ? "WET" : "INTER");
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
    // The description used to appear only once the part was FITTED, which is
    // the one moment the player no longer needs it to decide.
    if (opt.desc) { const d = document.createElement("div"); d.className = "cs-opt-desc"; d.textContent = opt.desc; main.appendChild(d); }
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
      if (CAT_VIEW[activeCat.id]) framePreset(CAT_VIEW[activeCat.id]);   // show the part
      if (window.GarageScene && GarageScene.pulse) GarageScene.pulse();    // and the bay acknowledges it
      // The rebuild destroyed the focused row; without this a pad/keyboard
      // player's next arrow landed on the category TAB (first .active).
      const again = $("cs-options") && $("cs-options").querySelector('[data-cs-opt="' + opt.id + '"]');
      if (again) { try { again.focus({ preventScroll: true }); } catch (_) { again.focus(); } }
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
    // The magnitude, not just the direction. `tyres/branded_wall` (+2% grip,
    // 30 cr) and `tyres/hypersoft` (+36% grip, 200 cr) both rendered one plain
    // "▲GRIP", so the whole ladder read as a flat list of the same upgrade and
    // the only number on the row was its price.
    const pct = Math.round(Math.abs(v - 1) * 100);
    chip.textContent = (v > 1 ? "▲" : "▼") + d.label + " " + (v > 1 ? "+" : "−") + pct + "%";
    wrap.appendChild(chip);
  }
  // Rain grip is the entire reason the wet compounds exist and it is not one of
  // the four stats, so without this chip the garage shows a full wet as four
  // penalties and nothing else — which is exactly how it read while the physics
  // ignored the compound too. Against the slick column of the same table the
  // physics uses, so the number on the row is the number in the model.
  if (opt.wetTread) {
    const rain = PhysicsConsts.WET_GRIP.rain;
    const chip = document.createElement("span");
    chip.className = "cs-delta up";
    chip.textContent = "▲RAIN +" + Math.round((rain[opt.wetTread] / rain[0] - 1) * 100) + "%";
    wrap.appendChild(chip);
    any = true;
  }
  return any ? wrap : null;
}

function livSwatch(team, liv, tags) {
  const sw = document.createElement("span"); sw.className = "cs-liv-swatch";
  if (typeof LiveryTex !== "undefined" && LiveryTex.paintSwatch) {
    const c = document.createElement("canvas");
    c.width = 112; c.height = 80;
    c.setAttribute("aria-hidden", "true");
    LiveryTex.paintSwatch(c.getContext("2d"), team.id, liv, c.width, c.height);
    sw.appendChild(c);
  } else {
    sw.style.background = "linear-gradient(120deg, " + cssCol(liv.c1) + " 0 56%, " + cssCol(liv.c2) + " 56% 100%)";
    if (liv.stripe) {
      const st = document.createElement("span"); st.className = "cs-liv-stripe";
      st.style.background = cssCol(liv.stripe);
      sw.appendChild(st);
    }
  }
  if (tags && tags.length) {
    for (const label of tags) {
      const tg = document.createElement("span");
      tg.className = "cs-opt-tag";
      tg.textContent = label;
      sw.appendChild(tg);
    }
  }
  return sw;
}

// SETUP — the mechanical sheet (js/garage/setup-tune.js): five sliders on the
// tuner's .tune-row markup (DOM only, no new classes), a RAKE readout, and a
// RESET TO WORKS. Every slider writes the store on input; the stat bars and
// the player's mods follow through recomputePlayerMods on the next race.
function buildTuneOptions(container, team) {
  const wrap = document.createElement("div");
  // Not cs-liv-editor: that class widens the car reserve and translucents the
  // sheet for the PAINT editor. SETUP only needs the compact-density help hide.
  wrap.className = "cs-tune-editor";
  wrap.appendChild(csLabel("SETUP SHEET — " + team.short));
  const cur = SetupTune.get(team.id);
  const rows = {};
  const rakeOut = document.createElement("p"); rakeOut.id = "cs-rake-readout"; rakeOut.className = "adv-help";
  const refresh = () => {
    const t = SetupTune.get(team.id);
    for (const k of SetupTune.FIELDS) { rows[k].b.textContent = t[k] + SetupTune.RANGE[k].unit; rows[k].inp.value = t[k]; }
    rakeOut.textContent = "RAKE " + (t.rideR - t.rideF) + " mm (rear − front) · aero load "
      + (SetupTune.rake(team.id) >= 0 ? "+" : "") + Math.round(SetupTune.rake(team.id) * Parts.RH_GAIN * 100) + " %"
      + " · brake bias " + t.brakeBias.toFixed(1) + " % front";
    renderStatBars($("cs-stats-inner"), team);
    const tab = $(csTabId("tune"));
    if (tab) { tab.classList.toggle("upgraded", !SetupTune.isDefault(team.id)); const c = tab.querySelector(".cs-tab-cur"); if (c) c.textContent = SetupTune.isDefault(team.id) ? "WORKS" : "TUNED"; }
  };
  for (const k of SetupTune.FIELDS) {
    const r = SetupTune.RANGE[k];
    const lab = document.createElement("label"); lab.className = "tune-row";
    const span = document.createElement("span"); span.className = "tune-label";
    span.textContent = r.label + " ";
    const b = document.createElement("b"); span.appendChild(b);
    const inp = document.createElement("input");
    inp.type = "range"; inp.min = r.min; inp.max = r.max; inp.step = r.step; inp.value = cur[k];
    inp.dataset.csTune = k;
    inp.setAttribute("aria-label", r.label);
    inp.oninput = () => { SetupTune.set(team.id, { [k]: parseFloat(inp.value) }); refresh(); };
    lab.appendChild(span); lab.appendChild(inp);
    wrap.appendChild(lab);
    rows[k] = { b, inp };
  }
  wrap.appendChild(rakeOut);
  const note = document.createElement("p"); note.className = "adv-help";
  note.textContent = "Bars: stiffer overall sharpens turn-in and costs traction; a stiffer front than rear steadies braking. "
    + "Rake adds aero load on top of the wing (a max-wing car is already at full load). "
    + "Brake bias splits the friction budget between the axles under braking — forward understeers on entry, rearward rotates. "
    + "The works sheet is exactly the car it always was.";
  wrap.appendChild(note);
  const reset = document.createElement("button"); reset.type = "button"; reset.className = "cs-liv-ed-cancel";
  reset.textContent = "RESET TO WORKS";
  reset.onclick = () => { SetupTune.reset(team.id); if (G.soundOn) GameAudio.uiTick(); refresh(); };
  wrap.appendChild(reset);
  container.appendChild(wrap);
  refresh();
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
      // A blank canvas is blank PAINT, not a different car. Every pill defaults
      // to the plain 2020s shape — a standard shark fin on a standard spine —
      // and no 2026 team runs that: teams.js puts every one of them on
      // finShape "none" + spineHeight "dorsal". So NEW used to hand back a
      // car whose silhouette the player never chose and could only discover by
      // comparing it with the grid. It now starts on the TEAM'S OWN shape (its
      // livery pills) with none of its detail paint, so the only thing a new
      // paint job changes is the paint.
      const shape = {};
      if (team.livery) for (const k in LIV_DRAFT_PILLS) if (team.livery[k]) shape[k] = team.livery[k];
      csLivDraft = livDraftFrom(Object.assign({ c1: team.color, c2: team.color2 }, shape), "");
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
    const tags = [];
    if (isCustom) tags.push("MINE");
    if (liv.finish && liv.finish !== "gloss") tags.push(liv.finish.toUpperCase());
    row.appendChild(livSwatch(team, liv, tags));

    const main = document.createElement("div"); main.className = "cs-opt-main";
    const nameRow = document.createElement("div"); nameRow.className = "cs-opt-name";
    nameRow.appendChild(document.createTextNode(liv.name));
    main.appendChild(nameRow);
    row.appendChild(main);

    if (isCustom) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "cs-liv-edit"; edit.textContent = "✎";
      edit.title = "Edit this livery";
      edit.setAttribute("aria-label", "Edit " + liv.name + " livery");
      edit.onclick = () => {
        csLivDraft = livDraftFrom(liv, liv.name || "");
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
        csLivDraft = livDraftFrom(liv, (liv.name || "Custom").slice(0, 14) + " MK2");
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

  // CONDITIONAL ROWS. A field that paints onto a part the draft does not have
  // is greyed out, not hidden: FIN SHAPE "none" builds no blade and no fin
  // decal quads (car3d, car-mesh), so TAIL FIN, TAIL GRAPHIC, TAIL STYLE and
  // FIN BADGE all paint nothing until a fin is back. The row keeps its value —
  // choose a fin again and the earlier badge returns — and every control in it
  // is `disabled` for real, so a tap does nothing rather than editing a field
  // the car cannot show. Registered by the row builders; synced on every edit,
  // after refreshPalettes has rebuilt the palette chips it also disables.
  // A dep is a ROW (every control in it) or one PILL (a value that paints
  // nothing under the current draft — SPINE TOP "wordmark" with SPONSORS at
  // "clean" has no name to write). The audit behind the rules, from
  // liverytex.js: TAIL GRAPHIC is the fin motif's wash AND the ink of a number
  // or code badge, so it is dead only when the motif is off and the badge is
  // not a number; NUMBER FONT and the mark colours are always live (the nose
  // number and its crest head paint on every car), so they carry no dep.
  const deps = [];
  const needFin = () => (d.finShape || "standard") !== "none";
  const NO_FIN = "Needs a tail fin — pick a FIN SHAPE other than NONE";
  const finArtLive = () => needFin() && ((d.finStyle || "team") !== "none" || d.finBadge === "number" || d.finBadge === "code");
  const NO_ART = "Nothing to colour — TAIL STYLE is NONE and FIN BADGE is not a number or code";
  const haveNames = () => (d.sponsors || "default") !== "clean";
  const NO_NAMES = "Needs sponsor names — SPONSORS is CLEAN";
  const syncDeps = () => {
    for (const dep of deps) {
      const off = !dep.when();
      if (dep.pill) { dep.pill.disabled = off; dep.pill.title = off ? dep.why : ""; continue; }
      dep.row.setAttribute("aria-disabled", String(off));
      dep.row.title = off ? dep.why : "";
      const ctl = dep.row.querySelectorAll("button, input");
      for (let i = 0; i < ctl.length; i++) ctl[i].disabled = off;
    }
  };
  const applyPreview = (defer3d) => {
    prev.style.background = "linear-gradient(120deg, " + d.c1 + " 0 56%, " + d.c2 + " 56% 100%)";
    prev.textContent = "";
    if (d.stripe) { const st = document.createElement("span"); st.className = "cs-liv-stripe"; st.style.background = d.stripe; prev.appendChild(st); }
    refreshPalettes();   // a slot's new colour becomes matchable from every other slot
    syncDeps();
    defer3d ? scheduleLivPreview(team, d) : livePreviewDraft(team, d);
  };

  // MATCHING PALETTE. Twelve slots paint one car, and most paint jobs reuse the
  // same three or four colours across them — but every slot was a bare OS colour
  // dialog, so "the same red as the nose" meant eyeballing hex by hand and
  // getting it nearly right. These chips are the colours already in play: every
  // distinct value in the draft, then the team's own two stock colours. Click
  // one and the slot takes it EXACTLY.
  const PAL_KEYS = ["c1", "c2", "stripe", "noseStripe", "accent", "nose", "pod",
                    "wing", "rearWing", "cover", "fin", "finArt", "logo", "logo2", "logo3", "halo"];
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
    if (LIV_ROW_HINT[key]) { r.title = LIV_ROW_HINT[key]; r.setAttribute("aria-description", LIV_ROW_HINT[key]); }
    const lb = document.createElement("span"); lb.className = "cs-liv-ed-lbl"; lb.textContent = label; r.appendChild(lb);
    const inp = document.createElement("input"); inp.type = "color";
    inp.value = /^#[0-9a-fA-F]{6}$/.test(d[key]) ? d[key] : "#000000";
    if (allowNone && !d[key]) inp.classList.add("cs-liv-off");
    inp.oninput = () => { d[key] = inp.value; inp.classList.remove("cs-liv-off"); applyPreview(true); };
    inp.onchange = flushLivPreview;
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
  // GROUPED BY THE ZONE EACH ROW PAINTS. The sheet is twenty-three colour rows
  // now, and a flat list that long stops being a list — "which of these is the
  // one on the cover crown?" is a question the order should answer, not the
  // hover text. The headings are inert labels, so nothing about focus order,
  // the draft or the save changes; only the reading does.
  const section = (label) => {
    const r = document.createElement("div"); r.className = "cs-liv-ed-sec";
    r.textContent = label; r.setAttribute("role", "presentation");
    return r;
  };
  wrap.appendChild(section("BODY"));
  wrap.appendChild(colorRow("PRIMARY", "c1", false));
  wrap.appendChild(colorRow("ACCENT", "c2", false));
  wrap.appendChild(colorRow("BODY STRIPE", "stripe", true));      // full spine: nose → engine cover
  wrap.appendChild(colorRow("NOSE STRIPE", "noseStripe", true));  // nose crown only: tip → bulkhead
  wrap.appendChild(colorRow("DETAIL", "accent", true));   // tertiary paint on flashes/trim/pinstripe
  wrap.appendChild(colorRow("NOSE CAP", "nose", true));
  wrap.appendChild(colorRow("SIDEPOD", "pod", true));
  wrap.appendChild(section("ENGINE COVER"));
  wrap.appendChild(colorRow("ENGINE COVER", "cover", true));   // the airbox, roll hoop and cover top
  // SPINE TINT colours the SPINE TOP band alone. BODY STRIPE above runs the
  // whole spine including the nose, so it cannot say "dark band, light nose".
  wrap.appendChild(colorRow("SPINE TINT", "spineTint", true));
  wrap.appendChild(colorRow("SIDE TINT", "sideTint", true));
  // The four surfaces the crown and flank used to DERIVE. Each is a pick now,
  // and each falls back to exactly what it computed before when left unset, so
  // a livery that never touches these renders identically.
  wrap.appendChild(colorRow("SUN", "sunTint", true));          // the WRAP design's disc
  wrap.appendChild(colorRow("CREST INK", "crestInk", true));   // wordmark / number / keylines
  wrap.appendChild(colorRow("2ND BAND", "bandTint2", true));   // the TRICOLOUR's other band
  wrap.appendChild(colorRow("PLATE PANEL", "plateTint", true));
  wrap.appendChild(colorRow("PLATE NUMBER", "plateInk", true));
  // WINGS is the flap colour, front and rear; REAR WING is the rear mainplane
  // block (the SF-26's IBM blue). Both paint nothing when the flaps are carbon.
  wrap.appendChild(section("WINGS & TAIL"));
  const wingRow = colorRow("WINGS", "wing", true), rearWingRow = colorRow("REAR WING", "rearWing", true);
  wrap.appendChild(wingRow); wrap.appendChild(rearWingRow);
  const flapsPainted = () => (d.wingCarbon || "paint") !== "carbon";
  const NO_PAINT = "Nothing to colour — WING FLAPS is CARBON";
  deps.push({ row: wingRow, when: flapsPainted, why: NO_PAINT }, { row: rearWingRow, when: flapsPainted, why: NO_PAINT });
  const finRow = colorRow("TAIL FIN", "fin", true), finArtRow = colorRow("TAIL GRAPHIC", "finArt", true);
  wrap.appendChild(finRow); wrap.appendChild(finArtRow);
  deps.push({ row: finRow, when: needFin, why: NO_FIN }, { row: finArtRow, when: finArtLive, why: NO_ART });
  // Per-team mark rows: LiveryTex.markSlots names the shape each picker paints
  // on THIS mark, so a player choosing Racing Bulls sees RB LETTERS, BULL and
  // OUTLINE rather than rows that could mean anything. The LENGTH is the mark's
  // to decide — two rows for a single-loop silhouette that has no second shape,
  // three for a mark that does — so this loops rather than indexing.
  const mSlots = (window.LiveryTex && LiveryTex.markSlots)
    ? LiveryTex.markSlots(team.id)
    : [{ key: "logo", label: "TEAM LOGO" }, { key: "logo2", label: "LOGO DETAIL" },
       { key: "logo3", label: "OUTLINE" }];
  wrap.appendChild(section("TEAM MARK"));
  for (const slot of mSlots) wrap.appendChild(colorRow(slot.label, slot.key, true));
  wrap.appendChild(section("COCKPIT"));
  wrap.appendChild(colorRow("HALO", "halo", true));
  // One pill row per single-choice field: FINISH (Car3D's surface set — this
  // array and FINISH_SURFACE were two copies and the specs held a third),
  // NUMBER FONT and SPONSORS (LiveryTex's id lists). Same nodes and classes.
  const pillRow = (label, key, values, dflt) => {
    const r = document.createElement("div"); r.className = "cs-liv-ed-row";
    if (LIV_ROW_HINT[key]) { r.title = LIV_ROW_HINT[key]; r.setAttribute("aria-description", LIV_ROW_HINT[key]); }
    const lb = document.createElement("span"); lb.className = "cs-liv-ed-lbl"; lb.textContent = label; r.appendChild(lb);
    const group = document.createElement("span"); group.className = "cs-liv-ed-finish";
    const btns = [];
    for (const f of values) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cs-liv-ed-none" + ((d[key] || dflt) === f ? " active" : "");
      if (key === "finish") b.dataset.csFinish = f; else b.dataset.csPill = key + ":" + f;
      b.textContent = f.toUpperCase();
      b.setAttribute("aria-pressed", String((d[key] || dflt) === f));
      b.onclick = () => {
        d[key] = f;
        for (const other of btns) {
          const on = other === b;
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
    return r;
  };
  pillRow("FINISH", "finish", ["gloss", ...Object.keys(Car3D.FINISH_SURFACE)], "gloss");
  pillRow("WING FLAPS", "wingCarbon", ["paint", "carbon"], "paint");
  const LT = typeof LiveryTex !== "undefined" ? LiveryTex : null;
  pillRow("NUMBER FONT", "numFont", LT && LT.NUM_FONT_IDS || ["default"], "default");
  pillRow("SPONSORS", "sponsors", LT && LT.SPONSOR_PACK_IDS || ["default"], "default");
  // The tail DESIGN: what the fin is shaped like, what is painted on it, what it
  // carries, and whether the crest also repeats on the spine. Four single-choice
  // fields, so four pill rows — the same node shape as FINISH above.
  pillRow("FIN SHAPE", "finShape", Car3D.FIN_SHAPE_IDS || ["standard"], "standard");
  deps.push({ row: pillRow("TAIL STYLE", "finStyle", LT && LT.TAIL_STYLE_IDS || ["team"], "team"), when: needFin, why: NO_FIN });
  deps.push({ row: pillRow("FIN BADGE", "finBadge", LT && LT.FIN_BADGE_IDS || ["logo"], "logo"), when: needFin, why: NO_FIN });
  pillRow("SPINE TOP", "spineLogo", LT && LT.SPINE_LOGO_IDS || ["logo"], "logo");
  // Body details: the T-cam housing colour (the real car-1 / car-2 code) and
  // the engine-cover cooling vents. Both are mesh, so their id lists are Car3D's.
  pillRow("T-CAM", "tcam", Car3D.TCAM_IDS || ["team"], "team");
  pillRow("COVER VENTS", "coverVents", Car3D.COVER_VENT_IDS || ["none"], "none");
  // How tall the engine-cover crown runs behind the hoop — the no-fin dorsal look.
  pillRow("SPINE HEIGHT", "spineHeight", Car3D.SPINE_HEIGHT_IDS || ["standard"], "standard");
  // What the cover's FLANK carries — the number, the mark or the driver code.
  pillRow("SPINE SIDE", "spineSide", LT && LT.SPINE_SIDE_IDS || ["none"], "none");
  pillRow("BODY SPLIT", "bodySplit", ["off", "lr"], "off");
  // The pills that write a sponsor name: dead under the CLEAN pack.
  for (const k of ["spineLogo:wordmark", "spineSide:wordmark", "spineSide:duo", "spineSide:title"]) {
    const b = wrap.querySelector('[data-cs-pill="' + k + '"]');
    if (b) deps.push({ pill: b, when: haveNames, why: NO_NAMES });
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
    Object.assign(liv, livDraftTo(d, false));
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
  // Spine / logo edits need the crown in the car gap the sheet leaves — the
  // default front az puts the nose toward camera and the cover under the
  // panel. Hero is the rear three-quarter the CAMERA presets already use.
  const hero = document.querySelector('[data-cs-view="hero"]');
  if (hero) hero.click();
}

let _livSeq = 0;
function livIdCounter() { _livSeq = (_livSeq + 1) % 1000; return String(Date.now()) + _livSeq; }

let _livPreviewKey = "";
let _livPreviewTimer = null, _livPreviewPending = null;
function cancelLivPreview() {
  if (_livPreviewTimer != null) clearTimeout(_livPreviewTimer);
  _livPreviewTimer = null;
  _livPreviewPending = null;
}
function scheduleLivPreview(team, d) {
  if (_livPreviewTimer != null) clearTimeout(_livPreviewTimer);
  _livPreviewPending = { team, d };
  _livPreviewTimer = setTimeout(() => {
    const p = _livPreviewPending;
    _livPreviewTimer = null;
    _livPreviewPending = null;
    if (p) livePreviewDraft(p.team, p.d);
  }, 75);
}
function flushLivPreview() {
  const p = _livPreviewPending;
  cancelLivPreview();
  if (p) livePreviewDraft(p.team, p.d);
}
function livePreviewDraft(team, d) {
  const key = team.id + "|" + JSON.stringify(d);
  if (key === _livPreviewKey) return;
  _livPreviewKey = key;
  if (invalidateDecalTextures) invalidateDecalTextures(team.id);
  // id:"default" keeps brand plates / markOnField on while editing — a draft
  // without an id skipped the plated-mark path and looked like a bare car.
  G.livDraftOverride = { teamId: team.id,
    liv: Object.assign({ id: "default", c1: hexToArr(d.c1), c2: hexToArr(d.c2) }, livDraftTo(d, true)) };
  G._spMeshKey = "";   // bust the setup-preview mesh cache so it repaints
}

function endLivPreview(team) {
  cancelLivPreview();
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

// THE PAINT EDITOR DOES NOT OUTLIVE THE GARAGE. Only CANCEL and SAVE & FIT
// cleared the draft, so BACK/DONE (game.js leaveGarage) — or the race start
// hiding every .screen under a VS FRIEND guest — left csLivCreating set and
// G.livDraftOverride live. resolveLivery() reads that override for the
// player's team, so the next race painted the UNSAVED draft on the car, and the
// next garage visit re-opened the editor on it. Watching the screen's own
// `hidden` attribute (the sheetshape.js idiom) needs no new hook in game.js
// and catches every exit, including the ones that never call this module.
function discardLivDraft() {
  if (!csLivCreating) return;
  csLivCreating = false; csLivDraft = null; csLivEditId = null;
  const team = Teams.LIST[G.teamIdx];
  if (team) endLivPreview(team);
}
if (typeof MutationObserver === "function") {
  const cs = $("carsetup");
  if (cs) new MutationObserver(() => { if (cs.hidden) discardLivDraft(); })
    .observe(cs, { attributes: true, attributeFilter: ["hidden"] });
}
return { buildSetup, openSetup };
}

return { create };
})();
