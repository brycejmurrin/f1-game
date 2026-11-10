/* The circuit picker's hero still ships a 1600 px file beside the 800 px one, and the hero asks for it (#5223).
 * The 800x450 still alone sat in an ~804 CSS px box on a DPR-3 phone (2411 device px): 0.33 source px per
 * device px (emulation; the pixel-truth hunt note of PR #5232, F3). Pins, by behaviour: the generated sizes,
 * every circuit has an 800x450 still (never a 300x150 failed capture), the 2x file exists exactly where the
 * picker asks for it, the srcset and fallback the hero sets (showStill run in a VM), and the folder's weight.
 * Run: node --test tests/unit/hero-still-density.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import sharp from "sharp";
import { absSrc } from "../helpers/abs-src.mjs";

const gen = fs.readFileSync(absSrc("tools/gen/track-stills.mjs"), "utf8");
const src = fs.readFileSync(absSrc("js/ui/select-screen.js"), "utf8");
const DIR = absSrc("assets/stills");
const all = fs.readdirSync(absSrc("js/circuits")).filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, ""));
const BIG_TOTAL = 3.2 * 1024 * 1024, BIG_WORST = 96 * 1024;   // measured 2026-11-10: ~2.3 MB total, 64.0 KB worst

/** The generator's size constants and stillFiles(), evaluated (importing the script would start a capture batch). */
function genApi() {
  const consts = gen.slice(gen.indexOf("export const STILL_W"), gen.indexOf("function flag("));
  const body = consts.replace(/export /g, "") + "\n({ STILL_W, STILL_H, STILL_2X_W, STILL_2X_H, stillFiles })";
  return vm.runInNewContext(body, {}, { filename: absSrc("tools/gen/track-stills.mjs") });
}

/** The picker's still block (stillToken .. showStill) in a VM with a fake <img>. */
function picker(connection = null) {
  const block = src.slice(src.indexOf("let stillToken = 0;"), src.indexOf("let previewMapsTok"));
  const attrs = new Map();
  const img = {
    hidden: false, dataset: {}, onload: null, onerror: null, _src: "", requests: [],
    get src() { return this._src; }, set src(v) { this._src = v; this.requests.push(v); },
    set srcset(v) { attrs.set("srcset", v); }, set sizes(v) { attrs.set("sizes", v); },
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), removeAttribute: (k) => attrs.delete(k),
  };
  const ctx = { document: { getElementById: (id) => (id === "sel-still" ? img : null) }, navigator: { connection } };
  vm.runInNewContext(block + "\nthis.api = { showStill, stillSrcset, STILL_1X_ONLY };", ctx, { filename: absSrc("js/ui/select-screen.js") });
  return { ...ctx.api, img, attr: img.getAttribute };
}

const { STILL_W: W1, STILL_H: H1, STILL_2X_W: W2, STILL_2X_H: H2, stillFiles } = genApi();
const ONE_X = [...picker().STILL_1X_ONLY];
const ids = all.filter((id) => !ONE_X.includes(id));

test("the generator writes an 800x450 and a 1600x900 file from one capture", () => {
  assert.deepEqual([W1, H1, W2, H2], [800, 450, 1600, 900]);
  assert.deepEqual(JSON.parse(JSON.stringify(stillFiles("monza"))).map((f) => [f.file, f.w, f.h]),
    [["monza.webp", 800, 450], ["monza-1600.webp", 1600, 900]]);
});

test("every circuit has an 800x450 WebP still: none missing, none a 300x150 failed capture", async () => {
  assert.ok(all.length >= 52);
  const bad = [];
  for (const id of all) {
    const p = path.join(DIR, id + ".webp");
    if (!fs.existsSync(p)) { bad.push(id + ": missing"); continue; }
    const m = await sharp(p).metadata();
    if (m.format !== "webp" || m.width !== W1 || m.height !== H1) bad.push(`${id}: ${m.format} ${m.width}x${m.height}`);
  }
  assert.deepEqual(bad, []);
});

test("the 2x file exists exactly for the circuits the picker asks it for, at 1600x900", async () => {
  const no2x = all.filter((id) => !fs.existsSync(path.join(DIR, id + "-1600.webp")));
  assert.deepEqual(no2x, [...ONE_X].sort(), "STILL_1X_ONLY in select-screen.js must match the folder");
  for (const id of ids) {
    const m = await sharp(path.join(DIR, id + "-1600.webp")).metadata();
    assert.deepEqual([m.format, m.width, m.height], ["webp", W2, H2], id + "-1600.webp");
  }
});

test("the hero's srcset offers both files and a DPR-3 phone gets at least 0.6 source px per device px", () => {
  const p = picker({ effectiveType: "4g" });
  p.showStill({ id: "bahrain" });
  assert.equal(p.attr("srcset"), "assets/stills/bahrain.webp 800w, assets/stills/bahrain-1600.webp 1600w");
  assert.equal(p.attr("sizes"), "100vw");
  assert.equal(p.img.src, "assets/stills/bahrain.webp");
  // The browser picks the smallest candidate that covers sizes x DPR, else the largest.
  const pick = (cssVw, dpr) => (cssVw * dpr <= W1 ? W1 : W2);
  const heroCss = 803.7;   // measured hero box on 852x393 (emulation, the hunt note F3)
  assert.equal(pick(852, 3), 1600);
  assert.ok(pick(852, 3) / (heroCss * 3) >= 0.6, "the issue's done-when: >= 0.6 source px per device px");
  assert.equal(pick(800, 1), 800, "a DPR-1 window no wider than the small file keeps it");
});

test("Save-Data, 2G and the kept-still circuits load the 800 px file alone (one request)", () => {
  for (const [conn, id] of [[{ saveData: true }, "monza"], [{ effectiveType: "2g" }, "monza"],
    [{ effectiveType: "slow-2g" }, "monza"], [null, "zolder"], [{ effectiveType: "4g" }, "imola"]]) {
    const p = picker(conn);
    p.showStill({ id });
    assert.equal(p.attr("srcset"), null, id + " " + JSON.stringify(conn));
    assert.deepEqual(p.img.requests, ["assets/stills/" + id + ".webp"]);
  }
});

test("a failed 2x load falls back to the 800 px file once; only a second failure hides the still", () => {
  const p = picker(null);
  p.showStill({ id: "monza" });
  p.img.onerror();
  assert.equal(p.attr("srcset"), null);
  assert.equal(p.attr("sizes"), null);
  assert.deepEqual(p.img.requests, ["assets/stills/monza.webp", "assets/stills/monza.webp"]);
  assert.equal(p.img.hidden, true);
  p.img.onload();
  assert.equal(p.img.hidden, false);
  p.img.hidden = true; p.img.onerror();
  assert.equal(p.img.hidden, true);
  assert.equal(p.img.requests.length, 2, "no third request");
});

test("the stills folder stays inside its byte budget (lazy: one circuit's file per selection)", () => {
  let small = 0, big = 0, worst = 0;
  for (const id of all) small += fs.statSync(path.join(DIR, id + ".webp")).size;
  for (const id of ids) {
    const b = fs.statSync(path.join(DIR, id + "-1600.webp")).size;
    big += b; worst = Math.max(worst, b);
  }
  assert.ok(small <= 2.2 * 1024 * 1024, `800 px stills total ${small} B`);
  assert.ok(big <= BIG_TOTAL, `1600 px stills total ${big} B`);
  assert.ok(worst <= BIG_WORST, `largest 1600 px still ${worst} B`);
});
