/* hud-strategy — the opt-in STRATEGY panel's pure core (js/ui/hud-strategy.js):
   tyre laps / pit loss / next stop formatting and the undercut rule, plus a
   fake-DOM tick that shows it only in a wear race and reads only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-strategy.js"), "utf8");

function load(extra = {}) {
  const ctx = { console, ...extra };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudStrategy = HudStrategy;", ctx);
  return ctx.HudStrategy;
}

test("fmtLaps / fmtLoss / fmtNext", () => {
  const S = load();
  assert.equal(S.fmtLaps(12.4, 0.3), "~12 L");
  assert.equal(S.fmtLaps(250, 0.1), "~99 L");
  assert.equal(S.fmtLaps(3, 1), "GONE");
  assert.equal(S.fmtLaps(null, 0.2), "--");
  assert.equal(S.fmtLoss(21.4), "~21 s");
  assert.equal(S.fmtLoss(NaN), "--");
  assert.equal(S.fmtNext(null), "--");
  assert.equal(S.fmtNext({ next: 14, code: "H", stops: 1 }), "L14 H");
  assert.equal(S.fmtNext({ next: null, stops: 1 }), "DONE");
  assert.equal(S.fmtNext({ next: null, stops: 0 }), "NO STOP");
});

const base = { hasRival: true, rivalInPit: false, rivalLapped: false, stopLeft: true, gapS: 8, lossS: 20, rivalWear: 0.6, myWear: 0.4 };
const behindBase = { hasBehind: true, behindInPit: false, stopLeft: true, gapS: 8, lossS: 20, behindWear: 0.3, myWear: 0.55, lapsToStop: 2, behindWindow: "P14", behindLap: 13 };
test("behindThreat: rival behind due in on fresher rubber while our stop is near", () => {
  const S = load();
  assert.equal(S.behindThreat(behindBase), true);
  assert.equal(S.behindThreat({ ...behindBase, behindInPit: true }), true, "already in the lane");
  assert.equal(S.behindThreat({ ...behindBase, gapS: 30 }), false, "too far back");
  assert.equal(S.behindThreat({ ...behindBase, behindWear: 0.52 }), false, "not fresher");
  assert.equal(S.behindThreat({ ...behindBase, lapsToStop: 5 }), false, "our stop too far out");
  assert.equal(S.behindThreat({ ...behindBase, myWear: 0.2 }), false, "set too fresh to care");
  assert.equal(S.behindThreat({ ...behindBase, behindWindow: "P20" }), false, "pit window not this lap");
  assert.equal(S.behindThreat({ ...behindBase, stopLeft: false }), false);
  assert.equal(S.behindThreat(null), false);
});

test("undercut: car ahead inside the pit-loss window on older tyres", () => {
  const S = load();
  assert.equal(S.undercut(base), true);
  assert.equal(S.undercut({ ...base, gapS: 25 }), false, "outside the window");
  assert.equal(S.undercut({ ...base, gapS: 20 }), true, "the window is inclusive");
  assert.equal(S.undercut({ ...base, rivalWear: 0.42 }), false, "not older by UNDERCUT_WEAR");
  assert.equal(S.undercut({ ...base, rivalWear: 0.3 }), false, "fresher than mine");
  assert.equal(S.undercut({ ...base, rivalInPit: true }), false, "already stopping");
  assert.equal(S.undercut({ ...base, rivalLapped: true }), false, "a lap up the road is not this place");
  assert.equal(S.undercut({ ...base, stopLeft: false }), false, "never invents a stop the plan has not got");
  assert.equal(S.undercut({ ...base, hasRival: false }), false);
  assert.equal(S.undercut(null), false);
});

function fakeDom() {
  const mk = (tag) => {
    const el = { tag, hidden: false, style: {}, attrs: {}, children: [], textContent: "",
      setAttribute(k, v) { el.attrs[k] = String(v); }, appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk("div"); root.hidden = true;
  const doc = { body: { classList: { contains: () => false } }, getElementById: (id) => (id === "hud-strat" ? root : null), createElement: mk };
  return { root, doc };
}

test("tick: race + wear only; shows laps, loss, next, and the cue with the rival's code", () => {
  const { root, doc } = fakeDom();
  const S = load({ document: doc, HudElements: { isOn: () => true } });
  const p = { rank: 2, prog: 1000, speed: 50, tyre: { code: "M" }, tyreWear: 0.4, lap: 12 };
  const a = { rank: 1, prog: 1300, speed: 50, code: "VER", pitState: "none", tyreWear: 0.7 };
  const b = { rank: 3, prog: 700, speed: 50, code: "NOR", pitState: "none", tyreWear: 0.25, lap: 12 };
  let wear = true;
  const G = {
    state: "race", session: "race", cars: [a, p, b], ranked: [a, p, b], track: { total: 5000 }, vTop: () => 90,
    tyres: { on: () => wear, spent: (c) => c.tyreWear, lapsLeft: () => 9.6 },
    pits: {
      estimate: () => ({ lossS: 21 }),
      planInfo: () => ({ next: 14, code: "H", stops: 1, lapsToStop: 2 }),
      windowOf: (c) => (c === b ? "P13" : ""),
    },
  };
  const snap = JSON.stringify([p, a, b]);
  S.tick(G, p);
  assert.equal(root.hidden, false);
  const row = (k) => root.children.find((r) => r.attrs["data-k"] === k);
  const val = (k) => row(k).children[1].textContent;
  assert.equal(val("tyre"), "M ~10 L");
  assert.equal(val("loss"), "~21 s");
  assert.equal(val("next"), "L14 H");
  assert.equal(row("uc").hidden, false, "300 m at 50 m/s = 6 s < 21 s, older tyres");
  assert.equal(val("uc"), "VER");
  assert.equal(row("cov").hidden, false, "300 m behind at 50 m/s, fresher rival due in");
  assert.equal(val("cov"), "NOR");
  assert.match(root.attrs["aria-label"], /undercut on VER/);
  assert.match(root.attrs["aria-label"], /cover from NOR/);
  assert.equal(JSON.stringify([p, a, b]), snap, "the HUD reads only");
  b.tyreWear = 0.5; S.tick(G, p);
  assert.equal(row("cov").hidden, true, "rival no longer fresher enough");
  a.tyreWear = 0.3; S.tick(G, p);
  assert.equal(row("uc").hidden, true, "fresher rival: no cue");
  wear = false; S.tick(G, p);
  assert.equal(root.hidden, true, "TYRE WEAR off: no strategy");
  wear = true; G.session = "quali"; S.tick(G, p);
  assert.equal(root.hidden, true, "races only");
  G.session = "race"; S.tick(G, p);
  assert.equal(root.hidden, false, "control: back to a race session");
  G.practice = true; S.tick(G, p);   // PRACTICE is a flag on a race session (bug-hunt 5.5)
  assert.equal(root.hidden, true, "practice shows no strategy panel");
});

test("never reads track curvature (the arc must not reach the driver)", () => {
  assert.doesNotMatch(SRC, /curvature|kCur|Tracks\./);
});


test("estimated pit window uses only finite canonical gap minus loss", () => {
  const S = load();
  assert.equal(S.fmtWindow({ gapS: 24, lossS: 21, marginS: 999 }), "EST WINDOW +3 s");
  assert.equal(S.fmtWindow({ gapS: 17, lossS: 21 }), "EST WINDOW -4 s");
  assert.equal(S.fmtWindow({ gapS: 21, lossS: 21, caution: true }), "EST WINDOW +0 s · CAUTION");
  assert.equal(S.fmtWindow({ gapS: null, lossS: 21 }), "EST WINDOW --");
  for (const est of [null, { gapS: NaN, lossS: 21 }, { gapS: Infinity, lossS: 21 }, { gapS: -1, lossS: 21 }, { gapS: 24, lossS: 0 }, { gapS: 24, lossS: Infinity }]) assert.equal(S.fmtWindow(est), "");
});

test("estimated tyres short of planned stop has hysteresis and suppresses unknown/no stop", () => {
  const S = load(), pl = { next: 18, lapsToStop: 8 };
  assert.equal(S.tyresShort(3, pl, false), true);
  assert.equal(S.tyresShort(12, pl, true), false);
  assert.equal(S.tyresShort(7.7, pl, false), false);
  assert.equal(S.tyresShort(7.7, pl, true), true);
  assert.equal(S.tyresShort(8, pl, true), false);
  for (const left of [null, NaN, Infinity, -1]) assert.equal(S.tyresShort(left, pl, true), false);
  assert.equal(S.tyresShort(3, { next: null, lapsToStop: null }, true), false);
});

test("strategy tick updates honest window and clears tyre warning on changed or unknown plan", () => {
  const { root, doc } = fakeDom(), S = load({ document: doc });
  const p = { lap: 10, rank: 1, prog: 100, speed: 50, tyre: { code: "M" } };
  let left = 3, est = { gapS: 24, lossS: 21 }, pl = { next: 18, lapsToStop: 8 };
  const G = { state: "race", session: "race", cars: [p], ranked: [p], tyres: { on: () => true, spent: () => 0.4, lapsLeft: () => left }, pits: { estimate: () => est, lossS: () => 21, planInfo: () => pl } };
  const val = (k) => root.children.find(r => r.attrs["data-k"] === k).children[1].textContent;
  S.tick(G, p);
  assert.match(val("loss"), /EST WINDOW \+3 s/); assert.match(val("next"), /EST TYRES SHORT OF L18/);
  left = 12; S.tick(G, p); assert.equal(val("next"), "L18");
  est = null; left = null; S.tick(G, p);
  assert.equal(val("loss"), "~21 s", "red flag/null estimate never falls back to a window");
  assert.equal(val("next"), "L18");
  pl = { next: null, stops: 0 }; left = 1; S.tick(G, p); assert.equal(val("next"), "NO STOP");
});
