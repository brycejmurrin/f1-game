/* hud-relative — the opt-in RELATIVE box's pure core (js/ui/hud-relative.js):
   road-order neighbour selection, wrap-around distance, laps up/down, gap
   formatting, the spoken row, and a fake-DOM tick that reads only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-relative.js"), "utf8");

function load(extra = {}) {
  const ctx = { console, ...extra };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudRelative = HudRelative;", ctx);
  return ctx.HudRelative;
}
const L = 5000;
const car = (code, s, lap, extra = {}) => ({ code, s, lap, prog: lap * L - (L - s), rank: 0, tyre: { code: "M" }, ...extra });

test("relDist wraps into (-L/2, L/2]", () => {
  const R = load();
  assert.equal(R.relDist(100, 300, L), 200);
  assert.equal(R.relDist(300, 100, L), -200);
  assert.equal(R.relDist(4900, 100, L), 200, "across the line, ahead");
  assert.equal(R.relDist(100, 4900, L), -200, "across the line, behind");
  assert.equal(R.relDist(0, 2500, L), 2500);
});

test("lapsApart: +1 lapping you, -1 a lap down, 0 on the same lap", () => {
  const R = load();
  const p = car("YOU", 1000, 5);
  const up = car("LDR", 900, 6), down = car("BCK", 1200, 4), same = car("MID", 1300, 5);
  assert.equal(R.lapsApart(p.prog, up.prog, R.relDist(p.s, up.s, L), L), 1);
  assert.equal(R.lapsApart(p.prog, down.prog, R.relDist(p.s, down.s, L), L), -1);
  assert.equal(R.lapsApart(p.prog, same.prog, R.relDist(p.s, same.s, L), L), 0);
  assert.ok(Object.is(R.lapsApart(0, 0, 0, L), 0), "never -0");
});

test("select: two ahead and two behind BY ROAD, self in the middle, retired skipped", () => {
  const R = load();
  const p = car("YOU", 1000, 3);
  const cars = [p,
    car("A1", 1100, 3), car("A2", 1400, 3), car("A3", 2000, 3),
    car("B1", 950, 4),            // a lap UP, just behind on the road
    car("B2", 600, 3), car("B3", 100, 3),
    car("DNF", 1050, 3, { retired: true })];
  const out = [];
  for (let i = 0; i < R.ROWS; i++) out.push({});
  const n = R.select(cars, p, L, out);
  assert.equal(n, 4);
  assert.deepEqual(out.map((r) => r.car && r.car.code), ["A2", "A1", "YOU", "B1", "B2"]);
  assert.equal(out[3].laps, 1, "the car a lap up is marked");
  assert.equal(out[2].laps, 0);
  assert.ok(out[0].rel > out[1].rel && out[1].rel > 0 && out[3].rel <= 0 && out[4].rel < out[3].rel);
});

test("select: a short field leaves empty slots; the same row objects every call", () => {
  const R = load();
  const p = car("YOU", 10, 1), o = car("ONE", 4990, 1);
  const rows = R.rows;
  const n = R.select([p, o], p, L);
  assert.equal(n, 1);
  assert.equal(rows.length, R.ROWS);
  assert.equal(rows[0].car, null);
  assert.equal(rows[1].car, null);
  assert.equal(rows[3].car.code, "ONE", "20 m behind across the line");
  assert.equal(R.rows, rows);
});

test("fmtGap: sign carries ahead/behind; tenths under 10 s, whole to 99, then 99+", () => {
  const R = load();
  assert.equal(R.fmtGap(1.234, true), "-1.2");
  assert.equal(R.fmtGap(0.04, false), "+0.0");
  assert.equal(R.fmtGap(12.6, false), "+13");
  assert.equal(R.fmtGap(250, true), "-99+");
  assert.equal(R.fmtGap(NaN, true), "---");
  assert.equal(R.lapText(1), "+1L");
  assert.equal(R.lapText(-2), "-2L");
  assert.equal(R.lapText(0), "");
});

test("rowLabel says it in words (no colour-only meaning)", () => {
  const R = load();
  assert.equal(R.rowLabel("P3", "VER", false, "-1.2", true, "M", 0), "P3 VER, 1.2 seconds ahead, tyre M");
  assert.equal(R.rowLabel("P9", "SAR", false, "+0.4", false, "H", -1), "P9 SAR, 0.4 seconds behind, tyre H, 1 lap down");
  assert.equal(R.rowLabel("P5", "YOU", true, "", false, "S", 0), "P5 YOU, you, tyre S");
});

test("tick: off hides the box; on, it fills rows and never writes a car", () => {
  const mk = () => {
    const el = { hidden: true, attrs: {}, children: [], textContent: "",
      style: { setProperty(k, v) { el.style[k] = v; }, removeProperty(k) { delete el.style[k]; } },
      setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; },
      appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk();
  const doc = { body: { classList: { contains: () => false } }, getElementById: (id) => (id === "hud-rel" ? root : null), createElement: mk };
  let on = false;
  const R = load({ document: doc, HudElements: { isOn: () => on } });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const a = car("AHD", 1060, 3, { speed: 60, rank: 1, team: { color: [1, 0, 0] } });
  const G = { cars: [p, a], track: { total: L }, vTop: () => 90, cssCol: () => "rgb(255 0 0)", store: { rev: 1 } };
  R.tick(G, p);
  assert.equal(root.hidden, true, "opt-in: hidden while the toggle is off");
  on = true;
  const snap = JSON.stringify([p.s, p.prog, p.speed, a.s, a.prog, a.speed]);
  R.tick(G, p);
  assert.equal(root.hidden, false);
  const rows = root.children;
  assert.equal(rows.length, R.ROWS);
  assert.equal(rows[1].children[1].textContent, "AHD");
  assert.equal(rows[1].children[2].textContent, "-1.0", "60 m at 60 m/s");
  assert.equal(rows[1].children[0].textContent, "P1");
  assert.equal(rows[2].attrs["data-self"], "");
  assert.match(rows[1].attrs["aria-label"], /AHD, 1\.0 seconds ahead/);
  assert.equal(rows[0].hidden, true, "no second car ahead");
  assert.equal(JSON.stringify([p.s, p.prog, p.speed, a.s, a.prog, a.speed]), snap, "the HUD reads only");
  G.timeTrial = true;
  R.tick(G, p);
  assert.equal(root.hidden, true, "no relative in a time trial");
});

test("fitRows caps max-height above an overlapping BRAKE", () => {
  const mk = () => {
    const el = { hidden: true, attrs: {}, children: [], textContent: "",
      style: { setProperty(k, v) { el.style[k] = v; }, removeProperty(k) { delete el.style[k]; } },
      setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; },
      appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk();
  root.clientHeight = 40;
  root.scrollHeight = 160;
  root.currentCSSZoom = 1;
  root.getBoundingClientRect = () => ({ left: 50, right: 220, top: 100, bottom: 260, width: 170, height: 160 });
  const brake = mk();
  brake.hidden = false;
  brake.getBoundingClientRect = () => ({ left: 60, right: 140, top: 180, bottom: 260, width: 80, height: 80 });
  const els = { "hud-rel": root, "btn-brake": brake };
  const doc = { body: { classList: { contains: () => false } }, getElementById: (id) => els[id] || null, createElement: mk };
  const R = load({ document: doc, HudElements: { isOn: () => true } });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const a1 = car("A1", 1100, 3, { speed: 60, rank: 1 });
  const a2 = car("A2", 1400, 3, { speed: 60, rank: 0 });
  const b1 = car("B1", 900, 3, { speed: 60, rank: 3 });
  const b2 = car("B2", 600, 3, { speed: 60, rank: 4 });
  R.tick({ cars: [p, a1, a2, b1, b2], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } }, p);
  const cap = String(root.style.maxHeight || root.style["max-height"] || "");
  const left = String(root.style.left || "");
  assert.ok(/74/.test(cap) || parseFloat(left) > 50,
    "either height-cap (brake below) or slide right of a left pedal: cap=" + cap + " left=" + left);
});

test("never reads track curvature (the arc must not reach the driver)", () => {
  assert.doesNotMatch(SRC, /curvature|kCur|Tracks\./);
});
