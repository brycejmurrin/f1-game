/* hud-race-keep-5678 — two in-race HUD fixes from the 2026-11-18 phone-profile hunt (#5678):
 *   1. HudReadouts.gapClock: the ▲/▼ chip's gap is the TIME between two cars at a timing line both crossed,
 *      not metres ÷ the player's own speed (which doubled at every brake zone).
 *   2. HudLayout.keepClear / maxRect / keepUser: a MOVE & SIZE piece stays inside the safe area and off the
 *      touch controls in the race, measured at its widest content, shifted no further than needed and never saved.
 * Run: node --test tests/unit/hud-race-keep-5678.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { withI18n } from "../helpers/i18n-ctx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function readouts() {
  const ctx = { Math, Number, Float64Array, Map };
  vm.createContext(ctx);
  vm.runInContext(read("js/ui/hud-readouts.js") + "; this.HudReadouts = HudReadouts;", ctx, { filename: absSrc("js/ui/hud-readouts.js") });
  return ctx.HudReadouts;
}

test("gapClock: a constant 1500 m at 50 m/s is exactly 30 s, and braking adds only the time really lost", () => {
  const R = readouts(), clk = R.gapClock(), L = 5000;
  const front = {}, back = {};
  let T = 0, pF = 1500, pB = 0;
  for (; T < 40 - 1e-9; T += 0.1) { clk.sample(front, pF, T, L); clk.sample(back, pB, T, L); pF += 5; pB += 5; }
  assert.ok(Math.abs(clk.gap(front, back) - 30) < 1e-9, "steady: " + clk.gap(front, back));
  // The player brakes to 15 m/s for 2 s; the rival holds 50. The gap is how long ago the rival was where the
  // player is now: T - (pB - 1500) / 50 = 30 s + what 2 s at 15 m/s lost on 50 — not 1500 / 15 = 100 s.
  for (let n = 0; n < 20; n++) { clk.sample(front, pF, T, L); clk.sample(back, pB, T, L); pF += 5; pB += 1.5; T += 0.1; }
  clk.sample(front, pF, T, L); clk.sample(back, pB, T, L);
  const want = T - (pB - 1500) / 50;
  assert.ok(Math.abs(want - 31.4) < 1e-9, "the arithmetic: 2 s at 15 m/s is 30 m, which the rival covers in 0.6 s");
  assert.ok(Math.abs(clk.gap(front, back) - want) < 1e-9, clk.gap(front, back) + " vs " + want);
  assert.ok(clk.gap(front, back) < 30 * 1.15, "under 15 % of the steady gap after 2 s of braking (old: ~2x)");
});

test("gapClock: a stopped car's gap grows with the clock; a re-grid or reset starts the history over", () => {
  const R = readouts(), clk = R.gapClock(), L = 5000;
  const front = {}, back = {};
  let T = 0, pF = 500, pB = 0;
  for (; T < 20 - 1e-9; T += 0.1) { clk.sample(front, pF, T, L); clk.sample(back, pB, T, L); pF += 5; pB += 5; }
  assert.ok(Math.abs(clk.gap(front, back) - 10) < 1e-9);
  for (let n = 0; n < 50; n++) { T += 0.1; pF += 5; clk.sample(front, pF, T, L); clk.sample(back, pB, T, L); }   // back stops 5 s
  assert.ok(Math.abs(clk.gap(front, back) - 15) < 1e-9, "10 s + the 5 s parked: " + clk.gap(front, back));
  clk.sample(back, -20, T + 0.1, L);   // re-gridded behind the line
  assert.ok(Number.isNaN(clk.gap(front, back)), "no gap until both cross a line again");
  clk.sample(back, 100, T + 0.2, L); clk.reset();
  assert.ok(Number.isNaN(clk.gap(front, back)), "reset() forgets every car");
});

// ONE clock for every gap readout (#5678, 57460a6e redone): REL and STRATEGY read HudReadouts.gaps, the clock
// hud.js samples. `mod` loads beside it in one context; `drive` samples every car at 50 m/s for 30 s.
function withClock(mod, name, extra = {}) {
  const ctx = { Math, Number, Float64Array, Map, console, ...extra };
  vm.createContext(ctx); withI18n(ctx);
  vm.runInContext(read("js/ui/hud-readouts.js") + "; this.HudReadouts = HudReadouts;", ctx, { filename: absSrc("js/ui/hud-readouts.js") });
  if (mod) vm.runInContext(read(mod) + "; this." + name + " = " + name + ";", ctx, { filename: absSrc(mod) });
  return ctx;
}
function drive(clk, cars, L, secs = 30) {
  for (let T = 0; T < secs + 1e-9; T += 0.1) for (const c of cars) { clk.sample(c, c.prog, T, L); c.prog += 5; c.s = ((c.prog % L) + L) % L; }
}

test("gaps: one shared clock; a car a lap up or down is read at the same TRACK point (the laps shift)", () => {
  const R = withClock(null).HudReadouts, L = 1000;
  assert.equal(typeof R.gaps.gapOr, "function", "HudReadouts.gaps is the shared instance");
  const you = { prog: 3000 }, up = { prog: 3000 + L + 29 }, down = { prog: 3000 - L - 40 };
  drive(R.gaps, [you, up, down], L);
  // 29 m ahead on the road at 50 m/s = 0.58 s; 40 m behind = 0.80 s, whichever lap each is on.
  assert.ok(Math.abs(R.gaps.gap(up, you, 1) - 0.58) < 1e-9, "lap up, ahead: " + R.gaps.gap(up, you, 1));
  assert.ok(Math.abs(R.gaps.gap(you, down, 1) - 0.8) < 1e-9, "lap down, behind: " + R.gaps.gap(you, down, 1));
  // Without the shift the lookup is a lap off: a lap's worth of seconds or nothing, never the road gap.
  for (const g of [R.gaps.gap(up, you), R.gaps.gap(you, down)]) assert.ok(!(Math.abs(g - 0.58) < 0.5 || Math.abs(g - 0.8) < 0.5), "unshifted: " + g);
  assert.equal(R.gaps.gapOr(up, you, 7, 1), R.gaps.gap(up, you, 1), "gapOr passes the shift through");
});

test("RELATIVE reads the shared clock: -0.58 / +0.80 for lapped rows under braking, where distance ÷ speed reads 1.24", () => {
  const mk = () => {
    const el = { hidden: true, attrs: {}, children: [], textContent: "",
      style: { setProperty(k, v) { el.style[k] = v; }, removeProperty(k) { delete el.style[k]; } },
      setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; },
      appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk(), L = 1000;
  const doc = { body: { classList: { contains: () => false } }, getElementById: (id) => (id === "hud-rel" ? root : null), createElement: mk };
  const ctx = withClock("js/ui/hud-relative.js", "HudRelative", { document: doc, HudElements: { isOn: () => true } });
  const rc = (code, prog, rank) => ({ code, prog, s: prog % L, rank, speed: 50, tyre: { code: "M" } });
  const you = rc("YOU", 3000, 2), up = rc("LDR", 3000 + L + 29, 1), down = rc("BCK", 3000 - L - 40, 3);
  drive(ctx.HudReadouts.gaps, [you, up, down], L);
  you.speed = 23.4;   // braking: vFloor = max(23.4, 90 × 0.26) = 23.4, so 29 m reads 1.24 s by distance
  const G = { cars: [you, up, down], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } };
  ctx.HudRelative.tick(G, you);
  const rows = root.children;
  assert.equal(rows[1].children[1].textContent, "LDR");
  assert.equal(rows[1].children[2].textContent, "-0.58", "a lap up, 29 m ahead: 0.58 s on the clock (distance ÷ speed: -1.24)");
  assert.equal(rows[3].children[1].textContent, "BCK");
  assert.equal(rows[3].children[2].textContent, "+0.80", "a lap down, 40 m behind: 0.80 s (distance ÷ speed: +1.71)");
});

test("STRATEGY reads the shared clock: undercut and cover show at a 6 s gap inside a 10 s loss, not the 12.8 s distance ÷ braking speed", () => {
  const mk = (tag) => {
    const el = { tag, hidden: false, style: {}, attrs: {}, children: [], textContent: "",
      setAttribute(k, v) { el.attrs[k] = String(v); }, appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk("div"); root.hidden = true;
  const doc = { body: { classList: { contains: () => false } }, getElementById: (id) => (id === "hud-strat" ? root : null), createElement: mk };
  const ctx = withClock("js/ui/hud-strategy.js", "HudStrategy", { document: doc, HudElements: { isOn: () => true } });
  const L = 5000;
  const p = { rank: 2, prog: 1000, speed: 50, tyre: { code: "M" }, tyreWear: 0.4, lap: 12 };
  const a = { rank: 1, prog: 1300, speed: 50, code: "VER", pitState: "none", tyreWear: 0.7 };
  const b = { rank: 3, prog: 700, speed: 50, code: "NOR", pitState: "none", tyreWear: 0.25, lap: 12 };
  drive(ctx.HudReadouts.gaps, [p, a, b], L);   // 300 m apart at 50 m/s: 6 s on the clock
  p.speed = 0;   // the player brakes: 300 m ÷ max(0, 90 × 0.26) = 12.8 s
  const G = {
    state: "race", session: "race", cars: [a, p, b], ranked: [a, p, b], track: { total: L }, vTop: () => 90,
    tyres: { on: () => true, spent: (c) => c.tyreWear, lapsLeft: () => 9.6 },
    pits: { estimate: () => ({ lossS: 10 }), planInfo: () => ({ next: 14, code: "H", stops: 1, lapsToStop: 2 }), windowOf: (c) => (c === b ? "P13" : "") },
  };
  ctx.HudStrategy.tick(G, p);
  const row = (k) => root.children.find((r) => r.attrs["data-k"] === k);
  assert.equal(row("uc").hidden, false, "VER is 6 s up the road on the clock, inside the 10 s loss");
  assert.equal(row("uc").children[1].textContent, "VER");
  assert.equal(row("cov").hidden, false, "NOR is 6 s behind on the clock");
  ctx.HudReadouts.gaps.reset();   // no history: the 12.8 s rough gap is outside the loss, so both cues hide
  ctx.HudStrategy.tick(G, p);
  assert.equal(row("uc").hidden, true, "fallback distance ÷ vFloor = 12.8 s > 10 s");
  assert.equal(row("cov").hidden, true);
});

function layout({ W = 844, H = 390, ins = { "--sal": 47, "--sar": 47, "--sat": 0, "--sab": 21 }, arranging = false } = {}) {
  const attrs = (o) => Object.assign(o, {
    _a: {}, setAttribute(k, v) { this._a[k] = String(v); }, removeAttribute(k) { delete this._a[k]; }, hasAttribute(k) { return k in this._a; },
  });
  const style = () => { const p = {}; return { p, setProperty(k, v) { p[k] = v; }, removeProperty(k) { delete p[k]; }, getPropertyValue(k) { return p[k] || ""; } }; };
  // SECTORS right-anchored at 839: 50 px wide reading "--", 98 px once a split fills it (the hunt's 789 → 741).
  const vals = [0, 1, 2].map(() => ({ firstChild: { nodeType: 3, data: "--" } }));
  const sectors = attrs({ id: "hud-sectors", style: style(), hidden: false,
    querySelectorAll: (s) => (s === ".sec-val" ? vals : []),
    getBoundingClientRect() { const w = vals.some((v) => v.firstChild.data !== "--") ? 98 : 50; return { left: 839 - w, right: 839, top: 10, bottom: 46, width: w, height: 36 }; } });
  const pause = { hidden: false, classList: { contains: () => false }, getBoundingClientRect: () => ({ left: 739, right: 783, top: 8, bottom: 40, width: 44, height: 32 }) };
  const doc = {
    readyState: "complete", getElementById: (id) => (id === "pausebtn" ? pause : null), addEventListener() {},
    documentElement: {}, body: attrs({ classList: { contains: () => false } }),
    querySelector: (sel) => (sel === "#hud-sectors" ? sectors : null),
    querySelectorAll: () => [],
  };
  if (arranging) doc.body.setAttribute("data-hud-arrange", "");
  const ctx = { console, document: doc, window: { innerWidth: W, innerHeight: H },
    getComputedStyle: () => ({ display: "block", visibility: "visible", getPropertyValue: (n) => String(ins[n] ?? 0) }),
    GameStore: { store: { get: (k, d) => d, set() {} } } };
  vm.createContext(ctx);
  vm.runInContext(read("js/camera/cam-groups.js"), ctx, { filename: absSrc("js/camera/cam-groups.js") });
  vm.runInContext(read("js/ui/hud-layout.js").replace(/^const HudLayout\b/m, "var HudLayout"), ctx, { filename: absSrc("js/ui/hud-layout.js") });
  sectors.setAttribute("data-hl-user", ""); sectors.setAttribute("data-hl", "");   // as apply() paints a saved piece
  return { H: vm.runInContext("HudLayout", ctx), sectors, vals };
}

test("keepClear: the smallest shift into the safe area and off a control, by 4 px of air", () => {
  const { H } = layout();
  const bounds = { left: 47, top: 0, right: 797, bottom: 369 };
  const pause = { left: 739, right: 783, top: 8, bottom: 40 };
  // SECTORS at its widest (741..839): 42 px back inside the right inset, then 4 px below PAUSE (34 down)
  // beats 62 px further left.
  assert.deepEqual({ ...H.keepClear({ left: 741, right: 839, top: 10, bottom: 46 }, bounds, [pause]) }, { dx: -42, dy: 34 });
  // DAMAGE 3 px past the inset and on BRAKE's top edge: in by 3, then up off BRAKE by its 11 px + 4 (not 44 px left).
  const brake = { left: 760, right: 830, top: 300, bottom: 370 };
  assert.deepEqual({ ...H.keepClear({ left: 770, right: 800, top: 270, bottom: 311 }, bounds, [brake]) }, { dx: -3, dy: -15 });
  // Clear and inside: untouched.
  assert.deepEqual({ ...H.keepClear({ left: 100, right: 200, top: 50, bottom: 80 }, bounds, [pause, brake]) }, { dx: 0, dy: 0 });
});

test("maxRect: SECTORS is measured with its widest split, and the text nodes are put back", () => {
  const { H, sectors, vals } = layout();
  const r = H.maxRect("sectors", sectors);
  assert.deepEqual([r.left, r.right, r.top, r.bottom], [741, 839, 10, 46]);
  assert.deepEqual(vals.map((v) => v.firstChild.data), ["--", "--", "--"], "the same nodes, the same text");
});

test("keepUser: a saved piece is shifted at race time only, never into the saved layout, and not in the editor", () => {
  const { H, sectors } = layout();
  H.keepUser(844, 390);
  assert.equal(sectors.style.getPropertyValue("--hud-clear-x"), "-42px");
  assert.equal(sectors.style.getPropertyValue("--hud-clear-y"), "34px");
  assert.ok(sectors.hasAttribute("data-hl-keep"));
  assert.equal(H.get("sectors").x, 0, "the saved offset is untouched");
  const ed = layout({ arranging: true });
  ed.H.keepUser(844, 390);
  assert.equal(ed.sectors.style.getPropertyValue("--hud-clear-x"), "", "ARRANGE shows the saved spot (its OVERLAP flags it)");
  // Once the editor opens on a kept piece, the nudge comes off.
  ed.sectors.setAttribute("data-hl-keep", ""); ed.sectors.style.setProperty("--hud-clear-x", "-42px");
  ed.H.keepUser(844, 390);
  assert.equal(ed.sectors.style.getPropertyValue("--hud-clear-x"), "");
  assert.ok(!ed.sectors.hasAttribute("data-hl-keep"));
});

test("keepUser: a piece parked mostly off the screen is the player's choice and is left alone", () => {
  const { H, sectors } = layout();
  const r0 = sectors.getBoundingClientRect;
  sectors.getBoundingClientRect = () => { const r = r0.call(sectors); return { ...r, left: r.left + 120, right: r.right + 120 }; };   // 861..959 at "--": all of it past 844
  H.keepUser(844, 390);
  assert.equal(sectors.style.getPropertyValue("--hud-clear-x"), "");
  assert.ok(!sectors.hasAttribute("data-hl-keep"));
  sectors.getBoundingClientRect = () => { const r = r0.call(sectors); return { ...r, left: r.left + 20, right: r.right + 20 }; };   // widest 761..859: 83 of 98 px on screen
  H.keepUser(844, 390);
  assert.equal(sectors.style.getPropertyValue("--hud-clear-x"), "-62px", "mostly on screen: kept, 62 px back inside the 47 px inset");
});
