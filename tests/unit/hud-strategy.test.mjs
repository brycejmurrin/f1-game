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
    const el = { tag, hidden: false, attrs: {}, children: [], textContent: "",
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
  const p = { rank: 2, prog: 1000, speed: 50, tyre: { code: "M" }, tyreWear: 0.4 };
  const a = { rank: 1, prog: 1300, speed: 50, code: "VER", pitState: "none", tyreWear: 0.7 };
  let wear = true;
  const G = {
    state: "race", session: "race", cars: [a, p], ranked: [a, p], track: { total: 5000 }, vTop: () => 90,
    tyres: { on: () => wear, spent: (c) => c.tyreWear, lapsLeft: () => 9.6 },
    pits: { estimate: () => ({ lossS: 21 }), planInfo: () => ({ next: 14, code: "H", stops: 1 }) },
  };
  const snap = JSON.stringify([p, a]);
  S.tick(G, p);
  assert.equal(root.hidden, false);
  const row = (k) => root.children.find((r) => r.attrs["data-k"] === k);
  const val = (k) => row(k).children[1].textContent;
  assert.equal(val("tyre"), "M ~10 L");
  assert.equal(val("loss"), "~21 s");
  assert.equal(val("next"), "L14 H");
  assert.equal(row("uc").hidden, false, "300 m at 50 m/s = 6 s < 21 s, older tyres");
  assert.equal(val("uc"), "VER");
  assert.match(root.attrs["aria-label"], /undercut on VER/);
  assert.equal(JSON.stringify([p, a]), snap, "the HUD reads only");
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
