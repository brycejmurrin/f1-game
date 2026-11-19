const SetupUI = (function () {
  "use strict";

function create(G) {
Log.info("ui", "SetupUI.create");
const tuneExperiments = SetupExperiments.create(G, (team) => renderStatBars($("cs-stats-inner"), team));
let surfaceControls = null;
function clearSurfaceControls() { if (surfaceControls) surfaceControls.dispose(); surfaceControls = null; }
function attrIf(el, k, v) {
  if (el.getAttribute(k) !== v) el.setAttribute(k, v);
}
function propIf(el, k, v) {
  if (el[k] !== v) el[k] = v;
}
const { $, els, cssCol, store, arrToHex, hexToArr,
        getTeamParts, saveTeamParts, getLiveryId, saveLiveryId,
        getCustomLiveries, setCustomLiveries, getLiveries, invalidateDecalTextures } = G;

const CS_STATS = Parts.STAT_KEYS;
const displayStat = Parts.displayStat;
function renderStatBars(container, team) {
  const stats = (typeof GarageExperience !== "undefined" ? GarageExperience.statsOf(team) : team.stats) || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  const tune = typeof SetupTune !== "undefined" ? SetupTune.mods(team.id) : null;
  const mods = Parts.getMods(getTeamParts(team.id), team, tune);
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
      boostBar.style.width = Math.min(delta, 100 - b) + "%";
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

let csVisitGeneration = 0;
let csActiveCat = null;
let csLivCreating = false;
let csLivDraft = null;
let csLivDirty = null;
let csLivEditId = null;
let csLivTeamId = null;

const PSEUDO_CATS = ["team", "tune", "livery"];
const SECONDARY_CATS = new Set(["floor", "cockpit", "wheels", "tune", "livery"]);

const LIV_DRAFT_COLORS = ["stripe", "noseStripe", "accent", "nose", "pod", "lower", "upper", "wing", "halo",
                          "rearWing", "cover", "spineTint", "saddleTint",
                          "sideTint", "sunTint",
                          "bandTint2", "plateTint",
                          "fin", "finArt", "logo", "logo2", "logo3", "patternTint", "patternSecond",
                          "mirrorTint", "rimTint", "caliperTint", "sidewallInk", "helmetBase", "helmetAccent", "endplate",
                          "floorTint", "suspTint", "ductTint", "deflectorTint", "cockpitTint", "gripTint", "boardTint", "exhaustTint"];
const LIV_DRAFT_PILLS = { wingCarbon: "paint", finish: "gloss", numFont: "default",
                          sponsors: "default", finStyle: "team", finBadge: "logo",
                          spineLogo: "logo", finShape: "standard", tcam: "team",
                          coverVents: "none", spineHeight: "standard", spineSide: "none",
                          coverBind: "independent", finHandoff: "match", bodySplit: "off", bodyStyle: "team", aeroShape: "fitted", floorShape: "fitted",
                          engineShape: "fitted", suspensionShape: "fitted", brakesShape: "fitted", tyresShape: "fitted", ersShape: "fitted",
                          gearboxShape: "fitted", fuelShape: "fitted", exhaustShape: "fitted", cockpitShape: "fitted", wheelsShape: "fitted",
                          patternPlacement: "crown", patternSide: "both", patternWidth: "70", patternRepeat: "6",
                          patternOffset: "0", patternTaper: "20", patternOpacity: "100",
                          patternRotation: "0", patternStretch: "100", patternWeight: "100", patternKey: "auto",
                          decalNoseTip: "on", decalCockpit: "on", decalPodTop: "on", decalHalo: "on",
                          coverFinish: "inherit", wingFinish: "inherit", haloFinish: "inherit",
                          podFinish: "inherit", finFinish: "inherit", mirrorFinish: "inherit", helmetStyle: "team", crestStyle: "team", crestTone: "team", crestFrame: "none",
                          floorFinish: "inherit", suspFinish: "inherit", rimFinish: "inherit", noseFinish: "inherit",
                          ductFinish: "inherit", deflectorFinish: "inherit", cockpitFinish: "inherit", boardFinish: "inherit" };
const LIV_ROW_HINT = {
  c1: "PRIMARY — the bodywork itself: monocoque, nose, sidepods, engine cover.",
  c2: "ACCENT — the second BASE colour. Unset optional rows fall back to this or PRIMARY — not to each other.",
  accent: "DETAIL — trim only (pinstripe, sidepod flash, nose flank spans, floor-edge lip, fin strip) and the keyline round the race number (nose, SPINE SIDE number / code / lockup). The colour you pick is used as-is. Unset = ACCENT, contrast-checked beside the number. Does not recolour stripe, saddle, sun, plate, or marks.",
  stripe: "BODY STRIPE — full spine, nose tip to engine cover. This row only.",
  noseStripe: "NOSE STRIPE — the nose crown only, tip to bulkhead. Layers on top of BODY STRIPE.",
  nose: "NOSE CAP — a painted nose cone. Unset = the bodywork colour.",
  pod: "SIDEPOD — the whole painted sidepod shell, both sides. Intake voids, carbon and separate trim keep their colours. Unset = the bodywork colour.",
  lower: "LOWER BODY — the bodywork below a line along the sidepods at the sponsor board's top edge, carried forward along the chassis side to the nose (pod flanks and undersides, lower chassis; the nose stays PRIMARY). Only bare PRIMARY paint changes: the accent band, board, stripes and caps keep theirs. Ignored under BODY SPLIT L/R. Unset = PRIMARY.",
  upper: "UPPER BODY — the bodywork ABOVE that same sidepod board line (upper chassis / pod flanks above the board; the nose stays PRIMARY). The W17's silver-over-black split. Only bare PRIMARY paint changes. Ignored under BODY SPLIT L/R. Unset = PRIMARY (today's single-colour body above the line).",
  cover: "ENGINE COVER — airbox, roll hoop, cover loft and snorkel. Unset = the bodywork colour. (AIRBOX had its own row and no longer does: it painted a strict subset of these surfaces.)",
  spineTint: "BAND — the SPINE TOP graphic fill on the cover crown, the tail top, the centreline RIDGE, and the saddle's flank half when SADDLE is unset. The colour you pick is used as-is. Unset = SECONDARY, else PRIMARY, checked against ENGINE COVER — never BODY STRIPE or DETAIL.",
  saddleTint: "SADDLE — the shoulder shelf and upper-flank saddle block, and the SPINE SIDE shoulder / rake fills. The colour you pick is used as-is. Unset = BAND under SADDLE or SADDLE WRAP.",
  sideTint: "FLANK FILL — every SPINE SIDE colour FILL on the cover flank (BAND, SASH, RIBBON strip, SLASH, RAKE, SHOULDER, STARFIELD dots), ALONE. A separate zone from BAND: with SPINE TOP on SADDLE the band paints the flank these sit on, so one colour cannot serve both. The colour you pick is used as-is. Unset = derived against the flank; RAKE and SHOULDER borrow SADDLE first.",
  sunTint: "SUN — the WRAP design's sun disc, over the crown, both cover flanks and the airbox. Its own row because BAND used to paint it too: one field meant a band on most SPINE TOP designs and the sun on WRAP. The colour you pick is used as-is. Unset = the mark's plate / SECONDARY against ENGINE COVER.",
  bandTint2: "2ND BAND — the TRICOLOUR design's second band. Only one of its two bands was ever choosable and the other was derived, which is how a tricolour could come out one colour repeated. The colour you pick is used as-is. Unset = derived against the cover and the first band.",
  plateTint: "PLATE — the board SPINE SIDE's PLATE / TITLE designs paint on. The colour you pick is used as-is. Unset = SECONDARY, contrast-checked against the flank — never BODY STRIPE. Lettering auto-inks.",
  wing: "WINGS — the front and rear FLAPS. Unset = ACCENT.",
  rearWing: "REAR WING — the rear mainplane block. Unset = ACCENT.",
  crestStyle: "CREST — TEAM keeps the team's own mark; the others are original emblems (shield, roundel, wings, arrow, star, bolt, laurel, chevrons, diamond, gear, crown, flag, flame) worn wherever the mark sits: nose, cover, fin and flanks.",
  crestTone: "CREST TONE — the emblem's two colours: TEAM as picked for this paint, SWAP trades them, MONO paints the silhouette in one.",
  crestFrame: "CREST FRAME — a backing behind the emblem: DISC, SHIELD or BADGE plate in the second colour, or a RING keyline. NONE draws it bare.",
  endplate: "ENDPLATES — the front-wing endplates and the rear-wing endplate bodies. Unset = the secondary body colour at the front, dark at the rear.",
  fin: "TAIL FIN — the shark-fin plate. The colour you pick is used as-is (even under FIN HANDOFF CONTRAST). Unset = ACCENT, or a contrast-derived colour when HANDOFF is CONTRAST. Needs a FIN SHAPE other than NONE.",
  finArt: "TAIL GRAPHIC — fin motif / badge ink. The colour you pick is used as-is. Unset = first base colour that clears the fin plate.",
  halo: "HALO — the cockpit halo loop.",
  logo: "TEAM LOGO — the dominant shape of the team mark everywhere it is drawn: crown, fin badge, SPINE SIDE logo/emblem/lockup, the WRAP design's flank bull, the livery tile, garage wall. The colour you pick is used as-is (no contrast override). Lettering (numbers, wordmarks) auto-contrasts; it is not this row.",
  logo2: "LOGO DETAIL — the mark's second shape (shield, disc, traced layer, or island), named per team. One-loop marks have no such row. The colour you pick is used as-is. Authored plates reach the flank logo/emblem too.",
  logo3: "OUTLINE — a rim around the mark only, in the colour you pick. Off by default.",
  patternPlacement: "DESIGN AREA — new spine patterns cover the crown/tail or continue over the shoulders.",
  patternSide: "WRAP SIDES — both cover flanks, or just the chosen side; crown remains painted.",
  patternWidth: "DESIGN WIDTH — coverage across the crown and flank, as a percentage.",
  patternRepeat: "REPEATS — density of repeated shapes or lines on the cover.",
  patternOffset: "SIDE OFFSET — shift the new spine pattern across the cover.",
  patternTaper: "TAIL TAPER — narrow the pattern toward the rear of the cover.",
  patternOpacity: "OPACITY — transparency of the new spine artwork over its base paint.",
  patternRotation: "ROTATION — turn the artwork within its painted area. Wrap sides remain aligned with the crown.",
  patternStretch: "LENGTH STRETCH — compress or extend the artwork along the engine cover.",
  patternWeight: "LINE WEIGHT — thickness of contour, honeycomb, wave, herringbone, circuit and speed-line strokes, and of the keylines on the tartan, bordered-stripe, spearhead, deck-split and keyline-split layouts.",
  decalNoseTip: "NOSE TIP — the cap on the last 280 mm of the nose: the NOSE CAP colour when set, else the accent.",
  decalCockpit: "COCKPIT SIDE — the driver's three-letter code beside the cockpit.",
  decalPodTop: "SIDEPOD TOP — the main sponsor along the top of each sidepod.",
  decalHalo: "HALO TOP — a sponsor along the halo's crown bar (not shown under a faired or fenced halo).",
  patternKey: "KEYLINE — which colour paints the keylines of the tartan, bordered-stripe, spearhead, deck-split and keyline-split layouts, and the tricolour's middle band. AUTO keeps each layout's own pick.",
  patternTint: "DESIGN COLOUR — adjustable artwork on the crown and selected cover flanks. Unset = ACCENT.",
  patternSecond: "SECOND DESIGN COLOUR — two-colour patterns, including gradients, waves, sunbursts, scallops, herringbone, circuits, shards and pixel fade. Unset = PRIMARY.",
  coverFinish: "COVER FINISH — painted engine cover and airbox; INHERIT uses FINISH. Carbon and intake surfaces stay unchanged.",
  wingFinish: "WING FINISH — painted front and rear wing assemblies, including moving flaps. Carbon stays carbon.",
  haloFinish: "HALO FINISH — the painted halo; INHERIT uses FINISH.",
  podFinish: "SIDEPOD FINISH — the painted sidepods; INHERIT uses FINISH. Carbon and intake surfaces stay unchanged.",
  finFinish: "FIN FINISH — the painted shark fin; INHERIT uses FINISH. Needs a FIN SHAPE other than NONE.",
  mirrorFinish: "MIRROR FINISH — the painted mirror housings; INHERIT uses FINISH. Mirror glass is untouched.",
  mirrorTint: "MIRROR HOUSING — the painted mirror stalks and housings. Unset = the stock dark carbon housing.",
  rimTint: "RIM — the wheel rim colour on all four wheels. Unset = the BRAKES part's rim colour.",
  rimFinish: "RIM FINISH — the rim lip, spokes and hub boss on all four wheels: CHROME or GOLD-with-RIM rims. INHERIT = bare metal.",
  floorTint: "FLOOR EDGE — the floor edge rails, floor fences and bargeboard vanes. Unset = bare carbon.",
  floorFinish: "FLOOR FINISH — the floor edge, fences and bargeboards; INHERIT uses FINISH on a painted floor, bare carbon otherwise.",
  suspTint: "SUSPENSION — the wishbones, pushrods and rockers. Unset = the suspension part's dark carbon.",
  suspFinish: "SUSPENSION FINISH — the suspension arms; INHERIT uses FINISH on painted arms, bare carbon otherwise.",
  ductFinish: "BRAKE DUCT FINISH — the duct bodies and scoops; inlet mouths stay dark. INHERIT keeps bare carbon unless BRAKE DUCTS has a colour, then uses FINISH.",
  deflectorFinish: "DEFLECTOR FINISH — over-wheel planes and stalks on wheel parts that fit them. INHERIT keeps bare carbon unless DEFLECTORS has a colour, then uses FINISH.",
  cockpitFinish: "COCKPIT SURROUND FINISH — headrest and painted bolsters. Harness, instruments and metal controls stay unchanged. INHERIT uses FINISH on paint and keeps bare carbon.",
  boardFinish: "NUMBER BOARD FINISH — the rear-wing number board; INHERIT uses FINISH. The number keeps its inked patch.",
  ductTint: "BRAKE DUCTS — the brake duct bodies and scoops; the inlet mouths stay dark. Unset = carbon.",
  deflectorTint: "DEFLECTORS — the over-wheel deflector planes and stalks (when the WHEELS part fits them). Unset = carbon.",
  cockpitTint: "COCKPIT SURROUND — the headrest pad and the cockpit-side bolsters. Unset = dark pad, PRIMARY bolsters.",
  gripTint: "GRIPS — the steering-wheel hand grips, seen from the cockpit camera. Unset = black rubber.",
  noseFinish: "NOSE FINISH — every painted surface ahead of the nose bulkhead (cone, cap, nose stripes); INHERIT uses FINISH.",
  boardTint: "NUMBER BOARD — the rear-wing endplate board behind the race number. Unset = PRIMARY. The number keeps its own inked patch.",
  exhaustTint: "EXHAUST HEAT — the heat-tinted exhaust tip. Unset = the FUEL part's flame colour.",
  caliperTint: "CALIPER — the brake caliper colour on all four wheels. Unset = the BRAKES part's caliper colour.",
  sidewallInk: "SIDEWALL INK — the lettering ink on the tyre sidewall; the compound band keeps its colour. Unset = the stock dark lettering.",
  helmetBase: "HELMET BASE — the helmet shell colour. Unset = the driver's own design.",
  helmetAccent: "HELMET ACCENT — the helmet's stripe and cap colour. Unset = the driver's own design.",
  helmetStyle: "HELMET — TEAM keeps the driver's own design; other styles repaint it from HELMET BASE and ACCENT.",
  finish: "FINISH — the whole-car paint surface. Choose a sheen, texture or colour-shifting effect; regional INHERIT buttons follow this choice.",
  wingCarbon: "WING FLAPS — paint, or exposed carbon on every flap front and rear. Carbon overrides the WINGS and REAR WING colours.",
  numFont: "NUMBER FONT — the race number's typeface, on the nose and wherever a badge carries it.",
  sponsors: "SPONSORS — which set of names the car carries. CLEAN paints none, which also greys every spine design that writes a sponsor name (TOP wordmark, SIDE wordmark/duo/title).",
  aeroShape: "AERO SHAPE — front/rear wing and aero package appearance. FITTED follows your installed AERO part. Looks only; performance and fitted parts stay unchanged.",
  floorShape: "FLOOR SHAPE — floor and diffuser appearance. FITTED follows your installed FLOOR part. Looks only; performance and fitted parts stay unchanged.",
  bodyStyle: "BODY — the chassis silhouette. TEAM keeps this car's own shape; concept bodies reshape the nose, sidepods and engine cover. Looks only — performance stays the same.",
  finShape: "FIN SHAPE — the shark-fin blade. NONE removes it, and with it the fin's paint, graphic, style and badge. Every 2026 team car runs NONE.",
  finStyle: "TAIL STYLE — the motif painted on the fin.",
  finBadge: "FIN BADGE — what the fin carries: the mark, the race number, the driver code, or nothing.",
  spineLogo: "SPINE TOP — what the engine-cover CROWN carries, painted on bare body colour.",
  coverBind: "COVER BIND — how crown and flank zones couple. INDEPENDENT = each zone free; SADDLE WRAP = saddle block spans crown shoulders and upper flanks; SPINE ONLY = crown/ridge accent only, shoulders stay cover.",
  finHandoff: "FIN HANDOFF — how the fin meets the cover block. MATCH = fin uses TAIL FIN (or ACCENT); CONTRAST = when TAIL FIN is unset, derive a colour that clears the crown/saddle block (authored TAIL FIN still wins); HARD CUT = fin ignores crown graphic continuation at the fin root.",
  tcam: "T-CAM — the camera housing colour. AUTO is the real rule: car 1 black, car 2 yellow.",
  coverVents: "COVER VENTS — cooling slits cut into the engine cover. Geometry, not paint.",
  spineHeight: "SPINE HEIGHT — how tall the cover crown runs behind the roll hoop. DORSAL is the fin-less 2026 look every team uses.",
  spineSide: "SPINE SIDE — what the cover FLANK carries, both sides: number, mark, code, number plate, wordmark, duo, ribbon, lockup, title board, emblem, or a colour fill (band, sash, slash, rake, shoulder, starfield — SIDE TINT paints those).",
  bodySplit: "BODY SPLIT — paint the body LEFT (primary) / RIGHT (secondary). Cadillac's black/white launch car.",
};
function livDraftFrom(liv, name) {
  const src = (typeof Liveries !== "undefined" && Liveries.migratePaint)
    ? Liveries.migratePaint(Object.assign({}, liv || {})) : (liv || {});
  const d = { name, c1: arrToHex(src.c1), c2: arrToHex(src.c2) };
  for (const k of LIV_DRAFT_COLORS) d[k] = src[k] ? arrToHex(src[k]) : "";
  for (const k in LIV_DRAFT_PILLS) d[k] = src[k] || LIV_DRAFT_PILLS[k];
  return d;
}

function livDraftFromOwn(src, name, teamId) {
  const d = livDraftFrom(src, name);
  const LTn = typeof LiveryTex !== "undefined" ? LiveryTex : null;
  if (!LTn || !LTn.markPalette || !LTn.markSlots) return d;
  const slots = LTn.markSlots(teamId);
  if (slots[0] && slots[0].label === "EMBLEM TINT") return d;
  const own = Object.assign({}, src, { id: "default" });
  const pal = LTn.markPalette(teamId, own, [own.cover || own.c1], false);
  if (!d.logo && pal.mark) d.logo = arrToHex(pal.mark);
  if (!d.logo2 && pal.plate && slots.some((x) => x.key === "logo2")) d.logo2 = arrToHex(pal.plate);
  return d;
}

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

function csTabId(id) { return `cs-tab-${String(id).replace(/[^a-z0-9_-]/gi, "-")}`; }

const CAT_VIEW = {
  engine: "hero",
  aero: "wingRear",
  suspension: "front",
  brakes: "side",
  tyres: "side",
  wheels: "side",
  ers: "hero",
  gearbox: "rear",
  fuel: "hero",
  exhaust: "rear",
  floor: "side",
  cockpit: "front",
};
function framePreset(name) {
  const b = document.querySelector(`#cs-stack [data-cs-view="${name}"]`);
  if (!b) return;
  const was = G.soundOn;
  try { G.soundOn = false; b.click(); } finally { G.soundOn = was; }
}
function activateCsCat(id, focus) {
  if (csActiveCat !== id) {
    csActiveCat = id;
    store.set("garageTab", id);
    if (G.soundOn) GameAudio.uiTick();
    buildSetup();
    const pane = $("cs-options"); if (pane) pane.scrollTop = 0;
    if (id === "livery") framePreset("front");
    else if (CAT_VIEW[id]) framePreset(CAT_VIEW[id]);
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

function tabSub(opt) {
  if (!opt) return "";
  const words = String(opt.label || "").split(" ");
  return opt.tag === "SIGNATURE" && words.length > 1 ? words.slice(1).join(" ") : opt.label;
}

function pseudoTab(id, label, sub, flagged, spoken) {
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
  tab.setAttribute("aria-label", (spoken || sub) ? label + " — " + (spoken || sub) : label);
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

const CREW_NAMES = { classic: "CLASSIC", sculpted: "SCULPTED", pitstop: "PIT STOP", workshop: "WORKSHOP", welcome: "WELCOME" };
const MOOD_NAMES = { shipped: "STANDARD", broadcast: "BROADCAST", night: "NIGHT", showroom: "SHOWROOM", daylight: "DAYLIGHT",
  inspection: "INSPECTION", goldenhour: "GOLDEN HOUR", endurance: "ENDURANCE", podium: "PODIUM", rain: "RAIN DAY", neon: "NEON NIGHT" };
function lookRowSpecs() {
  const out = [];
  if (typeof GaragePrims !== "undefined" && GaragePrims.LOOK_IDS)
    out.push({ label: "GARAGE", key: "room", ids: GaragePrims.LOOK_IDS, cur: GaragePrims.lookId(),
      name: (id) => (GaragePrims.LOOKS[id] ? GaragePrims.LOOKS[id].label.toUpperCase() : "TEAM BAY"),
      apply: (id) => { GaragePrims.setLook(id); } });
  if (typeof GarageCrew !== "undefined" && GarageCrew.LOOKS)
    out.push({ label: "CREW", key: "crew", ids: GarageCrew.LOOKS, cur: GarageCrew.look(),
      name: (id) => CREW_NAMES[id] || id.toUpperCase(), apply: (id) => { GarageCrew.setLook(id); } });
  if (typeof GarageScene !== "undefined" && GarageScene.MOODS && GarageScene.setMood)
    out.push({ label: "LIGHTING", key: "mood", ids: Object.keys(GarageScene.MOODS), cur: GarageScene.mood(),
      name: (id) => MOOD_NAMES[id] || id.toUpperCase(), apply: (id) => { GarageScene.setMood(id); } });
  return out;
}
function buildLookRows(optsEl) {
  for (const { label, key, ids, cur, name, apply } of lookRowSpecs()) {
    optsEl.appendChild(csLabel(label));
    const row = document.createElement("div");
    row.className = "chip-row"; row.id = "cs-look-" + key;
    row.setAttribute("role", "group"); row.setAttribute("aria-label", "Garage " + label.toLowerCase());
    let selected = cur;
    for (const id of ids) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sel-chip" + (id === cur ? " active" : "");
      b.setAttribute("aria-pressed", id === cur ? "true" : "false");
      b.dataset.csLook = key + ":" + id;
      b.textContent = name(id);
      b.onclick = () => {
        if (id === selected) return;
        apply(id);
        if (G.soundOn) GameAudio.uiTick();
        if (key === "mood") {
          selected = id;
          for (const peer of row.children) {
            const active = peer === b;
            peer.classList.toggle("active", active);
            peer.setAttribute("aria-pressed", String(active));
          }
          b.focus({ preventScroll: true });
          return;
        }
        buildSetup();
        $("cs-options")?.querySelector(`[data-cs-look="${key}:${id}"]`)?.focus({ preventScroll: true });
      };
      row.appendChild(b);
    }
    optsEl.appendChild(row);
  }
}

function buildTeamOptions(optsEl, team) {
  const pitLocked = () => G.state === "race";
  const careerLocked = typeof Career !== "undefined" && Career.inCareer && Career.inCareer();
  const identityLocked = () => pitLocked() || careerLocked;
  const lockReason = pitLocked() ? "Race identity is fixed while working on the active car" : "Your team is fixed by your active career contract";
  optsEl.appendChild(csLabel("TEAM"));

  const card = document.createElement("button");
  card.className = "team-card";
  card.id = "cs-team-card";
  card.setAttribute("aria-haspopup", "dialog");
  card.disabled = !!identityLocked();
  if (identityLocked()) card.title = lockReason;
  const body = document.createElement("span"); body.className = "tm-body";
  const name = document.createElement("span"); name.className = "tm-name"; name.textContent = team.name;
  const sub = document.createElement("span"); sub.className = "tm-sub";
  sub.textContent = [team.short, team.engine].filter(Boolean).join(" · ");
  body.append(name, sub);
  const chev = document.createElement("span");
  chev.className = "tm-chev"; chev.textContent = "▾"; chev.setAttribute("aria-hidden", "true");
  card.append(G.teamSwatch(team), body, chev);
  card.onclick = () => { if (identityLocked()) return; if (G.soundOn) GameAudio.uiSelect(); G.setTeamPicker(true); };
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
    b.disabled = taken || !!identityLocked();
    if (taken) b.title = "Taken by the other player";
    else if (identityLocked()) b.title = lockReason;
    b.setAttribute("aria-pressed", i === G.driverIdx ? "true" : "false");
    b.dataset.csDriver = String(i);
    const num = team.legends && !(d.num > 1) ? "" : `#${d.num} `;
    b.textContent = `${num}${d.name}${taken ? "  · TAKEN" : ""}`;
    b.onclick = () => {
      if (taken || identityLocked() || i === G.driverIdx) return;
      G.driverIdx = i; store.set("driver", i);
      if (G.soundOn) GameAudio.uiTick();
      buildSetup();
      $("cs-options")?.querySelector(`[data-cs-driver="${i}"]`)?.focus({ preventScroll: true });
    };
    row.appendChild(b);
  });
  optsEl.appendChild(row);

  const editRow = document.createElement("div"); editRow.className = "sel-edit-row";
  const edit = document.createElement("button");
  edit.className = "sel-edit"; edit.id = "cs-customize";
  edit.textContent = "✎ EDIT MY TEAM";
  edit.disabled = pitLocked();
  if (pitLocked()) edit.title = lockReason;
  edit.onclick = () => { if (pitLocked()) return; if (G.soundOn) GameAudio.uiSelect(); G.openCustomize(); };
  editRow.appendChild(edit);
  optsEl.appendChild(editRow);
  buildLookRows(optsEl);

  if (typeof SettingsExport !== "undefined" && SettingsExport.garageRow) {
    const row = SettingsExport.garageRow();
    if (row) { optsEl.appendChild(csLabel("GARAGE FILE")); optsEl.appendChild(row); }
  }
  if (typeof ShareCode !== "undefined" && ShareCode.encode) {
    const team = Teams.LIST[G.teamIdx];
    if (team) {
      optsEl.appendChild(csLabel("SHARE CODE"));
      const shareRow = document.createElement("div");
      shareRow.className = "sel-edit-row";
      shareRow.id = "cs-share-code-row";
      const mk = (id, label, kind) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "sel-chip"; b.id = id; b.textContent = label;
        b.onclick = () => {
          let payload = null;
          if (kind === "setup" && typeof SetupTune !== "undefined") {
            payload = { team: team.id, tune: SetupTune.get(team.id) };
          } else if (kind === "livery") {
            const idLiv = G.getLiveryId ? G.getLiveryId(team.id) : "default";
            const customs = G.getCustomLiveries ? (G.getCustomLiveries(team.id) || []) : [];
            const liv = customs.find((l) => l && l.id === idLiv) || null;
            payload = { team: team.id, id: idLiv, livery: liv || undefined };
          }
          const encoded = ShareCode.encode(kind, payload);
          if (!encoded.ok) { b.textContent = "UNAVAILABLE"; return; }
          const done = (ok) => { b.textContent = ok ? "COPIED" : encoded.code; };
          if (typeof ApexClipboard !== "undefined" && ApexClipboard.write) {
            ApexClipboard.write(encoded.code).then(done, () => done(false));
          } else done(false);
        };
        return b;
      };
      shareRow.append(mk("cs-share-setup", "COPY SETUP CODE", "setup"),
        mk("cs-share-livery", "COPY LIVERY CODE", "livery"));
      optsEl.appendChild(shareRow);
    }
  }
}

function syncGarageExitChrome() {
  const root = $("carsetup"), done = $("cs-done");
  if (!root || !done) return;
  if (done.textContent === "RACE SETUP") root.removeAttribute("data-cs-exit");
  else root.setAttribute("data-cs-exit", "one");
}

function buildSetup() {
  clearTimeout(csLivSearchTimer); csLivSearchTimer = 0;
  clearSurfaceControls();
  if (typeof GarageSurfaceInspection !== "undefined") GarageSurfaceInspection.end();
  syncGarageExitChrome();
  const team = Teams.LIST[G.teamIdx];
  if (csLivCreating && csLivTeamId !== team.id) discardLivDraft();
  tuneExperiments.capture(team);
  const parts = getTeamParts(team.id);

  let partsChanged = false;
  const legalFn = Parts.legality ? Parts.legality() : null, legalKey = legalFn ? Parts.legalityKey() : "";
  if (legalFn) Parts.setLegality(null, "");
  try {
    for (const cat of Parts.CATALOG) {
      const selId = parts[cat.id];
      if (selId) {
        const opt = cat.options.find((o) => o.id === selId);
        if (opt && !Parts.isOptionAvailable(opt, team)) {
          const eq = opt.equivalent
            && cat.options.find((o) => o.id === opt.equivalent
              && Parts.isOptionAvailable(o, team));
          if (eq) parts[cat.id] = eq.id;
          else delete parts[cat.id];
          partsChanged = true;
        }
      }
    }
  } finally { if (legalFn) Parts.setLegality(legalFn, legalKey); }
  if (partsChanged) saveTeamParts(team.id, parts);

  const owned = G.careerOwned();
  const cap = owned ? Career.budget() : Parts.BUDGET;
  const unlimited = !owned && G.unlimitedBudget;

  const spent = Parts.getCost(parts, team);
  const remaining = cap - spent;

  const teamEl = $("cs-team");
  teamEl.textContent = team.name.toUpperCase();
  teamEl.title = team.name;

  const budgetEl = $("cs-budget");
  const budgetFill = $("cs-budget-fill");
  const unlimitedBtn = $("cs-unlimited");
  if (budgetEl) {
    if (unlimited) {
      budgetEl.textContent = "FREE BUILD — no budget limit";
      budgetEl.className = "unlimited";
    } else if (owned) {
      budgetEl.textContent = `BALANCE ${Career.data().money.toLocaleString()} cr · FITTED `
                           + `${spent.toLocaleString()} / ${cap.toLocaleString()} cr`;
      budgetEl.className = remaining < 0 ? "over" : remaining < 100 ? "tight" : "";
    } else {
      budgetEl.textContent = `BUDGET: ${remaining} / ${cap} cr remaining`;
      budgetEl.className = remaining < 0 ? "over" : remaining < 100 ? "tight" : "";
    }
  }
  if (budgetFill) {
    budgetFill.style.transform = unlimited ? "scaleX(0)" : `scaleX(${M4.clamp(spent / cap, 0, 1)})`;
  }
  if (unlimitedBtn) {
    unlimitedBtn.hidden = !!owned;
    unlimitedBtn.textContent = unlimited ? "∞ FREE BUILD: ON" : "∞ FREE BUILD";
    unlimitedBtn.className = "cs-unlimited-btn" + (unlimited ? " on" : "");
  }

  if (!csActiveCat) csActiveCat = store.get("garageTab", "team");
  if (!PSEUDO_CATS.includes(csActiveCat) && !Parts.CATALOG.some((c) => c.id === csActiveCat)) csActiveCat = "team";
  const activeCat = Parts.CATALOG.find((c) => c.id === csActiveCat);

  const resolveOpt = (cat) => {
    const id = parts[cat.id] || Parts.DEFAULTS[cat.id];
    const sel = cat.options.find((o) => o.id === id);
    if (sel && Parts.isOptionAvailable(sel, team)) return sel;
    if (sel && sel.equivalent) {
      const eq = cat.options.find((o) => o.id === sel.equivalent
        && Parts.isOptionAvailable(o, team));
      if (eq) return eq;
    }
    return cat.options.find((o) => o.id === Parts.DEFAULTS[cat.id]);
  };

  const tabs = $("cs-tabs");
  tabs.textContent = "";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Garage categories");
  const primaryTabs = document.createElement("div");
  primaryTabs.className = "cs-tab-row";
  primaryTabs.setAttribute("role", "none");
  primaryTabs.dataset.tier = "Performance categories";
  const secondaryTabs = document.createElement("div");
  secondaryTabs.className = "cs-tab-row";
  secondaryTabs.setAttribute("role", "none");
  secondaryTabs.dataset.tier = "Finishing and setup categories";
  tabs.append(primaryTabs, secondaryTabs);
  const appendTab = (id, tab) => (SECONDARY_CATS.has(id) ? secondaryTabs : primaryTabs).appendChild(tab);
  {
    const d = team.drivers[G.driverIdx] || team.drivers[0];
    appendTab("team", pseudoTab("team", "TEAM", d ? d.name.split(" ").pop() : team.short));
  }
  for (const cat of Parts.CATALOG) {
    const cur = resolveOpt(cat);
    appendTab(cat.id, pseudoTab(cat.id, cat.tab || cat.label, tabSub(cur),
                                cur && cur.id !== Parts.DEFAULTS[cat.id], cur ? cur.label : ""));
  }
  appendTab("tune", pseudoTab("tune", "SETUP", SetupTune.isDefault(team.id) ? "WORKS" : "TUNED",
                              !SetupTune.isDefault(team.id)));
  {
    const custom = getLiveryId(team.id) !== "default";
    appendTab("livery", pseudoTab("livery", "LIVERY", custom ? "CUSTOM" : "DEFAULT", custom));
  }
  {
    const activeTab = tabs.querySelector('[role="tab"][aria-selected="true"]');
    if (activeTab) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const optsEl = $("cs-options");
  optsEl.textContent = "";
  optsEl.setAttribute("role", "tabpanel");
  optsEl.setAttribute("aria-labelledby", csTabId(csActiveCat));
  optsEl.tabIndex = 0;
  optsEl.classList.remove("cs-liv-grid");
  if (csActiveCat === "team")   { buildTeamOptions(optsEl, team);   renderStatBars($("cs-stats-inner"), team); return; }
  if (csActiveCat === "livery") { buildLiveryOptions(optsEl, team); renderStatBars($("cs-stats-inner"), team); return; }
  if (csActiveCat === "tune")   { buildTuneOptions(optsEl, team);   renderStatBars($("cs-stats-inner"), team); return; }
  const curOpt = resolveOpt(activeCat);
  const curCost = curOpt ? (curOpt.cost || 0) : 0;
  const showComparison = GarageExperience.partSummary(optsEl, team, parts, activeCat, curOpt,
    typeof SetupTune !== "undefined" ? SetupTune.mods(team.id) : null, unlimited ? Infinity : cap,
    () => framePreset(CAT_VIEW[activeCat.id] || "hero"));
  const factorySetup = Parts.getFactorySetup(team);
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
    row.addEventListener("focus", () => showComparison(opt));
    row.addEventListener("pointerenter", (ev) => {
      if (ev.pointerType === "touch") return;
      if (typeof matchMedia === "function" && matchMedia("(hover: none)").matches) return;
      showComparison(opt);
    });

    const dot = document.createElement("span"); dot.className = "cs-opt-dot"; row.appendChild(dot);

    const main = document.createElement("div"); main.className = "cs-opt-main";
    const nameRow = document.createElement("div"); nameRow.className = "cs-opt-name";
    nameRow.appendChild(document.createTextNode(Parts.optLabel(activeCat.id, opt)));
    const badges = [];
    if (opt.wetTread) badges.push(opt.wetTread > 1 ? "WET" : "INTER");
    if (opt.tag) badges.push(opt.tag);
    if (opt.supplier || opt.suppliers) badges.push("SUPPLIER");
    if ((opt.team || opt.teams) && opt.tag !== "SIGNATURE") badges.push("SIGNATURE");
    if (!restricted && !opt.tag) badges.push("UNIVERSAL");
    if (factorySetup[activeCat.id] === opt.id) badges.push("FACTORY SETUP");
    if (badges.length) {
      const tg = document.createElement("span");
      tg.className = "cs-opt-tag";
      const band = opt.wetTread && opt.visual && opt.visual.band;
      if (band && band.length >= 3) {
        const r = Math.round(band[0] * 255), g = Math.round(band[1] * 255), b = Math.round(band[2] * 255);
        tg.style.color = "rgb(" + r + "," + g + "," + b + ")";
        tg.style.background = "rgba(" + r + "," + g + "," + b + ",0.18)";
      }
      tg.textContent = badges.join(" · ");
      nameRow.appendChild(tg);
    }
    main.appendChild(nameRow);
    const deltas = statDeltaChips(opt);
    if (deltas) main.appendChild(deltas);
    if (opt.desc) { const d = document.createElement("div"); d.className = "cs-opt-desc"; d.textContent = opt.desc; main.appendChild(d); }
    row.appendChild(main);

    const cost = document.createElement("span");
    cost.className = "cs-opt-cost" + (locked ? " research" : opt.cost > 0 ? "" : " free");
    cost.textContent = locked ? "RESEARCH · " + Career.researchCost(opt).toLocaleString() + " cr"
                     : opt.cost > 0 ? opt.cost + " cr" : "FREE";
    row.appendChild(cost);
    const fitted = getTeamParts(team.id), replacing = resolveOpt(activeCat);
    const shortfall = unlimited ? 0 : Math.max(0, Parts.getCost(fitted, team) - (replacing ? replacing.cost || 0 : 0) + (opt.cost || 0) - cap);
    if (locked && shortfall > 0) {
      const why = document.createElement("div"); why.className = "cs-opt-desc";
      why.textContent = "Research only — cannot fit within current cap (" + shortfall.toLocaleString() + " cr short).";
      main.appendChild(why);
    }
    if (locked && typeof Career.inCareer === "function" && Career.inCareer() && typeof Career.planning === "function") {
      const planning = Career.planning();
      const cash = planning && typeof planning.cash === "function" ? planning.cash(Career.researchCost(opt)) : null;
      if (cash && !cash.unlimited && [cash.afterPurchase, cash.wages, cash.low].every(Number.isFinite)) {
        const advisory = document.createElement("div"); advisory.className = "cs-opt-desc";
        advisory.textContent = cash.afterPurchase.toLocaleString() + " cr after research · " + cash.wages.toLocaleString()
          + " cr upcoming wages · conservative next-round balance " + cash.low.toLocaleString() + " cr before income (floors at zero). "
          + (cash.afterPurchase < cash.wages ? "Upcoming wages exceed the remaining cash. " : "")
          + "Sponsor income is not guaranteed; this estimate does not block research.";
        main.appendChild(advisory);
      }
    }

    const reject = () => {
      row.classList.add("budget-reject");
      row.addEventListener("animationend", () => row.classList.remove("budget-reject"), { once: true });
      if (G.soundOn) GameAudio.uiReject();
    };

    row.onclick = () => {
      if (active) return;
      let _blipped = false;
      if (locked) {
        if (!Career.research(opt)) { reject(); return; }
        if (G.soundOn) { GameAudio.uiSelect(); _blipped = true; }
      }
      const p = getTeamParts(team.id);
      const co = resolveOpt(activeCat);
      const cc = co ? (co.cost || 0) : 0;
      if (!unlimited && (Parts.getCost(p, team) - cc + (opt.cost || 0)) > cap) {
        if (locked) {
          buildSetup();
          const notice = document.createElement("p"); notice.className = "adv-help";
          notice.setAttribute("role", "status");
          notice.textContent = "Unlocked, not fitted — " + (Parts.getCost(p, team) - cc + (opt.cost || 0) - cap).toLocaleString() + " cr over the fitted cap.";
          $("cs-options").appendChild(notice);
          return;
        }
        reject();
        return;
      }
      p[activeCat.id] = opt.id;
      if (saveTeamParts(team.id, p) === false) { reject(); return; }
      if (G.soundOn && !_blipped) GameAudio.uiSelect();
      buildSetup();
      if (CAT_VIEW[activeCat.id]) framePreset(CAT_VIEW[activeCat.id]);
      if (window.GarageScene && GarageScene.pulse) GarageScene.pulse();
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
    const pct = Math.round(Math.abs(v - 1) * 100);
    chip.textContent = (v > 1 ? "▲" : "▼") + d.label + " " + (v > 1 ? "+" : "−") + pct + "%";
    wrap.appendChild(chip);
  }
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

let livBuild = 0;
let csLivQuery = "";
let csLivFactoryOpen = null;
let csLivQueryTeam = null;
let csLivSearchTimer = 0;
function resetLivSearch() {
  csLivQuery = ""; csLivFactoryOpen = null; csLivQueryTeam = null;
  clearTimeout(csLivSearchTimer); csLivSearchTimer = 0;
}
const livBox = { big: [144, 69], small: [38, 24] };
function livSwatchPx(boxW, boxH, dpr) {
  const d = dpr > 0 ? dpr : 1, w = Math.max(1, boxW || 1), h = Math.max(1, boxH || 1), m = Math.max(w, h);
  const k = Math.max(16 / m, Math.min(d, 384 / m));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
function fitLivSwatches(container, team) {
  if (typeof LiveryTex === "undefined") return;
  const sws = [...container.querySelectorAll(".cs-liv-row .cs-liv-swatch")], livs = getLiveries(team);
  const shape = (sw) => sw.closest(".cs-liv-factory") ? "small" : "big";
  for (const s in livBox) {
    const e = sws.find((sw) => shape(sw) === s), z = e && window.CssZoom ? CssZoom.of(e) : 1;
    if (e && e.clientWidth) livBox[s] = [e.clientWidth * z, e.clientHeight * z];
  }
  for (const sw of sws) {
    const b = livBox[shape(sw)], px = livSwatchPx(b[0], b[1], globalThis.devicePixelRatio), id = sw.closest("[data-cs-livery]").dataset.csLivery;
    const c = LiveryTex.swatchCanvas(team.id, livs.find((l) => l.id === id), px.w, px.h, livBuild);
    c.ariaHidden = "true"; sw.prepend(c);
  }
}
function livSwatch(team, liv, tags) {
  const sw = document.createElement("span"); sw.className = "cs-liv-swatch";
  if (typeof LiveryTex === "undefined") {
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

function buildTuneOptions(container, team) { tuneExperiments.build(container, team); }

function makeLiveryRow(team, liv, cur, isCustom) {
  const active = liv.id === cur;
  const row = document.createElement("button");
  row.type = "button";
  row.className = "cs-opt cs-liv" + (active ? " active" : "") + (isCustom ? " cs-liv-custom" : "");
  row.dataset.csLivery = liv.id;
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
  nameRow.textContent = liv.name;
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
      csLivCreating = true; csLivTeamId = team.id;
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
      const copyName = (liv.name || "Custom").slice(0, 14) + " MK2";
      csLivDraft = liv.id === "default" ? livDraftFromOwn(liv, copyName, team.id) : livDraftFrom(liv, copyName);
      csLivEditId = null;
      csLivCreating = true; csLivTeamId = team.id;
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
    const choices = $("cs-options")?.querySelectorAll("[data-cs-livery]") || [];
    for (const choice of choices) if (choice.dataset.csLivery === liv.id) { choice.focus({ preventScroll: true }); break; }
  };
  return rowWrap;
}

function buildLiveryOptions(container, team) {
  if (csLivCreating) {
    container.classList.remove("cs-liv-grid");
    buildLiveryCreator(container, team);
    return;
  }
  container.classList.add("cs-liv-grid");
  livBuild++;
  const cur = getLiveryId(team.id);
  const customIds = new Set(getCustomLiveries(team.id).map((l) => l.id));
  if (csLivQueryTeam !== team.id) { resetLivSearch(); csLivQueryTeam = team.id; }
  const q = String(csLivQuery || "").trim().toLowerCase();
  const match = (liv) => !q || liv.id === cur || String(liv.name || "").toLowerCase().includes(q) || String(liv.id || "").toLowerCase().includes(q);

  {
    const tools = document.createElement("div");
    const search = document.createElement("input");
    search.type = "search";
    search.className = "cs-liv-search";
    search.placeholder = "Search paint";
    search.setAttribute("aria-label", "Search liveries");
    search.value = csLivQuery;
    search.autocomplete = "off";
    search.onclick = (e) => e.stopPropagation();
    search.oninput = () => {
      csLivQuery = search.value;
      clearTimeout(csLivSearchTimer);
      csLivSearchTimer = setTimeout(() => {
        csLivSearchTimer = 0;
        const cs = $("carsetup");
        if (csLivCreating || csActiveCat !== "livery" || !cs || cs.hidden) return;
        const caret = search.selectionStart;
        buildSetup();
        const again = $("cs-options")?.querySelector(".cs-liv-search");
        if (again) {
          again.focus({ preventScroll: true });
          try { again.setSelectionRange(caret, caret); } catch (_) {  }
        }
      }, 120);
    };
    tools.appendChild(search);
    container.appendChild(tools);
  }

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
      const shape = {};
      if (team.livery) for (const k in LIV_DRAFT_PILLS) if (team.livery[k]) shape[k] = team.livery[k];
      csLivDraft = livDraftFromOwn(Object.assign({ c1: team.color, c2: team.color2 }, shape), "", team.id);
      csLivEditId = null;
      csLivCreating = true; csLivTeamId = team.id;
      if (G.soundOn) GameAudio.uiSelect();
      buildSetup();
    };
    container.appendChild(row);
  }

  const customs = [], factory = [], factoryHidden = [];
  for (const liv of getLiveries(team)) {
    if (!match(liv)) continue;
    const isCustom = customIds.has(liv.id);
    if (isCustom) customs.push(liv);
    else if (liv.id === cur || q) factory.push(liv);
    else factoryHidden.push(liv);
  }
  for (const liv of customs) container.appendChild(makeLiveryRow(team, liv, cur, true));
  for (const liv of factory) container.appendChild(makeLiveryRow(team, liv, cur, false));

  if (factoryHidden.length) {
    const fold = document.createElement("details");
    fold.className = "cs-liv-factory";
    const desktop = typeof matchMedia === "function" &&
      matchMedia("(hover: hover) and (pointer: fine)").matches;
    fold.open = csLivFactoryOpen != null ? !!csLivFactoryOpen : (!!q || desktop);
    fold.ontoggle = () => { csLivFactoryOpen = fold.open; };
    const sum = document.createElement("summary");
    sum.textContent = "Factory finishes (" + factoryHidden.length + ")";
    fold.appendChild(sum);
    const grid = document.createElement("div");
    for (const liv of factoryHidden) grid.appendChild(makeLiveryRow(team, liv, cur, false));
    fold.appendChild(grid);
    container.appendChild(fold);
  }
  fitLivSwatches(container, team);
}

function buildLiveryCreator(container, team) {
  const d = csLivDraft;
  const wrap = document.createElement("div");
  wrap.className = "cs-liv-editor";

  const head = document.createElement("div"); head.className = "cs-liv-ed-head"; head.textContent = csLivEditId ? "EDIT PAINT JOB" : "NEW PAINT JOB";
  wrap.appendChild(head);

  const prev = document.createElement("span"); prev.className = "cs-liv-swatch cs-liv-ed-prev";
  let prevStripe = null;
  wrap.appendChild(prev);

  const deps = [];
  let designTools = null;
  const needFin = () => (d.finShape || "standard") !== "none";
  const NO_FIN = "Needs a tail fin — pick a FIN SHAPE other than NONE";
  const wheelParts = Parts.getVisualTiers(getTeamParts(team.id), team);
  const needDeflectors = () => Math.round(Car3D.appearanceParts(wheelParts, d)._visual?.wheels?.deflector || 0) > 0;
  const finArtLive = () => needFin() && ((d.finStyle || "team") !== "none" || d.finBadge === "number" || d.finBadge === "code");
  const NO_ART = "Nothing to colour — TAIL STYLE is NONE and FIN BADGE is not a number or code";
  const haveNames = () => (d.sponsors || "default") !== "clean";
  const NO_NAMES = "Needs sponsor names — SPONSORS is CLEAN";
  const syncDeps = () => {
    if (typeof markAdvice === "function") markAdvice();
    for (const dep of deps) {
      const off = !dep.when();
      if (dep.pill) { propIf(dep.pill, "disabled", off); propIf(dep.pill, "title", off ? dep.why : ""); continue; }
      attrIf(dep.row, "aria-disabled", String(off));
      propIf(dep.row, "title", off ? dep.why : "");
      const ctl = dep.row.querySelectorAll("button, input");
      for (let i = 0; i < ctl.length; i++) propIf(ctl[i], "disabled", off);
    }
  };
  const applyPreview = (defer3d) => {
    if (designTools) designTools.changed(defer3d);
    prev.style.background = "linear-gradient(120deg, " + d.c1 + " 0 56%, " + d.c2 + " 56% 100%)";
    if (d.stripe) {
      if (!prevStripe) { prevStripe = document.createElement("span"); prevStripe.className = "cs-liv-stripe"; }
      prevStripe.style.background = d.stripe;
      if (prevStripe.parentNode !== prev) prev.appendChild(prevStripe);
    } else if (prevStripe && prevStripe.parentNode === prev) prev.removeChild(prevStripe);
    const restorePaletteFocus = refreshPalettes(defer3d);
    syncDeps();
    if (restorePaletteFocus && !restorePaletteFocus.disabled) restorePaletteFocus.focus({ preventScroll: true });
    defer3d ? scheduleLivPreview(team, d) : livePreviewDraft(team, d);
  };

  const PAL_KEYS = ["c1", "c2", "stripe", "noseStripe", "accent", "nose", "pod",
                    "wing", "rearWing", "cover",
                    ...(((typeof LiveryTex !== "undefined" && LiveryTex.FILL_SURFACES) || [])
                      .map((f) => f.key)),
                    "fin", "finArt", "logo", "logo2", "logo3", "halo", "patternTint", "patternSecond"];
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
  const palRows = [];
  let paletteKey = null;
  const refreshPalettes = (drag) => {
    for (const pr of palRows) pr.sync();
    const cols = paletteColours();
    const key = cols.slice().sort().join(",");
    if (key === paletteKey || (drag && paletteKey !== null)) {
      for (const pr of palRows) for (const chip of pr.el.children) {
        const on = (d[pr.key] || "").toLowerCase() === chip.dataset.csColour;
        chip.classList.toggle("active", on); attrIf(chip, "aria-pressed", String(on));
      }
      return null;
    }
    const focused = document.activeElement;
    let replacement = null;
    for (let i = 0; i < palRows.length; i++) {
      const pr = palRows[i];
      const ownedFocus = focused && pr.el.contains(focused);
      const focusColour = ownedFocus && focused.dataset.csColour;
      pr.el.textContent = "";
      for (let c = 0; c < cols.length; c++) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "cs-liv-ed-none";
        chip.style.background = cols[c];
        chip.dataset.csColour = cols[c];
        chip.title = "Use " + cols[c];
        chip.setAttribute("aria-label", "Use colour " + cols[c] + " for " + pr.label);
        if ((d[pr.key] || "").toLowerCase() === cols[c]) chip.classList.add("active");
        chip.setAttribute("aria-pressed", String((d[pr.key] || "").toLowerCase() === cols[c]));
        chip.onclick = () => { pr.set(cols[c]); };
        pr.el.appendChild(chip);
        if (ownedFocus && (cols[c] === focusColour || (!cols.includes(focusColour) && cols[c] === (d[pr.key] || "").toLowerCase()))) replacement = chip;
      }
    }
    paletteKey = key;
    return replacement;
  };

  surfaceControls = typeof GarageSurfaceInspection !== "undefined" ? GarageSurfaceInspection.controls(wrap) : null;
  const colorRow = (label, key, allowNone) => {
    const r = document.createElement("label"); r.className = "cs-liv-ed-row";
    if (LIV_ROW_HINT[key]) { r.title = LIV_ROW_HINT[key]; r.setAttribute("aria-description", LIV_ROW_HINT[key]); }
    const lb = document.createElement("span"); lb.className = "cs-liv-ed-lbl"; lb.textContent = label; r.appendChild(lb);
    const inp = document.createElement("input"); inp.type = "color";
    inp.dataset.livField = key; inp.setAttribute("aria-label", label);
    inp.value = /^#[0-9a-fA-F]{6}$/.test(d[key]) ? d[key] : "#000000";
    if (allowNone && !d[key]) inp.classList.add("cs-liv-off");
    inp.oninput = () => { d[key] = inp.value; inp.classList.remove("cs-liv-off"); applyPreview(true); };
    inp.onchange = () => { applyPreview(); flushLivPreview(); };
    r.appendChild(inp);
    let off = null;
    if (allowNone) {
      off = document.createElement("button"); off.type = "button"; off.className = "cs-liv-ed-none"; off.textContent = "NONE";
      off.setAttribute("aria-label", "Use inherited colour for " + label);
      off.onclick = () => { d[key] = ""; inp.classList.add("cs-liv-off"); applyPreview(); };
      r.appendChild(off);
    }
    const pal = document.createElement("span"); pal.className = "cs-liv-pal";
    const sync = () => {
      const inherited = allowNone && !d[key];
      attrIf(inp, "aria-description", inherited ? "Inherited colour" : "Custom colour " + inp.value);
      if (off) attrIf(off, "aria-pressed", String(inherited));
    };
    sync();
    palRows.push({ el: pal, key, label, sync,
      set: (hex) => { d[key] = hex; inp.value = hex; inp.classList.remove("cs-liv-off"); applyPreview(); } });
    r.appendChild(pal);
    if (surfaceControls) surfaceControls.row(r, label, key);
    return r;
  };
  const section = (label) => {
    const r = document.createElement("div"); r.className = "cs-liv-ed-sec";
    r.textContent = label; r.setAttribute("role", "presentation");
    return r;
  };
  wrap.appendChild(section("BODY"));
  const bodyRow = colorRow("PRIMARY", "c1", false); wrap.appendChild(bodyRow);
  wrap.appendChild(colorRow("ACCENT", "c2", false));
  wrap.appendChild(colorRow("BODY STRIPE", "stripe", true));
  wrap.appendChild(colorRow("NOSE STRIPE", "noseStripe", true));
  wrap.appendChild(colorRow("DETAIL", "accent", true));
  wrap.appendChild(colorRow("NOSE CAP", "nose", true));
  wrap.appendChild(colorRow("SIDEPOD", "pod", true));
  wrap.appendChild(colorRow("LOWER BODY", "lower", true));
  wrap.appendChild(colorRow("UPPER BODY", "upper", true));
  wrap.appendChild(section("ENGINE COVER"));
  wrap.appendChild(colorRow("ENGINE COVER", "cover", true));
  const LTX = typeof LiveryTex !== "undefined" ? LiveryTex : null;
  const LT_FILLS = (LTX && LTX.FILL_SURFACES) || [];
  const fillRows = LT_FILLS.map((f) => ({ f, row: colorRow(f.label, f.key, true) }));
  for (const { row } of fillRows) wrap.appendChild(row);
  const designNow = () => ({ spineLogo: d.spineLogo, spineSide: d.spineSide, coverBind: d.coverBind });
  for (const { f, row } of fillRows) {
    deps.push({ row, when: () => !LTX || !LTX.fillInert(f.key, designNow()), why: f.why });
  }
  wrap.appendChild(section("WINGS & TAIL"));
  const wingRow = colorRow("WINGS", "wing", true), rearWingRow = colorRow("REAR WING", "rearWing", true);
  wrap.appendChild(wingRow); wrap.appendChild(rearWingRow);
  wrap.appendChild(colorRow("ENDPLATES", "endplate", true));
  const flapsPainted = () => (d.wingCarbon || "paint") !== "carbon";
  const NO_PAINT = "Nothing to colour — WING FLAPS is CARBON";
  deps.push({ row: wingRow, when: flapsPainted, why: NO_PAINT }, { row: rearWingRow, when: flapsPainted, why: NO_PAINT });
  const finRow = colorRow("TAIL FIN", "fin", true), finArtRow = colorRow("TAIL GRAPHIC", "finArt", true);
  wrap.appendChild(finRow); wrap.appendChild(finArtRow);
  deps.push({ row: finRow, when: needFin, why: NO_FIN }, { row: finArtRow, when: finArtLive, why: NO_ART });
  const mSlots = (window.LiveryTex && LiveryTex.markSlots)
    ? LiveryTex.markSlots(team.id)
    : [{ key: "logo", label: "TEAM LOGO" }, { key: "logo2", label: "LOGO DETAIL" },
       { key: "logo3", label: "OUTLINE" }];
  wrap.appendChild(section("TEAM MARK"));
  for (const slot of mSlots) wrap.appendChild(colorRow(slot.label, slot.key, true));
  const markNote = document.createElement("div");
  markNote.className = "cs-opt-desc";
  markNote.setAttribute("aria-live", "polite");
  markNote.hidden = true;
  wrap.appendChild(markNote);
  const markAdvice = () => {
    const LTn = typeof LiveryTex !== "undefined" ? LiveryTex : null;
    if (!LTn || !LTn.contrast || !d.logo) { propIf(markNote, "hidden", true); return; }
    const logo = hexToArr(d.logo);
    const field = hexToArr(d.cover || d.c1);
    const ratio = LTn.contrast(logo, field);
    const rim = d.logo3 ? LTn.contrast(hexToArr(d.logo3), field) : 0;
    const weak = ratio < (LTn.MARK_FLOOR || 4.2) && rim < (LTn.MARK_FLOOR || 4.2);
    propIf(markNote, "hidden", !weak);
    if (weak) {
      propIf(markNote, "textContent", "TEAM LOGO reads " + ratio.toFixed(1) + ":1 on ENGINE COVER — it is painted as picked. "
        + (d.logo3 ? "The OUTLINE does not separate either; pick a darker or lighter one."
                   : "Add an OUTLINE to keep it legible."));
    }
  };
  wrap.appendChild(section("COCKPIT"));
  wrap.appendChild(colorRow("HALO", "halo", true));
  wrap.appendChild(colorRow("RIM", "rimTint", true)); wrap.appendChild(colorRow("CALIPER", "caliperTint", true)); wrap.appendChild(colorRow("SIDEWALL INK", "sidewallInk", true));
  wrap.appendChild(colorRow("MIRROR HOUSING", "mirrorTint", true));
  for (const [label, key] of [["COCKPIT SURROUND", "cockpitTint"], ["GRIPS", "gripTint"], ["FLOOR EDGE", "floorTint"], ["SUSPENSION", "suspTint"],
    ["BRAKE DUCTS", "ductTint"], ["DEFLECTORS", "deflectorTint"], ["NUMBER BOARD", "boardTint"], ["EXHAUST HEAT", "exhaustTint"]])
    wrap.appendChild(colorRow(label, key, true));
  const lidStyled = () => (d.helmetStyle || "team") !== "team";
  const NO_LID = "Needs a HELMET style other than TEAM";
  const lidBaseRow = colorRow("HELMET BASE", "helmetBase", true), lidAccentRow = colorRow("HELMET ACCENT", "helmetAccent", true);
  wrap.appendChild(lidBaseRow); wrap.appendChild(lidAccentRow);
  deps.push({ row: lidBaseRow, when: lidStyled, why: NO_LID });
  deps.push({ row: lidAccentRow, when: () => lidStyled() && d.helmetStyle !== "solid", why: "Needs a HELMET style with a stripe, cap, band or chevron" });
  const pillRow = (label, key, values, dflt) => {
    const r = document.createElement("div"); r.className = "cs-liv-ed-row";
    if (LIV_ROW_HINT[key]) { r.title = LIV_ROW_HINT[key]; r.setAttribute("aria-description", LIV_ROW_HINT[key]); }
    const lb = document.createElement("span"); lb.className = "cs-liv-ed-lbl"; lb.textContent = label; r.appendChild(lb);
    const group = document.createElement("span"); group.className = "cs-liv-ed-finish";
    group.setAttribute("role", "group"); group.setAttribute("aria-label", label);
    const btns = [];
    for (const f of values) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cs-liv-ed-none" + ((d[key] || dflt) === f ? " active" : "");
      if (key === "finish") b.dataset.csFinish = f; else b.dataset.csPill = key + ":" + f;
      b.textContent = (typeof GarageLiveryDesignEditor !== "undefined" ? GarageLiveryDesignEditor.label(f) : f).toUpperCase();
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
  for (const [label, key] of [["COVER FINISH", "coverFinish"], ["WING FINISH", "wingFinish"], ["HALO FINISH", "haloFinish"],
    ["SIDEPOD FINISH", "podFinish"], ["FIN FINISH", "finFinish"], ["MIRROR FINISH", "mirrorFinish"],
    ["NOSE FINISH", "noseFinish"], ["FLOOR FINISH", "floorFinish"], ["SUSPENSION FINISH", "suspFinish"], ["RIM FINISH", "rimFinish"],
    ["BRAKE DUCT FINISH", "ductFinish"], ["DEFLECTOR FINISH", "deflectorFinish"],
    ["COCKPIT SURROUND FINISH", "cockpitFinish"], ["NUMBER BOARD FINISH", "boardFinish"]]) {
    const r = pillRow(label, key, ["inherit", "gloss", ...Object.keys(Car3D.FINISH_SURFACE)], "inherit");
    if (key === "finFinish") deps.push({ row: r, when: needFin, why: NO_FIN });
    if (key === "deflectorFinish") deps.push({ row: r, when: needDeflectors, why: "Needs wheel deflectors — use FITTED in WHEELS STYLE with a WHEELS part that includes them" });
  }
  pillRow("WING FLAPS", "wingCarbon", ["paint", "carbon"], "paint");
  const LT = typeof LiveryTex !== "undefined" ? LiveryTex : null;
  pillRow("NUMBER FONT", "numFont", LT && LT.NUM_FONT_IDS || ["default"], "default");
  pillRow("SPONSORS", "sponsors", LT && LT.SPONSOR_PACK_IDS || ["default"], "default");
  pillRow("CREST", "crestStyle", LT && LT.CREST_STYLE_IDS || ["team"], "team");
  const emblemOn = () => (d.crestStyle || "team") !== "team", NO_EMBLEM = "Needs a CREST other than TEAM";
  deps.push({ row: pillRow("CREST TONE", "crestTone", LT && LT.CREST_TONE_IDS || ["team"], "team"), when: emblemOn, why: NO_EMBLEM });
  deps.push({ row: pillRow("CREST FRAME", "crestFrame", LT && LT.CREST_FRAME_IDS || ["none"], "none"), when: emblemOn, why: NO_EMBLEM });
  pillRow("BODY", "bodyStyle", ["team", ...(Car3D.BODY_STYLE_IDS || [])], "team");
  for (const [key, category] of Object.entries(Car3D.PART_STYLE_FIELDS)) {
    const cat = Parts.CATALOG.find((c) => c.id === category);
    const label = category === "aero" ? "AERO SHAPE" : category === "floor" ? "FLOOR SHAPE" : cat.label + " STYLE";
    const styles = cat.options.filter((o) => o.tag === "STYLE");
    const row = pillRow(label, key, ["fitted", ...styles.map((o) => o.id)], "fitted");
    row.title = "FITTED follows the installed " + cat.label + " part. Styles change appearance only; performance and fitted parts stay unchanged.";
    row.setAttribute("aria-description", row.title);
    Array.from(row.querySelectorAll("button")).slice(1).forEach((b, i) => {
      const opt = styles[i];
      b.textContent = opt.label.toUpperCase(); b.title = opt.desc.replace(/^[^—]+— /, "") + " — appearance only";
    });
  }
  pillRow("FIN SHAPE", "finShape", Car3D.FIN_SHAPE_IDS || ["standard"], "standard");
  deps.push({ row: pillRow("TAIL STYLE", "finStyle", LT && LT.TAIL_STYLE_IDS || ["team"], "team"), when: needFin, why: NO_FIN });
  deps.push({ row: pillRow("FIN BADGE", "finBadge", LT && LT.FIN_BADGE_IDS || ["logo"], "logo"), when: needFin, why: NO_FIN });
  const spineRow = pillRow("SPINE TOP", "spineLogo", LT && LT.SPINE_LOGO_IDS || ["logo"], "logo");
  pillRow("COVER BIND", "coverBind", ["independent", "saddleWrap", "spineOnly"], "independent");
  pillRow("FIN HANDOFF", "finHandoff", ["match", "contrast", "hardCut"], "match");
  pillRow("T-CAM", "tcam", Car3D.TCAM_IDS || ["team"], "team");
  pillRow("COVER VENTS", "coverVents", Car3D.COVER_VENT_IDS || ["none"], "none");
  pillRow("SPINE HEIGHT", "spineHeight", Car3D.SPINE_HEIGHT_IDS || ["standard"], "standard");
  pillRow("SPINE SIDE", "spineSide", LT && LT.SPINE_SIDE_IDS || ["none"], "none");
  pillRow("BODY SPLIT", "bodySplit", ["off", "lr"], "off");
  pillRow("HELMET", "helmetStyle", (typeof Helmets !== "undefined" && Helmets.STYLES) || ["team"], "team");
  for (const k of ["spineLogo:wordmark", "spineSide:wordmark", "spineSide:duo", "spineSide:title"]) {
    const b = wrap.querySelector('[data-cs-pill="' + k + '"]');
    if (b) deps.push({ pill: b, when: haveNames, why: NO_NAMES });
  }

  const nameRow = document.createElement("label"); nameRow.className = "cs-liv-ed-row";
  const nlb = document.createElement("span"); nlb.className = "cs-liv-ed-lbl"; nlb.textContent = "NAME"; nameRow.appendChild(nlb);
  const name = document.createElement("input"); name.type = "text"; name.className = "cs-liv-ed-name";
  name.maxLength = 18; name.placeholder = "My Livery"; name.value = d.name;
  name.dataset.livField = "name";
  name.oninput = () => { d.name = name.value; if (designTools) designTools.changed(true); };
  name.onchange = () => { if (designTools) designTools.changed(false); };
  nameRow.appendChild(name);
  wrap.appendChild(nameRow);

  const btns = document.createElement("div"); btns.className = "cs-liv-ed-btns";
  const focusFitted = () => {
    const id = getLiveryId(team.id);
    const fitted = Array.from(container.querySelectorAll("[data-cs-livery]")).find((b) => b.dataset.csLivery === id);
    (fitted || container.querySelector(".cs-liv-create"))?.focus();
  };
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "cs-liv-ed-cancel"; cancel.textContent = "CANCEL";
  const discard = () => { csLivCreating = false; csLivDraft = null; csLivEditId = null; endLivPreview(team); if (G.soundOn) GameAudio.uiTick(); buildSetup(); focusFitted(); };
  cancel.onclick = () => { if (designTools && designTools.dirty()) G.armConfirm(cancel, "DISCARD EDITS?", discard); else discard(); };
  const save = document.createElement("button"); save.type = "button"; save.className = "cs-liv-ed-save"; save.textContent = "SAVE & FIT";
  const saveStatus = document.createElement("p"); saveStatus.className = "cs-opt-desc"; saveStatus.setAttribute("role", "status"); saveStatus.hidden = true;
  const retrySave = () => {
    saveStatus.hidden = false;
    saveStatus.textContent = "Could not finish saving and fitting. Your draft is still open. Retry SAVE & FIT.";
    save.textContent = "RETRY SAVE & FIT";
    if (G.soundOn) GameAudio.uiReject();
  };
  save.onclick = () => {
    const now = Teams.LIST[G.teamIdx];
    if (team.id !== csLivTeamId || !now || now.id !== csLivTeamId) { discardLivDraft(); buildSetup(); return; }
    const id = "custom_" + livIdCounter();
    const liv = { id, name: (d.name || "").trim() || "Custom", c1: hexToArr(d.c1), c2: hexToArr(d.c2) };
    Object.assign(liv, livDraftTo(d, false));
    const existing = getCustomLiveries(team.id);
    const replacing = csLivEditId && existing.some((l) => l.id === csLivEditId);
    const saved = setCustomLiveries(team.id, replacing ? existing.map((l) => (l.id === csLivEditId ? liv : l)) : existing.concat([liv]));
    if (getCustomLiveries(team.id).some((l) => l.id === id)) csLivEditId = id;
    if (saved === false || saveLiveryId(team.id, id) === false) { retrySave(); return; }
    csLivCreating = false; csLivDraft = null; csLivEditId = null; endLivPreview(team);
    if (G.soundOn) GameAudio.uiSelect();
    buildSetup();
    focusFitted();
  };
  btns.append(cancel, save);
  wrap.appendChild(btns);

  if (typeof GarageLiveryDesignEditor !== "undefined") designTools = GarageLiveryDesignEditor.attach(wrap, d, {
    changed: applyPreview, flush: flushLivPreview, preview: (value) => livePreviewDraft(team, value),
    pillRow, spineRow, bodyRow, nameRow, markNote, saveRow: btns, teamId: team.id, scrollRoot: container,
  });
  wrap.insertBefore(saveStatus, btns);
  csLivDirty = designTools ? designTools.dirty : null;
  container.appendChild(wrap);
  applyPreview();
  container.scrollTop = 0;
  (wrap.querySelector('[role="tab"][aria-selected="true"]') || name).focus();
  framePreset("hero");
}

let _livSeq = 0;
function livIdCounter() { _livSeq = (_livSeq + 1) % 1000; return String(Date.now()) + _livSeq; }

let _livPreviewKey = "";
let _livPrevDraft = null;
const MESH_FREE_DRAFT = { logo: 1, logo2: 1, logo3: 1, sponsors: 1, numFont: 1, finStyle: 1, finBadge: 1, name: 1, patternTint: 1, patternSecond: 1, patternPlacement: 1, patternSide: 1,
  patternWidth: 1, patternRepeat: 1, patternOffset: 1, patternTaper: 1, patternOpacity: 1, patternRotation: 1, patternStretch: 1, patternWeight: 1, patternKey: 1,
  decalNoseTip: 1, decalCockpit: 1, decalPodTop: 1, decalHalo: 1,
  crestStyle: 1, crestTone: 1, crestFrame: 1, coverBind: 1, finArt: 1, finHandoff: 1, gripTint: 1 };
function draftSkipsMesh(prev, next) {
  if (!prev) return false;
  const seen = Object.create(null);
  const keys = Object.keys(prev).concat(Object.keys(next));
  let any = false;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (seen[k]) continue;
    seen[k] = 1;
    if (prev[k] === next[k]) continue;
    any = true;
    if (!MESH_FREE_DRAFT[k]) return false;
  }
  return any;
}
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
  if (typeof GarageSurfaceInspection !== "undefined" && GarageSurfaceInspection.field()) GarageSurfaceInspection.end();
  const key = team.id + "|" + JSON.stringify(d);
  if (key === _livPreviewKey) return;
  const skipMesh = draftSkipsMesh(_livPrevDraft, d);
  _livPreviewKey = key;
  _livPrevDraft = Object.assign({}, d);
  dropDraftAtlases(team);
  G.livDraftOverride = { teamId: team.id,
    liv: Object.assign({ id: "custom_draft", c1: hexToArr(d.c1), c2: hexToArr(d.c2) }, livDraftTo(d, true)) };
  if (!skipMesh) G._spMeshKey = "";
}

function dropDraftAtlases(team) {
  const cd = typeof CarDraw !== "undefined" && CarDraw.instance && CarDraw.instance();
  if (cd && cd.invalidateDecalTextures) cd.invalidateDecalTextures(team.id, true);
  else if (invalidateDecalTextures) invalidateDecalTextures(team.id);
}

function endLivPreview(team) {
  if (typeof GarageSurfaceInspection !== "undefined") GarageSurfaceInspection.end();
  cancelLivPreview();
  _livPreviewKey = "";
  _livPrevDraft = null;
  G.livDraftOverride = null;
  dropDraftAtlases(team);
  const cd = typeof CarDraw !== "undefined" && CarDraw.instance && CarDraw.instance();
  if (cd && cd.invalidateCustomMeshCaches) cd.invalidateCustomMeshCaches(team.id);
  G._spMeshKey = "";
}

function openSetup() {
  Log.info("ui", "SetupUI.openSetup");
  if (G.state === "race") G.setTeamPicker(false);
  els.select.hidden = true;
  els.overlay.hidden = true;
  $("vsfriend").hidden = true;
  const cs = $("carsetup");
  const generation = ++csVisitGeneration;
  tuneExperiments.visit(Teams.LIST[G.teamIdx]);
  syncGarageExitChrome();
  cs.hidden = false;
  G.setupPreviewOn = true;
  cs.setAttribute("aria-busy", "true");
  const finish = () => {
    if (generation !== csVisitGeneration || cs.hidden) return;
    try { buildSetup(); }
    finally { if (generation === csVisitGeneration) cs.removeAttribute("aria-busy"); }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(finish));
  } else {
    finish();
  }
}

function discardLivDraft() {
  if (!csLivCreating) return;
  csLivCreating = false; csLivDraft = null; csLivEditId = null; csLivDirty = null;
  const team = Teams.LIST.find((t) => t.id === csLivTeamId) || Teams.LIST[G.teamIdx];
  csLivTeamId = null;
  if (team) endLivPreview(team);
}
if (typeof MutationObserver === "function") {
  const cs = $("carsetup");
  if (cs) new MutationObserver(() => { if (cs.hidden) { ++csVisitGeneration; cs.removeAttribute("aria-busy"); clearSurfaceControls(); if (typeof GarageSurfaceInspection !== "undefined") GarageSurfaceInspection.end(); discardLivDraft(); resetLivSearch(); tuneExperiments.close(); } })
    .observe(cs, { attributes: true, attributeFilter: ["hidden"] });
}
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !csLivCreating || !G.setupPreviewOn || ($("cs-cam-panel") && !$("cs-cam-panel").hidden)
      || document.querySelector("dialog[open], dialog.screen:not([hidden])")) return;
  const cancel = document.querySelector("#carsetup .cs-liv-ed-cancel");
  if (!cancel) return;
  e.preventDefault();
  e.stopPropagation();
  cancel.click();
}, true);
{
  for (const [id, button] of [["cs-back", $("cs-back")], ["cs-done", $("cs-done")]]) {
    let armedDraft = null;
    const disarm = () => {
      G.armConfirm(button, "", () => {});
      if (button.textContent === "DISCARD EDITS?") button.textContent = button.dataset.label || (id === "cs-back" ? "BACK" : "DONE");
      delete button.dataset.label; armedDraft = null;
    };
    if (button) button.addEventListener("click", (e) => {
      if (button.dataset.armed && armedDraft !== csLivDraft) disarm();
      if (!button.dataset.armed && csLivCreating && csLivDirty && csLivDirty()) {
        e.stopImmediatePropagation();
        armedDraft = csLivDraft;
        button.dataset.label = button.textContent;
        G.armConfirm(button, "DISCARD EDITS?", () => {});
      } else if (button.dataset.armed) disarm();
    }, true);
  }
}
return { buildSetup, openSetup, lookRowSpecs };
}

return { create };
})();
