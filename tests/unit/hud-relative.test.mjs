/* hud-relative — the opt-in RELATIVE box's pure core (js/ui/hud-relative.js):
   road-order neighbour selection, wrap-around distance, laps up/down, gap
   formatting, the spoken row, and a fake-DOM tick that reads only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { withI18n } from "../helpers/i18n-ctx.mjs";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-relative.js"), "utf8");

function load(extra = {}) {
  const ctx = { console, ...extra };
  vm.createContext(ctx); withI18n(ctx);
  vm.runInContext(SRC, ctx, { filename: absSrc("js/ui/hud-relative.js") });   // a filename, so V8 coverage attributes the run to the file
  vm.runInContext("this.HudRelative = HudRelative;", ctx);
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

test("fmtGap: sign carries ahead/behind; hundredths under 10 s (the chip's spelling), tenths to 99, then 99+", () => {
  // Deliberate re-pin (hud-gap-decimals): REL used to print tenths / whole seconds, so one
  // gap read "0.94s" on the chip and "-0.9" here. Both paths -- HudReadouts present or not -- must agree.
  const HR = (() => { const c = {}; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/hud-readouts.js"), "utf8") + "; this.HudReadouts = HudReadouts;", c, { filename: absSrc("js/ui/hud-readouts.js") }); return c.HudReadouts; })();
  for (const R of [load(), load({ HudReadouts: HR })]) {
    assert.equal(R.fmtGap(1.234, true), "-1.23");
    assert.equal(R.fmtGap(0.94, true), "-0.94");
    assert.equal(R.fmtGap(0.04, false), "+0.04");
    assert.equal(R.fmtGap(12.6, false), "+12.6");
    assert.equal(R.fmtGap(12.6, false, "broadcast"), "+12.60", "broadcast fallback preserves hundredths");
    assert.equal(R.fmtGap(250, true), "-99+");
    assert.equal(R.fmtGap(NaN, true), "---");
    assert.equal(R.fmtGap(0.94, true), "-" + HR.fmtGapSec(0.94), "REL = the chip's magnitude");
    assert.equal(R.fmtGap(12.6, false), "+" + HR.fmtGapSec(12.6), "REL = the chip's magnitude above 10 s");
  }
  const R = load();
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
  assert.equal(rows[1].children[2].textContent, "-1.00", "60 m at 60 m/s");
  assert.equal(rows[1].children[0].textContent, "P1");
  assert.equal(rows[2].attrs["data-self"], "");
  assert.match(rows[1].attrs["aria-label"], /AHD, 1\.00 seconds ahead/);
  assert.equal(rows[0].hidden, true, "no second car ahead");
  assert.equal(JSON.stringify([p.s, p.prog, p.speed, a.s, a.prog, a.speed]), snap, "the HUD reads only");
  // A stationary gap must refresh when the driver's profile changes.
  p.speed = 60 / 12.6;
  G.vTop = () => 1;
  for (let i = 0; i < 60; i++) R.tick(G, p);
  assert.equal(rows[1].children[2].textContent, "-12.6");
  G.hudProfile = "broadcast";
  R.tick(G, p);
  assert.equal(rows[1].children[2].textContent, "-12.60");
  assert.match(rows[1].attrs["aria-label"], /12\.60 seconds ahead/);
  G.hudProfile = "standard";
  R.tick(G, p);
  assert.equal(rows[1].children[2].textContent, "-12.6");
  // 9.949 and 9.951 both round to 995 hundredths; precision only drops at 9.995.
  for (const [sec, expected] of [[9.949, "-9.95"], [9.951, "-9.95"], [9.996, "-10.0"]]) {
    p.speed = 60 / sec;
    for (let i = 0; i < 60; i++) R.tick(G, p);
    assert.equal(rows[1].children[2].textContent, expected);
  }
  G.timeTrial = true;
  R.tick(G, p);
  assert.equal(root.hidden, true, "no relative in a time trial");
});

test("fitRows does not slide past gearbox onto aero / the right dock", () => {
  // Sliding past gearbox (centre CLEAR_ID) put REL at x≈404 on aero, then a
  // failed aero slide left it on THROTTLE (phoneL broadcast @150%). Gearbox must
  // not centre-slide; REL stays in the left column.
  const mk = () => {
    const el = { hidden: true, attrs: {}, children: [], textContent: "", className: "",
      style: { setProperty(k, v) { el.style[k] = v; }, removeProperty(k) { delete el.style[k]; } },
      setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; },
      appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk();
  root.clientHeight = 40; root.scrollHeight = 80; root.currentCSSZoom = 1;
  let relLeft = 59;
  root.getBoundingClientRect = () => ({ left: relLeft, right: relLeft + 202, top: 275, bottom: 357, width: 202, height: 82 });
  const gear = mk(); gear.hidden = false;
  gear.getBoundingClientRect = () => ({ left: 250, right: 396, top: 220, bottom: 304, width: 146, height: 84 });
  const aero = mk(); aero.hidden = false;
  aero.getBoundingClientRect = () => ({ left: 403, right: 586, top: 315, bottom: 359, width: 183, height: 44 });
  const throttle = mk(); throttle.hidden = false;
  throttle.getBoundingClientRect = () => ({ left: 718, right: 785, top: 283, bottom: 350, width: 67, height: 67 });
  const els = { "hud-rel": root, "hud-gearbox": gear, "hud-aero": aero, "btn-throttle": throttle };
  const documentElement = { style: { getPropertyValue: () => "1" } };
  const doc = { documentElement, defaultView: { innerWidth: 844, innerHeight: 390 },
    body: { classList: { contains: () => false } }, getElementById: (id) => els[id] || null, createElement: mk };
  const R = load({ document: doc, HudElements: { isOn: () => true }, window: doc.defaultView });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const origLeft = root.style;
  Object.defineProperty(root, "style", { value: new Proxy(origLeft, {
    set(t, k, v) { t[k] = v; if (k === "left") relLeft = parseFloat(v) || relLeft; return true; },
    get(t, k) { return t[k]; }
  }) });
  R.tick({ cars: [p, car("A1", 1100, 3, { rank: 1 })], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } }, p);
  const left = parseFloat(root.style.left || "0") || relLeft;
  assert.ok(left < 250, "does not slide past gearbox into the centre cluster: left=" + left);
  assert.ok(left + 202 < 403, "REL right edge clears aero");
  assert.ok(left + 202 < 718, "REL right edge clears THROTTLE");
});

test("fitRows slides past OT when REL top already sits inside the control", () => {
  // phoneL broadcast @150%: REL top ≈357 inside OT (315..359). Height-cap needs
  // rr.top < box.top - 4, which never fires — must slide right instead.
  const mk = () => {
    const el = { hidden: true, attrs: {}, children: [], textContent: "", className: "",
      style: { setProperty(k, v) { el.style[k] = v; }, removeProperty(k) { delete el.style[k]; } },
      setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; },
      appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk();
  root.clientHeight = 40; root.scrollHeight = 80; root.currentCSSZoom = 1.5;
  root.getBoundingClientRect = () => ({ left: 194, right: 396, top: 350, bottom: 432, width: 202, height: 82 });
  const ot = mk();
  ot.hidden = false;
  ot.getBoundingClientRect = () => ({ left: 250, right: 396, top: 315, bottom: 359, width: 146, height: 44 });
  const els = { "hud-rel": root, "hud-ot": ot };
  const documentElement = { style: { getPropertyValue: (k) => (k === "--hud-scale" ? "1.5" : "") } };
  const doc = { documentElement, body: { classList: { contains: () => false } }, getElementById: (id) => els[id] || null, createElement: mk };
  const R = load({ document: doc, HudElements: { isOn: () => true } });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  R.tick({ cars: [p, car("A1", 1100, 3, { rank: 1 })], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } }, p);
  const left = parseFloat(root.style.left || "0");
  assert.ok(left > 0 && left < 600, "slides on-screen past OT, not off the right edge: left=" + root.style.left);
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

test("fitRows divides by --hud-scale when the fit removed --hud-z-top (HUD SIZE > 100 %, hunt3 1b-F2)", () => {
  // #hud-rel paints at zoom var(--hud-z-top, var(--hud-scale)); fitHud removes
  // --hud-z-top whenever the cap fits. Dividing by 1 then wrote a cap that
  // painted 1.3x too tall and the card stayed over BRAKE.
  const Z = 1.3;
  for (const where of ["inline", "stylesheet"]) {
    const mk = () => {
      const el = { hidden: true, attrs: {}, children: [], textContent: "",
        style: { setProperty(k, v) { el.style[k] = v; }, removeProperty(k) { delete el.style[k]; } },
        setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; },
        appendChild(c) { el.children.push(c); return c; } };
      return el;
    };
    const root = mk();
    root.clientHeight = 0;
    root.currentCSSZoom = Z;
    root.getBoundingClientRect = () => ({ left: 8, right: 8 + 150 * Z, top: 120, bottom: 120 + 130 * Z, width: 150 * Z, height: 130 * Z });
    const brake = mk();
    brake.hidden = false;
    brake.getBoundingClientRect = () => ({ left: 60, right: 190, top: 250, bottom: 330, width: 130, height: 80 });
    const els = { "hud-rel": root, "btn-brake": brake };
    const vars = where === "inline" ? { "--hud-scale": String(Z) } : {};
    const documentElement = { style: { getPropertyValue: (k) => vars[k] || "" } };
    const doc = { documentElement, body: { classList: { contains: () => false } }, getElementById: (id) => els[id] || null, createElement: mk };
    const getComputedStyle = () => ({ getPropertyValue: (k) => (k === "--hud-scale" ? " " + Z : "") });
    const R = load({ document: doc, HudElements: { isOn: () => true }, getComputedStyle });
    const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
    R.tick({ cars: [p, car("A1", 1100, 3, { rank: 1 })], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } }, p);
    const cap = parseFloat(root.style.maxHeight);
    assert.ok(cap > 0, where + ": a cap was written");
    assert.ok(cap * Z <= 250 - 120, where + ": the painted card (" + (cap * Z).toFixed(1) + " px) clears BRAKE (130 px)");
  }
});

test("fitRows resets left / max-height once the clash is gone (STEERING change, HUD SIZE, rotation)", () => {
  // A CSSStyleDeclaration maps max-height <-> maxHeight; the plain-object mock
  // above cannot tell a removed property from one it never cleared.
  const decl = () => {
    const d = {};
    const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    d.setProperty = (k, v) => { d[camel(k)] = v; };
    d.removeProperty = (k) => { d[camel(k)] = ""; };
    return d;
  };
  const mk = () => {
    const el = { hidden: true, attrs: {}, children: [], textContent: "", style: decl(),
      setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; },
      appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk();
  root.clientHeight = 40; root.scrollHeight = 160; root.currentCSSZoom = 1;
  root.getBoundingClientRect = () => ({ left: 50, right: 220, top: 100, bottom: 260, width: 170, height: 160 });
  const brake = mk();
  brake.hidden = false;
  let brakeLeft = 60;
  brake.getBoundingClientRect = () => ({ left: brakeLeft, right: brakeLeft + 80, top: 180, bottom: 260, width: 80, height: 80 });
  const els = { "hud-rel": root, "btn-brake": brake };
  const doc = { body: { classList: { contains: () => false } }, getElementById: (id) => els[id] || null, createElement: mk };
  const R = load({ document: doc, HudElements: { isOn: () => true } });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const G = { cars: [p, car("A1", 1100, 3, { rank: 1 }), car("A2", 1400, 3), car("B1", 900, 3, { rank: 3 }), car("B2", 600, 3, { rank: 4 })],
    track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } };
  R.tick(G, p);
  assert.ok(root.style.left && root.style.maxHeight, "the TILT clash slid and capped the card");
  brakeLeft = 900;        // STEERING -> BUTTONS: BRAKE leaves the REL box
  brake.className = "steer-btn"; // ...and the control's class says so (the fit's change key)
  root.scrollHeight = 40; // and the card fits again
  R.tick(G, p);
  assert.equal(root.style.left, "", "left is released");
  assert.equal(root.style.maxHeight, "", "max-height is released");
});

test("fitRows is stable across frozen rechecks and releases its fit when controls move", () => {
  const decl = () => {
    const d = {};
    const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    d.setProperty = (k, v) => { d[camel(k)] = v; };
    d.removeProperty = (k) => { d[camel(k)] = ""; };
    return d;
  };
  const mk = () => ({ hidden: true, attrs: {}, children: [], textContent: "", style: decl(),
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; } });
  const root = mk();
  root.currentCSSZoom = 1;
  // Geometry follows the actual style and visible rows, unlike a static rect:
  // hiding a row changes the card's natural height on the next forced fit.
  Object.defineProperty(root, "scrollHeight", { get: () => root.children.filter((r) => !r.hidden).length * 32 });
  Object.defineProperty(root, "clientHeight", { get: () => Math.min(root.scrollHeight, parseFloat(root.style.maxHeight) || 160) });
  root.getBoundingClientRect = () => {
    const left = parseFloat(root.style.left) || 50, top = 100;
    return { left, right: left + 170, top, bottom: top + root.clientHeight, width: 170, height: root.clientHeight };
  };
  const brake = mk(); brake.hidden = false;
  let brakeLeft = 60;
  brake.getBoundingClientRect = () => ({ left: brakeLeft, right: brakeLeft + 104.5,
    top: 180, bottom: 260, width: 104.5, height: 80 });
  const els = { "hud-rel": root, "btn-brake": brake };
  let desktop = false;
  const doc = { body: { get className() { return desktop ? "desktop" : ""; }, classList: { contains: (k) => k === "desktop" && desktop } }, getElementById: (id) => els[id] || null, createElement: mk };
  const R = load({ document: doc, HudElements: { isOn: () => true } });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const ahead = car("A1", 1100, 3, { rank: 1 });
  const G = { cars: [p, ahead, car("A2", 1400, 3), car("B1", 900, 3, { rank: 3 }), car("B2", 600, 3, { rank: 4 })],
    track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } };
  const fit = () => ({ left: root.style.left || "", maxHeight: root.style.maxHeight || "",
    rect: root.getBoundingClientRect(), hidden: root.children.map((r) => r.hidden) });
  R.tick(G, p);
  const solved = fit();
  assert.equal(solved.left, "172.5px");
  assert.equal(solved.maxHeight, "74.0px");
  assert.equal(solved.hidden.filter(Boolean).length, 3, "outer occupied rows were dropped to clear the pedal");
  // N1 (2026-10-14): the 10 Hz tick used to un-hide every occupied row while fitRows only ran on a key
  // change or every 10th tick, so the dropped rows came back 9 ticks in 10 — a half-row over BRAKE
  // flickering at 1 Hz. A tick between fits keeps the fit's drops.
  for (let i = 0; i < 12; i++) {
    R.tick(G, p);
    assert.deepEqual(fit(), solved, "tick " + i + ": the rows fitRows dropped stay dropped between fits");
  }
  for (let i = 0; i < 8; i++) {
    R.fitRows(); // syncPhoneFit's inner retries, with no intervening HUD tick
    assert.deepEqual(fit(), solved, "the same selected cars and controls produce the same solved fit");
  }
  desktop = true; brake.hidden = true;
  R.tick(G, p);
  assert.ok(root.children.every((r) => !r.hidden), "switching to fine pointer restores occupied rows immediately");
  assert.equal(root.style.left, "", "desktop releases the phone offset");
  assert.equal(root.style.maxHeight, "", "desktop releases the phone height cap");
  for (let i = 0; i < 25; i++) R.tick(G, p);
  R.refit(true);
  assert.ok(root.children.every((r) => !r.hidden), "desktop rechecks preserve restored rows");
  desktop = false; brake.hidden = false;
  R.tick(G, p);
  assert.deepEqual(fit(), solved, "switching back to coarse pointer reapplies phone clearance");
  brakeLeft = 900;
  R.fitRows();
  assert.equal(root.style.left, "", "a moved control releases the old horizontal offset");
  assert.equal(root.style.maxHeight, "", "a moved control releases the old height cap");
  assert.ok(root.children.every((r) => !r.hidden), "all occupied rows return when the card fits");
  G.cars = [p, ahead];
  R.tick(G, p);
  const short = fit();
  R.fitRows();
  assert.deepEqual(fit(), short, "rechecking a short field does not revive empty rows");
  assert.equal(short.hidden.filter(Boolean).length, 3);
});

test("never reads track curvature (the arc must not reach the driver)", () => {
  assert.doesNotMatch(SRC, /curvature|kCur|Tracks\./);
});

test("tick: a settled phone layout is fitted once, not forced to layout every 100 ms (bug-hunt 2 P9)", () => {
  const mk = () => {
    const el = { hidden: true, attrs: {}, children: [], textContent: "", style: { setProperty() {}, removeProperty() {} },
      setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute() {}, appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk();
  root.clientHeight = 160; root.scrollHeight = 160; root.currentCSSZoom = 1;
  let reads = 0;
  root.getBoundingClientRect = () => { reads++; return { left: 50, right: 220, top: 100, bottom: 260, width: 170, height: 160 }; };
  const els = { "hud-rel": root };
  const doc = { body: { className: "", classList: { contains: () => false } }, getElementById: (id) => els[id] || null, createElement: mk };
  const R = load({ document: doc, HudElements: { isOn: () => true } });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const G = { cars: [p, car("A1", 1100, 3, { rank: 1 }), car("A2", 1400, 3)], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } };
  for (let i = 0; i < 9; i++) R.tick(G, p);
  assert.ok(reads <= 2, "nine unchanged ticks forced " + reads + " layout reads");
  const before = reads;
  doc.body.className = "hud-touch"; R.tick(G, p);
  assert.ok(reads > before, "a changed layout input refits at once");
});

test("tick: the 1 Hz net is read-only — a settled card is never reset, a moved control still refits (audit4 UB6)", () => {
  let resets = 0, brakeLeft = 400;
  const mk = () => {
    const el = { hidden: true, attrs: {}, children: [], textContent: "", style: { setProperty() {}, removeProperty() { resets++; } },
      setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute() {}, appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk();
  root.clientHeight = 160; root.scrollHeight = 160; root.currentCSSZoom = 1;
  root.getBoundingClientRect = () => ({ left: 50, right: 220, top: 100, bottom: 260, width: 170, height: 160 });
  const brake = mk(); brake.hidden = false;
  brake.getBoundingClientRect = () => ({ left: brakeLeft, right: brakeLeft + 80, top: 180, bottom: 260, width: 80, height: 80 });
  const els = { "hud-rel": root, "btn-brake": brake };
  const doc = { body: { className: "", classList: { contains: () => false } }, getElementById: (id) => els[id] || null, createElement: mk };
  const R = load({ document: doc, HudElements: { isOn: () => true } });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const G = { cars: [p, car("A1", 1100, 3, { rank: 1 }), car("A2", 1400, 3)], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } };
  R.tick(G, p);
  const fitted = resets;
  assert.ok(fitted > 0, "precondition: the first tick fits (resets left / max-height)");
  for (let i = 0; i < 30; i++) R.tick(G, p);
  assert.equal(resets, fitted, "three 1 Hz nets over a settled layout reset the card's styles");
  brakeLeft = 60;   // BRAKE moved under the card: nothing fitKey sees changed
  for (let i = 0; i < 10; i++) R.tick(G, p);
  assert.ok(resets > fitted, "the net saw the moved box and refitted");
});

test("refit: the phone stamp sync's per-tick call skips a settled REL, refits when forced (#2151)", () => {
  const mk = () => {
    const el = { hidden: true, attrs: {}, children: [], textContent: "", style: { setProperty() {}, removeProperty() {} },
      setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute() {}, appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk();
  root.clientHeight = 160; root.scrollHeight = 160; root.currentCSSZoom = 1;
  let reads = 0;
  root.getBoundingClientRect = () => { reads++; return { left: 50, right: 220, top: 100, bottom: 260, width: 170, height: 160 }; };
  const doc = { body: { className: "", classList: { contains: () => false } }, getElementById: (id) => (id === "hud-rel" ? root : null), createElement: mk };
  const R = load({ document: doc, HudElements: { isOn: () => true } });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const G = { cars: [p, car("A1", 1100, 3, { rank: 1 })], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } };
  R.tick(G, p);
  const settled = reads;
  for (let i = 0; i < 9; i++) R.refit();
  assert.equal(reads, settled, "an unchanged key reads no layout");
  R.refit(true);
  assert.ok(reads > settled, "a forced recheck (syncPhoneFit) refits");
  const before = reads;
  doc.body.className = "hud-touch"; R.refit();
  assert.ok(reads > before, "a changed layout input refits");
});

test("fit key ignores ot-*/ax-* class churn on clearance controls (perf H7 row 11)", () => {
  const mk = () => ({ hidden: false, className: "", style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" }, children: [],
    setAttribute() {}, removeAttribute() {}, appendChild(c) { this.children.push(c); return c; }, textContent: "" });
  const ot = mk(); ot.className = "ot-off";
  const els = { "hud-ot": ot, "hud-rel": mk() };
  let fits = 0;
  els["hud-rel"].getBoundingClientRect = () => ({ left: 0, right: 1, top: 0, bottom: 1, width: 1, height: 1 });
  ot.getBoundingClientRect = () => { fits++; return { left: 500, right: 600, top: 0, bottom: 1, width: 100, height: 1 }; };
  const doc = { body: { className: "", classList: { contains: () => false } }, getElementById: (id) => els[id] || null, createElement: mk };
  const R = load({ document: doc, HudElements: { isOn: () => true } });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const G = { cars: [p, car("A1", 1100, 3, { rank: 1 })], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } };
  R.tick(G, p);
  const base = fits;
  ot.className = "ot-armed"; R.tick(G, p); ot.className = "ot-active ax-open"; R.tick(G, p);
  assert.equal(fits, base, "an overtake/aero class flip does not rerun the fit");
  ot.className = "hidden-by-layout"; R.tick(G, p);
  assert.ok(fits > base, "a class that can move the box still does");
});

test("fitRows never leaves the player's row alone: the card stands down instead (UI-HUNT-2-HUD)", () => {
  const mk = () => {
    const el = { hidden: true, attrs: {}, children: [], textContent: "",
      style: { setProperty(k, v) { el.style[k] = v; }, removeProperty(k) { delete el.style[k]; } },
      setAttribute(k, v) { el.attrs[k] = String(v); }, removeAttribute(k) { delete el.attrs[k]; },
      hasAttribute(k) { return k in el.attrs; }, appendChild(c) { el.children.push(c); return c; } };
    return el;
  };
  const root = mk();
  root.currentCSSZoom = 1;
  // HUD 150 %: two 32 px rows never fit under a 40 px cap.
  Object.defineProperty(root, "scrollHeight", { get: () => root.children.filter((r) => !r.hidden).length * 32 });
  root.clientHeight = 40;
  root.getBoundingClientRect = () => ({ left: 50, right: 220, top: 100, bottom: 140, width: 170, height: 40 });
  const els = { "hud-rel": root };
  const doc = { body: { className: "", classList: { contains: () => false } }, getElementById: (id) => els[id] || null, createElement: mk };
  const R = load({ document: doc, HudElements: { isOn: () => true } });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  R.tick({ cars: [p, car("A1", 1100, 3, { rank: 1 }), car("A2", 1400, 3, { rank: 0 }), car("B1", 900, 3, { rank: 3 }), car("B2", 600, 3, { rank: 4 })],
    track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } }, p);
  const shown = root.children.filter((r) => !r.hidden).length;
  assert.ok(shown >= 2, "a neighbour stays beside the player's row: " + shown);
  assert.ok("data-fit-drop" in root.attrs, "the clipped card stands down (data-fit-drop)");
  // With the allocator loaded the card is handed back whole: HudLayout.clearReadouts finds it a slot.
  let clears = 0;
  const R2 = load({ document: doc, HudElements: { isOn: () => true }, HudLayout: { clearReadouts() { clears++; } } });
  for (const c of root.children) c.hidden = true;
  root.children.length = 0; delete root.attrs["data-fit-drop"];
  R2.tick({ cars: [p, car("A1", 1100, 3, { rank: 1 }), car("A2", 1400, 3, { rank: 0 }), car("B1", 900, 3, { rank: 3 }), car("B2", 600, 3, { rank: 4 })],
    track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } }, p);
  assert.equal(root.children.filter((r) => !r.hidden).length, 5, "every occupied row is restored for the allocator");
  assert.ok(!("data-fit-drop" in root.attrs) && clears > 0, "no stand-down; HudLayout places it");
});

test("fit idempotence: HUD 100 → 150 → 100 solves the same slide as a fresh 100, through the allocator's stale translate (UI-HUNT-2-HUD)", () => {
  // The painted card = home + style.left × z + HudLayout's --hud-clear-x (css/hud.css translate).
  // Fresh boot at 844x390: REL slid right past BRAKE; after 150 → 100 it kept the 150 % pass's
  // translate, measured itself at x 57, and the allocator stacked STRATEGY where REL belonged.
  const decl = () => {
    const d = {};
    d.setProperty = (k, v) => { d[k] = v; };
    d.removeProperty = (k) => { delete d[k]; delete d[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]; };
    d.getPropertyValue = (k) => d[k] || "";
    return d;
  };
  const mk = () => ({ hidden: true, attrs: {}, children: [], textContent: "", style: decl(),
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
    hasAttribute(k) { return k in this.attrs; }, appendChild(c) { this.children.push(c); return c; } });
  const docEl = mk();
  const root = mk();
  const zNow = () => parseFloat(docEl.style.getPropertyValue("--hud-z-top")) || 1;
  Object.defineProperty(root, "currentCSSZoom", { get: zNow });
  Object.defineProperty(root, "scrollHeight", { get: () => root.children.filter((r) => !r.hidden).length * 20 * zNow() });
  Object.defineProperty(root, "clientHeight", { get: () => root.scrollHeight });
  root.getBoundingClientRect = () => {
    const z = zNow(), left = 57 + (parseFloat(root.style.left) || 0) * z + (parseFloat(root.style["--hud-clear-x"]) || 0);
    const top = 205 + (parseFloat(root.style["--hud-clear-y"]) || 0), h = root.clientHeight;
    return { left, right: left + 135 * z, top, bottom: top + h, width: 135 * z, height: h };
  };
  const brake = mk(); brake.hidden = false;
  brake.getBoundingClientRect = () => ({ left: 40, right: 140, top: 230, bottom: 330, width: 100, height: 100 });
  const els = { "hud-rel": root, "btn-brake": brake };
  const doc = { documentElement: docEl, body: { className: "", classList: { contains: () => false } }, getElementById: (id) => els[id] || null, createElement: mk };
  let clears = 0;
  const HudLayout = { clearReadouts() { clears++; } };
  const R = load({ document: doc, HudElements: { isOn: () => true }, HudLayout });
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const G = { cars: [p, car("A1", 1100, 3, { rank: 1 }), car("B1", 900, 3, { rank: 3 })], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } };
  const snap = () => ({ left: root.style.left || "", cx: root.style["--hud-clear-x"] || "", rect: root.getBoundingClientRect(), attrs: { ...root.attrs } });
  R.tick(G, p);
  const fresh = snap();
  assert.ok(parseFloat(fresh.left) > 0, "the fresh fit slides REL past BRAKE: " + fresh.left);
  assert.ok(clears > 0, "a measured fit hands the readouts back to HudLayout.clearReadouts");
  // HUD 150: the allocator then translates REL back over the left column and compacts it.
  docEl.style.setProperty("--hud-z-top", "1.5");
  R.tick(G, p);
  root.style.setProperty("--hud-clear-x", "-185px");
  root.setAttribute("data-col-compact", "");
  // …and back to 100.
  docEl.style.removeProperty("--hud-z-top");
  R.tick(G, p);
  assert.deepEqual(snap(), fresh, "the same knobs give the same REL box as a fresh boot");
  for (let i = 0; i < 12; i++) R.tick(G, p);
  assert.deepEqual(snap(), fresh, "and it stays there across the 1 Hz net");
});
