/* setup-screens-state.test.mjs — the SETUP-family sheets (CAREER, SEASON SETUP,
 * GARAGE) as BEHAVIOUR on tests/helpers/mini-dom.mjs.
 *
 * Audit 2026-09-02 (pre-race setup / season setup / garage / career). The
 * confirmed defects, each pinned here by what the module DOES in a VM:
 *   - CareerUI.close() left the NEW CAREER `draft` and an armed DELETE? alive
 *     across a screen change — siblings of the draftFrom leak fixed 2026-09-01.
 *   - SetupUI's livery creator outlived the garage: BACK/DONE (game.js
 *     leaveGarage) never cleared csLivCreating or G.livDraftOverride, and
 *     resolveLivery() paints that override on the player's race car.
 *   - Units/precision: the driver-career team tile quoted a salary with no
 *     per-round unit while the MY TEAM tile beside it says "cr / round"; the
 *     RE-SIGN card said "cr a round" above a market list saying "cr / round";
 *     THE CAR's "Fitted" row printed 1170 where the garage prints 1,170;
 *     history "Points" had no unit; SEASON SETUP's RACE DISTANCE chips were
 *     bare numbers and "57 (FULL)" is not FULL (that is the circuit's own
 *     distance on the race-settings sibling); the sprint note's points had none.
 *   - The factory / fitted-cap upgrade cards greyed out with no reason shown.
 * CSS is read as RULES through tests/helpers/css-rules.mjs where a fix leans
 * on a stylesheet fact (the suffixes above land on lines that must wrap).
 *
 * Run: node --test tests/unit/setup-screens-state.test.mjs   (npm run test:state-unit)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
// `const X = (function…` lands in the VM's lexical scope; as `var` it lands on the sandbox.
const src = (p) => read(p).replace(/^const\b/gm, "var");

function sandbox(dom, extra = {}) {
  const sb = {
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

// mini-dom's `textContent = ""` does not drop children, so a pane rebuilt by
// the module accumulates; a test that asks "what is on the pane NOW" empties
// the pane itself first and reads only the build that follows.
const empty = (dom, ...ids) => ids.forEach((id) => { dom.byId(id).children.length = 0; });
const texts = (root, sel) => root.querySelectorAll(sel).map((n) => n.textContent);
const rowValue = (root, key) => {
  const r = root.querySelectorAll(".cr-row").find((x) => x.querySelector(".cr-row-k").textContent === key);
  return r ? r.querySelector(".cr-row-v").textContent : null;
};

/* ── CAREER (#career): CareerUI in a VM ─────────────────────────────────── */

const TEAMS = [
  { id: "custom", name: "My Team", short: "YOU", tier: 2, custom: true, engine: "Custom",
    color: [1, 0, 0], color2: [0, 0, 1], stats: { speed: 70, accel: 70, cornering: 70, braking: 70 },
    drivers: [{ name: "You", code: "YOU", num: 99 }] },
  { id: "haas", name: "Haas", short: "HAA", tier: 4, engine: "Ferrari",
    color: [1, 1, 1], color2: [0, 0, 0], stats: { speed: 78, accel: 80, cornering: 79, braking: 81 },
    drivers: [{ name: "Esteban Ocon", code: "OCO", num: 31 }, { name: "Oliver Bearman", code: "BEA", num: 87 }] },
  { id: "sauber", name: "Audi", short: "AUD", tier: 3, engine: "Audi",
    color: [0, 1, 0], color2: [0, 0, 0], stats: { speed: 82, accel: 82, cornering: 82, braking: 82 },
    drivers: [{ name: "Nico Hulkenberg", code: "HUL", num: 27 }, { name: "Gabriel Bortoleto", code: "BOR", num: 5 }] },
];

function careerStub(opts = {}) {
  const used = (code, teamName) => ({ used: true, code, teamName, year: 2026, round: 2, rounds: 24,
    money: 1234, seasons: 1, wins: 0, titles: 0 });
  const data = { driver: [used("YOU", "Haas"), { used: false }, { used: false }],
                 myteam: [{ used: false }, { used: false }, { used: false }] };
  let ptr = { flavour: "driver", i: 0 };
  let career = opts.career || null;
  const C = {
    SLOTS: 3, FLAVOURS: ["driver", "myteam"], OBJ_BONUS: 150, OBJ_REP: 2, GRANT: 5000,
    FACILITY_MAX: 8, FACILITY_DISCOUNT_MAX: 0.4, HISTORY_MAX: 12, RESEARCH_MULT: 3,
    PRIZE: [900, 700, 560], START_MONEY: { driver: 1200, myteam: 2000 }, SPONSOR_KINDS: [{ pay: 400 }],
    calls: [],
    slots: (fl) => (fl ? [fl] : C.FLAVOURS).flatMap((f) => data[f].map((s, i) =>
      ({ ...s, flavour: f, i, live: !!s.used && ptr.flavour === f && ptr.i === i }))),
    slot: () => ({ ...ptr }),
    useSlot: (f, i) => { ptr = { flavour: f, i }; C.calls.push(["useSlot", f, i]); },
    firstFree: (f) => data[f].findIndex((s) => !s.used),
    deleteSlot: (f, i) => { data[f][i] = { used: false }; C.calls.push(["deleteSlot", f, i]); },
    active: () => career != null, data: () => career, load: () => career,
    setCareer: (c) => { career = c; },
    freeAgents: () => [{ name: "Yuki Nakamura", code: "NKM", num: 52, tier: 3, ask: 38 },
                       { name: "Sam Okonkwo", code: "OKO", num: 73, tier: 4, ask: 18 }],
    salaryFor: (t, rep) => Math.round(20 + rep * 1.2 + t.tier * 15),
    state: () => opts.state || null,
    conflicted: () => false, seasonDone: () => false,
    objective: () => ({ type: "mate" }), objectiveLabel: () => "Beat your team-mate",
    budget: () => (opts.budget != null ? opts.budget : 1170),
    freeMoney: () => false,
    marketValue: () => 40, driverStandings: () => [], offerBar: (t) => 92 - t * 18,
    roundsTotal: () => 24, prizeFor: () => 100, researchCost: () => 0,
  };
  return C;
}

function loadCareerUi(careerOpts = {}) {
  const dom = makeDom({ tagFor: (id) => (/^(cr-back|cr-go|cr-garage|co-back|ch-back|cg-back)$/.test(id) ? "button" : "div") });
  const Career = careerStub(careerOpts);
  const G = {
    $: (id) => dom.byId(id), els: { overlay: dom.byId("overlay") },
    soundOn: false, flow: "gp", session: "race", season: null,
    store: { get: (k, d) => d, set() {} },
    cssCol: () => "#fff", openCareer() {}, openGarage() {}, openRaceSettings() {}, refreshCareerButton() {},
    armConfirm: (btn, txt, act) => { act(); return true; },
  };
  const sb = sandbox(dom, {
    Career, Teams: { LIST: TEAMS, POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] },
    DriverRatings: { get: () => ({ pace: 70, craft: 60 }), AXES: ["pace"] },
    Parts: { CATALOG: [], getCost: () => (careerOpts.fitted != null ? careerOpts.fitted : 0) },
    Tracks: { SEASON: [{ name: "Bahrain", country: "BHR" }, { name: "Jeddah", country: "KSA" },
                       { name: "Melbourne", country: "AUS" }, { name: "Suzuka", country: "JPN" }] },
    GameStore: { seasonDriverId: (t, i) => t + ":" + i },
    SeasonCal: { hasProgress: () => false, rounds: () => 24 },
    Reliability: { REASONS: ["engine"], TIER_RISK: [0.02, 0.06] },
    PhysicsConsts: { DIFF: { EASY: 1 } },
  });
  vm.runInNewContext(src("js/game/career-ui.js"), sb, { filename: "js/game/career-ui.js" });
  const ui = sb.CareerUI.create(G);
  return { dom, ui, Career, G, $: G.$ };
}

const hubCareer = () => ({
  year: 2026, flavour: "driver", driver: { code: "YOU", name: "You" }, team: "haas", seat: 1,
  deal: { team: "haas", left: 1, salary: 101, bonusPt: 16, goal: { value: 14 } },
  season: { round: 2, pts: {}, driverCodes: {} }, fitted: {}, owned: [], tdev: {},
  roster: null, history: [], results: [], offers: [], moves: [],
});
const hubState = (over = {}) => ({
  money: 800, rep: 40, round: 2, rounds: 24, sponsor: null,
  facility: 0, facilityCost: 1200, facilityDiscount: 0,
  budgetCost: 900, budgetLvl: 0, budget: 1170, dnfs: 0, hire: null, offers: 0, ...over,
});

test("career: a NEW CAREER draft does not survive leaving the screen", () => {
  const { dom, ui, $ } = loadCareerUi();
  ui.openSlots();
  assert.equal($("cr-title").textContent, "CAREER MODES");
  // Open an EMPTY driver slot -> the setup form, with a draft behind it.
  const emptySlot = $("cr-left").querySelectorAll(".cr-slot.empty")[0];
  emptySlot.querySelector(".cr-slot-main").onclick();
  assert.equal($("cr-title").textContent, "NEW CAREER");
  // MAIN MENU
  $("cr-back").onclick();
  assert.equal($("career").hidden, true);
  // Re-enter through the HUB door with no career live (the path that does not
  // go through the picker): must be the modes screen, not the abandoned form.
  empty(dom, "cr-left", "cr-right");
  ui.openHub();
  assert.equal($("cr-title").textContent, "CAREER MODES",
    "a draft abandoned at MAIN MENU came back as NEW CAREER on openHub()");
});

test("career: an armed DELETE? disarms when the screen closes", () => {
  const { dom, ui, $, Career } = loadCareerUi();
  ui.openSlots();
  const del = () => $("cr-left").querySelectorAll(".cr-slot-del").at(-1);
  del().onclick({ stopPropagation() {} });
  assert.equal(del().textContent, "DELETE?", "first press arms");
  $("cr-back").onclick();
  empty(dom, "cr-left", "cr-right");
  ui.openHub();                      // no career live -> the slot picker again
  assert.equal(del().textContent, "DELETE", "must come back DISARMED");
  del().onclick({ stopPropagation() {} });
  assert.equal(Career.calls.filter((c) => c[0] === "deleteSlot").length, 0,
    "one tap after re-entry must not delete a save");
});

test("career: driver-career team tiles carry the per-round salary unit their MY TEAM sibling shows", () => {
  const { ui, $ } = loadCareerUi();
  ui.openSlots();
  $("cr-left").querySelectorAll(".cr-slot.empty")[0].querySelector(".cr-slot-main").onclick();
  const metas = texts($("cr-left"), ".cr-teamtile-meta");
  assert.ok(metas.length >= 2, "starter tiles rendered");
  for (const m of metas) assert.match(m, /\d+ cr \/ round$/, m);
});

test("career hub: THE CAR's Fitted row groups thousands like the garage readout", () => {
  const { ui, $ } = loadCareerUi({ career: hubCareer(), state: hubState(), fitted: 1000, budget: 1170 });
  ui.openHub();
  assert.equal(rowValue($("cr-left"), "Fitted"), "1,000 / 1,170 cr");
});

test("career hub: a greyed-out upgrade card says how far short the balance is", () => {
  const { ui, $ } = loadCareerUi({ career: hubCareer(), state: hubState({ money: 800 }) });
  ui.openHub();
  const fac = $("cr-facility"), cap = $("cr-budget");
  assert.equal(fac.disabled, true); assert.equal(cap.disabled, true);
  assert.match(fac.querySelector(".cr-record-cta").textContent, /SHORT 400 cr$/);
  assert.match(cap.querySelector(".cr-record-cta").textContent, /SHORT 100 cr$/);
  assert.match(fac.title, /400 cr/); assert.match(cap.title, /100 cr/);
});

test("career hub: an affordable upgrade card carries no shortfall and no title", () => {
  const { ui, $ } = loadCareerUi({ career: hubCareer(), state: hubState({ money: 5000 }) });
  ui.openHub();
  for (const id of ["cr-facility", "cr-budget"]) {
    assert.equal($(id).disabled, false);
    assert.doesNotMatch($(id).querySelector(".cr-record-cta").textContent, /SHORT/);
    assert.equal($(id).title, "");
  }
});

test("career hub: RE-SIGN card and the market list quote wages the same way", () => {
  const career = Object.assign(hubCareer(), { flavour: "myteam", team: "custom", seat: 0,
    roster: [{ name: "Sam Okonkwo", salary: 18, left: 0 }] });
  const state = hubState({ hire: { kind: "renew", name: "Sam Okonkwo", code: "OKO", ask: 22, salary: 18 } });
  const { ui, $ } = loadCareerUi({ career, state });
  ui.openHub();
  assert.match($("cr-rehire").querySelector(".cr-record-line").textContent, /22 cr \/ round$/);
  for (const w of texts($("cr-right"), ".cr-seat-who")) assert.match(w, /cr \/ round$/, w);
});

test("career history: Points carries its unit like every other points figure", () => {
  const { ui, $ } = loadCareerUi({ career: hubCareer(), state: hubState() });
  ui.openHub();
  ui.openHistory();
  assert.equal(rowValue($("ch-body"), "Points"), "0 pts");
});

test("career.css: the lines the fixes extend must wrap, not ellipsize", () => {
  const rules = cssRules(read("css/career.css"));
  for (const sel of [".cr-record-cta", ".cr-record-line", ".cr-teamtile-meta"]) {
    assert.notEqual(decl(rules, sel, "white-space"), "nowrap", `${sel} must wrap`);
    assert.equal(decl(rules, sel, "text-overflow"), null, `${sel} must not ellipsize`);
  }
});

/* ── SEASON SETUP (#season-setup): SeasonUI in a VM ─────────────────────── */

function loadSeasonUi(trackIds = ["a", "b"]) {
  const dom = makeDom({ tagFor: (id) => (/^(ss-back|ss-apply|mb-season)$/.test(id) ? "button" : "div") });
  const G = {
    $: (id) => dom.byId(id), els: {}, soundOn: false, season: null,
    store: { get: (k, d) => d, set() {} }, buildSelect() {}, refreshCareerButton() {},
    armConfirm: (btn, txt, act) => { act(); return true; },
  };
  const sb = sandbox(dom, {
    SeasonCal: {
      config: () => ({ trackIds: trackIds.slice(), quali: true, sprint: true, laps: 57, points: "modern" }),
      PRESETS: [{ id: "full", label: "FULL" }], presetIds: () => ["a"], shuffled: (x) => x,
      LAP_OPTS: [3, 5, 10, 25, 57], SPRINT_POINTS: [8, 7, 6, 5, 4, 3, 2, 1],
      hasProgress: () => false, rounds: () => 2, restart: () => ({}), setConfig() {}, trackIndex: () => 0,
    },
    Tracks: { LIST: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C", country: "X" }] },
  });
  vm.runInNewContext(src("js/game/season-ui.js"), sb, { filename: "js/game/season-ui.js" });
  return { dom, ui: sb.SeasonUI.create(G), $: G.$ };
}

test("season setup: RACE DISTANCE chips carry a unit and none claims FULL", () => {
  const { ui, $ } = loadSeasonUi();
  ui.open();
  const chips = texts($("ss-laps"), ".sel-chip");
  assert.equal(chips.length, 5);
  for (const c of chips) assert.match(c, /^\d+ LAPS?$/, c);
  // FULL is the circuit's own distance on the race-settings sibling (78 at
  // Monaco, 44 at Spa); this 57 is a flat 57 laps, so it must not say FULL.
  assert.ok(!chips.some((c) => /FULL/.test(c)), chips.join(" | "));
});

test("season setup: ↑ / ↓ / ✕ keep keyboard focus on the row they moved or removed", () => {
  // Bug-hunt 2026-09-02 (UI, not landed in round 1): every calendar press
  // rebuilt #ss-cal, the pressed button was gone and focus fell to <body>.
  const { dom, ui, $ } = loadSeasonUi(["a", "b", "c"]);
  ui.open();
  const btn = (label) => $("ss-cal").querySelectorAll("button").findLast((b) => b.getAttribute("aria-label") === label);
  const focused = () => dom.document.activeElement && dom.document.activeElement.getAttribute("aria-label");
  assert.equal(dom.document.activeElement, null, "precondition: nothing focused");
  btn("Move up — C").click();                       // C: R3 -> R2
  assert.equal(focused(), "Move up — C", "the same control, on the row the circuit moved to");
  btn("Move up — C").click();                       // C: R2 -> R1, where ↑ is disabled
  assert.equal(focused(), "Move down — C", "at the top ↑ is disabled: the nearest enabled control of that row");
  btn("Remove — C").click();                        // [a, b]: the neighbour takes R1
  assert.equal(focused(), "Remove — A", "after a remove, the row that took its place");
  assert.ok(dom.document.activeElement.disabled === false, "never a disabled button");
});

test("season setup: the sprint note names the unit of the points it quotes", () => {
  const { ui, $ } = loadSeasonUi();
  ui.open();
  assert.match($("ss-note").textContent, /8 · 7 · 6 · 5 · 4 · 3 · 2 · 1 pts\./);
});

/* ── GARAGE (#carsetup): SetupUI in a VM ────────────────────────────────── */

function loadSetupUi() {
  const dom = makeDom();
  const observers = [];
  const G = {
    $: (id) => dom.byId(id), els: { select: dom.byId("select"), overlay: dom.byId("overlay") },
    cssCol: () => "#fff", store: { get: (k, d) => (k === "garageTab" ? "livery" : d), set() {} },
    arrToHex: () => "#112233", hexToArr: () => [0.1, 0.2, 0.3],
    getTeamParts: () => ({}), saveTeamParts() {}, getLiveryId: () => "default", saveLiveryId() {},
    getCustomLiveries: () => [], setCustomLiveries() {}, getLiveries: () => [], invalidateDecalTextures: null,
    teamIdx: 1, driverIdx: 0, soundOn: false, careerOwned: () => false, unlimitedBudget: false,
    peerSeats: () => [], teamSwatch: () => dom.document.createElement("span"),
    setTeamPicker() {}, openCustomize() {}, livDraftOverride: null, _spMeshKey: "", setupPreviewOn: false,
  };
  const sb = sandbox(dom, {
    MutationObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe(t, o) { this.target = t; this.opts = o; } },
    Parts: { STAT_KEYS: [{ key: "speed", label: "SPEED" }], displayStat: (x) => x,
             getMods: () => ({ speed: 1, accel: 1, cornering: 1, braking: 1 }), CATALOG: [], BUDGET: 780,
             getCost: () => 0, isOptionAvailable: () => true, DEFAULTS: {}, getFactorySetup: () => ({}) },
    Teams: { LIST: TEAMS }, Car3D: { FINISH_SURFACE: { satin: {}, chrome: {} } },
    M4: { clamp: (v, a, b) => Math.min(b, Math.max(a, v)) },
    PhysicsConsts: { WET_GRIP: { rain: [1, 1.2, 1.4] } },
  });
  vm.runInNewContext(src("js/game/setup-ui.js"), sb, { filename: "js/game/setup-ui.js" });
  return { dom, ui: sb.SetupUI.create(G), G, $: G.$, observers };
}

test("garage: the paint editor and its live-preview override die with the screen", () => {
  const { dom, ui, G, $, observers } = loadSetupUi();
  const mo = observers.find((o) => o.target === $("carsetup"));
  assert.ok(mo, "SetupUI watches #carsetup's hidden attribute");
  assert.deepEqual([...mo.opts.attributeFilter], ["hidden"]);   // spread: the VM's Array is another realm's

  ui.openSetup();
  $("cs-options").querySelector(".cs-liv-create").onclick();          // + Create livery
  assert.ok($("cs-options").querySelector(".cs-liv-editor"), "editor open");
  assert.ok(G.livDraftOverride && G.livDraftOverride.teamId === "haas", "live preview override set");

  $("carsetup").hidden = true;                                          // game.js leaveGarage()
  mo.cb([]);
  assert.equal(G.livDraftOverride, null, "the unsaved draft must not reach resolveLivery()");

  empty(dom, "cs-options");
  ui.buildSetup();
  assert.equal($("cs-options").querySelector(".cs-liv-editor"), null, "next visit opens the swatch grid, not the editor");
  assert.ok($("cs-options").classList.contains("cs-liv-grid"));
});

test("garage: hiding the screen with no editor open is a no-op", () => {
  const { ui, G, $, observers } = loadSetupUi();
  const mo = observers.find((o) => o.target === $("carsetup"));
  ui.openSetup();
  $("carsetup").hidden = true;
  mo.cb([]);
  assert.equal(G.livDraftOverride, null);
  assert.ok($("cs-options").classList.contains("cs-liv-grid"));
});
