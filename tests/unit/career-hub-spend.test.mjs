/* career-hub-spend.test.mjs — batch #5102: the career hub's priced cards, the
 * EXTRA FUNDS fold, the SIGN A CONTRACT compare preview and the MY TEAM
 * dialog's SAVE, as BEHAVIOUR in a VM on tests/helpers/mini-dom.mjs.
 *   #5065 UPGRADE THE FACTORY / RAISE THE CAP spent on the first tap while the
 *         compact density (a 390 px tall phone) hid the only line with the
 *         price; +CR / UNLIMITED rebuilt the pane and snapped EXTRA FUNDS shut.
 *   #5073 Escape / DECIDE LATER in the compare preview closed the whole sheet;
 *         CANCEL dropped focus to <body>. (The COMMITTED stake funds gate
 *         waits for #5348, which owns career-planning-ui.js.)
 *   #5046 the MY TEAM dialog's SAVE and the loader (Teams.sanitizeCustom)
 *         cut "ß" before uppercasing (CODE "SSSSSS") and halved an emoji into
 *         a lone surrogate; SAVE also reset an imported team's tier, engine
 *         and second driver.
 *
 * Run: node --test tests/unit/career-hub-spend.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { i18nStub } from "../helpers/i18n-stub.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";
import { DOM_SOURCE } from "../helpers/seed-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// `const X = (function…` lands in the VM's lexical scope; as `var` it lands on the sandbox.
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");
const run = (sb, p) => vm.runInNewContext(src(p), sb, { filename: absSrc(p) });

function sandbox(dom, extra = {}) {
  const sb = {
    I18n: i18nStub(),
    Math, console, Object, Array, Number, String, JSON, Map, Set, Date, parseFloat, parseInt, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document,
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {},
    GameAudio: { uiTick() {}, uiSelect() {}, uiReject() {}, init() {} },
    ScrollFade: { refresh() {} },
    ...extra,
  };
  sb.window = sb;
  return sb;
}

/* ── CAREER HUB / OFFERS: CareerUI in a VM ─────────────────────────────── */

const TEAMS = [
  { id: "haas", name: "Haas", short: "HAA", tier: 4, engine: "Ferrari", color: [1, 1, 1], color2: [0, 0, 0],
    stats: { speed: 78, accel: 80, cornering: 79, braking: 81 },
    drivers: [{ name: "Esteban Ocon", code: "OCO", num: 31 }, { name: "Oliver Bearman", code: "BEA", num: 87 }] },
  { id: "sauber", name: "Audi", short: "AUD", tier: 3, engine: "Audi", color: [0, 1, 0], color2: [0, 0, 0],
    stats: { speed: 82, accel: 82, cornering: 82, braking: 82 },
    drivers: [{ name: "Nico Hulkenberg", code: "HUL", num: 27 }, { name: "Gabriel Bortoleto", code: "BOR", num: 5 }] },
];
const OFFERS = [{ teamId: "haas", years: 1, salary: 99, goal: { type: "teamPos", value: 8 } },
                { teamId: "sauber", years: 2, salary: 120, goal: { type: "teamPos", value: 6 } }];
const hubCareer = () => ({
  year: 2026, flavour: "driver", driver: { code: "YOU", name: "You" }, team: "haas", seat: 1, money: 5000,
  deal: { team: "haas", left: 0, salary: 101, bonusPt: 16, goal: { value: 14 } },
  season: { round: 2, pts: {}, driverCodes: {} }, fitted: {}, owned: [], tdev: {},
  roster: null, history: [], results: [], offers: OFFERS.map((o) => ({ ...o })), moves: [],
});
const hubState = (over = {}) => ({
  money: 5000, rep: 40, round: 2, rounds: 24, sponsor: null,
  facility: 0, facilityCost: 1200, facilityDiscount: 0,
  budgetCost: 900, budgetLvl: 0, budget: 1170, dnfs: 0, hire: null, offers: 0, ...over,
});

function careerStub(career, state) {
  const C = {
    SLOTS: 3, FLAVOURS: ["driver", "myteam"], GRANT: 5000, OBJ_BONUS: 150,
    AMBITION: [{ key: "modest", name: "PLAY IT SAFE", delta: 3 }, { key: "expected", name: "WHAT THEY ASK", delta: 0 },
               { key: "ambitious", name: "PROMISE MORE", delta: -3 }],
    calls: [], free: false,
    slots: () => [{ flavour: "driver", i: 0, used: true, live: true }], slot: () => ({ flavour: "driver", i: 0 }),
    active: () => true, data: () => career, load: () => career, state: () => state,
    conflicted: () => false, seasonDone: () => false,
    grant: (n) => { C.calls.push(["grant", n]); },
    freeMoney: (v) => { if (v !== undefined) { C.free = v; C.calls.push(["freeMoney", v]); } return C.free; },
    upgradeFacility: () => { C.calls.push(["upgradeFacility"]); return true; },
    upgradeBudget: () => { C.calls.push(["upgradeBudget"]); return true; },
    objective: () => ({ type: "mate" }), objectiveLabel: () => "Beat your team-mate",
    objectiveChoices: () => [{ type: "mate", label: "Beat your team-mate" }], objectivePick: () => 0,
    objectiveLocked: () => false, chooseObjective: () => true,
    budget: () => 1170, marketValue: () => 40, driverStandings: () => [], offerBar: (t) => 92 - t * 18,
    goalLabel: (g) => (g ? `Take the team to P${g.value} or better in the constructors'` : ""),
    goalNow: () => "P7", goalOnTrack: () => false,
    ambition: () => 1, ambitionOf: () => 1, setAmbition: (i) => i, goalValueFor: (t, a) => 10 - a,
    roundsTotal: () => 24, prizeFor: () => 100, researchCost: () => 0, salaryFor: () => 100, freeAgents: () => [],
    offerPreview: (i) => (career.offers[i] ? {
      moving: career.offers[i].teamId !== career.team, teamName: "T" + i, teammate: null,
      deal: { years: 1, salary: 99, bonusPt: 10, goal: career.offers[i].goal }, currentCap: 1170, cap: 1170,
      retained: { money: 5000, facility: 0 }, resolvedFitted: {}, currentFitted: {}, fitted: {}, lostResearch: [],
    } : null),
    acceptOffer: () => true,
  };
  return C;
}

function loadCareerUi(state = hubState()) {
  const dom = makeDom({ tagFor: (id) => (/^(cr-back|cr-go|cr-garage|co-back|ch-back|cg-back)$/.test(id) ? "button"
    : id === "cr-funds" ? "details" : "div") });
  const career = hubCareer();
  const Career = careerStub(career, state);
  const G = {
    $: (id) => dom.byId(id), els: { overlay: dom.byId("overlay") },
    soundOn: false, flow: "gp", session: "race", season: null,
    store: { get: (k, d) => d, set() {} },
    cssCol: () => "#fff", openCareer() {}, openGarage() {}, openRaceSettings() {}, refreshCareerButton() {}, qualiClear() {},
    armConfirm: (btn, txt, act) => { act(); return true; },
  };
  const sb = sandbox(dom, {
    Career,
    Teams: { LIST: TEAMS, POINTS: [25, 18, 15], isReal: (t) => !!t && !t.custom && !t.legends },
    DriverRatings: { get: () => ({ pace: 70, craft: 60 }), AXES: ["pace"] },
    Parts: { CATALOG: [], getCost: () => 0 },
    Tracks: { SEASON: [{ name: "Bahrain", country: "BHR" }, { name: "Jeddah", country: "KSA" },
                       { name: "Melbourne", country: "AUS" }, { name: "Suzuka", country: "JPN" }] },
    GameStore: { seasonDriverId: (t, i) => t + ":" + i },
    SeasonCal: { hasProgress: () => false, rounds: () => 24, load: () => null },
    Reliability: { REASONS: ["engine"], TIER_RISK: [0.02, 0.06] },
    PhysicsConsts: { DIFF: { EASY: 1 } },
  });
  vm.runInNewContext(DOM_SOURCE, sb, { filename: absSrc("js/ui/dom.js") });
  run(sb, "js/career/experience.js");
  run(sb, "js/career/career-ui.js");
  const ui = sb.CareerScreen.create(G);
  return { dom, ui, Career, $: G.$ };
}

// mini-dom's `textContent = ""` keeps children; read the NEWEST node with an id.
const latest = (dom, id) => {
  const all = dom.document.body.querySelectorAll("#" + id);
  return all.length ? all[all.length - 1] : dom.byId(id);
};

test("#5065 career hub: each priced upgrade shows its cost on the line the compact phone layout keeps", () => {
  const { ui, $ } = loadCareerUi();
  ui.openHub();
  assert.equal($("cr-facility").querySelector(".cr-record-cta").textContent,
    "COST 1,200 cr  ·  LEVEL 0 → 1  ·  −5% RESEARCH");
  assert.equal($("cr-budget").querySelector(".cr-record-cta").textContent,
    "COST 900 cr  ·  LEVEL 0 → 1  ·  CAP 1,170 cr");
});

test("#5065 career hub: the cost still leads when the card is greyed out with a shortfall", () => {
  const { ui, $ } = loadCareerUi(hubState({ money: 800 }));
  ui.openHub();
  assert.equal($("cr-facility").querySelector(".cr-record-cta").textContent,
    "COST 1,200 cr  ·  LEVEL 0 → 1  ·  −5% RESEARCH  ·  SHORT 400 cr");
  assert.equal($("cr-budget").querySelector(".cr-record-cta").textContent,
    "COST 900 cr  ·  LEVEL 0 → 1  ·  CAP 1,170 cr  ·  SHORT 100 cr");
});

for (const id of ["cr-grant", "cr-freemoney"]) {
  test(`#5065 career hub: EXTRA FUNDS stays open after ${id} rebuilds the pane`, () => {
    const { dom, ui, $ } = loadCareerUi();
    ui.openHub();
    assert.equal($("cr-funds").open, false, "the fold starts closed");
    $("cr-funds").open = true;
    latest(dom, id).onclick();
    assert.equal(latest(dom, "cr-funds").open, true);
    ui.openHub();
    assert.equal(latest(dom, "cr-funds").open, false, "a fresh visit to the hub starts folded again");
  });
}

test("#5073 offers: Escape / BACK in the compare preview returns to the list, focus on that offer", () => {
  const { dom, ui, $ } = loadCareerUi();
  ui.openOffers();
  assert.equal($("co-back").textContent, "DECIDE LATER");
  latest(dom, "co-body");
  const rows = () => $("co-body").querySelectorAll(".co-offer");
  rows()[1].onclick();
  assert.equal($("co-back").textContent, "BACK");
  assert.equal(dom.document.activeElement.textContent, "CANCEL");
  $("co-body").children.length = 0;
  $("co-back").onclick();                     // Escape clicks it (data-esc-close="co-back")
  assert.equal($("career-offers").hidden, false, "the sheet stays open");
  assert.equal(rows().length, 2);
  assert.equal(dom.document.activeElement, rows()[1]);
  assert.equal($("co-back").textContent, "DECIDE LATER");
  $("co-back").onclick();                     // from the LIST it closes
  assert.equal($("career-offers").hidden, true);
});

test("#5073 offers: CANCEL in the compare preview keeps focus inside the sheet", () => {
  const { dom, ui, $ } = loadCareerUi();
  ui.openOffers();
  $("co-body").querySelectorAll(".co-offer")[0].onclick();
  const cancel = $("co-body").querySelectorAll("button").find((b) => b.textContent === "CANCEL");
  $("co-body").children.length = 0;
  cancel.onclick();
  assert.equal(dom.document.activeElement, $("co-body").querySelectorAll(".co-offer")[0]);
  assert.equal($("career-offers").hidden, false);
});

/* ── MY TEAM: the loader (Teams.sanitizeCustom) and the dialog's SAVE ──── */

function loadTeams() {
  const sb = { Math, Object, Array, Number, String, JSON, console };
  run(sb, "js/data/teams.js");
  return sb.Teams;
}
const loneSurrogate = (s) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

test("#5046 sanitizeCustom (the loader): uppercase before the cut, cut by code point", () => {
  const Teams = loadTeams();
  const t = Teams.sanitizeCustom({ short: "ßßßß", name: "a".repeat(21) + "🏎", drivers: [{ code: "ßßß", name: "x" }] });
  assert.equal(t.short, "SSSS");
  assert.equal(t.drivers[0].code, "SSS");
  assert.equal(t.name, "a".repeat(21) + "🏎");
  const u = Teams.sanitizeCustom({ name: "a".repeat(20) + "🏎🏎🏎" });
  assert.equal(u.name, "a".repeat(20) + "🏎🏎");
  assert.equal(loneSurrogate(u.name), false);
});

function customTeamDialog(stored) {
  const dom = makeDom({ tagFor: (id) => (/^cz-(name|short|color|color2|driver|code|num)$/.test(id) ? "input" : "div") });
  const Teams = loadTeams();
  Teams.LIST.length = 0;
  let saved = stored;
  const store = { get: (k, d) => (k === "customTeam" ? saved : d), set: (k, v) => { if (k === "customTeam") saved = v; } };
  const $ = (id) => dom.byId(id);
  const sb = sandbox(dom);
  run(sb, "js/career/custom-team.js");
  const ct = sb.CustomTeam.create({
    $, store, Teams, DEFAULT_CUSTOM: Teams.DEFAULT_CUSTOM,
    hexToRgb: () => [1, 0, 0], rgbToHex: () => "#ff0000", hexToArr: () => [1, 0, 0], clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    invalidateDecalTextures() {}, invalidateCustomMeshCaches() {}, spMeshBust() {},
    getLivDraftOverride: () => null, setLivDraftOverride() {}, getSoundOn: () => false, GameAudio: sb.GameAudio,
    getEls: () => ({ customize: { hidden: false } }), getTeamIdx: () => 0, setTeamIdx() {}, getDriverIdx: () => 0,
    setDriverIdx() {}, buildSelect() {}, buildSetup() {}, isCarsetupVisible: () => false,
  });
  ct.init();
  return { ct, $, saved: () => saved };
}

test("#5046 MY TEAM SAVE keeps an imported team's tier, engine and second driver", () => {
  const imported = { name: "Import", short: "IMP", tier: 0, engine: "X",
    drivers: [{ name: "One", code: "ONE", num: 1 }, { name: "Two", code: "TWO", num: 2 }] };
  const { ct, $, saved } = customTeamDialog(imported);
  ct.openCustomize();
  $("cz-save").onclick();
  const t = saved();
  assert.equal(t.tier, 0);
  assert.equal(t.engine, "X");
  assert.equal(t.drivers.map((d) => d.code).join(","), "ONE,TWO");
});

test("#5046 MY TEAM SAVE: ß widens before the cap, an emoji is never halved", () => {
  const { ct, $, saved } = customTeamDialog(null);
  ct.openCustomize();
  $("cz-short").value = "ßßßß"; $("cz-code").value = "ßßß"; $("cz-name").value = "a".repeat(21) + "🏎";
  $("cz-save").onclick();
  assert.equal(saved().short, "SSSS");
  assert.equal(saved().drivers[0].code, "SSS");
  assert.equal(saved().name, "a".repeat(21) + "🏎");
});
