/* phone-shipped-defaults — what an UNSET size reads on a phone (#5358).
 *
 * The owner's 2026-11-10 profile (tests/data/settings-live-export-2026-11-10.json) is what makes his iPhone
 * "playable and not way too big": UI SIZE 70, and per-screen looks on top of it. Those numbers are now what a phone
 * ships. Two things are held here, by running the real modules in node:vm:
 *   1. a phone with NOTHING stored reads his values, and a desktop / tablet reads what it always did;
 *   2. a stored value is never rewritten: it wins over the new default, and nothing is written at boot.
 * The painted rects are tests/specs/phone-shipped-defaults.spec.js (CI).
 *
 * Run: node --test tests/unit/phone-shipped-defaults.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const plain = (o) => JSON.parse(JSON.stringify(o));
const EXPORT = JSON.parse(read("tests/data/settings-live-export-2026-11-10.json")).settings;

const DEVICES = {
  phone: { coarse: true, innerWidth: 852, innerHeight: 393 },
  phonePortrait: { coarse: true, innerWidth: 393, innerHeight: 852 },
  tablet: { coarse: true, innerWidth: 1180, innerHeight: 820 },
  desktop: { coarse: false, innerWidth: 1280, innerHeight: 400 },
};

/** Run one module the way the page does, on `device`, over `stored`. */
function boot(file, global, device, stored = {}, shape = "wide") {
  const dom = makeDom();
  dom.body.setAttribute("data-shape", shape);
  const get = dom.document.getElementById;
  dom.document.getElementById = (id) => (dom.has(id) ? get(id) : null);
  const data = plain(stored), writes = [];
  const store = { get: (k, d) => (k in data ? data[k] : d), set: (k, v) => { writes.push(k); if (v === null) delete data[k]; else data[k] = v; } };
  const d = DEVICES[device];
  const sb = {
    document: dom.document, GameStore: { store }, Log: { info() {}, warn() {} },
    MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} },
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    addEventListener() {}, removeEventListener() {},
    innerWidth: d.innerWidth, innerHeight: d.innerHeight,
    matchMedia: (q) => ({ matches: q === "(pointer: coarse)" && d.coarse, addEventListener() {}, addListener() {} }),
  };
  sb.window = sb;
  vm.runInContext(read(file).replace(/^const\b/gm, "var"), vm.createContext(sb), { filename: absSrc(file) });
  return { M: sb[global], data, writes, html: dom.documentElement };
}
const looks = (device, stored) => boot("js/ui/screen-looks.js", "ScreenLooks", device, stored);
const title = (device, stored, shape) => boot("js/ui/title-layout.js", "TitleLayout", device, stored, shape);

const LOOK_KEYS = { pause: "lookPause", select: "lookSelect", race: "lookRace", garage: "lookGarage", designer: "lookDesigner" };

test("a phone with nothing stored reads the owner's per-screen looks, and stores nothing", () => {
  const { M, data, writes, html } = looks("phone");
  for (const [id, key] of Object.entries(LOOK_KEYS)) {
    const got = M.read(id);
    for (const [k, v] of Object.entries(EXPORT.appearance[key])) {
      // The one knob NOT taken: garage BUTTON HEIGHT 80 paints DONE 35 px tall, under the 44 px tap floor.
      if (id === "garage" && k === "btn") assert.equal(got[k], 100, "garage.btn stays at the base");
      else assert.equal(got[k], v, `${id}.${k}`);
    }
    assert.equal(M.isShipped(id), true, `${id} is SHIPPED, not CUSTOM`);
  }
  assert.deepEqual(writes, [], "no store write at boot");
  assert.deepEqual(data, {}, "the store is still empty");
  // …and they PAINT: off the CSS base, so the attribute and the token are stamped.
  assert.equal(html.dataset.lookPauseBtn, "115");
  assert.equal(html.style.getPropertyValue("--look-pause-btn"), "1.15");
  assert.equal(html.style.getPropertyValue("--look-race-w"), "1.2");
  assert.equal(html.style.getPropertyValue("--look-designer-size"), "0.75");
  assert.equal(html.dataset.lookGarageStats, "hide");
});

test("the same seeded looks read identically on a phone: his export and a clean profile are one picture", () => {
  const stored = {};
  for (const key of Object.values(LOOK_KEYS)) stored[key] = EXPORT.appearance[key];
  const a = looks("phone"), b = looks("phone", stored);
  // His picture is the clean one plus his garage BUTTON HEIGHT 80 (not shipped: the tap floor).
  a.M.set("garage", "btn", 80);
  for (const id of Object.keys(LOOK_KEYS)) assert.deepEqual(plain(a.M.read(id)), plain(b.M.read(id)), id);
  assert.deepEqual(plain(a.html.dataset), plain(b.html.dataset));
  assert.deepEqual(plain(a.html.style._decls), plain(b.html.style._decls));
  assert.deepEqual(plain(a.data), { lookGarage: { btn: 80 } }, "and that one knob is all the clean profile had to store");
  assert.deepEqual(b.data, stored, "his stored looks are left exactly as they were");
});

test("a desktop, a tablet and a wide touch window keep the old shipped looks: nothing stamped", () => {
  for (const device of ["desktop", "tablet"]) {
    const { M, html } = looks(device);
    for (const id of Object.keys(LOOK_KEYS)) {
      const got = M.read(id);
      for (const s of M.SCREENS) if (s.id === id) for (const n of s.knobs) assert.equal(got[n.k], n.def, `${device} ${id}.${n.k}`);
    }
    assert.deepEqual(plain(html.dataset), {}, device);
    assert.deepEqual(plain(html.style._decls), {}, device);
  }
});

test("a stored knob wins over the phone default and is not rewritten; the old base is still storable", () => {
  const stored = { lookPause: { btn: 100, w: 140 }, lookGarage: { stats: "show" } };
  const { M, data, writes, html } = looks("phone", stored);
  assert.equal(M.read("pause").btn, 100);
  assert.equal(M.read("pause").w, 140);
  assert.equal(M.read("garage").stats, "show");
  assert.equal(M.read("garage").pw, 110, "an unset knob beside a stored one reads the phone default");
  assert.deepEqual(writes, []);
  assert.deepEqual(data, stored);
  assert.equal(html.dataset.lookPauseBtn, undefined, "100 is the CSS base: no stamp");
  // Moving a knob TO the phone default drops it from the store; moving it to the old base keeps it.
  M.set("pause", "w", 115);
  assert.deepEqual(plain(data.lookPause), { btn: 100 });
  M.set("pause", "btn", 115);
  assert.equal(data.lookPause, undefined, "all at the phone default stores null");
  M.set("pause", "btn", 100);
  assert.deepEqual(plain(data.lookPause), { btn: 100 });
  M.reset("pause");
  assert.equal(M.read("pause").btn, 115, "RESET returns to what the phone ships");
});

test("TitleLayout: a landscape phone ships the owner's doors; portrait, tablet and desktop do not", () => {
  const want = EXPORT.appearance.titleLayout.wide;
  const p = title("phone");
  assert.deepEqual(plain(p.M.current("wide")), want);
  assert.deepEqual(plain(p.M.current("tall")), plain(p.M.normalize(null)), "portrait keeps the base");
  assert.deepEqual(p.writes, []);
  assert.equal(p.html.dataset.titleLayout, "on");
  assert.equal(p.html.style.getPropertyValue("--tl-btns-size"), "1.23");
  assert.equal(p.html.style.getPropertyValue("--tl-btns-x"), "2vw");
  assert.equal(p.html.style.getPropertyValue("--tl-btns-y"), "1vh");
  const tall = title("phonePortrait", {}, "tall");
  assert.equal(tall.html.dataset.titleLayout, undefined, "portrait paints the base");
  for (const device of ["tablet", "desktop"]) {
    const d = title(device);
    assert.deepEqual(plain(d.M.current("wide")), plain(d.M.normalize(null)), device);
    assert.equal(d.html.dataset.titleLayout, undefined, device);
    assert.deepEqual(plain(d.html.style._decls), {}, device);
  }
});

test("TitleLayout: his stored layout and a clean phone paint the same tokens; a stored layout is never rewritten", () => {
  const stored = { titleLayout: EXPORT.appearance.titleLayout };
  const a = title("phone"), b = title("phone", stored);
  assert.deepEqual(plain(a.html.style._decls), plain(b.html.style._decls));
  assert.deepEqual(plain(a.html.dataset), plain(b.html.dataset));
  assert.deepEqual(b.data, stored);
  assert.deepEqual(b.writes, []);
  // A player who stored the old base on a phone keeps it.
  const base = { titleLayout: { v: 2, wide: { btns: { x: 0, y: 0, size: 100, width: 0 }, title: { x: 0, y: 0, size: 100 }, art: { x: 0, y: 0, size: 100 }, layout: "grid", side: "auto" } } };
  const c = title("phone", base);
  assert.equal(c.M.current("wide").btns.size, 100);
  assert.equal(c.html.dataset.titleLayout, undefined);
  // Setting the base on a phone STORES it (it is off what the phone ships); RESET returns to the phone's doors.
  a.M.set(plain(a.M.normalize(null)), "wide");
  assert.equal(a.data.titleLayout.wide.btns.size, 100);
  assert.equal(a.html.dataset.titleLayout, undefined);
  a.M.reset();
  assert.equal(a.data.titleLayout, undefined);
  assert.equal(a.M.current("wide").btns.size, 123);
  assert.equal(a.html.style.getPropertyValue("--tl-btns-size"), "1.23");
});

test("index.html's first-paint copy gives a clean landscape phone the same tokens as the module", () => {
  const m = read("index.html").match(/\/\/ Title layout: apex26\.titleLayout[\s\S]*?\n    try \{\n([\s\S]*?)\n    \} catch \(e\) \{ \/\* TitleLayout answers at eval \*\/ \}/);
  assert.ok(m, "the inline boot carries the title layout block");
  for (const [device, shape] of [["phone", "wide"], ["phonePortrait", "tall"], ["tablet", "wide"], ["desktop", "wide"]]) {
    const { html } = title(device, {}, shape);
    const d = DEVICES[device];
    const de = { style: { _d: {}, setProperty(k, v) { this._d[k] = v; } }, dataset: {} };
    const sb = { localStorage: { getItem: () => null }, document: { documentElement: de }, JSON, Math,
      b: { getAttribute: (k) => (k === "data-shape" ? shape : null) }, innerWidth: d.innerWidth, innerHeight: d.innerHeight,
      matchMedia: (q) => ({ matches: q === "(pointer: coarse)" && d.coarse }) };
    sb.window = sb;
    vm.runInContext(m[1], vm.createContext(sb), { filename: absSrc("index.html") });
    assert.deepEqual(de.style._d, plain(html.style._decls), `same tokens on ${device}`);
    assert.deepEqual(de.dataset, plain(html.dataset), `same attributes on ${device}`);
  }
});
