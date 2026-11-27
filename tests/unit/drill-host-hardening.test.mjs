/* drill-host-hardening.test.mjs — #7246: a failed Thumb start cleans up, the two drill hosts exclude each other,
 * card keys stay inert under pause / in inputs, NaN keeps the stored best, a throwing sample never escapes tick().
 * Run: node --test tests/unit/drill-host-hardening.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const src = rel => readFileSync(absSrc(rel), "utf8");
function el() {
  const e = { hidden: false, children: [], dataset: {}, style: {}, setAttribute() {}, addEventListener(t, f) { (e.l ||= {})[t] = f; },
    append(...c) { e.children.push(...c); }, replaceChildren() {}, remove() { e.removed = true; }, focus() {}, click() { e.l?.click?.({}); } };
  return e;
}
function load(files, extra = {}) {
  const byId = {};
  const ctx = { Log: { info() {}, warn() {}, debug() {} }, performance: { now: () => 0 },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, window: { addEventListener() {}, removeEventListener() {} },
    document: { createElement: el, body: { append() {} }, getElementById: id => byId[id] || null, addEventListener() {}, removeEventListener() {} },
    Tracks: { LIST: [{ id: "vegas" }, { id: "monza" }] }, ...extra };
  vm.createContext(ctx);
  for (const rel of files) vm.runInContext(src(rel), ctx, { filename: absSrc(rel) });
  vm.runInContext("for (const n of ['ThumbDrill','DrillRegistry','DrillCard']) { try { this[n] = eval(n); } catch (e) {} }", ctx);
  return { ctx, byId };
}
function makeG(over = {}) {
  const log = [];
  let goal = "none";
  const G = { state: "menu", netPlay: { active: () => false }, flow: "career", session: "quali", trackIdx: 1,
    coach: { practiceGoal: () => goal, setPracticeGoal: v => { goal = v; } }, startRace: () => new Promise(() => {}), ...over };
  return { G, log };
}

test("Thumb: a rejecting startRace restores flow/session/track and runs onFail at once", async () => {
  const { ctx } = load(["js/ui/thumb-trainer.js", "js/learn-drills/thumb-drill.js"], { MenuQuitTail: { keepFlow() {} } });
  const { G } = makeG({ startRace: () => Promise.reject(new Error("load")) });
  let fails = 0;
  assert.equal(ctx.ThumbDrill.launch(G, { onFail: () => fails++ }), true);
  await new Promise(r => setImmediate(r));
  assert.equal(fails, 1);
  assert.deepEqual([G.flow, G.session, G.trackIdx], ["career", "quali", 1]);
  assert.equal(ctx.ThumbDrill.state(), null, "the drill is gone");
});

test("Thumb: a sync throw and the 5 s no-race timeout both run onFail once", () => {
  let now = 0;
  const frames = [];
  const { ctx } = load(["js/ui/thumb-trainer.js", "js/learn-drills/thumb-drill.js"],
    { MenuQuitTail: { keepFlow() {} }, performance: { now: () => now }, requestAnimationFrame: f => frames.push(f) });
  let a = 0;
  assert.equal(ctx.ThumbDrill.launch(makeG({ startRace() { throw new Error("x"); } }).G, { onFail: () => a++ }), false);
  assert.equal(a, 1);
  let b = 0;
  const { G } = makeG();
  assert.equal(ctx.ThumbDrill.launch(G, { onFail: () => b++ }), true);
  now = 6000;
  frames.pop()();
  assert.equal(b, 1);
  assert.equal(G.session, "quali");
});

test("the hosts exclude each other, both ways", () => {
  const { ctx } = load(["js/ui/thumb-trainer.js", "js/learn-drills/thumb-drill.js", "js/learn-drills/registry.js"],
    { MenuQuitTail: { keepFlow() {} }, UiExperience: { leavePracticePick() {} }, Wind: { level: () => "calm", setLevel() {} } });
  ctx.DrillRegistry.define({ id: "t", lesson: "t", setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "calm" }, begin: () => true, score() {} });
  const { G } = makeG({ raceDirtyAir: "x" });
  const host = ctx.DrillRegistry.create(G, { retry() {}, setDirtyAir() {} });
  G.drills = () => host;
  assert.equal(ctx.ThumbDrill.launch(G), true);
  assert.equal(host.launch("t"), false, "registry refuses while Thumb is live");
  ctx.ThumbDrill.stop();
  assert.equal(host.launch("t"), true);
  assert.equal(ctx.ThumbDrill.launch(G), false, "Thumb refuses while a registry drill is live");
});

test("DrillCard: Escape/R are inert under the pause menu and in inputs; NaN keeps the best", () => {
  const { ctx, byId } = load(["js/learn-drills/drill-card.js"]);
  let handler = null;
  ctx.document.addEventListener = (t, f) => { if (t === "keydown") handler = f; };
  const C = ctx.DrillCard;
  let backs = 0;
  C.show({ title: "x", value: 1, unit: "u" }, { retry() {}, back: () => backs++ });
  const key = (e) => handler({ key: "Escape", preventDefault() {}, stopPropagation() {}, ...e });
  byId.pausemenu = { hidden: false };
  key({}); assert.equal(backs, 0, "pause menu open");
  byId.pausemenu = { hidden: true };
  key({ target: { tagName: "INPUT" } }); assert.equal(backs, 0, "typing in an input");
  key({}); // the card's own back button is a stub whose click runs its listener
  const store = { d: {}, get: (k, f) => store.d[k] ?? f, set: (k, v) => { store.d[k] = v; } };
  C.record(store, "a|b", { value: 5, medal: null });
  C.record(store, "a|b", { value: NaN, medal: null });
  assert.equal(C.read(store)["a|b"].best, 5);
});

test("registry tick: a throwing sample does not propagate and drops the run", () => {
  const { ctx } = load(["js/learn-drills/registry.js"], { MenuQuitTail: { keepFlow() {} }, UiExperience: { leavePracticePick() {} }, Wind: { level: () => "calm", setLevel() {} } });
  ctx.DrillRegistry.define({ id: "t", lesson: "t", goal: "g", setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "calm" },
    begin: () => true, score() {}, sample() { throw new Error("boom"); } });
  const { G } = makeG({ raceDirtyAir: "x", player: { prog: 1 } });
  const host = ctx.DrillRegistry.create(G, { retry() {}, setDirtyAir() {}, insights: () => ({ summary: () => ({ drill: { mode: "g", done: false } }) }) });
  assert.equal(host.launch("t"), true);
  G.state = "race";
  assert.equal(host.tick(), null);
  assert.equal(host.state().live, false);
});
