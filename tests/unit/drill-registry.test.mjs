/* drill-registry.test.mjs — LEARN's drill host (js/learn-drills/registry.js, #6920 U4.1 / #6959).
 * The Aero Lab drill launched through the host writes the same session, in the same order, as the old
 * LearnDoor.launchAeroDrill, and end("quit") restores every field it wrote with MenuQuitTail.keepFlow last.
 *
 * #7039 adds the result card and its medal store (js/learn-drills/drill-card.js) and the host's run loop (tick/retry).
 *
 * Run: node --test tests/unit/drill-registry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";
import { cssRules, decl } from "../helpers/css-rules.mjs";

function element() {
  return { hidden: false, width: 0, height: 0, setAttribute() {}, append() {}, addEventListener() {}, remove() { this.removed = true; }, getContext: () => null };
}

/** registry.js then learn-door.js in one context (the LAZY_LEARN bundle), with a write log. */
function load({ tracks = [{ id: "bahrain" }, { id: "monza" }] } = {}) {
  const log = [];
  let wind = "calm";
  const ctx = {
    document: { createElement: element, body: { append() {} } },
    window: { matchMedia: () => ({ matches: false }) },
    DrivingLine: { STRIDE: 8 },
    Tracks: { LIST: tracks },
    Wind: { level: () => wind, setLevel: (v) => { wind = v; log.push(["wind", v]); } },
    UiExperience: { leavePracticePick: () => log.push(["leavePracticePick"]) },
    MenuQuitTail: { keepFlow: (f, s) => log.push(["keepFlow", f, s]) },
    Float32Array,
  };
  vm.createContext(ctx);
  for (const rel of ["js/learn-drills/registry.js", "js/learn-drills/drill-card.js", "js/learn-drills/aero.js", "js/ui/learn-door.js"]) {
    vm.runInContext(readFileSync(absSrc(rel), "utf8"), ctx, { filename: absSrc(rel) });
  }
  vm.runInContext("this.DrillRegistry = DrillRegistry; this.LearnDoor = LearnDoor; this.DrillCard = DrillCard;", ctx);
  return { ctx, log };
}

/** A stub G whose every write lands in the log (the flow through its setter, as in game.js). */
function makeG(log, over = {}) {
  let goal = "none";
  const data = {
    state: "menu", netPlay: { active: () => false },
    flow: "career", session: "quali", trackIdx: 0, raceWeather: "wet", raceChangeable: true, raceGrid: "real",
    duel: true, raceDirtyAir: "modern",
    startRace: () => log.push(["startRace"]),
    coach: { practiceGoal: () => goal, setPracticeGoal: (v) => { goal = v; log.push(["goal", v]); return true; } },
    ...over,
  };
  return new Proxy(data, { set(t, k, v) { t[k] = v; log.push([k, v]); return true; } });
}

function host(ctx, G, log = []) {
  return ctx.DrillRegistry.create(G, { retry: () => false, setDirtyAir: (v) => { G.raceDirtyAir = v; },
    reopenLesson: (lesson, payload) => log.push(["reopen", lesson, payload]) });
}

test("define/get/ids/forLesson: the Aero drill is defined lazily and once", () => {
  const { ctx } = load();
  assert.deepEqual([...ctx.DrillRegistry.ids()], [], "nothing is defined at eval: LAZY_LEARN has no load edges");
  ctx.LearnDoor.defineDrills();
  ctx.LearnDoor.defineDrills();
  assert.deepEqual(Array.from(ctx.DrillRegistry.ids(), String), ["aero"]);
  const aero = ctx.DrillRegistry.get("aero");
  assert.equal(aero.lesson, "aero");
  assert.ok(Object.isFrozen(aero) && Object.isFrozen(aero.setup));
  assert.deepEqual(Array.from(ctx.DrillRegistry.forLesson("aero"), (d) => d.id), ["aero"]);
  assert.equal(ctx.DrillRegistry.get("nope"), null);
  assert.throws(() => ctx.DrillRegistry.define({ id: "x", begin() {}, setup: { flow: "gp" } }), /bad descriptor/);
});

test("launch(aero) writes the drill's session in order, then end(quit) restores all ten fields, keepFlow last", () => {
  const { ctx, log } = load();
  ctx.LearnDoor.defineDrills();
  const G = makeG(log);
  const drills = host(ctx, G, log);
  assert.equal(drills.active(), null);
  assert.equal(drills.launch("aero"), true);
  assert.deepEqual(log, [
    ["leavePracticePick"], ["flow", "gp"], ["session", "race"], ["trackIdx", 1], ["raceWeather", "dry"],
    ["raceChangeable", false], ["raceGrid", "tier"], ["duel", false], ["raceDirtyAir", "classic"], ["wind", "real"], ["startRace"],
  ]);
  const drill = drills.active();
  assert.equal(drill.staging, false);
  assert.equal(drills.active(), drill, "active() is a stable reference (read every frame)");
  assert.equal(drills.guide(), drill.guide);
  assert.equal(typeof drills.guide().draw, "function");
  assert.deepEqual({ ...drills.state() }, { id: "aero", variant: "classic", staging: false, attempt: 0, live: false, result: null });

  log.length = 0;
  assert.equal(drills.end("quit"), true);
  assert.deepEqual(log, [
    ["flow", "career"], ["session", "quali"], ["trackIdx", 0], ["raceWeather", "wet"], ["raceChangeable", true],
    ["raceGrid", "real"], ["duel", true], ["raceDirtyAir", "modern"], ["wind", "calm"], ["goal", "none"], ["keepFlow", "career", "quali"],
    ["reopen", "aero", null],
  ]);
  assert.equal(drills.active(), null);
  assert.equal(drills.guide(), null);
  assert.equal(drills.end("quit"), false, "a second end is a no-op");
});

test("the host refuses: not on the menu, netplay, a drill already active, no Monza, an unknown id", () => {
  for (const [why, over, opts] of [
    ["not menu", { state: "race" }, {}],
    ["netplay", { netPlay: { active: () => true } }, {}],
    ["no monza", {}, { tracks: [{ id: "bahrain" }] }],
  ]) {
    const { ctx, log } = load(opts);
    ctx.LearnDoor.defineDrills();
    const drills = host(ctx, makeG(log, over));
    assert.equal(drills.launch("aero"), false, why);
    assert.deepEqual(log, [], why + ": nothing written");
    assert.equal(drills.active(), null, why);
  }
  const { ctx, log } = load();
  ctx.LearnDoor.defineDrills();
  const drills = host(ctx, makeG(log));
  assert.equal(drills.launch("missing"), false);
  assert.equal(drills.launch("aero"), true);
  log.length = 0;
  assert.equal(drills.launch("aero"), false, "a drill is already active");
  assert.deepEqual(log, []);
});

test("begin() hands the drill the eight-member DrillPort, clears staging and hides the guide", () => {
  const { ctx, log } = load();
  const G = makeG(log, { goRolling: () => "rolled", announce: (m) => m, store: { tag: "store" } });
  let seen;
  ctx.DrillRegistry.define({ id: "probe", lesson: "x", setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "real" },
    begin: (g, port) => { seen = { g, port }; return true; } });
  const drills = ctx.DrillRegistry.create(G, { retry: () => "retried", setDirtyAir() {} });
  assert.equal(drills.begin(), false, "no drill: begin() is false");
  drills.launch("probe");
  drills.active().staging = true;
  assert.equal(drills.begin(), true);
  assert.equal(drills.active().staging, false);
  assert.equal(seen.g, G);
  assert.deepEqual(Object.keys(seen.port).sort(), ["announce", "goRolling", "physState", "rerun", "retry", "startRace", "store", "variant"]);
  assert.equal(seen.port.goRolling(), "rolled");
  assert.equal(seen.port.retry(), true, "the port's retry is the host's: card hidden, a fresh run, then the coach's");
  assert.equal(seen.port.announce("hi"), "hi");
  assert.equal(seen.port.store.tag, "store");
  assert.equal(seen.port.physState(), null, "no placed player car: physOf reads G, never __apex (#7342)");
  assert.equal(seen.port.variant(), "classic", "the host's variant: a drill with none runs as classic");
  assert.equal(drills.guide(), null, "a drill without a guide");
});

// THE ARC NEVER REACHES THE DRIVER (AGENTS.md §Physics; #6559 rule 1e.2). The Aero drill still lives in
// js/learn-drills/aero.js since U4.1b. TrackLine.at (begin() placement) and the render-only guide's DrivingLine reads
// (STRIDE geometry; prepare/speedAt place the braking cue, bankOffset lifts a ribbon, invalidateUpload follows a draw)
// stay allowed in aero.js only: the guide draws and writes nothing to a car.
test("js/learn-drills/ reads no curvature and no racing line", () => {
  const dir = absSrc("js/learn-drills");
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.equal(files.indexOf("registry.js") >= 0, true, "the host is under the grep");
  const GUIDE = "STRIDE|prepare|speedAt|bankOffset|invalidateUpload";
  const forbidden = (f) => [/curvature/i, /racingLine/i, new RegExp(`DrivingLine\\s*\\.\\s*(?!(?:${f === "aero.js" ? GUIDE : "STRIDE"})\\b)\\w+`)];
  const offenders = [];
  for (const f of files) {
    const code = readFileSync(`${dir}/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const re of forbidden(f)) if (re.test(code)) offenders.push(`${f} ${re}`);
  }
  assert.deepEqual(offenders, []);
});

// ── #7039 (#6559 step 2): the result card, the one medal store and the host's run loop ─────────────────────────

function memStore() {
  const data = new Map(), writes = [];
  return { writes, data, get: (k, d) => (data.has(k) ? structuredClone(data.get(k)) : d), set: (k, v) => { writes.push(k); data.set(k, structuredClone(v)); return true; } };
}

/** registry.js + drill-card.js over mini-dom: the card really builds. */
function loadCard() {
  const dom = makeDom();
  const ctx = { document: dom.document, Log: { info() {} }, Tracks: { LIST: [{ id: "monza" }] }, Wind: { level: () => "calm", setLevel() {} },
    UiExperience: { leavePracticePick() {} }, structuredClone };
  vm.createContext(ctx);
  for (const rel of ["js/learn-drills/registry.js", "js/learn-drills/drill-card.js"]) {
    vm.runInContext(readFileSync(absSrc(rel), "utf8"), ctx, { filename: absSrc(rel) });
  }
  vm.runInContext("this.DrillRegistry = DrillRegistry; this.DrillCard = DrillCard;", ctx);
  return { ctx, dom };
}

const TIERS = { bronze: 7.1, silver: 9.2, gold: 15.7, goldClean: true };

test("DrillCard.medalOf: tiers in the result's unit, gold needs a clean run", () => {
  const { ctx } = loadCard();
  const m = (value, clean = true) => ctx.DrillCard.medalOf({ value, clean }, TIERS);
  assert.equal(m(4), null);
  assert.equal(m(7.1), "bronze");
  assert.equal(m(9.2), "silver");
  assert.equal(m(15.7), "gold");
  assert.equal(m(17, false), "silver", "an unclean run tops out at silver");
  assert.equal(m(NaN), null);
  assert.equal(ctx.DrillCard.medalOf({ value: 20, clean: true }, null), null);
});

test("DrillCard.record keeps {best, medal, n} under learnMedals.v1 only: the best medal stays, no career write", () => {
  const { ctx } = loadCard();
  const store = memStore();
  let s = ctx.DrillCard.record(store, "aero|classic", { value: 16.04, medal: "gold" });
  assert.deepEqual({ ...s.row }, { best: 16.04, medal: "gold", n: 1 });
  assert.equal(s.improved, false, "a first run is not a NEW BEST");
  s = ctx.DrillCard.record(store, "aero|classic", { value: 6.9, medal: null });
  assert.deepEqual({ ...s.row }, { best: 16.04, medal: "gold", n: 2 }, "a worse run keeps the best and the medal");
  s = ctx.DrillCard.record(store, "aero|classic", { value: 17.2, medal: "silver" });
  assert.deepEqual({ ...s.row }, { best: 17.2, medal: "gold", n: 3 });
  assert.equal(s.improved, true);
  ctx.DrillCard.record(store, "other|classic", { value: 1, medal: "bronze" });
  assert.deepEqual([...new Set(store.writes)], ["learnMedals.v1"], "never circuitMastery, never career currency");
  assert.equal(ctx.DrillCard.KEY, "learnMedals.v1");
  assert.equal(ctx.DrillCard.bestMedal(store, ["aero"]), "gold");
  assert.equal(ctx.DrillCard.bestMedal(store, ["other"]), "bronze");
  assert.equal(ctx.DrillCard.bestMedal(store, ["nope"]), null);
  store.data.set("learnMedals.v1", "garbage");
  assert.deepEqual({ ...ctx.DrillCard.read(store) }, {}, "a corrupt row reads as empty");
});

test("the card at 852x393: one column, at most 6 rows, 44 px targets, focus on RETRY, R and Esc keys", () => {
  const { ctx, dom } = loadCard();
  const calls = [];
  const metrics = Array.from({ length: 8 }, (_, i) => ["Row " + i, i, "m"]);
  dom.byId("pausemenu").hidden = true;   // shipped markup: the pause dialog is hidden until paused
  const card = ctx.DrillCard.show({ title: "Monza Aero Drill", value: 16.1, unit: "m", clean: true, medal: "gold", metrics,
    verdict: "You closed 16.1 m.", best: 16.1, improved: false }, { retry: () => calls.push("retry"), back: () => calls.push("back") });
  assert.equal(card.id, "drill-card");
  assert.equal(card.getAttribute("data-esc-close"), "drill-card-back");
  assert.deepEqual(card.children.map(c => c.id), ["drill-card-title", "drill-card-medal", "drill-card-metrics", "drill-card-verdict", "drill-card-actions"]);
  assert.equal(dom.document.activeElement.id, "drill-card-retry", "focus lands on RETRY");
  assert.equal(card.children[2].children.length, 12, "at most 6 metric rows (dt + dd each)");
  assert.match(card.children[1].textContent, /^GOLD · 16\.1 m/);
  assert.deepEqual(card.children[4].children.map(b => [b.id, b.textContent]), [["drill-card-retry", "RETRY"], ["drill-card-back", "BACK TO LESSON"]]);
  dom.document.dispatchEvent({ type: "keydown", key: "r", preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(calls, ["retry"]);
  assert.equal(ctx.DrillCard.open(), false, "RETRY closes the card");
  ctx.DrillCard.show({ title: "x", value: 1, unit: "m", medal: null }, { retry: () => calls.push("retry"), back: () => calls.push("back") });
  dom.document.dispatchEvent({ type: "keydown", key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(calls, ["retry", "back"], "Esc is BACK TO LESSON");
  dom.document.dispatchEvent({ type: "keydown", key: "r", preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(calls, ["retry", "back"], "the keys leave with the card");

  // The layout lives in css/overlays.css; 852x393 is the max-height: 500px band, which changes neither rule.
  const rules = cssRules(readFileSync(absSrc("css/overlays.css"), "utf8"));
  assert.equal(decl(rules, "#drill-card", "grid-template-columns"), "minmax(0, 1fr)");
  assert.equal(decl(rules, "#drill-card-actions", "grid-template-columns"), "minmax(0, 1fr)", "RETRY and BACK stack");
  assert.equal(decl(rules, "#drill-card button", "min-height"), "var(--tap)");
  assert.equal(decl(rules, "#learn-aero-retry", "min-height"), "var(--tap)", "the guide's RETRY chip");
  assert.equal(decl(rules, "#learn-aero-retry", "pointer-events"), "auto");
  const phone = rules.filter(r => r.context.some(c => /max-height:\s*500px/.test(c)) && /#drill-card\b/.test(r.selector));
  assert.ok(phone.length && phone.every(r => !r.decls.has("grid-template-columns") && !r.decls.has("display")));
  const tokens = cssRules(readFileSync(absSrc("css/tokens.css"), "utf8"));
  assert.match(decl(tokens, ":root", "--tap") || "", /^max\(44px,/, "--tap is never under 44 px");
});

test("the host's run loop: tick samples a live run, scores its finish, saves, shows the card; RETRY and end reopen", () => {
  const { ctx, dom } = loadCard();
  const store = memStore(), log = [];
  let summary = { drill: null, lastDrill: null };
  const player = { prog: 100 };
  const G = { state: "menu", netPlay: { active: () => false }, store, player, cars: [player], raceT: 0,
    coach: { practiceGoal: () => "none", setPracticeGoal() {} }, startRace() {}, quitToMenu: () => log.push("quit") };
  ctx.DrillRegistry.define({ id: "loop", lesson: "loop-lesson", title: "Loop", goal: "slipstream",
    setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "real" },
    begin: () => true,
    sample: (g, acc) => { acc.n = (acc.n || 0) + 1; acc.max = Math.max(acc.max || 0, g.player.prog); },
    score: (g, last, acc) => ({ value: acc.max - 100, unit: "m", better: "high", clean: last.clean, reason: last.reason, metrics: [["n", acc.n, ""]], verdict: "v" }),
    medals: { bronze: 5, silver: 10, gold: 20, goldClean: true } });
  const drills = ctx.DrillRegistry.create(G, { retry: () => (log.push("coach.retry"), true), setDirtyAir() {},
    insights: () => ({ summary: () => summary }), reopenLesson: (lesson, p) => log.push(["reopen", lesson, p && p.id, p && p.result.medal]) });
  assert.equal(drills.tick(), null, "no drill: nothing");
  drills.launch("loop");
  G.state = "race";
  assert.equal(drills.tick(), null, "no practice drill yet");
  summary = { drill: { mode: "slipstream", done: false } };
  for (const prog of [100, 104, 112]) { player.prog = prog; assert.equal(drills.tick(), null); }
  assert.equal(drills.state().live, true);
  summary = { drill: { mode: "slipstream", done: true }, lastDrill: { clean: true, reason: "" } };
  const r = drills.tick();
  assert.equal(r.value, 12);
  assert.equal(r.medal, "silver");
  assert.equal(r.attempt, 1);
  assert.deepEqual({ ...store.get("learnMedals.v1")["loop|classic"] }, { best: 12, medal: "silver", n: 1 });
  assert.equal(ctx.DrillCard.open(), true, "the card is up");
  assert.equal(drills.tick(), null, "a finish is scored once");
  // RETRY: the card goes, the coach restores its checkpoint; the next live tick is a fresh run.
  dom.document.getElementById("drill-card-retry").click();
  assert.deepEqual(log, ["coach.retry"]);
  assert.equal(ctx.DrillCard.open(), false);
  summary = { drill: { mode: "slipstream", done: false } };
  player.prog = 100; drills.tick(); player.prog = 130; drills.tick();
  summary = { drill: { mode: "slipstream", done: true }, lastDrill: { clean: true, reason: "" } };
  assert.equal(drills.tick().medal, "gold");
  // BACK TO LESSON quits the race; game.js's quitToMenu then ends the drill, which reopens the lesson with the result.
  dom.document.getElementById("drill-card-back").click();
  assert.equal(log.at(-1), "quit");
  drills.end("quit");
  assert.deepEqual(log.at(-1), ["reopen", "loop-lesson", "loop", "gold"]);
  assert.equal(drills.lastResult(), null);
});

test("a start that could not place the cars reopens nothing (review F1, #7168)", () => {
  const { ctx } = loadCard();
  const log = [];
  const G = { state: "menu", netPlay: { active: () => false }, coach: { practiceGoal: () => "none", setPracticeGoal() {} }, startRace() {} };
  ctx.DrillRegistry.define({ id: "nope", lesson: "nope-lesson",
    setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "real" },
    begin: () => false });
  const drills = ctx.DrillRegistry.create(G, { retry: () => true, setDirtyAir() {}, reopenLesson: (lesson) => log.push(lesson) });
  drills.launch("nope");
  assert.equal(drills.begin(), false);
  drills.end("quit");   // game.js: quitToMenu() after a failed begin()
  assert.deepEqual(log, [], "the title stays; the COULD NOT START announce is the only word");
  drills.launch("nope");
  drills.end("quit");   // an ordinary quit (no failed begin) reopens the lesson
  assert.deepEqual(log, ["nope-lesson"]);
});
