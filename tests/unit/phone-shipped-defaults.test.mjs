/* Phone defaults from the November 20 appearance export.
 * Run: node --test tests/unit/phone-shipped-defaults.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { OWNER_EXPORT } from "../../tools/lib/bryce-phone.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const plain = (o) => JSON.parse(JSON.stringify(o));
const EXPORT = JSON.parse(read("tests/data/phone-appearance-2026-11-20.json")).settings;
const OLD = JSON.parse(read(OWNER_EXPORT)).settings;

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

const LOOK_KEYS = { pause: "lookPause", select: "lookSelect", race: "lookRace", garage: "lookGarage", career: "lookCareer", datahub: "lookDatahub", designer: "lookDesigner" };

test("a phone with nothing stored reads the owner's per-screen looks, and stores nothing", () => {
  const { M, data, writes, html } = looks("phone");
  for (const [id, key] of Object.entries(LOOK_KEYS)) {
    const got = M.read(id);
    // A null setting follows each device's adaptive values.
    const adaptive = { select: { w: 125, tile: 95 }, race: { w: 120, btn: 90 }, designer: { size: 75 } };
    const expected = EXPORT.appearance[key] ?? adaptive[id];
    for (const [k, v] of Object.entries(expected)) {
      assert.equal(got[k], v, `${id}.${k}`);
    }
    assert.equal(M.isShipped(id), true, `${id} is SHIPPED, not CUSTOM`);
  }
  assert.deepEqual(writes, [], "no store write at boot");
  assert.deepEqual(data, {}, "the store is still empty");
  // …and they PAINT: off the CSS base, so the attribute and the token are stamped.
  assert.equal(html.dataset.lookPauseBtn, "125");
  assert.equal(html.style.getPropertyValue("--look-pause-btn"), "1.25");
  assert.equal(html.style.getPropertyValue("--look-race-w"), "1.2");
  assert.equal(html.style.getPropertyValue("--look-designer-size"), "0.75");
  assert.equal(html.dataset.lookGarageStats, "hide");
});

test("seeding the exported panel looks matches every fresh phone panel", () => {
  const stored = {};
  for (const key of Object.values(LOOK_KEYS)) stored[key] = EXPORT.appearance[key];
  const a = looks("phone"), b = looks("phone", stored);
  assert.equal(a.M.read("career").density, "roomy");
  assert.equal(b.M.read("career").density, "roomy");
  for (const id of Object.keys(LOOK_KEYS)) assert.deepEqual(plain(a.M.read(id)), plain(b.M.read(id)), id);
  assert.deepEqual(plain(a.html.dataset), plain(b.html.dataset));
  assert.deepEqual(plain(a.html.style._decls), plain(b.html.style._decls));
  assert.deepEqual(plain(a.data), {});
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
  assert.equal(M.read("pause").gap, 100, "a knob with no phone value reads the base");
  assert.equal(M.read("select").tile, 95, "an unset knob of another screen reads the phone default");
  assert.deepEqual(writes, []);
  assert.deepEqual(data, stored);
  assert.equal(html.dataset.lookPauseBtn, undefined, "100 is the CSS base: no stamp");
  // Moving a knob TO the phone default drops it from the store; moving it to the old base keeps it.
  M.set("pause", "w", 135);
  assert.deepEqual(plain(data.lookPause), { btn: 100 });
  M.set("pause", "btn", 125);
  assert.equal(data.lookPause, undefined, "all at the phone default stores null");
  M.set("pause", "btn", 100);
  assert.deepEqual(plain(data.lookPause), { btn: 100 });
  M.reset("pause");
  assert.equal(M.read("pause").btn, 125, "RESET returns to what the phone ships");
});

test("both phone shapes ship the November 20 layout and desktop and tablet retain the base", () => {
  for (const [device, shape] of [["phone", "wide"], ["phonePortrait", "tall"]]) {
    const p = title(device, {}, shape);
    const layout = EXPORT.appearance.titleLayout[shape];
    assert.deepEqual(plain(p.M.current()), layout);
    assert.deepEqual(plain(p.html.style._decls), plain(p.M.vars(layout)));
    assert.equal(p.html.dataset.titleLayout, "on");
    assert.deepEqual(p.writes, []);
  }
  for (const device of ["tablet", "desktop"]) {
    const d = title(device);
    assert.deepEqual(plain(d.M.current("wide")), plain(d.M.normalize(null)), device);
    assert.equal(d.html.dataset.titleLayout, undefined, device);
    assert.deepEqual(plain(d.html.style._decls), {}, device);
  }
});

test("existing explicit November 10 settings still win while missing shapes follow the current phone default", () => {
  const storedLooks = Object.fromEntries(Object.values(LOOK_KEYS).map(key => [key, OLD.appearance[key]]));
  const legacy = looks("phone", storedLooks);
  for (const [id, key] of Object.entries(LOOK_KEYS)) {
    for (const [knob, value] of Object.entries(storedLooks[key] || {})) assert.equal(legacy.M.read(id)[knob], value);
  }
  assert.deepEqual(legacy.data, storedLooks);
  assert.deepEqual(legacy.writes, []);
  const storedTitle = { titleLayout: OLD.appearance.titleLayout };
  const legacyTitle = title("phone", storedTitle);
  assert.deepEqual(plain(legacyTitle.M.current("wide")), storedTitle.titleLayout.wide);
  assert.deepEqual(plain(legacyTitle.M.current("tall")), EXPORT.appearance.titleLayout.tall);
  assert.deepEqual(legacyTitle.data, storedTitle);
  assert.deepEqual(legacyTitle.writes, []);
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
  assert.equal(a.M.current("wide").btns.size, 106);
  assert.equal(a.html.style.getPropertyValue("--tl-btns-size"), "1.06");
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
